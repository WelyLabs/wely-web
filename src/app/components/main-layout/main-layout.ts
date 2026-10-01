import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnInit, computed, inject, signal, viewChild } from '@angular/core';
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
import { ChatService } from '../../services/chat.service';
import { User } from '../../models/user.model';
import { NotificationService } from '../../services/notification.service';
import { Message } from '../../models/chat.model';
import { filter, map, startWith } from 'rxjs';
import { NavigationEnd } from '@angular/router';

/** How long the "copied" tick stays visible after the user tag is put on the clipboard. */
const COPY_FEEDBACK_MS = 2000;

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
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
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Public because the sidenav's open state is imperative and worth asserting on. */
  readonly sidenav = viewChild<MatSidenav>('sidenav');

  readonly navItems = [
    { label: 'Calendar', icon: 'calendar_today', route: '/calendar' },
    { label: 'Event Feed', icon: 'event_note', route: '/feed' },
    { label: 'Users', icon: 'people', route: '/users' }
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

  readonly isChatPage = toSignal(
    this.router.events.pipe(
      // The type predicate carries the information, so nothing needs casting afterwards.
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects.includes('/chat/')),
      startWith(this.router.url.includes('/chat/'))
    ),
    { initialValue: false }
  );

  readonly showUserMenu = signal(false);
  readonly showMobileMenu = signal(false);
  readonly showCopySuccess = signal(false);

  /** The tag a user shares to be added as a friend; empty until the profile has loaded. */
  readonly userTag = computed(() => {
    const profile = this.userProfile();
    return profile ? `${profile.userName}#${profile.hashtag}` : '';
  });

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

    this.userService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (err: unknown) =>
          this.logger.error('MainLayoutComponent', 'Error loading profile in layout:', err)
      });

    // The profile is already preloaded by APP_INITIALIZER; this opens the RSocket stream that
    // carries incoming messages for the whole session.
    this.chatService.initializeStream();

    this.chatService.messages$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message: Message) => {
        const isViewingThisConversation =
          this.router.url.includes(`/chat/${message.conversationId}`);

        // Only notify for someone else's message, and only when that conversation is not
        // already on screen.
        if (message.senderId !== this.userProfile()?.id && !isViewingThisConversation) {
          this.notificationService.showChatNotification(message);
        }
      });
  }

  toggleSidenav(): void {
    this.sidenav()?.toggle();
  }

  toggleMobileMenu(): void {
    this.showMobileMenu.update(open => !open);
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
