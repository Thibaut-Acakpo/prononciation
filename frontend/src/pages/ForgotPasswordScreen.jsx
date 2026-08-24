import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Mail, KeyRound, ArrowLeft, Loader2, CircleCheck, Timer } from "lucide-react";
import TopBar from "../layout/TopBar";

// step: "email" (saisie adresse) → "code" (code reçu + nouveau mot de passe) → "done"
export default function ForgotPasswordScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const tickRef = useRef(null);

  // Décompte visuel du délai de validité du code — redémarre à chaque envoi
  // (initial ou renvoi), s'arrête à 0.
  useEffect(() => {
    if (step !== "code" || secondsLeft <= 0) return;
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [step, secondsLeft > 0]);

  function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  async function requestCode() {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, channel: "email" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur.");

      setInfo("Un code vient d'être envoyé à cette adresse — s'il n'arrive pas tout de suite, vérifie aussi les autres dossiers de ta boîte mail.");
      setSecondsLeft(data.expiresInSeconds || 300);
      setStep("code");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleEmailSubmit(e) {
    e.preventDefault();
    requestCode();
  }

  async function handleResetSubmit(e) {
    e.preventDefault();
    setError("");
    if (secondsLeft <= 0) {
      setError("Ce code a expiré — demande-en un nouveau ci-dessous.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur.");
      setStep("done");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen auth-screen">
      <TopBar title="Mot de passe oublié" showBack onBack={() => navigate("/login")} />

      <div className="auth-screen__center">
        {step === "email" && (
          <form className="auth-card" onSubmit={handleEmailSubmit}>
            <h2 className="auth-card__title">Récupérer mon compte</h2>
            <p className="screen-hint" style={{ padding: "0 0 12px" }}>
              Indique ton email — on t'enverra un code à 6 chiffres pour réinitialiser ton mot de passe.
            </p>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />

            {error && <p className="auth-panel__error">{error}</p>}

            <button type="submit" className="hero__cta" disabled={submitting}>
              {submitting ? <Loader2 className="spin" size={16} /> : <><Mail size={18} /> Recevoir le code par email</>}
            </button>
            <p className="auth-screen-switch">
              <Link to="/login"><ArrowLeft size={13} style={{ verticalAlign: "middle" }} /> Retour à la connexion</Link>
            </p>
          </form>
        )}

        {step === "code" && (
          <form className="auth-card" onSubmit={handleResetSubmit}>
            <h2 className="auth-card__title">Réinitialiser le mot de passe</h2>
            {info && <p className="notice notice--info">{info}</p>}

            <div className={`reset-countdown${secondsLeft <= 30 ? " reset-countdown--warn" : ""}`}>
              <Timer size={15} />
              {secondsLeft > 0 ? (
                <span>Code valable encore <strong>{formatTime(secondsLeft)}</strong></span>
              ) : (
                <span>Code expiré — demande-en un nouveau ci-dessous.</span>
              )}
            </div>

            <input
              type="text"
              inputMode="numeric"
              placeholder="Code à 6 chiffres"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              required
              autoFocus
            />
            <input
              type="password"
              placeholder="Nouveau mot de passe (8 caractères min.)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
            <input
              type="password"
              placeholder="Confirmer le nouveau mot de passe"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />

            {error && <p className="auth-panel__error">{error}</p>}

            <button type="submit" className="hero__cta" disabled={submitting || secondsLeft <= 0}>
              {submitting ? <Loader2 className="spin" size={16} /> : <><KeyRound size={18} /> Réinitialiser le mot de passe</>}
            </button>

            <div className="forgot-password__resend">
              <span>Rien reçu ?</span>
              <button type="button" onClick={requestCode} disabled={submitting}>
                <Mail size={13} /> Renvoyer le code
              </button>
            </div>
          </form>
        )}

        {step === "done" && (
          <div className="auth-card" style={{ textAlign: "center" }}>
            <CircleCheck size={40} color="var(--c-success)" />
            <h2 className="auth-card__title">Mot de passe réinitialisé !</h2>
            <p className="screen-hint">Tu peux maintenant te connecter avec ton nouveau mot de passe.</p>
            <button className="hero__cta" onClick={() => navigate("/login")}>Se connecter</button>
          </div>
        )}
      </div>
    </div>
  );
}
