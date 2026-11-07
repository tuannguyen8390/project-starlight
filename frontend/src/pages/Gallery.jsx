import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import Icon from "../components/Icon";
import Shell from "../components/Shell";
import { useStats } from "../stats";
import { dayLabel, monthKey, monthLabel, pluralize } from "../util";

const PAGE_SIZE = 30;

export default function Gallery() {
  const { stats } = useStats();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [items, setItems] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const sentinelRef = useRef(null);

  const currentFilters = { status: "sorted", favorite: filter === "fav", has_voice: filter === "voice", q };

  // Filter/search change: reset to the first page.
  useEffect(() => {
    const t = setTimeout(() => {
      api
        .paintings({ ...currentFilters, limit: PAGE_SIZE, offset: 0 })
        .then((r) => { setItems(r); setHasMore(r.length === PAGE_SIZE); setError(""); })
        .catch((e) => setError(e.message));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [filter, q]);

  // Infinite scroll: fetch the next page once the sentinel enters view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && items) {
        setLoadingMore(true);
        api
          .paintings({ ...currentFilters, limit: PAGE_SIZE, offset: items.length })
          .then((r) => {
            setItems((prev) => [...prev, ...r]);
            setHasMore(r.length === PAGE_SIZE);
          })
          .catch((e) => setError(e.message))
          .finally(() => setLoadingMore(false));
      }
    }, { rootMargin: "400px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [items, hasMore, loadingMore, filter, q]);

  const groups = useMemo(() => {
    const map = new Map();
    (items || []).forEach((p) => {
      const k = monthKey(p.painted_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(p);
    });
    return [...map.entries()];
  }, [items]);

  const inbox = (stats?.inbox_paintings || 0) + (stats?.inbox_clips || 0);

  return (
    <Shell>
      <div className="page">
        <div className="row between">
          <div className="grow">
            <h1 className="h1">Starlight</h1>
            {stats && <p className="sub">{pluralize(stats.paintings, "painting")} · {stats.with_voice} with voice</p>}
          </div>
          <button className="icon-btn" aria-label="Search" onClick={() => { setSearching(!searching); if (searching) setQ(""); }}>
            <Icon name="search" />
          </button>
        </div>

        {searching && (
          <input className="field" autoFocus type="search" placeholder="Search names, tags, or what they said" value={q} onChange={(e) => setQ(e.target.value)} />
        )}

        <div className="chips">
          <button className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
          <button className="chip" aria-pressed={filter === "fav"} onClick={() => setFilter("fav")}>
            <Icon name="star" size={18} fill="var(--sunny)" /> Favorites
          </button>
          <button className="chip" aria-pressed={filter === "voice"} onClick={() => setFilter("voice")}>
            <Icon name="mic" size={18} /> Has voice
          </button>
        </div>

        {inbox > 0 && (
          <Link to="/inbox" className="banner">
            <span className="dot"><Icon name="inbox" size={18} stroke="var(--ink)" /></span>
            <span className="grow">
              <span className="h2" style={{ display: "block", fontSize: 18, lineHeight: "22px" }}>{inbox} new {inbox === 1 ? "thing" : "things"} to sort</span>
              <span className="sub" style={{ display: "block" }}>
                {pluralize(stats.inbox_paintings, "painting")} and {pluralize(stats.inbox_clips, "clip")} waiting
              </span>
            </span>
            <Icon name="next" />
          </Link>
        )}

        {error && <div className="toast">{error}</div>}
        {items && items.length === 0 && (
          <div className="empty">
            <p className="h2">{filter === "all" && !q ? "Your gallery is waiting" : "Nothing here yet"}</p>
            <p>{filter === "all" && !q ? "Tap + to add paintings. They land in the Inbox first." : "Try another filter or search."}</p>
          </div>
        )}

        {groups.map(([key, list]) => (
          <section key={key}>
            <div className="month">
              <h2 className="h2">{monthLabel(key)}</h2>
              <span className="sub">{pluralize(list.length, "painting")}</span>
            </div>
            <div className="masonry" style={{ marginTop: 10 }}>
              {list.map((p) => (
                <Link key={p.id} to={`/painting/${p.id}`} className="art-card">
                  <div className="art">
                    <img src={p.thumb_url} alt={p.title || "Painting"} loading="lazy" />
                    {p.favorite && <span className="badge star"><Icon name="star" size={16} fill="var(--sunny)" stroke="var(--ink)" label="Favorite" /></span>}
                    {p.clip_count > 0 && <span className="badge"><Icon name="mic" size={16} stroke="var(--ink)" label="Has voice" /></span>}
                  </div>
                  <div className="cap">
                    <div className="t">{p.title || "Untitled"}</div>
                    <div className="sub">{dayLabel(p.painted_at)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {items && items.length > 0 && <div ref={sentinelRef} style={{ height: 1 }} />}
        {loadingMore && <p className="sub" style={{ textAlign: "center", padding: "12px 0" }}>Loading more…</p>}
      </div>
    </Shell>
  );
}
