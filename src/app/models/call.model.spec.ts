import { describe, it, expect } from 'vitest';
import { Call, isLive } from './call.model';

describe('isLive', () => {
  const call = (status: Call['status']) => ({ status } as Call);

  it('isLive_shouldBeTrueWhileTheCallCanBeJoined', () => {
    expect(isLive(call('RINGING'))).toBe(true);
    expect(isLive(call('ACTIVE'))).toBe(true);
  });

  it('isLive_shouldBeFalseOnceOver_orWithoutACall', () => {
    expect(isLive(call('ENDED'))).toBe(false);
    expect(isLive(call('MISSED'))).toBe(false);
    expect(isLive(null)).toBe(false);
  });
});
