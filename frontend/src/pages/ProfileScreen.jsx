import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogIn, LogOut, Mail, Calendar, Pencil, Check, X,
  KeyRound, Trash2, BarChart3, AlertTriangle, Flame, Trophy, Target, Camera, ScanEye, Crown, Eye, Share2,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import TopBar from "../layout/TopBar";
import { getCurrentStreak } from "../lib/badges";
import AvatarPicker from "../components/AvatarPicker";
import UserAvatar from "../components/UserAvatar";
import ShareAppLinkButton from "../components/ShareAppLinkButton";

const APP_VERSION = "1.0.0";

export default function ProfileScreen() {
  const navigate = useNavigate();
  const {
    user, token, logout, updateDisplayName, changePassword, deleteAccount,
    isPremiumEffective, adminPreview, setAdminPreview,
  } = useAuth();

  const [stats, setStats] = useState(null);
  const [trophies, setTrophies] = useState(null);
  const [weakPoint, setWeakPoint] = useState(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/history?limit=200", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        const history = data.history || [];
        if (history.length === 0) { setStats({ total: 0 }); return; }
        const avgPer = history.reduce((s, h) => s + Number(h.per), 0) / history.length;
        const distinctWords = new Set(history.map((h) => h.expected_word)).size;
        setStats({ total: history.length, avgPer, distinctWords, streak: getCurrentStreak(history) });
      })
      .catch(() => setStats(null));

    fetch("/api/match/trophies", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setTrophies(d.trophies))
      .catch(() => setTrophies(null));

    fetch("/api/insights/weak-points", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setWeakPoint((d.insights || [])[0] || null))
      .catch(() => setWeakPoint(null));
  }, [user, token]);

  if (!user) {
    return (
      <div className="screen">
        <TopBar title="Profil" showBack onBack={() => navigate("/")} />
        <div className="empty-state">
          <p>Connecte-toi pour accéder à ton profil.</p>
          <button className="hero__cta" onClick={() => navigate("/login")}>
            <LogIn size={18} /> Se connecter
          </button>
        </div>
      </div>
    );
  }

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <div className="screen">
      <TopBar title="Profil" showBack onBack={() => navigate("/")} />

      <div className="card profile-card">
        <button
          className="profile-avatar profile-avatar--editable"
          onClick={() => setAvatarPickerOpen(true)}
          aria-label="Changer la photo de profil"
        >
          {user.avatar_url ? (
            <UserAvatar user={user} size={64} className="profile-avatar__img" />
          ) : (
            (user.display_name || user.email)[0].toUpperCase()
          )}
          <span className="profile-avatar__edit-badge"><Camera size={13} /></span>
        </button>
        <EditableName user={user} onSave={updateDisplayName} />
        {isPremiumEffective && (
          <span className="premium-badge"><Crown size={13} /> Premium</span>
        )}

        <p className="profile-detail"><Mail size={16} /> {user.email}</p>
        <p className="profile-detail">
          <Calendar size={16} /> Membre depuis le {new Date(user.created_at + "Z").toLocaleDateString("fr-FR")}
        </p>
      </div>

      {avatarPickerOpen && <AvatarPicker onClose={() => setAvatarPickerOpen(false)} />}

      {stats && stats.total > 0 && (
        <div className="card">
          <h3 className="card-subtitle">Aperçu rapide</h3>
          <div className="stats-row">
            <div className="stat-box">
              <span className="stat-box__value">{stats.total}</span>
              <span className="stat-box__label">Tentatives</span>
            </div>
            <div className="stat-box">
              <span className="stat-box__value">{stats.avgPer.toFixed(0)}%</span>
              <span className="stat-box__label">Erreur moyenne</span>
            </div>
            <div className="stat-box">
              <span className="stat-box__value">{stats.distinctWords}</span>
              <span className="stat-box__label">Mots essayés</span>
            </div>
          </div>

          {stats.streak > 0 && (
            <div className="streak-banner">
              <Flame size={20} color="#f97316" />
              <span><strong>{stats.streak}</strong> jour{stats.streak > 1 ? "s" : ""} d'affilée — continue comme ça !</span>
            </div>
          )}
        </div>
      )}

      {trophies && trophies.totalMatches > 0 && (
        <div className="card">
          <h3 className="card-subtitle">Trophées de Match</h3>
          <div className="trophy-row">
            <div className="trophy-box"><Trophy size={20} color="var(--c-warning)" /><span>{trophies.gold} Or</span></div>
            <div className="trophy-box"><Trophy size={20} color="var(--c-text-tertiary)" /><span>{trophies.silver} Argent</span></div>
            <div className="trophy-box"><Trophy size={20} color="#d97706" /><span>{trophies.bronze} Bronze</span></div>
          </div>
        </div>
      )}

      {weakPoint && (
        <div className="card weak-point-card">
          <h3 className="card-subtitle"><Target size={16} /> Point à travailler</h3>
          <p>{weakPoint.message}</p>
          <button className="weak-point-card__more" onClick={() => navigate("/premium/insights")}>
            {isPremiumEffective ? "Voir le rapport complet →" : <><Crown size={13} color="var(--c-warning)" /> Rapport avancé (Premium)</>}
          </button>
        </div>
      )}

      <div className="card">
        <button className="home-card" onClick={() => navigate("/history")}>
          <BarChart3 size={22} />
          <div>
            <strong>Voir ma progression complète</strong>
            <p>Historique détaillé, courbe et badges</p>
          </div>
        </button>
      </div>

      {user.role === "admin" && (
        <div className="card admin-preview-card">
          <h3 className="card-subtitle"><Eye size={16} /> Mode d'aperçu (admin)</h3>
          <p>Prévisualise l'app comme un autre type de compte, sans changer ton statut réel.</p>
          <div className="admin-preview-toggle">
            <button
              className={!adminPreview ? "active" : ""}
              onClick={() => setAdminPreview(null)}
            >
              Admin (normal)
            </button>
            <button
              className={adminPreview === "standard" ? "active" : ""}
              onClick={() => setAdminPreview("standard")}
            >
              Utilisateur standard
            </button>
            <button
              className={adminPreview === "premium" ? "active" : ""}
              onClick={() => setAdminPreview("premium")}
            >
              Utilisateur Premium
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <button className="home-card" onClick={() => navigate("/premium")}>
          <Crown size={22} color="var(--c-warning)" />
          <div>
            <strong>{isPremiumEffective ? "Statut Premium" : "Passer Premium ⭐"}</strong>
            <p>{isPremiumEffective ? "Gérer / voir tes avantages" : "Avatars exclusifs, badge, et plus"}</p>
          </div>
        </button>
      </div>

      <div className="card">
        <button className="home-card" onClick={() => navigate("/camera-diagnostic")}>
          <ScanEye size={22} />
          <div>
            <strong>Diagnostic caméra</strong>
            <p>Vérifier que la détection d'objets en direct fonctionne</p>
          </div>
        </button>
      </div>

      <div className="card">
        <ShareAppLinkButton />
      </div>

      <ChangePasswordCard changePassword={changePassword} />
      <DangerZone deleteAccount={deleteAccount} navigate={navigate} />

      {!confirmingLogout ? (
        <button className="logout-btn" onClick={() => setConfirmingLogout(true)}>
          <LogOut size={18} /> Se déconnecter
        </button>
      ) : (
        <div className="logout-confirm">
          <p>Confirmer la déconnexion ?</p>
          <div className="logout-confirm__actions">
            <button className="logout-btn" onClick={handleLogout}>Oui, me déconnecter</button>
            <button className="btn-discard" onClick={() => setConfirmingLogout(false)}>Annuler</button>
          </div>
        </div>
      )}

      <p className="app-version">PrononciA+ — v{APP_VERSION}</p>
    </div>
  );
}

