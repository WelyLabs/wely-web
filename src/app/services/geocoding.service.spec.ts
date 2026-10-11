import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GeocodingService, PHOTON_URL, distanceKm, placeLabel, rankSuggestions } from './geocoding.service';
import { Place } from '../models/place.model';

const transbordeur = {
    geometry: { coordinates: [4.860794, 45.7840386] },
    properties: { name: 'Le Transbordeur', street: 'Boulevard de la Bataille de Stalingrad', city: 'Villeurbanne' }
};

describe('GeocodingService', () => {
    let service: GeocodingService;
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        service = TestBed.inject(GeocodingService);
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('search_shouldTurnPhotonFeaturesIntoPlaces', () => {
        let places: Place[] = [];
        service.search('transbordeur').subscribe(result => places = result);

        const request = http.expectOne(req => req.url === `${PHOTON_URL}/api/`);
        expect(request.request.params.get('q')).toBe('transbordeur');
        expect(request.request.params.get('lang')).toBe('fr');
        expect(request.request.params.has('lat')).toBe(false);
        request.flush({ features: [transbordeur] });

        expect(places).toEqual([{
            label: 'Le Transbordeur, Villeurbanne',
            coordinates: { latitude: 45.7840386, longitude: 4.860794 }
        }]);
    });

    it('search_shouldRankResultsNearThePointGiven', () => {
        const echillais = { geometry: { coordinates: [-0.93, 45.92] }, properties: { name: 'Transbordeur', city: 'Échillais' } };
        let places: Place[] = [];
        service.search('transbordeur', { latitude: 45.76, longitude: 4.83 }).subscribe(result => places = result);

        const request = http.expectOne(req => req.url === `${PHOTON_URL}/api/`);
        expect(request.request.params.get('lat')).toBe('45.76');
        expect(request.request.params.get('lon')).toBe('4.83');
        request.flush({ features: [echillais, transbordeur] });

        expect(places.map(place => place.label)).toEqual(['Le Transbordeur, Villeurbanne', 'Transbordeur, Échillais']);
    });

    it('search_shouldSendNoToken', () => {
        service.search('lyon').subscribe();

        const request = http.expectOne(req => req.url === `${PHOTON_URL}/api/`);
        expect(request.request.headers.has('Authorization')).toBe(false);
        request.flush({ features: [] });
    });

    it('reverse_shouldNameThePointClicked', () => {
        const point = { latitude: 45.784, longitude: 4.8608 };
        let place: Place | null = null;
        service.reverse(point).subscribe(result => place = result);

        const request = http.expectOne(req => req.url === `${PHOTON_URL}/reverse`);
        expect(request.request.params.get('lat')).toBe('45.784');
        request.flush({ features: [transbordeur] });

        // The point stays where it was clicked, not on the address Photon snapped to.
        expect(place).toEqual({ label: 'Le Transbordeur, Villeurbanne', coordinates: point });
    });

    it('reverse_shouldBeNullWhereThereIsNoAddress', () => {
        let place: Place | null | undefined;
        service.reverse({ latitude: 0, longitude: 0 }).subscribe(result => place = result);

        http.expectOne(req => req.url === `${PHOTON_URL}/reverse`).flush({ features: [] });

        expect(place).toBeNull();
    });
});

describe('placeLabel', () => {
    it('placeLabel_shouldPutTheNameThenTheCity', () => {
        expect(placeLabel({ name: 'Le Transbordeur', street: 'Bd de Stalingrad', city: 'Villeurbanne' }))
            .toBe('Le Transbordeur, Villeurbanne');
    });

    it('placeLabel_shouldFallBackOnTheStreetAndNumber', () => {
        expect(placeLabel({ housenumber: '12', street: 'Rue Paul Bert', city: 'Lyon' })).toBe('12 Rue Paul Bert, Lyon');
    });

    it('placeLabel_shouldNotRepeatACityThatIsTheName', () => {
        expect(placeLabel({ name: 'Lyon', city: 'Lyon' })).toBe('Lyon');
    });

    it('placeLabel_shouldUseTheDistrictOrCountryWithoutACity', () => {
        expect(placeLabel({ name: 'Mont Thou', district: 'Saint-Cyr' })).toBe('Mont Thou, Saint-Cyr');
        expect(placeLabel({ name: 'Mont Blanc', country: 'France' })).toBe('Mont Blanc, France');
    });
});

describe('rankSuggestions', () => {
    const lyon = { latitude: 45.764, longitude: 4.8357 };
    const at = (label: string, latitude: number, longitude: number) => ({ label, coordinates: { latitude, longitude } });

    it('rankSuggestions_shouldPutNearbyPlacesFirstAndKeepPhotonsOrderOtherwise', () => {
        const places = [at('Far A', 45.9, -0.9), at('Near A', 45.78, 4.86), at('Far B', 43.5, -1.5), at('Near B', 45.75, 4.85)];

        expect(rankSuggestions(places, lyon).map(place => place.label)).toEqual(['Near A', 'Near B', 'Far A', 'Far B']);
    });

    it('rankSuggestions_shouldDropRepeatedLabels', () => {
        const places = [at('Gare Part-Dieu, Lyon', 45.76, 4.86), at('Gare Part-Dieu, Lyon', 45.761, 4.861)];

        expect(rankSuggestions(places, lyon)).toHaveLength(1);
    });

    it('rankSuggestions_shouldOnlyDeduplicateWithoutAPoint', () => {
        const places = [at('B', 1, 1), at('A', 45.76, 4.86), at('B', 1, 1)];

        expect(rankSuggestions(places).map(place => place.label)).toEqual(['B', 'A']);
    });

    it('rankSuggestions_shouldKeepAtMostTheLimit', () => {
        const places = Array.from({ length: 8 }, (_, index) => at(`P${index}`, 45.76, 4.83));

        expect(rankSuggestions(places, lyon, 3)).toHaveLength(3);
    });
});

describe('distanceKm', () => {
    it('distanceKm_shouldMeasureLyonToVilleurbanneInKilometres', () => {
        expect(distanceKm({ latitude: 45.764, longitude: 4.8357 }, { latitude: 45.784, longitude: 4.8608 })).toBeCloseTo(2.9, 0);
    });
});
