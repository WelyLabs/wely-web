import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { LoggerService } from '../../core/logging/logger.service';

import { Router, RouterModule } from '@angular/router';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { BreakpointObserver } from '@angular/cdk/layout';
import { KeycloakService } from 'keycloak-angular';
import { UserService } from '../../services/user.service';
import { CallService } from '../../services/call.service';
import { CallOverlayComponent } from '../call/call-overlay/call-overlay';
import { ClosenessCelebrationComponent } from '../closeness-celebration/closeness-celebration';
import { SignupCompletionComponent, needsSignupCompletion } from '../signup-completion/signup-completion';
import { ChatService } from '../../services/chat.service';
import { User } from '../../models/user.model';
import { NotificationService } from '../../services/notification.service';
import { NotificationCenterService } from '../../services/notification-center.service';
import { PushService } from '../../services/push.service';
import { badgeText, isSameScreen } from '../../models/notification.model';
import { filter, map, startWith } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { AvatarService } from '../../services/avatar.service';

/** How long the "copied" tick stays visible after the user tag is put on the clipboard. */
const COPY_FEEDBACK_MS = 2000;
/** How far a list must scroll one way before the bottom bar hides or comes back. */
const NAV_SCROLL_THRESHOLD_PX = 24;
/**
 * How long scrolls are ignored after the bar moves. Hiding it makes the page taller, which pulls
 * a list scrolled to its end back up: read as a scroll up, that brought the bar straight back.
 */
