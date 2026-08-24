import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useToast } from "../lib/ToastContext";

// Volontairement en sessionStorage (pas localStorage) : l'utilisateur a
// explicitement demandé que l'invite d'installation réapparaisse à CHAQUE
// connexion depuis un navigateur (pas juste une fois pour toujours). Un clic
// sur "Plus tard" la masque seulement pour l'onglet/session en cours — elle
// réapparaîtra à la prochaine ouverture du navigateur.
const DISMISS_SESSION_KEY = "parollle_install_dismissed_session";

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // Safari iOS expose ce flag non standard au lieu de display-mode
    window.navigator.standalone === true
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function wasDismissedThisSession() {
  return sessionStorage.getItem(DISMISS_SESSION_KEY) === "1";
}

/**
 * Bandeau d'installation PWA, calqué sur le modèle "Installer <App> / Plus
 * tard" fourni en référence.
 *
 * IMPORTANT (correctif) : avant, le bandeau ne s'affichait QUE si le
 * navigateur déclenchait l'événement natif `beforeinstallprompt` (Chrome/
 * Edge Android) — mais cet événement est capricieux : il ne se déclenche
 * pas du tout sur Firefox, ni sur desktop dans beaucoup de cas, et dépend de
 * critères d'engagement propres à chaque navigateur. Résultat : le bandeau
 * restait invisible pour une bonne partie des visiteurs, alors que la
 * demande était explicite ("à chaque connexion depuis un navigateur").
 *
 * Maintenant : le bandeau s'affiche TOUJOURS pour un visiteur navigateur
 * (pas déjà en mode application installée), avec un contenu adapté :
 * - Si `beforeinstallprompt` a pu être capté (Chrome/Edge) → vrai bouton
 *   "Installer" qui déclenche l'installation native en un tap.
 * - Sinon (Firefox, Safari desktop, ou Chrome qui n'a pas encore proposé
 *   l'événement) → instructions manuelles adaptées à la plateforme, jamais
 *   un bouton qui ne ferait rien.
 */
export default function InstallPrompt() {
  const { showToast } = useToast();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState(null); // "android" | "ios" | "desktop"

  useEffect(() => {
    if (isStandalone() || wasDismissedThisSession()) return;

    setPlatform(isIOS() ? "ios" : "desktop");
    setVisible(true);

    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setDeferredPrompt(event);
      setPlatform("android");
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISS_SESSION_KEY, "1");
    setVisible(false);
  }

  async function handleInstallClick() {
    // Chrome/Edge (Android ou desktop compatible) : vraie installation
    // native en un clic.
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log("[PWA] Choix d'installation :", outcome);
      sessionStorage.setItem(DISMISS_SESSION_KEY, "1");
      setDeferredPrompt(null);
      setVisible(false);
      return;
    }
    // Pas d'installation automatique possible ici (iOS, Firefox, ou Chrome
    // qui n'a pas encore proposé l'événement) — on rappelle la marche à
    // suivre manuelle via une notification plutôt que de laisser le bouton
    // ne rien faire.
    showToast(
      platform === "ios"
        ? "Appuie sur Partager ⬆️ puis « Sur l'écran d'accueil »."
        : "Ouvre le menu de ton navigateur (⋮ ou ⋯) puis « Installer l'application ».",
      { type: "offline", duration: 6000 }
    );
  }

  if (!visible) return null;

  return (
    <div className="install-prompt" role="dialog" aria-label="Installer l'application">
      <button className="install-prompt__close" onClick={dismiss} aria-label="Fermer">
        <X size={18} />
      </button>
      <div className="install-prompt__body">
        <div className="install-prompt__icon" aria-hidden="true">
          <img src="/branding/logo.png" alt="" />
        </div>
        <div>
          <h3 className="install-prompt__title">Installer PrononciA+</h3>
          <p className="install-prompt__desc">
            Ajoutez l'application à votre écran d'accueil pour un accès rapide, même hors ligne.
          </p>
        </div>
      </div>
      <div className="install-prompt__actions">
        <button className="install-prompt__install" onClick={handleInstallClick}>
          Installer
        </button>
        <button className="install-prompt__later" onClick={dismiss}>
          Plus tard
        </button>
      </div>
    </div>
  );
}
