import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DaySummary, FriendLoad } from '../calendar-overlay/overlay-layout';

/**
 * A month cell's share of the overlay: a bar per friend, filled as far as they are busy between
 * 8:00 and 23:00, and a green pill when everyone has two hours or more free together. The pill
 * opens that day, where the detail is.
 */
@Component({
    selector: 'app-month-day-overlay',
    standalone: true,
    imports: [DatePipe],
    templateUrl: './month-day-overlay.html',
    styleUrl: './month-day-overlay.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthDayOverlayComponent {
    readonly summary = input.required<DaySummary>();
    readonly openDay = output<void>();

    loadLabel(load: FriendLoad): string {
        return `${load.friendName} : occupé ${Math.round(load.ratio * 100)} % de 8 h à 23 h`;
    }

    /** The pill sits inside a clickable, hold-to-create cell: it must not trigger either. */
    onOpen(event: Event): void {
        event.stopPropagation();
        this.openDay.emit();
    }
}
