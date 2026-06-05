"""Google sign-in verification + session-based auth dependency."""
from __future__ import annotations

import os

from fastapi import Depends, HTTPException, Request
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from . import db

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
DEV_LOGIN = os.environ.get("AUTH_DEV_LOGIN") == "1"

_google_request = google_requests.Request()


def verify_google(credential: str) -> dict:
    """Verify a Google ID token and return a normalized profile.

    Raises HTTPException(401) on any verification failure.
    """
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID not configured")
    try:
        info = id_token.verify_oauth2_token(credential, _google_request, GOOGLE_CLIENT_ID)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google credential")
    if not info.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid Google credential")
    return {
        "google_sub": info["sub"],
        "email": info.get("email", ""),
        "name": info.get("name") or info.get("email", "Golfer"),
        "picture": info.get("picture", ""),
    }


def current_user_optional(request: Request) -> dict | None:
    uid = request.session.get("user_id")
    return db.get_user(uid) if uid else None


def current_user(request: Request) -> dict:
    """FastAPI dependency: the signed-in user, or 401."""
    user = current_user_optional(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


CurrentUser = Depends(current_user)
