import { useEffect, useRef, useState, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as handPoseDetection from "@tensorflow-models/hand-pose-detection";
import { mapDetectionToAppWord } from "../lib/cocoClassMap";

// Index du bout de l'index dans le schéma de points MediaPipe Hands
// (0 = poignet, 4 = bout du pouce, 8 = bout de l'index, ...).
const INDEX_FINGERTIP = 8;
const INDEX_KNUCKLE = 5; // base de l'index — sert à calculer la direction du pointage

const DETECTION_INTERVAL_MS = 160;
const STABILITY_THRESHOLD = 3;
const MIN_CONFIDENCE = 0.55;

// Même couleur très visible que le Diagnostic caméra pour l'objet visé.
const AIMED_COLOR = "#39ff14";

// "person" est un mot valide de l'app (utilisable via la galerie), mais ici,
// dans le mode Pointer, coco-ssd détecte systématiquement la propre main/le
// bras/le buste de l'utilisateur comme "person" — puisque c'est justement ce
// qu'il y a devant la caméra en train de pointer ! Résultat sans ce filtre :
// l'app encadrait la main de l'utilisateur au lieu de l'objet visé. On
// exclut donc "person" des objets pointables ici (le Diagnostic caméra, lui,
// le garde : son but est de montrer la détection brute, pas de sélectionner
// un mot à pointer).
const EXCLUDED_WORDS = new Set(["person"]);

function pointInBox(px, py, [bx, by, bw, bh]) {
  return px >= bx && px <= bx + bw && py >= by && py <= by + bh;
}

function distancePointToBox(px, py, [bx, by, bw, bh]) {
  const cx = Math.max(bx, Math.min(px, bx + bw));
  const cy = Math.max(by, Math.min(py, by + bh));
  return Math.hypot(px - cx, py - cy);
}

// Tolérance (en pixels) autour du rayon exact — au-delà du simple lancer de
// rayon "tout ou rien", qui s'est révélé trop strict en pratique : le
// moindre tremblement de main (inévitable en vrai usage, pas dans un test en
// labo) fait rater la boîte de justesse en continu, et rien ne se
// confirmait jamais côté utilisateur ("le bouton reste désactivé"). On
// tolère maintenant un écart raisonnable autour du rayon.
const AIM_TOLERANCE_PX = 90;

/**
 * Détermine l'objet pointé par le doigt : d'abord un lancer de rayon précis
 * depuis le bout de l'index (le plus fiable quand le pointage est net),
 * puis, si rien n'est trouvé, une tolérance plus large autour de ce même
 * rayon (le point projeté le plus loin dans la direction pointée) — un
 * compromis entre précision et tolérance aux tremblements naturels de la main.
 */
function raycastAimedObject(tip, knuckle, objects) {
  const dx = tip.x - knuckle.x;
  const dy = tip.y - knuckle.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const ux = dx / len;
  const uy = dy / len;

  const MAX_DISTANCE = 700; // px, au-delà on considère que rien n'est visé
  const STEP = 6;

  // Passage 1 : rayon exact (tout ou rien) — le plus précis.
  for (let d = 6; d < MAX_DISTANCE; d += STEP) {
    const px = tip.x + ux * d;
    const py = tip.y + uy * d;
    for (const obj of objects) {
      if (pointInBox(px, py, obj.bbox)) return obj;
    }
  }

  // Passage 2 : tolérance — objet le plus proche du point visé (loin dans
  // la direction du doigt), à condition de rester dans une marge raisonnable.
  const aimX = tip.x + ux * 260;
  const aimY = tip.y + uy * 260;
  let closest = null;
  let closestDist = Infinity;
  for (const obj of objects) {
    const dist = distancePointToBox(aimX, aimY, obj.bbox);
    if (dist < closestDist) { closestDist = dist; closest = obj; }
  }
  return closestDist <= AIM_TOLERANCE_PX ? closest : null;
}

export default function CameraPointer({ knownWords, onWordConfirmed, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lastDetectionAtRef = useRef(0);
  const stableWordRef = useRef({ word: null, count: 0 });
  const lastObjectsRef = useRef([]); // pour le tap-to-select (coordonnées du dernier passage de détection)
  const tapSelectionRef = useRef(null); // { word, until } — sélection tactile temporaire, prioritaire sur le pointage main

  const [status, setStatus] = useState("Initialisation de la caméra…");
  const [error, setError] = useState(null);
  const [pointedWord, setPointedWord] = useState(null);
  const [objectModelReady, setObjectModelReady] = useState(false);
  const [handModelStatus, setHandModelStatus] = useState("loading"); // "loading" | "ready" | "unavailable"
  const [retryTrigger, setRetryTrigger] = useState(0);
  const modelsRef = useRef({ objectModel: null, handModel: null });

  // ── Chargement des modèles ────────────────────────────────────────────────
  // IMPORTANT (correction du bug signalé) : avant, la détection d'objets
  // n'affichait RIEN tant que le modèle de main n'était pas chargé ET
  // qu'une main pointait activement un objet — si la main n'était pas bien
  // captée (angle de caméra, éclairage, appareil bas de gamme), l'écran
  // restait vide, contrairement au Diagnostic caméra qui encadre tout ce
  // qu'il détecte en permanence. Maintenant : le modèle d'objets démarre et
  // affiche ses résultats dès qu'IL est prêt, sans attendre le modèle de
  // main. Le modèle de main se charge en parallèle et n'ajoute qu'une
  // fonctionnalité EN PLUS (viser du doigt) — s'il échoue à charger, on
  // bascule proprement sur la sélection au tap, sans jamais bloquer l'écran.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setStatus("Chargement du modèle de détection d'objets…");
        await tf.ready();
        const objectModel = await cocoSsd.load({ base: "lite_mobilenet_v2" });
        if (cancelled) return;
        modelsRef.current.objectModel = objectModel;
        setObjectModelReady(true);
        setStatus("Pointe un objet du doigt, ou touche-le directement à l'écran.");
      } catch (err) {
        console.error("[CameraPointer] Erreur de chargement du modèle d'objets :", err);
        if (!cancelled) setError("Impossible de charger le modèle de détection. Vérifie ta connexion (premier chargement uniquement).");
      }
    })();

    (async () => {
      try {
        const handModel = await handPoseDetection.createDetector(
          handPoseDetection.SupportedModels.MediaPipeHands,
          { runtime: "tfjs", modelType: "lite", maxHands: 1 }
        );
        if (cancelled) return;
        modelsRef.current.handModel = handModel;
        setHandModelStatus("ready");
      } catch (err) {
        // Non bloquant : la détection d'objets (l'essentiel) fonctionne déjà
        // sans le modèle de main. On informe juste que le pointage du doigt
        // n'est pas disponible, la sélection au tap prend le relais.
        console.error("[CameraPointer] Modèle de main indisponible (non bloquant) :", err);
        if (!cancelled) setHandModelStatus("unavailable");
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ── Accès caméra ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!window.isSecureContext) {
        setError(
          "La caméra nécessite une connexion sécurisée. Ouvre l'application via " +
          "http://localhost:… (pas une adresse IP ni un nom de domaine local) — " +
          `tu utilises actuellement : ${window.location.origin}`
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
        } catch (err) {
          console.error(`[CameraPointer] Erreur caméra (tentative ${attempt + 1}) :`, err.name, err.message);

          if (err.name === "NotReadableError" && attempt < RETRY_DELAYS_MS.length) {
            setTimeout(() => { if (!cancelled) openCamera(attempt + 1); }, RETRY_DELAYS_MS[attempt]);
            return;
          }

          const messages = {
            NotAllowedError: "Accès à la caméra refusé. Autorise la caméra dans les réglages du navigateur (icône cadenas dans la barre d'adresse) pour utiliser cette fonctionnalité.",
            NotFoundError: "Aucune caméra détectée sur cet appareil.",
            NotReadableError: "La caméra n'a pas répondu après plusieurs tentatives. Ça peut être temporaire (le système met parfois un moment à la libérer) — essaie de cliquer sur \"Réessayer\" ci-dessous avant de fermer d'autres applications.",
            OverconstrainedError: "Aucune caméra ne correspond aux critères demandés (résolution/orientation).",
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

  const detectLoop = useCallback(
    async (timestamp) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const { objectModel, handModel } = modelsRef.current;

      // On ne bloque plus que sur le modèle d'objets — le modèle de main est
      // optionnel (voir commentaire plus haut).
      if (!video || !canvas || !objectModel || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(detectLoop);
        return;
      }

      if (timestamp - lastDetectionAtRef.current < DETECTION_INTERVAL_MS) {
        rafRef.current = requestAnimationFrame(detectLoop);
        return;
      }
      lastDetectionAtRef.current = timestamp;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      try {
        const [rawObjects, hands] = await Promise.all([
          objectModel.detect(video),
          handModel ? handModel.estimateHands(video, { flipHorizontal: false }) : Promise.resolve([]),
        ]);

        // Même filtre que le Diagnostic caméra (uniquement le seuil de
        // confiance, rien d'autre) — l'AFFICHAGE doit être identique.
        const detected = rawObjects.filter((o) => o.score >= MIN_CONFIDENCE);
        // En parallèle, la liste des objets utilisables comme mot à
        // apprendre (dans notre lexique, "person" exclu — voir plus haut) :
        // sert uniquement à la logique de VISÉE ci-dessous, pas à l'affichage.
        const objects = detected
          .map((o) => ({ ...o, word: mapDetectionToAppWord(o.class, knownWords) }))
          .filter((o) => o.word && !EXCLUDED_WORDS.has(o.word));

        lastObjectsRef.current = objects;

        let aimed = null;

        // Sélection tactile récente (tap sur l'écran) — prioritaire, expire
        // après 2.5s pour redonner la main au pointage du doigt / à un
        // nouveau tap.
        if (tapSelectionRef.current && tapSelectionRef.current.until > timestamp) {
          aimed = objects.find((o) => o.word === tapSelectionRef.current.word) || null;
        } else {
          tapSelectionRef.current = null;
        }

        // Pointage du doigt par lancer de rayon (voir raycastAimedObject) —
        // vient compléter, jamais remplacer, le tap.
        if (!aimed && hands.length > 0) {
          const tip = hands[0].keypoints[INDEX_FINGERTIP];
          const knuckle = hands[0].keypoints[INDEX_KNUCKLE];
          aimed = raycastAimedObject(tip, knuckle, objects);
        }

        // ── Affichage : EXACTEMENT comme le Diagnostic caméra — tous les
        // objets détectés sont encadrés en vert néon, avec leur nom + score
        // de confiance. Seul l'objet actuellement visé porte en plus un "✓"
        // dans son étiquette (même couleur, même style) pour indiquer lequel
        // sera utilisé si on valide — c'est la SEULE différence visuelle.
        for (const obj of detected) {
          const [bx, by, bw, bh] = obj.bbox;
          const isAimed = aimed && obj.class === aimed.class && obj.bbox === aimed.bbox;

          ctx.strokeStyle = AIMED_COLOR;
          ctx.lineWidth = 4;
          ctx.strokeRect(bx, by, bw, bh);

          const label = `${obj.class} · ${Math.round(obj.score * 100)}%${isAimed ? " ✓" : ""}`;
          ctx.font = "bold 18px sans-serif";
          const textWidth = ctx.measureText(label).width;
          const labelY = Math.max(22, by);
          ctx.fillStyle = AIMED_COLOR;
          ctx.fillRect(bx - 2, labelY - 20, textWidth + 12, 24);
          ctx.fillStyle = "#0a0a0a";
          ctx.fillText(label, bx + 4, labelY - 3);
        }

        const aimedWord = aimed?.word || null;

        // ── Stabilité : le pointage du doigt doit rester stable plusieurs
        // détections d'affilée avant validation (évite les faux positifs
        // dus à un tremblement de main). Le tap, lui, est immédiat — c'est
        // une action explicite de l'utilisateur, pas une estimation.
        if (tapSelectionRef.current) {
          setPointedWord(aimedWord);
        } else if (aimedWord && aimedWord === stableWordRef.current.word) {
          stableWordRef.current.count += 1;
          if (stableWordRef.current.count >= STABILITY_THRESHOLD) setPointedWord(aimedWord);
        } else {
          stableWordRef.current = { word: aimedWord, count: aimedWord ? 1 : 0 };
          if (!aimedWord) setPointedWord(null);
        }
      } catch (err) {
        console.error("[CameraPointer] Erreur de détection :", err);
      }

      rafRef.current = requestAnimationFrame(detectLoop);
    },
    [knownWords]
  );

  useEffect(() => {
    if (!objectModelReady) return;
    rafRef.current = requestAnimationFrame(detectLoop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [objectModelReady, detectLoop]);

  // ── Sélection au tap/clic — filet de sécurité si le pointage du doigt ne
  // fonctionne pas bien (angle de caméra, luminosité, modèle de main
  // indisponible…). L'utilisateur touche directement l'objet encadré à
  // l'écran pour le sélectionner, sans dépendre du tracking de la main.
  function handleCanvasTap(e) {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;

    // Le canvas est affiché en `object-fit: cover` (recadré pour remplir son
    // cadre) : il ne suffit pas de mettre à l'échelle les coordonnées, il
    // faut aussi tenir compte de la partie recadrée (hors cadre) pour
    // retrouver le bon pixel dans la résolution native de la vidéo.
    const scale = Math.max(rect.width / canvas.width, rect.height / canvas.height);
    const offsetX = (canvas.width * scale - rect.width) / 2;
    const offsetY = (canvas.height * scale - rect.height) / 2;
    const x = (clientX - rect.left + offsetX) / scale;
    const y = (clientY - rect.top + offsetY) / scale;

    for (const obj of lastObjectsRef.current) {
      if (pointInBox(x, y, obj.bbox)) {
        tapSelectionRef.current = { word: obj.word, until: performance.now() + 2500 };
        setPointedWord(obj.word);
        break;
      }
    }
  }

  if (error) {
    return (
      <div className="camera-pointer camera-pointer--error">
        <p>{error}</p>
        <div className="camera-pointer__actions">
          <button
            className="camera-pointer__confirm"
            onClick={() => { setError(null); setRetryTrigger((n) => n + 1); }}
          >
            Réessayer
          </button>
          <button className="camera-pointer__cancel" onClick={onCancel}>Retour à la galerie</button>
        </div>
      </div>
    );
  }

  return (
    <div className="camera-pointer">
      <div className="camera-pointer__viewport">
        <video ref={videoRef} className="camera-pointer__video" playsInline muted />
        <canvas
          ref={canvasRef}
          className="camera-pointer__canvas"
          onClick={handleCanvasTap}
          onTouchStart={handleCanvasTap}
        />
      </div>

      <p className="camera-pointer__status">
        {pointedWord ? (
          <>Tu pointes : <strong>{pointedWord}</strong></>
        ) : (
          status
        )}
      </p>
      {handModelStatus === "unavailable" && (
        <p className="camera-pointer__hint">Le pointage du doigt n'est pas disponible sur cet appareil — touche directement un objet encadré à l'écran pour le choisir.</p>
      )}

      <div className="camera-pointer__actions">
        <button
          className="camera-pointer__confirm"
          disabled={!pointedWord}
          onClick={() => pointedWord && onWordConfirmed(pointedWord)}
        >
          Utiliser ce mot
        </button>
        <button className="camera-pointer__cancel" onClick={onCancel}>
          Revenir à la galerie
        </button>
      </div>
    </div>
  );
}
