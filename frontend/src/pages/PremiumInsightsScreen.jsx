import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Crown, Loader2, TrendingUp, Ear, VolumeX } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import TopBar from "../layout/TopBar";

export default function PremiumInsightsScreen() {
  const { token, isPremiumEffective, previewHeader } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPremiumEffective) return;
    fetch("/api/insights/advanced", {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(previewHeader ? { "X-Preview-As": previewHeader } : {}),
      },
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Erreur serveur.");
        return body;
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token, isPremiumEffective, previewHeader]);

  const chartData = (data?.weeklyProgress || []).map((w) => ({
    week: new Date(w.weekStart + "T00:00:00Z").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    reussite: w.avgPer != null ? Math.round(100 - w.avgPer) : null,
    tentatives: w.attempts,
  }));

  return (
    <div className="screen">
      <TopBar title="Rapport avancé" showBack onBack={() => navigate("/profile")} />

      {!isPremiumEffective ? (
        <div className="card premium-locked">
          <Crown size={36} color="var(--c-warning)" />
          <p>Le rapport de progression avancé (tendance hebdomadaire + top 5 des sons à travailler) est réservé aux comptes Premium.</p>
          <button className="hero__cta" onClick={() => navigate("/premium")}>Voir Premium</button>
        </div>
      ) : error ? (
        <p className="screen-hint">{error}</p>
      ) : !data ? (
        <p className="screen-hint"><Loader2 className="spin" size={24} /></p>
      ) : (
        <>
          <div className="card">
            <h3 className="card-subtitle"><TrendingUp size={16} /> Tendance sur 8 semaines</h3>
            {chartData.length === 0 ? (
              <p className="screen-hint">Pas encore assez de données — pratique quelques mots pour voir ta courbe.</p>
            ) : (
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="week" fontSize={11} stroke="var(--c-text-secondary)" />
                    <YAxis fontSize={11} stroke="var(--c-text-secondary)" domain={[0, 100]} unit="%" />
                    <Tooltip
                      formatter={(value, name) => [name === "reussite" ? `${value}%` : value, name === "reussite" ? "Réussite moyenne" : "Tentatives"]}
                      contentStyle={{ background: "var(--c-surface)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 10 }}
                    />
                    <Line type="monotone" dataKey="reussite" stroke="#fbbf24" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="card-subtitle"><Ear size={16} /> Sons souvent substitués</h3>
            {data.weakPoints?.substitutions?.length > 0 ? (
              <ul className="weak-point-list">
                {data.weakPoints.substitutions.map((s, i) => (
                  <li key={i}><strong>{s.ref}</strong> → prononcé <strong>{s.ext}</strong> <span>({s.count}×)</span></li>
                ))}
              </ul>
            ) : <p className="screen-hint">Rien de récurrent à signaler — bravo !</p>}
          </div>

          <div className="card">
            <h3 className="card-subtitle"><VolumeX size={16} /> Sons souvent oubliés</h3>
            {data.weakPoints?.deletions?.length > 0 ? (
              <ul className="weak-point-list">
                {data.weakPoints.deletions.map((d, i) => (
                  <li key={i}><strong>{d.ref}</strong> <span>({d.count}×)</span></li>
                ))}
              </ul>
            ) : <p className="screen-hint">Rien de récurrent à signaler — bravo !</p>}
          </div>
        </>
      )}
    </div>
  );
}
