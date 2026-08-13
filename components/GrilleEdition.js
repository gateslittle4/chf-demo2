// components/GrilleEdition.js
const React = window.React;
const { useState } = React;
const { chf } = require('../api/supabase');
const { LOG_MEDS_KEY, LOG_ACTES_KEY } = require('../api/firebase');
const { CATEGORIES_LISTE } = require('../utils/constants');
const { formatGourdes } = require('../utils/helpers');
const { Check, X, Pencil, Trash2 } = require('../utils/icons');

function GrilleEditionPanel({ titre, items, setItems, collectionName, showToast }) {
  const [filtre, setFiltre] = useState("");
  const [idEdit, setIdEdit] = useState(null);
  const [prixEdit, setPrixEdit] = useState("");
  const [nouveauPrixEdit, setNouveauPrixEdit] = useState("");
  const [nomEdit, setNomEdit] = useState("");
  const [sousCategorieEdit, setSousCategorieEdit] = useState("");
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauPrix, setNouveauPrix] = useState("");
  const [nouvelleSousCategorie, setNouvelleSousCategorie] = useState("chirurgie");
  const [quantiteStock, setQuantiteStock] = useState("");
  const [seuilAlerte, setSeuilAlerte] = useState("");

  // Catégories disponibles pour classer un acte (hors hospitalisation, gérée séparément)
  const categoriesActes = CATEGORIES_LISTE.filter(c => c.key !== 'hospit');

  // Ordre du bon de laboratoire papier du CHF (colonne gauche puis colonne droite, dans l'ordre où
  // elles apparaissent) — sert à trier "Laboratoire" comme le papier plutôt qu'alphabétiquement.
  const normaliser = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ORDRE_LABO_PAPIER = [
    "Hémogramme", "Taux de plaquettes", "Groupe Sanguin", "Malaria", "Widal", "Test de Grossesse",
    "BHCG Plasmatiques", "Vitesse de sédimentation (VS)", "Glycémie", "Cholestérol", "Acide Urique",
    "V.C.T", "C.R.P", "A.S.O", "Urines", "Frottis vaginal", "Frottis Urétral", "Test Chlamydia",
    "Sérologie H-Pylori", "H-Pylori (Selles)", "Selles", "Sang Occulte", "Hepatite A", "Hepatite B",
    "Hepatite C", "Sickling test", "Electrophorese", "Culture + Antibiogramme", "Hémoculture",
    "Bacilloscopie", "Ionogramme", "Bilan Lipidique", "Chimie Sanguin", "Bilan hépatique",
    "Bilan Rénal", "PSA"
  ];
  const ORDRE_LABO_MAP = {};
  ORDRE_LABO_PAPIER.forEach((nom, idx) => { ORDRE_LABO_MAP[normaliser(nom)] = idx + 1; });

  // Retourne true si la sauvegarde vers le vrai backend a réussi, false sinon (mise à jour locale
  // toujours faite dans les deux cas, pour ne jamais perdre ce que la personne vient de faire à l'écran).
  const sauvegarderCatalogue = async (nouvelleListe) => {
    setItems(nouvelleListe);
    const key = collectionName === 'medicaments' ? LOG_MEDS_KEY : LOG_ACTES_KEY;
    localStorage.setItem(key, JSON.stringify(nouvelleListe));
    try { await chf.updateCatalog(collectionName, nouvelleListe); return true; }
    catch (e) { console.warn("Erreur mise à jour catalogue:", e); return false; }
  };

  const appliquerOrdreLabo = async () => {
    const cibles = items.filter(i => i.sub === 'labo');
    const matches = cibles.filter(i => ORDRE_LABO_MAP[normaliser(i.nom)] != null);
    if (matches.length === 0) { showToast("Aucune correspondance trouvée avec le bon de laboratoire.", "error"); return; }
    if (!confirm(`Appliquer l'ordre du bon de laboratoire à ${matches.length} test(s) sur ${cibles.length} dans "Laboratoire" ?`)) return;
    const updated = items.map(i => i.sub === 'labo' && ORDRE_LABO_MAP[normaliser(i.nom)] != null ? { ...i, ordre: ORDRE_LABO_MAP[normaliser(i.nom)] } : i);
    const succes = await sauvegarderCatalogue(updated);
    if (succes) showToast(`✅ Ordre appliqué à ${matches.length} test(s) et enregistré`, "success");
    else showToast(`⚠️ Ordre appliqué à l'écran, mais PAS enregistré sur le serveur (connexion/backend indisponible) — il sera perdu au prochain chargement. Réessaie.`, "error");
  };


  const correspondances = items
    .filter(i => i.nom.toLowerCase().includes(filtre.toLowerCase()))
    .sort((a, b) => (a.ordre ?? 9999) - (b.ordre ?? 9999) || a.nom.localeCompare(b.nom));
  const nombreEnAttente = items.filter(i => i.nouveauPrix != null && i.nouveauPrix !== "").length;

  const ajouterElement = async () => {
    if (!nouveauNom.trim() || !nouveauPrix) { showToast("Veuillez remplir le nom et le prix.", "error"); return; }
    const prix = parseFloat(nouveauPrix);
    if (isNaN(prix) || prix < 0) { showToast("Prix invalide.", "error"); return; }
    const newItem = {
      id: Date.now() + Math.random(), nom: nouveauNom.trim(), prix, nouveauPrix: null,
      quantite: parseFloat(quantiteStock) || 0, seuilAlerte: parseFloat(seuilAlerte) || 5,
      categorie: collectionName === 'medicaments' ? 'pharmacie' : '',
      sub: collectionName === 'medicaments' ? undefined : nouvelleSousCategorie
    };
    const succes = await sauvegarderCatalogue([...items, newItem]);
    setNouveauNom(""); setNouveauPrix(""); setQuantiteStock(""); setSeuilAlerte("");
    showToast(succes ? "Ajouté et enregistré" : "⚠️ Ajouté à l'écran seulement — pas enregistré sur le serveur, réessaie", succes ? "success" : "error");
  };
  const supprimerElement = async (id) => {
    if (!confirm("Supprimer définitivement ?")) return;
    const succes = await sauvegarderCatalogue(items.filter(i => i.id !== id));
    showToast(succes ? "Supprimé et enregistré" : "⚠️ Retiré de l'écran seulement — pas enregistré sur le serveur, réessaie", succes ? "success" : "error");
  };

  // Fait passer chaque "nouveau prix" en attente vers le prix officiel (les articles sans nouveau
  // prix ne sont pas touchés — ils gardent leur prix actuel tel quel).
  const appliquerNouveauxPrix = async () => {
    if (nombreEnAttente === 0) { showToast("Aucun nouveau prix en attente.", "error"); return; }
    if (!confirm(`Appliquer le nouveau prix sur ${nombreEnAttente} article(s) ? Ce sera le prix utilisé pour toutes les nouvelles fiches à partir de maintenant.`)) return;
    const updated = items.map(i => (i.nouveauPrix != null && i.nouveauPrix !== "") ? { ...i, prix: parseFloat(i.nouveauPrix), nouveauPrix: null } : i);
    const succes = await sauvegarderCatalogue(updated);
    showToast(succes ? `✅ ${nombreEnAttente} prix mis à jour et enregistrés` : `⚠️ Prix changés à l'écran seulement — pas enregistrés sur le serveur, réessaie`, succes ? "success" : "error");
  };

  return (
    <div className="space-y-3 text-xs">
      <div className="bg-white p-3 rounded-xl border shadow-sm space-y-2">
        <h3 className="font-bold text-gray-800">➕ Ajouter un {titre}</h3>
        <div className="flex flex-wrap gap-2">
          <input type="text" value={nouveauNom} onChange={e=>setNouveauNom(e.target.value)} placeholder="Nom..." className="border rounded-lg p-1.5 flex-1 min-w-[120px] outline-none" />
          <input type="number" step="0.01" value={nouveauPrix} onChange={e=>setNouveauPrix(e.target.value)} placeholder="Prix (Gourdes)" className="border rounded-lg p-1.5 w-24 font-mono outline-none" />
          {collectionName === 'medicaments' && (
            <><input type="number" step="1" value={quantiteStock} onChange={e=>setQuantiteStock(e.target.value)} placeholder="Stock" className="border rounded-lg p-1.5 w-16 font-mono outline-none" />
            <input type="number" step="1" value={seuilAlerte} onChange={e=>setSeuilAlerte(e.target.value)} placeholder="Seuil" className="border rounded-lg p-1.5 w-16 font-mono outline-none" /></>
          )}
          {collectionName !== 'medicaments' && (
            <select value={nouvelleSousCategorie} onChange={e=>setNouvelleSousCategorie(e.target.value)} className="border rounded-lg p-1.5 bg-white outline-none">
              {categoriesActes.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          )}
          <button onClick={ajouterElement} className="bg-emerald-700 text-white px-3 py-1.5 rounded font-bold">Ajouter</button>
        </div>
      </div>

      {nombreEnAttente > 0 && (
        <div className="flex items-center justify-between gap-2 bg-indigo-50 border border-indigo-300 rounded-xl p-3">
          <span className="text-indigo-800 font-bold">🕓 {nombreEnAttente} nouveau(x) prix en attente (visibles seulement dans le Simulateur pour l'instant)</span>
          <button onClick={appliquerNouveauxPrix} className="bg-indigo-700 text-white font-bold px-3 py-1.5 rounded whitespace-nowrap">🔄 Appliquer tous les nouveaux prix</button>
        </div>
      )}

      {collectionName !== 'medicaments' && (
        <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-300 rounded-xl p-3">
          <span className="text-blue-800 font-bold">📋 Trier "Laboratoire" comme sur le bon papier</span>
          <button onClick={appliquerOrdreLabo} className="bg-blue-700 text-white font-bold px-3 py-1.5 rounded whitespace-nowrap">Appliquer l'ordre</button>
        </div>
      )}

      <div className="space-y-2">
        <input type="text" value={filtre} onChange={e=>setFiltre(e.target.value)} placeholder="Filtrer..." className="w-full border rounded-lg p-2" />
        <div className="bg-white rounded-xl border overflow-hidden max-h-96 overflow-y-auto divide-y">
          {correspondances.map(i => (
            <div key={i.id} className="p-3 flex justify-between items-center hover:bg-gray-50">
              {idEdit === i.id ? (
                <div className="flex gap-2 w-full justify-between items-center flex-wrap">
                  <input type="text" value={nomEdit} onChange={e=>setNomEdit(e.target.value)} className="border rounded p-1 flex-1" />
                  {collectionName !== 'medicaments' && (
                    <select value={sousCategorieEdit} onChange={e=>setSousCategorieEdit(e.target.value)} className="border rounded p-1 bg-white text-xs">
                      {categoriesActes.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  )}
                  <div className="flex flex-col gap-0.5"><label className="text-[8px] text-gray-400 uppercase font-bold">Prix actuel</label><input type="number" value={prixEdit} onChange={e=>setPrixEdit(e.target.value)} className="w-20 border rounded p-1 text-right font-mono" /></div>
                  <div className="flex flex-col gap-0.5"><label className="text-[8px] text-indigo-500 uppercase font-bold">Nv. prix (à venir)</label><input type="number" value={nouveauPrixEdit} onChange={e=>setNouveauPrixEdit(e.target.value)} placeholder="—" className="w-20 border border-indigo-300 rounded p-1 text-right font-mono" /></div>
                  <button onClick={async ()=>{ const p = parseFloat(prixEdit); if (!isNaN(p) && nomEdit.trim()) { const np = nouveauPrixEdit.trim() === "" ? null : parseFloat(nouveauPrixEdit); const updated = items.map(x => x.id === i.id ? { ...x, nom: nomEdit.trim(), prix: p, nouveauPrix: (np != null && !isNaN(np)) ? np : null, ...(collectionName !== 'medicaments' ? { sub: sousCategorieEdit } : {}) } : x); const succes = await sauvegarderCatalogue(updated); setIdEdit(null); showToast(succes ? "Modifié et enregistré" : "⚠️ Modifié à l'écran seulement — pas enregistré sur le serveur, réessaie", succes ? "success" : "error"); } }} className="bg-green-700 text-white p-1 rounded"><Check size={12}/></button>
                  <button onClick={()=>setIdEdit(null)} className="border p-1 rounded"><X size={12}/></button>
                </div>
              ) : (
                <>
                  <span className="font-medium text-gray-700">{i.nom}</span>
                  <div className="flex gap-2 items-center flex-wrap">
                    {collectionName === 'medicaments' && <span className="text-gray-500">📦 {i.quantite || 0}</span>}
                    {collectionName !== 'medicaments' && (
                      <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                        {categoriesActes.find(c => c.key === i.sub)?.label || '⚠️ Non classé (→ Chirurgie)'}
                      </span>
                    )}
                    <span className="font-mono bg-gray-100 px-2 py-0.5 rounded font-bold">{formatGourdes(i.prix)} Gdes</span>
                    {i.nouveauPrix != null && i.nouveauPrix !== "" && <span className="font-mono bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold" title="Nouveau prix à venir">→ {formatGourdes(i.nouveauPrix)} Gdes</span>}
                    <button onClick={()=>{ setIdEdit(i.id); setNomEdit(i.nom); setPrixEdit(String(i.prix)); setNouveauPrixEdit(i.nouveauPrix != null ? String(i.nouveauPrix) : ""); setSousCategorieEdit(i.sub || 'chirurgie'); }} className="text-gray-400 hover:text-gray-700 p-1"><Pencil size={12}/></button>
                    <button onClick={()=>supprimerElement(i.id)} className="text-gray-300 hover:text-red-600 p-1"><Trash2 size={12}/></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

module.exports = GrilleEditionPanel;
