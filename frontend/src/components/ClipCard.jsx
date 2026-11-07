import { useRef, useState } from "react";
import { api } from "../api";
import { dayTime } from "../util";
import Icon from "./Icon";

function AudioPlayer({ src }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);
  const [time, setTime] = useState("");

  const fmt = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "");
  const toggle = () => {
    const a = ref.current;
    if (a.paused) a.play();
    else a.pause();
  };
  return (
    <div className="player">
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setTime(fmt(e.target.duration))}
        onTimeUpdate={(e) => setPct((e.target.currentTime / (e.target.duration || 1)) * 100)}
      />
      <button className="play" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
        <Icon name={playing ? "pause" : "play"} size={20} fill={playing ? "none" : "var(--ink)"} stroke="var(--ink)" />
      </button>
      <div
        className="bar"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const a = ref.current;
          if (a.duration) a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
        }}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
      <span className="sub" style={{ fontWeight: 800, color: "var(--ink)", minWidth: 36 }}>{time}</span>
    </div>
  );
}

/** One thing they said: player, their words (editable), and optional action slot. */
export default function ClipCard({ clip, onChange, children }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(clip.transcript);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const save = async () => {
    const updated = await api.patchClip(clip.id, { transcript: text });
    setEditing(false);
    onChange?.(updated);
  };
  const transcribe = async () => {
    setBusy(true);
    setNote("");
    try {
      const r = await api.transcribe(clip.id);
      setText(r.transcript);
      onChange?.({ ...clip, transcript: r.transcript });
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card tint" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {clip.kind === "video" ? (
        <video className="clip" src={clip.url} controls playsInline preload="metadata" />
      ) : (
        <AudioPlayer src={clip.url} />
      )}

      {editing ? (
        <>
          <textarea className="words" value={text} onChange={(e) => setText(e.target.value)} aria-label="What they said" autoFocus />
          <div className="row">
            <button className="btn" onClick={save}>Save words</button>
            <button className="link-btn" onClick={() => { setText(clip.transcript); setEditing(false); }}>Cancel</button>
          </div>
        </>
      ) : clip.transcript ? (
        <p className="quote">“{clip.transcript}”</p>
      ) : (
        <p className="sub">No words written down yet.</p>
      )}

      <div className="row between" style={{ flexWrap: "wrap", gap: 0 }}>
        <span className="sub">
          {clip.kind === "video" ? "Video" : "Voice note"} · {dayTime(clip.recorded_at)}
        </span>
        {!editing && (
          <span className="row" style={{ gap: 0 }}>
            <button className="link-btn" onClick={() => setEditing(true)}>{clip.transcript ? "Fix the words" : "Type the words"}</button>
            <button className="link-btn" onClick={transcribe} disabled={busy}>{busy ? "Listening…" : "Write them for me"}</button>
          </span>
        )}
      </div>
      {note && <div className="toast">{note}</div>}
      {children}
    </div>
  );
}
