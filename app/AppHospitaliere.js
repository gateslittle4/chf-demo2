// app/AppHospitaliere.js
const React = window.React;
const ReactDOM = window.ReactDOM;
const { useState, useEffect, useMemo } = React;

const { chf, toEpisodeApi, fromEpisodeApi, generateLocalId, fromPaiementApi } = require('../api/supabase');
const { firebase, auth, db, LOG_TARGETS_KEY, LOG_DOSSIER_BROUILLON_KEY, enregistrerAudit } = require('../api/firebase');
const { CONFIG_LITS, CATEGORIES_LISTE, LISTE_ONG } = require('../utils/constants');
const { MEDICAMENTS_PAR_DEFAUT, ACTES_PAR_DEFAUT } = require('../utils/defaultCatalog');
const { formatGourdes, formatDH, formaterNomPropre } = require('../utils/helpers');
const { chiffrerTexte, dechiffrerTexte } = require('../utils/crypto');
const { ArrowUp, ArrowDown } = require('../utils/icons');

const ToastManager = require('../components/Toast');
const ConnectionStatus = require('../components/ConnectionStatus');
const StockAlertBadge = require('../components/StockAlertBadge');
const ConfirmModal = require('../components/ConfirmModal');
const LoginScreen = require('../components/Login');
const GrilleEditionPanel = require('../components/GrilleEdition');
const GestionStockPanel = require('../components/GestionStock');
const GestionUtilisateursPanel = require('../components/GestionUtilisateurs');
const DemandesPanel = require('../components/Demandes');
const DashboardDirectionPanel = require('../components/DashboardDirection');
const DashboardCaissePanel = require('../components/DashboardCaisse');
const HistoriqueVerifPanel = require('../components/ArchivesPanel');
const Simulateur = require('../components/Simulateur');
const CalculateurPanel = require('../components/CalculateurPanel');
const AchatExpress = require('../components/AchatExpress');
const AccueilPanel = require('../components/AccueilPanel');
const AnalyticsPanel = require('../components/AnalyticsPanel');
const GestionOngPanel = require('../components/GestionOng');

