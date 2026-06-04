"""SQLite persistence for the swing library.

A *session* is one uploaded video (with a name, recorded date, and tags); it
owns N *swings*, each a saved clip on disk. The big source upload is deleted
once its swings are saved, so the library holds only the small clips + metadata.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path

from .jobs import DATA_DIR

DB_PATH = DATA_DIR / "golf.db"
_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id            TEXT PRIMARY KEY,
                name          TEXT NOT NULL,
                recorded_date TEXT,
                tags          TEXT NOT NULL DEFAULT '[]',
                filename      TEXT,
                duration      REAL,
                fps           REAL,
                width         INTEGER,
                height        INTEGER,
                created_at    REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS swings (
                id            TEXT PRIMARY KEY,
                session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                idx           INTEGER NOT NULL,
                start         REAL NOT NULL,
                end           REAL NOT NULL,
                clip_path     TEXT NOT NULL,
                club_specific TEXT,
                club_generic  TEXT,
                tags          TEXT NOT NULL DEFAULT '[]',
                notes         TEXT NOT NULL DEFAULT '',
                direction     TEXT,
                shape         TEXT,
                contact       TEXT,
                compression   TEXT,
                created_at    REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_swings_session ON swings(session_id);
            """
        )
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(swings)")}
        if "club_specific" not in cols:
            conn.execute("ALTER TABLE swings ADD COLUMN club_specific TEXT")
        if "club_generic" not in cols:
            conn.execute("ALTER TABLE swings ADD COLUMN club_generic TEXT")
        if "notes" not in cols:
            conn.execute("ALTER TABLE swings ADD COLUMN notes TEXT NOT NULL DEFAULT ''")
        for col in ("shape", "contact", "compression", "direction"):
            if col not in cols:
                conn.execute(f"ALTER TABLE swings ADD COLUMN {col} TEXT")
        # Tags moved from sessions to swings: add the column and, the first time,
        # seed each swing with its session's tags so existing data is preserved.
        if "tags" not in cols:
            conn.execute("ALTER TABLE swings ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'")
            conn.execute(
                "UPDATE swings SET tags = COALESCE("
                "(SELECT tags FROM sessions WHERE sessions.id = swings.session_id), '[]')"
            )


