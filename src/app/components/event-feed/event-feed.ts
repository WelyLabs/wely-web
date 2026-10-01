import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { EventService, FeedEvent } from '../../services/event.service';
import { SocialService } from '../../services/social.service';

/** Horizontal travel, in pixels, past which a drag counts as a swipe rather than a nudge. */
const SWIPE_THRESHOLD_PX = 100;

/** How far a card is thrown off-screen, and how long the throw animation lasts. */
const THROW_DISTANCE_PX = 1000;
const THROW_ROTATION_DEG = 30;
const THROW_DURATION_MS = 300;

/** Drag distance over which the accept/skip overlay reaches full opacity. */
const OVERLAY_FADE_PX = 100;

/** How much a drag tilts the card: pixels of travel per degree of rotation. */
const PIXELS_PER_DEGREE = 20;

/** Cards rendered at once, the top one plus the two peeking behind it. */
const VISIBLE_CARDS = 3;

const RETURN_TRANSITION = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Swipeable event feed: right subscribes to an event, left skips it.
 */
@Component({
  selector: 'app-event-feed',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatCardModule],
  templateUrl: './event-feed.html',
  styleUrl: './event-feed.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventFeedComponent implements OnInit {
  private readonly eventService = inject(EventService);
  private readonly socialService = inject(SocialService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly events = signal<FeedEvent[]>([]);

  /**
   * Organiser business id to display name.
   *
   * <p>A feed event carries `organizerId` and nothing else — wely-events has no idea who its
   * users are, which is the point of keeping the services apart. The card used to print that
   * UUID verbatim under the title. The social service already answers with every user and
   * their name, so the names are resolved here once rather than one request per card.
   */
  private readonly organiserNames = signal<Map<string, string>>(new Map());

  /** The top card plus the two stacked behind it. */
  readonly currentEvents = computed(() => this.events().slice(0, VISIBLE_CARDS));

  readonly cardTransform = signal('');
  readonly cardTransition = signal(RETURN_TRANSITION);
  readonly leftOverlayOpacity = signal(0);
  readonly rightOverlayOpacity = signal(0);

  private dragStartX = 0;
  private dragCurrentX = 0;
  private isDragging = false;
  private animationFrameId?: number;

  ngOnInit(): void {
    // The load used to be triggered by the root-provided service's constructor: both requests
    // went out at bootstrap, including for a signed-out visitor on the landing page, where they
    // could only come back 401.
    this.eventService.refreshEvents();

    this.eventService.feedEvents$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(events => this.events.set(events));

    this.socialService.searchUsers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(users =>
        this.organiserNames.set(new Map(users.map(user => [user.userId, user.userName]))),
      );
  }

  /** The organiser's name, or nothing while the names are still on their way. */
  organiserName(organizerId: string): string {
    return this.organiserNames().get(organizerId) ?? '';
  }

  /** Stacked effect for the cards behind the top one. */
  getStackTransform(index: number): string {
    const scale = 1 - (index * 0.05);
    const translateY = index * 10;
    return `scale(${scale}) translateY(${translateY}px)`;
  }

  // Touch and mouse both describe the same gesture, so both delegate to the same three steps.
  // They used to be two near-identical copies of forty lines, which is two places for a fix to
  // land in and one of them to be missed.

  onCardTouchStart(event: TouchEvent): void {
    this.startDrag(event.touches[0].clientX);
  }

  onCardTouchMove(event: TouchEvent): void {
    this.moveDrag(event.touches[0].clientX);
  }

  onCardTouchEnd(_event: TouchEvent): void {
    this.endDrag();
  }

  onCardMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.startDrag(event.clientX);
  }

  onCardMouseMove(event: MouseEvent): void {
    this.moveDrag(event.clientX);
  }

  onCardMouseUp(_event: MouseEvent): void {
    this.endDrag();
  }

  private startDrag(clientX: number): void {
    this.dragStartX = clientX;
    this.dragCurrentX = clientX;
    this.isDragging = true;
    // No transition while the finger is down: the card must follow it exactly.
    this.cardTransition.set('none');
    this.cancelPendingFrame();
  }

  private moveDrag(clientX: number): void {
    if (!this.isDragging) {
      return;
    }

    this.dragCurrentX = clientX;
    this.cancelPendingFrame();

    // One update per frame: a move event can fire several times between two paints, and the
    // intermediate positions are never seen.
    this.animationFrameId = requestAnimationFrame(() => {
      const deltaX = this.dragCurrentX - this.dragStartX;
      const rotation = deltaX / PIXELS_PER_DEGREE;
      this.cardTransform.set(`translateX(${deltaX}px) rotate(${rotation}deg)`);

      const opacity = Math.min(Math.abs(deltaX) / OVERLAY_FADE_PX, 1);
      this.rightOverlayOpacity.set(deltaX > 0 ? opacity : 0);
      this.leftOverlayOpacity.set(deltaX > 0 ? 0 : opacity);
    });
  }

  private endDrag(): void {
    if (!this.isDragging) {
      return;
    }

    this.cancelPendingFrame();
    this.isDragging = false;

    const deltaX = this.dragCurrentX - this.dragStartX;
    this.cardTransition.set(RETURN_TRANSITION);

    if (deltaX > SWIPE_THRESHOLD_PX) {
      this.animateSwipeRight();
    } else if (deltaX < -SWIPE_THRESHOLD_PX) {
      this.animateSwipeLeft();
    } else {
      this.resetCard();
    }
  }

  private cancelPendingFrame(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
  }

  swipeRight(): void {
    this.animateSwipeRight();
  }

  swipeLeft(): void {
    this.animateSwipeLeft();
  }

  private animateSwipeRight(): void {
    const currentEvent = this.currentEvents()[0];
    if (!currentEvent) {
      return;
    }

    this.cardTransform.set(`translateX(${THROW_DISTANCE_PX}px) rotate(${THROW_ROTATION_DEG}deg)`);
    this.rightOverlayOpacity.set(1);

    // The subscription is sent when the card has left the screen, so a slow response does not
    // stall the animation the user is watching.
    setTimeout(() => {
      this.eventService.toggleSubscription(currentEvent)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe();
      this.removeCurrentCard();
    }, THROW_DURATION_MS);
  }

  private animateSwipeLeft(): void {
    this.cardTransform.set(`translateX(-${THROW_DISTANCE_PX}px) rotate(-${THROW_ROTATION_DEG}deg)`);
    this.leftOverlayOpacity.set(1);

    setTimeout(() => this.removeCurrentCard(), THROW_DURATION_MS);
  }

  private removeCurrentCard(): void {
    // slice, not shift: the array came from the service's own stream, and shifting it emptied
    // the service's copy as the user swiped.
    this.events.update(events => events.slice(1));
    this.resetCard();
  }

  private resetCard(): void {
    this.cardTransform.set('');
    this.leftOverlayOpacity.set(0);
    this.rightOverlayOpacity.set(0);
  }

  viewEventDetails(event: FeedEvent): void {
    this.router.navigate(['/event', 'feed', event.id]);
  }
}
