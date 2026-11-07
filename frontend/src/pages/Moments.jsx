import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import ClipCard from "../components/ClipCard";
import Shell from "../components/Shell";
import { pluralize } from "../util";

/** Everything she's said, newest first, with the paintings each clip belongs to. */
export default function Moments() {
  const [clips, setClips] = useState(null);
  const [paintings, setPaintings] = useState({});

  const load = useCallback(() => {
    api.clips().then(setClips);
    api.paintings({}).then((list) => setPaintings(Object.fromEntries(list.map((p) => [p.id, p]))));
  }, []);
  useEffect(load, [load]);

  return (
    <Shell>
      <div className="page">
        <div>
          <h1 className="h1">Moments</h1>
          <p className="sub">{clips ? pluralize(clips.length, "clip") : "Loading…"}</p>
        </div>
        {clips && clips.length === 0 && <div className="empty"><p className="h2">No moments yet</p><p>Tap + to add voice notes and videos.</p></div>}
        {(clips || []).map((c) => (
          <ClipCard key={c.id} clip={c} onChange={load}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {c.painting_ids.map((pid) =>
                paintings[pid] ? (
                  <Link key={pid} to={`/painting/${pid}`} aria-label="Open linked painting" style={{ width: 52, height: 52, borderRadius: 12, border: "3px solid var(--ink)", overflow: "hidden", display: "block" }}>
                    <img src={paintings[pid].thumb_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </Link>
                ) : null,
              )}
              {c.painting_ids.length === 0 && <Link to={`/match/${c.id}`} className="btn">Match to a painting</Link>}
            </div>
          </ClipCard>
        ))}
      </div>
    </Shell>
  );
}
