import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapLoader } from '../../services/map-loader';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventMapComponent, openStreetMapUrl } from './event-map';

const fake = vi.hoisted(() => {
    class FakeMap {
        static instances: FakeMap[] = [];
        remove = vi.fn();
        handlers: Record<string, () => void> = {};
        constructor(public options: Record<string, unknown>) {
            FakeMap.instances.push(this);
        }
        on(event: string, handler: () => void) {
            this.handlers[event] = handler;
        }
    }
    class FakeMarker {
        static instances: FakeMarker[] = [];
        lngLat: [number, number] | null = null;
        addTo = vi.fn(() => this);
        constructor() {
            FakeMarker.instances.push(this);
        }
        setLngLat(lngLat: [number, number]) {
            this.lngLat = lngLat;
            return this;
        }
    }
    return { FakeMap, FakeMarker, load: vi.fn() };
});

const point = { latitude: 45.784, longitude: 4.8608 };

describe('EventMapComponent', () => {
    let fixture: ComponentFixture<EventMapComponent>;

    async function create(): Promise<void> {
        fixture = TestBed.createComponent(EventMapComponent);
        fixture.componentRef.setInput('coordinates', point);
        fixture.componentRef.setInput('label', 'Le Transbordeur');
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    }

    beforeEach(() => {
        fake.FakeMap.instances = [];
        fake.FakeMarker.instances = [];
        fake.load.mockResolvedValue({ Map: fake.FakeMap, Marker: fake.FakeMarker });
        TestBed.configureTestingModule({
            imports: [EventMapComponent],
            providers: [{ provide: MapLoader, useValue: { load: fake.load } }]
        });
    });

    it('createMap_shouldPinTheEventWithoutStealingThePageScroll', async () => {
        await create();

        expect(fake.FakeMap.instances[0].options).toMatchObject({ center: [4.8608, 45.784], cooperativeGestures: true });
        expect(fake.FakeMarker.instances[0].lngLat).toEqual([4.8608, 45.784]);
    });

    it('createMap_shouldFoldTheCreditsOnceLoaded', async () => {
        await create();
        const credits = document.createElement('div');
        credits.className = 'maplibregl-ctrl-attrib maplibregl-compact-show';
        fixture.nativeElement.querySelector('.map').appendChild(credits);

        fake.FakeMap.instances[0].handlers['load']();

        expect(credits.classList.contains('maplibregl-compact-show')).toBe(false);
    });

    it('createMap_shouldSayWhenTheMapCannotLoad', async () => {
        fake.load.mockRejectedValue(new Error('offline'));

        await create();

        expect(fixture.componentInstance.failed()).toBe(true);
        expect(fixture.nativeElement.textContent).toContain("La carte n'a pas pu se charger");
    });

    it('template_shouldLinkToOpenStreetMap', async () => {
        await create();

        const link = fixture.nativeElement.querySelector('a.external') as HTMLAnchorElement;
        expect(link.href).toBe(openStreetMapUrl(point));
        expect(link.rel).toContain('noopener');
    });

    it('ngOnDestroy_shouldReleaseTheMap', async () => {
        await create();

        fixture.destroy();

        expect(fake.FakeMap.instances[0].remove).toHaveBeenCalled();
    });
});

describe('openStreetMapUrl', () => {
    it('openStreetMapUrl_shouldMarkThePoint', () => {
        expect(openStreetMapUrl(point)).toBe('https://www.openstreetmap.org/?mlat=45.784&mlon=4.8608#map=17/45.784/4.8608');
    });
});
