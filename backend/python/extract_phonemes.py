# ============================================================
# Étape 2 : Extraction des phonèmes depuis les fichiers .wav
# Utilise phonemizer pour transcrire chaque mot prononcé
#
# CHANGEMENT IMPORTANT (audit) :
# L'ancienne version utilisait `speech_recognition.recognize_google()`,
# c'est-à-dire l'API web GRATUITE et NON OFFICIELLE de Google, malgré un
# commentaire dans server.js qui prétendait qu'un modèle wav2vec2 était
# chargé. Ce n'était pas vrai, et ça empêchait tout fonctionnement hors
# ligne. On utilise maintenant un modèle Whisper local (déjà présent dans
# requirements.txt), chargé UNE SEULE FOIS en mémoire, ce qui :
#   - fonctionne sans connexion Internet une fois le modèle téléchargé,
#   - ne dépend plus d'un service tiers non contractualisé (RGPD),
#   - donne une transcription nettement plus fiable sur des mots isolés.
# ============================================================

import os
import sys

# ── Détection cross-platform d'espeak-ng (remplace le chemin Windows codé
#    en dur qui cassait le projet sur Linux/macOS/serveurs cloud) ────────────
from phonemizer.backend.espeak.espeak import EspeakWrapper

_CANDIDATE_ESPEAK_PATHS = [
    os.environ.get("ESPEAK_LIBRARY"),                          # override explicite
    r"C:\Program Files\eSpeak NG\libespeak-ng.dll",            # Windows
    "/usr/lib/x86_64-linux-gnu/libespeak-ng.so.1",              # Debian/Ubuntu
    "/usr/lib/libespeak-ng.so.1",                               # autres distros Linux
    "/opt/homebrew/lib/libespeak-ng.dylib",                     # macOS (Apple Silicon, Homebrew)
    "/usr/local/lib/libespeak-ng.dylib",                        # macOS (Intel, Homebrew)
]

_espeak_found = False
for _path in _CANDIDATE_ESPEAK_PATHS:
    if _path and os.path.exists(_path):
        EspeakWrapper.set_library(_path)
        _espeak_found = True
        break

if not _espeak_found:
    print(
        "⚠️  Bibliothèque eSpeak NG introuvable dans les emplacements connus. "
        "Installe-la (`apt install espeak-ng` sur Linux, `brew install espeak-ng` "
        "sur macOS, ou https://github.com/espeak-ng/espeak-ng/releases sur Windows), "
        "ou définis la variable d'environnement ESPEAK_LIBRARY avec le chemin exact.",
        file=sys.stderr,
    )

from phonemizer.backend import EspeakBackend
from phonemizer.separator import Separator
from reference_phonemes import filename_to_index, dataset

# Dossier racine
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Instance unique du backend espeak
_ESPEAK_BACKEND = EspeakBackend("en-us", with_stress=False, language_switch="remove-flags")

# Séparateur : espace entre phonèmes, | entre mots
_SEP = Separator(phone=" ", word="|")

# Table de conversion IPA → ARPAbet
IPA_TO_ARPABET = {
    # Voyelles longues / diphtongues
    "iː":  "iy",  "ɪ":   "ih",  "ɛ":   "eh",  "æ":   "ae",
    "ɑː":  "aa",  "ɔː":  "ao",  "ʊ":   "uh",  "uː":  "uw",
    "ʌ":   "ah",  "ə":   "ah",  "ɜː":  "er",  "ɚ":   "er",
    "eɪ":  "ey",  "aɪ":  "ay",  "ɔɪ":  "oy",  "aʊ":  "aw",
    "oʊ":  "ow",  "ɪə":  "ih",  "ɛə":  "eh",  "ʊə":  "uh",
    "ɑːɹ": "aa",  "ɛɹ":  "er",  "ɜːɹ": "er",
    # Voyelles courtes supplémentaires
    "e":   "eh",  "o":   "ow",  "i":   "ih",  "u":   "uw",
    "a":   "ae",
    # Consonnes
    "p":   "p",   "b":   "b",   "t":   "t",   "d":   "d",
    "k":   "k",   "ɡ":   "g",   "f":   "f",   "v":   "v",
    "θ":   "th",  "ð":   "dh",  "s":   "s",   "z":   "z",
    "ʃ":   "sh",  "ʒ":   "zh",  "h":   "hh",  "m":   "m",
    "n":   "n",   "ŋ":   "ng",  "l":   "l",   "ɹ":   "r",
    "r":   "r",   "j":   "y",   "w":   "w",   "tʃ":  "ch",
    "dʒ":  "jh",  "ʔ":   "",    "ɾ":   "t",   "əl":  "l",
}


