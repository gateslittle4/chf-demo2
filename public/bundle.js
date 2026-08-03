(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // api/firebase.js
  var require_firebase = __commonJS({
    "api/firebase.js"(exports, module) {
      var firebaseConfig = {
        apiKey: "AIzaSyB20Q4P80hnQ0Tn0injqWJz-k5Vkd4TUXE",
        authDomain: "chf-verification.firebaseapp.com",
        projectId: "chf-verification",
        storageBucket: "chf-verification.firebasestorage.app",
        messagingSenderId: "980296599756",
        appId: "1:980296599756:web:dfc09a14f10b5d53ea5a69"
      };
      firebase.initializeApp(firebaseConfig);
      var auth = firebase.auth();
      var db = firebase.firestore();
      window.db = db;
      var LOG_MEDS_KEY = "chf-pharmacie-storage-v2";
      var LOG_ACTES_KEY = "chf-actes-storage-v2";
      var LOG_VERIF_KEY = "chf-verif-storage-v16";
      var LOG_TARGETS_KEY = "chf-targets-storage-v16";
      var LOG_DOSSIER_BROUILLON_KEY = "chf-dossier-brouillon-v16";
      async function enregistrerAudit(action, details = {}) {
        var _a, _b, _c;
        try {
          await db.collection("audit_log").add({
            action,
            details,
            effectuePar: ((_a = auth.currentUser) == null ? void 0 : _a.displayName) || ((_b = auth.currentUser) == null ? void 0 : _b.email) || "inconnu",
            effectueParUid: ((_c = auth.currentUser) == null ? void 0 : _c.uid) || null,
            date: firebase.firestore.FieldValue.serverTimestamp()
          });
        } catch (e) {
          console.warn("Journal d'audit: \xE9chec d'\xE9criture", e);
        }
      }
      module.exports = {
        firebase,
        auth,
        db,
        enregistrerAudit,
        LOG_MEDS_KEY,
        LOG_ACTES_KEY,
        LOG_VERIF_KEY,
        LOG_TARGETS_KEY,
        LOG_DOSSIER_BROUILLON_KEY
      };
    }
  });

  // api/supabase.js
  var require_supabase = __commonJS({
    "api/supabase.js"(exports, module) {
      var API_BASE = "https://chf-backend.onrender.com/api";
      function generateLocalId() {
        return "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      }
      var CHF_API = class {
        constructor() {
          this.pendingQueue = JSON.parse(localStorage.getItem("pending_ops") || "[]");
          this.isOnline = navigator.onLine;
          window.addEventListener("online", () => {
            this.isOnline = true;
            this.syncPending();
          });
          window.addEventListener("offline", () => {
            this.isOnline = false;
          });
        }
        async request(endpoint, method = "GET", data = null, meta = {}) {
          const options = { method, headers: { "Content-Type": "application/json" } };
          try {
            const { auth } = require_firebase();
            if (auth.currentUser) {
              const idToken = await auth.currentUser.getIdToken();
              options.headers["Authorization"] = `Bearer ${idToken}`;
            }
          } catch (e) {
            console.warn("Impossible de joindre le jeton d'authentification:", e);
          }
          if (data) options.body = JSON.stringify(data);
          try {
            const response = await fetch(`${API_BASE}${endpoint}`, options);
            if (!response.ok) {
              const err = await response.json();
              throw new Error(err.error || `Erreur serveur (${response.status})`);
            }
            if (method === "DELETE") return { success: true };
            return await response.json();
          } catch (error) {
            if (error.message.includes("Failed to fetch") || !navigator.onLine) {
              console.warn("\u{1F534} Hors ligne, mise en file d'attente:", endpoint, data);
              this.pendingQueue.push({ endpoint, method, data, timestamp: Date.now(), localId: meta.localId || null });
              localStorage.setItem("pending_ops", JSON.stringify(this.pendingQueue));
              const offlineError = new Error("Hors ligne. Op\xE9ration en attente.");
              offlineError.isOfflineQueue = true;
              throw offlineError;
            }
            throw error;
          }
        }
        // Nombre d'opérations en attente de synchronisation (utile pour un badge dans l'UI)
        countPending() {
          return this.pendingQueue.length;
        }
        // Retire de la file une création jamais synchronisée (ex: dossier ouvert hors-ligne puis annulé avant le retour d'internet)
        removePendingByLocalId(localId) {
          this.pendingQueue = this.pendingQueue.filter((op) => op.localId !== localId);
          localStorage.setItem("pending_ops", JSON.stringify(this.pendingQueue));
        }
        async syncPending() {
          if (!navigator.onLine || this.pendingQueue.length === 0) return;
          console.log(`\u{1F504} Sync de ${this.pendingQueue.length} op\xE9rations...`);
          const queue = [...this.pendingQueue];
          this.pendingQueue = [];
          for (const op of queue) {
            try {
              const result = await this.request(op.endpoint, op.method, op.data);
              if (op.localId && result && result.id) {
                window.dispatchEvent(new CustomEvent("chf:synced", { detail: { localId: op.localId, realId: result.id, endpoint: op.endpoint } }));
              }
            } catch (e) {
              console.warn("\xC9chec sync, r\xE9essaiera plus tard:", e.message);
              this.pendingQueue.push(op);
            }
          }
          localStorage.setItem("pending_ops", JSON.stringify(this.pendingQueue));
          console.log("\u2705 Sync termin\xE9e.");
        }
        async getEpisodes() {
          return this.request("/episodes");
        }
        async createEpisode(data, localId) {
          return this.request("/episodes", "POST", data, { localId });
        }
        async updateEpisode(id, data) {
          return this.request(`/episodes/${id}`, "PUT", data);
        }
        async deleteEpisode(id) {
          return this.request(`/episodes/${id}`, "DELETE");
        }
        async getPaiements() {
          return this.request("/paiements");
        }
        async createPaiement(data, localId) {
          return this.request("/paiements", "POST", data, { localId });
        }
        async getCatalog(type) {
          return this.request(`/catalog/${type}`);
        }
        async updateCatalog(type, items) {
          return this.request(`/catalog/${type}`, "PUT", { items });
        }
      };
      function toEpisodeApi(data) {
        const map = {
          nomPatient: "nom_patient",
          ongPartenaire: "ong_partenaire",
          typePatient: "type_patient",
          numDossier: "num_episode",
          dateNaissance: "date_naissance",
          dateHeure: "date_heure",
          totalGlobal: "total_global",
          montantPaye: "montant_paye",
          dateEntreePourTri: "date_entree_pour_tri",
          periodeSejourString: "periode_sejour_string",
          totalSaisiePapierDH: "total_saisie_papier_dh",
          contientErreurs: "contient_erreurs",
          verrouilleFacture: "verrouille_facture",
          dateSuspension: "date_suspension",
          updatedAt: "updated_at",
          serviceChoisi: "service_choisi"
        };
        const result = {};
        for (const [k, v] of Object.entries(data)) result[map[k] || k] = v;
        return result;
      }
      function fromEpisodeApi(data) {
        const map = {
          nom_patient: "nomPatient",
          ong_partenaire: "ongPartenaire",
          type_patient: "typePatient",
          num_episode: "numDossier",
          date_naissance: "dateNaissance",
          date_heure: "dateHeure",
          total_global: "totalGlobal",
          montant_paye: "montantPaye",
          date_entree_pour_tri: "dateEntreePourTri",
          periode_sejour_string: "periodeSejourString",
          total_saisie_papier_dh: "totalSaisiePapierDH",
          contient_erreurs: "contientErreurs",
          verrouille_facture: "verrouilleFacture",
          date_suspension: "dateSuspension",
          updated_at: "updatedAt",
          service_choisi: "serviceChoisi"
        };
        const result = {};
        for (const [k, v] of Object.entries(data)) result[map[k] || k] = v;
        return result;
      }
      function toPaiementApi(data) {
        const map = {
          episodeId: "episode_id",
          patientNom: "patient_nom",
          ongPartenaire: "ong_partenaire",
          encaissePar: "encaisse_par",
          soldeRestant: "solde_restant",
          typePatient: "type_patient"
        };
        const result = {};
        for (const [k, v] of Object.entries(data)) result[map[k] || k] = v;
        return result;
      }
      function fromPaiementApi(data) {
        const map = {
          episode_id: "episodeId",
          patient_nom: "patientNom",
          ong_partenaire: "ongPartenaire",
          encaisse_par: "encaissePar",
          solde_restant: "soldeRestant",
          type_patient: "typePatient"
        };
        const result = {};
        for (const [k, v] of Object.entries(data)) result[map[k] || k] = v;
        return result;
      }
      var chf = new CHF_API();
      window.chf = chf;
      module.exports = { CHF_API, chf, toEpisodeApi, fromEpisodeApi, toPaiementApi, fromPaiementApi, API_BASE, generateLocalId };
    }
  });

  // utils/constants.js
  var require_constants = __commonJS({
    "utils/constants.js"(exports, module) {
      var LISTE_ONG = ["MSF-H", "MSF-F", "ALIMA", "AVSI", "GRID MISSION", "WAY TO HEALTH", "TEAM TASSY"];
      var CONFIG_LITS = {
        normal: { nom: "Lit normal", prix: 250 },
        semi_prive: { nom: "Salle Semi Priv\xE9", prix: 500 },
        prive: { nom: "Salle Priv\xE9", prix: 750 },
        isolette: { nom: "Lit Isolette", prix: 1250 },
        incubateur: { nom: "Incubateur", prix: 2500 }
      };
      var CATEGORIES_LISTE = [
        { key: "service", label: "Admission / Consultation" },
        { key: "hospit", label: "H\xE9bergement" },
        { key: "labo", label: "Laboratoire" },
        { key: "med", label: "Pharmacie" },
        { key: "oxygene", label: "Oxyg\xE8ne" },
        { key: "curetage", label: "Curetage" },
        { key: "accouchement", label: "Accouchement" },
        { key: "sono", label: "Sonographie" },
        { key: "cesarienne", label: "C\xE9sarienne" },
        { key: "chirurgie", label: "Chirurgie" },
        { key: "ecg", label: "ECG" },
        { key: "suture", label: "Suture" },
        { key: "pansement", label: "Pansement" },
        { key: "drainage", label: "Drainage" },
        { key: "radio", label: "Radiographie" },
        { key: "pap", label: "PAP Test" },
        { key: "visite", label: "Visite" },
        { key: "nebulisation", label: "N\xE9bulisation" }
      ];
      var DB_NAME = "CHFAuditeurProDB_v16";
      var STORE_NAME = "archives_dossiers";
      module.exports = {
        LISTE_ONG,
        CONFIG_LITS,
        CATEGORIES_LISTE,
        DB_NAME,
        STORE_NAME
      };
    }
  });

  // utils/defaultCatalog.js
  var require_defaultCatalog = __commonJS({
    "utils/defaultCatalog.js"(exports, module) {
      var MEDICAMENTS_PAR_DEFAUT = [
        {
          "id": "m275",
          "nom": "Acide folique",
          "prix": 15
        },
        {
          "id": "m2",
          "nom": "Adr\xE9naline",
          "prix": 350
        },
        {
          "id": "m3",
          "nom": "Ambroxol",
          "prix": 350
        },
        {
          "id": "m1",
          "nom": "Amd",
          "prix": 50
        },
        {
          "id": "m4",
          "nom": "Amicacine",
          "prix": 1500
        },
        {
          "id": "m5",
          "nom": "Aminophilline",
          "prix": 1500
        },
        {
          "id": "m276",
          "nom": "Amlodipine",
          "prix": 15
        },
        {
          "id": "m6",
          "nom": "Amoxicilline Co 250mg",
          "prix": 15
        },
        {
          "id": "m7",
          "nom": "Amoxicilline Sp 125mg",
          "prix": 500
        },
        {
          "id": "m8",
          "nom": "AmoxiClav Sp 457mg/5ml",
          "prix": 1250
        },
        {
          "id": "m9",
          "nom": "Ampicilline 2g",
          "prix": 350
        },
        {
          "id": "m10",
          "nom": "Aspirin 325mg",
          "prix": 10
        },
        {
          "id": "m11",
          "nom": "Aspirin Bayer 100mg",
          "prix": 10
        },
        {
          "id": "m12",
          "nom": "Azithromycine",
          "prix": 350
        },
        {
          "id": "m13",
          "nom": "B-Stress",
          "prix": 25
        },
        {
          "id": "m14",
          "nom": "Babina 1",
          "prix": 650
        },
        {
          "id": "m15",
          "nom": "Bandage \xE9lastique",
          "prix": 125
        },
        {
          "id": "m16",
          "nom": "Beclometasone 100",
          "prix": 450
        },
        {
          "id": "m17",
          "nom": "Beclometasone 200",
          "prix": 450
        },
        {
          "id": "m18",
          "nom": "Beclometasone 50",
          "prix": 450
        },
        {
          "id": "m19",
          "nom": "Bella Phen Sp",
          "prix": 600
        },
        {
          "id": "m20",
          "nom": "Benadryl Sp 1mg/ml",
          "prix": 250
        },
        {
          "id": "m21",
          "nom": "Betacid/Litacid Sp",
          "prix": 650
        },
        {
          "id": "m22",
          "nom": "Bledilait 900g 3\xE8me \xE2ge",
          "prix": 1250
        },
        {
          "id": "m23",
          "nom": "Bronal Co",
          "prix": 50
        },
        {
          "id": "m24",
          "nom": "Bronchomax Sp",
          "prix": 350
        },
        {
          "id": "m25",
          "nom": "Buretrol",
          "prix": 500
        },
        {
          "id": "m26",
          "nom": "Buscopan Ampoule",
          "prix": 250
        },
        {
          "id": "m27",
          "nom": "Buscopan comprim\xE9 10mg",
          "prix": 75
        },
        {
          "id": "m28",
          "nom": "Calamine lotion 120ml",
          "prix": 250
        },
        {
          "id": "m29",
          "nom": "Calcium gluconate Amp 10ml",
          "prix": 500
        },
        {
          "id": "m30",
          "nom": "Canule O2",
          "prix": 500
        },
        {
          "id": "m31",
          "nom": "Captopril Co 25mg",
          "prix": 15
        },
        {
          "id": "m32",
          "nom": "Cardicor Co 10mg",
          "prix": 20
        },
        {
          "id": "m33",
          "nom": "Cardicor Co 5mg",
          "prix": 20
        },
        {
          "id": "m34",
          "nom": "Catheter Foley 14",
          "prix": 500
        },
        {
          "id": "m35",
          "nom": "Catheter Foley 16",
          "prix": 500
        },
        {
          "id": "m36",
          "nom": "Catheter Foley 18",
          "prix": 500
        },
        {
          "id": "m37",
          "nom": "Catheter Foley 20",
          "prix": 500
        },
        {
          "id": "m38",
          "nom": "Catheter Foley 22",
          "prix": 500
        },
        {
          "id": "m39",
          "nom": "Catheter Foley 24",
          "prix": 500
        },
        {
          "id": "m40",
          "nom": "Cefotaxime",
          "prix": 1250
        },
        {
          "id": "m41",
          "nom": "Cefotaxime Vial 1gr",
          "prix": 1250
        },
        {
          "id": "m42",
          "nom": "Ceftazidime",
          "prix": 1500
        },
        {
          "id": "m43",
          "nom": "Ceftriaxone Vial 1gr",
          "prix": 400
        },
        {
          "id": "m44",
          "nom": "Cephalexin Comprim\xE9 500mg",
          "prix": 15
        },
        {
          "id": "m45",
          "nom": "Cetirizine HCL",
          "prix": 5
        },
        {
          "id": "m46",
          "nom": "Chlorhexidine Gluconate 0.12%",
          "prix": 500
        },
        {
          "id": "m47",
          "nom": "Citrate de caf\xE9ine",
          "prix": 7e3
        },
        {
          "id": "m48",
          "nom": "Clindamycin",
          "prix": 150
        },
        {
          "id": "m49",
          "nom": "Clotrimazol cr\xE8me",
          "prix": 350
        },
        {
          "id": "m50",
          "nom": "Clotrimazol Ovule",
          "prix": 35
        },
        {
          "id": "m51",
          "nom": "Cotrimoxazole Co 480",
          "prix": 15
        },
        {
          "id": "m52",
          "nom": "Cotrimoxazole Co 960",
          "prix": 15
        },
        {
          "id": "m53",
          "nom": "Cotrimoxazole Suspension 240mg",
          "prix": 500
        },
        {
          "id": "m272",
          "nom": "Creatine serum",
          "prix": 500
        },
        {
          "id": "m273",
          "nom": "Creatine urine",
          "prix": 500
        },
        {
          "id": "m54",
          "nom": "D/W 10% fl 500cc",
          "prix": 750
        },
        {
          "id": "m55",
          "nom": "Daktarin 2%",
          "prix": 150
        },
        {
          "id": "m56",
          "nom": "Daktarin Oral (gel)",
          "prix": 250
        },
        {
          "id": "m57",
          "nom": "Dexamethasone Amp 8mg/2ml",
          "prix": 200
        },
        {
          "id": "m58",
          "nom": "Dextrose 5% fl 1000cc",
          "prix": 750
        },
        {
          "id": "m59",
          "nom": "Di gas (goutte)",
          "prix": 500
        },
        {
          "id": "m60",
          "nom": "Diaper",
          "prix": 100
        },
        {
          "id": "m61",
          "nom": "Diaper Enfant",
          "prix": 50
        },
        {
          "id": "m62",
          "nom": "Diclofenac 50mg",
          "prix": 15
        },
        {
          "id": "m63",
          "nom": "Diclofenac Amp 75mg/3ml",
          "prix": 125
        },
        {
          "id": "m64",
          "nom": "Diclofenac Co 100mg",
          "prix": 15
        },
        {
          "id": "m65",
          "nom": "Diclofenac gel",
          "prix": 250
        },
        {
          "id": "m66",
          "nom": "Diphenhydramine Co",
          "prix": 15
        },
        {
          "id": "m67",
          "nom": "Diphenhydramine Sp",
          "prix": 250
        },
        {
          "id": "m68",
          "nom": "Dipirone Amp 1g/2ml",
          "prix": 350
        },
        {
          "id": "m69",
          "nom": "DNS 0.225% fl 1000cc",
          "prix": 750
        },
        {
          "id": "m70",
          "nom": "DNS 0.33% fl 1000cc",
          "prix": 750
        },
        {
          "id": "m71",
          "nom": "DNS 5%/0.45% fl 1000cc",
          "prix": 750
        },
        {
          "id": "m72",
          "nom": "DNS 5%/0.9% fl 1000cc",
          "prix": 750
        },
        {
          "id": "m73",
          "nom": "Dopamine",
          "prix": 1e3
        },
        {
          "id": "m74",
          "nom": "Doxicicline",
          "prix": 15
        },
        {
          "id": "m75",
          "nom": "Dramanol Amp 50mg/ml",
          "prix": 300
        },
        {
          "id": "m76",
          "nom": "Ear dry instant goutte auriculaire 15ml",
          "prix": 100
        },
        {
          "id": "m77",
          "nom": "Eau sterile",
          "prix": 100
        },
        {
          "id": "m78",
          "nom": "Eletriptan Co",
          "prix": 400
        },
        {
          "id": "m79",
          "nom": "Enalapril Co 10mg",
          "prix": 15
        },
        {
          "id": "m80",
          "nom": "Ephedrine Amp 50mg",
          "prix": 300
        },
        {
          "id": "m81",
          "nom": "Ephedrine gtte nasal",
          "prix": 250
        },
        {
          "id": "m82",
          "nom": "Ergotrate Amp 0.2mg",
          "prix": 300
        },
        {
          "id": "m83",
          "nom": "Erithromycine Co 500mg",
          "prix": 15
        },
        {
          "id": "m84",
          "nom": "Erithromycine Susp 125mg/5ml",
          "prix": 500
        },
        {
          "id": "m85",
          "nom": "Feet enema adult",
          "prix": 500
        },
        {
          "id": "m86",
          "nom": "Feet enema enfant",
          "prix": 400
        },
        {
          "id": "m87",
          "nom": "Fentanyl Amp 2ml",
          "prix": 500
        },
        {
          "id": "m88",
          "nom": "Fer Dextran Amp 50mg/ml",
          "prix": 300
        },
        {
          "id": "m89",
          "nom": "Fer Folate Co",
          "prix": 15
        },
        {
          "id": "m90",
          "nom": "Ferobeta Co",
          "prix": 15
        },
        {
          "id": "m91",
          "nom": "Ferobeta Sp",
          "prix": 500
        },
        {
          "id": "m92",
          "nom": "Ferrup sirop",
          "prix": 600
        },
        {
          "id": "m93",
          "nom": "Fil suture",
          "prix": 150
        },
        {
          "id": "m94",
          "nom": "Fluconazole Co 150mg",
          "prix": 75
        },
        {
          "id": "m95",
          "nom": "Fluconazole Co 50mg",
          "prix": 25
        },
        {
          "id": "m96",
          "nom": "Fricilicont Gel Analgesic",
          "prix": 250
        },
        {
          "id": "m97",
          "nom": "Furosemide Amp 20mg",
          "prix": 200
        },
        {
          "id": "m98",
          "nom": "Furosemide Co 40mg",
          "prix": 15
        },
        {
          "id": "m99",
          "nom": "Gabapentin Co 300mg",
          "prix": 5
        },
        {
          "id": "m100",
          "nom": "Gallia 1er \xE2ge",
          "prix": 1250
        },
        {
          "id": "m101",
          "nom": "Gallia 1er \xE2ge 900g",
          "prix": 1600
        },
        {
          "id": "m102",
          "nom": "Gallia 2\xE8me \xE2ge",
          "prix": 1250
        },
        {
          "id": "m103",
          "nom": "Gallia 2\xE8me \xE2ge 900",
          "prix": 1600
        },
        {
          "id": "m104",
          "nom": "Gallia 400g 2\xE8me \xE2ge",
          "prix": 750
        },
        {
          "id": "m105",
          "nom": "Galocur lotion",
          "prix": 250
        },
        {
          "id": "m106",
          "nom": "Gel Lubrifiant",
          "prix": 150
        },
        {
          "id": "m107",
          "nom": "Gencloben cr\xE8me",
          "prix": 600
        },
        {
          "id": "m108",
          "nom": "Gentamycine Ampoule 40mg/2ml",
          "prix": 200
        },
        {
          "id": "m109",
          "nom": "Gerber",
          "prix": 50
        },
        {
          "id": "m110",
          "nom": "Globugen",
          "prix": 1500
        },
        {
          "id": "m111",
          "nom": "Gluconate de Calcium",
          "prix": 500
        },
        {
          "id": "m112",
          "nom": "Glyburide Co 5mg",
          "prix": 15
        },
        {
          "id": "m113",
          "nom": "Glyc\xE9mie",
          "prix": 300
        },
        {
          "id": "m274",
          "nom": "Gouttes nasale",
          "prix": 500
        },
        {
          "id": "m115",
          "nom": "HCTZ Co 25mg",
          "prix": 15
        },
        {
          "id": "m116",
          "nom": "Heamaplex Sp",
          "prix": 300
        },
        {
          "id": "m117",
          "nom": "Heparine Na vial",
          "prix": 1e3
        },
        {
          "id": "m118",
          "nom": "Hidrocortisone 1% cr\xE8me",
          "prix": 250
        },
        {
          "id": "m119",
          "nom": "Histinol Sp",
          "prix": 300
        },
        {
          "id": "m120",
          "nom": "Huile Foie de Morrue Sirop",
          "prix": 250
        },
        {
          "id": "m121",
          "nom": "Hydralazine Co 25mg",
          "prix": 15
        },
        {
          "id": "m122",
          "nom": "Hydralazine Vial 20mg",
          "prix": 600
        },
        {
          "id": "m123",
          "nom": "Ibumax Sp",
          "prix": 300
        },
        {
          "id": "m124",
          "nom": "Ibuprofen Co 200mg",
          "prix": 15
        },
        {
          "id": "m125",
          "nom": "Ibuprofen Co 400mg",
          "prix": 15
        },
        {
          "id": "m126",
          "nom": "Ibuprofen Co 600mg",
          "prix": 15
        },
        {
          "id": "m127",
          "nom": "Ibuprofen Co 800mg",
          "prix": 15
        },
        {
          "id": "m128",
          "nom": "Imoderm savon",
          "prix": 150
        },
        {
          "id": "m129",
          "nom": "Insuline NPH",
          "prix": 25
        },
        {
          "id": "m130",
          "nom": "Insuline Rapid",
          "prix": 25
        },
        {
          "id": "m131",
          "nom": "Intracath 16",
          "prix": 125
        },
        {
          "id": "m132",
          "nom": "Intracath 18",
          "prix": 125
        },
        {
          "id": "m133",
          "nom": "Intracath 20",
          "prix": 125
        },
        {
          "id": "m134",
          "nom": "Intracath 22",
          "prix": 125
        },
        {
          "id": "m135",
          "nom": "Intracath 24",
          "prix": 125
        },
        {
          "id": "m136",
          "nom": "Ipatropium Co 3mg",
          "prix": 150
        },
        {
          "id": "m137",
          "nom": "KCL",
          "prix": 1250
        },
        {
          "id": "m138",
          "nom": "Ketoconazole Co 400mg",
          "prix": 15
        },
        {
          "id": "m139",
          "nom": "Ketoconazole cr\xE8me",
          "prix": 200
        },
        {
          "id": "m140",
          "nom": "Ketoconazole savon",
          "prix": 250
        },
        {
          "id": "m141",
          "nom": "Ketoconazole shampoo",
          "prix": 300
        },
        {
          "id": "m142",
          "nom": "Ketoconazole spray",
          "prix": 300
        },
        {
          "id": "m143",
          "nom": "Ketoconazole susp",
          "prix": 250
        },
        {
          "id": "m144",
          "nom": "Labetalol 100mg/20ml",
          "prix": 250
        },
        {
          "id": "m145",
          "nom": "Lidocaine 2%",
          "prix": 350
        },
        {
          "id": "m146",
          "nom": "Loperamide Co",
          "prix": 5
        },
        {
          "id": "m147",
          "nom": "Loratadine Co 10mg",
          "prix": 15
        },
        {
          "id": "m148",
          "nom": "Loratadine Sp",
          "prix": 250
        },
        {
          "id": "m149",
          "nom": "Lysivit Sp",
          "prix": 1e3
        },
        {
          "id": "m150",
          "nom": "Malaquin suspension 120ml",
          "prix": 350
        },
        {
          "id": "m151",
          "nom": "Manitol 20%",
          "prix": 650
        },
        {
          "id": "m152",
          "nom": "Mastisol",
          "prix": 400
        },
        {
          "id": "m153",
          "nom": "Mebendazole 100mg",
          "prix": 15
        },
        {
          "id": "m154",
          "nom": "Mentax Cr\xE8me",
          "prix": 250
        },
        {
          "id": "m155",
          "nom": "Metformin Co 1000mg",
          "prix": 15
        },
        {
          "id": "m156",
          "nom": "Metformin Co 500mg",
          "prix": 15
        },
        {
          "id": "m157",
          "nom": "Metformin Co 850mg",
          "prix": 15
        },
        {
          "id": "m158",
          "nom": "Modilac 1",
          "prix": 1750
        },
        {
          "id": "m159",
          "nom": "Modilac 2",
          "prix": 1750
        },
        {
          "id": "m160",
          "nom": "Modilac 3",
          "prix": 1750
        },
        {
          "id": "m161",
          "nom": "Metoclopramide Amp 10mg/2ml",
          "prix": 200
        },
        {
          "id": "m162",
          "nom": "Metoclopramide Co 10mg",
          "prix": 15
        },
        {
          "id": "m163",
          "nom": "Metoclopramide Sp",
          "prix": 450
        },
        {
          "id": "m164",
          "nom": "Metoprolol Co 100mg",
          "prix": 100
        },
        {
          "id": "m165",
          "nom": "Metromona Ovule",
          "prix": 40
        },
        {
          "id": "m166",
          "nom": "Metronidazole Co 500mg",
          "prix": 15
        },
        {
          "id": "m167",
          "nom": "Metronidazole susp 125",
          "prix": 550
        },
        {
          "id": "m168",
          "nom": "Metronidazole perfusion 500mg",
          "prix": 400
        },
        {
          "id": "m169",
          "nom": "Metronidazole susp 250",
          "prix": 500
        },
        {
          "id": "m170",
          "nom": "MGSO4 5g",
          "prix": 350
        },
        {
          "id": "m171",
          "nom": "Miconazol Cr\xE8me",
          "prix": 350
        },
        {
          "id": "m172",
          "nom": "Miconazol Cr\xE8me 2%",
          "prix": 150
        },
        {
          "id": "m173",
          "nom": "Miconazol Cr\xE8me dermique",
          "prix": 300
        },
        {
          "id": "m174",
          "nom": "Misoprostol Co 200mcg",
          "prix": 750
        },
        {
          "id": "m175",
          "nom": "Misoprostol Cr\xE8me dermique",
          "prix": 350
        },
        {
          "id": "m176",
          "nom": "Montelukast Co",
          "prix": 25
        },
        {
          "id": "m177",
          "nom": "Multitone Sp",
          "prix": 300
        },
        {
          "id": "m178",
          "nom": "Multitone-Fort\xE9 Co",
          "prix": 10
        },
        {
          "id": "m179",
          "nom": "Multivitamines Co",
          "prix": 15
        },
        {
          "id": "m180",
          "nom": "N/S goutte",
          "prix": 500
        },
        {
          "id": "m181",
          "nom": "NaCl 0.45% fl 1000cc",
          "prix": 750
        },
        {
          "id": "m182",
          "nom": "NaCl 0.9% fl 1000cc",
          "prix": 750
        },
        {
          "id": "m183",
          "nom": "Nactalia 400g 1er \xE2ge",
          "prix": 750
        },
        {
          "id": "m184",
          "nom": "Nactalia 400g 2\xE8me \xE2ge",
          "prix": 750
        },
        {
          "id": "m185",
          "nom": "Naproxen Co",
          "prix": 15
        },
        {
          "id": "m186",
          "nom": "Nefedipine Co 20mg",
          "prix": 15
        },
        {
          "id": "m187",
          "nom": "Neobac Cr\xE8me",
          "prix": 250
        },
        {
          "id": "m188",
          "nom": "Neomole perfusion",
          "prix": 1e3
        },
        {
          "id": "m189",
          "nom": "Nifedipine Co 10mg",
          "prix": 15
        },
        {
          "id": "m190",
          "nom": "Nivaquine Sirop 25mg",
          "prix": 300
        },
        {
          "id": "m191",
          "nom": "Nursie 400g 2\xE8me \xE2ge",
          "prix": 1e3
        },
        {
          "id": "m192",
          "nom": "Nystatin goutte",
          "prix": 250
        },
        {
          "id": "m193",
          "nom": "Nystatin Ovule",
          "prix": 35
        },
        {
          "id": "m194",
          "nom": "Nystatin susp",
          "prix": 350
        },
        {
          "id": "m195",
          "nom": "Nystazinc cr\xE8me",
          "prix": 250
        },
        {
          "id": "m196",
          "nom": "Omega 3",
          "prix": 15
        },
        {
          "id": "m197",
          "nom": "Omeprazol Co 20mg",
          "prix": 15
        },
        {
          "id": "m198",
          "nom": "Omeprazol Co 40mg",
          "prix": 15
        },
        {
          "id": "m199",
          "nom": "Omeprazol vial 20mg",
          "prix": 400
        },
        {
          "id": "m200",
          "nom": "Othorinol goutte Auriculaire",
          "prix": 600
        },
        {
          "id": "m201",
          "nom": "Oxebral",
          "prix": 50
        },
        {
          "id": "m202",
          "nom": "Oxytocin",
          "prix": 350
        },
        {
          "id": "m203",
          "nom": "Paracetamol Co 325mg",
          "prix": 15
        },
        {
          "id": "m204",
          "nom": "Paracetamol Co 500mg",
          "prix": 15
        },
        {
          "id": "m205",
          "nom": "Paracetamol sirop",
          "prix": 350
        },
        {
          "id": "m206",
          "nom": "Phenobarbital Co 100mg",
          "prix": 15
        },
        {
          "id": "m207",
          "nom": "Ph\xE9nito\xEFne",
          "prix": 1e3
        },
        {
          "id": "m208",
          "nom": "Ph\xE9nobarbital",
          "prix": 2e3
        },
        {
          "id": "m209",
          "nom": "Piptazol",
          "prix": 2e3
        },
        {
          "id": "m210",
          "nom": "PNC Benzathine Vial 2.4 MUI",
          "prix": 300
        },
        {
          "id": "m211",
          "nom": "Poire \xE0 succion",
          "prix": 250
        },
        {
          "id": "m212",
          "nom": "Prenatal Co",
          "prix": 5
        },
        {
          "id": "m213",
          "nom": "Primaquine comprim\xE9 7.5mg",
          "prix": 150
        },
        {
          "id": "m214",
          "nom": "Promethazine Amp 25mg/2ml",
          "prix": 400
        },
        {
          "id": "m215",
          "nom": "Promethazine Co",
          "prix": 10
        },
        {
          "id": "m270",
          "nom": "Piroxicam",
          "prix": 15
        },
        {
          "id": "m216",
          "nom": "Pro-gysol",
          "prix": 250
        },
        {
          "id": "m217",
          "nom": "Provit poudre",
          "prix": 600
        },
        {
          "id": "m271",
          "nom": "Raccord",
          "prix": 50
        },
        {
          "id": "m218",
          "nom": "Raccord transfusion",
          "prix": 500
        },
        {
          "id": "m219",
          "nom": "Ranitidine Amp 50mg",
          "prix": 200
        },
        {
          "id": "m220",
          "nom": "Ranitidine 300mg",
          "prix": 15
        },
        {
          "id": "m221",
          "nom": "Ringer Lactate fl 1000cc",
          "prix": 750
        },
        {
          "id": "m222",
          "nom": "Sac collecteur",
          "prix": 1e3
        },
        {
          "id": "m223",
          "nom": "Salbutamol Co 4mg",
          "prix": 10
        },
        {
          "id": "m224",
          "nom": "Salbutamol Spray",
          "prix": 450
        },
        {
          "id": "m225",
          "nom": "Scalvein 20",
          "prix": 100
        },
        {
          "id": "m226",
          "nom": "Scalvein 21",
          "prix": 100
        },
        {
          "id": "m227",
          "nom": "Scalvein 23",
          "prix": 100
        },
        {
          "id": "m228",
          "nom": "Seringue 2cc/10cc",
          "prix": 25
        },
        {
          "id": "m229",
          "nom": "Seringue 3cc",
          "prix": 25
        },
        {
          "id": "m230",
          "nom": "Seringue 5cc",
          "prix": 25
        },
        {
          "id": "m231",
          "nom": "Seringue 20cc",
          "prix": 50
        },
        {
          "id": "m232",
          "nom": "Seringue 35cc",
          "prix": 75
        },
        {
          "id": "m233",
          "nom": "Seringue 60cc",
          "prix": 100
        },
        {
          "id": "m234",
          "nom": "Seringue insuline",
          "prix": 5
        },
        {
          "id": "m235",
          "nom": "Seringue Sp",
          "prix": 5
        },
        {
          "id": "m236",
          "nom": "Simflat Sp",
          "prix": 750
        },
        {
          "id": "m241",
          "nom": "Similac",
          "prix": 650
        },
        {
          "id": "m242",
          "nom": "Simvastatin Co 25mg",
          "prix": 15
        },
        {
          "id": "m243",
          "nom": "Spiroka Co 25mg",
          "prix": 20
        },
        {
          "id": "m244",
          "nom": "Sporamox Co 100mg",
          "prix": 25
        },
        {
          "id": "m245",
          "nom": "Sporamox Sp 10mg",
          "prix": 350
        },
        {
          "id": "m246",
          "nom": "SRO",
          "prix": 5
        },
        {
          "id": "m247",
          "nom": "Superspass sirop",
          "prix": 300
        },
        {
          "id": "m248",
          "nom": "Supplement herbal Co",
          "prix": 5
        },
        {
          "id": "m249",
          "nom": "Tapis chauffant",
          "prix": 500
        },
        {
          "id": "m250",
          "nom": "Telmisartan comprim\xE9 20mg",
          "prix": 10
        },
        {
          "id": "m251",
          "nom": "Tetracycline ointment 1%",
          "prix": 200
        },
        {
          "id": "m252",
          "nom": "Toussicol Sp",
          "prix": 600
        },
        {
          "id": "m253",
          "nom": "Tramadol Amp 100mg/2ml",
          "prix": 750
        },
        {
          "id": "m254",
          "nom": "Tramadol Denk Effervescent",
          "prix": 500
        },
        {
          "id": "m255",
          "nom": "Tube de levine",
          "prix": 250
        },
        {
          "id": "m256",
          "nom": "Tylenol Sp",
          "prix": 250
        },
        {
          "id": "m257",
          "nom": "Umcka",
          "prix": 200
        },
        {
          "id": "m258",
          "nom": "Valsartan/HCTZ",
          "prix": 10
        },
        {
          "id": "m259",
          "nom": "Vancomycin 1g",
          "prix": 350
        },
        {
          "id": "m260",
          "nom": "Visine gouttes",
          "prix": 500
        },
        {
          "id": "m261",
          "nom": "Vit K",
          "prix": 350
        },
        {
          "id": "m262",
          "nom": "Vitamine A",
          "prix": 20
        },
        {
          "id": "m263",
          "nom": "Vitamine B12 Co 1000mcg",
          "prix": 10
        },
        {
          "id": "m264",
          "nom": "Vitamine C Co 500mg",
          "prix": 20
        },
        {
          "id": "m265",
          "nom": "Vitamine C goutte",
          "prix": 400
        },
        {
          "id": "m266",
          "nom": "Vitamine C Sp",
          "prix": 500
        },
        {
          "id": "m267",
          "nom": "Vitamine D3 Co 1000 UI",
          "prix": 10
        },
        {
          "id": "m268",
          "nom": "Vitamine E",
          "prix": 15
        },
        {
          "id": "m269",
          "nom": "Vitamine K Ampoule 1ml",
          "prix": 350
        }
      ];
      var ACTES_PAR_DEFAUT = [
        {
          "id": "a23",
          "nom": "Consultation Chirurgie",
          "prix": 1e3,
          "sub": "service"
        },
        {
          "id": "a27",
          "nom": "Consultation P\xE9diatre",
          "prix": 500,
          "sub": "service"
        },
        {
          "id": "a28",
          "nom": "Consultation Urgences",
          "prix": 500,
          "sub": "service"
        },
        {
          "id": "a24",
          "nom": "Consultation G\xE9n\xE9rale",
          "prix": 500,
          "sub": "service"
        },
        {
          "id": "a9",
          "nom": "Bilan de suivi (Lettre)",
          "prix": 1e3,
          "sub": "service"
        },
        {
          "id": "a17",
          "nom": "Certificat (Sant\xE9, Maladie, Grossesse)",
          "prix": 500,
          "sub": "service"
        },
        {
          "id": "a43",
          "nom": "Interconsultation",
          "prix": 250,
          "sub": "service"
        },
        {
          "id": "a42",
          "nom": "H\xE9mogramme",
          "prix": 750,
          "sub": "labo"
        },
        {
          "id": "a68",
          "nom": "Taux de plaquettes",
          "prix": 750,
          "sub": "labo"
        },
        {
          "id": "a39",
          "nom": "Groupe Sanguin",
          "prix": 300,
          "sub": "labo"
        },
        {
          "id": "a47",
          "nom": "Malaria",
          "prix": 0,
          "sub": "labo"
        },
        {
          "id": "a72",
          "nom": "Widal",
          "prix": 500,
          "sub": "labo"
        },
        {
          "id": "a70",
          "nom": "Test de Grossesse",
          "prix": 300,
          "sub": "labo"
        },
        {
          "id": "a70b",
          "nom": "BHCG Plasmatiques",
          "prix": 300,
          "sub": "labo"
        },
        {
          "id": "a71",
          "nom": "Sedimentation",
          "prix": 250,
          "sub": "labo"
        },
        {
          "id": "a38",
          "nom": "Glyc\xE9mie",
          "prix": 300,
          "sub": "labo"
        },
        {
          "id": "a20",
          "nom": "Cholest\xE9rol",
          "prix": 400,
          "sub": "labo"
        },
        {
          "id": "a5",
          "nom": "Acide Urique",
          "prix": 400,
          "sub": "labo"
        },
        {
          "id": "a80",
          "nom": "V.C.T",
          "prix": 750,
          "sub": "labo"
        },
        {
          "id": "a81",
          "nom": "VIH",
          "prix": 750,
          "sub": "labo"
        },
        {
          "id": "a82",
          "nom": "RPR",
          "prix": 750,
          "sub": "labo"
        },
        {
          "id": "a83",
          "nom": "TS/TC",
          "prix": 600,
          "sub": "labo"
        },
        {
          "id": "a14",
          "nom": "C.R.P",
          "prix": 1e3,
          "sub": "labo"
        },
        {
          "id": "a1",
          "nom": "A.S.O",
          "prix": 600,
          "sub": "labo"
        },
        {
          "id": "a6",
          "nom": "Urines",
          "prix": 500,
          "sub": "labo"
        },
        {
          "id": "a37",
          "nom": "Frottis vaginal",
          "prix": 750,
          "sub": "labo"
        },
        {
          "id": "a36",
          "nom": "Frottis Ur\xE9tral",
          "prix": 750,
          "sub": "labo"
        },
        {
          "id": "a19",
          "nom": "Test Chlamydia",
          "prix": 1250,
          "sub": "labo"
        },
        {
          "id": "a57",
          "nom": "S\xE9rologie H-Pylori",
          "prix": 750,
          "sub": "labo"
        },
        {
          "id": "a40",
          "nom": "H-Pylori (Selles)",
          "prix": 1250,
          "sub": "labo"
        },
        {
          "id": "a7",
          "nom": "Selles",
          "prix": 500,
          "sub": "labo"
        },
        {
          "id": "a56",
          "nom": "Sang Occulte",
          "prix": 400,
          "sub": "labo"
        },
        {
          "id": "a58",
          "nom": "Sickling test",
          "prix": 400,
          "sub": "labo"
        },
        {
          "id": "a44",
          "nom": "Ionogramme",
          "prix": 1e3,
          "sub": "labo"
        },
        {
          "id": "a11",
          "nom": "Bilan Lipidique",
          "prix": 1750,
          "sub": "labo"
        },
        {
          "id": "a18",
          "nom": "Chimie Sanguin",
          "prix": 1500,
          "sub": "labo"
        },
        {
          "id": "a10",
          "nom": "Bilan h\xE9patique",
          "prix": 1750,
          "sub": "labo"
        },
        {
          "id": "a12",
          "nom": "Bilan R\xE9nal",
          "prix": 1750,
          "sub": "labo"
        },
        {
          "id": "a51",
          "nom": "PSA",
          "prix": 750,
          "sub": "labo"
        },
        {
          "id": "a52",
          "nom": "PSA Quantitatif",
          "prix": 1500,
          "sub": "labo"
        },
        {
          "id": "a8",
          "nom": "Azote de l'Ur\xE9e",
          "prix": 400,
          "sub": "labo"
        },
        {
          "id": "a21",
          "nom": "Col. Bleu de M\xE9thyl\xE8ne",
          "prix": 400,
          "sub": "labo"
        },
        {
          "id": "a29",
          "nom": "Cr\xE9atinine S\xE9rum",
          "prix": 400,
          "sub": "labo"
        },
        {
          "id": "a30",
          "nom": "Cr\xE9atinine Urine",
          "prix": 400,
          "sub": "labo"
        },
        {
          "id": "a35",
          "nom": "\xC9lectrolytes",
          "prix": 1e3,
          "sub": "labo"
        },
        {
          "id": "a41",
          "nom": "HDL",
          "prix": 400,
          "sub": "labo"
        },
        {
          "id": "a45",
          "nom": "LDH",
          "prix": 400,
          "sub": "labo"
        },
        {
          "id": "a46",
          "nom": "Lipides totaux",
          "prix": 400,
          "sub": "labo"
        },
        {
          "id": "a53",
          "nom": "Recherche des filaires",
          "prix": 400,
          "sub": "labo"
        },
        {
          "id": "a54",
          "nom": "S.G.O.T",
          "prix": 400,
          "sub": "labo"
        },
        {
          "id": "a55",
          "nom": "S.G.P.T",
          "prix": 400,
          "sub": "labo"
        },
        {
          "id": "a69",
          "nom": "Temps de Saignement (TS)",
          "prix": 300,
          "sub": "labo"
        },
        {
          "id": "a71b",
          "nom": "Vitesse de s\xE9dimentation (VS)",
          "prix": 250,
          "sub": "labo"
        },
        {
          "id": "a48",
          "nom": "Oxyg\xE8ne",
          "prix": 9e3,
          "sub": "oxygene"
        },
        {
          "id": "a22",
          "nom": "Concentrateur O2",
          "prix": 2e3,
          "sub": "oxygene"
        },
        {
          "id": "a49",
          "nom": "Pansement + Br\xFBlure + D\xE9bridement",
          "prix": 1500,
          "sub": "pansement"
        },
        {
          "id": "a67",
          "nom": "Suture complexe",
          "prix": 1e3,
          "sub": "suture"
        },
        {
          "id": "a2",
          "nom": "Ablation / \xC9pisiotomie",
          "prix": 500,
          "sub": "suture"
        },
        {
          "id": "a75",
          "nom": "Visite de contr\xF4le du chirurgien",
          "prix": 5e3,
          "sub": "visite"
        },
        {
          "id": "a76",
          "nom": "C\xE9sarienne Simple",
          "prix": 35e3,
          "sub": "cesarienne"
        },
        {
          "id": "a77",
          "nom": "C\xE9sarienne UC1",
          "prix": 4e4,
          "sub": "cesarienne"
        },
        {
          "id": "a78",
          "nom": "C\xE9sarienne UC2 + ligature des trompes",
          "prix": 45e3,
          "sub": "cesarienne"
        },
        {
          "id": "a3",
          "nom": "Accouchement G\xE9mellaire",
          "prix": 7e3,
          "sub": "accouchement"
        },
        {
          "id": "a4",
          "nom": "Accouchement Physiologique",
          "prix": 4e3,
          "sub": "accouchement"
        },
        {
          "id": "a33",
          "nom": "D\xE9livrance Placentaire Artificielle",
          "prix": 2e3,
          "sub": "chirurgie"
        },
        {
          "id": "a13",
          "nom": "Biopsie col / endom\xE8tre",
          "prix": 3500,
          "sub": "chirurgie"
        },
        {
          "id": "a15",
          "nom": "Cath\xE9ter + Sac collecteur + proc\xE9d\xE9",
          "prix": 1e3,
          "sub": "chirurgie"
        },
        {
          "id": "a16",
          "nom": "Cath\xE9ter + sac collecteur seul",
          "prix": 750,
          "sub": "chirurgie"
        },
        {
          "id": "a31",
          "nom": "Curettage avec anesth\xE9sie",
          "prix": 12e3,
          "sub": "curetage"
        },
        {
          "id": "a32",
          "nom": "Curettage sans anesth\xE9sie",
          "prix": 8e3,
          "sub": "curetage"
        },
        {
          "id": "a34",
          "nom": "Drainage",
          "prix": 1e3,
          "sub": "drainage"
        },
        {
          "id": "a74",
          "nom": "S\xE9ance de N\xE9bulisation",
          "prix": 600,
          "sub": "nebulisation"
        },
        {
          "id": "a50",
          "nom": "Pap Test",
          "prix": 2e3,
          "sub": "pap"
        },
        {
          "id": "a73",
          "nom": "\xC9lectrocardiogramme (ECG)",
          "prix": 1500,
          "sub": "ecg"
        },
        {
          "id": "a59",
          "nom": "Sonographie Abdo-Pelvienne",
          "prix": 3e3,
          "sub": "sono"
        },
        {
          "id": "a60",
          "nom": "Sonographie Abdominale",
          "prix": 2500,
          "sub": "sono"
        },
        {
          "id": "a61",
          "nom": "Sonographie COU",
          "prix": 2500,
          "sub": "sono"
        },
        {
          "id": "a62",
          "nom": "Sonographie Mammaire",
          "prix": 2500,
          "sub": "sono"
        },
        {
          "id": "a63",
          "nom": "Sonographie Obst\xE9trique",
          "prix": 1250,
          "sub": "sono"
        },
        {
          "id": "a64",
          "nom": "Sonographie Pelvienne",
          "prix": 1250,
          "sub": "sono"
        },
        {
          "id": "a65",
          "nom": "Sonographie Prostate",
          "prix": 2500,
          "sub": "sono"
        },
        {
          "id": "a66",
          "nom": "Sonographie Thyro\xEFdes",
          "prix": 2500,
          "sub": "sono"
        }
      ];
      module.exports = { MEDICAMENTS_PAR_DEFAUT, ACTES_PAR_DEFAUT };
    }
  });

  // utils/helpers.js
  var require_helpers = __commonJS({
    "utils/helpers.js"(exports, module) {
      var { DB_NAME, STORE_NAME } = require_constants();
      function formatGourdes(val) {
        return (Number.isFinite(val) ? val : 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      function formatDH(val) {
        return formatGourdes(val / 5);
      }
      function formaterNomPropre(chaine) {
        return chaine ? chaine.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "";
      }
      function echapperHTML(texte) {
        if (!texte) return "";
        return String(texte).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
      }
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
        return getIndexedDB().then((db) => {
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
          getIndexedDB().then((db) => {
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
          getIndexedDB().then((db) => {
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
    }
  });

  // utils/crypto.js
  var require_crypto = __commonJS({
    "utils/crypto.js"(exports, module) {
      async function deriverCle(motDePasse, salt, usage) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(motDePasse), "PBKDF2", false, ["deriveKey"]);
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt, iterations: 15e4, hash: "SHA-256" },
          keyMaterial,
          { name: "AES-GCM", length: 256 },
          false,
          [usage]
        );
      }
      async function chiffrerTexte(texte, motDePasse) {
        const enc = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const cle = await deriverCle(motDePasse, salt, "encrypt");
        const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cle, enc.encode(texte));
        return {
          chfChiffre: true,
          salt: btoa(String.fromCharCode(...salt)),
          iv: btoa(String.fromCharCode(...iv)),
          data: btoa(String.fromCharCode(...new Uint8Array(cipherBuf)))
        };
      }
      async function dechiffrerTexte(payload, motDePasse) {
        const dec = new TextDecoder();
        const salt = Uint8Array.from(atob(payload.salt), (c) => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(payload.iv), (c) => c.charCodeAt(0));
        const data = Uint8Array.from(atob(payload.data), (c) => c.charCodeAt(0));
        const cle = await deriverCle(motDePasse, salt, "decrypt");
        const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cle, data);
        return dec.decode(plainBuf);
      }
      module.exports = { chiffrerTexte, dechiffrerTexte };
    }
  });

  // utils/icons.js
  var require_icons = __commonJS({
    "utils/icons.js"(exports, module) {
      var React = window.React;
      var Plus = ({ size = 15 }) => /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "5", x2: "12", y2: "19" }), /* @__PURE__ */ React.createElement("line", { x1: "5", y1: "12", x2: "19", y2: "12" }));
      var Trash2 = ({ size = 15 }) => /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("polyline", { points: "3 6 5 6 21 6" }), /* @__PURE__ */ React.createElement("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }));
      var Pencil = ({ size = 15 }) => /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("path", { d: "M12 20h9" }), /* @__PURE__ */ React.createElement("path", { d: "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" }));
      var Check = ({ size = 15 }) => /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("polyline", { points: "20 6 9 17 4 12" }));
      var X = ({ size = 15 }) => /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), /* @__PURE__ */ React.createElement("line", { x1: "6", y1: "6", x2: "18", y2: "18" }));
      var Search = ({ size = 15 }) => /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "8" }), /* @__PURE__ */ React.createElement("path", { d: "M21 21l-4.35-4.35" }));
      var Eye = ({ size = 15 }) => /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3" }));
      var Download = ({ size = 15 }) => /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }), /* @__PURE__ */ React.createElement("polyline", { points: "7 10 12 15 17 10" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "15", x2: "12", y2: "1" }));
      var ArrowUp = ({ size = 16 }) => /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "19", x2: "12", y2: "5" }), /* @__PURE__ */ React.createElement("polyline", { points: "5 12 12 5 19 12" }));
      var ArrowDown = ({ size = 16 }) => /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "5", x2: "12", y2: "19" }), /* @__PURE__ */ React.createElement("polyline", { points: "19 12 12 19 5 12" }));
      var Printer = ({ size = 15 }) => /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("polyline", { points: "6 9 6 2 18 2 18 9" }), /* @__PURE__ */ React.createElement("path", { d: "M18 9H6" }), /* @__PURE__ */ React.createElement("rect", { x: "6", y: "14", width: "12", height: "8" }), /* @__PURE__ */ React.createElement("path", { d: "M18 14h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" }), /* @__PURE__ */ React.createElement("line", { x1: "9", y1: "18", x2: "15", y2: "18" }));
      var Clock = ({ size = 15 }) => /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("polyline", { points: "12 6 12 12 16 14" }));
      var FolderOpen = ({ size = 15 }) => /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" }));
      module.exports = { Plus, Trash2, Pencil, Check, X, Search, Eye, Download, ArrowUp, ArrowDown, Printer, Clock, FolderOpen };
    }
  });

  // components/Toast.js
  var require_Toast = __commonJS({
    "components/Toast.js"(exports, module) {
      var React = window.React;
      var { X } = require_icons();
      function ToastManager({ toasts, removeToast }) {
        return /* @__PURE__ */ React.createElement("div", { className: "fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full pointer-events-none" }, toasts.map((t) => /* @__PURE__ */ React.createElement("div", { key: t.id, className: `pointer-events-auto toast ${t.type === "success" ? "bg-emerald-600" : t.type === "error" ? "bg-red-600" : "bg-blue-600"} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 transform transition-all duration-300` }, /* @__PURE__ */ React.createElement("span", { className: "font-medium text-sm flex-1" }, t.message), /* @__PURE__ */ React.createElement("button", { onClick: () => removeToast(t.id), className: "text-white/70 hover:text-white" }, /* @__PURE__ */ React.createElement(X, { size: 14 })))));
      }
      module.exports = ToastManager;
    }
  });

  // components/ConnectionStatus.js
  var require_ConnectionStatus = __commonJS({
    "components/ConnectionStatus.js"(exports, module) {
      var React = window.React;
      var { useState, useEffect } = React;
      var { chf } = require_supabase();
      function ConnectionStatus() {
        const [online, setOnline] = useState(navigator.onLine);
        const [enAttente, setEnAttente] = useState(0);
        useEffect(() => {
          const goOnline = () => setOnline(true);
          const goOffline = () => setOnline(false);
          window.addEventListener("online", goOnline);
          window.addEventListener("offline", goOffline);
          return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
          };
        }, []);
        useEffect(() => {
          const interval = setInterval(() => setEnAttente(chf.countPending()), 2e3);
          return () => clearInterval(interval);
        }, []);
        return /* @__PURE__ */ React.createElement(
          "div",
          {
            className: "fixed bottom-4 left-4 z-50 flex items-center gap-1.5 bg-white/95 backdrop-blur px-2.5 py-1.5 rounded-full shadow border text-[10px] font-bold",
            title: online ? "Connexion internet active" : "Hors ligne \u2014 les actions seront mises en attente"
          },
          /* @__PURE__ */ React.createElement("span", { className: `w-2.5 h-2.5 rounded-full ${online ? "bg-emerald-500" : "bg-red-500 animate-pulse"}` }),
          /* @__PURE__ */ React.createElement("span", { className: online ? "text-emerald-700" : "text-red-700" }, online ? "En ligne" : "Hors ligne"),
          enAttente > 0 && /* @__PURE__ */ React.createElement("span", { className: "bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[9px]", title: `${enAttente} op\xE9ration(s) en attente de synchronisation` }, "\u23F3 ", enAttente)
        );
      }
      module.exports = ConnectionStatus;
    }
  });

  // components/StockAlertBadge.js
  var require_StockAlertBadge = __commonJS({
    "components/StockAlertBadge.js"(exports, module) {
      var React = window.React;
      var { useState } = React;
      function StockAlertBadge({ items }) {
        const [ouvert, setOuvert] = useState(false);
        if (!items || items.length === 0) return null;
        return /* @__PURE__ */ React.createElement("div", { className: "fixed bottom-16 left-4 z-50" }, ouvert && /* @__PURE__ */ React.createElement("div", { className: "absolute bottom-9 left-0 bg-white border rounded-xl shadow-2xl p-3 w-60 max-h-56 overflow-y-auto text-[11px] space-y-1.5" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center border-b pb-1.5 mb-1.5" }, /* @__PURE__ */ React.createElement("span", { className: "font-bold text-gray-700 uppercase text-[10px]" }, "\u26A0\uFE0F Stock critique"), /* @__PURE__ */ React.createElement("button", { onClick: () => setOuvert(false), className: "text-gray-400 hover:text-gray-700 font-bold" }, "\u2715")), items.map((item) => /* @__PURE__ */ React.createElement("div", { key: item.id, className: "flex justify-between items-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-gray-700" }, item.nom), /* @__PURE__ */ React.createElement("span", { className: "font-bold text-red-600" }, item.quantite || 0)))), /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: () => setOuvert((o) => !o),
            className: "flex items-center gap-1 bg-red-600 text-white px-2.5 py-1.5 rounded-full shadow font-bold text-[10px]",
            title: "Articles en stock critique"
          },
          "\u{1F4E6} \u26A0\uFE0F ",
          items.length
        ));
      }
      module.exports = StockAlertBadge;
    }
  });

  // components/ConfirmModal.js
  var require_ConfirmModal = __commonJS({
    "components/ConfirmModal.js"(exports, module) {
      var React = window.React;
      function ConfirmModal({ titre, message, detail, confirmLabel = "Confirmer", cancelLabel = "Annuler", danger = false, onConfirm, onCancel }) {
        return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4", onClick: onCancel }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("h3", { className: `font-black text-base ${danger ? "text-red-700" : "text-[#1E2A24]"}` }, danger ? "\u26A0\uFE0F " : "", titre), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-gray-700 whitespace-pre-line" }, message), detail && /* @__PURE__ */ React.createElement("div", { className: "bg-gray-50 border rounded-lg p-3 text-sm font-mono font-bold text-center text-[#1E2A24]" }, detail), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-3 pt-1" }, /* @__PURE__ */ React.createElement("button", { onClick: onCancel, className: "bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 text-sm font-bold" }, cancelLabel), /* @__PURE__ */ React.createElement("button", { onClick: onConfirm, className: `text-white rounded-xl py-2.5 text-sm font-bold shadow-md ${danger ? "bg-red-600 hover:bg-red-700" : "bg-emerald-700 hover:bg-emerald-800"}` }, confirmLabel))));
      }
      module.exports = ConfirmModal;
    }
  });

  // components/Login.js
  var require_Login = __commonJS({
    "components/Login.js"(exports, module) {
      var React = window.React;
      var { useState } = React;
      var { auth } = require_firebase();
      function LoginScreen({ onLogin }) {
        const [identifiant, setIdentifiant] = useState("");
        const [motDePasse, setMotDePasse] = useState("");
        const [erreur, setErreur] = useState("");
        const handleSubmit = async (e) => {
          e.preventDefault();
          setErreur("");
          const email = `${identifiant.trim()}@chf.ht`;
          try {
            await auth.signInWithEmailAndPassword(email, motDePasse);
            onLogin();
          } catch (error) {
            console.error("Erreur auth:", error);
            if (error.code === "auth/user-not-found") setErreur("\u274C Identifiant inconnu.");
            else if (error.code === "auth/wrong-password") setErreur("\u274C Mot de passe incorrect.");
            else setErreur("\u274C " + error.message);
          }
        };
        return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen w-full flex items-center justify-center bg-[#1E2A24] p-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-sm bg-[#F7F5F0] p-6 rounded-2xl border shadow-2xl text-center space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] uppercase tracking-widest text-emerald-800 font-bold" }, "Centre Hospitalier de Fontaine"), /* @__PURE__ */ React.createElement("h2", { className: "text-base font-black text-[#1E2A24] mt-1" }, "\u{1F510} Connexion")), /* @__PURE__ */ React.createElement("form", { onSubmit: handleSubmit, className: "space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "space-y-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-xs font-bold text-gray-600 block text-left" }, "Identifiant"), /* @__PURE__ */ React.createElement("input", { type: "text", value: identifiant, onChange: (e) => setIdentifiant(e.target.value), placeholder: "ex: esdras", className: "w-full border rounded-lg p-2 text-sm outline-none font-mono", required: true })), /* @__PURE__ */ React.createElement("div", { className: "space-y-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-xs font-bold text-gray-600 block text-left" }, "Mot de passe"), /* @__PURE__ */ React.createElement("input", { type: "password", value: motDePasse, onChange: (e) => setMotDePasse(e.target.value), placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", className: "w-full border rounded-lg p-2 text-sm outline-none font-mono", required: true })), erreur && /* @__PURE__ */ React.createElement("div", { className: "bg-red-50 text-red-700 p-2 rounded-lg text-xs font-bold" }, erreur), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "w-full bg-[#1E2A24] text-white rounded-xl py-2.5 font-bold text-xs hover:bg-[#2a3a32] transition" }, "Se connecter")), /* @__PURE__ */ React.createElement("div", { className: "text-xs text-gray-500" }, "Contactez l'administrateur pour obtenir un compte.")));
      }
      module.exports = LoginScreen;
    }
  });

  // components/GrilleEdition.js
  var require_GrilleEdition = __commonJS({
    "components/GrilleEdition.js"(exports, module) {
      var React = window.React;
      var { useState } = React;
      var { chf } = require_supabase();
      var { LOG_MEDS_KEY, LOG_ACTES_KEY } = require_firebase();
      var { CATEGORIES_LISTE } = require_constants();
      var { formatGourdes } = require_helpers();
      var { Check, X, Pencil, Trash2 } = require_icons();
      function GrilleEditionPanel({ titre, items, setItems, collectionName, showToast }) {
        const [filtre, setFiltre] = useState("");
        const [idEdit, setIdEdit] = useState(null);
        const [prixEdit, setPrixEdit] = useState("");
        const [nomEdit, setNomEdit] = useState("");
        const [sousCategorieEdit, setSousCategorieEdit] = useState("");
        const [nouveauNom, setNouveauNom] = useState("");
        const [nouveauPrix, setNouveauPrix] = useState("");
        const [nouvelleSousCategorie, setNouvelleSousCategorie] = useState("chirurgie");
        const [quantiteStock, setQuantiteStock] = useState("");
        const [seuilAlerte, setSeuilAlerte] = useState("");
        const categoriesActes = CATEGORIES_LISTE.filter((c) => c.key !== "hospit");
        const sauvegarderCatalogue = async (nouvelleListe) => {
          setItems(nouvelleListe);
          const key = collectionName === "medicaments" ? LOG_MEDS_KEY : LOG_ACTES_KEY;
          localStorage.setItem(key, JSON.stringify(nouvelleListe));
          try {
            await chf.updateCatalog(collectionName, nouvelleListe);
          } catch (e) {
            console.warn("Erreur mise \xE0 jour catalogue:", e);
          }
        };
        const correspondances = items.filter((i) => i.nom.toLowerCase().includes(filtre.toLowerCase()));
        const ajouterElement = () => {
          if (!nouveauNom.trim() || !nouveauPrix) {
            showToast("Veuillez remplir le nom et le prix.", "error");
            return;
          }
          const prix = parseFloat(nouveauPrix);
          if (isNaN(prix) || prix < 0) {
            showToast("Prix invalide.", "error");
            return;
          }
          const newItem = {
            id: Date.now() + Math.random(),
            nom: nouveauNom.trim(),
            prix,
            quantite: parseFloat(quantiteStock) || 0,
            seuilAlerte: parseFloat(seuilAlerte) || 5,
            categorie: collectionName === "medicaments" ? "pharmacie" : "",
            sub: collectionName === "medicaments" ? void 0 : nouvelleSousCategorie
          };
          sauvegarderCatalogue([...items, newItem]);
          setNouveauNom("");
          setNouveauPrix("");
          setQuantiteStock("");
          setSeuilAlerte("");
          showToast("Ajout\xE9 avec succ\xE8s", "success");
        };
        const supprimerElement = (id) => {
          if (confirm("Supprimer d\xE9finitivement ?")) {
            sauvegarderCatalogue(items.filter((i) => i.id !== id));
            showToast("Supprim\xE9", "success");
          }
        };
        return /* @__PURE__ */ React.createElement("div", { className: "space-y-3 text-xs" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3 rounded-xl border shadow-sm space-y-2" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-gray-800" }, "\u2795 Ajouter un ", titre), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2" }, /* @__PURE__ */ React.createElement("input", { type: "text", value: nouveauNom, onChange: (e) => setNouveauNom(e.target.value), placeholder: "Nom...", className: "border rounded-lg p-1.5 flex-1 min-w-[120px] outline-none" }), /* @__PURE__ */ React.createElement("input", { type: "number", step: "0.01", value: nouveauPrix, onChange: (e) => setNouveauPrix(e.target.value), placeholder: "Prix (Gourdes)", className: "border rounded-lg p-1.5 w-24 font-mono outline-none" }), collectionName === "medicaments" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("input", { type: "number", step: "1", value: quantiteStock, onChange: (e) => setQuantiteStock(e.target.value), placeholder: "Stock", className: "border rounded-lg p-1.5 w-16 font-mono outline-none" }), /* @__PURE__ */ React.createElement("input", { type: "number", step: "1", value: seuilAlerte, onChange: (e) => setSeuilAlerte(e.target.value), placeholder: "Seuil", className: "border rounded-lg p-1.5 w-16 font-mono outline-none" })), collectionName !== "medicaments" && /* @__PURE__ */ React.createElement("select", { value: nouvelleSousCategorie, onChange: (e) => setNouvelleSousCategorie(e.target.value), className: "border rounded-lg p-1.5 bg-white outline-none" }, categoriesActes.map((c) => /* @__PURE__ */ React.createElement("option", { key: c.key, value: c.key }, c.label))), /* @__PURE__ */ React.createElement("button", { onClick: ajouterElement, className: "bg-emerald-700 text-white px-3 py-1.5 rounded font-bold" }, "Ajouter"))), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, /* @__PURE__ */ React.createElement("input", { type: "text", value: filtre, onChange: (e) => setFiltre(e.target.value), placeholder: "Filtrer...", className: "w-full border rounded-lg p-2" }), /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl border overflow-hidden max-h-96 overflow-y-auto divide-y" }, correspondances.map((i) => {
          var _a;
          return /* @__PURE__ */ React.createElement("div", { key: i.id, className: "p-3 flex justify-between items-center hover:bg-gray-50" }, idEdit === i.id ? /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 w-full justify-between items-center flex-wrap" }, /* @__PURE__ */ React.createElement("input", { type: "text", value: nomEdit, onChange: (e) => setNomEdit(e.target.value), className: "border rounded p-1 flex-1" }), collectionName !== "medicaments" && /* @__PURE__ */ React.createElement("select", { value: sousCategorieEdit, onChange: (e) => setSousCategorieEdit(e.target.value), className: "border rounded p-1 bg-white text-xs" }, categoriesActes.map((c) => /* @__PURE__ */ React.createElement("option", { key: c.key, value: c.key }, c.label))), /* @__PURE__ */ React.createElement("input", { type: "number", value: prixEdit, onChange: (e) => setPrixEdit(e.target.value), className: "w-20 border rounded p-1 text-right font-mono" }), /* @__PURE__ */ React.createElement("button", { onClick: () => {
            const p = parseFloat(prixEdit);
            if (!isNaN(p) && nomEdit.trim()) {
              const updated = items.map((x) => x.id === i.id ? { ...x, nom: nomEdit.trim(), prix: p, ...collectionName !== "medicaments" ? { sub: sousCategorieEdit } : {} } : x);
              sauvegarderCatalogue(updated);
              setIdEdit(null);
              showToast("Modifi\xE9", "success");
            }
          }, className: "bg-green-700 text-white p-1 rounded" }, /* @__PURE__ */ React.createElement(Check, { size: 12 })), /* @__PURE__ */ React.createElement("button", { onClick: () => setIdEdit(null), className: "border p-1 rounded" }, /* @__PURE__ */ React.createElement(X, { size: 12 }))) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "font-medium text-gray-700" }, i.nom), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 items-center flex-wrap" }, collectionName === "medicaments" && /* @__PURE__ */ React.createElement("span", { className: "text-gray-500" }, "\u{1F4E6} ", i.quantite || 0), collectionName !== "medicaments" && /* @__PURE__ */ React.createElement("span", { className: "text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700" }, ((_a = categoriesActes.find((c) => c.key === i.sub)) == null ? void 0 : _a.label) || "\u26A0\uFE0F Non class\xE9 (\u2192 Chirurgie)"), /* @__PURE__ */ React.createElement("span", { className: "font-mono bg-gray-100 px-2 py-0.5 rounded font-bold" }, formatGourdes(i.prix), " Gdes"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
            setIdEdit(i.id);
            setNomEdit(i.nom);
            setPrixEdit(String(i.prix));
            setSousCategorieEdit(i.sub || "chirurgie");
          }, className: "text-gray-400 hover:text-gray-700 p-1" }, /* @__PURE__ */ React.createElement(Pencil, { size: 12 })), /* @__PURE__ */ React.createElement("button", { onClick: () => supprimerElement(i.id), className: "text-gray-300 hover:text-red-600 p-1" }, /* @__PURE__ */ React.createElement(Trash2, { size: 12 })))));
        }))));
      }
      module.exports = GrilleEditionPanel;
    }
  });

  // components/GestionStock.js
  var require_GestionStock = __commonJS({
    "components/GestionStock.js"(exports, module) {
      var React = window.React;
      var { useState } = React;
      var { chf } = require_supabase();
      var { LOG_MEDS_KEY } = require_firebase();
      var { formatGourdes } = require_helpers();
      var { Check, X, Pencil } = require_icons();
      function GestionStockPanel({ items, setItems, showToast }) {
        const [filtre, setFiltre] = useState("");
        const [editingId, setEditingId] = useState(null);
        const [editQuantite, setEditQuantite] = useState("");
        const [editSeuil, setEditSeuil] = useState("");
        const [ajoutQuantite, setAjoutQuantite] = useState({});
        const sauvegarderStock = async (nouvelleListe) => {
          setItems(nouvelleListe);
          localStorage.setItem(LOG_MEDS_KEY, JSON.stringify(nouvelleListe));
          try {
            await chf.updateCatalog("medicaments", nouvelleListe);
          } catch (e) {
            console.warn("Erreur mise \xE0 jour stock:", e);
          }
        };
        const ajouterStock = (id, quantiteAjoutee) => {
          const qte = parseFloat(quantiteAjoutee) || 0;
          if (qte <= 0) {
            showToast("Quantit\xE9 invalide", "error");
            return;
          }
          const updated = items.map((item) => item.id === id ? { ...item, quantite: (item.quantite || 0) + qte } : item);
          sauvegarderStock(updated);
          setAjoutQuantite({ ...ajoutQuantite, [id]: "" });
          showToast(`Stock ajout\xE9 : +${qte}`, "success");
        };
        const itemsFiltres = items.filter((i) => i.nom.toLowerCase().includes(filtre.toLowerCase()));
        return /* @__PURE__ */ React.createElement("div", { className: "space-y-4 text-xs" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm" }, /* @__PURE__ */ React.createElement("h2", { className: "font-bold text-gray-800 mb-3" }, "\u{1F4E6} Gestion des stocks"), /* @__PURE__ */ React.createElement("input", { type: "text", value: filtre, onChange: (e) => setFiltre(e.target.value), placeholder: "Filtrer...", className: "w-full border rounded-lg p-2 mb-4" }), /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-gray-100 text-[10px] text-gray-500 uppercase border-b font-mono" }, /* @__PURE__ */ React.createElement("th", { className: "p-2" }, "M\xE9dicament"), /* @__PURE__ */ React.createElement("th", { className: "p-2 text-center" }, "Prix"), /* @__PURE__ */ React.createElement("th", { className: "p-2 text-center" }, "Stock"), /* @__PURE__ */ React.createElement("th", { className: "p-2 text-center" }, "Seuil"), /* @__PURE__ */ React.createElement("th", { className: "p-2 text-center" }, "Actions"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-gray-100" }, itemsFiltres.map((item) => {
          const enAlerte = (item.quantite || 0) <= (item.seuilAlerte || 5);
          return /* @__PURE__ */ React.createElement("tr", { key: item.id, className: enAlerte ? "bg-red-50/40" : "hover:bg-gray-50/50" }, /* @__PURE__ */ React.createElement("td", { className: "p-2 font-medium" }, item.nom), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-center font-mono" }, formatGourdes(item.prix), " Gdes"), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-center font-bold" }, editingId === item.id ? /* @__PURE__ */ React.createElement("input", { type: "number", value: editQuantite, onChange: (e) => setEditQuantite(e.target.value), className: "w-16 border rounded p-1 text-center font-mono" }) : /* @__PURE__ */ React.createElement("span", { className: enAlerte ? "text-red-600" : "" }, item.quantite || 0, " ", enAlerte && "\u26A0\uFE0F")), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-center" }, editingId === item.id ? /* @__PURE__ */ React.createElement("input", { type: "number", value: editSeuil, onChange: (e) => setEditSeuil(e.target.value), className: "w-16 border rounded p-1 text-center font-mono" }) : /* @__PURE__ */ React.createElement("span", null, item.seuilAlerte || 5)), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-center" }, editingId === item.id ? /* @__PURE__ */ React.createElement("div", { className: "flex justify-center gap-1" }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
            const q = parseFloat(editQuantite);
            const s = parseFloat(editSeuil);
            if (!isNaN(q) && !isNaN(s)) {
              const updated = items.map((i) => i.id === item.id ? { ...i, quantite: q, seuilAlerte: s } : i);
              sauvegarderStock(updated);
              setEditingId(null);
              showToast("Mis \xE0 jour", "success");
            }
          }, className: "bg-green-700 text-white p-1 rounded" }, /* @__PURE__ */ React.createElement(Check, { size: 12 })), /* @__PURE__ */ React.createElement("button", { onClick: () => setEditingId(null), className: "border p-1 rounded" }, /* @__PURE__ */ React.createElement(X, { size: 12 }))) : /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-1 justify-center" }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
            setEditingId(item.id);
            setEditQuantite(String(item.quantite || 0));
            setEditSeuil(String(item.seuilAlerte || 5));
          }, className: "text-blue-600 p-1" }, /* @__PURE__ */ React.createElement(Pencil, { size: 12 })), /* @__PURE__ */ React.createElement("div", { className: "flex gap-1" }, /* @__PURE__ */ React.createElement("input", { type: "number", min: "1", value: ajoutQuantite[item.id] || "", onChange: (e) => setAjoutQuantite({ ...ajoutQuantite, [item.id]: e.target.value }), placeholder: "+", className: "w-12 border rounded p-0.5 text-center text-xs" }), /* @__PURE__ */ React.createElement("button", { onClick: () => ajouterStock(item.id, ajoutQuantite[item.id]), className: "bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px]" }, "Ajouter")))));
        }))))), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Total"), /* @__PURE__ */ React.createElement("p", { className: "text-xl font-black" }, items.length)), /* @__PURE__ */ React.createElement("div", { className: "text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "En alerte"), /* @__PURE__ */ React.createElement("p", { className: "text-xl font-black text-red-600" }, items.filter((i) => (i.quantite || 0) <= (i.seuilAlerte || 5)).length)), /* @__PURE__ */ React.createElement("div", { className: "text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Valeur stock"), /* @__PURE__ */ React.createElement("p", { className: "text-xl font-black text-emerald-700" }, formatGourdes(items.reduce((s, i) => s + i.prix * (i.quantite || 0), 0)), " Gdes"))));
      }
      module.exports = GestionStockPanel;
    }
  });

  // components/GestionUtilisateurs.js
  var require_GestionUtilisateurs = __commonJS({
    "components/GestionUtilisateurs.js"(exports, module) {
      var React = window.React;
      var { useState, useEffect } = React;
      var { auth, db, enregistrerAudit } = require_firebase();
      function GestionUtilisateursPanel({ showToast }) {
        const [users, setUsers] = useState([]);
        const [loading, setLoading] = useState(true);
        const [search, setSearch] = useState("");
        const [nouveauEmail, setNouveauEmail] = useState("");
        const [nouveauPassword, setNouveauPassword] = useState("");
        const [nouveauRole, setNouveauRole] = useState("auditeur");
        const [nouveauDisplayName, setNouveauDisplayName] = useState("");
        useEffect(() => {
          if (!db) return;
          const unsubscribe = db.collection("users").onSnapshot((snapshot) => {
            const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            setUsers(data);
            setLoading(false);
          });
          return () => unsubscribe();
        }, []);
        const updateUserRole = async (userId, newRole) => {
          try {
            await db.collection("users").doc(userId).update({ role: newRole });
            enregistrerAudit("changement_role", { utilisateurCible: userId, nouveauRole: newRole });
            showToast("R\xF4le mis \xE0 jour", "success");
          } catch (error) {
            showToast("Erreur mise \xE0 jour", "error");
          }
        };
        const toggleActive = async (userId, current) => {
          try {
            await db.collection("users").doc(userId).update({ active: !current });
            enregistrerAudit(current ? "desactivation_utilisateur" : "reactivation_utilisateur", { utilisateurCible: userId });
            showToast(current ? "Utilisateur d\xE9sactiv\xE9" : "Utilisateur r\xE9activ\xE9", "success");
          } catch (error) {
            showToast("Erreur", "error");
          }
        };
        const creerCompte = async () => {
          if (!nouveauEmail || !nouveauPassword || !nouveauDisplayName) {
            showToast("Remplissez tous les champs.", "error");
            return;
          }
          if (nouveauPassword.length < 8) {
            showToast("Mot de passe minimum 8 caract\xE8res.", "error");
            return;
          }
          try {
            const userCred = await auth.createUserWithEmailAndPassword(nouveauEmail, nouveauPassword);
            const user = userCred.user;
            await db.collection("users").doc(user.uid).set({ uid: user.uid, email: nouveauEmail, displayName: nouveauDisplayName, role: nouveauRole, active: true, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            enregistrerAudit("creation_utilisateur", { utilisateurCible: user.uid, email: nouveauEmail, role: nouveauRole });
            showToast("\u2705 Compte cr\xE9\xE9 avec succ\xE8s !", "success");
            setNouveauEmail("");
            setNouveauPassword("");
            setNouveauDisplayName("");
            setNouveauRole("auditeur");
          } catch (error) {
            showToast("Erreur : " + error.message, "error");
          }
        };
        const filtered = users.filter((u) => (u.displayName || "").toLowerCase().includes(search.toLowerCase()) || (u.email || "").toLowerCase().includes(search.toLowerCase()));
        const roles = [{ value: "administrateur", label: "\u{1F511} Administrateur" }, { value: "direction", label: "\u{1F4CA} Direction" }, { value: "comptable", label: "\u{1F4B0} Comptable" }, { value: "auditeur", label: "\u{1F4CB} Auditeur" }, { value: "lecteur", label: "\u{1F441}\uFE0F Lecteur" }];
        if (loading) return /* @__PURE__ */ React.createElement("div", { className: "p-8 text-center" }, "Chargement...");
        return /* @__PURE__ */ React.createElement("div", { className: "space-y-4 text-xs" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-gray-800 mb-2" }, "\u2795 Cr\xE9er un nouvel utilisateur"), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2" }, /* @__PURE__ */ React.createElement("input", { type: "text", value: nouveauDisplayName, onChange: (e) => setNouveauDisplayName(e.target.value), placeholder: "Nom affich\xE9", className: "border rounded-lg p-2 text-xs flex-1 min-w-[120px]" }), /* @__PURE__ */ React.createElement("input", { type: "email", value: nouveauEmail, onChange: (e) => setNouveauEmail(e.target.value), placeholder: "Email (ex: user@chf.ht)", className: "border rounded-lg p-2 text-xs flex-1 min-w-[150px]" }), /* @__PURE__ */ React.createElement("input", { type: "password", value: nouveauPassword, onChange: (e) => setNouveauPassword(e.target.value), placeholder: "Mot de passe (8+)", className: "border rounded-lg p-2 text-xs w-32" }), /* @__PURE__ */ React.createElement("select", { value: nouveauRole, onChange: (e) => setNouveauRole(e.target.value), className: "border rounded-lg p-2 text-xs bg-white" }, roles.map((r) => /* @__PURE__ */ React.createElement("option", { key: r.value, value: r.value }, r.label))), /* @__PURE__ */ React.createElement("button", { onClick: creerCompte, className: "bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold" }, "Cr\xE9er"))), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center mb-4" }, /* @__PURE__ */ React.createElement("h2", { className: "font-black text-gray-800" }, "\u{1F465} Utilisateurs"), /* @__PURE__ */ React.createElement("span", { className: "text-gray-500" }, users.filter((u) => u.active !== false).length, " actifs")), /* @__PURE__ */ React.createElement("input", { type: "text", value: search, onChange: (e) => setSearch(e.target.value), placeholder: "\u{1F50D} Rechercher...", className: "w-full border rounded-lg p-2 mb-4" }), /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-gray-100 text-[10px] text-gray-500 uppercase border-b font-mono" }, /* @__PURE__ */ React.createElement("th", { className: "p-2" }, "Nom"), /* @__PURE__ */ React.createElement("th", { className: "p-2" }, "Email"), /* @__PURE__ */ React.createElement("th", { className: "p-2" }, "R\xF4le"), /* @__PURE__ */ React.createElement("th", { className: "p-2 text-center" }, "Statut"), /* @__PURE__ */ React.createElement("th", { className: "p-2 text-center" }, "Actions"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-gray-100" }, filtered.map((u) => {
          var _a, _b, _c;
          const isActive = u.active !== false;
          return /* @__PURE__ */ React.createElement("tr", { key: u.id, className: isActive ? "hover:bg-gray-50/50" : "bg-gray-50 text-gray-400" }, /* @__PURE__ */ React.createElement("td", { className: "p-2 font-medium" }, u.displayName || "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "p-2" }, u.email || "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "p-2" }, /* @__PURE__ */ React.createElement("select", { value: u.role || "auditeur", onChange: (e) => updateUserRole(u.id, e.target.value), className: `border rounded-lg p-1 text-xs bg-white outline-none font-bold ${u.id === ((_a = auth.currentUser) == null ? void 0 : _a.uid) ? "opacity-50" : ""}`, disabled: u.id === ((_b = auth.currentUser) == null ? void 0 : _b.uid) }, roles.map((r) => /* @__PURE__ */ React.createElement("option", { key: r.value, value: r.value, className: "text-gray-800" }, r.label)))), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-center" }, isActive ? /* @__PURE__ */ React.createElement("span", { className: "text-emerald-600 font-bold" }, "\u2705 Actif") : /* @__PURE__ */ React.createElement("span", { className: "text-red-500" }, "\u26D4 D\xE9sactiv\xE9")), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-center" }, u.id !== ((_c = auth.currentUser) == null ? void 0 : _c.uid) ? /* @__PURE__ */ React.createElement("button", { onClick: () => toggleActive(u.id, isActive), className: `text-[10px] font-bold ${isActive ? "text-red-500 hover:text-red-700" : "text-emerald-500 hover:text-emerald-700"}` }, isActive ? "D\xE9sactiver" : "R\xE9activer") : /* @__PURE__ */ React.createElement("span", { className: "text-gray-400" }, "(Vous)")));
        })))), filtered.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "py-8 text-center text-gray-400" }, "Aucun utilisateur.")), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-5 gap-3 bg-white p-4 rounded-xl border shadow-sm" }, /* @__PURE__ */ React.createElement("div", { className: "text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Total"), /* @__PURE__ */ React.createElement("p", { className: "text-xl font-black" }, users.length)), /* @__PURE__ */ React.createElement("div", { className: "text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Actifs"), /* @__PURE__ */ React.createElement("p", { className: "text-xl font-black text-emerald-600" }, users.filter((u) => u.active !== false).length)), /* @__PURE__ */ React.createElement("div", { className: "text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Admins"), /* @__PURE__ */ React.createElement("p", { className: "text-xl font-black text-red-600" }, users.filter((u) => u.role === "administrateur").length)), /* @__PURE__ */ React.createElement("div", { className: "text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Direction"), /* @__PURE__ */ React.createElement("p", { className: "text-xl font-black text-purple-600" }, users.filter((u) => u.role === "direction").length)), /* @__PURE__ */ React.createElement("div", { className: "text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "D\xE9sactiv\xE9s"), /* @__PURE__ */ React.createElement("p", { className: "text-xl font-black text-gray-400" }, users.filter((u) => u.active === false).length))));
      }
      module.exports = GestionUtilisateursPanel;
    }
  });

  // components/Demandes.js
  var require_Demandes = __commonJS({
    "components/Demandes.js"(exports, module) {
      var React = window.React;
      var { useState, useEffect } = React;
      var { auth, db } = require_firebase();
      var { formatGourdes } = require_helpers();
      function DemandesPanel({ userRole, showToast }) {
        const [demandes, setDemandes] = useState([]);
        useEffect(() => {
          if (!db) return;
          const unsubscribe = db.collection("demandes_exoneration").where("statut", "==", "en_attente").onSnapshot((snapshot) => {
            const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            setDemandes(data);
          });
          return () => unsubscribe();
        }, []);
        const repondre = async (demandeId, accepte) => {
          var _a;
          try {
            await db.collection("demandes_exoneration").doc(demandeId).update({ statut: accepte ? "accepte" : "refuse", reponsePar: ((_a = auth.currentUser) == null ? void 0 : _a.displayName) || "inconnu", dateReponse: (/* @__PURE__ */ new Date()).toISOString() });
            showToast(accepte ? "\u2705 Exon\xE9ration accept\xE9e" : "\u274C Exon\xE9ration refus\xE9e", "success");
          } catch (error) {
            showToast("Erreur", "error");
          }
        };
        const peutAutoriser = userRole === "direction" || userRole === "administrateur";
        return /* @__PURE__ */ React.createElement("div", { className: "space-y-4 text-xs" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm" }, /* @__PURE__ */ React.createElement("h2", { className: "font-black text-gray-800 mb-3" }, "\u{1F4E8} Demandes d'exon\xE9ration"), demandes.length === 0 && /* @__PURE__ */ React.createElement("p", { className: "text-gray-500" }, "Aucune demande en attente."), demandes.map((d) => /* @__PURE__ */ React.createElement("div", { key: d.id, className: "bg-gray-50 p-3 rounded-lg border flex justify-between items-center mb-2" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "font-bold" }, d.patientNom), /* @__PURE__ */ React.createElement("p", { className: "text-gray-600" }, d.pourcentageDemande, "% (", formatGourdes(d.montantExonere), " Gdes) par ", d.demandeur)), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, peutAutoriser ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { onClick: () => repondre(d.id, true), className: "bg-emerald-600 text-white px-3 py-1 rounded text-xs font-bold" }, "\u2705 Accepter"), /* @__PURE__ */ React.createElement("button", { onClick: () => repondre(d.id, false), className: "bg-red-600 text-white px-3 py-1 rounded text-xs font-bold" }, "\u274C Refuser")) : /* @__PURE__ */ React.createElement("span", { className: "text-gray-400 text-xs" }, "En attente de validation"))))));
      }
      module.exports = DemandesPanel;
    }
  });

  // components/DashboardDirection.js
  var require_DashboardDirection = __commonJS({
    "components/DashboardDirection.js"(exports, module) {
      var React = window.React;
      var { useState, useEffect } = React;
      var { CATEGORIES_LISTE } = require_constants();
      var { formatGourdes } = require_helpers();
      function DashboardDirectionPanel({ verifications, paiements, medicaments }) {
        const [stats, setStats] = useState({ caMois: 0, caJourCash: 0, caJourOng: 0, occupation: 0, topActes: [], topDetail: [], sonographiesAujourdhui: [], recouvrement: 0, patientsJour: 0 });
        const parseDateDossier = (dateHeureFr) => {
          if (!dateHeureFr) return null;
          const [j, m, a] = dateHeureFr.split("/").map(Number);
          if (!j || !m || !a) return null;
          return new Date(a, m - 1, j);
        };
        const estAujourdhui = (date) => {
          if (!date || isNaN(date)) return false;
          const now = /* @__PURE__ */ new Date();
          return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        };
        const calculerStats = (dossiers, transactions) => {
          const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          const mois = (/* @__PURE__ */ new Date()).getMonth();
          const annee = (/* @__PURE__ */ new Date()).getFullYear();
          const caMois = transactions.filter((p) => (p.mode === "cash" || p.mode === "ong") && new Date(p.date).getMonth() === mois && new Date(p.date).getFullYear() === annee).reduce((s, p) => s + (p.montant || 0), 0);
          const caJourCash = transactions.filter((p) => p.mode === "cash" && p.date && p.date.startsWith(today)).reduce((s, p) => s + (p.montant || 0), 0);
          const caJourOng = transactions.filter((p) => p.mode === "ong" && p.date && p.date.startsWith(today)).reduce((s, p) => s + (p.montant || 0), 0);
          const patientsJour = dossiers.filter((v) => estAujourdhui(parseDateDossier(v.dateHeure))).length;
          const hospitalises = dossiers.filter((v) => v.status === "hospitalise" || v.typePatient === "hospitalise").length;
          const occupation = Math.min(100, hospitalises / 50 * 100);
          const actesCount = {};
          const detailParType = {};
          const sonoAujourdhui = {};
          dossiers.forEach((v) => {
            if (v.fiches) {
              v.fiches.forEach((f) => {
                var _a;
                if (f.breakdown) {
                  Object.keys(f.breakdown).forEach((k) => {
                    if (k !== "hospit" && (f.breakdown[k] || 0) > 0) actesCount[k] = (actesCount[k] || 0) + 1;
                  });
                }
                const lignes = ((_a = f.rawState) == null ? void 0 : _a.lignesCalcul) || [];
                lignes.forEach((l) => {
                  if (l.type === "acte" && l.nom) {
                    detailParType[l.nom] = (detailParType[l.nom] || 0) + (l.qte || 1);
                  }
                });
                const dateFiche = f.dateCreation ? new Date(f.dateCreation) : parseDateDossier(v.dateHeure);
                if (estAujourdhui(dateFiche)) {
                  lignes.forEach((l) => {
                    if (l.type === "acte" && l.sub === "sono" && l.nom) {
                      sonoAujourdhui[l.nom] = (sonoAujourdhui[l.nom] || 0) + (l.qte || 1);
                    }
                  });
                }
              });
            }
          });
          const topActes = Object.entries(actesCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, count]) => {
            const cat = CATEGORIES_LISTE.find((c) => c.key === key);
            return { label: cat ? cat.label : key, count };
          });
          const topDetail = Object.entries(detailParType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([nom, qte]) => ({ nom, qte }));
          const sonographiesAujourdhui = Object.entries(sonoAujourdhui).sort((a, b) => b[1] - a[1]).map(([nom, qte]) => ({ nom, qte }));
          const totalFacture = dossiers.reduce((s, v) => s + (v.totalGlobal || 0), 0);
          const totalPaye = dossiers.reduce((s, v) => s + (v.montantPaye || 0), 0);
          const recouvrement = totalFacture > 0 ? totalPaye / totalFacture * 100 : 0;
          setStats({ caMois, caJourCash, caJourOng, occupation, topActes, topDetail, sonographiesAujourdhui, recouvrement, patientsJour });
        };
        useEffect(() => {
          if (verifications.length || paiements.length) calculerStats(verifications, paiements);
        }, [verifications, paiements]);
        return /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("h2", { className: "font-black text-gray-800 text-base" }, "\u{1F4CA} Tableau de bord - Direction"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "CA du mois"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-black text-emerald-700" }, formatGourdes(stats.caMois), " Gdes")), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Cash aujourd'hui"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-black text-blue-600" }, formatGourdes(stats.caJourCash), " Gdes")), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "ONG aujourd'hui"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-black text-purple-600" }, formatGourdes(stats.caJourOng), " Gdes")), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Consultations aujourd'hui"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-black text-purple-600" }, stats.patientsJour)), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Taux d'occupation"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-black text-amber-600" }, Math.round(stats.occupation), "%")), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Taux de recouvrement"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-black text-emerald-600" }, Math.round(stats.recouvrement), "%"))), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-gray-700 text-xs uppercase" }, "\u{1F3C6} Top 5 actes (par cat\xE9gorie)"), /* @__PURE__ */ React.createElement("div", { className: "mt-2 space-y-1" }, stats.topActes.length === 0 && /* @__PURE__ */ React.createElement("p", { className: "text-gray-400 text-xs" }, "Aucune donn\xE9e."), stats.topActes.map((a, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "flex justify-between text-xs border-b py-1" }, /* @__PURE__ */ React.createElement("span", null, i + 1, ". ", a.label), /* @__PURE__ */ React.createElement("span", { className: "font-bold" }, a.count, " prescriptions"))))), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-gray-700 text-xs uppercase" }, "\u{1F50D} D\xE9tail par type pr\xE9cis (consultations, sonographies, c\xE9sariennes...)"), /* @__PURE__ */ React.createElement("div", { className: "mt-2 space-y-1" }, stats.topDetail.length === 0 && /* @__PURE__ */ React.createElement("p", { className: "text-gray-400 text-xs" }, "Aucune donn\xE9e d\xE9taill\xE9e pour l'instant."), stats.topDetail.map((d, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "flex justify-between text-xs border-b py-1" }, /* @__PURE__ */ React.createElement("span", null, i + 1, ". ", d.nom), /* @__PURE__ */ React.createElement("span", { className: "font-bold" }, d.qte, " fois"))))), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-gray-700 text-xs uppercase" }, "\u{1F52C} Sonographies aujourd'hui, par type"), /* @__PURE__ */ React.createElement("div", { className: "mt-2 space-y-1" }, stats.sonographiesAujourdhui.length === 0 && /* @__PURE__ */ React.createElement("p", { className: "text-gray-400 text-xs" }, "Aucune sonographie enregistr\xE9e aujourd'hui."), stats.sonographiesAujourdhui.map((d, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "flex justify-between text-xs border-b py-1" }, /* @__PURE__ */ React.createElement("span", null, d.nom), /* @__PURE__ */ React.createElement("span", { className: "font-bold" }, d.qte))), stats.sonographiesAujourdhui.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-xs pt-1 font-black border-t-2 mt-1" }, /* @__PURE__ */ React.createElement("span", null, "TOTAL"), /* @__PURE__ */ React.createElement("span", null, stats.sonographiesAujourdhui.reduce((s, d) => s + d.qte, 0))))));
      }
      module.exports = DashboardDirectionPanel;
    }
  });

  // components/DashboardCaisse.js
  var require_DashboardCaisse = __commonJS({
    "components/DashboardCaisse.js"(exports, module) {
      var React = window.React;
      var { useState, useMemo } = React;
      var { LISTE_ONG } = require_constants();
      var { formatGourdes, echapperHTML } = require_helpers();
      var { Printer } = require_icons();
      function DashboardCaissePanel({ verifications, paiements, userDisplayName }) {
        const [filtreDateDebut, setFiltreDateDebut] = useState("");
        const [filtreDateFin, setFiltreDateFin] = useState("");
        const [filtreMode, setFiltreMode] = useState("");
        const [filtreOng, setFiltreOng] = useState("");
        const [sousOnglet, setSousOnglet] = useState("general");
        const paiementsFiltres = useMemo(() => {
          return paiements.filter((p) => {
            const dateP = new Date(p.date);
            const debut = filtreDateDebut ? new Date(filtreDateDebut) : null;
            const fin = filtreDateFin ? new Date(filtreDateFin) : null;
            if (debut && dateP < debut) return false;
            if (fin) {
              const finDay = new Date(fin);
              finDay.setHours(23, 59, 59, 999);
              if (dateP > finDay) return false;
            }
            if (filtreMode && p.mode !== filtreMode) return false;
            if (filtreOng && p.ongPartenaire !== filtreOng) return false;
            return true;
          });
        }, [paiements, filtreDateDebut, filtreDateFin, filtreMode, filtreOng]);
        const totalFiltre = paiementsFiltres.reduce((s, p) => s + (p.montant || 0), 0);
        const rapportONG = useMemo(() => {
          const modes = ["cash", "credit", "ong", "exoneration", "depot"];
          const ongs = [...new Set(paiementsFiltres.map((p) => p.ongPartenaire || "Sans ONG"))];
          const matrix = {};
          ongs.forEach((ong) => {
            matrix[ong] = {};
            modes.forEach((m) => matrix[ong][m] = 0);
          });
          paiementsFiltres.forEach((p) => {
            const ong = p.ongPartenaire || "Sans ONG";
            const mode = p.mode || "cash";
            if (matrix[ong] && matrix[ong][mode] !== void 0) matrix[ong][mode] += p.montant || 0;
          });
          return { matrix, ongs, modes };
        }, [paiementsFiltres]);
        const imprimerRapport = () => {
          const contenu = `<html><head><meta charset="UTF-8"><title>Rapport ONG</title><style>body{font-family:sans-serif;padding:20px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ccc;padding:6px;text-align:center;} th{background:#eee;} .footer{margin-top:16px;font-size:11px;color:#555;text-align:right;} </style></head><body><h2>Rapport ONG - ${(/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR")}</h2><table><thead><tr><th>ONG</th>${rapportONG.modes.map((m) => `<th>${echapperHTML(m.toUpperCase())}</th>`).join("")}<th>Total</th></tr></thead><tbody>${rapportONG.ongs.map((ong) => {
            const row = rapportONG.matrix[ong];
            const totalRow = rapportONG.modes.reduce((s, m) => s + (row[m] || 0), 0);
            return `<tr><td><strong>${echapperHTML(ong)}</strong></td>${rapportONG.modes.map((m) => `<td>${formatGourdes(row[m] || 0)}</td>`).join("")}<td><strong>${formatGourdes(totalRow)}</strong></td></tr>`;
          }).join("")}<tr style="border-top:2px solid #000;"><td><strong>TOTAL</strong></td>${rapportONG.modes.map((m) => {
            const totalCol = rapportONG.ongs.reduce((s, ong) => s + (rapportONG.matrix[ong][m] || 0), 0);
            return `<td><strong>${formatGourdes(totalCol)}</strong></td>`;
          }).join("")}<td><strong>${formatGourdes(totalFiltre)}</strong></td></tr></tbody></table><p class="footer">Imprim\xE9 par : ${echapperHTML(userDisplayName || "inconnu")} \u2014 ${(/* @__PURE__ */ new Date()).toLocaleString("fr-FR")}</p></body></html>`;
          const win = window.open("", "_blank", "width=800,height=600");
          if (!win) {
            alert("Autorisez les pop-ups");
            return;
          }
          win.document.write(contenu);
          win.document.close();
          win.focus();
          setTimeout(() => win.print(), 500);
        };
        const imprimerTransactions = () => {
          if (paiementsFiltres.length === 0) {
            alert("Aucune transaction \xE0 imprimer.");
            return;
          }
          const contenu = `<html><head><meta charset="UTF-8"><title>Transactions - CHF</title><style>body{font-family:sans-serif;padding:20px;} h1{font-size:18px;text-align:center;} table{width:100%;border-collapse:collapse;margin-top:14px;} th,td{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px;} th{background:#eee;} .total{font-weight:bold;font-size:15px;text-align:right;margin-top:10px;} .footer{margin-top:16px;font-size:11px;color:#555;text-align:right;}</style></head><body><h1>CHF \u2014 Transactions filtr\xE9es (${(/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR")})</h1><table><thead><tr><th>Patient</th><th>Montant</th><th>Mode</th><th>ONG</th><th>Date</th><th>Encaiss\xE9 par</th></tr></thead><tbody>${paiementsFiltres.map((p) => `<tr><td>${echapperHTML(p.patientNom || "")}</td><td>${formatGourdes(p.montant)} Gdes</td><td>${echapperHTML(p.mode || "")}</td><td>${echapperHTML(p.ongPartenaire || "\u2014")}</td><td>${new Date(p.date).toLocaleDateString("fr-FR")}</td><td>${echapperHTML(p.encaissePar || "\u2014")}</td></tr>`).join("")}</tbody></table><p class="total">Total : ${formatGourdes(totalFiltre)} Gdes (${paiementsFiltres.length} transactions)</p><p class="footer">Imprim\xE9 par : ${echapperHTML(userDisplayName || "inconnu")} \u2014 ${(/* @__PURE__ */ new Date()).toLocaleString("fr-FR")}</p></body></html>`;
          const win2 = window.open("", "_blank", "width=800,height=600");
          if (!win2) {
            alert("Autorisez les pop-ups");
            return;
          }
          win2.document.write(contenu);
          win2.document.close();
          win2.focus();
          setTimeout(() => win2.print(), 500);
        };
        return /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("h2", { className: "font-black text-gray-800 text-base" }, "\u{1F4B5} Tableau de bord - Caisse"), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 border-b pb-2" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setSousOnglet("general"), className: `px-4 py-2 font-bold text-xs rounded-t-lg ${sousOnglet === "general" ? "bg-[#1E2A24] text-white" : "bg-gray-100"}` }, "\u{1F4CA} G\xE9n\xE9ral"), /* @__PURE__ */ React.createElement("button", { onClick: () => setSousOnglet("rapport_ong"), className: `px-4 py-2 font-bold text-xs rounded-t-lg ${sousOnglet === "rapport_ong" ? "bg-[#1E2A24] text-white" : "bg-gray-100"}` }, "\u{1F4CA} Rapport ONG")), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3 rounded-xl border shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-400" }, "Date d\xE9but"), /* @__PURE__ */ React.createElement("input", { type: "date", value: filtreDateDebut, onChange: (e) => setFiltreDateDebut(e.target.value), className: "border rounded p-1.5 w-full" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-400" }, "Date fin"), /* @__PURE__ */ React.createElement("input", { type: "date", value: filtreDateFin, onChange: (e) => setFiltreDateFin(e.target.value), className: "border rounded p-1.5 w-full" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-400" }, "Mode"), /* @__PURE__ */ React.createElement("select", { value: filtreMode, onChange: (e) => setFiltreMode(e.target.value), className: "border rounded p-1.5 w-full bg-white" }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Tous"), /* @__PURE__ */ React.createElement("option", { value: "cash" }, "Cash"), /* @__PURE__ */ React.createElement("option", { value: "credit" }, "Cr\xE9dit"), /* @__PURE__ */ React.createElement("option", { value: "ong" }, "ONG"), /* @__PURE__ */ React.createElement("option", { value: "exoneration" }, "Exon\xE9ration"), /* @__PURE__ */ React.createElement("option", { value: "depot" }, "D\xE9p\xF4t"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-400" }, "ONG"), /* @__PURE__ */ React.createElement("select", { value: filtreOng, onChange: (e) => setFiltreOng(e.target.value), className: "border rounded p-1.5 w-full bg-white" }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Toutes"), LISTE_ONG.map((o) => /* @__PURE__ */ React.createElement("option", { key: o, value: o }, o))))), sousOnglet === "general" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Total filtr\xE9"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-black text-emerald-700" }, formatGourdes(totalFiltre), " Gdes")), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Transactions"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-black text-blue-600" }, paiementsFiltres.length)), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "D\xE9p\xF4ts"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-black text-purple-600" }, paiementsFiltres.filter((p) => p.mode === "depot").length))), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center mb-2" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-gray-700 text-xs uppercase" }, "\u{1F4CB} Transactions filtr\xE9es"), /* @__PURE__ */ React.createElement("button", { onClick: imprimerTransactions, className: "bg-gray-700 text-white px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1" }, /* @__PURE__ */ React.createElement(Printer, { size: 12 }), " Imprimer")), /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto max-h-64 overflow-y-auto" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-xs" }, /* @__PURE__ */ React.createElement("thead", { className: "sticky top-0 bg-gray-100" }, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Patient"), /* @__PURE__ */ React.createElement("th", null, "Montant"), /* @__PURE__ */ React.createElement("th", null, "Mode"), /* @__PURE__ */ React.createElement("th", null, "ONG"), /* @__PURE__ */ React.createElement("th", null, "Date"))), /* @__PURE__ */ React.createElement("tbody", null, paiementsFiltres.slice(0, 50).map((p, i) => /* @__PURE__ */ React.createElement("tr", { key: i, className: "border-b" }, /* @__PURE__ */ React.createElement("td", { className: "p-1" }, p.patientNom), /* @__PURE__ */ React.createElement("td", { className: "p-1" }, formatGourdes(p.montant)), /* @__PURE__ */ React.createElement("td", { className: "p-1" }, p.mode), /* @__PURE__ */ React.createElement("td", { className: "p-1" }, p.ongPartenaire || "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "p-1" }, new Date(p.date).toLocaleDateString("fr-FR"))))))))), sousOnglet === "rapport_ong" && /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-gray-700 text-xs uppercase" }, "\u{1F4CA} Rapport crois\xE9 ONG / Mode"), /* @__PURE__ */ React.createElement("button", { onClick: imprimerRapport, className: "bg-gray-700 text-white px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1" }, /* @__PURE__ */ React.createElement(Printer, { size: 12 }), " Imprimer")), /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-xs border-collapse" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-gray-100" }, /* @__PURE__ */ React.createElement("th", { className: "p-2 border" }, "ONG"), rapportONG.modes.map((m) => /* @__PURE__ */ React.createElement("th", { key: m, className: "p-2 border text-center" }, m.toUpperCase())), /* @__PURE__ */ React.createElement("th", { className: "p-2 border text-center" }, "Total"))), /* @__PURE__ */ React.createElement("tbody", null, rapportONG.ongs.map((ong) => {
          const row = rapportONG.matrix[ong];
          const totalRow = rapportONG.modes.reduce((s, m) => s + (row[m] || 0), 0);
          return /* @__PURE__ */ React.createElement("tr", { key: ong }, /* @__PURE__ */ React.createElement("td", { className: "p-2 border font-bold" }, ong), rapportONG.modes.map((m) => /* @__PURE__ */ React.createElement("td", { key: m, className: "p-2 border text-right" }, formatGourdes(row[m] || 0))), /* @__PURE__ */ React.createElement("td", { className: "p-2 border text-right font-bold" }, formatGourdes(totalRow)));
        }), /* @__PURE__ */ React.createElement("tr", { className: "bg-gray-50 border-t-2 border-black" }, /* @__PURE__ */ React.createElement("td", { className: "p-2 border font-bold" }, "TOTAL"), rapportONG.modes.map((m) => {
          const totalCol = rapportONG.ongs.reduce((s, ong) => s + (rapportONG.matrix[ong][m] || 0), 0);
          return /* @__PURE__ */ React.createElement("td", { key: m, className: "p-2 border text-right font-bold" }, formatGourdes(totalCol));
        }), /* @__PURE__ */ React.createElement("td", { className: "p-2 border text-right font-bold" }, formatGourdes(totalFiltre))))))));
      }
      module.exports = DashboardCaissePanel;
    }
  });

  // components/ArchivesPanel.js
  var require_ArchivesPanel = __commonJS({
    "components/ArchivesPanel.js"(exports, module) {
      var React = window.React;
      var { useState, useEffect, useMemo } = React;
      var { LISTE_ONG, CATEGORIES_LISTE } = require_constants();
      var { formatGourdes, formatDH, echapperHTML } = require_helpers();
      var { Eye, Pencil, Trash2, Printer, Clock, FolderOpen, X, Download, Check } = require_icons();
      var { chf, toEpisodeApi } = require_supabase();
      function HistoriqueVerifPanel({ verifications, setVerifications, onChargerPourModif, onSupprimer, filtreInitialNom, clearFiltreInitialNom, dossierPourExport, setDossierPourExport, userRole, showToast, onChangerTypeOng }) {
        var _a;
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
        useEffect(() => {
          if (filtreInitialNom) {
            setRechercheNomPatient(filtreInitialNom);
            clearFiltreInitialNom();
          }
        }, [filtreInitialNom]);
        useEffect(() => {
          setNombreAffiche(100);
        }, [filtreType, filtreOng, rechercheNomPatient, filtreDateDebut, filtreDateFin, filtreCategorie, filtreStatut]);
        const dossiersFiltres = useMemo(() => {
          return verifications.filter((v) => {
            var _a2;
            const matchType = filtreType === "" || (v.typePatient || "ONG") === filtreType;
            const matchOng = filtreOng === "" || v.ongPartenaire === filtreOng;
            const matchNom = rechercheNomPatient.trim() === "" || v.nomPatient.toLowerCase().includes(rechercheNomPatient.toLowerCase());
            let matchMois = true;
            if (filtreDateDebut || filtreDateFin) {
              const d = new Date(v.dateEntreePourTri);
              if (isNaN(d)) matchMois = false;
              else {
                if (filtreDateDebut && d < new Date(filtreDateDebut)) matchMois = false;
                if (filtreDateFin) {
                  const fin = new Date(filtreDateFin);
                  fin.setHours(23, 59, 59, 999);
                  if (d > fin) matchMois = false;
                }
              }
            }
            let matchCategorie = true;
            if (filtreCategorie) {
              matchCategorie = ((_a2 = v.fiches) == null ? void 0 : _a2.some((f) => f.breakdown && (f.breakdown[filtreCategorie] || 0) > 0)) || false;
            }
            let matchStatut = true;
            if (filtreStatut) {
              const statut = v.status || "archived";
              matchStatut = statut === filtreStatut;
            }
            return matchType && matchOng && matchNom && matchMois && matchCategorie && matchStatut;
          });
        }, [verifications, filtreType, filtreOng, rechercheNomPatient, filtreDateDebut, filtreDateFin, filtreCategorie, filtreStatut]);
        const EXCEL_STYLES = {
          titre: { font: { bold: true, sz: 18 }, alignment: { horizontal: "center", vertical: "center" } },
          sousTitre: { font: { sz: 11 }, alignment: { horizontal: "center", vertical: "center" } },
          gras: { font: { bold: true } },
          teteColonne: {
            font: { bold: true },
            alignment: { horizontal: "center", vertical: "center" },
            border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
          },
          celluleStandard: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } },
          celluleNombre: { alignment: { horizontal: "right" }, numFmt: "#,##0", border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } },
          celluleTotal: { font: { bold: true }, alignment: { horizontal: "right" }, numFmt: '"HTG "#,##0', border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } },
          grandTotalHtg: { font: { bold: true }, alignment: { horizontal: "right" }, numFmt: '"HTG "#,##0', border: { top: { style: "medium" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } },
          celluleFinaleGras: { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "D0D0D0" } }, alignment: { horizontal: "right" }, numFmt: '"HTG "#,##0', border: { top: { style: "medium" }, bottom: { style: "double" }, left: { style: "thin" }, right: { style: "thin" } } }
        };
        const LABELS_EXPORT = {
          service: "Admission",
          hospit: "Lit/ Hosp",
          labo: "Laboratoire",
          med: "Medicaments",
          ecg: "ECG",
          oxygene: "O2",
          cesarienne: "Cesarienne/Laparo",
          curetage: "curtage",
          chirurgie: "Chirugie",
          accouchement: "Accouch",
          sono: "SONO",
          pansement: "Pansement"
        };
        const CLES_AUTRES = ["suture", "drainage", "pap", "visite", "nebulisation"];
        const exporterBlocDossiersExcelPartenaire = async (ongCible) => {
          try {
            let listeDossiersONG = verifications.filter((v) => v.ongPartenaire === ongCible && (filtreType === "" || (v.typePatient || "ONG") === filtreType));
            if (filtreDateDebut || filtreDateFin) {
              listeDossiersONG = listeDossiersONG.filter((v) => {
                const d = new Date(v.dateEntreePourTri);
                if (isNaN(d)) return false;
                if (filtreDateDebut && d < new Date(filtreDateDebut)) return false;
                if (filtreDateFin) {
                  const fin = new Date(filtreDateFin);
                  fin.setHours(23, 59, 59, 999);
                  if (d > fin) return false;
                }
                return true;
              });
            }
            listeDossiersONG = listeDossiersONG.sort((a, b) => new Date(a.dateEntreePourTri) - new Date(b.dateEntreePourTri));
            if (listeDossiersONG.length === 0) {
              showToast(`Aucun dossier trouv\xE9 pour ${ongCible}`, "error");
              return;
            }
            const clesVues = /* @__PURE__ */ new Set(["service", "hospit", "labo", "med"]);
            let autresUtilise = false;
            let grandTotalGeneral = 0;
            listeDossiersONG.forEach((doc) => {
              (doc.fiches || []).forEach((f) => {
                Object.entries(f.breakdown || {}).forEach(([k, val]) => {
                  if (!val) return;
                  if (CLES_AUTRES.includes(k)) autresUtilise = true;
                  else if (LABELS_EXPORT[k]) clesVues.add(k);
                });
                grandTotalGeneral += f.totalGlobal || 0;
              });
            });
            const colonnesExport = Object.keys(LABELS_EXPORT).filter((k) => clesVues.has(k)).map((k) => ({ key: k, label: LABELS_EXPORT[k] }));
            if (autresUtilise) colonnesExport.push({ key: "__autres__", label: "Autres" });
            const ws_data = [];
            ws_data.push([{ v: "CENTRE HOSPITALIER DE FONTAINE", s: EXCEL_STYLES.titre }]);
            ws_data.push([{ v: "#13, Fontaine Duvivier, Cite Soleil", s: EXCEL_STYLES.sousTitre }]);
            ws_data.push([{ v: "tel: (509) 3647-0563 / 2226-8900", s: EXCEL_STYLES.sousTitre }]);
            ws_data.push([{ v: "centrehfontaine@gmail.com", s: EXCEL_STYLES.sousTitre }]);
            ws_data.push([]);
            const now = /* @__PURE__ */ new Date();
            const moisTexte = now.toLocaleString("fr-FR", { month: "long" }).toUpperCase();
            ws_data.push([{ v: "DATE D'ADMISSION :", s: EXCEL_STYLES.gras }, { v: `${moisTexte} ${now.getFullYear()}` }]);
            ws_data.push([{ v: "FACTURE", s: EXCEL_STYLES.gras }, { v: `#${Math.floor(Math.random() * 1e4)}` }, { v: "" }, { v: "" }, { v: ongCible, s: EXCEL_STYLES.gras }]);
            ws_data.push([]);
            const headersLigne = [{ v: "Nom et Prenom", s: EXCEL_STYLES.teteColonne }, { v: "Date", s: EXCEL_STYLES.teteColonne }];
            colonnesExport.forEach((c) => headersLigne.push({ v: c.label, s: EXCEL_STYLES.teteColonne }));
            headersLigne.push({ v: "Total", s: EXCEL_STYLES.teteColonne });
            ws_data.push(headersLigne);
            const totalsParColonne = {};
            colonnesExport.forEach((c) => totalsParColonne[c.key] = 0);
            listeDossiersONG.forEach((doc) => {
              const totalsPatient = {};
              colonnesExport.forEach((c) => totalsPatient[c.key] = 0);
              let totalPatient = 0;
              (doc.fiches || []).forEach((f) => {
                Object.entries(f.breakdown || {}).forEach(([k, val]) => {
                  if (CLES_AUTRES.includes(k)) totalsPatient["__autres__"] = (totalsPatient["__autres__"] || 0) + (val || 0);
                  else if (totalsPatient[k] !== void 0) totalsPatient[k] += val || 0;
                });
                totalPatient += f.totalGlobal || 0;
              });
              const row = [{ v: doc.nomPatient, s: EXCEL_STYLES.celluleStandard }, { v: doc.periodeSejourString || doc.dateHeure || "\u2014", s: EXCEL_STYLES.celluleStandard }];
              colonnesExport.forEach((c) => {
                totalsParColonne[c.key] += totalsPatient[c.key] || 0;
                row.push(!totalsPatient[c.key] ? { v: "", s: EXCEL_STYLES.celluleStandard } : { v: totalsPatient[c.key], t: "n", s: EXCEL_STYLES.celluleNombre });
              });
              row.push({ v: totalPatient, t: "n", s: EXCEL_STYLES.celluleTotal });
              ws_data.push(row);
            });
            const totalRow = [{ v: "GRAND TOTAL", s: EXCEL_STYLES.grandTotalHtg }, { v: "", s: EXCEL_STYLES.grandTotalHtg }];
            colonnesExport.forEach((c) => totalRow.push({ v: totalsParColonne[c.key], t: "n", s: EXCEL_STYLES.grandTotalHtg }));
            totalRow.push({ v: grandTotalGeneral, t: "n", s: EXCEL_STYLES.grandTotalHtg });
            ws_data.push(totalRow);
            const rabaisVal = appliqueRabais10 ? Math.round(grandTotalGeneral * 0.1) : 0;
            const donsVal = parseFloat(montantDonIntrants) || 0;
            if (rabaisVal > 0) {
              const ligneRabais = [{ v: "R\xE9ductions 10%", s: EXCEL_STYLES.gras }, { v: "" }];
              colonnesExport.forEach((c) => ligneRabais.push({ v: "" }));
              ligneRabais.push({ v: rabaisVal, t: "n", s: EXCEL_STYLES.celluleTotal });
              ws_data.push(ligneRabais);
            }
            if (donsVal > 0) {
              const ligneDons = [{ v: "Dons / Intrants", s: EXCEL_STYLES.gras }, { v: "" }];
              colonnesExport.forEach((c) => ligneDons.push({ v: "" }));
              ligneDons.push({ v: donsVal, t: "n", s: EXCEL_STYLES.celluleTotal });
              ws_data.push(ligneDons);
            }
            if (rabaisVal > 0 || donsVal > 0) {
              const ligneNet = [{ v: "MONTANT NET D\xDB", s: EXCEL_STYLES.celluleFinaleGras }, { v: "", s: EXCEL_STYLES.celluleFinaleGras }];
              colonnesExport.forEach((c) => ligneNet.push({ v: "", s: EXCEL_STYLES.celluleFinaleGras }));
              ligneNet.push({ v: grandTotalGeneral - rabaisVal - donsVal, t: "n", s: EXCEL_STYLES.celluleFinaleGras });
              ws_data.push(ligneNet);
            }
            const ws = window.XLSX.utils.aoa_to_sheet(ws_data);
            ws["!merges"] = [
              { s: { r: 0, c: 0 }, e: { r: 0, c: colonnesExport.length + 2 } },
              { s: { r: 1, c: 0 }, e: { r: 1, c: colonnesExport.length + 2 } },
              { s: { r: 2, c: 0 }, e: { r: 2, c: colonnesExport.length + 2 } },
              { s: { r: 3, c: 0 }, e: { r: 3, c: colonnesExport.length + 2 } }
            ];
            ws["!cols"] = [{ wch: 26 }, { wch: 20 }, ...colonnesExport.map(() => ({ wch: 12 })), { wch: 16 }];
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, ws, "Facturation");
            window.XLSX.writeFile(wb, `Rapport_${ongCible.replace(/\s+/g, "_")}_${moisTexte}_${now.getFullYear()}.xlsx`);
            const idsExportes = listeDossiersONG.map((d) => d.id);
            setVerifications((prev) => prev.map((v) => idsExportes.includes(v.id) ? { ...v, verrouilleFacture: true } : v));
            let echecsVerrou = 0;
            await Promise.all(listeDossiersONG.map(async (d) => {
              try {
                await chf.updateEpisode(d.id, toEpisodeApi({ verrouilleFacture: true }));
              } catch (e) {
                if (!e.isOfflineQueue) echecsVerrou++;
              }
            }));
            showToast(`\u2705 Export Excel de ${listeDossiersONG.length} dossiers (${formatGourdes(grandTotalGeneral)} Gdes)${echecsVerrou > 0 ? ` \u2014 \u26A0\uFE0F ${echecsVerrou} dossier(s) non verrouill\xE9(s), r\xE9essaie plus tard` : ""}`, "success");
            setDossierPourExport(null);
            setAppliqueRabais10(false);
            setMontantDonIntrants("");
          } catch (error) {
            console.error("Erreur export Excel:", error);
            showToast("Une erreur s'est produite lors de la g\xE9n\xE9ration du fichier Excel.", "error");
          }
        };
        const imprimerFiche = (fiche) => {
          var _a2;
          const lignesDetaillees = ((_a2 = fiche.rawState) == null ? void 0 : _a2.lignesCalcul) || [];
          const hasLignes = lignesDetaillees.length > 0;
          const lignesHTML = hasLignes ? lignesDetaillees.map((l) => `<tr><td>${echapperHTML(l.nom)}</td><td class="qte">${l.qte}</td><td class="prix">${formatGourdes(l.prix)}</td><td class="sous-total">${formatGourdes(l.qte * l.prix)}</td></tr>`).join("") : "";
          const fallbackHTML = !hasLignes ? Object.entries(fiche.breakdown || {}).filter(([key, val]) => val > 0).map(([key, val]) => {
            const cat = CATEGORIES_LISTE.find((c) => c.key === key);
            const label = cat ? cat.label : key;
            if (key === "hospit" && fiche.exeat) {
              return `<tr><td>H\xE9bergement (${fiche.exeat.nbJours}j)</td><td class="qte">${fiche.exeat.nbJours}</td><td class="prix">${formatGourdes(fiche.exeat.prixParJour)}</td><td class="sous-total">${formatGourdes(val)}</td></tr>`;
            }
            return `<tr><td>${label}</td><td class="qte">1</td><td class="prix">${formatGourdes(val)}</td><td class="sous-total">${formatGourdes(val)}</td></tr>`;
          }).join("") : "";
          const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fiche N\xB0${fiche.numeroFiche}</title><style>@page{size:100mm 297mm;margin:3mm 5mm;}body{font-family:'Courier New',monospace;font-size:12px;color:#000;background:white;margin:0;padding:0;width:90mm;margin:0 auto;}.entete{text-align:center;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:8px;}.entete h1{font-size:20px;margin:4px 0;}.entete p{margin:2px 0;font-size:11px;}.info{display:flex;justify-content:space-between;font-weight:bold;font-size:11px;margin-bottom:6px;}table{width:100%;border-collapse:collapse;margin:6px 0;font-size:11px;}th,td{padding:4px 6px;text-align:left;border-bottom:1px dotted #ccc;}th{border-bottom:2px solid #000;font-size:10px;text-transform:uppercase;}.total{font-weight:bold;font-size:16px;text-align:right;border-top:3px solid #000;padding-top:6px;margin-top:6px;}.footer{margin-top:12px;font-size:9px;text-align:center;border-top:1px dashed #ccc;padding-top:6px;color:#555;}.qte{text-align:center;}.prix,.sous-total{text-align:right;}.info-patient{font-size:10px;margin-bottom:4px;}</style></head><body><div class="entete"><h1>CHF</h1><p>Centre Hospitalier de Fontaine</p><p>#13, Fontaine Duvivier, Cit\xE9 Soleil</p><p>T\xE9l: (509) 3647-0563 / 2226-8900</p><p>${(/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR")} ${(/* @__PURE__ */ new Date()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p></div><div class="info"><span>Patient: ${echapperHTML(focusedVerif.nomPatient)}</span><span>${echapperHTML(focusedVerif.ongPartenaire || "Priv\xE9")}</span></div><div class="info"><span>Fiche N\xB0${fiche.numeroFiche}</span><span>Mode: ${echapperHTML(fiche.modePaiement || "cash").toUpperCase()}</span></div><div class="info info-patient"><span>\u{1F4DE} ${echapperHTML(focusedVerif.telephone || "N/R")}</span><span>\u{1F4C1} ${echapperHTML(focusedVerif.numDossier || "N/R")}</span></div><div class="info info-patient"><span>Type: ${focusedVerif.typePatient === "ONG" ? "ONG" : "Priv\xE9"}</span><span>Enregistr\xE9 par: ${echapperHTML(fiche.creePar || "inconnu")}</span></div>${fiche.exeat ? `<p style="font-size:10px; margin:4px 0;"><strong>S\xE9jour:</strong> ${fiche.exeat.dateEntree.split("-").reverse().slice(0, 2).join("/")} \u2192 ${fiche.exeat.dateSortie.split("-").reverse().slice(0, 2).join("/")}</p>` : ""}<table><thead><tr><th>D\xE9signation</th><th class="qte">Qt\xE9</th><th class="prix">Prix</th><th class="sous-total">Total</th></tr></thead><tbody>${hasLignes ? lignesHTML : fallbackHTML}</tbody></table><div class="total">TOTAL FICHE : ${formatGourdes(fiche.totalGlobal)} Gdes<br/>${formatDH(fiche.totalGlobal)} DH</div>${fiche.solde && fiche.solde > 0 ? `<p style="font-size:12px; color:red;"><strong>Solde restant :</strong> ${formatGourdes(fiche.solde)} Gdes</p>` : ""}<div class="footer">Merci de votre visite !<br/>CHF Syst\xE8me Hospitalier \u2013 ${(/* @__PURE__ */ new Date()).getFullYear()}</div></body></html>`;
          const win = window.open("", "_blank", "width=500,height=700");
          if (!win) {
            showToast("Autorisez les pop-ups.", "error");
            return;
          }
          win.document.write(contenu);
          win.document.close();
          win.focus();
          setTimeout(() => win.print(), 500);
        };
        const imprimerArchive = (dossier) => {
          var _a2;
          const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Dossier ${echapperHTML(dossier.nomPatient)}</title><style>body{font-family:sans-serif;padding:20px;color:#000;} .entete{text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:14px;} .entete h1{font-size:22px;margin:4px 0;} .entete p{margin:2px 0;font-size:12px;} h1.titre{font-size:18px;margin-top:10px;} table{width:100%;border-collapse:collapse;margin-top:10px;} th,td{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px;} .total{font-weight:bold;font-size:16px;margin-top:10px;} .info-patient{font-size:12px;margin:4px 0;} .meta-fiche{font-size:10px;color:#555;margin-top:4px;}</style></head><body><div class="entete"><h1>CHF</h1><p>Centre Hospitalier de Fontaine</p><p>#13, Fontaine Duvivier, Cit\xE9 Soleil</p><p>T\xE9l: (509) 3647-0563 / 2226-8900</p><p>${(/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR")} ${(/* @__PURE__ */ new Date()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p></div><h1 class="titre">Dossier patient</h1><p class="info-patient"><strong>Nom :</strong> ${echapperHTML(dossier.nomPatient)} &nbsp;|&nbsp; <strong>N\xB0 Dossier :</strong> ${echapperHTML(dossier.numDossier || "N/R")}</p><p class="info-patient"><strong>ONG / Type :</strong> ${echapperHTML(dossier.ongPartenaire || "Priv\xE9")} (${echapperHTML(dossier.typePatient || "ONG")})</p><p class="info-patient"><strong>T\xE9l\xE9phone :</strong> ${echapperHTML(dossier.telephone || "N/R")}</p><p class="info-patient"><strong>Date d'ouverture :</strong> ${echapperHTML(dossier.dateHeure)}</p><p><strong>Total :</strong> ${formatGourdes(dossier.totalGlobal)} Gdes (${formatDH(dossier.totalGlobal)} DH)</p><h3>Fiches :</h3>${(_a2 = dossier.fiches) == null ? void 0 : _a2.map((f) => `<div style="border:1px solid #ddd;margin:10px 0;padding:10px;"><p><strong>Fiche N\xB0${f.numeroFiche}</strong> - Total : ${formatGourdes(f.totalGlobal)} Gdes</p><table><thead><tr><th>Cat\xE9gorie</th><th>Montant</th></tr></thead><tbody>${Object.entries(f.breakdown || {}).map(([key, val]) => {
            if (val === 0) return "";
            const cat = CATEGORIES_LISTE.find((c) => c.key === key);
            return `<tr><td>${echapperHTML(cat ? cat.label : key)}</td><td>${formatGourdes(val)}</td></tr>`;
          }).join("")}</tbody></table><p class="meta-fiche">Mode de paiement : ${echapperHTML((f.modePaiement || "cash").toUpperCase())} &nbsp;|&nbsp; Encaiss\xE9 par : ${echapperHTML(f.creePar || "inconnu")} &nbsp;|&nbsp; ${f.dateCreation ? new Date(f.dateCreation).toLocaleString("fr-FR") : ""}</p></div>`).join("")}<p class="total">Total g\xE9n\xE9ral : ${formatGourdes(dossier.totalGlobal)} Gdes (${formatDH(dossier.totalGlobal)} DH)</p></body></html>`;
          const win = window.open("", "_blank", "width=800,height=600");
          if (!win) {
            showToast("Autorisez les pop-ups", "error");
            return;
          }
          win.document.write(contenu);
          win.document.close();
          win.focus();
          setTimeout(() => win.print(), 500);
        };
        const peutSupprimer = userRole === "direction" || userRole === "administrateur";
        const peutModifier = userRole === "direction" || userRole === "administrateur" || userRole === "comptable";
        const peutExporter = userRole === "auditeur" || userRole === "comptable" || userRole === "direction" || userRole === "administrateur";
        const peutRouvrir = userRole === "comptable" || userRole === "direction" || userRole === "administrateur";
        const rouvrirDossierSuspendu = (dossier) => {
          if (!confirm(`Rouvrir le dossier de ${dossier.nomPatient} ?`)) return;
          onChargerPourModif(dossier);
          showToast(`Dossier de ${dossier.nomPatient} rouvert`, "success");
        };
        return /* @__PURE__ */ React.createElement("div", { className: "space-y-4 text-xs" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3 rounded-xl border shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-400 uppercase" }, "Type"), /* @__PURE__ */ React.createElement("select", { value: filtreType, onChange: (e) => setFiltreType(e.target.value), className: "border rounded-lg p-1.5 bg-white outline-none" }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Tous"), /* @__PURE__ */ React.createElement("option", { value: "ONG" }, "\u{1F3E5} ONG"), /* @__PURE__ */ React.createElement("option", { value: "PRIVE" }, "\u{1F4B3} Priv\xE9"))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-400 uppercase" }, "ONG"), /* @__PURE__ */ React.createElement("select", { value: filtreOng, onChange: (e) => setFiltreOng(e.target.value), className: "border rounded-lg p-1.5 bg-white outline-none", disabled: filtreType === "PRIVE" }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Tous"), LISTE_ONG.map((o) => /* @__PURE__ */ React.createElement("option", { key: o, value: o }, o)))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-400 uppercase" }, "Nom"), /* @__PURE__ */ React.createElement("input", { type: "text", value: rechercheNomPatient, onChange: (e) => setRechercheNomPatient(e.target.value), placeholder: "Nom...", className: "border rounded-lg p-1.5 outline-none" })), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-400 uppercase" }, "Date d\xE9but"), /* @__PURE__ */ React.createElement("input", { type: "date", value: filtreDateDebut, onChange: (e) => setFiltreDateDebut(e.target.value), className: "border rounded-lg p-1.5 bg-white outline-none" })), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-400 uppercase" }, "Date fin"), /* @__PURE__ */ React.createElement("input", { type: "date", value: filtreDateFin, onChange: (e) => setFiltreDateFin(e.target.value), className: "border rounded-lg p-1.5 bg-white outline-none" })), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-400 uppercase" }, "Cat\xE9gorie"), /* @__PURE__ */ React.createElement("select", { value: filtreCategorie, onChange: (e) => setFiltreCategorie(e.target.value), className: "border rounded-lg p-1.5 bg-white outline-none" }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Toutes"), CATEGORIES_LISTE.map((c) => /* @__PURE__ */ React.createElement("option", { key: c.key, value: c.key }, c.label)))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-400 uppercase" }, "Statut"), /* @__PURE__ */ React.createElement("select", { value: filtreStatut, onChange: (e) => setFiltreStatut(e.target.value), className: "border rounded-lg p-1.5 bg-white outline-none" }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Tous"), /* @__PURE__ */ React.createElement("option", { value: "actif" }, "Actif"), /* @__PURE__ */ React.createElement("option", { value: "suspendu" }, "Suspendu"), /* @__PURE__ */ React.createElement("option", { value: "archived" }, "Archiv\xE9")))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-end" }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setFiltreType("");
          setFiltreOng("");
          setRechercheNomPatient("");
          setFiltreDateDebut("");
          setFiltreDateFin("");
          setFiltreCategorie("");
          setFiltreStatut("");
        }, className: "bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs font-bold" }, "R\xE9initialiser")), peutExporter && /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border border-purple-300 shadow-sm space-y-3" }, /* @__PURE__ */ React.createElement("h3", { className: "font-black text-purple-950 text-xs uppercase tracking-wider" }, "\u{1F4BC} Cl\xF4ture & Facturation"), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 items-end" }, /* @__PURE__ */ React.createElement("select", { value: dossierPourExport || "", onChange: (e) => setDossierPourExport(e.target.value || null), className: "border rounded-lg p-1.5 text-xs bg-white font-bold outline-none" }, /* @__PURE__ */ React.createElement("option", { value: "" }, "-- Partenaire --"), LISTE_ONG.map((o) => /* @__PURE__ */ React.createElement("option", { key: o, value: o }, o))), dossierPourExport && /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-4 items-center bg-white p-2 rounded-lg border border-dashed shadow-sm" }, /* @__PURE__ */ React.createElement("label", { className: "flex items-center gap-1 font-bold text-purple-900 cursor-pointer" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: appliqueRabais10, onChange: (e) => setAppliqueRabais10(e.target.checked), className: "rounded" }), " Rabais 10%"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1" }, /* @__PURE__ */ React.createElement("span", { className: "font-semibold text-gray-500" }, "Dons:"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", value: montantDonIntrants, onChange: (e) => setMontantDonIntrants(e.target.value), placeholder: "0", className: "border rounded p-1 w-24 font-mono font-bold text-right text-red-700 outline-none" })), /* @__PURE__ */ React.createElement("button", { onClick: () => exporterBlocDossiersExcelPartenaire(dossierPourExport), className: "bg-purple-700 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 shadow" }, /* @__PURE__ */ React.createElement(Download, { size: 13 }), " Excel")))), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm space-y-2" }, /* @__PURE__ */ React.createElement("h2", { className: "text-xs font-black text-gray-700 uppercase border-b pb-1" }, "\u{1F4C1} Dossiers (", dossiersFiltres.length, dossiersFiltres.length > nombreAffiche ? ` \u2014 ${nombreAffiche} affich\xE9s` : "", ")"), /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto max-h-96 overflow-y-auto" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left" }, /* @__PURE__ */ React.createElement("thead", { className: "sticky top-0 bg-white shadow-sm" }, /* @__PURE__ */ React.createElement("tr", { className: "bg-gray-100 text-[10px] text-gray-500 uppercase border-b font-mono" }, /* @__PURE__ */ React.createElement("th", { className: "p-2" }, "Date"), /* @__PURE__ */ React.createElement("th", { className: "p-2" }, "Patient"), /* @__PURE__ */ React.createElement("th", { className: "p-2" }, "Type"), /* @__PURE__ */ React.createElement("th", { className: "p-2" }, "ONG"), /* @__PURE__ */ React.createElement("th", { className: "p-2 text-center" }, "Vol."), /* @__PURE__ */ React.createElement("th", { className: "p-2 text-right" }, "Total"), /* @__PURE__ */ React.createElement("th", { className: "p-2 text-center" }, "Statut"), /* @__PURE__ */ React.createElement("th", { className: "p-2 text-center" }, "Actions"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-gray-100 font-mono text-[11px]" }, dossiersFiltres.slice(0, nombreAffiche).map((v) => {
          const statut = v.status || "archived";
          const isSuspendu = statut === "suspendu";
          const totalFiable = Number.isFinite(v.totalGlobal) && v.totalGlobal > 0 ? v.totalGlobal : (v.fiches || []).reduce((s, f) => s + (Number(f.totalGlobal) || 0), 0);
          return /* @__PURE__ */ React.createElement("tr", { key: v.id, className: isSuspendu ? "bg-amber-50/60 border-l-4 border-amber-400" : v.contientErreurs ? "bg-red-50/40 border-l-4 border-red-500" : "hover:bg-gray-50/50" }, /* @__PURE__ */ React.createElement("td", { className: "p-2 text-gray-500" }, v.dateHeure), /* @__PURE__ */ React.createElement("td", { className: "p-2 font-bold font-sans flex items-center gap-1" }, v.verrouilleFacture && /* @__PURE__ */ React.createElement("span", null, "\u{1F512}"), v.nomPatient), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-center" }, (v.typePatient || "ONG") === "ONG" ? "\u{1F3E5} ONG" : "\u{1F4B3} Priv\xE9"), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-purple-800 font-bold" }, v.ongPartenaire), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-center text-gray-600" }, (v.fiches || []).length), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-right font-bold text-emerald-800", title: v.totalGlobal !== totalFiable ? "Recalcul\xE9 \xE0 partir des fiches \u2014 la valeur stock\xE9e \xE9tait absente ou \xE0 z\xE9ro" : "" }, formatDH(totalFiable), " DH", v.totalGlobal !== totalFiable && /* @__PURE__ */ React.createElement("span", { className: "text-amber-500" }, " \u26A0\uFE0F")), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-center" }, statut === "suspendu" ? /* @__PURE__ */ React.createElement("span", { className: "text-amber-600 font-bold flex items-center gap-1" }, /* @__PURE__ */ React.createElement(Clock, { size: 12 }), " Suspendu") : statut === "actif" ? /* @__PURE__ */ React.createElement("span", { className: "text-blue-600" }, "Actif") : /* @__PURE__ */ React.createElement("span", { className: "text-gray-400" }, "Archiv\xE9")), /* @__PURE__ */ React.createElement("td", { className: "p-2 flex justify-center gap-1 flex-wrap" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setFocusedVerif(v), className: "text-blue-600 p-1 bg-blue-50 rounded", title: "Voir" }, /* @__PURE__ */ React.createElement(Eye, { size: 13 })), peutModifier && /* @__PURE__ */ React.createElement("button", { onClick: () => {
            const statut2 = v.status || "archived";
            if (statut2 === "archived" && !confirm(`Ce dossier est d\xE9j\xE0 archiv\xE9. Le modifier corrigera CE dossier existant (pas une nouvelle visite).

Pour une nouvelle visite de ${v.nomPatient}, utilise plut\xF4t "Rechercher un patient existant" dans l'onglet Calcul Facture.

Continuer quand m\xEAme pour corriger ce dossier ?`)) return;
            onChargerPourModif(v);
          }, className: "text-amber-700 p-1 bg-amber-50 rounded", title: "Modifier / corriger" }, /* @__PURE__ */ React.createElement(Pencil, { size: 13 })), peutSupprimer && /* @__PURE__ */ React.createElement("button", { onClick: () => onSupprimer(v.id), disabled: v.verrouilleFacture, className: "text-gray-300 hover:text-red-600 p-1 disabled:opacity-20" }, /* @__PURE__ */ React.createElement(Trash2, { size: 13 })), /* @__PURE__ */ React.createElement("button", { onClick: () => imprimerArchive(v), className: "text-gray-600 p-1 bg-gray-50 rounded", title: "Imprimer" }, /* @__PURE__ */ React.createElement(Printer, { size: 13 })), isSuspendu && peutRouvrir && /* @__PURE__ */ React.createElement("button", { onClick: () => rouvrirDossierSuspendu(v), className: "text-emerald-600 p-1 bg-emerald-50 rounded", title: "Rouvrir" }, /* @__PURE__ */ React.createElement(FolderOpen, { size: 13 }))));
        })))), dossiersFiltres.length > nombreAffiche && /* @__PURE__ */ React.createElement("div", { className: "flex justify-center pt-2" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setNombreAffiche((n) => n + 100), className: "bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-1.5 rounded-lg text-xs font-bold" }, "Charger plus (", dossiersFiltres.length - nombreAffiche, " restants)"))), focusedVerif && /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border border-blue-200 shadow-md space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center border-b pb-1" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-blue-900 text-xs uppercase" }, "\u{1F50D} ", focusedVerif.nomPatient), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement("button", { onClick: () => imprimerArchive(focusedVerif), className: "bg-gray-700 text-white px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1" }, /* @__PURE__ */ React.createElement(Printer, { size: 12 }), " Imprimer dossier"), /* @__PURE__ */ React.createElement("button", { onClick: () => setFocusedVerif(null) }, /* @__PURE__ */ React.createElement(X, { size: 14 })))), onChangerTypeOng && peutModifier && (!editTypeArchiveOuvert ? /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 text-xs bg-gray-50 border rounded-lg p-2" }, /* @__PURE__ */ React.createElement("span", { className: "font-bold text-purple-700" }, focusedVerif.ongPartenaire || "Priv\xE9", " - ", focusedVerif.typePatient || "ONG"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setNouveauTypeArchive(focusedVerif.typePatient || "ONG");
          setNouvelOngArchive(focusedVerif.ongPartenaire || "");
          setEditTypeArchiveOuvert(true);
        }, className: "text-[10px] font-bold text-blue-600 underline" }, "\u270F\uFE0F Changer Priv\xE9/ONG")) : /* @__PURE__ */ React.createElement("div", { className: "flex gap-1.5 items-center bg-gray-50 border rounded-lg p-2 flex-wrap" }, /* @__PURE__ */ React.createElement("select", { value: nouveauTypeArchive, onChange: (e) => setNouveauTypeArchive(e.target.value), className: "border rounded p-1 text-xs bg-white" }, /* @__PURE__ */ React.createElement("option", { value: "ONG" }, "\u{1F3E5} ONG"), /* @__PURE__ */ React.createElement("option", { value: "PRIVE" }, "\u{1F4B3} Priv\xE9")), nouveauTypeArchive === "ONG" && /* @__PURE__ */ React.createElement("select", { value: nouvelOngArchive, onChange: (e) => setNouvelOngArchive(e.target.value), className: "border rounded p-1 text-xs bg-white" }, /* @__PURE__ */ React.createElement("option", { value: "" }, "-- ONG --"), LISTE_ONG.map((o) => /* @__PURE__ */ React.createElement("option", { key: o, value: o }, o))), /* @__PURE__ */ React.createElement("button", { onClick: async () => {
          await onChangerTypeOng(focusedVerif.id, nouveauTypeArchive, nouveauTypeArchive === "ONG" ? nouvelOngArchive : "");
          setFocusedVerif((f) => f ? { ...f, typePatient: nouveauTypeArchive, ongPartenaire: nouveauTypeArchive === "ONG" ? nouvelOngArchive : "" } : f);
          setEditTypeArchiveOuvert(false);
        }, className: "bg-emerald-700 text-white text-[10px] font-bold px-2 py-1 rounded" }, /* @__PURE__ */ React.createElement(Check, { size: 10 })), /* @__PURE__ */ React.createElement("button", { onClick: () => setEditTypeArchiveOuvert(false), className: "border text-[10px] font-bold px-2 py-1 rounded" }, /* @__PURE__ */ React.createElement(X, { size: 10 })))), /* @__PURE__ */ React.createElement("div", { className: "space-y-1.5" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-gray-400 uppercase block" }, "1. Ventilation par fiches"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 gap-1" }, (_a = focusedVerif.fiches) == null ? void 0 : _a.map((f) => /* @__PURE__ */ React.createElement("div", { key: f.id, className: "p-2 bg-gray-50 border rounded-lg font-mono text-[11px] flex justify-between items-center" }, /* @__PURE__ */ React.createElement("span", null, "Fiche N\xB0", f.numeroFiche), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "font-bold text-gray-800" }, formatGourdes(f.totalGlobal), " Gdes (", formatDH(f.totalGlobal), " DH)"), /* @__PURE__ */ React.createElement("button", { onClick: () => imprimerFiche(f), className: "text-gray-500 hover:text-blue-600 p-1" }, /* @__PURE__ */ React.createElement(Printer, { size: 14 }))))))), /* @__PURE__ */ React.createElement("div", { className: "space-y-1.5 border-t pt-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-gray-400 uppercase block" }, "2. Cumul analytique complet"), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3 rounded-lg border shadow-inner font-mono text-[11px] space-y-1" }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-3 font-bold text-gray-800 border-b pb-1.5 mb-1.5" }, /* @__PURE__ */ React.createElement("span", null, "CAT\xC9GORIE"), /* @__PURE__ */ React.createElement("span", null, "TOTAL Gdes"), /* @__PURE__ */ React.createElement("span", { className: "text-right text-emerald-800" }, "\u{1F4B5} DH")), (() => {
          var _a2;
          const cumul = {};
          CATEGORIES_LISTE.forEach((c) => cumul[c.key] = 0);
          (_a2 = focusedVerif.fiches) == null ? void 0 : _a2.forEach((f) => {
            Object.keys(f.breakdown).forEach((k) => {
              if (cumul[k] !== void 0) cumul[k] += f.breakdown[k];
            });
          });
          return CATEGORIES_LISTE.map((cat) => {
            const mCat = cumul[cat.key];
            if (mCat === 0) return null;
            return /* @__PURE__ */ React.createElement("div", { key: cat.key, className: "grid grid-cols-3 py-0.5 text-gray-600 border-b border-dashed border-gray-100" }, /* @__PURE__ */ React.createElement("span", null, "\u2022 ", cat.label), /* @__PURE__ */ React.createElement("span", null, formatGourdes(mCat), " Gdes"), /* @__PURE__ */ React.createElement("span", { className: "text-right font-bold text-gray-900" }, formatDH(mCat), " DH"));
          });
        })(), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-3 pt-2 font-black text-sm text-blue-950 border-t-2" }, /* @__PURE__ */ React.createElement("span", null, "TOTAL S\xC9JOUR :"), /* @__PURE__ */ React.createElement("span", null, formatGourdes(focusedVerif.totalGlobal), " Gdes"), /* @__PURE__ */ React.createElement("span", { className: "text-right text-emerald-800" }, formatDH(focusedVerif.totalGlobal), " DH"))))));
      }
      module.exports = HistoriqueVerifPanel;
    }
  });

  // components/Simulateur.js
  var require_Simulateur = __commonJS({
    "components/Simulateur.js"(exports, module) {
      var React = window.React;
      var { useState, useMemo, useRef } = React;
      var { CONFIG_LITS, CATEGORIES_LISTE } = require_constants();
      var { formatGourdes, formatDH } = require_helpers();
      var { Search, Plus, X } = require_icons();
      function Simulateur({ medicaments, actes }) {
        const [lignes, setLignes] = useState([]);
        const [dateEntree1, setDateEntree1] = useState("");
        const [dateSortie1, setDateSortie1] = useState("");
        const [typeLit1, setTypeLit1] = useState("normal");
        const [multiPeriode, setMultiPeriode] = useState(false);
        const [dateEntree2, setDateEntree2] = useState("");
        const [dateSortie2, setDateSortie2] = useState("");
        const [typeLit2, setTypeLit2] = useState("normal");
        const [hasChirSpec, setHasChirSpec] = useState(false);
        const [nomChirSpec, setNomChirSpec] = useState("");
        const [prixChirSpec, setPrixChirSpec] = useState("");
        const [categorie, setCategorie] = useState("med");
        const [recherche, setRecherche] = useState("");
        const [quantite, setQuantite] = useState("1");
        const [selection, setSelection] = useState(null);
        const inputRechercheRef = useRef(null);
        const catalogueFiltre = categorie === "med" ? medicaments : actes;
        const suggestions = useMemo(() => {
          const q = recherche.trim().toLowerCase();
          if (!q) return catalogueFiltre.slice(0, 5);
          return catalogueFiltre.filter((i) => i.nom.toLowerCase().includes(q)).slice(0, 5);
        }, [recherche, catalogueFiltre]);
        const j1 = useMemo(() => {
          if (!dateEntree1 || !dateSortie1) return 0;
          const d = (new Date(dateSortie1) - new Date(dateEntree1)) / 864e5;
          if (d < 0) {
            setDateSortie1("");
            return 0;
          }
          return d === 0 ? 1 : Math.floor(d);
        }, [dateEntree1, dateSortie1]);
        const totalE1 = j1 * CONFIG_LITS[typeLit1].prix;
        const j2 = useMemo(() => {
          if (!multiPeriode || !dateEntree2 || !dateSortie2) return 0;
          const d = (new Date(dateSortie2) - new Date(dateEntree2)) / 864e5;
          return d <= 0 ? 1 : Math.floor(d);
        }, [multiPeriode, dateEntree2, dateSortie2]);
        const totalE2 = multiPeriode ? j2 * CONFIG_LITS[typeLit2].prix : 0;
        const totalGeneralExeat = totalE1 + totalE2;
        const totalChirSpec = useMemo(() => {
          const p = parseFloat(prixChirSpec);
          return isNaN(p) ? 0 : p;
        }, [hasChirSpec, prixChirSpec]);
        const totalsParService = useMemo(() => {
          const v = {};
          CATEGORIES_LISTE.forEach((c) => v[c.key] = 0);
          v.hospit = totalGeneralExeat;
          v.chirurgie = totalChirSpec;
          lignes.forEach((l) => {
            const m = l.qte * l.prix;
            if (l.type === "med") v.med += m;
            else if (l.type === "acte") {
              if (v[l.sub] !== void 0) v[l.sub] += m;
              else v.chirurgie += m;
            }
          });
          return v;
        }, [lignes, totalGeneralExeat, totalChirSpec]);
        const grandTotal = useMemo(() => Object.values(totalsParService).reduce((a, b) => a + b, 0), [totalsParService]);
        const injecterLigne = (item, cat, qte) => {
          setLignes((prev) => {
            const index = prev.findIndex((l) => l.itemId === item.id && l.type === cat);
            if (index !== -1) return prev.map((l, idx) => idx === index ? { ...l, qte: l.qte + qte } : l);
            return [...prev, { id: "l-" + Math.random().toString(36).slice(2, 6), itemId: item.id, type: cat, sub: item.sub || "", nom: item.nom, qte, prix: item.prix }];
          });
        };
        const actionAjouterSoin = () => {
          if (!selection) return;
          const q = parseFloat(quantite);
          if (isNaN(q) || q <= 0) return;
          injecterLigne(selection, categorie, q);
          setRecherche("");
          setSelection(null);
          setQuantite("1");
          if (inputRechercheRef.current) inputRechercheRef.current.focus();
        };
        const vider = () => {
          setLignes([]);
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
          setRecherche("");
          setSelection(null);
          setQuantite("1");
        };
        return /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm" }, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-black text-center border-b pb-2" }, "\u{1F9EE} Simulateur de facturation (hors base)"), /* @__PURE__ */ React.createElement("div", { className: "space-y-3 mt-3" }, /* @__PURE__ */ React.createElement("p", { className: "text-[11px] font-bold uppercase text-gray-400" }, "1. H\xE9bergement & S\xE9jour (Optionnel)"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-500 uppercase" }, "Date entr\xE9e"), /* @__PURE__ */ React.createElement("input", { type: "date", value: dateEntree1, onChange: (e) => setDateEntree1(e.target.value), className: "border rounded-lg p-1.5 text-xs w-full" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-500 uppercase" }, "Date sortie"), /* @__PURE__ */ React.createElement("input", { type: "date", value: dateSortie1, onChange: (e) => setDateSortie1(e.target.value), className: "border rounded-lg p-1.5 text-xs w-full" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-500 uppercase" }, "Type de lit"), /* @__PURE__ */ React.createElement("select", { value: typeLit1, onChange: (e) => setTypeLit1(e.target.value), className: "border rounded-lg p-1.5 bg-white text-xs w-full" }, /* @__PURE__ */ React.createElement("option", { value: "normal" }, "Normal (250 Gdes)"), /* @__PURE__ */ React.createElement("option", { value: "semi_prive" }, "Semi Priv\xE9 (500)"), /* @__PURE__ */ React.createElement("option", { value: "prive" }, "Priv\xE9 (750)"), /* @__PURE__ */ React.createElement("option", { value: "isolette" }, "Isolette (1250)"), /* @__PURE__ */ React.createElement("option", { value: "incubateur" }, "Incubateur (2500)")))), /* @__PURE__ */ React.createElement("div", { className: "flex gap-4 pt-1 border-t border-dashed mt-2" }, /* @__PURE__ */ React.createElement("label", { className: "flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: multiPeriode, onChange: (e) => setMultiPeriode(e.target.checked), className: "rounded" }), " Seconde p\xE9riode"), /* @__PURE__ */ React.createElement("label", { className: "flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: hasChirSpec, onChange: (e) => setHasChirSpec(e.target.checked), className: "rounded" }), " Chirurgie hors-catalogue")), multiPeriode && /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-2 bg-amber-50/20 p-2 rounded-lg border" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[9px] font-bold text-amber-800" }, "Entr\xE9e P2"), /* @__PURE__ */ React.createElement("input", { type: "date", value: dateEntree2, onChange: (e) => setDateEntree2(e.target.value), className: "border rounded-lg p-1 text-xs w-full bg-white" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[9px] font-bold text-amber-800" }, "Sortie P2"), /* @__PURE__ */ React.createElement("input", { type: "date", value: dateSortie2, onChange: (e) => setDateSortie2(e.target.value), className: "border rounded-lg p-1 text-xs w-full bg-white" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[9px] font-bold text-amber-800" }, "Lit P2"), /* @__PURE__ */ React.createElement("select", { value: typeLit2, onChange: (e) => setTypeLit2(e.target.value), className: "border rounded-lg p-1 text-xs w-full bg-white" }, /* @__PURE__ */ React.createElement("option", { value: "normal" }, "Normal"), /* @__PURE__ */ React.createElement("option", { value: "semi_prive" }, "Semi Priv\xE9"), /* @__PURE__ */ React.createElement("option", { value: "prive" }, "Priv\xE9")))), hasChirSpec && /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-2 bg-red-50/20 p-2 rounded-lg border" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[9px] font-bold text-red-800" }, "Libell\xE9"), /* @__PURE__ */ React.createElement("input", { type: "text", value: nomChirSpec, onChange: (e) => setNomChirSpec(e.target.value), placeholder: "Nom...", className: "border rounded-lg p-1 text-xs w-full bg-white outline-none" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[9px] font-bold text-red-800" }, "Montant (Gdes)"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", value: prixChirSpec, onChange: (e) => setPrixChirSpec(e.target.value), placeholder: "0", className: "border rounded-lg p-1 text-xs w-full bg-white outline-none" })))), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border space-y-3 shadow-sm mt-4" }, /* @__PURE__ */ React.createElement("p", { className: "text-[11px] font-bold uppercase text-gray-400" }, "2. Actes, Laboratoire & Ordonnance"), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 text-xs font-semibold" }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setCategorie("med");
          setRecherche("");
          setSelection(null);
        }, className: `flex-1 py-1.5 border rounded-lg ${categorie === "med" ? "bg-[#1E2A24] text-white" : "bg-gray-50"}` }, "\u{1F48A} Pharmacie"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setCategorie("acte");
          setRecherche("");
          setSelection(null);
        }, className: `flex-1 py-1.5 border rounded-lg ${categorie === "acte" ? "bg-[#1E2A24] text-white" : "bg-gray-50"}` }, "\u{1F52C} Examens / Actes")), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement("div", { className: "relative flex-1" }, /* @__PURE__ */ React.createElement("input", { ref: inputRechercheRef, type: "text", value: recherche, onChange: (e) => {
          setRecherche(e.target.value);
          setSelection(null);
        }, onKeyDown: (e) => {
          if (e.key === "Enter" && suggestions.length > 0) {
            setSelection(suggestions[0]);
            setRecherche(suggestions[0].nom);
          }
        }, placeholder: "Rechercher...", className: "w-full border rounded-lg p-2 text-xs pl-8 outline-none" }), /* @__PURE__ */ React.createElement("span", { className: "absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" }, /* @__PURE__ */ React.createElement(Search, { size: 14 })), suggestions.length > 0 && /* @__PURE__ */ React.createElement("ul", { className: "absolute z-20 left-0 right-0 bg-white border rounded-lg shadow-2xl mt-1 text-xs max-h-48 overflow-y-auto divide-y" }, suggestions.map((i) => /* @__PURE__ */ React.createElement("li", { key: i.id }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => {
          setSelection(i);
          setRecherche(i.nom);
        }, className: "w-full text-left px-3 py-2 hover:bg-gray-100 flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, i.nom), /* @__PURE__ */ React.createElement("span", { className: "text-gray-500 font-mono" }, formatGourdes(i.prix), " Gdes")))))), /* @__PURE__ */ React.createElement("input", { type: "number", min: "1", value: quantite, onChange: (e) => setQuantite(e.target.value), onKeyDown: (e) => {
          if (e.key === "Enter") actionAjouterSoin();
        }, className: "w-16 border rounded-lg p-2 text-xs text-center font-mono font-bold bg-gray-50" }), /* @__PURE__ */ React.createElement("button", { onClick: actionAjouterSoin, disabled: !selection, className: "bg-[#1E2A24] text-white px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-30 flex items-center gap-1" }, /* @__PURE__ */ React.createElement(Plus, null), " Ajouter"))), /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl border overflow-hidden shadow-sm mt-4" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-xs text-left" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-gray-100 text-[10px] text-gray-500 uppercase border-b font-mono" }, /* @__PURE__ */ React.createElement("th", { className: "p-3" }, "D\xE9signation"), /* @__PURE__ */ React.createElement("th", { className: "p-3 w-16 text-center" }, "Qt\xE9"), /* @__PURE__ */ React.createElement("th", { className: "p-3 text-right w-24" }, "Prix"), /* @__PURE__ */ React.createElement("th", { className: "p-3 text-right w-24" }, "Total"), /* @__PURE__ */ React.createElement("th", { className: "w-8" }))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-gray-100" }, j1 > 0 && /* @__PURE__ */ React.createElement("tr", { className: "bg-amber-50/20" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 text-amber-900" }, "S\xE9jour : ", CONFIG_LITS[typeLit1].nom), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center font-bold" }, j1, " jrs"), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right text-gray-400" }, formatGourdes(CONFIG_LITS[typeLit1].prix)), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right font-bold" }, formatGourdes(totalE1)), /* @__PURE__ */ React.createElement("td", null)), multiPeriode && j2 > 0 && /* @__PURE__ */ React.createElement("tr", { className: "bg-amber-50/40" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 text-amber-900" }, "S\xE9jour P2 : ", CONFIG_LITS[typeLit2].nom), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center font-bold" }, j2, " jrs"), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right text-gray-400" }, formatGourdes(CONFIG_LITS[typeLit2].prix)), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right font-bold" }, formatGourdes(totalE2)), /* @__PURE__ */ React.createElement("td", null)), hasChirSpec && nomChirSpec && /* @__PURE__ */ React.createElement("tr", { className: "bg-red-50/20" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 text-red-900" }, "Chirurgie : ", nomChirSpec), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center" }, "1"), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right text-gray-400" }, formatGourdes(totalChirSpec)), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right font-bold" }, formatGourdes(totalChirSpec)), /* @__PURE__ */ React.createElement("td", null)), lignes.map((l) => /* @__PURE__ */ React.createElement("tr", { key: l.id, className: "zebra-row" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 text-gray-800" }, /* @__PURE__ */ React.createElement("span", { className: `text-[8px] font-bold uppercase px-1 rounded mr-1 ${l.type === "med" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}` }, l.type === "med" ? "Pharma" : "Acte"), l.nom), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center font-mono font-bold" }, l.qte), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right text-gray-400" }, formatGourdes(l.prix)), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right font-bold" }, formatGourdes(l.qte * l.prix)), /* @__PURE__ */ React.createElement("td", { className: "text-center" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setLignes((p) => p.filter((x) => x.id !== l.id)), className: "text-gray-300 hover:text-red-600" }, /* @__PURE__ */ React.createElement(X, { size: 12 }))))))), /* @__PURE__ */ React.createElement("div", { className: "p-4 bg-gray-50 border-t border-b text-[11px] text-gray-600 font-mono space-y-1 shadow-inner" }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-3 font-bold text-[#1E2A24] border-b pb-1 mb-2" }, /* @__PURE__ */ React.createElement("span", null, "R\xC9CAPITULATIF"), /* @__PURE__ */ React.createElement("span", { className: "text-right" }, "Gdes"), /* @__PURE__ */ React.createElement("span", { className: "text-right text-emerald-800" }, "\u{1F4B5} DH")), CATEGORIES_LISTE.map((srv) => {
          const m = totalsParService[srv.key];
          if (m === 0) return null;
          return /* @__PURE__ */ React.createElement("div", { key: srv.key, className: "grid grid-cols-3 py-0.5" }, /* @__PURE__ */ React.createElement("span", null, "\u2022 ", srv.label), /* @__PURE__ */ React.createElement("span", { className: "text-right" }, formatGourdes(m)), /* @__PURE__ */ React.createElement("span", { className: "text-right font-bold" }, formatDH(m), " DH"));
        })), /* @__PURE__ */ React.createElement("div", { className: "bg-[#1E2A24] text-white p-4 flex justify-between items-center font-bold text-sm font-mono" }, /* @__PURE__ */ React.createElement("span", null, "TOTAL SIMUL\xC9 :"), /* @__PURE__ */ React.createElement("span", null, formatGourdes(grandTotal), " Gdes (", formatDH(grandTotal), " DH)")), /* @__PURE__ */ React.createElement("div", { className: "p-3 flex justify-end" }, /* @__PURE__ */ React.createElement("button", { onClick: vider, className: "bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-xs font-bold" }, "\u{1F9F9} Vider")))));
      }
      module.exports = Simulateur;
    }
  });

  // components/NouveauDossierForm.js
  var require_NouveauDossierForm = __commonJS({
    "components/NouveauDossierForm.js"(exports, module) {
      var React = window.React;
      var { LISTE_ONG } = require_constants();
      var { Search } = require_icons();
      function NouveauDossierForm({
        searchPatientText,
        setSearchPatientText,
        suggestionsPatients,
        choisirPatientExistant,
        peutCreerDossier,
        onSoumettre,
        inputNom,
        setInputNom,
        inputTypePatient,
        setInputTypePatient,
        inputOng,
        setInputOng,
        serviceChoisi,
        setServiceChoisi,
        inputNumDossier,
        setInputNumDossier,
        inputDateNaissance,
        setInputDateNaissance,
        inputTelephone,
        setInputTelephone
      }) {
        return /* @__PURE__ */ React.createElement("div", { className: "bg-white p-6 rounded-xl border shadow-sm space-y-4" }, /* @__PURE__ */ React.createElement("h3", { className: "text-base font-black text-center border-b pb-2" }, "\u{1F195} Nouveau Dossier (\xC9pisode)"), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] font-bold uppercase text-gray-400" }, "Rechercher un patient existant"), /* @__PURE__ */ React.createElement("input", { type: "text", value: searchPatientText, onChange: (e) => setSearchPatientText(e.target.value), placeholder: "Nom ou num\xE9ro de dossier...", className: "border rounded-lg p-2 w-full text-xs outline-none pl-8" }), /* @__PURE__ */ React.createElement("span", { className: "absolute left-2 top-7 text-gray-400" }, /* @__PURE__ */ React.createElement(Search, { size: 14 })), suggestionsPatients.length > 0 && /* @__PURE__ */ React.createElement("ul", { className: "absolute z-20 left-0 right-0 bg-white border rounded-lg shadow-2xl mt-1 text-xs max-h-48 overflow-y-auto divide-y" }, suggestionsPatients.map((p) => /* @__PURE__ */ React.createElement("li", { key: p.id }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => choisirPatientExistant(p), className: "w-full text-left px-3 py-2 hover:bg-gray-100 flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, p.nomPatient), /* @__PURE__ */ React.createElement("span", { className: "text-gray-500" }, p.numDossier || "N/R", " - ", p.ongPartenaire || "Priv\xE9")))))), /* @__PURE__ */ React.createElement("div", { className: "text-center text-gray-400 text-[10px]" }, "\u2014 ou cr\xE9er un nouveau \u2014"), peutCreerDossier ? /* @__PURE__ */ React.createElement("form", { onSubmit: onSoumettre, className: "space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] font-bold uppercase text-gray-400" }, "Nom complet"), /* @__PURE__ */ React.createElement("input", { type: "text", value: inputNom, onChange: (e) => setInputNom(e.target.value), placeholder: "Nom et pr\xE9nom...", className: "border rounded-lg p-2 text-xs outline-none", required: true })), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] font-bold uppercase text-gray-400" }, "Type de patient"), /* @__PURE__ */ React.createElement("select", { value: inputTypePatient, onChange: (e) => setInputTypePatient(e.target.value), className: "border rounded-lg p-2 text-xs bg-white outline-none" }, /* @__PURE__ */ React.createElement("option", { value: "ONG" }, "\u{1F3E5} Patient ONG"), /* @__PURE__ */ React.createElement("option", { value: "PRIVE" }, "\u{1F4B3} Patient Priv\xE9"))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] font-bold uppercase text-gray-400" }, "Service pr\xE9vu"), /* @__PURE__ */ React.createElement("select", { value: serviceChoisi, onChange: (e) => setServiceChoisi(e.target.value), className: "border rounded-lg p-2 text-xs bg-white outline-none" }, /* @__PURE__ */ React.createElement("option", { value: "" }, "-- Non pr\xE9cis\xE9 (d\xE9duit automatiquement) --"), /* @__PURE__ */ React.createElement("option", { value: "Urgences" }, "\u{1F6A8} Urgences"), /* @__PURE__ */ React.createElement("option", { value: "P\xE9diatrie" }, "\u{1F9D2} P\xE9diatrie"), /* @__PURE__ */ React.createElement("option", { value: "G\xE9n\xE9ral" }, "\u{1FA7A} G\xE9n\xE9ral"), /* @__PURE__ */ React.createElement("option", { value: "Chirurgie" }, "\u{1F52A} Chirurgie"), /* @__PURE__ */ React.createElement("option", { value: "Maternit\xE9" }, "\u{1F930} Maternit\xE9"), /* @__PURE__ */ React.createElement("option", { value: "N\xE9onatologie" }, "\u{1F476} N\xE9onatologie")), /* @__PURE__ */ React.createElement("p", { className: "text-[9px] text-gray-400" }, "Aide le tableau de bord Pilotage CHF \xE0 classer ce dossier tout de suite, m\xEAme avant qu'un acte soit factur\xE9.")), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] font-bold uppercase text-gray-400" }, "ONG partenaire"), /* @__PURE__ */ React.createElement("select", { value: inputOng, onChange: (e) => setInputOng(e.target.value), className: "border rounded-lg p-2 text-xs bg-white outline-none", disabled: inputTypePatient !== "ONG" }, /* @__PURE__ */ React.createElement("option", { value: "" }, "-- S\xE9lectionner --"), LISTE_ONG.map((o) => /* @__PURE__ */ React.createElement("option", { key: o, value: o }, o)))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] font-bold uppercase text-gray-400" }, "Num\xE9ro de dossier"), /* @__PURE__ */ React.createElement("input", { type: "text", value: inputNumDossier, onChange: (e) => setInputNumDossier(e.target.value), placeholder: "ex: F-2024-045", className: "border rounded-lg p-2 text-xs outline-none" })), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] font-bold uppercase text-gray-400" }, "Date de naissance"), /* @__PURE__ */ React.createElement("input", { type: "date", value: inputDateNaissance, onChange: (e) => setInputDateNaissance(e.target.value), className: "border rounded-lg p-2 text-xs outline-none" })), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-[11px] font-bold uppercase text-gray-400" }, "T\xE9l\xE9phone"), /* @__PURE__ */ React.createElement("input", { type: "text", value: inputTelephone, onChange: (e) => setInputTelephone(e.target.value), placeholder: "509-1234-5678", className: "border rounded-lg p-2 text-xs outline-none" })), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "w-full bg-[#1E2A24] text-white py-2 rounded-lg text-xs font-bold" }, "\u{1F680} Ouvrir le dossier")) : /* @__PURE__ */ React.createElement("p", { className: "text-gray-500 text-center" }, "Vous n'avez pas la permission de cr\xE9er un dossier."));
      }
      module.exports = NouveauDossierForm;
    }
  });

  // components/HebergementForm.js
  var require_HebergementForm = __commonJS({
    "components/HebergementForm.js"(exports, module) {
      var React = window.React;
      function HebergementForm({
        dateEntree1,
        setDateEntree1,
        dateSortie1,
        setDateSortie1,
        typeLit1,
        setTypeLit1,
        multiPeriode,
        setMultiPeriode,
        dateEntree2,
        setDateEntree2,
        dateSortie2,
        setDateSortie2,
        typeLit2,
        setTypeLit2,
        hasChirSpec,
        setHasChirSpec,
        nomChirSpec,
        setNomChirSpec,
        prixChirSpec,
        setPrixChirSpec
      }) {
        return /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border space-y-3 shadow-sm" }, /* @__PURE__ */ React.createElement("p", { className: "text-[11px] font-bold uppercase text-gray-400" }, "1. H\xE9bergement & S\xE9jour (Optionnel)"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-500 uppercase" }, "Date d'entr\xE9e"), /* @__PURE__ */ React.createElement("input", { type: "date", value: dateEntree1, onChange: (e) => setDateEntree1(e.target.value), className: "border rounded-lg p-1.5 text-xs w-full" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-500 uppercase" }, "Date de sortie"), /* @__PURE__ */ React.createElement("input", { type: "date", value: dateSortie1, onChange: (e) => setDateSortie1(e.target.value), className: "border rounded-lg p-1.5 text-xs w-full" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-500 uppercase" }, "Type de lit"), /* @__PURE__ */ React.createElement("select", { value: typeLit1, onChange: (e) => setTypeLit1(e.target.value), className: "border rounded-lg p-1.5 bg-white text-xs w-full" }, /* @__PURE__ */ React.createElement("option", { value: "normal" }, "Lit normal (250 Gdes/j)"), /* @__PURE__ */ React.createElement("option", { value: "semi_prive" }, "Salle Semi Priv\xE9 (500)"), /* @__PURE__ */ React.createElement("option", { value: "prive" }, "Salle Priv\xE9 (750)"), /* @__PURE__ */ React.createElement("option", { value: "isolette" }, "Isolette (1250)"), /* @__PURE__ */ React.createElement("option", { value: "incubateur" }, "Incubateur (2500)")))), /* @__PURE__ */ React.createElement("div", { className: "flex gap-4 pt-1 border-t border-dashed mt-2" }, /* @__PURE__ */ React.createElement("label", { className: "flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: multiPeriode, onChange: (e) => setMultiPeriode(e.target.checked), className: "rounded" }), " Acter une seconde p\xE9riode"), /* @__PURE__ */ React.createElement("label", { className: "flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: hasChirSpec, onChange: (e) => setHasChirSpec(e.target.checked), className: "rounded" }), " Op\xE9ration chirurgicale hors-catalogue")), multiPeriode && /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-2 bg-amber-50/20 p-2 rounded-lg border" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[9px] font-bold text-amber-800" }, "Entr\xE9e P2"), /* @__PURE__ */ React.createElement("input", { type: "date", value: dateEntree2, onChange: (e) => setDateEntree2(e.target.value), className: "border rounded-lg p-1 text-xs w-full bg-white" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[9px] font-bold text-amber-800" }, "Sortie P2"), /* @__PURE__ */ React.createElement("input", { type: "date", value: dateSortie2, onChange: (e) => setDateSortie2(e.target.value), className: "border rounded-lg p-1 text-xs w-full bg-white" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[9px] font-bold text-amber-800" }, "Lit P2"), /* @__PURE__ */ React.createElement("select", { value: typeLit2, onChange: (e) => setTypeLit2(e.target.value), className: "border rounded-lg p-1 text-xs w-full bg-white" }, /* @__PURE__ */ React.createElement("option", { value: "normal" }, "Normal"), /* @__PURE__ */ React.createElement("option", { value: "semi_prive" }, "Semi Priv\xE9"), /* @__PURE__ */ React.createElement("option", { value: "prive" }, "Priv\xE9")))), hasChirSpec && /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-2 bg-red-50/20 p-2 rounded-lg border" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[9px] font-bold text-red-800" }, "Libell\xE9"), /* @__PURE__ */ React.createElement("input", { type: "text", value: nomChirSpec, onChange: (e) => setNomChirSpec(e.target.value), placeholder: "Nom...", className: "border rounded-lg p-1 text-xs w-full bg-white outline-none" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[9px] font-bold text-red-800" }, "Montant (Gdes)"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", value: prixChirSpec, onChange: (e) => setPrixChirSpec(e.target.value), placeholder: "0", className: "border rounded-lg p-1 text-xs w-full bg-white outline-none" }))));
      }
      module.exports = HebergementForm;
    }
  });

  // components/CalculateurPanel.js
  var require_CalculateurPanel = __commonJS({
    "components/CalculateurPanel.js"(exports, module) {
      var React = window.React;
      var { useState, useEffect, useMemo, useRef } = React;
      var { auth, db, enregistrerAudit } = require_firebase();
      var { chf, toPaiementApi } = require_supabase();
      var { LISTE_ONG, CONFIG_LITS } = require_constants();
      var { formatGourdes, formatDH, echapperHTML } = require_helpers();
      var { Search, Plus, X, Clock, Check } = require_icons();
      var ConfirmModal = require_ConfirmModal();
      var NouveauDossierForm = require_NouveauDossierForm();
      var HebergementForm = require_HebergementForm();
      function CalculateurPanel({
        medicaments,
        actes,
        lignes,
        setLignes,
        dossierActif,
        nomPatient,
        selectedOng,
        onNouveauDossier,
        onAnnulerDossier,
        onCloturerDossier,
        fichesDossier,
        onSupprimerFicheDossier,
        idFicheEnCoursDEdition,
        // ID de la fiche en cours d'édition (passé par le parent)
        onEditerFiche,
        // NOUVELLE PROP : fonction pour charger une fiche en édition
        numeroFicheCourante,
        dateEntree1,
        setDateEntree1,
        dateSortie1,
        setDateSortie1,
        typeLit1,
        setTypeLit1,
        j1,
        totalE1,
        multiPeriode,
        setMultiPeriode,
        dateEntree2,
        setDateEntree2,
        dateSortie2,
        setDateSortie2,
        typeLit2,
        setTypeLit2,
        j2,
        totalE2,
        hasChirSpec,
        setHasChirSpec,
        nomChirSpec,
        setNomChirSpec,
        prixChirSpec,
        setPrixChirSpec,
        totalsParService,
        grandTotal,
        totalDossierGourdes,
        onEnregistrerFiche,
        onViderFicheActive,
        injecterLigne,
        modeSimulation,
        userRole,
        userDisplayName,
        setMedicaments,
        medicamentsState,
        dateNaissance,
        telephone,
        numDossierPatient,
        typePatient,
        dossierId,
        setDossierId,
        patientsExistants,
        onChargerPatientExistant,
        paiementEffectue,
        setPaiementEffectue,
        showToast,
        onSuspendreDossier,
        onChangerTypeOng
      }) {
        const [inputNom, setInputNom] = useState("");
        const [inputOng, setInputOng] = useState(() => localStorage.getItem("chf-dernier-ong") || "");
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
          return catalogueFiltre.filter((i) => i.nom.toLowerCase().includes(q)).slice(0, 5);
        }, [recherche, catalogueFiltre]);
        useEffect(() => {
          if (!dossierId) {
            setDepots([]);
            return;
          }
          const loadDepots = async () => {
            try {
              const allPaiements = await chf.getPaiements();
              const { fromPaiementApi } = require_supabase();
              const filtered = allPaiements.map((p) => fromPaiementApi(p)).filter((p) => p.episodeId === dossierId && p.mode === "depot");
              setDepots(filtered);
            } catch (e) {
              console.warn("Erreur chargement d\xE9p\xF4ts:", e);
            }
          };
          loadDepots();
          const interval = setInterval(() => {
            if (!document.hidden) loadDepots();
          }, 45e3);
          return () => clearInterval(interval);
        }, [dossierId]);
        const totalDepots = useMemo(() => depots.reduce((s, d) => s + (d.montant || 0), 0), [depots]);
        useEffect(() => {
          const close = (e) => {
            if (refZone.current && !refZone.current.contains(e.target)) setOuvert(false);
          };
          document.addEventListener("mousedown", close);
          return () => document.removeEventListener("mousedown", close);
        }, []);
        const totalChirSpec = useMemo(() => {
          const p = parseFloat(prixChirSpec);
          return isNaN(p) ? 0 : p;
        }, [hasChirSpec, prixChirSpec]);
        const montantExonere = useMemo(() => {
          if (!autorisationExoneration || modePaiement !== "exoneration") return 0;
          const pct = parseFloat(pourcentageExoneration) || 0;
          return grandTotal * pct / 100;
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
            if (stockActuel < q) {
              showToast(`Stock insuffisant pour "${selection.nom}". Restant : ${stockActuel}`, "error");
              return;
            }
          }
          injecterLigne(selection, categorie, q);
          if (categorie === "med" && selection.quantite !== void 0) {
            const updated = medicaments.map((m) => {
              if (m.id === selection.id) {
                return { ...m, quantite: Math.max(0, (m.quantite || 0) - q) };
              }
              return m;
            });
            setMedicaments(updated);
            const { LOG_MEDS_KEY } = require_firebase();
            localStorage.setItem(LOG_MEDS_KEY, JSON.stringify(updated));
            chf.updateCatalog("medicaments", updated).catch((e) => console.warn(e));
          }
          setRecherche("");
          setSelection(null);
          setQuantite("1");
          if (inputRechercheRef.current) inputRechercheRef.current.focus();
          setPaiementEffectue(false);
        };
        const demanderExoneration = async () => {
          var _a, _b;
          if (modePaiement !== "exoneration") {
            showToast("S\xE9lectionnez le mode Exon\xE9ration.", "error");
            return;
          }
          if (!nomPatient) {
            showToast("Patient requis.", "error");
            return;
          }
          const pct = parseFloat(pourcentageExoneration) || 0;
          if (pct <= 0) {
            showToast("Le pourcentage doit \xEAtre sup\xE9rieur \xE0 0.", "error");
            return;
          }
          const montantEx = grandTotal * pct / 100;
          if (montantEx <= 0) {
            showToast("Le montant exon\xE9r\xE9 doit \xEAtre > 0.", "error");
            return;
          }
          try {
            const docRef = await db.collection("demandes_exoneration").add({
              dossierId: dossierId || null,
              patientNom: nomPatient,
              montantTotal: grandTotal,
              pourcentageDemande: pct,
              montantExonere: montantEx,
              demandeur: userDisplayName || ((_a = auth.currentUser) == null ? void 0 : _a.displayName) || "inconnu",
              demandeurUid: ((_b = auth.currentUser) == null ? void 0 : _b.uid) || "",
              statut: "en_attente",
              dateDemande: (/* @__PURE__ */ new Date()).toISOString()
            });
            setDemandeEnCoursId(docRef.id);
            showToast("\u{1F4E8} Demande d'exon\xE9ration envoy\xE9e.", "success");
          } catch (error) {
            showToast("Erreur: " + error.message, "error");
          }
        };
        useEffect(() => {
          if (!demandeEnCoursId) return;
          const unsubscribe = db.collection("demandes_exoneration").doc(demandeEnCoursId).onSnapshot((doc) => {
            const data = doc.data();
            if (!data) return;
            if (data.statut === "accepte") {
              showToast("\u2705 Exon\xE9ration accept\xE9e", "success");
              setAutorisationExoneration(true);
              setDemandeEnCoursId(null);
            } else if (data.statut === "refuse") {
              showToast("\u274C Exon\xE9ration refus\xE9e", "error");
              setDemandeEnCoursId(null);
            }
          });
          return () => unsubscribe();
        }, [demandeEnCoursId]);
        const enregistrerDepot = async () => {
          var _a;
          if (!dossierId) {
            showToast("Aucun dossier actif.", "error");
            return;
          }
          const montant = parseFloat(montantDepot);
          if (isNaN(montant) || montant <= 0) {
            showToast("Montant invalide.", "error");
            return;
          }
          try {
            await chf.createPaiement(toPaiementApi({
              episodeId: dossierId,
              patientNom: nomPatient,
              montant,
              mode: "depot",
              ongPartenaire: selectedOng || "",
              date: (/* @__PURE__ */ new Date()).toISOString(),
              encaissePar: ((_a = auth.currentUser) == null ? void 0 : _a.displayName) || "inconnu"
            }));
            showToast("\u2705 D\xE9p\xF4t enregistr\xE9 !", "success");
          } catch (error) {
            if (!error.isOfflineQueue) {
              showToast("Erreur: " + error.message, "error");
              return;
            }
            showToast("\u{1F4F4} D\xE9p\xF4t enregistr\xE9 hors ligne \u2014 sera synchronis\xE9 au retour d'internet", "info");
          }
          setMontantDepot("");
          setModeDepot(false);
          setPaiementEffectue(true);
        };
        useEffect(() => {
          if (!searchPatientText.trim()) {
            setSuggestionsPatients([]);
            return;
          }
          const q = searchPatientText.trim().toLowerCase();
          const results = (patientsExistants || []).filter(
            (p) => p.nomPatient.toLowerCase().includes(q) || p.numDossier && p.numDossier.toLowerCase().includes(q)
          );
          setSuggestionsPatients(results.slice(0, 8));
        }, [searchPatientText, patientsExistants]);
        const choisirPatientExistant = (patient) => {
          const statutPatient = patient.status || "archived";
          if (statutPatient === "archived") {
            setInputNom(patient.nomPatient || "");
            setInputTypePatient(patient.typePatient || "ONG");
            setInputOng(patient.ongPartenaire || "");
            setInputNumDossier(patient.numDossier || "");
            setInputDateNaissance(patient.dateNaissance || "");
            setInputTelephone(patient.telephone || "");
            showToast(`Infos de ${patient.nomPatient} pr\xE9-remplies pour une nouvelle visite`, "info");
          } else {
            onChargerPatientExistant(patient);
          }
          setSearchPatientText("");
          setSuggestionsPatients([]);
        };
        const reimprimerFicheValidee = (fiche) => {
          var _a;
          const lignesDetaillees = ((_a = fiche.rawState) == null ? void 0 : _a.lignesCalcul) || [];
          const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fiche N\xB0${fiche.numeroFiche}</title><style>@page{size:100mm 297mm;margin:3mm 5mm;}body{font-family:'Courier New',monospace;font-size:12px;color:#000;width:90mm;margin:0 auto;}.entete{text-align:center;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:8px;}.entete h1{font-size:20px;margin:4px 0;}.entete p{margin:2px 0;font-size:11px;}table{width:100%;border-collapse:collapse;margin:6px 0;font-size:11px;}th,td{padding:4px 6px;text-align:left;border-bottom:1px dotted #ccc;}th{border-bottom:2px solid #000;font-size:10px;text-transform:uppercase;}.qte{text-align:center;}.prix,.sous-total{text-align:right;}.total{font-weight:bold;font-size:16px;text-align:right;border-top:3px solid #000;padding-top:6px;margin-top:6px;}.footer{margin-top:12px;font-size:9px;text-align:center;border-top:1px dashed #ccc;padding-top:6px;color:#555;}</style></head><body><div class="entete"><h1>CHF</h1><p>Centre Hospitalier de Fontaine</p><p>#13, Fontaine Duvivier, Cit\xE9 Soleil</p><p>T\xE9l: (509) 3647-0563 / 2226-8900</p><p>R\xC9IMPRESSION \u2014 ${(/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR")} ${(/* @__PURE__ */ new Date()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p></div><div style="font-weight:bold;font-size:11px;margin-bottom:6px;">Patient: ${echapperHTML(nomPatient)} \u2014 Fiche N\xB0${fiche.numeroFiche}</div><table><thead><tr><th>D\xE9signation</th><th class="qte">Qt\xE9</th><th class="prix">Prix</th><th class="sous-total">Total</th></tr></thead><tbody>${lignesDetaillees.map((l) => `<tr><td>${echapperHTML(l.nom)}</td><td class="qte">${l.qte}</td><td class="prix">${formatGourdes(l.prix)}</td><td class="sous-total">${formatGourdes(l.qte * l.prix)}</td></tr>`).join("")}</tbody></table><div class="total">TOTAL FICHE : ${formatGourdes(fiche.totalGlobal)} Gdes (${formatDH(fiche.totalGlobal)} DH)</div><p style="font-size:10px;margin-top:4px;">Mode: ${echapperHTML((fiche.modePaiement || "cash").toUpperCase())} | Encaiss\xE9 par: ${echapperHTML(fiche.creePar || "inconnu")}</p><div class="footer">Merci de votre visite !<br/>CHF Syst\xE8me Hospitalier \u2013 ${(/* @__PURE__ */ new Date()).getFullYear()}</div></body></html>`;
          const win = window.open("", "_blank", "width=500,height=700");
          if (!win) {
            showToast("Autorisez les pop-ups.", "error");
            return;
          }
          win.document.write(contenu);
          win.document.close();
          win.focus();
          setTimeout(() => win.print(), 400);
        };
        const imprimerTicket = (forcer = false) => {
          var _a;
          if (!forcer && !paiementEffectue) {
            showToast("Veuillez d'abord effectuer le paiement avant d'imprimer.", "error");
            return;
          }
          const data = {
            nomPatient: nomPatient || "Patient non renseign\xE9",
            selectedOng: selectedOng || "\u2014",
            numDossier: numDossierPatient || "N/R",
            modePaiement: modePaiement || "cash",
            lignes: lignes || [],
            grandTotal: grandTotal || 0,
            montantVerse: parseFloat(montantVerse) || 0,
            monnaieARendre: monnaieARendre || 0,
            exoneration: autorisationExoneration && modePaiement === "exoneration" ? { pourcentage: pourcentageExoneration, montantExonere } : null,
            dateEntree1,
            dateSortie1,
            totalE1,
            totalE2,
            j1,
            j2,
            typeLit1,
            typeLit2,
            hasChirSpec,
            nomChirSpec,
            totalChirSpec,
            telephone: telephone || "N/R",
            dateNaissance: dateNaissance || "N/R",
            typePatient: typePatient || "ONG",
            creePar: ((_a = auth.currentUser) == null ? void 0 : _a.displayName) || "inconnu",
            solde: modePaiement === "credit" ? montantRestantApresDepots : 0,
            depots: totalDepots
          };
          const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket CHF</title><style>@page{size:100mm 297mm;margin:3mm 5mm;}body{font-family:'Courier New',monospace;font-size:12px;color:#000;background:white;margin:0;padding:0;width:90mm;margin:0 auto;}.entete{text-align:center;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:8px;}.entete h1{font-size:20px;margin:4px 0;}.entete p{margin:2px 0;font-size:11px;}.info{display:flex;justify-content:space-between;font-weight:bold;font-size:11px;margin-bottom:6px;}.info-patient{font-size:10px;margin-bottom:4px;}table{width:100%;border-collapse:collapse;margin:6px 0;font-size:11px;}th,td{padding:4px 6px;text-align:left;border-bottom:1px dotted #ccc;}th{border-bottom:2px solid #000;font-size:10px;text-transform:uppercase;}.total{font-weight:bold;font-size:16px;text-align:right;border-top:3px solid #000;padding-top:6px;margin-top:6px;}.footer{margin-top:12px;font-size:9px;text-align:center;border-top:1px dashed #ccc;padding-top:6px;color:#555;}.qte{text-align:center;}.prix,.sous-total{text-align:right;}.exoneration{color:red;font-weight:bold;font-size:14px;}.monnaie{font-size:14px;color:#006600;}.solde{color:#cc0000;font-weight:bold;}.depot-info{font-size:12px;color:#555;}</style></head><body><div class="entete"><h1>CHF</h1><p>Centre Hospitalier de Fontaine</p><p>#13, Fontaine Duvivier, Cit\xE9 Soleil</p><p>T\xE9l: (509) 3647-0563 / 2226-8900</p><p>${(/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR")} ${(/* @__PURE__ */ new Date()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p></div><div class="info"><span>Patient: ${echapperHTML(data.nomPatient)}</span><span>${echapperHTML(data.selectedOng)}</span></div><div class="info"><span>Dossier: ${echapperHTML(data.numDossier)}</span><span>Mode: ${echapperHTML(data.modePaiement).toUpperCase()}</span></div><div class="info info-patient"><span>\u{1F4DE} ${echapperHTML(data.telephone)}</span><span>Type: ${data.typePatient}</span></div><div class="info info-patient"><span>Enregistr\xE9 par: ${echapperHTML(data.creePar)}</span></div>${data.dateEntree1 && data.dateSortie1 ? `<p style="font-size:10px; margin:4px 0;"><strong>S\xE9jour:</strong> ${data.dateEntree1.split("-").reverse().slice(0, 2).join("/")} \u2192 ${data.dateSortie1.split("-").reverse().slice(0, 2).join("/")}</p>` : ""}<table><thead><tr><th>D\xE9signation</th><th class="qte">Qt\xE9</th><th class="prix">Prix</th><th class="sous-total">Total</th></tr></thead><tbody>${data.j1 > 0 ? `<tr><td>H\xE9bergement</td><td class="qte">${data.j1}j</td><td class="prix">${formatGourdes(CONFIG_LITS[data.typeLit1].prix)}</td><td class="sous-total">${formatGourdes(data.totalE1)}</td></tr>` : ""}${data.j2 > 0 ? `<tr><td>H\xE9bergement P2</td><td class="qte">${data.j2}j</td><td class="prix">${formatGourdes(CONFIG_LITS[data.typeLit2].prix)}</td><td class="sous-total">${formatGourdes(data.totalE2)}</td></tr>` : ""}${data.hasChirSpec && data.nomChirSpec ? `<tr><td>Chirurgie: ${echapperHTML(data.nomChirSpec)}</td><td class="qte">1</td><td class="prix">${formatGourdes(data.totalChirSpec)}</td><td class="sous-total">${formatGourdes(data.totalChirSpec)}</td></tr>` : ""}${data.lignes.map((l) => `<tr><td>${echapperHTML(l.nom)}</td><td class="qte">${l.qte}</td><td class="prix">${formatGourdes(l.prix)}</td><td class="sous-total">${formatGourdes(l.qte * l.prix)}</td></tr>`).join("")}</tbody></table>${data.exoneration ? `<div class="exoneration">Exon\xE9ration: ${data.exoneration.pourcentage}% (${formatGourdes(data.exoneration.montantExonere)} Gdes)</div>` : ""}${data.depots > 0 ? `<div class="depot-info">D\xE9p\xF4ts d\xE9j\xE0 effectu\xE9s: ${formatGourdes(data.depots)} Gdes</div>` : ""}<div class="total">TOTAL \xC0 PAYER (apr\xE8s d\xE9duction des d\xE9p\xF4ts): ${formatGourdes(montantRestantApresDepots)} Gdes<br/>${formatDH(montantRestantApresDepots)} DH</div>${data.solde > 0 ? `<p class="solde">Solde restant : ${formatGourdes(data.solde)} Gdes</p>` : ""}<div style="margin-top:6px; border-top:2px dashed #000; padding-top:6px;">${data.modePaiement === "cash" ? `<div style="display:flex; justify-content:space-between; font-size:12px;"><span>Montant vers\xE9:</span><span>${formatGourdes(data.montantVerse)} Gdes</span></div><div style="display:flex; justify-content:space-between; font-size:16px; font-weight:bold; color:#006600;"><span>Monnaie \xE0 rendre:</span><span>${formatGourdes(data.monnaieARendre)} Gdes</span></div>` : ""}</div><div class="footer">Merci de votre visite !<br/>CHF Syst\xE8me Hospitalier \u2013 ${(/* @__PURE__ */ new Date()).getFullYear()}</div></body></html>`;
          const win = window.open("", "_blank", "width=500,height=700");
          if (!win) {
            showToast("Veuillez autoriser les fen\xEAtres pop-up.", "error");
            return;
          }
          win.document.write(contenu);
          win.document.close();
          win.focus();
          setTimeout(() => win.print(), 500);
        };
        const imprimerFicheA4 = () => {
          if (!paiementEffectue) {
            showToast("Veuillez d'abord effectuer le paiement.", "error");
            return;
          }
          showToast("Impression A4 (fonction pr\xEAte)", "success");
        };
        const executerEncaissement = async () => {
          var _a, _b;
          if (!dossierActif) {
            showToast("Aucun dossier actif.", "error");
            return;
          }
          if (!dossierId) {
            showToast("Erreur interne : aucun identifiant de dossier valide. N'encaisse pas \u2014 recharge la page et rouvre le dossier.", "error");
            return;
          }
          if (!grandTotal || grandTotal <= 0) {
            showToast("Impossible d'encaisser : le montant de la fiche est \xE0 0 Gdes. Ajoute au moins une ligne.", "error");
            return;
          }
          if (modePaiement === "exoneration" && !(userRole === "direction" || userRole === "administrateur")) {
            showToast("Seul l'administrateur ou la direction peut encaisser une exon\xE9ration.", "error");
            return;
          }
          if (modePaiement === "cash") {
            const vers = parseFloat(montantVerse) || 0;
            if (vers < montantRestantApresDepots) {
              showToast(`\u26A0\uFE0F Montant insuffisant. Reste : ${formatGourdes(montantRestantApresDepots - vers)} Gdes`, "error");
              return;
            }
          }
          if (modePaiement === "ong" && !ongPartenaireFiche) {
            showToast("Veuillez s\xE9lectionner l'ONG partenaire.", "error");
            return;
          }
          try {
            const fiche = {
              id: "fiche-" + Date.now(),
              numeroFiche: numeroFicheCourante,
              breakdown: { ...totalsParService },
              totalGlobal: grandTotal,
              modePaiement,
              ongPartenaire: modePaiement === "ong" ? ongPartenaireFiche : "",
              exoneration: modePaiement === "exoneration" ? { pourcentage: parseFloat(pourcentageExoneration), montantExonere, motif: motifExoneration, autorisePar: auth.currentUser.displayName } : null,
              statutPaiement: modePaiement === "credit" ? "partiellement_paye" : "paye",
              montantPaye: modePaiement === "cash" ? parseFloat(montantVerse) : modePaiement === "credit" ? 0 : montantRestantApresDepots,
              solde: modePaiement === "credit" ? montantRestantApresDepots : 0,
              exeat: dateEntree1 && dateSortie1 ? {
                dateEntree: dateEntree1,
                dateSortie: dateSortie1,
                nbJours: j1,
                typeLit: typeLit1,
                prixParJour: CONFIG_LITS[typeLit1].prix,
                totalHebergement: totalE1,
                multiPeriode,
                dateEntree2,
                dateSortie2,
                typeLit2,
                nbJours2: j2,
                totalHebergement2: totalE2
              } : null,
              dateCreation: (/* @__PURE__ */ new Date()).toISOString(),
              creePar: ((_a = auth.currentUser) == null ? void 0 : _a.displayName) || "inconnu",
              rawState: { lignesCalcul: [...lignes], dateEntree1, dateSortie1, typeLit1, multiPeriode, dateEntree2, dateSortie2, typeLit2, hasChirSpec, nomChirSpec, prixChirSpec }
            };
            onEnregistrerFiche(fiche);
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
                exoneration: modePaiement === "exoneration" ? { pourcentage: parseFloat(pourcentageExoneration), montantExonere, motif: motifExoneration } : null,
                date: (/* @__PURE__ */ new Date()).toISOString(),
                encaissePar: ((_b = auth.currentUser) == null ? void 0 : _b.displayName) || "inconnu",
                typePatient: typePatient || "ONG"
              }));
              showToast("\u2705 Fiche enregistr\xE9e avec succ\xE8s !", "success");
            } catch (err) {
              if (!err.isOfflineQueue) throw err;
              showToast("\u{1F4F4} Paiement enregistr\xE9 hors ligne \u2014 sera synchronis\xE9 au retour d'internet", "info");
            }
            setMontantVerse("");
            setPourcentageExoneration(0);
            setMotifExoneration("");
            setAutorisationExoneration(false);
            setPaiementEffectue(true);
            setConfirmModal({
              titre: "\u{1F5A8}\uFE0F Imprimer le ticket ?",
              message: "Le paiement a bien \xE9t\xE9 enregistr\xE9.",
              confirmLabel: "Imprimer",
              cancelLabel: "Plus tard",
              onConfirm: () => {
                setConfirmModal(null);
                imprimerTicket(true);
              },
              onCancel: () => setConfirmModal(null)
            });
          } catch (error) {
            showToast("Erreur: " + error.message, "error");
          }
        };
        const demanderConfirmationEncaissement = () => {
          if (!grandTotal || grandTotal <= 0) {
            showToast("Impossible d'encaisser : le montant de la fiche est \xE0 0 Gdes.", "error");
            return;
          }
          const libellesMode = { cash: "\u{1F4B5} Cash", credit: "\u{1F4DD} Cr\xE9dit", ong: "\u{1F3E5} ONG", exoneration: "\u{1F3AF} Exon\xE9ration" };
          setConfirmModal({
            titre: "Confirmer l'encaissement",
            message: `Patient : ${nomPatient}
Mode de paiement : ${libellesMode[modePaiement] || modePaiement}`,
            detail: `${formatGourdes(grandTotal)} Gdes  (${formatDH(grandTotal)} DH)`,
            confirmLabel: "\u{1F4B3} Encaisser",
            cancelLabel: "Annuler",
            onConfirm: () => {
              setConfirmModal(null);
              executerEncaissement();
            },
            onCancel: () => setConfirmModal(null)
          });
        };
        const peutCreerDossier = userRole === "comptable" || userRole === "direction" || userRole === "administrateur";
        const peutAjouterLignes = userRole === "comptable" || userRole === "direction" || userRole === "administrateur";
        const peutEncaisser = userRole === "comptable" || userRole === "direction" || userRole === "administrateur";
        const peutArchiver = userRole === "comptable" || userRole === "direction" || userRole === "administrateur";
        const peutSupprimerFiche = userRole === "direction" || userRole === "administrateur";
        const peutAnnulerDossier = userRole === "direction" || userRole === "administrateur";
        const peutSuspendre = userRole === "comptable" || userRole === "direction" || userRole === "administrateur";
        if (modeSimulation) return /* @__PURE__ */ React.createElement("div", { className: "bg-blue-50 p-4" }, "\u{1F9EE} Mode simulation");
        return /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, confirmModal && /* @__PURE__ */ React.createElement(ConfirmModal, { ...confirmModal }), !dossierActif ? /* @__PURE__ */ React.createElement(
          NouveauDossierForm,
          {
            searchPatientText,
            setSearchPatientText,
            suggestionsPatients,
            choisirPatientExistant,
            peutCreerDossier,
            onSoumettre: (e) => {
              e.preventDefault();
              if (inputOng) localStorage.setItem("chf-dernier-ong", inputOng);
              onNouveauDossier(inputNom, inputOng, inputNumDossier, inputTypePatient, inputDateNaissance, inputTelephone, serviceChoisi);
            },
            serviceChoisi,
            setServiceChoisi,
            inputNom,
            setInputNom,
            inputTypePatient,
            setInputTypePatient,
            inputOng,
            setInputOng,
            inputNumDossier,
            setInputNumDossier,
            inputDateNaissance,
            setInputDateNaissance,
            inputTelephone,
            setInputTelephone
          }
        ) : /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border border-emerald-300 flex justify-between items-center shadow-sm flex-wrap gap-2" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-base font-black" }, nomPatient), !editTypeOuvert ? /* @__PURE__ */ React.createElement("p", { className: "text-xs font-bold text-purple-700 flex items-center gap-2" }, selectedOng || "Priv\xE9", " - ", typePatient || "ONG", peutCreerDossier && /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setNouveauTypeEdit(typePatient || "ONG");
          setNouvelOngEdit(selectedOng || "");
          setEditTypeOuvert(true);
        }, className: "text-[9px] font-bold text-blue-600 underline" }, "\u270F\uFE0F Changer")) : /* @__PURE__ */ React.createElement("div", { className: "flex gap-1.5 items-center mt-1 flex-wrap" }, /* @__PURE__ */ React.createElement("select", { value: nouveauTypeEdit, onChange: (e) => setNouveauTypeEdit(e.target.value), className: "border rounded p-1 text-xs bg-white" }, /* @__PURE__ */ React.createElement("option", { value: "ONG" }, "\u{1F3E5} ONG"), /* @__PURE__ */ React.createElement("option", { value: "PRIVE" }, "\u{1F4B3} Priv\xE9")), nouveauTypeEdit === "ONG" && /* @__PURE__ */ React.createElement("select", { value: nouvelOngEdit, onChange: (e) => setNouvelOngEdit(e.target.value), className: "border rounded p-1 text-xs bg-white" }, /* @__PURE__ */ React.createElement("option", { value: "" }, "-- ONG --"), LISTE_ONG.map((o) => /* @__PURE__ */ React.createElement("option", { key: o, value: o }, o))), /* @__PURE__ */ React.createElement("button", { onClick: () => {
          if (onChangerTypeOng) onChangerTypeOng(nouveauTypeEdit, nouveauTypeEdit === "ONG" ? nouvelOngEdit : "");
          setEditTypeOuvert(false);
        }, className: "bg-emerald-700 text-white text-[10px] font-bold px-2 py-1 rounded" }, /* @__PURE__ */ React.createElement(Check, { size: 10 })), /* @__PURE__ */ React.createElement("button", { onClick: () => setEditTypeOuvert(false), className: "border text-[10px] font-bold px-2 py-1 rounded" }, /* @__PURE__ */ React.createElement(X, { size: 10 })))), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 flex-wrap" }, peutAnnulerDossier && /* @__PURE__ */ React.createElement("button", { onClick: onAnnulerDossier, className: "bg-red-50 text-red-700 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-red-200" }, "Abandonner"), peutSuspendre && /* @__PURE__ */ React.createElement("button", { onClick: onSuspendreDossier, className: "bg-amber-50 text-amber-700 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-amber-200 flex items-center gap-1" }, /* @__PURE__ */ React.createElement(Clock, { size: 12 }), " Suspendre"), peutArchiver && /* @__PURE__ */ React.createElement("button", { onClick: onCloturerDossier, className: "bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg" }, "\u{1F3C1} Cl\xF4turer"))), fichesDossier.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3 rounded-xl border shadow-sm space-y-1.5" }, /* @__PURE__ */ React.createElement("span", { className: "text-[9px] uppercase font-black text-gray-400" }, "Fiches valid\xE9es ", idFicheEnCoursDEdition ? "(modification en cours)" : ""), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-1.5" }, fichesDossier.map((f) => {
          const isEditing = f.id === idFicheEnCoursDEdition;
          return /* @__PURE__ */ React.createElement("div", { key: f.id, className: `flex items-center rounded-lg font-mono text-[11px] font-bold border overflow-hidden shadow-sm ${isEditing ? "bg-blue-100 border-blue-400" : "bg-gray-50 border-gray-200"}` }, /* @__PURE__ */ React.createElement("button", { onClick: () => reimprimerFicheValidee(f), className: "pl-2.5 pr-2 py-1 hover:text-blue-700", title: "R\xE9imprimer cette fiche" }, "\u{1F5A8}\uFE0F Fiche N\xB0", f.numeroFiche, " (", formatGourdes(f.totalGlobal), " Gdes)"), onEditerFiche && /* @__PURE__ */ React.createElement(
            "button",
            {
              onClick: () => onEditerFiche(f.id),
              className: "px-2 py-1 bg-blue-500/10 hover:bg-blue-600 hover:text-white border-l transition-colors text-blue-700 font-bold text-[10px]",
              title: "Modifier cette fiche"
            },
            "\u270F\uFE0F"
          ), peutSupprimerFiche && /* @__PURE__ */ React.createElement("button", { onClick: () => {
            if (confirm("Supprimer cette fiche ?")) onSupprimerFicheDossier(f.id);
          }, className: "px-2 py-1 bg-gray-200/50 hover:bg-red-600 hover:text-white border-l transition-colors" }, /* @__PURE__ */ React.createElement(X, { size: 12 })));
        }))), /* @__PURE__ */ React.createElement(
          HebergementForm,
          {
            dateEntree1,
            setDateEntree1,
            dateSortie1,
            setDateSortie1,
            typeLit1,
            setTypeLit1,
            multiPeriode,
            setMultiPeriode,
            dateEntree2,
            setDateEntree2,
            dateSortie2,
            setDateSortie2,
            typeLit2,
            setTypeLit2,
            hasChirSpec,
            setHasChirSpec,
            nomChirSpec,
            setNomChirSpec,
            prixChirSpec,
            setPrixChirSpec
          }
        ), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border space-y-3 shadow-sm", ref: refZone }, /* @__PURE__ */ React.createElement("p", { className: "text-[11px] font-bold uppercase text-gray-400" }, "2. Actes, Laboratoire & Ordonnance"), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 text-xs font-semibold" }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setCategorie("med");
          setRecherche("");
          setSelection(null);
        }, className: `flex-1 py-1.5 border rounded-lg ${categorie === "med" ? "bg-[#1E2A24] text-white" : "bg-gray-50"}` }, "\u{1F48A} Pharmacie"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setCategorie("acte");
          setRecherche("");
          setSelection(null);
        }, className: `flex-1 py-1.5 border rounded-lg ${categorie === "acte" ? "bg-[#1E2A24] text-white" : "bg-gray-50"}` }, "\u{1F52C} Examens / Actes")), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement("div", { className: "relative flex-1" }, /* @__PURE__ */ React.createElement("input", { ref: inputRechercheRef, type: "text", value: recherche, onChange: (e) => {
          setRecherche(e.target.value);
          setOuvert(true);
          setSelection(null);
        }, onFocus: () => setOuvert(true), onKeyDown: (e) => {
          if (e.key === "Enter" && suggestions.length > 0) {
            setSelection(suggestions[0]);
            setRecherche(suggestions[0].nom);
            setOuvert(false);
          }
        }, placeholder: "Rechercher un soin ou un m\xE9dicament...", className: "w-full border rounded-lg p-2 text-xs pl-8 outline-none", disabled: !peutAjouterLignes }), /* @__PURE__ */ React.createElement("span", { className: "absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" }, /* @__PURE__ */ React.createElement(Search, { size: 14 })), ouvert && suggestions.length > 0 && /* @__PURE__ */ React.createElement("ul", { className: "absolute z-20 left-0 right-0 bg-white border rounded-lg shadow-2xl mt-1 text-xs max-h-48 overflow-y-auto divide-y" }, suggestions.map((i) => /* @__PURE__ */ React.createElement("li", { key: i.id }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => {
          setSelection(i);
          setRecherche(i.nom);
          setOuvert(false);
        }, onDoubleClick: () => {
          setSelection(i);
          setQuantite("1");
          setTimeout(actionAjouterSoin, 40);
        }, className: "w-full text-left px-3 py-2 hover:bg-gray-100 flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, i.nom), /* @__PURE__ */ React.createElement("span", { className: "text-gray-500 font-mono" }, formatGourdes(i.prix), " Gdes")))))), /* @__PURE__ */ React.createElement("input", { type: "number", min: "1", value: quantite, onChange: (e) => setQuantite(e.target.value), onKeyDown: (e) => {
          if (e.key === "Enter") actionAjouterSoin();
        }, className: "w-16 border rounded-lg p-2 text-xs text-center font-mono font-bold bg-gray-50", disabled: !peutAjouterLignes }), /* @__PURE__ */ React.createElement("button", { onClick: actionAjouterSoin, disabled: !selection || !peutAjouterLignes, className: "bg-[#1E2A24] text-white px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-30 flex items-center gap-1" }, /* @__PURE__ */ React.createElement(Plus, null), " Ajouter"))), /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl border overflow-hidden shadow-sm" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-xs text-left" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-gray-100 text-[10px] text-gray-500 uppercase border-b font-mono" }, /* @__PURE__ */ React.createElement("th", { className: "p-3" }, "D\xE9signation"), /* @__PURE__ */ React.createElement("th", { className: "p-3 w-16 text-center" }, "Qt\xE9"), /* @__PURE__ */ React.createElement("th", { className: "p-3 text-right w-24" }, "Prix"), /* @__PURE__ */ React.createElement("th", { className: "p-3 text-right w-24" }, "Total"), /* @__PURE__ */ React.createElement("th", { className: "w-8" }))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-gray-100" }, j1 > 0 && /* @__PURE__ */ React.createElement("tr", { className: "bg-amber-50/20" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 text-amber-900" }, "S\xE9jour : ", CONFIG_LITS[typeLit1].nom), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center font-bold" }, j1, " jrs"), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right text-gray-400" }, formatGourdes(CONFIG_LITS[typeLit1].prix)), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right font-bold" }, formatGourdes(totalE1)), /* @__PURE__ */ React.createElement("td", null)), multiPeriode && j2 > 0 && /* @__PURE__ */ React.createElement("tr", { className: "bg-amber-50/40" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 text-amber-900" }, "S\xE9jour P2 : ", CONFIG_LITS[typeLit2].nom), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center font-bold" }, j2, " jrs"), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right text-gray-400" }, formatGourdes(CONFIG_LITS[typeLit2].prix)), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right font-bold" }, formatGourdes(totalE2)), /* @__PURE__ */ React.createElement("td", null)), hasChirSpec && nomChirSpec && /* @__PURE__ */ React.createElement("tr", { className: "bg-red-50/20" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 text-red-900" }, "Chirurgie : ", nomChirSpec), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center" }, "1"), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right text-gray-400" }, formatGourdes(totalChirSpec)), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right font-bold" }, formatGourdes(totalChirSpec)), /* @__PURE__ */ React.createElement("td", null)), lignes.map((l) => /* @__PURE__ */ React.createElement("tr", { key: l.id, className: "zebra-row" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 text-gray-800" }, /* @__PURE__ */ React.createElement("span", { className: `text-[8px] font-bold uppercase px-1 rounded mr-1 ${l.type === "med" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}` }, l.type === "med" ? "Pharma" : "Acte"), l.nom), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center font-mono font-bold" }, l.qte), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right text-gray-400" }, formatGourdes(l.prix)), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right font-bold" }, formatGourdes(l.qte * l.prix)), /* @__PURE__ */ React.createElement("td", { className: "text-center" }, peutSupprimerFiche && /* @__PURE__ */ React.createElement("button", { onClick: () => setLignes((p) => p.filter((x) => x.id !== l.id)), className: "text-gray-300 hover:text-red-600" }, /* @__PURE__ */ React.createElement(X, { size: 12 }))))))), /* @__PURE__ */ React.createElement("div", { className: "p-4 bg-gray-50 border-t border-b text-[11px] text-gray-600 font-mono space-y-1 shadow-inner" }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-3 font-bold text-[#1E2A24] border-b pb-1 mb-2" }, /* @__PURE__ */ React.createElement("span", null, "R\xC9CAPITULATIF DE LA FICHE"), /* @__PURE__ */ React.createElement("span", { className: "text-right" }, "Gdes"), /* @__PURE__ */ React.createElement("span", { className: "text-right text-emerald-800" }, "\u{1F4B5} DH")), require_constants().CATEGORIES_LISTE.map((srv) => {
          const m = totalsParService[srv.key];
          if (m === 0) return null;
          return /* @__PURE__ */ React.createElement("div", { key: srv.key, className: "grid grid-cols-3 py-0.5" }, /* @__PURE__ */ React.createElement("span", null, "\u2022 ", srv.label), /* @__PURE__ */ React.createElement("span", { className: "text-right" }, formatGourdes(m)), /* @__PURE__ */ React.createElement("span", { className: "text-right font-bold" }, formatDH(m), " DH"));
        })), /* @__PURE__ */ React.createElement("div", { className: "bg-[#1E2A24] text-white p-4 flex justify-between items-center font-bold text-sm font-mono" }, /* @__PURE__ */ React.createElement("span", null, "SOUS-TOTAL FICHE ", idFicheEnCoursDEdition ? "EN MODIFICATION" : `N\xB0${numeroFicheCourante}`, " :"), /* @__PURE__ */ React.createElement("span", null, formatGourdes(grandTotal), " Gdes (", formatDH(grandTotal), " DH)")), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 border-t border-gray-300 space-y-3" }, /* @__PURE__ */ React.createElement("h4", { className: "font-bold text-gray-700 text-xs uppercase tracking-wider" }, "\u{1F4B5} Encaissement"), totalDepots > 0 && /* @__PURE__ */ React.createElement("div", { className: "bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex justify-between items-center text-xs" }, /* @__PURE__ */ React.createElement("span", { className: "font-bold text-blue-800" }, "\u{1F4B0} D\xE9p\xF4ts d\xE9j\xE0 vers\xE9s : ", formatGourdes(totalDepots), " Gdes"), /* @__PURE__ */ React.createElement("span", { className: "font-bold text-emerald-700" }, "Solde restant \xE0 payer : ", formatGourdes(montantRestantApresDepots), " Gdes")), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2" }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setModePaiement("cash");
          setModeDepot(false);
        }, className: `px-4 py-1.5 rounded-lg text-xs font-bold ${modePaiement === "cash" ? "bg-emerald-700 text-white" : "bg-gray-100"}` }, "\u{1F4B5} Cash"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setModePaiement("credit");
          setModeDepot(false);
        }, className: `px-4 py-1.5 rounded-lg text-xs font-bold ${modePaiement === "credit" ? "bg-orange-600 text-white" : "bg-gray-100"}` }, "\u{1F4DD} Cr\xE9dit"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setModePaiement("ong");
          setModeDepot(false);
        }, className: `px-4 py-1.5 rounded-lg text-xs font-bold ${modePaiement === "ong" ? "bg-purple-700 text-white" : "bg-gray-100"}`, disabled: typePatient !== "ONG" }, "\u{1F3E5} ONG"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setModePaiement("exoneration");
          setModeDepot(false);
        }, className: `px-4 py-1.5 rounded-lg text-xs font-bold ${modePaiement === "exoneration" ? "bg-red-600 text-white" : "bg-gray-100"}`, disabled: userRole !== "direction" && userRole !== "administrateur" && userRole !== "comptable" }, "\u{1F3AF} Exon\xE9ration"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setModeDepot(!modeDepot);
          if (!modeDepot) setModePaiement("depot");
          else setModePaiement("cash");
        }, className: `px-4 py-1.5 rounded-lg text-xs font-bold ${modeDepot ? "bg-blue-700 text-white" : "bg-gray-100"}` }, "\u{1F4B0} D\xE9p\xF4t/Acompte")), modeDepot && /* @__PURE__ */ React.createElement("div", { className: "bg-blue-50 p-3 rounded-lg border border-blue-200 space-y-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("label", { className: "text-xs font-bold text-blue-800" }, "Montant du d\xE9p\xF4t :"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", step: "100", value: montantDepot, onChange: (e) => setMontantDepot(e.target.value), placeholder: "0", className: "border rounded p-1.5 w-32 font-mono" }), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-gray-600" }, "Solde restant apr\xE8s d\xE9p\xF4t : ", formatGourdes(soldeRestantDepot), " Gdes")), /* @__PURE__ */ React.createElement("button", { onClick: enregistrerDepot, disabled: !dossierId, className: "bg-blue-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold" }, "\u{1F4BE} Enregistrer le d\xE9p\xF4t"), /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-gray-500" }, "D\xE9p\xF4ts d\xE9j\xE0 effectu\xE9s : ", formatGourdes(totalDepots), " Gdes")), modePaiement === "ong" && !modeDepot && /* @__PURE__ */ React.createElement("div", { className: "mt-2" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-purple-800" }, "ONG"), /* @__PURE__ */ React.createElement("select", { value: ongPartenaireFiche, onChange: (e) => setOngPartenaireFiche(e.target.value), className: "border rounded-lg p-1.5 text-xs w-full bg-white" }, /* @__PURE__ */ React.createElement("option", { value: "" }, "S\xE9lectionner"), LISTE_ONG.map((o) => /* @__PURE__ */ React.createElement("option", { key: o, value: o }, o)))), modePaiement === "exoneration" && !modeDepot && /* @__PURE__ */ React.createElement("div", { className: "mt-2 space-y-2 bg-red-50 p-2 rounded-lg" }, /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", max: "100", value: pourcentageExoneration, onChange: (e) => setPourcentageExoneration(e.target.value), placeholder: "%", className: "w-20 border rounded-lg p-1.5 text-xs" }), /* @__PURE__ */ React.createElement("input", { type: "text", value: motifExoneration, onChange: (e) => setMotifExoneration(e.target.value), placeholder: "Motif...", className: "flex-1 border rounded-lg p-1.5 text-xs" })), userRole === "direction" || userRole === "administrateur" ? /* @__PURE__ */ React.createElement("label", { className: "flex items-center gap-1 text-xs" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: autorisationExoneration, onChange: (e) => {
          if (!e.target.checked) {
            setAutorisationExoneration(false);
            return;
          }
          setConfirmModal({
            titre: "Autoriser l'exon\xE9ration ?",
            message: `Patient : ${nomPatient}
Motif : ${motifExoneration || "(non pr\xE9cis\xE9)"}
Pourcentage : ${pourcentageExoneration}%`,
            detail: `Montant exon\xE9r\xE9 : ${formatGourdes(grandTotal * (parseFloat(pourcentageExoneration) || 0) / 100)} Gdes`,
            confirmLabel: "Autoriser",
            danger: true,
            onConfirm: () => {
              enregistrerAudit("autorisation_exoneration", {
                nomPatient,
                pourcentage: parseFloat(pourcentageExoneration) || 0,
                montantExonere: grandTotal * (parseFloat(pourcentageExoneration) || 0) / 100,
                motif: motifExoneration
              });
              setAutorisationExoneration(true);
              setConfirmModal(null);
            },
            onCancel: () => setConfirmModal(null)
          });
        } }), " Autoriser") : /* @__PURE__ */ React.createElement("button", { onClick: demanderExoneration, disabled: !pourcentageExoneration || pourcentageExoneration == 0, className: "bg-amber-500 text-white px-3 py-1 rounded text-xs disabled:opacity-30" }, "\u{1F4E8} Demander")), modePaiement === "cash" && !modeDepot && /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-500" }, "Montant vers\xE9"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", value: montantVerse, onChange: (e) => setMontantVerse(e.target.value), placeholder: "0", className: "border rounded-lg p-2 w-full text-sm font-mono", disabled: !peutEncaisser })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-500" }, "Monnaie"), /* @__PURE__ */ React.createElement("div", { className: "bg-gray-100 p-2 rounded-lg text-right font-mono font-bold text-lg text-emerald-700" }, formatGourdes(monnaieARendre), " Gdes"))), !modeDepot && /* @__PURE__ */ React.createElement("button", { onClick: demanderConfirmationEncaissement, disabled: !peutEncaisser || modePaiement === "exoneration" && !(userRole === "direction" || userRole === "administrateur"), className: "w-full bg-emerald-700 hover:bg-emerald-800 text-white py-2.5 rounded-lg text-sm font-bold shadow-md disabled:opacity-50" }, "\u{1F4B3} Encaisser cette fiche"))), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 flex-wrap" }, /* @__PURE__ */ React.createElement("button", { onClick: onViderFicheActive, className: "flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl py-3 text-xs font-bold" }, "\u{1F9F9} Vider l'\xE9cran"), /* @__PURE__ */ React.createElement("button", { onClick: imprimerFicheA4, disabled: !paiementEffectue, className: `flex-1 rounded-xl py-3 text-xs font-bold flex items-center justify-center gap-1 ${paiementEffectue ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"}` }, "\u{1F5A8}\uFE0F A4"), /* @__PURE__ */ React.createElement("button", { onClick: imprimerTicket, disabled: !paiementEffectue, className: `flex-1 rounded-xl py-3 text-xs font-bold flex items-center justify-center gap-1 ${paiementEffectue ? "bg-green-600 hover:bg-green-700 text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"}` }, "\u{1F9FE} Ticket"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
          var _a;
          if (lignes.length === 0 && j1 === 0 && !hasChirSpec) {
            showToast("Fiche vide", "error");
            return;
          }
          const fiche = {
            id: idFicheEnCoursDEdition || "fiche-" + Date.now(),
            numeroFiche: idFicheEnCoursDEdition ? ((_a = fichesDossier.find((f) => f.id === idFicheEnCoursDEdition)) == null ? void 0 : _a.numeroFiche) || numeroFicheCourante : numeroFicheCourante,
            breakdown: { ...totalsParService },
            totalGlobal: grandTotal,
            rawState: { lignesCalcul: [...lignes], dateEntree1, dateSortie1, typeLit1, multiPeriode, dateEntree2, dateSortie2, typeLit2, hasChirSpec, nomChirSpec, prixChirSpec }
          };
          onEnregistrerFiche(fiche);
          showToast(idFicheEnCoursDEdition ? "Fiche mise \xE0 jour" : "Fiche enregistr\xE9e (sans paiement)", "success");
        }, disabled: !peutArchiver, className: "flex-[2] bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl py-3 text-xs font-black shadow-md disabled:opacity-50" }, idFicheEnCoursDEdition ? "\u{1F4BE} Mettre \xE0 jour la Fiche" : `\u{1F4BE} Enregistrer la Fiche N\xB0${numeroFicheCourante} au Dossier`))));
      }
      module.exports = CalculateurPanel;
    }
  });

  // components/AchatExpress.js
  var require_AchatExpress = __commonJS({
    "components/AchatExpress.js"(exports, module) {
      var React = window.React;
      var { useState, useMemo, useRef, useEffect } = React;
      var { chf, toEpisodeApi, toPaiementApi, generateLocalId } = require_supabase();
      var { auth, LOG_MEDS_KEY } = require_firebase();
      var { CATEGORIES_LISTE } = require_constants();
      var { formatGourdes, formatDH, echapperHTML, formaterNomPropre } = require_helpers();
      var { Search, X, Plus } = require_icons();
      function AchatExpress({ medicaments, actes, setMedicaments, userRole, showToast, onFermer, onDossierCree }) {
        const [categorie, setCategorie] = useState("med");
        const [recherche, setRecherche] = useState("");
        const [selection, setSelection] = useState(null);
        const [quantite, setQuantite] = useState("1");
        const [panier, setPanier] = useState([]);
        const [nomClient, setNomClient] = useState("");
        const [montantVerse, setMontantVerse] = useState("");
        const [enCours, setEnCours] = useState(false);
        const [online, setOnline] = useState(navigator.onLine);
        const inputRef = useRef(null);
        useEffect(() => {
          const goOnline = () => setOnline(true);
          const goOffline = () => setOnline(false);
          window.addEventListener("online", goOnline);
          window.addEventListener("offline", goOffline);
          return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
          };
        }, []);
        const catalogueFiltre = categorie === "med" ? medicaments : actes;
        const suggestions = useMemo(() => {
          const q = recherche.trim().toLowerCase();
          if (!q) return catalogueFiltre.slice(0, 6);
          return catalogueFiltre.filter((i) => i.nom.toLowerCase().includes(q)).slice(0, 6);
        }, [recherche, catalogueFiltre]);
        const qte = parseFloat(quantite) || 0;
        const totalPanier = useMemo(() => panier.reduce((s, l) => s + l.qte * l.prix, 0), [panier]);
        const verse = parseFloat(montantVerse) || 0;
        const monnaie = Math.max(0, verse - totalPanier);
        const peutVendre = userRole === "comptable" || userRole === "direction" || userRole === "administrateur";
        const ajouterAuPanier = () => {
          if (!selection) {
            showToast("S\xE9lectionne un article.", "error");
            return;
          }
          if (qte <= 0) {
            showToast("Quantit\xE9 invalide.", "error");
            return;
          }
          if (categorie === "med") {
            const dejaDansPanier = panier.filter((l) => l.itemId === selection.id).reduce((s, l) => s + l.qte, 0);
            if ((selection.quantite || 0) < dejaDansPanier + qte) {
              showToast(`Stock insuffisant (restant : ${selection.quantite || 0}).`, "error");
              return;
            }
          }
          setPanier((prev) => {
            const idx = prev.findIndex((l) => l.itemId === selection.id && l.categorie === categorie);
            if (idx !== -1) return prev.map((l, i) => i === idx ? { ...l, qte: l.qte + qte } : l);
            return [...prev, { itemId: selection.id, categorie, sub: selection.sub || "", nom: selection.nom, qte, prix: selection.prix }];
          });
          setSelection(null);
          setRecherche("");
          setQuantite("1");
          if (inputRef.current) inputRef.current.focus();
        };
        const retirerDuPanier = (idx) => setPanier((prev) => prev.filter((_, i) => i !== idx));
        const imprimerTicketExpress = (nom, lignes, totalVente, verseVal, renduVal) => {
          const contenu = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket CHF - Achat Express</title><style>@page{size:80mm 200mm;margin:3mm 5mm;}body{font-family:'Courier New',monospace;font-size:12px;color:#000;width:70mm;margin:0 auto;}.entete{text-align:center;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:8px;}.entete h1{font-size:18px;margin:4px 0;}.entete p{margin:2px 0;font-size:10px;}table{width:100%;border-collapse:collapse;margin:6px 0;font-size:11px;}th,td{padding:4px;text-align:left;border-bottom:1px dotted #ccc;}.total{font-weight:bold;font-size:15px;text-align:right;border-top:2px solid #000;padding-top:6px;margin-top:6px;}.footer{margin-top:10px;font-size:9px;text-align:center;border-top:1px dashed #ccc;padding-top:6px;}</style></head><body><div class="entete"><h1>CHF</h1><p>Centre Hospitalier de Fontaine</p><p>Achat Express \u2014 Comptoir</p><p>${(/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR")} ${(/* @__PURE__ */ new Date()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p></div><p>Client: ${echapperHTML(nom || "Comptoir")}</p><table><thead><tr><th>Article</th><th>Qt\xE9</th><th>Total</th></tr></thead><tbody>${lignes.map((l) => `<tr><td>${echapperHTML(l.nom)}</td><td>${l.qte}</td><td>${formatGourdes(l.qte * l.prix)}</td></tr>`).join("")}</tbody></table><div class="total">TOTAL : ${formatGourdes(totalVente)} Gdes (${formatDH(totalVente)} DH)</div><p>Vers\xE9: ${formatGourdes(verseVal)} Gdes<br/>Monnaie: ${formatGourdes(renduVal)} Gdes</p><div class="footer">Merci de votre visite !</div></body></html>`;
          const win = window.open("", "_blank", "width=400,height=600");
          if (!win) {
            showToast("Autorisez les pop-ups.", "error");
            return;
          }
          win.document.write(contenu);
          win.document.close();
          win.focus();
          setTimeout(() => win.print(), 400);
        };
        const validerAchat = async () => {
          var _a, _b;
          if (panier.length === 0) {
            showToast("Le panier est vide.", "error");
            return;
          }
          if (!totalPanier || totalPanier <= 0) {
            showToast("Impossible d'encaisser : le total est \xE0 0 Gdes.", "error");
            return;
          }
          if (verse < totalPanier) {
            showToast(`Montant insuffisant. Reste : ${formatGourdes(totalPanier - verse)} Gdes`, "error");
            return;
          }
          setEnCours(true);
          const nomFinal = formaterNomPropre(nomClient) || "Client Comptoir";
          const localId = generateLocalId();
          const breakdown = {};
          CATEGORIES_LISTE.forEach((c) => breakdown[c.key] = 0);
          panier.forEach((l) => {
            const montant = l.qte * l.prix;
            if (l.categorie === "med") breakdown.med += montant;
            else if (l.sub && breakdown[l.sub] !== void 0) breakdown[l.sub] += montant;
            else breakdown.chirurgie += montant;
          });
          const fiche = {
            id: "fiche-" + Date.now(),
            numeroFiche: 1,
            breakdown,
            totalGlobal: totalPanier,
            modePaiement: "cash",
            montantPaye: verse,
            solde: 0,
            dateCreation: (/* @__PURE__ */ new Date()).toISOString(),
            creePar: ((_a = auth.currentUser) == null ? void 0 : _a.displayName) || "inconnu",
            rawState: { lignesCalcul: panier.map((l, i) => ({ id: "l-express-" + i, itemId: l.itemId, type: l.categorie, sub: l.sub, nom: l.nom, qte: l.qte, prix: l.prix })) }
          };
          const episodeData = {
            nomPatient: nomFinal,
            ongPartenaire: "",
            typePatient: "PRIVE",
            numDossier: "",
            dateNaissance: "",
            telephone: "",
            status: "archived",
            timestamp: Date.now(),
            dateHeure: (/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR"),
            totalGlobal: totalPanier,
            fiches: [fiche],
            montantPaye: verse,
            solde: 0
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
                episodeId,
                patientNom: nomFinal,
                montant: totalPanier,
                mode: "cash",
                ongPartenaire: "",
                date: (/* @__PURE__ */ new Date()).toISOString(),
                encaissePar: ((_b = auth.currentUser) == null ? void 0 : _b.displayName) || "inconnu",
                typePatient: "PRIVE"
              }));
            } catch (err) {
              if (!err.isOfflineQueue) throw err;
              horsLigne = true;
            }
            const medsVendus = panier.filter((l) => l.categorie === "med");
            if (medsVendus.length > 0) {
              const updated = medicaments.map((m) => {
                const ligne = medsVendus.find((l) => l.itemId === m.id);
                return ligne ? { ...m, quantite: Math.max(0, (m.quantite || 0) - ligne.qte) } : m;
              });
              setMedicaments(updated);
              localStorage.setItem(LOG_MEDS_KEY, JSON.stringify(updated));
              chf.updateCatalog("medicaments", updated).catch(() => {
              });
            }
            if (horsLigne) showToast("\u{1F4F4} Vente enregistr\xE9e hors ligne \u2014 sera synchronis\xE9e au retour d'internet", "info");
            else showToast(`\u2705 Vente enregistr\xE9e : ${formatGourdes(totalPanier)} Gdes`, "success");
            onDossierCree({ ...episodeData, id: episodeId });
            if (confirm("\u{1F5A8}\uFE0F Imprimer le ticket ?")) imprimerTicketExpress(nomFinal, panier, totalPanier, verse, monnaie);
            setPanier([]);
            setSelection(null);
            setRecherche("");
            setQuantite("1");
            setNomClient("");
            setMontantVerse("");
          } catch (error) {
            showToast("Erreur : " + error.message, "error");
          } finally {
            setEnCours(false);
          }
        };
        if (!peutVendre) return null;
        return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4", onClick: onFermer }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center border-b pb-2" }, /* @__PURE__ */ React.createElement("h3", { className: "font-black text-[#1E2A24]" }, "\u26A1 Achat Express"), /* @__PURE__ */ React.createElement("button", { onClick: onFermer }, /* @__PURE__ */ React.createElement(X, { size: 18 }))), !online && /* @__PURE__ */ React.createElement("div", { className: "bg-red-50 border border-red-300 text-red-700 rounded-lg px-3 py-2 text-[11px] font-bold flex items-center gap-2" }, "\u{1F534} Hors ligne \u2014 la vente sera enregistr\xE9e localement et synchronis\xE9e automatiquement au retour d'internet."), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-gray-500" }, "Vente rapide au comptoir \u2014 ajoute un ou plusieurs articles au panier, puis encaisse."), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 text-xs font-semibold" }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setCategorie("med");
          setSelection(null);
          setRecherche("");
        }, className: `flex-1 py-1.5 border rounded-lg ${categorie === "med" ? "bg-[#1E2A24] text-white" : "bg-gray-50"}` }, "\u{1F48A} Pharmacie"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setCategorie("acte");
          setSelection(null);
          setRecherche("");
        }, className: `flex-1 py-1.5 border rounded-lg ${categorie === "acte" ? "bg-[#1E2A24] text-white" : "bg-gray-50"}` }, "\u{1F52C} Acte")), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("input", { ref: inputRef, type: "text", value: recherche, onChange: (e) => {
          setRecherche(e.target.value);
          setSelection(null);
        }, placeholder: "Rechercher un article...", className: "w-full border rounded-lg p-2 text-xs pl-8 outline-none" }), /* @__PURE__ */ React.createElement("span", { className: "absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" }, /* @__PURE__ */ React.createElement(Search, { size: 14 })), !selection && suggestions.length > 0 && /* @__PURE__ */ React.createElement("ul", { className: "absolute z-10 left-0 right-0 bg-white border rounded-lg shadow-2xl mt-1 text-xs max-h-40 overflow-y-auto divide-y" }, suggestions.map((i) => /* @__PURE__ */ React.createElement("li", { key: i.id }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => {
          setSelection(i);
          setRecherche(i.nom);
        }, className: "w-full text-left px-3 py-2 hover:bg-gray-100 flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, i.nom), /* @__PURE__ */ React.createElement("span", { className: "text-gray-500 font-mono" }, formatGourdes(i.prix), " Gdes")))))), selection && /* @__PURE__ */ React.createElement("div", { className: "bg-gray-50 border rounded-lg p-3 space-y-2 text-xs" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between font-bold" }, /* @__PURE__ */ React.createElement("span", null, selection.nom), /* @__PURE__ */ React.createElement("span", null, formatGourdes(selection.prix), " Gdes / unit\xE9")), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("label", { className: "font-bold text-gray-500" }, "Quantit\xE9 :"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "1", value: quantite, onChange: (e) => setQuantite(e.target.value), className: "w-20 border rounded p-1.5 text-center font-mono" }), /* @__PURE__ */ React.createElement("button", { onClick: ajouterAuPanier, className: "ml-auto bg-[#1E2A24] text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1" }, /* @__PURE__ */ React.createElement(Plus, { size: 12 }), " Ajouter au panier"))), panier.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "bg-white border rounded-lg divide-y" }, /* @__PURE__ */ React.createElement("div", { className: "px-3 py-1.5 bg-gray-50 text-[10px] font-bold uppercase text-gray-500" }, "\u{1F6D2} Panier (", panier.length, " article", panier.length > 1 ? "s" : "", ")"), panier.map((l, idx) => /* @__PURE__ */ React.createElement("div", { key: idx, className: "flex justify-between items-center px-3 py-1.5 text-xs" }, /* @__PURE__ */ React.createElement("span", null, l.nom, " ", /* @__PURE__ */ React.createElement("span", { className: "text-gray-400" }, "\xD7", l.qte)), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "font-mono font-bold" }, formatGourdes(l.qte * l.prix), " Gdes"), /* @__PURE__ */ React.createElement("button", { onClick: () => retirerDuPanier(idx), className: "text-gray-300 hover:text-red-600" }, /* @__PURE__ */ React.createElement(X, { size: 12 }))))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between px-3 py-2 font-black text-sm bg-gray-50" }, /* @__PURE__ */ React.createElement("span", null, "TOTAL"), /* @__PURE__ */ React.createElement("span", null, formatGourdes(totalPanier), " Gdes (", formatDH(totalPanier), " DH)"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-500 uppercase" }, "Nom du client (optionnel)"), /* @__PURE__ */ React.createElement("input", { type: "text", value: nomClient, onChange: (e) => setNomClient(e.target.value), placeholder: "Client comptoir", className: "w-full border rounded-lg p-2 text-xs outline-none" })), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-500 uppercase" }, "Montant vers\xE9"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", value: montantVerse, onChange: (e) => setMontantVerse(e.target.value), placeholder: "0", className: "w-full border rounded-lg p-2 text-sm font-mono" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-500 uppercase" }, "Monnaie"), /* @__PURE__ */ React.createElement("div", { className: "bg-gray-100 p-2 rounded-lg text-right font-mono font-bold text-emerald-700" }, formatGourdes(monnaie), " Gdes"))), /* @__PURE__ */ React.createElement("button", { onClick: validerAchat, disabled: panier.length === 0 || enCours, className: "w-full bg-emerald-700 hover:bg-emerald-800 text-white py-2.5 rounded-lg text-sm font-bold shadow-md disabled:opacity-50" }, enCours ? "Traitement..." : `\u{1F4B3} Encaisser le panier (${formatGourdes(totalPanier)} Gdes)`)));
      }
      module.exports = AchatExpress;
    }
  });

  // components/AccueilPanel.js
  var require_AccueilPanel = __commonJS({
    "components/AccueilPanel.js"(exports, module) {
      var React = window.React;
      var { useState, useEffect, useMemo } = React;
      var { chf } = require_supabase();
      var { formatGourdes } = require_helpers();
      function AccueilPanel({ verifications, paiements, medicaments, userRole, userDisplayName, onNaviguer, onOuvrirAchatExpress }) {
        const [enAttente, setEnAttente] = useState(0);
        useEffect(() => {
          const interval = setInterval(() => setEnAttente(chf.countPending()), 2e3);
          return () => clearInterval(interval);
        }, []);
        const resume = useMemo(() => {
          const today = /* @__PURE__ */ new Date();
          const estAujourdhui = (dateHeureFr) => {
            if (!dateHeureFr) return false;
            const [j, m, a] = dateHeureFr.split("/").map(Number);
            return j === today.getDate() && m === today.getMonth() + 1 && a === today.getFullYear();
          };
          const dossiersActifs = verifications.filter((v) => (v.status || "archived") === "actif").length;
          const dossiersSuspendus = verifications.filter((v) => v.status === "suspendu").length;
          const caJour = paiements.filter((p) => p.date && new Date(p.date).toDateString() === today.toDateString()).reduce((s, p) => s + (p.montant || 0), 0);
          const consultationsJour = verifications.filter((v) => estAujourdhui(v.dateHeure)).length;
          return { dossiersActifs, dossiersSuspendus, caJour, consultationsJour };
        }, [verifications, paiements]);
        const stockCritique = useMemo(() => medicaments.filter((m) => (m.quantite || 0) <= (m.seuilAlerte || 5)), [medicaments]);
        const peutVendre = userRole === "comptable" || userRole === "direction" || userRole === "administrateur";
        const peutGererStock = userRole === "administrateur" || userRole === "direction";
        return /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-[#1E2A24] text-white p-4 rounded-xl shadow-sm" }, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] uppercase tracking-widest text-[#9FB8A8]" }, "Bienvenue"), /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-black" }, userDisplayName), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-[#9FB8A8]" }, (/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-black text-gray-500 uppercase mb-2" }, "Raccourcis"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2" }, /* @__PURE__ */ React.createElement("button", { onClick: () => onNaviguer("calcul"), className: "bg-white border rounded-xl p-3 text-center shadow-sm hover:shadow-md transition" }, /* @__PURE__ */ React.createElement("div", { className: "text-xl" }, "\u{1F195}"), /* @__PURE__ */ React.createElement("div", { className: "text-[10px] font-bold mt-1" }, "Nouveau Dossier")), peutVendre && /* @__PURE__ */ React.createElement("button", { onClick: onOuvrirAchatExpress, className: "bg-white border rounded-xl p-3 text-center shadow-sm hover:shadow-md transition" }, /* @__PURE__ */ React.createElement("div", { className: "text-xl" }, "\u26A1"), /* @__PURE__ */ React.createElement("div", { className: "text-[10px] font-bold mt-1" }, "Achat Express")), /* @__PURE__ */ React.createElement("button", { onClick: () => onNaviguer("verifie"), className: "bg-white border rounded-xl p-3 text-center shadow-sm hover:shadow-md transition" }, /* @__PURE__ */ React.createElement("div", { className: "text-xl" }, "\u{1F4C1}"), /* @__PURE__ */ React.createElement("div", { className: "text-[10px] font-bold mt-1" }, "Archives")), peutGererStock && /* @__PURE__ */ React.createElement("button", { onClick: () => onNaviguer("stock"), className: "bg-white border rounded-xl p-3 text-center shadow-sm hover:shadow-md transition" }, /* @__PURE__ */ React.createElement("div", { className: "text-xl" }, "\u{1F4E6}"), /* @__PURE__ */ React.createElement("div", { className: "text-[10px] font-bold mt-1" }, "Stock")))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-black text-gray-500 uppercase mb-2" }, "R\xE9sum\xE9 du jour"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "CA aujourd'hui"), /* @__PURE__ */ React.createElement("p", { className: "text-lg font-black text-emerald-700" }, formatGourdes(resume.caJour), " Gdes")), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Consultations"), /* @__PURE__ */ React.createElement("p", { className: "text-lg font-black text-purple-600" }, resume.consultationsJour)), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Dossiers actifs"), /* @__PURE__ */ React.createElement("p", { className: "text-lg font-black text-blue-600" }, resume.dossiersActifs)), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Suspendus"), /* @__PURE__ */ React.createElement("p", { className: "text-lg font-black text-amber-600" }, resume.dossiersSuspendus)))), (stockCritique.length > 0 || enAttente > 0) && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-black text-gray-500 uppercase mb-2" }, "Alertes"), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, stockCritique.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "bg-red-50 border border-red-200 rounded-xl p-3 flex justify-between items-center text-xs" }, /* @__PURE__ */ React.createElement("span", { className: "font-bold text-red-700" }, "\u26A0\uFE0F ", stockCritique.length, " article(s) en stock critique"), peutGererStock && /* @__PURE__ */ React.createElement("button", { onClick: () => onNaviguer("stock"), className: "text-red-700 underline font-bold" }, "Voir")), enAttente > 0 && /* @__PURE__ */ React.createElement("div", { className: "bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs" }, /* @__PURE__ */ React.createElement("span", { className: "font-bold text-amber-700" }, "\u23F3 ", enAttente, " op\xE9ration(s) en attente de synchronisation")))));
      }
      module.exports = AccueilPanel;
    }
  });

  // components/AnalyticsPanel.js
  var require_AnalyticsPanel = __commonJS({
    "components/AnalyticsPanel.js"(exports, module) {
      var React = window.React;
      var { useState, useEffect, useMemo, useRef } = React;
      var { formatGourdes, formatDH } = require_helpers();
      var COULEURS_SERVICE = {
        "Urgences": "#dc2626",
        "P\xE9diatrie": "#059669",
        "G\xE9n\xE9ral": "#6b7280",
        "Chirurgie": "#7c3aed",
        "Maternit\xE9": "#db2777",
        "N\xE9onatologie": "#2563eb",
        "Non class\xE9": "#9ca3af"
      };
      var ACTIVITES = [
        { key: "admissions", label: "Admissions", couleur: "#1E2A24", portee: "dossier" },
        { key: "sono", label: "Sonographies", couleur: "#7c3aed", portee: "acte", match: (l) => l.sub === "sono" },
        { key: "ecg", label: "ECG", couleur: "#0891b2", portee: "acte", match: (l) => l.sub === "ecg" },
        { key: "cesarienne", label: "C\xE9sariennes", couleur: "#db2777", portee: "acte", match: (l) => l.sub === "cesarienne" },
        { key: "accouchement", label: "Accouchements", couleur: "#ea580c", portee: "acte", match: (l) => l.sub === "accouchement" },
        { key: "chirurgie", label: "Chirurgie", couleur: "#dc2626", portee: "acte", match: (l) => l.sub === "chirurgie" },
        { key: "pediatrie", label: "P\xE9diatrie", couleur: "#059669", portee: "service", service: "P\xE9diatrie" },
        { key: "neonat", label: "N\xE9onatologie", couleur: "#2563eb", portee: "service", service: "N\xE9onatologie" }
      ];
      function parseDateDossier(dateHeureFr) {
        if (!dateHeureFr) return null;
        const [j, m, a] = dateHeureFr.split("/").map(Number);
        if (!j || !m || !a) return null;
        const d = new Date(a, m - 1, j);
        return isNaN(d) ? null : d;
      }
      function dateEffectiveFiche(dossier, fiche) {
        if (fiche.dateCreation) {
          const d = new Date(fiche.dateCreation);
          if (!isNaN(d)) return d;
        }
        return parseDateDossier(dossier.dateHeure);
      }
      function dansPeriode(date, debut, fin) {
        if (!date) return false;
        if (debut && date < debut) return false;
        if (fin) {
          const finJour = new Date(fin);
          finJour.setHours(23, 59, 59, 999);
          if (date > finJour) return false;
        }
        return true;
      }
      function numeroSemaineISO(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const jourSemaine = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - jourSemaine);
        const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil(((d - debutAnnee) / 864e5 + 1) / 7);
      }
      function cleDePeriode(date, periode) {
        if (periode === "annuel") return `${date.getFullYear()}`;
        if (periode === "hebdo") return `${date.getFullYear()}-S${String(numeroSemaineISO(date)).padStart(2, "0")}`;
        if (periode === "quotidien") return date.toISOString().slice(0, 10);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      }
      function classifierService(dossier) {
        var _a;
        if (dossier.serviceChoisi) return dossier.serviceChoisi;
        const estNeonat = (dossier.fiches || []).some((f) => {
          const r = f.rawState || {};
          return r.typeLit1 === "isolette" || r.typeLit1 === "incubateur" || r.typeLit2 === "isolette" || r.typeLit2 === "incubateur";
        });
        if (estNeonat) return "N\xE9onatologie";
        const totalMaternite = (dossier.fiches || []).reduce((s, f) => {
          var _a2, _b;
          return s + (((_a2 = f.breakdown) == null ? void 0 : _a2.accouchement) || 0) + (((_b = f.breakdown) == null ? void 0 : _b.cesarienne) || 0);
        }, 0);
        if (totalMaternite > 0) return "Maternit\xE9";
        const NOMS_CONSULTATION = [
          { motCle: "consultation urgence", service: "Urgences" },
          { motCle: "consultation p\xE9diatre", service: "P\xE9diatrie" },
          { motCle: "consultation g\xE9n\xE9rale", service: "G\xE9n\xE9ral" },
          { motCle: "consultation chirurgie", service: "Chirurgie" }
        ];
        for (const fiche of dossier.fiches || []) {
          const lignes = ((_a = fiche.rawState) == null ? void 0 : _a.lignesCalcul) || [];
          for (const ligne of lignes) {
            const nomBas = (ligne.nom || "").toLowerCase();
            const trouve = NOMS_CONSULTATION.find((nc) => nomBas.includes(nc.motCle));
            if (trouve) return trouve.service;
          }
        }
        return "Non class\xE9";
      }
      function AnalyticsPanel({ verifications }) {
        const [filtreDateDebut, setFiltreDateDebut] = useState(() => {
          const d = /* @__PURE__ */ new Date();
          d.setMonth(d.getMonth() - 6);
          return d.toISOString().slice(0, 10);
        });
        const [filtreDateFin, setFiltreDateFin] = useState(() => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
        const [periode, setPeriode] = useState("mensuel");
        const [activiteSelectionnee, setActiviteSelectionnee] = useState("toutes");
        const [sousOnglet, setSousOnglet] = useState("activites");
        const chartRef = useRef(null);
        const chartInstance = useRef(null);
        const dossiersFiltres = useMemo(() => {
          const debut = filtreDateDebut ? new Date(filtreDateDebut) : null;
          const fin = filtreDateFin ? new Date(filtreDateFin) : null;
          return (verifications || []).filter((v) => dansPeriode(parseDateDossier(v.dateHeure), debut, fin));
        }, [verifications, filtreDateDebut, filtreDateFin]);
        const serviceParDossier = useMemo(() => {
          const map = /* @__PURE__ */ new Map();
          dossiersFiltres.forEach((v) => map.set(v.id, classifierService(v)));
          return map;
        }, [dossiersFiltres]);
        const donneesActivites = useMemo(() => {
          const debut = filtreDateDebut ? new Date(filtreDateDebut) : null;
          const fin = filtreDateFin ? new Date(filtreDateFin) : null;
          const activitesAffichees = activiteSelectionnee === "toutes" ? ACTIVITES : ACTIVITES.filter((a) => a.key === activiteSelectionnee);
          const compteurs = {};
          activitesAffichees.forEach((a) => compteurs[a.key] = {});
          const clesPeriodesVues = /* @__PURE__ */ new Set();
          dossiersFiltres.forEach((v) => {
            const dateDossier = parseDateDossier(v.dateHeure);
            const cleP = dateDossier ? cleDePeriode(dateDossier, periode) : null;
            if (cleP) clesPeriodesVues.add(cleP);
            activitesAffichees.forEach((act) => {
              if (act.portee === "dossier" && cleP) {
                compteurs[act.key][cleP] = (compteurs[act.key][cleP] || 0) + 1;
              }
              if (act.portee === "service" && cleP && serviceParDossier.get(v.id) === act.service) {
                compteurs[act.key][cleP] = (compteurs[act.key][cleP] || 0) + 1;
              }
            });
            if (activitesAffichees.some((a) => a.portee === "acte")) {
              (v.fiches || []).forEach((f) => {
                var _a;
                const dFiche = dateEffectiveFiche(v, f);
                if (!dansPeriode(dFiche, debut, fin)) return;
                const cleFiche = cleDePeriode(dFiche, periode);
                clesPeriodesVues.add(cleFiche);
                const lignes = ((_a = f.rawState) == null ? void 0 : _a.lignesCalcul) || [];
                activitesAffichees.filter((a) => a.portee === "acte").forEach((act) => {
                  const qte = lignes.filter(act.match).reduce((s, l) => s + (l.qte || 1), 0);
                  if (qte > 0) compteurs[act.key][cleFiche] = (compteurs[act.key][cleFiche] || 0) + qte;
                });
              });
            }
          });
          const clesTriees = Array.from(clesPeriodesVues).sort();
          const series = activitesAffichees.map((act) => ({
            label: act.label,
            couleur: act.couleur,
            data: clesTriees.map((c) => compteurs[act.key][c] || 0)
          }));
          return { labels: clesTriees, series };
        }, [dossiersFiltres, activiteSelectionnee, periode, serviceParDossier, filtreDateDebut, filtreDateFin]);
        const kpiActivites = useMemo(() => {
          const total = dossiersFiltres.length;
          const actifs = dossiersFiltres.filter((v) => (v.status || "archived") === "actif").length;
          const revenu = dossiersFiltres.reduce((s, v) => s + (v.totalGlobal || 0), 0);
          const uniques = new Set(dossiersFiltres.map((v) => (v.nomPatient || "").trim().toLowerCase())).size;
          return { total, actifs, revenu, uniques };
        }, [dossiersFiltres]);
        const donneesRevenus = useMemo(() => {
          const services = Object.keys(COULEURS_SERVICE);
          const revenuParService = {};
          const patientsParService = {};
          services.forEach((s) => {
            revenuParService[s] = 0;
            patientsParService[s] = /* @__PURE__ */ new Set();
          });
          dossiersFiltres.forEach((v) => {
            const s = serviceParDossier.get(v.id) || "Non class\xE9";
            revenuParService[s] += v.totalGlobal || 0;
            patientsParService[s].add((v.nomPatient || "").trim().toLowerCase());
          });
          const totalGeneral = services.reduce((s, srv) => s + revenuParService[srv], 0);
          return services.map((s) => ({
            service: s,
            revenu: revenuParService[s],
            patients: patientsParService[s].size,
            pourcentage: totalGeneral > 0 ? revenuParService[s] / totalGeneral * 100 : 0
          })).filter((r) => r.revenu > 0 || r.patients > 0);
        }, [dossiersFiltres, serviceParDossier]);
        const totalRevenuGeneral = useMemo(() => donneesRevenus.reduce((s, r) => s + r.revenu, 0), [donneesRevenus]);
        const donneesOccupation = useMemo(() => {
          const debut = filtreDateDebut ? new Date(filtreDateDebut) : new Date((/* @__PURE__ */ new Date()).setMonth((/* @__PURE__ */ new Date()).getMonth() - 1));
          const fin = filtreDateFin ? new Date(filtreDateFin) : /* @__PURE__ */ new Date();
          const services = ["Urgences", "Maternit\xE9", "N\xE9onatologie", "P\xE9diatrie"];
          const deltas = {};
          services.forEach((s) => deltas[s] = {});
          const ajouterDelta = (service, dateEntreeStr, dateSortieStr) => {
            if (!dateEntreeStr || !dateSortieStr) return;
            const dE = new Date(dateEntreeStr), dS = new Date(dateSortieStr);
            if (isNaN(dE) || isNaN(dS)) return;
            const cleE = dE.toISOString().slice(0, 10);
            const dApres = new Date(dS);
            dApres.setDate(dApres.getDate() + 1);
            const cleS = dApres.toISOString().slice(0, 10);
            deltas[service][cleE] = (deltas[service][cleE] || 0) + 1;
            deltas[service][cleS] = (deltas[service][cleS] || 0) - 1;
          };
          dossiersFiltres.forEach((v) => {
            const service = serviceParDossier.get(v.id);
            if (!services.includes(service)) return;
            (v.fiches || []).forEach((f) => {
              const r = f.rawState || {};
              if (r.dateEntree1 && r.dateSortie1) ajouterDelta(service, r.dateEntree1, r.dateSortie1);
              if (r.multiPeriode && r.dateEntree2 && r.dateSortie2) ajouterDelta(service, r.dateEntree2, r.dateSortie2);
            });
          });
          const jours = [];
          for (let d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) jours.push(d.toISOString().slice(0, 10));
          const series = services.map((s) => {
            let cumul = 0;
            const data = jours.map((j) => {
              cumul += deltas[s][j] || 0;
              return Math.max(0, cumul);
            });
            return { label: s, couleur: COULEURS_SERVICE[s], data };
          });
          return { labels: jours, series };
        }, [dossiersFiltres, serviceParDossier, filtreDateDebut, filtreDateFin]);
        const donneesRepartition = useMemo(() => {
          const patientsParService = {};
          dossiersFiltres.forEach((v) => {
            const s = serviceParDossier.get(v.id) || "Non class\xE9";
            if (!patientsParService[s]) patientsParService[s] = /* @__PURE__ */ new Set();
            patientsParService[s].add((v.nomPatient || "").trim().toLowerCase());
          });
          const total = Object.values(patientsParService).reduce((s, set) => s + set.size, 0);
          return Object.entries(patientsParService).map(([service, set]) => ({
            service,
            count: set.size,
            pourcentage: total > 0 ? set.size / total * 100 : 0
          })).filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
        }, [dossiersFiltres, serviceParDossier]);
        useEffect(() => {
          if (!chartRef.current || !window.Chart) return;
          if (chartInstance.current) {
            chartInstance.current.destroy();
            chartInstance.current = null;
          }
          const ctx = chartRef.current.getContext("2d");
          let config = null;
          if (sousOnglet === "activites") {
            config = { type: "line", data: { labels: donneesActivites.labels, datasets: donneesActivites.series.map((s) => ({ label: s.label, data: s.data, borderColor: s.couleur, backgroundColor: s.couleur, tension: 0.3, fill: false })) }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } } } } };
          } else if (sousOnglet === "revenus") {
            config = { type: "bar", data: { labels: donneesRevenus.map((r) => r.service), datasets: [
              { type: "bar", label: "Revenu (Gdes)", data: donneesRevenus.map((r) => r.revenu), backgroundColor: donneesRevenus.map((r) => COULEURS_SERVICE[r.service] || "#999"), yAxisID: "y" },
              { type: "line", label: "Patients uniques", data: donneesRevenus.map((r) => r.patients), borderColor: "#f59e0b", backgroundColor: "#f59e0b", yAxisID: "y1", tension: 0.3 }
            ] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { position: "left", title: { display: true, text: "Gdes" } }, y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Patients" } } }, plugins: { legend: { position: "bottom" } } } };
          } else if (sousOnglet === "occupation") {
            config = { type: "line", data: { labels: donneesOccupation.labels, datasets: donneesOccupation.series.map((s) => ({ label: s.label, data: s.data, borderColor: s.couleur, backgroundColor: s.couleur, tension: 0.2, fill: false, pointRadius: 0 })) }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { x: { ticks: { maxTicksLimit: 10 } } } } };
          } else if (sousOnglet === "repartition") {
            config = { type: "pie", data: { labels: donneesRepartition.map((r) => r.service), datasets: [{ data: donneesRepartition.map((r) => r.count), backgroundColor: donneesRepartition.map((r) => COULEURS_SERVICE[r.service] || "#999") }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } } };
          }
          if (config) chartInstance.current = new window.Chart(ctx, config);
          return () => {
            if (chartInstance.current) {
              chartInstance.current.destroy();
              chartInstance.current = null;
            }
          };
        }, [sousOnglet, donneesActivites, donneesRevenus, donneesOccupation, donneesRepartition]);
        const SOUS_ONGLETS = [
          { key: "activites", label: "\u{1F4CA} Activit\xE9s" },
          { key: "revenus", label: "\u{1F4B0} Revenus" },
          { key: "occupation", label: "\u{1F3E5} Occupation" },
          { key: "repartition", label: "\u{1F464} R\xE9partition" }
        ];
        return /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3 rounded-xl border shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-400 uppercase" }, "Date d\xE9but"), /* @__PURE__ */ React.createElement("input", { type: "date", value: filtreDateDebut, onChange: (e) => setFiltreDateDebut(e.target.value), className: "border rounded p-1.5 w-full" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-400 uppercase" }, "Date fin"), /* @__PURE__ */ React.createElement("input", { type: "date", value: filtreDateFin, onChange: (e) => setFiltreDateFin(e.target.value), className: "border rounded p-1.5 w-full" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-400 uppercase" }, "P\xE9riode"), /* @__PURE__ */ React.createElement("select", { value: periode, onChange: (e) => setPeriode(e.target.value), className: "border rounded p-1.5 w-full bg-white" }, /* @__PURE__ */ React.createElement("option", { value: "annuel" }, "Annuel"), /* @__PURE__ */ React.createElement("option", { value: "mensuel" }, "Mensuel"), /* @__PURE__ */ React.createElement("option", { value: "hebdo" }, "Hebdomadaire"), /* @__PURE__ */ React.createElement("option", { value: "quotidien" }, "Quotidien"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-gray-400 uppercase" }, "Activit\xE9"), /* @__PURE__ */ React.createElement("select", { value: activiteSelectionnee, onChange: (e) => setActiviteSelectionnee(e.target.value), className: "border rounded p-1.5 w-full bg-white" }, /* @__PURE__ */ React.createElement("option", { value: "toutes" }, "Toutes"), ACTIVITES.map((a) => /* @__PURE__ */ React.createElement("option", { key: a.key, value: a.key }, a.label))))), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 border-b pb-2 flex-wrap" }, SOUS_ONGLETS.map((so) => /* @__PURE__ */ React.createElement("button", { key: so.key, onClick: () => setSousOnglet(so.key), className: `px-4 py-2 font-bold text-xs rounded-t-lg ${sousOnglet === so.key ? "bg-[#1E2A24] text-white" : "bg-gray-100"}` }, so.label))), sousOnglet === "activites" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Total dossiers"), /* @__PURE__ */ React.createElement("p", { className: "text-lg font-black" }, kpiActivites.total)), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Patients actifs"), /* @__PURE__ */ React.createElement("p", { className: "text-lg font-black text-blue-600" }, kpiActivites.actifs)), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Revenu total"), /* @__PURE__ */ React.createElement("p", { className: "text-lg font-black text-emerald-700" }, formatGourdes(kpiActivites.revenu), " Gdes")), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Patients uniques"), /* @__PURE__ */ React.createElement("p", { className: "text-lg font-black text-purple-600" }, kpiActivites.uniques))), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm", style: { height: 340 } }, /* @__PURE__ */ React.createElement("canvas", { ref: chartRef })), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-gray-500 bg-gray-50 border rounded-lg p-3" }, "Il montre l'\xE9volution des admissions et des actes dans le temps. Vous pouvez voir les tendances et identifier les p\xE9riodes de forte activit\xE9.")), sousOnglet === "revenus" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, "Total revenu"), /* @__PURE__ */ React.createElement("p", { className: "text-lg font-black text-emerald-700" }, formatGourdes(totalRevenuGeneral), " Gdes")), ["Urgences", "Maternit\xE9", "N\xE9onatologie"].map((s) => {
          const r = donneesRevenus.find((x) => x.service === s);
          return /* @__PURE__ */ React.createElement("div", { key: s, className: "bg-white p-3 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-gray-400" }, s), /* @__PURE__ */ React.createElement("p", { className: "text-lg font-black", style: { color: COULEURS_SERVICE[s] } }, formatGourdes((r == null ? void 0 : r.revenu) || 0), " Gdes"));
        })), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm", style: { height: 340 } }, /* @__PURE__ */ React.createElement("canvas", { ref: chartRef })), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm overflow-x-auto" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-xs text-left" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-gray-100 text-[10px] text-gray-500 uppercase border-b" }, /* @__PURE__ */ React.createElement("th", { className: "p-2" }, "Service"), /* @__PURE__ */ React.createElement("th", { className: "p-2 text-right" }, "Revenu"), /* @__PURE__ */ React.createElement("th", { className: "p-2 text-right" }, "% du total"), /* @__PURE__ */ React.createElement("th", { className: "p-2 text-right" }, "Patients uniques"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y" }, donneesRevenus.map((r) => /* @__PURE__ */ React.createElement("tr", { key: r.service }, /* @__PURE__ */ React.createElement("td", { className: "p-2 font-bold", style: { color: COULEURS_SERVICE[r.service] } }, r.service), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-right font-mono" }, formatGourdes(r.revenu), " Gdes"), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-right" }, r.pourcentage.toFixed(1), "%"), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-right" }, r.patients)))))), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-gray-500 bg-gray-50 border rounded-lg p-3" }, "Il montre le revenu g\xE9n\xE9r\xE9 par chaque service. La courbe orange repr\xE9sente le nombre de patients uniques. Permet d'identifier les services les plus rentables.")), sousOnglet === "occupation" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3" }, donneesOccupation.series.map((s) => /* @__PURE__ */ React.createElement("div", { key: s.label, className: "bg-white p-3 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold", style: { color: s.couleur } }, s.label), /* @__PURE__ */ React.createElement("p", { className: "text-lg font-black" }, s.data.length ? Math.max(...s.data) : 0, " ", /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-normal text-gray-400" }, "pic"))))), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm", style: { height: 340 } }, /* @__PURE__ */ React.createElement("canvas", { ref: chartRef })), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-gray-500 bg-gray-50 border rounded-lg p-3" }, "Il montre le nombre de patients pr\xE9sents chaque jour dans chaque service en se basant sur les dates d'entr\xE9e et de sortie. Permet d'anticiper les besoins en lits et en personnel. (Note : Urgences/P\xE9diatrie n'ont g\xE9n\xE9ralement pas de lit associ\xE9 dans les donn\xE9es \u2014 ces courbes resteront proches de 0 sauf s\xE9jour avec h\xE9bergement factur\xE9.)")), sousOnglet === "repartition" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3" }, donneesRepartition.map((r) => /* @__PURE__ */ React.createElement("div", { key: r.service, className: "bg-white p-3 rounded-xl border shadow-sm text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold", style: { color: COULEURS_SERVICE[r.service] } }, r.service), /* @__PURE__ */ React.createElement("p", { className: "text-lg font-black" }, r.count, " ", /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-normal text-gray-400" }, "(", r.pourcentage.toFixed(0), "%)"))))), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-4 rounded-xl border shadow-sm", style: { height: 340 } }, /* @__PURE__ */ React.createElement("canvas", { ref: chartRef })), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-gray-500 bg-gray-50 border rounded-lg p-3" }, "Il visualise la r\xE9partition des patients uniques entre les services. Donne une vue d'ensemble de l'activit\xE9 de l'h\xF4pital.")));
      }
      module.exports = AnalyticsPanel;
    }
  });

  // app/AppHospitaliere.js
  var require_AppHospitaliere = __commonJS({
    "app/AppHospitaliere.js"(exports, module) {
      var React = window.React;
      var ReactDOM = window.ReactDOM;
      var { useState, useEffect, useMemo } = React;
      var { chf, toEpisodeApi, fromEpisodeApi, generateLocalId, fromPaiementApi } = require_supabase();
      var { firebase: firebase2, auth, db, LOG_TARGETS_KEY, LOG_DOSSIER_BROUILLON_KEY, enregistrerAudit } = require_firebase();
      var { CONFIG_LITS, CATEGORIES_LISTE } = require_constants();
      var { MEDICAMENTS_PAR_DEFAUT, ACTES_PAR_DEFAUT } = require_defaultCatalog();
      var { formatGourdes, formatDH, formaterNomPropre } = require_helpers();
      var { chiffrerTexte, dechiffrerTexte } = require_crypto();
      var { ArrowUp, ArrowDown } = require_icons();
      var ToastManager = require_Toast();
      var ConnectionStatus = require_ConnectionStatus();
      var StockAlertBadge = require_StockAlertBadge();
      var ConfirmModal = require_ConfirmModal();
      var LoginScreen = require_Login();
      var GrilleEditionPanel = require_GrilleEdition();
      var GestionStockPanel = require_GestionStock();
      var GestionUtilisateursPanel = require_GestionUtilisateurs();
      var DemandesPanel = require_Demandes();
      var DashboardDirectionPanel = require_DashboardDirection();
      var DashboardCaissePanel = require_DashboardCaisse();
      var HistoriqueVerifPanel = require_ArchivesPanel();
      var Simulateur = require_Simulateur();
      var CalculateurPanel = require_CalculateurPanel();
      var AchatExpress = require_AchatExpress();
      var AccueilPanel = require_AccueilPanel();
      var AnalyticsPanel = require_AnalyticsPanel();
      function AppHospitaliere({ onQuitter, userRole, userDisplayName, userEmail }) {
        const [onglet, setOnglet] = useState("accueil");
        const [medicaments, setMedicaments] = useState([]);
        const [actes, setActes] = useState([]);
        const [verifications, setVerifications] = useState([]);
        const [paiements, setPaiements] = useState([]);
        const [chargement, setChargement] = useState(true);
        const [ongTargets, setOngTargets] = useState({ "MSF-H": 0, "MSF-F": 0, "ALIMA": 0, "AVSI": 0, "GRID MISSION": 0, "WAY TO HEALTH": 0, "TEAM TASSY": 0 });
        const [dossierActif, setDossierActif] = useState(false);
        const [nomPatient, setNomPatient] = useState("");
        const [selectedOng, setSelectedOng] = useState("");
        const [typePatient, setTypePatient] = useState("ONG");
        const [numDossierPatient, setNumDossierPatient] = useState("");
        const [dateNaissance, setDateNaissance] = useState("");
        const [telephone, setTelephone] = useState("");
        const [fichesDossier, setFichesDossier] = useState([]);
        const [idFicheEnCoursDEdition, setIdFicheEnCoursDEdition] = useState(null);
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
        const [nomChirSpec, setNomChirSpec] = useState("");
        const [prixChirSpec, setPrixChirSpec] = useState("");
        const [filtreArchivesInitialNom, setFiltreArchivesInitialNom] = useState("");
        const [dossierPourExport, setDossierPourExport] = useState(null);
        const [needsBackupWarning, setNeedsBackupWarning] = useState(false);
        const [modeSimulation, setModeSimulation] = useState(false);
        const [dossierId, setDossierId] = useState(null);
        const [dossierUpdatedAtOuverture, setDossierUpdatedAtOuverture] = useState(null);
        const [paiementEffectue, setPaiementEffectue] = useState(false);
        const [achatExpressOuvert, setAchatExpressOuvert] = useState(false);
        const [confirmModal, setConfirmModal] = useState(null);
        const [toasts, setToasts] = useState([]);
        const showToast = (message, type = "info") => {
          const id = Date.now() + Math.random();
          setToasts((prev) => [...prev, { id, message, type }]);
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
          }, 4e3);
        };
        const removeToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));
        const lowStockItems = useMemo(() => medicaments.filter((m) => (m.quantite || 0) <= (m.seuilAlerte || 5)), [medicaments]);
        useEffect(() => {
          const loadData = async () => {
            try {
              console.log("\u{1F504} Chargement des donn\xE9es...");
              const [episodesData, paiementsData, medsData, actesData] = await Promise.all([
                chf.getEpisodes(),
                chf.getPaiements(),
                chf.getCatalog("medicaments"),
                chf.getCatalog("actes")
              ]);
              const episodesCamel = (episodesData || []).map((ep) => fromEpisodeApi(ep));
              setVerifications(episodesCamel);
              setPaiements((paiementsData || []).map((p) => fromPaiementApi(p)));
              setMedicaments(medsData || []);
              setActes(actesData || []);
              console.log("\u2705 Donn\xE9es charg\xE9es");
            } catch (e) {
              console.error("\u274C Erreur chargement:", e);
              try {
                const { LOG_MEDS_KEY, LOG_ACTES_KEY } = require_firebase();
                const meds = JSON.parse(localStorage.getItem(LOG_MEDS_KEY) || "[]");
                const actesLocal = JSON.parse(localStorage.getItem(LOG_ACTES_KEY) || "[]");
                setMedicaments(meds);
                setActes(actesLocal);
                if (e.message.includes("Failed to fetch") || e.message.includes("NetworkError")) {
                  showToast("\u26A0\uFE0F Le backend est injoignable. V\xE9rifie que Render est actif.", "error");
                } else {
                  showToast("Erreur de chargement : " + e.message, "error");
                }
              } catch (_) {
              }
            } finally {
              setChargement(false);
            }
          };
          loadData();
          const interval = setInterval(() => {
            if (!document.hidden) loadData();
          }, 45e3);
          return () => clearInterval(interval);
        }, []);
        useEffect(() => {
          localStorage.setItem(LOG_TARGETS_KEY, JSON.stringify(ongTargets));
        }, [ongTargets]);
        useEffect(() => {
          if (!chargement) {
            const brouillon = {
              dossierActif,
              nomPatient,
              selectedOng,
              typePatient,
              numDossierPatient,
              dateNaissance,
              telephone,
              fichesDossier,
              modePreValidation,
              lignesCalcul,
              dateEntree1,
              dateSortie1,
              typeLit1,
              multiPeriode,
              dateEntree2,
              dateSortie2,
              typeLit2,
              hasChirSpec,
              nomChirSpec,
              prixChirSpec,
              idFicheEnCoursDEdition,
              dossierId,
              paiementEffectue
            };
            localStorage.setItem(LOG_DOSSIER_BROUILLON_KEY, JSON.stringify(brouillon));
          }
        }, [
          dossierActif,
          nomPatient,
          selectedOng,
          typePatient,
          numDossierPatient,
          dateNaissance,
          telephone,
          fichesDossier,
          modePreValidation,
          lignesCalcul,
          dateEntree1,
          dateSortie1,
          typeLit1,
          multiPeriode,
          dateEntree2,
          dateSortie2,
          typeLit2,
          hasChirSpec,
          nomChirSpec,
          prixChirSpec,
          idFicheEnCoursDEdition,
          dossierId,
          paiementEffectue,
          chargement
        ]);
        useEffect(() => {
          const onSynced = (e) => {
            const { localId, realId } = e.detail || {};
            if (!localId || !realId) return;
            setVerifications((prev) => prev.map((v) => v.id === localId ? { ...v, id: realId } : v));
            setDossierId((prev) => prev === localId ? realId : prev);
            showToast("\u2705 Un dossier hors ligne a \xE9t\xE9 synchronis\xE9", "success");
          };
          window.addEventListener("chf:synced", onSynced);
          return () => window.removeEventListener("chf:synced", onSynced);
        }, []);
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
        };
        const editerFiche = (idFiche) => {
          const fiche = fichesDossier.find((f) => f.id === idFiche);
          if (!fiche) {
            showToast("Fiche introuvable.", "error");
            return;
          }
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
          showToast(`\xC9dition de la fiche N\xB0${fiche.numeroFiche}`, "info");
        };
        const enregistrerFicheModifiee = (nouvelleFiche) => {
          setFichesDossier((prev) => prev.map((f) => f.id === nouvelleFiche.id ? nouvelleFiche : f));
          viderLeCalculateurFicheUniquement();
          showToast("Fiche mise \xE0 jour", "success");
        };
        const enregistrerNouvelleFiche = (fiche) => {
          if (idFicheEnCoursDEdition) {
            enregistrerFicheModifiee({ ...fiche, id: idFicheEnCoursDEdition });
          } else {
            setFichesDossier((prev) => [...prev, fiche]);
            viderLeCalculateurFicheUniquement();
            showToast("Fiche enregistr\xE9e", "success");
          }
        };
        const initialiserNouveauDossier = async (nom, ong, numDossier, type, naissance, tel, serviceChoisi) => {
          const propreNom = formaterNomPropre(nom);
          if (!propreNom || !ong && type === "ONG") {
            showToast("Veuillez remplir tous les champs.", "error");
            return;
          }
          const episodeData = {
            nomPatient: propreNom,
            ongPartenaire: type === "ONG" ? ong : "",
            typePatient: type,
            numDossier: numDossier || "",
            dateNaissance: naissance || "",
            telephone: tel || "",
            serviceChoisi: serviceChoisi || "",
            status: "actif",
            timestamp: Date.now(),
            dateHeure: (/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR"),
            totalGlobal: 0,
            fiches: [],
            montantPaye: 0,
            solde: 0
          };
          const apiData = toEpisodeApi(episodeData);
          const localId = generateLocalId();
          let idFinal;
          try {
            const newEpisode = await chf.createEpisode(apiData, localId);
            idFinal = newEpisode.id;
          } catch (error) {
            if (!error.isOfflineQueue) {
              showToast("Erreur cr\xE9ation dossier: " + error.message, "error");
              return;
            }
            idFinal = localId;
            setVerifications((prev) => [{ ...episodeData, id: localId }, ...prev]);
            showToast(`\u{1F4F4} Dossier de ${propreNom} ouvert hors ligne \u2014 sera synchronis\xE9 au retour d'internet`, "info");
          }
          setDossierId(idFinal);
          setNomPatient(propreNom);
          setSelectedOng(type === "ONG" ? ong : "");
          setTypePatient(type);
          setNumDossierPatient(numDossier || "");
          setDateNaissance(naissance || "");
          setTelephone(tel || "");
          sessionStorage.setItem("numDossierPatient", numDossier || "Non renseign\xE9");
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
          sessionStorage.setItem("numDossierPatient", patientDoc.numDossier || "");
          setFichesDossier(patientDoc.fiches || []);
          setDossierActif(true);
          setModePreValidation(false);
          viderLeCalculateurFicheUniquement();
          setIdFicheEnCoursDEdition(null);
          setLignesCalcul([]);
          setPaiementEffectue(false);
          setOnglet("calcul");
          showToast(`Dossier de ${patientDoc.nomPatient} charg\xE9`, "success");
        };
        const declencherPreValidationDossier = () => {
          const activeEstVide = lignesCalcul.length === 0 && j1 === 0 && !hasChirSpec;
          const proceder = (fichesFinales) => {
            if (fichesFinales.length === 0) {
              showToast("Dossier vide.", "error");
              return;
            }
            setModePreValidation(true);
          };
          if (activeEstVide) {
            proceder(fichesDossier);
            return;
          }
          setConfirmModal({
            titre: "Fiche en cours d\xE9tect\xE9e",
            message: "Tu as une fiche en cours de saisie qui n'a pas encore \xE9t\xE9 ajout\xE9e au dossier.",
            detail: `${formatGourdes(grandTotalGlobalFiche)} Gdes`,
            confirmLabel: "Oui, l'ajouter",
            cancelLabel: "Non, continuer sans",
            onConfirm: () => {
              setConfirmModal(null);
              const fiche = { id: "fiche-" + Date.now(), numeroFiche: numeroFicheCourante, breakdown: { ...totalsParService }, totalGlobal: grandTotalGlobalFiche, contientErreurs: false, rawState: { lignesCalcul: [...lignesCalcul], dateEntree1, dateSortie1, typeLit1, multiPeriode, dateEntree2, dateSortie2, typeLit2, hasChirSpec, nomChirSpec, prixChirSpec } };
              const fichesFinales = [...fichesDossier, fiche];
              setFichesDossier(fichesFinales);
              viderLeCalculateurFicheUniquement();
              proceder(fichesFinales);
            },
            onCancel: () => {
              setConfirmModal(null);
              proceder(fichesDossier);
            }
          });
        };
        const executerArchivage = async () => {
          const somme = fichesDossier.reduce((s, f) => s + f.totalGlobal, 0);
          const datesTrouvees = [];
          fichesDossier.forEach((f) => {
            var _a, _b, _c;
            if ((_a = f.rawState) == null ? void 0 : _a.dateEntree1) datesTrouvees.push({ in: f.rawState.dateEntree1, out: f.rawState.dateSortie1 });
            if (((_b = f.rawState) == null ? void 0 : _b.multiPeriode) && ((_c = f.rawState) == null ? void 0 : _c.dateEntree2)) datesTrouvees.push({ in: f.rawState.dateEntree2, out: f.rawState.dateSortie2 });
          });
          let sejourTexte = "\u2014";
          if (datesTrouvees.length > 0) sejourTexte = datesTrouvees.map((d) => `du ${d.in.split("-").reverse().slice(0, 2).join("/")} au ${d.out.split("-").reverse().slice(0, 2).join("/")}`).join(" et ");
          const dossierArchiver = {
            nomPatient,
            ongPartenaire: selectedOng,
            typePatient,
            numDossier: numDossierPatient,
            dateNaissance,
            telephone,
            dateHeure: (/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR"),
            periodeSejourString: sejourTexte,
            dateEntreePourTri: datesTrouvees.length > 0 ? datesTrouvees[0].in : "9999-12-31",
            totalGlobal: somme,
            totalSaisiePapierDH: 0,
            contientErreurs: false,
            verrouilleFacture: false,
            fiches: [...fichesDossier],
            status: "archived",
            timestamp: Date.now()
          };
          try {
            const apiData = toEpisodeApi(dossierArchiver);
            if (dossierId) {
              await chf.updateEpisode(dossierId, apiData);
              const updated = verifications.map((v) => v.id === dossierId ? { ...v, ...dossierArchiver } : v);
              setVerifications(updated);
            } else {
              const newEpisode = await chf.createEpisode(apiData);
              setVerifications((prev) => [fromEpisodeApi(newEpisode), ...prev]);
            }
            setDossierActif(false);
            setNomPatient("");
            setSelectedOng("");
            setNumDossierPatient("");
            sessionStorage.removeItem("numDossierPatient");
            setFichesDossier([]);
            setModePreValidation(false);
            viderLeCalculateurFicheUniquement();
            setDossierId(null);
            localStorage.removeItem(LOG_DOSSIER_BROUILLON_KEY);
            showToast("Dossier archiv\xE9 !", "success");
          } catch (error) {
            if (!error.isOfflineQueue) {
              showToast("Erreur archivage: " + error.message, "error");
              return;
            }
            const updated = verifications.map((v) => v.id === dossierId ? { ...v, ...dossierArchiver } : v);
            setVerifications(updated);
            setDossierActif(false);
            setNomPatient("");
            setSelectedOng("");
            setNumDossierPatient("");
            sessionStorage.removeItem("numDossierPatient");
            setFichesDossier([]);
            setModePreValidation(false);
            viderLeCalculateurFicheUniquement();
            setDossierId(null);
            localStorage.removeItem(LOG_DOSSIER_BROUILLON_KEY);
            showToast("\u{1F4F4} Dossier archiv\xE9 hors ligne \u2014 sera synchronis\xE9 au retour d'internet", "info");
          }
        };
        const verifierConflit = async () => {
          if (!dossierId || !dossierUpdatedAtOuverture) return false;
          try {
            const episodes = await chf.getEpisodes();
            const actuel = episodes.map((ep) => fromEpisodeApi(ep)).find((ep) => ep.id === dossierId);
            if (actuel && actuel.updatedAt && actuel.updatedAt !== dossierUpdatedAtOuverture) return true;
          } catch (e) {
          }
          return false;
        };
        const finaliserEtArchiverDossierOfficiel = async () => {
          const somme = fichesDossier.reduce((s, f) => s + f.totalGlobal, 0);
          const demanderConfirmation = () => setConfirmModal({
            titre: "Archiver ce dossier ?",
            message: `Patient : ${nomPatient}
${fichesDossier.length} fiche(s) \u2014 le dossier sera cl\xF4tur\xE9 et archiv\xE9.`,
            detail: `${formatGourdes(somme)} Gdes  (${formatDH(somme)} DH)`,
            confirmLabel: "\u{1F7E2} Archiver",
            onConfirm: () => {
              setConfirmModal(null);
              executerArchivage();
            },
            onCancel: () => setConfirmModal(null)
          });
          if (await verifierConflit()) {
            setConfirmModal({
              titre: "\u26A0\uFE0F Ce dossier a \xE9t\xE9 modifi\xE9 entre-temps",
              message: "Une autre personne (ou un autre appareil) a modifi\xE9 ce dossier depuis que tu l'as ouvert ici. Continuer risque d'\xE9craser ses changements.",
              confirmLabel: "Continuer quand m\xEAme",
              danger: true,
              onConfirm: () => {
                setConfirmModal(null);
                demanderConfirmation();
              },
              onCancel: () => setConfirmModal(null)
            });
            return;
          }
          demanderConfirmation();
        };
        const executerSuspension = async () => {
          const somme = fichesDossier.reduce((s, f) => s + f.totalGlobal, 0);
          const datesTrouvees = [];
          fichesDossier.forEach((f) => {
            var _a, _b, _c;
            if ((_a = f.rawState) == null ? void 0 : _a.dateEntree1) datesTrouvees.push({ in: f.rawState.dateEntree1, out: f.rawState.dateSortie1 });
            if (((_b = f.rawState) == null ? void 0 : _b.multiPeriode) && ((_c = f.rawState) == null ? void 0 : _c.dateEntree2)) datesTrouvees.push({ in: f.rawState.dateEntree2, out: f.rawState.dateSortie2 });
          });
          let sejourTexte = "\u2014";
          if (datesTrouvees.length > 0) sejourTexte = datesTrouvees.map((d) => `du ${d.in.split("-").reverse().slice(0, 2).join("/")} au ${d.out.split("-").reverse().slice(0, 2).join("/")}`).join(" et ");
          const dossierSuspendu = {
            nomPatient,
            ongPartenaire: selectedOng,
            typePatient,
            numDossier: numDossierPatient,
            dateNaissance,
            telephone,
            dateHeure: (/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR"),
            periodeSejourString: sejourTexte,
            dateEntreePourTri: datesTrouvees.length > 0 ? datesTrouvees[0].in : "9999-12-31",
            totalGlobal: somme,
            totalSaisiePapierDH: 0,
            contientErreurs: false,
            verrouilleFacture: false,
            fiches: [...fichesDossier],
            // ⬅️ CONSERVE LES FICHES
            status: "suspendu",
            dateSuspension: (/* @__PURE__ */ new Date()).toISOString(),
            timestamp: Date.now()
          };
          try {
            await chf.updateEpisode(dossierId, toEpisodeApi(dossierSuspendu));
            const updatedItems = verifications.map((v) => v.id === dossierId ? { ...v, ...dossierSuspendu } : v);
            setVerifications(updatedItems);
            showToast(`Dossier suspendu avec ${fichesDossier.length} fiche(s)`, "success");
          } catch (error) {
            if (!error.isOfflineQueue) {
              showToast("Erreur suspension: " + error.message, "error");
              return;
            }
            const updatedItems = verifications.map((v) => v.id === dossierId ? { ...v, ...dossierSuspendu } : v);
            setVerifications(updatedItems);
            showToast("\u{1F4F4} Dossier suspendu hors ligne \u2014 sera synchronis\xE9 au retour d'internet", "info");
          }
          setDossierActif(false);
          setNomPatient("");
          setSelectedOng("");
          setNumDossierPatient("");
          sessionStorage.removeItem("numDossierPatient");
          setFichesDossier([]);
          setModePreValidation(false);
          viderLeCalculateurFicheUniquement();
          setDossierId(null);
          localStorage.removeItem(LOG_DOSSIER_BROUILLON_KEY);
        };
        const suspendreDossier = async () => {
          if (!dossierId) {
            showToast("Aucun dossier actif.", "error");
            return;
          }
          const demanderConfirmation = () => setConfirmModal({
            titre: "Suspendre ce dossier ?",
            message: `Le dossier de ${nomPatient} sera mis en pause. Il pourra \xEAtre rouvert plus tard depuis les Archives.`,
            confirmLabel: "\u23F8\uFE0F Suspendre",
            onConfirm: () => {
              setConfirmModal(null);
              executerSuspension();
            },
            onCancel: () => setConfirmModal(null)
          });
          if (await verifierConflit()) {
            setConfirmModal({
              titre: "\u26A0\uFE0F Ce dossier a \xE9t\xE9 modifi\xE9 entre-temps",
              message: "Une autre personne (ou un autre appareil) a modifi\xE9 ce dossier depuis que tu l'as ouvert ici. Continuer risque d'\xE9craser ses changements.",
              confirmLabel: "Continuer quand m\xEAme",
              danger: true,
              onConfirm: () => {
                setConfirmModal(null);
                demanderConfirmation();
              },
              onCancel: () => setConfirmModal(null)
            });
            return;
          }
          demanderConfirmation();
        };
        const executerAnnulation = async () => {
          enregistrerAudit("annulation_dossier", { dossierId, nomPatient, ongPartenaire: selectedOng, nombreFiches: fichesDossier.length });
          restituerStock(fichesDossier);
          try {
            await chf.deleteEpisode(dossierId);
            showToast("Dossier annul\xE9.", "success");
          } catch (error) {
            if (!error.isOfflineQueue) {
              showToast("Erreur suppression: " + error.message, "error");
              return;
            }
            if (String(dossierId).startsWith("local-")) chf.removePendingByLocalId(dossierId);
            showToast("\u{1F4F4} Dossier annul\xE9 hors ligne", "info");
          }
          setDossierActif(false);
          setNomPatient("");
          setSelectedOng("");
          setNumDossierPatient("");
          sessionStorage.removeItem("numDossierPatient");
          setFichesDossier([]);
          setModePreValidation(false);
          viderLeCalculateurFicheUniquement();
          setDossierId(null);
          localStorage.removeItem(LOG_DOSSIER_BROUILLON_KEY);
          setVerifications((prev) => prev.filter((v) => v.id !== dossierId));
        };
        const annulerDossier = () => {
          if (!dossierId) {
            showToast("Aucun dossier actif.", "error");
            return;
          }
          setConfirmModal({
            titre: "Annuler ce dossier ?",
            message: `Le dossier de ${nomPatient} et toutes ses fiches (${fichesDossier.length}) seront d\xE9finitivement supprim\xE9s. Cette action est irr\xE9versible.`,
            confirmLabel: "\u{1F5D1}\uFE0F Annuler le dossier",
            danger: true,
            onConfirm: () => {
              setConfirmModal(null);
              executerAnnulation();
            },
            onCancel: () => setConfirmModal(null)
          });
        };
        const r\u00E9importerDossierDepuisArchives = (doc) => chargerDossierExistant(doc);
        const supprimerDossierArchive = (id) => {
          const dossier = verifications.find((v) => v.id === id);
          setConfirmModal({
            titre: "Supprimer d\xE9finitivement ce dossier ?",
            message: `${dossier ? `Patient : ${dossier.nomPatient}
` : ""}Cette action est irr\xE9versible \u2014 le dossier et son historique de facturation seront perdus pour de bon.`,
            confirmLabel: "\u{1F5D1}\uFE0F Supprimer d\xE9finitivement",
            danger: true,
            onConfirm: async () => {
              setConfirmModal(null);
              enregistrerAudit("suppression_archive", { dossierId: id, nomPatient: (dossier == null ? void 0 : dossier.nomPatient) || null, totalGlobal: (dossier == null ? void 0 : dossier.totalGlobal) || null });
              try {
                await chf.deleteEpisode(id);
                const updated = await chf.getEpisodes();
                setVerifications(updated.map((ep) => fromEpisodeApi(ep)));
                showToast("Dossier supprim\xE9", "success");
              } catch (e) {
                showToast("Erreur suppression: " + e.message, "error");
              }
            },
            onCancel: () => setConfirmModal(null)
          });
        };
        const executerSauvegardeGlobaleJSON = async () => {
          const motDePasse = prompt("\u{1F512} Choisis une phrase secr\xE8te pour prot\xE9ger ce fichier de sauvegarde.\n\nGarde-la pr\xE9cieusement : sans elle, le fichier ne pourra plus \xEAtre relu (par toi ou par quiconque le trouverait).");
          if (!motDePasse || motDePasse.length < 6) {
            showToast("Sauvegarde annul\xE9e (phrase secr\xE8te requise, 6 caract\xE8res minimum).", "error");
            return;
          }
          const backup = { verifications, ongTargets, medicaments, actes, paiements };
          const payload = await chiffrerTexte(JSON.stringify(backup), motDePasse);
          const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = `Backup_Total_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.chf.json`;
          link.click();
          localStorage.setItem("chf-last-backup-timestamp", Date.now().toString());
          setNeedsBackupWarning(false);
          enregistrerAudit("export_sauvegarde", { nombreDossiers: verifications.length, nombrePaiements: paiements.length });
          showToast("Sauvegarde chiffr\xE9e effectu\xE9e !", "success");
        };
        const executerRestaurationGlobaleJSON = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async (evt) => {
            var _a;
            try {
              const brut = JSON.parse(evt.target.result);
              let res;
              if (brut && brut.chfChiffre) {
                const motDePasse = prompt("\u{1F512} Ce fichier est chiffr\xE9. Entre la phrase secr\xE8te utilis\xE9e \xE0 la sauvegarde :");
                if (!motDePasse) {
                  showToast("Restauration annul\xE9e.", "error");
                  return;
                }
                try {
                  const texteClair = await dechiffrerTexte(brut, motDePasse);
                  res = JSON.parse(texteClair);
                } catch (err) {
                  showToast("Phrase secr\xE8te incorrecte ou fichier corrompu.", "error");
                  return;
                }
              } else {
                res = brut;
              }
              if (res.ongTargets) setOngTargets(res.ongTargets);
              if (res.medicaments) setMedicaments(res.medicaments);
              if (res.actes) setActes(res.actes);
              if (res.verifications) {
                for (let d of res.verifications) {
                  await chf.createEpisode(toEpisodeApi(d));
                }
                const episodes = await chf.getEpisodes();
                setVerifications(episodes.map((ep) => fromEpisodeApi(ep)));
              }
              enregistrerAudit("restauration_sauvegarde", { nombreDossiers: ((_a = res.verifications) == null ? void 0 : _a.length) || 0 });
              showToast("Base restaur\xE9e !", "success");
            } catch (err) {
              showToast("Fichier invalide.", "error");
            }
          };
          reader.readAsText(file);
        };
        const injecterLigneAuCalculateur = (item, cat, qte) => {
          setLignesCalcul((prev) => {
            const index = prev.findIndex((l) => l.itemId === item.id && l.type === cat);
            if (index !== -1) return prev.map((l, idx) => idx === index ? { ...l, qte: l.qte + qte } : l);
            return [...prev, { id: "l-" + Math.random().toString(36).slice(2, 6), itemId: item.id, type: cat, sub: item.sub || "", nom: item.nom, qte, prix: item.prix }];
          });
          setPaiementEffectue(false);
        };
        const j1 = useMemo(() => {
          if (!dateEntree1 || !dateSortie1) return 0;
          const d = (new Date(dateSortie1) - new Date(dateEntree1)) / 864e5;
          if (d < 0) {
            setDateSortie1("");
            return 0;
          }
          return d === 0 ? 1 : Math.floor(d);
        }, [dateEntree1, dateSortie1]);
        const totalE1 = j1 * CONFIG_LITS[typeLit1].prix;
        const j2 = useMemo(() => {
          if (!multiPeriode || !dateEntree2 || !dateSortie2) return 0;
          const d = (new Date(dateSortie2) - new Date(dateEntree2)) / 864e5;
          return d <= 0 ? 1 : Math.floor(d);
        }, [multiPeriode, dateEntree2, dateSortie2]);
        const totalE2 = multiPeriode ? j2 * CONFIG_LITS[typeLit2].prix : 0;
        const totalGeneralExeat = totalE1 + totalE2;
        const totalChirSpec = useMemo(() => {
          const p = parseFloat(prixChirSpec);
          return isNaN(p) ? 0 : p;
        }, [hasChirSpec, prixChirSpec]);
        const totalsParService = useMemo(() => {
          const v = {};
          CATEGORIES_LISTE.forEach((c) => v[c.key] = 0);
          v.hospit = totalGeneralExeat;
          v.chirurgie = totalChirSpec;
          lignesCalcul.forEach((l) => {
            const m = l.qte * l.prix;
            if (l.type === "med") v.med += m;
            else if (l.type === "acte") {
              if (v[l.sub] !== void 0) v[l.sub] += m;
              else v.chirurgie += m;
            }
          });
          return v;
        }, [lignesCalcul, totalGeneralExeat, totalChirSpec]);
        const grandTotalGlobalFiche = useMemo(() => Object.values(totalsParService).reduce((a, b) => a + b, 0), [totalsParService]);
        const totalDossierGourdes = useMemo(() => fichesDossier.reduce((s, f) => s + f.totalGlobal, 0), [fichesDossier]);
        const cumulCategoriesDossierActif = useMemo(() => {
          const b = {};
          CATEGORIES_LISTE.forEach((c) => b[c.key] = 0);
          fichesDossier.forEach((f) => {
            Object.keys(f.breakdown).forEach((k) => {
              if (b[k] !== void 0) b[k] += f.breakdown[k];
            });
          });
          return b;
        }, [fichesDossier]);
        const numeroFicheCourante = useMemo(() => fichesDossier.length > 0 ? Math.max(...fichesDossier.map((f) => f.numeroFiche), 0) + 1 : 1, [fichesDossier]);
        const restituerStock = async (fiches) => {
          const aRestituer = {};
          (fiches || []).forEach((f) => {
            var _a;
            (((_a = f.rawState) == null ? void 0 : _a.lignesCalcul) || []).forEach((l) => {
              if (l.type === "med") aRestituer[l.itemId] = (aRestituer[l.itemId] || 0) + (l.qte || 0);
            });
          });
          if (Object.keys(aRestituer).length === 0) return;
          const updated = medicaments.map((m) => aRestituer[m.id] ? { ...m, quantite: (m.quantite || 0) + aRestituer[m.id] } : m);
          setMedicaments(updated);
          const { LOG_MEDS_KEY } = require_firebase();
          localStorage.setItem(LOG_MEDS_KEY, JSON.stringify(updated));
          try {
            await chf.updateCatalog("medicaments", updated);
          } catch (e) {
            console.warn("Erreur restitution stock:", e);
          }
        };
        const supprimerFicheDossier = (idF) => {
          if (confirm("Supprimer cette fiche ?")) {
            const fiche = fichesDossier.find((f) => f.id === idF);
            setFichesDossier((prev) => prev.filter((f) => f.id !== idF));
            if (fiche) restituerStock([fiche]);
            showToast("Fiche supprim\xE9e \u2014 stock remis \xE0 jour", "success");
          }
        };
        const changerTypeOngPourDossier = async (idCible, nouveauType, nouvelOng) => {
          if (nouveauType === "ONG" && !nouvelOng) {
            showToast("S\xE9lectionne une ONG.", "error");
            return;
          }
          if (idCible === dossierId) {
            setTypePatient(nouveauType);
            setSelectedOng(nouveauType === "ONG" ? nouvelOng : "");
          }
          setVerifications((prev) => prev.map((v) => v.id === idCible ? { ...v, typePatient: nouveauType, ongPartenaire: nouveauType === "ONG" ? nouvelOng : "" } : v));
          try {
            await chf.updateEpisode(idCible, toEpisodeApi({ typePatient: nouveauType, ongPartenaire: nouveauType === "ONG" ? nouvelOng : "" }));
            enregistrerAudit("changement_type_ong", { dossierId: idCible, nouveauType, nouvelOng });
            showToast("Type de patient mis \xE0 jour", "success");
          } catch (error) {
            if (error.isOfflineQueue) showToast("\u{1F4F4} Changement enregistr\xE9 hors ligne", "info");
            else showToast("Erreur: " + error.message, "error");
          }
        };
        const changerTypeOng = (nouveauType, nouvelOng) => changerTypeOngPourDossier(dossierId, nouveauType, nouvelOng);
        useEffect(() => {
          const handleKeyDown = (e) => {
            if (!dossierActif || modePreValidation) return;
            if (e.ctrlKey && e.shiftKey && e.key === "Enter") {
              e.preventDefault();
              declencherPreValidationDossier();
            }
          };
          window.addEventListener("keydown", handleKeyDown);
          return () => window.removeEventListener("keydown", handleKeyDown);
        }, [dossierActif, modePreValidation]);
        useEffect(() => {
          const warningQuitter = (e) => {
            if (dossierActif) {
              e.preventDefault();
              e.returnValue = "Dossier en cours.";
            }
          };
          window.addEventListener("beforeunload", warningQuitter);
          return () => window.removeEventListener("beforeunload", warningQuitter);
        }, [dossierActif]);
        useEffect(() => {
          const LIMITE_INACTIVITE_MS = 15 * 60 * 1e3;
          let minuteur;
          const reinitialiserMinuteur = () => {
            clearTimeout(minuteur);
            minuteur = setTimeout(() => {
              showToast("\u{1F512} D\xE9connexion automatique apr\xE8s 15 minutes d'inactivit\xE9", "info");
              onQuitter();
            }, LIMITE_INACTIVITE_MS);
          };
          const evenementsActivite = ["mousedown", "keydown", "touchstart", "scroll"];
          evenementsActivite.forEach((ev) => window.addEventListener(ev, reinitialiserMinuteur));
          reinitialiserMinuteur();
          return () => {
            clearTimeout(minuteur);
            evenementsActivite.forEach((ev) => window.removeEventListener(ev, reinitialiserMinuteur));
          };
        }, []);
        if (chargement) return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen flex items-center justify-center" }, "Chargement...");
        return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen w-full flex flex-col font-sans text-[#1E2A24]" }, /* @__PURE__ */ React.createElement(ToastManager, { toasts, removeToast }), /* @__PURE__ */ React.createElement(ConnectionStatus, null), /* @__PURE__ */ React.createElement(StockAlertBadge, { items: lowStockItems }), confirmModal && /* @__PURE__ */ React.createElement(ConfirmModal, { ...confirmModal }), achatExpressOuvert && /* @__PURE__ */ React.createElement(
          AchatExpress,
          {
            medicaments,
            actes,
            setMedicaments,
            userRole,
            showToast,
            onFermer: () => setAchatExpressOuvert(false),
            onDossierCree: (episode) => setVerifications((prev) => [episode, ...prev])
          }
        ), dossierActif && !modePreValidation && /* @__PURE__ */ React.createElement("div", { className: "fixed top-28 right-4 z-40 bg-[#1E2A24] text-white px-4 py-2 rounded-xl shadow-2xl border border-emerald-500/30 flex flex-col items-end" }, /* @__PURE__ */ React.createElement("span", { className: "text-[9px] uppercase tracking-wider text-[#9FB8A8] font-bold" }, "Dossier ", nomPatient), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-mono font-black" }, formatGourdes(totalDossierGourdes + grandTotalGlobalFiche), " Gdes"), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-mono text-emerald-400" }, formatDH(totalDossierGourdes + grandTotalGlobalFiche), " DH")), /* @__PURE__ */ React.createElement("div", { className: "fixed bottom-6 right-6 z-50 flex flex-col gap-2" }, /* @__PURE__ */ React.createElement("button", { onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }), className: "floating-btn p-3 bg-[#1E2A24] text-[#F7F5F0] rounded-full shadow-lg" }, /* @__PURE__ */ React.createElement(ArrowUp, { size: 18 })), /* @__PURE__ */ React.createElement("button", { onClick: () => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), className: "floating-btn p-3 bg-[#1E2A24] text-[#F7F5F0] rounded-full shadow-lg" }, /* @__PURE__ */ React.createElement(ArrowDown, { size: 18 }))), /* @__PURE__ */ React.createElement("header", { className: "border-b border-[#D8D2C2] bg-[#1E2A24] text-[#F7F5F0] p-4" }, /* @__PURE__ */ React.createElement("div", { className: "max-w-3xl mx-auto flex justify-between items-baseline mb-2" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] uppercase tracking-widest text-[#9FB8A8]" }, "Centre Hospitalier de Fontaine"), /* @__PURE__ */ React.createElement("h1", { className: "text-xl font-bold tracking-tight" }, "CHF \u2014 Syst\xE8me Hospitalier")), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 text-[10px] font-mono items-center flex-wrap" }, /* @__PURE__ */ React.createElement("span", { className: "bg-blue-600 text-white px-2 py-1 rounded-full" }, userDisplayName, " (", userRole, ")"), (userRole === "comptable" || userRole === "direction" || userRole === "administrateur") && /* @__PURE__ */ React.createElement("button", { onClick: () => setAchatExpressOuvert(true), className: "bg-amber-500 hover:bg-amber-600 px-2 py-1 rounded font-bold" }, "\u26A1 Express"), /* @__PURE__ */ React.createElement("button", { onClick: () => setModeSimulation(!modeSimulation), className: `px-2 py-1 rounded text-xs font-bold ${modeSimulation ? "bg-emerald-600" : "bg-blue-600"}` }, modeSimulation ? "\u{1F9EE} Simulation" : "\u{1F9EE} Simu"), /* @__PURE__ */ React.createElement("button", { onClick: executerSauvegardeGlobaleJSON, className: `px-2 py-1 rounded relative ${needsBackupWarning ? "bg-red-600 animate-pulse" : "bg-gray-700"}` }, "\u{1F4E5} Backup ", needsBackupWarning && /* @__PURE__ */ React.createElement("span", { className: "absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full animate-ping" })), /* @__PURE__ */ React.createElement("label", { className: "bg-gray-700 px-2 py-1 rounded cursor-pointer" }, "\u{1F4E4} Restore ", /* @__PURE__ */ React.createElement("input", { type: "file", onChange: executerRestaurationGlobaleJSON, className: "hidden", accept: ".json" })), /* @__PURE__ */ React.createElement("span", { className: "bg-purple-600 px-2 py-1 rounded-full" }, verifications.length, " Archiv\xE9s"), /* @__PURE__ */ React.createElement("button", { onClick: onQuitter, className: "bg-red-900/80 px-2 py-1 rounded" }, "Quitter"))), /* @__PURE__ */ React.createElement("div", { className: "max-w-3xl mx-auto flex flex-wrap gap-2 text-xs mt-3" }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setOnglet("accueil");
          setModePreValidation(false);
        }, className: `px-4 py-2 font-medium border-b-2 ${onglet === "accueil" ? "border-white text-white" : "text-[#9FB8A8]"}` }, "\u{1F3DB}\uFE0F Accueil"), /* @__PURE__ */ React.createElement("button", { onClick: () => setOnglet("calcul"), className: `px-4 py-2 font-medium border-b-2 ${onglet === "calcul" ? "border-white text-white" : "text-[#9FB8A8]"}` }, "Calcul Facture"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setOnglet("verifie");
          setModePreValidation(false);
        }, className: `px-4 py-2 font-medium border-b-2 ${onglet === "verifie" ? "border-white text-white" : "text-[#9FB8A8]"}` }, "\u{1F4C1} Archives"), (userRole === "administrateur" || userRole === "direction") && /* @__PURE__ */ React.createElement("button", { onClick: () => {
          setOnglet("analyse");
          setModePreValidation(false);
        }, className: `px-4 py-2 font-medium border-b-2 ${onglet === "analyse" ? "border-white text-white" : "text-[#9FB8A8]"}` }, "\u{1F4CA} Pilotage CHF"), (userRole === "administrateur" || userRole === "direction") && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { onClick: () => setOnglet("meds"), className: `px-4 py-2 font-medium border-b-2 ${onglet === "meds" ? "border-white text-white" : "text-[#9FB8A8]"}` }, "Tarifs Pharma"), /* @__PURE__ */ React.createElement("button", { onClick: () => setOnglet("actes"), className: `px-4 py-2 font-medium border-b-2 ${onglet === "actes" ? "border-white text-white" : "text-[#9FB8A8]"}` }, "Tarifs Actes"), /* @__PURE__ */ React.createElement("button", { onClick: () => setOnglet("stock"), className: `px-4 py-2 font-medium border-b-2 ${onglet === "stock" ? "border-white text-white" : "text-[#9FB8A8]"}` }, "\u{1F4E6} Stock")), userRole === "administrateur" && /* @__PURE__ */ React.createElement("button", { onClick: () => setOnglet("users"), className: `px-4 py-2 font-medium border-b-2 ${onglet === "users" ? "border-white text-white" : "text-[#9FB8A8]"}` }, "\u{1F465} Utilisateurs"), (userRole === "direction" || userRole === "administrateur") && /* @__PURE__ */ React.createElement("button", { onClick: () => setOnglet("dashboard_direction"), className: `px-4 py-2 font-medium border-b-2 ${onglet === "dashboard_direction" ? "border-white text-white" : "text-[#9FB8A8]"}` }, "\u{1F4CA} Direction"), (userRole === "comptable" || userRole === "direction" || userRole === "administrateur") && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { onClick: () => setOnglet("dashboard_caisse"), className: `px-4 py-2 font-medium border-b-2 ${onglet === "dashboard_caisse" ? "border-white text-white" : "text-[#9FB8A8]"}` }, "\u{1F4B5} Caisse"), /* @__PURE__ */ React.createElement("button", { onClick: () => setOnglet("demandes"), className: `px-4 py-2 font-medium border-b-2 ${onglet === "demandes" ? "border-white text-white" : "text-[#9FB8A8]"}` }, "\u{1F4E8} Demandes")))), /* @__PURE__ */ React.createElement("main", { className: "flex-1 max-w-3xl w-full mx-auto p-4 pb-24" }, onglet === "accueil" && /* @__PURE__ */ React.createElement(
          AccueilPanel,
          {
            verifications,
            paiements,
            medicaments,
            userRole,
            userDisplayName,
            onNaviguer: (cible) => {
              setOnglet(cible);
              setModePreValidation(false);
            },
            onOuvrirAchatExpress: () => setAchatExpressOuvert(true)
          }
        ), onglet === "dashboard_direction" && (userRole === "direction" || userRole === "administrateur") && /* @__PURE__ */ React.createElement(DashboardDirectionPanel, { verifications, paiements, medicaments }), onglet === "dashboard_caisse" && (userRole === "comptable" || userRole === "direction" || userRole === "administrateur") && /* @__PURE__ */ React.createElement(DashboardCaissePanel, { verifications, paiements, userDisplayName }), onglet === "calcul" && modePreValidation && /* @__PURE__ */ React.createElement("div", { className: "bg-white p-6 rounded-xl border border-emerald-400 shadow-xl space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "text-center border-b pb-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-emerald-800 font-bold uppercase text-[11px]" }, "Contr\xF4le final"), /* @__PURE__ */ React.createElement("h3", { className: "text-lg font-black" }, "\u{1F4CB} Totaux analytiques"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-gray-500" }, nomPatient, " | ", selectedOng)), /* @__PURE__ */ React.createElement("div", { className: "bg-gray-50 p-4 rounded-xl border shadow-inner space-y-2" }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-3 font-bold font-mono text-xs border-b pb-2 mb-2" }, /* @__PURE__ */ React.createElement("span", null, "CAT\xC9GORIE"), /* @__PURE__ */ React.createElement("span", { className: "text-right" }, "Gdes"), /* @__PURE__ */ React.createElement("span", { className: "text-right text-emerald-800" }, "DH")), CATEGORIES_LISTE.map((cat) => {
          const m = cumulCategoriesDossierActif[cat.key];
          if (m === 0) return null;
          return /* @__PURE__ */ React.createElement("div", { key: cat.key, className: "grid grid-cols-3 font-mono text-[12px] py-1 border-b border-dashed" }, /* @__PURE__ */ React.createElement("span", null, cat.label), /* @__PURE__ */ React.createElement("span", { className: "text-right font-bold" }, formatGourdes(m)), /* @__PURE__ */ React.createElement("span", { className: "text-right font-bold text-emerald-800" }, formatDH(m)));
        }), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-3 font-mono font-black text-sm pt-3 mt-2 border-t-2" }, /* @__PURE__ */ React.createElement("span", null, "TOTAL"), /* @__PURE__ */ React.createElement("span", { className: "text-right" }, formatGourdes(totalDossierGourdes)), /* @__PURE__ */ React.createElement("span", { className: "text-right text-emerald-800" }, formatDH(totalDossierGourdes)))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-3" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setModePreValidation(false), className: "bg-gray-100 hover:bg-gray-200 rounded-xl py-3 text-xs font-bold" }, "Retour"), /* @__PURE__ */ React.createElement("button", { onClick: finaliserEtArchiverDossierOfficiel, className: "bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl py-3 text-xs font-black" }, "\u{1F7E2} Archiver"))), onglet === "calcul" && !modePreValidation && (modeSimulation ? /* @__PURE__ */ React.createElement(Simulateur, { medicaments, actes }) : /* @__PURE__ */ React.createElement(
          CalculateurPanel,
          {
            medicaments,
            actes,
            lignes: lignesCalcul,
            setLignes: setLignesCalcul,
            dossierActif,
            nomPatient,
            selectedOng,
            onNouveauDossier: initialiserNouveauDossier,
            onAnnulerDossier: annulerDossier,
            onCloturerDossier: declencherPreValidationDossier,
            fichesDossier,
            onSupprimerFicheDossier: supprimerFicheDossier,
            idFicheEnCoursDEdition,
            onEditerFiche: editerFiche,
            numeroFicheCourante,
            dateEntree1,
            setDateEntree1,
            dateSortie1,
            setDateSortie1,
            typeLit1,
            setTypeLit1,
            j1,
            totalE1,
            multiPeriode,
            setMultiPeriode,
            dateEntree2,
            setDateEntree2,
            dateSortie2,
            setDateSortie2,
            typeLit2,
            setTypeLit2,
            j2,
            totalE2,
            hasChirSpec,
            setHasChirSpec,
            nomChirSpec,
            setNomChirSpec,
            prixChirSpec,
            setPrixChirSpec,
            totalsParService,
            grandTotal: grandTotalGlobalFiche,
            totalDossierGourdes,
            onEnregistrerFiche: enregistrerNouvelleFiche,
            onViderFicheActive: viderLeCalculateurFicheUniquement,
            injecterLigne: injecterLigneAuCalculateur,
            modeSimulation,
            userRole,
            userDisplayName,
            setMedicaments,
            medicamentsState: medicaments,
            dateNaissance,
            telephone,
            numDossierPatient,
            typePatient,
            dossierId,
            setDossierId,
            patientsExistants: verifications,
            onChargerPatientExistant: chargerDossierExistant,
            paiementEffectue,
            setPaiementEffectue,
            showToast,
            onSuspendreDossier: suspendreDossier,
            onChangerTypeOng: changerTypeOng
          }
        )), onglet === "verifie" && /* @__PURE__ */ React.createElement(HistoriqueVerifPanel, { verifications, setVerifications, onChargerPourModif: r\u00E9importerDossierDepuisArchives, onSupprimer: supprimerDossierArchive, filtreInitialNom: filtreArchivesInitialNom, clearFiltreInitialNom: () => setFiltreArchivesInitialNom(""), dossierPourExport, setDossierPourExport, userRole, showToast, onChangerTypeOng: changerTypeOngPourDossier }), onglet === "analyse" && (userRole === "administrateur" || userRole === "direction") && /* @__PURE__ */ React.createElement(AnalyticsPanel, { verifications }), onglet === "meds" && (userRole === "administrateur" || userRole === "direction") && /* @__PURE__ */ React.createElement(GrilleEditionPanel, { titre: "de la Pharmacie", items: medicaments, setItems: setMedicaments, collectionName: "medicaments", showToast }), onglet === "actes" && (userRole === "administrateur" || userRole === "direction") && /* @__PURE__ */ React.createElement(GrilleEditionPanel, { titre: "des Actes", items: actes, setItems: setActes, collectionName: "actes", showToast }), onglet === "stock" && (userRole === "administrateur" || userRole === "direction") && /* @__PURE__ */ React.createElement(GestionStockPanel, { items: medicaments, setItems: setMedicaments, showToast }), onglet === "users" && userRole === "administrateur" && /* @__PURE__ */ React.createElement(GestionUtilisateursPanel, { showToast }), onglet === "demandes" && (userRole === "comptable" || userRole === "direction" || userRole === "administrateur") && /* @__PURE__ */ React.createElement(DemandesPanel, { userRole, showToast })));
      }
      function ApplicationRoot() {
        var _a;
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
                const doc = await db.collection("users").doc(user.uid).get();
                if (doc.exists) {
                  const data = doc.data();
                  setUserRole(data.role || "auditeur");
                  setUserDisplayName(data.displayName || user.email || "Utilisateur");
                } else {
                  await db.collection("users").doc(user.uid).set({
                    uid: user.uid,
                    email: user.email || "",
                    role: "auditeur",
                    displayName: user.displayName || user.email || "Utilisateur",
                    active: true,
                    createdAt: firebase2.firestore.FieldValue.serverTimestamp()
                  });
                  setUserRole("auditeur");
                }
              } catch (error) {
                console.error("Erreur r\xE9cup\xE9ration r\xF4le:", error);
                setUserRole("auditeur");
              }
            } else {
              setAuthentifie(false);
              setUserRole(null);
            }
          });
          return () => unsubscribe();
        }, []);
        if (chargementAuth) return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen w-full flex items-center justify-center bg-[#1E2A24]" }, /* @__PURE__ */ React.createElement("div", { className: "text-white text-sm" }, "Chargement..."));
        if (!authentifie) return /* @__PURE__ */ React.createElement(LoginScreen, { onLogin: () => setAuthentifie(true) });
        return /* @__PURE__ */ React.createElement(AppHospitaliere, { onQuitter: () => auth.signOut(), userRole, userDisplayName, userEmail: (_a = auth.currentUser) == null ? void 0 : _a.email });
      }
      module.exports = { AppHospitaliere, ApplicationRoot };
      if (typeof document !== "undefined" && document.getElementById("root")) {
        const root = ReactDOM.createRoot(document.getElementById("root"));
        root.render(/* @__PURE__ */ React.createElement(ApplicationRoot, null));
      }
    }
  });
  require_AppHospitaliere();
})();
