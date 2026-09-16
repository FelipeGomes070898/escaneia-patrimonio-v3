// Service Worker do Escaneia Patrimônio — cuida só de deixar o
// carregamento do site rápido em conexão fraca, guardando os arquivos que
// não mudam a cada visita (o "esqueleto" do site: JS, CSS, ícones). Os
// dados de verdade (login, itens cadastrados, fotos, planilha) sempre vêm
// direto da internet, nunca do cache — isso garante que a informação
// mostrada esteja sempre atualizada e correta pra cada pessoa.

const CACHE_ESTATICO = 'escaneia-patrimonio-estatico-v1';
const OFFLINE_URL = '/offline.html';

const PRECACHE = [OFFLINE_URL, '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_ESTATICO)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== CACHE_ESTATICO).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // nunca mexe em salvar/enviar dados

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase, Gemini etc. — sempre direto, sem cache

  // Chamadas de API/dados nunca ficam em cache — sempre precisam vir
  // fresquinhas da internet (login, itens, duplicados, planilha...).
  if (url.pathname.startsWith('/api/')) return;

  // Arquivos do próprio site que não mudam de conteúdo sob a mesma URL
  // (o build do Next.js dá um código único pro nome de cada um) — guarda
  // no cache e reaproveita, sem precisar baixar de novo toda vez. É isso
  // que deixa o carregamento rápido mesmo com sinal fraco.
  if (url.pathname.startsWith('/_next/static/') || /\.(png|jpg|jpeg|svg|ico|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_ESTATICO).then(async (cache) => {
        const emCache = await cache.match(request);
        if (emCache) return emCache;
        try {
          const resposta = await fetch(request);
          if (resposta.ok) cache.put(request, resposta.clone());
          return resposta;
        } catch {
          return emCache || Response.error();
        }
      })
    );
    return;
  }

  // Navegação entre telas do site: tenta sempre buscar a versão mais nova
  // (tem login, permissão e dados de cada pessoa) — só mostra um aviso se
  // estiver mesmo sem internet nenhuma, em vez do erro feio do navegador.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
