import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Observable, Subject, catchError, forkJoin, map, of, switchMap } from 'rxjs';

import { LoggerService } from '../../core/logging/logger.service';
import { SocialService } from '../../services/social.service';
import { FriendProfile, UserService } from '../../services/user.service';
import { EventService, FeedEvent, FreeRange, FriendCalendarEntry, FriendOverview } from '../../services/event.service';
import { ChatService } from '../../services/chat.service';
import { AvatarService } from '../../services/avatar.service';
import { DeletedUsersService } from '../../services/deleted-users.service';
import { USER_DELETED_CODE } from '../../models/account.model';
import { UserNodeDTO } from '../../models/user.model';
import { CLOSENESS_LABELS, Closeness, ClosenessOption, SocialPerson, closenessOptions } from '../../models/friendship.model';
import { ConfirmDialogComponent, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';
import { countdownOf } from '../event-details/event-details';
import { Period } from '../calendar-overlay/overlay-layout';
import { MIN_SHOWN_FREE_MS, freeWithinUsefulHours, pickOutingSlots } from '../../core/ui/outing-proposal';
import { avatarColor, initialsOf } from '../../core/ui/avatar';
import { eventTint } from '../../core/ui/event-tint';
import { personLink } from '../../core/ui/person-link';

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
/** Common free time is searched in stretches of at least this long. */
const MIN_FREE_MINUTES = 30;

/** Everything the page shows of one person, read together. */
export interface FriendPage {
  /** deleted: the person deleted their account. */
  state: 'loading' | 'ready' | 'notFound' | 'deleted' | 'error';
  person: SocialPerson | null;
  /** Null when not friends, or when wely-users could not answer. */
  profile: FriendProfile | null;
  /** wely-users answered 403: the page is the non-friend one whatever the graph said. */
  forbidden: boolean;
  mutual: UserNodeDTO[];
  overview: FriendOverview | null;
  /** Null when their calendar could not be read. */
  week: FriendCalendarEntry[] | null;
  free: FreeRange[] | null;
}

const LOADING: FriendPage = {
  state: 'loading', person: null, profile: null, forbidden: false, mutual: [], overview: null, week: null, free: null
};

/** One day of « Cette semaine »: the friend's entries and the time both are free. */
export interface WeekDay {
  date: Date;
  entries: FriendCalendarEntry[];
  free: Period[];
}

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function overlaps(period: Period, from: Date, to: Date): boolean {
  return period.start < to && period.end > from;
}

/** A friend's page: who they are, their week, what you share. Reduced for someone who is not a friend. */
@Component({
  selector: 'app-friend-profile',
  standalone: true,
  imports: [DatePipe, NgTemplateOutlet, RouterLink, MatIconModule, MatMenuModule, MatDialogModule],
  templateUrl: './friend-profile.html',
  styleUrls: ['./friend-profile.scss', './friend-profile-sections.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriendProfileComponent implements OnInit {
  private readonly logger = inject(LoggerService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly socialService = inject(SocialService);
  private readonly userService = inject(UserService);
  private readonly eventService = inject(EventService);
  private readonly chatService = inject(ChatService);
  private readonly deletedUsers = inject(DeletedUsersService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  readonly avatars = inject(AvatarService);

  private readonly me = toSignal(this.userService.currentUser$, { initialValue: null });
  private readonly load$ = new Subject<string>();

  readonly userId = signal('');
  readonly page = signal<FriendPage>(LOADING);
  /** While a relationship change or a join is on its way. */
  readonly busy = signal(false);
  readonly actionError = signal<string | null>(null);
  /** The event being joined, and why the last join failed. */
  readonly joining = signal<string | null>(null);
  readonly joinError = signal<string | null>(null);

  readonly now = signal(new Date());
  readonly eventTint = eventTint;
  readonly avatarColor = avatarColor;
  readonly closenessLabels = CLOSENESS_LABELS;

  readonly person = computed(() => this.page().person);
  readonly isFriend = computed(() => this.person()?.relationStatus === 'FRIENDS' && !this.page().forbidden);

  readonly displayName = computed(() => {
    const profile = this.page().profile;
    const fullName = profile ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() : '';
    return fullName || this.person()?.userName || '';
  });
  readonly initials = computed(() => initialsOf(this.displayName() || '?'));

  readonly closenessLabel = computed(() => {
    const closeness = this.person()?.closeness;
    return closeness ? CLOSENESS_LABELS[closeness] : null;
  });

  /** When the friendship began; wely-social may send nanoseconds, which Date reads to the millisecond. */
  readonly since = computed(() => {
    const since = this.person()?.since;
    const date = since ? new Date(since) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  });

  /** The closeness menu, with the same rules as a friend's card. */
  readonly closenessOptions = computed<ClosenessOption[]>(() => {
    const person = this.person();
    return person?.closeness ? closenessOptions({ ...person, closeness: person.closeness }) : [];
  });
  readonly incomingProposal = computed(() => {
    const person = this.person();
    return person?.proposal && person.proposedByFriend ? CLOSENESS_LABELS[person.proposal] : null;
  });
  readonly outgoingProposal = computed(() => {
    const person = this.person();
    return person?.proposal && !person.proposedByFriend ? CLOSENESS_LABELS[person.proposal] : null;
  });

  /** The next seven days, each with the friend's entries and the common free time in useful hours. */
  readonly week = computed<WeekDay[]>(() => {
    const today = startOfToday(this.now());
    const entries = this.page().week ?? [];
    const free = freeWithinUsefulHours(this.page().free ?? [], this.now())
      .filter(piece => piece.end.getTime() - piece.start.getTime() >= MIN_SHOWN_FREE_MS);
    return Array.from({ length: WEEK_DAYS }, (_, i) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i + 1);
      return {
        date,
        entries: entries.filter(entry => overlaps(entry, date, end))
          .sort((a, b) => a.start.getTime() - b.start.getTime()),
        free: free.filter(piece => overlaps(piece, date, end))
      };
    });
  });

  ngOnInit(): void {
    this.load$.pipe(
      switchMap(id => this.fetch(id)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(page => {
      this.page.set(page);
      this.busy.set(false);
    });

    // The same component follows a mutual friend's link: every new id is a new page.
    this.route.paramMap.pipe(
      map(params => params.get('userId') ?? ''),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(id => this.open(id));
  }

  private open(id: string): void {
    if (id === this.me()?.id) {
      this.router.navigate(['/profile'], { replaceUrl: true });
      return;
    }
    this.userId.set(id);
    this.page.set(LOADING);
    this.actionError.set(null);
    this.joinError.set(null);
    this.now.set(new Date());
    this.load$.next(id);
  }

  /** Reads the page again after a change, without going back to the skeleton. */
  reload(): void {
    this.load$.next(this.userId());
  }

  private fetch(id: string): Observable<FriendPage> {
    const mutual$ = this.socialService.getMutualFriends(id).pipe(catchError((error: unknown) => {
      this.logger.warn('FriendProfileComponent', 'Could not load the mutual friends', error);
      return of([] as UserNodeDTO[]);
    }));
    return this.socialService.getPerson(id).pipe(
      switchMap(person => {
        if (person.relationStatus === 'SELF') {
          this.router.navigate(['/profile'], { replaceUrl: true });
          return of(LOADING);
        }
        if (person.relationStatus !== 'FRIENDS') {
          return mutual$.pipe(map(mutual => ({ ...LOADING, state: 'ready' as const, person, mutual })));
        }
        return forkJoin({
          profile: this.fetchProfile(id),
          mutual: mutual$,
          overview: this.orNull(this.eventService.getFriendOverview(id), 'overview'),
          week: this.orNull(this.eventService.getFriendCalendar(id, startOfToday(this.now()),
            new Date(startOfToday(this.now()).getTime() + WEEK_DAYS * DAY_MS)), 'calendar'),
          free: this.orNull(this.eventService.findFreeSlots({
            friendIds: [id], start: this.now(),
            end: new Date(startOfToday(this.now()).getTime() + WEEK_DAYS * DAY_MS), durationMinutes: MIN_FREE_MINUTES
          }), 'free time')
        }).pipe(map(({ profile, mutual, overview, week, free }): FriendPage => profile === 'deleted'
          ? { ...LOADING, state: 'deleted' }
          : {
            state: 'ready', person, mutual, overview, week, free,
            profile: profile === 'forbidden' ? null : profile,
            forbidden: profile === 'forbidden'
          }));
      }),
      catchError((error: unknown) => this.whenMissing(id, error))
    );
  }

  /** wely-social no longer knows a deleted account: a 404 is checked with wely-users before saying not found. */
  private whenMissing(id: string, error: unknown): Observable<FriendPage> {
    if (error instanceof HttpErrorResponse && error.status === 404) {
      return this.deletedUsers.check(id).pipe(
        map((deleted): FriendPage => ({ ...LOADING, state: deleted ? 'deleted' : 'notFound' })),
        catchError((checkError: unknown) => {
          this.logger.warn('FriendProfileComponent', 'Could not check whether the account was deleted', checkError);
          return of<FriendPage>({ ...LOADING, state: 'notFound' });
        }));
    }
    this.logger.error('FriendProfileComponent', 'Could not load the person', error);
    // 400: the id in the address is not a user id at all.
    const notFound = error instanceof HttpErrorResponse && error.status === 400;
    return of({ ...LOADING, state: notFound ? 'notFound' as const : 'error' as const });
  }

  /** 403 means not friends after all, 410 a deleted account; any other failure just leaves the details out. */
  private fetchProfile(id: string): Observable<FriendProfile | 'forbidden' | 'deleted' | null> {
    return this.userService.getFriendProfile(id).pipe(catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 403) {
        return of('forbidden' as const);
      }
      if (error instanceof HttpErrorResponse && error.status === 410
        && (error.error as { code?: string } | null)?.code === USER_DELETED_CODE) {
        return of('deleted' as const);
      }
      this.logger.warn('FriendProfileComponent', 'Could not load the profile', error);
      return of(null);
    }));
  }

  private orNull<T>(request$: Observable<T>, what: string): Observable<T | null> {
    return request$.pipe(catchError((error: unknown) => {
      this.logger.warn('FriendProfileComponent', `Could not load the ${what}`, error);
      return of(null);
    }));
  }

  /** The friend page of someone else, or the viewer's own profile. */
  linkTo(userId: string): string[] {
    return personLink(userId, this.me()?.id);
  }

  countdown(event: FeedEvent): string {
    return countdownOf(event, this.now());
  }

  initialsOf(name: string): string {
    return initialsOf(name);
  }

  // --- Relationship ----------------------------------------------------------------------

  openChat(): void {
    this.busy.set(true);
    this.chatService.getConversation(this.userId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: conversation => this.router.navigate(['/chat', conversation.id]),
      error: (error: unknown) => this.fail('Could not open the conversation', error, 'Impossible d\'ouvrir la discussion')
    });
  }

  changeCloseness(closeness: Closeness): void {
    this.run(this.socialService.requestCloseness(this.userId(), closeness), 'Impossible de changer la proximité');
  }

  /** Asking for the current level again withdraws one's own proposal. */
  withdrawProposal(): void {
    const closeness = this.person()?.closeness;
    if (closeness) {
      this.changeCloseness(closeness);
    }
  }

  answerProposal(accept: boolean): void {
    const id = this.userId();
    this.run(accept ? this.socialService.acceptCloseness(id) : this.socialService.declineCloseness(id),
      'Impossible de répondre à la proposition');
  }

  addFriend(): void {
    const person = this.person();
    if (person) {
      this.run(this.socialService.sendFriendRequest(`${person.userName}#${person.hashtag}`), 'Impossible d\'envoyer la demande');
    }
  }

  acceptFriend(): void {
    this.run(this.socialService.acceptFriend(this.userId()), 'Impossible d\'accepter la demande');
  }

  rejectFriend(): void {
    this.run(this.socialService.rejectFriend(this.userId()), 'Impossible de refuser la demande');
  }

  /** After confirming, the friendship ends and the friends page shows what is left. */
  removeFriend(): void {
    const data: ConfirmDialogData = {
      title: 'Retirer cet ami',
      message: `Êtes-vous sûr de vouloir retirer ${this.person()?.userName ?? ''} de vos amis ?`,
      confirmText: 'Retirer',
      cancelText: 'Annuler',
      isDestructive: true
    };
    this.dialog.open(ConfirmDialogComponent, { width: '400px', maxWidth: '95vw', data, panelClass: 'confirm-dialog-panel' })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(confirmed => {
        if (!confirmed) {
          return;
        }
        this.busy.set(true);
        this.socialService.removeFriend(this.userId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: () => this.router.navigate(['/friends']),
          error: (error: unknown) => this.fail('Could not remove the friend', error, 'Impossible de retirer cet ami')
        });
      });
  }

  /** Runs a relationship change, then reads the page again. */
  private run(request$: Observable<unknown>, message: string): void {
    this.busy.set(true);
    this.actionError.set(null);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.reload(),
      error: (error: unknown) => this.fail('Relationship change failed', error,
        // 409: the friend changed the friendship at the same time.
        error instanceof HttpErrorResponse && error.status === 409
          ? 'Votre ami a modifié votre relation au même moment. Rechargez et réessayez.'
          : message)
    });
  }

  private fail(log: string, error: unknown, message: string): void {
    this.logger.error('FriendProfileComponent', log, error);
    this.busy.set(false);
    this.actionError.set(message);
  }

  // --- Outings ---------------------------------------------------------------------------

  /** Opens the calendar's form as a poll on up to three free evenings, or on the first free stretch. */
  proposeOuting(): void {
    const proposeSlots = pickOutingSlots(this.page().free ?? [], new Date());
    this.router.navigate(['/calendar'], { state: { proposeSlots, proposeWith: this.person()?.userName ?? '' } });
  }

  /** Joins one of the friend's outings; it then leaves the list, being shared now. */
  join(event: FeedEvent): void {
    this.joining.set(event.id);
    this.joinError.set(null);
    this.eventService.toggleSubscription(event).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.joining.set(null);
        this.page.update(page => page.overview
          ? { ...page, overview: { ...page.overview, friendUpcoming: page.overview.friendUpcoming.filter(other => other.id !== event.id) } }
          : page);
      },
      error: (error: unknown) => {
        this.logger.error('FriendProfileComponent', 'Could not join the event', error);
        this.joining.set(null);
        this.joinError.set(`Impossible de rejoindre « ${event.title} ». Réessayez dans un instant.`);
      }
    });
  }
}
