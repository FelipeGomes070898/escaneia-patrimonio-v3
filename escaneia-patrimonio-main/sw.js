// Service worker do "Escaneia Patrimônio"
// Estratégia: network-first (sempre tenta buscar a versão mais nova primeiro),
// caindo para o cache só quando não há internet — assim o app sempre mostra
// a versão atual quando publicada, e ainda funciona offline em campo.
//
// IMPORTANTE: sempre que os arquivos do app forem atualizados, mude o número
// no fim de CACHE_NAME (ex.: v3 -> v4). Isso força o navegador a descartar
// o cache antigo e buscar tudo de novo — sem isso, o app pode continuar
// mostrando uma versão desatualizada mesmo depois de reenviar os arquivos.
const CACHE_NAME = 'escaneia-patrimonio-v9';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon192.png',
  './icon512.png',
  './appletouchicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
