import { useCallback, useEffect, useRef, useState } from "react";
import { getSwingPose, updateSwingClub, deleteSwing, updateSwingMeta } from "../api.js";
import { frameStepKeyDown } from "../frameStep.js";
import { clubLabel } from "../clubs.js";
import { RESULT_FIELDS } from "../results.js";
import ClubPicker from "./ClubPicker.jsx";
import Icon from "./Icon.jsx";

const COLORS = ["#3b82f6", "#ef4444", "#facc15", "#22c55e", "#ffffff", "#000000"];
const SPEEDS = [0.1, 0.25, 0.5, 1, 2];
const MAX_ZOOM = 5;
const TOOLS = [
  { key: "select", label: "Select / move" },
  { key: "pan", label: "Pan" },
  { key: "zoom", label: "Zoom (click; ⌥-click out)" },
  { key: "line", label: "Line" },
  { key: "angle", label: "Angle" },
  { key: "freehand", label: "Pen" },
  { key: "circle", label: "Circle" },
  { key: "eraser", label: "Eraser" },
];
// Tools that draw/edit on the canvas (so the draw layer captures pointer events).
const DRAW_TOOLS = new Set(["select", "line", "angle", "freehand", "circle", "eraser"]);
const HIT_PX = 12; // pointer distance (px) to grab/erase a shape

// Skeleton connections (MediaPipe Pose indices).
const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31],
  [24, 26], [26, 28], [28, 30], [30, 32],
];
const POSE_JOINTS = [...new Set(POSE_CONNECTIONS.flat())];

const fmt = (s) => {
  if (s == null || isNaN(s)) return "0:00.0";
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};

