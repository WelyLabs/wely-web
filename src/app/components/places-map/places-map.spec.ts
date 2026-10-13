import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MapLoader } from '../../services/map-loader';
import { VisitedPlace } from '../../services/event.service';
import { PlacesMapComponent, placeDots } from './places-map';

const fake = vi.hoisted(() => {
  class FakeMap {
    static instances: FakeMap[] = [];
    remove = vi.fn();
    on = vi.fn();
    constructor(public options: Record<string, unknown>) {
      FakeMap.instances.push(this);
    }
  }
  class FakeMarker {
    static instances: FakeMarker[] = [];
    lngLat: [number, number] | null = null;
    addTo = vi.fn(() => this);
    constructor(public options: { element: HTMLElement }) {
      FakeMarker.instances.push(this);
    }
    setLngLat(lngLat: [number, number]) {
      this.lngLat = lngLat;
      return this;
    }
  }
  class FakeBounds {
    points: [number, number][] = [];
    extend(point: [number, number]) {
      this.points.push(point);
      return this;
    }
  }
  return { FakeMap, FakeMarker, FakeBounds, load: vi.fn() };
});

const lyon = (visits: number, label = 'Chez Léa'): VisitedPlace =>
  ({ label, coordinates: { latitude: 45.76, longitude: 4.83 }, visits });

describe('placeDots', () => {
  it('placeDots_shouldSizeEachPlaceByItsVisits_andLeaveOutTypedPlaces', () => {
    const dots = placeDots([lyon(5), lyon(1, 'Parc'), { label: 'Tapé à la main', coordinates: null, visits: 9 }]);

    expect(dots.map(dot => [dot.label, dot.sizePx])).toEqual([['Chez Léa', 30], ['Parc', 14]]);
  });

  it('placeDots_shouldGiveTheSmallestDot_whenEveryPlaceWasVisitedOnce', () => {
    expect(placeDots([lyon(1)])[0].sizePx).toBe(14);
  });
});

describe('PlacesMapComponent', () => {
  let fixture: ComponentFixture<PlacesMapComponent>;

  async function create(places: VisitedPlace[]): Promise<void> {
    fixture = TestBed.createComponent(PlacesMapComponent);
    fixture.componentRef.setInput('places', places);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    fake.FakeMap.instances = [];
    fake.FakeMarker.instances = [];
    fake.load.mockReset();
    fake.load.mockResolvedValue({ Map: fake.FakeMap, Marker: fake.FakeMarker, LngLatBounds: fake.FakeBounds });
    TestBed.configureTestingModule({
      imports: [PlacesMapComponent],
      providers: [{ provide: MapLoader, useValue: { load: fake.load } }]
    });
  });

  it('createMap_shouldFrameEveryPlace_andDropOneDotEach', async () => {
    await create([lyon(3), { label: 'Parc', coordinates: { latitude: 45.78, longitude: 4.85 }, visits: 1 }]);

    const options = fake.FakeMap.instances[0].options as { bounds: { points: unknown[] }; cooperativeGestures: boolean };
    expect(options.bounds.points).toEqual([[4.83, 45.76], [4.85, 45.78]]);
    expect(options.cooperativeGestures).toBe(true);
    expect(fake.FakeMarker.instances.map(marker => marker.options.element.style.width)).toEqual(['30px', '14px']);
    expect(fake.FakeMarker.instances[0].options.element.title).toBe('Chez Léa · 3 sorties');
  });

  it('createMap_shouldNotLoadAMap_withoutAPlaceOnIt', async () => {
    await create([{ label: 'Tapé à la main', coordinates: null, visits: 2 }]);

    expect(fake.load).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Les lieux choisis sur la carte apparaîtront ici');
  });

  it('createMap_shouldSayWhenTheMapCannotLoad', async () => {
    fake.load.mockRejectedValue(new Error('offline'));

    await create([lyon(1)]);

    expect(fixture.componentInstance.failed()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain("La carte n'a pas pu se charger");
  });
});
