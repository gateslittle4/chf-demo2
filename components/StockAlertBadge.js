// components/StockAlertBadge.js
// Petit badge dans un coin, au lieu d'une bannière plein écran qui revient sans cesse.
// Cliquer dessus ouvre/ferme la liste des articles en alerte ; ça ne réapparaît pas tout seul.
const React = window.React;
const { useState } = React;

function StockAlertBadge({ items }) {
  const [ouvert, setOuvert] = useState(false);
  if (!items || items.length === 0) return null;

  return (
    <div className="fixed bottom-16 left-4 z-50">
      {ouvert && (
        <div className="absolute bottom-9 left-0 bg-white border rounded-xl shadow-2xl p-3 w-60 max-h-56 overflow-y-auto text-[11px] space-y-1.5">
          <div className="flex justify-between items-center border-b pb-1.5 mb-1.5">
            <span className="font-bold text-gray-700 uppercase text-[10px]">⚠️ Stock critique</span>
            <button onClick={() => setOuvert(false)} className="text-gray-400 hover:text-gray-700 font-bold">✕</button>
          </div>
          {items.map(item => (
            <div key={item.id} className="flex justify-between items-center">
              <span className="text-gray-700">{item.nom}</span>
              <span className="font-bold text-red-600">{item.quantite || 0}</span>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => setOuvert(o => !o)}
        className="flex items-center gap-1 bg-red-600 text-white px-2.5 py-1.5 rounded-full shadow font-bold text-[10px]"
        title="Articles en stock critique"
      >
        📦 ⚠️ {items.length}
      </button>
    </div>
  );
}

module.exports = StockAlertBadge;
