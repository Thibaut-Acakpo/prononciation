import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Sparkles, Shuffle, X, Loader2, Trash2, Lock, Crown, WifiOff } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { offlineAvatarDataUrl } from "./UserAvatar";
import UserAvatar from "./UserAvatar";

// Styles réels du service open source DiceBear (https://www.dicebear.com) —
// chaque image est générée à la volée par leur API, ce n'est jamais une
// image inventée localement. On en propose un sous-ensemble varié.
const STYLES = [
  { id: "adventurer", label: "Aventurier" },
  { id: "avataaars", label: "Cartoon" },
  { id: "bottts", label: "Robot" },
  { id: "fun-emoji", label: "Emoji" },
  { id: "lorelei", label: "Illustré" },
  { id: "notionists", label: "Minimal", premium: true },
  { id: "personas", label: "Personas", premium: true },
  { id: "pixel-art", label: "Pixel art" },
  { id: "thumbs", label: "Formes", premium: true },
];

function avatarSrc(style, seed) {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

export default function AvatarPicker({ onClose }) {
  const { user, uploadAvatar, setAvatarPreset, setOfflineAvatar, removeAvatar, isPremiumEffective } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("offline");
  const [nonce, setNonce] = useState(0);
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);

  // Nettoyée (email → alphanumérique uniquement) : le "@" et le "." d'une
  // adresse email ne sont pas acceptés par la validation stricte du serveur
  // pour les graines d'avatar hors-ligne (voir POST /me/avatar/offline),
  // ce qui provoquait l'erreur "Graine d'avatar invalide" à chaque tentative.
  const baseSeed = (user?.email || "prononcia").replace(/[^a-zA-Z0-9]/g, "") || "prononcia";

  const handlePickOffline = useCallback(async (seed) => {
    setBusyKey(seed);
    setError("");
    try {
      await setOfflineAvatar(seed);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyKey(null);
    }
  }, [setOfflineAvatar, onClose]);

  const handlePickPreset = useCallback(async (style, isLocked) => {
    if (isLocked) {
      onClose();
      navigate("/premium");
      return;
    }
    const seed = `${baseSeed}-${nonce}-${style}`;
    setBusyKey(style);
    setError("");
    try {
      await setAvatarPreset(style, seed);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyKey(null);
    }
  }, [baseSeed, nonce, setAvatarPreset, onClose, navigate]);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    setError("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Format non supporté : choisis une image JPEG, PNG ou WEBP.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Image trop lourde (4 Mo maximum).");
      return;
    }
    setPreview({ file, url: URL.createObjectURL(file) });
  }

  async function handleConfirmUpload() {
    if (!preview) return;
    setBusyKey("upload");
    setError("");
    try {
      await uploadAvatar(preview.file);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRemove() {
    setBusyKey("remove");
    setError("");
    try {
      await removeAvatar();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="avatar-picker-backdrop" onClick={onClose}>
      <div className="avatar-picker" onClick={(e) => e.stopPropagation()}>
        <div className="avatar-picker__header">
          <h2>Photo de profil</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="avatar-picker__tabs">
          <button
            className={`avatar-picker__tab${tab === "offline" ? " active" : ""}`}
            onClick={() => setTab("offline")}
          >
            <WifiOff size={15} /> Simples
          </button>
          <button
            className={`avatar-picker__tab${tab === "preset" ? " active" : ""}`}
            onClick={() => setTab("preset")}
          >
            <Sparkles size={15} /> Avancés
          </button>
          <button
            className={`avatar-picker__tab${tab === "upload" ? " active" : ""}`}
            onClick={() => setTab("upload")}
          >
            <Camera size={15} /> Ma photo
          </button>
        </div>

        {error && <p className="auth-panel__error">{error}</p>}

        {tab === "offline" ? (
          <>
            <div className="avatar-picker__toolbar">
              <span>Générés sur ton appareil — fonctionnent sans connexion, à tout moment.</span>
              <button className="avatar-picker__shuffle" onClick={() => setNonce((n) => n + 1)}>
                <Shuffle size={14} /> D'autres motifs
              </button>
            </div>
            <div className="avatar-picker__grid">
              {Array.from({ length: 9 }, (_, i) => `${baseSeed}-off-${nonce}-${i}`).map((seed) => {
                const isBusy = busyKey === seed;
                return (
                  <button
                    key={seed}
                    className="avatar-picker__option"
                    onClick={() => handlePickOffline(seed)}
                    disabled={busyKey !== null}
                    aria-label="Choisir cet avatar"
                  >
                    <span className="avatar-picker__thumb">
                      {isBusy ? <Loader2 className="spin" size={20} /> : (
                        <img src={offlineAvatarDataUrl(seed, 96)} alt="" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : tab === "preset" ? (
          <>
            <div className="avatar-picker__toolbar">
              <span>Générateur DiceBear — nécessite une connexion internet.</span>
              <button className="avatar-picker__shuffle" onClick={() => setNonce((n) => n + 1)}>
                <Shuffle size={14} /> Autres styles
              </button>
            </div>
            <div className="avatar-picker__grid">
              {STYLES.map(({ id, label, premium }) => {
                const seed = `${baseSeed}-${nonce}-${id}`;
                const isBusy = busyKey === id;
                const isLocked = premium && !isPremiumEffective;
                return (
                  <button
                    key={id}
                    className="avatar-picker__option"
                    onClick={() => handlePickPreset(id, isLocked)}
                    disabled={busyKey !== null}
                    aria-label={isLocked ? `${label} (réservé aux comptes Premium)` : `Choisir l'avatar ${label}`}
                  >
                    <span className={`avatar-picker__thumb${isLocked ? " avatar-picker__thumb--locked" : ""}`}>
                      {isBusy ? <Loader2 className="spin" size={20} /> : (
                        <img src={avatarSrc(id, seed)} alt="" loading="lazy" />
                      )}
                      {isLocked && !isBusy && (
                        <span className="avatar-picker__lock"><Lock size={14} /></span>
                      )}
                    </span>
                    <span className="avatar-picker__label">
                      {premium && <Crown size={11} color="var(--c-warning)" />} {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="avatar-picker__upload">
            <div className="avatar-picker__upload-preview">
              {preview ? (
                <img src={preview.url} alt="Aperçu de la photo choisie" />
              ) : user?.avatar_url ? (
                <UserAvatar user={user} size={128} />
              ) : (
                <span className="avatar-picker__upload-placeholder">
                  {(user?.display_name || user?.email || "?")[0].toUpperCase()}
                </span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              hidden
            />
            <button className="hero__cta" onClick={() => fileInputRef.current?.click()}>
              <Camera size={16} /> {preview ? "Changer de photo" : "Choisir une photo"}
            </button>
            {preview && (
              <button
                className="hero__cta avatar-picker__confirm"
                onClick={handleConfirmUpload}
                disabled={busyKey === "upload"}
              >
                {busyKey === "upload" ? <Loader2 className="spin" size={16} /> : "Valider cette photo"}
              </button>
            )}
          </div>
        )}

        {user?.avatar_url && (
          <button className="avatar-picker__remove" onClick={handleRemove} disabled={busyKey !== null}>
            <Trash2 size={14} /> Retirer la photo actuelle
          </button>
        )}
      </div>
    </div>
  );
}
