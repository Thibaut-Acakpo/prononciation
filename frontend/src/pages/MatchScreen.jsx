import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Swords, Lock, Copy, Check, LogIn, Crown, Medal, Mic, Square, Send, RotateCcw,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getMatchSocket } from "../lib/matchSocket";
import TopBar from "../layout/TopBar";
import WordDropdown from "../components/WordDropdown";
import PhonemeDiff from "../components/PhonemeDiff";
import { YOLO_CLASSES } from "../lib/words";
import { useOfflineNotice } from "../lib/useOfflineNotice";

const MEDAL_COLORS = { 1: "#fbbf24", 2: "#cbd5e1", 3: "#d97706" };
const MEDAL_LABELS = { 1: "Or", 2: "Argent", 3: "Bronze" };

export default function MatchScreen() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  useOfflineNotice("Le mode Match a besoin d'une connexion au serveur pour jouer en temps réel avec d'autres utilisateurs.");

  const [eligibility, setEligibility] = useState(null); // null = chargement
  const [joinCode, setJoinCode] = useState("");
  const [roomState, setRoomState] = useState(null);
  const [error, setError] = useState("");
  const [proposedWord, setProposedWord] = useState(YOLO_CLASSES[0]);

  const socketRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    fetch("/api/match/eligibility", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setEligibility)
      .catch(() => setEligibility({ eligible: false, attemptsCount: 0, requiredAttempts: 10 }));
  }, [user, token]);

  useEffect(() => {
    if (!user || !eligibility?.eligible) return;

    const socket = getMatchSocket(token);
    socketRef.current = socket;

    function onState(state) { setRoomState(state); setError(""); }
    function onError(msg) { setError(msg); }

    socket.on("match:state", onState);
    socket.on("match:error", onError);

    return () => {
      socket.off("match:state", onState);
      socket.off("match:error", onError);
    };
  }, [user, eligibility, token]);

  const createRoom = useCallback(() => {
    socketRef.current?.emit("match:create", { displayName: user.display_name || user.email });
  }, [user]);

  const joinRoom = useCallback(() => {
    if (!joinCode.trim()) return;
    socketRef.current?.emit("match:join", { code: joinCode.trim().toUpperCase(), displayName: user.display_name || user.email });
  }, [joinCode, user]);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit("match:leave");
    setRoomState(null);
  }, []);

  if (!user) {
    return (
      <div className="screen">
        <TopBar title="Match" showBack onBack={() => navigate("/")} />
        <div className="empty-state">
          <p>Connecte-toi pour défier d'autres utilisateurs en temps réel.</p>
          <button className="hero__cta" onClick={() => navigate("/login")}>
            <LogIn size={18} /> Se connecter
          </button>
        </div>
      </div>
    );
  }

  if (!eligibility) {
    return (
      <div className="screen">
        <TopBar title="Match" showBack onBack={() => navigate("/")} />
        <p className="screen-hint">Vérification de ton accès…</p>
      </div>
    );
  }

  if (!eligibility.eligible) {
    const pct = Math.min(100, (eligibility.attemptsCount / eligibility.requiredAttempts) * 100);
    return (
      <div className="screen">
        <TopBar title="Match" showBack onBack={() => navigate("/")} />
        <div className="match-locked">
          <div className="match-locked__icon"><Lock size={32} /></div>
          <h2>Mode Match verrouillé</h2>
          <p>
            Entraîne-toi encore un peu avant de défier d'autres utilisateurs — ça permet à tout le
            monde d'arriver avec un minimum de pratique, pour des matchs plus équilibrés.
          </p>
          <div className="match-locked__progress-bar">
            <div className="match-locked__progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="match-locked__count">
            {eligibility.attemptsCount} / {eligibility.requiredAttempts} tentatives d'entraînement
          </p>
          <button className="hero__cta" onClick={() => navigate("/practice")}>
            Continuer à m'entraîner
          </button>
        </div>
      </div>
    );
  }

  if (roomState) {
    return (
      <MatchRoom
        state={roomState}
        userId={user.id}
        proposedWord={proposedWord}
        setProposedWord={setProposedWord}
        onProposeWord={(word) => socketRef.current.emit("match:proposeWord", { word })}
        onAcceptWord={() => socketRef.current.emit("match:acceptWord")}
        onSubmitTurn={(payload) => socketRef.current.emit("match:submitTurn", payload)}
        onLeave={leaveRoom}
        token={token}
      />
    );
  }

  return (
    <div className="screen">
      <TopBar title="Match" showBack onBack={() => navigate("/")} />

      <div className="hero">
        <div className="hero__icon" style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}>
          <Swords size={36} />
        </div>
        <h2>Défie d'autres utilisateurs</h2>
        <p>Créez ou rejoignez un salon, mettez-vous d'accord sur un mot, et prononcez-le à tour de rôle. Le meilleur score gagne.</p>
      </div>

      {error && <div className="notice notice--warn">{error}</div>}

      <div className="card">
        <button className="hero__cta" onClick={createRoom}>Créer un salon</button>
      </div>

      <div className="card">
        <div className="form-row">
          <label>Rejoindre avec un code</label>
          <div className="match-join-row">
            <input
              type="text"
              placeholder="Ex. K7QXR"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={5}
              className="match-join-input"
            />
            <button className="btn-analyze" onClick={joinRoom}>Rejoindre</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchRoom({ state, userId, proposedWord, setProposedWord, onProposeWord, onAcceptWord, onSubmitTurn, onLeave, token }) {
  const isHost = String(state.hostUserId) === String(userId);
  const me = state.participants.find((p) => String(p.userId) === String(userId));
  const [copied, setCopied] = useState(false);

  function copyCode() {
    navigator.clipboard?.writeText(state.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (state.phase === "lobby") {
    return (
      <div className="screen">
        <TopBar title="Salon de match" showBack onBack={onLeave} />

        <div className="card match-room-code">
          <span>Code du salon</span>
          <div className="match-room-code__value">
            {state.code}
            <button className="icon-btn" onClick={copyCode} aria-label="Copier le code">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <p className="screen-hint">Partage ce code pour que d'autres te rejoignent.</p>
        </div>

        <div className="card">
          <h3 className="card-subtitle">Participants ({state.participants.length})</h3>
          <ul className="match-participant-list">
            {state.participants.map((p) => (
              <li key={p.userId} className={p.connected ? "" : "disconnected"}>
                <span>{p.displayName}{String(p.userId) === String(state.hostUserId) ? " (hôte)" : ""}</span>
                {state.word && (p.accepted ? <Check size={16} color="var(--c-success)" /> : <span className="waiting-dot" />)}
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          {isHost ? (
            <>
              <div className="form-row">
                <label>Mot proposé</label>
                <WordDropdown value={proposedWord} onChange={setProposedWord} />
              </div>
              <button className="hero__cta" onClick={() => onProposeWord(proposedWord)}>
                Proposer ce mot
              </button>
            </>
          ) : (
            <p className="screen-hint">En attente que l'hôte choisisse un mot…</p>
          )}

          {state.word && (
            <div className="match-word-proposal">
              <p>Mot proposé : <strong>{state.word}</strong></p>
              {!me?.accepted && (
                <button className="hero__cta" onClick={onAcceptWord}>J'accepte ce mot</button>
              )}
              {me?.accepted && <p className="screen-hint">En attente des autres joueurs…</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (state.phase === "playing") {
    return (
      <MatchPlay state={state} userId={userId} onSubmitTurn={onSubmitTurn} onLeave={onLeave} token={token} />
    );
  }

  // phase === "finished"
  return <MatchResults state={state} userId={userId} onLeave={onLeave} />;
}

function MatchPlay({ state, userId, onSubmitTurn, onLeave, token }) {
  const isMyTurn = String(state.currentTurnUserId) === String(userId);
  const currentPlayer = state.participants.find((p) => String(p.userId) === String(state.currentTurnUserId));

  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        setAudioBlob(new Blob(chunksRef.current, { type: "audio/wav" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setAudioBlob(null);
    } catch {
      setStatusMessage("Le micro n'est pas accessible.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  async function submit() {
    if (!audioBlob) return;
    setIsSubmitting(true);
    setStatusMessage("");
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "match.wav");
      formData.append("expectedWord", state.word);
      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Analyse impossible.");

      onSubmitTurn({
        per: data.per,
        recognizedText: data.mot_reconnu,
        verdict: data.verdict_court,
        alignment: data.alignement_phonemes || [],
      });
      setAudioBlob(null);
    } catch (err) {
      setStatusMessage(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="screen">
      <TopBar title="Match en cours" showBack onBack={onLeave} />

      <div className="card match-turn-banner">
        <p>Mot à prononcer :</p>
        <h2 className="match-word">{state.word}</h2>
      </div>

      <div className="card">
        <h3 className="card-subtitle">Ordre de passage</h3>
        <ul className="match-participant-list">
          {state.participants.map((p) => (
            <li key={p.userId} className={String(p.userId) === String(state.currentTurnUserId) ? "current-turn" : ""}>
              <span>{p.displayName}</span>
              {p.submitted ? <Check size={16} color="var(--c-success)" /> : String(p.userId) === String(state.currentTurnUserId) ? <span className="waiting-dot" /> : null}
            </li>
          ))}
        </ul>
      </div>

      {isMyTurn ? (
        <div className="card">
          <h3 className="card-subtitle">À toi de jouer !</h3>
          <div className="recorder-zone">
            <div className="recorder-row">
              <button
                className={`record-btn${isRecording ? " record-btn--active" : ""}`}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isSubmitting}
              >
                {isRecording ? <Square size={22} fill="currentColor" /> : <Mic size={22} />}
              </button>
              <div className="recorder-info">
                {audioBlob && !isRecording ? (
                  <span className="recorder-hint">Enregistrement prêt à envoyer.</span>
                ) : (
                  <span className="recorder-hint">Appuie pour enregistrer ta prononciation.</span>
                )}
              </div>
            </div>
            {audioBlob && !isRecording && (
              <div className="recorder-actions">
                <button className="btn-discard" onClick={() => setAudioBlob(null)} disabled={isSubmitting}>
                  <RotateCcw size={16} /> Refaire
                </button>
                <button className="btn-analyze" onClick={submit} disabled={isSubmitting}>
                  <Send size={16} /> {isSubmitting ? "Envoi…" : "Envoyer mon tour"}
                </button>
              </div>
            )}
          </div>
          {statusMessage && <div className="notice notice--warn">{statusMessage}</div>}
        </div>
      ) : (
        <div className="card">
          <p className="screen-hint">En attente de {currentPlayer?.displayName || "…"}…</p>
        </div>
      )}
    </div>
  );
}

function MatchResults({ state, userId, onLeave }) {
  const winner = state.results?.[0];
  const me = state.results?.find((r) => String(r.userId) === String(userId));
  const iWon = String(winner?.userId) === String(userId);

  return (
    <div className="screen">
      <TopBar title="Résultats du match" showBack onBack={onLeave} />

      <div className="match-winner-banner">
        <Crown size={40} color="var(--c-warning)" />
        <h2>{iWon ? "Tu as gagné ce match !" : `${winner?.displayName || "Un joueur"} remporte le match !`}</h2>
        <p>Mot du défi : <strong>{state.word}</strong></p>
      </div>

      <div className="card">
        <h3 className="card-subtitle">Classement</h3>
        <ul className="match-podium">
          {state.results?.map((r, i) => (
            <li key={r.userId} className="match-podium__item">
              <span className="match-podium__rank">
                {r.placement ? (
                  <span className="match-podium__medal">
                    <Medal size={20} color={MEDAL_COLORS[r.placement]} />
                    <span className="match-podium__medal-label">{MEDAL_LABELS[r.placement]}</span>
                  </span>
                ) : (
                  `${i + 1}.`
                )}
              </span>
              <span className="match-podium__name">{r.displayName}</span>
              <span className="match-podium__score">
                {r.per != null ? `${(100 - r.per).toFixed(0)}% de réussite` : "Pas soumis"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {me && me.per != null && (
        <div className="card">
          <h3 className="card-subtitle">Ta prononciation à améliorer</h3>
          <p className="screen-hint">
            Mot reconnu : <strong>{me.recognizedText || "—"}</strong> — {me.verdict}
          </p>
          <PhonemeDiff alignment={me.alignment} />
        </div>
      )}

      <button className="hero__cta" onClick={onLeave}>Retour au menu Match</button>
    </div>
  );
}
