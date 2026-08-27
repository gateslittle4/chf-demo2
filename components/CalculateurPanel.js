// components/CalculateurPanel.js
const React = window.React;
const { useState, useEffect, useMemo, useRef } = React;
const { auth, db, enregistrerAudit } = require('../api/firebase');
const { chf, toPaiementApi } = require('../api/supabase');
const { CONFIG_LITS } = require('../utils/constants');
const { formatGourdes, formatDH, echapperHTML, formaterNomPropre } = require('../utils/helpers');
const { Search, Plus, X, Clock, Check } = require('../utils/icons');
const ConfirmModal = require('./ConfirmModal');
const NouveauDossierForm = require('./NouveauDossierForm');
const HebergementForm = require('./HebergementForm');
const { LOGO_CHF_BASE64 } = require('../utils/logoChf');

// Formate une plage de dates de séjour pour l'impression : "10/08/2026 → 12/08/2026", ou une seule
// date "10/08/2026" si l'entrée et la sortie sont le même jour (abrege=true tronque au jour/mois,
// pour le ticket thermique où la place manque).
const formaterPlageDates = (dateEntree, dateSortie, abrege) => {
  if (!dateEntree) return '';
  const f = (d) => { const p = d.split('-').reverse(); return abrege ? p.slice(0, 2).join('/') : p.join('/'); };
  return (dateSortie && dateSortie !== dateEntree) ? `${f(dateEntree)} → ${f(dateSortie)}` : f(dateEntree);
};
// Même chose mais en phrase complète ("du X au Y" / "le X"), pour la fiche A4
const phraseSejour = (dateEntree, dateSortie) => {
  if (!dateEntree) return '';
  const f = (d) => d.split('-').reverse().join('/');
  return (dateSortie && dateSortie !== dateEntree) ? `du ${f(dateEntree)} au ${f(dateSortie)}` : `le ${f(dateEntree)}`;
};

