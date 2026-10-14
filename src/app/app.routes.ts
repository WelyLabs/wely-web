import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

/**
 * Every screen is loaded on demand. Imported eagerly, they all shipped in one 1.33 MB bundle,
 * so the landing page made a phone download, parse and compile the calendar, the chat client
 * and the avatar cropper before showing anything.
 */
export const routes: Routes = [
    {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./components/landing-page/landing-page').then(m => m.LandingPageComponent)
    },
    {
        path: '',
        loadComponent: () => import('./components/main-layout/main-layout').then(m => m.MainLayoutComponent),
        canActivate: [authGuard], // Protect all child routes
        children: [
            { path: 'calendar', loadComponent: () => import('./components/calendar/calendar').then(m => m.CalendarComponent) },
            { path: 'feed', loadComponent: () => import('./components/event-feed/event-feed').then(m => m.EventFeedComponent) },
            { path: 'event/:id', loadComponent: () => import('./components/event-details/event-details').then(m => m.EventDetailsComponent) },
            // The middle segment named where the page was opened from and nothing read it. Kept for links already shared.
            { path: 'event/:from/:id', redirectTo: 'event/:id' },
            { path: 'profile', loadComponent: () => import('./components/user-profile/user-profile').then(m => m.UserProfileComponent) },
            { path: 'friends', loadComponent: () => import('./components/user-search/user-search').then(m => m.UserSearchComponent) },
            {
                path: 'friends/:userId',
                loadComponent: () => import('./components/friend-profile/friend-profile').then(m => m.FriendProfileComponent)
            },
            // The user directory is gone: friends are added by tag or through events. Old links land on the friends page.
            { path: 'users', redirectTo: 'friends' },
            {
                path: 'conversations',
                loadComponent: () => import('./components/conversations-list/conversations-list').then(m => m.ConversationsListComponent)
            },
            { path: 'chat/:convId', loadComponent: () => import('./components/chat/chat').then(m => m.ChatComponent) }
        ]
    }
];
