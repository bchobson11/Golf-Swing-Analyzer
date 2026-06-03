import { useRef, useState } from "react";
import { uploadVideo, startAnalysis, getAnalysis } from "../api.js";

export default function Uploader({ onReady }) {
  const [phase, setPhase] = useState("idle"); // idle | uploading | analyzing | error
  const [uploadPct, setUploadPct] = useState(0);
  const [analyzePct, setAnalyzePct] = useState(0);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    try {
      setPhase("uploading");
      const video = await uploadVideo(file, setUploadPct);

      setPhase("analyzing");
      await startAnalysis(video.id);
      const segments = await pollAnalysis(video.id, setAnalyzePct);
      onReady(video, segments);
    } catch (e) {
      setError(e.message || String(e));
      setPhase("error");
    }
  }

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="card">
      {phase === "idle" || phase === "error" ? (
        <>
          <div
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <p className="big">Drop a golf swing video here</p>
            <p className="muted">or click to choose a file (.mov, .mp4)</p>
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
          {error && <p className="error">⚠ {error}</p>}
        </>
      ) : (
        <div className="progress-stack">
          <ProgressBar
            label="Uploading"
            pct={uploadPct}
            done={phase === "analyzing"}
          />
          {phase === "analyzing" && (
            <ProgressBar label="Detecting swings" pct={analyzePct} />
          )}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ label, pct, done }) {
  const value = done ? 1 : pct;
  return (
    <div className="progress-row">
      <span className="progress-label">
        {label} {done ? "✓" : `${Math.round(value * 100)}%`}
      </span>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

async function pollAnalysis(videoId, onProgress) {
  while (true) {
    const status = await getAnalysis(videoId);
    onProgress(status.progress || 0);
    if (status.state === "done") return status.segments;
    if (status.state === "error") throw new Error(status.error || "Analysis failed");
    await new Promise((r) => setTimeout(r, 600));
  }
}