export default function SwingDetail({ swing, session, onClose, onChanged,
  position, total, hasPrev, hasNext, onPrev, onNext }) {
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const poseCanvasRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const panRef = useRef(null);
  const fps = session?.fps || 30;

  const [tool, setTool] = useState(null);
  const [color, setColor] = useState(COLORS[0]);
  const [shapes, setShapes] = useState([]);
  const [past, setPast] = useState([]);    // undo stack (snapshots)
  const [future, setFuture] = useState([]); // redo stack (snapshots)
  const [draft, setDraft] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const beforeRef = useRef(null); // shapes snapshot at the start of a drag action
  const dragRef = useRef(null);   // { idx, last } while moving a shape
  const erasingRef = useRef(false);
  const changedRef = useRef(false); // did a drag erase/move actually change anything
  const [poseOn, setPoseOn] = useState(false);
  const [pose, setPose] = useState(null);
  const [poseStatus, setPoseStatus] = useState("idle"); // idle|loading|ready|none|error
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(true); // videos default to muted
  const [loop, setLoop] = useState(false);
  const [tf, setTf] = useState({ s: 1, x: 0, y: 0 }); // zoom scale + pan offset
  const [panning, setPanning] = useState(false);
  const [sizeTick, setSizeTick] = useState(0);
  const [club, setClub] = useState(swing);
  const [tags, setTags] = useState(swing?.tags || []);
  const [newTag, setNewTag] = useState("");
  const [notes, setNotes] = useState(swing?.notes || "");
  const [results, setResults] = useState(
    Object.fromEntries(RESULT_FIELDS.map((f) => [f.key, swing?.[f.key] || ""]))
  );

  // --- keep canvases matched to the rendered video box
  const syncCanvas = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.clientWidth) return;
    for (const c of [poseCanvasRef.current, drawCanvasRef.current]) {
      if (c) { c.width = v.clientWidth; c.height = v.clientHeight; }
    }
    setSizeTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const ro = new ResizeObserver(syncCanvas);
    if (videoRef.current) ro.observe(videoRef.current);
    window.addEventListener("resize", syncCanvas);
    return () => { ro.disconnect(); window.removeEventListener("resize", syncCanvas); };
  }, [syncCanvas]);

  // --- keyboard: Esc closes, Space toggles play, arrows frame-step
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.key === "Escape") return onClose();
      if (e.key === " ") { e.preventDefault(); return togglePlay(); }
      frameStepKeyDown(e, videoRef.current, fps);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fps, onClose]);

  // --- pose loop (rAF): cheap line drawing from precomputed landmarks
  useEffect(() => {
    let raf;
    const ctx = poseCanvasRef.current?.getContext("2d");
    const loop = () => {
      const c = poseCanvasRef.current;
      const v = videoRef.current;
      if (ctx && c) {
        ctx.clearRect(0, 0, c.width, c.height);
        if (poseOn && pose?.frames?.length && v) {
          const i = Math.min(pose.frames.length - 1,
            Math.max(0, Math.round(v.currentTime * pose.overlay_fps)));
          drawPose(ctx, pose.frames[i]?.lm, c.width, c.height);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [poseOn, pose, sizeTick]);

  // --- redraw user annotations whenever they change / canvas resizes
  useEffect(() => {
    const c = drawCanvasRef.current;
    const ctx = c?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    shapes.forEach((s, i) => drawShape(ctx, s, c.width, c.height, tool === "select" && i === selectedIdx));
    if (draft) drawShape(ctx, draft, c.width, c.height, false);
  }, [shapes, draft, sizeTick, selectedIdx, tool]);

  const ensurePose = async () => {
    if (poseStatus === "ready" || poseStatus === "loading") return;
    setPoseStatus("loading");
    try {
      const data = await getSwingPose(swing.id);
      setPose(data);
      setPoseStatus(data.frames?.some((f) => f.lm) ? "ready" : "none");
    } catch {
      setPoseStatus("error");
    }
  };
  const togglePose = async () => {
    if (!poseOn) await ensurePose();
    setPoseOn((p) => !p);
  };

  // --- playback
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); } else { v.pause(); }
  };
  const seek = (t) => { const v = videoRef.current; if (v) v.currentTime = t; };
  const stepFrame = (dir) => {
    const v = videoRef.current;
    if (v) { v.pause(); v.currentTime = Math.max(0, Math.min(duration, v.currentTime + dir / fps)); }
  };
  const replay = () => { const v = videoRef.current; if (v) { v.currentTime = 0; v.play(); } };
  const changeSpeed = (r) => { const v = videoRef.current; if (v) v.playbackRate = r; setSpeed(r); };
  const toggleMute = () => setMuted((m) => !m);

  // Keep the element's muted property in sync (the `muted` attribute alone is
  // unreliable in React).
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);
  useEffect(() => { if (videoRef.current) videoRef.current.loop = loop; }, [loop]);

  // --- zoom / pan (transform the wrap so video + overlays move together)
  const clampPan = (s, x, y) => {
    const v = videoRef.current;
    if (!v) return { x, y };
    const mx = ((s - 1) * v.clientWidth) / 2, my = ((s - 1) * v.clientHeight) / 2;
    return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  };
  // Zoom keeping the point (cx, cy) (screen coords) fixed under the cursor.
  const zoomAtPoint = (cx, cy, factor) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
    setTf((t) => {
      const s = Math.max(1, Math.min(MAX_ZOOM, t.s * factor));
      if (s === 1) return { s: 1, x: 0, y: 0 };
      const k = s / t.s;
      const newW = r.width * k, newH = r.height * k;
      const baseCx = r.left + r.width / 2 - t.x;
      const baseCy = r.top + r.height / 2 - t.y;
      const x = cx + newW * (0.5 - fx) - baseCx;
      const y = cy + newH * (0.5 - fy) - baseCy;
      return { s, ...clampPan(s, x, y) };
    });
  };
  const zoomBy = (factor) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) zoomAtPoint(r.left + r.width / 2, r.top + r.height / 2, factor);
  };
  const resetZoom = () => setTf({ s: 1, x: 0, y: 0 });

  const onStageDown = (e) => {
    if (e.target.closest && e.target.closest(".zoom-cluster")) return;
    if (tool === "pan") {
      stageRef.current.setPointerCapture?.(e.pointerId);
      panRef.current = { x: e.clientX, y: e.clientY, tx: tf.x, ty: tf.y };
      setPanning(true);
    } else if (tool === "zoom") {
      const out = e.altKey || e.shiftKey || e.button === 2;
      zoomAtPoint(e.clientX, e.clientY, out ? 1 / 1.4 : 1.4);
    }
  };
  const onStageMove = (e) => {
    if (!panRef.current) return;
    const dx = e.clientX - panRef.current.x, dy = e.clientY - panRef.current.y;
    setTf((t) => ({ ...t, ...clampPan(t.s, panRef.current.tx + dx, panRef.current.ty + dy) }));
  };
  const onStageUp = () => { panRef.current = null; setPanning(false); };

  // Wheel zooms only while the Zoom tool is active (non-passive so we can
  // preventDefault the page scroll). Re-bound when the tool changes.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || tool !== "zoom") return;
    const onWheel = (e) => { e.preventDefault(); zoomAtPoint(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [tool]);

  // --- drawing pointer handling (coords normalized 0..1 to the video box)
  const norm = (e) => {
    const r = drawCanvasRef.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const canvasWH = () => [drawCanvasRef.current.width, drawCanvasRef.current.height];

  const onPointerDown = (e) => {
    if (!tool) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = norm(e);
    const [W, H] = canvasWH();

    if (tool === "eraser") {
      beforeRef.current = shapes; changedRef.current = false; erasingRef.current = true;
      eraseAt(p, W, H);
    } else if (tool === "select") {
      const idx = hitTop(shapes, p, W, H);
      setSelectedIdx(idx);
      if (idx != null) { dragRef.current = { idx, last: p }; beforeRef.current = shapes; changedRef.current = false; }
    } else if (tool === "angle") {
      setDraft((d) => {
        const pts = d && d.type === "angle" ? [...d.points, p] : [p];
        if (pts.length >= 3) { commit({ type: "angle", color, points: pts.slice(0, 3) }); return null; }
        return { type: "angle", color, points: pts };
      });
    } else {
      setDraft({ type: tool, color, points: [p, p] });
    }
  };

  const onPointerMove = (e) => {
    const p = norm(e);
    const [W, H] = canvasWH();
    if (tool === "eraser" && erasingRef.current) { eraseAt(p, W, H); return; }
    if (tool === "select" && dragRef.current) {
      const { idx, last } = dragRef.current;
      const dx = p.x - last.x, dy = p.y - last.y;
      setShapes((cur) => cur.map((s, i) => (i === idx ? translateShape(s, dx, dy) : s)));
      dragRef.current.last = p; changedRef.current = true;
      return;
    }
    if (!draft) return;
    if (draft.type === "freehand") setDraft({ ...draft, points: [...draft.points, p] });
    else if (draft.type === "angle") setDraft({ ...draft, hover: p });
    else setDraft({ ...draft, points: [draft.points[0], p] });
  };

  const onPointerUp = () => {
    if (tool === "eraser") {
      if (erasingRef.current && changedRef.current) pushHistory(beforeRef.current);
      erasingRef.current = false; return;
    }
    if (tool === "select") {
      if (dragRef.current && changedRef.current) pushHistory(beforeRef.current);
      dragRef.current = null; return;
    }
    if (!draft || draft.type === "angle") return;
    commit(draft);
    setDraft(null);
  };

  const eraseAt = (p, W, H) => setShapes((cur) => {
    const next = cur.filter((s) => !shapeHit(s, p, W, H));
    if (next.length !== cur.length) changedRef.current = true;
    return next;
  });

  // --- snapshot-based history (works for add / erase / move / clear)
  const pushHistory = (before) => { setPast((p) => [...p, before]); setFuture([]); };
  const commit = (shape) => { setPast((p) => [...p, shapes]); setShapes((s) => [...s, shape]); setFuture([]); };
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [shapes, ...f]);
    setShapes(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setSelectedIdx(null);
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, shapes]);
    setShapes(future[0]);
    setFuture((f) => f.slice(1));
    setSelectedIdx(null);
  };
  const clear = () => {
    if (!shapes.length) return;
    setPast((p) => [...p, shapes]); setShapes([]); setFuture([]); setDraft(null); setSelectedIdx(null);
  };
  const selectTool = (key) => { setTool((cur) => (cur === key ? null : key)); setSelectedIdx(null); dragRef.current = null; };

  const changeClub = async (c) => {
    setClub({ ...club, ...c });
    try { await updateSwingClub(swing.id, c); onChanged?.(); } catch { /* ignore */ }
  };

  const saveTags = async (next) => {
    setTags(next);
    try { await updateSwingMeta(swing.id, { tags: next }); onChanged?.(); } catch { /* ignore */ }
  };
  const addTag = () => {
    const t = newTag.trim();
    if (t && !tags.includes(t)) saveTags([...tags, t]);
    setNewTag("");
  };
  const removeTag = (t) => saveTags(tags.filter((x) => x !== t));
  const saveNotes = async () => {
    try { await updateSwingMeta(swing.id, { notes }); onChanged?.(); } catch { /* ignore */ }
  };
  const changeResult = async (field, value) => {
    setResults((r) => ({ ...r, [field]: value }));
    try { await updateSwingMeta(swing.id, { [field]: value || null }); onChanged?.(); } catch { /* ignore */ }
  };
  const removeSwing = async () => {
    if (!confirm("Delete this swing?")) return;
    await deleteSwing(swing.id);
    onChanged?.();
    onClose();
  };

  const angleHint = tool === "angle" && draft && draft.type === "angle"
    ? `Angle: ${draft.points.length}/3 points` : null;

  return (
    <div className="detail-page">
      <div className="detail-head centered">
        <button className="back" onClick={onClose}>← Library</button>
        <div className="head-center">
          <h1>Swing {swing.index + 1}</h1>
          <div className="chips">
            <span className="chip">{session?.name}</span>
            {session?.recorded_date && <span className="chip">{session.recorded_date}</span>}
            {clubLabel(club) && <span className="chip accent">{clubLabel(club)}</span>}
          </div>
        </div>
      </div>

      <SwingNav {...{ position, total, hasPrev, hasNext, onPrev, onNext }} />

      <div className="detail-body">
        <div className="analysis">
          <div className="toolbar tools">
            <div className="tool-group">
              {TOOLS.map((t) => (
                <button key={t.key} className={`icon-btn ${tool === t.key ? "active" : ""}`}
                  data-tip={t.label} aria-label={t.label} onClick={() => selectTool(t.key)}>
                  <Icon name={t.key} />
                </button>
              ))}
            </div>
            <span className="divider" />
            <span className="swatches">
              {COLORS.map((c) => (
                <button key={c} className={`swatch ${color === c ? "active" : ""}`}
                  style={{ background: c }} onClick={() => setColor(c)} data-tip={c} aria-label={`color ${c}`} />
              ))}
            </span>
            <span className="divider" />
            <div className="tool-group">
              <button className="icon-btn" data-tip="Undo" aria-label="Undo" onClick={undo} disabled={!past.length}><Icon name="undo" /></button>
              <button className="icon-btn" data-tip="Redo" aria-label="Redo" onClick={redo} disabled={!future.length}><Icon name="redo" /></button>
              <button className="icon-btn" data-tip="Clear all" aria-label="Clear all" onClick={clear} disabled={!shapes.length}><Icon name="clear" /></button>
            </div>
            <button className={`icon-btn pose-btn ${poseOn ? "active" : ""} ${poseStatus === "loading" ? "loading" : ""}`}
              data-tip={poseStatus === "loading" ? "Loading pose…" : "Pose overlay"}
              aria-label="Pose overlay" onClick={togglePose}>
              <Icon name="pose" />
            </button>
          </div>
          {(angleHint || poseStatus === "none" || poseStatus === "error") && (
            <p className="hint">
              {angleHint}
              {poseStatus === "none" && "No pose detected in this clip."}
              {poseStatus === "error" && "Couldn't load pose data."}
            </p>
          )}

          <div
            className={`video-stage ${tool === "pan" ? "tool-pan" : ""} ${tool === "zoom" ? "tool-zoom" : ""} ${panning ? "panning" : ""}`}
            ref={stageRef}
            onPointerDown={onStageDown}
            onPointerMove={onStageMove}
            onPointerUp={onStageUp}
            onContextMenu={(e) => { if (tool === "zoom") e.preventDefault(); }}
          >
            <div className="video-wrap" ref={wrapRef}
              style={{ transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.s})` }}>
              <video
                ref={videoRef}
                src={swing.url}
                playsInline
                muted
                className="detail-video"
                onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); syncCanvas(); }}
                onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
              <canvas ref={poseCanvasRef} className="overlay-canvas pose" />
              <canvas
                ref={drawCanvasRef}
                className={`overlay-canvas draw ${DRAW_TOOLS.has(tool) ? "active tool-" + tool : ""}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            </div>

            <div className="zoom-cluster">
              <button className="icon-btn" data-tip="Zoom out" aria-label="Zoom out" onClick={() => zoomBy(0.8)} disabled={tf.s <= 1}>−</button>
              <button className="zoom-pct" data-tip="Reset zoom" aria-label="Reset zoom" onClick={resetZoom}>{Math.round(tf.s * 100)}%</button>
              <button className="icon-btn" data-tip="Zoom in" aria-label="Zoom in" onClick={() => zoomBy(1.25)} disabled={tf.s >= MAX_ZOOM}>+</button>
            </div>
          </div>

          <div className="controls">
            <button className="icon-btn" data-tip={playing ? "Pause (Space)" : "Play (Space)"} aria-label="Play/pause" onClick={togglePlay}>
              <Icon name={playing ? "pause" : "play"} />
            </button>
            <button className="icon-btn frame-step" data-tip="Previous frame (←)" aria-label="Previous frame" onClick={() => stepFrame(-1)}>‹</button>
            <button className="icon-btn frame-step" data-tip="Next frame (→)" aria-label="Next frame" onClick={() => stepFrame(1)}>›</button>
            <button className="icon-btn" data-tip="Replay" aria-label="Replay" onClick={replay}><Icon name="replay" /></button>
            <button className="icon-btn" data-tip={muted ? "Unmute" : "Mute"} aria-label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
              <Icon name={muted ? "mute" : "volume"} />
            </button>
            <input type="range" min="0" max={duration || 0} step="0.001" value={time}
              onChange={(e) => seek(parseFloat(e.target.value))} className="scrubber" />
            <span className="muted small time">{fmt(time)} / {fmt(duration)}</span>
            <button className={`icon-btn ${loop ? "active" : ""}`} data-tip="Loop" aria-label="Loop"
              onClick={() => setLoop((l) => !l)}><Icon name="loop" /></button>
            <select className="speed-select" value={speed} title="Playback speed"
              onChange={(e) => changeSpeed(parseFloat(e.target.value))} aria-label="Playback speed">
              {SPEEDS.map((r) => <option key={r} value={r}>{r}×</option>)}
            </select>
          </div>
        </div>

        <section className="detail-info">
          <div className="info-grid">
            <div className="info-item"><span className="k">Session</span><span className="v">{session?.name}</span></div>
            <div className="info-item"><span className="k">Date</span><span className="v">{session?.recorded_date || "—"}</span></div>
            <div className="info-item"><span className="k">Club</span><ClubPicker club={club} onChange={changeClub} /></div>
            <div className="info-item"><span className="k">Clip</span><span className="v">{fmt(swing.start)} → {fmt(swing.end)} ({(swing.end - swing.start).toFixed(1)}s)</span></div>
          </div>

          <div className="info-tags">
            <span className="k">Tags</span>
            <div className="tag-edit">
              {tags.map((t) => (
                <span key={t} className="tag-chip">
                  #{t}<button className="x" onClick={() => removeTag(t)} aria-label={`remove ${t}`}>×</button>
                </span>
              ))}
              <input
                className="tag-input"
                value={newTag}
                placeholder="add tag…"
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              />
              <button className="tiny" onClick={addTag} disabled={!newTag.trim()}>Add</button>
            </div>
          </div>

          <div className="info-results">
            <span className="k">Results</span>
            <div className="results-grid">
              {RESULT_FIELDS.map((f) => (
                <label key={f.key} className="result-field">
                  <span className="rk">{f.label}</span>
                  <select value={results[f.key] || ""} onChange={(e) => changeResult(f.key, e.target.value)}>
                    <option value="">—</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="info-notes">
            <span className="k">Notes</span>
            <textarea
              className="notes-input"
              value={notes}
              placeholder="Notes for this swing…"
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
            />
          </div>

          <div className="info-actions">
            <a className="btn-link" href={swing.url} download={`swing-${swing.index + 1}.mp4`}>⤓ Export clip</a>
            <button className="del" onClick={removeSwing}>Delete swing</button>
            <span className="muted small spacer-tip">← / → frame · Space play/pause · Esc close</span>
          </div>
        </section>
      </div>

      <SwingNav bottom {...{ position, total, hasPrev, hasNext, onPrev, onNext }} />
    </div>
  );
}

function SwingNav({ position, total, hasPrev, hasNext, onPrev, onNext, bottom }) {
  if (!total) return null;
  return (
    <div className={`swing-nav ${bottom ? "bottom" : ""}`}>
      <button onClick={onPrev} disabled={!hasPrev}>← Previous swing</button>
      <span className="muted small nav-pos">{position ? `${position} of ${total}` : `${total} swings`}</span>
      <button onClick={onNext} disabled={!hasNext}>Next swing →</button>
    </div>
  );
}

// ---------------------------------------------------------------- canvas draw
function drawPose(ctx, lm, W, H) {
  if (!lm) return;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(96,165,250,0.95)";
  ctx.fillStyle = "#93c5fd";
  for (const [a, b] of POSE_CONNECTIONS) {
    const pa = lm[a], pb = lm[b];
    if (!pa || !pb || pa[2] < 0.3 || pb[2] < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(pa[0] * W, pa[1] * H);
    ctx.lineTo(pb[0] * W, pb[1] * H);
    ctx.stroke();
  }
  for (const j of POSE_JOINTS) {
    const p = lm[j];
    if (!p || p[2] < 0.3) continue;
    ctx.beginPath();
    ctx.arc(p[0] * W, p[1] * H, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawShape(ctx, s, W, H, selected) {
  const px = (p) => [p.x * W, p.y * H];
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = selected ? 3.5 : 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (selected) { ctx.shadowColor = "#3b82f6"; ctx.shadowBlur = 12; }

  if (s.type === "line") {
    const [a, b] = s.points.map(px);
    line(ctx, a, b);
  } else if (s.type === "freehand") {
    ctx.beginPath();
    s.points.forEach((p, i) => { const [x, y] = px(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  } else if (s.type === "circle") {
    const [c, e] = s.points.map(px);
    const r = Math.hypot(e[0] - c[0], e[1] - c[1]);
    ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2); ctx.stroke();
  } else if (s.type === "angle") {
    const pts = [...s.points];
    if (pts.length === 2 && s.hover) pts.push(s.hover);
    const [v, a, b] = pts.map((p) => p && px(p));
    if (v && a) line(ctx, v, a);
    if (v && b) line(ctx, v, b);
    for (const p of [v, a, b]) if (p) dot(ctx, p);
    if (v && a && b) {
      const deg = angleDeg(v, a, b);
      ctx.font = "bold 15px -apple-system, sans-serif";
      ctx.fillText(`${deg.toFixed(0)}°`, v[0] + 8, v[1] - 8);
    }
  }
  ctx.restore();
}

const line = (ctx, a, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
const dot = (ctx, p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2); ctx.fill(); };
function angleDeg(v, a, b) {
  const v1 = [a[0] - v[0], a[1] - v[1]], v2 = [b[0] - v[0], b[1] - v[1]];
  const dotp = v1[0] * v2[0] + v1[1] * v2[1];
  const m = Math.hypot(...v1) * Math.hypot(...v2) || 1;
  return Math.acos(Math.max(-1, Math.min(1, dotp / m))) * 180 / Math.PI;
}

// ---------------------------------------------------------------- hit testing
function translateShape(s, dx, dy) {
  const mv = (p) => ({ x: p.x + dx, y: p.y + dy });
  return { ...s, points: s.points.map(mv), hover: s.hover ? mv(s.hover) : s.hover };
}

function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function shapeHit(s, pt, W, H, thresh = HIT_PX) {
  const px = (p) => [p.x * W, p.y * H];
  const q = [pt.x * W, pt.y * H];
  if (s.type === "line") return distToSeg(q, px(s.points[0]), px(s.points[1])) < thresh;
  if (s.type === "freehand") {
    for (let i = 1; i < s.points.length; i++)
      if (distToSeg(q, px(s.points[i - 1]), px(s.points[i])) < thresh) return true;
    return false;
  }
  if (s.type === "circle") {
    const c = px(s.points[0]), e = px(s.points[1]);
    const r = Math.hypot(e[0] - c[0], e[1] - c[1]);
    return Math.abs(Math.hypot(q[0] - c[0], q[1] - c[1]) - r) < thresh;
  }
  if (s.type === "angle") {
    const [v, a, b] = s.points.map(px);
    return (a && distToSeg(q, v, a) < thresh) || (b && distToSeg(q, v, b) < thresh);
  }
  return false;
}

// topmost (last-drawn) shape under the pointer, or null
function hitTop(shapes, pt, W, H) {
  for (let i = shapes.length - 1; i >= 0; i--) if (shapeHit(shapes[i], pt, W, H)) return i;
  return null;
}
