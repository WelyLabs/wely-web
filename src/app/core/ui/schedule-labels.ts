/** How conflicts and proposed times are worded, wherever they are shown. */

const MINUTE_MS = 60_000;

const time = (date: Date) => date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const day = (date: Date) => date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * « 14:00 – 16:00 » on the reference day, « ven. 17 oct. · 14:00 – 16:00 » on another, and both
 * days when the range spans several.
 */
export function rangeLabel(start: Date, end: Date, reference: Date = start): string {
  if (!sameDay(start, end)) {
    return `${day(start)} ${time(start)} → ${day(end)} ${time(end)}`;
  }
  const hours = `${time(start)} – ${time(end)}`;
  return sameDay(start, reference) ? hours : `${day(start)} · ${hours}`;
}

/** How far a move goes: « 1 h plus tard », « 30 min plus tôt », « 2 h 30 plus tard ». */
export function shiftLabel(from: Date, to: Date): string {
  const minutes = Math.round((to.getTime() - from.getTime()) / MINUTE_MS);
  const direction = minutes >= 0 ? 'plus tard' : 'plus tôt';
  const total = Math.abs(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const amount = hours === 0 ? `${rest} min` : rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
  return `${amount} ${direction}`;
}
