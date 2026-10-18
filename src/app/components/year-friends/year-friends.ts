import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AvatarService } from '../../services/avatar.service';
import { ProfileSummary } from '../../services/event.service';
import { upgradeLine } from '../../models/friendship-insights.model';
import { avatarColor, initialsOf } from '../../core/ui/avatar';

/** Someone of the year, named and coloured. */
export interface YearPerson {
  userId: string;
  name: string;
  initials: string;
  color: string;
}

export interface YearUpgrade extends YearPerson {
  line: string;
  intimate: boolean;
}

export interface YearCompanion extends YearPerson {
  outingsTogether: number;
  medal: string;
}

const MEDALS = ['🥇', '🥈', '🥉'];
/** Someone the directory does not name, as the circle calls them. */
const UNNAMED = 'Quelqu’un';

/** « Ton année Wely », the friends part: who joined your life, who got closer, who you went out with most. */
@Component({
  selector: 'app-year-friends',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './year-friends.html',
  styleUrl: './year-friends.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class YearFriendsComponent {
  readonly avatars = inject(AvatarService);

  readonly summary = input.required<ProfileSummary>();
  /** Usernames by id. */
  readonly names = input<ReadonlyMap<string, string>>(new Map());

  private person(userId: string): YearPerson {
    const name = this.names().get(userId) ?? UNNAMED;
    return { userId, name, initials: initialsOf(name), color: avatarColor(userId) };
  }

  readonly newFriends = computed<YearPerson[]>(() =>
    (this.summary().newFriendsThisYear ?? []).map(friend => this.person(friend.userId)));

  /** « 1 nouvel ami cette année », « 4 nouveaux amis cette année ». */
  readonly newFriendsTitle = computed(() => {
    const count = this.newFriends().length;
    return `${count} ${count > 1 ? 'nouveaux amis' : 'nouvel ami'} cette année`;
  });

  readonly upgrades = computed<YearUpgrade[]>(() => (this.summary().upgradesThisYear ?? []).map(upgrade => {
    const person = this.person(upgrade.userId);
    return { ...person, line: upgradeLine(person.name, upgrade), intimate: upgrade.closeness === 'INTIMATE' };
  }));

  readonly companions = computed<YearCompanion[]>(() => (this.summary().topFriendsThisYear ?? [])
    .slice(0, MEDALS.length)
    .map((companion, index) => ({
      ...this.person(companion.userId), outingsTogether: companion.outingsTogether, medal: MEDALS[index]
    })));

  readonly empty = computed(() =>
    this.newFriends().length === 0 && this.upgrades().length === 0 && this.companions().length === 0);
}
