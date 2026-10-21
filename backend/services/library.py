"""Authenticated-app routes for reading private local library objects."""
import time
from fastapi import APIRouter, HTTPException, Request
import mimetypes
from fastapi.responses import Response, StreamingResponse

router = APIRouter()


def _stream_file(stream):
    try:
        while chunk := stream.read(1024 * 1024):
            yield chunk
    finally:
        stream.close()


@router.get("/api/library/objects/{key:path}")
async def get_library_object(key: str, request: Request):
    started = time.perf_counter()
    storage = request.app.state.storage
    try:
        entry = next(iter(storage.list_entries(key)), None)
        if not entry or entry.get("key") != key:
            raise HTTPException(status_code=404, detail="Library object not found")
        etag = entry.get("etag") or '"' + str(entry.get("size", 0)) + '"'
        last_modified = entry.get("last_modified")
        headers = {"ETag": etag, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"}
        if last_modified:
            from email.utils import formatdate
            headers["Last-Modified"] = formatdate(last_modified, usegmt=True)
        headers["Server-Timing"] = f"total;dur={(time.perf_counter() - started) * 1000:.1f}, storage-list;dur={(time.perf_counter() - started) * 1000:.1f}, storage-calls;desc=\"1\""
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers=headers)
        stream = storage.get(key)
    except (ValueError, FileNotFoundError):
        raise HTTPException(status_code=404, detail="Library object not found")
    content_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
    return StreamingResponse(_stream_file(stream), media_type=content_type, headers=headers)
