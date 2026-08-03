// components/Toast.js
const React = window.React;
const { X } = require('../utils/icons');

function ToastManager({ toasts, removeToast }) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto toast ${t.type === 'success' ? 'bg-emerald-600' : t.type === 'error' ? 'bg-red-600' : 'bg-blue-600'} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 transform transition-all duration-300`}>
          <span className="font-medium text-sm flex-1">{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="text-white/70 hover:text-white"><X size={14}/></button>
        </div>
      ))}
    </div>
  );
}

module.exports = ToastManager;
