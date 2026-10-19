import { UserNodeDTO } from './user.model';

/** Who can find a community: PUBLIC is listed and joined at once, PRIVATE is invisible and joined by invitation. */
export type CommunityVisibility = 'PUBLIC' | 'PRIVATE';

/** A member's role; a community may have several admins. */
export type CommunityRole = 'ADMIN' | 'MEMBER';

/** A community as the viewer sees it, as wely-social sends it. */
export interface Community {
  communityId: string;
  name: string;
  description: string | null;
  interests: string[];
  visibility: CommunityVisibility;
  /** ISO instant. */
  createdAt: string;
  memberCount: number;
  /** Null when the viewer is not a member. */
  role: CommunityRole | null;
  /** A few of the viewer's friends who are members; friendMemberCount says how many in all. */
  friendMembers: UserNodeDTO[];
  friendMemberCount: number;
  /** A signed URL of its picture, valid one hour; null when it has none: the initials stand in. */
  pictureUrl: string | null;
}

export interface CommunityRequest {
  name: string;
  description?: string | null;
  interests: string[];
  visibility: CommunityVisibility;
}

export interface CommunityMember {
  userId: string;
  userName: string;
  hashtag: number;
  profilePicUrl: string | null;
  role: CommunityRole;
  /** ISO instant. */
  joinedAt: string;
}

/** An invitation to one friend, valid three days, used up once accepted. */
export interface CommunityInvitation {
  token: string;
  communityId: string;
  communityName: string;
  visibility: CommunityVisibility;
  inviterId: string;
  inviterName: string | null;
  inviteeId: string;
  inviteeName: string | null;
  /** ISO instants. */
  createdAt: string;
  expiresAt: string;
  /** Whether it can no longer be used: the page still shows it, to say so. */
  expired: boolean;
}

export interface CommunityLeaveResult {
  communityDeleted: boolean;
  /** The member promoted because the last admin left, or null. */
  newAdminId: string | null;
}

/** Same limits as wely-social's CommunityDraft. */
export const COMMUNITY_LIMITS = {
  nameMin: 3,
  nameMax: 60,
  descriptionMax: 500,
  interestsMax: 5,
  interestMax: 30,
} as const;

/** The path of an invitation's page; the link sent by message is this, on the app's own origin. */
export function invitationPath(token: string): string {
  return `/communities/invite/${token}`;
}

export function invitationLink(token: string, origin: string = globalThis.location?.origin ?? ''): string {
  return `${origin}${invitationPath(token)}`;
}

/**
 * The invitation token a message carries, if it carries a link to an invitation: any origin, so a
 * link sent from the local app still reads on dev, and the other way round.
 */
export function invitationTokenIn(text: string | null | undefined): string | null {
  const match = /\/communities\/invite\/([A-Za-z0-9_-]{16,})/.exec(text ?? '');
  return match ? match[1] : null;
}

/** French wording for wely-social's community error codes; null when the code is not one of them. */
export function communityErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'SCL-BUS-010':
      return "Cette communauté n'existe pas ou n'est pas visible pour vous.";
    case 'SCL-BUS-011':
      return 'Seuls les administrateurs de la communauté peuvent faire cela.';
    case 'SCL-BUS-012':
      return 'Le nom doit faire 3 à 60 caractères, la description 500 au plus, et 5 centres d\'intérêt au maximum.';
    case 'SCL-BUS-013':
      return "Cette invitation n'existe pas, a déjà été utilisée ou révoquée, ou ne vous est pas destinée.";
    case 'SCL-BUS-014':
      return 'Cette invitation a expiré : elle était valable 3 jours. Demandez-en une nouvelle à un administrateur.';
    case 'SCL-BUS-015':
      return 'Vous ne pouvez inviter que vos amis qui ne sont pas encore membres.';
    case 'SCL-BUS-016':
      return 'Vous êtes le seul membre : quitter la communauté la supprimera.';
    case 'SCL-BUS-017':
      return 'La communauté doit garder au moins un administrateur : nommez-en un autre d\'abord.';
    case 'SCL-BUS-018':
      return "Cette personne n'est pas membre de la communauté.";
    case 'SCL-BUS-019':
      return 'Réservé aux membres : rejoignez la communauté pour voir son contenu.';
    case 'SCL-BUS-020':
      return "Ce fichier n'est pas une image que l'on peut utiliser (JPEG, PNG, GIF ou BMP).";
    case 'SCL-BUS-021':
      return 'Cette image est trop lourde : 10 Mo au maximum.';
    case 'SCL-TEC-004':
      return "L'image n'a pas pu être enregistrée. Réessayez dans un instant.";
    case 'EVT-BUS-024':
      return 'Seuls les membres de la communauté peuvent voir et publier ses événements.';
    default:
      return null;
  }
}