// ========================== COMPOSANT PRINCIPAL ==========================
function AppHospitaliere({ onQuitter, userRole, userDisplayName, userEmail }) {
  const [onglet, setOnglet] = useState("accueil");
  const [medicaments, setMedicaments] = useState([]);
  const [actes, setActes] = useState([]);
  const [verifications, setVerifications] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [ongTargets, setOngTargets] = useState({ "MSF-H": 0, "MSF-F": 0, "ALIMA": 0, "AVSI": 0, "GRID MISSION": 0, "WAY TO HEALTH": 0, "TEAM TASSY": 0 });
  const [listeOngDocs, setListeOngDocs] = useState([]); // [{id, nom}] — chargé depuis Firestore (collection ong_partenaires)
  const [dossierActif, setDossierActif] = useState(false);
  const [nomPatient, setNomPatient] = useState("");
  const [selectedOng, setSelectedOng] = useState("");
  const [typePatient, setTypePatient] = useState("ONG");
  const [numDossierPatient, setNumDossierPatient] = useState("");
  const [dateNaissance, setDateNaissance] = useState("");
  const [telephone, setTelephone] = useState("");
  const [fichesDossier, setFichesDossier] = useState([]);
  const [idFicheEnCoursDEdition, setIdFicheEnCoursDEdition] = useState(null); // ID de la fiche en édition
  const [modePreValidation, setModePreValidation] = useState(false);
  const [lignesCalcul, setLignesCalcul] = useState([]);
  const [dateEntree1, setDateEntree1] = useState("");
  const [dateSortie1, setDateSortie1] = useState("");
  const [typeLit1, setTypeLit1] = useState("normal");
  const [multiPeriode, setMultiPeriode] = useState(false);
  const [dateEntree2, setDateEntree2] = useState("");
  const [dateSortie2, setDateSortie2] = useState("");
  const [typeLit2, setTypeLit2] = useState("normal");
  const [hasChirSpec, setHasChirSpec] = useState(false);
  const [tarifChoisi, setTarifChoisi] = useState("actuel"); // "actuel" | "nouveau" — quel prix du catalogue utiliser
  const [nomChirSpec, setNomChirSpec] = useState("");
  const [prixChirSpec, setPrixChirSpec] = useState("");
  const [filtreArchivesInitialNom, setFiltreArchivesInitialNom] = useState("");
  const [needsBackupWarning, setNeedsBackupWarning] = useState(false);
  const [modeSimulation, setModeSimulation] = useState(false);
  const [dossierId, setDossierId] = useState(null);
  const [dossierUpdatedAtOuverture, setDossierUpdatedAtOuverture] = useState(null);
  const [paiementEffectue, setPaiementEffectue] = useState(false);
  const [achatExpressOuvert, setAchatExpressOuvert] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const [avertissementInactivite, setAvertissementInactivite] = useState(false);
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); }, 4000);
  };
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  const lowStockItems = useMemo(() => medicaments.filter(m => (m.quantite || 0) <= (m.seuilAlerte || 5)), [medicaments]);

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log("🔄 Chargement des données...");
        const [episodesData, paiementsData, medsData, actesData] = await Promise.all([
          chf.getEpisodes(),
          chf.getPaiements(),
          chf.getCatalog('medicaments'),
          chf.getCatalog('actes')
        ]);
        const episodesCamel = (episodesData || []).map(ep => fromEpisodeApi(ep));
        setVerifications(episodesCamel);
        setPaiements((paiementsData || []).map(p => fromPaiementApi(p)));
        setMedicaments(medsData || []);
        setActes(actesData || []);
        console.log("✅ Données chargées");
      } catch (e) {
        console.error("❌ Erreur chargement:", e);
        try {
          const { LOG_MEDS_KEY, LOG_ACTES_KEY } = require('../api/firebase');
          const meds = JSON.parse(localStorage.getItem(LOG_MEDS_KEY) || '[]');
          const actesLocal = JSON.parse(localStorage.getItem(LOG_ACTES_KEY) || '[]');
          setMedicaments(meds);
          setActes(actesLocal);
          if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
            showToast("⚠️ Le backend est injoignable. Vérifie que Render est actif.", "error");
          } else {
            showToast("Erreur de chargement : " + e.message, "error");
          }
        } catch (_) { }
      } finally {
        setChargement(false);
      }
    };
    loadData();
    const interval = setInterval(() => { if (!document.hidden) loadData(); }, 45000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem(LOG_TARGETS_KEY, JSON.stringify(ongTargets));
  }, [ongTargets]);

  useEffect(() => {
    if (!db) return;
    const unsubscribe = db.collection('ong_partenaires').orderBy('nom').onSnapshot(snapshot => {
      if (snapshot.empty) {
        // Première utilisation : amorce la collection avec l'ancienne liste codée en dur, pour ne rien casser.
        const batch = db.batch();
        LISTE_ONG.forEach(nom => batch.set(db.collection('ong_partenaires').doc(), { nom, dateAjout: firebase.firestore.FieldValue.serverTimestamp() }));
        batch.commit().catch(e => console.warn("Amorçage ong_partenaires:", e));
        return; // le prochain onSnapshot (déclenché par ce commit) mettra à jour l'état
      }
      setListeOngDocs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, []);

  const listeOngNoms = listeOngDocs.length ? listeOngDocs.map(d => d.nom) : LISTE_ONG;

  useEffect(() => {
    if (!chargement) {
      const brouillon = {
        dossierActif, nomPatient, selectedOng, typePatient, numDossierPatient, dateNaissance, telephone, fichesDossier, modePreValidation,
        lignesCalcul, dateEntree1, dateSortie1, typeLit1, multiPeriode, dateEntree2, dateSortie2, typeLit2,
        hasChirSpec, nomChirSpec, prixChirSpec, idFicheEnCoursDEdition, dossierId, paiementEffectue
      };
      localStorage.setItem(LOG_DOSSIER_BROUILLON_KEY, JSON.stringify(brouillon));
    }
  }, [dossierActif, nomPatient, selectedOng, typePatient, numDossierPatient, dateNaissance, telephone, fichesDossier, modePreValidation,
    lignesCalcul, dateEntree1, dateSortie1, typeLit1, multiPeriode, dateEntree2, dateSortie2,
    typeLit2, hasChirSpec, nomChirSpec, prixChirSpec, idFicheEnCoursDEdition, dossierId, paiementEffectue, chargement]);

  useEffect(() => {
    const onSynced = (e) => {
      const { localId, realId } = e.detail || {};
      if (!localId || !realId) return;
      setVerifications(prev => prev.map(v => v.id === localId ? { ...v, id: realId } : v));
      setDossierId(prev => prev === localId ? realId : prev);
      showToast("✅ Un dossier hors ligne a été synchronisé", "success");
    };
    window.addEventListener('chf:synced', onSynced);
    return () => window.removeEventListener('chf:synced', onSynced);
  }, []);

  // Réinitialise le calculateur (et l'édition)
  const viderLeCalculateurFicheUniquement = () => {
    setLignesCalcul([]);
    setIdFicheEnCoursDEdition(null);
    setDateEntree1("");
    setDateSortie1("");
    setTypeLit1("normal");
    setMultiPeriode(false);
    setDateEntree2("");
    setDateSortie2("");
    setTypeLit2("normal");
    setHasChirSpec(false);
    setNomChirSpec("");
    setPrixChirSpec("");
    setPaiementEffectue(false);
    setTarifChoisi("actuel");
  };

  // --- NOUVEAU : Charger une fiche existante pour modification ---
  const editerFiche = (idFiche) => {
    const fiche = fichesDossier.find(f => f.id === idFiche);
    if (!fiche) {
      showToast("Fiche introuvable.", "error");
      return;
    }
    // Restaurer l'état du calculateur à partir de rawState
    const raw = fiche.rawState || {};
    setLignesCalcul(raw.lignesCalcul || []);
    setDateEntree1(raw.dateEntree1 || "");
    setDateSortie1(raw.dateSortie1 || "");
    setTypeLit1(raw.typeLit1 || "normal");
    setMultiPeriode(raw.multiPeriode || false);
    setDateEntree2(raw.dateEntree2 || "");
    setDateSortie2(raw.dateSortie2 || "");
    setTypeLit2(raw.typeLit2 || "normal");
    setHasChirSpec(raw.hasChirSpec || false);
    setNomChirSpec(raw.nomChirSpec || "");
    setPrixChirSpec(raw.prixChirSpec || "");
    setIdFicheEnCoursDEdition(idFiche);
    setPaiementEffectue(false);
    showToast(`Édition de la fiche N°${fiche.numeroFiche}`, "info");
  };

  // --- NOUVEAU : Enregistrer une fiche modifiée (remplace l'ancienne) ---
  const enregistrerFicheModifiee = (nouvelleFiche) => {
    setFichesDossier(prev => prev.map(f => f.id === nouvelleFiche.id ? nouvelleFiche : f));
    viderLeCalculateurFicheUniquement();
    showToast("Fiche mise à jour", "success");
  };

  // --- Modification de l'enregistrement d'une nouvelle fiche : gère l'édition ---
  const enregistrerNouvelleFiche = (fiche) => {
    if (idFicheEnCoursDEdition) {
      // Si une fiche est en cours d'édition, on la remplace
      enregistrerFicheModifiee({ ...fiche, id: idFicheEnCoursDEdition });
    } else {
      // Sinon on l'ajoute
      setFichesDossier(prev => [...prev, fiche]);
      viderLeCalculateurFicheUniquement();
      showToast("Fiche enregistrée", "success");
    }
  };

  const initialiserNouveauDossier = async (nom, ong, numDossier, type, naissance, tel, serviceChoisi) => {
    const propreNom = formaterNomPropre(nom);
    if (!propreNom || (!ong && type === "ONG")) { showToast("Veuillez remplir tous les champs.", "error"); return; }
    const episodeData = {
      nomPatient: propreNom, ongPartenaire: type === "ONG" ? ong : "", typePatient: type,
      numDossier: numDossier || "", dateNaissance: naissance || "", telephone: tel || "",
      serviceChoisi: serviceChoisi || "",
      status: 'actif', timestamp: Date.now(), dateHeure: new Date().toLocaleDateString("fr-FR"),
      totalGlobal: 0, fiches: [], montantPaye: 0, solde: 0
    };
    const apiData = toEpisodeApi(episodeData);
    const localId = generateLocalId();
    let idFinal;
    try {
      const newEpisode = await chf.createEpisode(apiData, localId);
      idFinal = newEpisode.id;
    } catch (error) {
      if (!error.isOfflineQueue) { showToast("Erreur création dossier: " + error.message, "error"); return; }
      idFinal = localId;
      setVerifications(prev => [{ ...episodeData, id: localId }, ...prev]);
      showToast(`📴 Dossier de ${propreNom} ouvert hors ligne — sera synchronisé au retour d'internet`, "info");
    }
    setDossierId(idFinal);
    setNomPatient(propreNom);
    setSelectedOng(type === "ONG" ? ong : "");
    setTypePatient(type);
    setNumDossierPatient(numDossier || "");
    setDateNaissance(naissance || "");
    setTelephone(tel || "");
    sessionStorage.setItem('numDossierPatient', numDossier || "Non renseigné");
    setDossierActif(true);
    setFichesDossier([]);
    setModePreValidation(false);
    viderLeCalculateurFicheUniquement();
    if (idFinal === localId) return;
    showToast(`Dossier de ${propreNom} ouvert`, "success");
  };

  const chargerDossierExistant = (patientDoc) => {
    setDossierId(patientDoc.id);
    setDossierUpdatedAtOuverture(patientDoc.updatedAt || null);
    setNomPatient(patientDoc.nomPatient);
    setSelectedOng(patientDoc.ongPartenaire || "");
    setTypePatient(patientDoc.typePatient || "ONG");
    setNumDossierPatient(patientDoc.numDossier || "");
    setDateNaissance(patientDoc.dateNaissance || "");
    setTelephone(patientDoc.telephone || "");
    sessionStorage.setItem('numDossierPatient', patientDoc.numDossier || "");
    setFichesDossier(patientDoc.fiches || []);
    setDossierActif(true);
    setModePreValidation(false);
    viderLeCalculateurFicheUniquement();
    setIdFicheEnCoursDEdition(null);
    setLignesCalcul([]);
    setPaiementEffectue(false);
    setOnglet("calcul");
    showToast(`Dossier de ${patientDoc.nomPatient} chargé`, "success");
  };

  // Détecte une fiche en cours de saisie non encore ajoutée/mise à jour dans le dossier (dates
  // d'hébergement, lignes pharmacie/actes, chirurgie hors-catalogue) ; si elle existe, propose de
  // l'enregistrer avant de continuer, pour ne rien perdre au moment de clôturer/suspendre/reporter.
  // Si une fiche est EN COURS D'ÉDITION (idFicheEnCoursDEdition), la confirmation REMPLACE cette
  // fiche existante (même id, même numéro) au lieu d'en ajouter une nouvelle en doublon.
  // `callback` reçoit la liste de fiches à jour.
  const avecFicheEnCoursAjoutee = (callback) => {
    const activeEstVide = lignesCalcul.length === 0 && j1 === 0 && !hasChirSpec && !dateEntree1;
    if (activeEstVide) { callback(fichesDossier); return; }
    const ficheOriginale = idFicheEnCoursDEdition ? fichesDossier.find(f => f.id === idFicheEnCoursDEdition) : null;
    setConfirmModal({
      titre: idFicheEnCoursDEdition ? "Modification non enregistrée" : "Fiche en cours détectée",
      message: idFicheEnCoursDEdition
        ? `Tu modifies la Fiche N°${ficheOriginale?.numeroFiche || ''} et ces changements ne sont pas encore enregistrés.`
        : "Tu as une fiche en cours de saisie qui n'a pas encore été ajoutée au dossier.",
      detail: `${formatGourdes(grandTotalGlobalFiche)} Gdes`,
      confirmLabel: idFicheEnCoursDEdition ? "Oui, enregistrer la modification" : "Oui, l'ajouter",
      cancelLabel: "Non, continuer sans",
      onConfirm: () => {
        setConfirmModal(null);
        const fiche = {
          id: idFicheEnCoursDEdition || ("fiche-" + Date.now()),
          numeroFiche: idFicheEnCoursDEdition ? (ficheOriginale?.numeroFiche || numeroFicheCourante) : numeroFicheCourante,
          breakdown: { ...totalsParService }, totalGlobal: grandTotalGlobalFiche, contientErreurs: false,
          rawState: { lignesCalcul: [...lignesCalcul], dateEntree1, dateSortie1, typeLit1, multiPeriode, dateEntree2, dateSortie2, typeLit2, hasChirSpec, nomChirSpec, prixChirSpec }
        };
        const fichesFinales = idFicheEnCoursDEdition
          ? fichesDossier.map(f => f.id === idFicheEnCoursDEdition ? fiche : f)
          : [...fichesDossier, fiche];
        setFichesDossier(fichesFinales);
        viderLeCalculateurFicheUniquement();
        callback(fichesFinales);
      },
      onCancel: () => { setConfirmModal(null); callback(fichesDossier); }
    });
  };

  const declencherPreValidationDossier = () => {
    avecFicheEnCoursAjoutee((fichesFinales) => {
      if (fichesFinales.length === 0) { showToast("Dossier vide.", "error"); return; }
      setModePreValidation(true);
    });
  };

  const executerArchivage = async () => {
    const somme = fichesDossier.reduce((s, f) => s + f.totalGlobal, 0);
    const datesTrouvees = [];
    fichesDossier.forEach(f => { if (f.rawState?.dateEntree1) datesTrouvees.push({ in: f.rawState.dateEntree1, out: f.rawState.dateSortie1 }); if (f.rawState?.multiPeriode && f.rawState?.dateEntree2) datesTrouvees.push({ in: f.rawState.dateEntree2, out: f.rawState.dateSortie2 }); });
    let sejourTexte = "—";
    if (datesTrouvees.length > 0) sejourTexte = datesTrouvees.map(d => d.in === d.out ? d.in.split("-").reverse().slice(0, 2).join("/") : `du ${d.in.split("-").reverse().slice(0, 2).join("/")} au ${d.out.split("-").reverse().slice(0, 2).join("/")}`).join(" et ");
    const dossierArchiver = {
      nomPatient, ongPartenaire: selectedOng, typePatient, numDossier: numDossierPatient,
      dateNaissance, telephone, dateHeure: new Date().toLocaleDateString("fr-FR"),
      periodeSejourString: sejourTexte,
      dateEntreePourTri: datesTrouvees.length > 0 ? datesTrouvees[0].in : "9999-12-31",
      totalGlobal: somme, totalSaisiePapierDH: 0, contientErreurs: false, verrouilleFacture: false,
      fiches: [...fichesDossier], status: 'archived', timestamp: Date.now()
    };
    try {
      const apiData = toEpisodeApi(dossierArchiver);
      if (dossierId) {
        await chf.updateEpisode(dossierId, apiData);
        const updated = verifications.map(v => v.id === dossierId ? { ...v, ...dossierArchiver } : v);
        setVerifications(updated);
      } else {
        const newEpisode = await chf.createEpisode(apiData);
        setVerifications(prev => [fromEpisodeApi(newEpisode), ...prev]);
      }
      setDossierActif(false);
      setNomPatient(""); setSelectedOng(""); setNumDossierPatient(""); sessionStorage.removeItem('numDossierPatient');
      setFichesDossier([]); setModePreValidation(false); viderLeCalculateurFicheUniquement(); setDossierId(null);
      localStorage.removeItem(LOG_DOSSIER_BROUILLON_KEY);
      showToast("Dossier archivé !", "success");
    } catch (error) {
      if (!error.isOfflineQueue) { showToast("Erreur archivage: " + error.message, "error"); return; }
      const updated = verifications.map(v => v.id === dossierId ? { ...v, ...dossierArchiver } : v);
      setVerifications(updated);
      setDossierActif(false);
      setNomPatient(""); setSelectedOng(""); setNumDossierPatient(""); sessionStorage.removeItem('numDossierPatient');
      setFichesDossier([]); setModePreValidation(false); viderLeCalculateurFicheUniquement(); setDossierId(null);
      localStorage.removeItem(LOG_DOSSIER_BROUILLON_KEY);
      showToast("📴 Dossier archivé hors ligne — sera synchronisé au retour d'internet", "info");
    }
  };

  const verifierConflit = async () => {
    if (!dossierId || !dossierUpdatedAtOuverture) return false;
    try {
      const episodes = await chf.getEpisodes();
      const actuel = episodes.map(ep => fromEpisodeApi(ep)).find(ep => ep.id === dossierId);
      if (actuel && actuel.updatedAt && actuel.updatedAt !== dossierUpdatedAtOuverture) return true;
    } catch (e) { /* hors ligne */ }
    return false;
  };

  const finaliserEtArchiverDossierOfficiel = async () => {
    const somme = fichesDossier.reduce((s, f) => s + f.totalGlobal, 0);
    const demanderConfirmation = () => setConfirmModal({
      titre: "Archiver ce dossier ?",
      message: `Patient : ${nomPatient}\n${fichesDossier.length} fiche(s) — le dossier sera clôturé et archivé.`,
      detail: `${formatGourdes(somme)} Gdes  (${formatDH(somme)} DH)`,
      confirmLabel: "🟢 Archiver",
      onConfirm: () => { setConfirmModal(null); executerArchivage(); },
      onCancel: () => setConfirmModal(null)
    });
    if (await verifierConflit()) {
      setConfirmModal({
        titre: "⚠️ Ce dossier a été modifié entre-temps",
        message: "Une autre personne (ou un autre appareil) a modifié ce dossier depuis que tu l'as ouvert ici. Continuer risque d'écraser ses changements.",
        confirmLabel: "Continuer quand même",
        danger: true,
        onConfirm: () => { setConfirmModal(null); demanderConfirmation(); },
        onCancel: () => setConfirmModal(null)
      });
      return;
    }
    demanderConfirmation();
  };

  // --- CORRECTION DE LA SUSPENSION : sauvegarde les fiches ---
  const executerSuspension = async (fichesAUtiliser) => {
    const listeFiches = fichesAUtiliser || fichesDossier;
    const somme = listeFiches.reduce((s, f) => s + f.totalGlobal, 0);
    const datesTrouvees = [];
    listeFiches.forEach(f => {
      if (f.rawState?.dateEntree1) datesTrouvees.push({ in: f.rawState.dateEntree1, out: f.rawState.dateSortie1 });
      if (f.rawState?.multiPeriode && f.rawState?.dateEntree2) datesTrouvees.push({ in: f.rawState.dateEntree2, out: f.rawState.dateSortie2 });
    });
    let sejourTexte = "—";
    if (datesTrouvees.length > 0) sejourTexte = datesTrouvees.map(d => d.in === d.out ? d.in.split("-").reverse().slice(0,2).join("/") : `du ${d.in.split("-").reverse().slice(0,2).join("/")} au ${d.out.split("-").reverse().slice(0,2).join("/")}`).join(" et ");

    const dossierSuspendu = {
      nomPatient,
      ongPartenaire: selectedOng,
      typePatient,
      numDossier: numDossierPatient,
      dateNaissance,
      telephone,
      dateHeure: new Date().toLocaleDateString("fr-FR"),
      periodeSejourString: sejourTexte,
      dateEntreePourTri: datesTrouvees.length > 0 ? datesTrouvees[0].in : "9999-12-31",
      totalGlobal: somme,
      totalSaisiePapierDH: 0,
      contientErreurs: false,
      verrouilleFacture: false,
      fiches: [...listeFiches],  // ⬅️ CONSERVE LES FICHES
      status: 'suspendu',
      dateSuspension: new Date().toISOString(),
      timestamp: Date.now()
    };

    try {
      await chf.updateEpisode(dossierId, toEpisodeApi(dossierSuspendu));
      const updatedItems = verifications.map(v => v.id === dossierId ? { ...v, ...dossierSuspendu } : v);
      setVerifications(updatedItems);
      showToast(`Dossier suspendu avec ${listeFiches.length} fiche(s)`, "success");
    } catch (error) {
      if (!error.isOfflineQueue) {
        showToast("Erreur suspension: " + error.message, "error");
        return;
      }
      const updatedItems = verifications.map(v => v.id === dossierId ? { ...v, ...dossierSuspendu } : v);
      setVerifications(updatedItems);
      showToast("📴 Dossier suspendu hors ligne — sera synchronisé au retour d'internet", "info");
    }

    // Nettoyer l'état local
    setDossierActif(false);
    setNomPatient("");
    setSelectedOng("");
    setNumDossierPatient("");
    sessionStorage.removeItem('numDossierPatient');
    setFichesDossier([]);
    setModePreValidation(false);
    viderLeCalculateurFicheUniquement();
    setDossierId(null);
    localStorage.removeItem(LOG_DOSSIER_BROUILLON_KEY);
  };

  const suspendreDossier = async () => {
    if (!dossierId) { showToast("Aucun dossier actif.", "error"); return; }
    avecFicheEnCoursAjoutee((fichesFinales) => {
      const demanderConfirmation = () => setConfirmModal({
        titre: "Suspendre ce dossier ?",
        message: `Le dossier de ${nomPatient} sera mis en pause. Il pourra être rouvert plus tard depuis les Archives.`,
        confirmLabel: "⏸️ Suspendre",
        onConfirm: () => { setConfirmModal(null); executerSuspension(fichesFinales); },
        onCancel: () => setConfirmModal(null)
      });
      (async () => {
        if (await verifierConflit()) {
          setConfirmModal({
            titre: "⚠️ Ce dossier a été modifié entre-temps",
            message: "Une autre personne (ou un autre appareil) a modifié ce dossier depuis que tu l'as ouvert ici. Continuer risque d'écraser ses changements.",
            confirmLabel: "Continuer quand même",
            danger: true,
            onConfirm: () => { setConfirmModal(null); demanderConfirmation(); },
            onCancel: () => setConfirmModal(null)
          });
          return;
        }
        demanderConfirmation();
      })();
    });
  };

  // --- REPORT AU MOIS SUIVANT : pour un dossier non complet en fin de mois. Garde les fiches
  // déjà saisies (comme la suspension) mais marque le dossier avec le mois cible, pour qu'il soit
  // exclu du rapport Excel du mois en cours et facilement retrouvable pour le mois suivant.
  const executerReport = async (fichesAUtiliser) => {
    const listeFiches = fichesAUtiliser || fichesDossier;
    const somme = listeFiches.reduce((s, f) => s + f.totalGlobal, 0);
    const datesTrouvees = [];
    listeFiches.forEach(f => {
      if (f.rawState?.dateEntree1) datesTrouvees.push({ in: f.rawState.dateEntree1, out: f.rawState.dateSortie1 });
      if (f.rawState?.multiPeriode && f.rawState?.dateEntree2) datesTrouvees.push({ in: f.rawState.dateEntree2, out: f.rawState.dateSortie2 });
    });
    let sejourTexte = "—";
    if (datesTrouvees.length > 0) sejourTexte = datesTrouvees.map(d => d.in === d.out ? d.in.split("-").reverse().slice(0,2).join("/") : `du ${d.in.split("-").reverse().slice(0,2).join("/")} au ${d.out.split("-").reverse().slice(0,2).join("/")}`).join(" et ");

    const cibleMois = new Date(); cibleMois.setMonth(cibleMois.getMonth() + 1);
    const moisReport = `${cibleMois.getFullYear()}-${String(cibleMois.getMonth() + 1).padStart(2, '0')}`;

    const dossierReporte = {
      nomPatient,
      ongPartenaire: selectedOng,
      typePatient,
      numDossier: numDossierPatient,
      dateNaissance,
      telephone,
      dateHeure: new Date().toLocaleDateString("fr-FR"),
      periodeSejourString: sejourTexte,
      dateEntreePourTri: datesTrouvees.length > 0 ? datesTrouvees[0].in : "9999-12-31",
      totalGlobal: somme,
      totalSaisiePapierDH: 0,
      contientErreurs: false,
      verrouilleFacture: false,
      fiches: [...listeFiches],  // ⬅️ CONSERVE LES FICHES (dossier non complet, pas encore facturable)
      status: 'reporte',
      moisReport,
      dateSuspension: new Date().toISOString(),
      timestamp: Date.now()
    };

    try {
      await chf.updateEpisode(dossierId, toEpisodeApi(dossierReporte));
      const updatedItems = verifications.map(v => v.id === dossierId ? { ...v, ...dossierReporte } : v);
      setVerifications(updatedItems);
      showToast(`Dossier reporté à ${cibleMois.toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}`, "success");
    } catch (error) {
      if (!error.isOfflineQueue) { showToast("Erreur report: " + error.message, "error"); return; }
      const updatedItems = verifications.map(v => v.id === dossierId ? { ...v, ...dossierReporte } : v);
      setVerifications(updatedItems);
      showToast("📴 Report enregistré hors ligne — sera synchronisé au retour d'internet", "info");
    }

    // Nettoyer l'état local
    setDossierActif(false);
    setNomPatient("");
    setSelectedOng("");
    setNumDossierPatient("");
    sessionStorage.removeItem('numDossierPatient');
    setFichesDossier([]);
    setModePreValidation(false);
    viderLeCalculateurFicheUniquement();
    setDossierId(null);
    localStorage.removeItem(LOG_DOSSIER_BROUILLON_KEY);
  };

  const reporterDossierAuMoisSuivant = async () => {
    if (!dossierId) { showToast("Aucun dossier actif.", "error"); return; }
    avecFicheEnCoursAjoutee((fichesFinales) => {
      const cibleMois = new Date(); cibleMois.setMonth(cibleMois.getMonth() + 1);
      const libelleMois = cibleMois.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
      const demanderConfirmation = () => setConfirmModal({
        titre: "Reporter ce dossier au mois suivant ?",
        message: `Le dossier de ${nomPatient} n'est pas complet. Il sera reporté à ${libelleMois} avec ses ${fichesFinales.length} fiche(s), et exclu du rapport Excel du mois en cours.`,
        confirmLabel: "📅 Reporter",
        onConfirm: () => { setConfirmModal(null); executerReport(fichesFinales); },
        onCancel: () => setConfirmModal(null)
      });
      (async () => {
        if (await verifierConflit()) {
          setConfirmModal({
            titre: "⚠️ Ce dossier a été modifié entre-temps",
            message: "Une autre personne (ou un autre appareil) a modifié ce dossier depuis que tu l'as ouvert ici. Continuer risque d'écraser ses changements.",
            confirmLabel: "Continuer quand même",
            danger: true,
            onConfirm: () => { setConfirmModal(null); demanderConfirmation(); },
            onCancel: () => setConfirmModal(null)
          });
          return;
        }
        demanderConfirmation();
      })();
    });
  };

  const executerAnnulation = async () => {
    enregistrerAudit('annulation_dossier', { dossierId, nomPatient, ongPartenaire: selectedOng, nombreFiches: fichesDossier.length });
    restituerStock(fichesDossier);
    try {
      await chf.deleteEpisode(dossierId);
      showToast("Dossier annulé.", "success");
    } catch (error) {
      if (!error.isOfflineQueue) { showToast("Erreur suppression: " + error.message, "error"); return; }
      if (String(dossierId).startsWith('local-')) chf.removePendingByLocalId(dossierId);
      showToast("📴 Dossier annulé hors ligne", "info");
    }
    setDossierActif(false);
    setNomPatient(""); setSelectedOng(""); setNumDossierPatient(""); sessionStorage.removeItem('numDossierPatient');
    setFichesDossier([]); setModePreValidation(false); viderLeCalculateurFicheUniquement(); setDossierId(null);
    localStorage.removeItem(LOG_DOSSIER_BROUILLON_KEY);
    setVerifications(prev => prev.filter(v => v.id !== dossierId));
  };

  const annulerDossier = () => {
    if (!dossierId) { showToast("Aucun dossier actif.", "error"); return; }
    setConfirmModal({
      titre: "Annuler ce dossier ?",
      message: `Le dossier de ${nomPatient} et toutes ses fiches (${fichesDossier.length}) seront définitivement supprimés. Cette action est irréversible.`,
      confirmLabel: "🗑️ Annuler le dossier",
      danger: true,
      onConfirm: () => { setConfirmModal(null); executerAnnulation(); },
      onCancel: () => setConfirmModal(null)
    });
  };

  const réimporterDossierDepuisArchives = (doc) => chargerDossierExistant(doc);
  const supprimerDossierArchive = (id) => {
    const dossier = verifications.find(v => v.id === id);
    setConfirmModal({
      titre: "Supprimer définitivement ce dossier ?",
      message: `${dossier ? `Patient : ${dossier.nomPatient}\n` : ''}Cette action est irréversible — le dossier et son historique de facturation seront perdus pour de bon.`,
      confirmLabel: "🗑️ Supprimer définitivement",
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        enregistrerAudit('suppression_archive', { dossierId: id, nomPatient: dossier?.nomPatient || null, totalGlobal: dossier?.totalGlobal || null });
        try {
          await chf.deleteEpisode(id);
          const updated = await chf.getEpisodes();
          setVerifications(updated.map(ep => fromEpisodeApi(ep)));
          showToast("Dossier supprimé", "success");
        } catch (e) { showToast("Erreur suppression: " + e.message, "error"); }
      },
      onCancel: () => setConfirmModal(null)
    });
  };

  const executerSauvegardeGlobaleJSON = async () => {
    const motDePasse = prompt("🔒 Choisis une phrase secrète pour protéger ce fichier de sauvegarde.\n\nGarde-la précieusement : sans elle, le fichier ne pourra plus être relu (par toi ou par quiconque le trouverait).");
    if (!motDePasse || motDePasse.length < 6) { showToast("Sauvegarde annulée (phrase secrète requise, 6 caractères minimum).", "error"); return; }
    const backup = { verifications, ongTargets, medicaments, actes, paiements };
    const payload = await chiffrerTexte(JSON.stringify(backup), motDePasse);
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = `Backup_Total_${new Date().toISOString().slice(0, 10)}.chf.json`; link.click();
    localStorage.setItem("chf-last-backup-timestamp", Date.now().toString());
    setNeedsBackupWarning(false);
    enregistrerAudit('export_sauvegarde', { nombreDossiers: verifications.length, nombrePaiements: paiements.length });
    showToast("Sauvegarde chiffrée effectuée !", "success");
  };

  const executerRestaurationGlobaleJSON = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const brut = JSON.parse(evt.target.result);
        let res;
        if (brut && brut.chfChiffre) {
          const motDePasse = prompt("🔒 Ce fichier est chiffré. Entre la phrase secrète utilisée à la sauvegarde :");
          if (!motDePasse) { showToast("Restauration annulée.", "error"); return; }
          try {
            const texteClair = await dechiffrerTexte(brut, motDePasse);
            res = JSON.parse(texteClair);
          } catch (err) { showToast("Phrase secrète incorrecte ou fichier corrompu.", "error"); return; }
        } else {
          res = brut;
        }
        if (res.ongTargets) setOngTargets(res.ongTargets);
        if (res.medicaments) setMedicaments(res.medicaments);
        if (res.actes) setActes(res.actes);
        if (res.verifications) {
          for (let d of res.verifications) { await chf.createEpisode(toEpisodeApi(d)); }
          const episodes = await chf.getEpisodes();
          setVerifications(episodes.map(ep => fromEpisodeApi(ep)));
        }
        enregistrerAudit('restauration_sauvegarde', { nombreDossiers: res.verifications?.length || 0 });
        showToast("Base restaurée !", "success");
      } catch (err) { showToast("Fichier invalide.", "error"); }
    };
    reader.readAsText(file);
  };

  const injecterLigneAuCalculateur = (item, cat, qte) => {
    // Si "Nouveau prix" est choisi ET que l'article a bien un nouveau prix défini, on l'utilise ;
    // sinon (article sans nouveau prix, ou "Actuel" choisi) on garde le prix actuel normalement.
    const prixEffectif = (tarifChoisi === "nouveau" && item.nouveauPrix != null && item.nouveauPrix !== "") ? parseFloat(item.nouveauPrix) : item.prix;
    setLignesCalcul(prev => {
      const index = prev.findIndex(l => l.itemId === item.id && l.type === cat);
      if (index !== -1) return prev.map((l, idx) => idx === index ? { ...l, qte: l.qte + qte } : l);
      return [...prev, { id: "l-" + Math.random().toString(36).slice(2, 6), itemId: item.id, type: cat, sub: cat === "med" ? "" : (item.sub || ""), nom: item.nom, qte, prix: prixEffectif }];
    });
    setPaiementEffectue(false);
  };

  const j1 = useMemo(() => { if (!dateEntree1 || !dateSortie1) return 0; const d = (new Date(dateSortie1) - new Date(dateEntree1)) / 86400000; if (d < 0) { setDateSortie1(""); return 0; } return Math.max(0, Math.floor(d)); }, [dateEntree1, dateSortie1]);
  const totalE1 = j1 * CONFIG_LITS[typeLit1].prix;
  const j2 = useMemo(() => { if (!multiPeriode || !dateEntree2 || !dateSortie2) return 0; const d = (new Date(dateSortie2) - new Date(dateEntree2)) / 86400000; return Math.max(0, Math.floor(d)); }, [multiPeriode, dateEntree2, dateSortie2]);
  const totalE2 = multiPeriode ? j2 * CONFIG_LITS[typeLit2].prix : 0;
  const totalGeneralExeat = totalE1 + totalE2;
  const totalChirSpec = useMemo(() => { const p = parseFloat(prixChirSpec); return isNaN(p) ? 0 : p; }, [hasChirSpec, prixChirSpec]);

  const totalsParService = useMemo(() => {
    const v = {}; CATEGORIES_LISTE.forEach(c => v[c.key] = 0);
    v.hospit = totalGeneralExeat; v.chirurgie = totalChirSpec;
    lignesCalcul.forEach(l => { const m = l.qte * l.prix; if (l.type === "med") v.med += m; else if (l.type === "acte") { if (v[l.sub] !== undefined) v[l.sub] += m; else v.chirurgie += m; } });
    return v;
  }, [lignesCalcul, totalGeneralExeat, totalChirSpec]);

  const grandTotalGlobalFiche = useMemo(() => Object.values(totalsParService).reduce((a, b) => a + b, 0), [totalsParService]);
  const totalDossierGourdes = useMemo(() => fichesDossier.reduce((s, f) => s + f.totalGlobal, 0), [fichesDossier]);
  const cumulCategoriesDossierActif = useMemo(() => { const b = {}; CATEGORIES_LISTE.forEach(c => b[c.key] = 0); fichesDossier.forEach(f => { Object.keys(f.breakdown).forEach(k => { if (b[k] !== undefined) b[k] += f.breakdown[k]; }); }); return b; }, [fichesDossier]);
  const numeroFicheCourante = useMemo(() => fichesDossier.length > 0 ? Math.max(...fichesDossier.map(f => f.numeroFiche), 0) + 1 : 1, [fichesDossier]);

  const restituerStock = async (fiches) => {
    const aRestituer = {};
    (fiches || []).forEach(f => {
      (f.rawState?.lignesCalcul || []).forEach(l => {
        if (l.type === 'med') aRestituer[l.itemId] = (aRestituer[l.itemId] || 0) + (l.qte || 0);
      });
    });
    if (Object.keys(aRestituer).length === 0) return;
    const updated = medicaments.map(m => aRestituer[m.id] ? { ...m, quantite: (m.quantite || 0) + aRestituer[m.id] } : m);
    setMedicaments(updated);
    const { LOG_MEDS_KEY } = require('../api/firebase');
    localStorage.setItem(LOG_MEDS_KEY, JSON.stringify(updated));
    try { await chf.updateCatalog('medicaments', updated); } catch (e) { console.warn("Erreur restitution stock:", e); }
  };

  const supprimerFicheDossier = (idF) => {
    if (confirm("Supprimer cette fiche ?")) {
      const fiche = fichesDossier.find(f => f.id === idF);
      setFichesDossier(prev => prev.filter(f => f.id !== idF));
      if (fiche) restituerStock([fiche]);
      showToast("Fiche supprimée — stock remis à jour", "success");
    }
  };

  const changerTypeOngPourDossier = async (idCible, nouveauType, nouvelOng) => {
    if (nouveauType === "ONG" && !nouvelOng) { showToast("Sélectionne une ONG.", "error"); return; }
    const executerChangement = async () => {
      const dossierAvant = verifications.find(v => v.id === idCible);
      const sortDuLot = dossierAvant?.numeroLot != null;
      const maj = { typePatient: nouveauType, ongPartenaire: nouveauType === "ONG" ? nouvelOng : "" };
      if (sortDuLot) { maj.numeroLot = null; maj.verrouilleFacture = false; }
      if (idCible === dossierId) {
        setTypePatient(nouveauType);
        setSelectedOng(nouveauType === "ONG" ? nouvelOng : "");
      }
      setVerifications(prev => prev.map(v => v.id === idCible ? { ...v, ...maj } : v));
      try {
        await chf.updateEpisode(idCible, toEpisodeApi(maj));
        enregistrerAudit('changement_type_ong', { dossierId: idCible, nouveauType, nouvelOng, sortDuLot });
        showToast(sortDuLot ? `Type mis à jour — retiré du Lot ${dossierAvant.numeroLot}` : "Type de patient mis à jour", "success");
      } catch (error) {
        if (error.isOfflineQueue) showToast("📴 Changement enregistré hors ligne", "info");
        else showToast("Erreur: " + error.message, "error");
      }
    };
    const dossierActuel = verifications.find(v => v.id === idCible);
    if (dossierActuel?.numeroLot != null) {
      setConfirmModal({
        titre: "⚠️ Ce dossier fait partie d'un lot déjà envoyé",
        message: `Changer son partenaire le retirera du Lot ${dossierActuel.numeroLot} de ${dossierActuel.ongPartenaire}. Il faudra ensuite le rattacher à un nouveau lot séparément (avec le nouveau partenaire). Continuer ?`,
        confirmLabel: "Oui, changer et retirer du lot",
        danger: true,
        onConfirm: () => { setConfirmModal(null); executerChangement(); },
        onCancel: () => setConfirmModal(null)
      });
      return;
    }
    executerChangement();
  };
  const changerTypeOng = (nouveauType, nouvelOng) => changerTypeOngPourDossier(dossierId, nouveauType, nouvelOng);

  const changerNomPatientPourDossier = async (idCible, nouveauNom) => {
    const propre = (nouveauNom || "").trim();
    if (!propre) { showToast("Le nom ne peut pas être vide.", "error"); return; }
    if (idCible === dossierId) setNomPatient(propre);
    setVerifications(prev => prev.map(v => v.id === idCible ? { ...v, nomPatient: propre } : v));
    if (!idCible) { showToast("Nom du patient mis à jour", "success"); return; }
    try {
      await chf.updateEpisode(idCible, toEpisodeApi({ nomPatient: propre }));
      enregistrerAudit('changement_nom_patient', { dossierId: idCible, nouveauNom: propre });
      showToast("Nom du patient mis à jour", "success");
    } catch (error) {
      if (error.isOfflineQueue) showToast("📴 Changement enregistré hors ligne", "info");
      else showToast("Erreur: " + error.message, "error");
    }
  };
  const changerNomPatient = (nouveauNom) => changerNomPatientPourDossier(dossierId, nouveauNom);

  // --- Cette fonction est appelée par CalculateurPanel via onEnregistrerFiche ---
  // Elle est déjà définie plus haut comme enregistrerNouvelleFiche

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!dossierActif || modePreValidation) return;
      if (e.ctrlKey && e.shiftKey && e.key === "Enter") { e.preventDefault(); declencherPreValidationDossier(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dossierActif, modePreValidation]);

  useEffect(() => {
    const warningQuitter = (e) => { if (dossierActif) { e.preventDefault(); e.returnValue = "Dossier en cours."; } };
    window.addEventListener("beforeunload", warningQuitter);
    return () => window.removeEventListener("beforeunload", warningQuitter);
  }, [dossierActif]);

  useEffect(() => {
    const LIMITE_INACTIVITE_MS = 15 * 60 * 1000;
    const DELAI_AVERTISSEMENT_MS = 2 * 60 * 1000; // avertit 2 minutes avant la déconnexion
    let minuteurAvertissement, minuteurDeconnexion;
    const reinitialiserMinuteur = () => {
      clearTimeout(minuteurAvertissement);
      clearTimeout(minuteurDeconnexion);
      setAvertissementInactivite(false);
      minuteurAvertissement = setTimeout(() => {
        setAvertissementInactivite(true);
      }, LIMITE_INACTIVITE_MS - DELAI_AVERTISSEMENT_MS);
      minuteurDeconnexion = setTimeout(() => {
        showToast("🔒 Déconnexion automatique après 15 minutes d'inactivité", "info");
        onQuitter();
      }, LIMITE_INACTIVITE_MS);
    };
    const evenementsActivite = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    evenementsActivite.forEach(ev => window.addEventListener(ev, reinitialiserMinuteur));
    reinitialiserMinuteur();
    return () => {
      clearTimeout(minuteurAvertissement);
      clearTimeout(minuteurDeconnexion);
      evenementsActivite.forEach(ev => window.removeEventListener(ev, reinitialiserMinuteur));
    };
  }, []);

  if (chargement) return <div className="min-h-screen flex items-center justify-center">Chargement...</div>;

  return (
    <div className="min-h-screen w-full flex flex-col font-sans text-[#1E2A24]">
      <ToastManager toasts={toasts} removeToast={removeToast} />
      <ConnectionStatus />
      <StockAlertBadge items={lowStockItems} />
      {avertissementInactivite && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-amber-500 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-3 text-sm font-bold">
          <span>⏳ Tu vas être déconnecté(e) dans 2 minutes si tu ne fais rien.</span>
          <button onClick={() => setAvertissementInactivite(false)} className="bg-white text-amber-700 px-3 py-1 rounded-lg text-xs font-black whitespace-nowrap">Je suis toujours là</button>
        </div>
      )}
      {confirmModal && <ConfirmModal {...confirmModal} />}
      {achatExpressOuvert && (
        <AchatExpress
          medicaments={medicaments} actes={actes} setMedicaments={setMedicaments}
          userRole={userRole} showToast={showToast}
          onFermer={() => setAchatExpressOuvert(false)}
          onDossierCree={(episode) => setVerifications(prev => [episode, ...prev])}
        />
      )}

      {dossierActif && !modePreValidation && (
        <div className="fixed top-28 right-4 z-40 bg-[#1E2A24] text-white px-4 py-2 rounded-xl shadow-2xl border border-emerald-500/30 flex flex-col items-end">
          <span className="text-[9px] uppercase tracking-wider text-[#9FB8A8] font-bold">Dossier {nomPatient}</span>
          <span className="text-sm font-mono font-black">{formatGourdes(totalDossierGourdes + grandTotalGlobalFiche)} Gdes</span>
          <span className="text-[10px] font-mono text-emerald-400">{formatDH(totalDossierGourdes + grandTotalGlobalFiche)} DH</span>
        </div>
      )}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="floating-btn p-3 bg-[#1E2A24] text-[#F7F5F0] rounded-full shadow-lg"><ArrowUp size={18} /></button>
        <button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })} className="floating-btn p-3 bg-[#1E2A24] text-[#F7F5F0] rounded-full shadow-lg"><ArrowDown size={18} /></button>
      </div>
      <header className="border-b border-[#D8D2C2] bg-[#1E2A24] text-[#F7F5F0] p-4">
        <div className="max-w-3xl mx-auto flex justify-between items-baseline mb-2">
          <div><p className="text-[10px] uppercase tracking-widest text-[#9FB8A8]">Centre Hospitalier de Fontaine</p><h1 className="text-xl font-bold tracking-tight">CHF — Système Hospitalier</h1></div>
          <div className="flex gap-2 text-[10px] font-mono items-center flex-wrap">
            <span className="bg-blue-600 text-white px-2 py-1 rounded-full">{userDisplayName} ({userRole})</span>
            {(userRole === "comptable" || userRole === "direction" || userRole === "administrateur") && (
              <button onClick={() => setAchatExpressOuvert(true)} className="bg-amber-500 hover:bg-amber-600 px-2 py-1 rounded font-bold">⚡ Express</button>
            )}
            <button onClick={() => setModeSimulation(!modeSimulation)} className={`px-2 py-1 rounded text-xs font-bold ${modeSimulation ? 'bg-emerald-600' : 'bg-blue-600'}`}>{modeSimulation ? '🧮 Simulation' : '🧮 Simu'}</button>
            <button onClick={executerSauvegardeGlobaleJSON} className={`px-2 py-1 rounded relative ${needsBackupWarning ? 'bg-red-600 animate-pulse' : 'bg-gray-700'}`}>📥 Backup {needsBackupWarning && <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full animate-ping"></span>}</button>
            <label className="bg-gray-700 px-2 py-1 rounded cursor-pointer">📤 Restore <input type="file" onChange={executerRestaurationGlobaleJSON} className="hidden" accept=".json" /></label>
            <span className="bg-purple-600 px-2 py-1 rounded-full">{verifications.length} Archivés</span>
            <button onClick={onQuitter} className="bg-red-900/80 px-2 py-1 rounded">Quitter</button>
          </div>
        </div>
        <div className="max-w-3xl mx-auto flex flex-wrap gap-2 text-xs mt-3">
          <button onClick={() => { setOnglet("accueil"); setModePreValidation(false); }} className={`px-4 py-2 font-medium border-b-2 ${onglet === "accueil" ? "border-white text-white" : "text-[#9FB8A8]"}`}>🏛️ Accueil</button>
          <button onClick={() => setOnglet("calcul")} className={`px-4 py-2 font-medium border-b-2 ${onglet === "calcul" ? "border-white text-white" : "text-[#9FB8A8]"}`}>Calcul Facture</button>
          <button onClick={() => { setOnglet("verifie"); setModePreValidation(false); }} className={`px-4 py-2 font-medium border-b-2 ${onglet === "verifie" ? "border-white text-white" : "text-[#9FB8A8]"}`}>📁 Archives</button>

          {(userRole === "administrateur" || userRole === "direction") && (
            <button onClick={() => { setOnglet("analyse"); setModePreValidation(false); }} className={`px-4 py-2 font-medium border-b-2 ${onglet === "analyse" ? "border-white text-white" : "text-[#9FB8A8]"}`}>📊 Pilotage CHF</button>
          )}

          {(userRole === "administrateur" || userRole === "direction") && (
            <><button onClick={() => setOnglet("meds")} className={`px-4 py-2 font-medium border-b-2 ${onglet === "meds" ? "border-white text-white" : "text-[#9FB8A8]"}`}>Tarifs Pharma</button>
              <button onClick={() => setOnglet("actes")} className={`px-4 py-2 font-medium border-b-2 ${onglet === "actes" ? "border-white text-white" : "text-[#9FB8A8]"}`}>Tarifs Actes</button>
              <button onClick={() => setOnglet("stock")} className={`px-4 py-2 font-medium border-b-2 ${onglet === "stock" ? "border-white text-white" : "text-[#9FB8A8]"}`}>📦 Stock</button>
              <button onClick={() => setOnglet("ong")} className={`px-4 py-2 font-medium border-b-2 ${onglet === "ong" ? "border-white text-white" : "text-[#9FB8A8]"}`}>🤝 Partenaires</button></>
          )}
          {userRole === "administrateur" && (
            <button onClick={() => setOnglet("users")} className={`px-4 py-2 font-medium border-b-2 ${onglet === "users" ? "border-white text-white" : "text-[#9FB8A8]"}`}>👥 Utilisateurs</button>
          )}
          {(userRole === "direction" || userRole === "administrateur") && <button onClick={() => setOnglet("dashboard_direction")} className={`px-4 py-2 font-medium border-b-2 ${onglet === "dashboard_direction" ? "border-white text-white" : "text-[#9FB8A8]"}`}>📊 Direction</button>}
          {(userRole === "comptable" || userRole === "direction" || userRole === "administrateur") && (
            <><button onClick={() => setOnglet("dashboard_caisse")} className={`px-4 py-2 font-medium border-b-2 ${onglet === "dashboard_caisse" ? "border-white text-white" : "text-[#9FB8A8]"}`}>💵 Caisse</button>
              <button onClick={() => setOnglet("demandes")} className={`px-4 py-2 font-medium border-b-2 ${onglet === "demandes" ? "border-white text-white" : "text-[#9FB8A8]"}`}>📨 Demandes</button></>
          )}
        </div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 pb-24">
        {onglet === "accueil" && (
          <AccueilPanel
            verifications={verifications} paiements={paiements} medicaments={medicaments}
            userRole={userRole} userDisplayName={userDisplayName}
            onNaviguer={(cible) => { setOnglet(cible); setModePreValidation(false); }}
            onOuvrirAchatExpress={() => setAchatExpressOuvert(true)}
          />
        )}
        {onglet === "dashboard_direction" && (userRole === "direction" || userRole === "administrateur") && <DashboardDirectionPanel verifications={verifications} paiements={paiements} medicaments={medicaments} />}
        {onglet === "dashboard_caisse" && (userRole === "comptable" || userRole === "direction" || userRole === "administrateur") && <DashboardCaissePanel verifications={verifications} paiements={paiements} userDisplayName={userDisplayName} listeOng={listeOngNoms} showToast={showToast} />}
        {onglet === "calcul" && modePreValidation && (
          <div className="bg-white p-6 rounded-xl border border-emerald-400 shadow-xl space-y-4">
            <div className="text-center border-b pb-2"><span className="text-emerald-800 font-bold uppercase text-[11px]">Contrôle final</span><h3 className="text-lg font-black">📋 Totaux analytiques</h3><p className="text-xs text-gray-500">{nomPatient} | {selectedOng}</p></div>
            <div className="bg-gray-50 p-4 rounded-xl border shadow-inner space-y-2">
              <div className="grid grid-cols-3 font-bold font-mono text-xs border-b pb-2 mb-2"><span>CATÉGORIE</span><span className="text-right">Gdes</span><span className="text-right text-emerald-800">DH</span></div>
              {CATEGORIES_LISTE.map(cat => { const m = cumulCategoriesDossierActif[cat.key]; if (m === 0) return null; return <div key={cat.key} className="grid grid-cols-3 font-mono text-[12px] py-1 border-b border-dashed"><span>{cat.label}</span><span className="text-right font-bold">{formatGourdes(m)}</span><span className="text-right font-bold text-emerald-800">{formatDH(m)}</span></div>; })}
              <div className="grid grid-cols-3 font-mono font-black text-sm pt-3 mt-2 border-t-2"><span>TOTAL</span><span className="text-right">{formatGourdes(totalDossierGourdes)}</span><span className="text-right text-emerald-800">{formatDH(totalDossierGourdes)}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3"><button onClick={() => setModePreValidation(false)} className="bg-gray-100 hover:bg-gray-200 rounded-xl py-3 text-xs font-bold">Retour</button><button onClick={finaliserEtArchiverDossierOfficiel} className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl py-3 text-xs font-black">🟢 Archiver</button></div>
          </div>
        )}
        {onglet === "calcul" && !modePreValidation && (
          modeSimulation ? <Simulateur medicaments={medicaments} actes={actes} /> :
            <CalculateurPanel
              medicaments={medicaments} actes={actes} setActes={setActes} lignes={lignesCalcul} setLignes={setLignesCalcul}
              dossierActif={dossierActif} nomPatient={nomPatient} selectedOng={selectedOng}
              onNouveauDossier={initialiserNouveauDossier} onAnnulerDossier={annulerDossier} onCloturerDossier={declencherPreValidationDossier}
              fichesDossier={fichesDossier} onSupprimerFicheDossier={supprimerFicheDossier} 
              idFicheEnCoursDEdition={idFicheEnCoursDEdition}  // <-- passé pour affichage
              onEditerFiche={editerFiche}                       // <-- nouvelle prop
              numeroFicheCourante={numeroFicheCourante}
              dateEntree1={dateEntree1} setDateEntree1={setDateEntree1} dateSortie1={dateSortie1} setDateSortie1={setDateSortie1}
              typeLit1={typeLit1} setTypeLit1={setTypeLit1} j1={j1} totalE1={totalE1}
              multiPeriode={multiPeriode} setMultiPeriode={setMultiPeriode} dateEntree2={dateEntree2} setDateEntree2={setDateEntree2}
              dateSortie2={dateSortie2} setDateSortie2={setDateSortie2} typeLit2={typeLit2} setTypeLit2={setTypeLit2} j2={j2} totalE2={totalE2}
              hasChirSpec={hasChirSpec} setHasChirSpec={setHasChirSpec} nomChirSpec={nomChirSpec} setNomChirSpec={setNomChirSpec}
              prixChirSpec={prixChirSpec} setPrixChirSpec={setPrixChirSpec} totalsParService={totalsParService} grandTotal={grandTotalGlobalFiche}
              totalDossierGourdes={totalDossierGourdes} onEnregistrerFiche={enregistrerNouvelleFiche}
              onViderFicheActive={viderLeCalculateurFicheUniquement} injecterLigne={injecterLigneAuCalculateur} tarifChoisi={tarifChoisi} setTarifChoisi={setTarifChoisi}
              modeSimulation={modeSimulation} userRole={userRole} userDisplayName={userDisplayName}
              setMedicaments={setMedicaments} medicamentsState={medicaments}
              dateNaissance={dateNaissance} telephone={telephone} numDossierPatient={numDossierPatient} typePatient={typePatient}
              dossierId={dossierId} setDossierId={setDossierId} patientsExistants={verifications} onChargerPatientExistant={chargerDossierExistant}
              paiementEffectue={paiementEffectue} setPaiementEffectue={setPaiementEffectue}
              showToast={showToast} onSuspendreDossier={suspendreDossier} onReporterDossier={reporterDossierAuMoisSuivant} onChangerTypeOng={changerTypeOng} onChangerNomPatient={changerNomPatient}
              listeOng={listeOngNoms}
            />
        )}
        {onglet === "verifie" && <HistoriqueVerifPanel verifications={verifications} setVerifications={setVerifications} onChargerPourModif={réimporterDossierDepuisArchives} onSupprimer={supprimerDossierArchive} filtreInitialNom={filtreArchivesInitialNom} clearFiltreInitialNom={() => setFiltreArchivesInitialNom("")} userRole={userRole} showToast={showToast} onChangerTypeOng={changerTypeOngPourDossier} listeOng={listeOngNoms} confirmModal={confirmModal} setConfirmModal={setConfirmModal} />}
        {onglet === "analyse" && (userRole === "administrateur" || userRole === "direction") && <AnalyticsPanel verifications={verifications} />}
        {onglet === "meds" && (userRole === "administrateur" || userRole === "direction") && <GrilleEditionPanel titre="de la Pharmacie" items={medicaments} setItems={setMedicaments} collectionName="medicaments" showToast={showToast} />}
        {onglet === "actes" && (userRole === "administrateur" || userRole === "direction") && <GrilleEditionPanel titre="des Actes" items={actes} setItems={setActes} collectionName="actes" showToast={showToast} />}
        {onglet === "stock" && (userRole === "administrateur" || userRole === "direction") && <GestionStockPanel items={medicaments} setItems={setMedicaments} showToast={showToast} />}
        {onglet === "ong" && (userRole === "administrateur" || userRole === "direction") && <GestionOngPanel listeOngDocs={listeOngDocs} showToast={showToast} />}
        {onglet === "users" && userRole === "administrateur" && <GestionUtilisateursPanel showToast={showToast} />}
        {onglet === "demandes" && (userRole === "comptable" || userRole === "direction" || userRole === "administrateur") && <DemandesPanel userRole={userRole} showToast={showToast} />}
      </main>
    </div>
  );
}

