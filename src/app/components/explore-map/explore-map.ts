import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { Subject, catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';
import { EventService, FeedEvent } from '../../services/event.service';
import { Coordinates, MapArea } from '../../models/place.model';
import { DEFAULT_CENTER, MAP_STYLE_URL, MapLoader, foldAttribution, toLngLat } from '../../services/map-loader';
import { LoggerService } from '../../core/logging/logger.service';

/** The most wely-events answers with: reaching it means some events are left out. */
export const MAP_LIMIT = 200;
/** wely-events refuses a wider area: past a quarter of the globe, MongoDB reads the polygon inside out. */
export const MAX_SPAN_DEGREES = 90;
const CITY_ZOOM = 12;
/** Below this the map shows a continent, and the area would be clipped anyway. */
const MIN_ZOOM = 4;
const MOVE_DEBOUNCE_MS = 250;
/** Two events closer than this share a pin: about a metre. */
const SAME_PLACE_DECIMALS = 5;

/** Events at the same spot, which one pin stands for. */
export interface PlaceGroup {
    key: string;
    coordinates: Coordinates;
    events: FeedEvent[];
}

/** Groups the events placed on the map by spot, soonest first within each, in the order they came. */
export function groupByPlace(events: FeedEvent[]): PlaceGroup[] {
    const groups = new Map<string, PlaceGroup>();
    for (const event of events) {
        if (!event.coordinates) {
            continue;
        }
        const { latitude, longitude } = event.coordinates;
        const key = `${latitude.toFixed(SAME_PLACE_DECIMALS)},${longitude.toFixed(SAME_PLACE_DECIMALS)}`;
        const group = groups.get(key) ?? { key, coordinates: event.coordinates, events: [] };
        group.events.push(event);
        groups.set(key, group);
    }
    return [...groups.values()];
}

/**
 * The area to ask for: what the map shows, kept on the globe and within the span wely-events
 * accepts, around the centre when the screen is wider than that.
 */
export function visibleArea(south: number, west: number, north: number, east: number): MapArea {
    const clampSpan = (low: number, high: number, min: number, max: number): [number, number] => {
        const half = Math.min(high - low, MAX_SPAN_DEGREES) / 2;
        const centre = (low + high) / 2;
        return [Math.max(centre - half, min), Math.min(centre + half, max)];
    };
    const [s, n] = clampSpan(south, north, -90, 90);
    const [w, e] = clampSpan(west, east, -180, 180);
    return { south: s, west: w, north: n, east: e };
}

/**
 * The Explore map: upcoming events the user may see, around where the map looks, to join from
 * the pin. The events are asked for the area on screen after each move, not all at once.
 */
@Component({
    selector: 'app-explore-map',
    standalone: true,
    imports: [DatePipe, MatIconModule],
    templateUrl: './explore-map.html',
    styleUrl: './explore-map.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExploreMapComponent {
    private readonly eventService = inject(EventService);
    private readonly mapLoader = inject(MapLoader);
    private readonly router = inject(Router);
    private readonly logger = inject(LoggerService);
    private readonly destroyRef = inject(DestroyRef);

    /** Organiser id to name, resolved by the feed once for both of its views. */
    readonly organiserNames = input<ReadonlyMap<string, string>>(new Map());

    readonly mapState = signal<'loading' | 'ready' | 'failed'>('loading');
    readonly loadFailed = signal(false);
    readonly events = signal<FeedEvent[]>([]);
    readonly places = computed(() => groupByPlace(this.events()));
    readonly truncated = computed(() => this.events().length >= MAP_LIMIT);
    readonly selectedKey = signal<string | null>(null);
    readonly selected = computed(() => this.places().find(place => place.key === this.selectedKey()) ?? null);
    readonly joining = signal<string | null>(null);

    /** The ids of the events the user has joined, to show « Inscrit » rather than « Rejoindre ». */
    private readonly joinedIds = toSignal(
        this.eventService.subscribedEvents$.pipe(map(events => new Set(events.map(event => event.id)))),
        { initialValue: new Set<string>() }
    );

    private readonly container = viewChild.required<ElementRef<HTMLElement>>('map');
    private map: MapLibreMap | null = null;
    private markers: Marker[] = [];
    private markerFactory: ((element: HTMLElement, coordinates: Coordinates) => Marker) | null = null;
    private readonly moves = new Subject<MapArea>();

    constructor() {
        this.moves.pipe(
            debounceTime(MOVE_DEBOUNCE_MS),
            tap(() => this.loadFailed.set(false)),
            switchMap(area => this.eventService.getMapEvents(area).pipe(
                catchError(error => {
                    this.logger.warn('ExploreMapComponent', 'Map events could not load', error);
                    this.loadFailed.set(true);
                    return of(null);
                })
            )),
            takeUntilDestroyed(this.destroyRef)
        ).subscribe(events => {
            if (events) {
                this.events.set(events);
            }
        });
        // Redrawn when the events change, when one is joined, and once the map is ready.
        effect(() => {
            if (this.mapState() === 'ready') {
                this.drawPins(this.places(), this.joinedIds());
            }
        });
        afterNextRender(() => this.createMap());
        this.destroyRef.onDestroy(() => this.map?.remove());
    }

    isJoined(event: FeedEvent): boolean {
        return this.joinedIds().has(event.id);
    }

    organiserName(event: FeedEvent): string {
        return this.organiserNames().get(event.organizerId) ?? '';
    }

    select(key: string | null): void {
        this.selectedKey.set(key);
    }

    /** Joins, or leaves an event already joined: the same toggle the feed's swipe uses. */
    toggleJoin(event: FeedEvent): void {
        this.joining.set(event.id);
        this.eventService.toggleSubscription(event)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => this.joining.set(null),
                error: error => {
                    this.logger.error('ExploreMapComponent', 'Joining failed', error);
                    this.joining.set(null);
                }
            });
    }

    openDetails(event: FeedEvent): void {
        this.router.navigate(['/event', event.id]);
    }

    /** Centres the map on the user, if the browser knows and is allowed to tell. */
    locateMe(): void {
        navigator.geolocation?.getCurrentPosition(
            position => this.map?.flyTo({ center: [position.coords.longitude, position.coords.latitude], zoom: CITY_ZOOM }),
            error => this.logger.warn('ExploreMapComponent', 'Geolocation refused or unavailable', error)
        );
    }

    /** Asks for the events of the area now on screen. */
    onMoved(): void {
        const bounds = this.map?.getBounds();
        if (bounds) {
            this.moves.next(visibleArea(bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()));
        }
    }

    private async createMap(): Promise<void> {
        try {
            const maplibre = await this.mapLoader.load();
            this.map = new maplibre.Map({
                container: this.container().nativeElement,
                style: MAP_STYLE_URL,
                center: toLngLat(DEFAULT_CENTER),
                zoom: CITY_ZOOM,
                minZoom: MIN_ZOOM,
                attributionControl: { compact: true }
            });
            this.map.on('load', () => {
                foldAttribution(this.container().nativeElement);
                this.onMoved();
            });
            this.map.on('moveend', () => this.onMoved());
            this.map.on('click', () => this.select(null));
            this.markerFactory = (element, coordinates) =>
                new maplibre.Marker({ element, anchor: 'bottom' }).setLngLat(toLngLat(coordinates)).addTo(this.map!);
            this.mapState.set('ready');
        } catch (error) {
            this.logger.error('ExploreMapComponent', 'Map could not load', error);
            this.mapState.set('failed');
        }
    }

    /** One pin per place, built by hand: MapLibre places DOM elements, Angular does not render them. */
    private drawPins(places: PlaceGroup[], joinedIds: ReadonlySet<string>): void {
        this.markers.forEach(marker => marker.remove());
        this.markers = [];
        const create = this.markerFactory;
        if (!create) {
            return;
        }
        for (const place of places) {
            const pin = document.createElement('button');
            pin.type = 'button';
            pin.className = 'explore-pin';
            // MapLibre positions the element through its transform: the drop shape is a child.
            pin.appendChild(document.createElement('span')).className = 'drop';
            pin.classList.toggle('joined', place.events.some(event => joinedIds.has(event.id)));
            pin.setAttribute('aria-label', place.events.map(event => event.title).join(', '));
            if (place.events.length > 1) {
                pin.dataset['count'] = String(place.events.length);
            }
            pin.addEventListener('click', event => {
                event.stopPropagation();
                this.select(place.key);
            });
            this.markers.push(create(pin, place.coordinates));
        }
    }
}
