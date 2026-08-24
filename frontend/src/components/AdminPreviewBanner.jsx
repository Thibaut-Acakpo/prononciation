import { Eye, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

export default function AdminPreviewBanner() {
  const { user, adminPreview, setAdminPreview } = useAuth();

  if (user?.role !== "admin" || !adminPreview) return null;

  const label = adminPreview === "standard" ? "Utilisateur standard" : "Utilisateur Premium";

  return (
    <div className="admin-preview-banner-wrap">
      <div className="admin-preview-banner">
        <Eye size={16} />
        <span>Aperçu actif : tu vois l'app comme un <strong>{label}</strong></span>
        <button onClick={() => setAdminPreview(null)}>
          <X size={13} /> Revenir en admin
        </button>
      </div>
    </div>
  );
}
