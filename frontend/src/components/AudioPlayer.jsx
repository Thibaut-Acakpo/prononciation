import { useState, useRef, useEffect } from "react";
import { Play, Pause } from "lucide-react";

function formatTime(sec) {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
  }, [src]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
  }

  function handleSeek(e) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * duration;
    setCurrent(audio.currentTime);
  }

  const progressPct = duration ? (current / duration) * 100 : 0;

  return (
    <div className="audio-player-custom">
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <button
        type="button"
        className="audio-player-custom__toggle"
        onClick={togglePlay}
        aria-label={playing ? "Mettre en pause" : "Écouter mon enregistrement"}
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>

      <div className="audio-player-custom__track" onClick={handleSeek}>
        <div className="audio-player-custom__track-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <span className="audio-player-custom__time">
        {formatTime(current)} / {formatTime(duration)}
      </span>
    </div>
  );
}
