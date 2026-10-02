/**
 * Sauvegarde automatique de la base de données MySQL.
 *
 * Utilise `mysqldump` (fourni avec toute installation MySQL/MariaDB — déjà
 * sur ta machine si le serveur MySQL y est installé) pour produire un vrai
 * export SQL complet et restaurable, compressé en .gz pour rester léger.
 *
 * Usage :
 *   node scripts/backup_db.js
 *
 * Les sauvegardes sont écrites dans backend/backups/ (créé automatiquement,
 * déjà ignoré par git — voir .gitignore) et les fichiers de plus de
 * BACKUP_RETENTION_DAYS jours sont supprimés automatiquement à chaque
 * exécution, pour ne pas remplir le disque indéfiniment.
 */

require("dotenv").config();
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const BACKUP_DIR = path.join(__dirname, "..", "backups");
const RETENTION_MONTHS = Number(process.env.BACKUP_RETENTION_MONTHS) || 3;

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = process.env.DB_PORT || "3306";
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "prononciation";
const MYSQLDUMP_PATH = process.env.MYSQLDUMP_PATH || "mysqldump";

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function getRetentionCutoff(now = new Date()) {
  const cutoff = new Date(now);
  const day = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);
  const lastDay = new Date(Date.UTC(
    cutoff.getUTCFullYear(),
    cutoff.getUTCMonth() + 1,
    0
  )).getUTCDate();
  cutoff.setUTCDate(Math.min(day, lastDay));
  return cutoff.getTime();
}

function runBackup() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const outPath = path.join(BACKUP_DIR, `${DB_NAME}-${timestamp()}.sql.gz`);
  const args = [
    `-h${DB_HOST}`, `-P${DB_PORT}`, `-u${DB_USER}`,
    "--skip-lock-tables",
    DB_NAME,
  ];
  // Le mot de passe n'est PAS passé en argument de ligne de commande (visible
  // dans la liste des processus système) — on le transmet via une variable
  // d'environnement dédiée que mysqldump sait lire (MYSQL_PWD).
  const env = { ...process.env, MYSQL_PWD: DB_PASSWORD };

  console.log(`[Backup] Démarrage de la sauvegarde de "${DB_NAME}"…`);

  return new Promise((resolve, reject) => {
    const dump = spawn(MYSQLDUMP_PATH, args, { env });
    const gzip = zlib.createGzip();
    const outStream = fs.createWriteStream(outPath);
    let stderr = "";
    let dumpCode = null;
    let streamFinished = false;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      dump.kill();
      outStream.destroy();
      try { fs.unlinkSync(outPath); } catch (_) {}
      reject(error);
    };

    const finishIfReady = () => {
      if (settled || dumpCode === null || !streamFinished) return;
      if (dumpCode !== 0) {
        fail(new Error(`mysqldump a échoué (code ${dumpCode}) : ${stderr.trim()}`));
        return;
      }

      settled = true;
      const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
      console.log(`[Backup] ✅ Sauvegarde créée : ${outPath} (${sizeKb} Ko)`);
      cleanupOldBackups();
      resolve(outPath);
    };

    dump.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    dump.on("error", (err) => {
      fail(new Error(
        "Impossible de lancer mysqldump. Vérifie qu'il est installé et accessible " +
        `dans le PATH (fourni avec MySQL/MariaDB) : ${err.message}`
      ));
    });
    dump.on("close", (code) => {
      dumpCode = code;
      finishIfReady();
    });
    gzip.on("error", fail);
    outStream.on("error", fail);
    outStream.on("finish", () => {
      streamFinished = true;
      finishIfReady();
    });

    dump.stdout.pipe(gzip).pipe(outStream);
  });
}

function cleanupOldBackups() {
  const cutoff = getRetentionCutoff();
  for (const file of fs.readdirSync(BACKUP_DIR)) {
    if (!file.endsWith(".sql.gz")) continue;
    const filePath = path.join(BACKUP_DIR, file);
    if (fs.statSync(filePath).mtimeMs < cutoff) {
      fs.unlinkSync(filePath);
      console.log(`[Backup] 🗑️  Ancienne sauvegarde supprimée (> ${RETENTION_MONTHS} mois) : ${file}`);
    }
  }
}

if (require.main === module) {
  runBackup().catch((err) => {
    console.error(`[Backup] ❌ ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { runBackup, getRetentionCutoff };
