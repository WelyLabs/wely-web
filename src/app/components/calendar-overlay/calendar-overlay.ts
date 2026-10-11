import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FreeBand, FriendBlock } from './overlay-layout';

/**
 * One day column's overlay: the common free time in green, then each friend's lane. Drawn under
 * the user's own events and never in the way of a drag; the host takes no box of its own, so
 * everything is placed against the column.
 */
@Component({
    selector: 'app-calendar-overlay',
    standalone: true,
    templateUrl: './calendar-overlay.html',
    styleUrl: './calendar-overlay.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalendarOverlayComponent {
    readonly blocks = input<FriendBlock[]>([]);
    readonly free = input<FreeBand[]>([]);

}
