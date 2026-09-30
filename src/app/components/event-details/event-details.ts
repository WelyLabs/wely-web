import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { EventService, FeedEvent } from '../../services/event.service';

interface CalendarEvent {
  id: string | number;
  title: string;
  time: string;
  description: string;
  startDate: Date;
}

import { SharedChatComponent, ChatMessage } from '../shared/chat/shared-chat';

@Component({
  selector: 'app-event-details',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    SharedChatComponent
],
  templateUrl: './event-details.html',
  styleUrl: './event-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventService = inject(EventService);
  private readonly destroyRef = inject(DestroyRef);

  readonly event = signal<FeedEvent | CalendarEvent | null>(null);

  /**
   * Whether {@link event} came from the feed, which decides what the template may read from it.
   *
   * <p>Derived from the event itself rather than assigned alongside it: the two used to be set
   * in four places between them, and nothing kept them in step.
   */
  readonly isFeedEvent = computed(() => {
    const event = this.event();
    return event !== null && this.isFeedEventType(event);
  });

  readonly image = computed(() => this.feedEvent()?.image);
  readonly location = computed(() => this.feedEvent()?.location);
  readonly organizer = computed(() => this.feedEvent()?.organizerId);

  /** Only a calendar event carries a time string; a feed event carries its own dates. */
  readonly time = computed(() => {
    const event = this.event();
    return event !== null && !this.isFeedEventType(event) ? event.time : undefined;
  });

  ngOnInit(): void {
    // The load used to be triggered by the root-provided service's constructor: both requests
    // went out at bootstrap, including for a signed-out visitor on the landing page, where they
    // could only come back 401.
    this.eventService.refreshEvents();

    const eventId = this.route.snapshot.paramMap.get('id');
    const eventType = this.route.snapshot.paramMap.get('type');

    if (!eventId) {
      return;
    }

    if (eventType === 'feed') {
      this.eventService.feedEvents$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(events => this.event.set(events.find(event => event.id === eventId) ?? null));
      return;
    }

    if (eventType === 'calendar') {
      // A calendar event travels in the navigation state rather than being refetched.
      this.event.set(window.history.state?.event ?? null);

      // That state is lost on a reload, so fall back to the subscribed feed events, which are
      // the ones a calendar can show.
      if (!this.event()) {
        this.eventService.subscribedEvents$
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(events => {
            const feedEvent = events.find(event => event.id === eventId);
            if (feedEvent) {
              this.event.set(feedEvent);
            }
          });
      }
    }
  }

  goBack(): void {
    this.router.navigate(['/calendar']);
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /** Discriminates the two shapes the route can deliver. */
  isFeedEventType(event: FeedEvent | CalendarEvent): event is FeedEvent {
    return 'organizerId' in event;
  }

  private feedEvent(): FeedEvent | undefined {
    const event = this.event();
    return event !== null && this.isFeedEventType(event) ? event : undefined;
  }

  /**
   * Placeholder conversation.
   *
   * <p>Per-event chat is not implemented: wely-chat only models direct conversations, and
   * `ConversationType.EVENT` exists in its domain without an implementation behind it. These
   * three messages are what the tab renders in the meantime.
   */
  readonly chatMessages = signal<ChatMessage[]>([
    { senderName: 'Alice', text: 'Hey! Are you going to this event?', isMe: false, time: new Date(Date.now() - 3600000) },
    { senderName: 'Me', text: 'Yes, I just subscribed!', isMe: true, time: new Date(Date.now() - 1800000) },
    { senderName: 'Bob', text: 'Awesome, see you there!', isMe: false, time: new Date(Date.now() - 900000) }
  ]);

  onSendMessage(text: string): void {
    this.chatMessages.update(messages => [...messages, {
      senderName: 'Me',
      text,
      isMe: true,
      time: new Date()
    }]);
  }
}
