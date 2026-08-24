import { useState, useEffect, Suspense, lazy, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Mic, Square, RotateCcw, Send, Volume2, Image as ImageIcon, Pointer, Loader2, Keyboard, Crown, Lock, Check, ArrowLeftRight } from "lucide-react";
import ObjectGallery from "../components/ObjectGallery";
import SelectedPreview from "../components/SelectedPreview";
import WordDropdown from "../components/WordDropdown";
import AudioPlayer from "../components/AudioPlayer";
import PhonemeDiff from "../components/PhonemeDiff";
import FreeWordInput from "../components/FreeWordInput";
import ThemedWordLists from "../components/ThemedWordLists";
import TopBar from "../layout/TopBar";
import { YOLO_CLASSES } from "../lib/words";
import { usePronunciationRecorder, formatTime, getVerdictClass } from "../hooks/usePronunciationRecorder";
import { useModelStatus } from "../hooks/useModelStatus";
import { useToast } from "../lib/ToastContext";
import { useAuth } from "../auth/AuthContext";

const CameraPointer = lazy(() => import("../components/CameraPointer"));

export default function PracticeScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "camera" ? "camera" : "gallery";

  // step : "select" (choisir un objet) → "confirm" (valider le mot + écouter
  // la prononciation native) → "record" (enregistrer + résultat)
  const [step, setStep] = useState("select");
  const [selectionMode, setSelectionMode] = useState(initialMode);
  const [selectedWord, setSelectedWord] = useState(YOLO_CLASSES[0]);
  const [selectedWordFr, setSelectedWordFr] = useState(null);

  const rec = usePronunciationRecorder(selectedWord);
  const { ready: modelReady, checking: modelChecking } = useModelStatus();
  const { showToast } = useToast();
  const { token } = useAuth();

  // L'écran d'enregistrement a besoin que le serveur (Node + Whisper) soit
  // joignable pour analyser la prononciation — contrairement à la galerie/
  // sélection, qui reste 100% utilisable hors-ligne. On prévient à chaque
  // fois que l'utilisateur y arrive hors-ligne, via une vraie notification
  // temporaire (pas un bandeau permanent) — voir OfflineNotifier.jsx pour
  // la notification générale au lancement de l'app.
  useEffect(() => {
    if (step === "record" && !navigator.onLine) {
      showToast(
        "Pas de connexion détectée — l'analyse de prononciation a besoin que le serveur soit joignable (galerie et écoute restent utilisables).",
        { type: "offline", duration: 6500 }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Notification "analyse terminée" (demandé) : plus discret et cohérent
  // avec le reste de l'interface qu'une alert() native du navigateur, mais
  // remplit le même rôle — prévenir clairement l'utilisateur sans bloquer.
  useEffect(() => {
    if (!rec.result) return;
    showToast("Analyse terminée !", { type: "success" });

    // Palier "10 tentatives → mode Match débloqué" : on ne vérifie
    // l'éligibilité qu'après une analyse réussie, et on ne notifie QUE le
    // tour exact où le seuil est atteint (pas à chaque analyse suivante).
    if (!token) return;
    fetch("/api/match/eligibility", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.eligible && d.attemptsCount === d.requiredAttempts) {
          showToast(
            "Bravo, tu as fait 10 tentatives ! Le mode Match est maintenant débloqué — défie d'autres utilisateurs en temps réel.",
            { type: "celebration", duration: 7000 }
          );
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.result]);

  const perPct = Math.min(Math.max(rec.result?.per ?? 0, 0), 100);
  const perBarColor = useMemo(
    () => (perPct <= 20 ? "#a3e635" : perPct <= 50 ? "#fbbf24" : "#f87171"),
    [perPct]
  );

  function chooseWord(word, fr = null) {
    setSelectedWord(word);
    // Traduction déjà connue quand le mot vient d'un thème Premium (voir
    // ThemedWordLists.jsx) — on l'utilise directement plutôt que de laisser
    // SelectedPreview retomber sur une traduction par défaut incorrecte
    // (elle ne connaît que les 80 objets de la galerie caméra).
    setSelectedWordFr(fr);
    rec.resetAll();
    // Étape de confirmation explicite : quel que soit le mode de sélection
    // (galerie, caméra, mot tapé, thème), l'utilisateur doit valider le mot
    // choisi — et peut d'abord écouter sa prononciation native — avant que
    // l'enregistrement ne commence.
    setStep("confirm");
  }

  function acceptWord() {
    setStep("record");
  }

  function backFromRecord() {
    rec.resetAll();
    setStep("select");
  }

  // ── Étape 1 : sélection de l'objet ─────────────────────────────────────────
  if (step === "select") {
    return (
      <div className="screen">
        <TopBar title="Choisir un objet" showBack onBack={() => navigate("/")} />

        <div className="selection-mode-toggle">
          <button
            className={selectionMode === "gallery" ? "active" : ""}
            onClick={() => setSelectionMode("gallery")}
          >
            <ImageIcon size={18} /> Galerie de photos
          </button>
          <button
            className={selectionMode === "camera" ? "active" : ""}
            onClick={() => setSelectionMode("camera")}
          >
            <Pointer size={18} /> Pointer avec la caméra
          </button>
          <button
            className={selectionMode === "free" ? "active" : ""}
            onClick={() => setSelectionMode("free")}
          >
            <Keyboard size={18} /> Taper un mot
          </button>
          <button
            className={selectionMode === "themes" ? "active" : ""}
            onClick={() => setSelectionMode("themes")}
          >
            <Crown size={18} color="var(--c-warning)" /> Thèmes
          </button>
        </div>

        {selectionMode === "camera" ? (
          <Suspense fallback={<p className="camera-pointer__status">Chargement du mode caméra…</p>}>
            <CameraPointer
              knownWords={YOLO_CLASSES}
              onWordConfirmed={chooseWord}
              onCancel={() => setSelectionMode("gallery")}
            />
          </Suspense>
        ) : selectionMode === "free" ? (
          <FreeWordInput onConfirm={chooseWord} />
        ) : selectionMode === "themes" ? (
          <ThemedWordLists onConfirm={chooseWord} />
        ) : (
          <ObjectGallery selectedWord={selectedWord} onSelectWord={chooseWord} />
        )}
      </div>
    );
  }

  // ── Étape 2 : confirmation du mot + écoute de la prononciation native ──────
  if (step === "confirm") {
    return (
      <div className="screen">
        <TopBar title="Confirmer le mot" showBack onBack={() => setStep("select")} />

        <div className="card">
          <SelectedPreview word={selectedWord} frOverride={selectedWordFr} onChangeObject={() => setStep("select")} />
        </div>

        <div className="confirm-word-actions">
          <p className="confirm-word-hint">
            Écoute la prononciation native si tu veux, puis valide pour commencer à t'entraîner.
          </p>
          <button className="hero__cta confirm-word-accept" onClick={acceptWord}>
            <Check size={18} /> Accepter ce mot et continuer
          </button>
          <button className="btn-change-object" onClick={() => setStep("select")}>
            <ArrowLeftRight size={16} /> Choisir un autre mot
          </button>
        </div>
      </div>
    );
  }

  // ── Étape 3 : enregistrement + résultat ─────────────────────────────────────
  return (
    <div className="screen">
      <TopBar title="PrononciA+" showBack onBack={backFromRecord} />

      <div className="card">
        <SelectedPreview word={selectedWord} frOverride={selectedWordFr} onChangeObject={backFromRecord} />
      </div>

      <div className="card">
        <div className="form-row">
          <label>Mot attendu</label>
          {selectionMode === "free" || selectionMode === "themes" ? (
            <div className="free-word-display">{selectedWord}</div>
          ) : (
            <WordDropdown
              value={selectedWord}
              onChange={(word) => { setSelectedWord(word); rec.resetAll(); }}
            />
          )}
        </div>

        {!modelChecking && !modelReady && (
          <div className="notice notice--info">
            <Loader2 size={16} className="spin-icon" />
            Préparation du moteur de reconnaissance vocale — uniquement au tout premier lancement du serveur (peut prendre un moment selon ta connexion). L'enregistrement se débloquera automatiquement dès que ce sera prêt.
          </div>
        )}

        <div className="recorder-zone">
          <div className="recorder-row">
            <button
              className={`record-btn${rec.isRecording ? " record-btn--active" : ""}`}
              onClick={rec.isRecording ? rec.stopRecording : rec.startRecording}
              disabled={rec.isLoading || !modelReady}
              aria-label={rec.isRecording ? "Arrêter l'enregistrement" : "Démarrer l'enregistrement"}
              title={!modelReady ? "Moteur de reconnaissance vocale en cours de préparation…" : undefined}
            >
              {rec.isRecording ? <Square size={22} fill="currentColor" /> : <Mic size={22} />}
            </button>

            <div className="recorder-info">
              {rec.isRecording ? (
                <>
                  <span className="recorder-timer">{formatTime(rec.elapsed)}</span>
                  <div className="recorder-waveform">
                    {Array.from({ length: 8 }).map((_, i) => <span key={i} className="recorder-bar" />)}
                  </div>
                </>
              ) : rec.audioUrl ? (
                <AudioPlayer src={rec.audioUrl} />
              ) : (
                <span className="recorder-hint">Appuie sur le micro pour commencer l'enregistrement</span>
              )}
            </div>
          </div>

          {rec.audioBlob && !rec.isRecording && (
            <div className="recorder-actions">
              <button className="btn-discard" onClick={rec.discardRecording} disabled={rec.isLoading}>
                <RotateCcw size={16} /> Refaire
              </button>
              <button className="btn-analyze" onClick={rec.analyzeAudio} disabled={rec.isLoading}>
                <Send size={16} /> {rec.isLoading ? "Analyse…" : "Analyser"}
              </button>
            </div>
          )}
        </div>

        {rec.statusMessage && (
          <div className={`notice${rec.statusKind === "warn" ? " notice--warn" : ""}`}>
            {rec.statusMessage}
          </div>
        )}

        {rec.quotaExceeded && (
          <div className="quota-upsell">
            <Crown size={20} color="var(--c-warning)" />
            <div>
              <strong>Quota gratuit atteint ({rec.quotaExceeded.used}/{rec.quotaExceeded.limit} aujourd'hui)</strong>
              <p>Reviens demain, ou passe Premium pour des analyses illimitées.</p>
            </div>
            <button onClick={() => navigate("/premium")}>Voir Premium</button>
          </div>
        )}
      </div>

      {rec.result?.quota && !rec.result.quota.isPremium && (
        <p className="quota-hint">
          Analyse {rec.result.quota.used}/{rec.result.quota.limit} aujourd'hui —{" "}
          <button className="quota-hint__link" onClick={() => navigate("/premium")}>passer Premium</button> pour un accès illimité.
        </p>
      )}

      {rec.result && (
        <div className="card result-card">
          <h2>Résultat d'analyse</h2>

          <div className="result-grid">
            <div>
              <strong>Mot attendu :</strong>
              <p className="recognized-text">{rec.result.motAttendu}</p>
            </div>
            <div>
              <strong>Mot reconnu :</strong>
              <p className="recognized-text">{rec.result.motReconnu}</p>
            </div>
            <div>
              <strong>Verdict :</strong>
              <p className={`verdict ${getVerdictClass(rec.result.verdictCourt)}`}>{rec.result.verdictCourt}</p>
            </div>
            <div>
              <strong>Commentaire :</strong>
              <p className="result-comment">{rec.result.commentaire}</p>
            </div>
          </div>

          <div className="phoneme-diff-section">
            <strong>Ce qu'il faut améliorer :</strong>
            <PhonemeDiff alignment={rec.result.alignementPhonemes} />
            {!rec.result.usedAcousticModel && (
              <p className="acoustic-model-note">
                Le modèle d'analyse acoustique complet est encore en cours de préparation en arrière-plan sur le
                serveur (ça peut prendre un moment la première fois) — ce résultat utilise une méthode simplifiée
                en attendant. Réessaie dans quelques minutes pour une analyse plus précise.
              </p>
            )}
          </div>

          <button className="btn-speak" onClick={rec.speakVerdict}>
            {rec.isSpeaking ? <><Square size={16} fill="currentColor" /> Arrêter</> : <><Volume2 size={18} /> Écouter le verdict</>}
          </button>

          <div className="metric">
            <div className="metric-label"><span>Score de prononciation</span><span>{(100 - perPct).toFixed(0)}%</span></div>
            <div className="metric-bar-bg">
              <div className="metric-bar-fill" style={{ width: `${100 - perPct}%`, background: perBarColor }} />
            </div>
          </div>

          <p className="score-note">
            Ce score compare les sons que tu as prononcés à ceux attendus pour ce mot : 100% = prononciation
            identique à la référence, 0% = aucun son reconnu en commun. Regarde le détail phonème par phonème
            ci-dessus pour savoir précisément quoi corriger.
          </p>

          <div className="result-next-actions">
            <button className="btn-discard" onClick={rec.discardRecording}>
              <RotateCcw size={16} /> Réessayer ce mot
            </button>
            <button className="btn-analyze" onClick={backFromRecord}>
              Choisir un autre objet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
