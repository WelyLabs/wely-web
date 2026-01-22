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
}

export interface UserWithStatusDTO {
    userId: number;
    userName: string;
    profilePicUrl?: string;
    relationStatus: 'SENT_BY_ME' | 'SENT_BY_THEM' | 'FRIENDS' | 'NONE' | 'PENDING_INCOMING' | 'PENDING_OUTGOING';
}
