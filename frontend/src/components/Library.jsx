import { deleteSession, deleteSwing, updateSwingClub } from "../api.js";
import { frameStepKeyDown } from "../frameStep.js";
import { GENERIC_ORDER, clubLabel } from "../clubs.js";
import ClubPicker from "./ClubPicker.jsx";

// Presentational: filtering/grouping driven by props from App + Sidebar.
export default function Library({ data, view, tagFilter, clubFilter, refresh }) {
  const onDeleteSwing = async (id) => { await deleteSwing(id); refresh(); };
  const onDeleteSession = async (id) => {
    if (!confirm("Delete this whole session and all its swings?")) return;
    await deleteSession(id); refresh();
  };
  const onSetClub = async (id, club) => { await updateSwingClub(id, club); refresh(); };

  // Tag filter applies to sessions; club filter applies to swings.
  const sessions = (data.sessions || [])
    .filter((s) => !tagFilter || s.tags.includes(tagFilter))
    .map((s) => ({
      ...s,
      swings: s.swings.filter((sw) => !clubFilter || (sw.club_generic || "Unassigned") === clubFilter),
    }))
    .filter((s) => s.swings.length > 0);

  const flatSwings = sessions.flatMap((s) => s.swings.map((sw) => ({ ...sw, session: s })));

  const filterNote = [
    tagFilter && `#${tagFilter}`,
    clubFilter && clubFilter,
  ].filter(Boolean).join(" · ");

  const heading = { flat: "All swings", sessions: "By session", club: "By club" }[view];

  const cardProps = (sw, fps) => ({ swing: sw, fps, onDelete: onDeleteSwing, onSetClub });

  const byClub = GENERIC_ORDER
    .map((generic) => ({ generic, swings: flatSwings.filter((sw) => (sw.club_generic || "Unassigned") === generic) }))
    .filter((g) => g.swings.length > 0);

  return (
    <div className="library">
      <div className="content-head">
        <h1>{heading}</h1>
        <span className="sub">
          {flatSwings.length} swing{flatSwings.length === 1 ? "" : "s"}
          {filterNote && ` · ${filterNote}`}
        </span>
      </div>

      {(data.sessions || []).length === 0 ? (
        <div className="empty">
          <p className="big">No swings saved yet</p>
          <p className="muted">Upload a video to detect and save your swings.</p>
        </div>
      ) : flatSwings.length === 0 ? (
        <div className="empty">
          <p className="big">No swings match this filter</p>
          <p className="muted">Try clearing the tag or club filter.</p>
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
            <div className="group-rule">
              <h2>{group.generic}</h2>
              <span className="muted small">{group.swings.length}</span>
              <span className="line" />
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
        <a className="download" href={swing.url} download={`swing-${swing.index + 1}.mp4`} title="Export / download">⤓</a>
        <button className="del tiny" onClick={() => onDelete(swing.id)}>Delete</button>
      </div>
    </div>
  );
}
