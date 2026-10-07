// À lancer UNE FOIS, depuis le dossier "frontend" :   node download_models.js
//
// Télécharge les modèles de détection (objets coco-ssd + main MediaPipe) dans
// public/models/ pour que l'application les serve elle-même, au lieu de les
// charger depuis Google (storage.googleapis.com) et TF Hub (tfhub.dev) à
// chaque installation. Un fichier déjà téléchargé est ignoré : on peut
// relancer le script après une coupure de connexion.

const fs = require("fs");
const path = require("path");

const MODELS = [
  {
    name: "Détection d'objets (coco-ssd)",
    modelJson: "https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json",
    suffix: "",
    out: "public/models/coco-ssd",
  },
  {
    name: "Main : détecteur (MediaPipe)",
    modelJson: "https://tfhub.dev/mediapipe/tfjs-model/handpose_3d/detector/lite/1/model.json",
    suffix: "?tfjs-format=file",
    out: "public/models/handpose/detector",
  },
  {
    name: "Main : points de repère (MediaPipe)",
    modelJson: "https://tfhub.dev/mediapipe/tfjs-model/handpose_3d/landmark/lite/1/model.json",
    suffix: "?tfjs-format=file",
    out: "public/models/handpose/landmark",
  },
];

const MAX_ATTEMPTS = 4;
const TIMEOUT_MS = 10 * 60 * 1000; // 10 min par fichier : la connexion peut être lente

async function download(url, destination) {
  if (fs.existsSync(destination) && fs.statSync(destination).size > 0) {
    console.log(`   déjà présent : ${path.basename(destination)}`);
    return;
  }
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length === 0) throw new Error("fichier vide");
      fs.writeFileSync(destination, data);
      console.log(`   OK  ${path.basename(destination)}  (${(data.length / 1048576).toFixed(2)} Mo)`);
      return;
    } catch (err) {
      console.log(`   essai ${attempt}/${MAX_ATTEMPTS} échoué pour ${path.basename(destination)} : ${err.message}`);
      if (attempt === MAX_ATTEMPTS) throw err;
    }
  }
}

async function main() {
  for (const model of MODELS) {
    console.log(`\n${model.name}`);
    fs.mkdirSync(model.out, { recursive: true });

    const modelJsonPath = path.join(model.out, "model.json");
    await download(model.modelJson + model.suffix, modelJsonPath);

    // Les morceaux de poids ("shards") à télécharger sont listés dans model.json.
    const manifest = JSON.parse(fs.readFileSync(modelJsonPath, "utf8"));
    const baseUrl = model.modelJson.slice(0, model.modelJson.lastIndexOf("/") + 1);
    const shardPaths = (manifest.weightsManifest || []).flatMap((group) => group.paths);

    for (const shard of shardPaths) {
      await download(baseUrl + shard + model.suffix, path.join(model.out, shard));
    }
  }
  console.log("\nTerminé. Les modèles sont dans public/models/.");
}

main().catch((err) => {
  console.error("\nÉCHEC :", err.message);
  console.error("Relance simplement la commande : les fichiers déjà téléchargés seront conservés.");
  process.exit(1);
});
