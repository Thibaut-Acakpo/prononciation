import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, ArrowLeft, ShieldCheck, Users, CreditCard } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import UserAvatar from "../components/UserAvatar";
import AdminLogoutButton from "../components/AdminLogoutButton";

/**
 * Chrome dédié à la zone d'administration.
 *
 * Sur mobile, ce layout reste quasi invisible : chaque écran admin garde son
 * propre <TopBar> (bouton retour + titre), comme avant. La nouveauté est la
 * sidebar (≥1024px) — masquée en dessous via CSS (voir `.admin-layout__sidebar`
 * dans styles.css) — qui donne à l'administration une vraie mise en page de
 * tableau de bord desktop au lieu d'un écran mobile simplement étiré.
 */
export default function AdminLayout() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="admin-layout">
      <aside className="admin-layout__sidebar">
        <div className="admin-layout__brand">
          <img src="/branding/logo.png" alt="PrononciA+" />
          <div>
            <strong>PrononciA+</strong>
            <span>Administration</span>
          </div>
        </div>

        <nav className="admin-layout__nav">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) => `admin-layout__nav-item${isActive ? " active" : ""}`}
          >
            <LayoutDashboard size={18} /> Vue d'ensemble
          </NavLink>
          <NavLink
            to="/admin/users"
            className={({ isActive }) => `admin-layout__nav-item${isActive ? " active" : ""}`}
          >
            <Users size={18} /> Utilisateurs
          </NavLink>
          <NavLink
            to="/admin/payments"
            className={({ isActive }) => `admin-layout__nav-item${isActive ? " active" : ""}`}
          >
            <CreditCard size={18} /> Paiements
          </NavLink>
        </nav>

        <div className="admin-layout__spacer" />

        <button className="admin-layout__nav-item" onClick={toggleTheme}>
          <ShieldCheck size={18} /> Thème : {theme === "dark" ? "sombre" : "clair"}
        </button>
        <button className="admin-layout__nav-item" onClick={() => navigate("/")}>
          <ArrowLeft size={18} /> Retour à l'application
        </button>

        <div className="admin-layout__profile">
          <div className="admin-layout__avatar">
            {user?.avatar_url ? (
              <UserAvatar user={user} size={36} />
            ) : (
              (user?.display_name || user?.email || "?")[0].toUpperCase()
            )}
          </div>
          <div className="admin-layout__profile-info">
            <strong>{user?.display_name || "Administrateur"}</strong>
            <span>{user?.email}</span>
          </div>
        </div>

        <AdminLogoutButton className="admin-layout__logout-btn" />
      </aside>

      <div className="admin-layout__main">
        <Outlet />
      </div>
    </div>
  );
}
