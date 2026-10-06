import os
import asyncio
import zipfile
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from .session_manager import get_session_dir, validate_session

router = APIRouter()

# Image extensions that are already compressed — no point re-compressing
_COMPRESSED_EXTS = {'.jpg', '.jpeg', '.png', '.bmp', '.webp', '.gif', '.tiff'}


def _build_zip(session_dir: str, zip_path: str):
    """
    Build the ZIP file to disk.
    
    Uses ZIP_STORED (no compression) for image files since JPEG/PNG are
    already compressed — trying to DEFLATE them wastes massive CPU time
    for zero size benefit. Text files (labels) use DEFLATE since they
    compress well and are tiny.
    """
    raw_images_dir = os.path.join(session_dir, "raw_images")
    labels_dir = os.path.join(session_dir, "labels")
    detected_images_dir = os.path.join(session_dir, "detected_images")
    darknet_labels_path = os.path.join(session_dir, "_darknet.labels")

    with zipfile.ZipFile(zip_path, 'w') as zf:
        # 1. detected_images/ — annotated images (STORED, already compressed)
        if os.path.exists(detected_images_dir):
            for fname in os.listdir(detected_images_dir):
                fpath = os.path.join(detected_images_dir, fname)
                if os.path.isfile(fpath):
                    ext = os.path.splitext(fname)[1].lower()
                    compress = zipfile.ZIP_STORED if ext in _COMPRESSED_EXTS else zipfile.ZIP_DEFLATED
                    zf.write(fpath, f"dataset/detected_images/{fname}", compress_type=compress)

        # 2. upload/ — original images (STORED)
        if os.path.exists(raw_images_dir):
            for fname in os.listdir(raw_images_dir):
                fpath = os.path.join(raw_images_dir, fname)
                if os.path.isfile(fpath):
                    ext = os.path.splitext(fname)[1].lower()
                    compress = zipfile.ZIP_STORED if ext in _COMPRESSED_EXTS else zipfile.ZIP_DEFLATED
                    zf.write(fpath, f"dataset/upload/{fname}", compress_type=compress)

        # 3. upload/ — label .txt files (DEFLATED, small text files compress well)
        if os.path.exists(labels_dir):
            for fname in os.listdir(labels_dir):
                fpath = os.path.join(labels_dir, fname)
                if os.path.isfile(fpath):
                    zf.write(fpath, f"dataset/upload/{fname}", compress_type=zipfile.ZIP_DEFLATED)

        # 4. upload/ — _darknet.labels (DEFLATED)
        if os.path.exists(darknet_labels_path):
            zf.write(darknet_labels_path, "dataset/upload/_darknet.labels", compress_type=zipfile.ZIP_DEFLATED)


@router.get("/{session_id}/export")
async def export_dataset(session_id: str):
    if not validate_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    session_dir = get_session_dir(session_id)
    results_file = os.path.join(session_dir, "results.json")

    if not os.path.exists(results_file):
        raise HTTPException(status_code=400, detail="Inference must be completed before export")

    zip_path = os.path.abspath(os.path.join(session_dir, "export.zip"))

    # If the ZIP was already generated, skip rebuilding it to save time
    if not os.path.exists(zip_path):
        # Build ZIP in a thread pool so it doesn't block the async event loop
        await asyncio.to_thread(_build_zip, session_dir, zip_path)

    # FileResponse sets Content-Length automatically → browser shows real download progress
    return FileResponse(
        zip_path,
        filename=f"dataset_{session_id}.zip",
        media_type="application/zip",
    )
