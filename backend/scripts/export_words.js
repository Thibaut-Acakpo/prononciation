// À lancer UNE FOIS en local : node scripts/export_words.js
// Crée backend/words.json à partir du lexique Python, pour que le serveur
// puisse répondre à /api/words sans Python (cas de Render, version gratuite).

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const python = process.env.PYTHON_PATH || "python";
const pythonDir = path.join(__dirname, "..", "python");

const result = spawnSync(
  python,
  [path.join(pythonDir, "analyze_request.py"), "--list-words"],
  {
    cwd: pythonDir,
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", LANG: "C.UTF-8" },
  }
);

if (result.error) {
  console.error("Impossible de lancer Python :", result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error("Python a échoué (code " + result.status + ") :\n" + result.stderr);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(result.stdout.trim());
} catch (e) {
  console.error("La sortie de Python n'est pas du JSON valide :", e.message);
  console.error(result.stdout.slice(0, 300));
  process.exit(1);
}

const outFile = path.join(__dirname, "..", "words.json");
fs.writeFileSync(outFile, JSON.stringify(parsed), "utf8");

const count = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
console.log(`words.json créé : ${count} entrées (${outFile}).`);
