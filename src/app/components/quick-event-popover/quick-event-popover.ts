import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatDialog } from '@angular/material/dialog';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { EventCreateRequest, FeedEvent, Visibility } from '../../services/event.service';
import { ScheduleService } from '../../services/schedule.service';
import { rangeLabel } from '../../core/ui/schedule-labels';
import { LocationPickerComponent } from '../location-picker/location-picker';
import { EventCoverDialogComponent, EventCoverDialogData, EventCoverDialogResult } from '../event-cover-dialog/event-cover-dialog';
import { Place } from '../../models/place.model';
import { allDayWireRange } from '../../core/ui/all-day';
import { EVENT_IN_PAST_MESSAGE, startsInPast } from '../../core/ui/past-date';

/** A proposed date of a poll. */
export interface ProposedSlot {
    start: Date;
    end: Date;
}

/** What the form hands to the parent on save: the event to create, and its cover if one was added. */
export interface EventSubmission {
    request: EventCreateRequest;
    /** The cover, cropped to 16:9, to attach once the event exists; null when none was added. */
    cover: Blob | null;
}

/** The chosen cover: the cropped Blob to upload, and a local URL to preview it before it is. */
interface PickedCover {
    blob: Blob;
    url: string;
}

/** The visibility choices, in the order shown. */
export const VISIBILITY_OPTIONS: readonly { value: Visibility; label: string; icon: string; hint: string }[] = [
    { value: 'FRIENDS', label: 'Amis', icon: 'group', hint: 'Vos amis le voient dans leur fil' },
    { value: 'PUBLIC', label: 'Public', icon: 'public', hint: 'Tout le monde le voit' },
    { value: 'PRIVATE', label: 'Privé', icon: 'lock', hint: 'Vos amis ne voient que « occupé »' }
];

const pad = (value: number) => value.toString().padStart(2, '0');

