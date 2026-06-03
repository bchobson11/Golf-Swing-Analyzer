"""Pose-based golf swing detection.

Raw pixel motion can't tell a swing from the golfer walking toward the camera
(walking changes more pixels than a planted swing does). Instead we track the
golfer's body with MediaPipe Pose and key on the real swing signature:

    a sharp spike in HAND speed while the HIPS stay planted.

Walking produces high hand *and* hip translation, so it's rejected; a swing
produces high hand speed with low hip translation. All tunables live in CONFIG.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

os.environ.setdefault("GLOG_minloglevel", "3")  # quiet mediapipe C++ logs

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

MODEL_PATH = Path(__file__).resolve().parent / "models" / "pose_landmarker_lite.task"

CONFIG = {
    "sample_fps": 12.0,       # frames per second fed to the pose model
    "proc_width": 360,        # frames downscaled to this width for pose
    "smooth_seconds": 0.25,   # moving-average window for the speed signals
    "wrist_speed_mult": 4.0,  # swing = wrist speed > mult * median wrist speed
    "min_wrist_floor": 12.0,  # absolute floor for the wrist-speed threshold
    "max_hip_ratio": 0.30,    # reject burst if hip_translation/wrist_speed > this
    "merge_gap": 1.0,         # merge swing bursts separated by < this (s)
    "pre_pad": 2.5,           # clip starts this many seconds before impact
    "post_pad": 2.0,          # clip ends this many seconds after impact
}

# MediaPipe Pose landmark indices.
L_WRIST, R_WRIST = 15, 16
L_SHOULDER, R_SHOULDER = 11, 12
L_HIP, R_HIP = 23, 24

ProgressCb = Callable[[float], None]


def detect_swings(path: Path, progress: ProgressCb | None = None) -> list[dict]:
    """Return a list of {start, end, peak} swing windows in seconds."""
    times, wrist, hip, shoulder_w = _track_pose(path, progress)
    if len(times) < 4:
        return []

    torso = float(np.nanmedian(shoulder_w)) or 1e-6
    tc = times[1:]
    dt = np.diff(times)
    dt[dt == 0] = 1e-6

    wrist_speed = np.linalg.norm(np.diff(wrist, axis=0), axis=1) / torso / dt
    hip_speed = np.linalg.norm(np.diff(hip, axis=0), axis=1) / torso / dt

    # Gaps where pose was missing produce NaN; zero them so they're never peaks.
    wrist_speed = np.nan_to_num(wrist_speed, nan=0.0)
    hip_speed = np.nan_to_num(hip_speed, nan=0.0)

    sample_dt = float(np.median(dt))
    wrist_speed = _smooth(wrist_speed, sample_dt, CONFIG["smooth_seconds"])
    hip_speed = _smooth(hip_speed, sample_dt, CONFIG["smooth_seconds"])

    duration = float(times[-1])
    runs = _find_bursts(wrist_speed, tc)
    return _bursts_to_windows(runs, wrist_speed, hip_speed, tc, duration)


def _track_pose(path: Path, progress: ProgressCb | None):
    """Run MediaPipe Pose over sampled frames; return per-sample arrays."""
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Pose model missing: {MODEL_PATH}")

    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    step = max(1, int(round(fps / CONFIG["sample_fps"])))

    options = vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=vision.RunningMode.VIDEO,
    )

    times: list[float] = []
    wrist: list[list[float]] = []
    hip: list[list[float]] = []
    shoulder_w: list[float] = []

    with vision.PoseLandmarker.create_from_options(options) as landmarker:
        idx = 0
        while True:
            if not cap.grab():
                break
            if idx % step == 0:
                ok, frame = cap.retrieve()
                if not ok:
                    break
                small = _downscale(frame, CONFIG["proc_width"])
                mp_img = mp.Image(
                    image_format=mp.ImageFormat.SRGB,
                    data=cv2.cvtColor(small, cv2.COLOR_BGR2RGB),
                )
                t = idx / fps
                result = landmarker.detect_for_video(mp_img, int(t * 1000))
                times.append(t)
                if result.pose_landmarks:
                    p = result.pose_landmarks[0]
                    wrist.append([(p[L_WRIST].x + p[R_WRIST].x) / 2,
                                  (p[L_WRIST].y + p[R_WRIST].y) / 2])
                    hip.append([(p[L_HIP].x + p[R_HIP].x) / 2,
                                (p[L_HIP].y + p[R_HIP].y) / 2])
                    shoulder_w.append(abs(p[L_SHOULDER].x - p[R_SHOULDER].x))
                else:
                    wrist.append([np.nan, np.nan])
                    hip.append([np.nan, np.nan])
                    shoulder_w.append(np.nan)
                if progress and frame_count:
                    progress(min(0.99, idx / frame_count))
            idx += 1
    cap.release()
    if progress:
        progress(1.0)

    return (np.asarray(times), np.asarray(wrist, dtype=float),
            np.asarray(hip, dtype=float), np.asarray(shoulder_w, dtype=float))


def _downscale(frame: np.ndarray, width: int) -> np.ndarray:
    h, w = frame.shape[:2]
    if w > width:
        scale = width / w
        frame = cv2.resize(frame, (width, max(1, int(round(h * scale)))))
    return frame


def _smooth(signal: np.ndarray, sample_dt: float, window_s: float) -> np.ndarray:
    win = max(1, int(round(window_s / sample_dt)))
    if win <= 1:
        return signal
    kernel = np.ones(win) / win
    return np.convolve(signal, kernel, mode="same")


def _find_bursts(wrist_speed: np.ndarray, times: np.ndarray) -> list[tuple[int, int]]:
    """Contiguous index ranges where wrist speed exceeds the swing threshold."""
    median = float(np.median(wrist_speed[wrist_speed > 0])) if np.any(wrist_speed > 0) else 0.0
    threshold = max(CONFIG["min_wrist_floor"], median * CONFIG["wrist_speed_mult"])
    active = wrist_speed > threshold

    runs: list[tuple[int, int]] = []
    start = None
    for i, a in enumerate(active):
        if a and start is None:
            start = i
        elif not a and start is not None:
            runs.append((start, i - 1))
            start = None
    if start is not None:
        runs.append((start, len(active) - 1))

    merged: list[tuple[int, int]] = []
    for run in runs:
        if merged and times[run[0]] - times[merged[-1][1]] < CONFIG["merge_gap"]:
            merged[-1] = (merged[-1][0], run[1])
        else:
            merged.append(run)
    return merged


def _bursts_to_windows(
    runs: list[tuple[int, int]],
    wrist_speed: np.ndarray,
    hip_speed: np.ndarray,
    times: np.ndarray,
    duration: float,
) -> list[dict]:
    pre, post = CONFIG["pre_pad"], CONFIG["post_pad"]
    windows: list[dict] = []
    for s, e in runs:
        wseg = wrist_speed[s : e + 1]
        hseg = hip_speed[s : e + 1]
        wrist_peak = float(wseg.max())
        hip_peak = float(hseg.max())
        # Reject travelling bursts (walking toward/across the camera).
        if wrist_peak <= 0 or hip_peak / wrist_peak > CONFIG["max_hip_ratio"]:
            continue
        impact = float(times[s + int(np.argmax(wseg))])
        start = max(0.0, impact - pre)
        end = min(duration, impact + post)
        windows.append({"start": start, "end": end, "peak": wrist_peak})

    windows = _merge_overlaps(windows)
    if windows:  # normalize peak to 0..1 for display
        mx = max(w["peak"] for w in windows) or 1.0
        for w in windows:
            w["peak"] = round(w["peak"] / mx, 3)
    return windows


def _merge_overlaps(windows: list[dict]) -> list[dict]:
    windows.sort(key=lambda w: w["start"])
    out: list[dict] = []
    for w in windows:
        if out and w["start"] <= out[-1]["end"]:
            out[-1]["end"] = max(out[-1]["end"], w["end"])
            out[-1]["peak"] = max(out[-1]["peak"], w["peak"])
        else:
            out.append(dict(w))
    return out
