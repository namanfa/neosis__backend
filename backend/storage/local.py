"""Filesystem-backed storage for local development and the current POC."""
import json
import os
import shutil
import tempfile
from pathlib import Path, PurePosixPath, PureWindowsPath
from urllib.parse import quote

from .base import FileInput, StorageBackend


def _default_library_dir() -> Path:
    configured = os.environ.get("LIBRARY_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    project_root = Path(__file__).resolve().parents[2]
    if os.name == "nt":
        return project_root / "output" / "library"
    return Path("/data/library")


class LocalBackend(StorageBackend):
    def __init__(self, root=None):
        self.root = Path(root).expanduser().resolve() if root else _default_library_dir()
        self.root.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _clean_key(key: str, allow_empty: bool = False) -> str:
        if not isinstance(key, str) or "\x00" in key or "\\" in key:
            raise ValueError("Invalid storage key")
        if not key:
            if allow_empty:
                return ""
            raise ValueError("Storage key cannot be empty")
        path = PurePosixPath(key)
        windows_path = PureWindowsPath(key)
        if path.is_absolute() or windows_path.is_absolute() or windows_path.drive or any(part in ("", ".", "..") for part in key.split("/")):
            raise ValueError("Storage key must be a safe relative path")
        return path.as_posix()

    def _path(self, key: str) -> Path:
        clean_key = self._clean_key(key)
        target = (self.root / Path(*clean_key.split("/"))).resolve()
        if target != self.root and self.root not in target.parents:
            raise ValueError("Storage key escapes library directory")
        return target

    def put(self, key: str, fileobj_or_bytes: FileInput, content_type: str = "application/octet-stream") -> None:
        del content_type  # Local files are identified by their content, not a stored MIME database.
        target = self._path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix=".upload-", dir=str(target.parent))
        try:
            with os.fdopen(fd, "wb") as destination:
                if isinstance(fileobj_or_bytes, (bytes, bytearray)):
                    destination.write(fileobj_or_bytes)
                else:
                    shutil.copyfileobj(fileobj_or_bytes, destination)
                destination.flush()
                os.fsync(destination.fileno())
            os.replace(temp_name, target)
        except Exception:
            try:
                os.remove(temp_name)
            except OSError:
                pass
            raise

    def get(self, key: str):
        return self._path(key).open("rb")

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def list(self, prefix: str = "", recursive: bool = True):
        clean_prefix = self._clean_key(prefix, allow_empty=True)
        base = self._path(clean_prefix) if clean_prefix else self.root
        if not base.exists():
            return []
        if not base.is_dir():
            return [base.relative_to(self.root).as_posix()]
        iterator = base.rglob("*") if recursive else base.iterdir()
        return sorted(path.relative_to(self.root).as_posix() for path in iterator if path.is_file())

    def open_for_zip(self, key: str):
        return self.get(key)

    def url_for_display(self, key: str, expires_s: int = 900) -> str:
        del expires_s
        clean_key = self._clean_key(key)
        encoded = quote(clean_key, safe="/")
        return f"/api/library/objects/{encoded}"

    def get_json(self, key: str):
        with self.get(key) as source:
            return json.load(source)

    def put_json(self, key: str, obj) -> None:
        payload = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
        self.put(key, payload, "application/json")

    def delete(self, key: str) -> None:
        path = self._path(key)
        try:
            path.unlink()
        except FileNotFoundError:
            return
