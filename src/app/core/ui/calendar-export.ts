/**
 * An event into the viewer's own agenda: Google Calendar through its « add event » link, Apple
 * Calendar, Outlook and the others through an iCalendar file (RFC 5545). A copy, not a sync: the
 * agenda keeps what it got, and the file's UID lets a new import replace the old one.
 */

/** What an agenda needs of an event. */
export interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location: string;
  description: string;
  coordinates?: { latitude: number; longitude: number } | null;
}

const PRODUCT_ID = '-//WelyLabs//Wely//FR';
/** The UID's domain: the same event gives the same UID, whatever the environment. */
const UID_DOMAIN = 'welylabs.app';
/** RFC 5545 §3.1: lines longer than 75 octets are folded. */
const MAX_LINE_OCTETS = 75;

/** 2026-10-17T18:30:00.000Z → « 20261017T183000Z », the UTC form both formats read. */
export function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** The description an agenda shows: the organizer's words, then the way back to the event. */
function detailsOf(event: CalendarEvent, eventUrl: string): string {
  return event.description ? `${event.description}\n\n${eventUrl}` : eventUrl;
}

/** Google Calendar's « add event » page, filled in. */
export function googleCalendarUrl(event: CalendarEvent, eventUrl: string): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${utcStamp(event.startDate)}/${utcStamp(event.endDate)}`,
    details: detailsOf(event, eventUrl),
    location: event.location
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** A TEXT value: backslash, semicolon, comma and line breaks escaped. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** A content line folded every 75 octets, never inside a character. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // The continuation lines start with a space, which counts.
    const limit = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** The event as an iCalendar file, `now` being when it is exported. */
export function icsOf(event: CalendarEvent, eventUrl: string, now: Date): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODUCT_ID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@${UID_DOMAIN}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(event.startDate)}`,
    `DTEND:${utcStamp(event.endDate)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `LOCATION:${escapeText(event.location)}`,
    `DESCRIPTION:${escapeText(detailsOf(event, eventUrl))}`,
    `URL:${eventUrl}`
  ];
  if (event.coordinates) {
    lines.push(`GEO:${event.coordinates.latitude};${event.coordinates.longitude}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** « Apéro chez Léa ! » → « apero-chez-lea.ics »; « wely-event.ics » when nothing is left. */
export function icsFileName(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `${slug || 'wely-event'}.ics`;
}
