const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const {
  createUser, getUserByEmail, getUserById,
  updateDisplayName, updateAvatar, getPasswordHash, updatePassword, deleteUser,
  setEmailVerifyToken, verifyEmailByTokenHash, isEmailAlreadyVerified,
  updatePhoneNumber, setPasswordResetCode, verifyPasswordResetCode, resetPasswordAndClearCode,
} = require("../db");
const { signToken, requireAuth } = require("../auth");
const { sendVerificationEmail, sendPasswordResetCode } = require("../mailer");
const { resolveEffectivePremium } = require("../premiumAccess");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function generateVerificationToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  return { rawToken, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS) };
}

// Anti-abus dédié au renvoi d'email (indépendant du login/inscription).
const resendVerificationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de demandes de renvoi. Réessaie dans quelques minutes." },
});

// Le token de vérification (32 octets aléatoires) est impossible à deviner
// par force brute, mais on limite quand même cette route publique par
// défense en profondeur (évite qu'elle serve à autre chose, ex. un scan).
const verifyEmailLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessaie dans quelques minutes." },
});

// ── Photo de profil ─────────────────────────────────────────────────────────
// Deux façons de définir sa photo :
//  1) Upload d'une vraie photo perso (JPEG/PNG/WEBP, 4 Mo max) — enregistrée
//     sur disque dans backend/uploads/avatars/ et servie statiquement.
//  2) Choix d'un avatar généré parmi un vrai service public (DiceBear) —
//     on ne stocke que l'URL, jamais d'image inventée/fictive côté serveur.
const AVATAR_DIR = path.join(__dirname, "..", "uploads", "avatars");
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

