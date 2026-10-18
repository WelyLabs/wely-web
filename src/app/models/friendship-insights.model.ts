import { Closeness } from './friendship.model';
import { isBirthdayToday, toLocalDateValue } from './birthday.model';

/** A close friend not seen for a while, as wely-events suggests it (`GET /me/reunions`). */
export interface ReunionCandidate {
  friendId: string;
  name: string;
  closeness: Closeness;
  /** ISO instant of the last outing together; null when they never shared one on Wely. */
  lastSharedAt: string | null;
  lastSharedEventId: string | null;
  lastSharedTitle: string | null;
  monthsApart: number | null;
}

/** One outing of a friendship's memories. */
export interface MemoryEvent {
  eventId: string;
  title: string;
  /** ISO instant. */
  startDate: string;
  /** A signed URL, or null when the event has no cover. */
  imageUrl: string | null;
}

/** What two friends shared on Wely (`GET /me/friendships/{id}/memories`). */
export interface FriendshipMemories {
  friendId: string;
  name: string;
  closeness: Closeness;
  /** ISO instant the friendship was accepted. */
  since: string;
  years: number;
  days: number;
  sharedCount: number;
  first: MemoryEvent | null;
  last: MemoryEvent | null;
  /** Up to six, those with a cover first, newest first. */
  highlights: MemoryEvent[];
}

/** One of the caller's friends taking part in an event. */
export interface FriendGoing {
  userId: string;
  closeness: Closeness;
}

/** A friend who became one this year. */
export interface NewFriendThisYear {
  userId: string;
  since: string;
}

/** A friendship that went up a level this year. */
export interface UpgradeThisYear {
  userId: string;
  closeness: Closeness;
  at: string;
}

/** « 1 an », « 3 ans ». */
export function yearsLabel(years: number): string {
  return `${years} an${years > 1 ? 's' : ''}`;
}

/** « 3 mois », as French writes it whatever the count. */
function monthsLabel(months: number): string {
  return `${months} mois`;
}

/** The line under a reunion candidate: how long since, and the last outing when there is one. */
export function reunionLine(candidate: ReunionCandidate): string {
  if (candidate.lastSharedAt === null) {
    return 'Aucune sortie ensemble sur Wely pour l’instant';
  }
  const since = candidate.monthsApart !== null && candidate.monthsApart >= 2
    ? `Pas vus depuis ${monthsLabel(candidate.monthsApart)}`
    : 'Pas vus depuis un moment';
  return candidate.lastSharedTitle ? `${since} · ${candidate.lastSharedTitle}` : since;
}

/** An ISO instant as a Date, or null when unreadable; nanoseconds are read to the millisecond. */
export function parseInstant(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const MONTH_ONLY = new Intl.DateTimeFormat('fr-FR', { month: 'long' });

/** « le 3 mars 2025 », « le 1er mai 2024 ». */
export function longDateLabel(date: Date): string {
  const day = date.getDate() === 1 ? '1er' : String(date.getDate());
  return `le ${day} ${LONG_DATE.format(date)}`;
}

/** « 1 an d'amitié avec Léa », or the days for a friendship under a year. */
export function memoriesHeading(memories: Pick<FriendshipMemories, 'years' | 'days' | 'name'>): string {
  if (memories.years >= 1) {
    return `${yearsLabel(memories.years)} d’amitié avec ${memories.name}`;
  }
  const days = Math.max(memories.days, 1);
  return `${days} jour${days > 1 ? 's' : ''} d’amitié avec ${memories.name}`;
}

/** Whether today is the anniversary of a friendship of a year or more; Feb 29 falls on Feb 28. */
export function isFriendshipAnniversary(since: string | null | undefined, years: number, today = new Date()): boolean {
  const date = parseInstant(since);
  return years >= 1 && date !== null && isBirthdayToday(toLocalDateValue(date), today);
}

const CLOSE_LEVELS: ReadonlySet<Closeness> = new Set<Closeness>(['CLOSE', 'INTIMATE']);

/**
 * « 3 de tes proches y vont » counting close and intimate friends; else « 2 amis y vont »; null
 * when none of the caller's friends is going.
 */
export function friendsGoingLabel(friendsGoing: readonly FriendGoing[] | null | undefined, count: number | null | undefined): string | null {
  const close = (friendsGoing ?? []).filter(friend => CLOSE_LEVELS.has(friend.closeness)).length;
  if (close > 0) {
    return `${close} de tes proches ${close > 1 ? 'y vont' : 'y va'}`;
  }
  const total = count ?? 0;
  if (total > 0) {
    return `${total} ami${total > 1 ? 's' : ''} ${total > 1 ? 'y vont' : 'y va'}`;
  }
  return null;
}

/** Sorts like the server's `rank=affinity`: closest friends going first, then soonest. */
export function byAffinity<T extends { affinity?: number | null; startDate: Date }>(a: T, b: T): number {
  return (b.affinity ?? 0) - (a.affinity ?? 0) || a.startDate.getTime() - b.startDate.getTime();
}

const UPGRADED_TO: Readonly<Record<Closeness, string>> = {
  FRIEND: 'amis',
  CLOSE: 'proches',
  INTIMATE: 'intimes'
};

/** « Avec Léa, vous êtes devenus intimes en mars ». */
export function upgradeLine(name: string, upgrade: Pick<UpgradeThisYear, 'closeness' | 'at'>): string {
  const at = parseInstant(upgrade.at);
  const when = at ? ` en ${MONTH_ONLY.format(at)}` : '';
  return `Avec ${name}, vous êtes devenus ${UPGRADED_TO[upgrade.closeness]}${when}`;
}
