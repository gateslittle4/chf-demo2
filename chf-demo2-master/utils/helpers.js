// utils/helpers.js
const { DB_NAME, STORE_NAME } = require('./constants');

function formatGourdes(val) {
  return (Number.isFinite(val) ? val : 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDH(val) {
  return formatGourdes(val / 5);
}

function formaterNomPropre(chaine) {
  return chaine ? chaine.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : "";
}

function echapperHTML(texte) {
  if (!texte) return "";
  return String(texte).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ========================== INDEXEDDB (compatibilité) ==========================
function getIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function dbFetchAll() {
  return getIndexedDB().then(db => {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
    });
  });
}

async function dbSaveItem(item) {
  await new Promise((resolve, reject) => {
    getIndexedDB().then(db => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    }).catch(reject);
  });
}

async function dbDeleteItem(id) {
  await new Promise((resolve, reject) => {
    getIndexedDB().then(db => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    }).catch(reject);
  });
}

module.exports = {
  formatGourdes,
  formatDH,
  formaterNomPropre,
  echapperHTML,
  getIndexedDB,
  dbFetchAll,
  dbSaveItem,
  dbDeleteItem
};
