// server.js — sert public/ (index.html + bundle.js) en statique.
// Ton vrai backend (API episodes/paiements/catalog) tourne séparément
// à l'adresse définie dans api/supabase.js (API_BASE).
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 CHF servi sur http://localhost:${PORT}`);
});
