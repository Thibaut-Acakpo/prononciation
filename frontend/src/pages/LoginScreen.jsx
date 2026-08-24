import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import TopBar from "../layout/TopBar";

export default function LoginScreen() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/profile");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen auth-screen">
      <TopBar title="Connexion" showBack onBack={() => navigate("/")} />

      <div className="auth-screen__center">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h2 className="auth-card__title">Connexion</h2>

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="auth-panel__error">{error}</p>}

          <button type="submit" className="hero__cta" disabled={submitting}>
            <LogIn size={18} /> {submitting ? "Connexion…" : "Se connecter"}
          </button>

          <p className="auth-screen-switch">
            <Link to="/forgot-password">Mot de passe oublié ?</Link>
          </p>

          <p className="auth-screen-switch">
            Pas encore de compte ? <Link to="/register">Créer un compte</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
