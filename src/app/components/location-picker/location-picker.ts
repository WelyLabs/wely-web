import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { Observable, catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { Coordinates, Place } from '../../models/place.model';
import { GeocodingService } from '../../services/geocoding.service';
import { DEFAULT_CENTER, MAP_STYLE_URL, MapLoader, foldAttribution, toLngLat } from '../../services/map-loader';
import { LoggerService } from '../../core/logging/logger.service';

/** Below this, a query matches half the country: not worth a request per keystroke. */
export const MIN_QUERY_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 300;
const CITY_ZOOM = 12;
const STREET_ZOOM = 16;

/** The text kept for a point with no address, such as the middle of a park. */
export function coordinatesLabel(point: Coordinates): string {
    return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
}

/**
 * Picks where an event takes place: an address search, and a map to click or drag the pin on.
 * MapLibre is loaded on first use, so only those who open the map download it.
 */
@Component({
    selector: 'app-location-picker',
    standalone: true,
    imports: [FormsModule, MatIconModule],
    templateUrl: './location-picker.html',
    styleUrl: './location-picker.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LocationPickerComponent {
    private readonly geocoding = inject(GeocodingService);
    private readonly logger = inject(LoggerService);
    private readonly mapLoader = inject(MapLoader);
    private readonly destroyRef = inject(DestroyRef);

    /** The place already chosen, shown when the map opens. */
    readonly value = input<Place | null>(null);
    readonly picked = output<Place>();

    readonly query = signal('');
    readonly mapState = signal<'loading' | 'ready' | 'failed'>('loading');

    private readonly container = viewChild.required<ElementRef<HTMLElement>>('map');
    private map: MapLibreMap | null = null;
    private marker: Marker | null = null;

    /** Suggestions for the query, ranked closer to where the map is looking. */
    readonly suggestions = toSignal(
        toObservable(this.query).pipe(
            debounceTime(SEARCH_DEBOUNCE_MS),
            map(query => query.trim()),
            distinctUntilChanged(),
            switchMap(query => query.length < MIN_QUERY_LENGTH ? of([]) : this.searchNear(query))
        ),
        { initialValue: [] as Place[] }
    );

    /** Cleared once a suggestion is chosen, until the query changes again. */
    readonly showSuggestions = signal(true);

    constructor() {
        afterNextRender(() => this.createMap());
        this.destroyRef.onDestroy(() => this.map?.remove());
    }

    onQueryChange(query: string): void {
        this.query.set(query);
        this.showSuggestions.set(true);
    }

    choose(place: Place): void {
        this.showSuggestions.set(false);
        this.pinAt(place.coordinates);
        this.map?.flyTo({ center: toLngLat(place.coordinates), zoom: STREET_ZOOM });
        this.picked.emit(place);
    }

    /** A click or a drag on the map: the pin moves there, then the address is looked up. */
    pickPoint(point: Coordinates): void {
        this.pinAt(point);
        this.geocoding.reverse(point)
            .pipe(
                catchError(error => {
                    this.logger.warn('LocationPickerComponent', 'Reverse geocoding failed', error);
                    return of(null);
                }),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe(place => this.picked.emit(place ?? { label: coordinatesLabel(point), coordinates: point }));
    }

    private searchNear(query: string): Observable<Place[]> {
        const center = this.map?.getCenter();
        const near = center ? { latitude: center.lat, longitude: center.lng } : this.value()?.coordinates;
        return this.geocoding.search(query, near).pipe(
            catchError(error => {
                this.logger.warn('LocationPickerComponent', 'Address search failed', error);
                return of([]);
            })
        );
    }

    private async createMap(): Promise<void> {
        try {
            const maplibre = await this.mapLoader.load();
            const initial = this.value()?.coordinates;
            this.map = new maplibre.Map({
                container: this.container().nativeElement,
                style: MAP_STYLE_URL,
                center: toLngLat(initial ?? DEFAULT_CENTER),
                zoom: initial ? STREET_ZOOM : CITY_ZOOM,
                attributionControl: { compact: true }
            });
            this.marker = new maplibre.Marker({ color: '#3b82f6', draggable: true });
            this.marker.on('dragend', () => {
                const { lat, lng } = this.marker!.getLngLat();
                this.pickPoint({ latitude: lat, longitude: lng });
            });
            this.map.on('load', () => foldAttribution(this.container().nativeElement));
            this.map.on('click', event => this.pickPoint({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }));
            if (initial) {
                this.pinAt(initial);
            }
            this.mapState.set('ready');
        } catch (error) {
            this.logger.error('LocationPickerComponent', 'Map could not load', error);
            this.mapState.set('failed');
        }
    }

    private pinAt(point: Coordinates): void {
        if (this.map && this.marker) {
            this.marker.setLngLat(toLngLat(point)).addTo(this.map);
        }
    }
}
