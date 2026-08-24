const express = require("express");
const { requireAuth } = require("../auth");
const { getDailyChallengeLeaderboard, getUserDailyChallengeStatus } = require("../db");
const { getWordOfTheDay, todayDateString } = require("../wordList");

const router = express.Router();

router.use(requireAuth);

router.get("/today", async (req, res) => {
  try {
    const date = todayDateString();
    const word = getWordOfTheDay(date);
    const [leaderboard, myStatus] = await Promise.all([
      getDailyChallengeLeaderboard(word, date, { limit: 20 }),
      getUserDailyChallengeStatus(req.userId, word, date),
    ]);
    res.json({ date, word, leaderboard, myStatus });
  } catch (err) {
    console.error("[Daily] Erreur :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;
