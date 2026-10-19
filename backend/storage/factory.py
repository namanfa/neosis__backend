"""Select the configured library storage backend."""
import os

from .local import LocalBackend
from .r2 import R2Backend


def get_storage():
    backend_name = os.environ.get("STORAGE_BACKEND", "local").strip().lower()
    if backend_name == "local":
        return LocalBackend()
    if backend_name in {"r2", "s3"}:
        return R2Backend()
    raise RuntimeError(f"Unsupported STORAGE_BACKEND: {backend_name}")
