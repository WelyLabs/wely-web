import { User } from './user.model';

export const MOCK_USER: User = {
    id: '1',
    userName: 'testuser',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    profilePicUrl: 'https://example.com/avatar.jpg',
    hashtag: '1234',
    jobTitle: 'Software Engineer',
    department: 'Engineering',
    location: 'San Francisco',
    bio: 'Just a test user bio.',
    skills: ['Angular', 'TypeScript', 'Vitest'],
    joinedDate: new Date().toISOString(),
    projects: [
        { name: 'Project Alpha', role: 'Lead', status: 'active', color: '#4CAF50' },
        { name: 'Project Beta', role: 'Developer', status: 'completed', color: '#2196F3' }
    ],
    stats: {
        projectsCompleted: 12,
        hoursLogged: 1240,
        efficiency: 94
    }
};
