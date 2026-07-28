// utils/crypto.js
// Chiffrement/déchiffrement basé sur une phrase secrète, pour protéger le fichier
// de sauvegarde téléchargé (bouton Backup) — évite qu'un fichier perdu/partagé
// expose les données patients en clair.

async function deriverCle(motDePasse, salt, usage) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(motDePasse), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, [usage]
  );
}

async function chiffrerTexte(texte, motDePasse) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cle = await deriverCle(motDePasse, salt, 'encrypt');
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, enc.encode(texte));
  return {
    chfChiffre: true,
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(cipherBuf)))
  };
}

async function dechiffrerTexte(payload, motDePasse) {
  const dec = new TextDecoder();
  const salt = Uint8Array.from(atob(payload.salt), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
  const cle = await deriverCle(motDePasse, salt, 'decrypt');
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cle, data);
  return dec.decode(plainBuf);
}

module.exports = { chiffrerTexte, dechiffrerTexte };
