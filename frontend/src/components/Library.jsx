import { useEffect, useState } from "react";
import { getLibrary, deleteSession, deleteSwing } from "../api.js";

export default function Library() {
  const [data, setData] = useState({ sessions: [], tags: [] });
  const [view, setView] = useState("flat"); // "flat" | "sessions"
  const [tag, setTag] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async (t) => {
    setLoading(true);
    try {
      setData(await getLibrary(t));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(tag); }, [tag]);

  const onDeleteSwing = async (id) => {
    await deleteSwing(id);
    load(tag);
  };
  const onDeleteSession = async (id) => {
    if (!confirm("Delete this whole session and all its swings?")) return;
    await deleteSession(id);
    load(tag);
  };

  const sessions = data.sessions;
  const flatSwings = sessions.flatMap((s) =>
    s.swings.map((sw) => ({ ...sw, session: s }))
  );

  return (
    <div className="library">
      <div className="toolbar">
        <div className="seg-control">
          <button className={view === "flat" ? "active" : ""} onClick={() => setView("flat")}>All swings</button>
          <button className={view === "sessions" ? "active" : ""} onClick={() => setView("sessions")}>By session</button>
        </div>
        {data.tags.length > 0 && (
          <div className="tag-filter">
            <button className={!tag ? "active" : ""} onClick={() => setTag(null)}>All</button>
            {data.tags.map((t) => (
              <button key={t} className={tag === t ? "active" : ""} onClick={() => setTag(t)}>#{t}</button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : sessions.length === 0 ? (
        <div className="empty">
          <p className="big">No swings saved yet</p>
          <p className="muted">Upload a video to detect and save your swings.</p>
        </div>
      ) : view === "flat" ? (
        <div className="clip-grid">
          {flatSwings.map((sw) => (
            <SwingCard key={sw.id} swing={sw} subtitle={sw.session.name} onDelete={onDeleteSwing} />
          ))}
        </div>
      ) : (
        sessions.map((s) => (
          <section key={s.id} className="session-block">
            <div className="session-head">
              <div>
                <h2>{s.name}</h2>
                <p className="muted">
                  {s.recorded_date || "—"} · {s.swings.length} swings
                  {s.tags.length > 0 && " · " + s.tags.map((t) => "#" + t).join(" ")}
                </p>
              </div>
              <button className="del" onClick={() => onDeleteSession(s.id)}>Delete session</button>
            </div>
            <div className="clip-grid">
              {s.swings.map((sw) => (
                <SwingCard key={sw.id} swing={sw} onDelete={onDeleteSwing} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function SwingCard({ swing, subtitle, onDelete }) {
  return (
    <div className="clip-card">
      <div className="clip-head">
        <h3>Swing {swing.index + 1}</h3>
        {subtitle && <span className="muted small">{subtitle}</span>}
      </div>
      <video src={swing.url} controls className="clip-player" preload="metadata" />
      <div className="clip-actions">
        <a className="download" href={swing.url} download={`swing-${swing.index + 1}.mp4`}>⤓ Export</a>
        <button className="del tiny" onClick={() => onDelete(swing.id)}>Delete</button>
      </div>
    </div>
  );
}
