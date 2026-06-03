import { useState } from "react";
import Uploader from "./components/Uploader.jsx";
import ReviewTimeline from "./components/ReviewTimeline.jsx";
import Library from "./components/Library.jsx";

// Stages: "library" (home) <-> "upload" -> "review" -> "library"
export default function App() {
  const [stage, setStage] = useState("library");
  const [video, setVideo] = useState(null);
  const [segments, setSegments] = useState([]);
  const [meta, setMeta] = useState(null); // {name, recorded_date, tags}
  const [refreshKey, setRefreshKey] = useState(0);

  const toLibrary = () => {
    setVideo(null);
    setSegments([]);
    setMeta(null);
    setRefreshKey((k) => k + 1); // force library reload
    setStage("library");
  };

  return (
    <div className="app">
      <header>
        <h1 onClick={toLibrary} style={{ cursor: "pointer" }}>⛳ Swing Library</h1>
        {stage === "library" ? (
          <button className="primary" onClick={() => setStage("upload")}>
            + Upload video
          </button>
        ) : (
          <button className="link" onClick={toLibrary}>
            Cancel
          </button>
        )}
      </header>

      {stage === "library" && <Library key={refreshKey} />}

      {stage === "upload" && (
        <Uploader
          onReady={(vid, segs, m) => {
            setVideo(vid);
            setSegments(segs.map((s) => ({ start: s.start, end: s.end })));
            setMeta(m);
            setStage("review");
          }}
        />
      )}

      {stage === "review" && video && (
        <ReviewTimeline
          video={video}
          segments={segments}
          setSegments={setSegments}
          meta={meta}
          setMeta={setMeta}
          onSaved={toLibrary}
        />
      )}
    </div>
  );
}
