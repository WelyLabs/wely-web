import { Closeness } from './friendship.model';

/** A surprise prepared for a friend's birthday; never sent to the person it is for. */
export interface BirthdaySurprise {
  eventId: string;
  organizerId: string;
  joined: boolean;
}

/** One birthday in a date range, as wely-events computes it for the caller and their friends. */
export interface BirthdayOccurrence {
  userId: string;
  name: string;
  /** `YYYY-MM-DD`, the day it falls on that year. */
  date: string;
  mine: boolean;
  /** Null for the caller's own birthday. */
  closeness: Closeness | null;
  canOrganize: boolean;
  surprise: BirthdaySurprise | null;
}

/** How a birthday is drawn: warmest for one's own, then by closeness. */
export type BirthdayTone = 'mine' | 'friend' | 'close' | 'intimate';

export function birthdayTone(birthday: Pick<BirthdayOccurrence, 'mine' | 'closeness'>): BirthdayTone {
  if (birthday.mine) {
    return 'mine';
  }
  if (birthday.closeness === 'INTIMATE') {
    return 'intimate';
  }
  return birthday.closeness === 'CLOSE' ? 'close' : 'friend';
}

const TONE_EMOJI: Readonly<Record<BirthdayTone, string>> = {
  mine: '🎂',
  friend: '🎈',
  close: '🎁',
  intimate: '💝'
};

export function birthdayEmoji(tone: BirthdayTone): string {
  return TONE_EMOJI[tone];
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre',
  'novembre', 'décembre'];

/** « 12 mars », « 1er mai »: day and month only, as friends see a birthday. */
export function dayMonthLabel(month: number, day: number): string {
  const name = MONTHS[month - 1];
  if (!name || day < 1 || day > 31) {
    return '';
  }
  return `${day === 1 ? '1er' : day} ${name}`;
}

/** A `YYYY-MM-DD` value as a local date at midnight, or null when it is not one. */
export function parseLocalDate(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

const pad = (value: number) => value.toString().padStart(2, '0');

/** A local date as `YYYY-MM-DD`. */
export function toLocalDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Whether `today` is the birthday of someone born on `birthDate`; Feb 29 falls on Feb 28 in other years. */
export function isBirthdayToday(birthDate: string | null | undefined, today = new Date()): boolean {
  const born = parseLocalDate(birthDate);
  if (!born) {
    return false;
  }
  const month = born.getMonth();
  let day = born.getDate();
  if (month === 1 && day === 29 && !isLeapYear(today.getFullYear())) {
    day = 28;
  }
  return today.getMonth() === month && today.getDate() === day;
}

/** wely-users accepts an age between these two. */
export const MIN_AGE = 13;
export const MAX_AGE = 120;

/** The bounds of a birth date input, as `YYYY-MM-DD`. */
export function birthDateBounds(today = new Date()): { min: string; max: string } {
  const max = new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());
  const min = new Date(today.getFullYear() - MAX_AGE, today.getMonth(), today.getDate());
  return { min: toLocalDateValue(min), max: toLocalDateValue(max) };
}

/** Why a birth date would be refused, or null when wely-users will take it. */
export function birthDateError(value: string | null | undefined, today = new Date()): string | null {
  const date = parseLocalDate(value);
  if (!date) {
    return 'Indique ta date de naissance.';
  }
  const { min, max } = birthDateBounds(today);
  if (date > (parseLocalDate(max) as Date)) {
    return `Il faut avoir au moins ${MIN_AGE} ans pour utiliser Wely.`;
  }
  if (date < (parseLocalDate(min) as Date)) {
    return 'Cette date ne semble pas correcte.';
  }
  return null;
}

/** The hours a surprise party is pre-filled with, local time. */
export const SURPRISE_START_HOUR = 19;
export const SURPRISE_END_HOUR = 23;

export function surpriseTitle(name: string): string {
  return `Anniversaire surprise de ${name} 🎉`;
}

export function surpriseDescription(name: string): string {
  return `🤫 ${name} ne voit pas cet événement. Invite ses amis et choisis le lieu.`;
}
