import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { LoggerService } from '../../core/logging/logger.service';
import { ProfileAbout, UserService } from '../../services/user.service';
import { AvatarService } from '../../services/avatar.service';
import { EventService, FeedEvent, ProfileSummary } from '../../services/event.service';
import { SocialService } from '../../services/social.service';
import { EditProfileDialogComponent } from '../edit-profile-dialog/edit-profile-dialog.component';
import { AvatarUploadDialogComponent } from '../avatar-upload-dialog/avatar-upload-dialog.component';
import { AboutDialogComponent } from '../about-dialog/about-dialog';
import { PlacesMapComponent } from '../places-map/places-map';
import { countdownOf } from '../event-details/event-details';
import { avatarColor, initialsOf } from '../../core/ui/avatar';
import { formatCents } from '../../core/ui/money';

/** A stat card of « Ton année Wely ». */
export interface YearStat {
  value: number;
  label: string;
  hint: string;
}

/** Someone of the circle, named and pictured. */
export interface CircleMember {
  id: string;
  name: string;
  initials: string;
  color: string;
  picture: string | null;
  outingsTogether: number;
  /** Width of their bar, relative to the most frequent companion. */
  share: number;
}

/** Tiles for memories without a cover image, in Wely's colours; picked per event so each keeps its own. */
const MEMORY_TINTS = [
  'linear-gradient(135deg, #0f766e, #3b82f6)',
  'linear-gradient(135deg, #be185d, #f97316)',
  'linear-gradient(135deg, #7c3aed, #ec4899)',
  'linear-gradient(135deg, #c2410c, #facc15)',
  'linear-gradient(135deg, #1e3a8a, #7c3aed)',
  'linear-gradient(135deg, #4d7c0f, #0f766e)'
];

