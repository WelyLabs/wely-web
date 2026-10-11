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
