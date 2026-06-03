"""Video metadata probing and clip cutting via the bundled ffmpeg."""
from __future__ import annotations

import subprocess
from pathlib import Path

import cv2
import imageio_ffmpeg


def probe(path: Path) -> dict:
    """Read basic metadata with OpenCV."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    duration = frame_count / fps if fps else 0.0
    return {
        "fps": float(fps),
        "duration": float(duration),
        "width": width,
        "height": height,
    }


def cut_clip(src: Path, out: Path, start: float, end: float) -> None:
    """Cut [start, end] from src into a browser-friendly mp4 (re-encoded).

    Re-encoding gives frame-accurate cuts and guarantees H.264/AAC playback
    regardless of the source .mov codec. `-ss` before `-i` enables fast seek.
    """
    duration = max(0.1, end - start)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg,
        "-y",
        "-ss", f"{start:.3f}",
        "-i", str(src),
        "-t", f"{duration:.3f}",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-c:a", "aac",
        "-movflags", "+faststart",
        str(out),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr[-800:]}")
