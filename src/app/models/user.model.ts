export interface KeycloakUser {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
}

export interface BusinessUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
    jobTitle: string;
    department: string;
    location: string;
    bio: string;
    skills: string[];
    joinDate: string; // LocalDateTime from Java usually comes as ISO string
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
}

export interface UnifiedUser extends KeycloakUser, Omit<BusinessUser, 'id' | 'email' | 'firstName' | 'lastName'> {
    // Add any specific fields that might result from the merge logic if needed
    originalJoinDate: string; // Keep original string
    parsedJoinDate: Date;     // Parsed Date object
}
