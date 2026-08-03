// components/GestionUtilisateurs.js
const React = window.React;
const { useState, useEffect } = React;
const { auth, db, enregistrerAudit } = require('../api/firebase');

function GestionUtilisateursPanel({ showToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [nouveauEmail, setNouveauEmail] = useState("");
  const [nouveauPassword, setNouveauPassword] = useState("");
  const [nouveauRole, setNouveauRole] = useState("auditeur");
  const [nouveauDisplayName, setNouveauDisplayName] = useState("");

  useEffect(() => {
    if (!db) return;
    const unsubscribe = db.collection('users').onSnapshot(snapshot => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const updateUserRole = async (userId, newRole) => {
    try {
      await db.collection('users').doc(userId).update({ role: newRole });
      enregistrerAudit('changement_role', { utilisateurCible: userId, nouveauRole: newRole });
      showToast("Rôle mis à jour", "success");
    } catch (error) { showToast("Erreur mise à jour", "error"); }
  };
  const toggleActive = async (userId, current) => {
    try {
      await db.collection('users').doc(userId).update({ active: !current });
      enregistrerAudit(current ? 'desactivation_utilisateur' : 'reactivation_utilisateur', { utilisateurCible: userId });
      showToast(current ? "Utilisateur désactivé" : "Utilisateur réactivé", "success");
    } catch (error) { showToast("Erreur", "error"); }
  };
  const creerCompte = async () => {
    if (!nouveauEmail || !nouveauPassword || !nouveauDisplayName) { showToast("Remplissez tous les champs.", "error"); return; }
    if (nouveauPassword.length < 8) { showToast("Mot de passe minimum 8 caractères.", "error"); return; }
    try {
      const userCred = await auth.createUserWithEmailAndPassword(nouveauEmail, nouveauPassword);
      const user = userCred.user;
      await db.collection('users').doc(user.uid).set({ uid: user.uid, email: nouveauEmail, displayName: nouveauDisplayName, role: nouveauRole, active: true, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      enregistrerAudit('creation_utilisateur', { utilisateurCible: user.uid, email: nouveauEmail, role: nouveauRole });
      showToast("✅ Compte créé avec succès !", "success");
      setNouveauEmail(""); setNouveauPassword(""); setNouveauDisplayName(""); setNouveauRole("auditeur");
    } catch (error) { showToast("Erreur : " + error.message, "error"); }
  };

  const filtered = users.filter(u => (u.displayName||'').toLowerCase().includes(search.toLowerCase()) || (u.email||'').toLowerCase().includes(search.toLowerCase()));
  const roles = [{ value: 'administrateur', label: '🔑 Administrateur' }, { value: 'direction', label: '📊 Direction' }, { value: 'comptable', label: '💰 Comptable' }, { value: 'auditeur', label: '📋 Auditeur' }, { value: 'lecteur', label: '👁️ Lecteur' }];
  if (loading) return <div className="p-8 text-center">Chargement...</div>;
  return (
    <div className="space-y-4 text-xs">
      <div className="bg-white p-4 rounded-xl border shadow-sm">
        <h3 className="font-bold text-gray-800 mb-2">➕ Créer un nouvel utilisateur</h3>
        <div className="flex flex-wrap gap-2">
          <input type="text" value={nouveauDisplayName} onChange={e=>setNouveauDisplayName(e.target.value)} placeholder="Nom affiché" className="border rounded-lg p-2 text-xs flex-1 min-w-[120px]" />
          <input type="email" value={nouveauEmail} onChange={e=>setNouveauEmail(e.target.value)} placeholder="Email (ex: user@chf.ht)" className="border rounded-lg p-2 text-xs flex-1 min-w-[150px]" />
          <input type="password" value={nouveauPassword} onChange={e=>setNouveauPassword(e.target.value)} placeholder="Mot de passe (8+)" className="border rounded-lg p-2 text-xs w-32" />
          <select value={nouveauRole} onChange={e=>setNouveauRole(e.target.value)} className="border rounded-lg p-2 text-xs bg-white">
            {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button onClick={creerCompte} className="bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold">Créer</button>
        </div>
      </div>
      <div className="bg-white p-4 rounded-xl border shadow-sm">
        <div className="flex justify-between items-center mb-4"><h2 className="font-black text-gray-800">👥 Utilisateurs</h2><span className="text-gray-500">{users.filter(u=>u.active!==false).length} actifs</span></div>
        <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Rechercher..." className="w-full border rounded-lg p-2 mb-4" />
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="bg-gray-100 text-[10px] text-gray-500 uppercase border-b font-mono"><th className="p-2">Nom</th><th className="p-2">Email</th><th className="p-2">Rôle</th><th className="p-2 text-center">Statut</th><th className="p-2 text-center">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(u => {
                const isActive = u.active !== false;
                return (
                  <tr key={u.id} className={isActive ? 'hover:bg-gray-50/50' : 'bg-gray-50 text-gray-400'}>
                    <td className="p-2 font-medium">{u.displayName||'—'}</td>
                    <td className="p-2">{u.email||'—'}</td>
                    <td className="p-2">
                      <select value={u.role||'auditeur'} onChange={e=>updateUserRole(u.id,e.target.value)} className={`border rounded-lg p-1 text-xs bg-white outline-none font-bold ${u.id===auth.currentUser?.uid?'opacity-50':''}`} disabled={u.id===auth.currentUser?.uid}>
                        {roles.map(r=><option key={r.value} value={r.value} className="text-gray-800">{r.label}</option>)}
                      </select>
                    </td>
                    <td className="p-2 text-center">{isActive ? <span className="text-emerald-600 font-bold">✅ Actif</span> : <span className="text-red-500">⛔ Désactivé</span>}</td>
                    <td className="p-2 text-center">
                      {u.id !== auth.currentUser?.uid ? <button onClick={()=>toggleActive(u.id,isActive)} className={`text-[10px] font-bold ${isActive?'text-red-500 hover:text-red-700':'text-emerald-500 hover:text-emerald-700'}`}>{isActive ? 'Désactiver' : 'Réactiver'}</button> : <span className="text-gray-400">(Vous)</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length===0 && <div className="py-8 text-center text-gray-400">Aucun utilisateur.</div>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-white p-4 rounded-xl border shadow-sm">
        <div className="text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Total</span><p className="text-xl font-black">{users.length}</p></div>
        <div className="text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Actifs</span><p className="text-xl font-black text-emerald-600">{users.filter(u=>u.active!==false).length}</p></div>
        <div className="text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Admins</span><p className="text-xl font-black text-red-600">{users.filter(u=>u.role==='administrateur').length}</p></div>
        <div className="text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Direction</span><p className="text-xl font-black text-purple-600">{users.filter(u=>u.role==='direction').length}</p></div>
        <div className="text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Désactivés</span><p className="text-xl font-black text-gray-400">{users.filter(u=>u.active===false).length}</p></div>
      </div>
    </div>
  );
}

module.exports = GestionUtilisateursPanel;
