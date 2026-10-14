import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { THEME_STORAGE_KEY, ThemeService } from './theme.service';
import { LoggerService } from '../core/logging/logger.service';
import { environment } from '../../environments/environment';

describe('ThemeService', () => {
  const url = `${environment.apiUrl}/user-service/profile/preferences`;
  let httpMock: HttpTestingController;
  let logger: { warn: ReturnType<typeof vi.fn> };
  let deviceDark: boolean;
  let deviceListeners: ((event: { matches: boolean }) => void)[];
  let meta: HTMLMetaElement;
  let matchMedia: ReturnType<typeof vi.fn>;

  const root = () => document.documentElement;

  function create(): ThemeService {
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    return service;
  }

  /** The device switching between light and dark, as at nightfall. */
  function deviceTurns(dark: boolean): void {
    deviceDark = dark;
    deviceListeners.forEach(listener => listener({ matches: dark }));
    TestBed.tick();
  }

  beforeEach(() => {
    localStorage.clear();
    deviceDark = false;
    deviceListeners = [];
    // jsdom has no matchMedia: the device's setting is played here.
    matchMedia = vi.fn((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' && deviceDark,
      media: query,
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => deviceListeners.push(listener)
    }) as unknown as MediaQueryList);
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: matchMedia });
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
    logger = { warn: vi.fn() };
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: LoggerService, useValue: logger }]
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    meta.remove();
    vi.restoreAllMocks();
    delete (window as { matchMedia?: unknown }).matchMedia;
    delete root().dataset['theme'];
    root().style.colorScheme = '';
  });

  it('should follow the device when nothing was ever chosen', () => {
    deviceDark = true;
    const service = create();

    expect(service.preference()).toBe('SYSTEM');
    expect(service.applied()).toBe('dark');
    expect(root().dataset['theme']).toBe('dark');
    expect(root().style.colorScheme).toBe('dark');
    expect(meta.content).toBe('#121214');
  });

  it('should start with the theme last chosen on this browser', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'LIGHT');
    deviceDark = true;
    const service = create();

    expect(service.preference()).toBe('LIGHT');
    expect(root().dataset['theme']).toBe('light');
    expect(meta.content).toBe('#fcfaf7');
  });

  it('should ignore an unreadable stored theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'PINK');

    expect(create().preference()).toBe('SYSTEM');
  });

  it('should follow the device when storage is refused', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });

    expect(create().preference()).toBe('SYSTEM');
  });

  it('should keep following the device as it switches, in SYSTEM only', () => {
    const service = create();
    expect(root().dataset['theme']).toBe('light');

    deviceTurns(true);
    expect(root().dataset['theme']).toBe('dark');

    service.choose('LIGHT').subscribe();
    httpMock.expectOne(url).flush({ theme: 'LIGHT' });
    TestBed.tick();
    deviceTurns(true);
    expect(root().dataset['theme']).toBe('light');
  });

  it('should still apply a theme without matchMedia', () => {
    delete (window as { matchMedia?: unknown }).matchMedia;

    expect(create().applied()).toBe('light');
  });

  it('should apply a chosen theme at once, then keep it with the account and on this browser', () => {
    const service = create();
    let saved: string | undefined;

    service.choose('DARK').subscribe(theme => saved = theme);
    TestBed.tick();

    expect(root().dataset['theme']).toBe('dark');
    const request = httpMock.expectOne(url);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ theme: 'DARK' });
    request.flush({ theme: 'DARK' });

    expect(saved).toBe('DARK');
    expect(service.preference()).toBe('DARK');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('DARK');
  });

  it('should keep the chosen theme when the answer does not say which one was stored', () => {
    const service = create();
    let saved: string | undefined;

    service.choose('DARK').subscribe(theme => saved = theme);
    httpMock.expectOne(url).flush(null);

    expect(saved).toBe('DARK');
    expect(service.preference()).toBe('DARK');
  });

  it('should put the previous theme back when the save is refused', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'LIGHT');
    const service = create();
    let failed = false;

    service.choose('DARK').subscribe({ error: () => failed = true });
    httpMock.expectOne(url).flush({ code: 'USR-BUS-001' }, { status: 404, statusText: 'Not Found' });
    TestBed.tick();

    expect(failed).toBe(true);
    expect(service.preference()).toBe('LIGHT');
    expect(root().dataset['theme']).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('LIGHT');
  });

  it('should still apply a theme when storage refuses to keep it', () => {
    const service = create();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });

    service.choose('DARK').subscribe();
    httpMock.expectOne(url).flush({ theme: 'DARK' });

    expect(service.preference()).toBe('DARK');
  });

  it('should take up the theme kept with the account', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'LIGHT');
    const service = create();

    service.sync();
    const request = httpMock.expectOne(url);
    expect(request.request.method).toBe('GET');
    request.flush({ theme: 'DARK' });
    TestBed.tick();

    expect(service.preference()).toBe('DARK');
    expect(root().dataset['theme']).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('DARK');
  });

  it('should keep this browser\'s theme when the account answers something unreadable', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'LIGHT');
    const service = create();

    service.sync();
    httpMock.expectOne(url).flush({ theme: 'PINK' });

    expect(service.preference()).toBe('LIGHT');
  });

  it('should keep this browser\'s theme, and say so, when the account cannot be read', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'DARK');
    const service = create();

    service.sync();
    httpMock.expectOne(url).flush(null, { status: 503, statusText: 'Unavailable' });

    expect(service.preference()).toBe('DARK');
    expect(logger.warn).toHaveBeenCalledWith('ThemeService', 'Theme preference not read:', expect.anything());
  });
});
