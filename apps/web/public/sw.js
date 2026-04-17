// RechnungsAI — invoice-queue service worker
//
// Minimum viable: broadcasts SYNC_CAPTURES to all clients in scope when
// a client sends REQUEST_SYNC (e.g. on reconnect). The SW itself does not
// touch IndexedDB or uploadInvoice — keeping it thin avoids duplicating
// auth cookie handling here.
//
// Note: ServiceWorkers do not receive the DOM `online` event — that fires
// only on `window`. Drain-on-reconnect is handled client-side via
// window.addEventListener("online", ...) in CameraCaptureShell, which also
// sends REQUEST_SYNC here so other in-scope tabs get notified.
//
// Scope: /erfassen (set in navigator.serviceWorker.register).
// Out of scope (Story 2.1 boundary): Workbox, Background Sync API,
// precaching, push notifications.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function notifyClients() {
  const clients = await self.clients.matchAll({
    includeUncontrolled: true,
    type: "window",
  });
  for (const client of clients) {
    client.postMessage({ type: "SYNC_CAPTURES" });
  }
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "REQUEST_SYNC") {
    notifyClients();
  }
});
