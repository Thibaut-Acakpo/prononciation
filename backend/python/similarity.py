# ============================================================
# Étape 3 : Calcul des similarités Jaccard et Cosinus
# ============================================================

import numpy as np


def get_all_phonemes_vocab(ref_phonemes, extracted_phonemes):
    """
    Construit le vocabulaire complet (union) de tous les phonèmes
    présents dans la référence ET dans la liste extraite.
    """
    vocab = set(ref_phonemes) | set(extracted_phonemes)
    return sorted(vocab)


def to_binary_vector(phonemes, vocab):
    """
    Convertit une liste de phonèmes en vecteur binaire.
    1 si le phonème est présent dans la liste, 0 sinon.
    Exemple :
        phonemes = ["k", "aa", "r"]
        vocab    = ["aa", "k", "r", "ow"]
        → vecteur = [1, 1, 1, 0]
    """
    return np.array([1 if p in phonemes else 0 for p in vocab], dtype=float)


def jaccard_similarity(list1, list2):
    """
    Calcule la similarité de Jaccard entre deux listes de phonèmes.
    Jaccard = |intersection| / |union|
    Résultat entre 0 (aucun phonème en commun) et 1 (identiques).
    """
    set1 = set(list1)
    set2 = set(list2)

    intersection = set1 & set2
    union = set1 | set2

    if len(union) == 0:
        return 0.0

    return len(intersection) / len(union)


def cosine_similarity(list1, list2):
    """
    Calcule la similarité Cosinus entre deux listes de phonèmes
    en utilisant des vecteurs binaires.
    Résultat entre 0 et 1.
    """
    vocab = get_all_phonemes_vocab(list1, list2)

    vec1 = to_binary_vector(list1, vocab)
    vec2 = to_binary_vector(list2, vocab)

    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)

    if norm1 == 0 or norm2 == 0:
        return 0.0

    return float(np.dot(vec1, vec2) / (norm1 * norm2))


def compute_all_similarities(extracted_results, reference_dataset):
    """
    Calcule Jaccard et Cosinus pour chaque personne et chaque mot.

    Paramètres :
        extracted_results  : dict retourné par extract_all_phonemes()
        reference_dataset  : dict importé depuis reference_phonemes.py

    Retourne :
    {
        "p1": {
            "0": { "word": "person", "jaccard": 0.8, "cosine": 0.9 },
            ...
        },
        ...
    }
    """
    similarities = {}

    for person, words in extracted_results.items():
        similarities[person] = {}

        for word_index, info in words.items():
            ref_phonemes = reference_dataset[word_index]["phonemes"]
            ext_phonemes = info["phonemes"]

            jaccard = jaccard_similarity(ref_phonemes, ext_phonemes)
            cosine  = cosine_similarity(ref_phonemes, ext_phonemes)

            similarities[person][word_index] = {
                "word":    info["word"],
                "jaccard": round(jaccard, 4),
                "cosine":  round(cosine, 4),
            }

    return similarities


if __name__ == "__main__":
    # Test rapide avec des données fictives
    ref  = ["p", "er", "s", "ah", "n"]
    ext  = ["p", "er", "s", "ah", "n"]

    print("=== Test avec phonèmes identiques ===")
    print(f"Jaccard : {jaccard_similarity(ref, ext)}")
    print(f"Cosinus : {cosine_similarity(ref, ext)}")

    ext2 = ["p", "er", "z"]
    print("\n=== Test avec phonèmes partiels ===")
    print(f"Jaccard : {jaccard_similarity(ref, ext2)}")
    print(f"Cosinus : {cosine_similarity(ref, ext2)}")
