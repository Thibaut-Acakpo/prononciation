/**
 * Couche base de données — MySQL via mysql2 (pool de connexions + promesses).
 *
 * Différence importante avec l'ancienne version SQLite : mysql2 est
 * ASYNCHRONE. Toutes les fonctions ci-dessous retournent des Promises et
 * doivent être appelées avec `await` — contrairement à better-sqlite3 qui
 * était synchrone. C'est pour ça que les routes qui utilisent ce fichier
 * (auth.routes.js, history.routes.js) et server.js ont aussi été mises à jour.
 *
 * Ce fichier ne contient QUE l'accès aux données. Aucune logique HTTP ici.
 */

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "parollle",
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // évite les conversions de fuseau horaire surprises côté JS
});

// ── Création des tables si elles n'existent pas encore ──────────────────────
// Ne crée PAS la base de données elle-même : MySQL exige un utilisateur avec
// les droits CREATE DATABASE, ce qui n'est pas toujours le cas en production.
// Il faut créer la base une fois manuellement (voir README) ; ce script se
// contente de créer les tables à l'intérieur si elles manquent.
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      email         VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      display_name  VARCHAR(255),
      role          VARCHAR(20) NOT NULL DEFAULT 'user',
      avatar_url    VARCHAR(500),
      created_at    DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP())
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Migration rétroactive si la table existait déjà avant l'ajout du rôle.
  const [userColumns] = await pool.query(`SHOW COLUMNS FROM users`);
  if (!userColumns.some((c) => c.Field === "role")) {
    await pool.query(`ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'`);
  }
  // Migration rétroactive : photo de profil (upload perso ou avatar prédéfini).
  if (!userColumns.some((c) => c.Field === "avatar_url")) {
    await pool.query(`ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500)`);
  }
  // Migration rétroactive : confirmation d'email. Les comptes déjà existants
  // sont considérés "vérifiés" d'office (impossible de leur demander
  // rétroactivement de confirmer un email pour une fonctionnalité qui
  // n'existait pas à leur inscription) — seuls les NOUVEAUX comptes créés
  // après cette mise à jour devront confirmer leur adresse (voir createUser).
  if (!userColumns.some((c) => c.Field === "email_verified")) {
    await pool.query(`ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 1`);
  }
  if (!userColumns.some((c) => c.Field === "email_verify_token_hash")) {
    await pool.query(`ALTER TABLE users ADD COLUMN email_verify_token_hash VARCHAR(64)`);
  }
  if (!userColumns.some((c) => c.Field === "email_verify_expires")) {
    await pool.query(`ALTER TABLE users ADD COLUMN email_verify_expires DATETIME`);
  }
  // Migration rétroactive : statut Premium (débloqué via un paiement Mobile
  // Money FedaPay unique — voir routes/premium.routes.js).
  if (!userColumns.some((c) => c.Field === "is_premium")) {
    await pool.query(`ALTER TABLE users ADD COLUMN is_premium TINYINT(1) NOT NULL DEFAULT 0`);
  }
  if (!userColumns.some((c) => c.Field === "premium_since")) {
    await pool.query(`ALTER TABLE users ADD COLUMN premium_since DATETIME`);
  }
  // Migration rétroactive : numéro de téléphone (optionnel, saisi dans le
  // profil) — sert uniquement à proposer la réception du code de
  // réinitialisation de mot de passe par WhatsApp en plus de l'email.
  if (!userColumns.some((c) => c.Field === "phone_number")) {
    await pool.query(`ALTER TABLE users ADD COLUMN phone_number VARCHAR(20)`);
  }
  // Migration rétroactive : réinitialisation de mot de passe par code (email
  // ou WhatsApp) — même logique de hachage que la confirmation d'email :
  // on ne stocke jamais le code en clair, seulement son empreinte SHA-256.
  if (!userColumns.some((c) => c.Field === "password_reset_code_hash")) {
    await pool.query(`ALTER TABLE users ADD COLUMN password_reset_code_hash VARCHAR(64)`);
  }
  if (!userColumns.some((c) => c.Field === "password_reset_expires")) {
    await pool.query(`ALTER TABLE users ADD COLUMN password_reset_expires DATETIME`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS premium_transactions (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      user_id             INT NOT NULL,
      fedapay_transaction_id VARCHAR(64) NOT NULL,
      amount              INT NOT NULL,
      currency            VARCHAR(10) NOT NULL DEFAULT 'XOF',
      status              VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at          DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
      updated_at          DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()) ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_fedapay_tx (fedapay_transaction_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Suivi des "installations" de l'app (PWA ajoutée à l'écran d'accueil).
  // Un seul événement par appareil/navigateur (voir logique côté frontend
  // dans InstallAnalytics.jsx : déclenché la 1ère fois que l'app est ouverte
  // en mode "standalone", pas à chaque ouverture).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_installs (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     INT NULL,
      platform    VARCHAR(20),
      user_agent  VARCHAR(500),
      created_at  DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Promotion automatique des comptes administrateurs configurés via
  // ADMIN_EMAILS (backend/.env) — voir la fonction ensureConfiguredAdmins()
  // plus bas, appelée juste après la création/migration du schéma.

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tentatives (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      user_id          INT NOT NULL,
      expected_word    VARCHAR(255) NOT NULL,
      recognized_text  VARCHAR(255),
      jaccard          FLOAT,
      cosine           FLOAT,
      per              FLOAT,
      verdict          VARCHAR(255),
      alignment_json   JSON NULL,
      is_daily_challenge TINYINT(1) NOT NULL DEFAULT 0,
      created_at       DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
      INDEX idx_tentatives_user (user_id, created_at),
      INDEX idx_tentatives_daily (is_daily_challenge, created_at),
      CONSTRAINT fk_tentatives_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Ajout rétroactif des colonnes si la table existait déjà avant cette
  // mise à jour (ALTER TABLE ... IF NOT EXISTS n'existe pas nativement en
  // MySQL avant la 8.0.29 — on vérifie donc manuellement).
  const [existingColumns] = await pool.query(`SHOW COLUMNS FROM tentatives`);
  const columnNames = existingColumns.map((c) => c.Field);
  if (!columnNames.includes("alignment_json")) {
    await pool.query(`ALTER TABLE tentatives ADD COLUMN alignment_json JSON NULL`);
  }
  if (!columnNames.includes("is_daily_challenge")) {
    await pool.query(`ALTER TABLE tentatives ADD COLUMN is_daily_challenge TINYINT(1) NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE tentatives ADD INDEX idx_tentatives_daily (is_daily_challenge, created_at)`);
  }

  // Correction (audit — décalage horaire affiché) : les tables créées avant
  // ce correctif utilisaient DEFAULT CURRENT_TIMESTAMP, qui dépend du fuseau
  // horaire CONFIGURÉ SUR LE SERVEUR MySQL (souvent déjà l'heure locale de
  // la machine, pas l'UTC) — alors que le frontend suppose toujours de
  // l'UTC pour convertir vers l'heure locale de l'utilisateur (voir
  // `new Date(created_at + "Z")` dans HistoryScreen.jsx). Ce mélange
  // provoquait un décalage d'heure à l'affichage. On force donc explicitement
  // UTC_TIMESTAMP() ici, pour les tables déjà existantes aussi.
  await pool.query(`ALTER TABLE users MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP())`);
  await pool.query(`ALTER TABLE tentatives MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP())`);

  // ── Mode Match (défi en temps réel entre utilisateurs) ─────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      room_code    VARCHAR(12) NOT NULL,
      word         VARCHAR(255) NOT NULL,
      created_by   INT NOT NULL,
      created_at   DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
      finished_at  DATETIME NULL,
      CONSTRAINT fk_matches_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await pool.query(`ALTER TABLE matches MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP())`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_participants (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      match_id         INT NOT NULL,
      user_id          INT NOT NULL,
      turn_order       INT NOT NULL,
      per              FLOAT,
      recognized_text  VARCHAR(255),
      verdict          VARCHAR(255),
      placement        INT NULL COMMENT '1 = or, 2 = argent, 3 = bronze, NULL = pas classé',
      INDEX idx_match_participants_user (user_id),
      CONSTRAINT fk_match_participants_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      CONSTRAINT fk_match_participants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log("[DB] Schéma MySQL vérifié/créé.");

  await ensureConfiguredAdmins();
}

/**
 * Promeut automatiquement en administrateur tout compte dont l'email
 * correspond à la variable d'environnement ADMIN_EMAILS (backend/.env,
 * séparés par des virgules). Appelée à chaque démarrage du serveur — si le
 * compte n'existe pas encore, rien ne se passe (il sera promu dès sa
 * création, tant que la variable reste configurée).
 */
async function ensureConfiguredAdmins() {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return;

  const emails = raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0) return;

  const placeholders = emails.map(() => "?").join(",");
  const [result] = await pool.query(
    `UPDATE users SET role = 'admin' WHERE email IN (${placeholders}) AND role != 'admin'`,
    emails
  );
  if (result.affectedRows > 0) {
    console.log(`[DB] ${result.affectedRows} compte(s) promu(s) administrateur via ADMIN_EMAILS.`);
  }
}

// ── Utilisateurs ──────────────────────────────────────────────────────────

async function createUser({ email, passwordHash, displayName, emailVerifyTokenHash, emailVerifyExpires }) {
  const normalizedEmail = email.toLowerCase().trim();
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const role = adminEmails.includes(normalizedEmail) ? "admin" : "user";

  const [result] = await pool.query(
    `INSERT INTO users (email, password_hash, display_name, role, email_verified, email_verify_token_hash, email_verify_expires)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
    [normalizedEmail, passwordHash, displayName || null, role, emailVerifyTokenHash || null, emailVerifyExpires || null]
  );
  return getUserById(result.insertId);
}

async function getUserByEmail(email) {
  const [rows] = await pool.query(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
  return rows[0] || null;
}

// Email du super-administrateur (voir routes/admin.routes.js pour
// l'application réelle des règles de hiérarchie) — calculé ici aussi pour
// que CHAQUE objet utilisateur renvoyé au frontend (soi-même via /me, ou un
// autre utilisateur via l'écran détail admin) porte l'information
// `is_super_admin`, utile pour adapter l'interface (griser des actions
// interdites) sans dupliquer cette logique partout côté frontend.
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || "acakpothibaut2@gmail.com").toLowerCase();

async function getUserById(id) {
  const [rows] = await pool.query(
    `SELECT id, email, display_name, role, avatar_url, email_verified, is_premium, premium_since, phone_number, created_at FROM users WHERE id = ?`,
    [id]
  );
  const user = rows[0];
  if (!user) return null;
  return { ...user, is_super_admin: user.email.toLowerCase() === SUPER_ADMIN_EMAIL };
}

async function updateDisplayName(id, displayName) {
  await pool.query(`UPDATE users SET display_name = ? WHERE id = ?`, [displayName, id]);
  return getUserById(id);
}

async function updateAvatar(id, avatarUrl) {
  await pool.query(`UPDATE users SET avatar_url = ? WHERE id = ?`, [avatarUrl, id]);
  return getUserById(id);
}

// ── Confirmation d'email ─────────────────────────────────────────────────────
// On ne stocke jamais le token en clair : seul son empreinte SHA-256 est en
// base (comme un mot de passe). Le lien envoyé par email contient le token
// brut ; à la vérification, on hash ce qui arrive et on compare — ainsi,
// même un accès en lecture à la base ne permet pas de forger un lien valide.

async function setEmailVerifyToken(userId, tokenHash, expiresAt) {
  await pool.query(
    `UPDATE users SET email_verify_token_hash = ?, email_verify_expires = ? WHERE id = ?`,
    [tokenHash, expiresAt, userId]
  );
}

async function verifyEmailByTokenHash(tokenHash) {
  const [rows] = await pool.query(
    `SELECT id, email_verify_expires FROM users WHERE email_verify_token_hash = ? LIMIT 1`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: "not_found" };
  if (!row.email_verify_expires || new Date(row.email_verify_expires + "Z") < new Date()) {
    return { ok: false, reason: "expired" };
  }
  await pool.query(
    `UPDATE users SET email_verified = 1, email_verify_token_hash = NULL, email_verify_expires = NULL WHERE id = ?`,
    [row.id]
  );
  return { ok: true, userId: row.id };
}

async function isEmailAlreadyVerified(userId) {
  const [rows] = await pool.query(`SELECT email_verified FROM users WHERE id = ?`, [userId]);
  return Boolean(rows[0]?.email_verified);
}

// ── Réinitialisation de mot de passe par code ───────────────────────────────

async function updatePhoneNumber(userId, phoneNumber) {
  await pool.query(`UPDATE users SET phone_number = ? WHERE id = ?`, [phoneNumber, userId]);
  return getUserById(userId);
}

async function setPasswordResetCode(userId, codeHash, expiresAt) {
  await pool.query(
    `UPDATE users SET password_reset_code_hash = ?, password_reset_expires = ? WHERE id = ?`,
    [codeHash, expiresAt, userId]
  );
}

async function verifyPasswordResetCode(email, codeHash) {
  const [rows] = await pool.query(
    `SELECT id, password_reset_expires FROM users
     WHERE email = ? AND password_reset_code_hash = ? LIMIT 1`,
    [email.toLowerCase().trim(), codeHash]
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: "invalid" };
  if (!row.password_reset_expires || new Date(row.password_reset_expires + "Z") < new Date()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, userId: row.id };
}

async function resetPasswordAndClearCode(userId, newPasswordHash) {
  await pool.query(
    `UPDATE users SET password_hash = ?, password_reset_code_hash = NULL, password_reset_expires = NULL WHERE id = ?`,
    [newPasswordHash, userId]
  );
}

// ── Premium (paiement Mobile Money via FedaPay) ─────────────────────────────

async function createPremiumTransaction(userId, fedapayTransactionId, amount, currency) {
  await pool.query(
    `INSERT INTO premium_transactions (user_id, fedapay_transaction_id, amount, currency, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [userId, fedapayTransactionId, amount, currency]
  );
}

async function getPremiumTransaction(fedapayTransactionId) {
  const [rows] = await pool.query(
    `SELECT * FROM premium_transactions WHERE fedapay_transaction_id = ?`,
    [fedapayTransactionId]
  );
  return rows[0] || null;
}

// Marque une transaction comme confirmée ET passe l'utilisateur en Premium,
// dans une seule transaction SQL — soit les deux réussissent, soit aucune
// (on ne veut jamais un paiement "approved" sans que le compte soit passé
// Premium, ni l'inverse).
async function markPremiumTransactionApproved(fedapayTransactionId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT * FROM premium_transactions WHERE fedapay_transaction_id = ? FOR UPDATE`,
      [fedapayTransactionId]
    );
    const tx = rows[0];
    if (!tx) { await conn.rollback(); return { ok: false, reason: "not_found" }; }
    if (tx.status === "approved") { await conn.commit(); return { ok: true, alreadyProcessed: true, userId: tx.user_id }; }

    await conn.query(`UPDATE premium_transactions SET status = 'approved' WHERE id = ?`, [tx.id]);
    await conn.query(
      `UPDATE users SET is_premium = 1, premium_since = UTC_TIMESTAMP() WHERE id = ?`,
      [tx.user_id]
    );
    await conn.commit();
    return { ok: true, alreadyProcessed: false, userId: tx.user_id };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function markPremiumTransactionFailed(fedapayTransactionId) {
  await pool.query(
    `UPDATE premium_transactions SET status = 'failed' WHERE fedapay_transaction_id = ?`,
    [fedapayTransactionId]
  );
}

async function getPasswordHash(id) {
  const [rows] = await pool.query(`SELECT password_hash FROM users WHERE id = ?`, [id]);
  return rows[0]?.password_hash || null;
}

async function updatePassword(id, newPasswordHash) {
  await pool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [newPasswordHash, id]);
}

async function deleteUser(id) {
  await pool.query(`DELETE FROM users WHERE id = ?`, [id]); // ON DELETE CASCADE supprime aussi les tentatives
}

// ── Historique de prononciation ───────────────────────────────────────────

async function recordAttempt({ userId, expectedWord, recognizedText, jaccard, cosine, per, verdict, alignment, isDailyChallenge }) {
  const [result] = await pool.query(
    `INSERT INTO tentatives (user_id, expected_word, recognized_text, jaccard, cosine, per, verdict, alignment_json, is_daily_challenge)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId, expectedWord, recognizedText || "", jaccard ?? 0, cosine ?? 0, per ?? 0, verdict || "",
      alignment ? JSON.stringify(alignment) : null,
      isDailyChallenge ? 1 : 0,
    ]
  );
  const [rows] = await pool.query(`SELECT * FROM tentatives WHERE id = ?`, [result.insertId]);
  return rows[0];
}

async function getHistoryForUser(userId, { limit = 50, offset = 0 } = {}) {
  const [rows] = await pool.query(
    `SELECT id, expected_word, recognized_text, jaccard, cosine, per, verdict, created_at
     FROM tentatives WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, Number(limit), Number(offset)]
  );
  return rows;
}

// Condition de déblocage du mode Match : voir MATCH_MIN_ATTEMPTS dans
// realtime.js pour la valeur du seuil et l'explication du choix.
async function getUserPracticeStats(userId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count, AVG(per) AS avgPer FROM tentatives WHERE user_id = ?`,
    [userId]
  );
  const row = rows[0] || {};
  return {
    count: Number(row.count) || 0,
    avgPer: row.avgPer != null ? Number(row.avgPer) : null,
  };
}

async function getProgressSummary(userId) {
  const [rows] = await pool.query(
    `SELECT expected_word,
            COUNT(*)        AS attempts,
            AVG(per)        AS avg_per,
            MIN(per)        AS best_per,
            MAX(created_at) AS last_attempt
     FROM tentatives WHERE user_id = ?
     GROUP BY expected_word
     ORDER BY last_attempt DESC`,
    [userId]
  );
  return rows;
}

// ── Mode Match ────────────────────────────────────────────────────────────

async function saveFinishedMatch({ roomCode, word, createdBy, participants }) {
  // `participants` : liste ordonnée par classement, ex.
  // [{ userId, per, recognizedText, verdict }, ...]
  const [matchResult] = await pool.query(
    `INSERT INTO matches (room_code, word, created_by, finished_at) VALUES (?, ?, ?, UTC_TIMESTAMP())`,
    [roomCode, word, createdBy]
  );
  const matchId = matchResult.insertId;

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    const placement = i < 3 ? i + 1 : null; // médaille seulement pour le top 3
    await pool.query(
      `INSERT INTO match_participants (match_id, user_id, turn_order, per, recognized_text, verdict, placement)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [matchId, p.userId, i + 1, p.per ?? null, p.recognizedText || "", p.verdict || "", placement]
    );
  }

  return matchId;
}

async function getUserTrophies(userId) {
  const [rows] = await pool.query(
    `SELECT
       SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) AS gold,
       SUM(CASE WHEN placement = 2 THEN 1 ELSE 0 END) AS silver,
       SUM(CASE WHEN placement = 3 THEN 1 ELSE 0 END) AS bronze,
       COUNT(*) AS totalMatches
     FROM match_participants WHERE user_id = ?`,
    [userId]
  );
  const row = rows[0] || {};
  return {
    gold: Number(row.gold) || 0,
    silver: Number(row.silver) || 0,
    bronze: Number(row.bronze) || 0,
    totalMatches: Number(row.totalMatches) || 0,
  };
}

async function getMatchHistoryForUser(userId, { limit = 20 } = {}) {
  const [rows] = await pool.query(
    `SELECT m.id, m.word, m.room_code, m.finished_at,
            mp.per, mp.verdict, mp.placement
     FROM match_participants mp
     JOIN matches m ON m.id = mp.match_id
     WHERE mp.user_id = ?
     ORDER BY m.finished_at DESC
     LIMIT ?`,
    [userId, Number(limit)]
  );
  return rows;
}

// ── Défi quotidien ────────────────────────────────────────────────────────

async function getDailyChallengeLeaderboard(word, dateStr, { limit = 20 } = {}) {
  // Meilleur score (PER le plus bas) par utilisateur pour le mot du jour —
  // un utilisateur peut réessayer plusieurs fois, seul son meilleur essai
  // du jour compte dans le classement.
  const [rows] = await pool.query(
    `SELECT u.display_name, u.email, MIN(t.per) AS best_per, t.user_id
     FROM tentatives t
     JOIN users u ON u.id = t.user_id
     WHERE t.is_daily_challenge = 1
       AND t.expected_word = ?
       AND DATE(t.created_at) = ?
     GROUP BY t.user_id
     ORDER BY best_per ASC
     LIMIT ?`,
    [word, dateStr, Number(limit)]
  );
  return rows;
}

async function getUserDailyChallengeStatus(userId, word, dateStr) {
  const [rows] = await pool.query(
    `SELECT MIN(per) AS best_per, COUNT(*) AS attempts
     FROM tentatives
     WHERE user_id = ? AND is_daily_challenge = 1 AND expected_word = ? AND DATE(created_at) = ?`,
    [userId, word, dateStr]
  );
  const row = rows[0] || {};
  return { bestPer: row.best_per != null ? Number(row.best_per) : null, attempts: Number(row.attempts) || 0 };
}

// ── Correction ciblée automatique ──────────────────────────────────────────

async function getRecentAlignments(userId, { limit = 100 } = {}) {
  const [rows] = await pool.query(
    `SELECT alignment_json FROM tentatives
     WHERE user_id = ? AND alignment_json IS NOT NULL
     ORDER BY created_at DESC LIMIT ?`,
    [userId, Number(limit)]
  );
  return rows.map((r) => {
    try { return JSON.parse(r.alignment_json); } catch { return []; }
  });
}

// ── Quota quotidien (compte gratuit) ────────────────────────────────────────
// Compte les analyses faites AUJOURD'HUI (jour calendaire UTC, cohérent avec
// UTC_TIMESTAMP() utilisé pour created_at ailleurs dans ce fichier).
async function countAnalysesToday(userId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM tentatives
     WHERE user_id = ? AND created_at >= UTC_DATE()`,
    [userId]
  );
  return Number(rows[0]?.count) || 0;
}

// ── Progression hebdomadaire (rapport avancé Premium) ───────────────────────
// Regroupe les tentatives par semaine calendaire (ISO, lundi-dimanche) sur
// les `weeks` dernières semaines, avec le taux d'erreur moyen (PER) et le
// nombre de tentatives — sert au graphique de tendance dans le rapport
// Premium (voir PremiumInsightsScreen côté frontend).
async function getWeeklyProgress(userId, weeks = 8) {
  const [rows] = await pool.query(
    `SELECT
       YEARWEEK(created_at, 3) AS year_week,
       MIN(DATE(created_at))   AS week_start,
       COUNT(*)                AS attempts,
       AVG(per)                AS avg_per
     FROM tentatives
     WHERE user_id = ? AND created_at >= DATE_SUB(UTC_DATE(), INTERVAL ? WEEK)
     GROUP BY year_week
     ORDER BY year_week ASC`,
    [userId, Number(weeks)]
  );
  return rows.map((r) => ({
    weekStart: r.week_start,
    attempts: Number(r.attempts),
    avgPer: r.avg_per != null ? Number(r.avg_per) : null,
  }));
}

// ── Administration ──────────────────────────────────────────────────────────

async function getAllUsersForAdmin({ search = "", limit = 100, offset = 0 } = {}) {
  const searchTerm = `%${search.trim()}%`;
  const [rows] = await pool.query(
    `SELECT u.id, u.email, u.display_name, u.role, u.avatar_url, u.email_verified, u.is_premium, u.created_at,
            COUNT(DISTINCT t.id)  AS attempts_count,
            AVG(t.per)            AS avg_per,
            MAX(t.created_at)     AS last_active
     FROM users u
     LEFT JOIN tentatives t ON t.user_id = u.id
     WHERE u.email LIKE ? OR u.display_name LIKE ?
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`,
    [searchTerm, searchTerm, Number(limit), Number(offset)]
  );
  return rows.map((r) => ({ ...r, is_super_admin: r.email.toLowerCase() === SUPER_ADMIN_EMAIL }));
}

async function getUserDetailForAdmin(userId) {
  const user = await getUserById(userId);
  if (!user) return null;

  const history = await getHistoryForUser(userId, { limit: 50 });
  const trophies = await getUserTrophies(userId);
  const stats = await getUserPracticeStats(userId);

  return { user, history, trophies, stats };
}

async function adminUpdateUser(userId, { displayName, role }) {
  const fields = [];
  const values = [];
  if (displayName !== undefined) { fields.push("display_name = ?"); values.push(displayName); }
  if (role !== undefined) { fields.push("role = ?"); values.push(role); }
  if (fields.length === 0) return getUserById(userId);

  values.push(userId);
  await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);
  return getUserById(userId);
}

async function recordAppInstall({ userId, platform, userAgent }) {
  await pool.query(
    `INSERT INTO app_installs (user_id, platform, user_agent) VALUES (?, ?, ?)`,
    [userId || null, (platform || "").slice(0, 20), (userAgent || "").slice(0, 500)]
  );
}

async function getInstallStats() {
  const [[totals]] = await pool.query(
    `SELECT COUNT(*) AS totalInstalls,
            SUM(CASE WHEN created_at >= UTC_DATE() THEN 1 ELSE 0 END) AS installsToday,
            SUM(CASE WHEN created_at >= DATE_SUB(UTC_DATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS installsThisWeek
     FROM app_installs`
  );
  const [byPlatform] = await pool.query(
    `SELECT COALESCE(NULLIF(platform, ''), 'inconnu') AS platform, COUNT(*) AS count
     FROM app_installs GROUP BY platform ORDER BY count DESC`
  );
  return {
    totalInstalls: Number(totals.totalInstalls) || 0,
    installsToday: Number(totals.installsToday) || 0,
    installsThisWeek: Number(totals.installsThisWeek) || 0,
    byPlatform,
  };
}

async function getGlobalStats() {
  const [[userStats]] = await pool.query(
    `SELECT COUNT(*) AS totalUsers,
            SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS totalAdmins,
            SUM(CASE WHEN is_premium = 1 THEN 1 ELSE 0 END) AS totalPremium,
            SUM(CASE WHEN created_at >= UTC_DATE() THEN 1 ELSE 0 END) AS newUsersToday,
            SUM(CASE WHEN created_at >= DATE_SUB(UTC_DATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS newUsersThisWeek
     FROM users`
  );
  const [[attemptStats]] = await pool.query(
    `SELECT COUNT(*) AS totalAttempts,
            AVG(per) AS avgPer,
            SUM(CASE WHEN DATE(created_at) = UTC_DATE() THEN 1 ELSE 0 END) AS attemptsToday
     FROM tentatives`
  );
  const [[matchStats]] = await pool.query(
    `SELECT COUNT(*) AS totalMatches FROM matches WHERE finished_at IS NOT NULL`
  );
  const [[revenueStats]] = await pool.query(
    `SELECT COUNT(*) AS totalPayments, COALESCE(SUM(amount), 0) AS totalRevenue
     FROM premium_transactions WHERE status = 'approved'`
  );
  const [topWords] = await pool.query(
    `SELECT expected_word, COUNT(*) AS count
     FROM tentatives GROUP BY expected_word ORDER BY count DESC LIMIT 5`
  );

  return {
    totalUsers: Number(userStats.totalUsers) || 0,
    totalAdmins: Number(userStats.totalAdmins) || 0,
    totalPremium: Number(userStats.totalPremium) || 0,
    newUsersToday: Number(userStats.newUsersToday) || 0,
    newUsersThisWeek: Number(userStats.newUsersThisWeek) || 0,
    totalAttempts: Number(attemptStats.totalAttempts) || 0,
    avgPer: attemptStats.avgPer != null ? Number(attemptStats.avgPer) : null,
    attemptsToday: Number(attemptStats.attemptsToday) || 0,
    totalMatches: Number(matchStats.totalMatches) || 0,
    totalPayments: Number(revenueStats.totalPayments) || 0,
    totalRevenue: Number(revenueStats.totalRevenue) || 0,
    topWords,
  };
}

// Série temporelle (jour par jour, `days` derniers jours) pour les graphiques
// du tableau de bord admin : nouvelles inscriptions, tentatives d'analyse,
// et nouveaux paiements Premium. Trois requêtes groupées par date puis
// fusionnées en une seule série continue (jours sans donnée = 0, pas
// d'absence de point sur le graphique).
async function getAdminTimeSeries(days = 14) {
  const [signups] = await pool.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS count FROM users
     WHERE created_at >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY) GROUP BY day`,
    [days]
  );
  const [attempts] = await pool.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS count FROM tentatives
     WHERE created_at >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY) GROUP BY day`,
    [days]
  );
  const [premium] = await pool.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS count FROM premium_transactions
     WHERE status = 'approved' AND created_at >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY) GROUP BY day`,
    [days]
  );

  const toMap = (rows) => new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.count)]));
  const signupMap = toMap(signups);
  const attemptMap = toMap(attempts);
  const premiumMap = toMap(premium);

  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    series.push({
      day: key,
      signups: signupMap.get(key) || 0,
      attempts: attemptMap.get(key) || 0,
      premiumPurchases: premiumMap.get(key) || 0,
    });
  }
  return series;
}

async function getPremiumPayments({ limit = 50 } = {}) {
  const [rows] = await pool.query(
    `SELECT pt.id, pt.amount, pt.currency, pt.status, pt.created_at,
            u.id AS user_id, u.email, u.display_name
     FROM premium_transactions pt
     JOIN users u ON u.id = pt.user_id
     ORDER BY pt.created_at DESC LIMIT ?`,
    [Number(limit)]
  );
  return rows;
}

// Accorde/retire manuellement le statut Premium — utile pour un paiement
// reçu par un autre canal (virement direct, espèces...) que le flux FedaPay
// automatique. Action strictement réservée aux administrateurs (voir
// requireAdmin sur la route qui appelle cette fonction).
async function adminSetPremium(userId, isPremium) {
  await pool.query(
    `UPDATE users SET is_premium = ?, premium_since = ${isPremium ? "UTC_TIMESTAMP()" : "premium_since"} WHERE id = ?`,
    [isPremium ? 1 : 0, userId]
  );
  return getUserById(userId);
}

module.exports = {
  pool,
  initSchema,
  createUser,
  getUserByEmail,
  getUserById,
  updateDisplayName,
  updateAvatar,
  setEmailVerifyToken,
  verifyEmailByTokenHash,
  isEmailAlreadyVerified,
  updatePhoneNumber,
  setPasswordResetCode,
  verifyPasswordResetCode,
  resetPasswordAndClearCode,
  createPremiumTransaction,
  getPremiumTransaction,
  markPremiumTransactionApproved,
  markPremiumTransactionFailed,
  recordAppInstall,
  getInstallStats,
  getAdminTimeSeries,
  getPremiumPayments,
  adminSetPremium,
  getPasswordHash,
  updatePassword,
  deleteUser,
  recordAttempt,
  getHistoryForUser,
  getUserPracticeStats,
  getProgressSummary,
  saveFinishedMatch,
  getUserTrophies,
  getMatchHistoryForUser,
  getDailyChallengeLeaderboard,
  getUserDailyChallengeStatus,
  getRecentAlignments,
  countAnalysesToday,
  getWeeklyProgress,
  getAllUsersForAdmin,
  getUserDetailForAdmin,
  adminUpdateUser,
  getGlobalStats,
};
