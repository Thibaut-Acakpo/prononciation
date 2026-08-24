const express = require("express");
const { requireAuth } = require("../auth");
const { getRecentAlignments, getUserById, getWeeklyProgress } = require("../db");
const { analyzeWeakPoints, analyzeWeakPointsDetailed } = require("../phonemeStats");
const { resolveEffectivePremium } = require("../premiumAccess");

const router = express.Router();

router.use(requireAuth);

router.get("/weak-points", async (req, res) => {
  try {
    const alignments = await getRecentAlignments(req.userId, { limit: 100 });
    const insights = analyzeWeakPoints(alignments);
    res.json({ insights: insights || [] });
  } catch (err) {
    console.error("[Insights] Erreur :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// Rapport de progression avancé — réservé aux comptes Premium (ou admin) :
// top 5 des sons à travailler (au lieu du seul point faible n°1, déjà
// gratuit ci-dessus) + tendance hebdomadaire du taux d'erreur, pour un vrai
// suivi dans le temps plutôt qu'un instantané.
router.get("/advanced", async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    const hasAccess = resolveEffectivePremium(user, req);
    if (!hasAccess) {
      return res.status(403).json({ error: "Le rapport de progression avancé est réservé aux comptes Premium.", locked: true });
    }

    const [alignments, weeklyProgress] = await Promise.all([
      getRecentAlignments(req.userId, { limit: 300 }),
      getWeeklyProgress(req.userId, 8),
    ]);
    const weakPoints = analyzeWeakPointsDetailed(alignments, 5);

    res.json({ weakPoints, weeklyProgress });
  } catch (err) {
    console.error("[Insights] Erreur rapport avancé :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;
