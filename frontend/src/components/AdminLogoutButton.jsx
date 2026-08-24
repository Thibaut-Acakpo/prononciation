import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

/**
 * Bouton de déconnexion admin — volontairement explicite (texte visible, pas
 * juste une icône) et avec confirmation, contrairement à l'ancien bouton
 * icône-seul de 30px facile à manquer/cliquer par erreur. Réutilisé à la
 * fois dans la sidebar desktop (AdminLayout) et directement dans le tableau
 * de bord (AdminDashboardScreen), pour qu'il soit toujours accessible même
 * sur mobile où la sidebar est masquée.
 */
export default function AdminLogoutButton({ className = "" }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button className={`admin-logout-btn ${className}`} onClick={() => setConfirming(true)}>
        <LogOut size={17} /> Se déconnecter
      </button>
    );
  }

  return (
    <div className={`admin-logout-confirm ${className}`}>
      <span>Se déconnecter de l'administration ?</span>
      <div className="admin-logout-confirm__actions">
        <button className="admin-logout-confirm__yes" onClick={() => { logout(); navigate("/"); }}>
          Oui, déconnecter
        </button>
        <button className="btn-discard" onClick={() => setConfirming(false)}>Annuler</button>
      </div>
    </div>
  );
}
