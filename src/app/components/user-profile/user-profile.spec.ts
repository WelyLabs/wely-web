import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserProfileComponent } from './user-profile';
import { UserService } from '../../services/user.service';
import { MatDialog } from '@angular/material/dialog';
import { of, BehaviorSubject, throwError, Subject } from 'rxjs';
import { User } from '../../models/user.model';
import { MOCK_USER } from '../../models/user.mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { EventService, FeedEvent, ProfileSummary } from '../../services/event.service';
import { SocialService } from '../../services/social.service';
import { AvatarService } from '../../services/avatar.service';
import { MapLoader } from '../../services/map-loader';
import { memoryTint } from './user-profile';

describe('UserProfileComponent', () => {
    let component: UserProfileComponent;
    let fixture: ComponentFixture<UserProfileComponent>;
    let userServiceMock: any;
    let dialogMock: any;
    let userSubject: BehaviorSubject<User | null>;
    let eventServiceMock: { getMySummary: ReturnType<typeof vi.fn> };
    let socialServiceMock: { listFriendships: ReturnType<typeof vi.fn>; searchUsers: ReturnType<typeof vi.fn> };

    const feedEvent = (id: string, start: string): FeedEvent => ({
        id, title: `Event ${id}`, organizerId: 'me', startDate: new Date(start), endDate: new Date(start),
        location: 'Chez Léa', image: '', description: ''
    });
    const summary = (overrides: Partial<ProfileSummary> = {}): ProfileSummary => ({
        outingsThisYear: 23, outingsThisMonth: 4, organizedThisYear: 6, placesThisYear: 9,
        upcoming: [feedEvent('next', '2099-10-14T18:00:00Z')], memories: [feedEvent('past', '2026-09-01T18:00:00Z')],
        pastCount: 23,
        circle: [{ userId: 'lea', outingsTogether: 12 }, { userId: 'bob', outingsTogether: 3 }],
        places: [], balances: [], ...overrides
    });

    beforeEach(async () => {
        userSubject = new BehaviorSubject<User | null>(MOCK_USER);
        userServiceMock = {
            currentUser$: userSubject.asObservable(),
            loadAndSetCurrentUser: vi.fn().mockReturnValue(of(MOCK_USER)),
            getAbout: vi.fn().mockReturnValue(of({ bio: 'Toujours partante', interests: ['Rando', 'Ciné'] })),
            updateCurrentUser: vi.fn()
        };
        dialogMock = {
            open: vi.fn().mockImplementation(() => ({
                afterClosed: () => of(true),
                close: () => undefined
            }))
        };

        eventServiceMock = { getMySummary: vi.fn().mockReturnValue(of(summary())) };
        socialServiceMock = {
            listFriendships: vi.fn().mockReturnValue(of([{ userId: 'lea' }, { userId: 'bob' }, { userId: 'zoe' }])),
            searchUsers: vi.fn().mockReturnValue(of([{ userId: 'lea', userName: 'lea' }, { userId: 'bob', userName: 'bob' }]))
        };

        await TestBed.configureTestingModule({
            imports: [UserProfileComponent, NoopAnimationsModule],
            providers: [
                provideRouter([]),
                { provide: EventService, useValue: eventServiceMock },
                { provide: SocialService, useValue: socialServiceMock },
                { provide: AvatarService, useValue: { url: () => signal(null) } },
                { provide: MapLoader, useValue: { load: vi.fn().mockRejectedValue(new Error('no map in tests')) } }
            ]
        }).overrideComponent(UserProfileComponent, {
            set: {
                providers: [
                    { provide: UserService, useValue: userServiceMock },
                    { provide: MatDialog, useValue: dialogMock }
                ]
            }
        }).compileComponents();

        fixture = TestBed.createComponent(UserProfileComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should load user data and show initials on init', () => {
        expect(component.user()).toEqual(MOCK_USER);
        expect(component.initials()).toBe('TU');
    });

    it('should follow the service stream without a manual subscription', () => {
        // toSignal is what makes this safe: the previous version subscribed to currentUser$ — a
        // long-lived subject — in ngOnInit and never unsubscribed, leaving a live subscriber
        // behind on every visit to the page.
        userSubject.next({ ...MOCK_USER, firstName: 'Alice', lastName: 'Zephyr' });

        expect(component.user()?.firstName).toBe('Alice');
        expect(component.initials()).toBe('AZ');
    });

    it('should report no initials while the user is still unknown', () => {
        userSubject.next(null);

        expect(component.initials()).toBe('');
    });

    it('should call reloadUserProfile on init', () => {
        expect(userServiceMock.loadAndSetCurrentUser).toHaveBeenCalled();
    });

    it('should open avatar dialog and reload on confirm', () => {
        component.openAvatarDialog();
        expect(dialogMock.open).toHaveBeenCalled();
        expect(userServiceMock.loadAndSetCurrentUser).toHaveBeenCalledTimes(2); // Initial + afterClosed
    });

    it('openEditDialog_shouldOpenTheDialogWithTheCurrentUser', () => {
        component.openEditDialog();

        // Saving updates UserService's current user itself: nothing is copied back from the dialog.
        expect(dialogMock.open).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ data: component.user() }));
        expect(userServiceMock.updateCurrentUser).not.toHaveBeenCalled();
    });
    it('should stop showing the loader when the profile fails to load', () => {
        // The user has to be absent for this to mean anything: with one already emitted, the
        // computed reads false whatever the load did, and the assertion would pass for the
        // wrong reason.
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        userSubject.next(null);
        userServiceMock.loadAndSetCurrentUser.mockReturnValue(throwError(() => new Error('API Error')));

        component.reloadUserProfile();

        expect(component.isLoading()).toBe(false);
        expect(consoleSpy).toHaveBeenCalled();
    });

    it('should show the loader while no user has arrived yet', () => {
        userSubject.next(null);

        expect(component.isLoading()).toBe(true);
    });

    it('should show the loader again when a retry is started', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        userSubject.next(null);
        userServiceMock.loadAndSetCurrentUser.mockReturnValue(throwError(() => new Error('API Error')));
        component.reloadUserProfile();
        expect(component.isLoading()).toBe(false);

        userServiceMock.loadAndSetCurrentUser.mockReturnValue(new Subject());
        component.reloadUserProfile();

        expect(component.isLoading()).toBe(true);
        expect(consoleSpy).toHaveBeenCalled();
    });

    describe('summary', () => {
        it('stats_shouldShowTheYearInRealFigures', () => {
            expect(component.stats().map(stat => [stat.value, stat.label, stat.hint])).toEqual([
                [23, 'Sorties', 'dont 4 ce mois-ci'],
                [6, 'Organisées', 'par toi, cette année'],
                [3, 'Amis', 'sur Wely'],
                [9, 'Lieux', 'cette année']
            ]);
        });

        it('stats_shouldLeaveOutTheFriends_whenTheyCannotBeCounted', () => {
            component.friendCount.set(null);

            expect(component.stats().map(stat => stat.label)).toEqual(['Sorties', 'Organisées', 'Lieux']);
        });

        it('circle_shouldNameEachCompanion_andScaleTheirBar', () => {
            expect(component.circle().map(member => [member.name, member.share])).toEqual([['lea', 100], ['bob', 25]]);
        });

        it('accountsLabel_shouldSumWhatIsOwed_acrossEvents', () => {
            component.summary.set(summary({ balances: [
                { eventId: 'e1', title: 'Soirée jeux', netCents: -800 },
                { eventId: 'e2', title: 'Lac', netCents: -400 },
                { eventId: 'e3', title: 'Resto', netCents: 1500 }
            ] }));

            expect(component.accountsLabel().replace(/\s/g, ' ')).toBe('Tu dois 12,00 € sur 2 événements');
        });

        it('accountsLabel_shouldSayWhenTheMemberIsOwed_orEven', () => {
            component.summary.set(summary({ balances: [{ eventId: 'e3', title: 'Resto', netCents: 1500 }] }));
            expect(component.accountsLabel()).toBe('On te doit de l’argent sur 1 événement');

            component.summary.set(summary({ balances: [] }));
            expect(component.accountsLabel()).toBe('Tu es à jour sur tous tes événements');
        });

        it('template_shouldListTheNextOutingsAndMemories_withLinksToTheirEvents', () => {
            const links = [...fixture.nativeElement.querySelectorAll('a')].map((a: HTMLAnchorElement) => a.getAttribute('href'));

            expect(links).toContain('/event/next');
            expect(links).toContain('/event/past');
            expect(fixture.nativeElement.textContent).toContain('23 événements passés');
        });

        it('template_shouldDropTheOldPlaceholderSections', () => {
            const text = fixture.nativeElement.textContent as string;

            expect(text).not.toContain('Efficacité');
            expect(text).not.toContain('Projets');
            expect(text).not.toContain('Contacter');
        });

        it('template_shouldSayWhenTheSummaryIsUnavailable', () => {
            eventServiceMock.getMySummary.mockReturnValue(throwError(() => new Error('down')));
            component.loadSummary();
            fixture.detectChanges();

            expect(component.summaryState()).toBe('unavailable');
            expect(fixture.nativeElement.textContent).toContain('Tes sorties ne sont pas disponibles');
        });

        it('memoryTint_shouldKeepTheSameTintForTheSameEvent', () => {
            expect(memoryTint('abc')).toBe(memoryTint('abc'));
            expect(memoryTint('abc')).toContain('linear-gradient');
        });
    });

    describe('presentation', () => {
        it('template_shouldShowTheBioAndInterests', () => {
            const text = fixture.nativeElement.textContent as string;

            expect(text).toContain('Toujours partante');
            expect([...fixture.nativeElement.querySelectorAll('.interest')].map((chip: Element) => chip.textContent?.trim()))
                .toEqual(['Rando', 'Ciné']);
        });

        it('template_shouldInviteToWriteOne_whenThereIsNone', () => {
            component.about.set({ bio: null, interests: [] });
            fixture.detectChanges();

            expect(component.hasAbout()).toBe(false);
            expect(fixture.nativeElement.querySelector('.add-about')).not.toBeNull();
        });

        it('openAboutDialog_shouldShowWhatWasStored_onceSaved', () => {
            dialogMock.open.mockImplementation(() => ({ afterClosed: () => of({ bio: 'Nouvelle', interests: [] }) }));

            component.openAboutDialog();

            expect(dialogMock.open.mock.calls.at(-1)[1].data).toEqual({ bio: 'Toujours partante', interests: ['Rando', 'Ciné'] });
            expect(component.about()).toEqual({ bio: 'Nouvelle', interests: [] });
        });

        it('openAboutDialog_shouldKeepThePresentation_whenCancelled', () => {
            dialogMock.open.mockImplementation(() => ({ afterClosed: () => of(undefined) }));

            component.openAboutDialog();

            expect(component.about()?.bio).toBe('Toujours partante');
        });
    });
});
