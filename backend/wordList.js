/**
 * Liste canonique des 80 mots reconnus par l'application, côté serveur.
 *
 * Sécurité (audit) : avant, n'importe quel texte envoyé comme "expectedWord"
 * à /api/analyze, ou comme mot proposé dans un salon Match, était accepté
 * sans vérification. Un client malveillant pouvait donc :
 * - faire perdre du temps CPU au worker Whisper sur du texte arbitraire,
 * - injecter une chaîne type "=1+1" ou "@SUM(...)" qui, une fois stockée
 *   dans l'historique puis exportée en CSV, s'exécuterait comme une formule
 *   à l'ouverture du fichier dans Excel/Google Sheets ("CSV injection").
 *
 * En validant contre cette liste fermée, ces deux problèmes disparaissent
 * d'un coup : impossible d'envoyer autre chose qu'un des 80 mots prévus.
 *
 * IMPORTANT : garder cette liste synchronisée avec
 * frontend/src/lib/words.js (YOLO_CLASSES) si elle évolue un jour.
 */
const VALID_WORDS = new Set([
  "person","bicycle","car","motorcycle","airplane","bus","train","truck","boat",
  "traffic light","fire hydrant","stop sign","parking meter","bench","bird","cat",
  "dog","horse","sheep","cow","elephant","bear","zebra","giraffe","backpack",
  "umbrella","handbag","tie","suitcase","frisbee","skis","snowboard","sports ball",
  "kite","baseball bat","baseball glove","skateboard","surfboard","tennis racket",
  "bottle","wine glass","cup","fork","knife","spoon","bowl","banana","apple",
  "sandwich","orange","broccoli","carrot","hot dog","pizza","donut","cake",
  "chair","couch","potted plant","bed","dining table","toilet","tv","laptop",
  "mouse","remote","keyboard","cell phone","microwave","oven","toaster","sink",
  "refrigerator","book","clock","vase","scissors","teddy bear","hair drier","toothbrush",
]);

function isValidWord(word) {
  return typeof word === "string" && VALID_WORDS.has(word.toLowerCase().trim());
}

/**
 * Validation permissive pour le mode "Taper n'importe quel mot" : contrairement
 * à isValidWord() (liste fermée des 80 objets, utilisée pour la caméra et le
 * Match), celle-ci accepte n'importe quel mot anglais plausible.
 *
 * Sécurité : on n'autorise que des lettres, apostrophes et tirets — ça
 * élimine à la fois l'injection de formule CSV (aucun caractère =, +, -, @
 * en tête n'est possible) et toute tentative d'envoyer autre chose qu'un
 * mot. Longueur plafonnée pour éviter d'envoyer un pavé de texte au worker.
 */
const FREE_WORD_RE = /^[a-zA-Z][a-zA-Z'-]{0,29}$/;

function isValidFreeWord(word) {
  return typeof word === "string" && FREE_WORD_RE.test(word.trim());
}

/**
 * Mot du jour, déterministe : la même date donne toujours le même mot, pour
 * tout le monde, sans avoir besoin de stocker quoi que ce soit en base — un
 * simple hash du texte de la date (format YYYY-MM-DD) modulo le nombre de
 * mots. Recalculé côté client de la même façon (voir frontend/src/lib/words.js)
 * pour affichage immédiat sans aller-retour serveur si besoin.
 */
function getWordOfTheDay(dateStr) {
  const words = Array.from(VALID_WORDS);
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return words[hash % words.length];
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" en UTC
}

module.exports = { VALID_WORDS, isValidWord, isValidFreeWord, getWordOfTheDay, todayDateString };