export function memoryTint(eventId: string): string {
  let hash = 0;
  for (const char of eventId) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return MEMORY_TINTS[Math.abs(hash) % MEMORY_TINTS.length];
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? 's' : ''}`;
}

/**
 * The signed-in user's own profile: who they are, their year in Wely, what is next and behind them,
 * who they go out with, where, and where their accounts stand. The figures come from wely-events'
 * summary; names from the user directory, pictures from AvatarService.
 */
@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [DatePipe, RouterLink, MatIconModule, MatDialogModule, PlacesMapComponent],
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserProfileComponent implements OnInit {
  private readonly logger = inject(LoggerService);
  private readonly userService = inject(UserService);
  private readonly eventService = inject(EventService);
  private readonly socialService = inject(SocialService);
  readonly avatars = inject(AvatarService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  /** `toSignal`, not a hand-written subscription: it ends with the component. */
  readonly user = toSignal(this.userService.currentUser$);

  private readonly loadFailed = signal(false);
  readonly isLoading = computed(() => !this.user() && !this.loadFailed());

  readonly summary = signal<ProfileSummary | null>(null);
  readonly summaryState = signal<'loading' | 'ready' | 'unavailable'>('loading');
  readonly friendCount = signal<number | null>(null);
  /** Bio and interests; null until read, and left null if they cannot be (the hero just shows none). */
  readonly about = signal<ProfileAbout | null>(null);
  readonly hasAbout = computed(() => {
    const about = this.about();
    return about !== null && (about.bio !== null || about.interests.length > 0);
  });
  /** Everyone's username, by id: the circle names people who are not always friends. */
  private readonly names = signal<ReadonlyMap<string, string>>(new Map());

  readonly now = new Date();
  readonly formatCents = formatCents;
  readonly memoryTint = memoryTint;

  readonly initials = computed(() => {
    const user = this.user();
    return user ? ((user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '')).toUpperCase() : '';
  });

  readonly stats = computed<YearStat[]>(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }
    const friends = this.friendCount();
    return [
      { value: summary.outingsThisYear, label: summary.outingsThisYear > 1 ? 'Sorties' : 'Sortie',
        hint: summary.outingsThisMonth > 0 ? `dont ${summary.outingsThisMonth} ce mois-ci` : 'cette année' },
      { value: summary.organizedThisYear, label: summary.organizedThisYear > 1 ? 'Organisées' : 'Organisée',
        hint: 'par toi, cette année' },
      ...(friends === null ? [] : [{ value: friends, label: friends > 1 ? 'Amis' : 'Ami', hint: 'sur Wely' }]),
      { value: summary.placesThisYear, label: summary.placesThisYear > 1 ? 'Lieux' : 'Lieu', hint: 'cette année' }
    ];
  });

  readonly circle = computed<CircleMember[]>(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }
    const most = Math.max(1, ...summary.circle.map(companion => companion.outingsTogether));
    return summary.circle.map(companion => {
      const name = this.names().get(companion.userId) ?? 'Quelqu’un';
      return {
        id: companion.userId,
        name,
        initials: initialsOf(name),
        color: avatarColor(companion.userId),
        picture: this.avatars.url(companion.userId)(),
        outingsTogether: companion.outingsTogether,
        share: Math.round(100 * companion.outingsTogether / most)
      };
    });
  });

  /** What the member owes overall, across the events where they are behind. */
  readonly owedOverall = computed(() => (this.summary()?.balances ?? [])
    .filter(balance => balance.netCents < 0)
    .reduce((sum, balance) => sum - balance.netCents, 0));

  readonly accountsLabel = computed(() => {
    const balances = this.summary()?.balances ?? [];
    const owing = balances.filter(balance => balance.netCents < 0).length;
    if (balances.length === 0) {
      return 'Tu es à jour sur tous tes événements';
    }
    if (owing === 0) {
      return `On te doit de l’argent sur ${plural(balances.length, 'événement')}`;
    }
    return `Tu dois ${formatCents(this.owedOverall())} sur ${plural(owing, 'événement')}`;
  });

  ngOnInit(): void {
    this.reloadUserProfile();
    this.loadSummary();
    this.userService.getAbout().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: about => this.about.set(about),
      error: (error: unknown) => this.logger.error('UserProfileComponent', 'Could not load the presentation', error)
    });
    this.socialService.listFriendships().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: friends => this.friendCount.set(friends.length),
      error: (error: unknown) => this.logger.error('UserProfileComponent', 'Could not count friends', error)
    });
    this.socialService.searchUsers().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: users => this.names.set(new Map(users.map(user => [user.userId, user.userName]))),
      error: (error: unknown) => this.logger.error('UserProfileComponent', 'Could not load the directory', error)
    });
  }

  reloadUserProfile(): void {
    this.loadFailed.set(false);
    this.userService.loadAndSetCurrentUser()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (err) => {
          this.logger.error('UserProfileComponent', 'Error loading profile:', err);
          this.loadFailed.set(true);
        }
      });
  }

  loadSummary(): void {
    this.eventService.getMySummary().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: summary => {
        this.summary.set(summary);
        this.summaryState.set('ready');
      },
      error: (error: unknown) => {
        this.summaryState.set('unavailable');
        this.logger.error('UserProfileComponent', 'Could not load the summary', error);
      }
    });
  }

  countdown(event: FeedEvent): string {
    return countdownOf(event, this.now);
  }

  openAvatarDialog(): void {
    // The dialog closes with true once the picture is stored: reload what the server kept.
    this.dialog.open(AvatarUploadDialogComponent, {
      width: '500px',
      maxWidth: '95vw',
      panelClass: 'edit-profile-dialog',
      enterAnimationDuration: '300ms',
      exitAnimationDuration: '150ms'
    }).afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (result) {
          this.reloadUserProfile();
        }
      });
  }

  /** Closes with what was stored, tidied by the server: shown as it is. */
  openAboutDialog(): void {
    this.dialog.open<AboutDialogComponent, ProfileAbout, ProfileAbout>(AboutDialogComponent, {
      width: '500px',
      maxWidth: '95vw',
      data: this.about() ?? { bio: null, interests: [] },
      panelClass: 'edit-profile-dialog'
    }).afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(stored => {
        if (stored) {
          this.about.set(stored);
        }
      });
  }

  /** Saving updates UserService's current user, which this page follows: nothing to do on close. */
  openEditDialog(): void {
    this.dialog.open(EditProfileDialogComponent, {
      width: '500px',
      maxWidth: '95vw',
      data: this.user(),
      panelClass: 'edit-profile-dialog'
    });
  }
}
