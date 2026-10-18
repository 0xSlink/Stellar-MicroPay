const CACHE_VERSION = "v4";
const PRECACHE = `stellar-micropay-precache-${CACHE_VERSION}`;
const RUNTIME = `stellar-micropay-runtime-${CACHE_VERSION}`;

const APP_SHELL_URLS = [
  "/",
  "/dashboard",
  "/manifest.json",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/maskable-icon-192.png", // maskable icon variants (#1473)
  "/maskable-icon-512.png",
  "/offline.html", // branded offline fallback for failed navigations (#1474)
  "/apple-touch-icon.png", // 180x180 iOS home-screen icon (#1477)
  "/icon-send-96.png", // manifest shortcut icons (#1476)
  "/icon-receive-96.png",
  "/icon-dashboard-96.png",
  // Screenshots (/screenshots/*) are intentionally NOT precached: they are
  // only fetched by the browser's install dialog while online, so caching
  // them would add ~40KB to every first visit for no offline benefit (#1476).
];

const RUNTIME_CACHE_HOSTS = new Set([
  self.location.hostname,
  "localhost",
  "127.0.0.1",
  "horizon-testnet.stellar.org",
  "horizon.stellar.org",
  // api.coingecko.com is intentionally NOT runtime-cached (#1472): a price
  // served stale from the SW looks current to users making USD-denominated
  // decisions. Freshness is instead handled in the app layer
  // (lib/price.ts: 60s in-memory TTL + graceful "price unavailable").
]);

function isCacheableResponse(response) {
  return response && response.ok && ["basic", "cors"].includes(response.type);
}

function isRuntimeCacheableRequest(request, url) {
  if (request.method !== "GET") return false;
  if (!["http:", "https:"].includes(url.protocol)) return false;
  return RUNTIME_CACHE_HOSTS.has(url.hostname);
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME);

  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function handleNavigation(request) {
  const cache = await caches.open(RUNTIME);

  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Online navigation failed. Serve the cached page if we have one,
    // otherwise fall back to the branded offline page (#1474) instead of
    // surfacing the browser's default error page.
    return (
      (await caches.match(request)) ||
      (await caches.match("/offline.html")) ||
      Response.error()
    );
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(APP_SHELL_URLS))
  );
  // No automatic skipWaiting here (#1475): a newly installed worker stays in
  // "waiting" until the page confirms the "new version available" prompt
  // (components/ServiceWorkerUpdateToast.tsx, mounted from _app.tsx) by
  // posting a SKIP_WAITING message below. This keeps the reload under user
  // control instead of freezing a stale app shell until every tab closes.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("stellar-micropay-") &&
                ![PRECACHE, RUNTIME].includes(key)
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Message handler for the update prompt (#1475): the page posts
// { type: "SKIP_WAITING" } when the user accepts the reload prompt, letting
// the waiting worker take over so the page can reload once.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isRuntimeCacheableRequest(request, url)) {
    event.respondWith(networkFirst(request));
  }
});

self.addEventListener("push", (event) => {
  // Push API handler (Closes #1143): parse the push payload and call
  // self.registration.showNotification so users are notified even when
  // the tab is backgrounded.
  let data = { title: "Stellar Pay", body: "You have a new notification." };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: "Stellar Pay", body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/favicon.svg",
      data: { url: data.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  // Notification click opens the dashboard (#1143).
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/dashboard") && "focus" in client) return client.focus();
      }
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
