// components/Demandes.js
const React = window.React;
const { useState, useEffect } = React;
const { auth, db } = require('../api/firebase');
const { formatGourdes } = require('../utils/helpers');

function DemandesPanel({ userRole, showToast }) {
  const [demandes, setDemandes] = useState([]);
  useEffect(() => {
    if (!db) return;
    const unsubscribe = db.collection('demandes_exoneration').where('statut', '==', 'en_attente').onSnapshot(snapshot => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setDemandes(data);
    });
    return () => unsubscribe();
  }, []);
  const repondre = async (demandeId, accepte) => {
    try {
      await db.collection('demandes_exoneration').doc(demandeId).update({ statut: accepte ? 'accepte' : 'refuse', reponsePar: auth.currentUser?.displayName || 'inconnu', dateReponse: new Date().toISOString() });
      showToast(accepte ? '✅ Exonération acceptée' : '❌ Exonération refusée', "success");
    } catch (error) { showToast("Erreur", "error"); }
  };
  const peutAutoriser = userRole === 'direction' || userRole === 'administrateur';
  return (
    <div className="space-y-4 text-xs">
      <div className="bg-white p-4 rounded-xl border shadow-sm">
        <h2 className="font-black text-gray-800 mb-3">📨 Demandes d'exonération</h2>
        {demandes.length === 0 && <p className="text-gray-500">Aucune demande en attente.</p>}
        {demandes.map(d => (
          <div key={d.id} className="bg-gray-50 p-3 rounded-lg border flex justify-between items-center mb-2">
            <div>
              <p className="font-bold">{d.patientNom}</p>
              <p className="text-gray-600">{d.pourcentageDemande}% ({formatGourdes(d.montantExonere)} Gdes) par {d.demandeur}</p>
            </div>
            <div className="flex gap-2">
              {peutAutoriser ? (
                <><button onClick={()=>repondre(d.id,true)} className="bg-emerald-600 text-white px-3 py-1 rounded text-xs font-bold">✅ Accepter</button>
                <button onClick={()=>repondre(d.id,false)} className="bg-red-600 text-white px-3 py-1 rounded text-xs font-bold">❌ Refuser</button></>
              ) : <span className="text-gray-400 text-xs">En attente de validation</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

module.exports = DemandesPanel;