def create_session(session_id: str, name: str, recorded_date: str | None,
                    tags: list[str], meta: dict) -> None:
    with _lock, _connect() as conn:
        conn.execute(
            """INSERT INTO sessions
               (id, name, recorded_date, tags, filename, duration, fps, width, height, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (session_id, name, recorded_date, json.dumps(tags), meta.get("filename"),
             meta.get("duration"), meta.get("fps"), meta.get("width"),
             meta.get("height"), time.time()),
        )


def add_swing(swing_id: str, session_id: str, idx: int, start: float,
              end: float, clip_path: str, club_specific: str | None = None,
              club_generic: str | None = None, tags: list[str] | None = None,
              notes: str = "") -> None:
    with _lock, _connect() as conn:
        conn.execute(
            """INSERT INTO swings
               (id, session_id, idx, start, end, clip_path, club_specific,
                club_generic, tags, notes, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (swing_id, session_id, idx, start, end, clip_path, club_specific,
             club_generic, json.dumps(tags or []), notes, time.time()),
        )


def update_swing_club(swing_id: str, club_specific: str | None,
                      club_generic: str | None) -> bool:
    with _lock, _connect() as conn:
        cur = conn.execute(
            "UPDATE swings SET club_specific = ?, club_generic = ? WHERE id = ?",
            (club_specific, club_generic, swing_id),
        )
    return cur.rowcount > 0


_SWING_META_COLS = {"tags", "notes", "direction", "shape", "contact", "compression"}


def update_swing_meta(swing_id: str, fields: dict) -> bool:
    """Update the given swing columns. `fields` keys must be in _SWING_META_COLS;
    a value of None clears that column (e.g. unset a result). tags is stored as
    JSON."""
    sets, vals = [], []
    for col, v in fields.items():
        if col not in _SWING_META_COLS:
            continue
        sets.append(f"{col} = ?")
        vals.append(json.dumps(v or []) if col == "tags" else v)
    if not sets:
        return True
    vals.append(swing_id)
    with _lock, _connect() as conn:
        cur = conn.execute(f"UPDATE swings SET {', '.join(sets)} WHERE id = ?", vals)
    return cur.rowcount > 0


def update_session(session_id: str, name: str, recorded_date: str | None) -> bool:
    with _lock, _connect() as conn:
        cur = conn.execute(
            "UPDATE sessions SET name = ?, recorded_date = ? WHERE id = ?",
            (name, recorded_date, session_id),
        )
    return cur.rowcount > 0


def apply_swing_tag_changes(session_id: str, add: list[str],
                            remove: list[str]) -> bool:
    """Add/remove tags across every swing in a session, preserving each swing's
    other (swing-specific) tags. Used by the session-page 'retag', which only
    touches tags common to all swings."""
    rem = set(remove)
    with _lock, _connect() as conn:
        rows = conn.execute(
            "SELECT id, tags FROM swings WHERE session_id = ?", (session_id,)
        ).fetchall()
        if not rows:
            return False
        for r in rows:
            kept = [t for t in json.loads(r["tags"]) if t not in rem]
            for t in add:
                if t not in kept:
                    kept.append(t)
            conn.execute("UPDATE swings SET tags = ? WHERE id = ?",
                         (json.dumps(kept), r["id"]))
    return True


def _swing_row(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "session_id": r["session_id"],
        "index": r["idx"],
        "start": r["start"],
        "end": r["end"],
        "club_specific": r["club_specific"],
        "club_generic": r["club_generic"],
        "tags": json.loads(r["tags"]),
        "notes": r["notes"],
        "direction": r["direction"],
        "shape": r["shape"],
        "contact": r["contact"],
        "compression": r["compression"],
        "url": f"/api/clips/{r['id']}",
    }


def _session_row(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "name": r["name"],
        "recorded_date": r["recorded_date"],
        "filename": r["filename"],
        "duration": r["duration"],
        "fps": r["fps"],
        "created_at": r["created_at"],
    }


def list_sessions() -> list[dict]:
    """All sessions (newest first) with their swings nested."""
    with _connect() as conn:
        sessions = [
            _session_row(r)
            for r in conn.execute("SELECT * FROM sessions ORDER BY created_at DESC")
        ]
        swings = conn.execute("SELECT * FROM swings ORDER BY idx").fetchall()
    by_session: dict[str, list[dict]] = {}
    for r in swings:
        by_session.setdefault(r["session_id"], []).append(_swing_row(r))
    for s in sessions:
        s["swings"] = by_session.get(s["id"], [])
    return sessions


def get_clip_path(swing_id: str) -> Path | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT clip_path FROM swings WHERE id = ?", (swing_id,)
        ).fetchone()
    return Path(row["clip_path"]) if row else None


def delete_swing(swing_id: str) -> Path | None:
    """Remove a swing row; return its clip path so the caller can unlink it."""
    with _lock, _connect() as conn:
        row = conn.execute(
            "SELECT clip_path FROM swings WHERE id = ?", (swing_id,)
        ).fetchone()
        if not row:
            return None
        conn.execute("DELETE FROM swings WHERE id = ?", (swing_id,))
    return Path(row["clip_path"])


def delete_session(session_id: str) -> list[Path]:
    """Remove a session and its swings; return clip paths to unlink."""
    with _lock, _connect() as conn:
        rows = conn.execute(
            "SELECT clip_path FROM swings WHERE session_id = ?", (session_id,)
        ).fetchall()
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))  # cascades
    return [Path(r["clip_path"]) for r in rows]


def all_tags() -> list[str]:
    with _connect() as conn:
        rows = conn.execute("SELECT tags FROM swings").fetchall()
    tags: set[str] = set()
    for r in rows:
        tags.update(json.loads(r["tags"]))
    return sorted(tags)
