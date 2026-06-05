"""In-memory store for uploaded videos, analysis jobs, and exported clips.

Single-user local tool: state lives in process memory; the actual media
files live on disk under data/. Restarting the server forgets the index
but leaves files in place.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
CLIP_DIR = DATA_DIR / "clips"

for _d in (UPLOAD_DIR, CLIP_DIR):
    _d.mkdir(parents=True, exist_ok=True)


@dataclass
class Video:
    id: str
    path: Path
    filename: str
    user_id: int = 0
    duration: float = 0.0
    fps: float = 0.0
    width: int = 0
    height: int = 0


@dataclass
class AnalysisJob:
    video_id: str
    state: Literal["running", "done", "error"] = "running"
    progress: float = 0.0  # 0..1
    segments: list[dict] = field(default_factory=list)  # [{start, end, peak}]
    error: str | None = None


class Store:
    """Transient store for in-flight uploads and analysis jobs.

    Saved swings live in the SQLite library (see db.py); this only holds the
    source video + analysis state between upload and save.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.videos: dict[str, Video] = {}
        self.jobs: dict[str, AnalysisJob] = {}

    def add_video(self, video: Video) -> None:
        with self._lock:
            self.videos[video.id] = video

    def get_video(self, video_id: str) -> Video | None:
        return self.videos.get(video_id)

    def remove_video(self, video_id: str) -> None:
        with self._lock:
            self.videos.pop(video_id, None)
            self.jobs.pop(video_id, None)

    def set_job(self, job: AnalysisJob) -> None:
        with self._lock:
            self.jobs[job.video_id] = job

    def get_job(self, video_id: str) -> AnalysisJob | None:
        return self.jobs.get(video_id)


store = Store()
