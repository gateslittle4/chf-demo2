// api/supabase.js
// Classe d'accès au backend Supabase + fonctions de conversion snake_case <-> camelCase

const API_BASE = 'https://chf-backend.onrender.com/api'; // à modifier si besoin

function generateLocalId() {
  return 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

class CHF_API {
  constructor() {
    this.pendingQueue = JSON.parse(localStorage.getItem('pending_ops') || '[]');
    this.isOnline = navigator.onLine;
    window.addEventListener('online', () => { this.isOnline = true; this.syncPending(); });
    window.addEventListener('offline', () => { this.isOnline = false; });
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
      if (error.message.includes('Failed to fetch') || !navigator.onLine) {
        console.warn('🔴 Hors ligne, mise en file d\'attente:', endpoint, data);
        this.pendingQueue.push({ endpoint, method, data, timestamp: Date.now(), localId: meta.localId || null });
        localStorage.setItem('pending_ops', JSON.stringify(this.pendingQueue));
        const offlineError = new Error('Hors ligne. Opération en attente.');
        offlineError.isOfflineQueue = true;
        throw offlineError;
      }
      throw error;
    }
  }

  // Nombre d'opérations en attente de synchronisation (utile pour un badge dans l'UI)
  countPending() { return this.pendingQueue.length; }

  // Retire de la file une création jamais synchronisée (ex: dossier ouvert hors-ligne puis annulé avant le retour d'internet)
  removePendingByLocalId(localId) {
    this.pendingQueue = this.pendingQueue.filter(op => op.localId !== localId);
    localStorage.setItem('pending_ops', JSON.stringify(this.pendingQueue));
  }

  async syncPending() {
    if (!navigator.onLine || this.pendingQueue.length === 0) return;
    console.log(`🔄 Sync de ${this.pendingQueue.length} opérations...`);
    const queue = [...this.pendingQueue];
    this.pendingQueue = [];
    for (const op of queue) {
      try {
        const result = await this.request(op.endpoint, op.method, op.data);
        if (op.localId && result && result.id) {
          // Prévient l'app qu'un ID temporaire local a maintenant un vrai ID serveur
          window.dispatchEvent(new CustomEvent('chf:synced', { detail: { localId: op.localId, realId: result.id, endpoint: op.endpoint } }));
        }
      }
      catch (e) { console.warn('Échec sync, réessaiera plus tard:', e.message); this.pendingQueue.push(op); }
    }
    localStorage.setItem('pending_ops', JSON.stringify(this.pendingQueue));
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
    verrouilleFacture: 'verrouille_facture', dateSuspension: 'date_suspension', updatedAt: 'updated_at', serviceChoisi: 'service_choisi',
    numeroLot: 'numero_lot', moisReport: 'mois_report'
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
    verrouille_facture: 'verrouilleFacture', date_suspension: 'dateSuspension', updated_at: 'updatedAt', service_choisi: 'serviceChoisi',
    numero_lot: 'numeroLot', mois_report: 'moisReport'
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
