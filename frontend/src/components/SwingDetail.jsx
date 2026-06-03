import { useCallback, useEffect, useRef, useState } from "react";
import { getSwingPose, updateSwingClub, deleteSwing } from "../api.js";
import { frameStepKeyDown } from "../frameStep.js";
import ClubPicker from "./ClubPicker.jsx";

const COLORS = ["#3b82f6", "#ef4444", "#facc15", "#22c55e", "#ffffff"];
const TOOLS = [
  { key: "line", label: "Line" },
  { key: "angle", label: "Angle" },
  { key: "freehand", label: "Pen" },
  { key: "circle", label: "Circle" },
];

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

export default function SwingDetail({ swing, session, onClose, onChanged }) {
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const poseCanvasRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const fps = session?.fps || 30;

  const [tool, setTool] = useState(null);
  const [color, setColor] = useState(COLORS[0]);
  const [shapes, setShapes] = useState([]);
  const [draft, setDraft] = useState(null);
  const [poseOn, setPoseOn] = useState(false);
  const [pose, setPose] = useState(null);
  const [poseStatus, setPoseStatus] = useState("idle"); // idle|loading|ready|none|error
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sizeTick, setSizeTick] = useState(0);
  const [club, setClub] = useState(swing);

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
    [...shapes, draft].filter(Boolean).forEach((s) => drawShape(ctx, s, c.width, c.height));
  }, [shapes, draft, sizeTick]);

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

  // --- drawing pointer handling (coords normalized 0..1 to the video box)
  const norm = (e) => {
    const r = drawCanvasRef.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const onPointerDown = (e) => {
    if (!tool) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = norm(e);
    if (tool === "angle") {
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
    if (!draft) return;
    const p = norm(e);
    if (draft.type === "freehand") setDraft({ ...draft, points: [...draft.points, p] });
    else if (draft.type === "angle") setDraft({ ...draft, hover: p });
    else setDraft({ ...draft, points: [draft.points[0], p] });
  };
  const onPointerUp = () => {
    if (!draft || draft.type === "angle") return;
    commit(draft);
    setDraft(null);
  };
  const commit = (shape) => setShapes((s) => [...s, shape]);
  const undo = () => setShapes((s) => s.slice(0, -1));
  const clear = () => { setShapes([]); setDraft(null); };

  const changeClub = async (c) => {
    setClub({ ...club, ...c });
    try { await updateSwingClub(swing.id, c); onChanged?.(); } catch { /* ignore */ }
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
    <div className="detail-overlay">
      <div className="detail-head">
        <h2>Swing {swing.index + 1} <span className="muted">· {session?.name}</span></h2>
        <button className="link" onClick={onClose}>✕ Close</button>
      </div>

      <div className="detail-body">
        <div className="analysis">
          <div className="toolbar tools">
            {TOOLS.map((t) => (
              <button key={t.key} className={tool === t.key ? "active" : ""}
                onClick={() => setTool(tool === t.key ? null : t.key)}>{t.label}</button>
            ))}
            <span className="swatches">
              {COLORS.map((c) => (
                <button key={c} className={`swatch ${color === c ? "active" : ""}`}
                  style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
              ))}
            </span>
            <button onClick={undo} disabled={!shapes.length}>Undo</button>
            <button onClick={clear} disabled={!shapes.length && !draft}>Clear</button>
            <button className={poseOn ? "active" : ""} onClick={togglePose}>
              {poseStatus === "loading" ? "Pose…" : "Pose overlay"}
            </button>
          </div>
          {(angleHint || poseStatus === "none" || poseStatus === "error") && (
            <p className="hint">
              {angleHint}
              {poseStatus === "none" && "No pose detected in this clip."}
              {poseStatus === "error" && "Couldn't load pose data."}
            </p>
          )}

          <div className="video-stage">
            <div className="video-wrap" ref={wrapRef}>
              <video
                ref={videoRef}
                src={swing.url}
                playsInline
                className="detail-video"
                onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); syncCanvas(); }}
                onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onClick={togglePlay}
              />
              <canvas ref={poseCanvasRef} className="overlay-canvas pose" />
              <canvas
                ref={drawCanvasRef}
                className={`overlay-canvas draw ${tool ? "active" : ""}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            </div>
          </div>

          <div className="controls">
            <button onClick={togglePlay}>{playing ? "❚❚" : "▶"}</button>
            <button onClick={() => stepFrame(-1)} title="Prev frame (←)">‹</button>
            <button onClick={() => stepFrame(1)} title="Next frame (→)">›</button>
            <input type="range" min="0" max={duration || 0} step="0.001" value={time}
              onChange={(e) => seek(parseFloat(e.target.value))} className="scrubber" />
            <span className="muted small time">{fmt(time)} / {fmt(duration)}</span>
          </div>
        </div>

        <aside className="detail-info">
          <h3>Details</h3>
          <dl>
            <dt>Session</dt><dd>{session?.name}</dd>
            <dt>Date</dt><dd>{session?.recorded_date || "—"}</dd>
            <dt>Tags</dt><dd>{session?.tags?.length ? session.tags.map((t) => "#" + t).join(" ") : "—"}</dd>
            <dt>Club</dt><dd><ClubPicker club={club} onChange={changeClub} /></dd>
            <dt>Clip</dt><dd>{fmt(swing.start)} → {fmt(swing.end)} ({(swing.end - swing.start).toFixed(1)}s)</dd>
          </dl>
          <div className="info-actions">
            <a className="btn-link" href={swing.url} download={`swing-${swing.index + 1}.mp4`}>⤓ Export clip</a>
            <button className="del" onClick={removeSwing}>Delete swing</button>
          </div>
          <p className="muted small">Tip: ← / → step one frame · Space play/pause · Esc close</p>
        </aside>
      </div>
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

function drawShape(ctx, s, W, H) {
  const px = (p) => [p.x * W, p.y * H];
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

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
}

const line = (ctx, a, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
const dot = (ctx, p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2); ctx.fill(); };
function angleDeg(v, a, b) {
  const v1 = [a[0] - v[0], a[1] - v[1]], v2 = [b[0] - v[0], b[1] - v[1]];
  const dotp = v1[0] * v2[0] + v1[1] * v2[1];
  const m = Math.hypot(...v1) * Math.hypot(...v2) || 1;
  return Math.acos(Math.max(-1, Math.min(1, dotp / m))) * 180 / Math.PI;
}
