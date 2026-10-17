export interface User {
    id: string;
    userName: string;
    email: string;
    firstName: string;
    lastName: string;
    profilePicUrl?: string;
    hashtag: string;
    jobTitle: string;
    department: string;
    location: string;
    bio: string;
    skills: string[];
    joinedDate: string;
    projects: {
        name: string;
        role: string;
        status: 'active' | 'completed' | 'pending';
        color?: string;
    }[];
    stats: {
        projectsCompleted: number;
        hoursLogged: number;
        efficiency: number;
    };
    roles?: string[];
    /** `YYYY-MM-DD`; only the user sees their own year. */
    birthDate?: string | null;
    /** False until the signup-completion steps are done. */
    registrationCompleted?: boolean;
}

/** Relationship state between the caller and another user, as the graph reports it. */
export type RelationStatus =
    | 'SENT_BY_ME'
    | 'SENT_BY_THEM'
    | 'FRIENDS'
    | 'NONE'
    | 'PENDING_INCOMING'
    | 'PENDING_OUTGOING';

export interface UserWithStatusDTO {
    /**
     * Business UUID. Declared `number` until now, which was simply untrue — the
     * backend sends a UUID string. Types being erased at runtime, the lie was
     * invisible, and any arithmetic on it would have silently produced nonsense.
     */
    userId: string;
    userName: string;
    profilePicUrl?: string;
    relationStatus: RelationStatus;
    /** With the name, the public tag `Name#1234` a request is sent to. */
    hashtag?: number;
    /** While a request is pending: the event it was sent from, if any. */
    viaEventId?: string | null;
}

/** A user node as returned by the social service after a relationship change. */
export interface UserNodeDTO {
    userId: string;
    userName: string;
    hashtag: number;
    profilePicUrl?: string;
}
