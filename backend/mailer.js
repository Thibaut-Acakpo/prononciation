/**
 * Envoi d'emails transactionnels (confirmation d'adresse email, code de
 * réinitialisation de mot de passe...).
 *
 * DEUX fournisseurs possibles, au choix — configure UN SEUL des deux blocs
 * de variables d'environnement ci-dessous (voir .env.example) :
 *
 *  1) EmailJS (EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_PUBLIC_KEY
 *     / EMAILJS_PRIVATE_KEY) — pratique si tu as DÉJÀ un compte EmailJS
 *     (utilisé normalement côté navigateur, mais leur API REST fonctionne
 *     aussi très bien depuis un serveur Node avec la clé privée). Free tier
 *     limité à 200 emails/mois — à surveiller si l'app grandit.
 *
 *  2) SMTP classique (SMTP_HOST / SMTP_USER / SMTP_PASS) via nodemailer —
 *     n'importe quel fournisseur standard (Brevo, Resend, Mailgun, Amazon
 *     SES, Gmail avec mot de passe d'application...).
 *
 * Si EmailJS est configuré, il est utilisé en priorité. Sinon on retombe
 * sur SMTP. Si aucun des deux n'est configuré, aucun email n'est simulé ou
 * inventé : on log un avertissement clair au démarrage et, en
 * développement, le contenu de l'email (lien/code) s'affiche simplement
 * dans la console du serveur pour pouvoir quand même tester le parcours.
 */

const APP_URL = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");

// ── Fournisseur 1 : EmailJS ──────────────────────────────────────────────
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const emailjsConfigured = Boolean(EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY);

// ── Fournisseur 2 : SMTP (nodemailer) ────────────────────────────────────
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || "PrononciA+ <no-reply@prononcia.app>";
const smtpConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

const isConfigured = emailjsConfigured || smtpConfigured;
const activeProvider = emailjsConfigured ? "emailjs" : smtpConfigured ? "smtp" : null;

let transporter = null;
if (smtpConfigured) {
  const nodemailer = require("nodemailer");
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE, // true pour le port 465, false pour 587/25 (STARTTLS)
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

if (!isConfigured) {
  console.warn(
    "[Mail] ⚠️  Aucun fournisseur d'email configuré (ni EmailJS, ni SMTP) dans l'environnement. " +
    "Les emails ne seront PAS envoyés — en développement, leur contenu (lien/code) sera simplement " +
    "affiché dans cette console. Configure EMAILJS_* OU SMTP_* dans backend/.env avant la mise en production."
  );
} else {
  console.log(`[Mail] Fournisseur d'email actif : ${activeProvider}.`);
}

/**
 * Envoie un email via le fournisseur configuré (EmailJS ou SMTP). Utilisée
 * par toutes les fonctions d'email ci-dessous — jamais appelée directement
 * depuis les routes, qui utilisent sendVerificationEmail()/sendPasswordResetCode().
 */
async function sendEmail({ to, toName, subject, text, html }) {
  if (!isConfigured) {
    return { simulated: true };
  }

  if (activeProvider === "emailjs") {
    // IMPORTANT : les templates EmailJS "grand public" (créés via leur
    // éditeur visuel) sont des champs de texte simple, PAS des éditeurs
    // HTML — leur envoyer du HTML affiche les balises <div>/<span> telles
    // quelles au destinataire au lieu de les faire disparaître dans une
    // mise en page. On envoie donc toujours du texte brut ici, jamais le
    // HTML stylé (qui, lui, reste utilisé pour SMTP ci-dessous où un vrai
    // rendu HTML fonctionne correctement).
    let res;
    try {
      res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: EMAILJS_SERVICE_ID,
          template_id: EMAILJS_TEMPLATE_ID,
          user_id: EMAILJS_PUBLIC_KEY,
          // La clé privée est nécessaire pour les appels non-navigateur (donc
          // depuis un serveur Node) — sans elle, EmailJS bloque la requête
          // par sécurité (protection anti-spam pensée pour l'usage frontend).
          // Récupérable sur dashboard.emailjs.com > Account > Security.
          accessToken: EMAILJS_PRIVATE_KEY || undefined,
          template_params: {
            to_email: to,
            to_name: toName || "là",
            subject,
            message: text,
          },
        }),
      });
    } catch (networkErr) {
      // `fetch` qui échoue à ce niveau (avant même une réponse HTTP) signifie
      // presque toujours que LE SERVEUR lui-même n'a pas accès à Internet à
      // cet instant (DNS injoignable, pare-feu, coupure réseau...) — pas un
      // problème de configuration EmailJS. On le distingue clairement de
      // l'erreur "EmailJS a refusé la requête" ci-dessous, qui elle indique
      // un vrai souci de configuration (mauvais ID, clé invalide...).
      const err = new Error(
        "Impossible de joindre le service d'email (api.emailjs.com) — vérifie que ce serveur a accès à Internet en ce moment."
      );
      err.code = "MAIL_NETWORK_ERROR";
      throw err;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(`EmailJS a refusé l'envoi (HTTP ${res.status}) : ${body || "réponse vide"}`);
      err.code = "MAIL_PROVIDER_ERROR";
      throw err;
    }
    return { simulated: false };
  }

  // SMTP
  try {
    await transporter.sendMail({ from: SMTP_FROM, to, subject, text, html });
  } catch (smtpErr) {
    const isNetwork = ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN"].includes(smtpErr.code);
    const err = new Error(
      isNetwork
        ? `Impossible de joindre le serveur SMTP (${SMTP_HOST}) — vérifie que ce serveur a accès à Internet en ce moment.`
        : `Erreur SMTP : ${smtpErr.message}`
    );
    err.code = isNetwork ? "MAIL_NETWORK_ERROR" : "MAIL_PROVIDER_ERROR";
    throw err;
  }
  return { simulated: false };
}

