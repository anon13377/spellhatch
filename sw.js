// Spell Hatch service worker (card W2). Offline play under any subpath (GitHub Pages serves /<repo>/).
// Bump CACHE_VERSION whenever files change, so phones drop the old cache.
// Strategy:
//   - App code and data (precached): network first with a short timeout, falling back to the cache when offline.
//     The cache is refreshed on every successful fetch, so an upload is picked up even if the version is not bumped.
//   - Pictures and fonts (emoji, icons, fonts): cache first; emoji SVGs are cached the first time they are used.
//   - Second phase ("warm"): when the page posts {type:"warm"} once it is idle, every emoji SVG
//     named in data/emoji.js is cached in the background, so Matching pictures work offline. It skips files
//     already cached, so it is cheap to repeat.
//   - Cross-origin requests (the OCR files from cdn.jsdelivr.net) are never intercepted or cached here.
const CACHE_VERSION = "sh-v5";
const CACHE = "spellhatch-" + CACHE_VERSION;
const NET_TIMEOUT_MS = 3500;

const PRECACHE = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    // UI pictures on the first screens (mode tiles, results events, player avatars)
    "./assets/emoji/1f4f7.svg",
    "./assets/emoji/1f442.svg",
    "./assets/emoji/1f914.svg",
    "./assets/emoji/1f526.svg",
    "./assets/emoji/1f3f0.svg",
    "./assets/emoji/270f.svg",
    "./assets/emoji/1f3c6.svg",
    "./assets/emoji/2b50.svg",
    "./assets/emoji/1f947.svg",
    "./assets/emoji/1f98a.svg",
    "./assets/emoji/1f431.svg",
    "./assets/emoji/1f415.svg",
    "./assets/emoji/1f989.svg",
    "./assets/emoji/1f438.svg",
    "./assets/emoji/1f43c.svg",
    "./assets/emoji/1f42f.svg",
    "./assets/emoji/1f407.svg",
    "./assets/emoji/1f43b.svg",
    "./assets/emoji/1f427.svg",
    "./assets/emoji/1f984.svg",
    "./assets/emoji/1f412.svg",
    "./assets/emoji/1f428.svg",
    "./assets/emoji/1f419.svg",
    "./assets/emoji/1f996.svg",
    "./assets/emoji/1f409.svg",
    "./assets/emoji/1f41d.svg",
    "./assets/emoji/1f98b.svg",
    "./assets/emoji/1f433.svg",
    "./assets/emoji/1f680.svg",
    "./assets/creatures/c00-baby.svg",
    "./assets/creatures/c00-egg.svg",
    "./assets/creatures/c00-grown.svg",
    "./assets/creatures/c01-baby.svg",
    "./assets/creatures/c01-egg.svg",
    "./assets/creatures/c01-grown.svg",
    "./assets/creatures/c02-baby.svg",
    "./assets/creatures/c02-egg.svg",
    "./assets/creatures/c02-grown.svg",
    "./assets/creatures/c03-baby.svg",
    "./assets/creatures/c03-egg.svg",
    "./assets/creatures/c03-grown.svg",
    "./assets/creatures/c04-baby.svg",
    "./assets/creatures/c04-egg.svg",
    "./assets/creatures/c04-grown.svg",
    "./assets/creatures/c05-baby.svg",
    "./assets/creatures/c05-egg.svg",
    "./assets/creatures/c05-grown.svg",
    "./assets/creatures/c06-baby.svg",
    "./assets/creatures/c06-egg.svg",
    "./assets/creatures/c06-grown.svg",
    "./assets/creatures/c07-baby.svg",
    "./assets/creatures/c07-egg.svg",
    "./assets/creatures/c07-grown.svg",
    "./assets/creatures/c08-baby.svg",
    "./assets/creatures/c08-egg.svg",
    "./assets/creatures/c08-grown.svg",
    "./assets/creatures/c09-baby.svg",
    "./assets/creatures/c09-egg.svg",
    "./assets/creatures/c09-grown.svg",
    "./assets/creatures/c10-baby.svg",
    "./assets/creatures/c10-egg.svg",
    "./assets/creatures/c10-grown.svg",
    "./assets/creatures/c11-baby.svg",
    "./assets/creatures/c11-egg.svg",
    "./assets/creatures/c11-grown.svg",
    "./assets/creatures/creatures.js",
    "./assets/fonts/OpenDyslexic-Regular.woff",
    "./assets/fonts/nunito-500.woff2",
    "./assets/fonts/nunito-700.woff2",
    "./assets/fonts/nunito-900.woff2",
    "./assets/icons/apple-touch-icon.png",
    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512-maskable.png",
    "./assets/icons/icon-512.png",
    "./css/app.css",
    "./css/screens.css",
    "./css/modes/build.css",
    "./css/modes/choice.css",
    "./css/modes/gap.css",
    "./css/modes/matching.css",
    "./css/modes/type.css",
    "./data/blocklist.js",
    "./data/config.js",
    "./data/dictionary.js",
    "./data/emoji.js",
    "./data/lists.js",
    "./data/names.js",
    "./js/clock.js",
    "./js/distractors.js",
    "./js/keyboard.js",
    "./js/main.js",
    "./js/modes/build.js",
    "./js/modes/choice.js",
    "./js/modes/gap.js",
    "./js/modes/matching.js",
    "./js/modes/type.js",
    "./js/ocr.js",
    "./js/rewards.js",
    "./js/round.js",
    "./js/screens/home.js",
    "./js/screens/list.js",
    "./js/screens/parent.js",
    "./js/screens/play.js",
    "./js/screens/results.js",
    "./js/screens/state.js",
    "./js/screens/ui.js",
    "./js/screens/who.js",
    "./js/share.js",
    "./js/speech.js",
    "./js/store.js",
    "./vendor/lz-string.mjs",
    "./vendor/qrcode.mjs"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Default cache mode: files the page just loaded come from the HTTP cache, so a first visit downloads
    // the app once. The versioned cache name (CACHE_VERSION) handles updates.
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("spellhatch-") && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ---------- second phase: every word picture, in the background ----------
let warming = null;
async function warm() {
  if (warming) return warming;
  warming = (async () => {
    try {
      const cache = await caches.open(CACHE);
      const src = await ((await cache.match("./data/emoji.js")) || (await fetch("./data/emoji.js"))).text();
      const map = src.slice(0, Math.max(0, src.indexOf("export const DEFS")) || src.length);
      const hexes = [...new Set([...map.matchAll(/:\s*"([0-9a-f]{2,6}(?:-[0-9a-f]{2,6})*)"/g)].map((m) => m[1]))];
      for (let i = 0; i < hexes.length; i += 12) {
        await Promise.all(hexes.slice(i, i + 12).map(async (hex) => {
          const url = "./assets/emoji/" + hex + ".svg";
          if (await cache.match(url)) return;
          try { const res = await fetch(url); if (res.ok) await cache.put(url, res); } catch { /* offline: try next time */ }
        }));
      }
    } catch { /* best effort */ }
    finally { warming = null; }
  })();
  return warming;
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "warm") event.waitUntil(warm());
});

const STATIC = /\/assets\/(emoji|fonts|icons)\//;

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, isNav) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NET_TIMEOUT_MS))
    ]);
    if (res && res.ok && res.type === "basic") {
      // Navigations may carry ?now= or other params: store the page under its plain path.
      const key = isNav ? new URL(req.url).pathname.replace(/\/$/, "/index.html") : req;
      cache.put(key, res.clone());
    }
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true })
      || (isNav ? (await cache.match("./index.html")) || (await cache.match("./")) : null);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // OCR CDN and anything else: browser default
  if (!url.pathname.startsWith(new URL("./", self.location).pathname)) return;
  const isNav = req.mode === "navigate";
  if (!isNav && STATIC.test(url.pathname)) { event.respondWith(cacheFirst(req)); return; }
  event.respondWith(networkFirst(req, isNav));
});
