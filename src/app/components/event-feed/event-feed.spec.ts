import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EventFeedComponent } from './event-feed';
import { EventService } from '../../services/event.service';
import { SocialService } from '../../services/social.service';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

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
        expect(routerMock.navigate).toHaveBeenCalledWith(['/event', 'feed', event.id]);
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

});
