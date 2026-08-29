// Service worker minimo: existe solo para que el navegador considere la
// app "instalable" como PWA (criterio de Chrome/Android para mostrar el
// boton "Instalar"). NO cachea HTML ni respuestas de la API a proposito:
// este es un sistema de inventarios y ventas, y mostrar existencias o
// precios viejos sin conexion seria peor que no tener service worker.
// Solo cachea el manifest y los iconos, que son estaticos y no cambian.
const CACHE = 'cad-shell-v1';
const SHELL_ASSETS = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
    return;
  }
  // Todo lo demas (paginas, /api/*) va directo a la red: paginas de
  // inventario, ventas y sesion siempre deben pedir datos frescos.
});
