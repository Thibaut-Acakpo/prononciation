import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ChevronRight, Loader2, Crown } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

export default function ThemedWordLists({ onConfirm }) {
  const { token, previewHeader } = useAuth();
  const navigate = useNavigate();
  const [lists, setLists] = useState(null);
  const [locked, setLocked] = useState(true);
  const [activeList, setActiveList] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/word-lists", {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(previewHeader ? { "X-Preview-As": previewHeader } : {}),
      },
    })
      .then((r) => r.json())
      .then((data) => {
        setLists(data.lists || []);
        setLocked(Boolean(data.locked));
      })
      .catch(() => setError("Impossible de charger les listes thématiques."));
  }, [token, previewHeader]);

  if (error) return <p className="screen-hint">{error}</p>;
  if (!lists) return <p className="screen-hint"><Loader2 className="spin" size={20} /></p>;

  if (activeList) {
    return (
      <div className="themed-lists">
        <button className="themed-lists__back" onClick={() => setActiveList(null)}>
          ← Retour aux thèmes
        </button>
        <h3>{activeList.emoji} {activeList.title}</h3>
        <div className="themed-lists__words">
          {activeList.words.map((word) => (
            <button key={word.en} className="themed-lists__word" onClick={() => onConfirm(word.en, word.fr)}>
              <span className="themed-lists__word-en">{word.en}</span>
              <span className="themed-lists__word-fr">{word.fr}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="themed-lists">
      {locked && (
        <div className="quota-upsell">
          <Crown size={20} color="var(--c-warning)" />
          <div>
            <strong>Listes thématiques Premium</strong>
            <p>{lists.length} thèmes, {lists.reduce((sum, l) => sum + l.wordCount, 0)} mots avec traduction — débloqués avec Premium.</p>
          </div>
          <button onClick={() => navigate("/premium")}>Voir Premium</button>
        </div>
      )}
      <div className="themed-lists__grid">
        {lists.map((list) => (
          <button
            key={list.id}
            className={`themed-lists__card${locked ? " themed-lists__card--locked" : ""}`}
            onClick={() => (locked ? navigate("/premium") : setActiveList(list))}
          >
            <span className="themed-lists__emoji">{list.emoji}</span>
            <span className="themed-lists__title">{list.title}</span>
            <span className="themed-lists__count">{list.wordCount} mots</span>
            {locked ? <Lock size={15} /> : <ChevronRight size={15} />}
          </button>
        ))}
      </div>
    </div>
  );
}
