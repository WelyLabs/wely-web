import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Coordinates, Place } from '../models/place.model';

/**
 * Photon, komoot's geocoder over OpenStreetMap data: free, no key, and made for search-as-you-type.
 * Requests carry no token: the Keycloak interceptor only signs calls to our own API.
 */
export const PHOTON_URL = 'https://photon.komoot.io';

const SUGGESTION_LIMIT = 5;
/** Photon is asked for more than is shown: duplicates go, and nearby places come first. */
const FETCH_LIMIT = 12;
/** Within this, a place counts as nearby: about the size of a metropolitan area. */
export const NEARBY_KM = 50;
const EARTH_RADIUS_KM = 6371;

/** The properties of a Photon feature that make up a readable address. */
export interface PhotonProperties {
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    country?: string;
}

interface PhotonFeature {
    geometry: { coordinates: [number, number] };
    properties: PhotonProperties;
}

interface PhotonResponse {
    features: PhotonFeature[];
}

/** Distance between two points, close enough at city scale (equirectangular approximation). */
export function distanceKm(a: Coordinates, b: Coordinates): number {
    const toRadians = (degrees: number) => degrees * Math.PI / 180;
    const x = toRadians(b.longitude - a.longitude) * Math.cos(toRadians((a.latitude + b.latitude) / 2));
    const y = toRadians(b.latitude - a.latitude);
    return Math.sqrt(x * x + y * y) * EARTH_RADIUS_KM;
}

/**
 * One suggestion per label, nearby places first, otherwise in Photon's order.
 *
 * <p>Photon's own location bias loses to an exact name match: from Lyon, "Transbordeur" listed
 * two places on the Atlantic coast before the concert hall in Villeurbanne.
 */
export function rankSuggestions(places: Place[], near?: Coordinates, limit = SUGGESTION_LIMIT): Place[] {
    const unique = places.filter((place, index) => places.findIndex(other => other.label === place.label) === index);
    if (!near) {
        return unique.slice(0, limit);
    }
    const isNear = (place: Place) => distanceKm(place.coordinates, near) <= NEARBY_KM;
    return [...unique.filter(isNear), ...unique.filter(place => !isNear(place))].slice(0, limit);
}

/** "Le Transbordeur, Villeurbanne" or "12 Rue Paul Bert, Lyon": the name or street, then the city. */
export function placeLabel(properties: PhotonProperties): string {
    const street = [properties.housenumber, properties.street].filter(Boolean).join(' ');
    const first = properties.name ?? street;
    const city = properties.city ?? properties.district ?? properties.country;
    return [first, city].filter((part, index, parts) => part && parts.indexOf(part) === index).join(', ');
}

@Injectable({ providedIn: 'root' })
export class GeocodingService {
    private readonly http = inject(HttpClient);

    /** Places matching the text, ranked closer to `near` when given. */
    search(query: string, near?: Coordinates): Observable<Place[]> {
        let params = new HttpParams().set('q', query).set('lang', 'fr').set('limit', FETCH_LIMIT);
        if (near) {
            params = params.set('lat', near.latitude).set('lon', near.longitude);
        }
        return this.http.get<PhotonResponse>(`${PHOTON_URL}/api/`, { params })
            .pipe(map(response => rankSuggestions(response.features.map(toPlace), near)));
    }

    /** The address at a point clicked on the map, or null when there is none (at sea, say). */
    reverse(point: Coordinates): Observable<Place | null> {
        const params = new HttpParams().set('lat', point.latitude).set('lon', point.longitude).set('lang', 'fr');
        return this.http.get<PhotonResponse>(`${PHOTON_URL}/reverse`, { params }).pipe(
            map(response => response.features[0]),
            map(feature => feature ? { label: placeLabel(feature.properties), coordinates: point } : null)
        );
    }
}

function toPlace(feature: PhotonFeature): Place {
    // GeoJSON orders a point (longitude, latitude).
    const [longitude, latitude] = feature.geometry.coordinates;
    return { label: placeLabel(feature.properties), coordinates: { latitude, longitude } };
}
