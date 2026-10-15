import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

import { Community } from '../../../models/community.model';
import { avatarColor, initialsOf } from '../../../core/ui/avatar';

/** One community in a list: what it is about, how many members, and which friends are among them. */
@Component({
  selector: 'app-community-card',
  standalone: true,
  imports: [RouterLink, MatIconModule],
  templateUrl: './community-card.html',
  styleUrl: './community-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityCardComponent {
  readonly community = input.required<Community>();

  readonly initials = computed(() => initialsOf(this.community().name));
  readonly color = computed(() => avatarColor(this.community().communityId));
  /** « Léa, Hugo et 3 autres amis » : two names at most, then how many more. */
  readonly friendsLabel = computed(() => {
    const community = this.community();
    const names = community.friendMembers.slice(0, 2).map((friend) => friend.userName);
    if (names.length === 0) {
      return null;
    }
    const rest = community.friendMemberCount - names.length;
    const list = names.join(', ');
    return rest > 0 ? `${list} et ${rest} autre${rest > 1 ? 's' : ''} ami${rest > 1 ? 's' : ''}` : list;
  });
}
