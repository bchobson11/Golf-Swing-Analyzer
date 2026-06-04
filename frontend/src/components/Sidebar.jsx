import { useState } from "react";
import { GENERIC_ORDER } from "../clubs.js";
import { RESULT_FIELDS } from "../results.js";

const VIEWS = [
  { key: "flat", label: "All swings" },
  { key: "sessions", label: "By session" },
  { key: "club", label: "By club" },
];

export default function Sidebar({
  data, view, setView, tagFilter, setTagFilter,
  clubFilter, setClubFilter, resultFilters = {}, setResultFilter,
  onUpload, onHome, goLibrary,
}) {
  const sessions = data.sessions || [];
  const swingCount = sessions.reduce((n, s) => n + s.swings.length, 0);
  const [open, setOpen] = useState({});

  // Counts for filters, derived from current data.
  const tagCounts = {};
  sessions.forEach((s) => s.swings.forEach((sw) =>
    (sw.tags || []).forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; })));
  const clubCounts = {};
  sessions.forEach((s) => s.swings.forEach((sw) => {
    const g = sw.club_generic || "Unassigned";
    clubCounts[g] = (clubCounts[g] || 0) + 1;
  }));
  const resultCounts = {};
  RESULT_FIELDS.forEach((f) => { resultCounts[f.key] = {}; });
  sessions.forEach((s) => s.swings.forEach((sw) =>
    RESULT_FIELDS.forEach((f) => {
      const v = sw[f.key];
      if (v) resultCounts[f.key][v] = (resultCounts[f.key][v] || 0) + 1;
    })));

  // Unified filter categories (only those with values present).
  const categories = [
    {
      key: "club", label: "Club", active: clubFilter, set: setClubFilter,
      options: GENERIC_ORDER.filter((g) => clubCounts[g]).map((g) => ({ value: g, count: clubCounts[g] })),
    },
    {
      key: "tags", label: "Tags", active: tagFilter, set: setTagFilter,
      options: Object.keys(tagCounts).sort().map((t) => ({ value: t, label: "#" + t, count: tagCounts[t] })),
    },
    ...RESULT_FIELDS.map((f) => ({
      key: f.key, label: f.label, active: resultFilters[f.key], set: (v) => setResultFilter(f.key, v),
      options: f.options.filter((o) => resultCounts[f.key][o]).map((o) => ({ value: o, count: resultCounts[f.key][o] })),
    })),
  ].filter((c) => c.options.length > 0);

  const activeCount = categories.filter((c) => c.active).length;
  const clearAll = () => { categories.forEach((c) => c.set(null)); goLibrary(); };

  const pickView = (key) => { setView(key); goLibrary(); };
  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));
  const choose = (cat, value) => { cat.set(value); setOpen((o) => ({ ...o, [cat.key]: false })); goLibrary(); };

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
          <button key={v.key} className={`nav-item ${view === v.key ? "active" : ""}`} onClick={() => pickView(v.key)}>
            {v.label}
          </button>
        ))}
      </div>

      {categories.length > 0 && (
        <div className="side-section">
          <div className="heading filters-heading">
            <span>Filters{activeCount > 0 ? ` · ${activeCount}` : ""}</span>
            {activeCount > 0 && <button className="link clear-filters" onClick={clearAll}>Clear</button>}
          </div>
          {categories.map((cat) => {
            const activeLabel = cat.active
              ? (cat.options.find((o) => o.value === cat.active)?.label || cat.active)
              : null;
            const isOpen = !!open[cat.key];
            return (
              <div className="filter-cat" key={cat.key}>
                <button className={`filter-head ${cat.active ? "has-active" : ""}`} onClick={() => toggle(cat.key)}>
                  <span className="caret">{isOpen ? "▾" : "▸"}</span>
                  <span className="filter-label">{cat.label}</span>
                  {activeLabel && <span className="filter-active">{activeLabel}</span>}
                </button>
                {isOpen && (
                  <div className="filter-opts">
                    <button className={`nav-item ${!cat.active ? "active" : ""}`} onClick={() => choose(cat, null)}>All</button>
                    {cat.options.map((o) => (
                      <button key={o.value} className={`nav-item ${cat.active === o.value ? "active" : ""}`} onClick={() => choose(cat, o.value)}>
                        <span>{o.label || o.value}</span><span className="badge">{o.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
