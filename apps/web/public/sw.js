// RechnungsAI — invoice-queue service worker
//
// Minimum viable: listens for the browser's `online` event (or an `online`
// message from a client) and posts `SYNC_CAPTURES` to all clients in scope
// so the visible tab can drain the IndexedDB queue. The SW itself does not
// touch IndexedDB or uploadInvoice — keeping it thin avoids duplicating
// auth cookie handling here.
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

self.addEventListener("online", () => {
  notifyClients();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "REQUEST_SYNC") {
    notifyClients();
  }
});
