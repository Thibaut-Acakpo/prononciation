"""
Génère les 80 fichiers audio de référence (prononciation native) UNE SEULE
FOIS, à exécuter par toi-même en local, avant de livrer/déployer l'app.

Pourquoi ce script a besoin d'Internet alors que le reste de l'app n'en a
pas besoin : il utilise gTTS (Google Text-to-Speech) pour générer un vrai
son de bonne qualité. C'est un choix assumé, identique à celui de ton
ancien projet "voix" : Internet est utilisé UNE FOIS, à la génération des
fichiers, jamais ensuite à l'utilisation de l'app. Les fichiers .mp3
produits sont ensuite servis comme simples fichiers statiques par le
frontend, sans aucun appel réseau au moment de l'écoute.

Utilisation :
    pip install gTTS
    python scripts/generate_reference_audio.py

Les fichiers sont écrits dans frontend/public/audio/reference/<mot>.mp3
(espaces remplacés par des underscores), prêts à être servis par Vite/Express
comme n'importe quel autre fichier statique du dossier public/.
"""

import os
import sys

try:
    from gtts import gTTS
except ImportError:
    print("Le module 'gTTS' n'est pas installé. Lance d'abord : pip install gTTS")
    sys.exit(1)

# Doit rester synchronisé avec frontend/src/lib/words.js (YOLO_CLASSES).
MOTS = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train",
    "truck", "boat", "traffic light", "fire hydrant", "stop sign",
    "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep",
    "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella",
    "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard",
    "sports ball", "kite", "baseball bat", "baseball glove", "skateboard",
    "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork",
    "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
    "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
    "couch", "potted plant", "bed", "dining table", "toilet", "tv",
    "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave",
    "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase",
    "scissors", "teddy bear", "hair drier", "toothbrush",
]

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public", "audio", "reference")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    total = len(MOTS)

    for i, mot in enumerate(MOTS, 1):
        nom_fichier = mot.replace(" ", "_") + ".mp3"
        chemin = os.path.join(OUT_DIR, nom_fichier)

        if os.path.exists(chemin):
            print(f"[{i}/{total}] ⏭  Déjà généré : {mot}")
            continue

        try:
            print(f"[{i}/{total}] 🔊 Génération : {mot}")
            tts = gTTS(text=mot, lang="en", slow=False, tld="com")
            tts.save(chemin)
        except Exception as e:
            print(f"[{i}/{total}] ✗ Erreur pour « {mot} » : {e}")

    print(f"\n✅ Terminé. Fichiers dans : {os.path.abspath(OUT_DIR)}")
    print("Ces fichiers sont maintenant servis en local, sans connexion, par l'application.")


if __name__ == "__main__":
    main()
