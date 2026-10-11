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

/*
 * Imported first by chat.service.ts, so it runs before the RSocket modules evaluate. It used to
 * run from main.ts, which put the 25 KB `buffer` polyfill in front of every page, the landing
 * page included, for the sake of the chat alone.
 */
export {};
