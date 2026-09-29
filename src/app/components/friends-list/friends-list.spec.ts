import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FriendsListComponent } from './friends-list';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BusinessUser } from '../../models/business-user.model';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('FriendsListComponent', () => {
    let component: FriendsListComponent;
    let fixture: ComponentFixture<FriendsListComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [FriendsListComponent, NoopAnimationsModule]
        }).compileComponents();

        fixture = TestBed.createComponent(FriendsListComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should load friends after delay', () => {
        vi.useFakeTimers();
        expect(component.isLoading).toBe(true);
        component.ngOnInit();
        vi.advanceTimersByTime(600);
        expect(component.isLoading).toBe(false);
        expect(component.friends.length).toBeGreaterThan(0);
        vi.useRealTimers();
    });

    it('should filter friends by first name', () => {
        component.friends = [
            { id: 1, firstName: 'John', lastName: 'Doe', jobTitle: 'Dev' } as any as BusinessUser,
            { id: 2, firstName: 'Jane', lastName: 'Smith', jobTitle: 'Design' } as any as BusinessUser
        ];
        component.searchQuery = 'john';
        component.filterFriends();
        expect(component.filteredFriends.length).toBe(1);
        expect(component.filteredFriends[0].firstName).toBe('John');
    });

    it('should filter friends by job title', () => {
        component.friends = [
            { id: 1, firstName: 'John', lastName: 'Doe', jobTitle: 'Developer' } as any as BusinessUser,
            { id: 2, firstName: 'Jane', lastName: 'Smith', jobTitle: 'Designer' } as any as BusinessUser
        ];
        component.searchQuery = 'design';
        component.filterFriends();
        expect(component.filteredFriends.length).toBe(1);
        expect(component.filteredFriends[0].jobTitle).toBe('Designer');
    });

    it('should reset filter if search query is empty', () => {
        component.friends = [{ id: 1, firstName: 'John', lastName: 'Doe', jobTitle: 'Dev' } as any as BusinessUser];
        component.searchQuery = '';
        component.filterFriends();
        expect(component.filteredFriends).toEqual(component.friends);
    });

    it('should get correct initials', () => {
        const user = { firstName: 'Alice', lastName: 'Bob' } as any as BusinessUser;
        expect(component.getInitials(user)).toBe('AB');
    });

    it('contactFriend ne fait encore rien de visible pour l’utilisateur', () => {
        // Le bouton « Contacter » du template appelle cette méthode, qui se contente
        // de tracer : cliquer dessus ne fait rien. Stub non implémenté, pas un
        // comportement à figer — ce test signale l'écart au lieu de le masquer.
        const user = { firstName: 'John' } as unknown as BusinessUser;

        // Rien à vérifier au-delà de l'absence d'erreur : la méthode ne fait rien.
        expect(() => component.contactFriend(user)).not.toThrow();
    });

    it('should remove a friend', () => {
        component.friends = [
            { id: 1, firstName: 'John' } as any as BusinessUser,
            { id: 2, firstName: 'Jane' } as any as BusinessUser
        ];
        component.removeFriend(component.friends[0]);
        expect(component.friends.length).toBe(1);
        expect(component.friends[0].id).toBe(2);
    });
});
