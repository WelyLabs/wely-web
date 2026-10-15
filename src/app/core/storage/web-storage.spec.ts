import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeWelyKeys, storageOrNull } from './web-storage';

describe('web storage helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('removeWelyKeys_shouldRemoveEveryWelyKey_andKeepTheOthers', () => {
    localStorage.setItem('wely.theme', 'DARK');
    localStorage.setItem('wely.calendar.createHintDone', '1');
    localStorage.setItem('kc-callback-abc', '{}');
    localStorage.setItem('other', 'kept');

    removeWelyKeys(localStorage);

    expect(localStorage.getItem('wely.theme')).toBeNull();
    expect(localStorage.getItem('wely.calendar.createHintDone')).toBeNull();
    expect(localStorage.getItem('kc-callback-abc')).toBe('{}');
    expect(localStorage.getItem('other')).toBe('kept');
  });

  it('removeWelyKeys_shouldDoNothing_whenStorageIsNull', () => {
    expect(() => removeWelyKeys(null)).not.toThrow();
  });

  it('removeWelyKeys_shouldNotThrow_whenTheStorageRefuses', () => {
    const refusing = {
      length: 1,
      key: () => 'wely.theme',
      removeItem: vi.fn(() => {
        throw new DOMException('denied', 'SecurityError');
      })
    } as unknown as Storage;

    expect(() => removeWelyKeys(refusing)).not.toThrow();
    expect(refusing.removeItem).toHaveBeenCalledWith('wely.theme');
  });

  it('storageOrNull_shouldReturnTheBrowserStorage', () => {
    expect(storageOrNull('local')).toBe(localStorage);
    expect(storageOrNull('session')).toBe(sessionStorage);
  });

  it('storageOrNull_shouldReturnNull_whenTheAccessorThrows', () => {
    vi.spyOn(globalThis, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(storageOrNull('session')).toBeNull();
  });
});
