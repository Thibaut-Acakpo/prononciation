# ============================================================
# Reconnaissance PHONÉTIQUE ACOUSTIQUE — le vrai correctif de l'audit.
#
# AVANT : les phonèmes "reconnus" venaient de Whisper (texte) → dictionnaire
# espeak. Ça mesurait "est-ce que Whisper a deviné le bon mot", pas "quels
# sons as-tu réellement produits" — Whisper étant conçu pour être robuste
# aux accents/imperfections, un mot mal prononcé mais quand même reconnu
# comme le bon mot donnait un score parfait à tort.
#
# MAINTENANT : ce module utilise un modèle wav2vec2 entraîné spécifiquement
# pour reconnaître des PHONÈMES directement depuis le signal audio, sans
# passer par une transcription en mots. Le modèle choisi
# (facebook/wav2vec2-lv-60-espeak-cv-ft) a été entraîné pour produire
# exactement les symboles phonétiques d'espeak — le même alphabet que celui
# déjà utilisé pour les phonèmes de référence.
#
# Téléchargement (~1,26 Go, une seule fois) : mis en cache localement par
# `transformers` après le premier chargement, comme Whisper.
#
# IMPORTANT (correctif) : ce téléchargement peut prendre plusieurs HEURES
# sur une connexion lente. Avant, ce chargement bloquait le démarrage
# complet du serveur — plus rien ne fonctionnait tant qu'il n'était pas
# fini. Maintenant, il se lance dans un THREAD EN ARRIÈRE-PLAN dès le
# démarrage : le serveur devient utilisable immédiatement (avec repli sur
# l'ancienne méthode texte→dictionnaire pour l'analyse de prononciation),
# et bascule automatiquement sur le modèle acoustique dès qu'il est prêt,
# sans qu'il faille redémarrer quoi que ce soit.
# ============================================================

import os
import sys
import threading

_processor = None
_model = None
_MODEL_NAME = os.environ.get("ACOUSTIC_MODEL", "facebook/wav2vec2-lv-60-espeak-cv-ft")

_lock = threading.Lock()
_loading_started = False
_load_failed = False
_load_failure_reason = None


def _load_model_sync():
    """Charge réellement le modèle (bloquant) — appelé uniquement depuis le
    thread d'arrière-plan, jamais directement depuis une requête utilisateur."""
    global _processor, _model, _load_failed, _load_failure_reason
    try:
        from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

        print(
            f"[Python] Téléchargement/chargement du modèle acoustique « {_MODEL_NAME} » "
            "en arrière-plan (~1,26 Go la première fois — peut prendre longtemps sur "
            "une connexion lente, mais l'application reste utilisable pendant ce temps)…",
            file=sys.stderr,
        )
        _processor = Wav2Vec2Processor.from_pretrained(_MODEL_NAME)
        _model = Wav2Vec2ForCTC.from_pretrained(_MODEL_NAME)
        _model.eval()
        print("[Python] ✅ Modèle acoustique prêt — l'analyse de prononciation utilise "
              "désormais la vraie détection phonétique depuis l'audio.", file=sys.stderr)
    except Exception as e:
        _load_failed = True
        _load_failure_reason = str(e)
        print(
            f"⚠️  Modèle acoustique indisponible ({e}). L'analyse continue de fonctionner "
            "avec l'ancienne méthode (texte → dictionnaire) en attendant.",
            file=sys.stderr,
        )


def start_background_loading():
    """À appeler UNE FOIS au démarrage du serveur (voir run_preload_worker
    dans analyze_request.py). Ne bloque jamais l'appelant."""
    global _loading_started
    with _lock:
        if _loading_started:
            return
        _loading_started = True
    thread = threading.Thread(target=_load_model_sync, daemon=True, name="acoustic-model-loader")
    thread.start()


def is_acoustic_model_ready():
    return _model is not None


def _load_audio_as_16k_mono(wav_path):
    """
    Charge un .wav et le convertit en tableau numpy mono 16kHz — le format
    exact attendu par le modèle. Réutilise pydub (déjà une dépendance du
    projet) plutôt que d'ajouter librosa, pour rester léger.
    """
    from pydub import AudioSegment
    import numpy as np

    audio = AudioSegment.from_file(wav_path)
    audio = audio.set_channels(1).set_frame_rate(16000)

    samples = np.array(audio.get_array_of_samples()).astype(np.float32)
    samples /= 32768.0  # normalisation vers [-1, 1]
    return samples


def recognize_phonemes_from_audio(wav_path):
    """
    Retourne la liste des phonèmes RÉELLEMENT détectés dans l'audio, ou None
    si le modèle acoustique n'est pas encore prêt (toujours en train de se
    télécharger en arrière-plan) ou a échoué — l'appelant se rabat alors sur
    l'ancienne méthode (texte → dictionnaire) SANS jamais attendre ni
    bloquer la requête en cours.
    """
    if _load_failed or _model is None:
        return None  # pas prêt : repli immédiat, pas d'attente

    try:
        import torch

        samples = _load_audio_as_16k_mono(wav_path)
        inputs = _processor(samples, sampling_rate=16000, return_tensors="pt", padding=True)
        with torch.no_grad():
            logits = _model(inputs.input_values).logits
        predicted_ids = torch.argmax(logits, dim=-1)
        raw_transcription = _processor.batch_decode(predicted_ids)[0]

        raw_phonemes = [p for p in raw_transcription.strip().split() if p]

        from extract_phonemes import ipa_to_arpabet
        return ipa_to_arpabet(raw_phonemes)
    except Exception as e:
        print(f"    ⚠️  Erreur reconnaissance acoustique : {e}", file=sys.stderr)
        return None
