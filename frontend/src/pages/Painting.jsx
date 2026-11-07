import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import ClipCard from "../components/ClipCard";
import Icon from "../components/Icon";
import Shell, { useUploader } from "../components/Shell";
import { useStats } from "../stats";
import { dateInput, dayTime, longDay, withDate } from "../util";

function LinkSheet({ painting, onClose, onLinked }) {
  const [clips, setClips] = useState(null);
  useEffect(() => {
    api.clips({ inbox: true }).then((list) => {
      const t = new Date(painting.painted_at).getTime();
      list.sort((a, b) => Math.abs(new Date(a.recorded_at) - t) - Math.abs(new Date(b.recorded_at) - t));
      setClips(list);
    });
  }, [painting]);
  const link = async (c) => {
    await api.link(painting.id, c.id);
    onLinked();
  };
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Link a clip" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2 className="h2">Link a clip</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <p className="sub">Clips from the Inbox, closest to this painting's date first.</p>
        {clips && clips.length === 0 && <div className="empty"><p>No unlinked clips in the Inbox.</p></div>}
        {(clips || []).map((c) => (
          <div key={c.id} className="card row">
            <Icon name={c.kind === "video" ? "video" : "mic"} />
            <div className="grow">
              <div style={{ fontWeight: 800, fontSize: 15 }}>{c.kind === "video" ? "Video" : "Voice note"} · {dayTime(c.recorded_at)}</div>
              <div className="sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.transcript || "No words yet"}</div>
            </div>
            <button className="btn" onClick={() => link(c)}>Link</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Painting() {
  const { id } = useParams();
  const nav = useNavigate();
  const { refresh } = useStats();
  const { run, progress } = useUploader();
  const [p, setP] = useState(null);
  const [sheet, setSheet] = useState(null); // "link" | "record" | null
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ title: "", date: "", tags: "" });
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.painting(id).then((r) => {
      setP(r);
      setForm({ title: r.title, date: dateInput(r.painted_at), tags: r.tags.join(", ") });
    }).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (!p) return <Shell bare><div className="page">{error ? <div className="toast">{error}</div> : <p className="sub">Loading…</p>}</div></Shell>;

  const toggleFav = async () => setP({ ...p, ...(await api.patchPainting(id, { favorite: !p.favorite })), clips: p.clips });
  const saveDetails = async () => {
    await api.patchPainting(id, {
      title: form.title,
      painted_at: withDate(p.painted_at, form.date),
      tags: form.tags.split(","),
      sorted: true,
    });
    setEdit(false);
    load();
    refresh();
  };
  const unlink = async (cid) => { await api.unlink(id, cid); load(); refresh(); };
  const remove = async () => {
    if (!window.confirm("Remove this painting for good?")) return;
    await api.deletePainting(id);
    refresh();
    nav("/");
  };
  const record = async (e) => {
    const files = e.target.files;
    setSheet(null);
    const r = await run(files);
    if (r) {
      for (const a of r.added.filter((x) => x.kind !== "painting")) await api.link(id, a.id);
      load();
      refresh();
    }
    e.target.value = "";
  };

  return (
    <Shell
      bare
      bar={
        <div className="footer">
          <button className="btn primary grow" onClick={() => setSheet("record")}><Icon name="mic" /> Record her</button>
          <button className="btn primary grow" style={{ background: "var(--paper-raised)" }} onClick={() => setSheet("link")}><Icon name="link" /> Link a clip</button>
        </div>
      }
    >
      <div className="page">
        <div className="row">
          <Link to="/" className="icon-btn" aria-label="Back to gallery"><Icon name="back" /></Link>
          <h1 className="h1 grow" style={{ textAlign: "center", fontSize: 24 }}>{p.title || "Untitled"}</h1>
          <button className={`icon-btn${p.favorite ? " sunny" : ""}`} onClick={toggleFav} aria-pressed={p.favorite} aria-label={p.favorite ? "Remove from favorites" : "Add to favorites"}>
            <Icon name="star" fill={p.favorite ? "var(--paper-raised)" : "none"} />
          </button>
        </div>

        <div className="frame"><img src={p.url} alt={p.title || "Painting"} /></div>

        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <span className="sub">{longDay(p.painted_at)}</span>
          {p.tags.map((t) => <span key={t} className="tag">{t}</span>)}
          <button className="link-btn" onClick={() => setEdit(!edit)}>{edit ? "Close" : "Edit details"}</button>
        </div>

        {edit && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="sub">Name<input className="field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What she calls it" /></label>
            <label className="sub">Painted on<input className="field" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label className="sub">Tags (comma separated)<input className="field" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="rainbow, sun" /></label>
            <div className="row between">
              <button className="btn primary" onClick={saveDetails}>Save</button>
              <button className="link-btn" onClick={remove}>Remove painting</button>
            </div>
          </div>
        )}

        <div className="row between" style={{ marginTop: 4 }}>
          <h2 className="h2">What she said</h2>
          <span className="count">{p.clips.length}</span>
        </div>
        {progress && <div className="toast">Uploading {progress.done} of {progress.total}…</div>}
        {p.clips.length === 0 && !progress && (
          <div className="empty"><p>Nothing linked yet. Record her, or link a clip from the Inbox.</p></div>
        )}
        {p.clips.map((c) => (
          <ClipCard key={c.id} clip={c} onChange={load}>
            <button className="link-btn" onClick={() => unlink(c.id)} style={{ alignSelf: "flex-start" }}>Unlink from this painting</button>
          </ClipCard>
        ))}
      </div>

      {sheet === "link" && <LinkSheet painting={p} onClose={() => setSheet(null)} onLinked={() => { setSheet(null); load(); refresh(); }} />}
      {sheet === "record" && (
        <div className="sheet-back" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-label="Record her" onClick={(e) => e.stopPropagation()}>
            <div className="row between">
              <h2 className="h2">Record her</h2>
              <button className="icon-btn" onClick={() => setSheet(null)} aria-label="Close"><Icon name="close" /></button>
            </div>
            <p className="sub">Your phone's recorder opens. When you're done, it lands here, already linked.</p>
            <label className="btn primary block" htmlFor="rec-audio"><Icon name="mic" /> Voice note</label>
            <input id="rec-audio" className="hidden-input" type="file" accept="audio/*" onChange={record} />
            <label className="btn block" htmlFor="rec-video"><Icon name="video" /> Film her</label>
            <input id="rec-video" className="hidden-input" type="file" accept="video/*" capture="user" onChange={record} />
            <label className="btn block" htmlFor="rec-file"><Icon name="gallery" /> Pick a recording I already have</label>
            <input id="rec-file" className="hidden-input" type="file" multiple accept="audio/*,video/*" onChange={record} />
          </div>
        </div>
      )}
    </Shell>
  );
}
