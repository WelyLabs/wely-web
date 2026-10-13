import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, linkedSignal, output, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { EventCreateRequest, Visibility } from '../../services/event.service';
import { FindSlotComponent, TimeWindow } from '../find-slot/find-slot';
import { LocationPickerComponent } from '../location-picker/location-picker';
import { Place } from '../../models/place.model';

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
    imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, FindSlotComponent, LocationPickerComponent],
    templateUrl: './quick-event-popover.html',
    styleUrl: './quick-event-popover.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuickEventPopoverComponent {
    readonly data = input.required<EventCreateRequest>();
    /** Why the last save failed, shown above the buttons. */
    readonly error = input<string | null>(null);
    /** While the event is being created: the button waits instead of sending it twice. */
    readonly saving = input(false);

    readonly save = output<EventCreateRequest>();
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
    readonly draft = linkedSignal(() => ({ ...this.data() }));

    readonly visibilityOptions = VISIBILITY_OPTIONS;
    readonly visibility = computed<Visibility>(() => this.draft().visibility ?? 'FRIENDS');
    readonly visibilityHint = computed(() =>
        VISIBILITY_OPTIONS.find(option => option.value === this.visibility())?.hint ?? '');

    /** The values the date and time fields show. */
    readonly startDay = computed(() => toDateValue(this.draft().startDate));
    readonly startTime = computed(() => toTimeValue(this.draft().startDate));
    readonly endDay = computed(() => toDateValue(this.endOf(this.draft())));
    readonly endTime = computed(() => toTimeValue(this.endOf(this.draft())));
    /** An end at or before the start cannot be saved. */
    readonly invalidRange = computed(() => this.endOf(this.draft()) <= this.draft().startDate);

    /** Two columns: wide enough to show every option without folding any away. */
    readonly wide = toSignal(inject(BreakpointObserver).observe(WIDE_LAYOUT).pipe(map(state => state.matches)),
        { initialValue: window.matchMedia?.(WIDE_LAYOUT).matches ?? false });

    /** Notes and « S'inscrire par défaut », folded away on a phone; closed again on each new slot. */
    readonly showMoreOptions = linkedSignal({ source: this.data, computation: () => false });
    readonly optionsShown = computed(() => this.wide() || this.showMoreOptions());

    private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

    constructor() {
        afterNextRender(() => {
            // Straight to the title with a mouse; on a touch screen that would throw the keyboard
            // over a form the user has not looked at yet.
            if (window.matchMedia?.('(pointer: fine)').matches) {
                this.titleInput()?.nativeElement.focus();
            }
        });
    }

    /** Whether the "find a slot with friends" panel is open; closed again on each new slot. */
    readonly findingSlot = linkedSignal({ source: this.data, computation: () => false });

    /** The slot the popover was opened on: the window searched for a common free slot. */
    readonly searchWindow = computed<TimeWindow | null>(() => {
        const { startDate, endDate } = this.data();
        return endDate ? { start: startDate, end: endDate } : null;
    });

    readonly spansSeveralDays = computed(() => {
        const { startDate, endDate } = this.draft();
        return !!endDate && startDate.toDateString() !== endDate.toDateString();
    });

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

    toggleFindSlot(): void {
        this.findingSlot.update(open => !open);
    }

    /** Moves the draft onto the slot picked among the common free ones. */
    onSlotPicked(slot: TimeWindow): void {
        this.draft.update(draft => ({ ...draft, startDate: slot.start, endDate: slot.end }));
        this.findingSlot.set(false);
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
        this.draft.set({ ...draft, startDate: start, endDate: new Date(start.getTime() + duration) });
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
        if (part === 'time' && end <= draft.startDate) {
            const sameDay = withTime(draft.startDate, value) ?? end;
            end = sameDay > draft.startDate ? sameDay : new Date(sameDay.getTime() + DAY_MS);
        }
        this.draft.set({ ...draft, endDate: end });
    }

    toggleMoreOptions(): void {
        this.showMoreOptions.update(open => !open);
    }

    /** Written by each field's `ngModelChange`, which is how a signal replaces two-way binding. */
    update<K extends keyof EventCreateRequest>(field: K, value: EventCreateRequest[K]): void {
        this.draft.update(draft => ({ ...draft, [field]: value }));
    }

    onSave(): void {
        const draft = this.draft();
        if (draft.title.trim() && !this.invalidRange() && !this.saving()) {
            this.save.emit(draft);
        }
    }

    onCancel(): void {
        this.dismissed.emit();
    }
}
