import { useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { summary, uploadFiles } from "../api";
import { useStats } from "../stats";
import Icon from "./Icon";

function Tab({ to, icon, label, count, end }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `tab${isActive ? " on" : ""}`}>
      <span className="pill">
        <Icon name={icon} size={24} />
        {count > 0 && <span className="n" aria-label={`${count} waiting`}>{count}</span>}
      </span>
      {label}
    </NavLink>
  );
}

/** Picks files, uploads them in batches, then lands in the Inbox with a summary. */
export function useUploader() {
  const nav = useNavigate();
  const { refresh } = useStats();
  const [progress, setProgress] = useState(null);

  const run = async (files) => {
    if (!files || !files.length) return null;
    setProgress({ done: 0, total: files.length });
    const result = await uploadFiles(files, (done, total) => setProgress({ done, total }));
    setProgress(null);
    refresh();
    return result;
  };
  const toInbox = async (files) => {
    const r = await run(files);
    if (r) nav("/inbox", { state: { summary: summary(r), at: Date.now() } });
  };
  return { progress, run, toInbox };
}

function AddSheet({ onClose }) {
  const { toInbox } = useUploader();
  const pick = async (e) => {
    const files = e.target.files;
    onClose();
    await toInbox(files);
    e.target.value = "";
  };
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Add" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2 className="h2">Add to the gallery</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <p className="sub">Pick as many as you like. Dates are read from the files, then everything waits in the Inbox.</p>
        <label className="btn primary block" htmlFor="add-lib"><Icon name="gallery" /> Paintings, videos &amp; voice notes</label>
        <input id="add-lib" className="hidden-input" type="file" multiple accept="image/*,video/*,audio/*" onChange={pick} />
        <label className="btn block" htmlFor="add-photo"><Icon name="camera" /> Take a photo of a painting</label>
        <input id="add-photo" className="hidden-input" type="file" accept="image/*" capture="environment" onChange={pick} />
        <label className="btn block" htmlFor="add-film"><Icon name="video" /> Film her</label>
        <input id="add-film" className="hidden-input" type="file" accept="video/*" capture="user" onChange={pick} />
      </div>
    </div>
  );
}

export default function Shell({ children, bar, bare = false, fab = true }) {
  const { stats } = useStats();
  const [open, setOpen] = useState(false);
  const inboxCount = (stats?.inbox_paintings || 0) + (stats?.inbox_clips || 0);
  return (
    <div className="shell">
      {children}
      {bar}
      {!bare && (
        <>
          {fab && (
            <button className="fab" aria-label="Add paintings or clips" onClick={() => setOpen(true)}>
              <Icon name="plus" size={28} width={3} stroke="var(--ink)" />
            </button>
          )}
          <nav className="tabs" aria-label="Main">
            <Tab to="/" end icon="gallery" label="Gallery" />
            <Tab to="/moments" icon="mic" label="Moments" />
            <Tab to="/inbox" icon="inbox" label="Inbox" count={inboxCount} />
          </nav>
          {open && <AddSheet onClose={() => setOpen(false)} />}
        </>
      )}
    </div>
  );
}
