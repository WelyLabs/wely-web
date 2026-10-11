import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CLOSENESS_LABELS, Closeness, FriendSummary } from '../../models/friendship.model';
import { FriendMentionInputComponent } from '../friend-mention-input/friend-mention-input';
import { MAX_OVERLAID_FRIENDS } from '../calendar-overlay/overlay-layout';

/** What a closeness lets the viewer see of the friend's calendar, for the legend. */
const DISCLOSES: Readonly<Record<Closeness, string>> = {
    FRIEND: 'occupé, sauf ce que vous voyez déjà',
    CLOSE: 'aussi le titre des événements avec des inconnus',
    INTIMATE: 'tout, sauf ses événements privés'
};

/** One line of the legend: a mentioned friend, their colour and what the closeness shows. */
interface LegendEntry {
    userId: string;
    userName: string;
    color: string;
    closeness: string;
    discloses: string;
}

/**
 * Above the week: mention up to four friends to lay their calendars side by side, with a legend
 * matching each colour to a friend and saying what the friendship lets you see.
 */
@Component({
    selector: 'app-friend-overlay-bar',
    standalone: true,
    imports: [FriendMentionInputComponent],
    templateUrl: './friend-overlay-bar.html',
    styleUrl: './friend-overlay-bar.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriendOverlayBarComponent {
    readonly friendships = input.required<FriendSummary[]>();
    readonly selected = input<readonly string[]>([]);
    readonly colors = input<ReadonlyMap<string, string>>(new Map());
    readonly error = input<string | null>(null);
    readonly selectedChange = output<string[]>();

    readonly max = MAX_OVERLAID_FRIENDS;

    readonly legend = computed<LegendEntry[]>(() => {
        const byId = new Map(this.friendships().map(friend => [friend.userId, friend]));
        return this.selected().flatMap(id => {
            const friend = byId.get(id);
            return friend ? [{
                userId: id,
                userName: friend.userName,
                color: this.colors().get(id) ?? '',
                closeness: CLOSENESS_LABELS[friend.closeness],
                discloses: DISCLOSES[friend.closeness]
            }] : [];
        });
    });
}
