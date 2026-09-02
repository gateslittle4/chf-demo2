// api/supabase.js
// Classe d'accès au backend Supabase + fonctions de conversion snake_case <-> camelCase

const API_BASE = 'https://chf-backend.onrender.com/api'; // à modifier si besoin

function generateLocalId() {
  return 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

class CHF_API {
  constructor() {
    this.pendingQueue = JSON.parse(localStorage.getItem('pending_ops') || '[]');
    // Correspondance ID local (créé hors ligne) -> vrai ID serveur, apprise au fur et à mesure que
    // les créations en attente se synchronisent. Indispensable pour rejouer correctement les
    // opérations suivantes sur ce même dossier (fiches ajoutées, archivage...) faites hors ligne
    // AVANT que sa création n'ait pu être confirmée par le serveur : sans ça, ces opérations
    // ciblent encore l'ID local une fois rejouées, qui ne correspond à aucune ligne côté serveur --
    // et comme `episodes.id` est une colonne texte (pas un UUID strict), Supabase répond alors 200
    // avec un résultat vide plutôt qu'une erreur : l'opération est silencieusement ignorée (rien
    // n'est mis à jour) au lieu d'échouer et de se remettre en file.
    this.localIdMap = JSON.parse(localStorage.getItem('local_id_map') || '{}');
    this.isOnline = navigator.onLine;
    window.addEventListener('online', () => { this.isOnline = true; this.syncPending(); });
    window.addEventListener('offline', () => { this.isOnline = false; });
    // Filet de sécurité : l'événement 'online' du navigateur ne se déclenche QUE lors d'une vraie
    // coupure réseau détectée. Si c'était plutôt le backend qui était indisponible (connexion
    // personnelle restée active tout ce temps), cet événement ne se produit jamais — donc on
    // retente aussi périodiquement, sans attendre un signal du navigateur.
    setInterval(() => this.syncPending(), 30000);
    // Tente une synchronisation dès l'ouverture de l'app si des opérations étaient déjà en attente
    // d'une session précédente (page rechargée/rouverte après une coupure) — sans ça, il fallait
    // attendre jusqu'à 30s (le prochain passage de l'intervalle ci-dessus) avant le premier essai,
    // pendant lesquelles un rechargement des données (loadData) pouvait déjà tourner.
    if (this.pendingQueue.length > 0) this.syncPending();
  }

  async request(endpoint, method = 'GET', data = null, meta = {}) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    // Joint le jeton d'identité Firebase à chaque requête, pour que le backend
    // puisse vérifier qui appelle (voir sécurisation de chf-backend en cours).
    try {
      const { auth } = require('./firebase');
      if (auth.currentUser) {
        const idToken = await auth.currentUser.getIdToken();
        options.headers['Authorization'] = `Bearer ${idToken}`;
      }
    } catch (e) { console.warn('Impossible de joindre le jeton d\'authentification:', e); }
    if (data) options.body = JSON.stringify(data);
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, options);
      if (!response.ok) { const err = await response.json(); throw new Error(err.error || `Erreur serveur (${response.status})`); }
      if (method === 'DELETE') return { success: true };
      return await response.json();
    } catch (error) {
      // Une vraie coupure réseau (hors ligne, DNS, connexion refusée...) fait toujours échouer
      // fetch() avec un TypeError -- mais le message exact dépend du navigateur ("Failed to fetch"
      // sur Chrome, "NetworkError when attempting to fetch resource" sur Firefox, "Load failed" sur
      // Safari). Se fier au texte du message ratait donc la détection hors Chrome ; on se fie au
      // type de l'erreur à la place, qui lui est constant. Une erreur HTTP (ligne 37 ci-dessus) est
      // un Error normal, pas un TypeError, donc elle continue de remonter comme une vraie erreur.
      if (error instanceof TypeError || !navigator.onLine) {
        // Seules les écritures (créer/modifier/supprimer) doivent attendre un retour de connexion --
        // une lecture (GET) ratée hors ligne n'a rien à "rejouer" plus tard (le prochain chargement de
        // données en fera une fraîche de toute façon). La mettre en file gonflait inutilement le
        // compteur "opérations en attente" à chaque tentative de rechargement automatique (au
        // démarrage, toutes les 3 minutes...), même quand la personne n'avait rien fait hors ligne.
        if (method === 'GET') throw error;
        console.warn('🔴 Hors ligne, mise en file d\'attente:', endpoint, data);
        this.pendingQueue.push({ endpoint, method, data, timestamp: Date.now(), localId: meta.localId || null });
        try {
          localStorage.setItem('pending_ops', JSON.stringify(this.pendingQueue));
        } catch (e) {
          // Mémoire locale du navigateur pleine (~5 Mo/site, limite du navigateur, pas de l'app) --
          // setItem() n'écrit rien quand il échoue, donc cette opération n'est PAS réellement en
          // attente : on la retire de la file en mémoire pour ne pas laisser croire qu'elle l'est
          // (sans ça, l'app affichait la QuotaExceededError brute du navigateur au lieu de prévenir
          // clairement que l'opération n'a pas été enregistrée).
          this.pendingQueue.pop();
          const pleinError = new Error("Mémoire du navigateur pleine : cette opération n'a PAS été enregistrée. Ferme et rouvre l'app, puis recommence -- ne continue pas à encaisser avant.");
          pleinError.quotaDepasse = true;
          throw pleinError;
        }
        const offlineError = new Error('Hors ligne. Opération en attente.');
        offlineError.isOfflineQueue = true;
        throw offlineError;
      }
      throw error;
    }
  }

  // Nombre d'opérations en attente de synchronisation (utile pour un badge dans l'UI)
  countPending() { return this.pendingQueue.length; }

  // Détail lisible des opérations en attente (quoi + quand), pour que la personne sache ce qui
  // n'est pas encore enregistré, plutôt qu'un simple nombre sans explication.
  getPendingDetails() {
    const libelle = (op) => {
      if (op.endpoint.startsWith('/episodes')) return op.method === 'POST' ? 'Nouveau dossier' : 'Modification d\'un dossier';
      if (op.endpoint.startsWith('/paiements')) return 'Paiement';
      if (op.endpoint.startsWith('/catalog/medicaments')) return 'Mise à jour de la pharmacie';
      if (op.endpoint.startsWith('/catalog/actes')) return 'Mise à jour des actes';
      return op.endpoint;
    };
    return this.pendingQueue.map(op => ({ texte: libelle(op), quand: new Date(op.timestamp).toLocaleString('fr-FR') }));
  }

  // Retire de la file une création jamais synchronisée (ex: dossier ouvert hors-ligne puis annulé avant le retour d'internet)
  removePendingByLocalId(localId) {
    this.pendingQueue = this.pendingQueue.filter(op => op.localId !== localId);
    try { localStorage.setItem('pending_ops', JSON.stringify(this.pendingQueue)); }
    catch (e) { console.warn('Mémoire du navigateur pleine, retrait non persisté (redeviendra visible après un rechargement) :', e.message); }
  }

  // IDs locaux (dossiers créés/archivés hors ligne) encore en attente de synchronisation -- pour ne
  // JAMAIS écraser leur version optimiste en mémoire par un rechargement serveur qui ne les connaît
  // pas encore. Sans ça : dossier créé+archivé hors ligne -> visible localement -> la page se
  // recharge (ou le polling périodique tombe) avant que la sync n'ait eu le temps d'aboutir ->
  // l'appel serveur écrase l'état avec une liste qui ne contient pas encore ce dossier -> il
  // "disparaît" de l'écran, même si sa création reste bien en file et finira par réussir.
  getPendingEpisodeIds() {
    const ids = new Set();
    this.pendingQueue.forEach(op => {
      if (!op.endpoint.startsWith('/episodes')) return;
      if (op.localId) ids.add(op.localId);
      const match = op.endpoint.match(/\/episodes\/(local-[^/]+)/);
      if (match) ids.add(match[1]);
    });
    return ids;
  }

  async syncPending() {
    // On ne se fie plus à navigator.onLine ici : sur certains téléphones/navigateurs, ce
    // drapeau reste bloqué à "false" même quand la connexion fonctionne réellement. La seule
    // vraie preuve de connexion, c'est une requête qui aboutit — donc on tente toujours si la
    // file n'est pas vide, et on laisse chaque requête individuelle échouer/se remettre en
    // file si la connexion n'est vraiment pas là.
    if (this.pendingQueue.length === 0) return;
    console.log(`🔄 Sync de ${this.pendingQueue.length} opérations...`);
    const queue = [...this.pendingQueue];
    this.pendingQueue = [];
    for (const op of queue) {
      // Si cette opération vise ou contient encore un ID local déjà résolu (sa création a
      // synchronisé plus tôt dans cette même file, ou lors d'un passage précédent), on la réécrit
      // vers le vrai ID serveur -- que ce soit dans l'URL (mise à jour d'un dossier créé hors ligne)
      // OU dans les données envoyées (ex. le episode_id d'un paiement/dépôt lié à ce même dossier).
      let endpoint = op.endpoint;
      for (const [localId, realId] of Object.entries(this.localIdMap)) {
        if (endpoint.includes(localId)) { endpoint = endpoint.replace(localId, realId); break; }
      }
      let data = op.data;
      if (data && typeof data === 'object') {
        let modifie = false;
        const reecrit = {};
        for (const [k, v] of Object.entries(data)) {
          const vr = (typeof v === 'string' && this.localIdMap[v]) ? this.localIdMap[v] : v;
          reecrit[k] = vr;
          if (vr !== v) modifie = true;
        }
        if (modifie) data = reecrit;
      }
      // Si l'URL ou une valeur des données référence encore un ID local SANS correspondance connue,
      // sa création est probablement toujours dans cette même file, pas encore synchronisée. On
      // n'envoie SURTOUT PAS cette opération telle quelle : les colonnes id sont du texte (pas un
      // UUID strict), donc le serveur répondrait quand même avec succès (200, éventuellement un
      // résultat vide pour une mise à jour) au lieu d'une erreur -- l'opération serait alors retirée
      // de la file sans avoir rien appliqué, ou pire, insérée avec une référence orpheline
      // définitive (ex. un paiement pointant vers un episode_id qui n'existera jamais). On la remet
      // plutôt en attente pour le prochain passage.
      const referenceIdLocalNonResolu = (s) => typeof s === 'string' && s.includes('local-') && !Object.keys(this.localIdMap).some(l => s.includes(l));
      const bloque = referenceIdLocalNonResolu(endpoint) || (data && typeof data === 'object' && Object.values(data).some(referenceIdLocalNonResolu));
      if (bloque) { this.pendingQueue.push(op); continue; }
      try {
        const result = await this.request(endpoint, op.method, data);
        // Une création (op.localId défini) qui répond sans erreur HTTP mais sans id exploitable ne
        // doit jamais être abandonnée silencieusement : sans correspondance local -> réel enregistrée,
        // toute opération suivante référençant ce même id local (fiches ajoutées, archivage...) reste
        // bloquée pour toujours dans la file, sans qu'on ne le sache jamais (voir incident du
        // 1er septembre : un dossier créé + archivé hors ligne resté coincé, sa création introuvable
        // aussi bien dans la file que dans local_id_map).
        if (op.localId && !(result && result.id)) throw new Error('Réponse de création sans id — nouvelle tentative');
        if (op.localId && result && result.id) {
          this.localIdMap[op.localId] = result.id;
          try { localStorage.setItem('local_id_map', JSON.stringify(this.localIdMap)); }
          catch (e) { console.warn('Mémoire du navigateur pleine, correspondance ID non persistée :', e.message); }
          // Prévient l'app qu'un ID temporaire local a maintenant un vrai ID serveur
          window.dispatchEvent(new CustomEvent('chf:synced', { detail: { localId: op.localId, realId: result.id, endpoint: op.endpoint } }));
        }
      }
      catch (e) { console.warn('Échec sync, réessaiera plus tard:', e.message); this.pendingQueue.push(op); }
    }
    try { localStorage.setItem('pending_ops', JSON.stringify(this.pendingQueue)); }
    catch (e) { console.warn('Mémoire du navigateur pleine, file après sync non persistée :', e.message); }
    console.log('✅ Sync terminée.');
  }

  async getEpisodes() { return this.request('/episodes'); }
  async createEpisode(data, localId) { return this.request('/episodes', 'POST', data, { localId }); }
  async updateEpisode(id, data) { return this.request(`/episodes/${id}`, 'PUT', data); }
  async deleteEpisode(id) { return this.request(`/episodes/${id}`, 'DELETE'); }

  async getPaiements() { return this.request('/paiements'); }
  async createPaiement(data, localId) { return this.request('/paiements', 'POST', data, { localId }); }

  async getCatalog(type) { return this.request(`/catalog/${type}`); }
  async updateCatalog(type, items) { return this.request(`/catalog/${type}`, 'PUT', { items }); }
}

