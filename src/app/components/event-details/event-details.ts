import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit,
  computed, effect, inject, signal, viewChild
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { personLink } from '../../core/ui/person-link';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { EMPTY, Observable, catchError, distinctUntilChanged, filter, interval, of, retry, switchMap, throwError, timer } from 'rxjs';

import { EventParticipants, EventService, FeedEvent, LeaveChoice, LeaveResult, Poll } from '../../services/event.service';
import { PollStreamService } from '../../services/poll-stream.service';
import { EventPollComponent, Voter } from '../event-poll/event-poll';
import { EventConflictsComponent } from '../event-conflicts/event-conflicts';
import { SocialService } from '../../services/social.service';
import { ChatService, upsertById } from '../../services/chat.service';
import { NavigationService } from '../../services/navigation.service';
import { Conversation, Message, MessagePhoto, isSystemMessage } from '../../models/chat.model';
import { UserService } from '../../services/user.service';
import { LoggerService } from '../../core/logging/logger.service';
import { RelationStatus, UserWithStatusDTO } from '../../models/user.model';
import { EventMapComponent, openStreetMapUrl } from '../event-map/event-map';
import { googleCalendarUrl, icsFileName, icsOf } from '../../core/ui/calendar-export';
import { ChatBubbleComponent, ChatBubbleMessage } from '../shared/chat-bubble/chat-bubble';
import { avatarColor, initialsOf } from '../../core/ui/avatar';
import { DELETED_USER_AVATAR_COLOR, DELETED_USER_ICON, DELETED_USER_LABEL } from '../../core/ui/deleted-user';
import { AvatarService } from '../../services/avatar.service';
import { DeletedUsersService } from '../../services/deleted-users.service';
import { PendingTrailDirective } from '../../core/ui/pending-trail.directive';
import { EventExpensesComponent } from '../event-expenses/event-expenses';
import { ExpenseMember } from '../../models/expense.model';
import { EventCoverDialogComponent, EventCoverDialogData, EventCoverDialogResult } from '../event-cover-dialog/event-cover-dialog';
import { eventMediaError } from '../../core/ui/event-media-errors';
import { CallService } from '../../services/call.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';
import { HandOverDialogComponent, HandOverDialogData, HandOverDialogResult } from '../hand-over-dialog/hand-over-dialog';
import { Call, CallMedia, isLive } from '../../models/call.model';
import { allDayLocalRange } from '../../core/ui/all-day';
import { EventEditDialogComponent } from '../event-edit-dialog/event-edit-dialog';
import { EventInviteDialogComponent, EventInviteDialogData } from '../event-invite-dialog/event-invite-dialog';
import { invitationError } from '../../models/event-invitation';

/**
 * What the page is for, given who looks and when.
 *
 * guest: not taking part yet, so the details have to convince. member: taking part, before
 * the day, so the group comes first. live: the day itself. past: the event is over.
 */
export type EventPhase = 'guest' | 'member' | 'live' | 'past';

/** Where the viewer stands with someone; `ME` for the viewer themselves. */
export type Relation = RelationStatus | 'ME';

export interface Person {
  id: string;
  name: string;
  initials: string;
  picture?: string;
  isFriend: boolean;
  relation: Relation;
  /** A participant wely-users confirms deleted their account. */
  deleted: boolean;
}

/** One message of the group's thread, as the page shows it. */
export interface ThreadMessage {
  id: string;
  senderId: string;
  /** Null once the sender deleted their account. */
  senderName: string | null;
  content: string;
  timestamp: string;
  photo?: MessagePhoto | null;
  system?: boolean;
}

/** loading: asking wely-chat. ready: the group exists. unavailable: it could not be read. */
export type ThreadState = 'loading' | 'ready' | 'unavailable';

/** How many of the group's last messages the event page shows; the conversation has the rest. */
export const THREAD_PREVIEW_SIZE = 3;

/** wely-chat creates the group a moment after joining (relay, then Kafka): asked again this often. */
const GROUP_RETRY_DELAY_MS = 1_500;
const GROUP_RETRY_COUNT = 6;

