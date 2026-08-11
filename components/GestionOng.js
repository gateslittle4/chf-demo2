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

  return (
    <div className="space-y-4 text-xs">
      <div className="bg-white p-4 rounded-xl border shadow-sm space-y-2">
        <h2 className="font-black text-gray-800 mb-1">🤝 Partenaires</h2>
        <p className="text-gray-500">Ajoute un partenaire pour qu'il apparaisse dans les listes de sélection (nouveau dossier, factures, archives, caisse).</p>
        <div className="flex gap-2">
          <input
            type="text" value={nouveauNom} onChange={e => setNouveauNom(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ajouter(); }}
            placeholder="Nom du partenaire..." className="border rounded-lg p-2 flex-1 outline-none"
          />
          <button onClick={ajouter} className="bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold">Ajouter</button>
        </div>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden divide-y">
        {listeOngDocs.length === 0 && <p className="text-gray-500 p-3">Aucun partenaire enregistré.</p>}
        {listeOngDocs.map(o => (
          <div key={o.id} className="p-3 flex justify-between items-center hover:bg-gray-50">
            <span className="font-medium text-gray-700">{o.nom}</span>
            <button onClick={() => supprimer(o.id, o.nom)} className="text-gray-300 hover:text-red-600 p-1"><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

module.exports = GestionOngPanel;
