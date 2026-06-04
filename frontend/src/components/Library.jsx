import { useEffect, useRef, useState } from "react";
import { GENERIC_ORDER, clubLabel } from "../clubs.js";
import { filterSessions } from "../libraryOrder.js";
import { BADGE_DEFS, DEFAULT_BADGES } from "../badges.js";

// Presentational: filtering/grouping driven by props from App + Sidebar.
export default function Library({ data, view, tagFilter, clubFilter, resultFilters = {}, onOpen, onEditSession }) {
  const sessions = filterSessions(data, { tag: tagFilter, club: clubFilter, results: resultFilters });

  // Which badges to show on cards (persisted).
  const [badges, setBadges] = useState(() => {
    try { return { ...DEFAULT_BADGES, ...JSON.parse(localStorage.getItem("badgeConfig") || "{}") }; }
    catch { return DEFAULT_BADGES; }
  });
  const [badgeMenu, setBadgeMenu] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => { localStorage.setItem("badgeConfig", JSON.stringify(badges)); }, [badges]);
  useEffect(() => {
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setBadgeMenu(false); };
    if (badgeMenu) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [badgeMenu]);
  const toggleBadge = (key) => setBadges((b) => ({ ...b, [key]: !b[key] }));

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
        <div className="head-right">
          <span className="sub">
            {flatSwings.length} swing{flatSwings.length === 1 ? "" : "s"}
            {filterNote && ` · ${filterNote}`}
          </span>
          <div className="badge-menu-wrap" ref={menuRef}>
            <button className={badgeMenu ? "active" : ""} onClick={() => setBadgeMenu((o) => !o)}>Badges ▾</button>
            {badgeMenu && (
              <div className="badge-menu">
                <div className="badge-menu-head">Show on cards</div>
                {BADGE_DEFS.map((b) => (
                  <label key={b.key}>
                    <input type="checkbox" checked={!!badges[b.key]} onChange={() => toggleBadge(b.key)} />
                    <span className="badge-dot" style={{ background: b.color }} />
                    {b.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
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
            <SwingCard key={sw.id} swing={sw} session={sw.session} subtitle={sw.session.name} badges={badges} onOpen={onOpen} />
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
                <SwingCard key={sw.id} swing={sw} session={sw.session} subtitle={sw.session.name} badges={badges} onOpen={onOpen} />
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
                <SwingCard key={sw.id} swing={sw} session={s} badges={badges} onOpen={onOpen} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function cardBadges(swing, badges) {
  const out = [];
  for (const def of BADGE_DEFS) {
    if (!badges[def.key]) continue;
    if (def.key === "club") {
      const v = clubLabel(swing);
      if (v) out.push({ color: def.color, text: v });
    } else if (def.key === "tags") {
      (swing.tags || []).forEach((t) => out.push({ color: def.color, text: "#" + t }));
    } else if (def.key === "notes") {
      if (swing.notes) out.push({ color: def.color, icon: "📝" });
    } else {
      const v = swing[def.key];
      if (v) out.push({ color: def.color, text: v });
    }
  }
  return out;
}

function SwingCard({ swing, session, subtitle, badges = {}, onOpen }) {
  const title = swing.name?.trim() || `Swing ${swing.index + 1}`;
  const vidRef = useRef(null);
  const items = cardBadges(swing, badges);
  return (
    <div className="clip-card clickable" onClick={() => onOpen(swing, session)}>
      <div className="clip-head">
        <h3>{title}</h3>
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
        {items.length > 0 && (
          <div className="badge-stack">
            {items.map((b, i) => (
              <span key={i} className="card-badge"
                style={{ color: b.color, borderColor: b.color }}>
                {b.icon || b.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