// Ce composant est long mais intégral. Il gère la création d'épisode, l'ajout de lignes, les paiements,
// les dépôts, les impressions, etc. Toutes les conversions vers l'API sont faites.
function CalculateurPanel({
  medicaments, actes, setActes, lignes, setLignes, dossierActif, nomPatient, selectedOng, onNouveauDossier, onAnnulerDossier, onCloturerDossier,
  fichesDossier, onSupprimerFicheDossier, onMarquerProblemeFiche,
  idFicheEnCoursDEdition,  // ID de la fiche en cours d'édition (passé par le parent)
  onEditerFiche,           // NOUVELLE PROP : fonction pour charger une fiche en édition
  numeroFicheCourante,
  dateFiche, setDateFiche,
  prescritPar, setPrescritPar,
  dateEntree1, setDateEntree1, dateSortie1, setDateSortie1,
  typeLit1, setTypeLit1, j1, totalE1, multiPeriode, setMultiPeriode, dateEntree2, setDateEntree2,
  dateSortie2, setDateSortie2, typeLit2, setTypeLit2, j2, totalE2, hasChirSpec, setHasChirSpec,
  nomChirSpec, setNomChirSpec, prixChirSpec, setPrixChirSpec, totalsParService, coutsParService, grandTotal,
  totalDossierGourdes, onEnregistrerFiche, onViderFicheActive, injecterLigne, modeSimulation,
  tarifChoisi, setTarifChoisi,
  userRole, userDisplayName, setMedicaments, medicamentsState, dateNaissance, telephone, numDossierPatient, typePatient,
  dossierId, setDossierId, patientsExistants, onChargerPatientExistant,
  paiementEffectue, setPaiementEffectue,
  showToast,
  onSuspendreDossier, onReporterDossier,
  onChangerTypeOng, onChangerNomPatient,
  listeOng
}) {
  const [inputNom, setInputNom] = useState("");
  const [inputOng, setInputOng] = useState(() => localStorage.getItem('chf-dernier-ong') || "");
  const [inputNumDossier, setInputNumDossier] = useState("");
  const [inputTypePatient, setInputTypePatient] = useState("ONG");
  const [serviceChoisi, setServiceChoisi] = useState("");
  const [inputDateNaissance, setInputDateNaissance] = useState("");
  const [inputTelephone, setInputTelephone] = useState("");
  const [categorie, setCategorie] = useState("med");
  const [detailOuvert, setDetailOuvert] = useState(false); // mobile : affiche le récapitulatif complet en plein écran au tap
  const [recherche, setRecherche] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [lettreActive, setLettreActive] = useState(null); // null = pas encore choisie -> aucune lettre affichée par défaut
  const [sousCategorieActeActive, setSousCategorieActeActive] = useState(null); // null = toutes
  const [estMobile, setEstMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  useEffect(() => {
    const onResize = () => setEstMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [selection, setSelection] = useState(null);
  const [quantite, setQuantite] = useState("1");

  // Nombre d'éléments distincts tapés dans la fiche en cours (médicaments/actes + hébergement +
  // chirurgie spéciale s'il y en a) -- PAS la somme des quantités -- pour comparer facilement au
  // nombre de lignes écrites à la main sur la fiche papier.
  const nombreElementsFiche = lignes.length + (dateEntree1 && dateSortie1 ? 1 : 0) + (multiPeriode && dateEntree2 && dateSortie2 ? 1 : 0) + (hasChirSpec && nomChirSpec ? 1 : 0);

  const [montantVerse, setMontantVerse] = useState("");
  const [modePaiement, setModePaiement] = useState("cash");
  const [ongPartenaireFiche, setOngPartenaireFiche] = useState("");
  const [pourcentageExoneration, setPourcentageExoneration] = useState(0);
  const [motifExoneration, setMotifExoneration] = useState("");
  const [autorisationExoneration, setAutorisationExoneration] = useState(false);
  const [demandeEnCoursId, setDemandeEnCoursId] = useState(null);

  const [modeDepot, setModeDepot] = useState(false);
  const [montantDepot, setMontantDepot] = useState("");
  const [depots, setDepots] = useState([]);

  const [searchPatientText, setSearchPatientText] = useState("");
  const [suggestionsPatients, setSuggestionsPatients] = useState([]);
  const [confirmModal, setConfirmModal] = useState(null);
  const [editTypeOuvert, setEditTypeOuvert] = useState(false);
  const [nouveauTypeEdit, setNouveauTypeEdit] = useState("ONG");
  const [nouvelOngEdit, setNouvelOngEdit] = useState("");
  const [editNomOuvert, setEditNomOuvert] = useState(false);
  const [nouveauNomEdit, setNouveauNomEdit] = useState("");

  // --- File d'attente de fiches à importer (digitalisation papier) ---
  const [fileImport, setFileImport] = useState(() => {
    try { return JSON.parse(localStorage.getItem('chf-file-import') || '[]'); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem('chf-file-import', JSON.stringify(fileImport)); }, [fileImport]);
  const [fileOuverte, setFileOuverte] = useState(false);
  const [collageJson, setCollageJson] = useState("");
  const [idEntreeChargee, setIdEntreeChargee] = useState(null); // entrée de la file en cours d'import, retirée après sauvegarde

  const trouverDansCatalogue = (nom, type) => {
    const source = type === 'med' ? medicaments : actes;
    const cible = (nom || '').trim().toLowerCase();
    return source.find(i => i.nom.trim().toLowerCase() === cible);
  };

  const chargerEntreeFile = (entree) => {
    const p = entree.patient || {};
    if (!dossierActif) {
      setInputNom(p.nom || "");
      setInputOng(p.ong || "");
      setInputTypePatient(p.typePatient || "ONG");
    }
    const introuvables = [];
    (entree.lignes || []).forEach(l => {
      const item = trouverDansCatalogue(l.nom, l.type);
      if (item) injecterLigne(item, l.type, l.qte || 1);
      else introuvables.push(l.nom);
    });
    if (introuvables.length > 0) showToast(`Introuvable(s) dans le catalogue : ${introuvables.join(', ')}`, "error");
    setIdEntreeChargee(entree._id);
    setFileOuverte(false);
  };

  const ajouterAuCollage = () => {
    try {
      const parsed = JSON.parse(collageJson);
      const entrees = Array.isArray(parsed) ? parsed : [parsed];
      const avecId = entrees.map(e => ({ ...e, _id: "fi-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6) }));
      setFileImport(prev => [...prev, ...avecId]);
      setCollageJson("");
      showToast(`${avecId.length} fiche(s) ajoutée(s) à la file`, "success");
    } catch (e) {
      showToast("JSON invalide : " + e.message, "error");
    }
  };
  const retirerDeLaFile = (id) => setFileImport(prev => prev.filter(e => e._id !== id));

  const refZone = useRef(null);
  const inputRechercheRef = useRef(null);

  // --- Répétition automatique des boutons +/- quand on reste appuyé (souris ou tactile) :
  // 1 clic normal = +1 comme avant ; rester appuyé > ~400ms déclenche une répétition qui
  // accélère progressivement, pour ne pas avoir à cliquer 60 fois pour une quantité de 60.
  const holdDelaiRef = useRef(null);
  const holdIntervalRef = useRef(null);
  const demarrerRepetition = (fn) => {
    fn(); // premier appui = +1 immédiat, comme un clic normal
    holdDelaiRef.current = setTimeout(() => {
      let vitesse = 180;
      const tick = () => {
        fn();
        vitesse = Math.max(35, vitesse - 15); // accélère jusqu'à un plancher, sans devenir incontrôlable
        holdIntervalRef.current = setTimeout(tick, vitesse);
      };
      tick();
    }, 400);
  };
  const arreterRepetition = () => {
    clearTimeout(holdDelaiRef.current);
    clearTimeout(holdIntervalRef.current);
  };

  const catalogueFiltre = categorie === "med" ? medicaments : actes;
  const suggestions = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return catalogueFiltre.slice(0, 5);
    return catalogueFiltre.filter(i => i.nom.toLowerCase().includes(q)).slice(0, 5);
  }, [recherche, catalogueFiltre]);

  // --- Grille cliquable pour ordinateur (souris uniquement, sans clavier) ---
  const premiereLettre = (nom) => (nom || '?').normalize('NFD').replace(/[\u0300-\u036f]/g, '')[0].toUpperCase();
  const lettresDisponibles = useMemo(() => {
    return [...new Set(medicaments.map(m => premiereLettre(m.nom)))].sort();
  }, [medicaments]);
  const categoriesActesDisponibles = useMemo(() => {
    const { CATEGORIES_LISTE } = require('../utils/constants');
    const clesUtilisees = new Set(actes.map(a => a.sub || 'chirurgie'));
    return CATEGORIES_LISTE.filter(c => c.key !== 'hospit' && clesUtilisees.has(c.key));
  }, [actes]);
  const catalogueGrille = useMemo(() => {
    if (categorie === "med") {
      const lettre = lettreActive || lettresDisponibles[0];
      return medicaments.filter(m => premiereLettre(m.nom) === lettre).sort((a, b) => a.nom.localeCompare(b.nom));
    }
    const filtres = sousCategorieActeActive ? actes.filter(a => (a.sub || 'chirurgie') === sousCategorieActeActive) : actes;
    return [...filtres].sort((a, b) => (a.ordre ?? 9999) - (b.ordre ?? 9999) || a.nom.localeCompare(b.nom));
  }, [categorie, medicaments, actes, lettreActive, lettresDisponibles, sousCategorieActeActive]);

  useEffect(() => {
    if (!dossierId) { setDepots([]); return; }
    const loadDepots = async () => {
      try {
        const allPaiements = await chf.getPaiements();
        const { fromPaiementApi } = require('../api/supabase');
        const filtered = allPaiements.map(p => fromPaiementApi(p)).filter(p => p.episodeId === dossierId && p.mode === 'depot');
        setDepots(filtered);
      } catch (e) { console.warn("Erreur chargement dépôts:", e); }
    };
    loadDepots();
    const interval = setInterval(() => { if (!document.hidden) loadDepots(); }, 45000);
    return () => clearInterval(interval);
  }, [dossierId]);

  const totalDepots = useMemo(() => depots.reduce((s, d) => s + (d.montant || 0), 0), [depots]);

  useEffect(() => {
    const close = (e) => { if (refZone.current && !refZone.current.contains(e.target)) setOuvert(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const totalChirSpec = useMemo(() => { const p = parseFloat(prixChirSpec); return isNaN(p) ? 0 : p; }, [hasChirSpec, prixChirSpec]);
  const montantExonere = useMemo(() => {
    if (!autorisationExoneration || modePaiement !== "exoneration") return 0;
    const pct = parseFloat(pourcentageExoneration) || 0;
    return (grandTotal * pct) / 100;
  }, [autorisationExoneration, pourcentageExoneration, grandTotal, modePaiement]);

  const totalApresExoneration = grandTotal - montantExonere;
  const montantRestantApresDepots = Math.max(0, totalApresExoneration - totalDepots);
  const monnaieARendre = useMemo(() => {
    const vers = parseFloat(montantVerse) || 0;
    return Math.max(0, vers - montantRestantApresDepots);
  }, [montantVerse, montantRestantApresDepots]);

  const soldeRestantDepot = totalDossierGourdes + grandTotal - totalDepots - (parseFloat(montantDepot) || 0);

  const ajouterAvecQuantite = (item, q) => {
    if (!item || isNaN(q) || q <= 0) return;
    if (categorie === "med") {
      const stockActuel = item.quantite || 0;
      if (stockActuel < q) { showToast(`Stock insuffisant pour "${item.nom}". Restant : ${stockActuel}`, "error"); return; }
    }
    injecterLigne(item, categorie, q);
    if (categorie === "med" && item.quantite !== undefined) {
      const updated = medicaments.map(m => {
        if (m.id === item.id) { return { ...m, quantite: Math.max(0, (m.quantite || 0) - q), nbUtilisations: (m.nbUtilisations || 0) + 1 }; }
        return m;
      });
      setMedicaments(updated);
      const { LOG_MEDS_KEY } = require('../api/firebase');
      localStorage.setItem(LOG_MEDS_KEY, JSON.stringify(updated));
      chf.updateCatalog('medicaments', updated).catch(e => console.warn(e));
    } else if (categorie === "acte" && setActes) {
      // Les actes n'ont pas de stock à décrémenter, mais on suit quand même la fréquence d'usage
      // pour faire remonter les plus utilisés en haut de leur lettre/catégorie (moins de clics).
      const updated = actes.map(a => a.id === item.id ? { ...a, nbUtilisations: (a.nbUtilisations || 0) + 1 } : a);
      setActes(updated);
      const { LOG_ACTES_KEY } = require('../api/firebase');
      localStorage.setItem(LOG_ACTES_KEY, JSON.stringify(updated));
      chf.updateCatalog('actes', updated).catch(e => console.warn(e));
    }
    setRecherche(""); setSelection(null); setQuantite("1");
    if (inputRechercheRef.current) inputRechercheRef.current.focus();
    setPaiementEffectue(false);
  };
  const actionAjouterSoin = () => { const q = parseFloat(quantite); ajouterAvecQuantite(selection, q); };

  const demanderExoneration = async () => {
    if (modePaiement !== "exoneration") { showToast("Sélectionnez le mode Exonération.", "error"); return; }
    if (!nomPatient) { showToast("Patient requis.", "error"); return; }
    const pct = parseFloat(pourcentageExoneration) || 0;
    if (pct <= 0) { showToast("Le pourcentage doit être supérieur à 0.", "error"); return; }
    const montantEx = (grandTotal * pct) / 100;
    if (montantEx <= 0) { showToast("Le montant exonéré doit être > 0.", "error"); return; }
    try {
      const docRef = await db.collection('demandes_exoneration').add({
        dossierId: dossierId || null,
        patientNom: nomPatient,
        montantTotal: grandTotal,
        pourcentageDemande: pct,
        montantExonere: montantEx,
        demandeur: userDisplayName || auth.currentUser?.displayName || 'inconnu',
        demandeurUid: auth.currentUser?.uid || '',
        statut: 'en_attente',
        dateDemande: new Date().toISOString()
      });
      setDemandeEnCoursId(docRef.id);
      showToast("📨 Demande d'exonération envoyée.", "success");
    } catch (error) { showToast("Erreur: " + error.message, "error"); }
  };

  useEffect(() => {
    if (!demandeEnCoursId) return;
    const unsubscribe = db.collection('demandes_exoneration').doc(demandeEnCoursId).onSnapshot(doc => {
      const data = doc.data();
      if (!data) return;
      if (data.statut === 'accepte') { showToast('✅ Exonération acceptée', 'success'); setAutorisationExoneration(true); setDemandeEnCoursId(null); }
      else if (data.statut === 'refuse') { showToast('❌ Exonération refusée', 'error'); setDemandeEnCoursId(null); }
    });
    return () => unsubscribe();
  }, [demandeEnCoursId]);

  const enregistrerDepot = async () => {
    if (!dossierId) { showToast("Aucun dossier actif.", "error"); return; }
    const montant = parseFloat(montantDepot);
    if (isNaN(montant) || montant <= 0) { showToast("Montant invalide.", "error"); return; }
    try {
      await chf.createPaiement(toPaiementApi({
        episodeId: dossierId,
        patientNom: nomPatient,
        montant: montant,
        mode: 'depot',
        ongPartenaire: selectedOng || '',
        date: new Date().toISOString(),
        encaissePar: auth.currentUser?.displayName || 'inconnu'
      }));
      showToast("✅ Dépôt enregistré !", "success");
    } catch (error) {
      if (!error.isOfflineQueue) { showToast("Erreur: " + error.message, "error"); return; }
      showToast("📴 Dépôt enregistré hors ligne — sera synchronisé au retour d'internet", "info");
    }
    setMontantDepot(""); setModeDepot(false); setPaiementEffectue(true);
  };

  useEffect(() => {
    if (!searchPatientText.trim()) { setSuggestionsPatients([]); return; }
    const q = searchPatientText.trim().toLowerCase();
    const results = (patientsExistants || []).filter(p =>
      p.nomPatient.toLowerCase().includes(q) || (p.numDossier && p.numDossier.toLowerCase().includes(q))
    );
    setSuggestionsPatients(results.slice(0, 8));
  }, [searchPatientText, patientsExistants]);

  const choisirPatientExistant = (patient) => {
    const statutPatient = patient.status || 'archived';
    if (statutPatient === 'archived') {
      setInputNom(patient.nomPatient || "");
      setInputTypePatient(patient.typePatient || "ONG");
      setInputOng(patient.ongPartenaire || "");
      setInputNumDossier(patient.numDossier || "");
      setInputDateNaissance(patient.dateNaissance || "");
      setInputTelephone(patient.telephone || "");
      showToast(`Infos de ${patient.nomPatient} pré-remplies pour une nouvelle visite`, "info");
    } else {
      onChargerPatientExistant(patient);
    }
    setSearchPatientText(""); setSuggestionsPatients([]);
  };

  // --- Corps réutilisable d'un ticket (une fiche) — utilisé pour la réimpression seule ET l'impression groupée ---
  const genererCorpsTicket = (fiche) => {
    const lignesDetaillees = fiche.rawState?.lignesCalcul || [];
    // Séjour(s) et chirurgie spéciale : pas dans lignesCalcul, il faut les reconstituer depuis
    // fiche.exeat / fiche.rawState (sinon absents du reçu alors qu'ils sont inclus dans le total).
    const ligneHebergement = fiche.exeat ? `<tr><td>Séjour : ${echapperHTML(CONFIG_LITS[fiche.exeat.typeLit]?.nom || fiche.exeat.typeLit)} (${formaterPlageDates(fiche.exeat.dateEntree, fiche.exeat.dateSortie, true)})</td><td class="qte">${fiche.exeat.nbJours}j</td><td class="prix">${formatGourdes(fiche.exeat.prixParJour)}</td><td class="sous-total">${formatGourdes(fiche.exeat.totalHebergement)}</td></tr>` : '';
    const ligneHebergement2 = fiche.exeat?.multiPeriode && fiche.exeat?.dateEntree2 ? `<tr><td>Séjour P2 : ${echapperHTML(CONFIG_LITS[fiche.exeat.typeLit2]?.nom || fiche.exeat.typeLit2)} (${formaterPlageDates(fiche.exeat.dateEntree2, fiche.exeat.dateSortie2, true)})</td><td class="qte">${fiche.exeat.nbJours2}j</td><td class="prix">${formatGourdes(CONFIG_LITS[fiche.exeat.typeLit2]?.prix || 0)}</td><td class="sous-total">${formatGourdes(fiche.exeat.totalHebergement2)}</td></tr>` : '';
    const prixChirSpecFiche = fiche.rawState?.hasChirSpec ? (parseFloat(fiche.rawState.prixChirSpec) || 0) : 0;
    const ligneChir = fiche.rawState?.hasChirSpec && fiche.rawState?.nomChirSpec ? `<tr><td>Chirurgie: ${echapperHTML(fiche.rawState.nomChirSpec)}</td><td class="qte">1</td><td class="prix">${formatGourdes(prixChirSpecFiche)}</td><td class="sous-total">${formatGourdes(prixChirSpecFiche)}</td></tr>` : '';
    return `<div class="entete"><img class="logo-entete" src="${LOGO_CHF_BASE64}" alt="Logo CHF"/><h1>CHF</h1><p>Centre Hospitalier de Fontaine</p><p>#13, Fontaine Duvivier, Cité Soleil</p><p>Tél: (509) 3647-0563 / 2226-8900</p></div><div style="font-weight:bold;font-size:11px;margin-bottom:6px;">Patient: ${echapperHTML(formaterNomPropre(nomPatient))}</div><div style="font-size:10px;margin-bottom:2px;">${typePatient === 'ONG' ? `Partenaire : ${echapperHTML(selectedOng || 'N/R')}` : 'Privé'}</div><div style="font-size:10px;margin-bottom:2px;">📞 ${echapperHTML(telephone || 'N/R')}</div><table><thead><tr><th>Désignation</th><th class="qte">Qté</th><th class="prix">Prix</th><th class="sous-total">Total</th></tr></thead><tbody>${ligneHebergement}${ligneHebergement2}${ligneChir}${lignesDetaillees.map(l => `<tr><td>${echapperHTML(l.nom)}</td><td class="qte">${l.qte}</td><td class="prix">${formatGourdes(l.prix)}</td><td class="sous-total">${formatGourdes(l.qte*l.prix)}</td></tr>`).join('')}</tbody></table><div class="total">TOTAL FICHE : ${formatGourdes(fiche.totalGlobal)} Gdes (${formatDH(fiche.totalGlobal)} DH)</div><p style="font-size:10px;margin-top:4px;">${fiche.prescritPar ? `Prescrit par : ${echapperHTML(fiche.prescritPar)}` : ''}</p><div class="footer">Merci de votre visite ! Bonne guérison !<br/>CHF-${new Date().getFullYear()}</div>`;
  };
  const STYLE_TICKET = `@page{size:100mm 297mm;margin:3mm 5mm;}body{font-family:'Courier New',monospace;font-size:14px;color:#000;width:90mm;margin:0 auto;}.entete{position:relative;text-align:center;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:8px;}.logo-entete{position:absolute;top:0;right:0;width:30px;height:30px;object-fit:contain;}.entete h1{font-size:23px;margin:4px 0;}.entete p{margin:2px 0;font-size:13px;}table{width:100%;border-collapse:collapse;margin:6px 0;font-size:13px;}th,td{padding:4px 6px;text-align:left;border-bottom:1px dotted #ccc;}th{border-bottom:2px solid #000;font-size:12px;text-transform:uppercase;}.qte{text-align:center;}.prix,.sous-total{text-align:right;}.total{font-weight:bold;font-size:19px;text-align:right;border-top:3px solid #000;padding-top:6px;margin-top:6px;}.footer{margin-top:12px;font-size:11px;text-align:center;border-top:1px dashed #ccc;padding-top:6px;color:#555;}.page-fiche{page-break-after:always;}`;

  // Réimpression d'une fiche
  const reimprimerFicheValidee = (fiche) => {
    const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fiche N°${fiche.numeroFiche}</title><style>${STYLE_TICKET}</style></head><body>${genererCorpsTicket(fiche)}</body></html>`;
    const win = window.open('', '_blank', 'width=500,height=700');
    if (!win) { showToast("Impression bloquée par le navigateur. Réessaie en cliquant sur Imprimer — si ça ne marche toujours pas, demande à quelqu'un de vérifier les réglages.", "error"); return; }
    win.document.write(contenu); win.document.close(); win.focus(); setTimeout(() => win.print(), 400);
  };

  // --- NOUVEAU : Imprimer toutes les fiches du dossier d'affilée, en un seul clic ---
  const imprimerToutesLesFichesDuDossier = () => {
    if (fichesDossier.length === 0) { showToast("Aucune fiche à imprimer.", "error"); return; }
    const corps = fichesDossier.map(f => `<div class="page-fiche">${genererCorpsTicket(f)}</div>`).join('');
    const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${fichesDossier.length} fiches — ${echapperHTML(formaterNomPropre(nomPatient))}</title><style>${STYLE_TICKET}</style></head><body>${corps}</body></html>`;
    const win = window.open('', '_blank', 'width=500,height=700');
    if (!win) { showToast("Impression bloquée par le navigateur. Réessaie en cliquant sur Imprimer — si ça ne marche toujours pas, demande à quelqu'un de vérifier les réglages.", "error"); return; }
    win.document.write(contenu); win.document.close(); win.focus(); setTimeout(() => win.print(), 400);
  };

  // Impression du ticket (inchangée)
  const imprimerTicket = (forcer = false) => {
    if (!forcer && !paiementEffectue) { showToast("Enregistre d'abord la fiche avant d'imprimer.", "error"); return; }
    const data = {
      nomPatient: formaterNomPropre(nomPatient) || "Patient non renseigné",
      selectedOng: selectedOng || "—",
      numDossier: numDossierPatient || 'N/R',
      lignes: lignes || [],
      grandTotal: grandTotal || 0,
      dateEntree1, dateSortie1, totalE1, totalE2, j1, j2, typeLit1, typeLit2,
      multiPeriode, dateEntree2, dateSortie2,
      hasChirSpec, nomChirSpec, totalChirSpec,
      telephone: telephone || 'N/R',
      dateNaissance: dateNaissance || 'N/R',
      typePatient: typePatient || 'ONG',
      creePar: auth.currentUser?.displayName || 'inconnu',
      prescritPar: prescritPar.trim() || ''
    };
    const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket CHF</title><style>@page{size:100mm 297mm;margin:3mm 5mm;}body{font-family:'Courier New',monospace;font-size:17px;color:#000;background:white;margin:0;padding:0;width:90mm;margin:0 auto;}.entete{position:relative;text-align:center;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:8px;}.logo-entete{position:absolute;top:0;right:0;width:34px;height:34px;object-fit:contain;}.entete h1{font-size:27px;margin:4px 0;}.entete p{margin:2px 0;font-size:16px;}.info{display:flex;justify-content:space-between;font-weight:bold;font-size:16px;margin-bottom:6px;}.info-patient{font-size:15px;margin-bottom:4px;}table{width:100%;border-collapse:collapse;margin:6px 0;font-size:16px;}th,td{padding:5px 6px;text-align:left;border-bottom:1px dotted #ccc;}th{border-bottom:2px solid #000;font-size:14px;text-transform:uppercase;}.total{font-weight:bold;font-size:23px;text-align:right;border-top:3px solid #000;padding-top:6px;margin-top:6px;}.footer{margin-top:12px;font-size:13px;text-align:center;border-top:1px dashed #ccc;padding-top:6px;color:#555;}.qte{text-align:center;}.prix,.sous-total{text-align:right;}.exoneration{color:red;font-weight:bold;font-size:19px;}.monnaie{font-size:19px;color:#006600;}.solde{color:#cc0000;font-weight:bold;}.depot-info{font-size:17px;color:#555;}</style></head><body><div class="entete"><img class="logo-entete" src="${LOGO_CHF_BASE64}" alt="Logo CHF"/><h1>CHF</h1><p>Centre Hospitalier de Fontaine</p><p>#13, Fontaine Duvivier, Cité Soleil</p><p>Tél: (509) 3647-0563 / 2226-8900</p></div><div class="info"><span>Patient: ${echapperHTML(data.nomPatient)}</span><span>${data.typePatient === 'ONG' ? `Partenaire: ${echapperHTML(data.selectedOng || 'N/R')}` : 'Privé'}</span></div><div class="info info-patient"><span>📞 ${echapperHTML(data.telephone)}</span><span>📁 ${echapperHTML(data.numDossier)}</span></div><div class="info info-patient" style="font-weight:bold;">Date : ${dateFiche.split('-').reverse().join('/')}</div><div class="info info-patient"><span>${data.prescritPar ? `Prescrit par: ${echapperHTML(data.prescritPar)}` : ''}</span></div>${data.dateEntree1 && data.dateSortie1 ? `<p style="font-size:10px; margin:4px 0;"><strong>Séjour:</strong> ${formaterPlageDates(data.dateEntree1, data.dateSortie1, true)}</p>` : ''}<table><thead><tr><th>Désignation</th><th class="qte">Qté</th><th class="prix">Prix</th><th class="sous-total">Total</th></tr></thead><tbody>${data.dateEntree1 && data.dateSortie1 ? `<tr><td>Hébergement</td><td class="qte">${data.j1}j</td><td class="prix">${formatGourdes(CONFIG_LITS[data.typeLit1].prix)}</td><td class="sous-total">${formatGourdes(data.totalE1)}</td></tr>` : ''}${data.multiPeriode && data.dateEntree2 && data.dateSortie2 ? `<tr><td>Hébergement P2</td><td class="qte">${data.j2}j</td><td class="prix">${formatGourdes(CONFIG_LITS[data.typeLit2].prix)}</td><td class="sous-total">${formatGourdes(data.totalE2)}</td></tr>` : ''}${data.hasChirSpec && data.nomChirSpec ? `<tr><td>Chirurgie: ${echapperHTML(data.nomChirSpec)}</td><td class="qte">1</td><td class="prix">${formatGourdes(data.totalChirSpec)}</td><td class="sous-total">${formatGourdes(data.totalChirSpec)}</td></tr>` : ''}${data.lignes.map(l => `<tr><td>${echapperHTML(l.nom)}</td><td class="qte">${l.qte}</td><td class="prix">${formatGourdes(l.prix)}</td><td class="sous-total">${formatGourdes(l.qte * l.prix)}</td></tr>`).join('')}</tbody></table><div class="total">TOTAL: ${formatGourdes(data.grandTotal)} Gdes<br/>${formatDH(data.grandTotal)} DH</div><div class="footer">Merci de votre visite ! Bonne guérison !<br/>CHF-${new Date().getFullYear()}</div></body></html>`;
    const win = window.open('', '_blank', 'width=500,height=700');
    if (!win) { showToast("Impression bloquée par le navigateur. Réessaie en cliquant sur Imprimer — si ça ne marche toujours pas, demande à quelqu'un de vérifier les réglages.", "error"); return; }
    win.document.write(contenu); win.document.close(); win.focus(); setTimeout(() => win.print(), 500);
  };

  const imprimerFicheA4 = () => {
    if (!paiementEffectue) { showToast("Enregistre d'abord la fiche.", "error"); return; }
    const numeroFicheReelle = idFicheEnCoursDEdition ? (fichesDossier.find(f => f.id === idFicheEnCoursDEdition)?.numeroFiche || numeroFicheCourante) : numeroFicheCourante;
    const data = {
      nomPatient: formaterNomPropre(nomPatient) || "Patient non renseigné",
      selectedOng: selectedOng || "—",
      numDossier: numDossierPatient || 'N/R',
      lignes: lignes || [],
      grandTotal: grandTotal || 0,
      dateEntree1, dateSortie1, totalE1, totalE2, j1, j2, typeLit1, typeLit2,
      multiPeriode, dateEntree2, dateSortie2,
      hasChirSpec, nomChirSpec, totalChirSpec,
      telephone: telephone || 'N/R',
      dateNaissance: dateNaissance || 'N/R',
      typePatient: typePatient || 'ONG',
      creePar: auth.currentUser?.displayName || 'inconnu',
      prescritPar: prescritPar.trim() || ''
    };
    const ligneHebergement = data.dateEntree1 && data.dateSortie1 ? `<tr><td>Hébergement — ${echapperHTML(CONFIG_LITS[data.typeLit1].nom)}</td><td class="qte">${data.j1} j</td><td class="prix">${formatGourdes(CONFIG_LITS[data.typeLit1].prix)}</td><td class="mtotal">${formatGourdes(data.totalE1)}</td></tr>` : '';
    const ligneHebergement2 = data.multiPeriode && data.dateEntree2 && data.dateSortie2 ? `<tr><td>Hébergement (2e période) — ${echapperHTML(CONFIG_LITS[data.typeLit2].nom)}</td><td class="qte">${data.j2} j</td><td class="prix">${formatGourdes(CONFIG_LITS[data.typeLit2].prix)}</td><td class="mtotal">${formatGourdes(data.totalE2)}</td></tr>` : '';
    const ligneChir = data.hasChirSpec && data.nomChirSpec ? `<tr><td>Chirurgie : ${echapperHTML(data.nomChirSpec)}</td><td class="qte">1</td><td class="prix">${formatGourdes(data.totalChirSpec)}</td><td class="mtotal">${formatGourdes(data.totalChirSpec)}</td></tr>` : '';
    const lignesArticles = data.lignes.map(l => `<tr><td>${echapperHTML(l.nom)}</td><td class="qte">${l.qte}</td><td class="prix">${formatGourdes(l.prix)}</td><td class="mtotal">${formatGourdes(l.qte * l.prix)}</td></tr>`).join('');
    const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fiche N°${numeroFicheReelle} - ${echapperHTML(data.nomPatient)}</title><style>
      @page{size:A4;margin:18mm;}
      body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:13px;}
      .entete{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1E2A24;padding-bottom:14px;margin-bottom:20px;}
      .entete-gauche h1{font-size:24px;margin:0 0 4px;color:#1E2A24;}
      .entete-gauche p{margin:1px 0;font-size:11px;color:#555;}
      .entete-droite{text-align:right;font-size:11px;color:#555;}
      .titre-doc{text-align:center;font-size:16px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;margin:10px 0 20px;color:#1E2A24;}
      .infos-patient{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;background:#f7f5f0;border:1px solid #ddd;border-radius:8px;padding:14px 18px;margin-bottom:20px;font-size:12px;}
      .infos-patient .label{color:#888;font-size:10px;text-transform:uppercase;font-weight:bold;}
      .infos-patient .valeur{font-weight:bold;color:#1a1a1a;}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;}
      th{background:#1E2A24;color:white;text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;}
      td{padding:8px 10px;border-bottom:1px solid #eee;font-size:12px;}
      .qte,th.qte{text-align:center;}
      .prix,.mtotal,th.prix,th.mtotal{text-align:right;}
      .total-general{display:flex;justify-content:flex-end;margin-top:10px;}
      .total-general .montant{font-size:22px;font-weight:bold;color:#1E2A24;border-top:3px solid #1E2A24;padding-top:8px;margin-top:4px;text-align:right;}
      .footer{margin-top:50px;display:flex;justify-content:space-between;align-items:flex-end;font-size:11px;color:#555;}
      .signature{border-top:1px solid #999;width:180px;text-align:center;padding-top:4px;}
      </style></head><body>
      <div class="entete">
        <div class="entete-gauche"><h1>CHF</h1><p>Centre Hospitalier de Fontaine</p><p>#13, Fontaine Duvivier, Cité Soleil</p><p>Tél: (509) 3647-0563 / 2226-8900</p></div>
        <div class="entete-droite"><img src="${LOGO_CHF_BASE64}" alt="Logo CHF" style="width:44px;height:44px;object-fit:contain;margin-bottom:4px;"/><p>Fiche N°${numeroFicheReelle}</p></div>
      </div>
      <div class="titre-doc">Fiche de facturation</div>
      <div class="infos-patient">
        <div><span class="label">Patient</span><br/><span class="valeur">${echapperHTML(data.nomPatient)}</span></div>
        <div><span class="label">${data.typePatient === 'ONG' ? 'Partenaire' : 'Type'}</span><br/><span class="valeur">${data.typePatient === 'ONG' ? echapperHTML(data.selectedOng) : 'Privé'}</span></div>
        <div><span class="label">N° Dossier</span><br/><span class="valeur">${echapperHTML(data.numDossier)}</span></div>
        <div><span class="label">Téléphone</span><br/><span class="valeur">${echapperHTML(data.telephone)}</span></div>
        <div><span class="label">Date</span><br/><span class="valeur">${dateFiche.split('-').reverse().join('/')}</span></div>
        <div><span class="label">Date de naissance</span><br/><span class="valeur">${echapperHTML(data.dateNaissance)}</span></div>
        ${data.prescritPar ? `<div><span class="label">Prescrit par</span><br/><span class="valeur">${echapperHTML(data.prescritPar)}</span></div>` : ''}
      </div>
      ${data.dateEntree1 && data.dateSortie1 ? `<p style="font-size:12px;margin-bottom:12px;"><strong>Séjour :</strong> ${phraseSejour(data.dateEntree1, data.dateSortie1)}</p>` : ''}
      <table><thead><tr><th>Désignation</th><th class="qte">Qté</th><th class="prix">Prix unitaire</th><th class="mtotal">Total</th></tr></thead><tbody>${ligneHebergement}${ligneHebergement2}${ligneChir}${lignesArticles}</tbody></table>
      <div class="total-general"><div class="montant">${formatGourdes(data.grandTotal)} Gdes <span style="font-size:14px;color:#555;">(${formatDH(data.grandTotal)} DH)</span></div></div>
      <div class="footer"><div class="signature">Signature / Cachet</div><div>CHF — Document généré le ${new Date().toLocaleDateString('fr-FR')}</div></div>
      </body></html>`;
    const win = window.open('', '_blank', 'width=850,height=1100');
    if (!win) { showToast("Impression bloquée par le navigateur. Réessaie en cliquant sur Imprimer — si ça ne marche toujours pas, demande à quelqu'un de vérifier les réglages.", "error"); return; }
    win.document.write(contenu); win.document.close(); win.focus(); setTimeout(() => win.print(), 500);
  };

  const executerEncaissement = async () => {
    if (!dossierActif) { showToast("Aucun dossier actif.", "error"); return; }
    if (!dossierId) { showToast("Erreur interne : aucun identifiant de dossier valide. N'encaisse pas — recharge la page et rouvre le dossier.", "error"); return; }
    if (!grandTotal || grandTotal <= 0) { showToast("Impossible d'encaisser : le montant de la fiche est à 0 Gdes. Ajoute au moins une ligne.", "error"); return; }
    if (modePaiement === "exoneration" && !(userRole === 'direction' || userRole === 'administrateur')) {
      showToast("Seul l'administrateur ou la direction peut encaisser une exonération.", "error");
      return;
    }
    if (modePaiement === "cash") {
      const vers = parseFloat(montantVerse) || 0;
      if (vers < montantRestantApresDepots) {
        showToast(`⚠️ Montant insuffisant. Reste : ${formatGourdes(montantRestantApresDepots - vers)} Gdes`, "error");
        return;
      }
    }
    if (modePaiement === "ong" && !ongPartenaireFiche) {
      showToast("Veuillez sélectionner le partenaire.", "error");
      return;
    }
    try {
      const fiche = {
        id: "fiche-" + Date.now(),
        numeroFiche: numeroFicheCourante,
        breakdown: { ...totalsParService },
        totalGlobal: grandTotal,
        modePaiement: modePaiement,
        ongPartenaire: modePaiement === "ong" ? ongPartenaireFiche : "",
        exoneration: modePaiement === "exoneration" ? { pourcentage: parseFloat(pourcentageExoneration), montantExonere: montantExonere, motif: motifExoneration, autorisePar: auth.currentUser.displayName } : null,
        statutPaiement: modePaiement === "credit" ? "partiellement_paye" : "paye",
        montantPaye: modePaiement === "cash" ? parseFloat(montantVerse) : modePaiement === "credit" ? 0 : montantRestantApresDepots,
        solde: modePaiement === "credit" ? montantRestantApresDepots : 0,
        exeat: dateEntree1 && dateSortie1 ? {
          dateEntree: dateEntree1, dateSortie: dateSortie1, nbJours: j1, typeLit: typeLit1,
          prixParJour: CONFIG_LITS[typeLit1].prix, totalHebergement: totalE1,
          multiPeriode: multiPeriode, dateEntree2: dateEntree2, dateSortie2: dateSortie2,
          typeLit2: typeLit2, nbJours2: j2, totalHebergement2: totalE2
        } : null,
        dateCreation: new Date().toISOString(),
        creePar: auth.currentUser?.displayName || 'inconnu',
        rawState: { lignesCalcul: [...lignes], dateEntree1, dateSortie1, typeLit1, multiPeriode, dateEntree2, dateSortie2, typeLit2, hasChirSpec, nomChirSpec, prixChirSpec }
      };
      onEnregistrerFiche(fiche); // vide déjà le calculateur via le parent
      let montantPaiement = 0;
      if (modePaiement === "cash") montantPaiement = montantRestantApresDepots;
      else if (modePaiement === "credit") montantPaiement = 0;
      else montantPaiement = montantRestantApresDepots;
      try {
        await chf.createPaiement(toPaiementApi({
          episodeId: dossierId,
          patientNom: nomPatient,
          montant: montantPaiement,
          mode: modePaiement,
          soldeRestant: modePaiement === "credit" ? montantRestantApresDepots : 0,
          ongPartenaire: modePaiement === "ong" ? ongPartenaireFiche : "",
          exoneration: modePaiement === "exoneration" ? { pourcentage: parseFloat(pourcentageExoneration), montantExonere: montantExonere, motif: motifExoneration } : null,
          date: new Date().toISOString(),
          encaissePar: auth.currentUser?.displayName || 'inconnu',
          typePatient: typePatient || 'ONG'
        }));
        showToast("✅ Fiche enregistrée avec succès !", "success");
      } catch (err) {
        if (!err.isOfflineQueue) throw err;
        showToast("📴 Paiement enregistré hors ligne — sera synchronisé au retour d'internet", "info");
      }
      setMontantVerse(""); setPourcentageExoneration(0); setMotifExoneration(""); setAutorisationExoneration(false);
      setPaiementEffectue(true);
      setConfirmModal({
        titre: "🖨️ Imprimer le ticket ?",
        message: "Le paiement a bien été enregistré.",
        confirmLabel: "Imprimer",
        cancelLabel: "Plus tard",
        onConfirm: () => { setConfirmModal(null); imprimerTicket(true); },
        onCancel: () => setConfirmModal(null)
      });
    } catch (error) { showToast("Erreur: " + error.message, "error"); }
  };

  const demanderConfirmationEncaissement = () => {
    if (!grandTotal || grandTotal <= 0) { showToast("Impossible d'encaisser : le montant de la fiche est à 0 Gdes.", "error"); return; }
    const libellesMode = { cash: '💵 Cash', credit: '📝 Crédit', ong: '🏥 Partenaire', exoneration: '🎯 Exonération' };
    setConfirmModal({
      titre: "Confirmer l'encaissement",
      message: `Patient : ${nomPatient}\nMode de paiement : ${libellesMode[modePaiement] || modePaiement}`,
      detail: `${formatGourdes(grandTotal)} Gdes  (${formatDH(grandTotal)} DH)`,
      confirmLabel: "💳 Encaisser",
      cancelLabel: "Annuler",
      onConfirm: () => { setConfirmModal(null); executerEncaissement(); },
      onCancel: () => setConfirmModal(null)
    });
  };

  const peutCreerDossier = userRole === 'comptable' || userRole === 'direction' || userRole === 'administrateur';
  const peutAjouterLignes = userRole === 'comptable' || userRole === 'direction' || userRole === 'administrateur';
  const peutEncaisser = userRole === 'comptable' || userRole === 'direction' || userRole === 'administrateur';
  const peutArchiver = userRole === 'comptable' || userRole === 'direction' || userRole === 'administrateur';
  const peutSupprimerFiche = userRole === 'direction' || userRole === 'administrateur';
  const peutAnnulerDossier = userRole === 'direction' || userRole === 'administrateur';
  const peutSuspendre = userRole === 'comptable' || userRole === 'direction' || userRole === 'administrateur';

  if (modeSimulation) return <div className="bg-blue-50 p-4">🧮 Mode simulation</div>;

  const enregistrerFicheActive = () => {
    if (lignes.length === 0 && j1 === 0 && !hasChirSpec && !dateEntree1) { showToast("Fiche vide", "error"); return; }
    // On crée l'objet fiche (si idFicheEnCoursDEdition, on l'utilise pour remplacer)
    const fiche = {
      id: idFicheEnCoursDEdition || "fiche-" + Date.now(),
      numeroFiche: idFicheEnCoursDEdition ? fichesDossier.find(f => f.id === idFicheEnCoursDEdition)?.numeroFiche || numeroFicheCourante : numeroFicheCourante,
      breakdown: { ...totalsParService },
      totalGlobal: grandTotal,
      exeat: dateEntree1 && dateSortie1 ? {
        dateEntree: dateEntree1, dateSortie: dateSortie1, nbJours: j1, typeLit: typeLit1,
        prixParJour: CONFIG_LITS[typeLit1].prix, totalHebergement: totalE1,
        multiPeriode: multiPeriode, dateEntree2: dateEntree2, dateSortie2: dateSortie2,
        typeLit2: typeLit2, nbJours2: j2, totalHebergement2: totalE2
      } : null,
      dateCreation: new Date(dateFiche + 'T12:00:00').toISOString(),
      creePar: auth.currentUser?.displayName || 'inconnu',
      prescritPar: prescritPar.trim() || '',
      rawState: { lignesCalcul: [...lignes], dateEntree1, dateSortie1, typeLit1, multiPeriode, dateEntree2, dateSortie2, typeLit2, hasChirSpec, nomChirSpec, prixChirSpec }
    };
    onEnregistrerFiche(fiche);
    // Le parent (AppHospitaliere) gère la mise à jour ou l'ajout et vide le calculateur
    if (idEntreeChargee) { retirerDeLaFile(idEntreeChargee); setIdEntreeChargee(null); }
    setPaiementEffectue(true);
    showToast(idFicheEnCoursDEdition ? "Fiche mise à jour" : "Fiche enregistrée", "success");
  };

  return (
    <div className="space-y-4">
      {confirmModal && <ConfirmModal {...confirmModal} />}

      {/* File d'attente de fiches à importer (digitalisation papier) */}
      <div className="bg-white rounded-xl border shadow-sm p-3 text-xs">
        <button onClick={() => setFileOuverte(o => !o)} className="w-full flex justify-between items-center font-bold text-gray-700">
          <span>📥 File d'import {fileImport.length > 0 && <span className="ml-1 bg-orange-600 text-white rounded-full px-2 py-0.5 text-[10px]">{fileImport.length} en attente</span>}</span>
          <span>{fileOuverte ? '▲' : '▼'}</span>
        </button>
        {fileOuverte && (
          <div className="mt-3 space-y-2">
            <div className="space-y-1">
              {fileImport.map(e => (
                <div key={e._id} className="flex justify-between items-center bg-gray-50 border rounded-lg p-2">
                  <button onClick={() => chargerEntreeFile(e)} className="text-left flex-1 font-medium text-gray-800">
                    {e.patient?.nom || '(sans nom)'} {e.patient?.ong ? `— ${e.patient.ong}` : ''}
                  </button>
                  <button onClick={() => retirerDeLaFile(e._id)} className="text-gray-300 hover:text-red-600 ml-2"><X size={12}/></button>
                </div>
              ))}
              {fileImport.length === 0 && <p className="text-gray-400 italic">File vide.</p>}
            </div>
            <textarea value={collageJson} onChange={e => setCollageJson(e.target.value)} rows={3} placeholder='Coller un JSON (une fiche ou un tableau de fiches)'
              className="w-full border rounded-lg p-2 font-mono text-[11px]" />
            <button onClick={ajouterAuCollage} disabled={!collageJson.trim()} className="w-full bg-[#1E2A24] text-white rounded-lg py-1.5 disabled:opacity-40">Ajouter à la file</button>
          </div>
        )}
      </div>

      {dossierActif && (
        <button onClick={enregistrerFicheActive} disabled={!peutArchiver}
          className="fixed right-2 z-50 bg-emerald-700 active:bg-emerald-800 hover:bg-emerald-800 text-white rounded-full shadow-2xl disabled:opacity-40 flex flex-col items-center justify-center gap-0.5 w-16 h-16"
          style={{ top: '42%' }}>
          <span className="text-xl leading-none">💾</span>
          <span className="text-[8px] font-black leading-none">{idFicheEnCoursDEdition ? 'Màj' : 'Sauver'}</span>
        </button>
      )}
      {!dossierActif ? (
        <NouveauDossierForm
          searchPatientText={searchPatientText} setSearchPatientText={setSearchPatientText}
          suggestionsPatients={suggestionsPatients} choisirPatientExistant={choisirPatientExistant}
          peutCreerDossier={peutCreerDossier}
          onSoumettre={e => {
            e.preventDefault();
            const nomNormalise = inputNom.trim().toLowerCase();
            const doublon = patientsExistants.find(p => (p.nomPatient || '').trim().toLowerCase() === nomNormalise);
            if (doublon) {
              const infos = [
                `dossier ${doublon.numDossier || 'sans numéro'}`,
                `ouvert le ${doublon.dateHeure || '?'}`,
                `statut : ${doublon.status || 'actif'}`,
                doublon.dateNaissance ? `né(e) le ${doublon.dateNaissance.split('-').reverse().join('/')}` : null,
                doublon.telephone ? `tél ${doublon.telephone}` : null
              ].filter(Boolean).join(', ');
              const continuer = confirm(`⚠️ Un patient nommé "${doublon.nomPatient}" existe déjà (${infos}).\n\nCréer quand même un NOUVEAU dossier séparé pour ce nom ?\n\n(Annuler pour plutôt chercher/charger le dossier existant en haut)`);
              if (!continuer) return;
            }
            if (inputOng) localStorage.setItem('chf-dernier-ong', inputOng);
            onNouveauDossier(inputNom, inputOng, inputNumDossier, inputTypePatient, inputDateNaissance, inputTelephone, serviceChoisi);
          }}
          serviceChoisi={serviceChoisi} setServiceChoisi={setServiceChoisi}
          inputNom={inputNom} setInputNom={setInputNom}
          inputTypePatient={inputTypePatient} setInputTypePatient={setInputTypePatient}
          inputOng={inputOng} setInputOng={setInputOng}
          inputNumDossier={inputNumDossier} setInputNumDossier={setInputNumDossier}
          inputDateNaissance={inputDateNaissance} setInputDateNaissance={setInputDateNaissance}
          inputTelephone={inputTelephone} setInputTelephone={setInputTelephone}
          listeOng={listeOng}
        />
      ) : (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-emerald-300 flex justify-between items-center shadow-sm flex-wrap gap-2">
            <div>
              {!editNomOuvert ? (
                <h3 className="text-base font-black flex items-center gap-2">
                  {nomPatient}
                  <button onClick={()=>{ setNouveauNomEdit(nomPatient||""); setEditNomOuvert(true); }} className="text-[9px] font-bold text-blue-600 underline">✏️ Changer</button>
                </h3>
              ) : (
                <div className="flex gap-1.5 items-center flex-wrap">
                  <input type="text" value={nouveauNomEdit} onChange={e=>setNouveauNomEdit(e.target.value)} className="border rounded p-1 text-xs" autoFocus />
                  <button onClick={()=>{ if (onChangerNomPatient) onChangerNomPatient(nouveauNomEdit); setEditNomOuvert(false); }} className="bg-emerald-700 text-white text-[10px] font-bold px-2 py-1 rounded"><Check size={10}/></button>
                  <button onClick={()=>setEditNomOuvert(false)} className="border text-[10px] font-bold px-2 py-1 rounded"><X size={10}/></button>
                </div>
              )}
              {!editTypeOuvert ? (
                <p className="text-xs font-bold text-purple-700 flex items-center gap-2">
                  {selectedOng || 'Privé'} - {typePatient === 'ONG' ? 'Partenaire' : 'Privé'}
                  {peutCreerDossier && <button onClick={()=>{ setNouveauTypeEdit(typePatient||'ONG'); setNouvelOngEdit(selectedOng||''); setEditTypeOuvert(true); }} className="text-[9px] font-bold text-blue-600 underline">✏️ Changer</button>}
                </p>
              ) : (
                <div className="flex gap-1.5 items-center mt-1 flex-wrap">
                  <select value={nouveauTypeEdit} onChange={e=>setNouveauTypeEdit(e.target.value)} className="border rounded p-1 text-xs bg-white">
                    <option value="ONG">🏥 Partenaire</option>
                    <option value="PRIVE">💳 Privé</option>
                  </select>
                  {nouveauTypeEdit === "ONG" && (
                    <select value={nouvelOngEdit} onChange={e=>setNouvelOngEdit(e.target.value)} className="border rounded p-1 text-xs bg-white">
                      <option value="">-- Partenaire --</option>
                      {listeOng.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                  <button onClick={()=>{ if (onChangerTypeOng) onChangerTypeOng(nouveauTypeEdit, nouveauTypeEdit==="ONG"?nouvelOngEdit:""); setEditTypeOuvert(false); }} className="bg-emerald-700 text-white text-[10px] font-bold px-2 py-1 rounded"><Check size={10}/></button>
                  <button onClick={()=>setEditTypeOuvert(false)} className="border text-[10px] font-bold px-2 py-1 rounded"><X size={10}/></button>
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {peutAnnulerDossier && <button onClick={onAnnulerDossier} className="bg-red-50 text-red-700 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-red-200">Abandonner</button>}
              {peutSuspendre && <button onClick={onSuspendreDossier} className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-amber-200 flex items-center gap-1"><Clock size={12}/> Suspendre</button>}
              {peutSuspendre && onReporterDossier && <button onClick={onReporterDossier} className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-indigo-200 flex items-center gap-1">📅 Reporter au mois suivant</button>}
              {peutArchiver && <button onClick={onCloturerDossier} className="bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg">🏁 Clôturer</button>}
            </div>
          </div>

          {/* ========== SECTION AFFICHAGE DES FICHES VALIDÉES ========== */}
          {fichesDossier.length > 0 && (
            <div className="bg-white p-3 rounded-xl border shadow-sm space-y-1.5">
              <span className="text-[9px] uppercase font-black text-gray-400">
                Fiches validées {idFicheEnCoursDEdition ? '(modification en cours)' : ''}
              </span>
              <button onClick={imprimerToutesLesFichesDuDossier} className="ml-2 bg-[#1E2A24] text-white text-[9px] font-bold px-2 py-1 rounded-lg">🖨️ Imprimer les {fichesDossier.length} fiche{fichesDossier.length > 1 ? 's' : ''} d'affilée</button>
              <div className="flex flex-wrap gap-1.5">
                {fichesDossier.map(f => {
                  const isEditing = f.id === idFicheEnCoursDEdition;
                  return (
                    <div key={f.id} className={`flex items-center rounded-lg font-mono text-[11px] font-bold border overflow-hidden shadow-sm ${isEditing ? 'bg-blue-100 border-blue-400' : f.probleme ? 'bg-red-100 border-red-400' : 'bg-gray-50 border-gray-200'}`}>
                      <button onClick={() => reimprimerFicheValidee(f)} className="pl-2.5 pr-2 py-1 hover:text-blue-700" title="Réimprimer cette fiche">
                        {f.probleme && '❓ '}🖨️ Fiche N°{f.numeroFiche} ({formatGourdes(f.totalGlobal)} Gdes)
                      </button>
                      {/* Bouton MARQUER / DÉMARQUER PROBLÈME */}
                      {onMarquerProblemeFiche && (
                        <button
                          onClick={() => onMarquerProblemeFiche(f.id)}
                          className={`px-2 py-1 border-l transition-colors font-bold text-[10px] ${f.probleme ? 'bg-amber-500/10 hover:bg-amber-600 hover:text-white text-amber-700' : 'bg-emerald-500/10 hover:bg-emerald-600 hover:text-white text-emerald-700'}`}
                          title={f.probleme ? (f.noteProbleme ? `❓ ${f.noteProbleme}\n\n(clique pour retirer le marquage)` : "Retirer le marquage — problème réglé") : "Tout va bien — clique pour signaler un problème"}
                        >
                          {f.probleme ? '❓' : '✅'}
                        </button>
                      )}
                      {/* Bouton MODIFIER */}
                      {onEditerFiche && (
                        <button
                          onClick={() => onEditerFiche(f.id)}
                          className="px-2 py-1 bg-blue-500/10 hover:bg-blue-600 hover:text-white border-l transition-colors text-blue-700 font-bold text-[10px]"
                          title="Modifier cette fiche"
                        >
                          ✏️
                        </button>
                      )}
                      {peutSupprimerFiche && (
                        <button onClick={() => { if (confirm("Supprimer cette fiche ?")) onSupprimerFicheDossier(f.id); }} className="px-2 py-1 bg-gray-200/50 hover:bg-red-600 hover:text-white border-l transition-colors">
                          <X size={12}/>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <HebergementForm
            dateEntree1={dateEntree1} setDateEntree1={setDateEntree1} dateSortie1={dateSortie1} setDateSortie1={setDateSortie1}
            typeLit1={typeLit1} setTypeLit1={setTypeLit1}
            multiPeriode={multiPeriode} setMultiPeriode={setMultiPeriode}
            dateEntree2={dateEntree2} setDateEntree2={setDateEntree2} dateSortie2={dateSortie2} setDateSortie2={setDateSortie2} typeLit2={typeLit2} setTypeLit2={setTypeLit2}
            hasChirSpec={hasChirSpec} setHasChirSpec={setHasChirSpec} nomChirSpec={nomChirSpec} setNomChirSpec={setNomChirSpec} prixChirSpec={prixChirSpec} setPrixChirSpec={setPrixChirSpec}
          />
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <label className="text-[9px] font-bold text-amber-800 uppercase">🩺 Prescrit par</label>
              <input type="text" value={prescritPar} onChange={e=>setPrescritPar(e.target.value)} placeholder="Nom du médecin/infirmière" className="border rounded p-1.5 text-xs w-40 bg-white" />
            </div>
          </div>
          <div className={estMobile ? "" : "grid grid-cols-[3fr_2fr] gap-4 items-start"}>
          <div className={`bg-white p-4 rounded-xl border space-y-3 shadow-sm ${estMobile ? '' : 'max-h-[80vh] overflow-y-auto'}`} ref={refZone}>
            <div className="flex justify-between items-center">
              <p className="text-[11px] font-bold uppercase text-gray-400">2. Actes, Laboratoire & Ordonnance</p>
              {setTarifChoisi && (
                <div className="flex text-[10px] font-bold rounded-lg border overflow-hidden">
                  <button onClick={()=>setTarifChoisi("actuel")} className={`px-2 py-1 ${tarifChoisi!=="nouveau" ? "bg-[#1E2A24] text-white" : "bg-gray-50 text-gray-500"}`}>Tarif Actuel</button>
                  <button onClick={()=>setTarifChoisi("nouveau")} className={`px-2 py-1 ${tarifChoisi==="nouveau" ? "bg-indigo-700 text-white" : "bg-gray-50 text-gray-500"}`}>Nouveau prix</button>
                </div>
              )}
            </div>
            {fichesDossier.length > 1 && (() => {
              const fichesTriees = [...fichesDossier].sort((a,b) => a.numeroFiche - b.numeroFiche);
              const indexActuel = idFicheEnCoursDEdition ? fichesTriees.findIndex(f => f.id === idFicheEnCoursDEdition) : fichesTriees.length;
              const peutPrecedente = indexActuel > 0;
              const peutSuivante = idFicheEnCoursDEdition && indexActuel < fichesTriees.length - 1;
              return (
                <div className="flex items-center justify-center gap-3 bg-gray-50 rounded-lg py-1.5 border">
                  <button onClick={() => peutPrecedente && onEditerFiche(fichesTriees[indexActuel - 1].id)} disabled={!peutPrecedente} className="px-2 py-0.5 text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed font-bold text-lg">◀</button>
                  <span className="text-[10px] font-bold text-gray-500 font-mono">
                    {idFicheEnCoursDEdition ? `Fiche N°${fichesTriees[indexActuel]?.numeroFiche} (${indexActuel + 1}/${fichesTriees.length})` : "Nouvelle fiche"}
                  </span>
                  <button onClick={() => peutSuivante && onEditerFiche(fichesTriees[indexActuel + 1].id)} disabled={!peutSuivante} className="px-2 py-0.5 text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed font-bold text-lg">▶</button>
                </div>
              );
            })()}
            {tarifChoisi === "nouveau" && <p className="text-[9px] text-indigo-600 font-bold">⚠️ Les articles ajoutés utiliseront le nouveau prix (à venir) quand il existe.</p>}
            <div className="flex gap-2 text-xs font-semibold">
              <button onClick={()=>{ setCategorie("med"); setSelection(null); }} className={`flex-1 py-1.5 border rounded-lg ${categorie==="med" ? "bg-[#1E2A24] text-white" : "bg-gray-50"}`}>💊 Pharmacie</button>
              <button onClick={()=>{ setCategorie("acte"); setSelection(null); }} className={`flex-1 py-1.5 border rounded-lg ${categorie==="acte" ? "bg-[#1E2A24] text-white" : "bg-gray-50"}`}>🔬 Examens / Actes</button>
            </div>
            <p className="text-[9px] text-gray-400">💡 Clique une lettre puis un résultat pour l'ajouter (quantité 1) — aucune saisie, ajuste la quantité juste en dessous.</p>

            <div className={estMobile ? "space-y-2" : "border-t pt-2 space-y-2"}>
                <p className="text-[10px] font-bold text-gray-400 uppercase">{categorie === "med" ? "Choisir une lettre" : "Choisir une catégorie"}</p>
                {categorie === "med" ? (
                  <div className="flex gap-1 flex-wrap">
                    {lettresDisponibles.map(l => (
                      <button key={l} onClick={() => setLettreActive(l)} className={`rounded font-bold ${estMobile ? 'w-10 h-10 text-sm' : 'w-7 h-7 text-xs'} ${(lettreActive || lettresDisponibles[0]) === l ? "bg-[#1E2A24] text-white" : "bg-gray-100 text-gray-600"}`}>{l}</button>
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-1 flex-wrap">
                    <button onClick={() => setSousCategorieActeActive(null)} className={`rounded font-bold ${estMobile ? 'px-4 py-2 text-sm' : 'px-3 py-1 text-xs'} ${sousCategorieActeActive === null ? "bg-[#1E2A24] text-white" : "bg-gray-100 text-gray-600"}`}>Toutes</button>
                    {categoriesActesDisponibles.map(c => (
                      <button key={c.key} onClick={() => setSousCategorieActeActive(c.key)} className={`rounded font-bold ${estMobile ? 'px-4 py-2 text-sm' : 'px-3 py-1 text-xs'} ${sousCategorieActeActive === c.key ? "bg-[#1E2A24] text-white" : "bg-gray-100 text-gray-600"}`}>{c.label}</button>
                    ))}
                  </div>
                )}
                <div className={`grid gap-1.5 overflow-y-auto ${estMobile ? 'grid-cols-2 max-h-72' : 'grid-cols-5 max-h-[32rem]'}`}>
                  {catalogueGrille.map(item => (
                    <button key={item.id} onClick={() => ajouterAvecQuantite(item, 1)} disabled={!peutAjouterLignes} className={`border rounded-lg text-left hover:bg-emerald-50 hover:border-emerald-400 active:bg-emerald-100 disabled:opacity-30 disabled:cursor-not-allowed ${estMobile ? 'p-3' : 'p-2'}`}>
                      <div className={`font-semibold text-gray-800 line-clamp-2 ${estMobile ? 'text-sm' : 'text-xs'}`}>{item.nom}</div>
                    </button>
                  ))}
                  {catalogueGrille.length === 0 && <p className="col-span-2 text-center text-gray-400 text-xs py-3">Rien dans cette section.</p>}
                </div>
            </div>
          </div>
          {!estMobile && (
            <div className="bg-white rounded-xl border overflow-hidden shadow-sm max-h-[75vh] overflow-y-auto">
              <table className="w-full text-xs text-left table-fixed">
                <thead className="sticky top-0"><tr className="bg-gray-100 text-[10px] text-gray-500 uppercase border-b font-mono"><th className="p-3 w-[46%]">Désignation</th><th className="p-3 w-[14%] text-center">Qté</th><th className="p-3 text-right w-[17%]">Prix</th><th className="p-3 text-right w-[17%]">Total</th><th className="w-[6%]"></th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {dateEntree1 && dateSortie1 && <tr className="bg-amber-50/20"><td className="p-3 text-amber-900">Séjour : {CONFIG_LITS[typeLit1].nom}</td><td className="p-3 text-center font-bold">{j1} jrs</td><td className="p-3 text-right text-gray-400">{formatGourdes(CONFIG_LITS[typeLit1].prix)}</td><td className="p-3 text-right font-bold">{formatGourdes(totalE1)}</td><td></td></tr>}
                  {multiPeriode && dateEntree2 && dateSortie2 && <tr className="bg-amber-50/40"><td className="p-3 text-amber-900">Séjour P2 : {CONFIG_LITS[typeLit2].nom}</td><td className="p-3 text-center font-bold">{j2} jrs</td><td className="p-3 text-right text-gray-400">{formatGourdes(CONFIG_LITS[typeLit2].prix)}</td><td className="p-3 text-right font-bold">{formatGourdes(totalE2)}</td><td></td></tr>}
                  {hasChirSpec && nomChirSpec && <tr className="bg-red-50/20"><td className="p-3 text-red-900">Chirurgie : {nomChirSpec}</td><td className="p-3 text-center">1</td><td className="p-3 text-right text-gray-400">{formatGourdes(totalChirSpec)}</td><td className="p-3 text-right font-bold">{formatGourdes(totalChirSpec)}</td><td></td></tr>}
                  {lignes.map(l => { const decrementer = () => setLignes(p=>p.map(x=>x.id===l.id?{...x,qte:Math.max(1,x.qte-1)}:x)); const incrementer = () => setLignes(p=>p.map(x=>x.id===l.id?{...x,qte:x.qte+1}:x)); return <tr key={l.id} className="zebra-row"><td className="p-3 text-gray-800"><span className={`text-[8px] font-bold uppercase px-1 rounded mr-1 ${l.type==='med'?'bg-emerald-50 text-emerald-700':'bg-blue-50 text-blue-700'}`}>{l.type==='med'?'Pharma':'Acte'}</span>{l.nom}</td><td className="p-3 text-center"><div className="flex items-center justify-center gap-1"><button onMouseDown={()=>demarrerRepetition(decrementer)} onMouseUp={arreterRepetition} onMouseLeave={arreterRepetition} onTouchStart={(e)=>{e.preventDefault(); demarrerRepetition(decrementer);}} onTouchEnd={(e)=>{e.preventDefault(); arreterRepetition();}} onTouchCancel={arreterRepetition} className="w-7 h-7 bg-gray-100 active:bg-gray-300 rounded-lg font-bold text-gray-700 select-none">−</button><span className="font-mono font-bold w-6 text-center">{l.qte}</span><button onMouseDown={()=>demarrerRepetition(incrementer)} onMouseUp={arreterRepetition} onMouseLeave={arreterRepetition} onTouchStart={(e)=>{e.preventDefault(); demarrerRepetition(incrementer);}} onTouchEnd={(e)=>{e.preventDefault(); arreterRepetition();}} onTouchCancel={arreterRepetition} className="w-7 h-7 bg-gray-100 active:bg-gray-300 rounded-lg font-bold text-gray-700 select-none">+</button></div></td><td className="p-3 text-right text-gray-400">{formatGourdes(l.prix)}</td><td className="p-3 text-right font-bold">{formatGourdes(l.qte * l.prix)}</td><td className="text-center">{peutSupprimerFiche && <button onClick={()=>setLignes(p=>p.filter(x=>x.id!==l.id))} className="text-gray-300 hover:text-red-600"><X size={12}/></button>}</td></tr>; })}
                </tbody>
              </table>
              <div className="p-4 bg-gray-50 border-t border-b text-[11px] text-gray-600 font-mono space-y-1 shadow-inner">
                <div className="grid grid-cols-3 font-bold text-[#1E2A24] border-b pb-1 mb-2"><span>RÉCAPITULATIF DE LA FICHE</span><span className="text-right">Gdes</span><span className="text-right text-emerald-800">💵 DH</span></div>
                {require('../utils/constants').CATEGORIES_LISTE.map(srv => {
                  const m = totalsParService[srv.key]; if (m===0) return null;
                  const c = coutsParService?.valeurs?.[srv.key] || 0;
                  return (
                    <div key={srv.key}>
                      <div className="grid grid-cols-3 py-0.5"><span>• {srv.label}</span><span className="text-right">{formatGourdes(m)}</span><span className="text-right font-bold">{formatDH(m)} DH</span></div>
                      {c > 0 && <div className="grid grid-cols-3 pb-0.5 text-[10px] text-orange-600"><span className="pl-3">↳ Coût</span><span className="text-right">{formatGourdes(c)}</span><span className={`text-right font-bold ${m-c>=0?'text-emerald-700':'text-red-600'}`}>Marge {formatGourdes(m-c)}</span></div>}
                    </div>
                  );
                })}
                {coutsParService?.incomplet && Object.values(coutsParService.valeurs).some(v=>v>0) && <p className="text-[9px] text-gray-400 italic pt-1">Coût partiel : certains articles de cette fiche (ou l'hébergement/chirurgie spéciale) n'ont pas encore de coût renseigné dans le catalogue.</p>}
              </div>
              <div className="bg-[#1E2A24] text-white p-4 flex justify-between items-center font-bold text-sm font-mono sticky bottom-0">
                <span>SOUS-TOTAL FICHE {idFicheEnCoursDEdition ? 'EN MODIFICATION' : `N°${numeroFicheCourante}`} <span className="text-emerald-400 font-normal text-xs">({nombreElementsFiche} élément{nombreElementsFiche > 1 ? 's' : ''})</span> :</span>
                <span>{formatGourdes(grandTotal)} Gdes ({formatDH(grandTotal)} DH)</span>
              </div>
            </div>
          )}
          </div>

          {/* --- Mobile : barre fixe en bas (toujours visible), tap = récapitulatif complet plein écran --- */}
          {estMobile && dossierActif && (
            <button onClick={() => setDetailOuvert(true)} className="fixed bottom-0 left-0 right-0 z-40 bg-[#1E2A24] text-white px-4 py-3 flex justify-between items-center font-bold text-sm shadow-2xl">
              <span>{nombreElementsFiche} article(s)</span>
              <span>{formatDH(grandTotal)} DH ▲</span>
            </button>
          )}
          {estMobile && detailOuvert && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setDetailOuvert(false)}>
              <div className="bg-white w-full rounded-t-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 bg-white p-3 border-b flex justify-between items-center z-10">
                  <span className="font-bold text-sm text-gray-800">Récapitulatif de la fiche</span>
                  <button onClick={() => setDetailOuvert(false)} className="p-2 text-gray-500"><X size={18}/></button>
                </div>
                <table className="w-full text-xs text-left table-fixed">
                  <thead><tr className="bg-gray-100 text-[10px] text-gray-500 uppercase border-b font-mono"><th className="p-3 w-[40%]">Désignation</th><th className="p-3 w-[22%] text-center">Qté</th><th className="p-3 text-right w-[19%]">Prix</th><th className="p-3 text-right w-[19%]">Total</th><th className="w-8"></th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {dateEntree1 && dateSortie1 && <tr className="bg-amber-50/20"><td className="p-3 text-amber-900">Séjour : {CONFIG_LITS[typeLit1].nom}</td><td className="p-3 text-center font-bold">{j1} jrs</td><td className="p-3 text-right text-gray-400">{formatGourdes(CONFIG_LITS[typeLit1].prix)}</td><td className="p-3 text-right font-bold">{formatGourdes(totalE1)}</td><td></td></tr>}
                    {multiPeriode && dateEntree2 && dateSortie2 && <tr className="bg-amber-50/40"><td className="p-3 text-amber-900">Séjour P2 : {CONFIG_LITS[typeLit2].nom}</td><td className="p-3 text-center font-bold">{j2} jrs</td><td className="p-3 text-right text-gray-400">{formatGourdes(CONFIG_LITS[typeLit2].prix)}</td><td className="p-3 text-right font-bold">{formatGourdes(totalE2)}</td><td></td></tr>}
                    {hasChirSpec && nomChirSpec && <tr className="bg-red-50/20"><td className="p-3 text-red-900">Chirurgie : {nomChirSpec}</td><td className="p-3 text-center">1</td><td className="p-3 text-right text-gray-400">{formatGourdes(totalChirSpec)}</td><td className="p-3 text-right font-bold">{formatGourdes(totalChirSpec)}</td><td></td></tr>}
                    {lignes.map(l => { const decrementer = () => setLignes(p=>p.map(x=>x.id===l.id?{...x,qte:Math.max(1,x.qte-1)}:x)); const incrementer = () => setLignes(p=>p.map(x=>x.id===l.id?{...x,qte:x.qte+1}:x)); return <tr key={l.id} className="zebra-row"><td className="p-3 text-gray-800"><span className={`text-[8px] font-bold uppercase px-1 rounded mr-1 ${l.type==='med'?'bg-emerald-50 text-emerald-700':'bg-blue-50 text-blue-700'}`}>{l.type==='med'?'Pharma':'Acte'}</span>{l.nom}</td><td className="p-3 text-center"><div className="flex items-center justify-center gap-1"><button onMouseDown={()=>demarrerRepetition(decrementer)} onMouseUp={arreterRepetition} onMouseLeave={arreterRepetition} onTouchStart={(e)=>{e.preventDefault(); demarrerRepetition(decrementer);}} onTouchEnd={(e)=>{e.preventDefault(); arreterRepetition();}} onTouchCancel={arreterRepetition} className="w-8 h-8 bg-gray-100 active:bg-gray-300 rounded-lg font-bold text-gray-700 select-none">−</button><span className="font-mono font-bold w-6 text-center">{l.qte}</span><button onMouseDown={()=>demarrerRepetition(incrementer)} onMouseUp={arreterRepetition} onMouseLeave={arreterRepetition} onTouchStart={(e)=>{e.preventDefault(); demarrerRepetition(incrementer);}} onTouchEnd={(e)=>{e.preventDefault(); arreterRepetition();}} onTouchCancel={arreterRepetition} className="w-8 h-8 bg-gray-100 active:bg-gray-300 rounded-lg font-bold text-gray-700 select-none">+</button></div></td><td className="p-3 text-right text-gray-400">{formatGourdes(l.prix)}</td><td className="p-3 text-right font-bold">{formatGourdes(l.qte * l.prix)}</td><td className="text-center">{peutSupprimerFiche && <button onClick={()=>setLignes(p=>p.filter(x=>x.id!==l.id))} className="text-gray-300 hover:text-red-600"><X size={12}/></button>}</td></tr>; })}
                    {lignes.length === 0 && !dateEntree1 && !hasChirSpec && <tr><td colSpan={5} className="p-6 text-center text-gray-400">Fiche vide pour l'instant.</td></tr>}
                  </tbody>
                </table>
                <div className="p-4 bg-gray-50 border-t border-b text-[11px] text-gray-600 font-mono space-y-1">
                  <div className="grid grid-cols-3 font-bold text-[#1E2A24] border-b pb-1 mb-2"><span>RÉCAPITULATIF DE LA FICHE</span><span className="text-right">Gdes</span><span className="text-right text-emerald-800">💵 DH</span></div>
                  {require('../utils/constants').CATEGORIES_LISTE.map(srv => { const m = totalsParService[srv.key]; if (m===0) return null; return <div key={srv.key} className="grid grid-cols-3 py-0.5"><span>• {srv.label}</span><span className="text-right">{formatGourdes(m)}</span><span className="text-right font-bold">{formatDH(m)} DH</span></div>; })}
                </div>
                <div className="bg-[#1E2A24] text-white p-4 flex justify-between items-center font-bold text-sm font-mono">
                  <span>SOUS-TOTAL FICHE {idFicheEnCoursDEdition ? 'EN MODIFICATION' : `N°${numeroFicheCourante}`} :</span>
                  <span>{formatGourdes(grandTotal)} Gdes ({formatDH(grandTotal)} DH)</span>
                </div>
                <button onClick={() => setDetailOuvert(false)} className="w-full py-3 text-center text-gray-500 text-xs font-bold border-t">Fermer</button>
              </div>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <button onClick={onViderFicheActive} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl py-3 text-xs font-bold">🧹 Vider l'écran</button>
            <button onClick={imprimerFicheA4} disabled={!paiementEffectue} className={`flex-1 rounded-xl py-3 text-xs font-bold flex items-center justify-center gap-1 ${paiementEffectue ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>🖨️ A4</button>
            <button onClick={imprimerTicket} disabled={!paiementEffectue} className={`flex-1 rounded-xl py-3 text-xs font-bold flex items-center justify-center gap-1 ${paiementEffectue ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>🧾 Ticket</button>
            <button onClick={enregistrerFicheActive} disabled={!peutArchiver} className="flex-[2] bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl py-3 text-xs font-black shadow-md disabled:opacity-50">
              {idFicheEnCoursDEdition ? '💾 Mettre à jour la Fiche' : `💾 Enregistrer la Fiche N°${numeroFicheCourante} au Dossier`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

module.exports = CalculateurPanel;