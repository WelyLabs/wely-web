/** Tiles for events without a cover, in Wely's colours; picked per event so each keeps its own. */
const EVENT_TINTS = [
  'linear-gradient(135deg, #0f766e, #3b82f6)',
  'linear-gradient(135deg, #be185d, #f97316)',
  'linear-gradient(135deg, #7c3aed, #ec4899)',
  'linear-gradient(135deg, #c2410c, #facc15)',
  'linear-gradient(135deg, #1e3a8a, #7c3aed)',
  'linear-gradient(135deg, #4d7c0f, #0f766e)'
];

/** The same gradient every time for the same event. */
export function eventTint(eventId: string): string {
  let hash = 0;
  for (const char of eventId) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return EVENT_TINTS[Math.abs(hash) % EVENT_TINTS.length];
}
