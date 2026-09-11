// public/sw.js
// Service worker minimal, seulement pour :
//  1. satisfaire les critères d'installation (bouton "Ajouter à l'écran d'accueil"/"Installer")
//     sur Android/Chrome, qui exigent un fetch handler enregistré ;
//  2. permettre à la coquille de l'app (index.html, bundle.js, tailwind.css) de se lancer même sans
//     connexion, une fois déjà ouverte au moins une fois.
// Ne met JAMAIS en cache les appels /api/* ni Firebase/Firestore : chf.request() gère déjà tout le
// hors-ligne côté app (file d'attente localStorage, voir api/supabase.js) -- ce service worker ne
// touche qu'aux fichiers statiques de ce même site.
const VERSION = 'chf-shell-v1';
const FICHIERS_COQUILLE = ['./', './index.html', './bundle.js', './tailwind.css', './manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // active la nouvelle version tout de suite, pas besoin de fermer tous les onglets
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FICHIERS_COQUILLE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Uniquement les GET sur ce même site -- jamais les appels API (backend Render, Firebase,
  // Supabase...), qui doivent toujours passer par le réseau tel quel.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((reponse) => {
        // Réseau EN PREMIER : un déploiement récent (nouveau bundle.js après une correction) doit
        // toujours être servi dès que la connexion fonctionne. Le cache n'est qu'un filet de
        // secours pour le hors-ligne, jamais une version figée qui empêcherait de voir les mises
        // à jour de l'app.
        const copie = reponse.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copie));
        return reponse;
      })
      .catch(() => caches.match(request).then((r) => r || caches.match('./index.html')))
  );
});
