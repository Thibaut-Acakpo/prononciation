import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Search, Download, FileText, Trophy, TrendingDown, ChevronDown, Loader2, Crown } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import TopBar from "../layout/TopBar";
import ProgressChart from "../components/ProgressChart";
import { computeBadges } from "../lib/badges";

const PAGE_SIZE = 5;

function computeWordStats(history) {
  const byWord = {};
  for (const h of history) {
    if (!byWord[h.expected_word]) byWord[h.expected_word] = { count: 0, totalPer: 0 };
    byWord[h.expected_word].count += 1;
    byWord[h.expected_word].totalPer += Number(h.per);
  }
  const entries = Object.entries(byWord).map(([word, s]) => ({
    word, count: s.count, avgPer: s.totalPer / s.count,
  }));
  const mostPracticed = [...entries].sort((a, b) => b.count - a.count)[0];
  const bestMastered = [...entries].filter((e) => e.count >= 2).sort((a, b) => a.avgPer - b.avgPer)[0];
  return { mostPracticed, bestMastered };
}

// Sécurité (audit) : deuxième couche de défense contre l'injection de
// formule CSV, en plus de la validation déjà faite côté serveur sur
// "expected_word". Si une cellule commence par =, +, -, @ (ou une tabulation/
// retour chariot), Excel/Google Sheets peuvent l'interpréter comme une
// formule à l'ouverture du fichier plutôt que comme du texte — on préfixe
// d'une apostrophe pour neutraliser ça, sans changer l'affichage normal.
function sanitizeCsvCell(value) {
  const str = (value ?? "").toString();
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}

function downloadCsv(history) {
  const header = "Mot,Reconnu,Score de prononciation (%),Verdict,Date\n";
  const rows = history.map((h) =>
    [h.expected_word, h.recognized_text, (100 - Number(h.per)).toFixed(0), h.verdict, h.created_at]
      .map((v) => `"${sanitizeCsvCell(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([header + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `historique-prononciation-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadPdf(history, userLabel) {
  // Chargé à la demande : jsPDF est une grosse dépendance (~200 Ko), inutile
  // de l'inclure dans le bundle initial pour une fonctionnalité utilisée
  // occasionnellement.
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text("Historique de prononciation", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${userLabel} — généré le ${new Date().toLocaleDateString("fr-FR")}`, 14, 25);

  autoTable(doc, {
    startY: 32,
    head: [["Mot", "Reconnu", "PER", "Verdict", "Date"]],
    body: history.map((h) => [
      h.expected_word,
      h.recognized_text || "—",
      `${Number(h.per).toFixed(0)}%`,
      h.verdict || "—",
      new Date(h.created_at + "Z").toLocaleString("fr-FR"),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  doc.save(`historique-prononciation-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default function HistoryScreen() {
  const navigate = useNavigate();
  const { user, token, isPremiumEffective, previewHeader } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${token}`,
    ...(previewHeader ? { "X-Preview-As": previewHeader } : {}),
  }), [token, previewHeader]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    fetch(`/api/history?limit=${PAGE_SIZE}&offset=0`, { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => {
        setHistory(data.history || []);
        // Pour un compte gratuit, le serveur renvoie toujours exactement les
        // 10 dernières (voir history.routes.js) — pas de "voir plus" possible.
        setHasMore(Boolean(data.isPremium) && (data.history || []).length === PAGE_SIZE);
      })
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [user, authHeaders]);

  function loadMore() {
    setLoadingMore(true);
    fetch(`/api/history?limit=${PAGE_SIZE}&offset=${history.length}`, { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => {
        const more = data.history || [];
        setHistory((h) => [...h, ...more]);
        setHasMore(more.length === PAGE_SIZE);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }

  const filteredHistory = useMemo(
    () => history.filter((h) => h.expected_word.toLowerCase().includes(search.toLowerCase())),
    [history, search]
  );

  if (!user) {
    return (
      <div className="screen">
        <TopBar title="Progrès" showBack onBack={() => navigate("/")} />
        <div className="empty-state">
          <p>Connecte-toi pour suivre ta progression et débloquer des badges.</p>
          <button className="hero__cta" onClick={() => navigate("/login")}>
            <LogIn size={18} /> Se connecter
          </button>
        </div>
      </div>
    );
  }

  const badges = computeBadges(history);
  const { mostPracticed, bestMastered } = computeWordStats(history);

  return (
    <div className="screen">
      <TopBar title="Ma progression" showBack onBack={() => navigate("/")} />

      {loading && <p className="screen-hint">Chargement…</p>}

      {!loading && history.length === 0 && (
        <div className="empty-state">
          <p>Aucune tentative enregistrée pour l'instant.</p>
          <button className="hero__cta" onClick={() => navigate("/practice")}>Commencer à t'entraîner</button>
        </div>
      )}

      {!loading && history.length > 0 && (
        <>
          <div className="card">
            <ProgressChart history={history} />
          </div>

          {(mostPracticed || bestMastered) && (
            <div className="highlight-row">
              {mostPracticed && (
                <div className="highlight-box">
                  <TrendingDown size={18} />
                  <div>
                    <strong>{mostPracticed.word}</strong>
                    <p>Mot le plus pratiqué ({mostPracticed.count}×)</p>
                  </div>
                </div>
              )}
              {bestMastered && (
                <div className="highlight-box highlight-box--gold">
                  <Trophy size={18} />
                  <div>
                    <strong>{bestMastered.word}</strong>
                    <p>Mieux maîtrisé ({bestMastered.avgPer.toFixed(0)}% d'erreur en moyenne)</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {badges.length > 0 && (
            <div className="card">
              <h3 className="card-subtitle">Badges débloqués</h3>
              <div className="badges-row">
                {badges.map((b) => <span key={b.id} className="badge-pill">{b.label}</span>)}
              </div>
            </div>
          )}

          <div className="card">
            <div className="history-header-row">
              <h3 className="card-subtitle">Historique détaillé</h3>
              <div className="history-export-actions">
                <button className="icon-btn" onClick={() => downloadCsv(history)} title="Exporter en CSV">
                  <Download size={18} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => downloadPdf(history, user.display_name || user.email)}
                  title="Exporter en PDF"
                >
                  <FileText size={18} />
                </button>
              </div>
            </div>

            <div className="gallery-search-input history-search">
              <Search size={15} />
              <input
                type="text"
                placeholder="Filtrer par mot…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <table className="history-table">
              <thead>
                <tr>
                  <th>Mot</th>
                  <th>Reconnu</th>
                  <th>PER</th>
                  <th>Verdict</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((h) => (
                  <tr key={h.id}>
                    <td>{h.expected_word}</td>
                    <td>{h.recognized_text || "—"}</td>
                    <td>{Number(h.per).toFixed(0)}%</td>
                    <td>{h.verdict || "—"}</td>
                    <td>{new Date(h.created_at + "Z").toLocaleString("fr-FR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredHistory.length === 0 && (
              <p className="screen-hint">Aucun résultat pour "{search}".</p>
            )}

            {!search && hasMore && (
              <button className="history-load-more" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="spin" size={15} /> : <ChevronDown size={15} />} Voir plus
              </button>
            )}

            {!search && !isPremiumEffective && history.length >= PAGE_SIZE && (
              <div className="quota-upsell">
                <Crown size={20} color="var(--c-warning)" />
                <div>
                  <strong>Seules les 10 dernières analyses sont affichées</strong>
                  <p>Passe Premium pour consulter tout ton historique.</p>
                </div>
                <button onClick={() => navigate("/premium")}>Voir Premium</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}