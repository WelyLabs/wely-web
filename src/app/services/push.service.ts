import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoggerService } from '../core/logging/logger.service';

const SCOPE = 'PushService';
export const SERVICE_WORKER_URL = '/sw.js';

/**
 * This device's push state: not possible here, not set up on the server, blocked by the user,
 * on, or off.
 */
export type PushState = 'unsupported' | 'unavailable' | 'denied' | 'enabled' | 'disabled';

/** The VAPID public key (base64url) as the bytes PushManager.subscribe expects. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.padEnd(base64Url.length + (4 - (base64Url.length % 4)) % 4, '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

/** A short name for the device, shown to tell subscriptions apart: « Chrome · Android ». */
export function deviceLabel(userAgent: string): string {
  const browser = /Edg\//.test(userAgent) ? 'Edge'
    : /Firefox\/|FxiOS/.test(userAgent) ? 'Firefox'
      : /Chrome\/|CriOS/.test(userAgent) ? 'Chrome'
        : /Safari\//.test(userAgent) ? 'Safari'
          : 'Navigateur';
  const os = /iPhone|iPad|iPod/.test(userAgent) ? 'iOS'
    : /Android/.test(userAgent) ? 'Android'
      : /Windows/.test(userAgent) ? 'Windows'
        : /Mac OS X|Macintosh/.test(userAgent) ? 'macOS'
          : /Linux/.test(userAgent) ? 'Linux'
            : 'Appareil';
  return `${browser} · ${os}`;
}

/** iPhone or iPad, the latter reporting itself as a Mac with a touch screen. */
export function isIos(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator): boolean {
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

/** Launched from the home screen: the only way iOS lets a web app receive pushes. */
export function isStandalone(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
}

export function isPushSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && typeof PushManager !== 'undefined' && typeof Notification !== 'undefined';
}

interface NavigateMessage {
  type: 'navigate';
  link: string;
}

const isNavigateMessage = (data: unknown): data is NavigateMessage =>
  typeof data === 'object' && data !== null && (data as NavigateMessage).type === 'navigate'
  && typeof (data as NavigateMessage).link === 'string' && (data as NavigateMessage).link.startsWith('/');

/**
 * Web Push on this device: the service worker, the permission and the subscription kept by
 * wely-notifications. Enabling must start from a user gesture (Safari refuses otherwise).
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly logger = inject(LoggerService);
  private readonly apiUrl = `${environment.apiUrl}/notifications-service/push`;
  private initialized = false;

  readonly supported = isPushSupported();
  /** On an iPhone in Safari: pushes only reach the app once added to the home screen. */
  readonly needsHomeScreen = isIos() && !isStandalone();
  private readonly permissionState = signal<NotificationPermission>(this.supported ? Notification.permission : 'default');
  /** null until asked; '' when the server has no VAPID key. */
  private readonly publicKey = signal<string | null>(null);
  private readonly subscribed = signal(false);
  private readonly working = signal(false);

  readonly permission = this.permissionState.asReadonly();
  readonly busy = this.working.asReadonly();
  readonly state = computed<PushState>(() => {
    if (!this.supported) {
      return 'unsupported';
    }
    if (this.publicKey() === '') {
      return 'unavailable';
    }
    if (this.permissionState() === 'denied') {
      return 'denied';
    }
    return this.subscribed() && this.permissionState() === 'granted' ? 'enabled' : 'disabled';
  });

  /** Registers the worker and follows its clicks; once, at sign-in. Harmless without permission. */
  init(): void {
    if (this.initialized || !this.supported) {
      return;
    }
    this.initialized = true;
    const container = navigator.serviceWorker;
    container.addEventListener('message', event => {
      if (isNavigateMessage(event.data)) {
        void this.router.navigateByUrl(event.data.link);
      }
    });
    // Messages sent before the listener existed are queued until this.
    container.startMessages();
    container.register(SERVICE_WORKER_URL).catch((error: unknown) =>
      this.logger.error(SCOPE, 'Service worker registration failed', error));
  }

  /** Reads the server key and whether this device is already subscribed. */
  async refresh(): Promise<void> {
    if (!this.supported) {
      return;
    }
    this.permissionState.set(Notification.permission);
    try {
      await this.loadPublicKey();
      const registration = await navigator.serviceWorker.getRegistration('/');
      this.subscribed.set(!!(await registration?.pushManager.getSubscription()));
    } catch (error) {
      this.logger.error(SCOPE, 'Could not read the push state', error);
    }
  }

  /** Asks permission, subscribes and hands the subscription to the server. Call from a click. */
  async enable(): Promise<boolean> {
    if (!this.supported || this.working()) {
      return false;
    }
    this.working.set(true);
    try {
      const permission = await Notification.requestPermission();
      this.permissionState.set(permission);
      const key = permission === 'granted' ? await this.loadPublicKey() : '';
      if (!key) {
        return false;
      }
      const registration = await this.registration();
      // A subscription made with another key cannot be reused: start over.
      await (await registration.pushManager.getSubscription())?.unsubscribe();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key)
      });
      const json = subscription.toJSON();
      await firstValueFrom(this.http.put<void>(`${this.apiUrl}/subscriptions`, {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.['p256dh'], auth: json.keys?.['auth'] },
        label: deviceLabel(navigator.userAgent)
      }));
      this.subscribed.set(true);
      return true;
    } catch (error) {
      this.logger.error(SCOPE, 'Could not enable push', error);
      return false;
    } finally {
      this.working.set(false);
    }
  }

  /** Unsubscribes this device, here and on the server. */
  async disable(): Promise<boolean> {
    if (!this.supported || this.working()) {
      return false;
    }
    this.working.set(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/subscriptions`, { params: { endpoint } }));
      }
      this.subscribed.set(false);
      return true;
    } catch (error) {
      this.logger.error(SCOPE, 'Could not disable push', error);
      return false;
    } finally {
      this.working.set(false);
    }
  }

  /** Closes the notifications the worker shows on this device, best effort: their previews name people. */
  async clearShownNotifications(): Promise<void> {
    if (!this.supported) {
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const shown = await registration?.getNotifications?.();
      shown?.forEach(notification => notification.close());
    } catch (error) {
      this.logger.warn(SCOPE, 'Could not close the notifications shown on this device', error);
    }
  }

  private async loadPublicKey(): Promise<string> {
    const known = this.publicKey();
    if (known !== null) {
      return known;
    }
    const { publicKey } = await firstValueFrom(this.http.get<{ publicKey: string }>(`${this.apiUrl}/public-key`));
    this.publicKey.set(publicKey ?? '');
    return publicKey ?? '';
  }

  /** The active registration: subscribing needs an active worker, not one still installing. */
  private async registration(): Promise<ServiceWorkerRegistration> {
    const container = navigator.serviceWorker;
    if (!(await container.getRegistration('/'))) {
      await container.register(SERVICE_WORKER_URL);
    }
    return container.ready;
  }
}
