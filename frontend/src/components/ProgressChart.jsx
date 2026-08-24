import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Label } from "recharts";

/**
 * Courbe de progression : taux d'erreur (PER) des tentatives les plus
 * récentes, dans l'ordre chronologique. Une pente descendante = progrès.
 *
 * Axe des abscisses (X) : date de chaque tentative (jour/mois).
 * Axe des ordonnées (Y) : taux d'erreur de prononciation (PER), de 0 à 100%
 *   — 0% = prononciation parfaite, 100% = aucune correspondance.
 */
export default function ProgressChart({ history }) {
  if (!history || history.length < 2) {
    return <p className="progress-chart__empty">Encore quelques tentatives pour voir apparaître ta courbe de progression.</p>;
  }

  const data = [...history]
    .reverse()
    .slice(-20)
    .map((h) => ({
      date: new Date(h.created_at + "Z").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      per: Number(h.per),
      word: h.expected_word,
    }));

  return (
    <div className="progress-chart">
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
          <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false}>
            <Label value="Date de la tentative" position="insideBottom" offset={-12} fill="#94a3b8" fontSize={12} />
          </XAxis>
          <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} domain={[0, 100]} unit="%" width={48}>
            <Label value="Taux d'erreur (PER)" angle={-90} position="insideLeft" fill="#94a3b8" fontSize={12} style={{ textAnchor: "middle" }} />
          </YAxis>
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.3)", borderRadius: 8 }}
            labelFormatter={(label) => `Le ${label}`}
            formatter={(value, _name, props) => [`${value}% d'erreur`, props.payload.word]}
          />
          <Line type="monotone" dataKey="per" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
      <p className="progress-chart__caption">
        Chaque point = une tentative. Plus la courbe descend, moins tu fais d'erreurs de prononciation.
      </p>
    </div>
  );
}
