import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** One entry of a friend's calendar, cut to the part that falls on a day and placed in its column. */
export interface FriendBlock {
    top: number;
    height: number;
    /** Null when the friendship does not disclose it: the block then reads "busy". */
    title: string | null;
    location: string | null;
}

/**
 * A friend's entries for one day column, drawn under the user's own events. The host takes no
 * box of its own, so the blocks are placed against the column like the rest of its overlays.
 */
@Component({
    selector: 'app-friend-blocks',
    standalone: true,
    templateUrl: './friend-blocks.html',
    styleUrl: './friend-blocks.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriendBlocksComponent {
    readonly blocks = input.required<FriendBlock[]>();
}
