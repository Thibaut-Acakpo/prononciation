// Fait entendre la prononciation d'un mot anglais.
//
// PRIORITÉ 1 : un vrai fichier audio de référence stocké localement dans
// public/audio/reference/<mot>.mp3 — généré une fois via gTTS (voir
// backend/scripts/generate_reference_audio.py) ou fourni par toi-même
// (vrais enregistrements humains). Ce fichier est servi comme un simple
// fichier statique : AUCUN appel réseau externe, ça fonctionne hors-ligne.
//
// PRIORITÉ 2 (repli automatique) : synthèse vocale du navigateur, utilisée
// uniquement si le fichier de référence n'existe pas encore pour ce mot.
//
// On vérifie l'existence du fichier une seule fois par mot (mise en cache
// du résultat) pour ne pas refaire une requête HEAD à chaque clic.

const referenceAvailability = new Map(); // mot -> true | false

function toFileName(word) {
  return word.replace(/ /g, "_") + ".mp3";
}

async function hasReferenceAudio(word) {
  if (referenceAvailability.has(word)) return referenceAvailability.get(word);

  try {
    const res = await fetch(`/audio/reference/${toFileName(word)}`, { method: "HEAD" });
    const available = res.ok;
    referenceAvailability.set(word, available);
    return available;
  } catch {
    referenceAvailability.set(word, false);
    return false;
  }
}

let cachedEnglishVoice = null;

function pickEnglishVoice() {
  if (cachedEnglishVoice) return cachedEnglishVoice;
  const voices = window.speechSynthesis.getVoices();
  const premiumKeywords = ["google", "natural", "neural", "premium", "enhanced"];
  const englishVoices = voices.filter((v) => v.lang?.startsWith("en"));

  cachedEnglishVoice =
    englishVoices.find((v) => premiumKeywords.some((k) => v.name.toLowerCase().includes(k))) ||
    englishVoices.find((v) => v.lang === "en-US") ||
    englishVoices.find((v) => v.lang === "en-GB") ||
    englishVoices[0] ||
    null;

  return cachedEnglishVoice;
}

function speakWithBrowserTTS(word) {
  if (!("speechSynthesis" in window) || !word) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(word);
  utter.lang = "en-US";
  utter.rate = 0.85;
  const voice = pickEnglishVoice();
  if (voice) utter.voice = voice;
  window.speechSynthesis.speak(utter);
}

/**
 * Joue la prononciation d'un mot. Retourne "native" si un vrai fichier audio
 * de référence a été utilisé, ou "tts" si on est retombé sur la synthèse
 * vocale du navigateur.
 */
export async function speakWord(word) {
  if (!word) return;

  const available = await hasReferenceAudio(word);
  if (available) {
    try {
      const audio = new Audio(`/audio/reference/${toFileName(word)}`);
      await audio.play();
      return "native";
    } catch (err) {
      console.warn("[tts] Lecture du fichier de référence impossible, repli sur la synthèse vocale :", err.message);
    }
  }

  speakWithBrowserTTS(word);
  return "tts";
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => { cachedEnglishVoice = null; };
}
