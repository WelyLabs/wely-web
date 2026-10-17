import { describe, it, expect } from 'vitest';
import { CalendarEvent, escapeText, foldLine, googleCalendarUrl, icsFileName, icsOf, utcStamp } from './calendar-export';

const URL_OF_EVENT = 'https://web.welylabs.app/event/evt-1';

/** The content lines back from their 75-octet folds. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    title: 'Apéro chez Léa',
    startDate: new Date('2026-10-24T17:30:00Z'),
    endDate: new Date('2026-10-24T21:00:00Z'),
    location: 'Lyon',
    description: '',
    coordinates: null,
    ...overrides
  };
}

describe('calendar-export', () => {
  it('utcStamp_shouldWriteTheBasicUtcForm', () => {
    expect(utcStamp(new Date('2026-10-17T08:05:09.123Z'))).toBe('20261017T080509Z');
  });

  it('googleCalendarUrl_shouldFillTheAddEventPage', () => {
    const url = new URL(googleCalendarUrl(event({ description: 'Ramène des chips' }), URL_OF_EVENT));

    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Apéro chez Léa');
    expect(url.searchParams.get('dates')).toBe('20261024T173000Z/20261024T210000Z');
    expect(url.searchParams.get('location')).toBe('Lyon');
    expect(url.searchParams.get('details')).toBe(`Ramène des chips\n\n${URL_OF_EVENT}`);
  });

  it('googleCalendarUrl_shouldLinkBackToTheEventWithoutDescription', () => {
    const url = new URL(googleCalendarUrl(event(), URL_OF_EVENT));

    expect(url.searchParams.get('details')).toBe(URL_OF_EVENT);
  });

  it('escapeText_shouldEscapeWhatTextValuesReserve', () => {
    expect(escapeText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });

  it('foldLine_shouldLeaveShortLinesAlone', () => {
    expect(foldLine('SUMMARY:Apéro')).toBe('SUMMARY:Apéro');
  });

  it('foldLine_shouldFoldEvery75OctetsWithoutSplittingACharacter', () => {
    const folded = foldLine('DESCRIPTION:' + 'é'.repeat(100));
    const encoder = new TextEncoder();

    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(lines.slice(1).every(line => line.startsWith(' '))).toBe(true);
    expect(lines.map((line, i) => (i === 0 ? line : line.slice(1))).join('')).toBe('DESCRIPTION:' + 'é'.repeat(100));
  });

  it('icsOf_shouldWriteOneEventInUtc', () => {
    const ics = unfold(icsOf(event({ description: 'Ramène des chips, et du pain' }), URL_OF_EVENT, new Date('2026-10-17T10:00:00Z')));

    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('\r\nUID:evt-1@welylabs.app\r\n');
    expect(ics).toContain('\r\nDTSTAMP:20261017T100000Z\r\n');
    expect(ics).toContain('\r\nDTSTART:20261024T173000Z\r\n');
    expect(ics).toContain('\r\nDTEND:20261024T210000Z\r\n');
    expect(ics).toContain('\r\nSUMMARY:Apéro chez Léa\r\n');
    expect(ics).toContain('\r\nLOCATION:Lyon\r\n');
    expect(ics).toContain(`\r\nDESCRIPTION:Ramène des chips\\, et du pain\\n\\n${URL_OF_EVENT}\r\n`);
    expect(ics).toContain(`\r\nURL:${URL_OF_EVENT}\r\n`);
    expect(ics).not.toContain('GEO:');
  });

  it('icsOf_shouldPlaceAPickedLocation', () => {
    const ics = icsOf(event({ coordinates: { latitude: 45.764, longitude: 4.8357 } }), URL_OF_EVENT, new Date());

    expect(ics).toContain('\r\nGEO:45.764;4.8357\r\n');
  });

  it('icsFileName_shouldSlugTheTitle', () => {
    expect(icsFileName('Apéro chez Léa !')).toBe('apero-chez-lea.ics');
    expect(icsFileName('  Soirée — jeux  ')).toBe('soiree-jeux.ics');
  });

  it('icsFileName_shouldFallBackWhenNothingIsLeft', () => {
    expect(icsFileName('🎉🎉')).toBe('wely-event.ics');
  });
});
