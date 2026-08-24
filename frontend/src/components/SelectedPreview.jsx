import { useState, useEffect } from "react";
import { ArrowLeftRight, Volume2, ImageOff, Wifi, Loader2 } from "lucide-react";
import { getWordInfo } from "../lib/words";
import { speakWord } from "../lib/tts";

const onlineImageCache = new Map();

export default function SelectedPreview({ word, frOverride, onChangeObject }) {
  const baseItem = getWordInfo(word);
  // Si la traduction a déjà été fournie par l'appelant (ex. un mot choisi
  // dans un thème Premium — voir ThemedWordLists.jsx), on l'utilise plutôt
  // que le repli par défaut de getWordInfo() (qui ne connaît que les 80
  // objets de la galerie caméra et retomberait sinon sur le mot anglais lui-même).
  const item = frOverride ? { ...baseItem, fr: frOverride } : baseItem;
  const [failed, setFailed] = useState(false);
  const [onlineImage, setOnlineImage] = useState(undefined);
  const [searching, setSearching] = useState(false);
  const [notFoundReason, setNotFoundReason] = useState(null);

  useEffect(() => {
    setFailed(false);

    if (item.image) {
      setOnlineImage(undefined);
      setNotFoundReason(null);
      return;
    }

    if (onlineImageCache.has(word)) {
      setOnlineImage(onlineImageCache.get(word));
      setNotFoundReason(onlineImageCache.get(word) ? null : "already_checked");
      return;
    }

    let cancelled = false;
    setSearching(true);
    setNotFoundReason(null);

    fetch(`/api/word-image/search?word=${encodeURIComponent(word)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        onlineImageCache.set(word, data.imageUrl || null);
        setOnlineImage(data.imageUrl || null);
        if (!data.imageUrl) setNotFoundReason(data.reason || "not_found");
      })
      .catch(() => {
        if (cancelled) return;
        setOnlineImage(null);
        setNotFoundReason("network_error");
      })
      .finally(() => { if (!cancelled) setSearching(false); });

    return () => { cancelled = true; };
  }, [word, item.image]);

  const displayImage = item.image || (onlineImage && !failed ? onlineImage : null);

  return (
    <div className="selected-preview">
      <div className="selected-preview-img">
        {displayImage ? (
          <img src={displayImage} alt={word} onError={() => setFailed(true)} />
        ) : searching ? (
          <div className="selected-preview-fallback">
            <Loader2 size={32} strokeWidth={1.4} className="spin-icon" />
          </div>
        ) : (
          <div className="selected-preview-fallback"><ImageOff size={40} strokeWidth={1.4} /></div>
        )}
        <div className="selected-preview-word-overlay">
          {word}
          {item.fr && item.fr.toLowerCase() !== word.toLowerCase() && (
            <span className="selected-preview-word-fr">{item.fr}</span>
          )}
        </div>
      </div>

      {!item.image && !searching && notFoundReason && (
        <p className="word-image-notice">
          {notFoundReason === "network_error" || notFoundReason === "not_configured"
            ? (
              <><Wifi size={14} /> Une connexion Internet est nécessaire pour afficher une image de ce mot.</>
            ) : (
              <>Aucune image trouvée pour "{word}" — l'entraînement fonctionne quand même normalement.</>
            )}
        </p>
      )}

      <div className="selected-preview-actions">
        <button className="btn-listen" onClick={() => speakWord(word)}>
          <Volume2 size={16} /> Écouter la prononciation native
        </button>
        <button className="btn-change-object" onClick={onChangeObject}>
          <ArrowLeftRight size={16} /> Changer d'objet
        </button>
      </div>
    </div>
  );
}
