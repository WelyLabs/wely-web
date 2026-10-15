import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import {
  AppNotification, NotificationDay, groupByDay, notificationIcon, relativeTime
} from '../../models/notification.model';
import { NotificationCenterService } from '../../services/notification-center.service';

/** Relative times move on by themselves, once a minute. */
const CLOCK_TICK_MS = 60_000;

/** Every notification, newest first and grouped by day. */
@Component({
  selector: 'app-notifications',
  imports: [MatIconModule],
  templateUrl: './notifications.html',
  styleUrl: './notifications.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationsPageComponent implements OnInit {
  private readonly center = inject(NotificationCenterService);
  private readonly router = inject(Router);

  private readonly now = signal(new Date());

  readonly hasMore = this.center.hasMore;
  readonly loading = this.center.loading;
  readonly hasUnread = computed(() => this.center.unreadCount() > 0);
  readonly days = computed<NotificationDay[]>(() => groupByDay(this.center.notifications(), this.now()));

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), CLOCK_TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  ngOnInit(): void {
    this.center.refresh();
  }

  iconOf(notification: AppNotification): string {
    return notificationIcon(notification.type);
  }

  timeOf(notification: AppNotification): string {
    return relativeTime(new Date(notification.createdAt), this.now());
  }

  open(notification: AppNotification): void {
    if (!notification.readAt) {
      this.center.markRead([notification.id]);
    }
    void this.router.navigateByUrl(notification.link);
  }

  markAllRead(): void {
    this.center.markAllRead();
  }

  loadMore(): void {
    this.center.loadMore();
  }
}
