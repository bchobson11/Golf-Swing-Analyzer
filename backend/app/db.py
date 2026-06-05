"""SQLite persistence for the swing library (multi-user).

A *session* is one uploaded video owned by a user; it owns N *swings* (saved
clips). *Tags* are per-user. All data functions are scoped to a user_id; swing-
level functions check ownership through the swing's session.
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

# Subquery that limits to sessions owned by a user.
_OWNED = "session_id IN (SELECT id FROM sessions WHERE user_id = ?)"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                google_sub TEXT UNIQUE,
                email      TEXT,
                name       TEXT,
                picture    TEXT,
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id            TEXT PRIMARY KEY,
                user_id       INTEGER,
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
                name          TEXT,
                favorite      INTEGER NOT NULL DEFAULT 0,
                tags          TEXT NOT NULL DEFAULT '[]',
                notes         TEXT NOT NULL DEFAULT '',
                direction     TEXT,
                shape         TEXT,
                contact       TEXT,
                compression   TEXT,
                created_at    REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_swings_session ON swings(session_id);
            CREATE TABLE IF NOT EXISTS tags (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                name    TEXT NOT NULL,
                UNIQUE(user_id, name)
            );
            """
        )
        # --- swing column migrations (older DBs) ---
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(swings)")}
        for col in ("club_specific", "club_generic", "shape", "contact",
                    "compression", "direction", "name"):
            if col not in cols:
                conn.execute(f"ALTER TABLE swings ADD COLUMN {col} TEXT")
        if "notes" not in cols:
            conn.execute("ALTER TABLE swings ADD COLUMN notes TEXT NOT NULL DEFAULT ''")
        if "favorite" not in cols:
            conn.execute("ALTER TABLE swings ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0")
        if "tags" not in cols:
            conn.execute("ALTER TABLE swings ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'")
            conn.execute(
                "UPDATE swings SET tags = COALESCE("
                "(SELECT tags FROM sessions WHERE sessions.id = swings.session_id), '[]')"
            )
        # --- multi-user migrations ---
        scols = {r["name"] for r in conn.execute("PRAGMA table_info(sessions)")}
        if "user_id" not in scols:
            conn.execute("ALTER TABLE sessions ADD COLUMN user_id INTEGER")
        tcols = {r["name"] for r in conn.execute("PRAGMA table_info(tags)")}
        if "user_id" not in tcols:
            # Rebuild the global tags table into a per-user one (names kept,
            # owner NULL until claimed on first login).
            conn.executescript(
                """
                CREATE TABLE tags_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER, name TEXT NOT NULL, UNIQUE(user_id, name));
                INSERT INTO tags_new(id, user_id, name) SELECT id, NULL, name FROM tags;
                DROP TABLE tags;
                ALTER TABLE tags_new RENAME TO tags;
                """
            )
            # Safety: ensure every swing tag name exists as a tag row.
            conn.execute(
                "INSERT INTO tags(user_id, name) SELECT NULL, v FROM "
                "(SELECT DISTINCT value v FROM swings, json_each(swings.tags)) "
                "WHERE v NOT IN (SELECT name FROM tags WHERE user_id IS NULL)"
            )


# ---------------------------------------------------------------- users

def user_count() -> int:
    with _connect() as conn:
        return conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]


def _user_row(r: sqlite3.Row | None) -> dict | None:
    if not r:
        return None
    return {"id": r["id"], "email": r["email"], "name": r["name"], "picture": r["picture"]}


