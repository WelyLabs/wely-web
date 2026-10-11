import { describe, it, expect } from 'vitest';
import { Type } from '@angular/core';
import { Route } from '@angular/router';
import { routes } from './app.routes';
import { authGuard } from './core/guards/auth.guard';
import { LandingPageComponent } from './components/landing-page/landing-page';
import { MainLayoutComponent } from './components/main-layout/main-layout';
import { CalendarComponent } from './components/calendar/calendar';
import { EventFeedComponent } from './components/event-feed/event-feed';
import { UserSearchComponent } from './components/user-search/user-search';
import { EventDetailsComponent } from './components/event-details/event-details';
import { UserProfileComponent } from './components/user-profile/user-profile';
import { ConversationsListComponent } from './components/conversations-list/conversations-list';
import { ChatComponent } from './components/chat/chat';

/** Resolves a lazy route the way the router does, to check it lands on the right component. */
async function load(route: Route): Promise<Type<unknown>> {
    const loaded = await route.loadComponent!();
    return (loaded as { default?: Type<unknown> }).default ?? (loaded as Type<unknown>);
}

describe('routes', () => {
    const [landing, shell] = routes;
    const child = (path: string) => shell.children!.find(route => route.path === path)!;

    it('routes_shouldLoadTheLandingPageOnDemand', async () => {
        expect(landing.component).toBeUndefined();
        expect(await load(landing)).toBe(LandingPageComponent);
    });

    it('routes_shouldProtectTheSignedInShell', async () => {
        expect(shell.canActivate).toEqual([authGuard]);
        expect(await load(shell)).toBe(MainLayoutComponent);
    });

    it.each([
        ['calendar', CalendarComponent],
        ['feed', EventFeedComponent],
        ['users', UserSearchComponent],
        ['friends', UserSearchComponent],
        ['event/:type/:id', EventDetailsComponent],
        ['profile', UserProfileComponent],
        ['conversations', ConversationsListComponent],
        ['chat/:convId', ChatComponent]
    ] as [string, Type<unknown>][])('routes_shouldLoad %s on demand', async (path, component) => {
        const route = child(path);

        expect(route.component).toBeUndefined();
        expect(await load(route)).toBe(component);
    });

    it('routes_shouldOpenTheFriendsTabsOnTheFriendsPath', () => {
        expect(child('friends').data).toEqual({ mode: 'friends' });
    });
});
