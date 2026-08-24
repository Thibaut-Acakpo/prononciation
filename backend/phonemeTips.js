/**
 * Conseils d'articulation par phonème anglais (symboles IPA), pensés pour
 * des francophones — chaque son a un piège différent selon la langue
 * maternelle, donc ces conseils ciblent spécifiquement les confusions
 * fréquentes depuis le français. Utilisé pour enrichir le diff phonémique
 * existant (gratuit, voir PhonemeDiff.jsx) avec un "comment corriger ce son"
 * — réservé aux comptes Premium (voir /api/analyze et PremiumPhonemeTips.jsx).
 *
 * Couvre les sons anglais qui n'existent pas ou se comportent différemment
 * en français — la liste n'est pas exhaustive (l'API Whisper/eSpeak peut
 * retourner d'autres symboles), donc TIPS.get() peut renvoyer undefined :
 * le frontend doit gérer ce cas sans planter (juste ne rien afficher pour ce son).
 */
const TIPS = new Map([
  ["θ", "Place le bout de la langue entre les dents et souffle, sans faire vibrer les cordes vocales (comme dans \"think\") — pas de \"s\" ou \"z\" français."],
  ["ð", "Même position que \"θ\" (langue entre les dents), mais avec les cordes vocales qui vibrent (comme dans \"this\")."],
  ["r", "Le \"r\" anglais ne racle pas le fond de la gorge comme en français — la langue recule légèrement sans toucher le palais, un peu comme un \"r\" américain roulé en douceur."],
  ["æ", "Bouche plus ouverte qu'un \"è\" français, presque comme un \"a\" — pense à \"cat\", à mi-chemin entre \"ka\" et \"kè\"."],
  ["ʃ", "Comme le \"ch\" français (\"chat\"), mais souvent avec les lèvres un peu plus arrondies en anglais — écoute \"shoe\"."],
  ["ʒ", "Comme le \"j\" français de \"jardin\" — souvent confondu avec \"dj\" par les francophones dans des mots comme \"measure\"."],
  ["ŋ", "Le son \"ng\" de \"sing\" se fait entièrement dans le nez, sans prononcer de \"g\" après — arrête le son net, langue collée au palais mou."],
  ["h", "Un vrai souffle d'air, audible — en français le \"h\" est souvent muet, mais en anglais il faut vraiment expirer (\"house\")."],
  ["ɪ", "Un \"i\" court et relâché, plus proche d'un \"é\" très bref que d'un \"i\" français tenu — pense à la différence entre \"ship\" et \"sheep\"."],
  ["iː", "Un \"i\" long et tendu, à bien étirer — c'est ce qui distingue \"sheep\" de \"ship\"."],
  ["ʊ", "Un \"ou\" court et relâché, lèvres moins arrondies qu'en français — comme dans \"book\", à ne pas confondre avec le \"ou\" long de \"boot\"."],
  ["ʌ", "Un son bref, presque entre le \"a\" et le \"e\" français, bouche mi-ouverte détendue — comme dans \"cup\"."],
  ["w", "Arrondis bien les lèvres en avant avant de parler, comme pour siffler — sinon \"w\" sonne comme un \"v\" français."],
  ["v", "Les dents du haut touchent légèrement la lèvre du bas (comme le \"v\" français) — à ne pas remplacer par un \"w\" arrondi."],
  ["z", "Cordes vocales qui vibrent, comme un \"z\" français — souvent affaibli en \"s\" par les francophones en fin de mot."],
  ["dʒ", "Comme le \"dj\" de \"djembé\" — un seul son fondu, pas un \"d\" et un \"j\" séparés (\"jump\")."],
  ["tʃ", "Comme le \"tch\" de \"tchèque\" — un seul son fondu (\"chair\")."],
]);

function getPhonemeTip(symbol) {
  return TIPS.get(symbol) || null;
}

/** Enrichit un alignement phonémique (substitutions/oublis) avec un conseil
 * d'articulation pour chaque son problématique — utilisé côté serveur pour
 * ne renvoyer ces conseils qu'aux comptes Premium (voir server.js). */
function annotateAlignmentWithTips(alignment) {
  if (!Array.isArray(alignment)) return alignment;
  return alignment.map((op) => {
    if (op.type === "substitution" || op.type === "deletion") {
      const tip = getPhonemeTip(op.ref);
      return tip ? { ...op, tip } : op;
    }
    return op;
  });
}

module.exports = { getPhonemeTip, annotateAlignmentWithTips };
