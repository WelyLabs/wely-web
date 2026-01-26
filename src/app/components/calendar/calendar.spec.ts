import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CalendarComponent } from './calendar';
import { Event } from '../../services/event.service';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('CalendarComponent', () => {
    let component: CalendarComponent;
    let fixture: ComponentFixture<CalendarComponent>;
    let eventServiceMock: any;
    let routerMock: any;

    const mockEvents = [
        { id: 101, title: 'External Event', subscribed: true, date: new Date(), description: '...' }
    ];

    beforeEach(async () => {
        eventServiceMock = {
            events$: of(mockEvents)
        };
        routerMock = {
            navigate: vi.fn()
        };

        await TestBed.configureTestingModule({
            imports: [CalendarComponent, NoopAnimationsModule],
            providers: [
                { provide: Event, useValue: eventServiceMock },
                { provide: Router, useValue: routerMock }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(CalendarComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should generate calendar on init', () => {
        expect(component.days.length).toBe(42);
        expect(component.events.length).toBeGreaterThan(mockEvents.length); // personal + subscribed
    });

    it('should change month when nextMonth is called', () => {
        const initialMonth = component.currentDate.getMonth();
        component.nextMonth();
        expect(component.currentDate.getMonth()).toBe((initialMonth + 1) % 12);
    });

    it('should select a date and filter events', () => {
        const today = component.days.find(d => d.isToday);
        if (today) {
            component.selectDate(today);
            expect(component.selectedDate).toEqual(today.date);
            expect(component.selectedEvents.length).toBeGreaterThan(0); // Should have at least the personal events
        }
    });

    it('should navigate to details on viewEventDetails', () => {
        const event = component.personalEvents[0];
        component.viewEventDetails(event);
        expect(routerMock.navigate).toHaveBeenCalledWith(['/event', 'calendar', event.id], expect.any(Object));
    });

    it('should close details', () => {
        component.selectedDate = new Date();
        component.closeDetails();
        expect(component.selectedDate).toBeNull();
    });
});
