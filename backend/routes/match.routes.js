const express = require("express");
const { requireAuth } = require("../auth");
const { getUserTrophies, getMatchHistoryForUser, getUserPracticeStats } = require("../db");
const { MATCH_MIN_ATTEMPTS } = require("../realtime");

const router = express.Router();

router.use(requireAuth);

router.get("/eligibility", async (req, res) => {
  try {
    const stats = await getUserPracticeStats(req.userId);
    res.json({
      eligible: stats.count >= MATCH_MIN_ATTEMPTS,
      attemptsCount: stats.count,
      requiredAttempts: MATCH_MIN_ATTEMPTS,
      avgPer: stats.avgPer,
    });
  } catch (err) {
    console.error("[Match] Erreur éligibilité :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.get("/trophies", async (req, res) => {
  try {
    const trophies = await getUserTrophies(req.userId);
    res.json({ trophies });
  } catch (err) {
    console.error("[Match] Erreur trophées :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.get("/history", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const history = await getMatchHistoryForUser(req.userId, { limit });
    res.json({ history });
  } catch (err) {
    console.error("[Match] Erreur historique :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;
