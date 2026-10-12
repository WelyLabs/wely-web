import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit,
  computed, effect, inject, signal, viewChild
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { interval } from 'rxjs';

import { EventParticipants, EventService, FeedEvent } from '../../services/event.service';
import { SocialService } from '../../services/social.service';
import { UserService } from '../../services/user.service';
import { LoggerService } from '../../core/logging/logger.service';
import { EventMapComponent, openStreetMapUrl } from '../event-map/event-map';

/**
 * What the page is for, given who looks and when.
 *
 * guest: not taking part yet, so the details have to convince. member: taking part, before
 * the day, so the group comes first. live: the day itself. past: the event is over.
 */
export type EventPhase = 'guest' | 'member' | 'live' | 'past';

export interface Person {
  id: string;
  name: string;
  initials: string;
  picture?: string;
  isFriend: boolean;
}

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
  imports: [NgTemplateOutlet, MatIconModule, EventMapComponent],
  templateUrl: './event-details.html',
  styleUrl: './event-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventService = inject(EventService);
  private readonly socialService = inject(SocialService);
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

  private readonly names = signal<ReadonlyMap<string, { name: string; picture?: string }>>(new Map());
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
    return event ? this.names().get(event.organizerId)?.name ?? '' : '';
  });

  readonly friends = computed(() => (this.participants()?.friendsGoingIds ?? []).map(id => this.person(id)));

  /** Everyone, friends first; only filled for those who take part or organize. */
  readonly people = computed(() => {
    const all = (this.participants()?.participantIds ?? []).map(id => this.person(id));
    return [...all.filter(person => person.isFriend), ...all.filter(person => !person.isFriend)];
  });

  /** The group's timeline, newest last: who joined, in joining order. */
  readonly joins = computed(() => (this.participants()?.participantIds ?? []).map(id => this.person(id)));

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

    this.socialService.searchUsers().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: users => this.names.set(new Map(users.map(user => [user.userId, { name: user.userName, picture: user.profilePicUrl }]))),
      error: error => this.logger.error('EventDetailsComponent', 'Could not load the names', error)
    });

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

  goBack(): void {
    this.router.navigate(['/calendar']);
  }

  avatarColor(id: string): string {
    return avatarColor(id);
  }

  dayLabel(date: Date): string {
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  timeRange(event: FeedEvent): string {
    const format = (date: Date) => date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${format(event.startDate)} – ${format(event.endDate)}`;
  }

  private loadParticipants(id: string): void {
    this.eventService.getParticipants(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: participants => this.participants.set(participants),
      error: error => this.logger.error('EventDetailsComponent', 'Could not load the participants', error)
    });
  }

  private person(id: string): Person {
    const known = this.names().get(id);
    const me = this.me();
    const name = me !== null && id === me.id ? 'Toi' : known?.name ?? 'Quelqu’un';
    return {
      id,
      name,
      initials: initialsOf(name),
      picture: known?.picture,
      isFriend: (this.participants()?.friendsGoingIds ?? []).includes(id)
    };
  }
}