// ======== CONVERSIONS ========
function toEpisodeApi(data) {
  const map = {
    nomPatient: 'nom_patient', ongPartenaire: 'ong_partenaire', typePatient: 'type_patient',
    numDossier: 'num_episode', dateNaissance: 'date_naissance', dateHeure: 'date_heure',
    totalGlobal: 'total_global', montantPaye: 'montant_paye',
    dateEntreePourTri: 'date_entree_pour_tri', periodeSejourString: 'periode_sejour_string',
    totalSaisiePapierDH: 'total_saisie_papier_dh', contientErreurs: 'contient_erreurs',
    verrouilleFacture: 'verrouille_facture', dateSuspension: 'date_suspension', noteSuspension: 'note_suspension', updatedAt: 'updated_at', serviceChoisi: 'service_choisi',
    numeroLot: 'numero_lot', moisReport: 'mois_report', moisLot: 'mois_lot', lotVerrouille: 'lot_verrouille'
  };
  const result = {};
  for (const [k, v] of Object.entries(data)) result[map[k] || k] = v;
  return result;
}

function fromEpisodeApi(data) {
  const map = {
    nom_patient: 'nomPatient', ong_partenaire: 'ongPartenaire', type_patient: 'typePatient',
    num_episode: 'numDossier', date_naissance: 'dateNaissance', date_heure: 'dateHeure',
    total_global: 'totalGlobal', montant_paye: 'montantPaye',
    date_entree_pour_tri: 'dateEntreePourTri', periode_sejour_string: 'periodeSejourString',
    total_saisie_papier_dh: 'totalSaisiePapierDH', contient_erreurs: 'contientErreurs',
    verrouille_facture: 'verrouilleFacture', date_suspension: 'dateSuspension', note_suspension: 'noteSuspension', updated_at: 'updatedAt', service_choisi: 'serviceChoisi',
    numero_lot: 'numeroLot', mois_report: 'moisReport', mois_lot: 'moisLot', lot_verrouille: 'lotVerrouille'
  };
  const result = {};
  for (const [k, v] of Object.entries(data)) result[map[k] || k] = v;
  return result;
}

function toPaiementApi(data) {
  const map = {
    episodeId: 'episode_id', patientNom: 'patient_nom', ongPartenaire: 'ong_partenaire',
    encaissePar: 'encaisse_par', soldeRestant: 'solde_restant', typePatient: 'type_patient'
  };
  const result = {};
  for (const [k, v] of Object.entries(data)) result[map[k] || k] = v;
  return result;
}

function fromPaiementApi(data) {
  const map = {
    episode_id: 'episodeId', patient_nom: 'patientNom', ong_partenaire: 'ongPartenaire',
    encaisse_par: 'encaissePar', solde_restant: 'soldeRestant', type_patient: 'typePatient'
  };
  const result = {};
  for (const [k, v] of Object.entries(data)) result[map[k] || k] = v;
  return result;
}

const chf = new CHF_API();
window.chf = chf; // conservé pour compatibilité (le code existant utilise window.chf.xxx)

module.exports = { CHF_API, chf, toEpisodeApi, fromEpisodeApi, toPaiementApi, fromPaiementApi, API_BASE, generateLocalId };
