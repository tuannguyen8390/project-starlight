import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import ClipCard from "../components/ClipCard";
import Icon from "../components/Icon";
import Shell from "../components/Shell";
import { useStats } from "../stats";
import { dayLabel, dayTime, gap } from "../util";

/** Pair one clip with the painting(s) she was talking about. Closest in time first. */
export default function Match() {
  const { id } = useParams();
  const nav = useNavigate();
  const { refresh } = useStats();
  const [queue, setQueue] = useState([]);
  const [clip, setClip] = useState(null);
  const [sugg, setSugg] = useState([]);
  const [all, setAll] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.clips({ inbox: true }).then((list) => setQueue([...list].reverse())); // oldest first
  }, []);

  useEffect(() => {
    setAll(null);
    setPicked(new Set());
    Promise.all([api.clips(), api.suggestions(id)]).then(([clips, s]) => {
      setClip(clips.find((c) => c.id === id) || null);
      setSugg(s);
      if (s[0] && Math.abs(s[0].diff_seconds) < 12 * 3600) setPicked(new Set([s[0].id]));
    });
  }, [id]);

  const idx = queue.findIndex((c) => c.id === id);
  const goNext = () => {
    refresh();
    const nxt = queue[idx + 1];
    nav(nxt ? `/match/${nxt.id}` : "/inbox?tab=clips", { replace: true });
  };
  const toggle = (pid) => {
    const n = new Set(picked);
    n.has(pid) ? n.delete(pid) : n.add(pid);
    setPicked(n);
  };
  const link = async () => {
    setBusy(true);
    try {
      for (const pid of picked) await api.link(pid, id);
      goNext();
    } finally {
      setBusy(false);
    }
  };
  const keep = async () => { await api.patchClip(id, { dismissed: true }); goNext(); };

  const Tile = ({ p, label, best }) => (
    <button className="tile" aria-pressed={picked.has(p.id)} onClick={() => toggle(p.id)} aria-label={`Painting ${p.title || dayLabel(p.painted_at)}`}>
      <span className="pic">
        <img src={p.thumb_url} alt="" loading="lazy" />
        <span className="check">{picked.has(p.id) && <Icon name="check" size={14} width={3.5} stroke="var(--ink)" />}</span>
      </span>
      <span className="lbl"><b>{dayLabel(p.painted_at)}</b><br />{label}</span>
      {best && <span className="tag mint" style={{ minHeight: 24, padding: "0 8px", fontSize: 13, borderWidth: 2 }}>Best match</span>}
    </button>
  );

  return (
    <Shell
      bare
      bar={
        <div className="footer col">
          <button className="btn primary block" disabled={!picked.size || busy} onClick={link}>
            <Icon name="link" /> {picked.size > 1 ? `Link to ${picked.size} paintings` : "Link them"}
          </button>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="link-btn" onClick={goNext}>Skip for now</button>
            <button className="link-btn" onClick={keep}>Keep without a painting</button>
          </div>
        </div>
      }
    >
      <div className="page">
        <div className="row">
          <Link to="/inbox?tab=clips" className="icon-btn" aria-label="Back to inbox"><Icon name="back" /></Link>
          <div className="grow">
            <h1 className="h1" style={{ fontSize: 24 }}>Match a clip</h1>
            <p className="sub">{idx >= 0 ? `Clip ${idx + 1} of ${queue.length}` : ""}</p>
          </div>
        </div>

        {clip && <ClipCard clip={clip} onChange={setClip} />}

        <div className="row between" style={{ marginTop: 4 }}>
          <h2 className="h2">Which painting is it?</h2>
          <span className="sub">Closest first</span>
        </div>
        <div className="grid3">
          {sugg.slice(0, 6).map((p, n) => (
            <Tile key={p.id} p={p} best={n === 0 && Math.abs(p.diff_seconds) < 12 * 3600} label={gap(p.diff_seconds)} />
          ))}
        </div>
        {sugg.length === 0 && <div className="empty"><p>No paintings yet. Add some first.</p></div>}

        {!all && sugg.length > 0 && (
          <button className="link-btn" onClick={() => api.paintings({}).then(setAll)}>None of these? Browse all paintings</button>
        )}
        {all && (
          <div className="grid3">
            {all.map((p) => (
              <Tile key={p.id} p={p} label={clip ? dayTime(p.painted_at).split(",")[1] : ""} />
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
