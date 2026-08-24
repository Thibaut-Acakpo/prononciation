/**
 * Backend Node.js — Serveur PrononciA+
 *
 * Un worker Python persistant (analyze_request.py --preload) est démarré une
 * seule fois et garde son modèle de reconnaissance vocale (Whisper, chargé
 * paresseusement à la première requête) en mémoire. Chaque requête
 * /api/analyze envoie une ligne JSON sur stdin du worker et lit la réponse
 * sur stdout → pas de rechargement du modèle entre requêtes.
 *
 * (Correction d'audit : ce commentaire prétendait auparavant qu'un modèle
 * wav2vec2 était chargé ici, alors que le code appelait en réalité l'API web
 * gratuite de Google. Voir backend/python/extract_phonemes.py pour le détail
 * du changement vers un modèle Whisper local.)
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");

const authRoutes = require("./routes/auth.routes");
const historyRoutes = require("./routes/history.routes");
const matchRoutes = require("./routes/match.routes");
const dailyRoutes = require("./routes/daily.routes");
const insightsRoutes = require("./routes/insights.routes");
const adminRoutes = require("./routes/admin.routes");
const wordImageRoutes = require("./routes/wordimage.routes");
const premiumRoutes = require("./routes/premium.routes");
const wordListsRoutes = require("./routes/wordlists.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const { recordAttempt, initSchema, getUserById, countAnalysesToday } = require("./db");
const { verifyToken } = require("./auth");
const { setupMatchNamespace } = require("./realtime");
const { isValidWord, isValidFreeWord } = require("./wordList");
const { annotateAlignmentWithTips } = require("./phonemeTips");
const { resolveEffectivePremium } = require("./premiumAccess");

// Quota quotidien d'analyses pour les comptes gratuits — voir /api/analyze.
// Illimité pour les comptes Premium et les administrateurs.
const FREE_DAILY_ANALYSES = Number(process.env.FREE_DAILY_ANALYSES) || 15;

const app = express();
const PORT = process.env.PORT || 4000;
const PYTHON = process.env.PYTHON_PATH || "python";
const BUILD_DIR = path.join(__dirname, "..", "frontend", "dist");
const TMP_DIR = path.join(__dirname, "tmp");
const SCRIPT = path.join(__dirname, "python", "analyze_request.py");

const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo — largement suffisant pour un mot isolé

// ── Préparation du dossier temporaire ──────────────────────────────────────
// Corrige un manque de l'audit : les fichiers audio temporaires n'étaient
// jamais nettoyés en cas de crash du worker, et s'accumulaient (RGPD : de la
// voix potentiellement identifiable qui traînait sur disque sans limite).
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
for (const f of fs.readdirSync(TMP_DIR)) {
  try { fs.unlinkSync(path.join(TMP_DIR, f)); } catch (_) {}
}

const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: MAX_AUDIO_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    const allowed = ["audio/wav", "audio/x-wav", "audio/webm", "audio/mpeg", "audio/mp4", "audio/ogg"];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Type de fichier audio non supporté."));
  },
});

// ── Sécurité HTTP ───────────────────────────────────────────────────────────
// Correction d'audit : CORS acceptait auparavant absolument n'importe quelle
// origine (`cors()` sans configuration). En développement (Vite sur
// localhost:5173, backend sur localhost:4000) plusieurs origines sont
// légitimes, donc on autorise une liste explicite plutôt qu'un joker "*" —
// à restreindre encore au(x) seul(s) domaine(s) réel(s) une fois en
// production, via la variable d'environnement CORS_ORIGIN (voir .env.example).
const DEFAULT_DEV_ORIGINS = ["http://localhost:4000", "http://127.0.0.1:4000"];
const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : DEFAULT_DEV_ORIGINS;

// Correction : Vite change parfois de port tout seul (5173, 5174, 5175…) si
// le port précédent est déjà occupé — une liste figée cassait alors le CORS
// sans raison apparente. En développement (pas de CORS_ORIGIN défini), on
// autorise automatiquement n'importe quel port sur localhost/127.0.0.1.
const DEV_LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;

const corsOptions = {
  origin(origin, callback) {
    // `origin` est undefined pour les requêtes same-origin ou les outils
    // comme curl/Postman — on les autorise (elles ne posent pas le risque
    // CSRF/vol de session que CORS vise à limiter pour un navigateur).
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (!process.env.CORS_ORIGIN && DEV_LOCALHOST_RE.test(origin)) return callback(null, true);
    callback(new Error("Origine non autorisée par la politique CORS."));
  },
};

// Casque de sécurité HTTP standard (en-têtes anti-clickjacking, anti-sniffing
// de type MIME, etc.). `crossOriginResourcePolicy` assoupli pour laisser les
// images/audio être chargés normalement par le frontend sur un autre port en dev.
// Helmet active par défaut l'en-tête HSTS (Strict-Transport-Security), qui
// indique aux navigateurs de ne plus jamais reparler en HTTP une fois HTTPS
// utilisé une première fois.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// HTTPS partout, en production uniquement (en dev, localhost n'a pas de
// certificat TLS, la redirection casserait tout). `trust proxy` est
// nécessaire pour lire fidèlement X-Forwarded-Proto derrière un reverse
// proxy/load balancer (Nginx, Render, Railway, etc. — la terminaison TLS a
// lieu chez eux, ce serveur Node ne voit que du HTTP en interne).
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    if (req.secure || req.headers["x-forwarded-proto"] === "https") return next();
    res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });
}

app.use(cors(corsOptions));

// Limitation de débit : protège contre le bruteforce sur la connexion et
// contre le spam de requêtes coûteuses (analyse audio = appel Whisper).
// Correction d'audit : rien de tout ça n'existait avant — un script pouvait
// tenter des mots de passe en boucle, ou saturer le worker Python.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20, // 20 tentatives de connexion/inscription par IP toutes les 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessaie dans quelques minutes." },
});

const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12, // 12 analyses par minute par IP — largement assez pour un usage normal
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop d'analyses en peu de temps. Patiente un instant." },
});

const wordImageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { imageUrl: null, reason: "rate_limited" },
});

// ── Webhook FedaPay (paiement Premium) ──────────────────────────────────────
// Monté EXPRÈS avant `express.json()` global ci-dessous : la vérification de
// signature du webhook a besoin du corps brut de la requête, qu'un parsing
// JSON préalable rendrait impossible à revérifier à l'identique.
app.post(
  "/api/premium/webhook",
  express.raw({ type: "application/json" }),
  premiumRoutes.handleFedapayWebhook
);

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});
app.use(express.static(BUILD_DIR));

// Photos de profil uploadées par les utilisateurs (voir routes/auth.routes.js).
// Dossier séparé du build frontend pour survivre à un `vite build` qui
// nettoierait/écraserait le dossier dist.
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOADS_DIR));

// ── Authentification optionnelle ──────────────────────────────────────────
// N'échoue jamais la requête : sert juste à savoir si on doit enregistrer
// une tentative dans l'historique de l'utilisateur connecté.
function attachOptionalUser(req, _res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme === "Bearer" && token) {
    try {
      req.userId = verifyToken(token).sub;
    } catch (_) {
      req.userId = null;
    }
  }
  next();
}

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/match", matchRoutes);
app.use("/api/daily", dailyRoutes);
app.use("/api/insights", insightsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/word-image", wordImageLimiter, wordImageRoutes);
app.use("/api/premium", premiumRoutes);
app.use("/api/word-lists", wordListsRoutes);
app.use("/api/analytics", analyticsRoutes);

// ── Variables d'environnement forcant l'UTF-8 côté Python (Windows) ───────────
// SANS CECI, sur Windows, le sous-processus Python utilise cp1252/cp850 pour
// stdin/stdout/stderr, ce qui casse tous les caractères accentués (é, è, à...)
// et les symboles phonétiques spéciaux (ɐ, ʃ, etc.) → c'est la cause exacte
// de l'erreur "charmap codec can't encode character".
const PYTHON_ENV = {
  ...process.env,
  PYTHONIOENCODING: "utf-8",
  PYTHONUTF8: "1",
  LANG: "C.UTF-8",
};

// ── Worker Python persistant ──────────────────────────────────────────────────
let pythonWorker = null;
let workerReady = false;
let pendingResolve = null;
let pendingReject = null;
let currentJob = null;

// ── File d'attente des analyses, avec priorité Premium ─────────────────────
// Avant, une 2ᵉ requête arrivant pendant qu'une analyse était en cours était
// simplement REJETÉE ("Une analyse est déjà en cours"). Avec plusieurs
// utilisateurs simultanés (l'app tournant en ligne, pas juste en local),
// c'était inutilisable. Maintenant : les requêtes sont mises en file, et le
// worker les traite une par une dans l'ordre — les jobs Premium sont
// insérés juste après les autres jobs Premium déjà en attente, mais AVANT
// tous les jobs gratuits déjà en attente (file d'attente à deux vitesses,
// FIFO à l'intérieur de chaque catégorie — jamais de "famine" pour le
// gratuit, juste un passage prioritaire pour le Premium).
const analyzeQueue = [];

function enqueueAnalyzeJob(job) {
  if (job.isPremium) {
    let insertAt = analyzeQueue.length;
    for (let i = 0; i < analyzeQueue.length; i++) {
      if (!analyzeQueue[i].isPremium) { insertAt = i; break; }
    }
    analyzeQueue.splice(insertAt, 0, job);
  } else {
    analyzeQueue.push(job);
  }
  processAnalyzeQueue();
}

function processAnalyzeQueue() {
  if (currentJob || analyzeQueue.length === 0 || !workerReady) return;

  const job = analyzeQueue.shift();
  currentJob = job;

  const timeout = setTimeout(() => {
    pendingResolve = null;
    pendingReject = null;
    currentJob = null;
    job.reject(new Error("Délai d'analyse dépassé (60 s). Réessaie — si ça persiste, vérifie que ton ordinateur n'est pas trop sollicité par autre chose."));
    processAnalyzeQueue();
  }, 60000);

  pendingResolve = (result) => {
    clearTimeout(timeout);
    currentJob = null;
    job.resolve(result);
    processAnalyzeQueue();
  };
  pendingReject = (err) => {
    clearTimeout(timeout);
    currentJob = null;
    job.reject(err);
    processAnalyzeQueue();
  };

  pythonWorker.stdin.write(Buffer.from(JSON.stringify({ audio: job.audioPath, word: job.word }) + "\n", "utf-8"));
}
let stdoutBuffer = "";

function startWorker() {
  console.log("[Node] Démarrage du worker Python (le modèle Whisper sera chargé à la première requête)…");
  pythonWorker = spawn(PYTHON, [SCRIPT, "--preload"], {
    windowsHide: true,
    cwd: path.join(__dirname, "python"),
    env: PYTHON_ENV,
  });

  // IMPORTANT : on force explicitement l'encodage UTF-8 sur les flux,
  // sinon Node lit les octets avec un mauvais décodage sur certains systèmes.
  pythonWorker.stdout.setEncoding("utf-8");
  pythonWorker.stderr.setEncoding("utf-8");

  pythonWorker.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed === "READY") {
        workerReady = true;
        console.log("[Node] Worker Python prêt.");
        processAnalyzeQueue(); // au cas où des jobs se sont accumulés pendant le chargement
        continue;
      }

      if (pendingResolve) {
        try {
          pendingResolve(JSON.parse(trimmed));
        } catch (e) {
          if (pendingReject) pendingReject(new Error(`Réponse JSON invalide du worker : ${trimmed}`));
        }
        pendingResolve = null;
        pendingReject = null;
      }
    }
  });

  pythonWorker.stderr.on("data", (d) => {
    process.stderr.write("[Python] " + d);
  });

  pythonWorker.on("close", (code) => {
    console.error(`[Node] Worker Python terminé (code ${code}). Redémarrage dans 3 s…`);
    workerReady = false;
    pythonWorker = null;
    stdoutBuffer = "";
    // Le job en cours ne recevra jamais de réponse du worker qui vient de
    // mourir — on le rejette immédiatement au lieu de laisser l'utilisateur
    // attendre le timeout de 60s pour rien.
    if (pendingReject) pendingReject(new Error("Le service d'analyse a redémarré. Réessaie dans quelques secondes."));
    pendingResolve = null;
    pendingReject = null;
    currentJob = null;
    setTimeout(startWorker, 3000);
  });
}

function analyzeWithWorker(audioPath, word, isPremium = false) {
  return new Promise((resolve, reject) => {
    if (!pythonWorker) {
      return reject(new Error("Le modèle est encore en cours de chargement. Réessayez dans quelques secondes."));
    }
    // Sécurité : file d'attente bornée, pour ne jamais accumuler des
    // centaines de requêtes en mémoire si le worker Python plante en boucle.
    if (analyzeQueue.length >= 50) {
      return reject(new Error("Le serveur est surchargé pour le moment. Réessaie dans une minute."));
    }
    enqueueAnalyzeJob({ audioPath, word, isPremium, resolve, reject });
  });
}

startWorker();

// ── Routes API ────────────────────────────────────────────────────────────────

app.get("/api/status", (_req, res) => {
  res.json({ ready: workerReady });
});

app.get("/api/words", (_req, res) => {
  const child = spawn(PYTHON, [SCRIPT, "--list-words"], {
    windowsHide: true,
    cwd: path.join(__dirname, "python"),
    env: PYTHON_ENV,
  });
  child.stdout.setEncoding("utf-8");
  child.stderr.setEncoding("utf-8");

  let out = "", err = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { err += d; });
  child.on("close", (code) => {
    if (code !== 0) {
      console.error("[Node] Erreur list-words :", err);
      return res.status(500).json({ error: "Impossible de charger le lexique." });
    }
    try { res.json(JSON.parse(out.trim())); }
    catch (e) { res.status(500).json({ error: "Réponse lexique invalide." }); }
  });
});

app.post("/api/analyze", analyzeLimiter, attachOptionalUser, upload.single("audio"), async (req, res) => {
  const { expectedWord } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: "Aucun fichier audio reçu." });
  }
  if (!expectedWord) {
    fs.unlinkSync(file.path);
    return res.status(400).json({ error: "Mot attendu manquant." });
  }
  // Sécurité (audit) : avant, n'importe quel texte était accepté ici et
  // transmis tel quel au worker Python, puis stocké en base et exportable
  // en CSV — ouvrant la porte à une "injection de formule" (ex. un texte
  // commençant par "=" qui s'exécute à l'ouverture dans Excel).
  //
  // On accepte maintenant deux cas : un des 80 objets illustrés (mode
  // galerie/caméra), OU n'importe quel mot anglais tapé au clavier (mode
  // "Taper n'importe quel mot") — mais toujours validé par une expression
  // stricte (lettres/apostrophes/tirets uniquement), jamais un texte libre.
  if (!isValidWord(expectedWord) && !isValidFreeWord(expectedWord)) {
    fs.unlinkSync(file.path);
    return res.status(400).json({ error: "Mot invalide (lettres uniquement, 30 caractères max)." });
  }

  // ── Quota quotidien (comptes gratuits uniquement) ──────────────────────
  // Les invités (non connectés) et les comptes Premium/admin ne sont jamais
  // limités ici — seulement bornés par `analyzeLimiter` (anti-abus par IP,
  // déjà en place). Un compte gratuit connecté est lui plafonné à
  // FREE_DAILY_ANALYSES analyses par jour calendaire (UTC).
  let quotaInfo = null;
  let isPremiumUser = false;
  if (req.userId) {
    try {
      const user = await getUserById(req.userId);
      isPremiumUser = resolveEffectivePremium(user, req);
      if (!isPremiumUser) {
        const usedToday = await countAnalysesToday(req.userId);
        if (usedToday >= FREE_DAILY_ANALYSES) {
          fs.unlinkSync(file.path);
          return res.status(429).json({
            error: `Limite quotidienne gratuite atteinte (${FREE_DAILY_ANALYSES} analyses/jour). Reviens demain, ou passe Premium pour un accès illimité.`,
            quota: { used: usedToday, limit: FREE_DAILY_ANALYSES, isPremium: false },
          });
        }
        quotaInfo = { used: usedToday + 1, limit: FREE_DAILY_ANALYSES, isPremium: false };
      } else {
        quotaInfo = { used: null, limit: null, isPremium: true };
      }
    } catch (quotaErr) {
      // Un souci de lecture du quota ne doit jamais bloquer une analyse —
      // on log et on laisse passer, par précaution (mieux vaut une analyse
      // gratuite en trop qu'un utilisateur légitime bloqué par un bug).
      console.error("[Node] Erreur vérification quota :", quotaErr.message);
    }
  }

  try {
    const result = await analyzeWithWorker(file.path, expectedWord, isPremiumUser);

    // Conseils d'articulation détaillés par phonème — réservés Premium (voir
    // phonemeTips.js). Le diff phonémique de base (couleurs/substitutions)
    // reste, lui, gratuit pour tout le monde : on enrichit seulement.
    if (isPremiumUser && result.alignement_phonemes) {
      result.alignement_phonemes = annotateAlignmentWithTips(result.alignement_phonemes);
    }
    if (quotaInfo) result.quota = quotaInfo;

    // Si l'utilisateur est connecté, on garde une trace dans son historique.
    // Ne bloque jamais la réponse : un souci d'écriture BDD ne doit pas faire
    // échouer une analyse qui a par ailleurs réussi.
    if (req.userId) {
      try {
        await recordAttempt({
          userId: req.userId,
          expectedWord,
          recognizedText: result.mot_reconnu,
          jaccard: result.jaccard,
          cosine: result.cosinus,
          per: result.per,
          verdict: result.verdict_court,
          alignment: result.alignement_phonemes,
          isDailyChallenge: req.body.isDailyChallenge === "true" || req.body.isDailyChallenge === true,
        });
      } catch (dbErr) {
        console.error("[Node] Échec d'enregistrement de l'historique :", dbErr.message);
      }
    }

    res.json(result);
  } catch (err) {
    console.error("[Node] Erreur analyse :", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(file.path); } catch (_) {}
  }
});

// ── Gestion d'erreur Multer (fichier trop lourd / type refusé) ────────────
// Sans ce middleware, une erreur Multer (ex. MulterError LIMIT_FILE_SIZE)
// remontait telle quelle et cassait la réponse JSON attendue par le frontend.
app.use((err, req, res, next) => {
  if (err && err.name === "MulterError") {
    return res.status(400).json({ error: `Fichier audio invalide : ${err.message}` });
  }
  if (err) {
    return res.status(400).json({ error: err.message || "Requête invalide." });
  }
  next();
});

// Fallback SPA
//
// Correction d'un bug réel : avant, CETTE route répondait 200 (la page
// d'accueil) pour absolument n'importe quelle URL non trouvée — y compris
// /audio/reference/mot-inexistant.mp3. Résultat : le frontend croyait à
// tort qu'un fichier audio de référence existait (HEAD 200), essayait de le
// jouer, échouait silencieusement (ce n'est pas un vrai fichier audio), PUIS
// basculait sur la synthèse vocale — d'où l'impression d'entendre "deux
// prononciations différentes" du même mot. Maintenant, toute URL qui
// ressemble à un fichier statique (a une extension) reçoit un vrai 404 si
// elle n'existe pas, au lieu de la page d'accueil.
const STATIC_ASSET_RE = /\.[a-zA-Z0-9]+$/;

app.get("*", (req, res) => {
  if (STATIC_ASSET_RE.test(req.path)) {
    return res.status(404).json({ error: "Fichier introuvable." });
  }

  const idx = path.join(BUILD_DIR, "index.html");
  fs.existsSync(idx)
    ? res.sendFile(idx)
    : res.status(404).send("Build introuvable. Lancez d'abord : cd frontend && npm run build");
});

initSchema()
  .then(() => {
    console.log("[DB] ✅ Connexion MySQL OK — comptes et historique disponibles.");
  })
  .catch((err) => {
    // Important : on ne bloque plus le démarrage du serveur si MySQL est mal
    // configuré. Avant, un `.env` incorrect empêchait TOUT de fonctionner
    // (y compris la galerie de photos et l'analyse de prononciation, qui
    // n'ont pourtant rien à voir avec la base de données) — ce qui rendait
    // très difficile de comprendre d'où venait le problème. Maintenant,
    // seules les fonctionnalités de compte/historique sont indisponibles.
    console.error(
      "\n[DB] ⚠️  Impossible de se connecter à MySQL — les comptes et l'historique sont DÉSACTIVÉS,\n" +
      "    mais la galerie, la caméra et l'analyse de prononciation continuent de fonctionner.\n" +
      "    Vérifie backend/.env (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME) et que MySQL tourne.\n" +
      "    Détail :", err.message, "\n"
    );
  });

// Socket.io a besoin du serveur HTTP brut (pas juste de l'objet Express) pour
// pouvoir gérer les WebSockets sur le même port que le reste de l'API —
// c'est pour ça qu'on ne fait plus simplement `app.listen(...)`.
const httpServer = http.createServer(app);
setupMatchNamespace(httpServer, process.env.CORS_ORIGIN);

httpServer.listen(PORT, () => {
  console.log(`[Node] Backend PrononciA+ sur http://localhost:${PORT}`);
  console.log(`[Node] Python : ${PYTHON}`);
  console.log(`[Node] Mode Match (temps réel) activé.`);
});