/** A date as an `<input type="date">` value, in local time: `yyyy-MM-dd`. */
export function toDateValue(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A time as an `<input type="time">` value: `HH:mm`. */
export function toTimeValue(date: Date): string {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The same time of day on another date, or null when the input was cleared. */
export function withDate(date: Date, value: string): Date | null {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) {
        return null;
    }
    const result = new Date(date);
    result.setFullYear(year, month - 1, day);
    return result;
}

/** The same date at another time of day, or null when the input was cleared. */
export function withTime(date: Date, value: string): Date | null {
    const [hours, minutes] = value.split(':').map(Number);
    if (value === '' || Number.isNaN(hours) || Number.isNaN(minutes)) {
        return null;
    }
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
}

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

/** The request the form sends: an all-day draft becomes UTC midnights, its last day included. */
export function toSubmittedRequest(draft: EventCreateRequest): EventCreateRequest {
    if (!draft.allDay) {
        return { ...draft, allDay: false };
    }
    return { ...draft, ...allDayWireRange(draft.startDate, draft.endDate ?? draft.startDate), allDay: true };
}

/** How many slots a date poll may propose. */
export const MIN_POLL_SLOTS = 2;
export const MAX_POLL_SLOTS = 5;

/** How long the dates must stay still before they are checked against the agenda. */
export const CONFLICT_CHECK_DELAY_MS = 400;

/** The same range, or both absent. */
function sameRange(a: ProposedSlot | null, b: ProposedSlot | null): boolean {
    return a === b || (!!a && !!b && a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime());
}

/** From this width the form is laid out in two columns. */
const WIDE_LAYOUT = '(min-width: 1024px)';

/**
 * The form that creates an event: a dialog centred on screen, in one column on a phone and two
 * on a wide screen. It used to open next to its slot and could be dragged around: fixed and
 * centred, it has the room for both columns, over a dimmed calendar.
 */
@Component({
    selector: 'app-quick-event-popover',
    standalone: true,
    imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, LocationPickerComponent],
    templateUrl: './quick-event-popover.html',
    styleUrls: ['./quick-event-popover.scss', './quick-event-poll.scss', './quick-event-conflicts.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuickEventPopoverComponent {
    readonly data = input.required<EventCreateRequest>();
    /** Why the last save failed, shown above the buttons. */
    readonly error = input<string | null>(null);
    readonly pastDateMessage = EVENT_IN_PAST_MESSAGE;
    /** While the event is being created: the button waits instead of sending it twice. */
    readonly saving = input(false);

    readonly save = output<EventSubmission>();
    // Named dismissed rather than cancel: cancel is a native DOM event, and an output
    // shadowing one is ambiguous at the call site.
    readonly dismissed = output<void>();

    /**
     * The draft being edited, local to this component and reset whenever a new slot is opened.
     *
     * <p>`linkedSignal` rather than writing through the input: `[(ngModel)]="data.title"` used to
     * mutate the parent's own object in place, so the parent's `popoverData` changed under it as
     * the user typed — and a dismissed popover left those edits behind. Now the parent's object
     * is only ever read, and `save` carries the draft out explicitly.
     */
    // The proposed slots live in `candidates`: kept on the draft, they would survive turning the poll off.
    readonly draft = linkedSignal<EventCreateRequest>(() => ({ ...this.data(), candidateSlots: undefined }));

    readonly visibilityOptions = VISIBILITY_OPTIONS;
    readonly visibility = computed<Visibility>(() => this.draft().visibility ?? 'FRIENDS');
    readonly visibilityHint = computed(() =>
        VISIBILITY_OPTIONS.find(option => option.value === this.visibility())?.hint ?? '');

    /** The values the date and time fields show. */
    readonly startDay = computed(() => toDateValue(this.draft().startDate));
    readonly startTime = computed(() => toTimeValue(this.draft().startDate));
    readonly endDay = computed(() => toDateValue(this.endOf(this.draft())));
    readonly endTime = computed(() => toTimeValue(this.endOf(this.draft())));
    /** Whole days, without hours. */
    readonly allDay = computed(() => !!this.draft().allDay);
    /** A surprise party: its honoree never sees it, and the place may be chosen later. */
    readonly surprise = computed(() => this.draft().kind === 'SURPRISE');
    /** An end at or before the start cannot be saved; all day, the last day may be the first. */
    readonly invalidRange = computed(() => this.allDay()
        ? this.endDay() < this.startDay()
        : this.endOf(this.draft()) <= this.draft().startDate);

    /** Two columns: wide enough to show every option without folding any away. */
    readonly wide = toSignal(inject(BreakpointObserver).observe(WIDE_LAYOUT).pipe(map(state => state.matches)),
        { initialValue: window.matchMedia?.(WIDE_LAYOUT).matches ?? false });

    /** Notes, folded away on a phone; closed again on each new slot. */
    readonly showMoreOptions = linkedSignal({ source: this.data, computation: () => false });
    readonly optionsShown = computed(() => this.wide() || this.showMoreOptions());

    private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

    private readonly dialog = inject(MatDialog);
    private readonly destroyRef = inject(DestroyRef);

    /** The cover chosen for the event, with a local URL to preview it; null until one is picked. */
    readonly cover = signal<PickedCover | null>(null);

    constructor() {
        afterNextRender(() => {
            // Straight to the title with a mouse; on a touch screen that would throw the keyboard
            // over a form the user has not looked at yet.
            if (window.matchMedia?.('(pointer: fine)').matches) {
                this.titleInput()?.nativeElement.focus();
            }
        });
        // The preview URL is held by the browser until revoked: let it go when the form closes.
        this.destroyRef.onDestroy(() => this.revokeCover());
    }

    /** The organizer picked a picture: crop it to 16:9 in the shared dialog, then keep it to preview. */
    pickCover(event: Event): void {
        const input = event.target as HTMLInputElement | null;
        const file = input?.files?.[0];
        if (input) {
            input.value = '';
        }
        if (!file) {
            return;
        }
        this.dialog.open<EventCoverDialogComponent, EventCoverDialogData, EventCoverDialogResult>(EventCoverDialogComponent, {
            // No eventId: the event is not created yet, so the dialog hands the cropped Blob back.
            data: { file },
            width: '640px',
            maxWidth: '95vw'
        }).afterClosed()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(result => {
                if (result instanceof Blob) {
                    this.setCover(result);
                }
            });
    }

    removeCover(): void {
        this.revokeCover();
        this.cover.set(null);
    }

    private setCover(blob: Blob): void {
        this.revokeCover();
        this.cover.set({ blob, url: URL.createObjectURL(blob) });
    }

    private revokeCover(): void {
        const current = this.cover();
        if (current) {
            URL.revokeObjectURL(current.url);
        }
    }

    readonly spansSeveralDays = computed(() => {
        const { startDate, endDate } = this.draft();
        return !!endDate && startDate.toDateString() !== endDate.toDateString();
    });

    /** « Proposer plusieurs dates »: on when the form opens with proposed slots, off otherwise. */
    readonly pollMode = linkedSignal({ source: this.data, computation: data => (data.candidateSlots?.length ?? 0) > 0 });
    /** The proposed slots, those the form opened with first; the date fields edit the selected one. */
    readonly candidates = linkedSignal<EventCreateRequest, ProposedSlot[]>({
        source: this.data,
        computation: data => (data.candidateSlots ?? []).slice(0, MAX_POLL_SLOTS).map(slot => ({ start: slot.start, end: slot.end }))
    });
    readonly selectedSlot = linkedSignal({ source: this.data, computation: () => 0 });
    readonly canAddSlot = computed(() => this.candidates().length < MAX_POLL_SLOTS);
    readonly tooFewSlots = computed(() => this.pollMode() && this.candidates().length < MIN_POLL_SLOTS);
    /** A proposed slot ending before it starts, or proposed twice. */
    readonly invalidSlots = computed(() => {
        const slots = this.candidates();
        const keys = slots.map(slot => `${slot.start.getTime()}-${slot.end.getTime()}`);
        return slots.some(slot => slot.end <= slot.start) || new Set(keys).size !== keys.length;
    });
    /** A fixed date already behind: all day, once the last day is over; otherwise once it started. */
    readonly pastDate = computed(() => !this.pollMode() && (this.allDay()
        ? this.endDay() < toDateValue(new Date())
        : startsInPast(this.draft().startDate)));
    /** A proposed slot already started: a poll is on dates to come. */
    readonly pastSlots = computed(() => this.pollMode() && this.candidates().some(slot => slot.start.getTime() < Date.now()));
    readonly canSave = computed(() => !!this.draft().title.trim() && !this.invalidRange() && !this.pastDate() && !this.saving()
        && (!this.pollMode() || (!this.tooFewSlots() && !this.invalidSlots() && !this.pastSlots())));

    private readonly schedule = inject(ScheduleService);

    /** The time the event would take; none in a poll, which keeps nobody busy until its date is fixed. */
    private readonly checkedRange = computed<ProposedSlot | null>(() => {
        if (this.pollMode() || this.invalidRange()) {
            return null;
        }
        const draft = toSubmittedRequest(this.draft());
        return { start: draft.startDate, end: this.endOf(draft) };
    }, { equal: sameRange });

    /** The user's events this time would overlap, checked once the dates stop moving; none if the check fails. */
    readonly conflicts = toSignal(toObservable(this.checkedRange).pipe(
        debounceTime(CONFLICT_CHECK_DELAY_MS),
        distinctUntilChanged(sameRange),
        switchMap(range => range
            ? this.schedule.checkConflicts(range.start, range.end).pipe(catchError(() => of<FeedEvent[]>([])))
            : of<FeedEvent[]>([]))
    ), { initialValue: [] as FeedEvent[] });
    readonly shownConflicts = computed(() => this.checkedRange() ? this.conflicts() : []);

    /** The same duration, right after the last conflicting event ends. */
    readonly afterConflicts = computed<ProposedSlot | null>(() => {
        const conflicts = this.shownConflicts();
        const range = this.checkedRange();
        if (conflicts.length === 0 || !range) {
            return null;
        }
        const start = new Date(Math.max(...conflicts.map(event => event.endDate.getTime())));
        return { start, end: new Date(start.getTime() + range.end.getTime() - range.start.getTime()) };
    });

    /** When a conflicting event takes place, beside the new event's day. */
    conflictWhen(event: FeedEvent): string {
        return rangeLabel(event.startDate, event.endDate, this.draft().startDate);
    }

    slotLabel(slot: ProposedSlot): string {
        return rangeLabel(slot.start, slot.end, this.draft().startDate);
    }

    /** « Décaler après » : the event moves past what it overlapped, and is checked again. */
    shiftAfterConflicts(): void {
        const next = this.afterConflicts();
        if (next) {
            this.setDates(next.start, next.end);
        }
    }

    /** Whether the map is open under the location field; closed again on each new slot. */
    readonly pickingLocation = linkedSignal({ source: this.data, computation: () => false });

    /** The place picked on the map, if any, for the map to show when it opens again. */
    readonly pickedPlace = computed<Place | null>(() => {
        const { location, coordinates } = this.draft();
        return coordinates ? { label: location, coordinates } : null;
    });

    toggleLocationPicker(): void {
        this.pickingLocation.update(open => !open);
    }

    onPlacePicked(place: Place): void {
        this.draft.update(draft => ({ ...draft, location: place.label, coordinates: place.coordinates }));
    }

    /**
     * « Toute la journée »: the hours go, the days stay. A one-day event keeps one day; turned off,
     * an end left at the start moves an hour later.
     */
    toggleAllDay(): void {
        const draft = this.draft();
        if (draft.allDay) {
            const end = this.endOf(draft) > draft.startDate ? this.endOf(draft) : new Date(draft.startDate.getTime() + HOUR_MS);
            this.draft.set({ ...draft, allDay: false, endDate: end });
            return;
        }
        // A poll proposes hours; whole days are not offered there.
        this.pollMode.set(false);
        this.candidates.set([]);
        this.draft.set({ ...draft, allDay: true, endDate: this.spansSeveralDays() ? draft.endDate : draft.startDate });
    }

    /** Turns the date poll on, the slot being edited becoming its first proposal, or off. */
    togglePollMode(): void {
        if (this.pollMode()) {
            this.pollMode.set(false);
            this.candidates.set([]);
            return;
        }
        const draft = this.draft();
        this.candidates.set([{ start: draft.startDate, end: this.endOf(draft) }]);
        this.selectedSlot.set(0);
        this.pollMode.set(true);
    }

    /** « + Ajouter un créneau »: the last slot, a day later. */
    addSlot(): void {
        const last = this.candidates().at(-1);
        if (last) {
            this.appendSlot({ start: new Date(last.start.getTime() + DAY_MS), end: new Date(last.end.getTime() + DAY_MS) });
        }
    }

    /** The date fields now edit this slot. */
    selectSlot(index: number): void {
        const slot = this.candidates()[index];
        if (slot) {
            this.selectedSlot.set(index);
            this.draft.update(draft => ({ ...draft, startDate: slot.start, endDate: slot.end }));
        }
    }

    removeSlot(index: number): void {
        const slots = this.candidates();
        if (slots.length <= 1 || !slots[index]) {
            return;
        }
        this.candidates.set(slots.filter((_, i) => i !== index));
        const selected = this.selectedSlot();
        if (index < selected) {
            this.selectedSlot.set(selected - 1);
        } else if (index === selected) {
            this.selectSlot(Math.min(selected, slots.length - 2));
        }
    }

    private appendSlot(slot: ProposedSlot): void {
        if (!this.canAddSlot()) {
            return;
        }
        this.candidates.update(slots => [...slots, slot]);
        this.selectSlot(this.candidates().length - 1);
    }

    /** Sets the draft's dates and, in a poll, the selected slot's with them. */
    private setDates(startDate: Date, endDate: Date): void {
        this.draft.update(draft => ({ ...draft, startDate, endDate }));
        if (this.pollMode()) {
            const index = this.selectedSlot();
            this.candidates.update(slots => slots.map((slot, i) => i === index ? { start: startDate, end: endDate } : slot));
        }
    }

    private endOf(draft: EventCreateRequest): Date {
        return draft.endDate ?? draft.startDate;
    }

    /** A new start date or time moves the whole event: the duration is kept. */
    onStartChange(part: 'date' | 'time', value: string): void {
        const draft = this.draft();
        const start = part === 'date' ? withDate(draft.startDate, value) : withTime(draft.startDate, value);
        if (!start) {
            return;
        }
        const duration = this.endOf(draft).getTime() - draft.startDate.getTime();
        this.setDates(start, new Date(start.getTime() + duration));
    }

    /**
     * A new end. An end time before the start means the next morning (22:00 → 02:00): the end
     * moves to the day after rather than being refused.
     */
    onEndChange(part: 'date' | 'time', value: string): void {
        const draft = this.draft();
        const current = this.endOf(draft);
        let end = part === 'date' ? withDate(current, value) : withTime(current, value);
        if (!end) {
            return;
        }
        // An event shorter than a day ends within the day after its start, read from the start's
        // day each time: a time typed digit by digit passes through earlier values (10:00 AM on
        // the way to 10:00 PM), and anchoring on the end's day kept the one-day jump they caused.
        const shortEvent = current.getTime() - draft.startDate.getTime() < DAY_MS;
        if (part === 'time' && (shortEvent || end <= draft.startDate)) {
            const sameDay = withTime(draft.startDate, value) ?? end;
            end = sameDay > draft.startDate ? sameDay : new Date(sameDay.getTime() + DAY_MS);
        }
        this.setDates(draft.startDate, end);
    }

    toggleMoreOptions(): void {
        this.showMoreOptions.update(open => !open);
    }

    /** Written by each field's `ngModelChange`, which is how a signal replaces two-way binding. */
    update<K extends keyof EventCreateRequest>(field: K, value: EventCreateRequest[K]): void {
        this.draft.update(draft => ({ ...draft, [field]: value }));
    }

    onSave(): void {
        if (!this.canSave()) {
            return;
        }
        const draft = toSubmittedRequest(this.draft());
        const cover = this.cover()?.blob ?? null;
        if (!this.pollMode()) {
            this.save.emit({ request: draft, cover });
            return;
        }
        // The event stands on its earliest slot until the date is fixed, as the server does.
        const candidateSlots = [...this.candidates()].sort((a, b) => a.start.getTime() - b.start.getTime());
        this.save.emit({
            request: { ...draft, startDate: candidateSlots[0].start, endDate: candidateSlots[0].end, candidateSlots },
            cover
        });
    }

    onCancel(): void {
        this.dismissed.emit();
    }
}
