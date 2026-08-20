// components/GestionOng.js
// Gestion de la liste des partenaires (Firestore, collection "ong_partenaires" — nom de collection
// conservé pour compatibilité avec les données existantes, seul le libellé affiché a changé).
// La liste elle-même est chargée une seule fois dans AppHospitaliere.js et passée en props
// partout où elle est utilisée (nouveau dossier, factures, archives, caisse) — ce panneau
// s'occupe seulement de l'ajout / suppression.
const React = window.React;
const { useState } = React;
const { db, firebase, auth, enregistrerAudit } = require('../api/firebase');
const { Trash2 } = require('../utils/icons');

function GestionOngPanel({ listeOngDocs, showToast }) {
  const [nouveauNom, setNouveauNom] = useState("");

  const ajouter = async () => {
    const nom = nouveauNom.trim();
    if (!nom) { showToast("Entrez un nom de partenaire.", "error"); return; }
    if (listeOngDocs.some(o => o.nom.toLowerCase() === nom.toLowerCase())) { showToast("Ce partenaire existe déjà.", "error"); return; }
    try {
      await db.collection('ong_partenaires').add({
        nom,
        dateAjout: firebase.firestore.FieldValue.serverTimestamp(),
        ajoutePar: auth.currentUser?.displayName || auth.currentUser?.email || 'inconnu'
      });
      enregistrerAudit('ajout_ong_partenaire', { nom });
      setNouveauNom("");
      showToast("Partenaire ajouté avec succès", "success");
    } catch (e) { showToast("Erreur lors de l'ajout.", "error"); }
  };

  const supprimer = async (id, nom) => {
    if (!confirm(`Retirer "${nom}" de la liste des partenaires ?`)) return;
    try {
      await db.collection('ong_partenaires').doc(id).delete();
      enregistrerAudit('suppression_ong_partenaire', { nom });
      showToast("Partenaire retiré", "success");
    } catch (e) { showToast("Erreur lors de la suppression.", "error"); }
  };

  const groupesDoublons = Object.values(
    listeOngDocs.reduce((acc, o) => {
      const cle = (o.nom || '').trim().toLowerCase();
      (acc[cle] = acc[cle] || []).push(o);
      return acc;
    }, {})
  ).filter(g => g.length > 1);

  const nettoyerDoublons = async () => {
    const nbDoublons = groupesDoublons.reduce((s, g) => s + (g.length - 1), 0);
    if (!confirm(`${groupesDoublons.length} partenaire(s) en double trouvé(s) (${nbDoublons} fiche(s) en trop au total). Garder une seule fiche par partenaire et supprimer le reste ?`)) return;
    try {
      const batch = db.batch();
      groupesDoublons.forEach(groupe => {
        // Garde celle avec le "Prochain N°" le plus avancé (la plus probable d'avoir déjà servi), sinon la première.
        const aGarder = groupe.reduce((m, o) => (o.prochainNumero || 1) > (m.prochainNumero || 1) ? o : m, groupe[0]);
        groupe.forEach(o => { if (o.id !== aGarder.id) batch.delete(db.collection('ong_partenaires').doc(o.id)); });
      });
      await batch.commit();
      enregistrerAudit('nettoyage_doublons_ong_partenaires', { nbSupprimes: nbDoublons });
      showToast(`${nbDoublons} doublon(s) supprimé(s)`, "success");
    } catch (e) { showToast("Erreur lors du nettoyage.", "error"); }
  };

  const modifierProchainNumero = async (id, nom, valeur) => {
    const numero = parseInt(valeur, 10);
    if (!numero || numero < 1) return;
    try {
      await db.collection('ong_partenaires').doc(id).update({ prochainNumero: numero });
      enregistrerAudit('modification_prochain_numero_lot', { nom, prochainNumero: numero });
      showToast(`Prochain numéro de ${nom} réglé sur ${numero}`, "success");
    } catch (e) { showToast("Erreur lors de la mise à jour.", "error"); }
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="bg-white p-4 rounded-xl border shadow-sm space-y-2">
        <h2 className="font-black text-gray-800 mb-1">🤝 Partenaires</h2>
        <p className="text-gray-500">Ajoute un partenaire pour qu'il apparaisse dans les listes de sélection (nouveau dossier, factures, archives, caisse). Le "Prochain N°" de chaque partenaire (ci-dessous) définit le numéro du prochain lot/facture généré pour lui.</p>
        <div className="flex gap-2">
          <input
            type="text" value={nouveauNom} onChange={e => setNouveauNom(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ajouter(); }}
            placeholder="Nom du partenaire..." className="border rounded-lg p-2 flex-1 outline-none"
          />
          <button onClick={ajouter} className="bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold">Ajouter</button>
        </div>
        {groupesDoublons.length > 0 && (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-2 mt-1">
            <span className="text-amber-800 font-semibold">⚠️ {groupesDoublons.length} partenaire(s) en double détecté(s) dans la liste ci-dessous.</span>
            <button onClick={nettoyerDoublons} className="bg-amber-600 text-white px-3 py-1.5 rounded-lg font-bold whitespace-nowrap">🧹 Nettoyer les doublons</button>
          </div>
        )}
      </div>
      <div className="bg-white rounded-xl border overflow-hidden divide-y">
        {listeOngDocs.length === 0 && <p className="text-gray-500 p-3">Aucun partenaire enregistré.</p>}
        {listeOngDocs.map(o => (
          <div key={o.id} className="p-3 flex justify-between items-center hover:bg-gray-50">
            <span className="font-medium text-gray-700">{o.nom}</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[10px] text-gray-500">
                Prochain N°
                <input
                  type="number" min="1" defaultValue={o.prochainNumero || 1} key={o.id + '-' + (o.prochainNumero || 1)}
                  onBlur={e => { if (parseInt(e.target.value, 10) !== (o.prochainNumero || 1)) modifierProchainNumero(o.id, o.nom, e.target.value); }}
                  className="w-16 border rounded p-1 text-xs text-center outline-none"
                />
              </label>
              <button onClick={() => supprimer(o.id, o.nom)} className="text-gray-300 hover:text-red-600 p-1"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

module.exports = GestionOngPanel;
