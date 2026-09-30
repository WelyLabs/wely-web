import { Buffer } from 'buffer';

/**
 * Node globals the RSocket packages expect in a browser.
 *
 * <p>rsocket-js 0.0.x predates the browser builds of its own dependencies and reaches for
 * `global`, `Buffer` and `process` directly. Declaring the shape here rather than casting
 * `window as any` four times keeps the shim honest about what it actually provides.
 */
interface NodeShims {
  global: typeof globalThis;
  Buffer: typeof Buffer;
  process: { env: Record<string, string | undefined>; version: string; nextTick(cb: () => void): void };
}

const shims = window as unknown as NodeShims;
shims.global = window;
shims.Buffer = Buffer;
shims.process = {
  env: { DEBUG: undefined },
  version: '',
  nextTick: (cb: () => void) => setTimeout(cb, 0),
};

import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((error: unknown) => {
  // Bootstrap failed, so LoggerService does not exist yet — there is nothing else to
  // report through, and a silent blank page would be worse.
  // eslint-disable-next-line no-console
  console.error('[bootstrap] application failed to start', error);
});
