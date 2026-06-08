import { useRef, useState } from "react";
import { uploadVideo, startAnalysis, getAnalysis } from "../api.js";
import ClubPicker from "./ClubPicker.jsx";
import { CAMERA_ANGLE } from "../results.js";

const today = () => new Date().toISOString().slice(0, 10);
const nameFromFile = (f) => f.name.replace(/\.[^.]+$/, "");

export default function Uploader({ onReady }) {
  // phase: pick -> form -> uploading -> analyzing -> error
  const [phase, setPhase] = useState("pick");
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState(today());
  const [tags, setTags] = useState("");
  const [club, setClub] = useState({ club_specific: null, club_generic: null });
  const [cameraAngle, setCameraAngle] = useState("");
  const [uploadPct, setUploadPct] = useState(0);
  const [analyzePct, setAnalyzePct] = useState(0);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const pickFile = (f) => {
    if (!f) return;
    setFile(f);
    setName(nameFromFile(f));
    setPhase("form");
  };

  async function startProcessing() {
    setError(null);
    try {
      setPhase("uploading");
      const video = await uploadVideo(file, setUploadPct);
      setPhase("analyzing");
      await startAnalysis(video.id);
      const segments = await pollAnalysis(video.id, setAnalyzePct);
      // Seed every detected swing with the chosen default club (editable later).
      const withClub = segments.map((s) => ({ ...s, ...club }));
      const meta = {
        name: name.trim() || nameFromFile(file),
        recorded_date: date || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        camera_angle: cameraAngle || null,
      };
      onReady(video, withClub, meta);
    } catch (e) {
      setError(e.message || String(e));
      setPhase("error");
    }
  }

  if (phase === "pick" || phase === "error") {
    return (
      <div className="card">
        <div
          className={`dropzone ${dragging ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pickFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
        >
          <p className="big">Drop a golf swing video here</p>
          <p className="muted">or click to choose a file (.mov, .mp4)</p>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </div>
        {error && <p className="error">⚠ {error}</p>}
      </div>
    );
  }

  if (phase === "form") {
    return (
      <div className="card">
        <p className="muted">Selected: {file.name}</p>
        <div className="form">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Range session" />
          </label>
          <label>
            Date recorded
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Tags (comma-separated) <span className="muted small">· applied to each detected swing</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="driver, range, lesson" />
          </label>
          <label>
            Club <span className="muted small">· default for each detected swing</span>
            <ClubPicker club={club} onChange={setClub} />
          </label>
          <label>
            Camera angle <span className="muted small">· applied to each detected swing</span>
            <select value={cameraAngle} onChange={(e) => setCameraAngle(e.target.value)}>
              <option value="">—</option>
              {CAMERA_ANGLE.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        </div>
        <div className="toolbar">
          <button onClick={() => { setFile(null); setPhase("pick"); }}>← Choose different file</button>
          <button className="primary" onClick={startProcessing}>Upload &amp; detect swings</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="progress-stack">
        <ProgressBar label="Uploading" pct={uploadPct} done={phase === "analyzing"} />
        {phase === "analyzing" && <ProgressBar label="Detecting swings" pct={analyzePct} />}
      </div>
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
