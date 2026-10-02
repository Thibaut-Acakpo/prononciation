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

    // ✅ Vérifications simples avant même d'appeler le serveur
    if (!email.trim()) {
      setError("Veuillez entrer votre email.");
      return;
    }
    if (!password) {
      setError("Veuillez entrer votre mot de passe.");
      return;
    }

    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/profile");
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
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

/**
 * ✅ Transforme n'importe quelle erreur en message clair et utile.
 */
function getFriendlyErrorMessage(err) {
  const raw = (err?.message || "").toLowerCase();

  // ✅ Erreurs métier renvoyées par le backend (les plus importantes)
  if (raw.includes("incorrect") || raw.includes("invalid")) {
    return "Email ou mot de passe incorrect. Vérifie tes informations.";
  }
  if (raw.includes("n'existe pas") || raw.includes("not found") || raw.includes("no user")) {
    return "Aucun compte n'existe avec cet email. Veuillez en créer un.";
  }
  if (raw.includes("déjà") || raw.includes("exists")) {
    return "Ce compte existe déjà. Connecte-toi ou utilise un autre email.";
  }
  if (raw.includes("email") && raw.includes("confirm")) {
    return "Ton email n'est pas encore confirmé. Vérifie ta boîte mail.";
  }
  if (raw.includes("compte désactivé") || raw.includes("disabled")) {
    return "Ton compte est désactivé. Contacte le support.";
  }

  // Erreurs réseau
  if (raw.includes("failed to fetch") || raw.includes("networkerror")) {
    return "Impossible de contacter le serveur. Vérifie ta connexion internet.";
  }

  // Réponse invalide du serveur
  if (raw.includes("unexpected end of json") || raw.includes("json")) {
    return "Problème de communication avec le serveur. Réessaie dans un instant.";
  }

  // Erreur serveur
  if (raw.includes("500") || raw.includes("503") || raw.includes("internal")) {
    return "Le serveur rencontre un problème. Réessaie dans un instant.";
  }

  // Erreur inconnue
  return "Une erreur est survenue. Réessaie dans quelques instants.";
}