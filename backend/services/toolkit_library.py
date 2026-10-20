"""Local-first APIs for Testing Images and Packshots."""
import csv
from concurrent.futures import ThreadPoolExecutor, as_completed
import io
import json
import os
import random
import re
import tempfile
import zipfile
from pathlib import PurePosixPath

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from storage.brands import add_brand, get_brands

router = APIRouter(prefix="/api/tools", tags=["Internal Tools"])
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILES_PER_BATCH = 16
MAX_PARALLEL_OBJECT_WRITES = 6
MAX_PARALLEL_LIST_CALLS = 8
MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_BATCH_BYTES = 100 * 1024 * 1024
MAX_SHEET_BYTES = 20 * 1024 * 1024
MANIFEST = "manifest.json"


def _store_objects(storage, objects):
    """Write independent objects concurrently; object storage writes are network-bound."""
    failures = {}
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_OBJECT_WRITES) as pool:
        futures = {pool.submit(storage.put, key, data, content_type): (key, filename) for key, data, content_type, filename in objects}
        for future in as_completed(futures):
            key, filename = futures[future]
            try:
                future.result()
            except Exception as exc:
                failures[key] = {"file": filename, "reason": str(exc)}
    return failures


def _brand(storage, slug):
    brand = next((item for item in get_brands(storage) if item.get("slug") == slug), None)
    if brand is None:
        raise HTTPException(404, "Brand not found")
    return brand


def _slug(value, label="Name"):
    if not isinstance(value, str) or "\x00" in value or "\\" in value:
        raise HTTPException(400, f"Invalid {label.lower()}")
    value = " ".join(value.split())
    if not value or value in {".", ".."} or value.startswith("/"):
        raise HTTPException(400, f"{label} cannot be empty or contain a path")
    result = re.sub(r"[^\w-]+", "-", value.casefold(), flags=re.UNICODE).strip("-_")
    if not result or result in {".", ".."}:
        raise HTTPException(400, f"Invalid {label.lower()}")
    return result


def _filename(value):
    if not isinstance(value, str) or "\x00" in value or "\\" in value:
        raise HTTPException(400, "Invalid image path")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in value.split("/")):
        raise HTTPException(400, "Invalid image path")
    name = path.name
    ext = os.path.splitext(name)[1].lower()
    if ext not in IMAGE_EXTENSIONS:
        return None
    stem = os.path.splitext(name)[0]
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._-") or "image"
    return stem + ext


def _is_image(data, ext):
    if ext in {".jpg", ".jpeg"}:
        return data.startswith(b"\xff\xd8\xff")
    if ext == ".png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    return len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP"


async def _read_image(upload):
    ext = os.path.splitext(upload.filename or "")[1].lower()
    if ext not in IMAGE_EXTENSIONS:
        return None
    content = await upload.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(413, f"{upload.filename}: image exceeds the 20 MB limit")
    if not content or not _is_image(content, ext):
        raise HTTPException(400, f"{upload.filename}: file content does not match a supported image")
    return content


def _manifest(storage, key):
    if not storage.exists(key):
        return []
    data = storage.get_json(key)
    if not isinstance(data, list):
        raise HTTPException(500, "Stored manifest is invalid")
    return data


def _unique_key(storage, prefix, filename, reserved=None, existing=None):
    reserved = reserved if reserved is not None else set()
    stem, ext = os.path.splitext(filename)
    candidate = filename
    suffix = 1
    key = f"{prefix}/{candidate}"
    while key in reserved or (key in existing if existing is not None else storage.exists(key)):
        candidate = f"{stem}_{suffix}{ext}"
        suffix += 1
        key = f"{prefix}/{candidate}"
    reserved.add(key)
    return candidate


@router.get("/brands")
def list_tool_brands(request: Request):
    storage = request.app.state.storage
    brands = get_brands(storage)
    keys_by_brand = {brand.get("slug", ""): {"testing": [], "packshots": []} for brand in brands}
    jobs = {}
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_LIST_CALLS) as pool:
        for slug in keys_by_brand:
            jobs[pool.submit(storage.list, f"testing/{slug}")] = (slug, "testing")
            jobs[pool.submit(storage.list, f"packshots/{slug}")] = (slug, "packshots")
        for future in as_completed(jobs):
            slug, collection = jobs[future]
            keys_by_brand[slug][collection] = future.result()

    result = []
    for brand in brands:
        inventory = keys_by_brand[brand.get("slug", "")]
        testing = inventory["testing"]
        packshot_files = [key for key in inventory["packshots"] if key.rsplit("/", 1)[-1] != MANIFEST]
        assets = sorted({key.split("/")[2] for key in testing if len(key.split("/")) > 3})
        result.append({**brand, "testing_count": len(testing), "testing_assets": assets, "packshot_count": len(packshot_files)})
    return {"brands": result}


