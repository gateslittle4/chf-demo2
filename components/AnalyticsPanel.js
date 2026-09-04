// components/AnalyticsPanel.js
// "Pilotage CHF" — tableau de bord d'analyse historique (distinct des tableaux de bord
// Direction/Caisse qui montrent l'instant présent). Utilise Chart.js chargé en CDN (window.Chart).
//
// Hypothèses de classification retenues avec l'utilisateur (voir échange) :
// - USN abandonné (aucune donnée source disponible actuellement).
// - "Échographie" du cahier des charges = ECG dans la vraie nomenclature du CHF.
// - Services déduits du nom des actes déjà facturés (pas de nouveau champ à saisir) :
//     Néonatologie > Maternité > (premier acte de consultation trouvé, par ordre chronologique
//     des fiches : Urgences > Pédiatrie > Général > Chirurgie) > Non classé.
// - Le revenu par catégorie est lu directement dans fiche.breakdown (montants réellement
//   facturés à l'époque), pas recalculé avec les tarifs actuels — plus fiable si les prix
//   ont changé depuis.
const React = window.React;
const { useState, useEffect, useMemo, useRef } = React;
const { formatGourdes, formatDH } = require('../utils/helpers');

const COULEURS_SERVICE = {
  'Urgences': '#dc2626',
  'Pédiatrie': '#059669',
  'Général': '#6b7280',
  'Chirurgie': '#7c3aed',
  'Maternité': '#db2777',
  'Néonatologie': '#2563eb',
  'Non classé': '#9ca3af'
};

const ACTIVITES = [
  { key: 'admissions', label: 'Admissions', couleur: '#1E2A24', portee: 'dossier' },
  { key: 'sono', label: 'Sonographies', couleur: '#7c3aed', portee: 'acte', match: (l) => l.sub === 'sono' },
  { key: 'ecg', label: 'ECG', couleur: '#0891b2', portee: 'acte', match: (l) => l.sub === 'ecg' },
  { key: 'cesarienne', label: 'Césariennes', couleur: '#db2777', portee: 'acte', match: (l) => l.sub === 'cesarienne' },
  { key: 'accouchement', label: 'Accouchements', couleur: '#ea580c', portee: 'acte', match: (l) => l.sub === 'accouchement' },
  { key: 'deliverance', label: 'Délivrances', couleur: '#be185d', portee: 'acte', match: (l) => l.sub === 'deliverance' },
  { key: 'chirurgie', label: 'Chirurgie', couleur: '#dc2626', portee: 'acte', match: (l) => l.sub === 'chirurgie' },
  { key: 'pediatrie', label: 'Pédiatrie', couleur: '#059669', portee: 'service', service: 'Pédiatrie' },
  { key: 'neonat', label: 'Néonatologie', couleur: '#2563eb', portee: 'service', service: 'Néonatologie' },
];

// ========================== HELPERS DATE ==========================
function parseDateDossier(dateHeureFr) {
  if (!dateHeureFr) return null;
  const [j, m, a] = dateHeureFr.split('/').map(Number);
  if (!j || !m || !a) return null;
  const d = new Date(a, m - 1, j);
  return isNaN(d) ? null : d;
}
function dateEffectiveFiche(dossier, fiche) {
  if (fiche.dateCreation) { const d = new Date(fiche.dateCreation); if (!isNaN(d)) return d; }
  return parseDateDossier(dossier.dateHeure);
}
function dansPeriode(date, debut, fin) {
  if (!date) return false;
  if (debut && date < debut) return false;
  if (fin) { const finJour = new Date(fin); finJour.setHours(23,59,59,999); if (date > finJour) return false; }
  return true;
}
function numeroSemaineISO(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const jourSemaine = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jourSemaine);
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - debutAnnee) / 86400000) + 1) / 7);
}
function cleDePeriode(date, periode) {
  if (periode === 'annuel') return `${date.getFullYear()}`;
  if (periode === 'hebdo') return `${date.getFullYear()}-S${String(numeroSemaineISO(date)).padStart(2,'0')}`;
  if (periode === 'quotidien') return date.toISOString().slice(0,10);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; // mensuel (défaut)
}

