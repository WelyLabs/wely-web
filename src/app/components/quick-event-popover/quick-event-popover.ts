import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { EventCreateRequest } from '../../services/event.service';

/** Where the popover sits relative to the slot that opened it. */
export interface PopoverPosition {
    x: number;
    y: number;
    arrowSide: 'top' | 'left' | 'right';
}

/**
 * The small form that opens on a calendar slot to create an event in place.
 */
@Component({
    selector: 'app-quick-event-popover',
    standalone: true,
    imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule],
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

    /** Written by each field's `ngModelChange`, which is how a signal replaces two-way binding. */
    update<K extends keyof EventCreateRequest>(field: K, value: EventCreateRequest[K]): void {
        this.draft.update(draft => ({ ...draft, [field]: value }));
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
