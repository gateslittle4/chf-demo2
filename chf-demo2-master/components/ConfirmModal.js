// components/ConfirmModal.js
const React = window.React;

function ConfirmModal({ titre, message, detail, confirmLabel = "Confirmer", cancelLabel = "Annuler", danger = false, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className={`font-black text-base ${danger ? 'text-red-700' : 'text-[#1E2A24]'}`}>{danger ? '⚠️ ' : ''}{titre}</h3>
        <p className="text-sm text-gray-700 whitespace-pre-line">{message}</p>
        {detail && <div className="bg-gray-50 border rounded-lg p-3 text-sm font-mono font-bold text-center text-[#1E2A24]">{detail}</div>}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button onClick={onCancel} className="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 text-sm font-bold">{cancelLabel}</button>
          <button onClick={onConfirm} className={`text-white rounded-xl py-2.5 text-sm font-bold shadow-md ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-700 hover:bg-emerald-800'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

module.exports = ConfirmModal;
