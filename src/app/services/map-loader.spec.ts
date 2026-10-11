import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('map-loader', () => {
    beforeEach(() => {
        vi.resetModules();
        document.head.querySelectorAll('link[href="maplibre.css"]').forEach(link => link.remove());
    });

    it('loadMapLibre_shouldFetchTheLibraryAndItsStylesheetOnce', async () => {
        vi.doMock('maplibre-gl', () => ({ Map: class {} }));
        const { loadMapLibre } = await import('./map-loader');

        const first = loadMapLibre();
        const second = loadMapLibre();

        expect(second).toBe(first);
        expect((await first).Map).toBeDefined();
        expect(document.head.querySelectorAll('link[href="maplibre.css"]')).toHaveLength(1);
    });

    it('loadMapLibre_shouldTryAgainAfterAFailedDownload', async () => {
        vi.doMock('maplibre-gl', () => {
            throw new Error('offline');
        });
        const { loadMapLibre } = await import('./map-loader');

        const failed = loadMapLibre();
        await expect(failed).rejects.toThrow();

        const retry = loadMapLibre();
        expect(retry).not.toBe(failed);
        await expect(retry).rejects.toThrow();
    });

    it('foldAttribution_shouldLeaveAMapWithoutCreditsAlone', async () => {
        const { foldAttribution } = await import('./map-loader');

        expect(() => foldAttribution(document.createElement('div'))).not.toThrow();
    });

    it('toLngLat_shouldPutTheLongitudeFirst', async () => {
        const { toLngLat } = await import('./map-loader');

        expect(toLngLat({ latitude: 45.76, longitude: 4.83 })).toEqual([4.83, 45.76]);
    });

    it('MapLoader_shouldLoadTheSharedLibrary', async () => {
        vi.doMock('maplibre-gl', () => ({ Map: class {} }));
        const { MapLoader, loadMapLibre } = await import('./map-loader');

        expect(new MapLoader().load()).toBe(loadMapLibre());
    });
});
