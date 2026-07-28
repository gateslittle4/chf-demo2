// components/CalculateurPanel.js
const React = window.React;
const { useState, useEffect, useMemo, useRef } = React;
const { auth, db, enregistrerAudit } = require('../api/firebase');
const { chf, toPaiementApi } = require('../api/supabase');
const { LISTE_ONG, CONFIG_LITS } = require('../utils/constants');
const { formatGourdes, formatDH, echapperHTML } = require('../utils/helpers');
const { Search, Plus, X, Clock } = require('../utils/icons');
const ConfirmModal = require('./ConfirmModal');
const NouveauDossierForm = require('./NouveauDossierForm');
const HebergementForm = require('./HebergementForm');

// Ce composant est long mais intégral. Il gère la création d'épisode, l'ajout de lignes, les paiements,
// les dépôts, les impressions, etc. Toutes les conversions vers l'API sont faites.
function CalculateurPanel({
  medicaments, actes, lignes, setLignes, dossierActif, nomPatient, selectedOng, onNouveauDossier, onAnnulerDossier, onCloturerDossier,
  fichesDossier, onSupprimerFicheDossier,
  idFicheEnCoursDEdition, numeroFicheCourante,
  dateEntree1, setDateEntree1, dateSortie1, setDateSortie1,
  typeLit1, setTypeLit1, j1, totalE1, multiPeriode, setMultiPeriode, dateEntree2, setDateEntree2,
  dateSortie2, setDateSortie2, typeLit2, setTypeLit2, j2, totalE2, hasChirSpec, setHasChirSpec,
  nomChirSpec, setNomChirSpec, prixChirSpec, setPrixChirSpec, totalsParService, grandTotal,
  totalDossierGourdes, onEnregistrerFiche, onViderFicheActive, injecterLigne, modeSimulation,
  userRole, userDisplayName, setMedicaments, medicamentsState, dateNaissance, telephone, numDossierPatient, typePatient,
  dossierId, setDossierId, patientsExistants, onChargerPatientExistant,
  paiementEffectue, setPaiementEffectue,
  showToast,
  onSuspendreDossier,
  onChangerTypeOng
}) {
  const [inputNom, setInputNom] = useState("");
  const [inputOng, setInputOng] = useState(() => localStorage.getItem('chf-dernier-ong') || "");
  const [inputNumDossier, setInputNumDossier] = useState("");
  const [inputTypePatient, setInputTypePatient] = useState("ONG");
  const [serviceChoisi, setServiceChoisi] = useState("");
  const [inputDateNaissance, setInputDateNaissance] = useState("");
  const [inputTelephone, setInputTelephone] = useState("");
  const [categorie, setCategorie] = useState("med");
  const [recherche, setRecherche] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [selection, setSelection] = useState(null);
  const [quantite, setQuantite] = useState("1");

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

  const refZone = useRef(null);
  const inputRechercheRef = useRef(null);

  const catalogueFiltre = categorie === "med" ? medicaments : actes;
  const suggestions = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return catalogueFiltre.slice(0, 5);
    return catalogueFiltre.filter(i => i.nom.toLowerCase().includes(q)).slice(0, 5);
  }, [recherche, catalogueFiltre]);

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

  const actionAjouterSoin = () => {
    if (!selection) return;
    const q = parseFloat(quantite);
    if (isNaN(q) || q <= 0) return;
    if (categorie === "med") {
      const stockActuel = selection.quantite || 0;
      if (stockActuel < q) { showToast(`Stock insuffisant pour "${selection.nom}". Restant : ${stockActuel}`, "error"); return; }
    }
    injecterLigne(selection, categorie, q);
    if (categorie === "med" && selection.quantite !== undefined) {
      const updated = medicaments.map(m => {
        if (m.id === selection.id) { return { ...m, quantite: Math.max(0, (m.quantite || 0) - q) }; }
        return m;
      });
      setMedicaments(updated);
      const { LOG_MEDS_KEY } = require('../api/firebase');
      localStorage.setItem(LOG_MEDS_KEY, JSON.stringify(updated));
      chf.updateCatalog('medicaments', updated).catch(e => console.warn(e));
    }
    setRecherche(""); setSelection(null); setQuantite("1");
    if (inputRechercheRef.current) inputRechercheRef.current.focus();
    setPaiementEffectue(false);
  };

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
      // Dossier déjà archivé = ancienne visite terminée -> on pré-remplit un NOUVEAU dossier
      // (nouvelle visite indépendante), on ne rouvre pas l'ancien.
      setInputNom(patient.nomPatient || "");
      setInputTypePatient(patient.typePatient || "ONG");
      setInputOng(patient.ongPartenaire || "");
      setInputNumDossier(patient.numDossier || "");
      setInputDateNaissance(patient.dateNaissance || "");
      setInputTelephone(patient.telephone || "");
      showToast(`Infos de ${patient.nomPatient} pré-remplies pour une nouvelle visite`, "info");
    } else {
      // Dossier suspendu ou actif = visite en cours -> on reprend le même dossier
      onChargerPatientExistant(patient);
    }
    setSearchPatientText(""); setSuggestionsPatients([]);
  };

  const reimprimerFicheValidee = (fiche) => {
    const lignesDetaillees = fiche.rawState?.lignesCalcul || [];
    const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fiche N°${fiche.numeroFiche}</title><style>@page{size:100mm 297mm;margin:3mm 5mm;}body{font-family:'Courier New',monospace;font-size:12px;color:#000;width:90mm;margin:0 auto;}.entete{text-align:center;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:8px;}.entete h1{font-size:20px;margin:4px 0;}.entete p{margin:2px 0;font-size:11px;}table{width:100%;border-collapse:collapse;margin:6px 0;font-size:11px;}th,td{padding:4px 6px;text-align:left;border-bottom:1px dotted #ccc;}th{border-bottom:2px solid #000;font-size:10px;text-transform:uppercase;}.qte{text-align:center;}.prix,.sous-total{text-align:right;}.total{font-weight:bold;font-size:16px;text-align:right;border-top:3px solid #000;padding-top:6px;margin-top:6px;}.footer{margin-top:12px;font-size:9px;text-align:center;border-top:1px dashed #ccc;padding-top:6px;color:#555;}</style></head><body><div class="entete"><h1>CHF</h1><p>Centre Hospitalier de Fontaine</p><p>#13, Fontaine Duvivier, Cité Soleil</p><p>Tél: (509) 3647-0563 / 2226-8900</p><p>RÉIMPRESSION — ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</p></div><div style="font-weight:bold;font-size:11px;margin-bottom:6px;">Patient: ${echapperHTML(nomPatient)} — Fiche N°${fiche.numeroFiche}</div><table><thead><tr><th>Désignation</th><th class="qte">Qté</th><th class="prix">Prix</th><th class="sous-total">Total</th></tr></thead><tbody>${lignesDetaillees.map(l => `<tr><td>${echapperHTML(l.nom)}</td><td class="qte">${l.qte}</td><td class="prix">${formatGourdes(l.prix)}</td><td class="sous-total">${formatGourdes(l.qte*l.prix)}</td></tr>`).join('')}</tbody></table><div class="total">TOTAL FICHE : ${formatGourdes(fiche.totalGlobal)} Gdes (${formatDH(fiche.totalGlobal)} DH)</div><p style="font-size:10px;margin-top:4px;">Mode: ${echapperHTML((fiche.modePaiement||'cash').toUpperCase())} | Encaissé par: ${echapperHTML(fiche.creePar||'inconnu')}</p><div class="footer">Merci de votre visite !<br/>CHF Système Hospitalier – ${new Date().getFullYear()}</div></body></html>`;
    const win = window.open('', '_blank', 'width=500,height=700');
    if (!win) { showToast("Autorisez les pop-ups.", "error"); return; }
    win.document.write(contenu); win.document.close(); win.focus(); setTimeout(() => win.print(), 400);
  };

  const imprimerTicket = (forcer = false) => {
    if (!forcer && !paiementEffectue) { showToast("Veuillez d'abord effectuer le paiement avant d'imprimer.", "error"); return; }
    const data = {
      nomPatient: nomPatient || "Patient non renseigné",
      selectedOng: selectedOng || "—",
      numDossier: numDossierPatient || 'N/R',
      modePaiement: modePaiement || "cash",
      lignes: lignes || [],
      grandTotal: grandTotal || 0,
      montantVerse: parseFloat(montantVerse) || 0,
      monnaieARendre: monnaieARendre || 0,
      exoneration: autorisationExoneration && modePaiement === "exoneration" ? { pourcentage: pourcentageExoneration, montantExonere: montantExonere } : null,
      dateEntree1, dateSortie1, totalE1, totalE2, j1, j2, typeLit1, typeLit2,
      hasChirSpec, nomChirSpec, totalChirSpec,
      telephone: telephone || 'N/R',
      dateNaissance: dateNaissance || 'N/R',
      typePatient: typePatient || 'ONG',
      creePar: auth.currentUser?.displayName || 'inconnu',
      solde: (modePaiement === 'credit') ? montantRestantApresDepots : 0,
      depots: totalDepots
    };
    const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket CHF</title><style>@page{size:100mm 297mm;margin:3mm 5mm;}body{font-family:'Courier New',monospace;font-size:12px;color:#000;background:white;margin:0;padding:0;width:90mm;margin:0 auto;}.entete{text-align:center;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:8px;}.entete h1{font-size:20px;margin:4px 0;}.entete p{margin:2px 0;font-size:11px;}.info{display:flex;justify-content:space-between;font-weight:bold;font-size:11px;margin-bottom:6px;}.info-patient{font-size:10px;margin-bottom:4px;}table{width:100%;border-collapse:collapse;margin:6px 0;font-size:11px;}th,td{padding:4px 6px;text-align:left;border-bottom:1px dotted #ccc;}th{border-bottom:2px solid #000;font-size:10px;text-transform:uppercase;}.total{font-weight:bold;font-size:16px;text-align:right;border-top:3px solid #000;padding-top:6px;margin-top:6px;}.footer{margin-top:12px;font-size:9px;text-align:center;border-top:1px dashed #ccc;padding-top:6px;color:#555;}.qte{text-align:center;}.prix,.sous-total{text-align:right;}.exoneration{color:red;font-weight:bold;font-size:14px;}.monnaie{font-size:14px;color:#006600;}.solde{color:#cc0000;font-weight:bold;}.depot-info{font-size:12px;color:#555;}</style></head><body><div class="entete"><h1>CHF</h1><p>Centre Hospitalier de Fontaine</p><p>#13, Fontaine Duvivier, Cité Soleil</p><p>Tél: (509) 3647-0563 / 2226-8900</p><p>${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</p></div><div class="info"><span>Patient: ${echapperHTML(data.nomPatient)}</span><span>${echapperHTML(data.selectedOng)}</span></div><div class="info"><span>Dossier: ${echapperHTML(data.numDossier)}</span><span>Mode: ${echapperHTML(data.modePaiement).toUpperCase()}</span></div><div class="info info-patient"><span>📞 ${echapperHTML(data.telephone)}</span><span>Type: ${data.typePatient}</span></div><div class="info info-patient"><span>Enregistré par: ${echapperHTML(data.creePar)}</span></div>${data.dateEntree1 && data.dateSortie1 ? `<p style="font-size:10px; margin:4px 0;"><strong>Séjour:</strong> ${data.dateEntree1.split('-').reverse().slice(0,2).join('/')} → ${data.dateSortie1.split('-').reverse().slice(0,2).join('/')}</p>` : ''}<table><thead><tr><th>Désignation</th><th class="qte">Qté</th><th class="prix">Prix</th><th class="sous-total">Total</th></tr></thead><tbody>${data.j1 > 0 ? `<tr><td>Hébergement</td><td class="qte">${data.j1}j</td><td class="prix">${formatGourdes(CONFIG_LITS[data.typeLit1].prix)}</td><td class="sous-total">${formatGourdes(data.totalE1)}</td></tr>` : ''}${data.j2 > 0 ? `<tr><td>Hébergement P2</td><td class="qte">${data.j2}j</td><td class="prix">${formatGourdes(CONFIG_LITS[data.typeLit2].prix)}</td><td class="sous-total">${formatGourdes(data.totalE2)}</td></tr>` : ''}${data.hasChirSpec && data.nomChirSpec ? `<tr><td>Chirurgie: ${echapperHTML(data.nomChirSpec)}</td><td class="qte">1</td><td class="prix">${formatGourdes(data.totalChirSpec)}</td><td class="sous-total">${formatGourdes(data.totalChirSpec)}</td></tr>` : ''}${data.lignes.map(l => `<tr><td>${echapperHTML(l.nom)}</td><td class="qte">${l.qte}</td><td class="prix">${formatGourdes(l.prix)}</td><td class="sous-total">${formatGourdes(l.qte * l.prix)}</td></tr>`).join('')}</tbody></table>${data.exoneration ? `<div class="exoneration">Exonération: ${data.exoneration.pourcentage}% (${formatGourdes(data.exoneration.montantExonere)} Gdes)</div>` : ''}${data.depots > 0 ? `<div class="depot-info">Dépôts déjà effectués: ${formatGourdes(data.depots)} Gdes</div>` : ''}<div class="total">TOTAL À PAYER (après déduction des dépôts): ${formatGourdes(montantRestantApresDepots)} Gdes<br/>${formatDH(montantRestantApresDepots)} DH</div>${data.solde > 0 ? `<p class="solde">Solde restant : ${formatGourdes(data.solde)} Gdes</p>` : ''}<div style="margin-top:6px; border-top:2px dashed #000; padding-top:6px;">${data.modePaiement === 'cash' ? `<div style="display:flex; justify-content:space-between; font-size:12px;"><span>Montant versé:</span><span>${formatGourdes(data.montantVerse)} Gdes</span></div><div style="display:flex; justify-content:space-between; font-size:16px; font-weight:bold; color:#006600;"><span>Monnaie à rendre:</span><span>${formatGourdes(data.monnaieARendre)} Gdes</span></div>` : ''}</div><div class="footer">Merci de votre visite !<br/>CHF Système Hospitalier – ${new Date().getFullYear()}</div></body></html>`;
    const win = window.open('', '_blank', 'width=500,height=700');
    if (!win) { showToast("Veuillez autoriser les fenêtres pop-up.", "error"); return; }
    win.document.write(contenu); win.document.close(); win.focus(); setTimeout(() => win.print(), 500);
  };

  const imprimerFicheA4 = () => {
    if (!paiementEffectue) { showToast("Veuillez d'abord effectuer le paiement.", "error"); return; }
    showToast("Impression A4 (fonction prête)", "success");
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
      showToast("Veuillez sélectionner l'ONG partenaire.", "error");
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
      onEnregistrerFiche(fiche); // vide déjà le calculateur (lignes, dates...) via le parent
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
      // IMPORTANT : on marque le paiement effectué EN DERNIER, sans revider le calculateur après,
      // sinon les boutons "Imprimer" (A4/Ticket) restent désactivés juste après l'encaissement.
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
    const libellesMode = { cash: '💵 Cash', credit: '📝 Crédit', ong: '🏥 ONG', exoneration: '🎯 Exonération' };
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

  return (
    <div className="space-y-4">
      {confirmModal && <ConfirmModal {...confirmModal} />}
      {!dossierActif ? (
        <NouveauDossierForm
          searchPatientText={searchPatientText} setSearchPatientText={setSearchPatientText}
          suggestionsPatients={suggestionsPatients} choisirPatientExistant={choisirPatientExistant}
          peutCreerDossier={peutCreerDossier}
          onSoumettre={e => { e.preventDefault(); if (inputOng) localStorage.setItem('chf-dernier-ong', inputOng); onNouveauDossier(inputNom, inputOng, inputNumDossier, inputTypePatient, inputDateNaissance, inputTelephone, serviceChoisi); }}
          serviceChoisi={serviceChoisi} setServiceChoisi={setServiceChoisi}
          inputNom={inputNom} setInputNom={setInputNom}
          inputTypePatient={inputTypePatient} setInputTypePatient={setInputTypePatient}
          inputOng={inputOng} setInputOng={setInputOng}
          inputNumDossier={inputNumDossier} setInputNumDossier={setInputNumDossier}
          inputDateNaissance={inputDateNaissance} setInputDateNaissance={setInputDateNaissance}
          inputTelephone={inputTelephone} setInputTelephone={setInputTelephone}
        />
      ) : (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-emerald-300 flex justify-between items-center shadow-sm flex-wrap gap-2">
            <div>
              <h3 className="text-base font-black">{nomPatient}</h3>
              {!editTypeOuvert ? (
                <p className="text-xs font-bold text-purple-700 flex items-center gap-2">
                  {selectedOng || 'Privé'} - {(typePatient||'ONG')}
                  {peutCreerDossier && <button onClick={()=>{ setNouveauTypeEdit(typePatient||'ONG'); setNouvelOngEdit(selectedOng||''); setEditTypeOuvert(true); }} className="text-[9px] font-bold text-blue-600 underline">✏️ Changer</button>}
                </p>
              ) : (
                <div className="flex gap-1.5 items-center mt-1 flex-wrap">
                  <select value={nouveauTypeEdit} onChange={e=>setNouveauTypeEdit(e.target.value)} className="border rounded p-1 text-xs bg-white">
                    <option value="ONG">🏥 ONG</option>
                    <option value="PRIVE">💳 Privé</option>
                  </select>
                  {nouveauTypeEdit === "ONG" && (
                    <select value={nouvelOngEdit} onChange={e=>setNouvelOngEdit(e.target.value)} className="border rounded p-1 text-xs bg-white">
                      <option value="">-- ONG --</option>
                      {LISTE_ONG.map(o => <option key={o} value={o}>{o}</option>)}
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
              {peutArchiver && <button onClick={onCloturerDossier} className="bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg">🏁 Clôturer</button>}
            </div>
          </div>
          {fichesDossier.length > 0 && <div className="bg-white p-3 rounded-xl border shadow-sm space-y-1.5"><span className="text-[9px] uppercase font-black text-gray-400">Fiches validées (clique pour réimprimer)</span><div className="flex flex-wrap gap-1.5">{fichesDossier.map(f => <div key={f.id} className="flex items-center rounded-lg font-mono text-[11px] font-bold border overflow-hidden shadow-sm bg-gray-50 border-gray-200"><button onClick={() => reimprimerFicheValidee(f)} className="pl-2.5 pr-2 py-1 hover:text-blue-700" title="Réimprimer cette fiche">🖨️ Fiche N°{f.numeroFiche} ({formatGourdes(f.totalGlobal)} Gdes)</button>{peutSupprimerFiche && <button onClick={() => { if (confirm("Supprimer cette fiche ?")) onSupprimerFicheDossier(f.id); }} className="px-2 py-1 bg-gray-200/50 hover:bg-red-600 hover:text-white border-l transition-colors"><X size={12}/></button>}</div>)}</div></div>}
          <HebergementForm
            dateEntree1={dateEntree1} setDateEntree1={setDateEntree1} dateSortie1={dateSortie1} setDateSortie1={setDateSortie1}
            typeLit1={typeLit1} setTypeLit1={setTypeLit1}
            multiPeriode={multiPeriode} setMultiPeriode={setMultiPeriode}
            dateEntree2={dateEntree2} setDateEntree2={setDateEntree2} dateSortie2={dateSortie2} setDateSortie2={setDateSortie2} typeLit2={typeLit2} setTypeLit2={setTypeLit2}
            hasChirSpec={hasChirSpec} setHasChirSpec={setHasChirSpec} nomChirSpec={nomChirSpec} setNomChirSpec={setNomChirSpec} prixChirSpec={prixChirSpec} setPrixChirSpec={setPrixChirSpec}
          />
          <div className="bg-white p-4 rounded-xl border space-y-3 shadow-sm" ref={refZone}>
            <p className="text-[11px] font-bold uppercase text-gray-400">2. Actes, Laboratoire & Ordonnance</p>
            <div className="flex gap-2 text-xs font-semibold">
              <button onClick={()=>{ setCategorie("med"); setRecherche(""); setSelection(null); }} className={`flex-1 py-1.5 border rounded-lg ${categorie==="med" ? "bg-[#1E2A24] text-white" : "bg-gray-50"}`}>💊 Pharmacie</button>
              <button onClick={()=>{ setCategorie("acte"); setRecherche(""); setSelection(null); }} className={`flex-1 py-1.5 border rounded-lg ${categorie==="acte" ? "bg-[#1E2A24] text-white" : "bg-gray-50"}`}>🔬 Examens / Actes</button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input ref={inputRechercheRef} type="text" value={recherche} onChange={e=>{ setRecherche(e.target.value); setOuvert(true); setSelection(null); }} onFocus={()=>setOuvert(true)} onKeyDown={e=>{ if(e.key==='Enter' && suggestions.length>0){ setSelection(suggestions[0]); setRecherche(suggestions[0].nom); setOuvert(false); } }} placeholder="Rechercher un soin ou un médicament..." className="w-full border rounded-lg p-2 text-xs pl-8 outline-none" disabled={!peutAjouterLignes} />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"><Search size={14}/></span>
                {ouvert && suggestions.length > 0 && <ul className="absolute z-20 left-0 right-0 bg-white border rounded-lg shadow-2xl mt-1 text-xs max-h-48 overflow-y-auto divide-y">{suggestions.map(i => <li key={i.id}><button type="button" onClick={()=>{ setSelection(i); setRecherche(i.nom); setOuvert(false); }} onDoubleClick={()=>{ setSelection(i); setQuantite("1"); setTimeout(actionAjouterSoin,40); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 flex justify-between"><span>{i.nom}</span><span className="text-gray-500 font-mono">{formatGourdes(i.prix)} Gdes</span></button></li>)}</ul>}
              </div>
              <input type="number" min="1" value={quantite} onChange={e=>setQuantite(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') actionAjouterSoin(); }} className="w-16 border rounded-lg p-2 text-xs text-center font-mono font-bold bg-gray-50" disabled={!peutAjouterLignes} />
              <button onClick={actionAjouterSoin} disabled={!selection || !peutAjouterLignes} className="bg-[#1E2A24] text-white px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-30 flex items-center gap-1"><Plus/> Ajouter</button>
            </div>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
            <table className="w-full text-xs text-left">
              <thead><tr className="bg-gray-100 text-[10px] text-gray-500 uppercase border-b font-mono"><th className="p-3">Désignation</th><th className="p-3 w-16 text-center">Qté</th><th className="p-3 text-right w-24">Prix</th><th className="p-3 text-right w-24">Total</th><th className="w-8"></th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {j1 > 0 && <tr className="bg-amber-50/20"><td className="p-3 text-amber-900">Séjour : {CONFIG_LITS[typeLit1].nom}</td><td className="p-3 text-center font-bold">{j1} jrs</td><td className="p-3 text-right text-gray-400">{formatGourdes(CONFIG_LITS[typeLit1].prix)}</td><td className="p-3 text-right font-bold">{formatGourdes(totalE1)}</td><td></td></tr>}
                {multiPeriode && j2 > 0 && <tr className="bg-amber-50/40"><td className="p-3 text-amber-900">Séjour P2 : {CONFIG_LITS[typeLit2].nom}</td><td className="p-3 text-center font-bold">{j2} jrs</td><td className="p-3 text-right text-gray-400">{formatGourdes(CONFIG_LITS[typeLit2].prix)}</td><td className="p-3 text-right font-bold">{formatGourdes(totalE2)}</td><td></td></tr>}
                {hasChirSpec && nomChirSpec && <tr className="bg-red-50/20"><td className="p-3 text-red-900">Chirurgie : {nomChirSpec}</td><td className="p-3 text-center">1</td><td className="p-3 text-right text-gray-400">{formatGourdes(totalChirSpec)}</td><td className="p-3 text-right font-bold">{formatGourdes(totalChirSpec)}</td><td></td></tr>}
                {lignes.map(l => <tr key={l.id} className="zebra-row"><td className="p-3 text-gray-800"><span className={`text-[8px] font-bold uppercase px-1 rounded mr-1 ${l.type==='med'?'bg-emerald-50 text-emerald-700':'bg-blue-50 text-blue-700'}`}>{l.type==='med'?'Pharma':'Acte'}</span>{l.nom}</td><td className="p-3 text-center font-mono font-bold">{l.qte}</td><td className="p-3 text-right text-gray-400">{formatGourdes(l.prix)}</td><td className="p-3 text-right font-bold">{formatGourdes(l.qte * l.prix)}</td><td className="text-center">{peutSupprimerFiche && <button onClick={()=>setLignes(p=>p.filter(x=>x.id!==l.id))} className="text-gray-300 hover:text-red-600"><X size={12}/></button>}</td></tr>)}
              </tbody>
            </table>
            <div className="p-4 bg-gray-50 border-t border-b text-[11px] text-gray-600 font-mono space-y-1 shadow-inner">
              <div className="grid grid-cols-3 font-bold text-[#1E2A24] border-b pb-1 mb-2"><span>RÉCAPITULATIF DE LA FICHE</span><span className="text-right">Gdes</span><span className="text-right text-emerald-800">💵 DH</span></div>
              {require('../utils/constants').CATEGORIES_LISTE.map(srv => { const m = totalsParService[srv.key]; if (m===0) return null; return <div key={srv.key} className="grid grid-cols-3 py-0.5"><span>• {srv.label}</span><span className="text-right">{formatGourdes(m)}</span><span className="text-right font-bold">{formatDH(m)} DH</span></div>; })}
            </div>
            <div className="bg-[#1E2A24] text-white p-4 flex justify-between items-center font-bold text-sm font-mono"><span>SOUS-TOTAL FICHE N°{numeroFicheCourante} :</span><span>{formatGourdes(grandTotal)} Gdes ({formatDH(grandTotal)} DH)</span></div>
            <div className="bg-white p-4 border-t border-gray-300 space-y-3">
              <h4 className="font-bold text-gray-700 text-xs uppercase tracking-wider">💵 Encaissement</h4>
              {totalDepots > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex justify-between items-center text-xs">
                  <span className="font-bold text-blue-800">💰 Dépôts déjà versés : {formatGourdes(totalDepots)} Gdes</span>
                  <span className="font-bold text-emerald-700">Solde restant à payer : {formatGourdes(montantRestantApresDepots)} Gdes</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button onClick={()=>{ setModePaiement("cash"); setModeDepot(false); }} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${modePaiement==="cash"?"bg-emerald-700 text-white":"bg-gray-100"}`}>💵 Cash</button>
                <button onClick={()=>{ setModePaiement("credit"); setModeDepot(false); }} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${modePaiement==="credit"?"bg-orange-600 text-white":"bg-gray-100"}`}>📝 Crédit</button>
                <button onClick={()=>{ setModePaiement("ong"); setModeDepot(false); }} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${modePaiement==="ong"?"bg-purple-700 text-white":"bg-gray-100"}`} disabled={typePatient!=="ONG"}>🏥 ONG</button>
                <button onClick={()=>{ setModePaiement("exoneration"); setModeDepot(false); }} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${modePaiement==="exoneration"?"bg-red-600 text-white":"bg-gray-100"}`} disabled={userRole!=="direction" && userRole!=="administrateur" && userRole!=="comptable"}>🎯 Exonération</button>
                <button onClick={()=>{ setModeDepot(!modeDepot); if(!modeDepot) setModePaiement("depot"); else setModePaiement("cash"); }} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${modeDepot?"bg-blue-700 text-white":"bg-gray-100"}`}>💰 Dépôt/Acompte</button>
              </div>
              {modeDepot && (
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 space-y-2">
                  <div className="flex items-center gap-2"><label className="text-xs font-bold text-blue-800">Montant du dépôt :</label><input type="number" min="0" step="100" value={montantDepot} onChange={e=>setMontantDepot(e.target.value)} placeholder="0" className="border rounded p-1.5 w-32 font-mono" /><span className="text-xs text-gray-600">Solde restant après dépôt : {formatGourdes(soldeRestantDepot)} Gdes</span></div>
                  <button onClick={enregistrerDepot} disabled={!dossierId} className="bg-blue-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold">💾 Enregistrer le dépôt</button>
                  <p className="text-[10px] text-gray-500">Dépôts déjà effectués : {formatGourdes(totalDepots)} Gdes</p>
                </div>
              )}
              {modePaiement === "ong" && !modeDepot && <div className="mt-2"><label className="text-[10px] font-bold text-purple-800">ONG</label><select value={ongPartenaireFiche} onChange={e=>setOngPartenaireFiche(e.target.value)} className="border rounded-lg p-1.5 text-xs w-full bg-white"><option value="">Sélectionner</option>{LISTE_ONG.map(o=><option key={o} value={o}>{o}</option>)}</select></div>}
              {modePaiement === "exoneration" && !modeDepot && <div className="mt-2 space-y-2 bg-red-50 p-2 rounded-lg"><div className="flex gap-2"><input type="number" min="0" max="100" value={pourcentageExoneration} onChange={e=>setPourcentageExoneration(e.target.value)} placeholder="%" className="w-20 border rounded-lg p-1.5 text-xs" /><input type="text" value={motifExoneration} onChange={e=>setMotifExoneration(e.target.value)} placeholder="Motif..." className="flex-1 border rounded-lg p-1.5 text-xs" /></div>{(userRole==="direction" || userRole==="administrateur") ? <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={autorisationExoneration} onChange={e=>{
                if (!e.target.checked) { setAutorisationExoneration(false); return; }
                setConfirmModal({
                  titre: "Autoriser l'exonération ?",
                  message: `Patient : ${nomPatient}\nMotif : ${motifExoneration || '(non précisé)'}\nPourcentage : ${pourcentageExoneration}%`,
                  detail: `Montant exonéré : ${formatGourdes((grandTotal * (parseFloat(pourcentageExoneration)||0)) / 100)} Gdes`,
                  confirmLabel: "Autoriser",
                  danger: true,
                  onConfirm: () => {
                    enregistrerAudit('autorisation_exoneration', {
                      nomPatient,
                      pourcentage: parseFloat(pourcentageExoneration) || 0,
                      montantExonere: (grandTotal * (parseFloat(pourcentageExoneration)||0)) / 100,
                      motif: motifExoneration
                    });
                    setAutorisationExoneration(true); setConfirmModal(null);
                  },
                  onCancel: () => setConfirmModal(null)
                });
              }} /> Autoriser</label> : <button onClick={demanderExoneration} disabled={!pourcentageExoneration||pourcentageExoneration==0} className="bg-amber-500 text-white px-3 py-1 rounded text-xs disabled:opacity-30">📨 Demander</button>}</div>}
              {(modePaiement === "cash" && !modeDepot) && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="text-[10px] font-bold text-gray-500">Montant versé</label><input type="number" min="0" value={montantVerse} onChange={e=>setMontantVerse(e.target.value)} placeholder="0" className="border rounded-lg p-2 w-full text-sm font-mono" disabled={!peutEncaisser} /></div><div><label className="text-[10px] font-bold text-gray-500">Monnaie</label><div className="bg-gray-100 p-2 rounded-lg text-right font-mono font-bold text-lg text-emerald-700">{formatGourdes(monnaieARendre)} Gdes</div></div></div>}
              {!modeDepot && <button onClick={demanderConfirmationEncaissement} disabled={!peutEncaisser || (modePaiement === "exoneration" && !(userRole === 'direction' || userRole === 'administrateur'))} className="w-full bg-emerald-700 hover:bg-emerald-800 text-white py-2.5 rounded-lg text-sm font-bold shadow-md disabled:opacity-50">💳 Encaisser cette fiche</button>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={onViderFicheActive} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl py-3 text-xs font-bold">🧹 Vider l'écran</button>
            <button onClick={imprimerFicheA4} disabled={!paiementEffectue} className={`flex-1 rounded-xl py-3 text-xs font-bold flex items-center justify-center gap-1 ${paiementEffectue ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>🖨️ A4</button>
            <button onClick={imprimerTicket} disabled={!paiementEffectue} className={`flex-1 rounded-xl py-3 text-xs font-bold flex items-center justify-center gap-1 ${paiementEffectue ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>🧾 Ticket</button>
            <button onClick={() => {
              if (lignes.length === 0 && j1 === 0 && !hasChirSpec) { showToast("Fiche vide", "error"); return; }
              onEnregistrerFiche({
                id: "fiche-" + Date.now(),
                numeroFiche: numeroFicheCourante,
                breakdown: { ...totalsParService },
                totalGlobal: grandTotal,
                rawState: { lignesCalcul: [...lignes], dateEntree1, dateSortie1, typeLit1, multiPeriode, dateEntree2, dateSortie2, typeLit2, hasChirSpec, nomChirSpec, prixChirSpec }
              });
              onViderFicheActive();
              showToast("Fiche enregistrée (sans paiement)", "success");
            }} disabled={!peutArchiver} className="flex-[2] bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl py-3 text-xs font-black shadow-md disabled:opacity-50">💾 Enregistrer la Fiche N°{numeroFicheCourante} au Dossier</button>
          </div>
        </div>
      )}
    </div>
  );
}

module.exports = CalculateurPanel;