function EditableName({ user, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(user.display_name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!value.trim()) { setError("Le nom ne peut pas être vide."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(value.trim());
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <h2 className="profile-name">
        {user.display_name || "Utilisateur"}
        <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Modifier le nom">
          <Pencil size={15} />
        </button>
      </h2>
    );
  }

  return (
    <div className="profile-name-edit">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={60}
        autoFocus
      />
      <button className="icon-btn icon-btn--confirm" onClick={handleSave} disabled={saving} aria-label="Valider">
        <Check size={16} />
      </button>
      <button className="icon-btn" onClick={() => { setEditing(false); setValue(user.display_name || ""); setError(""); }} aria-label="Annuler">
        <X size={16} />
      </button>
      {error && <p className="auth-panel__error">{error}</p>}
    </div>
  );
}


function ChangePasswordCard({ changePassword }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await changePassword(current, next);
      setSuccess(true);
      setCurrent("");
      setNext("");
      setTimeout(() => { setSuccess(false); setOpen(false); }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <button className="settings-toggle" onClick={() => setOpen((v) => !v)}>
        <KeyRound size={18} /> Changer mon mot de passe
      </button>

      {open && (
        <div className="auth-screen__center auth-screen__center--inline">
          <form className="auth-card" onSubmit={handleSubmit}>
            <h2 className="auth-card__title">Nouveau mot de passe</h2>
            <input
              type="password"
              placeholder="Mot de passe actuel"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoFocus
            />
            <input
              type="password"
              placeholder="Nouveau mot de passe (8 caractères min.)"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              minLength={8}
              required
            />
          {error && <p className="auth-panel__error">{error}</p>}
          {success && <p className="success-text">Mot de passe mis à jour ✓</p>}
          <button type="submit" className="hero__cta" disabled={submitting}>
            {submitting ? "…" : "Valider"}
          </button>
          </form>
        </div>
      )}
    </div>
  );
}

function DangerZone({ deleteAccount, navigate }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirmDelete() {
    setDeleting(true);
    setError("");
    try {
      await deleteAccount();
      navigate("/");
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  return (
    <div className="card danger-zone">
      {!confirming ? (
        <button className="danger-zone__trigger" onClick={() => setConfirming(true)}>
          <Trash2 size={16} /> Supprimer mon compte
        </button>
      ) : (
        <div className="danger-zone__confirm">
          <p><AlertTriangle size={16} /> Cette action est définitive : ton compte et tout ton historique seront supprimés. Confirmer ?</p>
          {error && <p className="auth-panel__error">{error}</p>}
          <div className="danger-zone__actions">
            <button className="danger-zone__confirm-btn" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Suppression…" : "Oui, supprimer"}
            </button>
            <button className="btn-discard" onClick={() => setConfirming(false)} disabled={deleting}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
