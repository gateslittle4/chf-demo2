// components/ConnectionStatus.js
const React = window.React;
const { useState, useEffect } = React;
const { chf } = require('../api/supabase');

function ConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [enAttente, setEnAttente] = useState(0);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setEnAttente(chf.countPending()), 2000);
    return () => clearInterval(interval);
  }, []);

  const relancerSynchronisation = async () => {
    if (enCours) return;
    setEnCours(true);
    await chf.syncPending();
    setEnAttente(chf.countPending());
    setEnCours(false);
  };

  return (
    <div
      className="fixed bottom-4 left-4 z-50 flex items-center gap-1.5 bg-white/95 backdrop-blur px-2.5 py-1.5 rounded-full shadow border text-[10px] font-bold"
      title={online ? "Connexion internet active" : "Hors ligne — les actions seront mises en attente"}
    >
      <span className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}></span>
      <span className={online ? 'text-emerald-700' : 'text-red-700'}>{online ? 'En ligne' : 'Hors ligne'}</span>
      {enAttente > 0 && (
        <button
          onClick={relancerSynchronisation} disabled={enCours}
          className="bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[9px] disabled:opacity-60"
          title="Cliquer pour relancer la synchronisation maintenant">
          {enCours ? '🔄 ...' : `⏳ ${enAttente} — relancer`}
        </button>
      )}
    </div>
  );
}

module.exports = ConnectionStatus;
