import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapLoader } from '../../services/map-loader';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Subject, of, throwError } from 'rxjs';
import { LocationPickerComponent, MIN_QUERY_LENGTH, coordinatesLabel } from './location-picker';
import { GeocodingService } from '../../services/geocoding.service';
import { Place } from '../../models/place.model';

const fake = vi.hoisted(() => {
    type Handler = (event?: unknown) => void;
    class FakeMap {
        static instances: FakeMap[] = [];
        handlers: Record<string, Handler> = {};
        flyTo = vi.fn();
        remove = vi.fn();
        constructor(public options: Record<string, unknown>) {
            FakeMap.instances.push(this);
        }
        on(event: string, handler: Handler) {
            this.handlers[event] = handler;
        }
        getCenter() {
            return { lat: 45.7, lng: 4.8 };
        }
    }
    class FakeMarker {
        static instances: FakeMarker[] = [];
        handlers: Record<string, Handler> = {};
        lngLat: [number, number] | null = null;
        addTo = vi.fn(() => this);
        constructor(public options: Record<string, unknown>) {
            FakeMarker.instances.push(this);
        }
        setLngLat(lngLat: [number, number]) {
            this.lngLat = lngLat;
            return this;
        }
        getLngLat() {
            return { lng: this.lngLat![0], lat: this.lngLat![1] };
        }
        on(event: string, handler: Handler) {
            this.handlers[event] = handler;
        }
    }
    return { FakeMap, FakeMarker, load: vi.fn() };
});

const transbordeur: Place = { label: 'Le Transbordeur, Villeurbanne', coordinates: { latitude: 45.784, longitude: 4.8608 } };

