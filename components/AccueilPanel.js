// components/AccueilPanel.js
const React = window.React;
const { useState, useEffect, useMemo } = React;
const { chf } = require('../api/supabase');
const { formatGourdes } = require('../utils/helpers');

function AccueilPanel({ verifications, paiements, medicaments, userRole, userDisplayName, onNaviguer, onOuvrirAchatExpress, showToast }) {
  const [enAttente, setEnAttente] = useState(0);
  const [enQuarantaine, setEnQuarantaine] = useState(0);
  const [rafraichir, setRafraichir] = useState(0); // force la relecture des détails de la file
  useEffect(() => {
    const relire = () => { setEnAttente(chf.countPending()); setEnQuarantaine(chf.countFailed()); setRafraichir(n => n + 1); };
    relire();
    const interval = setInterval(relire, 2000);
    // Un autre onglet qui synchronise modifie la même file : on se remet à jour immédiatement.
    window.addEventListener('chf:file-changee', relire);
    window.addEventListener('chf:echec-permanent', relire);
    return () => { clearInterval(interval); window.removeEventListener('chf:file-changee', relire); window.removeEventListener('chf:echec-permanent', relire); };
  }, []);

  // Sauvegarde de secours du travail pas encore parti au serveur : dernier filet si ce navigateur
  // est réinitialisé ou l'appareil perdu (la file d'attente ne vit que sur CET appareil).
  const telechargerSauvegardeSecours = () => {
    const contenu = JSON.stringify(chf.exporterFileAttente(), null, 2);
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
    lien.download = `CHF_non_synchronise_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(lien); lien.click(); document.body.removeChild(lien);
    setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
    showToast?.("Sauvegarde de secours téléchargée — garde ce fichier tant que tout n'est pas synchronisé.", "success");
  };

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

      {(stockCritique.length > 0 || enAttente > 0 || enQuarantaine > 0) && (
        <div>
          <h3 className="text-xs font-black text-gray-500 uppercase mb-2">Alertes</h3>
          <div className="space-y-2">
            {stockCritique.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex justify-between items-center text-xs">
                <span className="font-bold text-red-700">⚠️ {stockCritique.length} article(s) en stock critique</span>
                {peutGererStock && <button onClick={()=>onNaviguer('stock')} className="text-red-700 underline font-bold">Voir</button>}
              </div>
            )}
            {enAttente > 0 && (() => {
              const details = chf.getPendingDetails();
              const bloquees = details.filter(d => d.bloqueeDepuisLongtemps);
              return (
                <div className={`rounded-xl p-3 text-xs space-y-2 border ${bloquees.length > 0 ? 'bg-orange-50 border-orange-300' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex justify-between items-center gap-2 flex-wrap">
                    <span className="font-bold text-amber-700">⏳ {enAttente} opération(s) en attente de synchronisation</span>
                    <span className="flex gap-3 whitespace-nowrap">
                      <button onClick={() => { chf.syncPending(); showToast?.("Nouvelle tentative en cours...", "info"); }} className="text-amber-800 font-bold underline">🔄 Réessayer maintenant</button>
                      <button onClick={telechargerSauvegardeSecours} className="text-amber-800 font-bold underline">💾 Sauvegarde de secours</button>
                    </span>
                  </div>
                  {bloquees.length > 0 && (
                    <p className="bg-orange-100 border border-orange-300 rounded-lg p-2 font-bold text-orange-800">
                      ⚠️ {bloquees.length} opération(s) bloquée(s) depuis plus de 15 minutes. Vérifie la connexion de cet appareil, puis clique sur « Réessayer maintenant ». Télécharge la sauvegarde de secours avant de fermer l'app ou de vider le navigateur.
                    </p>
                  )}
                  <div className="divide-y divide-amber-200/60">
                    {details.map((d, i) => (
                      <div key={i} className="flex justify-between py-1 gap-2">
                        <span className={d.bloqueeDepuisLongtemps ? 'text-orange-800 font-bold' : 'text-amber-800'}>
                          {d.bloqueeDepuisLongtemps && '⚠️ '}{d.texte}{d.patient ? ` — ${d.patient}` : ''}
                        </span>
                        <span className={`whitespace-nowrap ${d.bloqueeDepuisLongtemps ? 'text-orange-700' : 'text-amber-600'}`}>
                          {d.ageMinutes >= 60 ? `depuis ${Math.floor(d.ageMinutes / 60)}h` : `depuis ${d.ageMinutes} min`}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-amber-600">Ces changements sont enregistrés sur CET appareil uniquement — ils partiront vers le serveur dès qu'une connexion fonctionne. Ne vide pas les données du navigateur tant que ce compteur n'est pas à zéro.</p>
                </div>
              );
            })()}
            {enQuarantaine > 0 && (
              <div className="bg-red-50 border border-red-300 rounded-xl p-3 text-xs space-y-2">
                <div className="flex justify-between items-center gap-2 flex-wrap">
                  <span className="font-black text-red-700">⛔ {enQuarantaine} opération(s) refusée(s) par le serveur</span>
                  <span className="flex gap-3 whitespace-nowrap">
                    <button onClick={async () => { const n = await chf.reessayerEchecs(); showToast?.(`${n} opération(s) remise(s) en file.`, "info"); }} className="text-red-800 font-bold underline">🔄 Réessayer</button>
                    <button onClick={telechargerSauvegardeSecours} className="text-red-800 font-bold underline">💾 Sauvegarde</button>
                  </span>
                </div>
                <div className="divide-y divide-red-200/60">
                  {chf.getFailedDetails().map((d, i) => (
                    <div key={i} className="py-1 text-red-800">
                      <div className="font-bold">{d.texte}{d.patient ? ` — ${d.patient}` : ''}</div>
                      <div className="text-[10px] text-red-600">{d.raison} — saisi le {d.quand}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-red-600">Rien n'est perdu : ces opérations sont conservées ici. Le serveur les a refusées (droits insuffisants, données invalides...). Corrige la cause puis clique sur « Réessayer », ou signale-le à l'administrateur.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

module.exports = AccueilPanel;