def ipa_to_arpabet(ipa_phonemes):
    """
    Convertit une liste de phonèmes IPA en ARPAbet.
    Essaie d'abord les séquences de 3 puis 2 caractères, puis 1.
    """
    arpabet = []
    for ph in ipa_phonemes:
        ph = ph.strip("|").strip()
        if not ph:
            continue

        # Chercher la correspondance la plus longue en premier
        converted = None
        for length in (3, 2, 1):
            key = ph[:length]
            if key in IPA_TO_ARPABET:
                converted = IPA_TO_ARPABET[key]
                break

        if converted is None:
            # Décomposer caractère par caractère en dernier recours
            converted = ""
            for ch in ph:
                converted += IPA_TO_ARPABET.get(ch, ch)

        if converted:
            arpabet.append(converted)

    return arpabet


# ── Modèle Whisper chargé une seule fois (vrai préchargement, cette fois) ────
# "tiny.en"/"base.en" : modèles anglophones dédiés, plus légers et plus rapides
# que leurs équivalents multilingues, suffisants pour de la reconnaissance de
# mots isolés. Configurable via la variable d'environnement WHISPER_MODEL si
# besoin de plus de précision (ex. "small.en") au prix d'un peu plus de RAM/latence.
_WHISPER_MODEL_NAME = os.environ.get("WHISPER_MODEL", "tiny.en")
_whisper_model = None


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        import whisper  # import différé : évite de charger torch si le module n'est
                         # utilisé qu'en CLI --list-words par exemple
        print(f"[Python] Chargement du modèle Whisper « {_WHISPER_MODEL_NAME} »…", file=sys.stderr)
        _whisper_model = whisper.load_model(_WHISPER_MODEL_NAME)
        print("[Python] Modèle Whisper chargé.", file=sys.stderr)
    return _whisper_model


def transcribe_wav_to_text(wav_path):
    """
    Transcrit un fichier .wav en texte avec un modèle Whisper local.
    Retourne le texte reconnu (chaîne vide si rien de compréhensible),
    jamais None : un appelant qui teste juste `if not text` fonctionne pareil.
    """
    try:
        model = _get_whisper_model()
        # fp16=False : nécessaire sur CPU (la plupart des machines de dev/serveurs
        # sans GPU dédié) — Whisper émettrait sinon un avertissement et rallentirait.
        result = model.transcribe(wav_path, language="en", fp16=False)
        text = (result.get("text") or "").strip().lower()
        # Whisper renvoie parfois de la ponctuation ("dog.") qu'on ne veut pas
        # dans la comparaison phonémique.
        text = text.strip(".,!?;: ")
        return text
    except Exception as e:
        print(f"    ⚠️  Erreur de transcription Whisper : {e}", file=sys.stderr)
        return ""


def text_to_phonemes(text):
    """
    Convertit un texte en liste de phonèmes ARPAbet via phonemizer + espeak.
    """
    try:
        result = _ESPEAK_BACKEND.phonemize([text], separator=_SEP)
        ipa_phonemes = result[0].strip().split()
        arpabet = ipa_to_arpabet(ipa_phonemes)
        return arpabet
    except Exception as e:
        print(f"    ⚠️  Erreur phonemizer : {e}")
        return []


def extract_all_phonemes(base_dir):
    """
    Parcourt tous les sous-dossiers, transcrit chaque .wav en phonèmes ARPAbet.
    """
    results = {}

    for folder in sorted(os.listdir(base_dir)):
        folder_path = os.path.join(base_dir, folder)

        if not os.path.isdir(folder_path) or not folder.startswith("p"):
            continue

        print(f"\n📁 Extraction phonèmes — dossier : {folder}")
        results[folder] = {}

        for filename in sorted(os.listdir(folder_path)):
            if not filename.endswith(".wav"):
                continue

            word_name = filename.replace(".wav", "")
            word_index = filename_to_index.get(word_name)

            if word_index is None:
                continue

            wav_path = os.path.join(folder_path, filename)
            ref_word = dataset[word_index]["word"]

            print(f"  🎤 Traitement : {filename} (mot attendu : {ref_word})")

            # Transcription audio → texte
            recognized_text = transcribe_wav_to_text(wav_path)

            if recognized_text is None:
                print(f"    ❌ Transcription échouée, utilisation du mot de référence.")
                recognized_text = ref_word

            print(f"    📝 Texte reconnu : '{recognized_text}'")

            # Texte → phonèmes ARPAbet
            phonemes = text_to_phonemes(recognized_text)
            print(f"    🔤 Phonèmes extraits : {phonemes}")

            results[folder][word_index] = {
                "word":       ref_word,
                "recognized": recognized_text,
                "phonemes":   phonemes
            }

    return results


if __name__ == "__main__":
    all_phonemes = extract_all_phonemes(BASE_DIR)

    print("\n\n========== RÉSUMÉ DES PHONÈMES EXTRAITS ==========")
    for person, words in all_phonemes.items():
        print(f"\n👤 {person}")
        for idx, info in words.items():
            ref = dataset[idx]["phonemes"]
            print(f"  [{info['word']}]")
            print(f"    Référence : {ref}")
            print(f"    Extrait   : {info['phonemes']}")
