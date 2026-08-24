# Audio de référence (prononciation native)

Ce dossier doit contenir un fichier `.mp3` par mot, nommé exactement comme
le mot anglais (espaces → underscores) : `dog.mp3`, `traffic_light.mp3`,
`hot_dog.mp3`, etc.

## Comment les générer

```
cd backend
pip install gTTS
python scripts/generate_reference_audio.py
```

Ce script utilise Internet **une seule fois** (Google Text-to-Speech) pour
créer les 80 fichiers. Une fois générés, ils sont servis comme de simples
fichiers statiques — l'application n'a plus jamais besoin d'Internet pour
les lire.

## Alternative : tes propres enregistrements

Si tu préfères de vrais enregistrements humains plutôt que de la synthèse
vocale, dépose directement tes propres fichiers `.mp3` ici, avec exactement
les mêmes noms de fichiers. Le code ne fait aucune différence entre les deux
— il joue simplement le fichier qui existe.

## Si un fichier est absent

L'application bascule automatiquement sur la synthèse vocale du navigateur
pour ce mot (voir `frontend/src/lib/tts.js`). Rien ne casse si tu n'as pas
encore généré tous les mots.
