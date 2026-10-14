/** How close two friends are, from the loosest to the closest; agreed by both to go up. */
export type Closeness = 'FRIEND' | 'CLOSE' | 'INTIMATE';

export const CLOSENESS_LEVELS: readonly Closeness[] = ['FRIEND', 'CLOSE', 'INTIMATE'];

export const CLOSENESS_LABELS: Readonly<Record<Closeness, string>> = {
    FRIEND: 'Ami',
    CLOSE: 'Proche',
    INTIMATE: 'Intime'
};

/** What each level lets a friend see of your calendar, for the people you do not share. */
export const CLOSENESS_HINTS: Readonly<Record<Closeness, string>> = {
    FRIEND: 'voit quand vous êtes occupé',
    CLOSE: 'voit aussi le titre de vos événements',
    INTIMATE: 'voit tout le détail de vos événements'
};

/** An accepted friendship as the caller sees it. */
export interface Friendship {
    friendId: string;
    closeness: Closeness;
    /** A higher level one side asked for, not answered yet. */
    proposal: Closeness | null;
    proposedByFriend: boolean;
}

/** A friend and the state of the friendship, as listed by wely-social. */
export interface FriendSummary {
    userId: string;
    userName: string;
    hashtag: number;
    profilePicUrl?: string;
    closeness: Closeness;
    proposal: Closeness | null;
    proposedByFriend: boolean;
}

export function isAbove(level: Closeness, other: Closeness): boolean {
    return CLOSENESS_LEVELS.indexOf(level) > CLOSENESS_LEVELS.indexOf(other);
}

/** Where the caller stands with another user, as wely-social reports it on a person. */
export type PersonRelation = 'SELF' | 'NONE' | 'FRIENDS' | 'SENT_BY_ME' | 'SENT_BY_THEM';

/** Another user and the caller's relationship to them; closeness fields are null unless friends. */
export interface SocialPerson {
    userId: string;
    userName: string;
    /** A number from wely-social, typed loosely: it is only ever printed. */
    hashtag: number | string;
    profilePicUrl?: string | null;
    relationStatus: PersonRelation;
    closeness: Closeness | null;
    proposal: Closeness | null;
    proposedByFriend: boolean;
    /** ISO date the friendship was accepted; null when not friends. */
    since: string | null;
}

/** One entry of the closeness menu: what choosing it does, worded from the current level. */
export interface ClosenessOption {
    closeness: Closeness;
    label: string;
    hint: string;
}

/**
 * Every other level, worded for what choosing it does: above is a proposal the friend has to
 * accept, below applies at once. The level one already proposed is left out.
 */
export function closenessOptions(friendship: Pick<Friendship, 'closeness' | 'proposal' | 'proposedByFriend'>): ClosenessOption[] {
    const ownProposal = friendship.proposal && !friendship.proposedByFriend ? friendship.proposal : null;
    return CLOSENESS_LEVELS
        .filter(level => level !== friendship.closeness && level !== ownProposal)
        .map(level => ({
            closeness: level,
            label: isAbove(level, friendship.closeness)
                ? `Proposer : ${CLOSENESS_LABELS[level]}`
                : `Redescendre à ${CLOSENESS_LABELS[level]}`,
            hint: CLOSENESS_HINTS[level]
        }));
}
