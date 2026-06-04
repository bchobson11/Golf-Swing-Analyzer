import { useState } from "react";
import { createTag } from "../api.js";

// Editor for a swing's tags: chips with remove, a dropdown to add an existing
// tag, and a "Create new tag" flow. `value` is an array of tag names.
// `allTags` is the canonical list [{id, name}]. onChange(nextNames).
// onCreated() lets the parent refresh the canonical list after a tag is made.
export default function TagPicker({ value, allTags = [], onChange, onCreated }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const available = allTags.map((t) => t.name).filter((n) => !value.includes(n));

  const onSelect = (e) => {
    const v = e.target.value;
    e.target.value = "";
    if (v === "__create__") setCreating(true);
    else if (v) onChange([...value, v]);
  };

  const confirmCreate = async () => {
    const n = newName.trim();
    if (n) {
      try { await createTag(n); } catch { /* may already exist */ }
      if (!value.includes(n)) onChange([...value, n]);
      onCreated?.();
    }
    setNewName("");
    setCreating(false);
  };

  return (
    <div className="tag-edit">
      {value.map((t) => (
        <span key={t} className="tag-chip">
          #{t}<button className="x" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`remove ${t}`}>×</button>
        </span>
      ))}
      {creating ? (
        <span className="tag-create">
          <input
            className="tag-input"
            autoFocus
            value={newName}
            placeholder="new tag name"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); confirmCreate(); }
              if (e.key === "Escape") { setNewName(""); setCreating(false); }
            }}
          />
          <button className="tiny" onClick={confirmCreate} disabled={!newName.trim()}>Create</button>
          <button className="tiny" onClick={() => { setNewName(""); setCreating(false); }}>Cancel</button>
        </span>
      ) : (
        <select className="tag-add-select" value="" onChange={onSelect}>
          <option value="">+ Add tag…</option>
          {available.map((n) => <option key={n} value={n}>#{n}</option>)}
          <option value="__create__">＋ Create new tag…</option>
        </select>
      )}
    </div>
  );
}
