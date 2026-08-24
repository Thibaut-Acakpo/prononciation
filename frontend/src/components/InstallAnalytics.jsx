import { useEffect } from "react";
import { useAuth } from "../auth/AuthContext";

const LOGGED_KEY = "parollle_install_logged";

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function detectPlatform() {
  const ua = window.navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

/**
 * Compte les "installations" de l'app pour le tableau de bord admin.
 *
 * Il n'existe pas d'API navigateur universelle "l'app vient d'être
 * installée" — `appinstalled` existe sur Chrome/Edge mais PAS sur Safari
 * iOS (l'ajout à l'écran d'accueil n'y déclenche aucun événement). La
 * méthode fiable sur toutes les plateformes : détecter que l'app tourne en
 * mode "standalone" (donc a bien été installée/ajoutée à l'écran d'accueil,
 * pas juste ouverte dans un onglet de navigateur), et n'envoyer l'info
 * qu'une seule fois par appareil grâce à un flag localStorage.
 */
export default function InstallAnalytics() {
  const { token } = useAuth();

  useEffect(() => {
    if (!isStandalone()) return;
    if (localStorage.getItem(LOGGED_KEY)) return;

    fetch("/api/analytics/install", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ platform: detectPlatform() }),
    })
      .then(() => localStorage.setItem(LOGGED_KEY, "1"))
      .catch(() => { /* pas grave si ça échoue une fois — on retentera à la prochaine ouverture */ });
  }, [token]);

  return null;
}
