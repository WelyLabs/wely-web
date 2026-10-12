import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit,
  computed, effect, inject, signal, viewChild
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Observable, catchError, distinctUntilChanged, filter, interval, of, retry, switchMap, throwError, timer } from 'rxjs';

import { EventParticipants, EventService, FeedEvent } from '../../services/event.service';
import { SocialService } from '../../services/social.service';
import { ChatService } from '../../services/chat.service';
import { NavigationService } from '../../services/navigation.service';
import { Conversation, Message } from '../../models/chat.model';
import { UserService } from '../../services/user.service';
import { LoggerService } from '../../core/logging/logger.service';
import { RelationStatus, UserWithStatusDTO } from '../../models/user.model';
import { EventMapComponent, openStreetMapUrl } from '../event-map/event-map';

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
}

/** One message of the group's thread, as the page shows it. */
export interface ThreadMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
}

/** loading: asking wely-chat. ready: the group exists. unavailable: it could not be read. */
export type ThreadState = 'loading' | 'ready' | 'unavailable';

/** How many of the group's last messages the event page shows; the conversation has the rest. */
export const THREAD_PREVIEW_SIZE = 3;

/** wely-chat creates the group a moment after joining (relay, then Kafka): asked again this often. */
const GROUP_RETRY_DELAY_MS = 1_500;
const GROUP_RETRY_COUNT = 6;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const AVATAR_COLORS = ['#2563eb', '#c2410c', '#0f766e', '#7c3aed', '#be185d', '#4d7c0f'];

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** A stable colour per person, so an avatar keeps its colour from one visit to the next. */
export function avatarColor(id: string): string {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

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
  imports: [DatePipe, NgTemplateOutlet, MatIconModule, EventMapComponent],
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
  private readonly navigationService = inject(NavigationService);
  private readonly userService = inject(UserService);
  private readonly logger = inject(LoggerService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly heroEnd = viewChild<ElementRef<HTMLElement>>('heroEnd');

  readonly event = signal<FeedEvent | null>(null);
  readonly notFound = signal(false);
  readonly participants = signal<EventParticipants | null>(null);
  readonly busy = signal(false);
  /** The full header has scrolled out of view: the compact bar takes over. */
  readonly collapsed = signal(false);
  /** Ticks every minute, so the countdown and the phase move on their own. */
  readonly now = signal(new Date());

  /** Everyone the viewer can see, with where the viewer stands with each. */
  private readonly directory = signal<ReadonlyMap<string, UserWithStatusDTO>>(new Map());
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

  readonly phase = computed<EventPhase | null>(() => {
    const event = this.event();
    return event ? phaseOf(event, this.joined() || this.isOrganizer(), this.now()) : null;
  });

  readonly countdown = computed(() => {
    const event = this.event();
    return event ? countdownOf(event, this.now()) : '';
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

  /** Members are the organizer and those taking part: they get the group's thread. */
  readonly member = computed(() => this.joined() || this.isOrganizer());
  private readonly member$ = toObservable(this.member);

  /** The event's group conversation in wely-chat, once it exists. */
  private readonly conversationId = signal<string | null>(null);
  readonly thread = signal<ThreadMessage[]>([]);
  readonly threadState = signal<ThreadState>('loading');
  /** The last few messages: a glimpse, the conversation itself is one tap away. */
  readonly threadPreview = computed(() => this.thread().slice(-THREAD_PREVIEW_SIZE));

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

  constructor() {
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

    this.eventService.getEvent(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: event => this.event.set(event),
      error: (error: HttpErrorResponse) => {
        if (error.status !== 404) {
          this.logger.error('EventDetailsComponent', 'Could not load the event', error);
        }
        this.notFound.set(true);
      }
    });
    this.loadParticipants(id);

    this.loadDirectory();
    this.followThread(id);

    interval(MINUTE_MS).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.now.set(new Date()));
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

  /** Back where the page was opened from: calendar, feed, map or a conversation. */
  goBack(): void {
    this.navigationService.back('/calendar');
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

  initialsOf(name: string): string {
    return initialsOf(name);
  }

  dayLabel(date: Date): string {
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  timeRange(event: FeedEvent): string {
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

  /** The name a message is signed with: "Toi" for the viewer, the directory's name when known. */
  authorOf(message: ThreadMessage): string {
    const me = this.me();
    if (me !== null && message.senderId === me.id) {
      return 'Toi';
    }
    return this.directory().get(message.senderId)?.userName ?? message.senderName;
  }

  isMine(message: ThreadMessage): boolean {
    return message.senderId === this.me()?.id;
  }

  /** Everyone but the viewer. */
  readonly others = computed(() => this.people().filter(person => person.relation !== 'ME'));

  /** People the viewer is not friends with yet, the ones worth adding after the event. */
  readonly strangers = computed(() => this.others().filter(person => person.relation === 'NONE' || person.relation === 'SENT_BY_THEM'));

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
      next: users => this.directory.set(new Map(users.map(user => [user.userId, user]))),
      error: error => this.logger.error('EventDetailsComponent', 'Could not load the names', error)
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
    ).subscribe(message => this.upsert(toThreadMessage(message)));
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

  /** Appends a message, or replaces it if it is already shown. */
  private upsert(message: ThreadMessage): void {
    this.thread.update(messages => {
      const index = messages.findIndex(shown => shown.id === message.id);
      return index < 0 ? [...messages, message] : messages.map((shown, i) => i === index ? message : shown);
    });
  }

  private loadParticipants(id: string): void {
    this.eventService.getParticipants(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: participants => this.participants.set(participants),
      error: error => this.logger.error('EventDetailsComponent', 'Could not load the participants', error)
    });
  }

  private person(id: string): Person {
    const known = this.directory().get(id);
    const me = this.me();
    const isMe = me !== null && id === me.id;
    const name = isMe ? 'Toi' : known?.userName ?? 'Quelqu’un';
    return {
      id,
      name,
      initials: initialsOf(name),
      picture: known?.profilePicUrl,
      isFriend: (this.participants()?.friendsGoingIds ?? []).includes(id),
      relation: isMe ? 'ME' : known?.relationStatus ?? 'NONE'
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
    timestamp: message.timestamp
  };
}
