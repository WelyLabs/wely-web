import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { vi } from 'vitest';
import { AppNotification, NotificationPreferences } from '../app/models/notification.model';

/** A notification, newest by default; override what the test reads. */
export function aNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    type: 'MESSAGE',
    category: 'MESSAGES',
    title: 'Alice',
    body: 'Salut !',
    link: '/chat/conv1',
    groupKey: 'conv1',
    count: 1,
    actorId: 'alice',
    createdAt: new Date().toISOString(),
    readAt: null,
    ...overrides
  };
}

/** A NotificationCenterService with nothing loaded, its signals writable from the test. */
export function notificationCenterStub() {
  return {
    notifications: signal<AppNotification[]>([]),
    unreadCount: signal(0),
    hasMore: signal(false),
    loading: signal(false),
    events$: new Subject<AppNotification>(),
    start: vi.fn(),
    stop: vi.fn(),
    refresh: vi.fn(),
    loadMore: vi.fn(),
    markRead: vi.fn(),
    markGroupRead: vi.fn(),
    markAllRead: vi.fn(),
    getPreferences: vi.fn(() => of<NotificationPreferences>({ calls: true, messages: true, events: true, friends: true })),
    savePreferences: vi.fn(() => of(undefined))
  };
}
