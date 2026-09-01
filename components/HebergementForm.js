// components/HebergementForm.js
// Purement présentationnel : les calculs (jours, totaux) restent dans CalculateurPanel.js.
const React = window.React;
const { CONFIG_LITS, prixLit } = require('../utils/constants');
const { formatGourdes } = require('../utils/helpers');

function HebergementForm({
  dateEntree1, setDateEntree1, dateSortie1, setDateSortie1, typeLit1, setTypeLit1,
  multiPeriode, setMultiPeriode, dateEntree2, setDateEntree2, dateSortie2, setDateSortie2, typeLit2, setTypeLit2,
  hasChirSpec, setHasChirSpec, nomChirSpec, setNomChirSpec, prixChirSpec, setPrixChirSpec, tarifChoisi
}) {
  return (
    <div className="bg-white p-4 rounded-xl border space-y-3 shadow-sm">
      <p className="text-[11px] font-bold uppercase text-gray-400">1. Hébergement & Séjour (Optionnel)</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div><label className="text-[10px] font-bold text-gray-500 uppercase">Date d'entrée</label><input type="date" value={dateEntree1} onChange={e=>setDateEntree1(e.target.value)} className="border rounded-lg p-1.5 text-xs w-full" /></div>
        <div><label className="text-[10px] font-bold text-gray-500 uppercase">Date de sortie</label><input type="date" value={dateSortie1} onChange={e=>setDateSortie1(e.target.value)} className="border rounded-lg p-1.5 text-xs w-full" /></div>
        <div><label className="text-[10px] font-bold text-gray-500 uppercase">Type de lit</label><select value={typeLit1} onChange={e=>setTypeLit1(e.target.value)} className="border rounded-lg p-1.5 bg-white text-xs w-full">{Object.entries(CONFIG_LITS).map(([cle, lit]) => <option key={cle} value={cle}>{lit.nom} ({formatGourdes(prixLit(cle, tarifChoisi))}/j)</option>)}</select></div>
      </div>
      <div className="flex gap-4 pt-1 border-t border-dashed mt-2">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer"><input type="checkbox" checked={multiPeriode} onChange={e=>setMultiPeriode(e.target.checked)} className="rounded" /> Acter une seconde période</label>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer"><input type="checkbox" checked={hasChirSpec} onChange={e=>setHasChirSpec(e.target.checked)} className="rounded" /> Opération chirurgicale hors-catalogue</label>
      </div>
      {multiPeriode && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-amber-50/20 p-2 rounded-lg border">
          <div><label className="text-[9px] font-bold text-amber-800">Entrée P2</label><input type="date" value={dateEntree2} onChange={e=>setDateEntree2(e.target.value)} className="border rounded-lg p-1 text-xs w-full bg-white" /></div>
          <div><label className="text-[9px] font-bold text-amber-800">Sortie P2</label><input type="date" value={dateSortie2} onChange={e=>setDateSortie2(e.target.value)} className="border rounded-lg p-1 text-xs w-full bg-white" /></div>
          <div><label className="text-[9px] font-bold text-amber-800">Lit P2</label><select value={typeLit2} onChange={e=>setTypeLit2(e.target.value)} className="border rounded-lg p-1 text-xs w-full bg-white"><option value="normal">Normal</option><option value="semi_prive">Semi Privé</option><option value="prive">Privé</option></select></div>
        </div>
      )}
      {hasChirSpec && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-red-50/20 p-2 rounded-lg border">
          <div><label className="text-[9px] font-bold text-red-800">Libellé</label><input type="text" value={nomChirSpec} onChange={e=>setNomChirSpec(e.target.value)} placeholder="Nom..." className="border rounded-lg p-1 text-xs w-full bg-white outline-none" /></div>
          <div><label className="text-[9px] font-bold text-red-800">Montant (Gdes)</label><input type="number" min="0" value={prixChirSpec} onChange={e=>setPrixChirSpec(e.target.value)} placeholder="0" className="border rounded-lg p-1 text-xs w-full bg-white outline-none" /></div>
        </div>
      )}
    </div>
  );
}

module.exports = HebergementForm;
