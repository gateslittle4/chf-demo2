// components/ArchivesPanel.js
const React = window.React;
const { useState, useEffect, useMemo } = React;
const { CATEGORIES_LISTE } = require('../utils/constants');
const { formatGourdes, formatDH, echapperHTML, formaterNomPropre } = require('../utils/helpers');
const { Eye, Pencil, Trash2, Printer, Clock, FolderOpen, X, Download, Check } = require('../utils/icons');
const { chf, toEpisodeApi } = require('../api/supabase');
const { LOGO_CHF_BASE64 } = require('../utils/logoChf');
const NOM_COMPLET_ONG = { "MSF-H": "MSF-HOLLANDE", "MSF-F": "MSF-FRANCE" }; // affiché en entier dans les rapports Excel — complète ici si d'autres partenaires sont abrégés
const nomCompletOng = (nom) => NOM_COMPLET_ONG[nom] || nom;

// Cumule le breakdown de toutes les fiches d'un dossier, toutes catégories confondues (clés brutes)
const cumulCategoriesDossier = (v) => {
  const totaux = {};
  (v.fiches || []).forEach(f => { Object.entries(f.breakdown || {}).forEach(([cle, montant]) => { totaux[cle] = (totaux[cle] || 0) + (montant || 0); }); });
  return totaux;
};

// Medicaments de sortie : un dossier qui a un sejour (exeat) devrait avoir au moins 2 medicaments
// "de sortie" (Ferfolat, Globugen, Tothema, Amox..., Vit C, Paracetamol) dans la fiche du sejour
// elle-meme, ou dans une fiche jusqu'a 3 numeros avant/apres (par numero de fiche) -- sinon ils ont
// probablement ete oublies. Comparaison insensible aux accents/majuscules.
const MEDICAMENTS_SORTIE_MOTSCLES = ['ferfolat', 'globugen', 'tothema', 'amox', 'paracetamol', 'vitamine c', 'vit c'];
const MARGE_FICHES_AUTOUR_EXEAT = 3;
const normaliserTexte = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const estMedicamentSortie = (nomLigne) => { const n = normaliserTexte(nomLigne); return MEDICAMENTS_SORTIE_MOTSCLES.some(mc => n.includes(mc)); };
const compterMedicamentsSortie = (fiche) => (fiche?.rawState?.lignesCalcul || []).filter(l => l.type === 'med' && estMedicamentSortie(l.nom)).length;
const medicamentsSortieManquants = (dossier) => {
  const fiches = [...(dossier.fiches || [])].sort((a, b) => (a.numeroFiche || 0) - (b.numeroFiche || 0));
  const indexesSejour = fiches.map((f, i) => (f.exeat ? i : -1)).filter(i => i !== -1);
  if (indexesSejour.length === 0) return false; // pas de sejour dans ce dossier -> alerte non applicable
  return !indexesSejour.some(i => {
    const debut = Math.max(0, i - MARGE_FICHES_AUTOUR_EXEAT), fin = Math.min(fiches.length - 1, i + MARGE_FICHES_AUTOUR_EXEAT);
    for (let j = debut; j <= fin; j++) { if (compterMedicamentsSortie(fiches[j]) >= 2) return true; }
    return false;
  });
};

// Regroupement mere/bebe (utilise pour la liste d'un lot a l'ecran ET l'export Excel) : un dossier
// nomme "Bb <nom de la mere>" (ou "Bebe <nom>") est trie juste apres le dossier de sa mere, meme
// si sa propre date d'entree differe -- il herite de la date de la mere pour le tri. La recherche
// de la mere se fait dans TOUT l'archive (tousLesDossiers), pas seulement dans le lot en cours --
// la mere peut avoir ete facturee dans un autre lot ou un autre mois. Le rapprochement mere/bebe
// compare les noms normalises (normaliserTexte : insensible aux accents/majuscules/espaces), pour
// ne pas rater un lien a cause d'une orthographe legerement differente entre les deux dossiers.
// Calcule aussi 6 alertes de controle qualite par dossier (affichees a l'ecran seulement, jamais
// dans l'export Excel envoye aux partenaires, qui reste tel que tape) :
//  - estBebeSansMere : bebe dont la mere n'est trouvee nulle part dans l'archive (fiche d'urgence a envisager)
//  - orthographeIncoherente : mere trouvee, mais le nom tape dans "Bb <nom>" differe (accents/espaces)
//    du nom exact du dossier de la mere -- a harmoniser avant l'envoi du lot
//  - cesarienneSansSono : dossier avec cesarienne/accouchement mais aucune sonographie facturee
//  - sansExeat : dossier sans aucun sejour/exeat -- tout le monde doit en avoir un dans ce contexte
//  - sansAdmission : dossier sans "Admission / Consultation" (urgence, pediatre...), sauf les bebes
//    dont la mere est trouvee (ils sont rattaches a l'admission de leur mere)
//  - medicamentsSortieManquants : sejour sans medicaments de sortie dans la fiche ou les 3 fiches
//    avant/apres
const extraireNomMerePortion = (nom) => { const m = (nom || '').trim().match(/^(?:bb|beb[ée])\.?\s+(.+)$/i); return m ? m[1].trim() : null; };
const estUnBebe = (nom) => extraireNomMerePortion(nom) !== null;
const cleFamilleDossier = (nom) => normaliserTexte(extraireNomMerePortion(nom) || nom);
const trierAvecRegroupementMereBebe = (dossiersDuLot, tousLesDossiers) => {
  const poolRecherche = tousLesDossiers || dossiersDuLot;
  const dateMereParCle = {};
  const nomMereParCle = {};
  poolRecherche.forEach(v => {
    if (!estUnBebe(v.nomPatient)) {
      const cle = cleFamilleDossier(v.nomPatient);
      dateMereParCle[cle] = v.dateEntreePourTri;
      nomMereParCle[cle] = v.nomPatient;
    }
  });
  const dateEffective = (v) => {
    const cle = cleFamilleDossier(v.nomPatient);
    return (estUnBebe(v.nomPatient) && dateMereParCle[cle]) ? dateMereParCle[cle] : v.dateEntreePourTri;
  };
  return [...dossiersDuLot].sort((a, b) => {
    const diff = new Date(dateEffective(a)) - new Date(dateEffective(b));
    if (diff !== 0) return diff;
    const cleA = cleFamilleDossier(a.nomPatient), cleB = cleFamilleDossier(b.nomPatient);
    if (cleA !== cleB) return cleA.localeCompare(cleB);
    return (estUnBebe(a.nomPatient) ? 1 : 0) - (estUnBebe(b.nomPatient) ? 1 : 0);
  }).map(v => {
    const bebe = estUnBebe(v.nomPatient);
    const cle = cleFamilleDossier(v.nomPatient);
    const estBebeAvecMere = bebe && dateMereParCle[cle] !== undefined;
    const cumul = cumulCategoriesDossier(v);
    const nomMereExtrait = bebe ? extraireNomMerePortion(v.nomPatient) : null;
    return {
      ...v,
      estBebeSansMere: bebe && !estBebeAvecMere,
      orthographeIncoherente: estBebeAvecMere && formaterNomPropre(nomMereExtrait) !== formaterNomPropre(nomMereParCle[cle]),
      cesarienneSansSono: ((cumul.cesarienne || 0) > 0 || (cumul.accouchement || 0) > 0) && !((cumul.sono || 0) > 0),
      sansExeat: !(v.fiches || []).some(f => f.exeat),
      sansAdmission: !estBebeAvecMere && !((cumul.service || 0) > 0),
      medicamentsSortieManquants: medicamentsSortieManquants(v)
    };
  });
};

// Lignes du formulaire papier CHF (reproduction fidèle de la fiche d'admission physique) — ordre et
// libellés calqués sur le papier. "Certificat" n'a pas d'équivalent dans le catalogue de l'app
// (aucune catégorie ne correspond) : sa case reste donc toujours vide, comme les champs Âge/Sexe/
// Statut Matrimonial de l'en-tête, à remplir à la main.
const LIGNES_FORMULAIRE_CHF = [
  { key: 'service', label: 'Services' },
  { key: 'hospit', label: 'Lit Hospit.' },
  { key: 'labo', label: 'Laboratoire' },
  { key: 'med', label: 'Médicaments' },
  { key: 'nebulisation', label: 'Nébulisation' },
  { key: 'oxygene', label: 'Oxygène' },
  { key: 'curetage', label: 'Curetage' },
  { key: 'accouchement', label: 'Accouchement' },
  { key: 'suture', label: 'Suture' },
  { key: 'drainage', label: 'Drainage' },
  { key: 'certificat', label: 'Certificat' },
  { key: 'pansement', label: 'Pansement' },
  { key: 'cesarienne', label: 'Césarienne' },
  { key: 'ecg', label: 'ECG' },
  { key: 'pap', label: 'PAP' },
  { key: 'sono', label: 'Sonographie' },
  { key: 'chirurgie', label: 'Chirurgie' },
];
const NB_COLONNES_MONTANT_FORMULAIRE = 8; // largeur du tableau papier reproduite à l'identique

// Cumule le breakdown de toutes les fiches du dossier, par clé de LIGNES_FORMULAIRE_CHF
// (même logique que ventilationDossier, mais gardant les clés à 0 et sans filtrage)
const cumulPourFormulaireCHF = (dossier) => {
  const totaux = {};
  LIGNES_FORMULAIRE_CHF.forEach(l => totaux[l.key] = 0);
  (dossier.fiches || []).forEach(f => {
    Object.entries(f.breakdown || {}).forEach(([cle, montant]) => { if (totaux[cle] !== undefined) totaux[cle] += (montant || 0); });
  });
  return totaux;
};

// Toutes les périodes d'hébergement du dossier (une par fiche ayant une période 1, + une de plus si
// la fiche a une 2e période) — pour gérer le cas d'un patient admis/hospitalisé à plusieurs reprises.
const periodesSejourDossier = (dossier) => {
  const dates = [];
  (dossier.fiches || []).forEach(f => {
    if (f.rawState?.dateEntree1) dates.push({ in: f.rawState.dateEntree1, out: f.rawState.dateSortie1 });
    if (f.rawState?.multiPeriode && f.rawState?.dateEntree2) dates.push({ in: f.rawState.dateEntree2, out: f.rawState.dateSortie2 });
  });
  return dates;
};

