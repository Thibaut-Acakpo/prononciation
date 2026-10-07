# ============================================================
# Mode ALLÉGÉ : transcription via l'API gratuite de Groq
# (Whisper large-v3-turbo hébergé chez Groq, sans carte bancaire).
#
# Activé uniquement si LITE_MODE=true ET GROQ_API_KEY sont définis dans
# l'environnement (backend/.env). Sinon, rien ne change : l'analyse continue
# d'utiliser le Whisper local et le modèle acoustique comme avant.
#
# Dans ce mode, aucun modèle n'est chargé en mémoire : le score de
# prononciation vient de la méthode de repli déjà présente dans
# analyze_request.py (texte reconnu → phonèmes via espeak).
# ============================================================
import os

import requests

GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_MODEL = os.environ.get("GROQ_STT_MODEL", "whisper-large-v3-turbo")

# Au-delà de ce seuil, Groq/Whisper considère qu'un segment n'est pas de la
# parole : on traite alors l'audio comme un silence (sinon Whisper invente
# parfois "Thank you." sur du bruit ou du silence).
NO_SPEECH_THRESHOLD = 0.6


def lite_mode_enabled():
    return (
        os.environ.get("LITE_MODE", "").strip().lower() == "true"
        and bool(os.environ.get("GROQ_API_KEY", "").strip())
    )


def transcribe_with_groq(wav_path):
    """
    Envoie le fichier audio à Groq et retourne le texte reconnu, en minuscules
    et sans ponctuation (même format que le Whisper local). Retourne "" si
    aucune parole n'est détectée.

    Les erreurs (clé invalide, service saturé, réseau) sont VOLONTAIREMENT
    remontées à l'appelant au lieu d'être transformées en texte vide : sinon
    une panne serait confondue avec un silence ("Aucune prononciation détectée").
    """
    api_key = os.environ.get("GROQ_API_KEY", "").strip()

    # Délai de connexion court (5 s) + 1 nouvelle tentative : si le réseau est
    # lent ou coupé, l'erreur arrive en ~10 s avec un message clair, au lieu
    # d'attendre le délai maximal de 60 s du serveur Node.
    last_error = None
    response = None
    for _attempt in range(2):
        try:
            with open(wav_path, "rb") as audio_file:
                response = requests.post(
                    GROQ_URL,
                    headers={"Authorization": f"Bearer {api_key}"},
                    files={"file": (os.path.basename(wav_path), audio_file, "audio/wav")},
                    data={
                        "model": GROQ_MODEL,
                        "language": "en",
                        "response_format": "verbose_json",
                        "temperature": "0",
                    },
                    timeout=(5, 25),  # (connexion, lecture de la réponse)
                )
            break
        except (requests.exceptions.ConnectTimeout, requests.exceptions.ConnectionError) as e:
            last_error = e

    if response is None:
        raise RuntimeError(
            "Impossible de joindre le service de transcription (Groq). Vérifie ta connexion internet."
        ) from last_error

    if response.status_code == 401:
        raise RuntimeError("Clé Groq invalide ou absente (GROQ_API_KEY).")
    if response.status_code == 429:
        raise RuntimeError("Le service d'analyse est saturé pour le moment. Réessaie dans une minute.")
    response.raise_for_status()

    data = response.json()

    segments = data.get("segments") or []
    if segments and all((s.get("no_speech_prob") or 0) > NO_SPEECH_THRESHOLD for s in segments):
        return ""

    text = (data.get("text") or "").strip().lower()
    return text.strip(".,!?;: ")

