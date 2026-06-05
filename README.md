# ⛳ Swing Library

Upload a long practice video (with a name, date, and tags), automatically split
it into one clip per swing, review/adjust the cut points, then **save the swings
to a personal library** you can come back to anytime. Saved swings are browsable
as a flat gallery or grouped by session, and filterable by tag. Downloading a
clip is an optional export.

How detection works: the backend tracks the golfer's body with MediaPipe Pose
and keys on the real swing signature — a sharp spike in **hand speed while the
hips stay planted**. Walking toward/across the camera moves more pixels than a
swing does, so plain pixel-motion detection mistakes it for a swing; gating on
planted hips rejects that. Each detected swing becomes a padded clip window you
review and tweak before saving.

Saved swings persist in a SQLite database (`backend/data/golf.db`); each is a
small mp4 in `backend/data/clips/`. Once a video's swings are saved, the large
source upload is deleted — the library keeps only the clips + metadata.

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
GOOGLE_CLIENT_ID=<your-client-id> SESSION_SECRET=<random-string> \
  .venv/bin/uvicorn app.main:app --reload
```

**Frontend** (port 5173):
```bash
cd frontend
npm install        # first time
cp .env.example .env   # then set VITE_GOOGLE_CLIENT_ID
npm run dev
```

Open http://localhost:5173, sign in, and upload a video. Start with the small
`Golf-Swing-Vids/rs-3-testswing.mov` (13 MB) for a quick test.

## Sign-in (Google)

The app is multi-user: each user's swings/sessions/tags are private. Sign-in
uses **Sign in with Google**.

1. In Google Cloud Console, configure the OAuth consent screen and create an
   **OAuth 2.0 Client ID → Web application**. Add Authorized JavaScript origin
   `http://localhost:5173` (and your deployed origin later).
2. Set the same client ID in **both** `frontend/.env` (`VITE_GOOGLE_CLIENT_ID`)
   and the backend env (`GOOGLE_CLIENT_ID`). Set a `SESSION_SECRET` for the
   signed session cookie. For production set `COOKIE_SECURE=1` (HTTPS) and
   `FRONTEND_ORIGIN`.
3. The **first** Google account to sign in adopts any pre-auth library data.

**Local testing without Google:** run the backend with `AUTH_DEV_LOGIN=1` to
expose a "Dev sign in" button (a throwaway account; it never claims pre-auth
data). Disable it in production.

## Tuning detection
Detection parameters live in one `CONFIG` block at the top of
`backend/app/analysis.py`:
- `wrist_speed_mult` / `min_wrist_floor` — swing sensitivity (lower = more swings)
- `max_hip_ratio` — how much body translation is allowed before a burst is
  treated as walking and rejected (lower = stricter)
- `pre_pad` / `post_pad` — clip seconds kept before/after impact
- `merge_gap` — bursts closer than this are treated as one swing

Adjust against your footage; the review step lets you fix any mis-cuts by hand.
