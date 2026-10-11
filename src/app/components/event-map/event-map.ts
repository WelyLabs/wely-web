import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Coordinates } from '../../models/place.model';
import { MAP_STYLE_URL, MapLoader, foldAttribution, toLngLat } from '../../services/map-loader';
import { LoggerService } from '../../core/logging/logger.service';

const ZOOM = 15;

/** The same point on openstreetmap.org, where directions and the surroundings are one click away. */
export function openStreetMapUrl(point: Coordinates): string {
    const { latitude, longitude } = point;
    return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
}

/** Where an event takes place, on a small map. */
@Component({
    selector: 'app-event-map',
    standalone: true,
    imports: [MatIconModule],
    templateUrl: './event-map.html',
    styleUrl: './event-map.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventMapComponent {
    private readonly logger = inject(LoggerService);
    private readonly mapLoader = inject(MapLoader);

    readonly coordinates = input.required<Coordinates>();
    readonly label = input('');

    readonly failed = signal(false);
    readonly externalUrl = computed(() => openStreetMapUrl(this.coordinates()));

    private readonly container = viewChild.required<ElementRef<HTMLElement>>('map');
    private map: MapLibreMap | null = null;

    constructor() {
        afterNextRender(() => this.createMap());
        inject(DestroyRef).onDestroy(() => this.map?.remove());
    }

    private async createMap(): Promise<void> {
        try {
            const maplibre = await this.mapLoader.load();
            const center = toLngLat(this.coordinates());
            this.map = new maplibre.Map({
                container: this.container().nativeElement,
                style: MAP_STYLE_URL,
                center,
                zoom: ZOOM,
                // Scrolling the page over the map should scroll the page, not zoom the map.
                cooperativeGestures: true,
                attributionControl: { compact: true }
            });
            this.map.on('load', () => foldAttribution(this.container().nativeElement));
            new maplibre.Marker({ color: '#3b82f6' }).setLngLat(center).addTo(this.map);
        } catch (error) {
            this.logger.error('EventMapComponent', 'Map could not load', error);
            this.failed.set(true);
        }
    }
}
