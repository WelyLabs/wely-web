import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AvatarService } from '../../services/avatar.service';
import { FeedEvent } from '../../services/event.service';
import { friendsGoingLabel } from '../../models/friendship-insights.model';
import { avatarColor, initialsOf } from '../../core/ui/avatar';

/** Avatars stacked on a card: past three, the label says the rest. */
const STACKED_AVATARS = 3;

/** One stacked avatar. */
interface GoingAvatar {
  userId: string;
  initials: string;
  color: string;
}

/** « 3 de tes proches y vont », with their stacked avatars; nothing when no friend goes. */
@Component({
  selector: 'app-friends-going',
  standalone: true,
  templateUrl: './friends-going.html',
  styleUrl: './friends-going.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriendsGoingComponent {
  readonly avatars = inject(AvatarService);

  readonly event = input.required<FeedEvent>();
  /** Names by user id, for the initials of someone without a picture. */
  readonly names = input<ReadonlyMap<string, string>>(new Map());

  readonly label = computed(() => friendsGoingLabel(this.event().friendsGoing, this.event().friendsGoingCount));

  readonly stack = computed<GoingAvatar[]>(() => (this.event().friendsGoing ?? [])
    .slice(0, STACKED_AVATARS)
    .map(friend => ({
      userId: friend.userId,
      initials: initialsOf(this.names().get(friend.userId) ?? '?'),
      color: avatarColor(friend.userId)
    })));
}
