/**
 * MERKABAH OS · Service Worker
 *
 * Strategy: NETWORK-FIRST for HTML navigations, STALE-WHILE-REVALIDATE for
 * static assets (JS/CSS/images/fonts), NETWORK-ONLY for everything API-shaped
 * (server functions, Supabase, gateway, auth). Offline fallback to cached
 * shell. Listens for { type: "KILL" } to self-destruct cleanly.
 *
 * SAFETY: registration is gated client-side so this NEVER runs inside the
 * Lovable preview iframe — see /pwa-register.js.
 */

const VERSION = "merkabah-v2";
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
const SHELL_URLS = ["/", "/dashboard", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Best-effort: don't fail install if any single asset 404s.
      await Promise.all(
        SHELL_URLS.map((u) => cache.add(u).catch(() => {})),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n !== SHELL_CACHE && n !== ASSET_CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

// Allow the app to remotely kill the SW (debug / recovery).
self.addEventListener("message", (event) => {
  if (event.data?.type === "KILL") {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        await Promise.all(clients.map((c) => c.navigate(c.url)));
        await self.registration.unregister();
      })(),
    );
  }
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

const isApiLike = (url) =>
  url.pathname.startsWith("/_serverFn/") ||
  url.pathname.startsWith("/api/") ||
  url.hostname.includes("supabase.co") ||
  url.hostname.includes("ai.gateway.lovable.dev") ||
  url.hostname.includes("connector-gateway.lovable.dev") ||
  url.hostname.includes("api.x.ai") ||
  url.hostname.includes("api.openai.com") ||
  url.hostname.includes("api.anthropic.com") ||
  url.hostname.includes("generativelanguage.googleapis.com");

const isStaticAsset = (url) =>
  /\.(?:js|mjs|css|woff2?|ttf|otf|png|jpg|jpeg|gif|webp|svg|ico)$/i.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never cache mutations
  const url = new URL(request.url);

  // Same-origin only for caching; cross-origin (apart from explicit allow) → passthrough.
  const sameOrigin = url.origin === self.location.origin;

  // Never cache or intercept API/data calls — they MUST hit network with auth.
  if (isApiLike(url)) return;

  // HTML navigation → network-first with offline fallback.
  if (request.mode === "navigate" || (sameOrigin && request.headers.get("accept")?.includes("text/html"))) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          // cache the latest shell for offline
          const cache = await caches.open(SHELL_CACHE);
          cache.put("/", fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match(request)) ||
            (await cache.match("/")) ||
            new Response(
              `<!doctype html><meta charset=utf-8><title>Offline · Merkabah OS</title>
               <body style="background:#000;color:#7dd3fc;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center">
                 <div><div style="font-size:14px;letter-spacing:.4em;opacity:.6">MERKABAH · OFFLINE</div>
                 <div style="margin-top:1rem;font-size:13px;color:#94a3b8">Reconnect to reach the operator.</div></div>
               </body>`,
              { headers: { "Content-Type": "text/html" } },
            )
          );
        }
      })(),
    );
    return;
  }

  // Same-origin static assets → stale-while-revalidate.
  if (sameOrigin && isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((r) => {
            if (r.ok) cache.put(request, r.clone()).catch(() => {});
            return r;
          })
          .catch(() => null);
        return cached || (await network) || new Response("", { status: 504 });
      })(),
    );
  }
});

// Push placeholder — wire to a real backend later.
self.addEventListener("push", (event) => {
  let data = { title: "Merkabah OS", body: "Signal received." };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch { /* noop */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: data.url || "/dashboard",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data || "/dashboard"));
});