// ========================== CLASSIFICATION DE SERVICE ==========================
function classifierService(dossier) {
  // Priorité 1 : service choisi explicitement à l'ouverture du dossier (le plus fiable)
  if (dossier.serviceChoisi) return dossier.serviceChoisi;

  // Priorité 2 : déduction automatique (dossiers plus anciens, ouverts avant ce champ)
  const estNeonat = (dossier.fiches || []).some(f => {
    const r = f.rawState || {};
    return r.typeLit1 === 'isolette' || r.typeLit1 === 'incubateur' || r.typeLit2 === 'isolette' || r.typeLit2 === 'incubateur';
  });
  if (estNeonat) return 'Néonatologie';

  const totalMaternite = (dossier.fiches || []).reduce((s, f) => s + (f.breakdown?.accouchement || 0) + (f.breakdown?.cesarienne || 0) + (f.breakdown?.deliverance || 0), 0);
  if (totalMaternite > 0) return 'Maternité';

  const NOMS_CONSULTATION = [
    { motCle: 'consultation urgence', service: 'Urgences' },
    { motCle: 'consultation pédiatre', service: 'Pédiatrie' },
    { motCle: 'consultation générale', service: 'Général' },
    { motCle: 'consultation chirurgie', service: 'Chirurgie' },
  ];
  for (const fiche of (dossier.fiches || [])) {
    const lignes = fiche.rawState?.lignesCalcul || [];
    for (const ligne of lignes) {
      const nomBas = (ligne.nom || '').toLowerCase();
      const trouve = NOMS_CONSULTATION.find(nc => nomBas.includes(nc.motCle));
      if (trouve) return trouve.service;
    }
  }
  return 'Non classé';
}

// ========================== CUMUL REVENU PAR CATÉGORIE (depuis breakdown réel) ==========================
function cumulBreakdown(dossier) {
  const c = { hospit: 0, med: 0, labo: 0, service: 0, chirurgie: 0, oxygene: 0, sono: 0, ecg: 0,
    cesarienne: 0, accouchement: 0, deliverance: 0, curetage: 0, suture: 0, pansement: 0, drainage: 0, pap: 0, visite: 0, nebulisation: 0 };
  (dossier.fiches || []).forEach(f => { Object.keys(f.breakdown || {}).forEach(k => { if (c[k] !== undefined) c[k] += (f.breakdown[k] || 0); }); });
  return c;
}

