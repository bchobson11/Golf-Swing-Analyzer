import { useEffect, useState } from "react";
import { getLibrary, deleteSession, deleteSwing, updateSwingClub } from "../api.js";
import { frameStepKeyDown } from "../frameStep.js";
import { GENERIC_ORDER, clubLabel } from "../clubs.js";
import ClubPicker from "./ClubPicker.jsx";

export default function Library() {
  const [data, setData] = useState({ sessions: [], tags: [] });
  const [view, setView] = useState("flat"); // "flat" | "sessions" | "club"
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
  const onSetClub = async (id, club) => {
    await updateSwingClub(id, club);
    load(tag);
  };

  const sessions = data.sessions;
  const flatSwings = sessions.flatMap((s) =>
    s.swings.map((sw) => ({ ...sw, session: s }))
  );

  // Group flat swings by generic category for the "By club" view.
  const byClub = GENERIC_ORDER.map((generic) => ({
    generic,
    swings: flatSwings.filter(
      (sw) => (sw.club_generic || "Unassigned") === generic
    ),
  })).filter((g) => g.swings.length > 0);

  const cardProps = (sw, fps) => ({
    swing: sw, fps, onDelete: onDeleteSwing, onSetClub,
  });

  return (
    <div className="library">
      <div className="toolbar">
        <div className="seg-control">
          <button className={view === "flat" ? "active" : ""} onClick={() => setView("flat")}>All swings</button>
          <button className={view === "sessions" ? "active" : ""} onClick={() => setView("sessions")}>By session</button>
          <button className={view === "club" ? "active" : ""} onClick={() => setView("club")}>By club</button>
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
            <SwingCard key={sw.id} {...cardProps(sw, sw.session.fps)} subtitle={sw.session.name} />
          ))}
        </div>
      ) : view === "club" ? (
        byClub.map((group) => (
          <section key={group.generic} className="session-block">
            <div className="session-head">
              <h2>{group.generic} <span className="muted small">· {group.swings.length}</span></h2>
            </div>
            <div className="clip-grid">
              {group.swings.map((sw) => (
                <SwingCard key={sw.id} {...cardProps(sw, sw.session.fps)} subtitle={sw.session.name} />
              ))}
            </div>
          </section>
        ))
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
                <SwingCard key={sw.id} {...cardProps(sw, s.fps)} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function SwingCard({ swing, fps, subtitle, onDelete, onSetClub }) {
  const label = clubLabel(swing);
  return (
    <div className="clip-card">
      <div className="clip-head">
        <h3>Swing {swing.index + 1}{label && <span className="club-badge">{label}</span>}</h3>
        {subtitle && <span className="muted small">{subtitle}</span>}
      </div>
      <video
        src={swing.url}
        controls
        tabIndex={0}
        className="clip-player"
        preload="metadata"
        title="Click, then ← / → to step one frame (Shift for 10)"
        onKeyDown={(e) => frameStepKeyDown(e, e.currentTarget, fps)}
      />
      <div className="clip-actions">
        <ClubPicker club={swing} onChange={(c) => onSetClub(swing.id, c)} />
        <a className="download" href={swing.url} download={`swing-${swing.index + 1}.mp4`}>⤓</a>
        <button className="del tiny" onClick={() => onDelete(swing.id)}>Delete</button>
      </div>
    </div>
  );
}
