import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight, Crown } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import TopBar from "../layout/TopBar";
import UserAvatar from "../components/UserAvatar";

export default function AdminUsersScreen() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/users?search=${encodeURIComponent(search)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => setUsers(data.users || []))
        .catch(() => setUsers([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search, token]);

  return (
    <div className="screen">
      <TopBar title="Utilisateurs" showBack onBack={() => navigate("/admin")} />

      <div className="card">
        <div className="search-input">
          <Search size={16} />
          <input
            placeholder="Rechercher par nom ou email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <p className="screen-hint">Chargement…</p>
      ) : users.length === 0 ? (
        <p className="screen-hint">Aucun utilisateur trouvé.</p>
      ) : (
        <div className="card">
          <ul className="admin-user-list">
            {users.map((u) => (
              <li key={u.id} className="admin-user-list__item" onClick={() => navigate(`/admin/users/${u.id}`)}>
                <div className="admin-user-list__avatar">
                  {u.avatar_url ? (
                    <UserAvatar user={u} size={40} className="admin-user-list__avatar-img" />
                  ) : (
                    (u.display_name || u.email)[0].toUpperCase()
                  )}
                </div>
                <div className="admin-user-list__info">
                  <strong>
                    {u.display_name || u.email}
                    {u.role === "admin" && <span className="admin-badge">Admin</span>}
                    {u.is_premium ? <Crown size={13} color="var(--c-warning)" /> : null}
                  </strong>
                  <span>{u.email}</span>
                </div>
                <ChevronRight size={18} color="var(--c-text-secondary)" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
