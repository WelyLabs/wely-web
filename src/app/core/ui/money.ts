/** Money in Wely: whole cents on the wire and in memory, euros only when shown or typed. */

const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** 1234 → « 12,34 € ». */
export function formatCents(cents: number): string {
  return EUROS.format(cents / 100);
}

/**
 * What someone typed, in cents: « 12,5 », « 12.50 », « 12 € » all give 1250. Null for anything that
 * is not an amount with at most two decimals. Read digit by digit, never through a float, so that
 * « 0,29 » is 29 and not 28.999….
 */
export function parseEuros(text: string): number | null {
  const cleaned = text.replace(/[\s\u00a0\u202f€]/g, '').replace(',', '.');
  const match = /^(\d{1,7})(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) {
    return null;
  }
  const cents = (match[2] ?? '').padEnd(2, '0');
  return Number(match[1]) * 100 + Number(cents);
}

/** Cents as an editable « 12,50 », without the currency sign. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
