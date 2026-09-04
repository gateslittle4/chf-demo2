// utils/constants.js
const LISTE_ONG = ["MSF-H", "MSF-F", "ALIMA", "AVSI", "GRID MISSION", "WAY TO HEALTH", "TEAM TASSY"];

const CONFIG_LITS = {
  normal: { nom: "Lit normal", prix: 250, nouveauPrix: 500 },
  semi_prive: { nom: "Salle Semi Privé", prix: 500 },
  prive: { nom: "Salle Privé", prix: 750, nouveauPrix: 1500 },
  isolette: { nom: "Lit Isolette", prix: 1250 },
  incubateur: { nom: "Incubateur", prix: 2500 }
};

const CATEGORIES_LISTE = [
  { key: "service", label: "Admission / Consultation" },
  { key: "hospit", label: "Hébergement" },
  { key: "labo", label: "Laboratoire" },
  { key: "med", label: "Pharmacie" },
  { key: "oxygene", label: "Oxygène" },
  { key: "curetage", label: "Curetage" },
  { key: "accouchement", label: "Accouchement" },
  { key: "deliverance", label: "Délivrance" },
  { key: "sono", label: "Sonographie" },
  { key: "cesarienne", label: "Césarienne" },
  { key: "chirurgie", label: "Chirurgie" },
  { key: "ecg", label: "ECG" },
  { key: "suture", label: "Suture" },
  { key: "pansement", label: "Pansement" },
  { key: "drainage", label: "Drainage" },
  { key: "radio", label: "Radiographie" },
  { key: "pap", label: "PAP Test" },
  { key: "visite", label: "Visite" },
  { key: "nebulisation", label: "Nébulisation" }
];

// Prix effectif d'un type de lit selon "Tarif Actuel" / "Nouveau prix" (même logique que le
// catalogue Pharmacie/Actes) -- pour facturer l'ancien prix aux fiches datées d'avant le changement.
const prixLit = (typeLit, tarifChoisi) => {
  const lit = CONFIG_LITS[typeLit];
  return (tarifChoisi === "nouveau" && lit.nouveauPrix != null) ? lit.nouveauPrix : lit.prix;
};

// IndexedDB (compatibilité historique)
const DB_NAME = "CHFAuditeurProDB_v16";
const STORE_NAME = "archives_dossiers";

module.exports = {
  LISTE_ONG,
  CONFIG_LITS,
  prixLit,
  CATEGORIES_LISTE,
  DB_NAME,
  STORE_NAME
};