describe('LocationPickerComponent', () => {
    let fixture: ComponentFixture<LocationPickerComponent>;
    let component: LocationPickerComponent;
    let geocoding: { search: ReturnType<typeof vi.fn>; reverse: ReturnType<typeof vi.fn> };
    let picked: Place[];

    async function create(value: Place | null = null): Promise<void> {
        fixture = TestBed.createComponent(LocationPickerComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('value', value);
        picked = [];
        component.picked.subscribe(place => picked.push(place));
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    }

    /** The query reaches the search through toObservable's effect, which runs on a tick. */
    function type(query: string): void {
        component.onQueryChange(query);
        TestBed.tick();
    }

    beforeEach(() => {
        // debounceTime waits with setInterval and measures with Date.now.
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
        fake.FakeMap.instances = [];
        fake.FakeMarker.instances = [];
        fake.load.mockResolvedValue({ Map: fake.FakeMap, Marker: fake.FakeMarker });
        geocoding = { search: vi.fn().mockReturnValue(of([transbordeur])), reverse: vi.fn().mockReturnValue(of(transbordeur)) };
        TestBed.configureTestingModule({
            imports: [LocationPickerComponent],
            providers: [
                { provide: GeocodingService, useValue: geocoding },
                { provide: MapLoader, useValue: { load: fake.load } }
            ]
        });
    });

    afterEach(() => vi.useRealTimers());

    it('createMap_shouldOpenOnTheCityWithoutAPlace', async () => {
        await create();

        expect(component.mapState()).toBe('ready');
        expect(fake.FakeMap.instances[0].options).toMatchObject({ center: [4.8357, 45.764], zoom: 12 });
        expect(fake.FakeMarker.instances[0].addTo).not.toHaveBeenCalled();
    });

    it('createMap_shouldShowThePlaceAlreadyPicked', async () => {
        await create(transbordeur);

        expect(fake.FakeMap.instances[0].options).toMatchObject({ center: [4.8608, 45.784], zoom: 16 });
        expect(fake.FakeMarker.instances[0].lngLat).toEqual([4.8608, 45.784]);
    });

    it('createMap_shouldFoldTheCreditsOnceLoaded', async () => {
        await create();
        const credits = document.createElement('div');
        credits.className = 'maplibregl-ctrl-attrib maplibregl-compact-show';
        fixture.nativeElement.querySelector('.location-map').appendChild(credits);

        fake.FakeMap.instances[0].handlers['load']();

        expect(credits.classList.contains('maplibregl-compact-show')).toBe(false);
    });

    it('createMap_shouldSayWhenTheMapCannotLoad', async () => {
        fake.load.mockRejectedValue(new Error('offline'));

        await create();

        expect(component.mapState()).toBe('failed');
        expect(fixture.nativeElement.textContent).toContain("La carte n'a pas pu se charger");
    });

    it('suggestions_shouldSearchOnceTheTypingPauses', async () => {
        await create();
        type('trans');
        type('transbordeur');
        vi.advanceTimersByTime(300);

        expect(geocoding.search).toHaveBeenCalledTimes(1);
        expect(geocoding.search).toHaveBeenCalledWith('transbordeur', { latitude: 45.7, longitude: 4.8 });
        expect(component.suggestions()).toEqual([transbordeur]);
    });

    it('suggestions_shouldWaitForEnoughLetters', async () => {
        await create();

        type('ab'.slice(0, MIN_QUERY_LENGTH - 1));
        vi.advanceTimersByTime(300);

        expect(geocoding.search).not.toHaveBeenCalled();
        expect(component.suggestions()).toEqual([]);
    });

    it('suggestions_shouldBeEmptyWhenTheSearchFails', async () => {
        geocoding.search.mockReturnValue(throwError(() => new Error('down')));
        await create();

        type('transbordeur');
        vi.advanceTimersByTime(300);

        expect(component.suggestions()).toEqual([]);
    });

    it('choose_shouldPinFlyToAndEmitThePlace', async () => {
        await create();

        component.choose(transbordeur);

        expect(picked).toEqual([transbordeur]);
        expect(component.showSuggestions()).toBe(false);
        expect(fake.FakeMarker.instances[0].lngLat).toEqual([4.8608, 45.784]);
        expect(fake.FakeMap.instances[0].flyTo).toHaveBeenCalledWith({ center: [4.8608, 45.784], zoom: 16 });
    });

    it('onQueryChange_shouldShowSuggestionsAgain', async () => {
        await create();
        component.choose(transbordeur);

        component.onQueryChange('gare');

        expect(component.showSuggestions()).toBe(true);
    });

    it('pickPoint_shouldNameTheClickedPoint', async () => {
        await create();

        fake.FakeMap.instances[0].handlers['click']({ lngLat: { lat: 45.784, lng: 4.8608 } });

        expect(geocoding.reverse).toHaveBeenCalledWith({ latitude: 45.784, longitude: 4.8608 });
        expect(picked).toEqual([transbordeur]);
    });

    it('pickPoint_shouldFollowTheDraggedPin', async () => {
        await create(transbordeur);
        const marker = fake.FakeMarker.instances[0];
        marker.setLngLat([4.85, 45.75]);

        marker.handlers['dragend']();

        expect(geocoding.reverse).toHaveBeenCalledWith({ latitude: 45.75, longitude: 4.85 });
    });

    it('pickPoint_shouldKeepTheCoordinatesWhenThereIsNoAddress', async () => {
        geocoding.reverse.mockReturnValue(of(null));
        await create();

        component.pickPoint({ latitude: 45.5, longitude: 4.5 });

        expect(picked).toEqual([{ label: '45.50000, 4.50000', coordinates: { latitude: 45.5, longitude: 4.5 } }]);
    });

    it('pickPoint_shouldKeepTheCoordinatesWhenTheLookupFails', async () => {
        geocoding.reverse.mockReturnValue(throwError(() => new Error('down')));
        await create();

        component.pickPoint({ latitude: 45.5, longitude: 4.5 });

        expect(picked[0].label).toBe('45.50000, 4.50000');
    });

    it('ngOnDestroy_shouldReleaseTheMap', async () => {
        await create();

        fixture.destroy();

        expect(fake.FakeMap.instances[0].remove).toHaveBeenCalled();
    });

    it('template_shouldListTheSuggestions', async () => {
        await create();
        type('transbordeur');
        vi.advanceTimersByTime(300);
        fixture.detectChanges();

        const option = fixture.nativeElement.querySelector('[role="option"]') as HTMLElement;
        option.click();

        expect(option.textContent).toContain('Le Transbordeur');
        expect(picked).toEqual([transbordeur]);
    });

    it('stays pending while a lookup is in flight', async () => {
        const reverse = new Subject<Place | null>();
        geocoding.reverse.mockReturnValue(reverse);
        await create();

        component.pickPoint({ latitude: 45.5, longitude: 4.5 });
        expect(picked).toEqual([]);

        reverse.next(transbordeur);
        expect(picked).toEqual([transbordeur]);
    });
});

describe('coordinatesLabel', () => {
    it('coordinatesLabel_shouldRoundToAboutAMetre', () => {
        expect(coordinatesLabel({ latitude: 45.7640123, longitude: 4.835712 })).toBe('45.76401, 4.83571');
    });
});
