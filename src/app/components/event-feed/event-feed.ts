import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { EventService, FeedEvent } from '../../services/event.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-event-feed',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatCardModule],
  templateUrl: './event-feed.html',
  styleUrl: './event-feed.scss',
})
export class EventFeedComponent implements OnInit, OnDestroy {
  events: FeedEvent[] = [];
  currentEvents: FeedEvent[] = [];
  private subscription?: Subscription;

  // Swipe tracking
  private touchStartX = 0;
  private touchCurrentX = 0;
  private isDragging = false;
  private animationFrameId?: number;
  cardTransform = '';
  cardTransition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
  leftOverlayOpacity = 0;
  rightOverlayOpacity = 0;

  constructor(private eventService: EventService, private router: Router) { }

  ngOnInit() {
    this.subscription = this.eventService.events$.subscribe(events => {
      this.events = events.filter(e => !e.subscribed); // Only show unsubscribed events
      this.updateCurrentEvents();
    });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  private updateCurrentEvents() {
    // Show max 3 cards at a time
    this.currentEvents = this.events.slice(0, 3);
  }

  getStackTransform(index: number): string {
    // Create stacked effect for cards behind the top one
    const scale = 1 - (index * 0.05);
    const translateY = index * 10;
    return `scale(${scale}) translateY(${translateY}px)`;
  }

  onCardTouchStart(event: TouchEvent) {
    this.touchStartX = event.touches[0].clientX;
    this.touchCurrentX = this.touchStartX;
    this.isDragging = true;
    // Disable transition during drag for smooth movement
    this.cardTransition = 'none';
    // Cancel any pending animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  onCardTouchMove(event: TouchEvent) {
    if (!this.isDragging) return;

    this.touchCurrentX = event.touches[0].clientX;
    const deltaX = this.touchCurrentX - this.touchStartX;

    // Use requestAnimationFrame for smooth updates
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.animationFrameId = requestAnimationFrame(() => {
      const rotation = deltaX / 20;
      this.cardTransform = `translateX(${deltaX}px) rotate(${rotation}deg)`;

      if (deltaX > 0) {
        this.rightOverlayOpacity = Math.min(Math.abs(deltaX) / 100, 1);
        this.leftOverlayOpacity = 0;
      } else {
        this.leftOverlayOpacity = Math.min(Math.abs(deltaX) / 100, 1);
        this.rightOverlayOpacity = 0;
      }
    });
  }

  onCardTouchEnd(event: TouchEvent) {
    if (!this.isDragging) return;

    // Cancel any pending animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }

    const deltaX = this.touchCurrentX - this.touchStartX;
    const threshold = 100;

    // Re-enable transition for smooth return or swipe animation
    this.cardTransition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';

    if (deltaX > threshold) {
      // Swipe right - add to calendar
      this.animateSwipeRight();
    } else if (deltaX < -threshold) {
      // Swipe left - skip
      this.animateSwipeLeft();
    } else {
      // Return to center
      this.resetCard();
    }

    this.isDragging = false;
  }

  // Mouse event handlers for PC
  onCardMouseDown(event: MouseEvent) {
    event.preventDefault();
    this.touchStartX = event.clientX;
    this.touchCurrentX = this.touchStartX;
    this.isDragging = true;
    // Disable transition during drag
    this.cardTransition = 'none';
    // Cancel any pending animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  onCardMouseMove(event: MouseEvent) {
    if (!this.isDragging) return;

    this.touchCurrentX = event.clientX;
    const deltaX = this.touchCurrentX - this.touchStartX;

    // Use requestAnimationFrame for smooth updates
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.animationFrameId = requestAnimationFrame(() => {
      const rotation = deltaX / 20;
      this.cardTransform = `translateX(${deltaX}px) rotate(${rotation}deg)`;

      if (deltaX > 0) {
        this.rightOverlayOpacity = Math.min(Math.abs(deltaX) / 100, 1);
        this.leftOverlayOpacity = 0;
      } else {
        this.leftOverlayOpacity = Math.min(Math.abs(deltaX) / 100, 1);
        this.rightOverlayOpacity = 0;
      }
    });
  }

  onCardMouseUp(event: MouseEvent) {
    if (!this.isDragging) return;

    // Cancel any pending animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }

    const deltaX = this.touchCurrentX - this.touchStartX;
    const threshold = 100;

    // Re-enable transition
    this.cardTransition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';

    if (deltaX > threshold) {
      this.animateSwipeRight();
    } else if (deltaX < -threshold) {
      this.animateSwipeLeft();
    } else {
      this.resetCard();
    }

    this.isDragging = false;
  }

  swipeRight() {
    this.animateSwipeRight();
  }

  swipeLeft() {
    this.animateSwipeLeft();
  }

  private animateSwipeRight() {
    const currentEvent = this.currentEvents[0];
    this.cardTransform = 'translateX(1000px) rotate(30deg)';
    this.rightOverlayOpacity = 1;

    setTimeout(() => {
      // Add to calendar via API
      this.eventService.toggleSubscription(currentEvent).subscribe();
      this.removeCurrentCard();
    }, 300);
  }

  private animateSwipeLeft() {
    this.cardTransform = 'translateX(-1000px) rotate(-30deg)';
    this.leftOverlayOpacity = 1;

    setTimeout(() => {
      this.removeCurrentCard();
    }, 300);
  }

  private removeCurrentCard() {
    this.events.shift(); // Remove first event
    this.updateCurrentEvents();
    this.resetCard();
  }

  private resetCard() {
    this.cardTransform = '';
    this.leftOverlayOpacity = 0;
    this.rightOverlayOpacity = 0;
  }

  viewEventDetails(event: FeedEvent) {
    this.router.navigate(['/event', 'feed', event.id]);
  }
}