@router.post("/brands")
def create_tool_brand(request: Request, name: str = Form(...)):
    try:
        brand = add_brand(request.app.state.storage, name)
    except ValueError as exc:
        raise HTTPException(409 if "already exists" in str(exc) or "conflicts" in str(exc) else 400, str(exc))
    return brand


@router.get("/testing/{brand_slug}/images")
def list_testing_images(brand_slug: str, request: Request, asset: str = "all"):
    storage = request.app.state.storage
    _brand(storage, brand_slug)
    prefix = f"testing/{brand_slug}"
    keys = storage.list(prefix)
    images = []
    assets = set()
    for key in keys:
        parts = key.split("/")
        if len(parts) == 3:
            current_asset = "general"
        elif len(parts) >= 4:
            current_asset = parts[2]
            assets.add(current_asset)
        else:
            continue
        if asset != "all" and current_asset != asset:
            continue
        images.append({"key": key, "asset": current_asset, "url": storage.url_for_display(key)})
    random.shuffle(images)
    return {"images": images, "assets": sorted(assets)}


@router.post("/testing/{brand_slug}/upload")
async def upload_testing_images(
    brand_slug: str,
    request: Request,
    files: list[UploadFile] = File(...),
    relative_paths: str = Form(...),
):
    storage = request.app.state.storage
    _brand(storage, brand_slug)
    if not 1 <= len(files) <= MAX_FILES_PER_BATCH:
        raise HTTPException(400, f"Upload between 1 and {MAX_FILES_PER_BATCH} files per batch")
    try:
        paths = json.loads(relative_paths)
    except (TypeError, json.JSONDecodeError):
        raise HTTPException(400, "Invalid file path metadata")
    if not isinstance(paths, list) or len(paths) != len(files) or not all(isinstance(path, str) for path in paths):
        raise HTTPException(400, "File path metadata does not match uploaded files")

    added = ignored = failed = total_bytes = 0
    failures = []
    reserved = set()
    existing = set(storage.list(f"testing/{brand_slug}"))
    pending = []
    for upload, relative_path in zip(files, paths):
        try:
            safe_name = _filename(relative_path)
            if safe_name is None:
                ignored += 1
                continue
            if os.path.splitext(upload.filename or "")[1].lower() != os.path.splitext(safe_name)[1].lower():
                raise HTTPException(400, "Image path extension does not match uploaded file")
            parts = relative_path.split("/")
            if any(part in {"", ".", ".."} for part in parts):
                raise HTTPException(400, "Invalid image path")
            asset_slug = _slug(parts[0], "Asset") if len(parts) > 1 else None
            data = await _read_image(upload)
            if data is None:
                ignored += 1
                continue
            total_bytes += len(data)
            if total_bytes > MAX_BATCH_BYTES:
                raise HTTPException(413, "Upload batch exceeds the 100 MB limit")
            prefix = f"testing/{brand_slug}" + (f"/{asset_slug}" if asset_slug else "")
            name = _unique_key(storage, prefix, safe_name, reserved, existing)
            content_type = f"image/{'jpeg' if name.endswith(('.jpg', '.jpeg')) else name.rsplit('.', 1)[-1]}"
            pending.append((f"{prefix}/{name}", data, content_type, upload.filename or name))
        except HTTPException as exc:
            failed += 1
            failures.append({"file": upload.filename or "unknown", "reason": exc.detail})
        except Exception as exc:
            failed += 1
            failures.append({"file": upload.filename or "unknown", "reason": str(exc)})
    write_failures = _store_objects(storage, pending)
    for failure in write_failures.values():
        failed += 1
        failures.append(failure)
    added += len(pending) - len(write_failures)
    return {"added": added, "ignored": ignored, "failed": failed, "failures": failures}


def _header_key(value):
    return "".join(str(value or "").casefold().split())


def _image_stem(value):
    return os.path.splitext(os.path.basename(str(value or "").strip().replace("\\", "/")))[0].casefold()


