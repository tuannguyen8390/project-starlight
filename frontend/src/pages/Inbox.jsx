import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import ClipCard from "../components/ClipCard";
import Icon from "../components/Icon";
import Shell, { useUploader } from "../components/Shell";
import { useStats } from "../stats";
import { dayLabel } from "../util";

export default function Inbox() {
  const nav = useNavigate();
  const { state } = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "clips" ? "clips" : "paintings";
  const { refresh } = useStats();
  const { run, progress } = useUploader();

  const [paintings, setPaintings] = useState(null);
  const [clips, setClips] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [note, setNote] = useState(state?.summary || "");
  const [dateSheet, setDateSheet] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(() => {
    api.paintings({ status: "inbox" }).then(setPaintings);
    api.clips({ inbox: true }).then(setClips);
    refresh();
  }, [refresh]);
  useEffect(load, [load]);

  const toggle = (id) => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  };
  const upload = async (e) => {
    const files = e.target.files;
    const r = await run(files);
    e.target.value = "";
    if (r) {
      const bits = [`${r.added.length} added`];
      if (r.duplicates.length) bits.push(`${r.duplicates.length} duplicates skipped`);
      if (r.skipped.length) bits.push(`${r.skipped.length} couldn't be read`);
      setNote(bits.join(" · "));
      load();
    }
  };

  const ids = [...picked];
  const allIds = (paintings || []).map((p) => p.id);
  const target = ids.length ? ids : allIds;

  const addToGallery = async () => {
    await api.bulkPaintings({ ids: target, sorted: true });
    setPicked(new Set());
    load();
  };
  const applyDate = async () => {
    await api.bulkPaintings({ ids: target, painted_at: `${date}T12:00:00` });
    setDateSheet(false);
    load();
  };

  const bar =
    tab === "paintings" && paintings && paintings.length > 0 ? (
      <div className="actionbar">
        <div className="row between">
          <span style={{ fontWeight: 800, fontSize: 15 }}>{ids.length ? `${ids.length} selected` : `All ${paintings.length}`}</span>
          <button className="link-btn" onClick={() => setPicked(picked.size === paintings.length ? new Set() : new Set(allIds))}>
            {picked.size === paintings.length ? "Select none" : "Select all"}
          </button>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setDateSheet(true)}>Set date</button>
          <button className="btn" onClick={addToGallery}>Add to gallery</button>
          <button className="btn primary" style={{ flexBasis: "100%" }} onClick={() => nav(`/sort?ids=${target.join(",")}`)}>Sort one by one</button>
        </div>
      </div>
    ) : null;

  return (
    <Shell bar={bar} fab={false}>
      <div className={`page${bar ? " has-bar" : ""}`}>
        <div>
          <h1 className="h1">Inbox</h1>
          <p className="sub">
            {paintings && clips ? `${paintings.length + clips.length} things waiting to be sorted` : "Loading…"}
          </p>
        </div>

        <div className="dropzone">
          <p className="h2">Add lots at once</p>
          <p className="sub" style={{ margin: "4px 0 12px" }}>Paintings, videos and voice notes. Dates are read from the files.</p>
          <div className="row" style={{ gap: 10 }}>
            <label className="btn primary grow" style={{ minHeight: 48, fontSize: 16 }} htmlFor="inbox-photos">Pick from Photos</label>
            <input id="inbox-photos" className="hidden-input" type="file" multiple accept="image/*,video/*" onChange={upload} />
            <label className="btn grow" htmlFor="inbox-files">Choose files</label>
            <input id="inbox-files" className="hidden-input" type="file" multiple accept="image/*,video/*,audio/*,.heic,.m4a,.mov" onChange={upload} />
          </div>
        </div>

        {progress && (
          <div>
            <div className="sub" style={{ fontWeight: 800, color: "var(--ink)", marginBottom: 4 }}>Uploading {progress.done} of {progress.total}…</div>
            <div className="progress"><i style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
          </div>
        )}
        {note && !progress && (
          <div className="row" style={{ gap: 8 }}>
            <span className="tag mint" style={{ padding: 0, width: 28, height: 28, minHeight: 28, justifyContent: "center" }}><Icon name="check" size={14} width={3.5} /></span>
            <span style={{ fontWeight: 800, fontSize: 14 }}>{note}</span>
          </div>
        )}

        <div className="row" style={{ gap: 8 }}>
          <button className="chip grow" style={{ justifyContent: "center" }} aria-pressed={tab === "paintings"} onClick={() => setParams({})}>
            Paintings · {paintings ? paintings.length : "…"}
          </button>
          <button className="chip grow" style={{ justifyContent: "center" }} aria-pressed={tab === "clips"} onClick={() => setParams({ tab: "clips" })}>
            Clips · {clips ? clips.length : "…"}
          </button>
        </div>

        {tab === "paintings" && (
          <>
            {paintings && paintings.length === 0 && <div className="empty"><p className="h2">All sorted</p><p>New paintings you add will wait here.</p></div>}
            <div className="grid3">
              {(paintings || []).map((p) => (
                <button key={p.id} className="tile" aria-pressed={picked.has(p.id)} onClick={() => toggle(p.id)} aria-label={`Painting from ${dayLabel(p.painted_at)}`}>
                  <span className="pic">
                    <img src={p.thumb_url} alt="" loading="lazy" />
                    <span className="check">{picked.has(p.id) && <Icon name="check" size={14} width={3.5} stroke="var(--ink)" />}</span>
                  </span>
                  <span className="lbl">{dayLabel(p.painted_at)}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === "clips" && (
          <>
            {clips && clips.length === 0 && <div className="empty"><p className="h2">No clips waiting</p><p>Voice notes and videos you add will wait here until they're matched.</p></div>}
            {clips && clips.length > 0 && (
              <Link to={`/match/${clips[clips.length - 1].id}`} className="btn primary block">Match them one by one</Link>
            )}
            {(clips || []).map((c) => (
              <ClipCard key={c.id} clip={c} onChange={load}>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <Link to={`/match/${c.id}`} className="btn"><Icon name="link" size={18} /> Match to a painting</Link>
                  <button className="link-btn" onClick={async () => { await api.patchClip(c.id, { dismissed: true }); load(); }}>Keep without a painting</button>
                </div>
              </ClipCard>
            ))}
          </>
        )}
      </div>

      {dateSheet && (
        <div className="sheet-back" onClick={() => setDateSheet(false)}>
          <div className="sheet" role="dialog" aria-label="Set date" onClick={(e) => e.stopPropagation()}>
            <h2 className="h2">Painted on…</h2>
            <p className="sub">Applies to {ids.length ? `${ids.length} selected` : `all ${allIds.length}`}.</p>
            <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <button className="btn primary block" onClick={applyDate}>Set date</button>
          </div>
        </div>
      )}
    </Shell>
  );
}
