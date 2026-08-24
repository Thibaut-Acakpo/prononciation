import { useEffect, useRef } from "react";
import { useToast } from "./ToastContext";

const DEFAULT_MESSAGE =
  "Pas de connexion détectée — cette fonctionnalité a besoin qu'Internet (ou ton serveur) soit joignable.";

/**
 * Affiche une vraie notification temporaire (toast), PAS un bandeau
 * persistant, quand l'utilisateur arrive sur un écran qui a besoin d'une
 * connexion alors qu'il est hors-ligne. Se déclenche à chaque fois que
 * l'écran est ouvert dans cet état (pas seulement une fois pour toute la
 * session), mais jamais plus d'une fois par montage du composant — donc pas
 * de spam si l'écran ne se démonte pas entre deux vérifications.
 *
 * Usage : useOfflineNotice("Le mode Match a besoin d'une connexion...")
 * en tête d'un écran qui dépend du serveur (Match, Défi du jour, analyse de
 * prononciation, diagnostic caméra au premier chargement du modèle...).
 */
export function useOfflineNotice(customMessage) {
  const { showToast } = useToast();
  const shownRef = useRef(false);

  useEffect(() => {
    if (!navigator.onLine && !shownRef.current) {
      shownRef.current = true;
      showToast(customMessage || DEFAULT_MESSAGE, { type: "offline", duration: 6000 });
    }
    // Intentionnellement déclenché une seule fois au montage de l'écran —
    // pas besoin de réagir aux changements de `customMessage` en cours de vie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
