import { Injectable } from '@angular/core';
import { Coordinates } from '../models/place.model';

/** OpenFreeMap: free vector tiles over OpenStreetMap, no key and no quota. */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** Lyon, where the demo lives: the map opens there when there is nothing else to show. */
export const DEFAULT_CENTER: Coordinates = { latitude: 45.764, longitude: 4.8357 };

/** Built by angular.json as its own file, not injected: only pages with a map pay for it. */
const STYLESHEET_HREF = 'maplibre.css';

export type MapLibre = typeof import('maplibre-gl');

let library: Promise<MapLibre> | null = null;

/**
 * MapLibre and its stylesheet, fetched the first time a map is shown. About 250 kB gzipped:
 * the calendar would otherwise make every visitor download it.
 */
export function loadMapLibre(): Promise<MapLibre> {
    if (!library) {
        addStylesheet();
        library = import('maplibre-gl').then(namedExports).catch(error => {
            library = null;
            throw error;
        });
    }
    return library;
}

/**
 * The library itself, whichever way the bundler wrapped it. MapLibre 5 ships as UMD: the dev
 * server exposes its named exports, the production build only a `default` holding them.
 */
export function namedExports(module: object): MapLibre {
    return ('Map' in module ? module : (module as { default: MapLibre }).default) as MapLibre;
}

function addStylesheet(): void {
    if (document.querySelector(`link[href="${STYLESHEET_HREF}"]`)) {
        return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLESHEET_HREF;
    document.head.appendChild(link);
}

/** What the map components inject, so tests can hand them a fake library. */
@Injectable({ providedIn: 'root' })
export class MapLoader {
    load(): Promise<MapLibre> {
        return loadMapLibre();
    }
}

/**
 * Folds the credits behind their (i) button. A compact attribution opens unfolded and only folds
 * once the map moves, covering the bottom of a small map until then.
 */
export function foldAttribution(container: HTMLElement): void {
    container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
}

/** MapLibre speaks [longitude, latitude]. */
export function toLngLat(point: Coordinates): [number, number] {
    return [point.longitude, point.latitude];
}
