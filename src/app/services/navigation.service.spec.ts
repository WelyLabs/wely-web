import { TestBed } from '@angular/core/testing';
import { Router, NavigationEnd } from '@angular/router';
import { Location } from '@angular/common';
import { Subject } from 'rxjs';
import { NavigationService } from './navigation.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('NavigationService', () => {
    let service: NavigationService;
    let routerMock: any;
    let locationMock: any;
    let routerEvents: Subject<any>;

    beforeEach(() => {
        routerEvents = new Subject<any>();
        routerMock = {
            events: routerEvents.asObservable(),
            navigateByUrl: vi.fn()
        };
        locationMock = {
            back: vi.fn()
        };

        TestBed.configureTestingModule({
            providers: [
                NavigationService,
                { provide: Router, useValue: routerMock },
                { provide: Location, useValue: locationMock }
            ]
        });

        service = TestBed.inject(NavigationService);
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should track history on NavigationEnd', () => {
        const url = '/test-url';
        routerEvents.next(new NavigationEnd(1, url, url));

        // Accessing private history via any cast for testing purposes
        expect((service as any).history).toContain(url);
    });

    it('should not push the same URL twice in a row', () => {
        const url = '/test-url';
        routerEvents.next(new NavigationEnd(1, url, url));
        routerEvents.next(new NavigationEnd(2, url, url));

        expect((service as any).history.length).toBe(1);
    });

    describe('back()', () => {
        it('should call location.back() if history has more than one entry', () => {
            routerEvents.next(new NavigationEnd(1, '/page1', '/page1'));
            routerEvents.next(new NavigationEnd(2, '/page2', '/page2'));

            service.back();

            expect(locationMock.back).toHaveBeenCalled();
        });

        it('should navigate to /conversations if history is empty after pop', () => {
            routerEvents.next(new NavigationEnd(1, '/page1', '/page1'));

            service.back();

            expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/conversations');
        });

        it('should pop from history when back() is called', () => {
            routerEvents.next(new NavigationEnd(1, '/page1', '/page1'));
            routerEvents.next(new NavigationEnd(2, '/page2', '/page2'));

            service.back();

            expect((service as any).history.length).toBe(1);
            expect((service as any).history[0]).toBe('/page1');
        });
    });
});
