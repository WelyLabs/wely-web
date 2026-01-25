import { Component, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { KeycloakService } from 'keycloak-angular';
import { UserService } from '../../services/user.service';
import { ChatService } from '../../services/chat.service';
import { User } from '../../models/user.model';
import { NotificationService } from '../../services/notification.service';
import { Message } from '../../models/chat.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatToolbarModule
  ],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss'
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  @ViewChild('sidenav') sidenav!: MatSidenav;

  navItems = [
    { label: 'Calendar', icon: 'calendar_today', route: '/calendar' },
    { label: 'Event Feed', icon: 'event_note', route: '/feed' },
    { label: 'Users', icon: 'people', route: '/users' }
  ];

  isMobile = false;
  isOpened = true;
  userProfile: User | null = null;
  showUserMenu = false;
  showMobileMenu = false;
  showCopySuccess = false;
  private chatSubscription?: Subscription;

  constructor(
    private breakpointObserver: BreakpointObserver,
    private keycloak: KeycloakService,
    private userService: UserService,
    private chatService: ChatService,
    private notificationService: NotificationService,
    private router: Router
  ) { }

  ngOnInit() {
    this.breakpointObserver.observe([Breakpoints.Handset, Breakpoints.Tablet])
      .subscribe(result => {
        this.isMobile = result.matches;
        // Automatically open sidebar when switching to desktop, close when switching to mobile
        if (this.sidenav) {
          if (this.isMobile) {
            this.sidenav.close();
          } else {
            this.sidenav.open();
          }
        }
      });

    // Subscribe to the reactive user stream - updates automatically when user data changes
    this.userService.currentUser$.subscribe({
      next: (user) => {
        this.userProfile = user;
      },
      error: (err: any) => console.error('Error loading profile in layout:', err)
    });

    // User data is already preloaded by APP_INITIALIZER
    // Initialize RSocket stream for real-time messages
    this.chatService.initializeStream();

    // Subscribe to incoming messages for global notifications
    this.chatSubscription = this.chatService.messages$.subscribe((msg: Message) => {
      // Check if we are currently in the conversation with the sender
      const isViewingCurrentConversation = this.router.url.includes(`/chat/${msg.senderId}`);

      // Only show notification if message is from someone else AND we're not already in that chat
      if (msg.senderId !== this.userProfile?.id && !isViewingCurrentConversation) {
        this.notificationService.showChatNotification(msg);
      }
    });
  }

  toggleSidenav() {
    this.sidenav.toggle();
  }

  toggleMobileMenu() {
    this.showMobileMenu = !this.showMobileMenu;
  }

  closeMobileMenu() {
    this.showMobileMenu = false;
  }

  async logout() {
    await this.keycloak.logout(window.location.origin);
  }

  copyUserTag() {
    if (!this.userProfile) return;
    const tag = `${this.userProfile.userName}#${this.userProfile.hashtag}`;
    navigator.clipboard.writeText(tag).then(() => {
      this.showCopySuccess = true;
      setTimeout(() => this.showCopySuccess = false, 2000);
    });
  }

  ngOnDestroy() {
    this.chatSubscription?.unsubscribe();
  }
}
