import { describe, it, expect } from 'vitest';

import { avatarColor, initialsOf } from './avatar';

describe('avatar', () => {
  it('initialsOf_shouldTakeTwoLetters', () => {
    expect(initialsOf('Camille Durand')).toBe('CD');
    expect(initialsOf('camille')).toBe('CA');
    expect(initialsOf('  ')).toBe('?');
  });

  it('avatarColor_shouldBeStablePerPerson', () => {
    expect(avatarColor('u1')).toBe(avatarColor('u1'));
    expect(avatarColor('u1')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
