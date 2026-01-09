import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { Event, FeedEvent } from '../../services/event.service';
import { Subscription } from 'rxjs';

interface CalendarEvent {
  id: number;
  title: string;
  time: string;
  description: string;
  date: Date;
}

import { SharedChatComponent, ChatMessage } from '../shared/chat/shared-chat';

@Component({
  selector: 'app-event-details',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    SharedChatComponent
  ],
  templateUrl: './event-details.html',
  styleUrl: './event-details.scss',
})
export class EventDetailsComponent implements OnInit, OnDestroy {
  event: FeedEvent | CalendarEvent | null = null;
  isFeedEvent = false;
  private subscription?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private eventService: Event
  ) { }

  ngOnInit() {
    const eventId = this.route.snapshot.paramMap.get('id');
    const eventType = this.route.snapshot.paramMap.get('type');

    if (eventId && eventType === 'feed') {
      this.subscription = this.eventService.events$.subscribe(events => {
        this.event = events.find(e => e.id === parseInt(eventId)) || null;
        this.isFeedEvent = true;
      });
    } else if (eventId && eventType === 'calendar') {
      // For calendar events, get data from history state
      const state = window.history.state;
      this.event = state?.event || null;
      this.isFeedEvent = false;
    }
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  goBack() {
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

  // Type guard to check if event is FeedEvent
  isFeedEventType(event: FeedEvent | CalendarEvent): event is FeedEvent {
    return 'organizer' in event;
  }

  // Helper methods to safely access FeedEvent properties
  getImage(): string | undefined {
    return this.isFeedEvent && this.event ? (this.event as FeedEvent).image : undefined;
  }

  getLocation(): string | undefined {
    return this.isFeedEvent && this.event ? (this.event as FeedEvent).location : undefined;
  }

  getOrganizer(): string | undefined {
    return this.isFeedEvent && this.event ? (this.event as FeedEvent).organizer : undefined;
  }

  getTime(): string | undefined {
    return !this.isFeedEvent && this.event ? (this.event as CalendarEvent).time : undefined;
  }

  // Chat Logic
  chatMessages: ChatMessage[] = [
    { senderName: 'Alice', text: 'Hey! Are you going to this event?', isMe: false, time: new Date(Date.now() - 3600000) },
    { senderName: 'Me', text: 'Yes, I just subscribed!', isMe: true, time: new Date(Date.now() - 1800000) },
    { senderName: 'Bob', text: 'Awesome, see you there!', isMe: false, time: new Date(Date.now() - 900000) }
  ];

  onSendMessage(text: string) {
    this.chatMessages.push({
      senderName: 'Me',
      text: text,
      isMe: true,
      time: new Date()
    });
  }
}