/** Leaving refused: the organizer must name a successor (someone joined meanwhile). */
export const NEW_ORGANIZER_REQUIRED = 'EVT-BUS-020';
/** Leaving refused: the chosen successor no longer takes part. */
export const SUCCESSOR_NOT_PARTICIPANT = 'EVT-BUS-021';
/** Leaving refused: the last member has to confirm the deletion. */
export const LAST_MEMBER = 'EVT-BUS-022';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** The phase for a viewer at a given moment. */
export function phaseOf(event: FeedEvent, member: boolean, now: Date): EventPhase {
  if (now.getTime() > event.endDate.getTime()) {
    return 'past';
  }
  if (!member) {
    return 'guest';
  }
  const ongoing = now.getTime() >= event.startDate.getTime();
  return ongoing || isSameDay(event.startDate, now) ? 'live' : 'member';
}

/** How far the event is, in the words the header shows. */
export function countdownOf(event: FeedEvent, now: Date): string {
  const untilStart = event.startDate.getTime() - now.getTime();
  if (now.getTime() > event.endDate.getTime()) {
    return 'Terminé';
  }
  if (untilStart <= 0) {
    return 'En cours';
  }
  if (isSameDay(event.startDate, now)) {
    const minutes = Math.ceil(untilStart / MINUTE_MS);
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `Commence dans ${hours} h ${String(minutes % 60).padStart(2, '0')}` : `Commence dans ${minutes} min`;
  }
  const tomorrow = new Date(now.getTime() + DAY_MS);
  if (isSameDay(event.startDate, tomorrow)) {
    return 'Demain';
  }
  const startDay = new Date(event.startDate.getFullYear(), event.startDate.getMonth(), event.startDate.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return `Dans ${Math.round((startDay.getTime() - today.getTime()) / DAY_MS)} jours`;
}

@Component({
  selector: 'app-event-details',
  standalone: true,
  imports: [PendingTrailDirective, NgTemplateOutlet, MatIconModule, MatMenuModule, EventMapComponent, ChatBubbleComponent,
    EventExpensesComponent, EventPollComponent, EventConflictsComponent],
  templateUrl: './event-details.html',
  styleUrl: './event-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventService = inject(EventService);
  private readonly socialService = inject(SocialService);
  private readonly chatService = inject(ChatService);
  private readonly avatars = inject(AvatarService);
  private readonly deletedUsers = inject(DeletedUsersService);
  private readonly navigationService = inject(NavigationService);
  private readonly userService = inject(UserService);
  private readonly logger = inject(LoggerService);
  private readonly dialog = inject(MatDialog);
  private readonly pollStream = inject(PollStreamService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly heroEnd = viewChild<ElementRef<HTMLElement>>('heroEnd');

  readonly event = signal<FeedEvent | null>(null);
  readonly notFound = signal(false);
  readonly participants = signal<EventParticipants | null>(null);
  readonly busy = signal(false);
  /** The full header has scrolled out of view: the compact bar takes over. */
  readonly collapsed = signal(false);
  /** The cover being taken off, and what went wrong with it. */
  readonly coverRemoving = signal(false);
  readonly coverError = signal('');
  /** Ticks every minute, so the countdown and the phase move on their own. */
  readonly now = signal(new Date());

  /** Everyone the viewer can see, with where the viewer stands with each. */
  private readonly directory = signal<ReadonlyMap<string, UserWithStatusDTO>>(new Map());
  /** The directory answered, or failed: only then is an unknown id worth asking about. */
  private readonly directoryReady = signal(false);
  readonly deletedAvatarColor = DELETED_USER_AVATAR_COLOR;
  readonly deletedIcon = DELETED_USER_ICON;
  /** People a friend request or an acceptance is on its way for. */
  readonly sending = signal<ReadonlySet<string>>(new Set());
  private readonly me = toSignal(this.userService.currentUser$, { initialValue: null });

  readonly isOrganizer = computed(() => {
    const event = this.event();
    const me = this.me();
    return event !== null && me !== null && event.organizerId === me.id;
  });

  readonly joined = computed(() => {
    const me = this.me();
    return me !== null && (this.participants()?.participantIds ?? []).includes(me.id);
  });

  /** Invited and not answered yet: the page offers to join or to decline. */
  readonly invited = computed(() => {
    const me = this.me();
    return me !== null && !this.joined() && !this.isOrganizer()
      && (this.participants()?.invitedIds ?? []).includes(me.id);
  });

  /** The organizer invites friends one by one, but not to a community's event, a birthday, or what is over. */
  readonly canInvite = computed(() => {
    const event = this.event();
    return this.isOrganizer() && event !== null && !event.communityId && event.kind !== 'BIRTHDAY'
      && this.phase() !== 'past';
  });

  /** How many invitations wait for an answer, as the organizer sees them. */
  readonly pendingInvitations = computed(() => this.participants()?.invitedIds?.length ?? 0);

  /** The date is still being voted on: the event's dates are only its earliest proposal. */
  readonly polling = computed(() => this.event()?.poll?.status === 'OPEN');

  readonly phase = computed<EventPhase | null>(() => {
    const event = this.event();
    if (!event) {
      return null;
    }
    const member = this.joined() || this.isOrganizer();
    // No live or past page for a date nobody fixed yet.
    return this.polling() ? (member ? 'member' : 'guest') : phaseOf(event, member, this.now());
  });

  readonly countdown = computed(() => {
    const event = this.event();
    if (!event) {
      return '';
    }
    return this.polling() ? 'Date à fixer' : countdownOf(event, this.now());
  });

  /** Name and picture of a voter, for the poll's avatars. */
  readonly voterOf = (id: string): Voter => this.person(id);

  /** The event whose open poll is followed live; null when there is none. */
  private readonly openPollId = computed(() => {
    const event = this.event();
    return event?.poll?.status === 'OPEN' ? event.id : null;
  });

  readonly organizerName = computed(() => {
    const event = this.event();
    return event ? this.directory().get(event.organizerId)?.userName ?? '' : '';
  });

  readonly friends = computed(() => (this.participants()?.friendsGoingIds ?? []).map(id => this.person(id)));

  /** Everyone, friends first; only filled for those who take part or organize. */
  readonly people = computed(() => {
    const all = (this.participants()?.participantIds ?? []).map(id => this.person(id));
    return [...all.filter(person => person.isFriend), ...all.filter(person => !person.isFriend)];
  });

  /** Opens someone's page: a friend's, or the viewer's own profile. */
  openPerson(userId: string): void {
    this.router.navigate(personLink(userId, this.me()?.id));
  }

  /** The viewer's id, once known: the expenses card needs it to say where they stand. */
  readonly meId = computed(() => this.me()?.id ?? null);

  /** Who an expense can be paid by or for: the organizer, then everyone taking part. */
  readonly expenseMembers = computed<ExpenseMember[]>(() => {
    const event = this.event();
    if (!event) {
      return [];
    }
    const ids = [...new Set([event.organizerId, ...(this.participants()?.participantIds ?? [])])];
    return ids.map(id => {
      const { name, initials, picture, deleted } = this.person(id);
      return { id, name, initials, picture, deleted };
    });
  });

  /** Members are the organizer and those taking part: they get the group's thread. */
  readonly member = computed(() => this.joined() || this.isOrganizer());
  private readonly member$ = toObservable(this.member);

  /** The event's group conversation in wely-chat, once it exists. */
  protected readonly conversationId = signal<string | null>(null);
  private readonly calls = inject(CallService);
  /** The group's call going on, if any; members are offered to join it. */
  readonly liveCall = signal<Call | null>(null);
  readonly callStarting = signal(false);
  readonly thread = signal<ThreadMessage[]>([]);
  readonly threadState = signal<ThreadState>('loading');
  /** The last few messages: a glimpse, the conversation itself is one tap away. */
  readonly threadPreview = computed<ChatBubbleMessage[]>(() => this.thread().slice(-THREAD_PREVIEW_SIZE).map(message => ({
    text: message.content,
    time: message.timestamp,
    isMe: this.isMine(message),
    senderName: this.authorOf(message),
    senderId: message.senderId,
    system: message.system,
    photo: message.photo
      ? { url: message.photo.url ?? null, width: message.photo.width, height: message.photo.height, removed: message.photo.removed }
      : undefined
  })));

  readonly friendsSentence = computed(() => {
    const names = this.friends().map(friend => friend.name.split(' ')[0]);
    if (names.length === 0) {
      return '';
    }
    if (names.length === 1) {
      return `${names[0]} y va`;
    }
    const shown = names.slice(0, 3);
    const rest = names.length - shown.length;
    const list = rest > 0 ? `${shown.join(', ')} et ${rest} autre${rest > 1 ? 's' : ''}` : `${shown.slice(0, -1).join(', ')} et ${shown.at(-1)}`;
    return `${list} y vont`;
  });

  readonly mapUrl = computed(() => {
    const event = this.event();
    if (!event) {
      return null;
    }
    return event.coordinates
      ? openStreetMapUrl(event.coordinates)
      : `https://www.openstreetmap.org/search?query=${encodeURIComponent(event.location)}`;
  });

  /** The page itself, which the agenda's copy links back to. */
  private readonly eventUrl = computed(() => {
    const event = this.event();
    return event ? `${window.location.origin}/event/${event.id}` : '';
  });

  /** Google Calendar's « add event » page, filled in with the event. */
  readonly googleCalendarUrl = computed(() => {
    const event = this.event();
    return event ? googleCalendarUrl(event, this.eventUrl()) : null;
  });

  constructor() {
    // The group's call: asked once the group is known, then kept up to date by the call events.
    toObservable(this.conversationId).pipe(
      distinctUntilChanged(),
      switchMap(id => id ? this.calls.liveCall(id).pipe(catchError(() => of(null))) : of(null)),
      takeUntilDestroyed(),
    ).subscribe(call => this.liveCall.set(call));
    this.calls.events$.pipe(
      filter(event => event.call.conversationId === this.conversationId()),
      takeUntilDestroyed(),
    ).subscribe(event => this.liveCall.set(isLive(event.call) ? event.call : null));

    // Follows the open poll live; a closed one brings the event back with its fixed date.
    toObservable(this.openPollId).pipe(
      distinctUntilChanged(),
      switchMap(id => id ? this.pollStream.follow(id).pipe(catchError((error: unknown) => {
        this.logger.error('EventDetailsComponent', 'Could not follow the poll', error);
        return EMPTY;
      })) : EMPTY),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(poll => this.applyPoll(poll));

    // Watches the end of the full header rather than a scroll offset: it works whichever ancestor scrolls.
    effect(onCleanup => {
      const target = this.heroEnd()?.nativeElement;
      if (!target) {
        return;
      }
      const observer = new IntersectionObserver(([entry]) => this.collapsed.set(!entry.isIntersecting));
      observer.observe(target);
      onCleanup(() => observer.disconnect());
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.notFound.set(true);
      return;
    }

    this.loadEvent(id);
    this.loadParticipants(id);

    this.loadDirectory();
    this.followThread(id);

    interval(MINUTE_MS).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.now.set(new Date()));
  }

  /** A new state of the poll, voted here or streamed; once closed the event is read again. */
  applyPoll(poll: Poll): void {
    const event = this.event();
    if (!event) {
      return;
    }
    if (poll.status === 'CLOSED') {
      this.onDateFixed();
      return;
    }
    this.event.set({ ...event, poll });
  }

  /** The date was fixed: the event and its participants (the yes voters joined) are read again. */
  onDateFixed(): void {
    const event = this.event();
    if (event) {
      this.loadEvent(event.id);
      this.loadParticipants(event.id);
    }
  }

  toggleParticipation(): void {
    const event = this.event();
    if (!event || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.eventService.toggleSubscription(event).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(false);
        this.loadParticipants(event.id);
      },
      error: error => {
        this.busy.set(false);
        this.logger.error('EventDetailsComponent', 'Could not change the participation', error);
      }
    });
  }

  /**
   * Leaves the event. A participant just goes; the organizer hands it over to someone taking
   * part, or, being the last one, confirms that leaving deletes it.
   */
  leave(): void {
    const event = this.event();
    if (!event || this.busy()) {
      return;
    }
    if (!this.isOrganizer()) {
      this.sendLeave(event.id, {});
      return;
    }
    this.askHowToLeave(event.id);
  }

  /** The organizer's way out: a successor among the live participants, the deletion when none is left. */
  private askHowToLeave(eventId: string): void {
    // Every candidate is checked, named or not: a directory loaded before a deletion still names the account.
    const candidates = this.liveOthers().map(person => person.id);
    const deleted$ = candidates.length === 0 ? of(new Set<string>()) : this.deletedUsers.deletedAmong(candidates).pipe(
      catchError((error: unknown) => {
        this.logger.warn('EventDetailsComponent', 'Could not check for deleted participants', error);
        return of(new Set<string>());
      }));
    this.busy.set(true);
    deleted$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(deleted => {
      this.busy.set(false);
      const successors = this.liveOthers().filter(person => !deleted.has(person.id));
      if (successors.length > 0) {
        this.askSuccessor(eventId, successors);
      } else {
        this.confirmDeletion(eventId);
      }
    });
  }

  private askSuccessor(eventId: string, candidates: readonly Person[]): void {
    const data: HandOverDialogData = { people: candidates.map(({ id, name }) => ({ id, name })) };
    this.dialog.open<HandOverDialogComponent, HandOverDialogData, HandOverDialogResult>(HandOverDialogComponent, {
      width: '440px',
      maxWidth: '95vw',
      data,
      panelClass: 'confirm-dialog-panel'
    }).afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(newOrganizerId => {
        if (newOrganizerId) {
          this.sendLeave(eventId, { newOrganizerId });
        }
      });
  }

  private confirmDeletion(eventId: string): void {
    const data: ConfirmDialogData = {
      title: "Supprimer l'événement ?",
      message: "Tu es le dernier participant : en partant, l'événement est supprimé, avec ses photos, ses dépenses et sa discussion.",
      confirmText: 'Supprimer et partir',
      cancelText: 'Annuler',
      isDestructive: true
    };
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '400px',
      maxWidth: '95vw',
      data,
      panelClass: 'confirm-dialog-panel'
    }).afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(confirmed => {
        if (confirmed) {
          this.sendLeave(eventId, { deleteIfLast: true });
        }
      });
  }

  private sendLeave(eventId: string, choice: LeaveChoice): void {
    this.busy.set(true);
    this.eventService.leave(eventId, choice).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.busy.set(false);
        this.afterLeaving(eventId, result);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.onLeaveRefused(eventId, error);
      }
    });
  }

  private afterLeaving(eventId: string, result: LeaveResult): void {
    if (result.deleted) {
      this.notifications.showInfo('Événement supprimé');
      this.navigationService.back('/calendar');
      return;
    }
    // The event as it stands now, organizer included: a private one may no longer be readable.
    if (result.event) {
      this.event.set(result.event);
    }
    this.loadParticipants(eventId);
  }

  /** The group changed while the viewer was choosing: asked again with the fresh list. */
  private onLeaveRefused(eventId: string, error: unknown): void {
    const code = error instanceof HttpErrorResponse ? (error.error as { code?: string } | null)?.code : undefined;
    if (code === NEW_ORGANIZER_REQUIRED || code === SUCCESSOR_NOT_PARTICIPANT) {
      this.loadParticipants(eventId, () => this.askHowToLeave(eventId));
      return;
    }
    if (code === LAST_MEMBER) {
      this.confirmDeletion(eventId);
      return;
    }
    this.logger.error('EventDetailsComponent', 'Could not leave the event', error);
  }

  /** The organizer rewrites the event in a dialog; the page shows it as stored. */
  editEvent(): void {
    const event = this.event();
    if (!event || !this.isOrganizer()) {
      return;
    }
    this.dialog.open<EventEditDialogComponent, FeedEvent, FeedEvent>(EventEditDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
      data: event,
      autoFocus: false,
    }).afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(updated => {
        if (updated) {
          this.event.set(updated);
          this.notifications.showInfo('Événement modifié');
        }
      });
  }

  /** The organizer invites friends one by one; the invitations are read again once the dialog closes. */
  inviteFriends(): void {
    const event = this.event();
    if (!event || !this.canInvite()) {
      return;
    }
    const participants = this.participants();
    const data: EventInviteDialogData = {
      event,
      participantIds: participants?.participantIds ?? [],
      invitedIds: participants?.invitedIds ?? [],
    };
    this.dialog.open<EventInviteDialogComponent, EventInviteDialogData, string[]>(EventInviteDialogComponent, {
      width: '480px',
      maxWidth: '95vw',
      data,
      autoFocus: false,
    }).afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadParticipants(event.id));
  }

  /** The organizer deletes the event for everyone, once confirmed; whoever takes part, the event goes. */
  deleteEvent(): void {
    const event = this.event();
    if (!event || !this.isOrganizer() || this.busy()) {
      return;
    }
    const data: ConfirmDialogData = {
      title: "Supprimer l'événement ?",
      message: 'Les participants ne le verront plus. Ses photos, ses dépenses et sa discussion disparaissent avec lui. Cette action est définitive.',
      confirmText: 'Supprimer pour tout le monde',
      cancelText: 'Annuler',
      isDestructive: true
    };
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '400px',
      maxWidth: '95vw',
      data,
      panelClass: 'confirm-dialog-panel'
    }).afterClosed()
      .pipe(
        filter(confirmed => confirmed === true),
        switchMap(() => {
          this.busy.set(true);
          return this.eventService.deleteEvent(event.id);
        }),
        takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.notifications.showInfo('Événement supprimé');
          this.navigationService.back('/calendar');
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.logger.error('EventDetailsComponent', 'Could not delete the event', error);
          this.notifications.showInfo("L'événement n'a pas pu être supprimé. Réessaie dans un instant.");
        }
      });
  }

  /**
   * The invitee declines: off the invited, so a private event is no longer theirs to see and the
   * page goes back; any other stays readable.
   */
  declineInvitation(): void {
    const event = this.event();
    const me = this.me();
    if (!event || !me || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.eventService.withdrawInvitation(event.id, me.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(false);
        this.notifications.showInfo('Invitation déclinée');
        if (event.visibility === 'PRIVATE') {
          this.navigationService.back('/calendar');
        } else {
          this.loadParticipants(event.id);
        }
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.showInfo(invitationError(error));
      }
    });
  }

  /** The organizer picked a picture: it is cropped in a dialog, which uploads it. */
  onCoverPicked(pick: Event): void {
    const input = pick.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    const event = this.event();
    if (input) {
      input.value = '';
    }
    if (!file || !event) {
      return;
    }
    this.coverError.set('');
    this.dialog.open<EventCoverDialogComponent, EventCoverDialogData, EventCoverDialogResult>(EventCoverDialogComponent, {
      data: { eventId: event.id, file },
      width: '640px',
      maxWidth: '95vw'
    }).afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(updated => {
        // Editing always passes an eventId, so the dialog uploads and returns the event; the Blob
        // branch is only for event creation, which goes through the quick-event popover instead.
        if (updated && !(updated instanceof Blob)) {
          this.event.set(updated);
        }
      });
  }

  removeCover(): void {
    const event = this.event();
    if (!event || this.coverRemoving()) {
      return;
    }
    this.coverRemoving.set(true);
    this.coverError.set('');
    this.eventService.removeCover(event.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.coverRemoving.set(false);
        this.event.update(current => current ? { ...current, image: null } : current);
      },
      error: (error: unknown) => {
        this.coverRemoving.set(false);
        this.coverError.set(eventMediaError(error, 'La couverture n’a pas pu être retirée. Réessaie dans un instant.'));
        this.logger.error('EventDetailsComponent', 'Could not remove the cover', error);
      }
    });
  }

  /** Back where the page was opened from: calendar, feed, map or a conversation. */
  goBack(): void {
    this.navigationService.back('/calendar');
  }

  /** Calls everyone in the event's group, or joins the call going on, then opens it. */
  async startGroupCall(media: CallMedia): Promise<void> {
    const conversationId = this.conversationId();
    if (!conversationId || this.callStarting()) {
      return;
    }
    this.callStarting.set(true);
    const call = await this.calls.start(conversationId, media);
    this.callStarting.set(false);
    if (call) {
      this.router.navigate(['/call', call.id]);
    }
  }

  /** The group's conversation, in the chat: where it is read in full and written to. */
  openDiscussion(): void {
    const conversationId = this.conversationId();
    if (conversationId) {
      this.router.navigate(['/chat', conversationId]);
    }
  }

  avatarColor(id: string): string {
    return avatarColor(id);
  }



  dayLabel(date: Date): string {
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  /** Day and hours, or « Sondage en cours » while the date is voted on. */
  whenLabel(event: FeedEvent): string {
    return event.poll?.status === 'OPEN' ? 'Sondage en cours' : `${this.dayLabel(event.startDate)} · ${this.timeRange(event)}`;
  }

  /** The organizer moved the event out of a conflict: the page shows its new dates. */
  onRescheduled(moved: FeedEvent): void {
    this.event.set(moved);
  }

  /**
   * Into Apple Calendar, Outlook and the others: the browser opens the .ics wely-events serves,
   * and iOS and macOS Safari bring up the « add to calendar » sheet rather than saving a file.
   * Without a link (wely-events unreachable), the file built here is saved instead.
   */
  addToCalendarApp(): void {
    const event = this.event();
    if (!event) {
      return;
    }
    this.eventService.calendarFileUrl(event.id).subscribe({
      next: url => this.openCalendarFile(url),
      error: error => {
        this.logger.warn('EventDetailsComponent', 'Could not get a calendar link, saving the file instead', error);
        this.downloadIcs();
      }
    });
  }

  /** The calendar app takes over from here; a seam for the tests, where jsdom cannot navigate. */
  openCalendarFile(url: string): void {
    window.location.assign(url);
  }

  /** The event as an .ics file, built here: the fallback when wely-events gives no link. */
  downloadIcs(): void {
    const event = this.event();
    if (!event) {
      return;
    }
    const file = new Blob([icsOf(event, this.eventUrl(), new Date())], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = icsFileName(event.title);
    link.click();
    URL.revokeObjectURL(url);
  }

  /** The day the event starts on: an all-day event's UTC date, which a local reading shifts west of UTC. */
  startDay(event: FeedEvent): Date {
    return event.allDay ? allDayLocalRange(event.startDate, event.endDate).start : event.startDate;
  }

  timeRange(event: FeedEvent): string {
    if (event.allDay) {
      return 'Toute la journée';
    }
    const format = (date: Date) => date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${format(event.startDate)} – ${format(event.endDate)}`;
  }

  /** Sends a request to someone met at this event, so they know where it comes from. */
  addFriend(person: Person): void {
    const event = this.event();
    const hashtag = this.directory().get(person.id)?.hashtag;
    if (!event || hashtag === undefined) {
      return;
    }
    this.connect(person, this.socialService.sendFriendRequest(`${person.name}#${hashtag}`, event.id), 'Could not send the friend request');
  }

  acceptFriend(person: Person): void {
    this.connect(person, this.socialService.acceptFriend(person.id), 'Could not accept the friend request');
  }

  /** The name a message is signed with: "Toi", the directory's, the stored one, else none and the bubble names the sender. */
  authorOf(message: ThreadMessage): string | undefined {
    if (message.system) {
      return message.senderName ?? undefined;
    }
    const me = this.me();
    if (me !== null && message.senderId === me.id) {
      return 'Toi';
    }
    return this.directory().get(message.senderId)?.userName ?? message.senderName ?? undefined;
  }

  isMine(message: ThreadMessage): boolean {
    return message.senderId === this.me()?.id;
  }

  /** Everyone but the viewer. */
  readonly others = computed(() => this.people().filter(person => person.relation !== 'ME'));

  /** Everyone but the viewer and deleted accounts: who can take the event over. */
  readonly liveOthers = computed(() => this.others().filter(person => !person.deleted));

  /** People the viewer is not friends with yet, the ones worth adding after the event. */
  readonly strangers = computed(() => this.liveOthers()
    .filter(person => person.relation === 'NONE' || person.relation === 'SENT_BY_THEM'));

  private connect(person: Person, request: Observable<unknown>, failure: string): void {
    if (this.sending().has(person.id)) {
      return;
    }
    this.sending.update(ids => new Set(ids).add(person.id));
    const done = () => this.sending.update(ids => {
      const next = new Set(ids);
      next.delete(person.id);
      return next;
    });
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        done();
        this.loadDirectory();
      },
      error: error => {
        done();
        this.logger.error('EventDetailsComponent', failure, error);
      }
    });
  }

  private loadDirectory(): void {
    this.socialService.searchUsers().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: users => {
        this.directory.set(new Map(users.map(user => [user.userId, user])));
        this.directoryReady.set(true);
      },
      error: error => {
        this.directoryReady.set(true);
        this.logger.error('EventDetailsComponent', 'Could not load the names', error);
      }
    });
  }

  /**
   * Loads the group whenever the viewer becomes a member, and appends what arrives live. wely-chat
   * creates the group a moment after a join, so a 404 right then is asked again a few times.
   */
  private followThread(eventId: string): void {
    this.member$.pipe(
      distinctUntilChanged(),
      filter(Boolean),
      switchMap(() => {
        this.threadState.set('loading');
        return this.chatService.getEventConversation(eventId).pipe(
          retry({
            count: GROUP_RETRY_COUNT,
            delay: (error: HttpErrorResponse) => error.status === 404 ? timer(GROUP_RETRY_DELAY_MS) : throwError(() => error)
          }),
          catchError(error => {
            this.logger.error('EventDetailsComponent', 'Could not load the group thread', error);
            return of(null);
          })
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(conversation => this.showConversation(conversation));

    this.chatService.messages$.pipe(
      filter(message => message.conversationId === this.conversationId()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(message => this.thread.update(messages => upsertById(messages, toThreadMessage(message), message.kind)));
  }

  private showConversation(conversation: Conversation | null): void {
    if (!conversation) {
      this.threadState.set('unavailable');
      return;
    }
    this.conversationId.set(conversation.id);
    this.thread.set((conversation.messages ?? []).map(toThreadMessage));
    this.threadState.set('ready');
    this.chatService.initializeStream();
  }

  private loadEvent(id: string): void {
    this.eventService.getEvent(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: event => this.event.set(event),
      error: (error: HttpErrorResponse) => {
        if (error.status !== 404) {
          this.logger.error('EventDetailsComponent', 'Could not load the event', error);
        }
        this.notFound.set(true);
      }
    });
  }

  private loadParticipants(id: string, then?: () => void): void {
    this.eventService.getParticipants(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: participants => {
        this.participants.set(participants);
        then?.();
      },
      error: error => this.logger.error('EventDetailsComponent', 'Could not load the participants', error)
    });
  }

  private person(id: string): Person {
    const known = this.directory().get(id);
    const me = this.me();
    const isMe = me !== null && id === me.id;
    // Asked only for an id the loaded directory could not name.
    const deleted = !isMe && !known && this.directoryReady() && this.deletedUsers.isDeleted(id)();
    const name = isMe ? 'Toi' : known?.userName ?? (deleted ? DELETED_USER_LABEL : 'Quelqu’un');
    return {
      id,
      name,
      initials: deleted ? '' : initialsOf(name),
      // Through AvatarService, as a signal: the picture shows once its signed URL arrives.
      picture: deleted ? undefined : this.avatars.url(id)() ?? undefined,
      isFriend: (this.participants()?.friendsGoingIds ?? []).includes(id),
      relation: isMe ? 'ME' : known?.relationStatus ?? 'NONE',
      deleted
    };
  }
}

/** Messages from history carry no id (wely-chat does not assign one yet): one is made up to track them. */
function toThreadMessage(message: Message): ThreadMessage {
  return {
    id: message.id ?? `${message.senderId}-${message.timestamp}`,
    senderId: message.senderId,
    senderName: message.senderName,
    content: message.content,
    timestamp: message.timestamp,
    photo: message.photo ?? null,
    system: isSystemMessage(message) || undefined
  };
}
