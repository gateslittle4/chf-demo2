// api/firebase.js
// Nécessite que les scripts CDN firebase-app-compat / firebase-auth-compat / firebase-firestore-compat
// soient chargés AVANT le bundle (voir public/index.html).

const firebaseConfig = {
  apiKey: "AIzaSyB20Q4P80hnQ0Tn0injqWJz-k5Vkd4TUXE",
  authDomain: "chf-verification.firebaseapp.com",
  projectId: "chf-verification",
  storageBucket: "chf-verification.firebasestorage.app",
  messagingSenderId: "980296599756",
  appId: "1:980296599756:web:dfc09a14f10b5d53ea5a69"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

window.db = db; // conservé pour compatibilité avec le code existant (window.db.collection(...))

// Clés localStorage utilisées à travers l'app
const LOG_MEDS_KEY = "chf-pharmacie-storage-v2";
const LOG_ACTES_KEY = "chf-actes-storage-v2";
const LOG_VERIF_KEY = "chf-verif-storage-v16";
const LOG_TARGETS_KEY = "chf-targets-storage-v16";
const LOG_DOSSIER_BROUILLON_KEY = "chf-dossier-brouillon-v16";

// Journal d'audit — trace permanente des actions critiques (suppression, changement de rôle, exonération...)
// Écrit dans Firestore, collection "audit_log". Pense à restreindre cette collection en lecture/écriture
// aux rôles autorisés dans tes règles Firestore (voir firestore.rules fourni séparément).
async function enregistrerAudit(action, details = {}) {
  try {
    await db.collection('audit_log').add({
      action,
      details,
      effectuePar: auth.currentUser?.displayName || auth.currentUser?.email || 'inconnu',
      effectueParUid: auth.currentUser?.uid || null,
      date: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.warn('Journal d\'audit: échec d\'écriture', e);
  }
}

module.exports = {
  firebase,
  auth,
  db,
  enregistrerAudit,
  LOG_MEDS_KEY,
  LOG_ACTES_KEY,
  LOG_VERIF_KEY,
  LOG_TARGETS_KEY,
  LOG_DOSSIER_BROUILLON_KEY
};