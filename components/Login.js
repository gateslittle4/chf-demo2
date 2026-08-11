// components/Login.js
const React = window.React;
const { useState } = React;
const { auth } = require('../api/firebase');

function LoginScreen({ onLogin }) {
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault(); setErreur("");
    const email = `${identifiant.trim()}@chf.ht`;
    try {
      await auth.signInWithEmailAndPassword(email, motDePasse);
      onLogin();
    } catch (error) {
      console.error("Erreur auth:", error);
      if (error.code === 'auth/user-not-found') setErreur("❌ Identifiant inconnu.");
      else if (error.code === 'auth/wrong-password') setErreur("❌ Mot de passe incorrect.");
      else setErreur("❌ " + error.message);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#1E2A24] p-4">
      <div className="w-full max-w-sm bg-[#F7F5F0] p-6 rounded-2xl border shadow-2xl text-center space-y-4">
        <div><p className="text-[10px] uppercase tracking-widest text-emerald-800 font-bold">Centre Hospitalier de Fontaine</p><h2 className="text-base font-black text-[#1E2A24] mt-1">🔐 Connexion</h2></div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1"><label className="text-xs font-bold text-gray-600 block text-left">Identifiant</label><input type="text" value={identifiant} onChange={e => setIdentifiant(e.target.value)} placeholder="username" className="w-full border rounded-lg p-2 text-sm outline-none font-mono" required /></div>
          <div className="space-y-1"><label className="text-xs font-bold text-gray-600 block text-left">Mot de passe</label><input type="password" value={motDePasse} onChange={e => setMotDePasse(e.target.value)} placeholder="••••••••" className="w-full border rounded-lg p-2 text-sm outline-none font-mono" required /></div>
          {erreur && <div className="bg-red-50 text-red-700 p-2 rounded-lg text-xs font-bold">{erreur}</div>}
          <button type="submit" className="w-full bg-[#1E2A24] text-white rounded-xl py-2.5 font-bold text-xs hover:bg-[#2a3a32] transition">Se connecter</button>
        </form>
        <div className="text-xs text-gray-500">Contactez l'administrateur pour obtenir un compte.</div>
      </div>
    </div>
  );
}

module.exports = LoginScreen;
