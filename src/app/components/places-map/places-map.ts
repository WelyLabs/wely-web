import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { VisitedPlace } from '../../services/event.service';
import { Coordinates } from '../../models/place.model';
import { MAP_STYLE_URL, MapLoader, foldAttribution, toLngLat } from '../../services/map-loader';
import { LoggerService } from '../../core/logging/logger.service';

/** Zoom when every place is the same spot: a neighbourhood. */
const SINGLE_PLACE_ZOOM = 13;
const PADDING_PX = 40;
/** Dot diameter for one visit, and for the most visited place. */
const MIN_DOT_PX = 14;
const MAX_DOT_PX = 30;

/** A place with coordinates, sized by how often the member went there. */
export interface PlaceDot {
  label: string;
  coordinates: Coordinates;
  visits: number;
  sizePx: number;
}

/** Bigger for the places visited most, relative to the most visited one. */
export function placeDots(places: VisitedPlace[]): PlaceDot[] {
  const located = places.filter((place): place is VisitedPlace & { coordinates: Coordinates } => place.coordinates !== null);
  const most = Math.max(1, ...located.map(place => place.visits));
  return located.map(place => ({
    label: place.label,
    coordinates: place.coordinates,
    visits: place.visits,
    sizePx: Math.round(MIN_DOT_PX + (MAX_DOT_PX - MIN_DOT_PX) * (place.visits - 1) / Math.max(1, most - 1))
  }));
}

/** The places a member went to, on a small map: one brand-coloured dot each, sized by visits. */
@Component({
  selector: 'app-places-map',
  standalone: true,
  templateUrl: './places-map.html',
  styleUrl: './places-map.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlacesMapComponent {
  private readonly logger = inject(LoggerService);
  private readonly mapLoader = inject(MapLoader);

  readonly places = input.required<VisitedPlace[]>();

  readonly dots = computed(() => placeDots(this.places()));
  readonly failed = signal(false);

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('map');
  private map: MapLibreMap | null = null;

  constructor() {
    afterNextRender(() => this.createMap());
    inject(DestroyRef).onDestroy(() => this.map?.remove());
  }

  private async createMap(): Promise<void> {
    const dots = this.dots();
    if (dots.length === 0) {
      return;
    }
    try {
      const maplibre = await this.mapLoader.load();
      const bounds = new maplibre.LngLatBounds();
      dots.forEach(dot => bounds.extend(toLngLat(dot.coordinates)));
      this.map = new maplibre.Map({
        container: this.container().nativeElement,
        style: MAP_STYLE_URL,
        bounds,
        fitBoundsOptions: { padding: PADDING_PX, maxZoom: SINGLE_PLACE_ZOOM },
        cooperativeGestures: true,
        attributionControl: { compact: true }
      });
      this.map.on('load', () => foldAttribution(this.container().nativeElement));
      for (const dot of dots) {
        // MapLibre places an element it is given: the dot's look lives in places-map.scss (.place-dot).
        const element = document.createElement('span');
        element.className = 'place-dot';
        element.style.width = element.style.height = `${dot.sizePx}px`;
        element.title = `${dot.label} · ${dot.visits} sortie${dot.visits > 1 ? 's' : ''}`;
        new maplibre.Marker({ element }).setLngLat(toLngLat(dot.coordinates)).addTo(this.map);
      }
    } catch (error) {
      this.logger.error('PlacesMapComponent', 'Map could not load', error);
      this.failed.set(true);
    }
  }
}
