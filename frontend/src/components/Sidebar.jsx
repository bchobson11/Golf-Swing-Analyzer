import { GENERIC_ORDER } from "../clubs.js";

const VIEWS = [
  { key: "flat", label: "All swings" },
  { key: "sessions", label: "By session" },
  { key: "club", label: "By club" },
];

export default function Sidebar({
  data, view, setView, tagFilter, setTagFilter,
  clubFilter, setClubFilter, onUpload, onHome, goLibrary,
}) {
  const sessions = data.sessions || [];
  const swingCount = sessions.reduce((n, s) => n + s.swings.length, 0);

  // Counts for filters, derived from current data.
  const tagCounts = {};
  sessions.forEach((s) => s.tags.forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + s.swings.length; }));
  const clubCounts = {};
  sessions.forEach((s) => s.swings.forEach((sw) => {
    const g = sw.club_generic || "Unassigned";
    clubCounts[g] = (clubCounts[g] || 0) + 1;
  }));
  const clubsPresent = GENERIC_ORDER.filter((g) => clubCounts[g]);

  const pick = (fn) => () => { fn(); goLibrary(); };

  return (
    <aside className="sidebar">
      <div className="brand" onClick={onHome}>
        <span className="dot">⛳</span> Swing Library
      </div>

      <div className="stats">
        <div className="stat"><div className="num">{swingCount}</div><div className="lbl">Swings</div></div>
        <div className="stat"><div className="num">{sessions.length}</div><div className="lbl">Sessions</div></div>
      </div>

      <button className="primary upload-btn" onClick={onUpload}>+ Upload video</button>

      <div className="side-section">
        <div className="heading">View</div>
        {VIEWS.map((v) => (
          <button key={v.key} className={`nav-item ${view === v.key ? "active" : ""}`} onClick={pick(() => setView(v.key))}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="side-section">
        <div className="heading">Tags</div>
        <button className={`nav-item ${!tagFilter ? "active" : ""}`} onClick={pick(() => setTagFilter(null))}>
          All tags
        </button>
        {Object.keys(tagCounts).sort().map((t) => (
          <button key={t} className={`nav-item ${tagFilter === t ? "active" : ""}`} onClick={pick(() => setTagFilter(t))}>
            <span>#{t}</span><span className="badge">{tagCounts[t]}</span>
          </button>
        ))}
      </div>

      <div className="side-section">
        <div className="heading">Clubs</div>
        <button className={`nav-item ${!clubFilter ? "active" : ""}`} onClick={pick(() => setClubFilter(null))}>
          All clubs
        </button>
        {clubsPresent.map((g) => (
          <button key={g} className={`nav-item ${clubFilter === g ? "active" : ""}`} onClick={pick(() => setClubFilter(g))}>
            <span>{g}</span><span className="badge">{clubCounts[g]}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
