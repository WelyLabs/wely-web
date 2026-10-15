import { describe, expect, it } from 'vitest';
import { communityErrorMessage, invitationLink, invitationPath, invitationTokenIn } from './community.model';

describe('community.model', () => {
  const token = 'AbC_def-1234567890xyz';

  it('builds the path and the link of an invitation', () => {
    expect(invitationPath(token)).toBe(`/communities/invite/${token}`);
    expect(invitationLink(token, 'https://dev-web.welylabs.app')).toBe(`https://dev-web.welylabs.app/communities/invite/${token}`);
  });

  it('defaults the link to the current origin', () => {
    expect(invitationLink(token)).toBe(`${globalThis.location.origin}/communities/invite/${token}`);
  });

  it('finds the token in a message, whatever the origin', () => {
    expect(invitationTokenIn(`Rejoins-nous : http://localhost/communities/invite/${token}`)).toBe(token);
    expect(invitationTokenIn(`https://dev-web.welylabs.app/communities/invite/${token} à bientôt`)).toBe(token);
  });

  it('finds nothing in an ordinary message, a short token or no text', () => {
    expect(invitationTokenIn('On se voit samedi ?')).toBeNull();
    expect(invitationTokenIn('/communities/invite/short')).toBeNull();
    expect(invitationTokenIn(null)).toBeNull();
    expect(invitationTokenIn(undefined)).toBeNull();
  });

  it('words every community error code in French', () => {
    for (const code of ['SCL-BUS-010', 'SCL-BUS-011', 'SCL-BUS-012', 'SCL-BUS-013', 'SCL-BUS-014', 'SCL-BUS-015',
      'SCL-BUS-016', 'SCL-BUS-017', 'SCL-BUS-018', 'SCL-BUS-019', 'EVT-BUS-024']) {
      expect(communityErrorMessage(code)).toBeTruthy();
    }
    expect(communityErrorMessage('SCL-BUS-014')).toContain('expiré');
  });

  it('answers null for any other code', () => {
    expect(communityErrorMessage('SCL-BUS-001')).toBeNull();
    expect(communityErrorMessage(undefined)).toBeNull();
  });
});
