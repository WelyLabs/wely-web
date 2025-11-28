import { BusinessUser } from './business-user.model';

export const MOCK_FRIENDS: BusinessUser[] = [
    {
        id: '2',
        email: 'sarah.connor@example.com',
        firstName: 'Sarah',
        lastName: 'Connor',
        jobTitle: 'Product Manager',
        department: 'Product',
        location: 'Lyon, France',
        bio: 'Product Manager expérimentée avec une passion pour l\'UX et les méthodologies agiles.',
        skills: ['Product Strategy', 'Agile', 'User Research', 'JIRA'],
        joinDate: new Date('2023-03-10'),
        projects: [],
        stats: { projectsCompleted: 8, hoursLogged: 1200, efficiency: 92 }
    },
    {
        id: '3',
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        jobTitle: 'Frontend Developer',
        department: 'Engineering',
        location: 'Remote',
        bio: 'Développeur Frontend spécialisé en React et Angular. J\'aime le code propre et performant.',
        skills: ['React', 'Angular', 'CSS', 'TypeScript'],
        joinDate: new Date('2023-05-22'),
        projects: [],
        stats: { projectsCompleted: 15, hoursLogged: 1600, efficiency: 96 }
    },
    {
        id: '4',
        email: 'alice.smith@example.com',
        firstName: 'Alice',
        lastName: 'Smith',
        jobTitle: 'UX Designer',
        department: 'Design',
        location: 'Paris, France',
        bio: 'Designer passionnée par la création d\'expériences utilisateur intuitives et esthétiques.',
        skills: ['Figma', 'Sketch', 'Prototyping', 'User Testing'],
        joinDate: new Date('2023-02-15'),
        projects: [],
        stats: { projectsCompleted: 10, hoursLogged: 1100, efficiency: 95 }
    },
    {
        id: '5',
        email: 'bob.wilson@example.com',
        firstName: 'Bob',
        lastName: 'Wilson',
        jobTitle: 'DevOps Engineer',
        department: 'Operations',
        location: 'Bordeaux, France',
        bio: 'Expert en automatisation et infrastructure cloud. Je m\'assure que tout tourne rond.',
        skills: ['AWS', 'Docker', 'Kubernetes', 'CI/CD'],
        joinDate: new Date('2023-06-01'),
        projects: [],
        stats: { projectsCompleted: 20, hoursLogged: 1800, efficiency: 98 }
    },
    {
        id: '6',
        email: 'emma.brown@example.com',
        firstName: 'Emma',
        lastName: 'Brown',
        jobTitle: 'Marketing Specialist',
        department: 'Marketing',
        location: 'Paris, France',
        bio: 'Spécialiste marketing digital avec un focus sur le growth hacking et le content marketing.',
        skills: ['SEO', 'Content Marketing', 'Google Analytics', 'Social Media'],
        joinDate: new Date('2023-04-12'),
        projects: [],
        stats: { projectsCompleted: 5, hoursLogged: 800, efficiency: 90 }
    }
];
