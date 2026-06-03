"""Golf Swing Splitter API.

Upload a video, auto-detect swings via motion analysis, review the proposed
cut windows, then export one clip per swing.
"""
from __future__ import annotations

import shutil
import uuid

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import analysis, video
from .jobs import AnalysisJob, Clip, Video, store, UPLOAD_DIR, CLIP_DIR
from .ranges import range_response

app = FastAPI(title="Golf Swing Splitter")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Segment(BaseModel):
    start: float
    end: float


class ExportRequest(BaseModel):
    segments: list[Segment]


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

    v = Video(
        id=video_id,
        path=dest,
        filename=file.filename or dest.name,
        duration=meta["duration"],
        fps=meta["fps"],
        width=meta["width"],
        height=meta["height"],
    )
    store.add_video(v)
    return {
        "id": v.id,
        "filename": v.filename,
        "duration": v.duration,
        "fps": v.fps,
        "width": v.width,
        "height": v.height,
    }


def _run_analysis(video_id: str) -> None:
    job = store.get_job(video_id)
    v = store.get_video(video_id)
    if not job or not v:
        return
    try:
        segments = analysis.detect_swings(
            v.path, progress=lambda p: setattr(job, "progress", p)
        )
        job.segments = segments
        job.state = "done"
    except Exception as e:  # noqa: BLE001 - surface any failure to the client
        job.state = "error"
        job.error = str(e)


@app.post("/api/analyze/{video_id}")
async def start_analysis(video_id: str, background: BackgroundTasks):
    v = store.get_video(video_id)
    if not v:
        raise HTTPException(status_code=404, detail="Video not found")
    store.set_job(AnalysisJob(video_id=video_id))
    background.add_task(_run_analysis, video_id)
    return {"state": "running"}


@app.get("/api/analyze/{video_id}")
async def analysis_status(video_id: str):
    job = store.get_job(video_id)
    if not job:
        raise HTTPException(status_code=404, detail="No analysis for this video")
    return {
        "state": job.state,
        "progress": job.progress,
        "segments": job.segments,
        "error": job.error,
    }


@app.get("/api/video/{video_id}")
async def serve_video(video_id: str, request: Request):
    v = store.get_video(video_id)
    if not v or not v.path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    return range_response(request, v.path)


@app.post("/api/export/{video_id}")
async def export(video_id: str, req: ExportRequest):
    v = store.get_video(video_id)
    if not v:
        raise HTTPException(status_code=404, detail="Video not found")

    clips = []
    for i, seg in enumerate(req.segments):
        clip_id = f"{video_id}_{i:03d}_{uuid.uuid4().hex[:6]}"
        out = CLIP_DIR / f"{clip_id}.mp4"
        try:
            video.cut_clip(v.path, out, seg.start, seg.end)
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e))
        clip = Clip(
            id=clip_id, video_id=video_id, path=out, index=i,
            start=seg.start, end=seg.end,
        )
        store.add_clip(clip)
        clips.append({
            "id": clip_id,
            "index": i,
            "start": seg.start,
            "end": seg.end,
            "url": f"/api/clips/{clip_id}",
        })
    return {"clips": clips}


@app.get("/api/clips/{clip_id}")
async def serve_clip(clip_id: str, request: Request):
    clip = store.get_clip(clip_id)
    if not clip or not clip.path.exists():
        raise HTTPException(status_code=404, detail="Clip not found")
    return range_response(request, clip.path)