def _read_mapping(filename, content):
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in {".xlsx", ".csv"}:
        raise HTTPException(400, "Upload a .xlsx or .csv mapping sheet")
    if len(content) > MAX_SHEET_BYTES:
        raise HTTPException(413, "Mapping sheet exceeds the 20 MB limit")
    try:
        if ext == ".csv":
            rows = list(csv.reader(io.StringIO(content.decode("utf-8-sig"))))
        else:
            from openpyxl import load_workbook
            workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
            rows = list(workbook.active.iter_rows(values_only=True))
            workbook.close()
    except Exception as exc:
        raise HTTPException(400, f"Could not read mapping sheet: {exc}")
    if not rows:
        raise HTTPException(400, "Mapping sheet is empty")
    headers = {_header_key(value): i for i, value in enumerate(rows[0])}
    required = {"imagename": "image_name", "annotationname": "annotation_name", "name": "name", "id": "id"}
    missing = [key for key in required if key not in headers]
    if missing:
        labels = {"imagename": "Image name", "annotationname": "Annotation name", "name": "Name", "id": "ID"}
        raise HTTPException(400, "Mapping sheet is missing columns: " + ", ".join(labels[key] for key in missing))
    mapped = {}
    duplicates = set()
    for row in rows[1:]:
        image_name = row[headers["imagename"]] if headers["imagename"] < len(row) else ""
        stem = _image_stem(image_name)
        if not stem:
            continue
        if stem in mapped:
            duplicates.add(str(image_name))
        annotation = row[headers["annotationname"]] if headers["annotationname"] < len(row) else None
        name = row[headers["name"]] if headers["name"] < len(row) else None
        image_id = row[headers["id"]] if headers["id"] < len(row) else None
        mapped[stem] = {
            "image_name": str(image_name).strip(),
            "annotation_name": str(annotation).strip() if annotation is not None else "",
            "name": str(name).strip() if name is not None else "",
            "id": str(image_id).strip() if image_id is not None else "",
        }
    if duplicates:
        raise HTTPException(400, "Duplicate image names in mapping sheet: " + ", ".join(sorted(duplicates)))
    return mapped


@router.post("/packshots/prepare")
async def prepare_packshot_mapping(mapping: UploadFile = File(...)):
    content = await mapping.read(MAX_SHEET_BYTES + 1)
    rows = _read_mapping(mapping.filename or "", content)
    return {"rows": rows}


@router.get("/packshots/{brand_slug}")
def list_packshots(brand_slug: str, request: Request):
    storage = request.app.state.storage
    _brand(storage, brand_slug)
    prefix = f"packshots/{brand_slug}"
    manifest = _manifest(storage, f"{prefix}/{MANIFEST}")
    indexed = {row.get("file"): row for row in manifest if isinstance(row, dict)}
    images = []
    for key in storage.list(prefix):
        name = key.rsplit("/", 1)[-1]
        if name == MANIFEST:
            continue
        row = indexed.get(name, {})
        images.append({"file": name, "key": key, "url": storage.url_for_display(key), "annotation_name": row.get("annotation_name", os.path.splitext(name)[0]), "name": row.get("name", ""), "id": row.get("id", "")})
    return {"images": images}


@router.post("/packshots/{brand_slug}/upload")
async def upload_packshots(
    brand_slug: str,
    request: Request,
    files: list[UploadFile] = File(...),
    mapping_rows: str = Form(...),
):
    storage = request.app.state.storage
    _brand(storage, brand_slug)
    if not 1 <= len(files) <= MAX_FILES_PER_BATCH:
        raise HTTPException(400, f"Upload between 1 and {MAX_FILES_PER_BATCH} files per batch")
    try:
        rows = json.loads(mapping_rows)
    except (TypeError, json.JSONDecodeError):
        raise HTTPException(400, "Invalid mapping metadata")
    if not isinstance(rows, list) or len(rows) != len(files):
        raise HTTPException(400, "Mapping metadata does not match uploaded files")
    prefix = f"packshots/{brand_slug}"
    manifest_key = f"{prefix}/{MANIFEST}"
    manifest = _manifest(storage, manifest_key)
    by_file = {row.get("file"): row for row in manifest if isinstance(row, dict) and isinstance(row.get("file"), str)}
    added = ignored = failed = total_bytes = 0
    failures = []
    reserved = set()
    existing = set(storage.list(prefix))
    pending = []
    for upload, row in zip(files, rows):
        try:
            safe_name = _filename(upload.filename or "")
            if safe_name is None:
                ignored += 1
                continue
            data = await _read_image(upload)
            if data is None:
                ignored += 1
                continue
            total_bytes += len(data)
            if total_bytes > MAX_BATCH_BYTES:
                raise HTTPException(413, "Upload batch exceeds the 100 MB limit")
            collision = f"{prefix}/{safe_name}" in existing
            filename = _unique_key(storage, prefix, safe_name, reserved, existing)
            if collision or not isinstance(row, dict):
                base = os.path.splitext(filename)[0]
                label = {"annotation_name": base, "name": base, "id": base}
            else:
                label = row
                label = {"annotation_name": str(label.get("annotation_name") or os.path.splitext(filename)[0]), "name": str(label.get("name") or ""), "id": str(label.get("id") or "")}
            pending.append((f"{prefix}/{filename}", data, "image/" + ("jpeg" if filename.lower().endswith((".jpg", ".jpeg")) else filename.rsplit(".", 1)[-1]), filename, label))
        except HTTPException as exc:
            failed += 1
            failures.append({"file": upload.filename or "unknown", "reason": exc.detail})
        except Exception as exc:
            failed += 1
            failures.append({"file": upload.filename or "unknown", "reason": str(exc)})
    write_failures = _store_objects(storage, [item[:4] for item in pending])
    for key, data, content_type, filename, label in pending:
        key = f"{prefix}/{filename}"
        if key in write_failures:
            failed += 1
            failures.append(write_failures[key])
        else:
            by_file[filename] = {"file": filename, **label}
            added += 1
    storage.put_json(manifest_key, list(by_file.values()))
    return {"added": added, "ignored": ignored, "failed": failed, "failures": failures}


