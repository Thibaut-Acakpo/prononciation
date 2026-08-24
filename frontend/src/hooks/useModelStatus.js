import { useEffect, useState, useRef } from "react";

/**
 * Interroge /api/status pour savoir si le worker Python (et donc le modèle
 * Whisper) est prêt. Tant que ce n'est pas le cas, on évite de laisser
 * l'utilisateur lancer une analyse qui échouerait avec un message confus —
 * on affiche plutôt clairement "chargement en cours".
 *
 * Le tout premier chargement peut être long UNIQUEMENT si le modèle doit
 * être téléchargé (connexion lente) ou si le fichier en cache est corrompu
 * et doit être retéléchargé. Une fois en cache, les démarrages suivants du
 * serveur sont quasi instantanés.
 */
export function useModelStatus() {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const intervalRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/status");
        const data = await res.json();
        if (cancelled) return;
        setReady(!!data.ready);
        setChecking(false);
        if (data.ready && intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      } catch {
        if (!cancelled) setChecking(false);
      }
    }

    poll();
    intervalRef.current = setInterval(poll, 3000);

    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
    };
  }, []);

  return { ready, checking };
}
