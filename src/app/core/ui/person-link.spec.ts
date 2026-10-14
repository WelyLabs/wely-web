import { describe, it, expect } from 'vitest';
import { personLink } from './person-link';

describe('personLink', () => {
  it('personLink_shouldLeadToTheFriendPage_forSomeoneElse', () => {
    expect(personLink('lea', 'me')).toEqual(['/friends', 'lea']);
  });

  it('personLink_shouldLeadToMyProfile_forMe', () => {
    expect(personLink('me', 'me')).toEqual(['/profile']);
  });

  it('personLink_shouldLeadToTheFriendPage_whenIAmNotKnownYet', () => {
    expect(personLink('lea', null)).toEqual(['/friends', 'lea']);
  });
});
