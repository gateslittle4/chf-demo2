// components/AccueilPanel.js
const React = window.React;
const { useState, useEffect, useMemo } = React;
const { chf } = require('../api/supabase');
const { formatGourdes } = require('../utils/helpers');

function AccueilPanel({ verifications, paiements, medicaments, userRole, userDisplayName, onNaviguer, onOuvrirAchatExpress }) {
  const [enAttente, setEnAttente] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setEnAttente(chf.countPending()), 2000);
    return () => clearInterval(interval);
  }, []);

  const resume = useMemo(() => {
    const today = new Date();
    const estAujourdhui = (dateHeureFr) => {
      if (!dateHeureFr) return false;
      const [j, m, a] = dateHeureFr.split('/').map(Number);
      return j === today.getDate() && m === (today.getMonth()+1) && a === today.getFullYear();
    };
    const dossiersActifs = verifications.filter(v => (v.status || 'archived') === 'actif').length;
    const dossiersSuspendus = verifications.filter(v => v.status === 'suspendu').length;
    const caJour = paiements.filter(p => p.date && new Date(p.date).toDateString() === today.toDateString()).reduce((s,p) => s + (p.montant || 0), 0);
    const consultationsJour = verifications.filter(v => estAujourdhui(v.dateHeure)).length;
    return { dossiersActifs, dossiersSuspendus, caJour, consultationsJour };
  }, [verifications, paiements]);

  const stockCritique = useMemo(() => medicaments.filter(m => (m.quantite || 0) <= (m.seuilAlerte || 5)), [medicaments]);

  const peutVendre = userRole === 'comptable' || userRole === 'direction' || userRole === 'administrateur';
  const peutGererStock = userRole === 'administrateur' || userRole === 'direction';

  return (
    <div className="space-y-4">
      <div className="bg-[#1E2A24] text-white p-4 rounded-xl shadow-sm">
        <p className="text-[10px] uppercase tracking-widest text-[#9FB8A8]">Bienvenue</p>
        <h2 className="text-lg font-black">{userDisplayName}</h2>
        <p className="text-xs text-[#9FB8A8]">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div>
        <h3 className="text-xs font-black text-gray-500 uppercase mb-2">Raccourcis</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button onClick={()=>onNaviguer('calcul')} className="bg-white border rounded-xl p-3 text-center shadow-sm hover:shadow-md transition"><div className="text-xl">🆕</div><div className="text-[10px] font-bold mt-1">Nouveau Dossier</div></button>
          {peutVendre && <button onClick={onOuvrirAchatExpress} className="bg-white border rounded-xl p-3 text-center shadow-sm hover:shadow-md transition"><div className="text-xl">⚡</div><div className="text-[10px] font-bold mt-1">Achat Express</div></button>}
          <button onClick={()=>onNaviguer('verifie')} className="bg-white border rounded-xl p-3 text-center shadow-sm hover:shadow-md transition"><div className="text-xl">📁</div><div className="text-[10px] font-bold mt-1">Archives</div></button>
          {peutGererStock && <button onClick={()=>onNaviguer('stock')} className="bg-white border rounded-xl p-3 text-center shadow-sm hover:shadow-md transition"><div className="text-xl">📦</div><div className="text-[10px] font-bold mt-1">Stock</div></button>}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-black text-gray-500 uppercase mb-2">Résumé du jour</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">CA aujourd'hui</span><p className="text-lg font-black text-emerald-700">{formatGourdes(resume.caJour)} Gdes</p></div>
          <div className="bg-white p-3 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Consultations</span><p className="text-lg font-black text-purple-600">{resume.consultationsJour}</p></div>
          <div className="bg-white p-3 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Dossiers actifs</span><p className="text-lg font-black text-blue-600">{resume.dossiersActifs}</p></div>
          <div className="bg-white p-3 rounded-xl border shadow-sm text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Suspendus</span><p className="text-lg font-black text-amber-600">{resume.dossiersSuspendus}</p></div>
        </div>
      </div>

      {(stockCritique.length > 0 || enAttente > 0) && (
        <div>
          <h3 className="text-xs font-black text-gray-500 uppercase mb-2">Alertes</h3>
          <div className="space-y-2">
            {stockCritique.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex justify-between items-center text-xs">
                <span className="font-bold text-red-700">⚠️ {stockCritique.length} article(s) en stock critique</span>
                {peutGererStock && <button onClick={()=>onNaviguer('stock')} className="text-red-700 underline font-bold">Voir</button>}
              </div>
            )}
            {enAttente > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs">
                <span className="font-bold text-amber-700">⏳ {enAttente} opération(s) en attente de synchronisation</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

module.exports = AccueilPanel;
