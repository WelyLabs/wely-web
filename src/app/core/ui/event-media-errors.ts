import { HttpErrorResponse } from '@angular/common/http';

/** wely-events' refusals of a cover or a receipt, in the words the user reads. */
export const EVENT_MEDIA_ERRORS: Readonly<Record<string, string>> = {
  'EVT-BUS-002': 'Seul l’organisateur peut changer la couverture.',
  'EVT-BUS-008': 'Un remboursement n’a pas de ticket.',
  'EVT-BUS-009': 'Seul l’auteur de la dépense ou l’organisateur peut changer son ticket.',
  'EVT-BUS-011': 'Ce fichier n’est pas une image utilisable. Essaie un JPEG ou un PNG.',
  'EVT-BUS-012': 'Cette image est trop lourde, même réduite.',
  'EVT-BUS-013': 'Ce fichier n’est pas une image de ticket utilisable. Essaie un JPEG ou un PNG.',
  'EVT-TEC-003': 'Les images sont indisponibles pour le moment. Réessaie dans un instant.'
};

/** The message for a failed cover or receipt call, or `fallback` for anything unexpected. */
export function eventMediaError(error: unknown, fallback: string): string {
  const code: unknown = error instanceof HttpErrorResponse ? error.error?.code : undefined;
  return (typeof code === 'string' ? EVENT_MEDIA_ERRORS[code] : undefined) ?? fallback;
}
