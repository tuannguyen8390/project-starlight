import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import Icon from "../components/Icon";
import Shell from "../components/Shell";
import { useStats } from "../stats";
import { dateInput, withDate } from "../util";

/** One painting at a time: name it, fix the date, star it, move on. */
export default function Sort() {
  const nav = useNavigate();
  const { refresh } = useStats();
  const [params] = useSearchParams();
  const [list, setList] = useState(null);
  const [i, setI] = useState(0);
  const [form, setForm] = useState({ title: "", date: "", tags: "", favorite: false });

  useEffect(() => {
    const wanted = (params.get("ids") || "").split(",").filter(Boolean);
    api.paintings({ status: "inbox" }).then((all) => {
      const only = wanted.length ? all.filter((p) => wanted.includes(p.id)) : all;
      setList([...only].sort((a, b) => a.painted_at.localeCompare(b.painted_at)));
    });
  }, [params]);

  const p = list?.[i];
  useEffect(() => {
    if (p) setForm({ title: p.title, date: dateInput(p.painted_at), tags: p.tags.join(", "), favorite: p.favorite });
  }, [p]);

  const finish = () => { refresh(); nav("/inbox"); };
  const next = () => (i + 1 >= list.length ? finish() : setI(i + 1));
  const save = async () => {
    await api.patchPainting(p.id, {
      title: form.title,
      painted_at: withDate(p.painted_at, form.date),
      tags: form.tags.split(","),
      favorite: form.favorite,
      sorted: true,
    });
    next();
  };

  if (list && list.length === 0) {
    return (
      <Shell bare>
        <div className="page"><div className="empty"><p className="h2">Nothing to sort</p><Link className="btn" to="/inbox">Back to the Inbox</Link></div></div>
      </Shell>
    );
  }
  return (
    <Shell
      bare
      bar={p && (
        <div className="footer col">
          <button className="btn primary block" onClick={save}><Icon name="check" /> Save &amp; next</button>
          <button className="link-btn" style={{ alignSelf: "center" }} onClick={next}>Skip for now</button>
        </div>
      )}
    >
      <div className="page">
        <div className="row">
          <Link to="/inbox" className="icon-btn" aria-label="Back to inbox"><Icon name="back" /></Link>
          <div className="grow">
            <h1 className="h1" style={{ fontSize: 24 }}>Sort paintings</h1>
            <p className="sub">{list ? `Painting ${i + 1} of ${list.length}` : "Loading…"}</p>
          </div>
        </div>
        {p && (
          <>
            <div className="frame"><img src={p.url} alt="Painting to sort" /></div>
            <label className="sub">Name<input className="field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What she calls it" /></label>
            <label className="sub">Painted on<input className="field" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label className="sub">Tags (comma separated)<input className="field" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="rainbow, sun" /></label>
            <button className="chip" aria-pressed={form.favorite} onClick={() => setForm({ ...form, favorite: !form.favorite })} style={{ alignSelf: "flex-start" }}>
              <Icon name="star" size={18} fill={form.favorite ? "var(--sunny)" : "none"} /> Favorite
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}
