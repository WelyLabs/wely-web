import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExploreMapComponent, MAP_LIMIT, MAX_SPAN_DEGREES, groupByPlace, visibleArea } from './explore-map';
import { EventService, FeedEvent } from '../../services/event.service';
import { MapLoader } from '../../services/map-loader';

const fake = vi.hoisted(() => {
    type Handler = () => void;
    class FakeMap {
        static instances: FakeMap[] = [];
        handlers: Record<string, Handler> = {};
        flyTo = vi.fn();
        remove = vi.fn();
        bounds = { south: 45.70, west: 4.77, north: 45.81, east: 4.92 };
        constructor(public options: Record<string, unknown>) {
            FakeMap.instances.push(this);
        }
        on(event: string, handler: Handler) {
            this.handlers[event] = handler;
        }
        getBounds() {
            const b = this.bounds;
            return { getSouth: () => b.south, getWest: () => b.west, getNorth: () => b.north, getEast: () => b.east };
        }
    }
    class FakeMarker {
        static instances: FakeMarker[] = [];
        element: HTMLElement;
        lngLat: [number, number] | null = null;
        remove = vi.fn();
        constructor(options: { element: HTMLElement }) {
            this.element = options.element;
            FakeMarker.instances.push(this);
        }
        setLngLat(lngLat: [number, number]) {
            this.lngLat = lngLat;
            return this;
        }
        addTo() {
            return this;
        }
    }
    return { FakeMap, FakeMarker, load: vi.fn() };
});

const at = (id: string, latitude: number, longitude: number, title = id): FeedEvent => ({
    id, title, organizerId: 'lea', startDate: new Date('2026-10-16T19:00:00Z'), endDate: new Date('2026-10-16T23:00:00Z'),
    location: 'Le Transbordeur', image: '', description: '', coordinates: { latitude, longitude }
});

