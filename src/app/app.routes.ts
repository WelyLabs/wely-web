import { Routes } from '@angular/router';
import { MainLayoutComponent } from './components/main-layout/main-layout';
import { CalendarComponent } from './components/calendar/calendar';
import { EventFeedComponent } from './components/event-feed/event-feed';
import { EventDetailsComponent } from './components/event-details/event-details';
import { LandingPageComponent } from './components/landing-page/landing-page';
import { UserProfileComponent } from './components/user-profile/user-profile';
import { FriendsListComponent } from './components/friends-list/friends-list';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    { path: '', component: LandingPageComponent, pathMatch: 'full' },
    {
        path: '',
        component: MainLayoutComponent,
        canActivate: [authGuard], // Protect all child routes
        children: [
            { path: 'calendar', component: CalendarComponent },
            { path: 'feed', component: EventFeedComponent },
            { path: 'event/:type/:id', component: EventDetailsComponent },
            { path: 'profile', component: UserProfileComponent },
            { path: 'friends', component: FriendsListComponent }
        ]
    }
];
