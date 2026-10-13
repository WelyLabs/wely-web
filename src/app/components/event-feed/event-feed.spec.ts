import { ComponentFixture, DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { EventFeedComponent } from './event-feed';
import { EventService } from '../../services/event.service';
import { SocialService } from '../../services/social.service';
import { Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { eventTint } from '../../core/ui/event-tint';

describe('EventFeedComponent', () => {
    let component: EventFeedComponent;
    let fixture: ComponentFixture<EventFeedComponent>;
    let eventServiceMock: any;
    let socialServiceMock: any;
    let routerMock: any;

    let currentMockEvents: any[];

    beforeEach(async () => {
        currentMockEvents = [
            { id: '1', title: 'Event 1', organizerId: 'Org 1', startDate: new Date(), endDate: new Date(), location: 'Loc 1', image: '', description: 'Desc 1' }
        ];

        eventServiceMock = {
            refreshEvents: vi.fn(),
            feedEvents$: of(currentMockEvents),
            toggleSubscription: vi.fn().mockReturnValue(of({}))
        };
        socialServiceMock = {
            searchUsers: vi.fn().mockReturnValue(of([
                { userId: 'Org 1', userName: 'madie', relationStatus: 'FRIEND' }
            ]))
        };
        routerMock = {
            navigate: vi.fn(),
            createUrlTree: vi.fn().mockReturnValue({}),
            serializeUrl: vi.fn().mockReturnValue('')
        };

        await TestBed.configureTestingModule({
            imports: [EventFeedComponent, NoopAnimationsModule],
            // The map is its own deferred chunk: it stays a placeholder here and is tested on its own.
            deferBlockBehavior: DeferBlockBehavior.Manual,
            providers: [
                { provide: EventService, useValue: eventServiceMock },
                { provide: SocialService, useValue: socialServiceMock },
                { provide: Router, useValue: routerMock }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(EventFeedComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should load events on init', () => {
        expect(component.currentEvents()).toEqual(currentMockEvents);
    });

    it('should show at most three cards at once', () => {
        expect(component.currentEvents().length).toBeLessThanOrEqual(3);
    });

    it('should toggle subscription when swiped right', () => {
        vi.useFakeTimers();
        component.swipeRight();
        vi.advanceTimersByTime(300);
        expect(eventServiceMock.toggleSubscription).toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('should drop the card without subscribing when swiped left', () => {
        vi.useFakeTimers();
        const before = component.currentEvents().length;

        component.swipeLeft();
        vi.advanceTimersByTime(300);

        expect(eventServiceMock.toggleSubscription).not.toHaveBeenCalled();
        expect(component.currentEvents().length).toBe(before - 1);
        vi.useRealTimers();
    });

    it('should not empty the array the service handed it', () => {
        // The previous version called events.shift(), and that array came straight from the
        // service's own stream: swiping drained the service's copy along with the component's.
        vi.useFakeTimers();

        component.swipeLeft();
        vi.advanceTimersByTime(300);

        expect(currentMockEvents.length).toBe(1);
        vi.useRealTimers();
    });

    it('should reset the card after a swipe completes', () => {
        vi.useFakeTimers();

        component.swipeLeft();
        vi.advanceTimersByTime(300);

        expect(component.cardTransform()).toBe('');
        expect(component.leftOverlayOpacity()).toBe(0);
        expect(component.rightOverlayOpacity()).toBe(0);
        vi.useRealTimers();
    });

    it('should do nothing when swiping right with no card left', () => {
        vi.useFakeTimers();
        component.swipeLeft();
        vi.advanceTimersByTime(300);
        expect(component.currentEvents()).toHaveLength(0);

        component.swipeRight();
        vi.advanceTimersByTime(300);

        expect(eventServiceMock.toggleSubscription).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('should scale and offset each card behind the top one', () => {
        expect(component.getStackTransform(0)).toBe('scale(1) translateY(0px)');
        expect(component.getStackTransform(2)).toBe('scale(0.9) translateY(20px)');
    });

    it('should follow a mouse drag and tilt the card', () => {
        vi.useFakeTimers();
        const frames: (() => void)[] = [];
        vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
            frames.push(callback);
            return frames.length;
        });
        vi.stubGlobal('cancelAnimationFrame', () => undefined);

        component.onCardMouseDown({ clientX: 0, preventDefault: () => undefined } as MouseEvent);
        expect(component.cardTransition()).toBe('none');

        component.onCardMouseMove({ clientX: 60 } as MouseEvent);
        frames.forEach(frame => frame());

        expect(component.cardTransform()).toBe('translateX(60px) rotate(3deg)');
        expect(component.rightOverlayOpacity()).toBeCloseTo(0.6);
        expect(component.leftOverlayOpacity()).toBe(0);

        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('should return the card to centre when the drag is too short', () => {
        component.onCardMouseDown({ clientX: 0, preventDefault: () => undefined } as MouseEvent);
        component.onCardMouseUp({} as MouseEvent);

        expect(component.cardTransform()).toBe('');
        expect(component.cardTransition()).not.toBe('none');
    });

    it('should ignore a move or release that no drag started', () => {
        component.onCardMouseMove({ clientX: 500 } as MouseEvent);
        component.onCardTouchEnd({} as TouchEvent);

        expect(component.cardTransform()).toBe('');
    });

    it('should navigate to event details', () => {
        const event = currentMockEvents[0];
        component.viewEventDetails(event);
        expect(routerMock.navigate).toHaveBeenCalledWith(['/event', event.id]);
    });
    it('shows the organiser name rather than their business id', () => {
        // The card used to print organizerId verbatim, which is a UUID: a feed event carries
        // no name, because wely-events does not know who its users are.
        expect(component.organiserName('Org 1')).toBe('madie');
    });

    it('shows nothing for an organiser the social service does not know', () => {
        // Better an absent line than a UUID: the card still reads as a card.
        expect(component.organiserName('unknown-id')).toBe('');
    });

    describe('views', () => {
        it('view_shouldStartOnTheCards', () => {
            expect(component.view()).toBe('swipe');
            expect(fixture.nativeElement.querySelector('.swipe-container')).not.toBeNull();
        });

        it('showView_shouldSwapTheCardsForTheMap', async () => {
            // Swipe, grid, map: the map is the third button.
            (fixture.nativeElement.querySelectorAll('.view-switch button')[2] as HTMLButtonElement).click();
            fixture.detectChanges();

            expect(component.view()).toBe('map');
            expect(fixture.nativeElement.querySelector('.swipe-container')).toBeNull();
            const [map] = await fixture.getDeferBlocks();
            expect(map).toBeDefined();
            expect(fixture.nativeElement.querySelector('.map-placeholder')).not.toBeNull();
        });

        it('showView_shouldBringTheCardsBack', () => {
            component.showView('map');
            fixture.detectChanges();

            component.showView('swipe');
            fixture.detectChanges();

            expect(fixture.nativeElement.querySelector('.swipe-container')).not.toBeNull();
        });

        it('organiserNames_shouldBeSharedWithTheMap', () => {
            expect(component.organiserNames().get('Org 1')).toBe('madie');
        });
    });

    describe('grid', () => {
        const event = (id: string, startDate: Date) =>
            ({ id, title: `Event ${id}`, organizerId: 'Org 1', startDate, endDate: startDate, location: 'Loc', image: null, description: '' });

        const cards = () => fixture.nativeElement.querySelectorAll('.grid-card');

        it('showView_shouldLayTheFeedOutInAGrid', () => {
            (fixture.nativeElement.querySelectorAll('.view-switch button')[1] as HTMLButtonElement).click();
            fixture.detectChanges();

            expect(component.view()).toBe('grid');
            expect(cards().length).toBe(1);
            expect(fixture.nativeElement.querySelector('.swipe-container')).toBeNull();
            expect(fixture.nativeElement.querySelector('.grid-card h2').textContent).toContain('Event 1');
        });

        it('gridEvents_shouldComeSoonestFirst', () => {
            const later = event('later', new Date('2026-12-02T10:00:00Z'));
            const sooner = event('sooner', new Date('2026-12-01T10:00:00Z'));
            (component as any).feed.set([later, sooner]);

            expect(component.gridEvents().map(e => e.id)).toEqual(['sooner', 'later']);
        });

        it('gridEvents_shouldKeepACardSkippedWhileSwiping', () => {
            vi.useFakeTimers();
            component.swipeLeft();
            vi.advanceTimersByTime(300);
            vi.useRealTimers();

            expect(component.currentEvents().length).toBe(0);
            expect(component.gridEvents().length).toBe(1);
        });

        it('card_shouldOpenTheEvent', () => {
            component.showView('grid');
            fixture.detectChanges();

            fixture.nativeElement.querySelector('.grid-card-open').click();

            expect(routerMock.navigate).toHaveBeenCalledWith(['/event', '1']);
        });

        it('join_shouldSubscribe_andTakeTheCardOutOfTheGridAndTheDeck', () => {
            component.showView('grid');
            fixture.detectChanges();

            fixture.nativeElement.querySelector('.grid-card-join').click();
            fixture.detectChanges();

            expect(eventServiceMock.toggleSubscription).toHaveBeenCalledWith(currentMockEvents[0]);
            expect(cards().length).toBe(0);
            expect(component.currentEvents().length).toBe(0);
            expect(fixture.nativeElement.querySelector('.empty-state')).not.toBeNull();
        });

        it('join_shouldIgnoreASecondTapWhileTheFirstIsOnItsWay', () => {
            const pending = new Subject<unknown>();
            eventServiceMock.toggleSubscription.mockReturnValue(pending);

            component.join(currentMockEvents[0]);
            component.join(currentMockEvents[0]);

            expect(eventServiceMock.toggleSubscription).toHaveBeenCalledTimes(1);
            expect(component.isJoining(currentMockEvents[0])).toBe(true);
        });

        it('join_shouldKeepTheCard_whenTheRequestFails', () => {
            eventServiceMock.toggleSubscription.mockReturnValue(throwError(() => new Error('503')));

            component.join(currentMockEvents[0]);

            expect(component.gridEvents().length).toBe(1);
            expect(component.isJoining(currentMockEvents[0])).toBe(false);
        });
    });

    describe('touch', () => {
        const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] } as unknown as TouchEvent);

        beforeEach(() => {
            vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { callback(); return 1; });
            vi.stubGlobal('cancelAnimationFrame', () => undefined);
        });

        afterEach(() => {
            vi.unstubAllGlobals();
            vi.useRealTimers();
        });

        it('swipeRight_shouldIgnoreASecondTapWhileTheCardIsFlying', () => {
            vi.useFakeTimers();

            component.swipeRight();
            component.swipeRight();
            vi.advanceTimersByTime(600);

            expect(eventServiceMock.toggleSubscription).toHaveBeenCalledTimes(1);
        });

        it('onCardTouchMove_shouldLeaveAVerticalScrollAlone', () => {
            component.onCardTouchStart(touch(100, 100));
            component.onCardTouchMove(touch(110, 160));
            component.onCardTouchMove(touch(260, 400));
            component.onCardTouchEnd({} as TouchEvent);

            expect(component.cardTransform()).toBe('');
            expect(eventServiceMock.toggleSubscription).not.toHaveBeenCalled();
        });

        it('onCardTouchMove_shouldFollowAHorizontalSwipe', () => {
            component.onCardTouchStart(touch(100, 100));
            component.onCardTouchMove(touch(160, 104));

            expect(component.cardTransform()).toContain('translateX(60px)');
        });

        it('onCardTouchCancel_shouldPutTheCardBack', () => {
            component.onCardTouchStart(touch(100, 100));
            component.onCardTouchMove(touch(160, 104));

            component.onCardTouchCancel({} as TouchEvent);

            expect(component.cardTransform()).toBe('');
            expect(component.rightOverlayOpacity()).toBe(0);
        });
    });

    it('cardBackground_shouldUseTheCover_orTheEventsGradientWithout', () => {
        expect(component.cardBackground({ ...currentMockEvents[0], image: 'https://media/cover.jpg' }))
            .toBe('url("https://media/cover.jpg")');
        expect(component.cardBackground({ ...currentMockEvents[0], image: null })).toBe(eventTint('1'));
    });

    it('template_shouldShowAGradientTile_forAnEventWithoutCover', () => {
        const card = fixture.nativeElement.querySelector('.card-image') as HTMLElement;

        expect(card.classList).toContain('no-image');
        expect(card.style.backgroundImage).toContain('linear-gradient');
        expect(card.style.backgroundImage).not.toContain('url(');
    });
});
