# ⛳ Golf Swing Splitter

Upload a long practice video, automatically split it into one short clip per
swing, review/adjust the cut points, then watch and download each swing.

How it works: the backend tracks the golfer's body with MediaPipe Pose and
keys on the real swing signature — a sharp spike in **hand speed while the hips
stay planted**. Walking toward/across the camera moves more pixels than a swing
does, so plain pixel-motion detection mistakes it for a swing; gating on planted
hips rejects that. Each detected swing becomes a padded clip window you review
and tweak before exporting.

## Stack
- **Backend** — FastAPI + MediaPipe Pose (swing detection) + OpenCV + bundled ffmpeg (cutting)
- **Frontend** — React (Vite)

The pose model lives at `backend/app/models/pose_landmarker_lite.task`. If it's
missing, download it:
```bash
curl -sSL -o backend/app/models/pose_landmarker_lite.task \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task
```

## Run

**Backend** (port 8000):
```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time
.venv/bin/uvicorn app.main:app --reload
```

**Frontend** (port 5173):
```bash
cd frontend
npm install        # first time
npm run dev
```

Open http://localhost:5173 and upload a video. Start with the small
`Golf-Swing-Vids/rs-3-testswing.mov` (13 MB) for a quick test.

## Tuning detection
Detection parameters live in one `CONFIG` block at the top of
`backend/app/analysis.py`:
- `wrist_speed_mult` / `min_wrist_floor` — swing sensitivity (lower = more swings)
- `max_hip_ratio` — how much body translation is allowed before a burst is
  treated as walking and rejected (lower = stricter)
- `pre_pad` / `post_pad` — clip seconds kept before/after impact
- `merge_gap` — bursts closer than this are treated as one swing

Adjust against your footage; the review step lets you fix any mis-cuts by hand.
