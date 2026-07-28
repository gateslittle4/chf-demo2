// components/GestionStock.js
const React = window.React;
const { useState } = React;
const { chf } = require('../api/supabase');
const { LOG_MEDS_KEY } = require('../api/firebase');
const { formatGourdes } = require('../utils/helpers');
const { Check, X, Pencil } = require('../utils/icons');

function GestionStockPanel({ items, setItems, showToast }) {
  const [filtre, setFiltre] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editQuantite, setEditQuantite] = useState("");
  const [editSeuil, setEditSeuil] = useState("");
  const [ajoutQuantite, setAjoutQuantite] = useState({});

  const sauvegarderStock = async (nouvelleListe) => {
    setItems(nouvelleListe);
    localStorage.setItem(LOG_MEDS_KEY, JSON.stringify(nouvelleListe));
    try { await chf.updateCatalog('medicaments', nouvelleListe); } catch (e) { console.warn("Erreur mise à jour stock:", e); }
  };
  const ajouterStock = (id, quantiteAjoutee) => {
    const qte = parseFloat(quantiteAjoutee) || 0;
    if (qte <= 0) { showToast("Quantité invalide", "error"); return; }
    const updated = items.map(item => item.id === id ? { ...item, quantite: (item.quantite || 0) + qte } : item);
    sauvegarderStock(updated);
    setAjoutQuantite({ ...ajoutQuantite, [id]: "" });
    showToast(`Stock ajouté : +${qte}`, "success");
  };
  const itemsFiltres = items.filter(i => i.nom.toLowerCase().includes(filtre.toLowerCase()));
  return (
    <div className="space-y-4 text-xs">
      <div className="bg-white p-4 rounded-xl border shadow-sm">
        <h2 className="font-bold text-gray-800 mb-3">📦 Gestion des stocks</h2>
        <input type="text" value={filtre} onChange={e=>setFiltre(e.target.value)} placeholder="Filtrer..." className="w-full border rounded-lg p-2 mb-4" />
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="bg-gray-100 text-[10px] text-gray-500 uppercase border-b font-mono"><th className="p-2">Médicament</th><th className="p-2 text-center">Prix</th><th className="p-2 text-center">Stock</th><th className="p-2 text-center">Seuil</th><th className="p-2 text-center">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {itemsFiltres.map(item => {
                const enAlerte = (item.quantite || 0) <= (item.seuilAlerte || 5);
                return (
                  <tr key={item.id} className={enAlerte ? 'bg-red-50/40' : 'hover:bg-gray-50/50'}>
                    <td className="p-2 font-medium">{item.nom}</td>
                    <td className="p-2 text-center font-mono">{formatGourdes(item.prix)} Gdes</td>
                    <td className="p-2 text-center font-bold">
                      {editingId === item.id ? <input type="number" value={editQuantite} onChange={e=>setEditQuantite(e.target.value)} className="w-16 border rounded p-1 text-center font-mono" />
                      : <span className={enAlerte ? 'text-red-600' : ''}>{item.quantite || 0} {enAlerte && '⚠️'}</span>}
                    </td>
                    <td className="p-2 text-center">
                      {editingId === item.id ? <input type="number" value={editSeuil} onChange={e=>setEditSeuil(e.target.value)} className="w-16 border rounded p-1 text-center font-mono" /> : <span>{item.seuilAlerte || 5}</span>}
                    </td>
                    <td className="p-2 text-center">
                      {editingId === item.id ? (
                        <div className="flex justify-center gap-1">
                          <button onClick={()=>{ const q=parseFloat(editQuantite); const s=parseFloat(editSeuil); if(!isNaN(q)&&!isNaN(s)){ const updated=items.map(i=>i.id===item.id?{...i,quantite:q,seuilAlerte:s}:i); sauvegarderStock(updated); setEditingId(null); showToast("Mis à jour", "success"); } }} className="bg-green-700 text-white p-1 rounded"><Check size={12}/></button>
                          <button onClick={()=>setEditingId(null)} className="border p-1 rounded"><X size={12}/></button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1 justify-center">
                          <button onClick={()=>{ setEditingId(item.id); setEditQuantite(String(item.quantite||0)); setEditSeuil(String(item.seuilAlerte||5)); }} className="text-blue-600 p-1"><Pencil size={12}/></button>
                          <div className="flex gap-1">
                            <input type="number" min="1" value={ajoutQuantite[item.id]||""} onChange={e=>setAjoutQuantite({...ajoutQuantite,[item.id]:e.target.value})} placeholder="+" className="w-12 border rounded p-0.5 text-center text-xs" />
                            <button onClick={()=>ajouterStock(item.id, ajoutQuantite[item.id])} className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px]">Ajouter</button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-white p-4 rounded-xl border shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Total</span><p className="text-xl font-black">{items.length}</p></div>
        <div className="text-center"><span className="text-[10px] uppercase font-bold text-gray-400">En alerte</span><p className="text-xl font-black text-red-600">{items.filter(i => (i.quantite||0) <= (i.seuilAlerte||5)).length}</p></div>
        <div className="text-center"><span className="text-[10px] uppercase font-bold text-gray-400">Valeur stock</span><p className="text-xl font-black text-emerald-700">{formatGourdes(items.reduce((s,i)=>s + i.prix*(i.quantite||0),0))} Gdes</p></div>
      </div>
    </div>
  );
}

module.exports = GestionStockPanel;