const MAX_AVATAR_SIZE_BYTES = 4 * 1024 * 1024; // 4 Mo
const ALLOWED_AVATAR_MIME = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_AVATAR_MIME[file.mimetype] || ".jpg";
    cb(null, `user-${req.userId}-${Date.now()}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: MAX_AVATAR_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AVATAR_MIME[file.mimetype]) return cb(null, true);
    cb(new Error("Format d'image non supporté (JPEG, PNG ou WEBP uniquement)."));
  },
});

// Anti-abus : évite qu'un compte spamme l'upload/la génération d'avatar.
const avatarLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de changements de photo de profil. Réessaie dans quelques minutes." },
});

// Styles DiceBear autorisés (liste blanche) — évite qu'un client forge une
// URL arbitraire vers un autre domaine en passant un "style" quelconque.
const AVATAR_STYLES = [
  "adventurer", "avataaars", "bottts", "fun-emoji", "lorelei",
  "notionists", "personas", "pixel-art", "thumbs",
];
// Sous-ensemble réservé aux comptes Premium (ou admin) — vérifié aussi
// côté serveur, pas seulement affiché grisé côté frontend : sinon un appel
// direct à l'API contournerait la restriction.
const PREMIUM_AVATAR_STYLES = ["notionists", "personas", "thumbs"];

function deleteLocalAvatarIfAny(avatarUrl) {
  if (!avatarUrl || !avatarUrl.startsWith("/uploads/avatars/")) return;
  const filePath = path.join(__dirname, "..", avatarUrl.replace("/uploads/avatars/", "uploads/avatars/"));
  fs.unlink(filePath, () => {}); // best-effort, on n'échoue jamais la requête pour ça
}

router.post("/register", async (req, res) => {
  try {
    const { email, password, displayName } = req.body || {};

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Adresse email invalide." });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères." });
    }
    if (await getUserByEmail(email)) {
      return res.status(409).json({ error: "Un compte existe déjà avec cet email." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { rawToken, tokenHash, expiresAt } = generateVerificationToken();
    const user = await createUser({
      email, passwordHash, displayName,
      emailVerifyTokenHash: tokenHash,
      emailVerifyExpires: expiresAt,
    });
    const token = signToken(user);

    // L'envoi de l'email ne doit jamais faire échouer l'inscription elle-même
    // (compte déjà créé à ce stade) — en cas de souci SMTP, l'utilisateur
    // pourra toujours redemander l'email via /resend-verification.
    sendVerificationEmail(user.email, rawToken, user.display_name).catch((err) => {
      console.error("[Auth] Erreur envoi email de vérification :", err.message);
    });

    res.status(201).json({ token, user });
  } catch (err) {
    console.error("[Auth] Erreur inscription :", err.message);
    res.status(500).json({ error: "Erreur serveur lors de l'inscription." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe requis." });
    }

    const userRow = await getUserByEmail(email);
    if (!userRow) {
      // Message volontairement identique au cas "mauvais mot de passe" pour ne
      // pas révéler si un email existe (énumération de comptes).
      return res.status(401).json({ error: "Email ou mot de passe incorrect." });
    }

    const valid = await bcrypt.compare(password, userRow.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect." });
    }

    const user = await getUserById(userRow.id);
    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error("[Auth] Erreur connexion :", err.message);
    res.status(500).json({ error: "Erreur serveur lors de la connexion." });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
    res.json({ user });
  } catch (err) {
    console.error("[Auth] Erreur /me :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// Vérification d'email — volontairement PUBLIQUE (pas de requireAuth) : le
// lien est cliqué depuis un client mail, souvent sans session active dans
// le navigateur qui l'ouvre. La sécurité vient du token lui-même (aléatoire,
// 32 octets, à durée de vie limitée), pas d'une authentification préalable.
router.get("/verify-email", verifyEmailLimiter, async (req, res) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Lien de vérification invalide." });
    }
    const result = await verifyEmailByTokenHash(hashToken(token));
    if (!result.ok) {
      const messages = {
        not_found: "Ce lien de vérification est invalide ou a déjà été utilisé.",
        expired: "Ce lien de vérification a expiré. Demande-en un nouveau depuis ton profil.",
      };
      return res.status(400).json({ error: messages[result.reason] || "Lien invalide." });
    }
    res.json({ verified: true });
  } catch (err) {
    console.error("[Auth] Erreur vérification email :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/resend-verification", requireAuth, resendVerificationLimiter, async (req, res) => {
  try {
    const alreadyVerified = await isEmailAlreadyVerified(req.userId);
    if (alreadyVerified) {
      return res.status(400).json({ error: "Cet email est déjà confirmé." });
    }
    const user = await getUserById(req.userId);
    const { rawToken, tokenHash, expiresAt } = generateVerificationToken();
    await setEmailVerifyToken(req.userId, tokenHash, expiresAt);
    await sendVerificationEmail(user.email, rawToken, user.display_name);
    res.json({ sent: true });
  } catch (err) {
    console.error("[Auth] Erreur renvoi email de vérification :", err.message);
    const message = err.code === "MAIL_NETWORK_ERROR"
      ? "Le serveur n'arrive pas à joindre le service d'email en ce moment (pas de connexion Internet ?). Réessaie dans un instant."
      : "Erreur serveur lors de l'envoi de l'email.";
    res.status(500).json({ error: message });
  }
});

router.patch("/me", requireAuth, async (req, res) => {
  try {
    const { displayName } = req.body || {};
    if (typeof displayName !== "string" || displayName.trim().length === 0) {
      return res.status(400).json({ error: "Nom d'affichage invalide." });
    }
    if (displayName.length > 60) {
      return res.status(400).json({ error: "Nom d'affichage trop long (60 caractères max)." });
    }
    const user = await updateDisplayName(req.userId, displayName.trim());
    res.json({ user });
  } catch (err) {
    console.error("[Auth] Erreur mise à jour profil :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

const PASSWORD_RESET_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PHONE_RE = /^\+?[0-9]{8,15}$/;

function generateResetCode() {
  // Code à 6 chiffres — assez d'entropie (1 million de combinaisons) combiné
  // à l'expiration courte (15 min) et au rate limiting ci-dessous pour
  // rester sûr, tout en restant facile à taper à la main sur un téléphone.
  const code = String(Math.floor(100000 + Math.random() * 900000));
  return { code, codeHash: hashToken(code), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) };
}

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de demandes de réinitialisation. Réessaie dans quelques minutes." },
});

router.patch("/me/phone", requireAuth, async (req, res) => {
  try {
    const { phoneNumber } = req.body || {};
    if (phoneNumber !== null && phoneNumber !== "" && !PHONE_RE.test(phoneNumber || "")) {
      return res.status(400).json({ error: "Numéro de téléphone invalide (format international, ex. +229XXXXXXXX)." });
    }
    const user = await updatePhoneNumber(req.userId, phoneNumber || null);
    res.json({ user });
  } catch (err) {
    console.error("[Auth] Erreur mise à jour téléphone :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// Démarre une réinitialisation de mot de passe par email. Réponse
router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Adresse email invalide." });
    }

    // Réponse volontairement IDENTIQUE que le compte existe ou non —
    // sécurité classique, on ne révèle jamais quels emails ont un compte.
    const user = await getUserByEmail(email);
    if (user) {
      const { code, codeHash, expiresAt } = generateResetCode();
      await setPasswordResetCode(user.id, codeHash, expiresAt);
      await sendPasswordResetCode(user.email, code, user.display_name, PASSWORD_RESET_TTL_MS / 60000);
    }

    res.json({
      sent: true,
      expiresInSeconds: PASSWORD_RESET_TTL_MS / 1000,
      message: "Un code de réinitialisation vient d'être envoyé à cette adresse.",
    });
  } catch (err) {
    console.error("[Auth] Erreur forgot-password :", err.message);
    // Message spécifique si c'est un vrai souci réseau côté serveur (pas de
    // connexion Internet à cet instant) plutôt que le message générique
    // "Erreur serveur." qui n'aide pas l'utilisateur à comprendre quoi faire.
    const message = err.code === "MAIL_NETWORK_ERROR"
      ? "Le serveur n'arrive pas à joindre le service d'email en ce moment (pas de connexion Internet ?). Réessaie dans un instant."
      : "Erreur serveur lors de l'envoi du code. Réessaie dans un instant.";
    res.status(500).json({ error: message });
  }
});

router.post("/reset-password", forgotPasswordLimiter, async (req, res) => {
  try {
    const { email, code, newPassword } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Adresse email invalide." });
    }
    if (!code || !/^[0-9]{6}$/.test(code)) {
      return res.status(400).json({ error: "Code invalide (6 chiffres attendus)." });
    }
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Le nouveau mot de passe doit faire au moins 8 caractères." });
    }

    const result = await verifyPasswordResetCode(email, hashToken(code));
    if (!result.ok) {
      const messages = {
        invalid: "Code incorrect.",
        expired: "Ce code a expiré. Redemande-en un nouveau.",
      };
      return res.status(400).json({ error: messages[result.reason] || "Code invalide." });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    await resetPasswordAndClearCode(result.userId, newPasswordHash);
    res.json({ success: true });
  } catch (err) {
    console.error("[Auth] Erreur reset-password :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Mot de passe actuel et nouveau mot de passe requis." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 8 caractères." });
    }

    const currentHash = await getPasswordHash(req.userId);
    if (!currentHash) return res.status(404).json({ error: "Utilisateur introuvable." });

    const valid = await bcrypt.compare(currentPassword, currentHash);
    if (!valid) return res.status(401).json({ error: "Mot de passe actuel incorrect." });

    const newHash = await bcrypt.hash(newPassword, 12);
    await updatePassword(req.userId, newHash);
    res.json({ success: true });
  } catch (err) {
    console.error("[Auth] Erreur changement de mot de passe :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/me/avatar/upload", requireAuth, avatarLimiter, (req, res) => {
  avatarUpload.single("avatar")(req, res, async (err) => {
    if (err) {
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? "Image trop lourde (4 Mo maximum)."
        : err.message || "Impossible de traiter cette image.";
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: "Aucune image reçue." });

    try {
      const previousUser = await getUserById(req.userId);
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      const user = await updateAvatar(req.userId, avatarUrl);
      // Nettoie l'ancienne photo perso si elle existe, pour ne pas accumuler
      // des fichiers orphelins sur le disque à chaque changement.
      deleteLocalAvatarIfAny(previousUser?.avatar_url);
      res.json({ user });
    } catch (dbErr) {
      console.error("[Auth] Erreur enregistrement avatar :", dbErr.message);
      res.status(500).json({ error: "Erreur serveur lors de l'enregistrement de la photo." });
    }
  });
});

router.post("/me/avatar/offline", requireAuth, avatarLimiter, async (req, res) => {
  try {
    const { seed } = req.body || {};
    if (!seed || typeof seed !== "string" || seed.length > 60 || !/^[a-zA-Z0-9_-]+$/.test(seed)) {
      return res.status(400).json({ error: "Graine d'avatar invalide." });
    }

    // Marqueur spécial (pas une vraie URL) : "offline:<graine>". Le
    // frontend reconnaît ce préfixe et régénère l'avatar localement via
    // OfflineAvatar.jsx — un simple motif géométrique déterministe dessiné
    // en SVG, sans AUCUN appel réseau, ni au moment du choix ni ensuite.
    // Volontairement accessible à tous les comptes (pas de restriction
    // Premium) : c'est justement l'option "sans contrainte, sans connexion".
    const avatarUrl = `offline:${seed}`;

    const previousUser = await getUserById(req.userId);
    const user = await updateAvatar(req.userId, avatarUrl);
    deleteLocalAvatarIfAny(previousUser?.avatar_url);
    res.json({ user });
  } catch (err) {
    console.error("[Auth] Erreur avatar hors-ligne :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/me/avatar/preset", requireAuth, avatarLimiter, async (req, res) => {
  try {
    const { style, seed } = req.body || {};
    if (!AVATAR_STYLES.includes(style)) {
      return res.status(400).json({ error: "Style d'avatar inconnu." });
    }
    if (!seed || typeof seed !== "string" || seed.length > 60) {
      return res.status(400).json({ error: "Graine d'avatar invalide." });
    }
    if (PREMIUM_AVATAR_STYLES.includes(style)) {
      const requester = await getUserById(req.userId);
      const hasPremiumAccess = resolveEffectivePremium(requester, req);
      if (!hasPremiumAccess) {
        return res.status(403).json({ error: "Ce style d'avatar est réservé aux comptes Premium." });
      }
    }

    // DiceBear (https://www.dicebear.com) est un vrai service public open
    // source de génération d'avatars — l'image est générée à la volée par
    // leur API à partir du style + de la graine choisis, ce n'est pas un
    // avatar inventé/statique.
    const avatarUrl = `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

    const previousUser = await getUserById(req.userId);
    const user = await updateAvatar(req.userId, avatarUrl);
    deleteLocalAvatarIfAny(previousUser?.avatar_url);
    res.json({ user });
  } catch (err) {
    console.error("[Auth] Erreur avatar prédéfini :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.delete("/me/avatar", requireAuth, async (req, res) => {
  try {
    const previousUser = await getUserById(req.userId);
    const user = await updateAvatar(req.userId, null);
    deleteLocalAvatarIfAny(previousUser?.avatar_url);
    res.json({ user });
  } catch (err) {
    console.error("[Auth] Erreur suppression avatar :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.delete("/me", requireAuth, async (req, res) => {
  try {
    await deleteUser(req.userId);
    res.json({ success: true });
  } catch (err) {
    console.error("[Auth] Erreur suppression de compte :", err.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;
