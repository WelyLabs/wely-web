import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { EventDetailsComponent } from './event-details';
import { ActivatedRoute, Router } from '@angular/router';
import { EventService } from '../../services/event.service';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('EventDetailsComponent', () => {
    let component: EventDetailsComponent;
    let fixture: ComponentFixture<EventDetailsComponent>;
    let eventServiceMock: any;
    let routerMock: any;
    let activatedRouteMock: any;

    const mockFeedEvent = { id: 1, title: 'Feed Event', organizerId: 'Org 1', date: new Date(), location: 'Loc 1', image: '', description: 'Desc 1', subscribed: false };

    beforeEach(async () => {
        const MockIntersectionObserver = class {
            constructor(public callback: any) { }
            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
            root = null;
            rootMargin = '';
            thresholds = [];
            takeRecords = vi.fn();
        };
        vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

        eventServiceMock = {
            events$: of([mockFeedEvent])
        };
        routerMock = {
            navigate: vi.fn(),
            createUrlTree: vi.fn().mockReturnValue({}),
            serializeUrl: vi.fn().mockReturnValue('')
        };
        activatedRouteMock = {
            snapshot: {
                paramMap: {
                    get: (key: string) => key === 'id' ? '1' : 'feed'
                }
            }
        };

        await TestBed.configureTestingModule({
            imports: [EventDetailsComponent, NoopAnimationsModule],
        }).overrideComponent(EventDetailsComponent, {
            set: {
                providers: [
                    { provide: EventService, useValue: eventServiceMock },
                    { provide: Router, useValue: routerMock },
                    { provide: ActivatedRoute, useValue: activatedRouteMock }
                ]
            }
        }).compileComponents();

        fixture = TestBed.createComponent(EventDetailsComponent);
        component = fixture.componentInstance;
    });

    it('should create', () => {
        fixture.detectChanges();
        expect(component).toBeTruthy();
    });

    it('should load feed event from service on init', () => {
        fixture.detectChanges();
        expect(component.event).toEqual(mockFeedEvent);
        expect(component.isFeedEvent).toBe(true);
    });

    it('should load calendar event from history state', () => {
        const mockCalendarEvent = { id: 2, title: 'Cal Event', time: '10:00', date: new Date(), description: '...' };
        vi.spyOn(window.history, 'state', 'get').mockReturnValue({ event: mockCalendarEvent });
        activatedRouteMock.snapshot.paramMap.get = (key: string) => key === 'id' ? '2' : 'calendar';

        fixture.detectChanges();

        expect(component.event).toEqual(mockCalendarEvent);
        expect(component.isFeedEvent).toBe(false);
    });

    it('should navigate back to calendar', () => {
        component.goBack();
        expect(routerMock.navigate).toHaveBeenCalledWith(['/calendar']);
    });

    it('should format date correctly', () => {
        const date = new Date(2024, 0, 1); // Monday Jan 1 2024
        const formatted = component.formatDate(date);
        expect(formatted).toContain('janvier');
        expect(formatted).toContain('2024');
    });

    it('should handle sending messages in mock chat', () => {
        const initialCount = component.chatMessages.length;
        component.onSendMessage('New message');
        expect(component.chatMessages.length).toBe(initialCount + 1);
        expect(component.chatMessages[initialCount].text).toBe('New message');
    });
});
