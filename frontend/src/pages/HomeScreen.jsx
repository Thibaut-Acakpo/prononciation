import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Target, Camera, TrendingUp, LogIn, Sparkles, ShieldCheck, Users, Activity, ChevronRight } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import TopBar from "../layout/TopBar";

export default function HomeScreen() {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [stats, setStats] = useState(null);
  const [adminStats, setAdminStats] = useState(null);

  useEffect(() => {
    if (!user) return;
    fetch("/api/history?limit=1", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setStats({ hasHistory: (d.history || []).length > 0 }))
      .catch(() => {});
  }, [user, token]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setAdminStats(d.stats))
      .catch(() => {});
  }, [user, token]);

  return (
    <div className="screen">
      <TopBar title="PrononciA+" />

      {user?.role === "admin" && (
        <section className="admin-home-card" onClick={() => navigate("/admin")}>
          <div className="admin-home-card__header">
            <ShieldCheck size={20} />
            <strong>Tableau de bord administrateur</strong>
            <ChevronRight size={18} />
          </div>
          {adminStats && (
            <div className="admin-home-card__stats">
              <span><Users size={14} /> {adminStats.totalUsers} utilisateurs</span>
              <span><Activity size={14} /> {adminStats.attemptsToday} tentatives aujourd'hui</span>
            </div>
          )}
        </section>
      )}

      <section className="hero">
        <img src="/branding/logo.png" alt="PrononciA+" className="hero__logo" />
        <h2>Améliore ta prononciation anglaise</h2>
        <p>Pointe un objet, prononce son nom, reçois un retour immédiat et suis tes progrès.</p>

        <button className="hero__cta" onClick={() => navigate("/practice")}>
          Commencer l'entraînement
        </button>
      </section>

      <section className="home-cards">
        <button className="home-card" onClick={() => navigate(user ? "/daily" : "/login")}>
          <Sparkles size={26} />
          <div>
            <strong>Défi du jour</strong>
            <p>Le même mot pour tous, classement en direct</p>
          </div>
        </button>

        <button className="home-card" onClick={() => navigate("/practice?mode=camera")}>
          <Camera size={26} />
          <div>
            <strong>Pointer avec la caméra</strong>
            <p>Désigne un objet réel du doigt</p>
          </div>
        </button>

        <button className="home-card" onClick={() => navigate("/practice?mode=gallery")}>
          <Target size={26} />
          <div>
            <strong>Galerie de mots</strong>
            <p>Choisis un mot dans la liste</p>
          </div>
        </button>

        <button className="home-card" onClick={() => navigate(user ? "/history" : "/login")}>
          <TrendingUp size={26} />
          <div>
            <strong>Ma progression</strong>
            <p>{user ? "Voir mon historique et mes badges" : "Connecte-toi pour suivre tes progrès"}</p>
          </div>
        </button>
      </section>

      {!user && (
        <button className="home-login-hint" onClick={() => navigate("/login")}>
          <LogIn size={18} />
          Se connecter pour sauvegarder ta progression
        </button>
      )}
    </div>
  );
}
