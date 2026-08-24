const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  getUserById,
  createPremiumTransaction,
  getPremiumTransaction,
  markPremiumTransactionApproved,
  markPremiumTransactionFailed,
} = require("../db");
const { requireAuth } = require("../auth");
const fedapay = require("../fedapay");

const router = express.Router();

// Prix Premium — un paiement UNIQUE (pas d'abonnement) qui débloque le
// statut Premium à vie. Montant en FCFA (XOF), configurable sans toucher au
// code via l'environnement.
const PREMIUM_PRICE_XOF = Number(process.env.PREMIUM_PRICE_XOF) || 2000;
const APP_URL = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");

const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives de paiement. Réessaie dans quelques minutes." },
});

router.get("/status", requireAuth, async (req, res) => {
  const user = await getUserById(req.userId);
  res.json({ isPremium: Boolean(user?.is_premium), premiumSince: user?.premium_since || null, price: PREMIUM_PRICE_XOF });
});

// Démarre un paiement Mobile Money : crée la transaction côté FedaPay et
// renvoie l'URL de paiement (page FedaPay où l'utilisateur choisit son
// opérateur — MTN, Moov, Celtiis — et confirme sur son téléphone).
router.post("/checkout", requireAuth, checkoutLimiter, async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
    if (user.is_premium) return res.status(400).json({ error: "Tu es déjà Premium !" });

    const { transactionId, paymentUrl } = await fedapay.createCheckout({
      amount: PREMIUM_PRICE_XOF,
      currency: "XOF",
      description: "PrononciA+ — Accès Premium à vie",
      customerEmail: user.email,
      customerFirstname: user.display_name || undefined,
      callbackUrl: `${APP_URL}/premium?paiement=retour`,
    });

    await createPremiumTransaction(user.id, transactionId, PREMIUM_PRICE_XOF, "XOF");

    res.json({ paymentUrl, transactionId });
  } catch (err) {
    if (err.code === "FEDAPAY_NOT_CONFIGURED") {
      return res.status(503).json({ error: err.message });
    }
    console.error("[Premium] Erreur création paiement :", err.message);
    const message = err.code === "FEDAPAY_NETWORK_ERROR"
      ? "Le serveur n'arrive pas à joindre FedaPay en ce moment (pas de connexion Internet ?). Réessaie dans un instant."
      : err.code === "FEDAPAY_API_ERROR"
      ? "FedaPay a refusé la demande de paiement — vérifie tes clés API dans backend/.env."
      : "Impossible de démarrer le paiement pour le moment.";
    res.status(502).json({ error: message });
  }
});

// Vérifie manuellement le statut d'une transaction après le retour de
// paiement (utile en secours du webhook — notamment en développement local
// où FedaPay ne peut pas joindre localhost pour le webhook).
router.get("/verify/:transactionId", requireAuth, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const tx = await getPremiumTransaction(transactionId);
    if (!tx || tx.user_id !== req.userId) {
      return res.status(404).json({ error: "Transaction introuvable." });
    }
    if (tx.status === "approved") {
      const user = await getUserById(req.userId);
      return res.json({ status: "approved", user });
    }

    const remoteStatus = await fedapay.fetchTransactionStatus(transactionId);
    if (remoteStatus === "approved") {
      await markPremiumTransactionApproved(transactionId);
      const user = await getUserById(req.userId);
      return res.json({ status: "approved", user });
    }
    if (remoteStatus === "declined" || remoteStatus === "canceled") {
      await markPremiumTransactionFailed(transactionId);
    }
    res.json({ status: remoteStatus || "pending" });
  } catch (err) {
    if (err.code === "FEDAPAY_NOT_CONFIGURED") {
      return res.status(503).json({ error: err.message });
    }
    console.error("[Premium] Erreur vérification paiement :", err.message);
    const message = err.code === "FEDAPAY_NETWORK_ERROR"
      ? "Le serveur n'arrive pas à joindre FedaPay en ce moment (pas de connexion Internet ?). Réessaie dans un instant."
      : "Erreur serveur lors de la vérification du paiement.";
    res.status(502).json({ error: message });
  }
});

// Webhook FedaPay — appelé par LEURS serveurs (pas par le navigateur de
// l'utilisateur) dès qu'une transaction change de statut. C'est le chemin
// fiable en production (contrairement à /verify qui dépend du retour de
// l'utilisateur sur l'app). Route PUBLIQUE par nécessité, mais protégée par
// la vérification de signature ci-dessous : sans elle, n'importe qui
// pourrait s'auto-déclarer "Premium" en simulant cet appel.
//
// IMPORTANT : cette route est montée directement dans server.js, AVANT
// `express.json()` global — la vérification de signature a besoin du corps
// brut (raw) exact tel qu'envoyé par FedaPay, qu'un parsing JSON préalable
// détruirait (voir server.js, section "Webhooks").
async function handleFedapayWebhook(req, res) {
  try {
    const rawBody = req.body.toString("utf8");
    const signature = req.headers["x-fedapay-signature"];

    if (!fedapay.verifyWebhookSignature(rawBody, signature)) {
      console.warn("[Premium] Webhook FedaPay reçu avec une signature invalide ou absente — ignoré.");
      return res.status(401).json({ error: "Signature invalide." });
    }

    const event = JSON.parse(rawBody);
    const transactionId = String(event?.data?.object?.id || event?.entity?.id || "");
    const status = event?.data?.object?.status || event?.entity?.status;

    if (!transactionId) return res.status(400).json({ error: "Événement webhook invalide." });

    if (status === "approved") {
      const result = await markPremiumTransactionApproved(transactionId);
      if (result.ok) console.log(`[Premium] ✅ Utilisateur #${result.userId} passé Premium via webhook FedaPay.`);
    } else if (status === "declined" || status === "canceled") {
      await markPremiumTransactionFailed(transactionId);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("[Premium] Erreur traitement webhook :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
}

module.exports = router;
module.exports.handleFedapayWebhook = handleFedapayWebhook;
