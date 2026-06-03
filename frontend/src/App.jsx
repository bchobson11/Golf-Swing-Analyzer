import { useCallback, useEffect, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import Uploader from "./components/Uploader.jsx";
import ReviewTimeline from "./components/ReviewTimeline.jsx";
import Library from "./components/Library.jsx";
import { getLibrary } from "./api.js";

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

  const refresh = useCallback(async () => {
    try { setData(await getLibrary()); } catch { /* keep last data */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const goLibrary = () => setStage("library");
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
        onUpload={() => setStage("upload")}
        onHome={goLibrary}
        goLibrary={goLibrary}
      />

      <main className="content">
        {stage === "library" && (
          <Library
            data={data} view={view} tagFilter={tagFilter} clubFilter={clubFilter}
            refresh={refresh}
          />
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
                setSegments(segs.map((s) => ({ start: s.start, end: s.end })));
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
