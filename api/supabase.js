// api/supabase.js
// Classe d'accès au backend Supabase + fonctions de conversion snake_case <-> camelCase

const API_BASE = 'https://chf-backend.onrender.com/api'; // à modifier si besoin

function generateLocalId() {
  return 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

// Identifiant propre à chaque opération mise en file, pour pouvoir la retirer précisément une fois
// confirmée par le serveur (sans toucher aux autres, y compris celles ajoutées par un autre onglet).
function genererOpId() {
  return 'op-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

// Clés de stockage local. `pending_ops` = travail pas encore parti au serveur (JAMAIS supprimé tant
// qu'il n'est pas confirmé) ; `failed_ops` = quarantaine des opérations que le serveur a explicitement
// REFUSÉES (rejouer à l'identique ne marchera jamais) -- rien n'y est effacé non plus, c'est une
// corbeille visible que quelqu'un doit traiter, pas une poubelle.
const CLE_PENDING = 'pending_ops';
const CLE_FAILED = 'failed_ops';
const CLE_ID_MAP = 'local_id_map';
// Au-delà de ce nombre d'échecs consécutifs NON réseau (le serveur répond mais refuse), on arrête de
// rejouer en boucle silencieuse et on met l'opération en quarantaine pour qu'un humain la voie.
const MAX_ECHECS_SERVEUR = 5;

class CHF_API {
  constructor() {
    // Migration : les opérations mises en file par les anciennes versions n'ont pas d'identifiant
    // propre. Sans identifiant, impossible de retirer précisément UNE opération de la file : il
    // fallait vider puis réécrire toute la file, ce qui perdait des opérations quand deux onglets
    // écrivaient en même temps (voir _modifierPendingQueue).
    try {
      const brutes = this._lirePendingQueue();
      if (brutes.some(op => !op.opId)) {
        localStorage.setItem(CLE_PENDING, JSON.stringify(brutes.map(op => op.opId ? op : { ...op, opId: genererOpId() })));
      }
    } catch (e) { console.warn('Migration file d\'attente impossible :', e.message); }
    // Correspondance ID local (créé hors ligne) -> vrai ID serveur, apprise au fur et à mesure que
    // les créations en attente se synchronisent. Indispensable pour rejouer correctement les
    // opérations suivantes sur ce même dossier (fiches ajoutées, archivage...) faites hors ligne
    // AVANT que sa création n'ait pu être confirmée par le serveur : sans ça, ces opérations
    // ciblent encore l'ID local une fois rejouées, qui ne correspond à aucune ligne côté serveur --
    // et comme `episodes.id` est une colonne texte (pas un UUID strict), Supabase répond alors 200
    // avec un résultat vide plutôt qu'une erreur : l'opération est silencieusement ignorée (rien
    // n'est mis à jour) au lieu d'échouer et de se remettre en file.
    this.localIdMap = JSON.parse(localStorage.getItem(CLE_ID_MAP) || '{}');
    this.isOnline = navigator.onLine;
    this.syncEnCours = false; // évite deux synchronisations simultanées (intervalle + événement + clic manuel)
    window.addEventListener('online', () => { this.isOnline = true; this.syncPending(); });
    window.addEventListener('offline', () => { this.isOnline = false; });
    // Filet de sécurité : l'événement 'online' du navigateur ne se déclenche QUE lors d'une vraie
    // coupure réseau détectée. Si c'était plutôt le backend qui était indisponible (connexion
    // personnelle restée active tout ce temps), cet événement ne se produit jamais — donc on
    // retente aussi périodiquement, sans attendre un signal du navigateur.
    setInterval(() => this.syncPending(), 30000);
    // Deux onglets de l'app peuvent tourner en même temps : quand l'un synchronise et modifie la
    // file, l'autre doit le voir immédiatement (son affichage relit la file à chaque rendu, et il ne
    // doit surtout pas continuer à travailler sur une copie périmée).
    window.addEventListener('storage', (e) => {
      if (e.key === CLE_PENDING || e.key === CLE_FAILED) window.dispatchEvent(new CustomEvent('chf:file-changee'));
    });
    // Dernier rempart contre la perte : prévient avant de fermer l'onglet s'il reste du travail non
    // envoyé au serveur. Sans ça, on ferme le portable en pensant que tout est enregistré.
    window.addEventListener('beforeunload', (e) => {
      if (this.countPending() > 0) { e.preventDefault(); e.returnValue = ''; return ''; }
    });
    // Tente une synchronisation dès l'ouverture de l'app si des opérations étaient déjà en attente
    // d'une session précédente (page rechargée/rouverte après une coupure) — sans ça, il fallait
    // attendre jusqu'à 30s (le prochain passage de l'intervalle ci-dessus) avant le premier essai,
    // pendant lesquelles un rechargement des données (loadData) pouvait déjà tourner.
    if (this.countPending() > 0) this.syncPending();
  }

  // ===================== FILE D'ATTENTE : ACCÈS TOUJOURS FRAIS =====================
  // On ne garde JAMAIS la file en mémoire : elle est relue depuis localStorage à chaque usage.
  // Une copie en mémoire (l'ancien `this.pendingQueue`) se périme dès qu'un AUTRE onglet écrit, et
  // la réécrire ensuite écrasait silencieusement le travail de cet autre onglet -- donc des
  // opérations (dossiers, paiements) définitivement perdues sans que personne ne le voie.
  _lireListe(cle) {
    try { return JSON.parse(localStorage.getItem(cle) || '[]'); }
    catch (e) { console.warn(`File ${cle} illisible, traitée comme vide :`, e.message); return []; }
  }
  _lirePendingQueue() { return this._lireListe(CLE_PENDING); }
  _lireFailedOps() { return this._lireListe(CLE_FAILED); }

  // Lecture-modification-écriture atomique, protégée par un verrou navigateur (Web Locks) : un seul
  // onglet à la fois peut modifier la file, même si deux le déclenchent au même instant.
  // `modif` reçoit la liste actuelle et retourne la nouvelle.
  async _modifierListe(cle, modif) {
    const executer = async () => {
      const avant = this._lireListe(cle);
      const apres = modif(avant);
      try {
        localStorage.setItem(cle, JSON.stringify(apres));
      } catch (e) {
        // Mémoire locale pleine (~5 Mo/site, limite du navigateur) : setItem n'écrit rien, donc la
        // liste précédente est intacte -- c'est la NOUVELLE opération qui n'entre pas. Il ne faut
        // surtout pas laisser croire qu'elle est en attente (voir message ci-dessous).
        const pleinError = new Error("Mémoire du navigateur pleine : cette opération n'a PAS été enregistrée. Ferme et rouvre l'app, puis recommence -- ne continue pas à encaisser avant.");
        pleinError.quotaDepasse = true;
        throw pleinError;
      }
      return apres;
    };
    if (navigator.locks && navigator.locks.request) return navigator.locks.request('chf-file-attente', executer);
    return executer(); // navigateur trop ancien pour Web Locks : on continue sans verrou plutôt que de bloquer l'app
  }
  _modifierPendingQueue(modif) { return this._modifierListe(CLE_PENDING, modif); }

  // Retire UNE opération précise de la file (par son identifiant) -- appelé dès qu'elle est confirmée
  // par le serveur, pas à la fin de toute la boucle. Sans ça, fermer/recharger la page au milieu
  // d'une synchronisation rejouait au prochain démarrage des opérations DÉJÀ passées : doublons.
  _retirerDeLaFile(opId) { return this._modifierPendingQueue(file => file.filter(op => op.opId !== opId)); }

  // Met une opération en quarantaine : le serveur l'a explicitement refusée, la rejouer à
  // l'identique ne réussira jamais. Rien n'est effacé -- l'opération complète est conservée pour
  // pouvoir être réessayée ou exportée ; elle sort juste de la boucle de retentatives silencieuse.
  async _mettreEnQuarantaine(op, raison) {
    await this._modifierListe(CLE_FAILED, liste => [...liste, { ...op, raisonEchec: raison, dateEchec: Date.now() }]);
    await this._retirerDeLaFile(op.opId);
    window.dispatchEvent(new CustomEvent('chf:echec-permanent', { detail: { op, raison } }));
    console.error('⛔ Opération mise en quarantaine (refusée par le serveur) :', raison, op);
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
      if (!response.ok) {
        // Le serveur a RÉPONDU et refusé : ce n'est pas un problème de connexion. On garde le code
        // HTTP sur l'erreur pour que syncPending puisse distinguer un refus définitif (4xx : droits
        // insuffisants, données invalides...) d'un incident serveur passager (5xx) qu'il faut
        // continuer à réessayer.
        let messageServeur = `Erreur serveur (${response.status})`;
        try { const err = await response.json(); if (err && err.error) messageServeur = err.error; } catch (_) {}
        const httpError = new Error(messageServeur);
        httpError.status = response.status;
        throw httpError;
      }
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
        // syncPending() rejoue déjà une opération DÉJÀ en file via ce même request() -- si cette
        // relecture échoue encore (backend toujours injoignable), il ne faut PAS la remettre en file
        // ici EN PLUS de la remise en file que fait syncPending() dans son propre catch : sans ce
        // garde-fou, chaque échec de resynchronisation DOUBLAIT la file (remise en file ici, puis
        // encore par syncPending), donc doublait à chaque passage de l'intervalle de 30s -- 1, 2, 4,
        // 8... des milliers de doublons en moins d'une heure de connexion instable (incident du
        // 02/09 : 5326 dossiers vides dupliqués pour un seul patient). On laisse simplement
        // remonter l'erreur brute ; syncPending() se charge seul de la remise en file.
        if (meta.isRetry) throw error;
        console.warn('🔴 Hors ligne, mise en file d\'attente:', endpoint, data);
        // Ajout atomique (verrou + relecture fraîche) : si un autre onglet a mis quelque chose en
        // file entre-temps, son travail est conservé au lieu d'être écrasé. Si la mémoire locale est
        // pleine, _modifierPendingQueue lève une erreur claire et RIEN n'est écrit -- on la laisse
        // remonter telle quelle pour que l'appelant sache que l'opération n'est pas enregistrée.
        await this._modifierPendingQueue(file => [...file, {
          opId: genererOpId(), endpoint, method, data,
          timestamp: Date.now(), localId: meta.localId || null, echecsServeur: 0
        }]);
        const offlineError = new Error('Hors ligne. Opération en attente.');
        offlineError.isOfflineQueue = true;
        throw offlineError;
      }
      throw error;
    }
  }

  // Nombre d'opérations en attente de synchronisation (utile pour un badge dans l'UI)
  countPending() { return this._lirePendingQueue().length; }
  // Nombre d'opérations en quarantaine (refusées par le serveur) -- à traiter par un humain.
  countFailed() { return this._lireFailedOps().length; }

  _libelleOp(op) {
    if (op.endpoint.startsWith('/episodes')) return op.method === 'POST' ? 'Nouveau dossier' : (op.method === 'DELETE' ? 'Suppression d\'un dossier' : 'Modification d\'un dossier');
    if (op.endpoint.startsWith('/paiements')) return 'Paiement';
    if (op.endpoint.startsWith('/catalog/medicaments')) return 'Mise à jour de la pharmacie';
    if (op.endpoint.startsWith('/catalog/actes')) return 'Mise à jour des actes';
    return op.endpoint;
  }

  // Détail lisible des opérations en attente (quoi + qui + quand + depuis combien de temps), pour que
  // la personne sache ce qui n'est pas encore enregistré, plutôt qu'un simple nombre sans explication.
  // `bloqueeDepuisLongtemps` distingue "vient d'être mis en file, c'est normal" de "coincé depuis des
  // heures, il faut regarder" -- sans ça, une opération pouvait tourner en boucle pendant des jours
  // sans que personne ne s'en aperçoive (incident Tresalus Mylove).
  getPendingDetails() {
    const maintenant = Date.now();
    return this._lirePendingQueue().map(op => {
      const ageMinutes = Math.floor((maintenant - (op.timestamp || maintenant)) / 60000);
      return {
        texte: this._libelleOp(op),
        patient: (op.data && (op.data.nom_patient || op.data.patient_nom)) || '',
        quand: new Date(op.timestamp).toLocaleString('fr-FR'),
        ageMinutes,
        bloqueeDepuisLongtemps: ageMinutes >= 15,
        echecsServeur: op.echecsServeur || 0
      };
    });
  }

  // Détail des opérations en quarantaine, avec la raison exacte du refus par le serveur.
  getFailedDetails() {
    return this._lireFailedOps().map(op => ({
      texte: this._libelleOp(op),
      patient: (op.data && (op.data.nom_patient || op.data.patient_nom)) || '',
      quand: new Date(op.timestamp).toLocaleString('fr-FR'),
      raison: op.raisonEchec || 'Refusée par le serveur'
    }));
  }

  // Remet les opérations en quarantaine dans la file normale (ex : après avoir corrigé la cause --
  // droits de l'utilisateur, dossier manquant recréé...). Rien n'est perdu dans un sens ni dans l'autre.
  async reessayerEchecs() {
    const echecs = this._lireFailedOps();
    if (echecs.length === 0) return 0;
    await this._modifierPendingQueue(file => [...file, ...echecs.map(op => ({ ...op, echecsServeur: 0, raisonEchec: undefined, dateEchec: undefined }))]);
    await this._modifierListe(CLE_FAILED, () => []);
    await this.syncPending();
    return echecs.length;
  }

  // Sauvegarde de secours : tout ce qui n'est pas encore parti au serveur, dans un fichier que la
  // personne garde. Dernier filet si le navigateur est réinitialisé ou l'appareil perdu -- sans ça,
  // vider les données du site efface définitivement du travail que le serveur n'a jamais reçu.
  exporterFileAttente() {
    return {
      exporteLe: new Date().toISOString(),
      enAttente: this._lirePendingQueue(),
      enQuarantaine: this._lireFailedOps(),
      correspondancesIdLocaux: this.localIdMap
    };
  }

  // Retire de la file une création jamais synchronisée (ex: dossier ouvert hors-ligne puis annulé avant le retour d'internet)
  removePendingByLocalId(localId) {
    return this._modifierPendingQueue(file => file.filter(op => op.localId !== localId))
      .catch(e => console.warn('Retrait de la file impossible :', e.message));
  }

  // IDs locaux (dossiers créés/archivés hors ligne) encore en attente de synchronisation -- pour ne
  // JAMAIS écraser leur version optimiste en mémoire par un rechargement serveur qui ne les connaît
  // pas encore. Sans ça : dossier créé+archivé hors ligne -> visible localement -> la page se
  // recharge (ou le polling périodique tombe) avant que la sync n'ait eu le temps d'aboutir ->
  // l'appel serveur écrase l'état avec une liste qui ne contient pas encore ce dossier -> il
  // "disparaît" de l'écran, même si sa création reste bien en file et finira par réussir.
  getPendingEpisodeIds() {
    const ids = new Set();
    this._lirePendingQueue().forEach(op => {
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
    if (this.syncEnCours) return; // l'intervalle de 30s, l'événement 'online' et le bouton manuel peuvent tomber ensemble
    const queue = this._lirePendingQueue();
    if (queue.length === 0) return;
    this.syncEnCours = true;
    console.log(`🔄 Sync de ${queue.length} opérations...`);
    try {
      // Principe : chaque opération RESTE dans la file (donc dans localStorage) tant que le serveur
      // ne l'a pas confirmée. On ne vide plus la file d'avance : si la page est rechargée ou le
      // portable fermé au milieu de la synchronisation, rien n'est perdu, et rien n'est rejoué en
      // double non plus puisque ce qui est passé a déjà été retiré une par une.
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
        if (bloque) continue; // reste en file telle quelle : sa création doit passer avant elle
        try {
          const result = await this.request(endpoint, op.method, data, { isRetry: true });
          // Une création (op.localId défini) qui répond sans erreur HTTP mais sans id exploitable ne
          // doit jamais être abandonnée silencieusement : sans correspondance local -> réel enregistrée,
          // toute opération suivante référençant ce même id local (fiches ajoutées, archivage...) reste
          // bloquée pour toujours dans la file, sans qu'on ne le sache jamais (voir incident du
          // 1er septembre : un dossier créé + archivé hors ligne resté coincé, sa création introuvable
          // aussi bien dans la file que dans local_id_map).
          if (op.localId && !(result && result.id)) throw new Error('Réponse de création sans id — nouvelle tentative');
          if (op.localId && result && result.id) {
            this.localIdMap[op.localId] = result.id;
            try { localStorage.setItem(CLE_ID_MAP, JSON.stringify(this.localIdMap)); }
            catch (e) { console.warn('Mémoire du navigateur pleine, correspondance ID non persistée :', e.message); }
            // Prévient l'app qu'un ID temporaire local a maintenant un vrai ID serveur
            window.dispatchEvent(new CustomEvent('chf:synced', { detail: { localId: op.localId, realId: result.id, endpoint: op.endpoint } }));
          }
          // Confirmée par le serveur : c'est SEULEMENT maintenant qu'elle sort de la file.
          await this._retirerDeLaFile(op.opId);
        }
        catch (e) {
          // Panne réseau / serveur endormi : on ne touche à rien, l'opération reste en file et sera
          // retentée. C'est le cas normal hors ligne, il ne doit jamais faire perdre de données.
          const estReseau = (e instanceof TypeError) || e.isOfflineQueue || !e.status;
          if (estReseau) { console.warn('Hors ligne, réessaiera plus tard :', e.message); continue; }
          // Le serveur a répondu et refusé. Un 4xx (droits insuffisants, données invalides, dossier
          // introuvable...) ne passera jamais en rejouant à l'identique : après quelques tentatives on
          // sort l'opération de la boucle silencieuse et on la met en quarantaine VISIBLE, au lieu de
          // la laisser tourner pour toujours sans que personne ne le sache (incident Tresalus Mylove,
          // où 17 opérations sont restées coincées des jours sans alerte).
          const echecs = (op.echecsServeur || 0) + 1;
          const definitif = e.status >= 400 && e.status < 500 && echecs >= MAX_ECHECS_SERVEUR;
          if (definitif) await this._mettreEnQuarantaine(op, `${e.message} (refusé ${echecs} fois par le serveur)`);
          else await this._modifierPendingQueue(file => file.map(o => o.opId === op.opId ? { ...o, echecsServeur: echecs, dernierEchec: e.message } : o));
        }
      }
    } finally {
      this.syncEnCours = false;
    }
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
