"""Golf Swing Splitter API.

Upload a video (named/dated/tagged), auto-detect swings via pose analysis,
review the proposed cuts, then SAVE them to the swing library. Saving cuts one
clip per swing, records it in SQLite, and deletes the big source upload.
Downloading a saved clip is the optional "export".
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import analysis, db, video
from .jobs import AnalysisJob, Video, store, UPLOAD_DIR, CLIP_DIR
from .ranges import range_response

app = FastAPI(title="Golf Swing Splitter")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    db.init_db()


class Segment(BaseModel):
    start: float
    end: float
    club_specific: str | None = None
    club_generic: str | None = None


class SaveRequest(BaseModel):
    name: str
    recorded_date: str | None = None
    tags: list[str] = []
    segments: list[Segment]


class ClubUpdate(BaseModel):
    club_specific: str | None = None
    club_generic: str | None = None


# ---------------------------------------------------------------- upload + analyze

@app.post("/api/upload")
async def upload(file: UploadFile):
    video_id = uuid.uuid4().hex[:12]
    ext = "." + file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else ".mov"
    dest = UPLOAD_DIR / f"{video_id}{ext}"

    with dest.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            out.write(chunk)

    try:
        meta = video.probe(dest)
    except ValueError as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(e))

    store.add_video(Video(
        id=video_id, path=dest, filename=file.filename or dest.name,
        duration=meta["duration"], fps=meta["fps"],
        width=meta["width"], height=meta["height"],
    ))
    return {"id": video_id, "filename": file.filename, **meta}


def _run_analysis(video_id: str) -> None:
    job = store.get_job(video_id)
    v = store.get_video(video_id)
    if not job or not v:
        return
    try:
        job.segments = analysis.detect_swings(
            v.path, progress=lambda p: setattr(job, "progress", p)
        )
        job.state = "done"
    except Exception as e:  # noqa: BLE001 - surface any failure to the client
        job.state = "error"
        job.error = str(e)


@app.post("/api/analyze/{video_id}")
async def start_analysis(video_id: str, background: BackgroundTasks):
    if not store.get_video(video_id):
        raise HTTPException(status_code=404, detail="Video not found")
    store.set_job(AnalysisJob(video_id=video_id))
    background.add_task(_run_analysis, video_id)
    return {"state": "running"}


@app.get("/api/analyze/{video_id}")
async def analysis_status(video_id: str):
    job = store.get_job(video_id)
    if not job:
        raise HTTPException(status_code=404, detail="No analysis for this video")
    return {"state": job.state, "progress": job.progress,
            "segments": job.segments, "error": job.error}


@app.get("/api/video/{video_id}")
async def serve_video(video_id: str, request: Request):
    v = store.get_video(video_id)
    if not v or not v.path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    return range_response(request, v.path)


# ---------------------------------------------------------------- save to library

@app.post("/api/save/{video_id}")
async def save(video_id: str, req: SaveRequest):
    v = store.get_video(video_id)
    if not v:
        raise HTTPException(status_code=404, detail="Video not found")

    db.create_session(
        video_id, req.name.strip() or v.filename, req.recorded_date,
        [t.strip() for t in req.tags if t.strip()],
        {"filename": v.filename, "duration": v.duration, "fps": v.fps,
         "width": v.width, "height": v.height},
    )

    for i, seg in enumerate(sorted(req.segments, key=lambda s: s.start)):
        swing_id = f"{video_id}_{i:03d}"
        out = CLIP_DIR / f"{swing_id}.mp4"
        try:
            video.cut_clip(v.path, out, seg.start, seg.end)
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e))
        db.add_swing(swing_id, video_id, i, seg.start, seg.end, str(out),
                     club_specific=seg.club_specific, club_generic=seg.club_generic)

    # The library only needs the small clips, so drop the big source upload.
    v.path.unlink(missing_ok=True)
    store.remove_video(video_id)

    sessions = [s for s in db.list_sessions() if s["id"] == video_id]
    return sessions[0] if sessions else {"id": video_id}


# ---------------------------------------------------------------- library

@app.get("/api/library")
async def library(tag: str | None = None):
    return {"sessions": db.list_sessions(tag), "tags": db.all_tags()}


@app.get("/api/clips/{swing_id}")
async def serve_clip(swing_id: str, request: Request):
    path = db.get_clip_path(swing_id)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Clip not found")
    return range_response(request, path)


def _pose_sidecar(clip_path: Path) -> Path:
    return clip_path.with_suffix(".pose.json")


# Sync def -> runs in a threadpool; pose compute is blocking and first-hit only.
@app.get("/api/clips/{swing_id}/pose")
def serve_pose(swing_id: str):
    path = db.get_clip_path(swing_id)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Clip not found")
    sidecar = _pose_sidecar(path)
    if sidecar.exists():
        return json.loads(sidecar.read_text())
    data = analysis.compute_pose_overlay(path)  # computed once, then cached
    sidecar.write_text(json.dumps(data))
    return data


@app.patch("/api/swings/{swing_id}/club")
async def set_swing_club(swing_id: str, body: ClubUpdate):
    if not db.update_swing_club(swing_id, body.club_specific, body.club_generic):
        raise HTTPException(status_code=404, detail="Swing not found")
    return {"ok": True}


@app.delete("/api/swings/{swing_id}")
async def remove_swing(swing_id: str):
    path = db.delete_swing(swing_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Swing not found")
    path.unlink(missing_ok=True)
    _pose_sidecar(path).unlink(missing_ok=True)
    return {"ok": True}


@app.delete("/api/sessions/{session_id}")
async def remove_session(session_id: str):
    for path in db.delete_session(session_id):
        path.unlink(missing_ok=True)
        _pose_sidecar(path).unlink(missing_ok=True)
    return {"ok": True}
