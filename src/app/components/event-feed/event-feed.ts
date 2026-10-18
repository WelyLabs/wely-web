import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { EventService, FeedEvent } from '../../services/event.service';
import { SocialService } from '../../services/social.service';
import { ExploreMapComponent } from '../explore-map/explore-map';
import { eventTint } from '../../core/ui/event-tint';
import { FriendsGoingComponent } from '../friends-going/friends-going';
import { byAffinity } from '../../models/friendship-insights.model';

/** Horizontal travel, in pixels, past which a drag counts as a swipe rather than a nudge. */
const SWIPE_THRESHOLD_PX = 100;
/** How far a finger moves before a touch counts as a swipe or a scroll. */
const AXIS_LOCK_PX = 10;

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

export type FeedView = 'swipe' | 'grid' | 'map';

/**
 * The discovery feed, three ways: cards to swipe (right subscribes, left skips), every event
 * at once in a grid, or on a map.
 */
@Component({
  selector: 'app-event-feed',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatCardModule, ExploreMapComponent, FriendsGoingComponent],
  templateUrl: './event-feed.html',
  styleUrl: './event-feed.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventFeedComponent implements OnInit {
  private readonly eventService = inject(EventService);
  private readonly socialService = inject(SocialService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** The deck: what is left to swipe. Skipping a card takes it out of here only. */
  private readonly events = signal<FeedEvent[]>([]);

  /**
   * Everything the feed holds, for the grid. Kept apart from the deck: a card skipped while
   * swiping is not refused for good, and an overview that hid it would not be one.
   */
  private readonly feed = signal<FeedEvent[]>([]);

  /** Events being joined from the grid: a second tap would toggle the subscription back off. */
  private readonly joining = signal<ReadonlySet<string>>(new Set());

  /**
   * Organiser business id to display name.
   *
   * <p>A feed event carries `organizerId` and nothing else — wely-events has no idea who its
   * users are, which is the point of keeping the services apart. The card used to print that
   * UUID verbatim under the title. The social service already answers with every user and
   * their name, so the names are resolved here once rather than one request per card.
   */
  readonly organiserNames = signal<ReadonlyMap<string, string>>(new Map());

  /** Cards to swipe, the whole feed in a grid, or every upcoming event on a map. */
  /** The map first: where things happen around you is the quickest way into them. */
  readonly view = signal<FeedView>('map');

  /** The grid's cards, where the closest friends go first, then soonest. */
  readonly gridEvents = computed(() => [...this.feed()].sort(byAffinity));

  /** The top card plus the two stacked behind it. */
  readonly currentEvents = computed(() => this.events().slice(0, VISIBLE_CARDS));

  readonly cardTransform = signal('');
  readonly cardTransition = signal(RETURN_TRANSITION);
  readonly leftOverlayOpacity = signal(0);
  readonly rightOverlayOpacity = signal(0);

  private dragStartX = 0;
  private dragStartY = 0;
  private dragCurrentX = 0;
  private isDragging = false;
  /**
   * For a touch, whether the gesture has declared itself: null until the finger has moved
   * enough, then 'horizontal' (a swipe) or 'vertical' (a scroll, which the card ignores).
   * Without it, a page scroll drifting 100px sideways subscribed the user.
   */
  private touchAxis: 'horizontal' | 'vertical' | null = null;
  /** A card is flying off: a second tap on ♥ used to subscribe, then unsubscribe, and drop two cards. */
  private throwing = false;
  private animationFrameId?: number;

  ngOnInit(): void {
    // The load used to be triggered by the root-provided service's constructor: both requests
    // went out at bootstrap, including for a signed-out visitor on the landing page, where they
    // could only come back 401.
    this.eventService.refreshEvents();

    this.eventService.feedEvents$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(events => {
        this.events.set(events);
        this.feed.set(events);
      });

    this.socialService.searchUsers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(users =>
        this.organiserNames.set(new Map(users.map(user => [user.userId, user.userName]))),
      );
  }

  showView(view: FeedView): void {
    this.view.set(view);
  }

  isJoining(event: FeedEvent): boolean {
    return this.joining().has(event.id);
  }

  /** Joins an event from the grid. The card leaves at once; it comes back if the request fails. */
  join(event: FeedEvent): void {
    if (this.isJoining(event)) {
      return;
    }
    this.setJoining(event.id, true);

    this.eventService.toggleSubscription(event)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.feed.update(events => events.filter(other => other.id !== event.id));
          this.events.update(events => events.filter(other => other.id !== event.id));
          this.setJoining(event.id, false);
        },
        error: () => this.setJoining(event.id, false),
      });
  }

  private setJoining(eventId: string, joining: boolean): void {
    this.joining.update(ids => {
      const next = new Set(ids);
      if (joining) {
        next.add(eventId);
      } else {
        next.delete(eventId);
      }
      return next;
    });
  }

  /** The organiser's name, or nothing while the names are still on their way. */
  organiserName(organizerId: string): string {
    return this.organiserNames().get(organizerId) ?? '';
  }

  /** The cover, or the event's own gradient when it has none. */
  cardBackground(event: FeedEvent): string {
    return event.image ? `url("${event.image}")` : eventTint(event.id);
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
    this.dragStartY = event.touches[0].clientY;
    this.touchAxis = null;
    this.startDrag(event.touches[0].clientX);
  }

  onCardTouchMove(event: TouchEvent): void {
    const touch = event.touches[0];
    if (this.isDragging && this.touchAxis === null) {
      const dx = Math.abs(touch.clientX - this.dragStartX);
      const dy = Math.abs(touch.clientY - this.dragStartY);
      if (Math.max(dx, dy) < AXIS_LOCK_PX) {
        return;
      }
      this.touchAxis = dx > dy ? 'horizontal' : 'vertical';
      if (this.touchAxis === 'vertical') {
        this.abandonDrag();
        return;
      }
    }
    this.moveDrag(touch.clientX);
  }

  onCardTouchEnd(_event: TouchEvent): void {
    this.endDrag();
  }

  /** An interrupted touch puts the card back, rather than leaving it tilted mid-drag. */
  onCardTouchCancel(_event: TouchEvent): void {
    this.abandonDrag();
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

  private abandonDrag(): void {
    this.cancelPendingFrame();
    this.isDragging = false;
    this.cardTransition.set(RETURN_TRANSITION);
    this.resetCard();
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
    if (!currentEvent || this.throwing) {
      return;
    }
    this.throwing = true;

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
    if (!this.currentEvents()[0] || this.throwing) {
      return;
    }
    this.throwing = true;
    this.cardTransform.set(`translateX(-${THROW_DISTANCE_PX}px) rotate(-${THROW_ROTATION_DEG}deg)`);
    this.leftOverlayOpacity.set(1);

    setTimeout(() => this.removeCurrentCard(), THROW_DURATION_MS);
  }

  private removeCurrentCard(): void {
    // slice, not shift: the array came from the service's own stream, and shifting it emptied
    // the service's copy as the user swiped.
    this.events.update(events => events.slice(1));
    this.throwing = false;
    this.resetCard();
  }

  private resetCard(): void {
    this.cardTransform.set('');
    this.leftOverlayOpacity.set(0);
    this.rightOverlayOpacity.set(0);
  }

  viewEventDetails(event: FeedEvent): void {
    this.router.navigate(['/event', event.id]);
  }
}
