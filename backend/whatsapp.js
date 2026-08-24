/**
 * Envoi de codes par WhatsApp, via l'API Twilio WhatsApp.
 *
 * Configuration nécessaire (voir .env.example) :
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 *   (numéro Twilio activé WhatsApp, format "whatsapp:+14155238886")
 *
 * ⚠️ Point important à savoir avant de tester : en mode "bac à sable"
 * (Twilio Sandbox for WhatsApp, gratuit), chaque numéro destinataire doit
 * D'ABORD envoyer une phrase d'activation (ex. "join xxxxx") au numéro
 * Twilio depuis WhatsApp, une seule fois, avant de pouvoir recevoir des
 * messages automatisés. En production, un vrai numéro WhatsApp Business
 * approuvé par Twilio n'a pas cette contrainte. Voir la doc Twilio pour
 * les détails de mise en service.
 *
 * Comme pour mailer.js/fedapay.js : si non configuré, on ne simule JAMAIS
 * un envoi réussi — on log un avertissement clair et, en développement, le
 * code s'affiche dans la console pour pouvoir quand même tester le parcours.
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM; // ex. "whatsapp:+14155238886"

const isConfigured = Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM);

if (!isConfigured) {
  console.warn(
    "[WhatsApp] ⚠️  TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_WHATSAPP_FROM ne sont pas définis. " +
    "L'envoi de codes par WhatsApp est désactivé — en développement, le code s'affiche dans la console. " +
    "Seul l'envoi par email reste disponible tant que ce n'est pas configuré."
  );
}

async function sendWhatsAppCode(toPhone, code, validityMinutes = 5) {
  const message = `PrononciA+ : ton code de réinitialisation de mot de passe est ${code}. Valable ${validityMinutes} minutes.`;

  if (!isConfigured) {
    console.log(`[WhatsApp] (non configuré) Code pour ${toPhone} : ${code}`);
    return { simulated: true };
  }

  // Numéro destinataire attendu au format E.164 (ex. +229XXXXXXXX) — on
  // ajoute le préfixe "whatsapp:" requis par l'API Twilio.
  const to = toPhone.startsWith("whatsapp:") ? toPhone : `whatsapp:${toPhone}`;

  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const body = new URLSearchParams({ From: TWILIO_WHATSAPP_FROM, To: to, Body: message });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Twilio a refusé l'envoi WhatsApp (HTTP ${res.status}) : ${errText || "réponse vide"}`);
  }
  return { simulated: false };
}

module.exports = { sendWhatsAppCode, isConfigured };
