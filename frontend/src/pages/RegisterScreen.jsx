import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import TopBar from "../layout/TopBar";

export default function RegisterScreen() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await register(email, password, displayName);
      navigate("/profile");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen auth-screen">
      <TopBar title="Créer un compte" showBack onBack={() => navigate("/")} />

      <div className="auth-screen__center">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h2 className="auth-card__title">Créer un compte</h2>

          <input
            type="text"
            placeholder="Prénom (optionnel)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoFocus
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Mot de passe (8 caractères minimum)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />

          {error && <p className="auth-panel__error">{error}</p>}

          <button type="submit" className="hero__cta" disabled={submitting}>
            <UserPlus size={18} /> {submitting ? "Création…" : "Créer mon compte"}
          </button>

          <p className="auth-screen-switch">
            Déjà un compte ? <Link to="/login">Se connecter</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
