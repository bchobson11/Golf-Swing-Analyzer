"""Golf Swing Splitter API.

Upload a video (named/dated/tagged), auto-detect swings via pose analysis,
review the proposed cuts, then SAVE them to the swing library. Saving cuts one
clip per swing, records it in SQLite, and deletes the big source upload.
Downloading a saved clip is the optional "export".
"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from pydantic import BaseModel

from . import analysis, auth, db, video
from .jobs import AnalysisJob, Video, store, UPLOAD_DIR, CLIP_DIR
from .ranges import range_response

app = FastAPI(title="Golf Swing Splitter")

app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("SESSION_SECRET", "dev-secret-change-me"),
    same_site="lax",
    https_only=os.environ.get("COOKIE_SECURE") == "1",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    db.init_db()


# ---------------------------------------------------------------- auth

class GoogleLogin(BaseModel):
    credential: str


class NameUpdate(BaseModel):
    name: str


def _login(request: Request, profile: dict, claim: bool) -> dict:
    user = db.upsert_user(profile)
    # The first real (Google) account adopts the pre-auth library. No-op once
    # the orphan data has been claimed; dev-login never claims.
    if claim:
        db.claim_orphans(user["id"])
    request.session["user_id"] = user["id"]
    return user


@app.post("/api/auth/google")
async def auth_google(body: GoogleLogin, request: Request):
    return _login(request, auth.verify_google(body.credential), claim=True)


@app.post("/api/auth/dev-login")
async def auth_dev_login(request: Request):
    if not auth.DEV_LOGIN:
        raise HTTPException(status_code=404, detail="Not found")
    return _login(request, {"google_sub": "dev:local", "email": "dev@local",
                            "name": "Dev User", "picture": ""}, claim=False)


@app.get("/api/auth/me")
async def auth_me(request: Request):
    user = auth.current_user_optional(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@app.patch("/api/auth/me")
async def auth_update(body: NameUpdate, user: dict = auth.CurrentUser):
    db.update_user_name(user["id"], body.name.strip() or user["name"])
    return db.get_user(user["id"])


@app.post("/api/auth/logout")
async def auth_logout(request: Request):
    request.session.clear()
    return {"ok": True}


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


class SwingMeta(BaseModel):
    name: str | None = None
    favorite: bool | None = None
    tags: list[str] | None = None
    notes: str | None = None
    direction: str | None = None
    shape: str | None = None
    contact: str | None = None
    compression: str | None = None


class SessionUpdate(BaseModel):
    name: str
    recorded_date: str | None = None


class SessionTagChanges(BaseModel):
    add: list[str] = []
    remove: list[str] = []


class TagBody(BaseModel):
    name: str


# ---------------------------------------------------------------- upload + analyze

@app.post("/api/upload")
async def upload(file: UploadFile, user: dict = auth.CurrentUser):
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
        user_id=user["id"], duration=meta["duration"], fps=meta["fps"],
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


def _own_video(video_id: str, user: dict):
    v = store.get_video(video_id)
    if not v or v.user_id != user["id"]:
        raise HTTPException(status_code=404, detail="Video not found")
    return v


@app.post("/api/analyze/{video_id}")
async def start_analysis(video_id: str, background: BackgroundTasks, user: dict = auth.CurrentUser):
    _own_video(video_id, user)
    store.set_job(AnalysisJob(video_id=video_id))
    background.add_task(_run_analysis, video_id)
    return {"state": "running"}


@app.get("/api/analyze/{video_id}")
async def analysis_status(video_id: str, user: dict = auth.CurrentUser):
    _own_video(video_id, user)
    job = store.get_job(video_id)
    if not job:
        raise HTTPException(status_code=404, detail="No analysis for this video")
    return {"state": job.state, "progress": job.progress,
            "segments": job.segments, "error": job.error}


@app.get("/api/video/{video_id}")
async def serve_video(video_id: str, request: Request, user: dict = auth.CurrentUser):
    v = _own_video(video_id, user)
    if not v.path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    return range_response(request, v.path)


# ---------------------------------------------------------------- save to library

@app.post("/api/save/{video_id}")
async def save(video_id: str, req: SaveRequest, user: dict = auth.CurrentUser):
    v = _own_video(video_id, user)

    # The upload tags become each swing's default tags (tags live on swings).
    default_tags = [t.strip() for t in req.tags if t.strip()]
    db.create_session(
        user["id"], video_id, req.name.strip() or v.filename, req.recorded_date, default_tags,
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
                     club_specific=seg.club_specific, club_generic=seg.club_generic,
                     tags=default_tags)

    # The library only needs the small clips, so drop the big source upload.
    v.path.unlink(missing_ok=True)
    store.remove_video(video_id)

    sessions = [s for s in db.list_sessions(user["id"]) if s["id"] == video_id]
    return sessions[0] if sessions else {"id": video_id}


# ---------------------------------------------------------------- library

@app.get("/api/library")
async def library(user: dict = auth.CurrentUser):
    return {"sessions": db.list_sessions(user["id"]), "tags": db.list_tags(user["id"])}


# ---------------------------------------------------------------- tag management

@app.post("/api/tags")
async def create_tag(body: TagBody, user: dict = auth.CurrentUser):
    tag = db.create_tag(user["id"], body.name)
    if not tag:
        raise HTTPException(status_code=400, detail="Invalid tag name")
    return tag


@app.patch("/api/tags/{tag_id}")
async def rename_tag(tag_id: int, body: TagBody, user: dict = auth.CurrentUser):
    if not db.rename_tag(user["id"], tag_id, body.name):
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"ok": True}


@app.delete("/api/tags/{tag_id}")
async def delete_tag(tag_id: int, user: dict = auth.CurrentUser):
    if not db.delete_tag(user["id"], tag_id):
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"ok": True}


@app.get("/api/clips/{swing_id}")
async def serve_clip(swing_id: str, request: Request, user: dict = auth.CurrentUser):
    path = db.get_clip_path(user["id"], swing_id)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Clip not found")
    return range_response(request, path)


def _pose_sidecar(clip_path: Path) -> Path:
    return clip_path.with_suffix(".pose.json")


# Sync def -> runs in a threadpool; pose compute is blocking and first-hit only.
@app.get("/api/clips/{swing_id}/pose")
def serve_pose(swing_id: str, user: dict = Depends(auth.current_user)):
    path = db.get_clip_path(user["id"], swing_id)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Clip not found")
    sidecar = _pose_sidecar(path)
    if sidecar.exists():
        return json.loads(sidecar.read_text())
    data = analysis.compute_pose_overlay(path)  # computed once, then cached
    sidecar.write_text(json.dumps(data))
    return data


@app.patch("/api/swings/{swing_id}/club")
async def set_swing_club(swing_id: str, body: ClubUpdate, user: dict = auth.CurrentUser):
    if not db.update_swing_club(user["id"], swing_id, body.club_specific, body.club_generic):
        raise HTTPException(status_code=404, detail="Swing not found")
    return {"ok": True}


@app.patch("/api/swings/{swing_id}")
async def set_swing_meta(swing_id: str, body: SwingMeta, user: dict = auth.CurrentUser):
    # Only update fields the client actually sent (so null can clear a value).
    fields = {f: getattr(body, f) for f in body.model_fields_set}
    if "tags" in fields and fields["tags"] is not None:
        fields["tags"] = [t.strip() for t in fields["tags"] if t.strip()]
    if not db.update_swing_meta(user["id"], swing_id, fields):
        raise HTTPException(status_code=404, detail="Swing not found")
    return {"ok": True}


@app.delete("/api/swings/{swing_id}")
async def remove_swing(swing_id: str, user: dict = auth.CurrentUser):
    path = db.delete_swing(user["id"], swing_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Swing not found")
    path.unlink(missing_ok=True)
    _pose_sidecar(path).unlink(missing_ok=True)
    return {"ok": True}


@app.patch("/api/sessions/{session_id}")
async def edit_session(session_id: str, body: SessionUpdate, user: dict = auth.CurrentUser):
    if not db.update_session(user["id"], session_id, body.name.strip(), body.recorded_date):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


# "Retag" on the session edit page adds/removes tags common to all swings,
# leaving swing-specific (partial) tags untouched.
@app.patch("/api/sessions/{session_id}/tags")
async def retag_session(session_id: str, body: SessionTagChanges, user: dict = auth.CurrentUser):
    add = [t.strip() for t in body.add if t.strip()]
    remove = [t.strip() for t in body.remove if t.strip()]
    if not db.apply_swing_tag_changes(user["id"], session_id, add, remove):
        raise HTTPException(status_code=404, detail="Session has no swings")
    return {"ok": True}


@app.delete("/api/sessions/{session_id}")
async def remove_session(session_id: str, user: dict = auth.CurrentUser):
    for path in db.delete_session(user["id"], session_id):
        path.unlink(missing_ok=True)
        _pose_sidecar(path).unlink(missing_ok=True)
    return {"ok": True}
