import { HttpErrorResponse } from '@angular/common/http';

/** The marker an invitation's link carries, so the chat tells it from a plain share of the event. */
const INVITATION_MARKER = 'invitation';

/** The event page an invitation leads to, as the router takes it. */
export function eventInvitationPath(eventId: string): string {
  return `/event/${eventId}`;
}

export function eventInvitationLink(eventId: string, origin: string = globalThis.location?.origin ?? ''): string {
  return `${origin}${eventInvitationPath(eventId)}?${INVITATION_MARKER}`;
}

/**
 * The event an invitation message links to, if it carries one: any origin, so a link sent from the
 * local app still reads on dev, and the other way round.
 */
export function eventInvitationIn(text: string | null | undefined): string | null {
  const match = /\/event\/([A-Za-z0-9_-]+)\?invitation\b/.exec(text ?? '');
  return match ? match[1] : null;
}

/** wely-events' refusals of an invitation, in the words the organizer reads. */
const INVITATION_ERRORS: Readonly<Record<string, string>> = {
  'EVT-BUS-001': "Cet événement n'existe plus.",
  'EVT-BUS-002': "Seul l'organisateur peut inviter.",
  'EVT-BUS-036': "Cette personne ne fait plus partie de tes amis.",
  'EVT-BUS-039': "On ne peut plus inviter à cet événement : il est terminé.",
  'EVT-BUS-040': "Cette personne participe déjà.",
};

/** wely-events' refusals of a change to the event, in the words the organizer reads. */
const EDIT_ERRORS: Readonly<Record<string, string>> = {
  'EVT-BUS-001': "Cet événement n'existe plus.",
  'EVT-BUS-002': "Seul l'organisateur peut modifier l'événement.",
  'EVT-BUS-017': 'Ce créneau n\'est pas possible : vérifie le début et la fin.',
  'EVT-BUS-018': 'Le sondage de date est encore ouvert : fixe la date dans le sondage.',
  'EVT-BUS-019': 'La date a changé entre-temps : recharge la page avant de la modifier.',
  'EVT-BUS-033': 'Le lieu est obligatoire.',
  'EVT-BUS-038': 'Cette date est déjà passée : choisis un moment à venir.',
};

function messageFor(errors: Readonly<Record<string, string>>, error: unknown, fallback: string): string {
  const code: unknown = error instanceof HttpErrorResponse ? error.error?.code : undefined;
  return (typeof code === 'string' ? errors[code] : undefined) ?? fallback;
}

export function invitationError(error: unknown): string {
  return messageFor(INVITATION_ERRORS, error, "L'invitation n'a pas pu être envoyée.");
}

export function eventEditError(error: unknown): string {
  return messageFor(EDIT_ERRORS, error, "Les modifications n'ont pas pu être enregistrées.");
}
