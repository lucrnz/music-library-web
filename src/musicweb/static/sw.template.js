/**
 * Shell-only service worker (template).
 * Python injects PRECACHE_URLS and SHELL_CACHE_VERSION below.
 * Never caches /api/* — offline audio is OPFS Downloads.
 */
/* eslint-disable no-restricted-globals */

const SHELL_CACHE_VERSION = __SHELL_CACHE_VERSION__;
const SHELL_CACHE = `musicweb-${SHELL_CACHE_VERSION}`;
const PRECACHE_URLS = __PRECACHE_URLS__;

/** Must succeed during install or the worker rejects install. */
const CRITICAL_URLS = ["/", "/static/js/main.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      /** @type {string[]} */
      const failedUrls = [];
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (!res.ok) {
              failedUrls.push(url);
              console.warn("[sw] precache failed:", url, res.status);
              return;
            }
            await cache.put(url, res);
          } catch (err) {
            failedUrls.push(url);
            console.warn("[sw] precache failed:", url, err);
          }
        })
      );
      const critical = new Set(CRITICAL_URLS);
      for (const u of PRECACHE_URLS) {
        if (u.includes("/static/vendor/vue.esm-browser")) critical.add(u);
      }
      const criticalFailed = [...critical].filter((u) => failedUrls.includes(u));
      if (criticalFailed.length) {
        throw new Error(
          "[sw] install aborted; critical assets failed: " +
            criticalFailed.join(", ")
        );
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("musicweb-") && k !== SHELL_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

/**
 * @param {URL} url
 */
function shouldBypass(url) {
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname === "/sw.js") return true;
  return false;
}

/**
 * @param {Request} request
 */
async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) {
      await cache.put("/", res.clone());
    }
    return res;
  } catch {
    const cached = await cache.match("/");
    if (cached) return cached;
    return new Response(
      "Offline — open once while online to cache the app shell.",
      {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }
    );
  }
}

/**
 * @param {Request} request
 */
async function cacheFirstStatic(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) {
      await cache.put(request, res.clone());
    }
    return res;
  } catch {
    return new Response("Offline", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

/**
 * @param {Request} request
 */
async function networkFirstManifest(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response("{}", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "application/manifest+json" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (shouldBypass(url)) return;

  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(networkFirstManifest(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.pathname.startsWith("/static/")) {
    event.respondWith(cacheFirstStatic(request));
  }
});