// "Date D'admission" du formulaire : la date d'ouverture du dossier si une seule période (ou aucune,
// ex. simple achat/consultation) ; sinon la liste complète des périodes, comme fait déjà ailleurs dans
// l'app pour periodeSejourString (ex : "du 10/08 au 15/08 et du 16/08 au 20/08").
const dateAdmissionFormulaireCHF = (dossier) => {
  const periodes = periodesSejourDossier(dossier);
  if (periodes.length < 2) return dossier.dateHeure || '';
  return periodes.map(d => d.in === d.out
    ? d.in.split('-').reverse().slice(0, 2).join('/')
    : `du ${d.in.split('-').reverse().slice(0, 2).join('/')} au ${d.out.split('-').reverse().slice(0, 2).join('/')}`
  ).join(' et ');
};

function HistoriqueVerifPanel({ verifications, setVerifications, onChargerPourModif, onSupprimer, filtreInitialNom, clearFiltreInitialNom, userRole, showToast, onChangerTypeOng, listeOng, listeOngDocs, confirmModal, setConfirmModal, lotInitialFocus, clearLotInitialFocus }) {
  const [focusedVerif, setFocusedVerif] = useState(null);
  const [ficheAValider, setFicheAValider] = useState(null); // id du dossier dont on affiche les boutons ✅/✖ pour valider le marquage ⚠️
  const [editTypeArchiveOuvert, setEditTypeArchiveOuvert] = useState(false);
  const [nouveauTypeArchive, setNouveauTypeArchive] = useState("ONG");
  const [nouvelOngArchive, setNouvelOngArchive] = useState("");
  const [filtreOng, setFiltreOng] = useState("");
  const [rechercheNomPatient, setRechercheNomPatient] = useState("");
  const [filtreDateDebut, setFiltreDateDebut] = useState("");
  const [filtreDateFin, setFiltreDateFin] = useState("");
  const [nombreAffiche, setNombreAffiche] = useState(100);
  const [filtreCategorie, setFiltreCategorie] = useState("");
  const [filtreType, setFiltreType] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("");
  const [appliqueRabais10, setAppliqueRabais10] = useState(false);
  const [montantDonIntrants, setMontantDonIntrants] = useState("");
  const [sousOngletArchives, setSousOngletArchives] = useState("dossiers");
  const [lotOngSelectionne, setLotOngSelectionne] = useState("");
  const [lotFocusedNumero, setLotFocusedNumero] = useState(null);
  const [dossierAAjouterAuLot, setDossierAAjouterAuLot] = useState("");

  useEffect(() => { if (filtreInitialNom) { setRechercheNomPatient(filtreInitialNom); clearFiltreInitialNom(); } }, [filtreInitialNom]);
  useEffect(() => {
    if (lotInitialFocus) {
      setSousOngletArchives("lots");
      setLotOngSelectionne(lotInitialFocus.ongPartenaire);
      setLotFocusedNumero(lotInitialFocus.numeroLot);
      clearLotInitialFocus();
    }
  }, [lotInitialFocus]);
  useEffect(() => { setAppliqueRabais10(false); setMontantDonIntrants(""); }, [lotFocusedNumero]);
  useEffect(() => { setNombreAffiche(100); }, [filtreType, filtreOng, rechercheNomPatient, filtreDateDebut, filtreDateFin, filtreCategorie, filtreStatut]);

  const numeroDepartConfigure = (ongCible) => {
    const doc = (listeOngDocs || []).find(o => o.nom === ongCible);
    return doc?.prochainNumero || 1;
  };

  const ventilationDossier = (v) => {
    const totaux = cumulCategoriesDossier(v);
    const items = CATEGORIES_LISTE.map(cat => ({ key: cat.key, label: cat.label, montant: totaux[cat.key] || 0 })).filter(x => x.montant > 0);
    // Hébergement doit toujours apparaître en dernier dans cette liste de badges
    return items.sort((a, b) => (a.key === 'hospit' ? 1 : 0) - (b.key === 'hospit' ? 1 : 0));
  };

  const lotsDuPartenaire = useMemo(() => {
    if (!lotOngSelectionne) return [];
    const parNumero = {};
    verifications.forEach(v => {
      if (v.ongPartenaire === lotOngSelectionne && v.numeroLot != null) {
        if (!parNumero[v.numeroLot]) parNumero[v.numeroLot] = [];
        parNumero[v.numeroLot].push(v);
      }
    });
    return Object.keys(parNumero).map(n => Number(n)).sort((a, b) => b - a).map(n => ({
      numero: n,
      dossiers: trierAvecRegroupementMereBebe(parNumero[n], verifications),
      total: parNumero[n].reduce((s, v) => s + (v.totalGlobal || 0), 0)
    }));
  }, [verifications, lotOngSelectionne]);

  const dossiersEnAttenteDeLot = useMemo(() => {
    if (!lotOngSelectionne) return [];
    return verifications.filter(v => v.ongPartenaire === lotOngSelectionne && (v.status || 'archived') === 'archived' && v.numeroLot == null && !v.verrouilleFacture);
  }, [verifications, lotOngSelectionne]);

  // Dossiers déjà envoyés à ce partenaire AVANT la mise en place des lots (verrouillés par l'ancien
  // système, mais sans numéro de lot) — il faut les rattacher rétroactivement à un lot pour que la
  // numérotation soit cohérente avec ce qui a déjà été réellement envoyé.
  const dossiersOrphelinsVerrouilles = useMemo(() => {
    if (!lotOngSelectionne) return [];
    return verifications.filter(v => v.ongPartenaire === lotOngSelectionne && (v.status || 'archived') === 'archived' && v.numeroLot == null && v.verrouilleFacture);
  }, [verifications, lotOngSelectionne]);

  const lotFocused = lotFocusedNumero != null ? (lotsDuPartenaire.find(l => l.numero === lotFocusedNumero) || null) : null;

  // Petit compteur pour vérification avant soumission du lot : combien de dossiers du lot ont une
  // césarienne, un accouchement ou une chirurgie facturée (un même dossier peut compter dans plusieurs cases).
  const compteursLotFocused = useMemo(() => {
    if (!lotFocused) return { cesarienne: 0, accouchement: 0, chirurgie: 0 };
    return lotFocused.dossiers.reduce((acc, v) => {
      const cumul = cumulCategoriesDossier(v);
      if ((cumul.cesarienne || 0) > 0) acc.cesarienne++;
      if ((cumul.accouchement || 0) > 0) acc.accouchement++;
      if ((cumul.chirurgie || 0) > 0) acc.chirurgie++;
      return acc;
    }, { cesarienne: 0, accouchement: 0, chirurgie: 0 });
  }, [lotFocused]);

  const dossiersFiltres = useMemo(() => {
    return verifications.filter(v => {
      const matchType = filtreType === "" || (v.typePatient || 'ONG') === filtreType;
      const matchOng = filtreOng === "" || v.ongPartenaire === filtreOng;
      const matchNom = rechercheNomPatient.trim() === "" || v.nomPatient.toLowerCase().includes(rechercheNomPatient.toLowerCase());
      let matchMois = true;
      if (filtreDateDebut || filtreDateFin) {
        const d = new Date(v.dateEntreePourTri);
        if (isNaN(d)) matchMois = false;
        else {
          if (filtreDateDebut && d < new Date(filtreDateDebut)) matchMois = false;
          if (filtreDateFin) { const fin = new Date(filtreDateFin); fin.setHours(23,59,59,999); if (d > fin) matchMois = false; }
        }
      }
      let matchCategorie = true;
      if (filtreCategorie) { matchCategorie = v.fiches?.some(f => f.breakdown && (f.breakdown[filtreCategorie]||0) > 0) || false; }
      let matchStatut = true;
      if (filtreStatut) { const statut = v.status || 'archived'; matchStatut = statut === filtreStatut; }
      return matchType && matchOng && matchNom && matchMois && matchCategorie && matchStatut;
    });
  }, [verifications, filtreType, filtreOng, rechercheNomPatient, filtreDateDebut, filtreDateFin, filtreCategorie, filtreStatut]);

  // Styles Excel réutilisables (format ExcelJS — remplace xlsx-js-style, qui ne supporte pas les images)
  const EXCEL_STYLES = {
    titre: { font: { bold: true, size: 18 }, alignment: { horizontal: "center", vertical: "center" } },
    sousTitre: { font: { size: 11 }, alignment: { horizontal: "center", vertical: "center" } },
    gras: { font: { bold: true } },
    teteColonne: {
      font: { bold: true }, alignment: { horizontal: "center", vertical: "center" },
      border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
    },
    celluleStandard: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } },
    celluleNombre: { alignment: { horizontal: "right" }, numFmt: "#,##0", border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } },
    celluleTotal: { font: { bold: true }, alignment: { horizontal: "right" }, numFmt: "\"HTG \"#,##0", border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } },
    grandTotalHtg: { font: { bold: true }, alignment: { horizontal: "right" }, numFmt: "\"HTG \"#,##0", border: { top: { style: "medium" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } },
    grandTotalNombre: { font: { bold: true }, alignment: { horizontal: "right" }, numFmt: "#,##0", border: { top: { style: "medium" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } },
    celluleFinaleGras: { font: { bold: true, size: 11 }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD0D0D0" } }, alignment: { horizontal: "right" }, numFmt: "\"HTG \"#,##0", border: { top: { style: "medium" }, bottom: { style: "double" }, left: { style: "thin" }, right: { style: "thin" } } }
  };

  // Applique un style nommé (EXCEL_STYLES.xxx) à une cellule ExcelJS
  const appliquerStyle = (cell, style) => {
    if (!style) return;
    if (style.font) cell.font = style.font;
    if (style.alignment) cell.alignment = style.alignment;
    if (style.border) cell.border = style.border;
    if (style.numFmt) cell.numFmt = style.numFmt;
    if (style.fill) cell.fill = style.fill;
  };

  // Libellés d'export courts, alignés sur le modèle Excel réel du CHF (pas les labels internes de l'app)
  // Chaque catégorie de CATEGORIES_LISTE a sa propre colonne — aucune n'est regroupée dans un fourre-tout "Autres".
  const LABELS_EXPORT = {
    service: 'Admission', hospit: 'Lit/ Hosp', labo: 'Laboratoire', med: 'Medicaments',
    ecg: 'ECG', oxygene: 'O2', cesarienne: 'Cesarienne/Laparo', curetage: 'curtage',
    chirurgie: 'Chirugie', accouchement: 'Accouch', sono: 'SONO', pansement: 'Pansement',
    suture: 'Suture', drainage: 'Drainage', pap: 'PAP Test', visite: 'Visite',
    nebulisation: 'Nebulisation', radio: 'Radiographie'
  };

  const genererFichierExcelPourLot = async (ongCible, idsDossiers, numeroLot) => {
    try {
      // Regroupement mère/bébé : un dossier nommé "Bb <nom de la mère>" est trié juste après le
      // dossier de sa mère (même date effective, ordre alphabétique de la "famille" sinon), même si
      // le bébé n'a pas sa propre date d'hébergement (il hérite alors de celle de sa mère pour le tri).
      // L'alerte "bébé sans mère" reste uniquement dans l'app (toast) — jamais dans le fichier envoyé
      // au partenaire.
      let listeDossiersONG = trierAvecRegroupementMereBebe(verifications.filter(v => idsDossiers.includes(v.id)), verifications);

      if (listeDossiersONG.length === 0) { showToast(`Aucun dossier trouvé pour ${ongCible}`, "error"); return; }
      const nomsBebesSansMere = listeDossiersONG.filter(v => v.estBebeSansMere).map(v => v.nomPatient);
      if (nomsBebesSansMere.length > 0) {
        showToast(`⚠️ Bébé(s) sans dossier de mère dans ce lot (vérifie s'il faut une fiche d'urgence) : ${nomsBebesSansMere.join(', ')}`, "info");
      }

      // Étape B : détection dynamique des colonnes réellement utilisées (rien d'inventé, rien d'oublié)
      const clesVues = new Set(['service', 'hospit', 'labo', 'med']);
      let grandTotalGeneral = 0;
      listeDossiersONG.forEach(doc => {
        (doc.fiches || []).forEach(f => {
          Object.entries(f.breakdown || {}).forEach(([k, val]) => {
            if (!val) return;
            if (LABELS_EXPORT[k]) clesVues.add(k);
          });
          grandTotalGeneral += f.totalGlobal || 0;
        });
      });
      const colonnesExport = Object.keys(LABELS_EXPORT).filter(k => clesVues.has(k)).map(k => ({ key: k, label: LABELS_EXPORT[k] }));

      // Étape C : classeur ExcelJS + en-tête du document
      // Le logo flotte au-dessus de l'en-tête (coin haut-gauche), sans réserver de colonne dédiée dans le tableau.
      const wb = new window.ExcelJS.Workbook();
      const ws = wb.addWorksheet("Facturation");
      const derniereCol = colonnesExport.length + 3; // Nom(1) + Date(2) + colonnesExport(n) + Total

      let r = 1;
      const ligneCentree = (texte, style) => {
        ws.mergeCells(r, 1, r, derniereCol);
        const cell = ws.getCell(r, 1);
        cell.value = texte;
        appliquerStyle(cell, style);
        r++;
      };
      ligneCentree("CENTRE HOSPITALIER DE FONTAINE", EXCEL_STYLES.titre);
      ligneCentree("#13, Fontaine Duvivier, Cite Soleil", EXCEL_STYLES.sousTitre);
      ligneCentree("tel: (509) 3647-0563 / 2226-8900", EXCEL_STYLES.sousTitre);
      ligneCentree("centrehfontaine@gmail.com", EXCEL_STYLES.sousTitre);
      r++; // ligne vide

      const now = new Date();
      const moisRapport = new Date(now.getFullYear(), now.getMonth() - 1, 1); // le rapport envoyé début de mois porte toujours sur le mois précédent
      const moisTexte = moisRapport.toLocaleString('fr-FR', { month: 'long' }).toUpperCase();
      appliquerStyle(ws.getCell(r, 1), EXCEL_STYLES.gras);
      ws.getCell(r, 1).value = "DATE D'ADMISSION :";
      ws.getCell(r, 2).value = `${moisTexte} ${moisRapport.getFullYear()}`;
      r++;
      appliquerStyle(ws.getCell(r, 1), EXCEL_STYLES.gras);
      ws.getCell(r, 1).value = "FACTURE";
      ws.getCell(r, 2).value = `N°${numeroLot}`;
      ws.getCell(r, 5).value = nomCompletOng(ongCible);
      appliquerStyle(ws.getCell(r, 5), EXCEL_STYLES.gras);
      r++;
      r++; // ligne vide

      appliquerStyle(ws.getCell(r, 1), EXCEL_STYLES.teteColonne); ws.getCell(r, 1).value = "Nom et Prenom";
      appliquerStyle(ws.getCell(r, 2), EXCEL_STYLES.teteColonne); ws.getCell(r, 2).value = "Date";
      colonnesExport.forEach((c, i) => { const cell = ws.getCell(r, 3 + i); cell.value = c.label; appliquerStyle(cell, EXCEL_STYLES.teteColonne); });
      { const cell = ws.getCell(r, 3 + colonnesExport.length); cell.value = "Total"; appliquerStyle(cell, EXCEL_STYLES.teteColonne); }
      r++;

      // Étape D : une ligne par dossier
      const totalsParColonne = {};
      colonnesExport.forEach(c => totalsParColonne[c.key] = 0);

      listeDossiersONG.forEach(doc => {
        const totalsPatient = {};
        colonnesExport.forEach(c => totalsPatient[c.key] = 0);
        let totalPatient = 0;

        (doc.fiches || []).forEach(f => {
          Object.entries(f.breakdown || {}).forEach(([k, val]) => {
            if (totalsPatient[k] !== undefined) totalsPatient[k] += (val || 0);
          });
          totalPatient += f.totalGlobal || 0;
        });

        appliquerStyle(ws.getCell(r, 1), EXCEL_STYLES.celluleStandard); ws.getCell(r, 1).value = formaterNomPropre(doc.nomPatient);
        appliquerStyle(ws.getCell(r, 2), EXCEL_STYLES.celluleStandard); ws.getCell(r, 2).value = doc.periodeSejourString || doc.dateHeure || "—";
        colonnesExport.forEach((c, i) => {
          totalsParColonne[c.key] += totalsPatient[c.key] || 0;
          const cell = ws.getCell(r, 3 + i);
          if (!totalsPatient[c.key]) { cell.value = ""; appliquerStyle(cell, EXCEL_STYLES.celluleStandard); }
          else { cell.value = totalsPatient[c.key]; appliquerStyle(cell, EXCEL_STYLES.celluleNombre); }
        });
        { const cell = ws.getCell(r, 3 + colonnesExport.length); cell.value = totalPatient; appliquerStyle(cell, EXCEL_STYLES.celluleTotal); }
        r++;
      });

      // Étape E : GRAND TOTAL, puis réductions/dons si activés dans l'interface
      appliquerStyle(ws.getCell(r, 1), EXCEL_STYLES.grandTotalHtg); ws.getCell(r, 1).value = "GRAND TOTAL";
      appliquerStyle(ws.getCell(r, 2), EXCEL_STYLES.grandTotalHtg);
      colonnesExport.forEach((c, i) => { const cell = ws.getCell(r, 3 + i); cell.value = totalsParColonne[c.key]; appliquerStyle(cell, EXCEL_STYLES.grandTotalNombre); });
      { const cell = ws.getCell(r, 3 + colonnesExport.length); cell.value = grandTotalGeneral; appliquerStyle(cell, EXCEL_STYLES.grandTotalHtg); }
      r++;

      const rabaisVal = appliqueRabais10 ? Math.round(grandTotalGeneral * 0.10) : 0;
      const donsVal = parseFloat(montantDonIntrants) || 0;

      if (rabaisVal > 0) {
        appliquerStyle(ws.getCell(r, 1), EXCEL_STYLES.gras); ws.getCell(r, 1).value = "Réductions 10%";
        const cell = ws.getCell(r, 3 + colonnesExport.length); cell.value = rabaisVal; appliquerStyle(cell, EXCEL_STYLES.celluleTotal);
        r++;
      }
      if (donsVal > 0) {
        appliquerStyle(ws.getCell(r, 1), EXCEL_STYLES.gras); ws.getCell(r, 1).value = "Dons / Intrants";
        const cell = ws.getCell(r, 3 + colonnesExport.length); cell.value = donsVal; appliquerStyle(cell, EXCEL_STYLES.celluleTotal);
        r++;
      }
      if (rabaisVal > 0 || donsVal > 0) {
        appliquerStyle(ws.getCell(r, 1), EXCEL_STYLES.celluleFinaleGras); ws.getCell(r, 1).value = "MONTANT NET DÛ";
        appliquerStyle(ws.getCell(r, 2), EXCEL_STYLES.celluleFinaleGras);
        colonnesExport.forEach((c, i) => appliquerStyle(ws.getCell(r, 3 + i), EXCEL_STYLES.celluleFinaleGras));
        const cell = ws.getCell(r, 3 + colonnesExport.length); cell.value = grandTotalGeneral - rabaisVal - donsVal; appliquerStyle(cell, EXCEL_STYLES.celluleFinaleGras);
        r++;
      }

      // Étape F : largeurs de colonnes, logo CHF flottant au-dessus de l'en-tête (à gauche, avant la ligne du mois), puis téléchargement
      ws.getColumn(1).width = 26;
      ws.getColumn(2).width = 20;
      colonnesExport.forEach((c, i) => { ws.getColumn(3 + i).width = 12; });
      ws.getColumn(3 + colonnesExport.length).width = 16;
      for (let i = 1; i <= 4; i++) ws.getRow(i).height = 20;

      const logoId = wb.addImage({ base64: LOGO_CHF_BASE64, extension: 'png' });
      ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 90, height: 102 } });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const urlTelechargement = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = urlTelechargement;
      lien.download = `Lot${numeroLot}_${ongCible.replace(/\s+/g, '_')}_${now.toLocaleDateString('fr-FR').replace(/\//g,'-')}.xlsx`;
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
      setTimeout(() => URL.revokeObjectURL(urlTelechargement), 1000);

      // Étape G : assigne le numéro de lot + verrouille les dossiers (protège contre modification
      // libre et suppression). Idempotent : réimprimer un lot existant réassigne le même numéro.
      const idsExportes = listeDossiersONG.map(d => d.id);
      setVerifications(prev => prev.map(v => idsExportes.includes(v.id) ? { ...v, numeroLot, verrouilleFacture: true } : v));
      let echecsVerrou = 0;
      await Promise.all(listeDossiersONG.map(async (d) => {
        try { await chf.updateEpisode(d.id, toEpisodeApi({ numeroLot, verrouilleFacture: true })); }
        catch (e) { if (!e.isOfflineQueue) echecsVerrou++; }
      }));

      showToast(`✅ Lot ${numeroLot} de ${ongCible} : ${listeDossiersONG.length} dossier(s), ${formatGourdes(grandTotalGeneral)} Gdes${echecsVerrou > 0 ? ` — ⚠️ ${echecsVerrou} dossier(s) non enregistré(s), réessaie plus tard` : ''}`, "success");
      setAppliqueRabais10(false);
      setMontantDonIntrants("");
    } catch (error) {
      console.error("Erreur export Excel:", error);
      showToast("Une erreur s'est produite lors de la génération du fichier Excel.", "error");
    }
  };

  const genererProchainLot = (ongCible) => {
    const eligibles = verifications.filter(v => v.ongPartenaire === ongCible && (v.status || 'archived') === 'archived' && v.numeroLot == null && !v.verrouilleFacture);
    if (eligibles.length === 0) { showToast(`Aucun nouveau dossier en attente pour ${ongCible}.`, "error"); return; }
    const numerosExistants = verifications.filter(v => v.ongPartenaire === ongCible && v.numeroLot != null).map(v => v.numeroLot);
    const prochainNumero = numerosExistants.length > 0 ? Math.max(...numerosExistants) + 1 : numeroDepartConfigure(ongCible);
    const totalEstime = eligibles.reduce((s, v) => s + (v.totalGlobal || 0), 0);
    setConfirmModal({
      titre: `📦 Générer le Lot ${prochainNumero} pour ${ongCible} ?`,
      message: `${eligibles.length} dossier(s) seront inclus, pour un total d'environ ${formatGourdes(totalEstime)} Gdes. Une fois généré, ce lot sera figé : ces dossiers ne seront plus jamais repris automatiquement dans un futur lot.`,
      confirmLabel: `📦 Générer le Lot ${prochainNumero}`,
      onConfirm: () => { setConfirmModal(null); genererFichierExcelPourLot(ongCible, eligibles.map(v => v.id), prochainNumero); },
      onCancel: () => setConfirmModal(null)
    });
  };

  // Rattache rétroactivement, SANS régénérer ni retélécharger de fichier (il a déjà été envoyé
  // manuellement au partenaire), les dossiers déjà verrouillés par l'ancien système à un numéro de
  // lot — pour que la numérotation future (via "Générer le prochain lot") reparte juste après.
  const rattacherOrphelinsAUnLot = (ongCible) => {
    const orphelins = verifications.filter(v => v.ongPartenaire === ongCible && (v.status || 'archived') === 'archived' && v.numeroLot == null && v.verrouilleFacture);
    if (orphelins.length === 0) return;
    const numerosExistants = verifications.filter(v => v.ongPartenaire === ongCible && v.numeroLot != null).map(v => v.numeroLot);
    const numero = numerosExistants.length > 0 ? Math.max(...numerosExistants) + 1 : numeroDepartConfigure(ongCible);
    setConfirmModal({
      titre: `Rattacher ces ${orphelins.length} dossier(s) déjà envoyés au Lot ${numero} ?`,
      message: `Ces dossiers ont déjà été envoyés à ${ongCible} avant la mise en place des lots. Aucun fichier ne sera regénéré ni téléchargé ici — on marque juste qu'ils correspondent au Lot ${numero}, pour que le prochain lot généré démarre à ${numero + 1}.`,
      confirmLabel: `Rattacher au Lot ${numero}`,
      onConfirm: async () => {
        setConfirmModal(null);
        setVerifications(prev => prev.map(v => orphelins.some(o => o.id === v.id) ? { ...v, numeroLot: numero } : v));
        let echecs = 0;
        await Promise.all(orphelins.map(async (v) => {
          try { await chf.updateEpisode(v.id, toEpisodeApi({ numeroLot: numero })); }
          catch (e) { if (!e.isOfflineQueue) echecs++; }
        }));
        showToast(`Lot ${numero} créé rétroactivement avec ${orphelins.length} dossier(s)${echecs > 0 ? ` — ⚠️ ${echecs} non enregistré(s), réessaie` : ''}`, "success");
      },
      onCancel: () => setConfirmModal(null)
    });
  };

  const reimprimerLot = (ongCible, numeroLot) => {
    const idsLot = verifications.filter(v => v.ongPartenaire === ongCible && v.numeroLot === numeroLot).map(v => v.id);
    if (idsLot.length === 0) { showToast("Lot introuvable.", "error"); return; }
    genererFichierExcelPourLot(ongCible, idsLot, numeroLot);
  };

  // Retire un dossier de son lot : redevient libre, sera repris au prochain "Générer le prochain
  // lot" pour ce partenaire — jamais automatiquement dans un autre lot déjà existant.
  const retirerDossierDuLot = (dossier) => {
    setConfirmModal({
      titre: `Retirer ${dossier.nomPatient} du Lot ${dossier.numeroLot} ?`,
      message: `Ce dossier redeviendra libre et sera inclus dans le PROCHAIN lot généré pour ${dossier.ongPartenaire}, pas dans celui-ci. Si ce lot a déjà été envoyé au partenaire, réimprime-le après pour qu'il reçoive la version sans ce dossier.`,
      confirmLabel: "Retirer du lot",
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setVerifications(prev => prev.map(v => v.id === dossier.id ? { ...v, numeroLot: null, verrouilleFacture: false } : v));
        try {
          await chf.updateEpisode(dossier.id, toEpisodeApi({ numeroLot: null, verrouilleFacture: false }));
          showToast(`${dossier.nomPatient} retiré du Lot ${dossier.numeroLot}`, "success");
        } catch (error) {
          if (error.isOfflineQueue) showToast("📴 Changement enregistré hors ligne", "info");
          else showToast("Erreur: " + error.message, "error");
        }
      },
      onCancel: () => setConfirmModal(null)
    });
  };

  // Ajoute un dossier libre (jamais encore loté) à un lot déjà existant. Ne propose que des
  // dossiers sans numeroLot — un dossier déjà dans un lot ne peut donc jamais se retrouver dans deux
  // lots à la fois (il faut d'abord le retirer de l'un avant de pouvoir l'ajouter à l'autre).
  const ajouterDossierAuLot = async (idDossier, numeroLot, ongCible) => {
    const dossier = verifications.find(v => v.id === idDossier);
    setVerifications(prev => prev.map(v => v.id === idDossier ? { ...v, numeroLot, verrouilleFacture: true } : v));
    try {
      await chf.updateEpisode(idDossier, toEpisodeApi({ numeroLot, verrouilleFacture: true }));
      showToast(`${dossier?.nomPatient || 'Dossier'} ajouté au Lot ${numeroLot}`, "success");
    } catch (error) {
      if (error.isOfflineQueue) showToast("📴 Changement enregistré hors ligne", "info");
      else showToast("Erreur: " + error.message, "error");
    }
  };


  const imprimerFiche = (fiche) => {
    const lignesDetaillees = fiche.rawState?.lignesCalcul || [];
    const hasLignes = lignesDetaillees.length > 0;
    const lignesHTML = hasLignes ? lignesDetaillees.map(l => `<tr><td>${echapperHTML(l.nom)}</td><td class="qte">${l.qte}</td><td class="prix">${formatGourdes(l.prix)}</td><td class="sous-total">${formatGourdes(l.qte * l.prix)}</td></tr>`).join('') : '';
    const fallbackHTML = !hasLignes ? Object.entries(fiche.breakdown || {}).filter(([key, val]) => val > 0).map(([key, val]) => {
      const cat = CATEGORIES_LISTE.find(c => c.key === key);
      const label = cat ? cat.label : key;
      if (key === 'hospit' && fiche.exeat) { return `<tr><td>Hébergement (${fiche.exeat.nbJours}j)</td><td class="qte">${fiche.exeat.nbJours}</td><td class="prix">${formatGourdes(fiche.exeat.prixParJour)}</td><td class="sous-total">${formatGourdes(val)}</td></tr>`; }
      return `<tr><td>${label}</td><td class="qte">1</td><td class="prix">${formatGourdes(val)}</td><td class="sous-total">${formatGourdes(val)}</td></tr>`;
    }).join('') : '';
    const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fiche N°${fiche.numeroFiche}</title><style>@page{size:100mm 297mm;margin:3mm 5mm;}body{font-family:'Courier New',monospace;font-size:14px;color:#000;background:white;margin:0;padding:0;width:90mm;margin:0 auto;}.entete{position:relative;text-align:center;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:8px;}.logo-entete{position:absolute;top:0;right:0;width:30px;height:30px;object-fit:contain;}.entete h1{font-size:23px;margin:4px 0;}.entete p{margin:2px 0;font-size:13px;}.info{display:flex;justify-content:space-between;font-weight:bold;font-size:13px;margin-bottom:6px;}table{width:100%;border-collapse:collapse;margin:6px 0;font-size:13px;}th,td{padding:4px 6px;text-align:left;border-bottom:1px dotted #ccc;}th{border-bottom:2px solid #000;font-size:12px;text-transform:uppercase;}.total{font-weight:bold;font-size:19px;text-align:right;border-top:3px solid #000;padding-top:6px;margin-top:6px;}.footer{margin-top:12px;font-size:11px;text-align:center;border-top:1px dashed #ccc;padding-top:6px;color:#555;}.qte{text-align:center;}.prix,.sous-total{text-align:right;}.info-patient{font-size:12px;margin-bottom:4px;}</style></head><body><div class="entete"><img class="logo-entete" src="${LOGO_CHF_BASE64}" alt="Logo CHF"/><h1>CHF</h1><p>Centre Hospitalier de Fontaine</p><p>#13, Fontaine Duvivier, Cité Soleil</p><p>Tél: (509) 3647-0563 / 2226-8900</p><p>Fiche du ${(fiche.dateCreation ? new Date(fiche.dateCreation) : new Date()).toLocaleDateString('fr-FR')} (réimprimée le ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})})</p></div><div class="info"><span>Patient: ${echapperHTML(focusedVerif.nomPatient)}</span><span>${focusedVerif.typePatient === 'ONG' ? `Partenaire : ${echapperHTML(focusedVerif.ongPartenaire || 'N/R')}` : 'Privé'}</span></div><div class="info"><span>Fiche N°${fiche.numeroFiche}</span><span>Mode: ${echapperHTML(fiche.modePaiement || 'cash').toUpperCase()}</span></div><div class="info info-patient"><span>📞 ${echapperHTML(focusedVerif.telephone || 'N/R')}</span><span>📁 ${echapperHTML(focusedVerif.numDossier || 'N/R')}</span></div><div class="info info-patient"><span>Enregistré par: ${echapperHTML(fiche.creePar || 'inconnu')}</span></div>${fiche.exeat ? `<p style="font-size:10px; margin:4px 0;"><strong>Séjour:</strong> ${fiche.exeat.dateEntree.split('-').reverse().slice(0,2).join('/')} → ${fiche.exeat.dateSortie.split('-').reverse().slice(0,2).join('/')}</p>` : ''}<table><thead><tr><th>Désignation</th><th class="qte">Qté</th><th class="prix">Prix</th><th class="sous-total">Total</th></tr></thead><tbody>${hasLignes ? lignesHTML : fallbackHTML}</tbody></table><div class="total">TOTAL FICHE : ${formatGourdes(fiche.totalGlobal)} Gdes<br/>${formatDH(fiche.totalGlobal)} DH</div>${fiche.solde && fiche.solde > 0 ? `<p style="font-size:12px; color:red;"><strong>Solde restant :</strong> ${formatGourdes(fiche.solde)} Gdes</p>` : ''}<div class="footer">Merci de votre visite !<br/>CHF Système Hospitalier – ${new Date().getFullYear()}</div></body></html>`;
    const win = window.open('', '_blank', 'width=500,height=700');
    if (!win) { showToast("Impression bloquée par le navigateur. Réessaie en cliquant sur Imprimer — si ça ne marche toujours pas, demande à quelqu'un de vérifier les réglages.", "error"); return; }
    win.document.write(contenu); win.document.close(); win.focus(); setTimeout(() => win.print(), 500);
  };

  // Reproduction fidele du formulaire papier d'admission du CHF (logo, en-tete, grille "Services /
  // Lit Hospit. / Laboratoire..." avec colonnes $) -- chaque case vide affiche "$" comme sur le papier ;
  // premiere et derniere colonne affichent le montant de la categorie, GRAND TOTAL pareil.
  // "Personne Responsable" = le partenaire qui prend en charge le patient.
  // Extrait le corps HTML (sans doctype/head/style) pour pouvoir l'imprimer seul OU enchaine avec
  // d'autres dossiers (impression groupee pour tout un lot, une page par dossier).
  const genererCorpsFormulaireCHF = (dossier) => {
    const cumul = cumulPourFormulaireCHF(dossier);
    const totalFormulaire = Object.values(cumul).reduce((a, b) => a + b, 0);
    const totalReelDossier = dossier.totalGlobal || 0;
    const ecartCategoriesHorsFormulaire = Math.round((totalReelDossier - totalFormulaire) * 100) / 100;
    const personneResponsable = dossier.typePatient === 'ONG' ? (dossier.ongPartenaire || 'N/R') : 'Privé (patient/famille)';

    const celluleMontant = (montant, estColonneRemplie) => (estColonneRemplie && montant > 0) ? `<span class="montant">$${formatGourdes(montant)}</span>` : `<span class="dollar">$</span>`;
    const ligneTableau = (label, montant) => `<tr><td class="lbl">${echapperHTML(label)}</td>${Array.from({ length: NB_COLONNES_MONTANT_FORMULAIRE }, (_, i) => `<td class="mnt">${celluleMontant(montant, i === 0 || i === NB_COLONNES_MONTANT_FORMULAIRE - 1)}</td>`).join('')}</tr>`;

    const lignesHTML = LIGNES_FORMULAIRE_CHF.map(l => ligneTableau(l.label, cumul[l.key])).join('');
    const ligneGrandTotal = `<tr class="grand-total"><td class="lbl">GRAND TOTAL</td>${Array.from({ length: NB_COLONNES_MONTANT_FORMULAIRE }, (_, i) => `<td class="mnt">${celluleMontant(totalFormulaire, i === 0 || i === NB_COLONNES_MONTANT_FORMULAIRE - 1)}</td>`).join('')}</tr>`;

    const champ = (label, valeur, large) => `<span class="champ${large ? ' large' : ''}"><span class="lbl-champ">${echapperHTML(label)}</span><span class="val-champ">${valeur ? echapperHTML(valeur) : '&nbsp;'}</span></span>`;

    const nomPatientPropre = formaterNomPropre(dossier.nomPatient);
    const corps = `<div class="entete">
        <img src="${LOGO_CHF_BASE64}" alt="Logo CHF" />
        <div class="entete-texte">
          <h1>CENTRE HOSPITALIER DE FONTAINE</h1>
          <p>#13, Fontaine Duvivier, Cité Soleil, HAITI</p>
          <p>Tels: (+509) 3647-0563 / (+509) 4609-4893 / (+509) 4654-2552</p>
          <p class="email">chfcentrehospitalierdefontaine@gmail.com</p>
        </div>
      </div>
      <div class="champs">
        <div class="ligne-champs">${champ('Nom', nomPatientPropre)}${champ('Prénom', '', true)}</div>
        <div class="ligne-champs">${champ('Age', '')}${champ('Sexe', '')}</div>
        <div class="ligne-champs">${champ('Statut Matrimonial', '', true)}</div>
        <div class="ligne-champs">${champ("Date D'admission", dateAdmissionFormulaireCHF(dossier), true)}</div>
        <div class="ligne-champs">${champ('Personne Responsable', personneResponsable, true)}</div>
        <div class="ligne-champs">${champ('Phone', dossier.telephone, true)}</div>
      </div>
      <table><tbody>${lignesHTML}${ligneGrandTotal}</tbody></table>`;
    return { corps, ecartCategoriesHorsFormulaire, nomPatientPropre };
  };

  const STYLE_FORMULAIRE_CHF = `
      @page{size:A4;margin:8mm 14mm;}
      body{font-family:'Times New Roman',Georgia,serif;color:#000;font-size:11px;}
      .entete{display:flex;align-items:center;justify-content:center;gap:10px;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:8px;position:relative;}
      .entete img{width:46px;height:46px;object-fit:contain;position:absolute;right:0;top:2px;}
      .entete-texte{text-align:center;}
      .entete-texte h1{font-size:20px;margin:0;letter-spacing:0.5px;font-weight:bold;}
      .entete-texte p{margin:1px 0;font-size:10px;}
      .entete-texte p.email{font-size:8px;color:#999;}
      .champs{margin-bottom:8px;font-size:12px;}
      .ligne-champs{display:flex;flex-wrap:wrap;gap:0 30px;margin-bottom:5px;}
      .champ{display:inline-flex;align-items:baseline;gap:6px;}
      .champ.large{flex:1;}
      .lbl-champ{font-weight:bold;white-space:nowrap;}
      .val-champ{border-bottom:1px dotted #000;min-width:150px;flex:1;display:inline-block;padding:0 2px;line-height:1.3;}
      .champ.large .val-champ{min-width:300px;}
      table{width:100%;border-collapse:collapse;margin-top:4px;table-layout:fixed;}
      th,td{border:1px solid #000;color:#000;}
      td.lbl{text-align:left;width:16%;font-weight:bold;font-size:10px;padding:3px 6px;}
      td.mnt{text-align:center;width:${(84 / NB_COLONNES_MONTANT_FORMULAIRE).toFixed(1)}%;padding:3px 2px;height:16px;}
      .dollar{color:#555;font-size:11px;}
      .montant{font-weight:bold;font-size:9px;white-space:nowrap;}
      tr.grand-total td.lbl{font-size:11px;}
      .page-formulaire{page-break-after:always;}
      .page-formulaire:last-child{page-break-after:auto;}`;

  const imprimerFormulaireCHF = (dossier) => {
    const { corps, ecartCategoriesHorsFormulaire, nomPatientPropre } = genererCorpsFormulaireCHF(dossier);
    if (ecartCategoriesHorsFormulaire !== 0) {
      showToast(`⚠️ Ce formulaire ne couvre pas toutes les catégories facturées à ${dossier.nomPatient} : ${formatGourdes(Math.abs(ecartCategoriesHorsFormulaire))} Gdes de plus dans le dossier complet (ex. Radiographie / Visite) — vérifie l'onglet Dossiers pour le détail.`, "info");
    }
    const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Formulaire CHF - ${echapperHTML(nomPatientPropre)}</title><style>${STYLE_FORMULAIRE_CHF}</style></head><body>${corps}</body></html>`;
    const win = window.open('', '_blank', 'width=850,height=1100');
    if (!win) { showToast("Impression bloquée par le navigateur. Réessaie en cliquant sur Imprimer — si ça ne marche toujours pas, demande à quelqu'un de vérifier les réglages.", "error"); return; }
    win.document.write(contenu); win.document.close(); win.focus(); setTimeout(() => win.print(), 500);
  };

  // Imprime le formulaire papier CHF de TOUS les dossiers d'un lot d'affilee, un par page --
  // pratique pour preparer tous les formulaires d'un coup avant l'envoi du lot.
  const imprimerFormulaireCHFPourLot = (dossiers) => {
    if (!dossiers || dossiers.length === 0) { showToast("Aucun dossier dans ce lot.", "error"); return; }
    const dossiersIncomplets = [];
    const pages = dossiers.map(d => {
      const { corps, ecartCategoriesHorsFormulaire } = genererCorpsFormulaireCHF(d);
      if (ecartCategoriesHorsFormulaire !== 0) dossiersIncomplets.push(d.nomPatient);
      return `<div class="page-formulaire">${corps}</div>`;
    }).join('');
    if (dossiersIncomplets.length > 0) {
      showToast(`⚠️ ${dossiersIncomplets.length} formulaire(s) ne couvrent pas toutes les catégories facturées (ex. Radiographie / Visite) : ${dossiersIncomplets.join(', ')}`, "info");
    }
    const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Formulaires CHF - Lot (${dossiers.length} dossiers)</title><style>${STYLE_FORMULAIRE_CHF}</style></head><body>${pages}</body></html>`;
    const win = window.open('', '_blank', 'width=850,height=1100');
    if (!win) { showToast("Impression bloquée par le navigateur. Réessaie en cliquant sur Imprimer — si ça ne marche toujours pas, demande à quelqu'un de vérifier les réglages.", "error"); return; }
    win.document.write(contenu); win.document.close(); win.focus(); setTimeout(() => win.print(), 500);
  };

  const imprimerArchive = (dossier) => {
    const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Dossier ${echapperHTML(dossier.nomPatient)}</title><style>body{font-family:sans-serif;padding:20px;color:#000;} .entete{position:relative;text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:14px;} .logo-entete{position:absolute;top:0;right:0;width:40px;height:40px;object-fit:contain;} .entete h1{font-size:22px;margin:4px 0;} .entete p{margin:2px 0;font-size:12px;} h1.titre{font-size:18px;margin-top:10px;} table{width:100%;border-collapse:collapse;margin-top:10px;} th,td{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px;} .total{font-weight:bold;font-size:16px;margin-top:10px;} .info-patient{font-size:12px;margin:4px 0;} .meta-fiche{font-size:10px;color:#555;margin-top:4px;}</style></head><body><div class="entete"><img class="logo-entete" src="${LOGO_CHF_BASE64}" alt="Logo CHF"/><h1>CHF</h1><p>Centre Hospitalier de Fontaine</p><p>#13, Fontaine Duvivier, Cité Soleil</p><p>Tél: (509) 3647-0563 / 2226-8900</p><p>${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</p></div><h1 class="titre">Dossier patient</h1><p class="info-patient"><strong>Nom :</strong> ${echapperHTML(dossier.nomPatient)} &nbsp;|&nbsp; <strong>N° Dossier :</strong> ${echapperHTML(dossier.numDossier || 'N/R')}</p><p class="info-patient"><strong>Partenaire / Type :</strong> ${dossier.typePatient === 'ONG' ? echapperHTML(dossier.ongPartenaire || 'N/R') : 'Privé'} (${dossier.typePatient === 'ONG' ? 'Partenaire' : 'Privé'})</p><p class="info-patient"><strong>Téléphone :</strong> ${echapperHTML(dossier.telephone || 'N/R')}</p><p class="info-patient"><strong>Date d'ouverture :</strong> ${echapperHTML(dossier.dateHeure)}</p><p><strong>Total :</strong> ${formatGourdes(dossier.totalGlobal)} Gdes (${formatDH(dossier.totalGlobal)} DH)</p><h3>Fiches :</h3>${dossier.fiches?.map(f => `<div style="border:1px solid #ddd;margin:10px 0;padding:10px;"><p><strong>Fiche N°${f.numeroFiche}</strong> - Total : ${formatGourdes(f.totalGlobal)} Gdes</p><table><thead><tr><th>Catégorie</th><th>Montant</th></tr></thead><tbody>${Object.entries(f.breakdown || {}).map(([key, val]) => { if (val === 0) return ''; const cat = CATEGORIES_LISTE.find(c => c.key === key); return `<tr><td>${echapperHTML(cat ? cat.label : key)}</td><td>${formatGourdes(val)}</td></tr>`; }).join('')}</tbody></table><p class="meta-fiche">Mode de paiement : ${echapperHTML((f.modePaiement || 'cash').toUpperCase())} &nbsp;|&nbsp; Encaissé par : ${echapperHTML(f.creePar || 'inconnu')} &nbsp;|&nbsp; ${f.dateCreation ? new Date(f.dateCreation).toLocaleString('fr-FR') : ''}</p></div>`).join('')}<p class="total">Total général : ${formatGourdes(dossier.totalGlobal)} Gdes (${formatDH(dossier.totalGlobal)} DH)</p></body></html>`;
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) { showToast("Impression bloquée par le navigateur. Réessaie en cliquant sur Imprimer — si ça ne marche toujours pas, demande à quelqu'un de vérifier les réglages.", "error"); return; }
    win.document.write(contenu); win.document.close(); win.focus(); setTimeout(() => win.print(), 500);
  };

  const peutSupprimer = userRole === 'direction' || userRole === 'administrateur';
  const peutModifier = userRole === 'direction' || userRole === 'administrateur' || userRole === 'comptable';
  const peutExporter = userRole === 'auditeur' || userRole === 'comptable' || userRole === 'direction' || userRole === 'administrateur';
  const peutRouvrir = userRole === 'comptable' || userRole === 'direction' || userRole === 'administrateur';
  const rouvrirDossierSuspendu = (dossier) => { if (!confirm(`Rouvrir le dossier de ${dossier.nomPatient} ?${dossier.noteSuspension ? `\n\n📝 Note laissée à la suspension :\n${dossier.noteSuspension}` : ''}`)) return; onChargerPourModif(dossier); showToast(`Dossier de ${dossier.nomPatient} rouvert`, "success"); };

  const validerFichesProblematiques = async (dossier) => {
    const fichesConcernees = (dossier.fiches || []).filter(f => f.probleme);
    if (fichesConcernees.length === 0) return;
    const fichesNettoyees = (dossier.fiches || []).map(f => f.probleme ? { ...f, probleme: false, noteProbleme: '' } : f);
    setVerifications(prev => prev.map(v => v.id === dossier.id ? { ...v, fiches: fichesNettoyees } : v));
    try {
      await chf.updateEpisode(dossier.id, toEpisodeApi({ fiches: fichesNettoyees }));
      showToast(`Marquage retiré pour ${dossier.nomPatient}`, "success");
    } catch (error) {
      if (error.isOfflineQueue) showToast("📴 Changement enregistré hors ligne", "info");
      else showToast("Erreur: " + error.message, "error");
    }
  };

  // Marquage manuel "dossier prêt" dans la vue Lot — juste une case à cocher pour le suivi visuel,
  // n'affecte rien d'autre (facturation, statut du dossier...).
  const toggleDossierComplet = async (dossier) => {
    const nouveauStatut = !dossier.dossierComplet;
    setVerifications(prev => prev.map(v => v.id === dossier.id ? { ...v, dossierComplet: nouveauStatut } : v));
    try {
      await chf.updateEpisode(dossier.id, toEpisodeApi({ dossierComplet: nouveauStatut }));
      showToast(nouveauStatut ? `✅ Dossier de ${dossier.nomPatient} marqué complet` : `Dossier de ${dossier.nomPatient} démarqué`, "success");
    } catch (error) {
      if (error.isOfflineQueue) showToast("📴 Changement enregistré hors ligne", "info");
      else showToast("Erreur: " + error.message, "error");
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="bg-white p-3 rounded-xl border shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Type</label><select value={filtreType} onChange={e => setFiltreType(e.target.value)} className="border rounded-lg p-1.5 bg-white outline-none"><option value="">Tous</option><option value="ONG">🏥 Partenaire</option><option value="PRIVE">💳 Privé</option></select></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Partenaire</label><select value={filtreOng} onChange={e => setFiltreOng(e.target.value)} className="border rounded-lg p-1.5 bg-white outline-none" disabled={filtreType === "PRIVE"}><option value="">Tous</option>{listeOng.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Nom</label><input type="text" value={rechercheNomPatient} onChange={e => setRechercheNomPatient(e.target.value)} placeholder="Nom..." className="border rounded-lg p-1.5 outline-none" /></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Date début</label><input type="date" value={filtreDateDebut} onChange={e => setFiltreDateDebut(e.target.value)} className="border rounded-lg p-1.5 bg-white outline-none" /></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Date fin</label><input type="date" value={filtreDateFin} onChange={e => setFiltreDateFin(e.target.value)} className="border rounded-lg p-1.5 bg-white outline-none" /></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Catégorie</label><select value={filtreCategorie} onChange={e => setFiltreCategorie(e.target.value)} className="border rounded-lg p-1.5 bg-white outline-none"><option value="">Toutes</option>{CATEGORIES_LISTE.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Statut</label><select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)} className="border rounded-lg p-1.5 bg-white outline-none"><option value="">Tous</option><option value="actif">Actif</option><option value="suspendu">Suspendu</option><option value="reporte">Reporté</option><option value="archived">Archivé</option></select></div>
      </div>
      <div className="flex justify-end"><button onClick={()=>{setFiltreType("");setFiltreOng("");setRechercheNomPatient("");setFiltreDateDebut("");setFiltreDateFin("");setFiltreCategorie("");setFiltreStatut("");}} className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs font-bold">Réinitialiser</button></div>

      <div className="flex gap-2 border-b">
        <button onClick={() => setSousOngletArchives("dossiers")} className={`px-4 py-2 text-xs font-bold rounded-t-lg ${sousOngletArchives === "dossiers" ? "bg-[#1E2A24] text-white" : "bg-gray-100 text-gray-500"}`}>📁 Dossiers</button>
        {peutExporter && <button onClick={() => setSousOngletArchives("lots")} className={`px-4 py-2 text-xs font-bold rounded-t-lg ${sousOngletArchives === "lots" ? "bg-[#1E2A24] text-white" : "bg-gray-100 text-gray-500"}`}>📦 Lots & Facturation</button>}
      </div>

      {sousOngletArchives === "lots" && peutExporter && (
        <div className="bg-white p-4 rounded-xl border border-purple-300 shadow-sm space-y-3">
          <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Partenaire</label>
            <select value={lotOngSelectionne} onChange={e => { setLotOngSelectionne(e.target.value); setLotFocusedNumero(null); }} className="border rounded-lg p-1.5 text-xs bg-white font-bold outline-none max-w-xs"><option value="">-- Sélectionner --</option>{listeOng.map(o => <option key={o} value={o}>{o}</option>)}</select>
          </div>

          {lotOngSelectionne && !lotFocused && (
            <>
              {dossiersOrphelinsVerrouilles.length > 0 && (
                <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-300 rounded-lg p-3">
                  <span className="text-amber-800 font-bold">⚠️ {dossiersOrphelinsVerrouilles.length} dossier(s) déjà envoyés à {lotOngSelectionne} avant la mise en place des lots — {formatGourdes(dossiersOrphelinsVerrouilles.reduce((s,v)=>s+(v.totalGlobal||0),0))} Gdes</span>
                  <button onClick={() => rattacherOrphelinsAUnLot(lotOngSelectionne)} className="bg-amber-600 text-white font-bold px-2 py-1.5 rounded text-[10px] whitespace-nowrap">Rattacher au prochain lot</button>
                </div>
              )}
              <div className="flex flex-wrap gap-4 items-center bg-gray-50 p-3 rounded-lg border border-dashed">
                <span className="font-bold text-gray-700">🆕 {dossiersEnAttenteDeLot.length} dossier(s) en attente — {formatGourdes(dossiersEnAttenteDeLot.reduce((s,v)=>s+(v.totalGlobal||0),0))} Gdes</span>
                <label className="flex items-center gap-1 font-bold text-purple-900 cursor-pointer"><input type="checkbox" checked={appliqueRabais10} onChange={e=>setAppliqueRabais10(e.target.checked)} className="rounded" /> Rabais 10%</label>
                <div className="flex items-center gap-1"><span className="font-semibold text-gray-500">Dons:</span><input type="number" min="0" value={montantDonIntrants} onChange={e=>setMontantDonIntrants(e.target.value)} placeholder="0" className="border rounded p-1 w-24 font-mono font-bold text-right text-red-700 outline-none" /></div>
                <button onClick={() => genererProchainLot(lotOngSelectionne)} className="bg-purple-700 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 shadow disabled:opacity-30"><Download size={13}/> Générer le prochain lot</button>
              </div>

              <h3 className="font-black text-gray-700 text-xs uppercase border-b pb-1">Lots déjà envoyés</h3>
              {lotsDuPartenaire.length === 0 && <p className="text-gray-400 text-center py-3">Aucun lot envoyé pour ce partenaire encore.</p>}
              <div className="divide-y">
                {lotsDuPartenaire.map(lot => (
                  <div key={lot.numero} className="flex justify-between items-center py-2 text-xs">
                    <span className="font-bold text-gray-700">Lot {lot.numero} — {lot.dossiers.length} dossier(s) — {formatGourdes(lot.total)} Gdes</span>
                    <div className="flex gap-2">
                      <button onClick={() => setLotFocusedNumero(lot.numero)} className="text-blue-600 font-bold underline">Voir</button>
                      <button onClick={() => reimprimerLot(lotOngSelectionne, lot.numero)} className="text-purple-700 font-bold underline">🔄 Réimprimer</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {lotFocused && (
            <div className="space-y-2">
              <div className="flex justify-between items-center border-b pb-1">
                <h3 className="font-black text-gray-700 text-xs uppercase">📦 Lot {lotFocused.numero} — {lotOngSelectionne} — {lotFocused.dossiers.length} dossier{lotFocused.dossiers.length > 1 ? 's' : ''} — {formatGourdes(lotFocused.total)} Gdes</h3>
                <div className="flex gap-2">
                  <button onClick={() => reimprimerLot(lotOngSelectionne, lotFocused.numero)} className="bg-purple-700 text-white font-bold px-2 py-1 rounded text-[10px] flex items-center gap-1"><Download size={12}/> Réimprimer ce lot</button>
                  <button onClick={() => imprimerFormulaireCHFPourLot(lotFocused.dossiers)} className="bg-indigo-700 text-white font-bold px-2 py-1 rounded text-[10px] flex items-center gap-1" title="Imprime le formulaire papier CHF de chaque dossier de ce lot, un par page"><Printer size={12}/> Formulaires CHF du lot</button>
                  <button onClick={() => setLotFocusedNumero(null)}><X size={14}/></button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-lg p-2 text-xs">
                <span className="font-bold text-indigo-800">🔎 À vérifier avant soumission :</span>
                <span className="font-mono font-bold text-indigo-900">Césarienne : {compteursLotFocused.cesarienne}</span>
                <span className="font-mono font-bold text-indigo-900">Accouchement : {compteursLotFocused.accouchement}</span>
                <span className="font-mono font-bold text-indigo-900">Chirurgie : {compteursLotFocused.chirurgie}</span>
              </div>
              <div className="flex flex-wrap items-center gap-4 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs">
                <span className="font-bold text-amber-800">💡 Oublié à la génération ? Coche/renseigne puis réimprime ce lot pour l'appliquer :</span>
                <label className="flex items-center gap-1 font-bold text-purple-900 cursor-pointer"><input type="checkbox" checked={appliqueRabais10} onChange={e=>setAppliqueRabais10(e.target.checked)} className="rounded" /> Rabais 10%</label>
                <div className="flex items-center gap-1"><span className="font-semibold text-gray-500">Dons:</span><input type="number" min="0" value={montantDonIntrants} onChange={e=>setMontantDonIntrants(e.target.value)} placeholder="0" className="border rounded p-1 w-24 font-mono font-bold text-right text-red-700 outline-none" /></div>
              </div>
              {dossiersEnAttenteDeLot.length > 0 && (
                <div className="flex items-center gap-2 bg-gray-50 border border-dashed rounded-lg p-2">
                  <select value={dossierAAjouterAuLot} onChange={e => setDossierAAjouterAuLot(e.target.value)} className="border rounded p-1.5 text-xs bg-white flex-1 outline-none"><option value="">-- Ajouter un dossier libre à ce lot --</option>{dossiersEnAttenteDeLot.map(v => <option key={v.id} value={v.id}>{v.nomPatient} — {formatGourdes(v.totalGlobal||0)} Gdes</option>)}</select>
                  <button onClick={() => { if (dossierAAjouterAuLot) { ajouterDossierAuLot(dossierAAjouterAuLot, lotFocused.numero, lotOngSelectionne); setDossierAAjouterAuLot(""); } }} disabled={!dossierAAjouterAuLot} className="bg-emerald-700 text-white font-bold px-2 py-1.5 rounded text-[10px] disabled:opacity-30 whitespace-nowrap">➕ Ajouter</button>
                </div>
              )}
              <div className="divide-y max-h-[640px] overflow-y-auto">
                {lotFocused.dossiers.map(v => (
                  <div key={v.id} className="flex justify-between items-start py-2 text-xs font-mono gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="inline-block w-20 mr-2 text-gray-400 font-bold" title="N° Dossier">N°{v.numDossier || '—'}</span>
                      <span className={`inline-block w-16 mr-3 ${v.dateEntreePourTri && v.dateEntreePourTri !== '9999-12-31' ? 'text-gray-500' : 'text-red-500'}`}>{v.dateEntreePourTri && v.dateEntreePourTri !== '9999-12-31' ? v.dateEntreePourTri.split('-').reverse().join('/') : 'sans exeat'}</span>
                      {v.nomPatient}{' '}
                      <button onClick={() => toggleDossierComplet(v)} title={v.dossierComplet ? "Dossier marqué complet — cliquer pour annuler" : "Marquer ce dossier comme complet"} className={`inline-flex items-center justify-center w-4 h-4 rounded-full border align-middle mr-1 ${v.dossierComplet ? 'bg-emerald-500 border-emerald-600 text-white' : 'bg-white border-gray-300 text-gray-300 hover:border-emerald-400 hover:text-emerald-400'}`}>
                        <Check size={10}/>
                      </button>
                      {v.estBebeSansMere && <span title="Bébé sans dossier de mère dans ce lot — vérifie s'il faut ouvrir une fiche d'urgence pour ce bébé" className="bg-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded mr-1">🚨 Sans mère</span>}
                      {v.sansExeat && <span title="Aucun séjour (exeat) sur ce dossier — vérifie s'il a été oublié" className="bg-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded mr-1">🚨 Sans exeat</span>}
                      {v.orthographeIncoherente && <span title="Le nom de la mère tapé dans ce dossier bébé ne correspond pas exactement à l'orthographe du dossier de la mère (accents, espaces...) — harmonise les deux avant l'envoi du lot" className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded mr-1">✏️ Orthographe mère/bébé</span>}
                      {v.cesarienneSansSono && <span title="Césarienne ou accouchement facturé, mais aucune sonographie sur ce dossier — vérifie si elle a été oubliée" className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded mr-1">⚠️ Sono manquante</span>}
                      {v.sansAdmission && <span title="Aucune Admission / Consultation facturée sur ce dossier — vérifie si elle a été oubliée" className="bg-orange-100 text-orange-700 text-[9px] font-bold px-1.5 py-0.5 rounded mr-1">⚠️ Admission manquante</span>}
                      {v.medicamentsSortieManquants && <span title="Séjour sans au moins 2 médicaments de sortie (Ferfolat, Globugen, Tothema, Amox..., Vit C, Paracétamol) dans la fiche du séjour ou une fiche adjacente — vérifie si les médicaments de sortie ont été oubliés" className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded mr-1">💊 Médicaments sortie manquants</span>}
                      <span className="text-gray-400">— {formatGourdes(v.totalGlobal||0)} Gdes <span className="text-indigo-400">({formatDH(v.totalGlobal||0)} DH)</span></span>
                      <div className="flex flex-wrap gap-1 mt-1 pl-40">
                        {ventilationDossier(v).map(x => (
                          <span key={x.label} className="bg-indigo-50 text-indigo-700 border border-indigo-100 rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap">{x.label}: {formatDH(x.montant)} DH</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {peutModifier && <button onClick={() => { if ((v.status||'archived')==='archived' && !confirm(`Ce dossier est déjà archivé (Lot ${lotFocused.numero}). Le modifier corrigera ce dossier existant — pense à réimprimer le lot ensuite.\n\nContinuer ?`)) return; onChargerPourModif(v, { ongPartenaire: lotOngSelectionne, numeroLot: lotFocused.numero }); }} className="text-amber-700 p-1 bg-amber-50 rounded" title="Modifier / corriger"><Pencil size={13}/></button>}
                      {peutModifier && <button onClick={() => retirerDossierDuLot(v)} className="text-red-600 p-1 bg-red-50 rounded" title="Retirer du lot">➖</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {sousOngletArchives === "dossiers" && (
      <div className="bg-white p-4 rounded-xl border shadow-sm space-y-2">
        <h2 className="text-xs font-black text-gray-700 uppercase border-b pb-1">📁 Dossiers ({dossiersFiltres.length}{dossiersFiltres.length > nombreAffiche ? ` — ${nombreAffiche} affichés` : ''})</h2>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-white shadow-sm"><tr className="bg-gray-100 text-[10px] text-gray-500 uppercase border-b font-mono"><th className="p-2">Date</th><th className="p-2">N° Dossier</th><th className="p-2">Patient</th><th className="p-2">Type</th><th className="p-2">Partenaire</th><th className="p-2 text-center">Vol.</th><th className="p-2 text-right">Total</th><th className="p-2 text-center">Statut</th><th className="p-2 text-center">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-100 font-mono text-[11px]">
              {dossiersFiltres.slice(0, nombreAffiche).map(v => {
                const statut = v.status || 'archived';
                const isSuspendu = statut === 'suspendu';
                const isReporte = statut === 'reporte';
                // Filet de sécurité : si totalGlobal est absent/invalide côté données,
                // on recalcule à partir des fiches plutôt que d'afficher 0 silencieusement.
                const totalFiable = Number.isFinite(v.totalGlobal) && v.totalGlobal > 0
                  ? v.totalGlobal
                  : (v.fiches || []).reduce((s, f) => s + (Number(f.totalGlobal) || 0), 0);
                return (
                  <tr key={v.id} className={isSuspendu ? 'bg-amber-50/60 border-l-4 border-amber-400' : isReporte ? 'bg-indigo-50/60 border-l-4 border-indigo-400' : (v.contientErreurs?'bg-red-50/40 border-l-4 border-red-500':'hover:bg-gray-50/50')}>
                    <td className="p-2 text-gray-500">{v.dateHeure}</td>
                    <td className="p-2 text-gray-500">{v.numDossier || '—'}</td>
                    <td className="p-2 font-bold font-sans flex items-center gap-1">
                      {v.verrouilleFacture && <span>🔒</span>}
                      {v.noteSuspension && <span title={`📝 Note : ${v.noteSuspension}`} className="cursor-help">📝</span>}
                      {(() => { const fp = (v.fiches||[]).filter(f=>f.probleme); if (fp.length === 0) return null;
                        if (ficheAValider === v.id) return (
                          <span className="flex items-center gap-0.5">
                            <button onClick={() => { validerFichesProblematiques(v); setFicheAValider(null); }} className="bg-green-700 text-white p-0.5 rounded" title="Problème réglé — retirer le marquage"><Check size={11}/></button>
                            <button onClick={() => setFicheAValider(null)} className="border p-0.5 rounded" title="Pas encore réglé — garder le marquage"><X size={11}/></button>
                          </span>
                        );
                        return (
                          <span
                            title={`❓ ${fp.map(f=>`Fiche N°${f.numeroFiche}${f.noteProbleme?' — '+f.noteProbleme:''}`).join(' | ')}${peutModifier ? ' — clique pour valider' : ''}`}
                            className={peutModifier ? "cursor-pointer" : "cursor-help"}
                            onClick={peutModifier ? () => setFicheAValider(v.id) : undefined}
                          >❓</span>
                        );
                      })()}
                      {v.nomPatient}
                    </td>
                    <td className="p-2 text-center">{(v.typePatient||'ONG') === 'ONG' ? '🏥 Partenaire' : '💳 Privé'}</td>
                    <td className="p-2 text-purple-800 font-bold">{v.ongPartenaire}</td>
                    <td className="p-2 text-center text-gray-600">{(v.fiches||[]).length}</td>
                    <td className="p-2 text-right font-bold text-emerald-800" title={v.totalGlobal !== totalFiable ? "Recalculé à partir des fiches — la valeur stockée était absente ou à zéro" : ""}>{formatDH(totalFiable)} DH{v.totalGlobal !== totalFiable && <span className="text-amber-500"> ⚠️</span>}</td>
                    <td className="p-2 text-center">{statut === 'suspendu' ? <span className="text-amber-600 font-bold flex items-center gap-1"><Clock size={12}/> Suspendu</span> : statut === 'reporte' ? <span className="text-indigo-600 font-bold flex items-center gap-1" title={v.moisReport ? `Reporté à ${v.moisReport}` : ''}>📅 Reporté{v.moisReport ? ` (${v.moisReport})` : ''}</span> : statut === 'actif' ? <span className="text-blue-600">Actif</span> : <span className="text-gray-400">Archivé</span>}</td>
                    <td className="p-2 flex justify-center gap-1 flex-wrap">
                      <button onClick={()=>setFocusedVerif(v)} className="text-blue-600 p-1 bg-blue-50 rounded" title="Voir"><Eye size={13}/></button>
                      {peutModifier && <button onClick={()=>{
                        const statut = v.status || 'archived';
                        if (statut === 'archived' && !confirm(`Ce dossier est déjà archivé. Le modifier corrigera CE dossier existant (pas une nouvelle visite).\n\nPour une nouvelle visite de ${v.nomPatient}, utilise plutôt "Rechercher un patient existant" dans l'onglet Calcul Facture.\n\nContinuer quand même pour corriger ce dossier ?`)) return;
                        onChargerPourModif(v);
                      }} className="text-amber-700 p-1 bg-amber-50 rounded" title="Modifier / corriger"><Pencil size={13}/></button>}
                      {peutSupprimer && <button onClick={()=>onSupprimer(v.id)} disabled={v.verrouilleFacture} className="text-gray-300 hover:text-red-600 p-1 disabled:opacity-20"><Trash2 size={13}/></button>}
                      <button onClick={()=>imprimerArchive(v)} className="text-gray-600 p-1 bg-gray-50 rounded" title="Imprimer"><Printer size={13}/></button>
                      <button onClick={()=>imprimerFormulaireCHF(v)} className="text-indigo-700 p-1 bg-indigo-50 rounded" title="Imprimer le formulaire papier CHF"><Printer size={13}/></button>
                      {isSuspendu && peutRouvrir && <button onClick={()=>rouvrirDossierSuspendu(v)} className="text-emerald-600 p-1 bg-emerald-50 rounded" title="Rouvrir"><FolderOpen size={13}/></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {dossiersFiltres.length > nombreAffiche && (
          <div className="flex justify-center pt-2">
            <button onClick={()=>setNombreAffiche(n => n + 100)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-1.5 rounded-lg text-xs font-bold">
              Charger plus ({dossiersFiltres.length - nombreAffiche} restants)
            </button>
          </div>
        )}
      </div>
      )}

      {focusedVerif && (
        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-md space-y-4">
          <div className="flex justify-between items-center border-b pb-1"><h3 className="font-bold text-blue-900 text-xs uppercase">🔍 {focusedVerif.nomPatient}</h3><div className="flex gap-2"><button onClick={() => imprimerArchive(focusedVerif)} className="bg-gray-700 text-white px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"><Printer size={12}/> Imprimer dossier</button><button onClick={() => imprimerFormulaireCHF(focusedVerif)} className="bg-indigo-700 text-white px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"><Printer size={12}/> Formulaire papier CHF</button><button onClick={() => setFocusedVerif(null)}><X size={14}/></button></div></div>
          {focusedVerif.numeroLot != null && (
            <div className="flex items-center gap-2 text-xs bg-indigo-50 border border-indigo-200 rounded-lg p-2">
              <span className="text-indigo-800">📦 Ce dossier fait partie du <strong>Lot {focusedVerif.numeroLot}</strong> de {focusedVerif.ongPartenaire}. Une correction reste possible via "Modifier/corriger" — pense à réimprimer le lot ensuite pour que le partenaire reçoive la version à jour.</span>
            </div>
          )}
          {onChangerTypeOng && peutModifier && (
            !editTypeArchiveOuvert ? (
              <div className="flex items-center gap-2 text-xs bg-gray-50 border rounded-lg p-2">
                <span className="font-bold text-purple-700">{focusedVerif.ongPartenaire || 'Privé'} - {focusedVerif.typePatient === 'ONG' ? 'Partenaire' : 'Privé'}</span>
                <button onClick={()=>{ setNouveauTypeArchive(focusedVerif.typePatient||'ONG'); setNouvelOngArchive(focusedVerif.ongPartenaire||''); setEditTypeArchiveOuvert(true); }} className="text-[10px] font-bold text-blue-600 underline">✏️ Changer Privé/Partenaire</button>
              </div>
            ) : (
              <div className="flex gap-1.5 items-center bg-gray-50 border rounded-lg p-2 flex-wrap">
                <select value={nouveauTypeArchive} onChange={e=>setNouveauTypeArchive(e.target.value)} className="border rounded p-1 text-xs bg-white">
                  <option value="ONG">🏥 Partenaire</option><option value="PRIVE">💳 Privé</option>
                </select>
                {nouveauTypeArchive === "ONG" && (
                  <select value={nouvelOngArchive} onChange={e=>setNouvelOngArchive(e.target.value)} className="border rounded p-1 text-xs bg-white">
                    <option value="">-- Partenaire --</option>{listeOng.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
                <button onClick={async ()=>{ await onChangerTypeOng(focusedVerif.id, nouveauTypeArchive, nouveauTypeArchive==="ONG"?nouvelOngArchive:""); setFocusedVerif(f => f ? { ...f, typePatient: nouveauTypeArchive, ongPartenaire: nouveauTypeArchive==="ONG"?nouvelOngArchive:"" } : f); setEditTypeArchiveOuvert(false); }} className="bg-emerald-700 text-white text-[10px] font-bold px-2 py-1 rounded"><Check size={10}/></button>
                <button onClick={()=>setEditTypeArchiveOuvert(false)} className="border text-[10px] font-bold px-2 py-1 rounded"><X size={10}/></button>
              </div>
            )
          )}
          <div className="space-y-1.5"><span className="text-[10px] font-bold text-gray-400 uppercase block">1. Ventilation par fiches</span><div className="grid grid-cols-1 gap-1">{focusedVerif.fiches?.map(f => <div key={f.id} className="p-2 bg-gray-50 border rounded-lg font-mono text-[11px] flex justify-between items-center"><span>Fiche N°{f.numeroFiche}</span><div className="flex items-center gap-2"><span className="font-bold text-gray-800">{formatGourdes(f.totalGlobal)} Gdes ({formatDH(f.totalGlobal)} DH)</span><button onClick={() => imprimerFiche(f)} className="text-gray-500 hover:text-blue-600 p-1"><Printer size={14}/></button></div></div>)}</div></div>
          <div className="space-y-1.5 border-t pt-2"><span className="text-[10px] font-bold text-gray-400 uppercase block">2. Cumul analytique complet</span><div className="bg-white p-3 rounded-lg border shadow-inner font-mono text-[11px] space-y-1"><div className="grid grid-cols-3 font-bold text-gray-800 border-b pb-1.5 mb-1.5"><span>CATÉGORIE</span><span>TOTAL Gdes</span><span className="text-right text-emerald-800">💵 DH</span></div>{(() => { const cumul = {}; CATEGORIES_LISTE.forEach(c => cumul[c.key] = 0); focusedVerif.fiches?.forEach(f => { Object.keys(f.breakdown).forEach(k => { if (cumul[k] !== undefined) cumul[k] += f.breakdown[k]; }); }); return CATEGORIES_LISTE.map(cat => { const mCat = cumul[cat.key]; if (mCat === 0) return null; return <div key={cat.key} className="grid grid-cols-3 py-0.5 text-gray-600 border-b border-dashed border-gray-100"><span>• {cat.label}</span><span>{formatGourdes(mCat)} Gdes</span><span className="text-right font-bold text-gray-900">{formatDH(mCat)} DH</span></div>; }); })()}<div className="grid grid-cols-3 pt-2 font-black text-sm text-blue-950 border-t-2"><span>TOTAL SÉJOUR :</span><span>{formatGourdes(focusedVerif.totalGlobal)} Gdes</span><span className="text-right text-emerald-800">{formatDH(focusedVerif.totalGlobal)} DH</span></div></div></div>
        </div>
      )}
    </div>
  );
}

module.exports = HistoriqueVerifPanel;
