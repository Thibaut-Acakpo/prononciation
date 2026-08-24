import { useEffect, useRef } from "react";
import { useToast } from "../lib/ToastContext";

/**
 * Remplace l'ancien bandeau hors-ligne PERMANENT (affiché en continu sur
 * chaque écran tant qu'on est hors-ligne) par une vraie notification
 * ponctuelle (toast), qui apparaît puis disparaît d'elle-même — moins
 * intrusif, plus proche d'une vraie notification d'application.
 *
 * Se déclenche :
 *  - à la toute première ouverture de l'app, si déjà hors-ligne ;
 *  - à chaque fois que la connexion est PERDUE en cours d'utilisation.
 *
 * Ne se répète pas en boucle tant qu'on reste hors-ligne (une seule
 * notification par "épisode" hors-ligne, pas un spam à chaque interaction).
 * Les écrans qui ont spécifiquement besoin d'une connexion (Match, Défi du
 * jour, analyse de prononciation...) affichent en plus leur propre rappel
 * ciblé via useOfflineNotice() — voir lib/useOfflineNotice.js.
 */
export default function OfflineNotifier() {
  const { showToast } = useToast();
  const announcedRef = useRef(false);

  useEffect(() => {
    if (!navigator.onLine && !announcedRef.current) {
      announcedRef.current = true;
      showToast(
        "Pas de connexion détectée. La galerie, les badges et l'écoute de prononciation fonctionnent quand même normalement — seule l'analyse de prononciation a besoin que le serveur soit joignable.",
        { type: "offline", duration: 7000 }
      );
    }

    function handleOffline() {
      if (announcedRef.current) return;
      announcedRef.current = true;
      showToast("Connexion perdue — la galerie et l'écoute continuent de fonctionner hors-ligne.", {
        type: "offline",
        duration: 6000,
      });
    }
    function handleOnline() {
      announcedRef.current = false; // permet une nouvelle notif si la connexion repart puis se coupe à nouveau
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [showToast]);

  return null;
}
