import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { EventCreateRequest, Visibility } from '../../services/event.service';
import { FindSlotComponent, TimeWindow } from '../find-slot/find-slot';
import { LocationPickerComponent } from '../location-picker/location-picker';
import { Place } from '../../models/place.model';

/** Where the popover sits relative to the slot that opened it. */
export interface PopoverPosition {
    x: number;
    y: number;
    arrowSide: 'top' | 'left' | 'right';
}

/** How far the user dragged the popover from where it opened, in pixels. */
export interface DragOffset {
    x: number;
    y: number;
}

/** The visibility choices, in the order shown. */
export const VISIBILITY_OPTIONS: readonly { value: Visibility; label: string; icon: string; hint: string }[] = [
    { value: 'FRIENDS', label: 'Amis', icon: 'group', hint: 'Vos amis le voient dans leur fil' },
    { value: 'PUBLIC', label: 'Public', icon: 'public', hint: 'Tout le monde le voit' },
    { value: 'PRIVATE', label: 'Privé', icon: 'lock', hint: 'Vos amis ne voient que « occupé »' }
];

/** Elements that keep their own pointer behaviour instead of starting a drag. */
const INTERACTIVE = 'input, textarea, button, select, label, a, [role="option"], .location-map';

/**
 * Bounds a drag delta so the popover stays on screen: `before` and `after` are the room left
 * on each side. A popover already overflowing is pulled back in; one larger than the screen
 * keeps its start edge visible.
 */
export function clampDelta(delta: number, before: number, after: number): number {
    return Math.max(-before, Math.min(delta, after));
}

/** Space kept between the popover and the edge of the screen. */
const SCREEN_MARGIN_PX = 8;

/**
 * How far up a box must move to end above the bottom of the screen, without its top going past
 * the top margin: 0 when it already fits.
 */
export function upwardShift(top: number, bottom: number, viewportHeight: number, margin = SCREEN_MARGIN_PX): number {
    const overflow = bottom - (viewportHeight - margin);
    return overflow > 0 ? Math.min(overflow, Math.max(top - margin, 0)) : 0;
}

interface DragState {
    pointerId: number;
    startX: number;
    startY: number;
    origin: DragOffset;
    rect: DOMRect;
}

/**
 * The small form that opens on a calendar slot to create an event in place.
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
    readonly position = input<PopoverPosition>({ x: 0, y: 0, arrowSide: 'top' });
    /** Percentage from the top of the popover at which the arrow points. */
    readonly arrowOffset = input(50);
    readonly isMobile = input(false);

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

    /** Back to where the popover opened, next to its slot, whenever a new slot is opened. */
    private readonly card = viewChild<ElementRef<HTMLElement>>('card');

    readonly offset = linkedSignal<EventCreateRequest, DragOffset>({ source: this.data, computation: () => ({ x: 0, y: 0 }) });
    readonly moved = computed(() => this.offset().x !== 0 || this.offset().y !== 0);
    readonly dragging = signal(false);

    constructor() {
        // The card grows when « Avec des amis… » opens and when results come in: anchored next to a
        // slot low on the screen, its buttons then ended below the bottom edge. Each growth moves
        // it back up, through the same offset a drag uses.
        const destroyRef = inject(DestroyRef);
        afterNextRender(() => {
            const card = this.card()?.nativeElement;
            if (!card || typeof ResizeObserver === 'undefined') {
                return;
            }
            const observer = new ResizeObserver(() => this.keepOnScreen());
            observer.observe(card);
            destroyRef.onDestroy(() => observer.disconnect());
        });
    }

    /** Moves the card up as far as needed for its bottom to be on screen. Not when centred on a phone. */
    keepOnScreen(): void {
        const card = this.card()?.nativeElement;
        if (!card || this.isMobile() || this.dragging()) {
            return;
        }
        const rect = card.getBoundingClientRect();
        const shift = upwardShift(rect.top, rect.bottom, window.innerHeight);
        if (shift > 0) {
            this.offset.update(offset => ({ x: offset.x, y: offset.y - shift }));
        }
    }
    private drag: DragState | null = null;

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

    /** Written by each field's `ngModelChange`, which is how a signal replaces two-way binding. */
    update<K extends keyof EventCreateRequest>(field: K, value: EventCreateRequest[K]): void {
        this.draft.update(draft => ({ ...draft, [field]: value }));
    }

    /** Starts moving the popover, unless the press lands on a field or a button. */
    onPointerDown(event: PointerEvent): void {
        if (event.button !== 0 || (event.target instanceof Element && event.target.closest(INTERACTIVE))) {
            return;
        }
        const card = event.currentTarget as HTMLElement;
        this.drag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            origin: this.offset(),
            rect: card.getBoundingClientRect()
        };
        card.setPointerCapture?.(event.pointerId);
        this.dragging.set(true);
        event.preventDefault();
    }

    onPointerMove(event: PointerEvent): void {
        const drag = this.drag;
        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }
        const { rect } = drag;
        const dx = clampDelta(event.clientX - drag.startX, rect.left, window.innerWidth - rect.right);
        const dy = clampDelta(event.clientY - drag.startY, rect.top, window.innerHeight - rect.bottom);
        this.offset.set({ x: drag.origin.x + dx, y: drag.origin.y + dy });
    }

    /** Also bound to pointercancel: a touch the browser turns into a scroll ends the drag. */
    onPointerUp(event: PointerEvent): void {
        if (!this.drag || event.pointerId !== this.drag.pointerId) {
            return;
        }
        (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
        this.drag = null;
        this.dragging.set(false);
    }

    onSave(): void {
        const draft = this.draft();
        if (draft.title) {
            this.save.emit(draft);
        }
    }

    onCancel(): void {
        this.dismissed.emit();
    }
}
