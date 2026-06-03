import { useState } from "react";
import Uploader from "./components/Uploader.jsx";
import ReviewTimeline from "./components/ReviewTimeline.jsx";
import SwingList from "./components/SwingList.jsx";

// Stages: "upload" -> "review" -> "results"
export default function App() {
  const [stage, setStage] = useState("upload");
  const [video, setVideo] = useState(null); // {id, duration, fps, ...}
  const [segments, setSegments] = useState([]); // [{start, end}]
  const [clips, setClips] = useState([]);

  const reset = () => {
    setStage("upload");
    setVideo(null);
    setSegments([]);
    setClips([]);
  };

  return (
    <div className="app">
      <header>
        <h1>⛳ Golf Swing Splitter</h1>
        {stage !== "upload" && (
          <button className="link" onClick={reset}>
            Start over
          </button>
        )}
      </header>

      {stage === "upload" && (
        <Uploader
          onReady={(vid, segs) => {
            setVideo(vid);
            setSegments(segs.map((s) => ({ start: s.start, end: s.end })));
            setStage("review");
          }}
        />
      )}

      {stage === "review" && video && (
        <ReviewTimeline
          video={video}
          segments={segments}
          setSegments={setSegments}
          onExported={(c) => {
            setClips(c);
            setStage("results");
          }}
        />
      )}

      {stage === "results" && (
        <SwingList clips={clips} onBack={() => setStage("review")} />
      )}
    </div>
  );
}
