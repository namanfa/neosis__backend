"""Authenticated-app routes for reading private local library objects."""
from fastapi import APIRouter, HTTPException, Request
import mimetypes
from fastapi.responses import StreamingResponse

router = APIRouter()


def _stream_file(stream):
    try:
        while chunk := stream.read(1024 * 1024):
            yield chunk
    finally:
        stream.close()


@router.get("/api/library/objects/{key:path}")
async def get_library_object(key: str, request: Request):
    storage = request.app.state.storage
    try:
        if not storage.exists(key):
            raise HTTPException(status_code=404, detail="Library object not found")
        stream = storage.get(key)
    except (ValueError, FileNotFoundError):
        raise HTTPException(status_code=404, detail="Library object not found")
    content_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
    return StreamingResponse(_stream_file(stream), media_type=content_type, headers={"X-Content-Type-Options": "nosniff"})
