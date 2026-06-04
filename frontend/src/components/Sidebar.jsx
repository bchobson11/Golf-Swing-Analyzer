import { useState } from "react";
import { GENERIC_ORDER } from "../clubs.js";
import { RESULT_FIELDS } from "../results.js";
import { createTag, renameTag, deleteTag } from "../api.js";

const VIEWS = [
  { key: "flat", label: "All swings" },
  { key: "sessions", label: "By session" },
  { key: "club", label: "By club" },
];

export default function Sidebar({
  data, view, setView, tagFilter, setTagFilter,
  clubFilter, setClubFilter, resultFilters = {}, setResultFilter,
  refresh, onUpload, onHome, goLibrary,
}) {
  const sessions = data.sessions || [];
  const swingCount = sessions.reduce((n, s) => n + s.swings.length, 0);
  const [open, setOpen] = useState({});

  // Counts from current data.
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

  // Generic (non-tag) filter categories.
  const genericCats = [
    {
      key: "club", label: "Club", active: clubFilter, set: setClubFilter,
      options: GENERIC_ORDER.filter((g) => clubCounts[g]).map((g) => ({ value: g, count: clubCounts[g] })),
    },
    ...RESULT_FIELDS.map((f) => ({
      key: f.key, label: f.label, active: resultFilters[f.key], set: (v) => setResultFilter(f.key, v),
      options: f.options.filter((o) => resultCounts[f.key][o]).map((o) => ({ value: o, count: resultCounts[f.key][o] })),
    })),
  ].filter((c) => c.options.length > 0);

  const tagItems = (data.tags || []).map((t) => ({ id: t.id, name: t.name, count: tagCounts[t.name] || 0 }));

  const activeCount = (clubFilter ? 1 : 0) + (tagFilter ? 1 : 0)
    + RESULT_FIELDS.filter((f) => resultFilters[f.key]).length;
  const clearAll = () => {
    setClubFilter(null); setTagFilter(null);
    RESULT_FIELDS.forEach((f) => setResultFilter(f.key, null));
    goLibrary();
  };

  const pickView = (key) => { setView(key); goLibrary(); };
  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));
  const collapse = (key) => setOpen((o) => ({ ...o, [key]: false }));

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

      <div className="side-section">
        <div className="heading filters-heading">
          <span>Filters{activeCount > 0 ? ` · ${activeCount}` : ""}</span>
          {activeCount > 0 && <button className="link clear-filters" onClick={clearAll}>Clear</button>}
        </div>

        {genericCats.filter((c) => c.key === "club").map((cat) => (
          <FilterSection key={cat.key} cat={cat} isOpen={!!open[cat.key]}
            onToggle={() => toggle(cat.key)}
            onChoose={(v) => { cat.set(v); collapse(cat.key); goLibrary(); }} />
        ))}

        <TagFilterSection
          items={tagItems} active={tagFilter} isOpen={!!open.tags}
          onToggle={() => toggle("tags")}
          onPick={(v) => { setTagFilter(v); collapse("tags"); goLibrary(); }}
          setActive={setTagFilter} refresh={refresh} />

        {genericCats.filter((c) => c.key !== "club").map((cat) => (
          <FilterSection key={cat.key} cat={cat} isOpen={!!open[cat.key]}
            onToggle={() => toggle(cat.key)}
            onChoose={(v) => { cat.set(v); collapse(cat.key); goLibrary(); }} />
        ))}
      </div>
    </aside>
  );
}

function FilterHeader({ label, active, isOpen, onToggle }) {
  return (
    <button className={`filter-head ${active ? "has-active" : ""}`} onClick={onToggle}>
      <span className="caret">{isOpen ? "▾" : "▸"}</span>
      <span className="filter-label">{label}</span>
      {active && <span className="filter-active">{active}</span>}
    </button>
  );
}

function FilterSection({ cat, isOpen, onToggle, onChoose }) {
  const activeLabel = cat.active
    ? (cat.options.find((o) => o.value === cat.active)?.label || cat.active) : null;
  return (
    <div className="filter-cat">
      <FilterHeader label={cat.label} active={activeLabel} isOpen={isOpen} onToggle={onToggle} />
      {isOpen && (
        <div className="filter-opts">
          <button className={`nav-item ${!cat.active ? "active" : ""}`} onClick={() => onChoose(null)}>All</button>
          {cat.options.map((o) => (
            <button key={o.value} className={`nav-item ${cat.active === o.value ? "active" : ""}`} onClick={() => onChoose(o.value)}>
              <span>{o.label || o.value}</span><span className="badge">{o.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TagFilterSection({ items, active, isOpen, onToggle, onPick, setActive, refresh }) {
  const [edit, setEdit] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const doCreate = async () => {
    const n = newName.trim();
    if (n) { try { await createTag(n); } catch { /* exists */ } refresh?.(); }
    setNewName(""); setCreating(false);
  };
  const doRename = async (t, val) => {
    const v = val.trim();
    if (v && v !== t.name) {
      await renameTag(t.id, v);
      if (active === t.name) setActive(v);
      refresh?.();
    }
  };
  const doDelete = async (t) => {
    if (!confirm(`Delete tag #${t.name}? It will be removed from all swings.`)) return;
    await deleteTag(t.id);
    if (active === t.name) setActive(null);
    refresh?.();
  };

  return (
    <div className="filter-cat">
      <FilterHeader label="Tags" active={active ? "#" + active : null} isOpen={isOpen} onToggle={onToggle} />
      {isOpen && (
        <div className="filter-opts">
          <div className="tag-filter-bar">
            <button className="link tiny" onClick={() => setCreating(true)}>+ New tag</button>
            {items.length > 0 && <button className="link tiny" onClick={() => setEdit((e) => !e)}>{edit ? "Done" : "Edit"}</button>}
          </div>
          {creating && (
            <div className="tag-edit-row">
              <input className="tag-input" autoFocus value={newName} placeholder="new tag name"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doCreate(); if (e.key === "Escape") { setNewName(""); setCreating(false); } }} />
              <button className="tiny" onClick={doCreate} disabled={!newName.trim()}>Add</button>
            </div>
          )}
          {!edit && (
            <button className={`nav-item ${!active ? "active" : ""}`} onClick={() => onPick(null)}>All</button>
          )}
          {items.map((t) => edit ? (
            <div className="tag-edit-row" key={t.id}>
              <input className="tag-input" defaultValue={t.name}
                onBlur={(e) => doRename(t, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.value = t.name; e.currentTarget.blur(); } }} />
              <button className="del tiny" onClick={() => doDelete(t)} aria-label={`delete ${t.name}`}>×</button>
            </div>
          ) : (
            <button key={t.id} className={`nav-item ${active === t.name ? "active" : ""}`} onClick={() => onPick(t.name)}>
              <span>#{t.name}</span><span className="badge">{t.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
