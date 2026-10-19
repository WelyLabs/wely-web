import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import {
  eventEditError, eventInvitationIn, eventInvitationLink, eventInvitationPath, invitationError,
} from './event-invitation';

const refusal = (code: string) => new HttpErrorResponse({ status: 409, error: { code } });

describe('event invitations', () => {
  it('eventInvitationLink_shouldPointAtTheEventPage_markedAsAnInvitation', () => {
    expect(eventInvitationPath('e1')).toBe('/event/e1');
    expect(eventInvitationLink('e1', 'https://wely.app')).toBe('https://wely.app/event/e1?invitation');
  });

  it('eventInvitationLink_shouldDefaultToTheCurrentOrigin', () => {
    expect(eventInvitationLink('e1')).toBe(`${globalThis.location.origin}/event/e1?invitation`);
  });

  it('eventInvitationIn_shouldReadTheEventFromAnyOrigin', () => {
    expect(eventInvitationIn("Je t'invite : http://localhost/event/6713a0f1c2?invitation")).toBe('6713a0f1c2');
    expect(eventInvitationIn('https://dev.wely.app/event/abc_D-9?invitation')).toBe('abc_D-9');
  });

  it('eventInvitationIn_shouldIgnoreAPlainLinkOrNoText', () => {
    expect(eventInvitationIn('http://localhost/event/6713a0f1c2')).toBeNull();
    expect(eventInvitationIn('http://localhost/event/6713a0f1c2?invitations')).toBeNull();
    expect(eventInvitationIn(null)).toBeNull();
    expect(eventInvitationIn(undefined)).toBeNull();
  });

  it('invitationError_shouldExplainEachRefusal', () => {
    expect(invitationError(refusal('EVT-BUS-036'))).toContain('amis');
    expect(invitationError(refusal('EVT-BUS-039'))).toContain('terminé');
    expect(invitationError(refusal('EVT-BUS-040'))).toContain('participe déjà');
  });

  it('invitationError_shouldFallBack_forAnythingElse', () => {
    expect(invitationError(refusal('EVT-TEC-001'))).toBe("L'invitation n'a pas pu être envoyée.");
    expect(invitationError(new Error('offline'))).toBe("L'invitation n'a pas pu être envoyée.");
  });

  it('eventEditError_shouldExplainEachRefusal_orFallBack', () => {
    expect(eventEditError(refusal('EVT-BUS-033'))).toBe('Le lieu est obligatoire.');
    expect(eventEditError(refusal('EVT-BUS-018'))).toContain('sondage');
    expect(eventEditError(new HttpErrorResponse({ status: 500 }))).toBe("Les modifications n'ont pas pu être enregistrées.");
  });
});
