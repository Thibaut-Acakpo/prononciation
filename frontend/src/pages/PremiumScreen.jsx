import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Crown, Loader2, CircleAlert, ShieldCheck, Check, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import TopBar from "../layout/TopBar";

const COMPARISON = [
  { label: "Analyses de prononciation", free: "15 / jour", premium: "Illimitées" },
  { label: "Priorité de traitement", free: false, premium: true },
  { label: "Diff phonémique coloré", free: true, premium: true },
  { label: "Conseils d'articulation détaillés", free: false, premium: true },
  { label: "Match, Défi du jour, historique", free: true, premium: true },
  { label: "Listes de mots thématiques", free: false, premium: true },
  { label: "Rapport de progression avancé", free: false, premium: true },
  { label: "Styles d'avatar exclusifs", free: false, premium: true },
  { label: "Badge Premium ⭐", free: false, premium: true },
];

export default function PremiumScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, token, isPremiumEffective, startPremiumCheckout, verifyPremiumPayment } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingReturn, setCheckingReturn] = useState(false);
  const [price, setPrice] = useState(2000);
  const checkedOnce = useRef(false);

  useEffect(() => {
    fetch("/api/premium/status", { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then((r) => r.json())
      .then((d) => { if (d.price) setPrice(d.price); })
      .catch(() => {});
  }, [token]);

  // Retour depuis la page de paiement FedaPay (callback_url) : on revérifie
  // le statut de la transaction auprès du serveur, qui revérifie lui-même
  // auprès de FedaPay si le webhook n'est pas encore passé.
  useEffect(() => {
    const returning = searchParams.get("paiement") === "retour";
    const txId = searchParams.get("id") || searchParams.get("transaction_id");
    if (!returning || !txId || checkedOnce.current) return;
    checkedOnce.current = true;

    setCheckingReturn(true);
    verifyPremiumPayment(txId)
      .then((data) => {
        if (data.status !== "approved") {
          setError("Paiement non confirmé pour l'instant. S'il vient d'être validé sur ton téléphone, patiente quelques secondes puis reviens sur cette page.");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setCheckingReturn(false));
  }, [searchParams, verifyPremiumPayment]);

  async function handleCheckout() {
    setError("");
    setLoading(true);
    try {
      const { paymentUrl } = await startPremiumCheckout();
      window.location.href = paymentUrl; // redirection vers la page FedaPay (choix opérateur Mobile Money)
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="screen">
        <TopBar title="Premium" showBack onBack={() => navigate("/")} />
        <div className="card premium-locked">
          <Crown size={36} color="var(--c-warning)" />
          <p>Connecte-toi pour débloquer PrononciA+ Premium.</p>
          <button className="hero__cta" onClick={() => navigate("/login")}>Se connecter</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar title="Premium" showBack onBack={() => navigate("/profile")} />

      {checkingReturn && (
        <div className="card premium-locked">
          <Loader2 className="spin" size={32} color="var(--c-link)" />
          <p>Vérification de ton paiement…</p>
        </div>
      )}

      {isPremiumEffective && (
        <div className="card premium-active">
          <Crown size={40} color="var(--c-warning)" />
          <h2>{user.role === "admin" && !user.is_premium ? "Accès complet (admin)" : "Tu es Premium !"}</h2>
          <p>
            {user.role === "admin" && !user.is_premium
              ? "En tant qu'administrateur, tu as accès à toutes les fonctionnalités Premium sans paiement."
              : "Merci pour ton soutien 💙 Toutes les fonctionnalités Premium sont débloquées sur ton compte."}
          </p>
        </div>
      )}

      {!isPremiumEffective && (
        <div className="card premium-hero">
          <Crown size={40} color="var(--c-warning)" />
          <h2>PrononciA+ Premium</h2>
          <p className="premium-hero__price">{price} FCFA <span>paiement unique — accès à vie</span></p>

          {error && (
            <p className="auth-panel__error"><CircleAlert size={15} /> {error}</p>
          )}

          <button className="hero__cta premium-cta" onClick={handleCheckout} disabled={loading}>
            {loading ? <Loader2 className="spin" size={16} /> : <><Crown size={16} /> Payer en Mobile Money</>}
          </button>

          <p className="premium-hero__hint">
            <ShieldCheck size={13} /> Paiement sécurisé via FedaPay — MTN, Moov ou Celtiis.
          </p>
        </div>
      )}

      <div className="card">
        <h3 className="card-subtitle">Gratuit vs Premium — en détail</h3>
        <div className="plan-compare">
          <div className="plan-compare__header">
            <span></span>
            <span>Gratuit</span>
            <span className="plan-compare__premium-col">Premium</span>
          </div>
          {COMPARISON.map((row) => (
            <div className="plan-compare__row" key={row.label}>
              <span className="plan-compare__label">{row.label}</span>
              <span className="plan-compare__cell">
                {typeof row.free === "boolean" ? (row.free ? <Check size={16} color="var(--c-success)" /> : <X size={16} color="#64748b" />) : row.free}
              </span>
              <span className="plan-compare__cell plan-compare__premium-col">
                {typeof row.premium === "boolean" ? (row.premium ? <Check size={16} color="var(--c-warning)" /> : <X size={16} color="#64748b" />) : row.premium}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