function buildVerificationUrl(token) {
  return `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
}

async function sendVerificationEmail(to, token, displayName) {
  const url = buildVerificationUrl(token);
  const name = displayName || "là";

  const subject = "Confirme ton adresse email — PrononciA+";
  const text =
    `Salut ${name},\n\n` +
    `Merci de t'être inscrit(e) sur PrononciA+ ! Confirme ton adresse email en ouvrant ce lien ` +
    `(valable 24 heures) :\n\n${url}\n\n` +
    `Si tu n'es pas à l'origine de cette inscription, ignore simplement cet email.\n\n` +
    `— L'équipe PrononciA+`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
      <h2 style="color: #2563eb;">Confirme ton adresse email</h2>
      <p>Salut ${name},</p>
      <p>Merci de t'être inscrit(e) sur <strong>PrononciA+</strong> ! Confirme ton adresse email
      en cliquant sur le bouton ci-dessous (valable 24 heures) :</p>
      <p style="text-align: center; margin: 28px 0;">
        <a href="${url}" style="background:#2563eb;color:#fff;text-decoration:none;
          padding:12px 24px;border-radius:10px;font-weight:bold;display:inline-block;">
          Confirmer mon email
        </a>
      </p>
      <p style="font-size: 0.85rem; color: #64748b;">
        Le bouton ne fonctionne pas ? Copie ce lien dans ton navigateur :<br>
        <a href="${url}">${url}</a>
      </p>
      <p style="font-size: 0.85rem; color: #64748b;">
        Si tu n'es pas à l'origine de cette inscription, ignore simplement cet email.
      </p>
    </div>`;

  if (!isConfigured) {
    console.log(`[Mail] (aucun fournisseur configuré) Lien de vérification pour ${to} :\n  ${url}`);
    return { simulated: true };
  }
  return sendEmail({ to, toName: displayName, subject, text, html });
}

/** Code numérique de réinitialisation de mot de passe (voir routes/auth.routes.js
 * — POST /forgot-password et POST /reset-password). */
async function sendPasswordResetCode(to, code, displayName, validityMinutes = 5) {
  const name = displayName || "là";
  const subject = "Ton code de réinitialisation — PrononciA+";
  const text =
    `Salut ${name},\n\n` +
    `Voici ton code pour réinitialiser ton mot de passe PrononciA+ : ${code}\n\n` +
    `Ce code est valable ${validityMinutes} minutes. Si tu n'es pas à l'origine de cette demande, ignore cet email — ` +
    `ton mot de passe actuel reste inchangé.\n\n— L'équipe PrononciA+`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
      <h2 style="color: #2563eb;">Réinitialisation de mot de passe</h2>
      <p>Salut ${name},</p>
      <p>Voici ton code de vérification :</p>
      <p style="text-align: center; margin: 28px 0;">
        <span style="display:inline-block;background:#eef1f6;color:#0f172a;font-size:28px;
          font-weight:bold;letter-spacing:8px;padding:14px 24px;border-radius:12px;">${code}</span>
      </p>
      <p style="font-size: 0.85rem; color: #64748b;">Ce code est valable ${validityMinutes} minutes.</p>
      <p style="font-size: 0.85rem; color: #64748b;">
        Si tu n'es pas à l'origine de cette demande, ignore cet email — ton mot de passe actuel reste inchangé.
      </p>
    </div>`;

  if (!isConfigured) {
    console.log(`[Mail] (aucun fournisseur configuré) Code de réinitialisation pour ${to} : ${code}`);
    return { simulated: true };
  }
  return sendEmail({ to, toName: displayName, subject, text, html });
}

module.exports = { sendVerificationEmail, sendPasswordResetCode, isConfigured, activeProvider };
