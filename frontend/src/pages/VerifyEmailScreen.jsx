import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { CircleCheck, CircleAlert, Loader2, MailCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import TopBar from "../layout/TopBar";

export default function VerifyEmailScreen() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [state, setState] = useState("checking"); // checking | success | error
  const [error, setError] = useState("");
  const attempted = useRef(false);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setState("error");
      setError("Lien de vérification incomplet : aucun jeton trouvé dans l'URL.");
      return;
    }
    // React (StrictMode ou re-render) pourrait relancer cet effet — le token
    // n'étant utilisable qu'une fois côté serveur, on protège avec un flag
    // local pour éviter un 2ᵉ appel inutile (qui échouerait de toute façon).
    if (attempted.current) return;
    attempted.current = true;

    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Lien de vérification invalide.");
        setState("success");
        if (user) refreshUser().catch(() => {});
      })
      .catch((err) => {
        setState("error");
        setError(err.message);
      });
  }, [searchParams, user, refreshUser]);

  return (
    <div className="screen">
      <TopBar title="Confirmation d'email" showBack onBack={() => navigate("/")} />

      <div className="card verify-email">
        {state === "checking" && (
          <>
            <Loader2 className="spin" size={40} color="var(--c-link)" />
            <p>Vérification de ton lien en cours…</p>
          </>
        )}

        {state === "success" && (
          <>
            <CircleCheck size={44} color="var(--c-success)" />
            <h2>Email confirmé !</h2>
            <p>Ton adresse email est bien vérifiée. Tu peux profiter de PrononciA+ sans restriction.</p>
            <button className="hero__cta" onClick={() => navigate(user ? "/profile" : "/login")}>
              {user ? "Retour à mon profil" : "Se connecter"}
            </button>
          </>
        )}

        {state === "error" && (
          <>
            <CircleAlert size={44} color="var(--c-danger)" />
            <h2>Lien invalide ou expiré</h2>
            <p>{error}</p>
            {user ? (
              <p className="screen-hint">
                Depuis ton <Link to="/profile">profil</Link>, tu peux demander l'envoi d'un nouveau lien.
              </p>
            ) : (
              <p className="screen-hint">
                Connecte-toi puis va dans ton profil pour redemander un email de confirmation.
              </p>
            )}
          </>
        )}

        {state !== "checking" && (
          <div className="verify-email__icon-hint">
            <MailCheck size={14} /> PrononciA+
          </div>
        )}
      </div>
    </div>
  );
}
