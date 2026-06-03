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
                id         TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                idx        INTEGER NOT NULL,
                start      REAL NOT NULL,
                end        REAL NOT NULL,
                clip_path  TEXT NOT NULL,
                created_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_swings_session ON swings(session_id);
            """
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
              end: float, clip_path: str) -> None:
    with _lock, _connect() as conn:
        conn.execute(
            """INSERT INTO swings (id, session_id, idx, start, end, clip_path, created_at)
               VALUES (?,?,?,?,?,?,?)""",
            (swing_id, session_id, idx, start, end, clip_path, time.time()),
        )


def _swing_row(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "session_id": r["session_id"],
        "index": r["idx"],
        "start": r["start"],
        "end": r["end"],
        "url": f"/api/clips/{r['id']}",
    }


def _session_row(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "name": r["name"],
        "recorded_date": r["recorded_date"],
        "tags": json.loads(r["tags"]),
        "filename": r["filename"],
        "duration": r["duration"],
        "created_at": r["created_at"],
    }


def list_sessions(tag: str | None = None) -> list[dict]:
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
    if tag:
        sessions = [s for s in sessions if tag in s["tags"]]
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
        rows = conn.execute("SELECT tags FROM sessions").fetchall()
    tags: set[str] = set()
    for r in rows:
        tags.update(json.loads(r["tags"]))
    return sorted(tags)
