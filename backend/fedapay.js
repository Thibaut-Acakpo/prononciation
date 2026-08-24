/**
 * Intégration FedaPay (paiement Mobile Money — MTN, Moov, Celtiis) pour
 * débloquer le statut Premium.
 *
 * FedaPay expose une vraie API REST documentée : https://docs.fedapay.com
 * Comme pour le mailer (voir mailer.js), si les clés ne sont pas encore
 * configurées, on ne fait JAMAIS semblant d'avoir un paiement réussi — les
 * routes qui utilisent ce module renvoient une erreur claire tant que
 * FEDAPAY_SECRET_KEY n'est pas renseignée dans backend/.env.
 *
 * Pour obtenir de vraies clés : créer un compte marchand sur fedapay.com,
 * puis Dashboard > Réglages > Clés API. Utiliser d'abord les clés
 * "sandbox" (préfixe sk_sandbox_ / pk_sandbox_) pour tester avec de faux
 * paiements Mobile Money (l'opérateur de test s'appelle `momo_test`), puis
 * les clés "live" (sk_live_ / pk_live_) une fois prêt à encaisser pour de
 * vrai.
 */

const FEDAPAY_SECRET_KEY = process.env.FEDAPAY_SECRET_KEY;
const FEDAPAY_ENV = process.env.FEDAPAY_ENV === "live" ? "live" : "sandbox";
const FEDAPAY_WEBHOOK_SECRET = process.env.FEDAPAY_WEBHOOK_SECRET;

const BASE_URL = FEDAPAY_ENV === "live"
  ? "https://api.fedapay.com/v1"
  : "https://sandbox-api.fedapay.com/v1";

const isConfigured = Boolean(FEDAPAY_SECRET_KEY);

if (!isConfigured) {
  console.warn(
    "[FedaPay] ⚠️  FEDAPAY_SECRET_KEY n'est pas définie dans l'environnement. " +
    "Le système Premium répondra une erreur explicite tant que les clés FedaPay " +
    "(sandbox pour tester, live pour encaisser) ne sont pas renseignées dans backend/.env."
  );
}

async function fedapayRequest(method, path, body) {
  if (!isConfigured) {
    const err = new Error(
      "Paiement indisponible : FedaPay n'est pas encore configuré côté serveur (FEDAPAY_SECRET_KEY manquante)."
    );
    err.code = "FEDAPAY_NOT_CONFIGURED";
    throw err;
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${FEDAPAY_SECRET_KEY}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (networkErr) {
    // `fetch` qui échoue ICI (avant même de recevoir une réponse HTTP,
    // message brut "fetch failed") signifie que LE SERVEUR n'a pas pu
    // joindre l'API FedaPay à cet instant — DNS injoignable, pare-feu,
    // coupure Internet... pas un souci de clés ou de configuration. On le
    // distingue clairement de "FedaPay a refusé la requête" ci-dessous, qui
    // elle indique un vrai souci de configuration (clé invalide, etc.).
    const err = new Error(
      `Impossible de joindre l'API FedaPay (${BASE_URL}) — vérifie que ce serveur a accès à Internet en ce moment.`
    );
    err.code = "FEDAPAY_NETWORK_ERROR";
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || data?.errors ? JSON.stringify(data.errors || data.message) : `Erreur FedaPay (HTTP ${res.status})`;
    const err = new Error(message);
    err.code = "FEDAPAY_API_ERROR";
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Crée une transaction FedaPay puis génère le lien de paiement (token) que
 * l'utilisateur doit ouvrir pour payer en Mobile Money. Retourne l'URL de
 * paiement à rediriger côté frontend.
 */
async function createCheckout({ amount, currency = "XOF", description, customerEmail, customerFirstname, callbackUrl }) {
  const transaction = await fedapayRequest("POST", "/transactions", {
    description,
    amount,
    currency: { iso: currency },
    callback_url: callbackUrl,
    customer: {
      email: customerEmail,
      firstname: customerFirstname || "Client",
      lastname: "PrononciA+",
    },
  });

  const transactionId = transaction?.["v1/transaction"]?.id || transaction?.id;
  if (!transactionId) {
    const err = new Error("Réponse FedaPay inattendue lors de la création de la transaction.");
    err.code = "FEDAPAY_API_ERROR";
    throw err;
  }

  const tokenData = await fedapayRequest("POST", `/transactions/${transactionId}/token`);
  const paymentUrl = tokenData?.["v1/token"]?.url || tokenData?.url;

  return { transactionId: String(transactionId), paymentUrl };
}

/** Relit le statut réel d'une transaction directement auprès de FedaPay
 * (utile en secours du webhook, notamment en développement où FedaPay ne
 * peut pas atteindre un serveur local). */
async function fetchTransactionStatus(transactionId) {
  const data = await fedapayRequest("GET", `/transactions/${transactionId}`);
  const tx = data?.["v1/transaction"] || data;
  return tx?.status; // "pending" | "approved" | "declined" | "canceled" | ...
}

/**
 * Vérifie la signature d'un webhook FedaPay (en-tête `x-fedapay-signature`)
 * pour s'assurer que l'appel vient bien de FedaPay et pas d'un tiers qui
 * essaierait de simuler un paiement réussi pour obtenir le statut Premium
 * gratuitement.
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!FEDAPAY_WEBHOOK_SECRET) return false;
  const crypto = require("crypto");
  // FedaPay envoie une signature au format "t=<timestamp>,s=<hmac>".
  const parts = Object.fromEntries(
    (signatureHeader || "").split(",").map((p) => p.split("=").map((s) => s.trim()))
  );
  if (!parts.t || !parts.s) return false;

  const expected = crypto
    .createHmac("sha256", FEDAPAY_WEBHOOK_SECRET)
    .update(`${parts.t}.${rawBody}`)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.s));
  } catch {
    return false;
  }
}

module.exports = {
  isConfigured,
  createCheckout,
  fetchTransactionStatus,
  verifyWebhookSignature,
};
