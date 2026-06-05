import { useState } from "react";
import { useAuth } from "../auth.jsx";
import { updateMe } from "../api.js";

function Avatar({ user, size = 64 }) {
  if (user.picture) {
    return <img className="avatar" src={user.picture} alt="" width={size} height={size} referrerPolicy="no-referrer" />;
  }
  const initial = (user.name || user.email || "?").trim()[0]?.toUpperCase() || "?";
  return <div className="avatar avatar-fallback" style={{ width: size, height: size }}>{initial}</div>;
}

export default function Profile({ onClose }) {
  const { user, setUser, signOut } = useAuth();
  const [name, setName] = useState(user.name || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true); setSaved(false);
    try { const u = await updateMe(name.trim() || user.name); setUser(u); setSaved(true); }
    finally { setSaving(false); }
  };

  return (
    <div className="detail-page profile-page">
      <div className="detail-head">
        <button className="back" onClick={onClose}>← Library</button>
        <h1>Profile</h1>
      </div>

      <div className="card profile-card">
        <div className="profile-head">
          <Avatar user={user} />
          <div>
            <div className="profile-name">{user.name}</div>
            <div className="muted small">{user.email}</div>
          </div>
        </div>

        <div className="form">
          <label>
            Display name
            <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
          </label>
        </div>

        <div className="info-actions">
          <button className="primary" onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="muted small">Saved ✓</span>}
          <button className="del" style={{ marginLeft: "auto" }} onClick={signOut}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
