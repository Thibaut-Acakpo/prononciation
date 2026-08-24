const express = require("express");
const rateLimit = require("express-rate-limit");
const { recordAppInstall } = require("../db");
const { verifyToken } = require("../auth");

const router = express.Router();

// Route publique (l'installation peut arriver avant toute connexion) mais
// limitée pour éviter qu'un script gonfle artificiellement le compteur.
const installLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes." },
});

router.post("/install", installLimiter, async (req, res) => {
  try {
    let userId = null;
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme === "Bearer" && token) {
      try { userId = verifyToken(token).sub; } catch { /* invité : pas grave, on log quand même l'install */ }
    }

    const platform = typeof req.body?.platform === "string" ? req.body.platform : "unknown";
    await recordAppInstall({ userId, platform, userAgent: req.headers["user-agent"] });
    res.status(201).json({ recorded: true });
  } catch (err) {
    console.error("[Analytics] Erreur enregistrement installation :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;
