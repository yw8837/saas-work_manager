/* 일감체크 service worker
 * Privacy rule: only versioned static assets are cached. Documents, API/auth
 * traffic, JSON, Supabase responses, notification payloads, and customer data
 * are always network-only and are never persisted by this worker.
 */

const CACHE_NAME = "ilgamcheck-static-v3";
// Dev builds reuse unhashed asset filenames, so caching them serves stale CSS/JS
// that a hard reload cannot clear. Only cache on real deployments.
const CACHE_ENABLED = !["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);
const STATIC_EXACT = new Set([
  "/manifest.webmanifest",
  "/icons/app-icon.svg",
  "/icons/app-icon-maskable.svg"
]);

self.addEventListener("install", (event) => {
  if (!CACHE_ENABLED) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([...STATIC_EXACT]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isCacheableStatic(request) {
  if (!CACHE_ENABLED) return false;
  if (request.method !== "GET") return false;
  if (request.mode === "navigate" || request.destination === "document") return false;
  if (request.headers.has("authorization")) return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/revision/")) return false;
  if (url.pathname.startsWith("/_next/data/") || url.pathname.endsWith(".json")) return false;

  return STATIC_EXACT.has(url.pathname) || url.pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  if (!isCacheableStatic(event.request)) return;

  // Hashed build assets under /_next/static/ are immutable, so a cached copy can
  // never be stale: serve it first, and fall back to the network on a miss.
  // Unhashed STATIC_EXACT entries revalidate in the background after being served.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fromNetwork = fetch(event.request)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
          }
          return response;
        });

      if (!cached) {
        // No cached copy: the network response is all we have, error status included.
        return fromNetwork.catch(() => Response.error());
      }

      const url = new URL(event.request.url);
      if (!url.pathname.startsWith("/_next/static/")) {
        // Unhashed asset: refresh the cache for next time but answer immediately.
        event.waitUntil(fromNetwork.catch(() => undefined));
      }
      return cached;
    })
  );
});

function safeInternalUrl(candidate) {
  try {
    const url = new URL(candidate || "/today", self.location.origin);
    return url.origin === self.location.origin ? `${url.pathname}${url.search}${url.hash}` : "/today";
  } catch {
    return "/today";
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const detailedBody = typeof payload.body === "string" ? payload.body.slice(0, 120) : "";
  const options = {
    body: payload.showDetail === true && detailedBody ? detailedBody : "확인할 일정이 있어요. 일감체크에서 확인해 주세요.",
    icon: "/icons/app-icon.svg",
    badge: "/icons/app-icon.svg",
    tag: typeof payload.tag === "string" ? payload.tag.slice(0, 80) : "ilgamcheck-reminder",
    renotify: false,
    data: { url: safeInternalUrl(payload.url) }
  };

  event.waitUntil(self.registration.showNotification("일감체크", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeInternalUrl(event.notification.data?.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "ILGAMCHECK_TEST_NOTIFICATION") return;
  event.waitUntil(
    self.registration.showNotification("일감체크 테스트", {
      body: "알림이 정상적으로 보여요.",
      icon: "/icons/app-icon.svg",
      badge: "/icons/app-icon.svg",
      tag: "ilgamcheck-test",
      data: { url: "/settings" }
    })
  );
});
