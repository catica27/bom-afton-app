// Service Worker: cache-first para el app shell (HTML/CSS/JS/vendor/datos/íconos),
// para que la app instalada abra y funcione sin conexión. No toca IndexedDB/localStorage
// (eso vive en el navegador, fuera del alcance de un Service Worker) ni la lógica de
// cálculo o los componentes de la app — solo sirve archivos estáticos desde caché.
//
// Al publicar cambios de archivos, sube CACHE_VERSION para que los usuarios instalados
// reciban la versión nueva (con cache-first, un mismo nombre de caché nunca se refresca).
const CACHE_VERSION = "v1";
const CACHE_NAME = "bom-afton-shell-" + CACHE_VERSION;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/styles.css",
  "./src/ui-utils.js",
  "./src/calc-engine.js",
  "./src/db.js",
  "./src/seed-loader.js",
  "./src/store.js",
  "./src/router.js",
  "./src/excel-import.js",
  "./src/import-export.js",
  "./src/app.js",
  "./src/views/dashboard.js",
  "./src/views/materias-primas.js",
  "./src/views/productos-lista.js",
  "./src/views/producto-detalle.js",
  "./src/views/configuracion.js",
  "./src/views/comparador.js",
  "./src/views/historial.js",
  "./src/views/import-export-view.js",
  "./data/seed.js",
  "./vendor/chart.umd.js",
  "./vendor/xlsx.full.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // no cachear POST/PUT, etc.
  if (new URL(req.url).origin !== location.origin) return; // no interceptar recursos de otros orígenes

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached; // cache-first
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
