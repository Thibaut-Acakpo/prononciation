#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
analyze_request.py — Analyse phonétique
Supporte deux modes :
  1. Mode worker persistant (--preload) : lit des requêtes JSON sur stdin, répond sur stdout
  2. Mode CLI classique                 : --audio <path> --word <mot>
  3. Mode liste                        : --list-words
"""

import argparse
import concurrent.futures
import io
import json
import os
import shutil
import sys
import tempfile

# ── FORCE L'ENCODAGE UTF-8 SUR STDIN/STDOUT/STDERR ────────────────────────────
# Sur Windows, Python utilise par défaut l'encodage de la console (cp1252,
# cp850...) pour stdin/stdout/stderr quand ils sont redirigés (cas d'un
# sous-processus Node.js). C'est la cause exacte de :
#   "'charmap' codec can't encode character '\u0250'..."
# En forçant UTF-8 ici, tous les caractères accentués et symboles phonétiques
# spéciaux (ɐ, ʃ, ɹ, etc.) sont correctement encodés/décodés, dans TOUS les cas,
# peu importe la configuration de la console Windows.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from pydub import AudioSegment

from extract_phonemes import transcribe_wav_to_text, text_to_phonemes
from acoustic_phonemes import recognize_phonemes_from_audio, start_background_loading, is_acoustic_model_ready
from reference_phonemes import dataset
from similarity import jaccard_similarity, cosine_similarity


# ── Utilitaires ───────────────────────────────────────────────────────────────

def build_parser():
    parser = argparse.ArgumentParser(description="Analyse phonétique depuis un fichier audio")
    parser.add_argument("--preload",    action="store_true", help="Mode worker persistant (stdin/stdout JSON)")
    parser.add_argument("--list-words", action="store_true", help="Liste les mots disponibles dans le dataset")
    parser.add_argument("--audio",      type=str,            help="Chemin du fichier audio à analyser")
    parser.add_argument("--word",       type=str,            help="Mot attendu à comparer")
    return parser


def list_words():
    words = [dataset[key]["word"] for key in sorted(dataset.keys(), key=int)]
    print(json.dumps(words, ensure_ascii=False))
    sys.stdout.flush()


def compute_per(ref_phonemes, ext_phonemes):
    """
    Calcule le Phoneme Error Rate (PER) par distance de Levenshtein —
    la méthode standard en reconnaissance vocale (identique au calcul du WER).

    Contrairement à une comparaison position par position (qui suppose que
    les deux séquences sont déjà alignées, ce qui est rarement vrai dès qu'un
    son est ajouté/manquant au milieu du mot), Levenshtein cherche le nombre
    MINIMAL d'opérations (substitution, insertion, suppression) nécessaires
    pour transformer la séquence reconnue en la séquence de référence. C'est
    un alignement optimal : un phonème en trop au milieu ne décale plus
    artificiellement toutes les comparaisons suivantes.

    Exemple : référence ["s","t","aa","p","s","ay","n"] (stop sign)
              extrait    ["s","t","aa","p","s","ih","ng","g","l"] (stop single)
    Une comparaison naïve position par position compterait des substitutions
    en cascade. Levenshtein trouve le coût réel minimal d'édition.

    Le résultat est TOUJOURS plafonné entre 0 et 100 : un mot totalement
    différent (ex. "abracadabra" pour "bird") ne doit jamais produire un
    pourcentage absurde comme 366% — au-delà de 100% d'erreurs, on borne à
    100, qui représente déjà "totalement faux".
    """
    ref_len = len(ref_phonemes)
    ext_len = len(ext_phonemes)

    if ref_len == 0:
        return 0.0
    if ext_len == 0:
        return 100.0

    # ── Distance de Levenshtein classique (programmation dynamique) ──────────
    # dp[i][j] = coût minimal pour transformer ext_phonemes[:i] en ref_phonemes[:j]
    dp = [[0] * (ref_len + 1) for _ in range(ext_len + 1)]

    for i in range(ext_len + 1):
        dp[i][0] = i  # supprimer tous les phonèmes extraits restants
    for j in range(ref_len + 1):
        dp[0][j] = j  # insérer tous les phonèmes de référence manquants

    for i in range(1, ext_len + 1):
        for j in range(1, ref_len + 1):
            if ext_phonemes[i - 1] == ref_phonemes[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]  # phonème identique, aucun coût
            else:
                dp[i][j] = 1 + min(
                    dp[i - 1][j],     # suppression (phonème extrait en trop)
                    dp[i][j - 1],     # insertion (phonème de référence manquant)
                    dp[i - 1][j - 1],  # substitution (phonème différent)
                )

    edit_distance = dp[ext_len][ref_len]
    raw_per = edit_distance / ref_len * 100
    capped_per = min(raw_per, 100.0)  # ── plafond strict à 100% ──
    return round(capped_per, 2)


def compute_phoneme_alignment(ref_phonemes, ext_phonemes):
    """
    Reconstruit, phonème par phonème, CE QUI a été bien prononcé, substitué,
    oublié, ou ajouté en trop — pas juste un pourcentage global.

    C'est ce qui permet d'afficher à l'utilisateur "le son 'r' à la fin du
    mot est manquant" plutôt qu'un simple "62% d'erreur" qui ne dit pas QUOI
    corriger.

    Retourne une liste ordonnée (dans l'ordre du mot de référence) d'objets :
      {"type": "match",       "ref": "r", "ext": "r"}   → phonème correct
      {"type": "substitution","ref": "r", "ext": "w"}   → son remplacé par un autre
      {"type": "deletion",    "ref": "r", "ext": None}  → son de référence non prononcé
      {"type": "insertion",   "ref": None,"ext": "ah"}  → son ajouté en trop par l'utilisateur
    """
    ref_len = len(ref_phonemes)
    ext_len = len(ext_phonemes)

    if ref_len == 0:
        return []
    if ext_len == 0:
        return [{"type": "deletion", "ref": p, "ext": None} for p in ref_phonemes]

    # Même table de programmation dynamique que compute_per, mais on la
    # garde en mémoire pour pouvoir remonter le chemin optimal ensuite
    # (« backtracking ») au lieu de ne garder que le coût final.
    dp = [[0] * (ref_len + 1) for _ in range(ext_len + 1)]
    for i in range(ext_len + 1):
        dp[i][0] = i
    for j in range(ref_len + 1):
        dp[0][j] = j
    for i in range(1, ext_len + 1):
        for j in range(1, ref_len + 1):
            if ext_phonemes[i - 1] == ref_phonemes[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])

    # Remontée du chemin optimal depuis le coin (ext_len, ref_len) vers (0, 0).
    ops = []
    i, j = ext_len, ref_len
    while i > 0 or j > 0:
        if i > 0 and j > 0 and ext_phonemes[i - 1] == ref_phonemes[j - 1]:
            ops.append({"type": "match", "ref": ref_phonemes[j - 1], "ext": ext_phonemes[i - 1]})
            i -= 1
            j -= 1
        elif i > 0 and j > 0 and dp[i][j] == dp[i - 1][j - 1] + 1:
            ops.append({"type": "substitution", "ref": ref_phonemes[j - 1], "ext": ext_phonemes[i - 1]})
            i -= 1
            j -= 1
        elif j > 0 and dp[i][j] == dp[i][j - 1] + 1:
            ops.append({"type": "deletion", "ref": ref_phonemes[j - 1], "ext": None})
            j -= 1
        else:
            ops.append({"type": "insertion", "ref": None, "ext": ext_phonemes[i - 1]})
            i -= 1

    ops.reverse()  # on avait remonté depuis la fin, remettre dans l'ordre du mot
    return ops


def get_reference_phonemes(word):
    normalized = word.strip().lower()
    for key, entry in dataset.items():
        if entry["word"].lower() == normalized:
            return entry["phonemes"]

    # Mot hors des 80 objets illustrés : on génère sa prononciation de
    # référence à la volée via espeak, au lieu de refuser purement et
    # simplement. Ça permet à l'utilisateur de s'entraîner sur N'IMPORTE
    # QUEL mot anglais tapé au clavier — seule la reconnaissance visuelle
    # par caméra reste limitée aux 80 objets (limite du modèle de vision,
    # pas de ce pipeline phonétique).
    live_phonemes = text_to_phonemes(normalized)
    return live_phonemes if live_phonemes else None


def ensure_wav(input_path):
    if input_path.lower().endswith(".wav"):
        return input_path, False
    output_dir = tempfile.mkdtemp(prefix="parole_audio_")
    output_path = os.path.join(output_dir, "convert.wav")
    audio = AudioSegment.from_file(input_path)
    audio.export(output_path, format="wav")
    return output_path, True


def make_verdict(jaccard, cosine, per, expected_word, recognized_text):
    if per == 0 and jaccard == 1.0 and cosine == 1.0:
        return "Excellent, prononciation très proche de la référence"
    if jaccard >= 0.80 or cosine >= 0.80 or per <= 20:
        return "Proche de la bonne prononciation"
    if jaccard >= 0.50 or cosine >= 0.50 or per <= 40:
        return "Prononciation acceptable"
    return "Prononciation éloignée de la référence"


# ── Analyse principale ────────────────────────────────────────────────────────

def analyze(audio_path, expected_word):
    wav_path, created_tmp = ensure_wav(audio_path)
    try:
        # Performance : Whisper (transcription texte, affichage informatif) et
        # le modèle acoustique (phonèmes réels, utilisés pour le score) sont
        # deux analyses INDÉPENDANTES du même fichier audio. Avant, elles
        # tournaient l'une après l'autre (attendre Whisper, PUIS lancer le
        # modèle acoustique) — ce qui doublait inutilement le temps d'attente.
        # Les deux étant dominées par du calcul (PyTorch), qui libère le GIL
        # Python pendant l'inférence, les lancer sur deux threads apporte un
        # vrai gain de temps, pas juste théorique.
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future_text = executor.submit(transcribe_wav_to_text, wav_path)
            future_acoustic = executor.submit(recognize_phonemes_from_audio, wav_path)
            recognized_text = future_text.result()
            acoustic_phonemes_result = future_acoustic.result()

        # ── Détection d'un audio vide / silence ───────────────────────────────
        # AVANT, le code remplaçait un résultat vide par expected_word, ce qui
        # faisait artificiellement "gagner" l'utilisateur même sans rien dire
        # (le système comparait le mot attendu... à lui-même). Il ne faut
        # JAMAIS deviner ce que l'utilisateur a dit : un silence ou un bruit
        # non reconnu doit produire un score nul, pas un score parfait.
        recognized_text_clean = (recognized_text or "").strip()

        if not recognized_text_clean:
            return {
                "expected_word": expected_word,
                "recognized_text": "",
                "reference_phonemes": get_reference_phonemes(expected_word) or [],
                "recognized_phonemes": [],
                "jaccard": 0.0,
                "cosine": 0.0,
                "per": 100.0,
                "verdict": "Aucune prononciation détectée",
                "mot_attendu": expected_word,
                "mot_reconnu": "",
                "phonemes_attendus": " ".join(get_reference_phonemes(expected_word) or []),
                "phonemes_extraits": "",
                "cosinus": 0.0,
                "verdict_court": "Aucune prononciation détectée",
                "commentaire": (
                    "Aucun son n'a été détecté dans ton enregistrement. "
                    "Vérifie que ton microphone fonctionne et que tu parles "
                    "bien pendant l'enregistrement, puis réessaie."
                ),
            }

        recognized_text = recognized_text_clean

        # ── Le vrai correctif de l'audit ──────────────────────────────────────
        # Les phonèmes utilisés pour le SCORE viennent maintenant d'une analyse
        # acoustique directe de l'audio (voir acoustic_phonemes.py), pas d'une
        # transcription texte repassée au dictionnaire. `recognized_text`
        # (Whisper) reste affiché à l'utilisateur à titre informatif ("mot
        # reconnu"), mais n'influence plus le score de prononciation.
        recognized_phonemes = acoustic_phonemes_result
        used_acoustic_model = recognized_phonemes is not None

        if recognized_phonemes is None:
            # Repli : modèle acoustique indisponible (pas encore téléchargé,
            # ou torch/transformers manquants) — mieux vaut donner un résultat
            # avec l'ancienne méthode que de faire échouer l'analyse.
            recognized_phonemes = text_to_phonemes(recognized_text)

        reference_phonemes = get_reference_phonemes(expected_word)

        if reference_phonemes is None:
            raise ValueError(f"Mot attendu inconnu dans le dataset : {expected_word}")

        jaccard_score = round(jaccard_similarity(reference_phonemes, recognized_phonemes), 4)
        cosine_score = round(cosine_similarity(reference_phonemes, recognized_phonemes), 4)
        per_score = compute_per(reference_phonemes, recognized_phonemes)  # déjà plafonné 0-100
        alignment = compute_phoneme_alignment(reference_phonemes, recognized_phonemes)
        verdict = make_verdict(jaccard_score, cosine_score, per_score,
                                expected_word, recognized_text)

        return {
            "expected_word": expected_word,
            "recognized_text": recognized_text,
            "reference_phonemes": reference_phonemes,
            "recognized_phonemes": recognized_phonemes,
            "jaccard": jaccard_score,
            "cosine": cosine_score,
            "per": per_score,
            "verdict": verdict,
            "mot_attendu": expected_word,
            "mot_reconnu": recognized_text,
            "phonemes_attendus": " ".join(reference_phonemes),
            "phonemes_extraits": " ".join(recognized_phonemes),
            "alignement_phonemes": alignment,
            "analyse_acoustique_reelle": used_acoustic_model,
            "cosinus": cosine_score,
            "verdict_court": verdict,
            "commentaire": _build_commentaire(
                verdict, jaccard_score, cosine_score, per_score,
                expected_word, recognized_text
            ),
        }
    finally:
        if created_tmp:
            try:
                shutil.rmtree(os.path.dirname(wav_path))
            except Exception:
                pass


def _build_commentaire(verdict, jaccard, cosine, per, expected, recognized):
    """
    Génère un commentaire détaillé en français (texte simple, sans jargon technique).
    IMPORTANT : le jugement de qualité se base sur le PER (calculé phonème par
    phonème), jamais sur la simple égalité texte attendu/reconnu. Un ASR peut
    reconnaître le bon mot au niveau texte ("car") tout en ayant capté une
    prononciation incomplète au niveau phonémique (il manque le "r" final,
    par exemple) — le commentaire doit refléter cette réalité, pas se contredire.
    """
    scores_ok = jaccard >= 0.8 and cosine >= 0.8

    if per == 0 and scores_ok:
        qual_txt = "Tu as très bien prononcé le mot."
    elif per <= 20:
        qual_txt = "Ta prononciation est proche de la référence, avec quelques petites différences."
    elif per <= 40:
        qual_txt = "Ta prononciation est globalement correcte, mais certains sons manquent ou diffèrent."
    elif per <= 70:
        qual_txt = "Plusieurs sons attendus n'ont pas été retrouvés dans ta prononciation."
    else:
        qual_txt = "Ta prononciation est assez différente du mot attendu."

    commentaire = (
        f"{verdict} ! "
        f"Ton taux d'erreur est de {per:.1f}%. "
        f"Tes scores de similarité sont {'bons' if scores_ok else ('moyens' if (jaccard >= 0.5 or cosine >= 0.5) else 'faibles')}. "
        f"{qual_txt}"
    )

    if recognized.lower().strip() != expected.lower().strip():
        commentaire += f" Le système a entendu \"{recognized}\" à la place de \"{expected}\"."

    return commentaire


# ── Mode worker persistant ────────────────────────────────────────────────────

def run_preload_worker():
    try:
        import wave
        import numpy as np

        tmp_dir = tempfile.mkdtemp(prefix="preload_")
        wav_path = os.path.join(tmp_dir, "silence.wav")
        sample_rate = 16000
        with wave.open(wav_path, "w") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(np.zeros(sample_rate, dtype=np.int16).tobytes())

        transcribe_wav_to_text(wav_path)

        # Correction (blocage constaté) : avant, le modèle acoustique
        # (~1,26 Go) devait finir de se télécharger AVANT que le serveur ne
        # se signale "prêt" — sur une connexion lente, ça pouvait bloquer
        # l'application entière pendant des heures, sans aucun repli
        # possible pendant ce temps. Maintenant, le téléchargement démarre
        # en arrière-plan et le serveur devient utilisable IMMÉDIATEMENT
        # (avec repli automatique sur l'ancienne méthode tant que le modèle
        # acoustique n'est pas encore prêt).
        start_background_loading()

        shutil.rmtree(tmp_dir, ignore_errors=True)
    except Exception as e:
        sys.stderr.write(f"[Python] Avertissement pré-chargement : {e}\n")
        sys.stderr.flush()

    print("READY", flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = {}
        try:
            req = json.loads(line)
            result = analyze(req["audio"], req["word"])
            print(json.dumps(result, ensure_ascii=False, default=str), flush=True)
        except Exception as e:
            error_result = {
                "error": str(e),
                "mot_attendu": req.get("word", ""),
                "mot_reconnu": "",
                "verdict_court": "Erreur d'analyse",
                "commentaire": "Une erreur est survenue pendant l'analyse. Réessaie.",
                "phonemes_attendus": "",
                "phonemes_extraits": "",
                "jaccard": 0,
                "cosinus": 0,
                "cosine": 0,
                "per": 0,
            }
            print(json.dumps(error_result, ensure_ascii=False, default=str), flush=True)


# ── Point d'entrée ────────────────────────────────────────────────────────────

def main():
    parser = build_parser()
    args = parser.parse_args()

    if args.list_words:
        list_words()
        return

    if args.preload:
        run_preload_worker()
        return

    if not args.audio or not args.word:
        parser.print_help()
        sys.exit(1)

    result = analyze(args.audio, args.word)
    print(json.dumps(result, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()