@router.post("/packshots/{brand_slug}/{filename}/replace")
async def replace_packshot(brand_slug: str, filename: str, request: Request, image: UploadFile = File(...)):
    storage = request.app.state.storage
    _brand(storage, brand_slug)
    safe_name = _filename(filename)
    if safe_name is None or safe_name != filename:
        raise HTTPException(400, "Invalid packshot file name")
    prefix = f"packshots/{brand_slug}"
    key = f"{prefix}/{safe_name}"
    if not storage.exists(key):
        raise HTTPException(404, "Packshot not found")
    if os.path.splitext(image.filename or "")[1].lower() != os.path.splitext(safe_name)[1].lower():
        raise HTTPException(400, "Replacement image must use the same file extension")
    content = await _read_image(image)
    if content is None:
        raise HTTPException(400, "Replacement must be a supported image")
    storage.put(key, content)
    return {"replaced": safe_name}


@router.get("/packshots/{brand_slug}/download")
def download_packshots(brand_slug: str, request: Request, selected: str = ""):
    storage = request.app.state.storage
    brand = _brand(storage, brand_slug)
    prefix = f"packshots/{brand_slug}"
    manifest = _manifest(storage, f"{prefix}/{MANIFEST}")
    rows = {row.get("file"): row for row in manifest if isinstance(row, dict)}
    requested = [name for name in selected.split(",") if name] if selected else None
    available = [key.rsplit("/", 1)[-1] for key in storage.list(prefix) if key.rsplit("/", 1)[-1] != MANIFEST]
    if requested is not None:
        if len(requested) != len(set(requested)) or any(name not in available for name in requested):
            raise HTTPException(400, "Invalid selected packshot list")
        available = requested
    if not available:
        raise HTTPException(404, "No packshots to download")
    temp = tempfile.NamedTemporaryFile(prefix="packshots-", suffix=".zip", delete=False)
    temp_path = temp.name
    used = set()
    try:
        with temp, zipfile.ZipFile(temp, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for filename in available:
                row = rows.get(filename, {})
                label = row.get("annotation_name") or os.path.splitext(filename)[0]
                safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", str(label)).strip("._-") or os.path.splitext(filename)[0]
                zip_name = safe_stem + os.path.splitext(filename)[1]
                stem, ext = os.path.splitext(zip_name)
                candidate = zip_name
                suffix = 1
                while candidate.casefold() in used:
                    candidate = f"{stem}_{suffix}{ext}"
                    suffix += 1
                used.add(candidate.casefold())
                with storage.open_for_zip(f"{prefix}/{filename}") as source:
                    with archive.open(candidate, "w") as destination:
                        while chunk := source.read(1024 * 1024):
                            destination.write(chunk)
    except Exception:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
        raise

    def stream_zip():
        try:
            with open(temp_path, "rb") as source:
                while chunk := source.read(1024 * 1024):
                    yield chunk
        finally:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    download_name = f"{brand.get('slug', brand_slug)}_packshots.zip"
    return StreamingResponse(stream_zip(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{download_name}"'})
