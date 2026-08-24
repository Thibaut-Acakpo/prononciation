const express = require("express");
const { getUserById } = require("../db");
const { verifyToken } = require("../auth");
const { PREMIUM_WORD_LISTS, getPremiumWordListsMeta } = require("../premiumWordLists");
const { resolveEffectivePremium } = require("../premiumAccess");

const router = express.Router();

// Public : les comptes gratuits (et même les invités non connectés) voient
// les THÈMES disponibles pour donner envie de passer Premium, mais jamais
// les mots eux-mêmes tant qu'ils ne sont pas Premium/admin.
router.get("/", async (req, res) => {
  try {
    let hasAccess = false;
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme === "Bearer" && token) {
      try {
        const { sub } = verifyToken(token);
        const user = await getUserById(sub);
        hasAccess = resolveEffectivePremium(user, req);
      } catch { /* token invalide ou expiré : traité comme invité, pas d'accès premium */ }
    }

    if (hasAccess) {
      return res.json({ lists: PREMIUM_WORD_LISTS, locked: false });
    }
    res.json({ lists: getPremiumWordListsMeta(), locked: true });
  } catch (err) {
    console.error("[WordLists] Erreur :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;
