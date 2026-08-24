import { useState } from "react";
import { Share2, Check } from "lucide-react";

/**
 * Bouton "Copier le lien de l'application" — un seul et même lien pour web
 * ET mobile : l'URL d'origine de l'app est justement la PWA elle-même,
 * ouvrable dans un navigateur (web) ou installable sur téléphone (mobile) —
 * pas besoin de deux liens différents.
 *
 * Sur mobile, utilise le partage natif du téléphone (WhatsApp, SMS...) si
 * disponible ; sinon (desktop), copie simplement le lien dans le
 * presse-papier avec une confirmation visuelle.
 */
export default function ShareAppLinkButton() {
  const [copied, setCopied] = useState(false);
  const appUrl = window.location.origin;

  async function handleShare() {
    const shareData = {
      title: "PrononciA+",
      text: "Améliore ta prononciation anglaise avec PrononciA+ !",
      url: appUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // Annulé par l'utilisateur ou API indisponible — on retombe sur la copie.
      }
    }

    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papier inaccessible (permissions navigateur) — dernier
      // recours : sélectionner le texte pour une copie manuelle.
      window.prompt("Copie ce lien :", appUrl);
    }
  }

  return (
    <button className="share-app-link-btn" onClick={handleShare}>
      {copied ? <Check size={18} color="var(--c-success)" /> : <Share2 size={18} />}
      {copied ? "Lien copié !" : "Copier le lien de l'application"}
    </button>
  );
}
