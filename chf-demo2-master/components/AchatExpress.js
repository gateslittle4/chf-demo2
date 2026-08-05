// components/AchatExpress.js
// Vente rapide au comptoir : plusieurs articles (panier), sans passer par tout le
// flux "Nouveau Dossier". Fonctionne aussi hors ligne (voir api/supabase.js).
const React = window.React;
const { useState, useMemo, useRef, useEffect } = React;
const { chf, toEpisodeApi, toPaiementApi, generateLocalId } = require('../api/supabase');
const { auth, LOG_MEDS_KEY } = require('../api/firebase');
const { CATEGORIES_LISTE } = require('../utils/constants');
const { formatGourdes, formatDH, echapperHTML, formaterNomPropre } = require('../utils/helpers');
const { Search, X, Plus } = require('../utils/icons');

function AchatExpress({ medicaments, actes, setMedicaments, userRole, showToast, onFermer, onDossierCree }) {
  const [categorie, setCategorie] = useState("med");
  const [recherche, setRecherche] = useState("");
  const [selection, setSelection] = useState(null);
  const [quantite, setQuantite] = useState("1");
  const [panier, setPanier] = useState([]); // [{ itemId, categorie, sub, nom, qte, prix }]
  const [nomClient, setNomClient] = useState("");
  const [montantVerse, setMontantVerse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const inputRef = useRef(null);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  const catalogueFiltre = categorie === "med" ? medicaments : actes;
  const suggestions = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return catalogueFiltre.slice(0, 6);
    return catalogueFiltre.filter(i => i.nom.toLowerCase().includes(q)).slice(0, 6);
  }, [recherche, catalogueFiltre]);

  const qte = parseFloat(quantite) || 0;
  const totalPanier = useMemo(() => panier.reduce((s, l) => s + l.qte * l.prix, 0), [panier]);
  const verse = parseFloat(montantVerse) || 0;
  const monnaie = Math.max(0, verse - totalPanier);

  const peutVendre = userRole === 'comptable' || userRole === 'direction' || userRole === 'administrateur';

  const ajouterAuPanier = () => {
    if (!selection) { showToast("Sélectionne un article.", "error"); return; }
    if (qte <= 0) { showToast("Quantité invalide.", "error"); return; }
    if (categorie === "med") {
      const dejaDansPanier = panier.filter(l => l.itemId === selection.id).reduce((s,l) => s + l.qte, 0);
      if ((selection.quantite || 0) < dejaDansPanier + qte) { showToast(`Stock insuffisant (restant : ${selection.quantite||0}).`, "error"); return; }
    }
    setPanier(prev => {
      const idx = prev.findIndex(l => l.itemId === selection.id && l.categorie === categorie);
      if (idx !== -1) return prev.map((l,i) => i===idx ? { ...l, qte: l.qte + qte } : l);
      return [...prev, { itemId: selection.id, categorie, sub: selection.sub || '', nom: selection.nom, qte, prix: selection.prix }];
    });
    setSelection(null); setRecherche(""); setQuantite("1");
    if (inputRef.current) inputRef.current.focus();
  };

  const retirerDuPanier = (idx) => setPanier(prev => prev.filter((_, i) => i !== idx));

  const imprimerTicketExpress = (nom, lignes, totalVente, verseVal, renduVal) => {
    const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket CHF - Achat Express</title><style>@page{size:80mm 200mm;margin:3mm 5mm;}body{font-family:'Courier New',monospace;font-size:12px;color:#000;width:70mm;margin:0 auto;}.entete{text-align:center;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:8px;}.entete h1{font-size:18px;margin:4px 0;}.entete p{margin:2px 0;font-size:10px;}table{width:100%;border-collapse:collapse;margin:6px 0;font-size:11px;}th,td{padding:4px;text-align:left;border-bottom:1px dotted #ccc;}.total{font-weight:bold;font-size:15px;text-align:right;border-top:2px solid #000;padding-top:6px;margin-top:6px;}.footer{margin-top:10px;font-size:9px;text-align:center;border-top:1px dashed #ccc;padding-top:6px;}</style></head><body><div class="entete"><h1>CHF</h1><p>Centre Hospitalier de Fontaine</p><p>Achat Express — Comptoir</p><p>${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</p></div><p>Client: ${echapperHTML(nom || 'Comptoir')}</p><table><thead><tr><th>Article</th><th>Qté</th><th>Total</th></tr></thead><tbody>${lignes.map(l => `<tr><td>${echapperHTML(l.nom)}</td><td>${l.qte}</td><td>${formatGourdes(l.qte*l.prix)}</td></tr>`).join('')}</tbody></table><div class="total">TOTAL : ${formatGourdes(totalVente)} Gdes (${formatDH(totalVente)} DH)</div><p>Versé: ${formatGourdes(verseVal)} Gdes<br/>Monnaie: ${formatGourdes(renduVal)} Gdes</p><div class="footer">Merci de votre visite !</div></body></html>`;
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) { showToast("Autorisez les pop-ups.", "error"); return; }
    win.document.write(contenu); win.document.close(); win.focus(); setTimeout(() => win.print(), 400);
  };

  const validerAchat = async () => {
    if (panier.length === 0) { showToast("Le panier est vide.", "error"); return; }
    if (!totalPanier || totalPanier <= 0) { showToast("Impossible d'encaisser : le total est à 0 Gdes.", "error"); return; }
    if (verse < totalPanier) { showToast(`Montant insuffisant. Reste : ${formatGourdes(totalPanier - verse)} Gdes`, "error"); return; }

    setEnCours(true);
    const nomFinal = formaterNomPropre(nomClient) || "Client Comptoir";
    const localId = generateLocalId();

    // Répartit chaque ligne du panier dans sa vraie catégorie (sub) — plus de fourre-tout "chirurgie"
    const breakdown = {};
    CATEGORIES_LISTE.forEach(c => breakdown[c.key] = 0);
    panier.forEach(l => {
      const montant = l.qte * l.prix;
      if (l.categorie === 'med') breakdown.med += montant;
      else if (l.sub && breakdown[l.sub] !== undefined) breakdown[l.sub] += montant;
      else breakdown.chirurgie += montant; // filet de sécurité si l'acte n'a jamais été classé
    });

    const fiche = {
      id: "fiche-" + Date.now(),
      numeroFiche: 1,
      breakdown,
      totalGlobal: totalPanier,
      modePaiement: "cash",
      montantPaye: verse,
      solde: 0,
      dateCreation: new Date().toISOString(),
      creePar: auth.currentUser?.displayName || 'inconnu',
      rawState: { lignesCalcul: panier.map((l, i) => ({ id: "l-express-" + i, itemId: l.itemId, type: l.categorie, sub: l.sub, nom: l.nom, qte: l.qte, prix: l.prix })) }
    };

    const episodeData = {
      nomPatient: nomFinal, ongPartenaire: "", typePatient: "PRIVE",
      numDossier: "", dateNaissance: "", telephone: "",
      status: 'archived', timestamp: Date.now(), dateHeure: new Date().toLocaleDateString("fr-FR"),
      totalGlobal: totalPanier, fiches: [fiche], montantPaye: verse, solde: 0
    };

    try {
      let episodeId;
      let horsLigne = false;
      try {
        const newEpisode = await chf.createEpisode(toEpisodeApi(episodeData), localId);
        episodeId = newEpisode.id;
      } catch (err) {
        if (!err.isOfflineQueue) throw err;
        episodeId = localId;
        horsLigne = true;
      }

      try {
        await chf.createPaiement(toPaiementApi({
          episodeId, patientNom: nomFinal, montant: totalPanier, mode: 'cash',
          ongPartenaire: '', date: new Date().toISOString(),
          encaissePar: auth.currentUser?.displayName || 'inconnu', typePatient: 'PRIVE'
        }));
      } catch (err) { if (!err.isOfflineQueue) throw err; horsLigne = true; }

      // Décrémente le stock de chaque médicament vendu
      const medsVendus = panier.filter(l => l.categorie === 'med');
      if (medsVendus.length > 0) {
        const updated = medicaments.map(m => {
          const ligne = medsVendus.find(l => l.itemId === m.id);
          return ligne ? { ...m, quantite: Math.max(0, (m.quantite || 0) - ligne.qte) } : m;
        });
        setMedicaments(updated);
        localStorage.setItem(LOG_MEDS_KEY, JSON.stringify(updated));
        chf.updateCatalog('medicaments', updated).catch(() => {});
      }

      if (horsLigne) showToast("📴 Vente enregistrée hors ligne — sera synchronisée au retour d'internet", "info");
      else showToast(`✅ Vente enregistrée : ${formatGourdes(totalPanier)} Gdes`, "success");

      onDossierCree({ ...episodeData, id: episodeId });
      if (confirm("🖨️ Imprimer le ticket ?")) imprimerTicketExpress(nomFinal, panier, totalPanier, verse, monnaie);

      setPanier([]); setSelection(null); setRecherche(""); setQuantite("1"); setNomClient(""); setMontantVerse("");
    } catch (error) {
      showToast("Erreur : " + error.message, "error");
    } finally {
      setEnCours(false);
    }
  };

  if (!peutVendre) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onFermer}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center border-b pb-2">
          <h3 className="font-black text-[#1E2A24]">⚡ Achat Express</h3>
          <button onClick={onFermer}><X size={18}/></button>
        </div>

        {!online && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-3 py-2 text-[11px] font-bold flex items-center gap-2">
            🔴 Hors ligne — la vente sera enregistrée localement et synchronisée automatiquement au retour d'internet.
          </div>
        )}

        <p className="text-[11px] text-gray-500">Vente rapide au comptoir — ajoute un ou plusieurs articles au panier, puis encaisse.</p>

        <div className="flex gap-2 text-xs font-semibold">
          <button onClick={()=>{ setCategorie("med"); setSelection(null); setRecherche(""); }} className={`flex-1 py-1.5 border rounded-lg ${categorie==="med" ? "bg-[#1E2A24] text-white" : "bg-gray-50"}`}>💊 Pharmacie</button>
          <button onClick={()=>{ setCategorie("acte"); setSelection(null); setRecherche(""); }} className={`flex-1 py-1.5 border rounded-lg ${categorie==="acte" ? "bg-[#1E2A24] text-white" : "bg-gray-50"}`}>🔬 Acte</button>
        </div>

        <div className="relative">
          <input ref={inputRef} type="text" value={recherche} onChange={e=>{ setRecherche(e.target.value); setSelection(null); }} placeholder="Rechercher un article..." className="w-full border rounded-lg p-2 text-xs pl-8 outline-none" />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"><Search size={14}/></span>
          {!selection && suggestions.length > 0 && (
            <ul className="absolute z-10 left-0 right-0 bg-white border rounded-lg shadow-2xl mt-1 text-xs max-h-40 overflow-y-auto divide-y">
              {suggestions.map(i => (
                <li key={i.id}><button type="button" onClick={()=>{ setSelection(i); setRecherche(i.nom); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 flex justify-between">
                  <span>{i.nom}</span><span className="text-gray-500 font-mono">{formatGourdes(i.prix)} Gdes</span>
                </button></li>
              ))}
            </ul>
          )}
        </div>

        {selection && (
          <div className="bg-gray-50 border rounded-lg p-3 space-y-2 text-xs">
            <div className="flex justify-between font-bold"><span>{selection.nom}</span><span>{formatGourdes(selection.prix)} Gdes / unité</span></div>
            <div className="flex items-center gap-2">
              <label className="font-bold text-gray-500">Quantité :</label>
              <input type="number" min="1" value={quantite} onChange={e=>setQuantite(e.target.value)} className="w-20 border rounded p-1.5 text-center font-mono" />
              <button onClick={ajouterAuPanier} className="ml-auto bg-[#1E2A24] text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><Plus size={12}/> Ajouter au panier</button>
            </div>
          </div>
        )}

        {panier.length > 0 && (
          <div className="bg-white border rounded-lg divide-y">
            <div className="px-3 py-1.5 bg-gray-50 text-[10px] font-bold uppercase text-gray-500">🛒 Panier ({panier.length} article{panier.length>1?'s':''})</div>
            {panier.map((l, idx) => (
              <div key={idx} className="flex justify-between items-center px-3 py-1.5 text-xs">
                <span>{l.nom} <span className="text-gray-400">×{l.qte}</span></span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold">{formatGourdes(l.qte * l.prix)} Gdes</span>
                  <button onClick={()=>retirerDuPanier(idx)} className="text-gray-300 hover:text-red-600"><X size={12}/></button>
                </div>
              </div>
            ))}
            <div className="flex justify-between px-3 py-2 font-black text-sm bg-gray-50"><span>TOTAL</span><span>{formatGourdes(totalPanier)} Gdes ({formatDH(totalPanier)} DH)</span></div>
          </div>
        )}

        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase">Nom du client (optionnel)</label>
          <input type="text" value={nomClient} onChange={e=>setNomClient(e.target.value)} placeholder="Client comptoir" className="w-full border rounded-lg p-2 text-xs outline-none" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase">Montant versé</label>
            <input type="number" min="0" value={montantVerse} onChange={e=>setMontantVerse(e.target.value)} placeholder="0" className="w-full border rounded-lg p-2 text-sm font-mono" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase">Monnaie</label>
            <div className="bg-gray-100 p-2 rounded-lg text-right font-mono font-bold text-emerald-700">{formatGourdes(monnaie)} Gdes</div>
          </div>
        </div>

        <button onClick={validerAchat} disabled={panier.length === 0 || enCours} className="w-full bg-emerald-700 hover:bg-emerald-800 text-white py-2.5 rounded-lg text-sm font-bold shadow-md disabled:opacity-50">
          {enCours ? "Traitement..." : `💳 Encaisser le panier (${formatGourdes(totalPanier)} Gdes)`}
        </button>
      </div>
    </div>
  );
}

module.exports = AchatExpress;
