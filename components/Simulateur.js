// components/Simulateur.js
const React = window.React;
const { useState, useMemo, useRef } = React;
const { CONFIG_LITS, CATEGORIES_LISTE } = require('../utils/constants');
const { formatGourdes, formatDH } = require('../utils/helpers');
const { X } = require('../utils/icons');

function Simulateur({ medicaments, actes, showToast }) {
  const [lignes, setLignes] = useState([]);
  const [dateEntree1, setDateEntree1] = useState("");
  const [dateSortie1, setDateSortie1] = useState("");
  const [typeLit1, setTypeLit1] = useState("normal");
  const [multiPeriode, setMultiPeriode] = useState(false);
  const [dateEntree2, setDateEntree2] = useState("");
  const [dateSortie2, setDateSortie2] = useState("");
  const [typeLit2, setTypeLit2] = useState("normal");
  const [hasChirSpec, setHasChirSpec] = useState(false);
  const [nomChirSpec, setNomChirSpec] = useState("");
  const [prixChirSpec, setPrixChirSpec] = useState("");
  const [categorie, setCategorie] = useState("med");
  const [tarifChoisi, setTarifChoisi] = useState("actuel"); // "actuel" | "nouveau" — quel prix du catalogue utiliser
  const [lettreActive, setLettreActive] = useState(null);
  const [sousCategorieActeActive, setSousCategorieActeActive] = useState(null);
  const estMobile = window.innerWidth < 768;
  const holdDelaiRef = useRef(null);
  const holdIntervalRef = useRef(null);

  // --- Stepper +/- maintenu enfoncé, identique au Calculateur ---
  const demarrerRepetition = (fn) => {
    fn(); // premier appui = +1 immédiat, comme un clic normal
    holdDelaiRef.current = setTimeout(() => {
      let vitesse = 180;
      const tick = () => {
        fn();
        vitesse = Math.max(35, vitesse - 15);
        holdIntervalRef.current = setTimeout(tick, vitesse);
      };
      tick();
    }, 400);
  };
  const arreterRepetition = () => {
    clearTimeout(holdDelaiRef.current);
    clearTimeout(holdIntervalRef.current);
  };

  // --- Grille cliquable (lettres/catégories), identique au Calculateur : pas de saisie clavier, ordre fixe ---
  const premiereLettre = (nom) => (nom || '?').normalize('NFD').replace(/[\u0300-\u036f]/g, '')[0].toUpperCase();
  const lettresDisponibles = useMemo(() => [...new Set(medicaments.map(m => premiereLettre(m.nom)))].sort(), [medicaments]);
  const categoriesActesDisponibles = useMemo(() => {
    const clesUtilisees = new Set(actes.map(a => a.sub || 'chirurgie'));
    return CATEGORIES_LISTE.filter(c => c.key !== 'hospit' && clesUtilisees.has(c.key));
  }, [actes]);
  const catalogueGrille = useMemo(() => {
    if (categorie === "med") {
      const lettre = lettreActive || lettresDisponibles[0];
      return medicaments.filter(m => premiereLettre(m.nom) === lettre).sort((a, b) => a.nom.localeCompare(b.nom));
    }
    const filtres = sousCategorieActeActive ? actes.filter(a => (a.sub || 'chirurgie') === sousCategorieActeActive) : actes;
    return [...filtres].sort((a, b) => (a.ordre ?? 9999) - (b.ordre ?? 9999) || a.nom.localeCompare(b.nom));
  }, [categorie, medicaments, actes, lettreActive, lettresDisponibles, sousCategorieActeActive]);

  const j1 = useMemo(() => { if (!dateEntree1 || !dateSortie1) return 0; const d=(new Date(dateSortie1)-new Date(dateEntree1))/86400000; if(d<0){setDateSortie1(""); return 0;} return Math.max(0, Math.floor(d)); }, [dateEntree1,dateSortie1]);
  const totalE1 = j1 * CONFIG_LITS[typeLit1].prix;
  const j2 = useMemo(() => { if (!multiPeriode || !dateEntree2 || !dateSortie2) return 0; const d=(new Date(dateSortie2)-new Date(dateEntree2))/86400000; return Math.max(0, Math.floor(d)); }, [multiPeriode,dateEntree2,dateSortie2]);
  const totalE2 = multiPeriode ? j2 * CONFIG_LITS[typeLit2].prix : 0;
  const totalGeneralExeat = totalE1 + totalE2;
  const totalChirSpec = useMemo(() => { const p = parseFloat(prixChirSpec); return isNaN(p) ? 0 : p; }, [hasChirSpec, prixChirSpec]);

  const totalsParService = useMemo(() => { const v = {}; CATEGORIES_LISTE.forEach(c => v[c.key] = 0); v.hospit = totalGeneralExeat; v.chirurgie = totalChirSpec; lignes.forEach(l => { const m = l.qte * l.prix; if(l.type === "med") v.med += m; else if(l.type === "acte") { if(v[l.sub] !== undefined) v[l.sub] += m; else v.chirurgie += m; } }); return v; }, [lignes, totalGeneralExeat, totalChirSpec]);

  const grandTotal = useMemo(() => Object.values(totalsParService).reduce((a,b) => a+b, 0), [totalsParService]);

  const injecterLigne = (item, cat, qte) => {
    const prixEffectif = (tarifChoisi === "nouveau" && item.nouveauPrix != null && item.nouveauPrix !== "") ? parseFloat(item.nouveauPrix) : item.prix;
    setLignes(prev => {
      const index = prev.findIndex(l => l.itemId === item.id && l.type === cat);
      if (index !== -1) return prev.map((l, idx) => idx === index ? { ...l, qte: l.qte + qte } : l);
      return [...prev, { id: "l-" + Math.random().toString(36).slice(2, 6), itemId: item.id, type: cat, sub: item.sub || "", nom: item.nom, qte, prix: prixEffectif }];
    });
  };
  // Le Simulateur sert uniquement à calculer un PRIX — il ne doit jamais être bloqué par
  // la quantité réellement en stock (contrairement au Calculateur, qui prescrit pour de vrai).
  const ajouterAvecQuantite = (item, q) => {
    if (!item || isNaN(q) || q <= 0) return;
    injecterLigne(item, categorie, q);
  };

  const vider = () => { setLignes([]); setDateEntree1(""); setDateSortie1(""); setTypeLit1("normal"); setMultiPeriode(false); setDateEntree2(""); setDateSortie2(""); setTypeLit2("normal"); setHasChirSpec(false); setNomChirSpec(""); setPrixChirSpec(""); setTarifChoisi("actuel"); setLettreActive(null); setSousCategorieActeActive(null); };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl border shadow-sm">
        <h3 className="text-sm font-black text-center border-b pb-2">🧮 Simulateur de facturation (hors base — n'affecte ni le stock ni aucun dossier)</h3>
        <div className="space-y-3 mt-3">
          <p className="text-[11px] font-bold uppercase text-gray-400">1. Hébergement & Séjour (Optionnel)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="text-[10px] font-bold text-gray-500 uppercase">Date entrée</label><input type="date" value={dateEntree1} onChange={e=>setDateEntree1(e.target.value)} className="border rounded-lg p-1.5 text-xs w-full" /></div>
            <div><label className="text-[10px] font-bold text-gray-500 uppercase">Date sortie</label><input type="date" value={dateSortie1} onChange={e=>setDateSortie1(e.target.value)} className="border rounded-lg p-1.5 text-xs w-full" /></div>
            <div><label className="text-[10px] font-bold text-gray-500 uppercase">Type de lit</label><select value={typeLit1} onChange={e=>setTypeLit1(e.target.value)} className="border rounded-lg p-1.5 bg-white text-xs w-full"><option value="normal">Normal (500 Gdes)</option><option value="semi_prive">Semi Privé (500)</option><option value="prive">Privé (1500)</option><option value="isolette">Isolette (1250)</option><option value="incubateur">Incubateur (2500)</option></select></div>
          </div>
          <div className="flex gap-4 pt-1 border-t border-dashed mt-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer"><input type="checkbox" checked={multiPeriode} onChange={e=>setMultiPeriode(e.target.checked)} className="rounded" /> Seconde période</label>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer"><input type="checkbox" checked={hasChirSpec} onChange={e=>setHasChirSpec(e.target.checked)} className="rounded" /> Chirurgie hors-catalogue</label>
          </div>
          {multiPeriode && <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-amber-50/20 p-2 rounded-lg border"><div><label className="text-[9px] font-bold text-amber-800">Entrée P2</label><input type="date" value={dateEntree2} onChange={e=>setDateEntree2(e.target.value)} className="border rounded-lg p-1 text-xs w-full bg-white" /></div><div><label className="text-[9px] font-bold text-amber-800">Sortie P2</label><input type="date" value={dateSortie2} onChange={e=>setDateSortie2(e.target.value)} className="border rounded-lg p-1 text-xs w-full bg-white" /></div><div><label className="text-[9px] font-bold text-amber-800">Lit P2</label><select value={typeLit2} onChange={e=>setTypeLit2(e.target.value)} className="border rounded-lg p-1 text-xs w-full bg-white"><option value="normal">Normal</option><option value="semi_prive">Semi Privé</option><option value="prive">Privé</option></select></div></div>}
          {hasChirSpec && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-red-50/20 p-2 rounded-lg border"><div><label className="text-[9px] font-bold text-red-800">Libellé</label><input type="text" value={nomChirSpec} onChange={e=>setNomChirSpec(e.target.value)} placeholder="Nom..." className="border rounded-lg p-1 text-xs w-full bg-white outline-none" /></div><div><label className="text-[9px] font-bold text-red-800">Montant (Gdes)</label><input type="number" min="0" value={prixChirSpec} onChange={e=>setPrixChirSpec(e.target.value)} placeholder="0" className="border rounded-lg p-1 text-xs w-full bg-white outline-none" /></div></div>}
        </div>

        <div className={estMobile ? "mt-4" : "grid grid-cols-[3fr_2fr] gap-4 items-start mt-4"}>
          <div className={`bg-white p-4 rounded-xl border space-y-3 shadow-sm ${estMobile ? '' : 'max-h-[75vh] overflow-y-auto'}`}>
            <div className="flex justify-between items-center">
              <p className="text-[11px] font-bold uppercase text-gray-400">2. Actes, Laboratoire & Ordonnance</p>
              <div className="flex text-[10px] font-bold rounded-lg border overflow-hidden">
                <button onClick={()=>setTarifChoisi("actuel")} className={`px-2 py-1 ${tarifChoisi!=="nouveau" ? "bg-[#1E2A24] text-white" : "bg-gray-50 text-gray-500"}`}>Tarif Actuel</button>
                <button onClick={()=>setTarifChoisi("nouveau")} className={`px-2 py-1 ${tarifChoisi==="nouveau" ? "bg-indigo-700 text-white" : "bg-gray-50 text-gray-500"}`}>Nouveau prix</button>
              </div>
            </div>
            {tarifChoisi === "nouveau" && <p className="text-[9px] text-indigo-600 font-bold">⚠️ Les articles ajoutés utiliseront le nouveau prix (à venir) quand il existe.</p>}
            <div className="flex gap-2 text-xs font-semibold">
              <button onClick={()=>{ setCategorie("med"); }} className={`flex-1 py-1.5 border rounded-lg ${categorie==="med" ? "bg-[#1E2A24] text-white" : "bg-gray-50"}`}>💊 Pharmacie</button>
              <button onClick={()=>{ setCategorie("acte"); }} className={`flex-1 py-1.5 border rounded-lg ${categorie==="acte" ? "bg-[#1E2A24] text-white" : "bg-gray-50"}`}>🔬 Examens / Actes</button>
            </div>
            <p className="text-[9px] text-gray-400">💡 Clique une lettre puis un résultat pour l'ajouter (quantité 1) — aucune saisie, ajuste la quantité juste en dessous.</p>

            <div className={estMobile ? "space-y-2" : "border-t pt-2 space-y-2"}>
              <p className="text-[10px] font-bold text-gray-400 uppercase">{categorie === "med" ? "Choisir une lettre" : "Choisir une catégorie"}</p>
              {categorie === "med" ? (
                <div className="flex gap-1 flex-wrap">
                  {lettresDisponibles.map(l => (
                    <button key={l} onClick={() => setLettreActive(l)} className={`rounded font-bold ${estMobile ? 'w-10 h-10 text-sm' : 'w-7 h-7 text-xs'} ${(lettreActive || lettresDisponibles[0]) === l ? "bg-[#1E2A24] text-white" : "bg-gray-100 text-gray-600"}`}>{l}</button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-1 flex-wrap">
                  <button onClick={() => setSousCategorieActeActive(null)} className={`rounded font-bold ${estMobile ? 'px-4 py-2 text-sm' : 'px-3 py-1 text-xs'} ${sousCategorieActeActive === null ? "bg-[#1E2A24] text-white" : "bg-gray-100 text-gray-600"}`}>Toutes</button>
                  {categoriesActesDisponibles.map(c => (
                    <button key={c.key} onClick={() => setSousCategorieActeActive(c.key)} className={`rounded font-bold ${estMobile ? 'px-4 py-2 text-sm' : 'px-3 py-1 text-xs'} ${sousCategorieActeActive === c.key ? "bg-[#1E2A24] text-white" : "bg-gray-100 text-gray-600"}`}>{c.label}</button>
                  ))}
                </div>
              )}
              <div className={`grid gap-1.5 overflow-y-auto ${estMobile ? 'grid-cols-2 max-h-72' : 'grid-cols-5 max-h-96'}`}>
                {catalogueGrille.map(item => (
                  <button key={item.id} onClick={() => ajouterAvecQuantite(item, 1)} className={`border rounded-lg text-left hover:bg-emerald-50 hover:border-emerald-400 active:bg-emerald-100 ${estMobile ? 'p-3' : 'p-2'}`}>
                    <div className={`font-semibold text-gray-800 line-clamp-2 ${estMobile ? 'text-sm' : 'text-xs'}`}>{item.nom}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden shadow-sm mt-4 lg:mt-0">
            <table className="w-full text-xs text-left">
              <thead><tr className="bg-gray-100 text-[10px] text-gray-500 uppercase border-b font-mono"><th className="p-3">Désignation</th><th className="p-3 w-20 text-center">Qté</th><th className="p-3 text-right w-24">Prix</th><th className="p-3 text-right w-24">Total</th><th className="w-8"></th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {j1 > 0 && <tr className="bg-amber-50/20"><td className="p-3 text-amber-900">Séjour : {CONFIG_LITS[typeLit1].nom}</td><td className="p-3 text-center font-bold">{j1} jrs</td><td className="p-3 text-right text-gray-400">{formatGourdes(CONFIG_LITS[typeLit1].prix)}</td><td className="p-3 text-right font-bold">{formatGourdes(totalE1)}</td><td></td></tr>}
                {multiPeriode && j2 > 0 && <tr className="bg-amber-50/40"><td className="p-3 text-amber-900">Séjour P2 : {CONFIG_LITS[typeLit2].nom}</td><td className="p-3 text-center font-bold">{j2} jrs</td><td className="p-3 text-right text-gray-400">{formatGourdes(CONFIG_LITS[typeLit2].prix)}</td><td className="p-3 text-right font-bold">{formatGourdes(totalE2)}</td><td></td></tr>}
                {hasChirSpec && nomChirSpec && <tr className="bg-red-50/20"><td className="p-3 text-red-900">Chirurgie : {nomChirSpec}</td><td className="p-3 text-center">1</td><td className="p-3 text-right text-gray-400">{formatGourdes(totalChirSpec)}</td><td className="p-3 text-right font-bold">{formatGourdes(totalChirSpec)}</td><td></td></tr>}
                {lignes.map(l => { const decrementer = () => setLignes(p=>p.map(x=>x.id===l.id?{...x,qte:Math.max(1,x.qte-1)}:x)); const incrementer = () => setLignes(p=>p.map(x=>x.id===l.id?{...x,qte:x.qte+1}:x)); return (
                  <tr key={l.id} className="zebra-row">
                    <td className="p-3 text-gray-800"><span className={`text-[8px] font-bold uppercase px-1 rounded mr-1 ${l.type==='med'?'bg-emerald-50 text-emerald-700':'bg-blue-50 text-blue-700'}`}>{l.type==='med'?'Pharma':'Acte'}</span>{l.nom}</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onMouseDown={()=>demarrerRepetition(decrementer)} onMouseUp={arreterRepetition} onMouseLeave={arreterRepetition} onTouchStart={(e)=>{e.preventDefault(); demarrerRepetition(decrementer);}} onTouchEnd={(e)=>{e.preventDefault(); arreterRepetition();}} onTouchCancel={arreterRepetition} className="w-8 h-8 bg-gray-100 active:bg-gray-300 rounded-lg font-bold text-gray-700 select-none">−</button>
                        <span className="font-mono font-bold w-6 text-center">{l.qte}</span>
                        <button onMouseDown={()=>demarrerRepetition(incrementer)} onMouseUp={arreterRepetition} onMouseLeave={arreterRepetition} onTouchStart={(e)=>{e.preventDefault(); demarrerRepetition(incrementer);}} onTouchEnd={(e)=>{e.preventDefault(); arreterRepetition();}} onTouchCancel={arreterRepetition} className="w-8 h-8 bg-gray-100 active:bg-gray-300 rounded-lg font-bold text-gray-700 select-none">+</button>
                      </div>
                    </td>
                    <td className="p-3 text-right text-gray-400">{formatGourdes(l.prix)}</td>
                    <td className="p-3 text-right font-bold">{formatGourdes(l.qte * l.prix)}</td>
                    <td className="text-center"><button onClick={()=>setLignes(p=>p.filter(x=>x.id!==l.id))} className="text-gray-300 hover:text-red-600"><X size={12}/></button></td>
                  </tr>
                ); })}
              </tbody>
            </table>
            <div className="p-4 bg-gray-50 border-t border-b text-[11px] text-gray-600 font-mono space-y-1 shadow-inner">
              <div className="grid grid-cols-3 font-bold text-[#1E2A24] border-b pb-1 mb-2"><span>RÉCAPITULATIF</span><span className="text-right">Gdes</span><span className="text-right text-emerald-800">💵 DH</span></div>
              {CATEGORIES_LISTE.map(srv => { const m = totalsParService[srv.key]; if (m===0) return null; return <div key={srv.key} className="grid grid-cols-3 py-0.5"><span>• {srv.label}</span><span className="text-right">{formatGourdes(m)}</span><span className="text-right font-bold">{formatDH(m)} DH</span></div>; })}
            </div>
            <div className="bg-[#1E2A24] text-white p-4 flex justify-between items-center font-bold text-sm font-mono"><span>TOTAL SIMULÉ :</span><span>{formatGourdes(grandTotal)} Gdes ({formatDH(grandTotal)} DH)</span></div>
            <div className="p-3 flex justify-end"><button onClick={vider} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-xs font-bold">🧹 Vider</button></div>
          </div>
        </div>
      </div>
    </div>
  );
}

module.exports = Simulateur;
