// components/ArchivesPanel.js
const React = window.React;
const { useState, useEffect, useMemo } = React;
const { LISTE_ONG, CATEGORIES_LISTE } = require('../utils/constants');
const { formatGourdes, formatDH, echapperHTML } = require('../utils/helpers');
const { Eye, Pencil, Trash2, Printer, Clock, FolderOpen, X, Download, Check } = require('../utils/icons');
const { chf, toEpisodeApi } = require('../api/supabase');
const { LOGO_CHF_BASE64 } = require('../utils/logoChf');

function HistoriqueVerifPanel({ verifications, setVerifications, onChargerPourModif, onSupprimer, filtreInitialNom, clearFiltreInitialNom, dossierPourExport, setDossierPourExport, userRole, showToast, onChangerTypeOng }) {
  const [focusedVerif, setFocusedVerif] = useState(null);
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

  useEffect(() => { if (filtreInitialNom) { setRechercheNomPatient(filtreInitialNom); clearFiltreInitialNom(); } }, [filtreInitialNom]);
  useEffect(() => { setNombreAffiche(100); }, [filtreType, filtreOng, rechercheNomPatient, filtreDateDebut, filtreDateFin, filtreCategorie, filtreStatut]);

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
  const LABELS_EXPORT = {
    service: 'Admission', hospit: 'Lit/ Hosp', labo: 'Laboratoire', med: 'Medicaments',
    ecg: 'ECG', oxygene: 'O2', cesarienne: 'Cesarienne/Laparo', curetage: 'curtage',
    chirurgie: 'Chirugie', accouchement: 'Accouch', sono: 'SONO', pansement: 'Pansement'
  };
  const CLES_AUTRES = ['suture', 'drainage', 'pap', 'visite', 'nebulisation'];

  const exporterBlocDossiersExcelPartenaire = async (ongCible) => {
    try {
      // Étape A : récupération + filtrage (ONG + filtres actifs de l'écran) + tri chronologique
      let listeDossiersONG = verifications.filter(v => v.ongPartenaire === ongCible && (filtreType === "" || (v.typePatient || 'ONG') === filtreType));
      if (filtreDateDebut || filtreDateFin) {
        listeDossiersONG = listeDossiersONG.filter(v => {
          const d = new Date(v.dateEntreePourTri); if (isNaN(d)) return false;
          if (filtreDateDebut && d < new Date(filtreDateDebut)) return false;
          if (filtreDateFin) { const fin = new Date(filtreDateFin); fin.setHours(23,59,59,999); if (d > fin) return false; }
          return true;
        });
      }
      listeDossiersONG = listeDossiersONG.sort((a, b) => new Date(a.dateEntreePourTri) - new Date(b.dateEntreePourTri));

      if (listeDossiersONG.length === 0) { showToast(`Aucun dossier trouvé pour ${ongCible}`, "error"); return; }

      // Étape B : détection dynamique des colonnes réellement utilisées (rien d'inventé, rien d'oublié)
      const clesVues = new Set(['service', 'hospit', 'labo', 'med']);
      let autresUtilise = false;
      let grandTotalGeneral = 0;
      listeDossiersONG.forEach(doc => {
        (doc.fiches || []).forEach(f => {
          Object.entries(f.breakdown || {}).forEach(([k, val]) => {
            if (!val) return;
            if (CLES_AUTRES.includes(k)) autresUtilise = true;
            else if (LABELS_EXPORT[k]) clesVues.add(k);
          });
          grandTotalGeneral += f.totalGlobal || 0;
        });
      });
      const colonnesExport = Object.keys(LABELS_EXPORT).filter(k => clesVues.has(k)).map(k => ({ key: k, label: LABELS_EXPORT[k] }));
      if (autresUtilise) colonnesExport.push({ key: '__autres__', label: 'Autres' });

      // Étape C : classeur ExcelJS + en-tête du document
      // Colonne 1 réservée au logo (à gauche) ; tout le reste décalé d'une colonne par rapport à l'ancienne version.
      const wb = new window.ExcelJS.Workbook();
      const ws = wb.addWorksheet("Facturation");
      const derniereCol = colonnesExport.length + 4; // logo(1) + Nom(2) + Date(3) + colonnesExport(n) + Total

      let r = 1;
      const ligneCentree = (texte, style) => {
        ws.mergeCells(r, 2, r, derniereCol);
        const cell = ws.getCell(r, 2);
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
      const moisTexte = now.toLocaleString('fr-FR', { month: 'long' }).toUpperCase();
      appliquerStyle(ws.getCell(r, 2), EXCEL_STYLES.gras);
      ws.getCell(r, 2).value = "DATE D'ADMISSION :";
      ws.getCell(r, 3).value = `${moisTexte} ${now.getFullYear()}`;
      r++;
      appliquerStyle(ws.getCell(r, 2), EXCEL_STYLES.gras);
      ws.getCell(r, 2).value = "FACTURE";
      ws.getCell(r, 3).value = `#${Math.floor(Math.random()*10000)}`;
      ws.getCell(r, 6).value = ongCible;
      appliquerStyle(ws.getCell(r, 6), EXCEL_STYLES.gras);
      r++;
      r++; // ligne vide

      appliquerStyle(ws.getCell(r, 2), EXCEL_STYLES.teteColonne); ws.getCell(r, 2).value = "Nom et Prenom";
      appliquerStyle(ws.getCell(r, 3), EXCEL_STYLES.teteColonne); ws.getCell(r, 3).value = "Date";
      colonnesExport.forEach((c, i) => { const cell = ws.getCell(r, 4 + i); cell.value = c.label; appliquerStyle(cell, EXCEL_STYLES.teteColonne); });
      { const cell = ws.getCell(r, 4 + colonnesExport.length); cell.value = "Total"; appliquerStyle(cell, EXCEL_STYLES.teteColonne); }
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
            if (CLES_AUTRES.includes(k)) totalsPatient['__autres__'] = (totalsPatient['__autres__'] || 0) + (val || 0);
            else if (totalsPatient[k] !== undefined) totalsPatient[k] += (val || 0);
          });
          totalPatient += f.totalGlobal || 0;
        });

        appliquerStyle(ws.getCell(r, 2), EXCEL_STYLES.celluleStandard); ws.getCell(r, 2).value = doc.nomPatient;
        appliquerStyle(ws.getCell(r, 3), EXCEL_STYLES.celluleStandard); ws.getCell(r, 3).value = doc.periodeSejourString || doc.dateHeure || "—";
        colonnesExport.forEach((c, i) => {
          totalsParColonne[c.key] += totalsPatient[c.key] || 0;
          const cell = ws.getCell(r, 4 + i);
          if (!totalsPatient[c.key]) { cell.value = ""; appliquerStyle(cell, EXCEL_STYLES.celluleStandard); }
          else { cell.value = totalsPatient[c.key]; appliquerStyle(cell, EXCEL_STYLES.celluleNombre); }
        });
        { const cell = ws.getCell(r, 4 + colonnesExport.length); cell.value = totalPatient; appliquerStyle(cell, EXCEL_STYLES.celluleTotal); }
        r++;
      });

      // Étape E : GRAND TOTAL, puis réductions/dons si activés dans l'interface
      appliquerStyle(ws.getCell(r, 2), EXCEL_STYLES.grandTotalHtg); ws.getCell(r, 2).value = "GRAND TOTAL";
      appliquerStyle(ws.getCell(r, 3), EXCEL_STYLES.grandTotalHtg);
      colonnesExport.forEach((c, i) => { const cell = ws.getCell(r, 4 + i); cell.value = totalsParColonne[c.key]; appliquerStyle(cell, EXCEL_STYLES.grandTotalHtg); });
      { const cell = ws.getCell(r, 4 + colonnesExport.length); cell.value = grandTotalGeneral; appliquerStyle(cell, EXCEL_STYLES.grandTotalHtg); }
      r++;

      const rabaisVal = appliqueRabais10 ? Math.round(grandTotalGeneral * 0.10) : 0;
      const donsVal = parseFloat(montantDonIntrants) || 0;

      if (rabaisVal > 0) {
        appliquerStyle(ws.getCell(r, 2), EXCEL_STYLES.gras); ws.getCell(r, 2).value = "Réductions 10%";
        const cell = ws.getCell(r, 4 + colonnesExport.length); cell.value = rabaisVal; appliquerStyle(cell, EXCEL_STYLES.celluleTotal);
        r++;
      }
      if (donsVal > 0) {
        appliquerStyle(ws.getCell(r, 2), EXCEL_STYLES.gras); ws.getCell(r, 2).value = "Dons / Intrants";
        const cell = ws.getCell(r, 4 + colonnesExport.length); cell.value = donsVal; appliquerStyle(cell, EXCEL_STYLES.celluleTotal);
        r++;
      }
      if (rabaisVal > 0 || donsVal > 0) {
        appliquerStyle(ws.getCell(r, 2), EXCEL_STYLES.celluleFinaleGras); ws.getCell(r, 2).value = "MONTANT NET DÛ";
        appliquerStyle(ws.getCell(r, 3), EXCEL_STYLES.celluleFinaleGras);
        colonnesExport.forEach((c, i) => appliquerStyle(ws.getCell(r, 4 + i), EXCEL_STYLES.celluleFinaleGras));
        const cell = ws.getCell(r, 4 + colonnesExport.length); cell.value = grandTotalGeneral - rabaisVal - donsVal; appliquerStyle(cell, EXCEL_STYLES.celluleFinaleGras);
        r++;
      }

      // Étape F : largeurs de colonnes (colonne 1 = logo), logo CHF, puis téléchargement
      ws.getColumn(1).width = 14;
      ws.getColumn(2).width = 26;
      ws.getColumn(3).width = 20;
      colonnesExport.forEach((c, i) => { ws.getColumn(4 + i).width = 12; });
      ws.getColumn(4 + colonnesExport.length).width = 16;
      for (let i = 1; i <= 4; i++) ws.getRow(i).height = 20;

      const logoId = wb.addImage({ base64: LOGO_CHF_BASE64, extension: 'png' });
      ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 95, height: 108 } });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const urlTelechargement = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = urlTelechargement;
      lien.download = `Rapport_${ongCible.replace(/\s+/g, '_')}_${moisTexte}_${now.getFullYear()}.xlsx`;
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
      setTimeout(() => URL.revokeObjectURL(urlTelechargement), 1000);

      // Étape G : verrouille les dossiers exportés pour éviter qu'ils soient modifiés/supprimés après facturation
      const idsExportes = listeDossiersONG.map(d => d.id);
      setVerifications(prev => prev.map(v => idsExportes.includes(v.id) ? { ...v, verrouilleFacture: true } : v));
      let echecsVerrou = 0;
      await Promise.all(listeDossiersONG.map(async (d) => {
        try { await chf.updateEpisode(d.id, toEpisodeApi({ verrouilleFacture: true })); }
        catch (e) { if (!e.isOfflineQueue) echecsVerrou++; }
      }));

      showToast(`✅ Export Excel de ${listeDossiersONG.length} dossiers (${formatGourdes(grandTotalGeneral)} Gdes)${echecsVerrou > 0 ? ` — ⚠️ ${echecsVerrou} dossier(s) non verrouillé(s), réessaie plus tard` : ''}`, "success");
      setDossierPourExport(null);
      setAppliqueRabais10(false);
      setMontantDonIntrants("");
    } catch (error) {
      console.error("Erreur export Excel:", error);
      showToast("Une erreur s'est produite lors de la génération du fichier Excel.", "error");
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
    const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fiche N°${fiche.numeroFiche}</title><style>@page{size:100mm 297mm;margin:3mm 5mm;}body{font-family:'Courier New',monospace;font-size:12px;color:#000;background:white;margin:0;padding:0;width:90mm;margin:0 auto;}.entete{text-align:center;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:8px;}.entete h1{font-size:20px;margin:4px 0;}.entete p{margin:2px 0;font-size:11px;}.info{display:flex;justify-content:space-between;font-weight:bold;font-size:11px;margin-bottom:6px;}table{width:100%;border-collapse:collapse;margin:6px 0;font-size:11px;}th,td{padding:4px 6px;text-align:left;border-bottom:1px dotted #ccc;}th{border-bottom:2px solid #000;font-size:10px;text-transform:uppercase;}.total{font-weight:bold;font-size:16px;text-align:right;border-top:3px solid #000;padding-top:6px;margin-top:6px;}.footer{margin-top:12px;font-size:9px;text-align:center;border-top:1px dashed #ccc;padding-top:6px;color:#555;}.qte{text-align:center;}.prix,.sous-total{text-align:right;}.info-patient{font-size:10px;margin-bottom:4px;}</style></head><body><div class="entete"><h1>CHF</h1><p>Centre Hospitalier de Fontaine</p><p>#13, Fontaine Duvivier, Cité Soleil</p><p>Tél: (509) 3647-0563 / 2226-8900</p><p>${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</p></div><div class="info"><span>Patient: ${echapperHTML(focusedVerif.nomPatient)}</span><span>${echapperHTML(focusedVerif.ongPartenaire || 'Privé')}</span></div><div class="info"><span>Fiche N°${fiche.numeroFiche}</span><span>Mode: ${echapperHTML(fiche.modePaiement || 'cash').toUpperCase()}</span></div><div class="info info-patient"><span>📞 ${echapperHTML(focusedVerif.telephone || 'N/R')}</span><span>📁 ${echapperHTML(focusedVerif.numDossier || 'N/R')}</span></div><div class="info info-patient"><span>Type: ${focusedVerif.typePatient === 'ONG' ? 'ONG' : 'Privé'}</span><span>Enregistré par: ${echapperHTML(fiche.creePar || 'inconnu')}</span></div>${fiche.exeat ? `<p style="font-size:10px; margin:4px 0;"><strong>Séjour:</strong> ${fiche.exeat.dateEntree.split('-').reverse().slice(0,2).join('/')} → ${fiche.exeat.dateSortie.split('-').reverse().slice(0,2).join('/')}</p>` : ''}<table><thead><tr><th>Désignation</th><th class="qte">Qté</th><th class="prix">Prix</th><th class="sous-total">Total</th></tr></thead><tbody>${hasLignes ? lignesHTML : fallbackHTML}</tbody></table><div class="total">TOTAL FICHE : ${formatGourdes(fiche.totalGlobal)} Gdes<br/>${formatDH(fiche.totalGlobal)} DH</div>${fiche.solde && fiche.solde > 0 ? `<p style="font-size:12px; color:red;"><strong>Solde restant :</strong> ${formatGourdes(fiche.solde)} Gdes</p>` : ''}<div class="footer">Merci de votre visite !<br/>CHF Système Hospitalier – ${new Date().getFullYear()}</div></body></html>`;
    const win = window.open('', '_blank', 'width=500,height=700');
    if (!win) { showToast("Autorisez les pop-ups.", "error"); return; }
    win.document.write(contenu); win.document.close(); win.focus(); setTimeout(() => win.print(), 500);
  };

  const imprimerArchive = (dossier) => {
    const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Dossier ${echapperHTML(dossier.nomPatient)}</title><style>body{font-family:sans-serif;padding:20px;color:#000;} .entete{text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:14px;} .entete h1{font-size:22px;margin:4px 0;} .entete p{margin:2px 0;font-size:12px;} h1.titre{font-size:18px;margin-top:10px;} table{width:100%;border-collapse:collapse;margin-top:10px;} th,td{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px;} .total{font-weight:bold;font-size:16px;margin-top:10px;} .info-patient{font-size:12px;margin:4px 0;} .meta-fiche{font-size:10px;color:#555;margin-top:4px;}</style></head><body><div class="entete"><h1>CHF</h1><p>Centre Hospitalier de Fontaine</p><p>#13, Fontaine Duvivier, Cité Soleil</p><p>Tél: (509) 3647-0563 / 2226-8900</p><p>${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</p></div><h1 class="titre">Dossier patient</h1><p class="info-patient"><strong>Nom :</strong> ${echapperHTML(dossier.nomPatient)} &nbsp;|&nbsp; <strong>N° Dossier :</strong> ${echapperHTML(dossier.numDossier || 'N/R')}</p><p class="info-patient"><strong>ONG / Type :</strong> ${echapperHTML(dossier.ongPartenaire || 'Privé')} (${echapperHTML(dossier.typePatient || 'ONG')})</p><p class="info-patient"><strong>Téléphone :</strong> ${echapperHTML(dossier.telephone || 'N/R')}</p><p class="info-patient"><strong>Date d'ouverture :</strong> ${echapperHTML(dossier.dateHeure)}</p><p><strong>Total :</strong> ${formatGourdes(dossier.totalGlobal)} Gdes (${formatDH(dossier.totalGlobal)} DH)</p><h3>Fiches :</h3>${dossier.fiches?.map(f => `<div style="border:1px solid #ddd;margin:10px 0;padding:10px;"><p><strong>Fiche N°${f.numeroFiche}</strong> - Total : ${formatGourdes(f.totalGlobal)} Gdes</p><table><thead><tr><th>Catégorie</th><th>Montant</th></tr></thead><tbody>${Object.entries(f.breakdown || {}).map(([key, val]) => { if (val === 0) return ''; const cat = CATEGORIES_LISTE.find(c => c.key === key); return `<tr><td>${echapperHTML(cat ? cat.label : key)}</td><td>${formatGourdes(val)}</td></tr>`; }).join('')}</tbody></table><p class="meta-fiche">Mode de paiement : ${echapperHTML((f.modePaiement || 'cash').toUpperCase())} &nbsp;|&nbsp; Encaissé par : ${echapperHTML(f.creePar || 'inconnu')} &nbsp;|&nbsp; ${f.dateCreation ? new Date(f.dateCreation).toLocaleString('fr-FR') : ''}</p></div>`).join('')}<p class="total">Total général : ${formatGourdes(dossier.totalGlobal)} Gdes (${formatDH(dossier.totalGlobal)} DH)</p></body></html>`;
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) { showToast("Autorisez les pop-ups", "error"); return; }
    win.document.write(contenu); win.document.close(); win.focus(); setTimeout(() => win.print(), 500);
  };

  const peutSupprimer = userRole === 'direction' || userRole === 'administrateur';
  const peutModifier = userRole === 'direction' || userRole === 'administrateur' || userRole === 'comptable';
  const peutExporter = userRole === 'auditeur' || userRole === 'comptable' || userRole === 'direction' || userRole === 'administrateur';
  const peutRouvrir = userRole === 'comptable' || userRole === 'direction' || userRole === 'administrateur';
  const rouvrirDossierSuspendu = (dossier) => { if (!confirm(`Rouvrir le dossier de ${dossier.nomPatient} ?`)) return; onChargerPourModif(dossier); showToast(`Dossier de ${dossier.nomPatient} rouvert`, "success"); };

  return (
    <div className="space-y-4 text-xs">
      <div className="bg-white p-3 rounded-xl border shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Type</label><select value={filtreType} onChange={e => setFiltreType(e.target.value)} className="border rounded-lg p-1.5 bg-white outline-none"><option value="">Tous</option><option value="ONG">🏥 ONG</option><option value="PRIVE">💳 Privé</option></select></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-400 uppercase">ONG</label><select value={filtreOng} onChange={e => setFiltreOng(e.target.value)} className="border rounded-lg p-1.5 bg-white outline-none" disabled={filtreType === "PRIVE"}><option value="">Tous</option>{LISTE_ONG.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Nom</label><input type="text" value={rechercheNomPatient} onChange={e => setRechercheNomPatient(e.target.value)} placeholder="Nom..." className="border rounded-lg p-1.5 outline-none" /></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Date début</label><input type="date" value={filtreDateDebut} onChange={e => setFiltreDateDebut(e.target.value)} className="border rounded-lg p-1.5 bg-white outline-none" /></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Date fin</label><input type="date" value={filtreDateFin} onChange={e => setFiltreDateFin(e.target.value)} className="border rounded-lg p-1.5 bg-white outline-none" /></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Catégorie</label><select value={filtreCategorie} onChange={e => setFiltreCategorie(e.target.value)} className="border rounded-lg p-1.5 bg-white outline-none"><option value="">Toutes</option>{CATEGORIES_LISTE.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
        <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Statut</label><select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)} className="border rounded-lg p-1.5 bg-white outline-none"><option value="">Tous</option><option value="actif">Actif</option><option value="suspendu">Suspendu</option><option value="archived">Archivé</option></select></div>
      </div>
      <div className="flex justify-end"><button onClick={()=>{setFiltreType("");setFiltreOng("");setRechercheNomPatient("");setFiltreDateDebut("");setFiltreDateFin("");setFiltreCategorie("");setFiltreStatut("");}} className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs font-bold">Réinitialiser</button></div>

      {peutExporter && (
        <div className="bg-white p-4 rounded-xl border border-purple-300 shadow-sm space-y-3">
          <h3 className="font-black text-purple-950 text-xs uppercase tracking-wider">💼 Clôture & Facturation</h3>
          <div className="flex flex-wrap gap-2 items-end">
            <select value={dossierPourExport||""} onChange={e=>setDossierPourExport(e.target.value||null)} className="border rounded-lg p-1.5 text-xs bg-white font-bold outline-none"><option value="">-- Partenaire --</option>{LISTE_ONG.map(o=><option key={o} value={o}>{o}</option>)}</select>
            {dossierPourExport && (
              <div className="flex flex-wrap gap-4 items-center bg-white p-2 rounded-lg border border-dashed shadow-sm">
                <label className="flex items-center gap-1 font-bold text-purple-900 cursor-pointer"><input type="checkbox" checked={appliqueRabais10} onChange={e=>setAppliqueRabais10(e.target.checked)} className="rounded" /> Rabais 10%</label>
                <div className="flex items-center gap-1"><span className="font-semibold text-gray-500">Dons:</span><input type="number" min="0" value={montantDonIntrants} onChange={e=>setMontantDonIntrants(e.target.value)} placeholder="0" className="border rounded p-1 w-24 font-mono font-bold text-right text-red-700 outline-none" /></div>
                <button onClick={()=>exporterBlocDossiersExcelPartenaire(dossierPourExport)} className="bg-purple-700 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 shadow"><Download size={13}/> Excel</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl border shadow-sm space-y-2">
        <h2 className="text-xs font-black text-gray-700 uppercase border-b pb-1">📁 Dossiers ({dossiersFiltres.length}{dossiersFiltres.length > nombreAffiche ? ` — ${nombreAffiche} affichés` : ''})</h2>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-white shadow-sm"><tr className="bg-gray-100 text-[10px] text-gray-500 uppercase border-b font-mono"><th className="p-2">Date</th><th className="p-2">Patient</th><th className="p-2">Type</th><th className="p-2">ONG</th><th className="p-2 text-center">Vol.</th><th className="p-2 text-right">Total</th><th className="p-2 text-center">Statut</th><th className="p-2 text-center">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-100 font-mono text-[11px]">
              {dossiersFiltres.slice(0, nombreAffiche).map(v => {
                const statut = v.status || 'archived';
                const isSuspendu = statut === 'suspendu';
                // Filet de sécurité : si totalGlobal est absent/invalide côté données,
                // on recalcule à partir des fiches plutôt que d'afficher 0 silencieusement.
                const totalFiable = Number.isFinite(v.totalGlobal) && v.totalGlobal > 0
                  ? v.totalGlobal
                  : (v.fiches || []).reduce((s, f) => s + (Number(f.totalGlobal) || 0), 0);
                return (
                  <tr key={v.id} className={isSuspendu ? 'bg-amber-50/60 border-l-4 border-amber-400' : (v.contientErreurs?'bg-red-50/40 border-l-4 border-red-500':'hover:bg-gray-50/50')}>
                    <td className="p-2 text-gray-500">{v.dateHeure}</td>
                    <td className="p-2 font-bold font-sans flex items-center gap-1">{v.verrouilleFacture && <span>🔒</span>}{v.nomPatient}</td>
                    <td className="p-2 text-center">{(v.typePatient||'ONG') === 'ONG' ? '🏥 ONG' : '💳 Privé'}</td>
                    <td className="p-2 text-purple-800 font-bold">{v.ongPartenaire}</td>
                    <td className="p-2 text-center text-gray-600">{(v.fiches||[]).length}</td>
                    <td className="p-2 text-right font-bold text-emerald-800" title={v.totalGlobal !== totalFiable ? "Recalculé à partir des fiches — la valeur stockée était absente ou à zéro" : ""}>{formatDH(totalFiable)} DH{v.totalGlobal !== totalFiable && <span className="text-amber-500"> ⚠️</span>}</td>
                    <td className="p-2 text-center">{statut === 'suspendu' ? <span className="text-amber-600 font-bold flex items-center gap-1"><Clock size={12}/> Suspendu</span> : statut === 'actif' ? <span className="text-blue-600">Actif</span> : <span className="text-gray-400">Archivé</span>}</td>
                    <td className="p-2 flex justify-center gap-1 flex-wrap">
                      <button onClick={()=>setFocusedVerif(v)} className="text-blue-600 p-1 bg-blue-50 rounded" title="Voir"><Eye size={13}/></button>
                      {peutModifier && <button onClick={()=>{
                        const statut = v.status || 'archived';
                        if (statut === 'archived' && !confirm(`Ce dossier est déjà archivé. Le modifier corrigera CE dossier existant (pas une nouvelle visite).\n\nPour une nouvelle visite de ${v.nomPatient}, utilise plutôt "Rechercher un patient existant" dans l'onglet Calcul Facture.\n\nContinuer quand même pour corriger ce dossier ?`)) return;
                        onChargerPourModif(v);
                      }} className="text-amber-700 p-1 bg-amber-50 rounded" title="Modifier / corriger"><Pencil size={13}/></button>}
                      {peutSupprimer && <button onClick={()=>onSupprimer(v.id)} disabled={v.verrouilleFacture} className="text-gray-300 hover:text-red-600 p-1 disabled:opacity-20"><Trash2 size={13}/></button>}
                      <button onClick={()=>imprimerArchive(v)} className="text-gray-600 p-1 bg-gray-50 rounded" title="Imprimer"><Printer size={13}/></button>
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

      {focusedVerif && (
        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-md space-y-4">
          <div className="flex justify-between items-center border-b pb-1"><h3 className="font-bold text-blue-900 text-xs uppercase">🔍 {focusedVerif.nomPatient}</h3><div className="flex gap-2"><button onClick={() => imprimerArchive(focusedVerif)} className="bg-gray-700 text-white px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"><Printer size={12}/> Imprimer dossier</button><button onClick={() => setFocusedVerif(null)}><X size={14}/></button></div></div>
          {onChangerTypeOng && peutModifier && (
            !editTypeArchiveOuvert ? (
              <div className="flex items-center gap-2 text-xs bg-gray-50 border rounded-lg p-2">
                <span className="font-bold text-purple-700">{focusedVerif.ongPartenaire || 'Privé'} - {focusedVerif.typePatient || 'ONG'}</span>
                <button onClick={()=>{ setNouveauTypeArchive(focusedVerif.typePatient||'ONG'); setNouvelOngArchive(focusedVerif.ongPartenaire||''); setEditTypeArchiveOuvert(true); }} className="text-[10px] font-bold text-blue-600 underline">✏️ Changer Privé/ONG</button>
              </div>
            ) : (
              <div className="flex gap-1.5 items-center bg-gray-50 border rounded-lg p-2 flex-wrap">
                <select value={nouveauTypeArchive} onChange={e=>setNouveauTypeArchive(e.target.value)} className="border rounded p-1 text-xs bg-white">
                  <option value="ONG">🏥 ONG</option><option value="PRIVE">💳 Privé</option>
                </select>
                {nouveauTypeArchive === "ONG" && (
                  <select value={nouvelOngArchive} onChange={e=>setNouvelOngArchive(e.target.value)} className="border rounded p-1 text-xs bg-white">
                    <option value="">-- ONG --</option>{LISTE_ONG.map(o => <option key={o} value={o}>{o}</option>)}
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
