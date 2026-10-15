import { inject } from '@angular/core';
import { NavigationError } from '@angular/router';
import { LoggerService } from '../logging/logger.service';

const SCOPE = 'StaleChunk';

/** When the page last reloaded itself for a missing chunk, in this tab. */
export const STALE_CHUNK_RELOAD_KEY = 'wely.staleChunkReloadAt';

/** A second failure within this window means the reload did not help: the error is left to show. */
export const STALE_CHUNK_RELOAD_WINDOW_MS = 10_000;

/**
 * Whether a navigation failed because a lazily loaded chunk could not be imported. Each browser
 * words it its own way: Firefox "error loading dynamically imported module", Chrome "Failed to
 * fetch dynamically imported module", Safari "Importing a module script failed".
 */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(message);
}

export interface StaleChunkDeps {
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  assign: (url: string) => void;
  now: () => number;
}

/**
 * Reloads the page on the URL the user was going to, once, when its chunk is missing.
 *
 * <p>Every chunk's file name carries a hash of its content, and an image only holds the files of
 * its own build. A tab opened before a deploy still runs the previous build, whose chunks are gone:
 * the first lazy screen it opens fails to import, and the app is stuck until a manual reload. A
 * full load of the target URL fetches the new index.html and with it the new chunks.
 *
 * <p>The time of the reload is kept in sessionStorage, so a chunk that is really broken does not
 * make the page reload forever. Returns whether it reloaded.
 */
export function reloadOnStaleChunk(error: unknown, url: string, deps: StaleChunkDeps): boolean {
  if (!isStaleChunkError(error)) {
    return false;
  }
  try {
    const last = Number(deps.storage?.getItem(STALE_CHUNK_RELOAD_KEY) ?? 0);
    if (deps.now() - last < STALE_CHUNK_RELOAD_WINDOW_MS) {
      return false;
    }
    deps.storage?.setItem(STALE_CHUNK_RELOAD_KEY, String(deps.now()));
  } catch {
    // Storage refused (private mode, quota): reload anyway, the window just cannot be kept.
  }
  deps.assign(url);
  return true;
}

function sessionStorageOrNull(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** For `withNavigationErrorHandler`: runs in an injection context, on every failed navigation. */
export function handleStaleChunk(navigation: NavigationError): void {
  const reloaded = reloadOnStaleChunk(navigation.error, navigation.url, {
    storage: sessionStorageOrNull(),
    assign: (url) => globalThis.location.assign(url),
    now: () => Date.now(),
  });
  if (reloaded) {
    inject(LoggerService).warn(SCOPE, `Chunk missing after a deploy, reloading ${navigation.url}`);
  }
}
