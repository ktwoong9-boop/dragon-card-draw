const VERSION = "20261011-115636";
const CACHE = `dragon-card-${VERSION}`;
const CORE = ["index.html", "manifest.webmanifest", "css/style.css", "css/tablet.css", "js/sha256.js", "js/code-input.js", "js/tablet.js", "data/cards.json", "data/codes.json", "assets/start-bg.png", "assets/draw-button.png", "assets/card-back.jpg", "assets/cards/67f454bf.png", "assets/cards/18b66da4.png", "assets/cards/ae4c1d66.png", "assets/cards/e22f98e7.png", "assets/cards/10ccb502.png", "assets/cards/b4da19d0.png", "assets/cards/7714c41a.png", "assets/cards/b853dabe.png", "assets/cards/40fdba85.png", "assets/cards/ac71d806.png", "assets/cards/527bdad7.png", "assets/cards/c2f5e1e1.png", "assets/cards/a64fd0c9.png", "assets/cards/4daa441f.png", "assets/cards/5e2e2812.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];
const MEDIA = ["assets/intro.mp4", "assets/bgm.mp3"];
const DATA = ["data/cards.json", "data/codes.json"];

async function broadcast(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  clients.forEach((client) => client.postMessage(message));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const all = CORE.concat(MEDIA);
    let done = 0;
    for (const url of CORE) {
      await cache.add(new Request(url, { cache: "reload" }));
      done += 1;
      broadcast({ type: "progress", done, total: all.length });
    }
    for (const url of MEDIA) {
      try {
        await cache.add(new Request(url, { cache: "reload" }));
      } catch {
        /* 영상·음악은 다음 실행 때 다시 받습니다. */
      }
      done += 1;
      broadcast({ type: "progress", done, total: all.length });
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("dragon-card-") && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
    broadcast({ type: "ready" });
  })());
});

function scopePath(url) {
  return new URL(url).href.slice(self.registration.scope.length).split("?")[0] || "index.html";
}

async function rangeResponse(request, cached) {
  const blob = await cached.blob();
  const match = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") || "");
  let start = 0;
  let end = blob.size - 1;
  if (match) {
    if (match[1]) {
      start = Number(match[1]);
      if (match[2]) end = Number(match[2]);
    } else if (match[2]) {
      start = Math.max(0, blob.size - Number(match[2]));
    }
  }
  end = Math.min(end, blob.size - 1);
  if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${blob.size}` } });
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${blob.size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(self.registration.scope)) return;
  const path = scopePath(request.url);

  if (DATA.includes(path)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, { cache: "no-store" });
        if (fresh.ok) (await caches.open(CACHE)).put(path, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(path)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = request.mode === "navigate" ? "index.html" : path;
    const cached = await cache.match(key);
    if (cached) {
      return request.headers.has("range") ? rangeResponse(request, cached) : cached;
    }
    if (request.headers.has("range")) return fetch(request);
    try {
      const fresh = await fetch(request);
      if (fresh.ok && fresh.status === 200) cache.put(key, fresh.clone());
      return fresh;
    } catch {
      return Response.error();
    }
  })());
});
