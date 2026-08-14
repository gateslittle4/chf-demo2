// components/NouveauDossierForm.js
// Purement présentationnel : toute la logique (états, soumission) reste dans
// CalculateurPanel.js, qui passe tout en props. Extrait pour alléger ce gros fichier.
const React = window.React;
const { Search } = require('../utils/icons');

function NouveauDossierForm({
  searchPatientText, setSearchPatientText, suggestionsPatients, choisirPatientExistant,
  peutCreerDossier, onSoumettre,
  inputNom, setInputNom, inputTypePatient, setInputTypePatient, inputOng, setInputOng,
  serviceChoisi, setServiceChoisi,
  inputNumDossier, setInputNumDossier, inputDateNaissance, setInputDateNaissance,
  inputTelephone, setInputTelephone, listeOng
}) {
  return (
    <div className="bg-white p-6 rounded-xl border shadow-sm space-y-4">
      <h3 className="text-base font-black text-center border-b pb-2">🆕 Nouveau Dossier (Épisode)</h3>
      <div className="relative">
        <label className="text-[11px] font-bold uppercase text-gray-400">Rechercher un patient existant</label>
        <input type="text" value={searchPatientText} onChange={e => setSearchPatientText(e.target.value)} placeholder="Nom ou numéro de dossier..." className="border rounded-lg p-2 w-full text-xs outline-none pl-8" />
        <span className="absolute left-2 top-7 text-gray-400"><Search size={14}/></span>
        {suggestionsPatients.length > 0 && (
          <ul className="absolute z-20 left-0 right-0 bg-white border rounded-lg shadow-2xl mt-1 text-xs max-h-48 overflow-y-auto divide-y">
            {suggestionsPatients.map(p => (
              <li key={p.id}><button type="button" onClick={() => choisirPatientExistant(p)} className="w-full text-left px-3 py-2 hover:bg-gray-100 flex justify-between">
                <span>{p.nomPatient}{p.dateNaissance && <span className="text-gray-400"> — né(e) {p.dateNaissance.split('-').reverse().join('/')}</span>}</span><span className="text-gray-500">{p.numDossier || 'N/R'} - {p.ongPartenaire || 'Privé'}</span>
              </button></li>
            ))}
          </ul>
        )}
      </div>
      <div className="text-center text-gray-400 text-[10px]">— ou créer un nouveau —</div>
      {peutCreerDossier ? (
        <form onSubmit={onSoumettre} className="space-y-3">
          <div className="flex flex-col gap-1"><label className="text-[11px] font-bold uppercase text-gray-400">Nom complet</label><input type="text" value={inputNom} onChange={e=>setInputNom(e.target.value)} placeholder="Nom et prénom..." className="border rounded-lg p-2 text-xs outline-none" required /></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-bold uppercase text-gray-400">Type de patient</label><select value={inputTypePatient} onChange={e=>setInputTypePatient(e.target.value)} className="border rounded-lg p-2 text-xs bg-white outline-none"><option value="ONG">🏥 Patient Partenaire</option><option value="PRIVE">💳 Patient Privé</option></select></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-bold uppercase text-gray-400">Service prévu</label><select value={serviceChoisi} onChange={e=>setServiceChoisi(e.target.value)} className="border rounded-lg p-2 text-xs bg-white outline-none"><option value="">-- Non précisé (déduit automatiquement) --</option><option value="Urgences">🚨 Urgences</option><option value="Pédiatrie">🧒 Pédiatrie</option><option value="Général">🩺 Général</option><option value="Chirurgie">🔪 Chirurgie</option><option value="Maternité">🤰 Maternité</option><option value="Néonatologie">👶 Néonatologie</option></select><p className="text-[9px] text-gray-400">Aide le tableau de bord Pilotage CHF à classer ce dossier tout de suite, même avant qu'un acte soit facturé.</p></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-bold uppercase text-gray-400">Partenaire</label><select value={inputOng} onChange={e=>setInputOng(e.target.value)} className="border rounded-lg p-2 text-xs bg-white outline-none" disabled={inputTypePatient !== "ONG"}><option value="">-- Sélectionner --</option>{listeOng.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-bold uppercase text-gray-400">Numéro de dossier</label><input type="text" value={inputNumDossier} onChange={e=>setInputNumDossier(e.target.value)} placeholder="ex: F-2024-045" className="border rounded-lg p-2 text-xs outline-none" /></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-bold uppercase text-gray-400">Date de naissance</label><input type="date" value={inputDateNaissance} onChange={e=>setInputDateNaissance(e.target.value)} className="border rounded-lg p-2 text-xs outline-none" /></div>
          <div className="flex flex-col gap-1"><label className="text-[11px] font-bold uppercase text-gray-400">Téléphone</label><input type="text" value={inputTelephone} onChange={e=>setInputTelephone(e.target.value)} placeholder="509-1234-5678" className="border rounded-lg p-2 text-xs outline-none" /></div>
          <button type="submit" className="w-full bg-[#1E2A24] text-white py-2 rounded-lg text-xs font-bold">🚀 Ouvrir le dossier</button>
        </form>
      ) : <p className="text-gray-500 text-center">Vous n'avez pas la permission de créer un dossier.</p>}
    </div>
  );
}

module.exports = NouveauDossierForm;
