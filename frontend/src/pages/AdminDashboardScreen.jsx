import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  Users, TrendingUp, ShieldCheck, Download, Crown, ChevronRight, Activity,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import TopBar from "../layout/TopBar";
import AdminLogoutButton from "../components/AdminLogoutButton";

export default function AdminDashboardScreen() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch("/api/admin/stats/timeseries?days=14", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ])
      .then(([statsData, seriesData]) => {
        if (statsData.error) { setError(statsData.error); return; }
        setStats(statsData.stats);
        setSeries((seriesData.series || []).map((s) => ({
          ...s,
          label: new Date(s.day + "T00:00:00Z").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
        })));
      })
      .catch(() => setError("Impossible de charger le tableau de bord."))
      .finally(() => setLoading(false));
  }, [token]);

  if (error) {
    return (
      <div className="screen">
        <TopBar title="Vue d'ensemble" showBack onBack={() => navigate("/")} />
        <div className="empty-state"><p>{error}</p></div>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar title="Vue d'ensemble" showBack onBack={() => navigate("/")} />

      {loading && <p className="screen-hint">Chargement du tableau de bord…</p>}

      {stats && (
        <>
          <div className="card">
            <h3 className="card-subtitle"><ShieldCheck size={16} /> Statistiques globales</h3>
            <div className="admin-stats-grid">
              <div className="stat-box">
                <span className="stat-box__value">{stats.totalUsers}</span>
                <span className="stat-box__label">Utilisateurs</span>
              </div>
              <div className="stat-box">
                <span className="stat-box__value">{stats.totalPremium}</span>
                <span className="stat-box__label">Comptes Premium</span>
              </div>
              <div className="stat-box">
                <span className="stat-box__value">{stats.newUsersThisWeek}</span>
                <span className="stat-box__label">Inscrits (7j)</span>
              </div>
              <div className="stat-box">
                <span className="stat-box__value">{stats.totalAttempts}</span>
                <span className="stat-box__label">Tentatives totales</span>
              </div>
              <div className="stat-box">
                <span className="stat-box__value">{stats.attemptsToday}</span>
                <span className="stat-box__label">Aujourd'hui</span>
              </div>
              <div className="stat-box">
                <span className="stat-box__value">{stats.totalMatches}</span>
                <span className="stat-box__label">Matchs joués</span>
              </div>
              <div className="stat-box">
                <span className="stat-box__value">{stats.avgPer != null ? `${(100 - stats.avgPer).toFixed(0)}%` : "—"}</span>
                <span className="stat-box__label">Réussite moyenne</span>
              </div>
              <div className="stat-box">
                <span className="stat-box__value">{stats.totalAdmins}</span>
                <span className="stat-box__label">Administrateurs</span>
              </div>
            </div>

            {stats.topWords?.length > 0 && (
              <div className="admin-top-words">
                <span className="admin-top-words__label"><TrendingUp size={14} /> Mots les plus pratiqués :</span>
                {stats.topWords.map((w) => (
                  <span key={w.expected_word} className="badge-pill">{w.expected_word} ({w.count})</span>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="card-subtitle"><Activity size={16} /> Activité sur 14 jours</h3>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="label" fontSize={11} stroke="var(--c-text-secondary)" />
                  <YAxis fontSize={11} stroke="var(--c-text-secondary)" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--c-surface)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="signups" name="Inscriptions" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="attempts" name="Analyses" stroke="#22d3ee" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="premiumPurchases" name="Achats Premium" stroke="#fbbf24" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h3 className="card-subtitle"><Crown size={16} color="var(--c-warning)" /> Revenus Premium</h3>
            <div className="admin-stats-grid">
              <div className="stat-box">
                <span className="stat-box__value">{stats.totalRevenue.toLocaleString("fr-FR")} F</span>
                <span className="stat-box__label">Revenu total</span>
              </div>
              <div className="stat-box">
                <span className="stat-box__value">{stats.totalPayments}</span>
                <span className="stat-box__label">Paiements confirmés</span>
              </div>
            </div>
            <button className="admin-quicklink" onClick={() => navigate("/admin/payments")}>
              Voir tous les paiements <ChevronRight size={15} />
            </button>
          </div>

          {stats.installs && (
            <div className="card">
              <h3 className="card-subtitle"><Download size={16} /> Installations de l'app</h3>
              <div className="admin-stats-grid">
                <div className="stat-box">
                  <span className="stat-box__value">{stats.installs.totalInstalls}</span>
                  <span className="stat-box__label">Total</span>
                </div>
                <div className="stat-box">
                  <span className="stat-box__value">{stats.installs.installsThisWeek}</span>
                  <span className="stat-box__label">7 derniers jours</span>
                </div>
                <div className="stat-box">
                  <span className="stat-box__value">{stats.installs.installsToday}</span>
                  <span className="stat-box__label">Aujourd'hui</span>
                </div>
              </div>
              {stats.installs.byPlatform?.length > 0 && (
                <div className="admin-top-words">
                  <span className="admin-top-words__label">Par plateforme :</span>
                  {stats.installs.byPlatform.map((p) => (
                    <span key={p.platform} className="badge-pill">{p.platform} ({p.count})</span>
                  ))}
                </div>
              )}
              <p className="word-image-notice">
                Compte les appareils ayant ajouté l'app à leur écran d'accueil (PWA) — pas les vues de page.
              </p>
            </div>
          )}

          <div className="card">
            <button className="admin-quicklink admin-quicklink--big" onClick={() => navigate("/admin/users")}>
              <Users size={18} /> Gérer les utilisateurs <ChevronRight size={15} />
            </button>
          </div>

          <div className="card">
            <AdminLogoutButton className="admin-logout-btn--full" />
          </div>
        </>
      )}
    </div>
  );
}
