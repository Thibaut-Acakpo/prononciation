/**
 * coco-ssd (le modèle de détection d'objet qu'on utilise, voir CameraPointer.jsx)
 * reconnaît les catégories COCO standards. La liste de mots de l'application
 * (YOLO_CLASSES dans App.jsx) est déjà basée sur ces mêmes catégories COCO,
 * donc la correspondance est directe dans l'immense majorité des cas.
 *
 * Ce fichier existe pour gérer les quelques cas où le libellé renvoyé par
 * coco-ssd ne correspond pas exactement à un mot de notre liste (variations
 * de formulation selon les implémentations du modèle) — sans cette table,
 * un objet correctement détecté pourrait être ignoré simplement à cause
 * d'un nom légèrement différent.
 */

export const COCO_SSD_TO_APP_WORD = {
  "tvmonitor": "tv",
  "tv monitor": "tv",
  "aeroplane": "airplane",
  "motorbike": "motorcycle",
  "sofa": "couch",
  "diningtable": "dining table",
  "pottedplant": "potted plant",
  "wine glass": "wine glass",
  "hair drier": "hair drier",
};

/**
 * Normalise un libellé renvoyé par coco-ssd vers un mot connu de
 * l'application, ou retourne null si ce n'est pas un mot qu'on gère
 * (ex. un objet reconnu par le modèle mais absent de notre lexique de
 * phonèmes — inutile de le proposer à l'utilisateur).
 */
export function mapDetectionToAppWord(label, knownWords) {
  const normalized = label.toLowerCase().trim();
  if (knownWords.includes(normalized)) return normalized;

  const mapped = COCO_SSD_TO_APP_WORD[normalized];
  if (mapped && knownWords.includes(mapped)) return mapped;

  return null;
}
