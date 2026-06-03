"""HTTP Range (206 Partial Content) responses so the browser <video> can
seek/scrub large source files without downloading the whole thing.
"""
from __future__ import annotations

import mimetypes
import re
from pathlib import Path

from fastapi import Request
from fastapi.responses import FileResponse, Response, StreamingResponse

_CHUNK = 1024 * 1024  # 1 MB


def range_response(request: Request, path: Path) -> Response:
    file_size = path.stat().st_size
    content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    range_header = request.headers.get("range")

    if range_header is None:
        return FileResponse(path, media_type=content_type)

    m = re.match(r"bytes=(\d*)-(\d*)", range_header)
    if not m:
        return FileResponse(path, media_type=content_type)

    start_s, end_s = m.groups()
    start = int(start_s) if start_s else 0
    end = int(end_s) if end_s else file_size - 1
    start = max(0, start)
    end = min(end, file_size - 1)
    length = end - start + 1

    def iter_file():
        with path.open("rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(_CHUNK, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
    }
    return StreamingResponse(
        iter_file(), status_code=206, headers=headers, media_type=content_type
    )
