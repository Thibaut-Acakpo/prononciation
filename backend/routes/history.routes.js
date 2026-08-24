const express = require("express");
const { requireAuth } = require("../auth");
const { getHistoryForUser, getProgressSummary, getUserById } = require("../db");
const { resolveEffectivePremium } = require("../premiumAccess");

const router = express.Router();

// Toutes les routes ici nécessitent un utilisateur connecté.
router.use(requireAuth);

// Historique détaillé — plafonné à 10 tentatives pour les comptes gratuits
// (les 10 plus récentes), quel que soit ce que le frontend demande : le
// plafond est appliqué ici, pas seulement caché dans l'interface, sinon un
// appel direct à l'API suffirait à le contourner. Illimité (par pages de
// `limit`) pour les comptes Premium/admin — voir le bouton "Voir plus" côté
// frontend (HistoryScreen.jsx).
const FREE_HISTORY_LIMIT = 5;

router.get("/", async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    const isPremium = resolveEffectivePremium(user, req);

    let limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    let offset = parseInt(req.query.offset, 10) || 0;

    if (!isPremium) {
      limit = FREE_HISTORY_LIMIT;
      offset = 0; // un compte gratuit ne peut jamais "paginer" au-delà des 10 dernières
    }

    const history = await getHistoryForUser(req.userId, { limit, offset });
    res.json({ history, isPremium, freeLimit: FREE_HISTORY_LIMIT });
  } catch (err) {
    console.error("[History] Erreur :", err.message);
    res.status(500).json({ error: "Erreur serveur lors de la récupération de l'historique." });
  }
});

router.get("/progress", async (req, res) => {
  try {
    const progress = await getProgressSummary(req.userId);
    res.json({ progress });
  } catch (err) {
    console.error("[History] Erreur progress :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;