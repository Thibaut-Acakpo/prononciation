/**
 * Recherche d'image pour un mot tapé au clavier qui NE FAIT PAS partie des
 * 80 objets illustrés localement (voir frontend/public/images/objects/).
 *
 * Contrairement aux 80 mots (100% locaux, zéro Internet), cette route est
 * une amélioration OPTIONNELLE : si Internet est indisponible ou si aucune
 * clé Pexels n'est configurée, elle répond simplement qu'aucune image n'a
 * été trouvée — jamais une erreur qui casserait le reste de l'application.
 */

const express = require("express");
const router = express.Router();

const PEXELS_KEY = process.env.PEXELS_API_KEY;

const cache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 jours

// Même validation que côté mot libre (backend/wordList.js isValidFreeWord) :
// lettres/apostrophes/tirets uniquement.
const FREE_WORD_RE = /^[a-zA-Z][a-zA-Z'-]{0,29}$/;

router.get("/search", async (req, res) => {
  const word = (req.query.word || "").toString().trim();

  if (!FREE_WORD_RE.test(word)) {
    return res.status(400).json({ error: "Mot invalide.", imageUrl: null });
  }

  if (!PEXELS_KEY) {
    return res.json({ imageUrl: null, reason: "not_configured" });
  }

  const cacheKey = word.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return res.json({ imageUrl: cached.imageUrl, reason: cached.imageUrl ? null : "not_found" });
  }

  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(word)}&per_page=1&orientation=square`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, { headers: { Authorization: PEXELS_KEY }, signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      cache.set(cacheKey, { imageUrl: null, timestamp: Date.now() });
      return res.json({ imageUrl: null, reason: "not_found" });
    }

    const data = await response.json();
    const imageUrl = data.photos?.[0]?.src?.medium || null;

    cache.set(cacheKey, { imageUrl, timestamp: Date.now() });
    res.json({ imageUrl, reason: imageUrl ? null : "not_found" });
  } catch (err) {
    console.warn("[WordImage] Recherche indisponible :", err.message);
    res.json({ imageUrl: null, reason: "network_error" });
  }
});

module.exports = router;