function AnalyticsPanel({ verifications }) {
  const [filtreDateDebut, setFiltreDateDebut] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0,10); });
  const [filtreDateFin, setFiltreDateFin] = useState(() => new Date().toISOString().slice(0,10));
  const [periode, setPeriode] = useState('mensuel');
  const [activiteSelectionnee, setActiviteSelectionnee] = useState('toutes');
  const [sousOnglet, setSousOnglet] = useState('activites');

  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  // ---- Dossiers filtrés sur la période ----
  const dossiersFiltres = useMemo(() => {
    const debut = filtreDateDebut ? new Date(filtreDateDebut) : null;
    const fin = filtreDateFin ? new Date(filtreDateFin) : null;
    return (verifications || []).filter(v => dansPeriode(parseDateDossier(v.dateHeure), debut, fin));
  }, [verifications, filtreDateDebut, filtreDateFin]);

  const serviceParDossier = useMemo(() => {
    const map = new Map();
    dossiersFiltres.forEach(v => map.set(v.id, classifierService(v)));
    return map;
  }, [dossiersFiltres]);

  // ================= SOUS-ONGLET ACTIVITÉS =================
  const donneesActivites = useMemo(() => {
    const debut = filtreDateDebut ? new Date(filtreDateDebut) : null;
    const fin = filtreDateFin ? new Date(filtreDateFin) : null;
    const activitesAffichees = activiteSelectionnee === 'toutes' ? ACTIVITES : ACTIVITES.filter(a => a.key === activiteSelectionnee);
    const compteurs = {}; // { cle_activite: { cle_periode: count } }
    activitesAffichees.forEach(a => compteurs[a.key] = {});
    const clesPeriodesVues = new Set();

    dossiersFiltres.forEach(v => {
      const dateDossier = parseDateDossier(v.dateHeure);
      const cleP = dateDossier ? cleDePeriode(dateDossier, periode) : null;
      if (cleP) clesPeriodesVues.add(cleP);

      activitesAffichees.forEach(act => {
        if (act.portee === 'dossier' && cleP) { compteurs[act.key][cleP] = (compteurs[act.key][cleP] || 0) + 1; }
        if (act.portee === 'service' && cleP && serviceParDossier.get(v.id) === act.service) { compteurs[act.key][cleP] = (compteurs[act.key][cleP] || 0) + 1; }
      });

      if (activitesAffichees.some(a => a.portee === 'acte')) {
        (v.fiches || []).forEach(f => {
          const dFiche = dateEffectiveFiche(v, f);
          if (!dansPeriode(dFiche, debut, fin)) return;
          const cleFiche = cleDePeriode(dFiche, periode);
          clesPeriodesVues.add(cleFiche);
          const lignes = f.rawState?.lignesCalcul || [];
          activitesAffichees.filter(a => a.portee === 'acte').forEach(act => {
            const qte = lignes.filter(act.match).reduce((s,l) => s + (l.qte || 1), 0);
            if (qte > 0) compteurs[act.key][cleFiche] = (compteurs[act.key][cleFiche] || 0) + qte;
          });
        });
      }
    });

    const clesTriees = Array.from(clesPeriodesVues).sort();
    const series = activitesAffichees.map(act => ({
      label: act.label, couleur: act.couleur,
      data: clesTriees.map(c => compteurs[act.key][c] || 0)
    }));
    return { labels: clesTriees, series };
  }, [dossiersFiltres, activiteSelectionnee, periode, serviceParDossier, filtreDateDebut, filtreDateFin]);

  const kpiActivites = useMemo(() => {
    const total = dossiersFiltres.length;
    const actifs = dossiersFiltres.filter(v => (v.status||'archived') === 'actif').length;
    const revenu = dossiersFiltres.reduce((s,v) => s + (v.totalGlobal || 0), 0);
    const uniques = new Set(dossiersFiltres.map(v => (v.nomPatient||'').trim().toLowerCase())).size;
    return { total, actifs, revenu, uniques };
  }, [dossiersFiltres]);

  // ================= SOUS-ONGLET REVENUS =================
  const donneesRevenus = useMemo(() => {
    const services = Object.keys(COULEURS_SERVICE);
    const revenuParService = {}; const patientsParService = {};
    services.forEach(s => { revenuParService[s] = 0; patientsParService[s] = new Set(); });
    dossiersFiltres.forEach(v => {
      const s = serviceParDossier.get(v.id) || 'Non classé';
      revenuParService[s] += (v.totalGlobal || 0);
      patientsParService[s].add((v.nomPatient||'').trim().toLowerCase());
    });
    const totalGeneral = services.reduce((s,srv) => s + revenuParService[srv], 0);
    return services.map(s => ({
      service: s, revenu: revenuParService[s], patients: patientsParService[s].size,
      pourcentage: totalGeneral > 0 ? (revenuParService[s] / totalGeneral) * 100 : 0
    })).filter(r => r.revenu > 0 || r.patients > 0);
  }, [dossiersFiltres, serviceParDossier]);

  const totalRevenuGeneral = useMemo(() => donneesRevenus.reduce((s,r) => s + r.revenu, 0), [donneesRevenus]);

  // ================= SOUS-ONGLET OCCUPATION =================
  const donneesOccupation = useMemo(() => {
    const debut = filtreDateDebut ? new Date(filtreDateDebut) : new Date(new Date().setMonth(new Date().getMonth()-1));
    const fin = filtreDateFin ? new Date(filtreDateFin) : new Date();
    const services = ['Urgences', 'Maternité', 'Néonatologie', 'Pédiatrie'];
    const deltas = {}; services.forEach(s => deltas[s] = {});

    const ajouterDelta = (service, dateEntreeStr, dateSortieStr) => {
      if (!dateEntreeStr || !dateSortieStr) return;
      const dE = new Date(dateEntreeStr), dS = new Date(dateSortieStr);
      if (isNaN(dE) || isNaN(dS)) return;
      const cleE = dE.toISOString().slice(0,10);
      const dApres = new Date(dS); dApres.setDate(dApres.getDate()+1);
      const cleS = dApres.toISOString().slice(0,10);
      deltas[service][cleE] = (deltas[service][cleE]||0) + 1;
      deltas[service][cleS] = (deltas[service][cleS]||0) - 1;
    };

    dossiersFiltres.forEach(v => {
      const service = serviceParDossier.get(v.id);
      if (!services.includes(service)) return;
      (v.fiches || []).forEach(f => {
        const r = f.rawState || {};
        if (r.dateEntree1 && r.dateSortie1) ajouterDelta(service, r.dateEntree1, r.dateSortie1);
        if (r.multiPeriode && r.dateEntree2 && r.dateSortie2) ajouterDelta(service, r.dateEntree2, r.dateSortie2);
      });
    });

    const jours = [];
    for (let d = new Date(debut); d <= fin; d.setDate(d.getDate()+1)) jours.push(d.toISOString().slice(0,10));

    const series = services.map(s => {
      let cumul = 0;
      const data = jours.map(j => { cumul += (deltas[s][j] || 0); return Math.max(0, cumul); });
      return { label: s, couleur: COULEURS_SERVICE[s], data };
    });
    return { labels: jours, series };
  }, [dossiersFiltres, serviceParDossier, filtreDateDebut, filtreDateFin]);

  // ================= SOUS-ONGLET RÉPARTITION =================
  const donneesRepartition = useMemo(() => {
    const patientsParService = {};
    dossiersFiltres.forEach(v => {
      const s = serviceParDossier.get(v.id) || 'Non classé';
      if (!patientsParService[s]) patientsParService[s] = new Set();
      patientsParService[s].add((v.nomPatient||'').trim().toLowerCase());
    });
    const total = Object.values(patientsParService).reduce((s,set) => s + set.size, 0);
    return Object.entries(patientsParService).map(([service, set]) => ({
      service, count: set.size, pourcentage: total > 0 ? (set.size/total)*100 : 0
    })).filter(r => r.count > 0).sort((a,b) => b.count - a.count);
  }, [dossiersFiltres, serviceParDossier]);

  // ================= RENDU DU GRAPHIQUE (un seul canvas réutilisé) =================
  useEffect(() => {
    if (!chartRef.current || !window.Chart) return;
    if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; }
    const ctx = chartRef.current.getContext('2d');
    let config = null;

    if (sousOnglet === 'activites') {
      config = { type: 'line', data: { labels: donneesActivites.labels, datasets: donneesActivites.series.map(s => ({ label: s.label, data: s.data, borderColor: s.couleur, backgroundColor: s.couleur, tension: 0.3, fill: false })) }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } } };
    } else if (sousOnglet === 'revenus') {
      config = { type: 'bar', data: { labels: donneesRevenus.map(r => r.service), datasets: [
        { type: 'bar', label: 'Revenu (Gdes)', data: donneesRevenus.map(r => r.revenu), backgroundColor: donneesRevenus.map(r => COULEURS_SERVICE[r.service]||'#999'), yAxisID: 'y' },
        { type: 'line', label: 'Patients uniques', data: donneesRevenus.map(r => r.patients), borderColor: '#f59e0b', backgroundColor: '#f59e0b', yAxisID: 'y1', tension: 0.3 }
      ] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { position: 'left', title: { display: true, text: 'Gdes' } }, y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Patients' } } }, plugins: { legend: { position: 'bottom' } } } };
    } else if (sousOnglet === 'occupation') {
      config = { type: 'line', data: { labels: donneesOccupation.labels, datasets: donneesOccupation.series.map(s => ({ label: s.label, data: s.data, borderColor: s.couleur, backgroundColor: s.couleur, tension: 0.2, fill: false, pointRadius: 0 })) }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { ticks: { maxTicksLimit: 10 } } } } };
    } else if (sousOnglet === 'repartition') {
      config = { type: 'pie', data: { labels: donneesRepartition.map(r => r.service), datasets: [{ data: donneesRepartition.map(r => r.count), backgroundColor: donneesRepartition.map(r => COULEURS_SERVICE[r.service]||'#999') }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } };
    }

    if (config) chartInstance.current = new window.Chart(ctx, config);
    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [sousOnglet, donneesActivites, donneesRevenus, donneesOccupation, donneesRepartition]);

  const SOUS_ONGLETS = [
    { key: 'activites', label: '📊 Activités' },
    { key: 'revenus', label: '💰 Revenus' },
    { key: 'occupation', label: '🏥 Occupation' },
    { key: 'repartition', label: '👤 Répartition' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white p-3 rounded-xl border shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
        <div><label className="text-[10px] font-bold text-gray-400 uppercase">Date début</label><input type="date" value={filtreDateDebut} onChange={e=>setFiltreDateDebut(e.target.value)} className="border rounded p-1.5 w-full" /></div>
        <div><label className="text-[10px] font-bold text-gray-400 uppercase">Date fin</label><input type="date" value={filtreDateFin} onChange={e=>setFiltreDateFin(e.target.value)} className="border rounded p-1.5 w-full" /></div>
        <div><label className="text-[10px] font-bold text-gray-400 uppercase">Période</label>
          <select value={periode} onChange={e=>setPeriode(e.target.value)} className="border rounded p-1.5 w-full bg-white">
            <option value="annuel">Annuel</option><option value="mensuel">Mensuel</option><option value="hebdo">Hebdomadaire</option><option value="quotidien">Quotidien</option>
          </select>
        </div>
        <div><label className="text-[10px] font-bold text-gray-400 uppercase">Activité</label>
          <select value={activiteSelectionnee} onChange={e=>setActiviteSelectionnee(e.target.value)} className="border rounded p-1.5 w-full bg-white">
            <option value="toutes">Toutes</option>
            {ACTIVITES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2 border-b pb-2 flex-wrap">
        {SOUS_ONGLETS.map(so => (
          <button key={so.key} onClick={()=>setSousOnglet(so.key)} className={`px-4 py-2 font-bold text-xs rounded-t-lg ${sousOnglet===so.key ? "bg-[#1E2A24] text-white" : "bg-gray-100"}`}>{so.label}</button>
        ))}
      </div>

      {sousOnglet === 'activites' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Total dossiers</span><p className="text-lg font-black">{kpiActivites.total}</p></div>
            <div className="bg-white p-3 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Patients actifs</span><p className="text-lg font-black text-blue-600">{kpiActivites.actifs}</p></div>
            <div className="bg-white p-3 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Revenu total</span><p className="text-lg font-black text-emerald-700">{formatGourdes(kpiActivites.revenu)} Gdes</p></div>
            <div className="bg-white p-3 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Patients uniques</span><p className="text-lg font-black text-purple-600">{kpiActivites.uniques}</p></div>
          </div>
          <div className="bg-white p-4 rounded-xl border shadow-sm" style={{ height: 340 }}><canvas ref={chartRef}></canvas></div>
          <p className="text-xs text-gray-500 bg-gray-50 border rounded-lg p-3">Il montre l'évolution des admissions et des actes dans le temps. Vous pouvez voir les tendances et identifier les périodes de forte activité.</p>
        </>
      )}

      {sousOnglet === 'revenus' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Total revenu</span><p className="text-lg font-black text-emerald-700">{formatGourdes(totalRevenuGeneral)} Gdes</p></div>
            {['Urgences','Maternité','Néonatologie'].map(s => {
              const r = donneesRevenus.find(x => x.service === s);
              return <div key={s} className="bg-white p-3 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">{s}</span><p className="text-lg font-black" style={{color: COULEURS_SERVICE[s]}}>{formatGourdes(r?.revenu||0)} Gdes</p></div>;
            })}
          </div>
          <div className="bg-white p-4 rounded-xl border shadow-sm" style={{ height: 340 }}><canvas ref={chartRef}></canvas></div>
          <div className="bg-white p-4 rounded-xl border shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead><tr className="bg-gray-100 text-[10px] text-gray-500 uppercase border-b"><th className="p-2">Service</th><th className="p-2 text-right">Revenu</th><th className="p-2 text-right">% du total</th><th className="p-2 text-right">Patients uniques</th></tr></thead>
              <tbody className="divide-y">
                {donneesRevenus.map(r => (
                  <tr key={r.service}><td className="p-2 font-bold" style={{color: COULEURS_SERVICE[r.service]}}>{r.service}</td><td className="p-2 text-right font-mono">{formatGourdes(r.revenu)} Gdes</td><td className="p-2 text-right">{r.pourcentage.toFixed(1)}%</td><td className="p-2 text-right">{r.patients}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 bg-gray-50 border rounded-lg p-3">Il montre le revenu généré par chaque service. La courbe orange représente le nombre de patients uniques. Permet d'identifier les services les plus rentables.</p>
        </>
      )}

      {sousOnglet === 'occupation' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {donneesOccupation.series.map(s => (
              <div key={s.label} className="bg-white p-3 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold" style={{color: s.couleur}}>{s.label}</span><p className="text-lg font-black">{s.data.length ? Math.max(...s.data) : 0} <span className="text-[10px] font-normal text-gray-400">pic</span></p></div>
            ))}
          </div>
          <div className="bg-white p-4 rounded-xl border shadow-sm" style={{ height: 340 }}><canvas ref={chartRef}></canvas></div>
          <p className="text-xs text-gray-500 bg-gray-50 border rounded-lg p-3">Il montre le nombre de patients présents chaque jour dans chaque service en se basant sur les dates d'entrée et de sortie. Permet d'anticiper les besoins en lits et en personnel. (Note : Urgences/Pédiatrie n'ont généralement pas de lit associé dans les données — ces courbes resteront proches de 0 sauf séjour avec hébergement facturé.)</p>
        </>
      )}

      {sousOnglet === 'repartition' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {donneesRepartition.map(r => (
              <div key={r.service} className="bg-white p-3 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold" style={{color: COULEURS_SERVICE[r.service]}}>{r.service}</span><p className="text-lg font-black">{r.count} <span className="text-[10px] font-normal text-gray-400">({r.pourcentage.toFixed(0)}%)</span></p></div>
            ))}
          </div>
          <div className="bg-white p-4 rounded-xl border shadow-sm" style={{ height: 340 }}><canvas ref={chartRef}></canvas></div>
          <p className="text-xs text-gray-500 bg-gray-50 border rounded-lg p-3">Il visualise la répartition des patients uniques entre les services. Donne une vue d'ensemble de l'activité de l'hôpital.</p>
        </>
      )}
    </div>
  );
}

module.exports = AnalyticsPanel;
