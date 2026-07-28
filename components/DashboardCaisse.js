// components/DashboardCaisse.js
const React = window.React;
const { useState, useMemo } = React;
const { LISTE_ONG } = require('../utils/constants');
const { formatGourdes, echapperHTML } = require('../utils/helpers');
const { Printer } = require('../utils/icons');

function DashboardCaissePanel({ verifications, paiements, userDisplayName }) {
  const [filtreDateDebut, setFiltreDateDebut] = useState("");
  const [filtreDateFin, setFiltreDateFin] = useState("");
  const [filtreMode, setFiltreMode] = useState("");
  const [filtreOng, setFiltreOng] = useState("");
  const [sousOnglet, setSousOnglet] = useState("general");

  const paiementsFiltres = useMemo(() => {
    return paiements.filter(p => {
      const dateP = new Date(p.date);
      const debut = filtreDateDebut ? new Date(filtreDateDebut) : null;
      const fin = filtreDateFin ? new Date(filtreDateFin) : null;
      if (debut && dateP < debut) return false;
      if (fin) { const finDay = new Date(fin); finDay.setHours(23,59,59,999); if (dateP > finDay) return false; }
      if (filtreMode && p.mode !== filtreMode) return false;
      if (filtreOng && p.ongPartenaire !== filtreOng) return false;
      return true;
    });
  }, [paiements, filtreDateDebut, filtreDateFin, filtreMode, filtreOng]);

  const totalFiltre = paiementsFiltres.reduce((s,p) => s + (p.montant || 0), 0);
  const rapportONG = useMemo(() => {
    const modes = ['cash', 'credit', 'ong', 'exoneration', 'depot'];
    const ongs = [...new Set(paiementsFiltres.map(p => p.ongPartenaire || 'Sans ONG'))];
    const matrix = {};
    ongs.forEach(ong => { matrix[ong] = {}; modes.forEach(m => matrix[ong][m] = 0); });
    paiementsFiltres.forEach(p => { const ong = p.ongPartenaire || 'Sans ONG'; const mode = p.mode || 'cash'; if (matrix[ong] && matrix[ong][mode] !== undefined) matrix[ong][mode] += p.montant || 0; });
    return { matrix, ongs, modes };
  }, [paiementsFiltres]);

  const imprimerRapport = () => {
    const contenu = `<html><head><meta charset="UTF-8"><title>Rapport ONG</title><style>body{font-family:sans-serif;padding:20px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ccc;padding:6px;text-align:center;} th{background:#eee;} .footer{margin-top:16px;font-size:11px;color:#555;text-align:right;} </style></head><body><h2>Rapport ONG - ${new Date().toLocaleDateString('fr-FR')}</h2><table><thead><tr><th>ONG</th>${rapportONG.modes.map(m => `<th>${echapperHTML(m.toUpperCase())}</th>`).join('')}<th>Total</th></tr></thead><tbody>${rapportONG.ongs.map(ong => { const row = rapportONG.matrix[ong]; const totalRow = rapportONG.modes.reduce((s,m) => s + (row[m]||0), 0); return `<tr><td><strong>${echapperHTML(ong)}</strong></td>${rapportONG.modes.map(m => `<td>${formatGourdes(row[m]||0)}</td>`).join('')}<td><strong>${formatGourdes(totalRow)}</strong></td></tr>`; }).join('')}<tr style="border-top:2px solid #000;"><td><strong>TOTAL</strong></td>${rapportONG.modes.map(m => { const totalCol = rapportONG.ongs.reduce((s,ong) => s + (rapportONG.matrix[ong][m]||0), 0); return `<td><strong>${formatGourdes(totalCol)}</strong></td>`; }).join('')}<td><strong>${formatGourdes(totalFiltre)}</strong></td></tr></tbody></table><p class="footer">Imprimé par : ${echapperHTML(userDisplayName || 'inconnu')} — ${new Date().toLocaleString('fr-FR')}</p></body></html>`;
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) { alert("Autorisez les pop-ups"); return; }
    win.document.write(contenu); win.document.close(); win.focus(); setTimeout(() => win.print(), 500);
  };

  const imprimerTransactions = () => {
    if (paiementsFiltres.length === 0) { alert("Aucune transaction à imprimer."); return; }
    const contenu = `<html><head><meta charset="UTF-8"><title>Transactions - CHF</title><style>body{font-family:sans-serif;padding:20px;} h1{font-size:18px;text-align:center;} table{width:100%;border-collapse:collapse;margin-top:14px;} th,td{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px;} th{background:#eee;} .total{font-weight:bold;font-size:15px;text-align:right;margin-top:10px;} .footer{margin-top:16px;font-size:11px;color:#555;text-align:right;}</style></head><body><h1>CHF — Transactions filtrées (${new Date().toLocaleDateString('fr-FR')})</h1><table><thead><tr><th>Patient</th><th>Montant</th><th>Mode</th><th>ONG</th><th>Date</th><th>Encaissé par</th></tr></thead><tbody>${paiementsFiltres.map(p => `<tr><td>${echapperHTML(p.patientNom||'')}</td><td>${formatGourdes(p.montant)} Gdes</td><td>${echapperHTML(p.mode||'')}</td><td>${echapperHTML(p.ongPartenaire||'—')}</td><td>${new Date(p.date).toLocaleDateString('fr-FR')}</td><td>${echapperHTML(p.encaissePar||'—')}</td></tr>`).join('')}</tbody></table><p class="total">Total : ${formatGourdes(totalFiltre)} Gdes (${paiementsFiltres.length} transactions)</p><p class="footer">Imprimé par : ${echapperHTML(userDisplayName || 'inconnu')} — ${new Date().toLocaleString('fr-FR')}</p></body></html>`;
    const win2 = window.open('', '_blank', 'width=800,height=600');
    if (!win2) { alert("Autorisez les pop-ups"); return; }
    win2.document.write(contenu); win2.document.close(); win2.focus(); setTimeout(() => win2.print(), 500);
  };

  return (
    <div className="space-y-4">
      <h2 className="font-black text-gray-800 text-base">💵 Tableau de bord - Caisse</h2>
      <div className="flex gap-2 border-b pb-2">
        <button onClick={()=>setSousOnglet("general")} className={`px-4 py-2 font-bold text-xs rounded-t-lg ${sousOnglet==="general" ? "bg-[#1E2A24] text-white" : "bg-gray-100"}`}>📊 Général</button>
        <button onClick={()=>setSousOnglet("rapport_ong")} className={`px-4 py-2 font-bold text-xs rounded-t-lg ${sousOnglet==="rapport_ong" ? "bg-[#1E2A24] text-white" : "bg-gray-100"}`}>📊 Rapport ONG</button>
      </div>
      <div className="bg-white p-3 rounded-xl border shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
        <div><label className="text-[10px] font-bold text-gray-400">Date début</label><input type="date" value={filtreDateDebut} onChange={e=>setFiltreDateDebut(e.target.value)} className="border rounded p-1.5 w-full" /></div>
        <div><label className="text-[10px] font-bold text-gray-400">Date fin</label><input type="date" value={filtreDateFin} onChange={e=>setFiltreDateFin(e.target.value)} className="border rounded p-1.5 w-full" /></div>
        <div><label className="text-[10px] font-bold text-gray-400">Mode</label>
          <select value={filtreMode} onChange={e=>setFiltreMode(e.target.value)} className="border rounded p-1.5 w-full bg-white">
            <option value="">Tous</option><option value="cash">Cash</option><option value="credit">Crédit</option><option value="ong">ONG</option><option value="exoneration">Exonération</option><option value="depot">Dépôt</option>
          </select>
        </div>
        <div><label className="text-[10px] font-bold text-gray-400">ONG</label>
          <select value={filtreOng} onChange={e=>setFiltreOng(e.target.value)} className="border rounded p-1.5 w-full bg-white">
            <option value="">Toutes</option>{LISTE_ONG.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {sousOnglet === "general" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Total filtré</span><p className="text-2xl font-black text-emerald-700">{formatGourdes(totalFiltre)} Gdes</p></div>
            <div className="bg-white p-4 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Transactions</span><p className="text-2xl font-black text-blue-600">{paiementsFiltres.length}</p></div>
            <div className="bg-white p-4 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Dépôts</span><p className="text-2xl font-black text-purple-600">{paiementsFiltres.filter(p=>p.mode==='depot').length}</p></div>
          </div>
          <div className="bg-white p-4 rounded-xl border shadow-sm">
            <div className="flex justify-between items-center mb-2"><h3 className="font-bold text-gray-700 text-xs uppercase">📋 Transactions filtrées</h3><button onClick={imprimerTransactions} className="bg-gray-700 text-white px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"><Printer size={12}/> Imprimer</button></div>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-100"><tr><th>Patient</th><th>Montant</th><th>Mode</th><th>ONG</th><th>Date</th></tr></thead>
                <tbody>
                  {paiementsFiltres.slice(0, 50).map((p, i) => (
                    <tr key={i} className="border-b"><td className="p-1">{p.patientNom}</td><td className="p-1">{formatGourdes(p.montant)}</td><td className="p-1">{p.mode}</td><td className="p-1">{p.ongPartenaire || '—'}</td><td className="p-1">{new Date(p.date).toLocaleDateString('fr-FR')}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {sousOnglet === "rapport_ong" && (
        <div className="bg-white p-4 rounded-xl border shadow-sm space-y-3">
          <div className="flex justify-between items-center"><h3 className="font-bold text-gray-700 text-xs uppercase">📊 Rapport croisé ONG / Mode</h3><button onClick={imprimerRapport} className="bg-gray-700 text-white px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"><Printer size={12}/> Imprimer</button></div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead><tr className="bg-gray-100"><th className="p-2 border">ONG</th>{rapportONG.modes.map(m => <th key={m} className="p-2 border text-center">{m.toUpperCase()}</th>)}<th className="p-2 border text-center">Total</th></tr></thead>
              <tbody>
                {rapportONG.ongs.map(ong => {
                  const row = rapportONG.matrix[ong];
                  const totalRow = rapportONG.modes.reduce((s,m) => s + (row[m]||0), 0);
                  return <tr key={ong}><td className="p-2 border font-bold">{ong}</td>{rapportONG.modes.map(m => <td key={m} className="p-2 border text-right">{formatGourdes(row[m]||0)}</td>)}<td className="p-2 border text-right font-bold">{formatGourdes(totalRow)}</td></tr>;
                })}
                <tr className="bg-gray-50 border-t-2 border-black"><td className="p-2 border font-bold">TOTAL</td>{rapportONG.modes.map(m => { const totalCol = rapportONG.ongs.reduce((s,ong) => s + (rapportONG.matrix[ong][m]||0), 0); return <td key={m} className="p-2 border text-right font-bold">{formatGourdes(totalCol)}</td>; })}<td className="p-2 border text-right font-bold">{formatGourdes(totalFiltre)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

module.exports = DashboardCaissePanel;
