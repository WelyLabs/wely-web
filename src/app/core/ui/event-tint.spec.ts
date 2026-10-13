import { describe, it, expect } from 'vitest';
import { eventTint } from './event-tint';

describe('eventTint', () => {
  it('eventTint_shouldKeepTheSameTintForTheSameEvent', () => {
    expect(eventTint('abc')).toBe(eventTint('abc'));
    expect(eventTint('abc')).toContain('linear-gradient');
  });

  it('eventTint_shouldVaryFromOneEventToAnother', () => {
    const tints = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(eventTint));

    expect(tints.size).toBeGreaterThan(1);
  });
});