describe('ExploreMapComponent', () => {
    let fixture: ComponentFixture<ExploreMapComponent>;
    let component: ExploreMapComponent;
    let eventService: { getMapEvents: ReturnType<typeof vi.fn>; toggleSubscription: ReturnType<typeof vi.fn>; subscribedEvents$: BehaviorSubject<FeedEvent[]> };
    let router: { navigate: ReturnType<typeof vi.fn> };
    const concert = at('1', 45.784, 4.8608, 'Concert');
    const quiz = at('2', 45.784, 4.8608, 'Quiz');
    const brunch = at('3', 45.767, 4.834, 'Brunch');

    async function create(): Promise<void> {
        fixture = TestBed.createComponent(ExploreMapComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('organiserNames', new Map([['lea', 'lea']]));
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    }

    /** The map has loaded, then the debounced request for its area went out. */
    function loadArea(): void {
        fake.FakeMap.instances[0].handlers['load']();
        vi.advanceTimersByTime(250);
        TestBed.tick();
    }

    beforeEach(() => {
        // debounceTime waits with setInterval and measures with Date.now.
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
        fake.FakeMap.instances = [];
        fake.FakeMarker.instances = [];
        fake.load.mockResolvedValue({ Map: fake.FakeMap, Marker: fake.FakeMarker });
        eventService = {
            getMapEvents: vi.fn().mockReturnValue(of([concert, quiz, brunch])),
            toggleSubscription: vi.fn().mockReturnValue(of(concert)),
            subscribedEvents$: new BehaviorSubject<FeedEvent[]>([])
        };
        router = { navigate: vi.fn() };
        TestBed.configureTestingModule({
            imports: [ExploreMapComponent],
            providers: [
                { provide: EventService, useValue: eventService },
                { provide: MapLoader, useValue: { load: fake.load } },
                { provide: Router, useValue: router }
            ]
        });
    });

    afterEach(() => vi.useRealTimers());

    it('createMap_shouldOpenOnTheCityAndKeepAContinentInView', async () => {
        await create();

        expect(component.mapState()).toBe('ready');
        expect(fake.FakeMap.instances[0].options).toMatchObject({ center: [4.8357, 45.764], zoom: 12, minZoom: 4 });
    });

    it('createMap_shouldSayWhenTheMapCannotLoad', async () => {
        fake.load.mockRejectedValue(new Error('offline'));

        await create();

        expect(component.mapState()).toBe('failed');
        expect(fixture.nativeElement.textContent).toContain("La carte n'a pas pu se charger");
    });

    it('onMoved_shouldAskForTheAreaOnScreenOnceTheMapSettles', async () => {
        await create();

        loadArea();

        expect(eventService.getMapEvents).toHaveBeenCalledWith({ south: 45.70, west: 4.77, north: 45.81, east: 4.92 });
        expect(component.events()).toEqual([concert, quiz, brunch]);
    });

    it('onMoved_shouldAskOnceForABurstOfMoves', async () => {
        await create();
        const map = fake.FakeMap.instances[0];

        map.handlers['moveend']();
        map.handlers['moveend']();
        map.handlers['moveend']();
        vi.advanceTimersByTime(250);

        expect(eventService.getMapEvents).toHaveBeenCalledTimes(1);
    });

    it('drawPins_shouldPutOnePinPerPlaceWithItsCount', async () => {
        await create();

        loadArea();

        const pins = fake.FakeMarker.instances.map(marker => marker.element);
        expect(pins).toHaveLength(2);
        expect(pins[0].dataset['count']).toBe('2');
        expect(pins[1].dataset['count']).toBeUndefined();
        expect(fake.FakeMarker.instances[0].lngLat).toEqual([4.8608, 45.784]);
    });

    it('drawPins_shouldReplaceThePinsOfThePreviousArea', async () => {
        await create();
        loadArea();
        const before = [...fake.FakeMarker.instances];
        eventService.getMapEvents.mockReturnValue(of([brunch]));

        fake.FakeMap.instances[0].handlers['moveend']();
        vi.advanceTimersByTime(250);
        TestBed.tick();

        before.forEach(marker => expect(marker.remove).toHaveBeenCalled());
        expect(fake.FakeMarker.instances.slice(before.length)).toHaveLength(1);
    });

    it('drawPins_shouldColourAPlaceTheUserJoined', async () => {
        await create();
        loadArea();

        eventService.subscribedEvents$.next([brunch]);
        TestBed.tick();

        const latest = fake.FakeMarker.instances.slice(-2).map(marker => marker.element);
        expect(latest[0].classList.contains('joined')).toBe(false);
        expect(latest[1].classList.contains('joined')).toBe(true);
    });

    it('select_shouldOpenTheSheetOfThePinClicked', async () => {
        await create();
        loadArea();

        fake.FakeMarker.instances[0].element.click();
        fixture.detectChanges();

        expect(component.selected()?.events).toEqual([concert, quiz]);
        const sheet = fixture.nativeElement.querySelector('.sheet') as HTMLElement;
        expect(sheet.textContent).toContain('Concert');
        expect(sheet.textContent).toContain('Quiz');
        expect(sheet.textContent).toContain('lea');
    });

    it('select_shouldCloseTheSheetOnAClickElsewhereOnTheMap', async () => {
        await create();
        loadArea();
        component.select(component.places()[0].key);

        fake.FakeMap.instances[0].handlers['click']();

        expect(component.selected()).toBeNull();
    });

    it('toggleJoin_shouldJoinThroughTheFeedsToggle', async () => {
        await create();

        component.toggleJoin(concert);

        expect(eventService.toggleSubscription).toHaveBeenCalledWith(concert);
        expect(component.joining()).toBeNull();
    });

    it('toggleJoin_shouldLetTheUserTryAgainAfterAFailure', async () => {
        eventService.toggleSubscription.mockReturnValue(throwError(() => new Error('down')));
        await create();

        component.toggleJoin(concert);

        expect(component.joining()).toBeNull();
    });

    it('isJoined_shouldFollowTheSubscribedEvents', async () => {
        await create();
        expect(component.isJoined(concert)).toBe(false);

        eventService.subscribedEvents$.next([concert]);

        expect(component.isJoined(concert)).toBe(true);
    });

    it('template_shouldOfferToLeaveAnEventAlreadyJoined', async () => {
        eventService.subscribedEvents$.next([concert]);
        await create();
        loadArea();
        component.select(component.places()[0].key);
        fixture.detectChanges();

        const buttons = fixture.nativeElement.querySelectorAll('.join') as NodeListOf<HTMLElement>;
        expect(buttons[0].textContent).toContain('Inscrit');
        expect(buttons[1].textContent).toContain('Rejoindre');
    });

    it('openDetails_shouldOpenTheEventPage', async () => {
        await create();

        component.openDetails(concert);

        expect(router.navigate).toHaveBeenCalledWith(['/event', 'feed', '1']);
    });

    it('truncated_shouldAskToZoomInWhenTheLimitIsReached', async () => {
        eventService.getMapEvents.mockReturnValue(of(Array.from({ length: MAP_LIMIT }, (_, i) => at(`e${i}`, 45.7, 4.8))));
        await create();

        loadArea();
        fixture.detectChanges();

        expect(component.truncated()).toBe(true);
        expect(fixture.nativeElement.textContent).toContain('zoomez');
    });

    it('loadFailed_shouldSayWhenTheEventsCannotLoad_andKeepThePreviousPins', async () => {
        await create();
        loadArea();
        eventService.getMapEvents.mockReturnValue(throwError(() => new Error('down')));

        fake.FakeMap.instances[0].handlers['moveend']();
        vi.advanceTimersByTime(250);
        fixture.detectChanges();

        expect(component.loadFailed()).toBe(true);
        expect(component.events()).toHaveLength(3);
        expect(fixture.nativeElement.textContent).toContain('Impossible de charger');
    });

    it('locateMe_shouldFlyToTheUser', async () => {
        const getCurrentPosition = vi.fn((success: PositionCallback) =>
            success({ coords: { latitude: 48.85, longitude: 2.35 } } as GeolocationPosition));
        vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
        await create();

        component.locateMe();

        expect(fake.FakeMap.instances[0].flyTo).toHaveBeenCalledWith({ center: [2.35, 48.85], zoom: 12 });
        vi.unstubAllGlobals();
    });

    it('locateMe_shouldStayPutWhenTheUserRefuses', async () => {
        const getCurrentPosition = vi.fn((_success: PositionCallback, failure: PositionErrorCallback) =>
            failure({ code: 1 } as GeolocationPositionError));
        vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
        await create();

        component.locateMe();

        expect(fake.FakeMap.instances[0].flyTo).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('ngOnDestroy_shouldReleaseTheMap', async () => {
        await create();

        fixture.destroy();

        expect(fake.FakeMap.instances[0].remove).toHaveBeenCalled();
    });
});

describe('groupByPlace', () => {
    it('groupByPlace_shouldShareAPinBetweenEventsAtTheSameSpot', () => {
        const groups = groupByPlace([at('1', 45.784, 4.8608), at('2', 45.7840001, 4.8608), at('3', 45.767, 4.834)]);

        expect(groups.map(group => group.events.map(event => event.id))).toEqual([['1', '2'], ['3']]);
    });

    it('groupByPlace_shouldLeaveOutEventsWithoutAPoint', () => {
        expect(groupByPlace([{ ...at('1', 0, 0), coordinates: null }])).toEqual([]);
    });
});

describe('visibleArea', () => {
    it('visibleArea_shouldKeepACityAsItIs', () => {
        expect(visibleArea(45.70, 4.77, 45.81, 4.92)).toEqual({ south: 45.70, west: 4.77, north: 45.81, east: 4.92 });
    });

    it('visibleArea_shouldNarrowAWideScreenAroundItsCentre', () => {
        const area = visibleArea(-10, -100, 10, 100);

        expect(area.east - area.west).toBe(MAX_SPAN_DEGREES);
        expect((area.east + area.west) / 2).toBe(0);
    });

    it('visibleArea_shouldStayOnTheGlobe', () => {
        expect(visibleArea(80, 170, 95, 190)).toEqual({ south: 80, west: 170, north: 90, east: 180 });
    });
});