const NAV_SETTLE_MS = 350;

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CallOverlayComponent,
    ClosenessCelebrationComponent,
    SignupCompletionComponent,
    RouterModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatToolbarModule
],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MainLayoutComponent implements OnInit {
  private readonly logger = inject(LoggerService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly keycloak = inject(KeycloakService);
  private readonly userService = inject(UserService);
  private readonly chatService = inject(ChatService);
  private readonly callService = inject(CallService);
  private readonly notificationService = inject(NotificationService);
  private readonly notificationCenter = inject(NotificationCenterService);
  private readonly push = inject(PushService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Public because the sidenav's open state is imperative and worth asserting on. */
  readonly sidenav = viewChild<MatSidenav>('sidenav');

  readonly navItems = [
    { label: 'Calendrier', icon: 'calendar_today', route: '/calendar' },
    { label: 'Découvrir', icon: 'event_note', route: '/feed' },
    // Friends and Messages are primary features: here rather than in the profile menu, hidden behind a hover.
    { label: 'Amis', icon: 'people', route: '/friends' },
    { label: 'Messages', icon: 'chat_bubble_outline', route: '/conversations' }
  ];

  /**
   * Viewport and route state, read from their sources rather than mirrored into fields.
   *
   * <p>Three of these used to be booleans kept in step by hand from subscriptions that were
   * never closed — the breakpoint observer and the user stream both outlive this component, so
   * every navigation through the layout left a live subscriber behind.
   */
  readonly isMobile = toSignal(
    this.breakpointObserver.observe(['(max-width: 1023px)']).pipe(map(result => result.matches)),
    { initialValue: false }
  );

  readonly userProfile = toSignal<User | null, null>(this.userService.currentUser$, { initialValue: null });
  /** The blocking « Finalise ton inscription » card, until wely-users records the signup as complete. */
  readonly signupPending = computed(() => needsSignupCompletion(this.userProfile()));
  private readonly avatars = inject(AvatarService);
  /** The signed-in user's picture URL, through AvatarService: pictures are private. */
  readonly myPicture = computed(() => this.avatars.url(this.userProfile()?.id)());

  readonly isChatPage = toSignal(
    this.router.events.pipe(
      // The type predicate carries the information, so nothing needs casting afterwards.
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects.includes('/chat/')),
      startWith(this.router.url.includes('/chat/'))
    ),
    { initialValue: false }
  );

  /** The bottom bar, out of the way while the user scrolls down a list; back on any scroll up. */
  readonly navHidden = signal(false);
  /** Its height, safe area included, measured: what hiding it gives back. */
  readonly navHeight = signal(0);
  private readonly bottomNav = viewChild<ElementRef<HTMLElement>>('bottomNav');
  /** Where each scrolled element was when the bar last decided, so small moves add up. */
  private readonly scrollAnchors = new WeakMap<Element, number>();
  private navSettlesAt = 0;

  /** The bell's badge: unread notifications, capped at 99+. */
  readonly unreadBadge = computed(() => badgeText(this.notificationCenter.unreadCount()));

  readonly showUserMenu = signal(false);
  readonly showMobileMenu = signal(false);
  readonly showCopySuccess = signal(false);

  /** The tag a user shares to be added as a friend; empty until the profile has loaded. */
  readonly userTag = computed(() => {
    const profile = this.userProfile();
    return profile ? `${profile.userName}#${profile.hashtag}` : '';
  });

  constructor() {
    // The bar's height, for the margin that slides it away.
    effect(onCleanup => {
      const nav = this.bottomNav()?.nativeElement;
      if (!nav || typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(() => this.navHeight.set(nav.offsetHeight));
      observer.observe(nav);
      onCleanup(() => observer.disconnect());
    });
    // What the bar takes from the bottom of the screen, for what floats above it (the new-event
    // button). Zero when it is hidden or not shown at all.
    effect(() => {
      const space = this.bottomNav() && !this.navHidden() ? this.navHeight() : 0;
      document.documentElement.style.setProperty('--bottom-nav-space', `${space}px`);
    });

    // Scroll events do not bubble; caught on the way down, they come from every list of the app.
    const onScroll = (event: Event) => this.onAnyScroll(event);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      document.documentElement.style.removeProperty('--bottom-nav-space');
    });
  }

  /** Hides the bottom bar on a scroll down, shows it on a scroll up or back at the top. */
  onAnyScroll(event: Event): void {
    if (!this.isMobile() || this.showMobileMenu()) {
      return;
    }
    const target = event.target instanceof Element ? event.target : document.scrollingElement;
    if (!target) {
      return;
    }
    const top = target.scrollTop;
    const anchor = this.scrollAnchors.get(target);
    if (anchor === undefined || Date.now() < this.navSettlesAt) {
      this.scrollAnchors.set(target, top);
      return;
    }
    const hidden = top <= 0 ? false : Math.abs(top - anchor) < NAV_SCROLL_THRESHOLD_PX ? null : top > anchor;
    if (hidden === null) {
      return;
    }
    this.scrollAnchors.set(target, top);
    this.setNavHidden(hidden);
  }

  private setNavHidden(hidden: boolean): void {
    if (hidden !== this.navHidden()) {
      this.navHidden.set(hidden);
      this.navSettlesAt = Date.now() + NAV_SETTLE_MS;
    }
  }

  ngOnInit(): void {
    // The sidenav is driven imperatively because MatSidenav owns its own open state: opening on
    // the way to desktop and closing on the way to mobile is an action, not a binding.
    this.breakpointObserver.observe(['(max-width: 1023px)'])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        const sidenav = this.sidenav();
        if (!sidenav) {
          return;
        }
        if (result.matches) {
          sidenav.close();
        } else {
          sidenav.open();
        }
      });

    // A new page starts with the bar in view.
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.setNavHidden(false));

    this.userService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (err: unknown) =>
          this.logger.error('MainLayoutComponent', 'Error loading profile in layout:', err)
      });

    // The profile is already preloaded by APP_INITIALIZER; this opens the RSocket stream that
    // carries incoming messages for the whole session.
    this.chatService.initializeStream();
    // Calls ring on any page.
    this.callService.listen();

    // The notification center's live stream, and the service worker for pushes once enabled.
    this.notificationCenter.start();
    this.push.init();

    this.notificationCenter.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(notification => {
        // An incoming call already rings through the call overlay.
        if (notification.type === 'CALL_INCOMING') {
          return;
        }
        // Already on that screen (the conversation is open): seen, no toast.
        if (isSameScreen(this.router.url, notification.link)) {
          this.notificationCenter.markRead([notification.id]);
          return;
        }
        this.notificationService.showNotification(notification);
      });
  }

  toggleSidenav(): void {
    this.sidenav()?.toggle();
  }

  toggleMobileMenu(): void {
    this.showMobileMenu.update(open => !open);
    this.setNavHidden(false);
  }

  /** Escape closes the mobile menu; its backdrop cannot take focus. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showMobileMenu()) {
      this.closeMobileMenu();
    }
  }

  /**
   * Closes the menu only when the backdrop itself was clicked.
   *
   * <p>The panel used to carry `(click)="$event.stopPropagation()"` so that clicking inside it
   * did not reach the backdrop. That made a plain div look like a control to every accessibility
   * checker, for a handler that did nothing but swallow an event. Comparing target to
   * currentTarget answers the same question without a second listener.
   */
  dismissIfBackdrop(event: Event): void {
    if (event.target === event.currentTarget) {
      this.closeMobileMenu();
    }
  }

  closeMobileMenu(): void {
    this.showMobileMenu.set(false);
  }

  /**
   * Signs the user out.
   *
   * <p>Returns void rather than the promise: the template calls this from (click), where
   * Angular drops whatever is returned. An async method there leaves a floating promise, so a
   * Keycloak outage during logout surfaced as an unhandled rejection in the console and nowhere
   * else. The failure is now logged, and the method says it does not expect to be awaited.
   */
  logout(): void {
    this.keycloak
      .logout(window.location.origin)
      .catch((error: unknown) =>
        this.logger.error('MainLayoutComponent', 'Logout failed:', error),
      );
  }

  copyUserTag(): void {
    const tag = this.userTag();
    if (!tag) {
      return;
    }

    navigator.clipboard.writeText(tag).then(() => {
      this.showCopySuccess.set(true);
      setTimeout(() => this.showCopySuccess.set(false), COPY_FEEDBACK_MS);
    });
  }
}
