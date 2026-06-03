import { useEffect, useRef, useState } from "react";
import { videoUrl, saveSwings } from "../api.js";
import { frameStepKeyDown } from "../frameStep.js";
import ClubPicker from "./ClubPicker.jsx";

const fmt = (s) => {
  if (s == null || isNaN(s)) return "0:00.0";
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
};

export default function ReviewTimeline({ video, segments, setSegments, meta, setMeta, onSaved }) {
  const videoRef = useRef(null);
  const trackRef = useRef(null);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(0);
  const [playRange, setPlayRange] = useState(null); // {end} - stop playback at end
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const duration = video.duration || 0;

  // Keep playhead readout in sync and stop at the end of a previewed swing.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => {
      setCurrent(el.currentTime);
      if (playRange && el.currentTime >= playRange.end) {
        el.pause();
        setPlayRange(null);
      }
    };
    const onSeeked = () => setCurrent(el.currentTime); // reflect frame steps
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("seeked", onSeeked);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("seeked", onSeeked);
    };
  }, [playRange]);

  const seek = (t) => {
    const el = videoRef.current;
    if (el) el.currentTime = Math.max(0, Math.min(duration, t));
  };

  const playSwing = (i) => {
    const seg = segments[i];
    setSelected(i);
    seek(seg.start);
    setPlayRange({ end: seg.end });
    videoRef.current?.play();
  };

  const updateSeg = (i, patch) => {
    setSegments((prev) =>
      prev.map((s, idx) => (idx === i ? clampSeg({ ...s, ...patch }, duration) : s))
    );
  };

  const deleteSeg = (i) => {
    setSegments((prev) => prev.filter((_, idx) => idx !== i));
    setSelected((s) => Math.max(0, s - (i <= s ? 1 : 0)));
  };

  const addSeg = () => {
    const start = current;
    const end = Math.min(duration, current + 3);
    setSegments((prev) =>
      [...prev, { start, end }].sort((a, b) => a.start - b.start)
    );
  };

  const onTrackClick = (e) => {
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    seek(ratio * duration);
  };

  const patchMeta = (p) => setMeta((m) => ({ ...m, ...p }));

  async function doSave() {
    setSaving(true);
    setError(null);
    try {
      const sorted = [...segments].sort((a, b) => a.start - b.start);
      await saveSwings(video.id, meta, sorted);
      onSaved();
    } catch (e) {
      setError(e.message || String(e));
      setSaving(false);
    }
  }

  return (
    <div className="review">
      <div className="form session-form">
        <label>
          Name
          <input value={meta.name} onChange={(e) => patchMeta({ name: e.target.value })} />
        </label>
        <label>
          Date
          <input type="date" value={meta.recorded_date || ""}
                 onChange={(e) => patchMeta({ recorded_date: e.target.value })} />
        </label>
        <label>
          Tags
          <input value={meta.tags.join(", ")}
                 onChange={(e) => patchMeta({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} />
        </label>
      </div>

      <video
        ref={videoRef}
        src={videoUrl(video.id)}
        controls
        tabIndex={0}
        className="player"
        onLoadedMetadata={() => setCurrent(0)}
        onKeyDown={(e) => frameStepKeyDown(e, e.currentTarget, video.fps)}
      />
      <p className="muted hint">Click the video, then ← / → to step one frame (Shift for 10).</p>

      <div className="timeline-wrap">
        <div className="track" ref={trackRef} onClick={onTrackClick}>
          {segments.map((seg, i) => (
            <div
              key={i}
              className={`seg ${i === selected ? "selected" : ""}`}
              style={{
                left: `${(seg.start / duration) * 100}%`,
                width: `${((seg.end - seg.start) / duration) * 100}%`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                playSwing(i);
              }}
              title={`Swing ${i + 1}`}
            >
              <span className="seg-label">{i + 1}</span>
            </div>
          ))}
          <div
            className="playhead"
            style={{ left: `${(current / duration) * 100}%` }}
          />
        </div>
        <div className="track-meta">
          <span>{fmt(current)}</span>
          <span className="muted">{fmt(duration)}</span>
        </div>
      </div>

      <div className="toolbar">
        <span className="count">{segments.length} swings detected</span>
        <button onClick={addSeg}>+ Add swing at playhead</button>
        <button
          className="primary"
          disabled={saving || segments.length === 0}
          onClick={doSave}
        >
          {saving ? "Saving…" : `Save ${segments.length} swings to library`}
        </button>
      </div>
      {error && <p className="error">⚠ {error}</p>}

      <ul className="seg-list">
        {segments.map((seg, i) => (
          <li key={i} className={i === selected ? "selected" : ""}>
            <button className="seg-num" onClick={() => playSwing(i)}>
              ▶ Swing {i + 1}
            </button>
            <Field
              label="start"
              value={seg.start}
              onSetPlayhead={() => updateSeg(i, { start: current })}
              onChange={(v) => updateSeg(i, { start: v })}
            />
            <Field
              label="end"
              value={seg.end}
              onSetPlayhead={() => updateSeg(i, { end: current })}
              onChange={(v) => updateSeg(i, { end: v })}
            />
            <span className="dur muted">{fmt(seg.end - seg.start)}</span>
            <ClubPicker club={seg} onChange={(c) => updateSeg(i, c)} />
            <button className="del" onClick={() => deleteSeg(i)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, value, onChange, onSetPlayhead }) {
  return (
    <span className="field">
      <label>{label}</label>
      <input
        type="number"
        step="0.1"
        value={value.toFixed(2)}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
      <button className="tiny" title="Set to playhead" onClick={onSetPlayhead}>
        ⤓
      </button>
    </span>
  );
}

function clampSeg(seg, duration) {
  let start = Math.max(0, Math.min(seg.start, duration));
  let end = Math.max(0, Math.min(seg.end, duration));
  if (end < start) end = start;
  return { ...seg, start, end };
}
