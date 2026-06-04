import { useRef } from "react";
import { GENERIC_ORDER, clubLabel } from "../clubs.js";
import { filterSessions } from "../libraryOrder.js";

// Presentational: filtering/grouping driven by props from App + Sidebar.
export default function Library({ data, view, tagFilter, clubFilter, resultFilters = {}, onOpen, onEditSession }) {
  const sessions = filterSessions(data, { tag: tagFilter, club: clubFilter, results: resultFilters });

  const flatSwings = sessions.flatMap((s) => s.swings.map((sw) => ({ ...sw, session: s })));

  const filterNote = [
    tagFilter && `#${tagFilter}`,
    clubFilter,
    ...Object.values(resultFilters).filter(Boolean),
  ].filter(Boolean).join(" · ");

  const heading = { flat: "All swings", sessions: "By session", club: "By club" }[view];

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
            <SwingCard key={sw.id} swing={sw} session={sw.session} subtitle={sw.session.name} onOpen={onOpen} />
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
                <SwingCard key={sw.id} swing={sw} session={sw.session} subtitle={sw.session.name} onOpen={onOpen} />
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
                  {s.allTags.length > 0 && " · " + s.allTags.map((t) => "#" + t).join(" ")}
                </p>
              </div>
              <button onClick={() => onEditSession(s)}>Edit session</button>
            </div>
            <div className="clip-grid">
              {s.swings.map((sw) => (
                <SwingCard key={sw.id} swing={sw} session={s} onOpen={onOpen} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function SwingCard({ swing, session, subtitle, onOpen }) {
  const label = clubLabel(swing);
  const tags = swing.tags || [];
  const vidRef = useRef(null);
  return (
    <div className="clip-card clickable" onClick={() => onOpen(swing, session)}>
      <div className="clip-head">
        <h3>Swing {swing.index + 1}{label && <span className="club-badge">{label}</span>}</h3>
        {subtitle && <span className="muted small">{subtitle}</span>}
      </div>
      <div className="clip-thumb">
        <video
          ref={vidRef}
          src={swing.url}
          muted
          playsInline
          preload="metadata"
          className="clip-player"
          onMouseEnter={() => vidRef.current?.play().catch(() => {})}
          onMouseLeave={() => { const v = vidRef.current; if (v) { v.pause(); v.currentTime = 0; } }}
        />
        <span className="play-badge">▶ Analyze</span>
      </div>
      {(tags.length > 0 || swing.notes) && (
        <div className="card-meta">
          {tags.map((t) => <span key={t} className="mini-tag">#{t}</span>)}
          {swing.notes && <span className="note-dot" title="Has notes">📝</span>}
        </div>
      )}
    </div>
  );
}
