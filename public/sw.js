/*
 * Wely's service worker: Web Push only, no offline cache.
 *
 * Plain JS served as is from /sw.js (no build step, no hash: its URL must not change).
 * Tested by src/app/core/push/sw.spec.ts, which runs this very file in a fake worker scope.
 *
 * Push payload: { title, body, tag, link, type, requireInteraction }.
 */
'use strict';

const ICON = '/icons/icon-192.png';
const BADGE = '/icons/icon-192.png';

/** The payload, or null when it is missing or not JSON. */
function readPayload(data) {
  if (!data) {
    return null;
  }
  try {
    return data.json();
  } catch {
    return null;
  }
}

/** A Wely tab on screen: the app shows the notification itself, over SSE. */
function hasVisibleClient(windowClients) {
  return windowClients.some(client => client.visibilityState === 'visible');
}

function notificationOptions(payload) {
  return {
    body: payload.body || '',
    tag: payload.tag || undefined,
    // A grouped notification replaced under the same tag still rings.
    renotify: Boolean(payload.tag),
    icon: ICON,
    badge: BADGE,
    data: { link: payload.link || '/' },
    requireInteraction: Boolean(payload.requireInteraction)
  };
}

/** An app path on this origin; anything else falls back to the home page. */
function safeLink(link, origin) {
  try {
    const url = new URL(link || '/', origin);
    return url.origin === origin ? url.pathname + url.search + url.hash : '/';
  } catch {
    return '/';
  }
}

/*
 * Pushes are subscribed with userVisibleOnly, so each one should show a notification. Skipping it
 * while a Wely tab is visible is the accepted compromise: Chrome does not count a push as silent
 * when one of the site's pages is on screen, and the tab already shows a toast.
 */
async function handlePush(scope, data) {
  const payload = readPayload(data);
  const windowClients = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (hasVisibleClient(windowClients)) {
    return;
  }
  const title = (payload && payload.title) || 'Wely';
  await scope.registration.showNotification(title, notificationOptions(payload || {}));
}

/** Focuses a Wely tab and tells the app to route there (keeps its state), or opens a window. */
async function openLink(scope, link) {
  const path = safeLink(link, scope.location.origin);
  const windowClients = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const client = windowClients.find(candidate => candidate.focused) || windowClients[0];
  if (client) {
    await client.focus();
    client.postMessage({ type: 'navigate', link: path });
    return;
  }
  await scope.clients.openWindow(path);
}

// A new version takes over at once: there is no cache to keep consistent.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => event.waitUntil(handlePush(self, event.data)));

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const link = event.notification.data && event.notification.data.link;
  event.waitUntil(openLink(self, link));
});
