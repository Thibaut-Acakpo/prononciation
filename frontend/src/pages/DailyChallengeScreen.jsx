import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Trophy, Sparkles, Mic, Square, Send, RotateCcw, Volume2 } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import TopBar from "../layout/TopBar";
import { usePronunciationRecorder, getVerdictClass } from "../hooks/usePronunciationRecorder";
import { getWordInfo } from "../lib/words";
import { speakWord } from "../lib/tts";
import AudioPlayer from "../components/AudioPlayer";
import { useToast } from "../lib/ToastContext";
import { useOfflineNotice } from "../lib/useOfflineNotice";

export default function DailyChallengeScreen() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  useOfflineNotice("Le Défi du jour a besoin d'une connexion au serveur pour récupérer le mot du jour et le classement.");

  const [daily, setDaily] = useState(null); // { date, word, leaderboard, myStatus }
  const [loading, setLoading] = useState(true);

  const fetchDaily = useCallback(() => {
    if (!token) return;
    fetch("/api/daily/today", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setDaily)
      .catch(() => setDaily(null))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { fetchDaily(); }, [fetchDaily]);

  const rec = usePronunciationRecorder(daily?.word);
  const { showToast } = useToast();

  useEffect(() => {
    if (!rec.result) return;
    showToast("Analyse terminée !", { type: "success" });
    fetchDaily();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.result]);

  if (!user) {
    return (
      <div className="screen">
        <TopBar title="Défi du jour" showBack onBack={() => navigate("/")} />
        <div className="empty-state">
          <p>Connecte-toi pour participer au défi quotidien.</p>
          <button className="hero__cta" onClick={() => navigate("/login")}>
            <LogIn size={18} /> Se connecter
          </button>
        </div>
      </div>
    );
  }

  if (loading || !daily) {
    return (
      <div className="screen">
        <TopBar title="Défi du jour" showBack onBack={() => navigate("/")} />
        <p className="screen-hint">Chargement du défi du jour…</p>
      </div>
    );
  }

  const wordInfo = getWordInfo(daily.word);

  async function submitDaily() {
    await rec.analyzeAudio({ isDailyChallenge: true });
  }

  return (
    <div className="screen">
      <TopBar title="Défi du jour" showBack onBack={() => navigate("/")} />

      <div className="daily-banner">
        <Sparkles size={28} color="var(--c-warning)" />
        <p>Le même mot pour tout le monde aujourd'hui :</p>
        <h2 className="match-word">{daily.word}</h2>
        <span className="daily-banner__fr">{wordInfo.fr}</span>
        <button className="btn-listen daily-banner__listen" onClick={() => speakWord(daily.word)}>
          <Volume2 size={16} /> Écouter la prononciation native
        </button>
      </div>

      {daily.myStatus?.bestPer != null && (
        <div className="notice notice--info">
          Ton meilleur score aujourd'hui : <strong>{daily.myStatus.bestPer.toFixed(0)}% d'erreur</strong> ({daily.myStatus.attempts} essai{daily.myStatus.attempts > 1 ? "s" : ""})
        </div>
      )}

      <div className="card">
        <div className="recorder-zone">
          <div className="recorder-row">
            <button
              className={`record-btn${rec.isRecording ? " record-btn--active" : ""}`}
              onClick={rec.isRecording ? rec.stopRecording : rec.startRecording}
              disabled={rec.isLoading}
            >
              {rec.isRecording ? <Square size={22} fill="currentColor" /> : <Mic size={22} />}
            </button>
            <div className="recorder-info">
              {rec.audioUrl && !rec.isRecording ? (
                <AudioPlayer src={rec.audioUrl} />
              ) : (
                <span className="recorder-hint">Appuie pour enregistrer ta prononciation du jour.</span>
              )}
            </div>
          </div>
          {rec.audioBlob && !rec.isRecording && (
            <div className="recorder-actions">
              <button className="btn-discard" onClick={rec.discardRecording} disabled={rec.isLoading}>
                <RotateCcw size={16} /> Refaire
              </button>
              <button className="btn-analyze" onClick={submitDaily} disabled={rec.isLoading}>
                <Send size={16} /> {rec.isLoading ? "Analyse…" : "Envoyer"}
              </button>
            </div>
          )}
        </div>
        {rec.statusMessage && <div className="notice notice--warn">{rec.statusMessage}</div>}
      </div>

      {rec.result && (
        <div className="card">
          <p className={`verdict ${getVerdictClass(rec.result.verdictCourt)}`}>{rec.result.verdictCourt}</p>
          <p className="screen-hint">{rec.result.commentaire}</p>
        </div>
      )}

      <div className="card">
        <h3 className="card-subtitle"><Trophy size={16} /> Classement du jour</h3>
        {daily.leaderboard.length === 0 ? (
          <p className="screen-hint">Sois le premier à relever le défi aujourd'hui !</p>
        ) : (
          <ul className="match-podium">
            {daily.leaderboard.map((entry, i) => (
              <li key={entry.user_id} className="match-podium__item">
                <span className="match-podium__rank">{i + 1}.</span>
                <span className="match-podium__name">{entry.display_name || entry.email}</span>
                <span className="match-podium__score">{Number(entry.best_per).toFixed(0)}% d'erreur</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
