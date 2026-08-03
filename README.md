# CHF — Système Hospitalier (structure modulaire)

Ton fichier HTML unique a été découpé en modules **CommonJS** (`require` / `module.exports`),
organisés comme tu l'as demandé :

```
chf-app/
├── package.json
├── build.js            ← script de build (esbuild) : transforme les modules en 1 seul bundle.js
├── server.js            ← petit serveur Express qui sert le résultat
├── api/
│   ├── firebase.js      ← init Firebase (auth, db) + clés localStorage (ajouté, pas dans ta liste)
│   └── supabase.js      ← classe CHF_API + toEpisodeApi/fromEpisodeApi/toPaiementApi
├── utils/
│   ├── constants.js     ← LISTE_ONG, CONFIG_LITS, CATEGORIES_LISTE
│   ├── helpers.js       ← formatGourdes, formatDH, echapperHTML, IndexedDB...
│   └── icons.js         ← icônes SVG (ajouté — utilisé par presque tous les composants)
├── components/
│   ├── Login.js, Toast.js, CalculateurPanel.js, ArchivesPanel.js,
│   │   DashboardDirection.js, DashboardCaisse.js, GestionStock.js,
│   │   GestionUtilisateurs.js, Demandes.js, Simulateur.js, GrilleEdition.js
├── app/
│   └── AppHospitaliere.js  ← composant principal + point de montage React
└── public/
    ├── index.html        ← page allégée (CDN + <script src="bundle.js">)
    └── bundle.js          ← généré par `npm run build` (ne pas éditer à la main)
```

## ⚠️ Pourquoi il faut un petit build (esbuild)

Le navigateur ne comprend pas nativement `require()` / `module.exports`, ni le JSX
(`<div>...</div>` dans du JS). Dans ton fichier original, Babel Standalone faisait cette
transformation *en direct dans le navigateur*. Avec des fichiers séparés en CommonJS,
il faut un petit outil qui **assemble tout ça en un seul fichier `bundle.js`** avant de
servir la page — c'est le rôle d'esbuild ici (rapide, une seule dépendance).

Ça ne veut pas dire que ton "backend Node.js" exécute React — non, React tourne toujours
dans le navigateur du client, comme avant. Node.js sert juste les fichiers (via Express)
et peut aussi faire tourner ton build.

## Installation

```bash
cd chf-app
npm install        # installe esbuild + express
npm run build      # génère public/bundle.js
npm start          # lance le serveur sur http://localhost:3000
```

Pendant le développement, tu peux lancer `npm run watch` dans un terminal (rebuild auto
à chaque modification) et `npm start` dans un autre.

## Ce qui a changé par rapport à l'original

- Toutes les références à `window.chf`, `window.db`, `LOG_MEDS_KEY`, etc. ont été remplacées
  par des `require(...)` explicites entre modules (plus facile à suivre).
- **Bug corrigé** : dans le bouton "Enregistrer la Fiche N°X au Dossier" du calculateur,
  le code appelait `viderLeCalculateurFicheUniquement()` qui n'existait pas dans ce composant
  (elle vit dans `AppHospitaliere.js`) — remplacé par la prop `onViderFicheActive()` qui fait
  la même chose et qui était déjà passée au composant.
- `API_BASE` dans `api/supabase.js` reste à modifier si l'URL de ton backend change.

## Prochaine étape possible

Si tu veux, je peux aussi te fournir une version Docker (`Dockerfile` + `docker-compose.yml`)
pour déployer `server.js` directement, ou brancher un vrai bundler avec hot-reload (Vite) si
tu préfères une meilleure expérience de développement.
