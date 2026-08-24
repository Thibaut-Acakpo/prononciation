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
 * Planification automatique :
 *   - Windows (PowerShell / Planificateur de tâches) :
 *       schtasks /create /tn "PrononciA+ backup" /tr "node C:\chemin\vers\backend\scripts\backup_db.js" /sc daily /st 03:00
 *   - Linux/macOS (cron), une ligne dans `crontab -e` :
 *       0 3 * * * cd /chemin/vers/backend && node scripts/backup_db.js
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
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS) || 14;

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = process.env.DB_PORT || "3306";
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "prononciation";

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function runBackup() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const outPath = path.join(BACKUP_DIR, `${DB_NAME}-${timestamp()}.sql.gz`);
  const args = [
    `-h${DB_HOST}`, `-P${DB_PORT}`, `-u${DB_USER}`,
    "--single-transaction", "--routines", "--events",
    DB_NAME,
  ];
  // Le mot de passe n'est PAS passé en argument de ligne de commande (visible
  // dans la liste des processus système) — on le transmet via une variable
  // d'environnement dédiée que mysqldump sait lire (MYSQL_PWD).
  const env = { ...process.env, MYSQL_PWD: DB_PASSWORD };

  console.log(`[Backup] Démarrage de la sauvegarde de "${DB_NAME}"…`);
  const dump = spawn("mysqldump", args, { env });

  const gzip = zlib.createGzip();
  const outStream = fs.createWriteStream(outPath);
  dump.stdout.pipe(gzip).pipe(outStream);

  let stderr = "";
  dump.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  dump.on("error", (err) => {
    console.error(
      "[Backup] ❌ Impossible de lancer mysqldump. Vérifie qu'il est installé et accessible " +
      `dans le PATH (fourni avec MySQL/MariaDB) : ${err.message}`
    );
    process.exitCode = 1;
  });

  dump.on("close", (code) => {
    if (code !== 0) {
      console.error(`[Backup] ❌ mysqldump a échoué (code ${code}) : ${stderr.trim()}`);
      fs.existsSync(outPath) && fs.unlinkSync(outPath);
      process.exitCode = 1;
      return;
    }
    const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`[Backup] ✅ Sauvegarde créée : ${outPath} (${sizeKb} Ko)`);
    cleanupOldBackups();
  });
}

function cleanupOldBackups() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(BACKUP_DIR)) {
    if (!file.endsWith(".sql.gz")) continue;
    const filePath = path.join(BACKUP_DIR, file);
    if (fs.statSync(filePath).mtimeMs < cutoff) {
      fs.unlinkSync(filePath);
      console.log(`[Backup] 🗑️  Ancienne sauvegarde supprimée (> ${RETENTION_DAYS} j) : ${file}`);
    }
  }
}

runBackup();
