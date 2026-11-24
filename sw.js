// Service worker do Gestão 360º BKP
// Estratégia "rede primeiro": com internet, sempre busca a versão mais nova do GitHub;
// sem internet, abre a última versão guardada no aparelho.
// Só guarda arquivos do próprio site (fduarteneto1.github.io/dmt). Chamadas à planilha
// Google, mapas e clima passam direto, sem cache.
const CACHE = 'bkp360-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./')))
  );
});