def get_user(user_id: int) -> dict | None:
    with _connect() as conn:
        return _user_row(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


def upsert_user(profile: dict) -> dict:
    """Insert or refresh a user by google_sub. The display name is set only on
    first creation (so a user's edited name survives later logins)."""
    with _lock, _connect() as conn:
        conn.execute(
            """INSERT INTO users(google_sub, email, name, picture, created_at)
               VALUES (?,?,?,?,?)
               ON CONFLICT(google_sub) DO UPDATE SET
                   email = excluded.email, picture = excluded.picture""",
            (profile["google_sub"], profile.get("email", ""), profile.get("name", "Golfer"),
             profile.get("picture", ""), time.time()),
        )
        row = conn.execute("SELECT * FROM users WHERE google_sub = ?", (profile["google_sub"],)).fetchone()
    return _user_row(row)


def update_user_name(user_id: int, name: str) -> bool:
    with _lock, _connect() as conn:
        cur = conn.execute("UPDATE users SET name = ? WHERE id = ?", (name, user_id))
    return cur.rowcount > 0


def claim_orphans(user_id: int) -> None:
    """Assign all unowned (NULL user_id) data to this user. Used once for the
    very first account so the pre-auth library isn't lost."""
    with _lock, _connect() as conn:
        conn.execute("UPDATE sessions SET user_id = ? WHERE user_id IS NULL", (user_id,))
        conn.execute("UPDATE tags SET user_id = ? WHERE user_id IS NULL", (user_id,))


# ---------------------------------------------------------------- sessions / swings

def create_session(user_id: int, session_id: str, name: str, recorded_date: str | None,
                   tags: list[str], meta: dict) -> None:
    with _lock, _connect() as conn:
        conn.execute(
            """INSERT INTO sessions
               (id, user_id, name, recorded_date, tags, filename, duration, fps, width, height, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (session_id, user_id, name, recorded_date, json.dumps(tags), meta.get("filename"),
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


def update_swing_club(user_id: int, swing_id: str, club_specific: str | None,
                      club_generic: str | None) -> bool:
    with _lock, _connect() as conn:
        cur = conn.execute(
            f"UPDATE swings SET club_specific = ?, club_generic = ? WHERE id = ? AND {_OWNED}",
            (club_specific, club_generic, swing_id, user_id),
        )
    return cur.rowcount > 0


_SWING_META_COLS = {"name", "favorite", "tags", "notes", "direction", "shape", "contact", "compression"}


def update_swing_meta(user_id: int, swing_id: str, fields: dict) -> bool:
    sets, vals = [], []
    for col, v in fields.items():
        if col not in _SWING_META_COLS:
            continue
        sets.append(f"{col} = ?")
        vals.append(json.dumps(v or []) if col == "tags" else v)
    if not sets:
        return True
    vals += [swing_id, user_id]
    with _lock, _connect() as conn:
        cur = conn.execute(f"UPDATE swings SET {', '.join(sets)} WHERE id = ? AND {_OWNED}", vals)
    return cur.rowcount > 0


def update_session(user_id: int, session_id: str, name: str, recorded_date: str | None) -> bool:
    with _lock, _connect() as conn:
        cur = conn.execute(
            "UPDATE sessions SET name = ?, recorded_date = ? WHERE id = ? AND user_id = ?",
            (name, recorded_date, session_id, user_id),
        )
    return cur.rowcount > 0


def apply_swing_tag_changes(user_id: int, session_id: str, add: list[str],
                            remove: list[str]) -> bool:
    rem = set(remove)
    with _lock, _connect() as conn:
        owner = conn.execute("SELECT user_id FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not owner or owner["user_id"] != user_id:
            return False
        rows = conn.execute("SELECT id, tags FROM swings WHERE session_id = ?", (session_id,)).fetchall()
        if not rows:
            return False
        for r in rows:
            kept = [t for t in json.loads(r["tags"]) if t not in rem]
            for t in add:
                if t not in kept:
                    kept.append(t)
            conn.execute("UPDATE swings SET tags = ? WHERE id = ?", (json.dumps(kept), r["id"]))
    return True


def _swing_row(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"], "session_id": r["session_id"], "index": r["idx"],
        "start": r["start"], "end": r["end"], "name": r["name"],
        "favorite": bool(r["favorite"]),
        "club_specific": r["club_specific"], "club_generic": r["club_generic"],
        "tags": json.loads(r["tags"]), "notes": r["notes"],
        "direction": r["direction"], "shape": r["shape"],
        "contact": r["contact"], "compression": r["compression"],
        "url": f"/api/clips/{r['id']}",
    }


def _session_row(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"], "name": r["name"], "recorded_date": r["recorded_date"],
        "filename": r["filename"], "duration": r["duration"], "fps": r["fps"],
        "created_at": r["created_at"],
    }


def list_sessions(user_id: int) -> list[dict]:
    """A user's sessions (newest first) with their swings nested."""
    with _connect() as conn:
        sessions = [
            _session_row(r) for r in conn.execute(
                "SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC", (user_id,))
        ]
        swings = conn.execute(
            f"SELECT * FROM swings WHERE {_OWNED} ORDER BY idx", (user_id,)).fetchall()
    by_session: dict[str, list[dict]] = {}
    for r in swings:
        by_session.setdefault(r["session_id"], []).append(_swing_row(r))
    for s in sessions:
        s["swings"] = by_session.get(s["id"], [])
    return sessions


def get_clip_path(user_id: int, swing_id: str) -> Path | None:
    with _connect() as conn:
        row = conn.execute(
            f"SELECT clip_path FROM swings WHERE id = ? AND {_OWNED}", (swing_id, user_id)).fetchone()
    return Path(row["clip_path"]) if row else None


def delete_swing(user_id: int, swing_id: str) -> Path | None:
    with _lock, _connect() as conn:
        row = conn.execute(
            f"SELECT clip_path FROM swings WHERE id = ? AND {_OWNED}", (swing_id, user_id)).fetchone()
        if not row:
            return None
        conn.execute("DELETE FROM swings WHERE id = ?", (swing_id,))
    return Path(row["clip_path"])


def delete_session(user_id: int, session_id: str) -> list[Path]:
    with _lock, _connect() as conn:
        owner = conn.execute("SELECT user_id FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not owner or owner["user_id"] != user_id:
            return []
        rows = conn.execute("SELECT clip_path FROM swings WHERE session_id = ?", (session_id,)).fetchall()
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))  # cascades
    return [Path(r["clip_path"]) for r in rows]


# ---------------------------------------------------------------- tags (per-user)

def list_tags(user_id: int) -> list[dict]:
    with _connect() as conn:
        return [{"id": r["id"], "name": r["name"]} for r in conn.execute(
            "SELECT id, name FROM tags WHERE user_id = ? ORDER BY name COLLATE NOCASE", (user_id,))]


def create_tag(user_id: int, name: str) -> dict | None:
    name = name.strip()
    if not name:
        return None
    with _lock, _connect() as conn:
        conn.execute("INSERT OR IGNORE INTO tags(user_id, name) VALUES (?, ?)", (user_id, name))
        row = conn.execute("SELECT id, name FROM tags WHERE user_id = ? AND name = ?",
                           (user_id, name)).fetchone()
    return {"id": row["id"], "name": row["name"]} if row else None


def _rewrite_swing_tags(conn, user_id: int, fn) -> None:
    for r in conn.execute(f"SELECT id, tags FROM swings WHERE {_OWNED}", (user_id,)).fetchall():
        arr = json.loads(r["tags"])
        new = fn(list(arr))
        if new != arr:
            conn.execute("UPDATE swings SET tags = ? WHERE id = ?", (json.dumps(new), r["id"]))


def rename_tag(user_id: int, tag_id: int, new_name: str) -> bool:
    new_name = new_name.strip()
    if not new_name:
        return False
    with _lock, _connect() as conn:
        row = conn.execute("SELECT name FROM tags WHERE id = ? AND user_id = ?",
                           (tag_id, user_id)).fetchone()
        if not row:
            return False
        old = row["name"]
        if old == new_name:
            return True
        clash = conn.execute("SELECT id FROM tags WHERE user_id = ? AND name = ? AND id != ?",
                             (user_id, new_name, tag_id)).fetchone()
        if clash:
            conn.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
        else:
            conn.execute("UPDATE tags SET name = ? WHERE id = ?", (new_name, tag_id))

        def swap(arr):
            arr = [new_name if t == old else t for t in arr]
            seen = set()
            return [t for t in arr if not (t in seen or seen.add(t))]
        _rewrite_swing_tags(conn, user_id, swap)
    return True


def delete_tag(user_id: int, tag_id: int) -> bool:
    with _lock, _connect() as conn:
        row = conn.execute("SELECT name FROM tags WHERE id = ? AND user_id = ?",
                           (tag_id, user_id)).fetchone()
        if not row:
            return False
        name = row["name"]
        conn.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
        _rewrite_swing_tags(conn, user_id, lambda arr: [t for t in arr if t != name])
    return True
