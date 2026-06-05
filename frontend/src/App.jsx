import { useCallback, useEffect, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import Uploader from "./components/Uploader.jsx";
import ReviewTimeline from "./components/ReviewTimeline.jsx";
import Library from "./components/Library.jsx";
import SwingDetail from "./components/SwingDetail.jsx";
import EditSession from "./components/EditSession.jsx";
import { getLibrary } from "./api.js";
import { orderedSwings } from "./libraryOrder.js";
import { RESULT_FIELDS } from "./results.js";

// Stages: "library" (home) <-> "upload" -> "review" -> "library"
export default function App() {
  const [stage, setStage] = useState("library");
  const [video, setVideo] = useState(null);
  const [segments, setSegments] = useState([]);
  const [meta, setMeta] = useState(null);

  // Library data + view/filter state live here so the sidebar and the
  // content area share them.
  const [data, setData] = useState({ sessions: [], tags: [] });
  const [view, setView] = useState("flat");
  const [tagFilter, setTagFilter] = useState(null);
  const [clubFilter, setClubFilter] = useState(null);
  const [resultFilters, setResultFilters] = useState(
    Object.fromEntries(RESULT_FIELDS.map((f) => [f.key, null]))
  );
  const setResultFilter = (field, val) => setResultFilters((f) => ({ ...f, [field]: val }));
  const [detail, setDetail] = useState(null); // { swing, session }
  const [editing, setEditing] = useState(null); // session being edited

  const refresh = useCallback(async () => {
    try { setData(await getLibrary()); } catch { /* keep last data */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const goLibrary = () => { setDetail(null); setEditing(null); setStage("library"); };
  const openSwing = (swing, session) => { setDetail({ swing, session }); setStage("detail"); };
  const editSession = (session) => { setEditing(session); setStage("editSession"); };
  const finishReview = () => {
    setVideo(null);
    setSegments([]);
    setMeta(null);
    refresh();
    setStage("library");
  };

  return (
    <div className="shell">
      <Sidebar
        data={data}
        view={view} setView={setView}
        tagFilter={tagFilter} setTagFilter={setTagFilter}
        clubFilter={clubFilter} setClubFilter={setClubFilter}
        resultFilters={resultFilters} setResultFilter={setResultFilter}
        refresh={refresh}
        onUpload={() => setStage("upload")}
        onHome={goLibrary}
        goLibrary={goLibrary}
      />

      <main className="content">
        {stage === "library" && (
          <Library
            data={data} view={view} tagFilter={tagFilter} clubFilter={clubFilter}
            resultFilters={resultFilters} refresh={refresh}
            onOpen={openSwing} onEditSession={editSession}
          />
        )}

        {stage === "detail" && detail && (() => {
          // Prev/next traverse the same filtered/ordered list as the library.
          const nav = orderedSwings(data, view, { tag: tagFilter, club: clubFilter, results: resultFilters, favorites: view === "favorites" });
          const idx = nav.findIndex((x) => x.swing.id === detail.swing.id);
          const go = (delta) => {
            const n = nav[idx + delta];
            if (n) setDetail({ swing: n.swing, session: n.session });
          };
          return (
            <SwingDetail
              key={detail.swing.id}
              swing={detail.swing}
              session={detail.session}
              allTags={data.tags || []}
              onClose={goLibrary}
              onChanged={refresh}
              position={idx >= 0 ? idx + 1 : null}
              total={nav.length}
              hasPrev={idx > 0}
              hasNext={idx >= 0 && idx < nav.length - 1}
              onPrev={() => go(-1)}
              onNext={() => go(1)}
            />
          );
        })()}

        {stage === "editSession" && editing && (
          <EditSession session={editing} allTags={data.tags || []} onClose={goLibrary} onChanged={refresh} />
        )}

        {stage === "upload" && (
          <>
            <div className="content-head">
              <h1>Upload video</h1>
              <button className="link" onClick={goLibrary}>Cancel</button>
            </div>
            <Uploader
              onReady={(vid, segs, m) => {
                setVideo(vid);
                setSegments(segs.map((s) => ({
                  start: s.start, end: s.end,
                  club_specific: s.club_specific ?? null,
                  club_generic: s.club_generic ?? null,
                })));
                setMeta(m);
                setStage("review");
              }}
            />
          </>
        )}

        {stage === "review" && video && (
          <>
            <div className="content-head">
              <h1>Review &amp; tag swings</h1>
              <button className="link" onClick={finishReview}>Cancel</button>
            </div>
            <ReviewTimeline
              video={video} segments={segments} setSegments={setSegments}
              meta={meta} setMeta={setMeta} onSaved={finishReview}
            />
          </>
        )}
      </main>
    </div>
  );
}
