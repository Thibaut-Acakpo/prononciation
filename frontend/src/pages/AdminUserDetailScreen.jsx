import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Mail, Calendar, Trash2, ShieldCheck, ShieldOff, Save, AlertTriangle, Crown, MailCheck, MailWarning } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import TopBar from "../layout/TopBar";
import UserAvatar from "../components/UserAvatar";

export default function AdminUserDetailScreen() {
  const { id } = useParams();
  const { token, user: currentAdmin } = useAuth();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/users/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setDetail(d);
        setDisplayName(d.user.display_name || "");
      })
      .catch(() => setError("Impossible de charger cet utilisateur."));
  }, [id, token]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ displayName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDetail((prev) => ({ ...prev, user: data.user }));
      setSuccess("Nom mis à jour.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleRole() {
    const newRole = detail.user.role === "admin" ? "user" : "admin";
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDetail((prev) => ({ ...prev, user: data.user }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function togglePremium() {
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${id}/premium`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isPremium: !detail.user.is_premium }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDetail((prev) => ({ ...prev, user: data.user }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete() {
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      navigate("/admin");
    } catch (err) {
      setError(err.message);
      setConfirmingDelete(false);
    }
  }

  if (error && !detail) {
    return (
      <div className="screen">
        <TopBar title="Utilisateur" showBack onBack={() => navigate("/admin")} />
        <div className="empty-state"><p>{error}</p></div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="screen">
        <TopBar title="Utilisateur" showBack onBack={() => navigate("/admin")} />
        <p className="screen-hint">Chargement…</p>
      </div>
    );
  }

  const { user, history, trophies, stats } = detail;
  const isSelf = currentAdmin?.id === user.id;
  const isSuperAdmin = Boolean(currentAdmin?.is_super_admin);
  const targetIsAdmin = user.role === "admin";
  const targetIsSuperAdmin = Boolean(user.is_super_admin);

  // Miroir exact des règles appliquées côté serveur (voir
  // routes/admin.routes.js) : un admin classique ne peut jamais changer un
  // rôle, ni toucher au profil/Premium/compte d'un AUTRE administrateur.
  const canChangeRole = isSuperAdmin && !isSelf && !targetIsSuperAdmin;
  const canEditProfile = !targetIsAdmin || isSelf || isSuperAdmin;
  const canTogglePremium = !targetIsAdmin || isSelf || isSuperAdmin;
  const canDelete = !isSelf && !targetIsSuperAdmin && (!targetIsAdmin || isSuperAdmin);

  return (
    <div className="screen">
      <TopBar title="Utilisateur" showBack onBack={() => navigate("/admin")} />

      <div className="card profile-card">
        <div className="profile-avatar"><UserAvatar user={user} size={64} className="profile-avatar__img" /></div>
        <h2 className="profile-name">
          {user.display_name || "Utilisateur"}
          {user.role === "admin" && <span className="admin-badge">{user.is_super_admin ? "Super-admin" : "Admin"}</span>}
          {user.is_premium && <span className="premium-badge"><Crown size={12} /> Premium</span>}
        </h2>
        <p className="profile-detail"><Mail size={16} /> {user.email}</p>
        <p className="profile-detail">
          {user.email_verified ? (
            <><MailCheck size={16} color="var(--c-success)" /> Email confirmé</>
          ) : (
            <><MailWarning size={16} color="var(--c-warning)" /> Email non confirmé</>
          )}
        </p>
        <p className="profile-detail">
          <Calendar size={16} /> Membre depuis le {new Date(user.created_at + "Z").toLocaleDateString("fr-FR")}
        </p>
      </div>

      {stats && stats.count > 0 && (
        <div className="card">
          <h3 className="card-subtitle">Statistiques</h3>
          <div className="stats-row">
            <div className="stat-box">
              <span className="stat-box__value">{stats.count}</span>
              <span className="stat-box__label">Tentatives</span>
            </div>
            <div className="stat-box">
              <span className="stat-box__value">{stats.avgPer != null ? `${(100 - stats.avgPer).toFixed(0)}%` : "—"}</span>
              <span className="stat-box__label">Réussite moyenne</span>
            </div>
            <div className="stat-box">
              <span className="stat-box__value">{trophies.gold + trophies.silver + trophies.bronze}</span>
              <span className="stat-box__label">Médailles</span>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="card-subtitle">Modifier le profil</h3>
        <div className="form-row">
          <label>Nom d'affichage</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
            className="admin-text-input"
            disabled={!canEditProfile}
          />
        </div>
        {error && <p className="auth-panel__error">{error}</p>}
        {success && <p className="success-text">{success}</p>}
        <button className="hero__cta" onClick={handleSave} disabled={saving || !canEditProfile}>
          <Save size={16} /> {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        {!canEditProfile && (
          <p className="screen-hint">Seul le super-administrateur peut modifier le profil d'un autre administrateur.</p>
        )}
      </div>

      <div className="card">
        <h3 className="card-subtitle">Rôle</h3>
        <button className="settings-toggle" onClick={toggleRole} disabled={!canChangeRole}>
          {user.role === "admin" ? <ShieldOff size={18} /> : <ShieldCheck size={18} />}
          {user.role === "admin" ? "Retirer les droits administrateur" : "Promouvoir administrateur"}
        </button>
        {isSelf && <p className="screen-hint">Tu ne peux pas modifier tes propres droits ici.</p>}
        {!isSelf && targetIsSuperAdmin && <p className="screen-hint">Les droits du super-administrateur ne peuvent pas être modifiés.</p>}
        {!isSelf && !targetIsSuperAdmin && !isSuperAdmin && (
          <p className="screen-hint">Seul le super-administrateur peut changer les droits administrateur.</p>
        )}
      </div>

      <div className="card">
        <h3 className="card-subtitle"><Crown size={16} color="var(--c-warning)" /> Statut Premium</h3>
        <p className="screen-hint" style={{ padding: "0 0 10px", textAlign: "left" }}>
          Utile pour un paiement reçu hors FedaPay (virement, espèces, geste commercial).
        </p>
        <button className="settings-toggle" onClick={togglePremium} disabled={!canTogglePremium}>
          <Crown size={18} />
          {user.is_premium ? "Retirer le statut Premium" : "Accorder Premium manuellement"}
        </button>
        {!canTogglePremium && (
          <p className="screen-hint">Seul le super-administrateur peut modifier le Premium d'un autre administrateur.</p>
        )}
      </div>

      {history.length > 0 && (
        <div className="card">
          <h3 className="card-subtitle">Historique récent</h3>
          <table className="history-table">
            <thead>
              <tr><th>Mot</th><th>Reconnu</th><th>Score</th><th>Date</th></tr>
            </thead>
            <tbody>
              {history.slice(0, 10).map((h) => (
                <tr key={h.id}>
                  <td>{h.expected_word}</td>
                  <td>{h.recognized_text || "—"}</td>
                  <td>{(100 - Number(h.per)).toFixed(0)}%</td>
                  <td>{new Date(h.created_at + "Z").toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card danger-zone">
        {!confirmingDelete ? (
          <button className="danger-zone__trigger" onClick={() => setConfirmingDelete(true)} disabled={!canDelete}>
            <Trash2 size={16} /> Supprimer ce compte
          </button>
        ) : (
          <div className="danger-zone__confirm">
            <p><AlertTriangle size={16} /> Suppression définitive du compte et de tout son historique. Confirmer ?</p>
            <div className="danger-zone__actions">
              <button className="danger-zone__confirm-btn" onClick={handleDelete}>Oui, supprimer</button>
              <button className="btn-discard" onClick={() => setConfirmingDelete(false)}>Annuler</button>
            </div>
          </div>
        )}
        {isSelf && <p className="screen-hint">Tu ne peux pas supprimer ton propre compte depuis cet écran.</p>}
        {!isSelf && targetIsSuperAdmin && <p className="screen-hint">Le compte du super-administrateur ne peut pas être supprimé.</p>}
        {!isSelf && !targetIsSuperAdmin && targetIsAdmin && !isSuperAdmin && (
          <p className="screen-hint">Seul le super-administrateur peut supprimer un compte administrateur.</p>
        )}
      </div>
    </div>
  );
}
