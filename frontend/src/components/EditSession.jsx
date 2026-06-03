import { useState } from "react";
import { updateSession, retagSession, deleteSession } from "../api.js";

// Edit-session page: rename, redate, bulk-retag (applies tags to every swing),
// and delete the session.
export default function EditSession({ session, onClose, onChanged }) {
  const [name, setName] = useState(session.name || "");
  const [date, setDate] = useState(session.recorded_date || "");
  const startTags = [...new Set(session.swings.flatMap((sw) => sw.tags || []))];
  const [tags, setTags] = useState(startTags);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const addTag = () => {
    const t = newTag.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setNewTag("");
  };
  const removeTag = (t) => setTags(tags.filter((x) => x !== t));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateSession(session.id, { name: name.trim() || session.name, recorded_date: date || null });
      await retagSession(session.id, tags);
      onChanged();
      onClose();
    } catch (e) {
      setError(e.message || String(e));
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this whole session and all its swings?")) return;
    await deleteSession(session.id);
    onChanged();
    onClose();
  }

  return (
    <div className="detail-page edit-session">
      <div className="detail-head">
        <button className="back" onClick={onClose}>← Library</button>
        <h1>Edit session</h1>
      </div>

      <div className="card">
        <div className="form">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Date recorded
            <input type="date" value={date || ""} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        <div className="info-tags" style={{ borderTop: "none", paddingTop: 0 }}>
          <span className="k">Tags <span className="muted small">· applied to every swing in this session</span></span>
          <div className="tag-edit">
            {tags.map((t) => (
              <span key={t} className="tag-chip">
                #{t}<button className="x" onClick={() => removeTag(t)} aria-label={`remove ${t}`}>×</button>
              </span>
            ))}
            <input
              className="tag-input"
              value={newTag}
              placeholder="add tag…"
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            />
            <button className="tiny" onClick={addTag} disabled={!newTag.trim()}>Add</button>
          </div>
        </div>

        {error && <p className="error">⚠ {error}</p>}

        <div className="info-actions" style={{ marginTop: 18 }}>
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button onClick={onClose}>Cancel</button>
          <button className="del" style={{ marginLeft: "auto" }} onClick={remove}>Delete session</button>
        </div>
        <p className="muted small">Retagging replaces the tags on all {session.swings.length} swings in this session.</p>
      </div>
    </div>
  );
}