// ========================== ROOT ==========================
function ApplicationRoot() {
  const [authentifie, setAuthentifie] = useState(false);
  const [chargementAuth, setChargementAuth] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [userDisplayName, setUserDisplayName] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setChargementAuth(false);
      if (user) {
        setAuthentifie(true);
        setUserDisplayName(user.displayName || user.email || "Utilisateur");
        try {
          const doc = await db.collection('users').doc(user.uid).get();
          if (doc.exists) {
            const data = doc.data();
            setUserRole(data.role || 'auditeur');
            setUserDisplayName(data.displayName || user.email || 'Utilisateur');
          } else {
            await db.collection('users').doc(user.uid).set({
              uid: user.uid, email: user.email || '', role: 'auditeur',
              displayName: user.displayName || user.email || 'Utilisateur',
              active: true, createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setUserRole('auditeur');
          }
        } catch (error) {
          console.error("Erreur récupération rôle:", error);
          setUserRole('auditeur');
        }
      } else {
        setAuthentifie(false);
        setUserRole(null);
      }
    });
    return () => unsubscribe();
  }, []);

  if (chargementAuth) return <div className="min-h-screen w-full flex items-center justify-center bg-[#1E2A24]"><div className="text-white text-sm">Chargement...</div></div>;
  if (!authentifie) return <LoginScreen onLogin={() => setAuthentifie(true)} />;
  return <AppHospitaliere onQuitter={() => auth.signOut()} userRole={userRole} userDisplayName={userDisplayName} userEmail={auth.currentUser?.email} />;
}

module.exports = { AppHospitaliere, ApplicationRoot };

if (typeof document !== 'undefined' && document.getElementById('root')) {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<ApplicationRoot />);
}