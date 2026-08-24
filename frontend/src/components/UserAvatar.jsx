import OfflineAvatar, { offlineAvatarDataUrl } from "./OfflineAvatar";

export function isOfflineAvatarUrl(url) {
  return typeof url === "string" && url.startsWith("offline:");
}

/**
 * Affiche l'avatar d'un utilisateur, quelle que soit sa provenance :
 *  - "offline:<graine>" → généré localement, sans réseau (OfflineAvatar.jsx)
 *  - une vraie URL (DiceBear ou photo uploadée) → <img> classique
 *  - rien → initiale du nom/email sur fond dégradé
 *
 * Centralisé ici pour que ProfileScreen, AdminDashboardScreen, AdminLayout
 * et AvatarPicker affichent tous exactement la même chose de la même façon.
 */
export default function UserAvatar({ user, size = 40, className = "" }) {
  const label = (user?.display_name || user?.email || "?")[0].toUpperCase();

  if (isOfflineAvatarUrl(user?.avatar_url)) {
    return <OfflineAvatar seed={user.avatar_url.slice(8)} size={size} className={className} />;
  }
  if (user?.avatar_url) {
    return <img src={user.avatar_url} alt="" className={className} width={size} height={size} />;
  }
  return <span className={className}>{label}</span>;
}

export { offlineAvatarDataUrl };
