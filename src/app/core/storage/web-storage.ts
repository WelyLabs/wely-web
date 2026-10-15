/** Every key the app writes to web storage starts with this. */
export const WELY_STORAGE_PREFIX = 'wely.';

/** The browser's local or session storage, or null when the accessor throws (private mode, blocked site data). */
export function storageOrNull(kind: 'local' | 'session'): Storage | null {
  try {
    return (kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage) ?? null;
  } catch {
    return null;
  }
}

/** Removes every key of the app from the storage, leaving other keys alone; never throws. */
export function removeWelyKeys(storage: Storage | null): void {
  if (!storage) {
    return;
  }
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(WELY_STORAGE_PREFIX)) {
        keys.push(key);
      }
    }
    keys.forEach(key => storage.removeItem(key));
  } catch {
    // Storage refused: nothing more can be removed from here.
  }
}
