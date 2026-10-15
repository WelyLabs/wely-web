export type NotificationType =
  | 'CALL_INCOMING'
  | 'CALL_MISSED'
  | 'MESSAGE'
  | 'EVENT_DATE_FIXED'
  | 'EVENT_MOVED'
  | 'FRIEND_REQUEST'
  | 'FRIEND_ACCEPTED';

export type NotificationCategory = 'CALLS' | 'MESSAGES' | 'EVENTS' | 'FRIENDS';

/** A notification as wely-notifications sends it; a grouped one is updated in place (same id). */
export interface AppNotification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  /** An app route, such as /chat/abc. */
  link: string;
  groupKey: string | null;
  count: number;
  actorId: string | null;
  createdAt: string;
  readAt: string | null;
}

/** Which categories may send a push to the user's devices. */
export interface NotificationPreferences {
  calls: boolean;
  messages: boolean;
  events: boolean;
  friends: boolean;
}

const ICONS: Record<NotificationType, string> = {
  CALL_INCOMING: 'call',
  CALL_MISSED: 'call_missed',
  MESSAGE: 'chat',
  EVENT_DATE_FIXED: 'event',
  EVENT_MOVED: 'event',
  FRIEND_REQUEST: 'person_add',
  FRIEND_ACCEPTED: 'how_to_reg'
};

/** The Material icon for a notification. */
export function notificationIcon(type: NotificationType): string {
  return ICONS[type] ?? 'notifications';
}

/** The path of an app URL, without query or fragment. */
function pathOf(url: string): string {
  return url.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
}

/** True when the screen at `url` is the one the link opens: no toast for what is on screen. */
export function isSameScreen(url: string, link: string): boolean {
  return pathOf(url) === pathOf(link);
}

/** The unread badge text: nothing at zero, capped at 99+. */
export function badgeText(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  return count > 99 ? '99+' : String(count);
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const DAY_MS = 86_400_000;

/** « Aujourd'hui », « Hier », or the date, with the year only when it is not this one. */
export function dayLabel(date: Date, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (days === 0) {
    return 'Aujourd\'hui';
  }
  if (days === 1) {
    return 'Hier';
  }
  const label = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** « À l'instant », « il y a 5 min », « il y a 3 h » the same day, else the time. */
export function relativeTime(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) {
    return 'À l\'instant';
  }
  if (minutes < 60) {
    return `il y a ${minutes} min`;
  }
  if (startOfDay(date) === startOfDay(now)) {
    return `il y a ${Math.floor(minutes / 60)} h`;
  }
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export interface NotificationDay {
  label: string;
  items: AppNotification[];
}

/** Groups a newest-first list by day, keeping the order. */
export function groupByDay(items: readonly AppNotification[], now: Date): NotificationDay[] {
  const days: NotificationDay[] = [];
  for (const item of items) {
    const label = dayLabel(new Date(item.createdAt), now);
    const last = days.at(-1);
    if (last?.label === label) {
      last.items.push(item);
    } else {
      days.push({ label, items: [item] });
    }
  }
  return days;
}
