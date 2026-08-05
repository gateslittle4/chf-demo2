// components/DashboardDirection.js
const React = window.React;
const { useState, useEffect } = React;
const { CATEGORIES_LISTE } = require('../utils/constants');
const { formatGourdes } = require('../utils/helpers');

function DashboardDirectionPanel({ verifications, paiements, medicaments }) {
  const [stats, setStats] = useState({ caMois: 0, caJourCash: 0, caJourOng: 0, occupation: 0, topActes: [], topDetail: [], sonographiesAujourdhui: [], recouvrement: 0, patientsJour: 0 });

  // dateHeure est stocké au format fr-FR "dd/mm/yyyy" — on le convertit en vraie Date pour comparer correctement.
  const parseDateDossier = (dateHeureFr) => {
    if (!dateHeureFr) return null;
    const [j, m, a] = dateHeureFr.split('/').map(Number);
    if (!j || !m || !a) return null;
    return new Date(a, m - 1, j);
  };
  const estAujourdhui = (date) => {
    if (!date || isNaN(date)) return false;
    const now = new Date();
    return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  };

  const calculerStats = (dossiers, transactions) => {
    const mois = new Date().getMonth();
    const annee = new Date().getFullYear();
    // CA basé sur les fiches enregistrées (dès la facturation), et non sur les paiements encaissés —
    // un seul chiffre de référence pour le pilotage, cohérent avec le reste des analyses.
    let caMois = 0, caJourCash = 0, caJourOng = 0;
    dossiers.forEach(v => {
      (v.fiches || []).forEach(f => {
        const dateFiche = f.dateCreation ? new Date(f.dateCreation) : parseDateDossier(v.dateHeure);
        if (!dateFiche || isNaN(dateFiche)) return;
        const montant = f.totalGlobal || 0;
        if ((f.modePaiement === 'cash' || f.modePaiement === 'ong') && dateFiche.getMonth() === mois && dateFiche.getFullYear() === annee) caMois += montant;
        if (estAujourdhui(dateFiche)) {
          if (f.modePaiement === 'cash') caJourCash += montant;
          if (f.modePaiement === 'ong') caJourOng += montant;
        }
      });
    });
    const patientsJour = dossiers.filter(v => estAujourdhui(parseDateDossier(v.dateHeure))).length;
    const hospitalises = dossiers.filter(v => v.status === 'hospitalise' || v.typePatient === 'hospitalise').length;
    const occupation = Math.min(100, (hospitalises / 50) * 100);
    const actesCount = {};
    const detailParType = {}; // Détail précis par nom d'acte (ex: "Sonographie Pelvienne", "Consultation Urgence"...)
    const sonoAujourdhui = {}; // Détail par type de sonographie, aujourd'hui uniquement
    dossiers.forEach(v => { if (v.fiches) { v.fiches.forEach(f => {
      if (f.breakdown) { Object.keys(f.breakdown).forEach(k => { if (k !== 'hospit' && (f.breakdown[k] || 0) > 0) actesCount[k] = (actesCount[k] || 0) + 1; }); }
      const lignes = f.rawState?.lignesCalcul || [];
      lignes.forEach(l => { if (l.type === 'acte' && l.nom) { detailParType[l.nom] = (detailParType[l.nom] || 0) + (l.qte || 1); } });
      // Date effective de la fiche : sa propre date de création si connue, sinon la date d'ouverture du dossier.
      const dateFiche = f.dateCreation ? new Date(f.dateCreation) : parseDateDossier(v.dateHeure);
      if (estAujourdhui(dateFiche)) {
        lignes.forEach(l => { if (l.type === 'acte' && l.sub === 'sono' && l.nom) { sonoAujourdhui[l.nom] = (sonoAujourdhui[l.nom] || 0) + (l.qte || 1); } });
      }
    }); } });
    const topActes = Object.entries(actesCount).sort((a,b) => b[1] - a[1]).slice(0,5).map(([key, count]) => { const cat = CATEGORIES_LISTE.find(c => c.key === key); return { label: cat ? cat.label : key, count }; });
    const topDetail = Object.entries(detailParType).sort((a,b) => b[1] - a[1]).slice(0,8).map(([nom, qte]) => ({ nom, qte }));
    const sonographiesAujourdhui = Object.entries(sonoAujourdhui).sort((a,b) => b[1] - a[1]).map(([nom, qte]) => ({ nom, qte }));
    const totalFacture = dossiers.reduce((s, v) => s + (v.totalGlobal || 0), 0);
    const totalPaye = dossiers.reduce((s, v) => s + (v.montantPaye || 0), 0);
    const recouvrement = totalFacture > 0 ? (totalPaye / totalFacture) * 100 : 0;
    setStats({ caMois, caJourCash, caJourOng, occupation, topActes, topDetail, sonographiesAujourdhui, recouvrement, patientsJour });
  };
  useEffect(() => {
    if (verifications.length || paiements.length) calculerStats(verifications, paiements);
  }, [verifications, paiements]);
  return (
    <div className="space-y-4">
      <h2 className="font-black text-gray-800 text-base">📊 Tableau de bord - Direction</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">CA du mois</span><p className="text-2xl font-black text-emerald-700">{formatGourdes(stats.caMois)} Gdes</p></div>
        <div className="bg-white p-4 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Cash aujourd'hui</span><p className="text-2xl font-black text-blue-600">{formatGourdes(stats.caJourCash)} Gdes</p></div>
        <div className="bg-white p-4 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">ONG aujourd'hui</span><p className="text-2xl font-black text-purple-600">{formatGourdes(stats.caJourOng)} Gdes</p></div>
        <div className="bg-white p-4 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Consultations aujourd'hui</span><p className="text-2xl font-black text-purple-600">{stats.patientsJour}</p></div>
        <div className="bg-white p-4 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Taux d'occupation</span><p className="text-2xl font-black text-amber-600">{Math.round(stats.occupation)}%</p></div>
        <div className="bg-white p-4 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Taux de recouvrement</span><p className="text-2xl font-black text-emerald-600">{Math.round(stats.recouvrement)}%</p></div>
      </div>
      <div className="bg-white p-4 rounded-xl border shadow-sm">
        <h3 className="font-bold text-gray-700 text-xs uppercase">🏆 Top 5 actes (par catégorie)</h3>
        <div className="mt-2 space-y-1">
          {stats.topActes.length === 0 && <p className="text-gray-400 text-xs">Aucune donnée.</p>}
          {stats.topActes.map((a, i) => <div key={i} className="flex justify-between text-xs border-b py-1"><span>{i+1}. {a.label}</span><span className="font-bold">{a.count} prescriptions</span></div>)}
        </div>
      </div>
      <div className="bg-white p-4 rounded-xl border shadow-sm">
        <h3 className="font-bold text-gray-700 text-xs uppercase">🔍 Détail par type précis (consultations, sonographies, césariennes...)</h3>
        <div className="mt-2 space-y-1">
          {stats.topDetail.length === 0 && <p className="text-gray-400 text-xs">Aucune donnée détaillée pour l'instant.</p>}
          {stats.topDetail.map((d, i) => <div key={i} className="flex justify-between text-xs border-b py-1"><span>{i+1}. {d.nom}</span><span className="font-bold">{d.qte} fois</span></div>)}
        </div>
      </div>
      <div className="bg-white p-4 rounded-xl border shadow-sm">
        <h3 className="font-bold text-gray-700 text-xs uppercase">🔬 Sonographies aujourd'hui, par type</h3>
        <div className="mt-2 space-y-1">
          {stats.sonographiesAujourdhui.length === 0 && <p className="text-gray-400 text-xs">Aucune sonographie enregistrée aujourd'hui.</p>}
          {stats.sonographiesAujourdhui.map((d, i) => <div key={i} className="flex justify-between text-xs border-b py-1"><span>{d.nom}</span><span className="font-bold">{d.qte}</span></div>)}
          {stats.sonographiesAujourdhui.length > 0 && <div className="flex justify-between text-xs pt-1 font-black border-t-2 mt-1"><span>TOTAL</span><span>{stats.sonographiesAujourdhui.reduce((s,d)=>s+d.qte,0)}</span></div>}
        </div>
      </div>
    </div>
  );
}

module.exports = DashboardDirectionPanel;
