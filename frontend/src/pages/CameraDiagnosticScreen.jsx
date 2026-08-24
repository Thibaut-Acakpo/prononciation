import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import { RotateCcw, CircleCheck, CircleAlert, ScanEye } from "lucide-react";
import TopBar from "../layout/TopBar";
import { useOfflineNotice } from "../lib/useOfflineNotice";

// Couleur d'encadrement volontairement très saturée et à fort contraste sur
// à peu près n'importe quel arrière-plan (intérieur, extérieur, jour, nuit) —
// c'est un outil de DIAGNOSTIC : la personne doit voir immédiatement et sans
// ambiguïté ce que la caméra détecte, contrairement au cyan plus discret
// utilisé pendant l'entraînement normal (voir CameraPointer.jsx).
const HIGHLIGHT_COLOR = "#39ff14"; // vert néon
const DETECTION_INTERVAL_MS = 200;
const MIN_CONFIDENCE = 0.55;

export default function CameraDiagnosticScreen() {
  const navigate = useNavigate();
  useOfflineNotice("Le modèle de détection d'objets doit être téléchargé une première fois via une connexion — il fonctionne ensuite hors-ligne.");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lastDetectionAtRef = useRef(0);
  const modelRef = useRef(null);
  const frameTimesRef = useRef([]);

  const [status, setStatus] = useState("Chargement du modèle de détection…");
  const [error, setError] = useState(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const [maxCount, setMaxCount] = useState(0);
  const [totalDetections, setTotalDetections] = useState(0);
  const [lastLabels, setLastLabels] = useState([]);
  const [fps, setFps] = useState(0);

  // ── Chargement du modèle (une seule fois) ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await tf.ready();
        const model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
        if (cancelled) return;
        modelRef.current = model;
        setModelReady(true);
        setStatus("Modèle chargé. Ouverture de la caméra…");
      } catch (err) {
        console.error("[CameraDiagnostic] Erreur de chargement du modèle :", err);
        if (!cancelled) setError("Impossible de charger le modèle de détection. Vérifie ta connexion (premier chargement uniquement).");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Accès caméra (mêmes garde-fous que CameraPointer : contexte sécurisé,
  // retries pour NotReadableError transitoire, messages d'erreur clairs) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.isSecureContext) {
        setError(
          "La caméra nécessite une connexion sécurisée. Ouvre l'application via " +
          `http://localhost:… — tu utilises actuellement : ${window.location.origin}`
        );
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Ce navigateur ne supporte pas l'accès caméra (API getUserMedia absente).");
        return;
      }

      const constraints = {
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };
      const RETRY_DELAYS_MS = [600, 1200, 2000];

      async function openCamera(attempt = 0) {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          setStatus("Caméra active — pointe-la vers des objets.");
        } catch (err) {
          console.error(`[CameraDiagnostic] Erreur caméra (tentative ${attempt + 1}) :`, err.name, err.message);
          if (err.name === "NotReadableError" && attempt < RETRY_DELAYS_MS.length) {
            setTimeout(() => { if (!cancelled) openCamera(attempt + 1); }, RETRY_DELAYS_MS[attempt]);
            return;
          }
          const messages = {
            NotAllowedError: "Accès à la caméra refusé. Autorise la caméra dans les réglages du navigateur (icône cadenas dans la barre d'adresse).",
            NotFoundError: "Aucune caméra détectée sur cet appareil.",
            NotReadableError: "La caméra n'a pas répondu après plusieurs tentatives. Réessaie ci-dessous, ou ferme les autres applications qui pourraient l'utiliser.",
            OverconstrainedError: "Aucune caméra ne correspond aux critères demandés.",
          };
          setError(messages[err.name] || `Impossible d'accéder à la caméra (${err.name || "erreur inconnue"}).`);
        }
      }
      await openCamera();
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [retryTrigger]);

  const detectLoop = useCallback(async (timestamp) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const model = modelRef.current;

    if (!video || !canvas || !model || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detectLoop);
      return;
    }
    if (timestamp - lastDetectionAtRef.current < DETECTION_INTERVAL_MS) {
      rafRef.current = requestAnimationFrame(detectLoop);
      return;
    }
    const elapsedSinceLast = timestamp - lastDetectionAtRef.current;
    lastDetectionAtRef.current = timestamp;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
      const detections = await model.detect(video);
      const kept = detections.filter((d) => d.score >= MIN_CONFIDENCE);

      for (const obj of kept) {
        const [bx, by, bw, bh] = obj.bbox;

        // Cadre très visible.
        ctx.strokeStyle = HIGHLIGHT_COLOR;
        ctx.lineWidth = 4;
        ctx.strokeRect(bx, by, bw, bh);

        // Nom exact de l'objet écrit en haut du cadre, avec un fond plein
        // pour rester lisible même sur un arrière-plan clair.
        const label = `${obj.class} · ${Math.round(obj.score * 100)}%`;
        ctx.font = "bold 18px sans-serif";
        const textWidth = ctx.measureText(label).width;
        const labelY = Math.max(22, by);
        ctx.fillStyle = HIGHLIGHT_COLOR;
        ctx.fillRect(bx - 2, labelY - 20, textWidth + 12, 24);
        ctx.fillStyle = "#0a0a0a";
        ctx.fillText(label, bx + 4, labelY - 3);
      }

      setLiveCount(kept.length);
      setMaxCount((m) => Math.max(m, kept.length));
      setTotalDetections((t) => t + kept.length);
      setLastLabels(kept.map((d) => d.class));

      if (elapsedSinceLast > 0) {
        frameTimesRef.current.push(1000 / elapsedSinceLast);
        if (frameTimesRef.current.length > 10) frameTimesRef.current.shift();
        const avg = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
        setFps(Math.round(avg * 10) / 10);
      }
    } catch (err) {
      console.error("[CameraDiagnostic] Erreur de détection :", err);
    }

    rafRef.current = requestAnimationFrame(detectLoop);
  }, []);

  useEffect(() => {
    if (!modelReady) return;
    rafRef.current = requestAnimationFrame(detectLoop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [modelReady, detectLoop]);

  return (
    <div className="screen">
      <TopBar title="Diagnostic caméra" showBack onBack={() => navigate("/profile")} />

      <div className="card camera-diag__intro">
        <h3 className="card-subtitle"><ScanEye size={16} /> Test de détection en temps réel</h3>
        <p>
          Cet outil vérifie que la caméra détecte réellement des objets, en direct — utile pour
          diagnostiquer un souci avant de te lancer dans un entraînement ou un Match.
        </p>
      </div>

      {error ? (
        <div className="card camera-diag__error">
          <p><CircleAlert size={18} color="var(--c-danger)" /> {error}</p>
          <button className="hero__cta" onClick={() => { setError(null); setRetryTrigger((n) => n + 1); }}>
            <RotateCcw size={16} /> Réessayer
          </button>
        </div>
      ) : (
        <>
          <div className="camera-diag__viewport">
            <video ref={videoRef} className="camera-diag__video" playsInline muted />
            <canvas ref={canvasRef} className="camera-diag__canvas" />
            {!modelReady && <div className="camera-diag__loading">{status}</div>}
          </div>

          <div className="card">
            <div className="camera-diag__stats">
              <div className="stat-box">
                <span className="stat-box__value">{liveCount}</span>
                <span className="stat-box__label">Objets en ce moment</span>
              </div>
              <div className="stat-box">
                <span className="stat-box__value">{maxCount}</span>
                <span className="stat-box__label">Max simultané</span>
              </div>
              <div className="stat-box">
                <span className="stat-box__value">{fps || "—"}</span>
                <span className="stat-box__label">Détections/s</span>
              </div>
            </div>

            <p className="camera-diag__status">
              {modelReady ? (
                <><CircleCheck size={15} color="var(--c-success)" /> {status}</>
              ) : status}
            </p>

            {lastLabels.length > 0 && (
              <div className="camera-diag__labels">
                {[...new Set(lastLabels)].map((label) => (
                  <span key={label} className="badge-pill">{label}</span>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
