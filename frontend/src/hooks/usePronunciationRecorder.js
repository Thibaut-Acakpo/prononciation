import { useState, useRef } from "react";
import { useAuth } from "../auth/AuthContext";

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function getVerdictClass(verdict) {
  if (!verdict) return "";
  const v = verdict.toLowerCase();
  if (v.includes("excellent")) return "verdict--excellent";
  if (v.includes("proche") || v.includes("bon") || v.includes("bien")) return "verdict--good";
  if (v.includes("acceptable") || v.includes("correct")) return "verdict--ok";
  return "verdict--bad";
}

/**
 * Toute la logique d'enregistrement + envoi au backend + résultat, extraite
 * de l'ancien App.jsx monolithique pour pouvoir être réutilisée par
 * PracticeScreen sans dupliquer 150 lignes de logique.
 */
export function usePronunciationRecorder(selectedWord) {
  const { token, previewHeader } = useAuth();

  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusKind, setStatusKind] = useState("info");
  const [isLoading, setIsLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [quotaExceeded, setQuotaExceeded] = useState(null); // { used, limit } | null

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const resetRecording = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setStatusMessage("");
  };

  const resetAll = () => {
    resetRecording();
    setElapsed(0);
    setResult(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setStatusMessage("");
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setElapsed(0);
      setStatusMessage("");

      timerRef.current = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    } catch (err) {
      console.error(err);
      setStatusKind("warn");
      setStatusMessage("Le micro n'est pas accessible. Vérifie les autorisations de ton navigateur.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const discardRecording = () => {
    resetRecording();
    setElapsed(0);
    setResult(null);
  };

  const analyzeAudio = async ({ isDailyChallenge = false } = {}) => {
    if (!audioBlob) return;

    setIsLoading(true);
    setStatusMessage("");
    setQuotaExceeded(null);

    const formData = new FormData();
    formData.append("audio", audioBlob, "enreg.wav");
    formData.append("expectedWord", selectedWord);
    if (isDailyChallenge) formData.append("isDailyChallenge", "true");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(previewHeader ? { "X-Preview-As": previewHeader } : {}),
        },
      });

      const data = await response.json();

      if (response.status === 429 && data.quota) {
        setQuotaExceeded(data.quota);
        setStatusKind("warn");
        setStatusMessage(data.error);
        return;
      }

      if (!response.ok || data.error) {
        throw new Error(data.error || "Réessaie dans un instant.");
      }

      setResult({
        motAttendu: data.mot_attendu || selectedWord,
        motReconnu: data.mot_reconnu || "",
        verdictCourt: data.verdict_court || "",
        commentaire: data.commentaire || "",
        phonemesAttendus: data.phonemes_attendus || "",
        usedAcousticModel: data.analyse_acoustique_reelle ?? true,
        phonemesExtraits: data.phonemes_extraits || "",
        alignementPhonemes: data.alignement_phonemes || [],
        jaccard: data.jaccard ?? 0,
        cosinus: data.cosinus ?? 0,
        per: data.per ?? 0,
        quota: data.quota || null,
      });
      setStatusMessage("");
    } catch (error) {
      console.error(error);
      setStatusKind("warn");
      setStatusMessage("L'analyse n'a pas pu être réalisée. " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const [isSpeaking, setIsSpeaking] = useState(false);

  const speakVerdict = () => {
    if (!("speechSynthesis" in window) || !result?.commentaire) return;

    // Correction : avant, cliquer une deuxième fois relançait la lecture
    // depuis le début sans jamais pouvoir l'arrêter. Maintenant le bouton
    // fait office d'interrupteur : un clic pendant la lecture l'arrête.
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(result.commentaire);
    utt.lang = "fr-FR";
    utt.onend = () => setIsSpeaking(false);
    utt.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utt);
  };

  return {
    isRecording, audioUrl, audioBlob, statusMessage, statusKind, isLoading, elapsed, result,
    isSpeaking, quotaExceeded,
    startRecording, stopRecording, discardRecording, analyzeAudio, speakVerdict, resetAll,
  };
}
