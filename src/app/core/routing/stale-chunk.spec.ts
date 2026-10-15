import { TestBed } from '@angular/core/testing';
import { NavigationError } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STALE_CHUNK_RELOAD_KEY,
  STALE_CHUNK_RELOAD_WINDOW_MS,
  StaleChunkDeps,
  handleStaleChunk,
  isStaleChunkError,
  reloadOnStaleChunk,
} from './stale-chunk';
import { LoggerService } from '../logging/logger.service';

const firefox = new TypeError('error loading dynamically imported module: http://localhost/chunk-QT23AKQ2.js');

function deps(overrides: Partial<StaleChunkDeps> = {}): StaleChunkDeps & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => void store.set(key, value) },
    assign: vi.fn(),
    now: () => 100_000,
    ...overrides,
  };
}

describe('stale-chunk', () => {
  describe('isStaleChunkError', () => {
    it.each([
      ['Firefox', firefox],
      ['Chrome', new TypeError('Failed to fetch dynamically imported module: http://localhost/chunk-A.js')],
      ['Safari', new TypeError('Importing a module script failed.')],
      ['webpack', 'ChunkLoadError: Loading chunk 3 failed'],
    ])('recognises %s\'s wording', (_browser, error) => {
      expect(isStaleChunkError(error)).toBe(true);
    });

    it('ignores any other failure', () => {
      expect(isStaleChunkError(new Error('Cannot match any routes'))).toBe(false);
      expect(isStaleChunkError(null)).toBe(false);
    });
  });

  describe('reloadOnStaleChunk', () => {
    it('reloads the page on the URL the user was going to, and remembers when', () => {
      const d = deps();

      expect(reloadOnStaleChunk(firefox, '/feed', d)).toBe(true);

      expect(d.assign).toHaveBeenCalledWith('/feed');
      expect(d.store.get(STALE_CHUNK_RELOAD_KEY)).toBe('100000');
    });

    it('does not reload for an error that is not a missing chunk', () => {
      const d = deps();

      expect(reloadOnStaleChunk(new Error('guard refused'), '/feed', d)).toBe(false);
      expect(d.assign).not.toHaveBeenCalled();
    });

    it('does not reload again right after a reload, so a broken chunk cannot loop', () => {
      const d = deps();
      d.store.set(STALE_CHUNK_RELOAD_KEY, String(100_000 - STALE_CHUNK_RELOAD_WINDOW_MS + 1));

      expect(reloadOnStaleChunk(firefox, '/feed', d)).toBe(false);
      expect(d.assign).not.toHaveBeenCalled();
    });

    it('reloads again once the window has passed', () => {
      const d = deps();
      d.store.set(STALE_CHUNK_RELOAD_KEY, String(100_000 - STALE_CHUNK_RELOAD_WINDOW_MS));

      expect(reloadOnStaleChunk(firefox, '/feed', d)).toBe(true);
    });

    it('still reloads without storage, or when it refuses', () => {
      expect(reloadOnStaleChunk(firefox, '/feed', deps({ storage: null }))).toBe(true);

      const refusing = deps({ storage: { getItem: () => { throw new Error('denied'); }, setItem: vi.fn() } });
      expect(reloadOnStaleChunk(firefox, '/feed', refusing)).toBe(true);
      expect(refusing.assign).toHaveBeenCalledWith('/feed');
    });
  });

  describe('handleStaleChunk', () => {
    let assign: ReturnType<typeof vi.fn>;
    let warn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      sessionStorage.clear();
      assign = vi.fn();
      vi.stubGlobal('location', { ...globalThis.location, assign });
      warn = vi.fn();
      TestBed.configureTestingModule({ providers: [{ provide: LoggerService, useValue: { warn } }] });
    });

    afterEach(() => vi.unstubAllGlobals());

    it('reloads through the browser and logs why', () => {
      TestBed.runInInjectionContext(() => handleStaleChunk(new NavigationError(1, '/communities', firefox)));

      expect(assign).toHaveBeenCalledWith('/communities');
      expect(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)).toBeTruthy();
      expect(warn).toHaveBeenCalledWith('StaleChunk', expect.stringContaining('/communities'));
    });

    it('leaves any other navigation error alone', () => {
      TestBed.runInInjectionContext(() => handleStaleChunk(new NavigationError(1, '/feed', new Error('boom'))));

      expect(assign).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
