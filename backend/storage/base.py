"""Storage contract shared by local disk and S3-compatible object stores."""
from abc import ABC, abstractmethod
from typing import Any, BinaryIO, Iterable, Union


FileInput = Union[bytes, bytearray, BinaryIO]


class StorageBackend(ABC):
    @abstractmethod
    def put(self, key: str, fileobj_or_bytes: FileInput, content_type: str = "application/octet-stream", cache_control: str | None = None) -> None:
        """Store an object, replacing an existing object at the same key."""

    @abstractmethod
    def get(self, key: str) -> BinaryIO:
        """Open an object for binary reading. Caller must close the returned stream."""

    def get_prefix(self, key: str, max_bytes: int = 524288) -> bytes:
        """Read an object's leading bytes for metadata inspection."""
        with self.get(key) as source:
            return source.read(max_bytes)

    def get_size(self, key: str) -> int | None:
        parent = key.rsplit("/", 1)[0] if "/" in key else ""
        return next((int(entry["size"]) for entry in self.list_entries(parent) if entry.get("key") == key and entry.get("size") is not None), None)

    @abstractmethod
    def exists(self, key: str) -> bool:
        """Return whether an object exists."""

    @abstractmethod
    def list(self, prefix: str = "", recursive: bool = True) -> Iterable[str]:
        """List object keys under a prefix, recursively or immediate children only."""

    def list_entries(self, prefix: str = ""):
        """List object metadata when supported; callers can fall back to keys."""
        return [{"key": key, "size": 0, "etag": ""} for key in self.list(prefix)]

    @abstractmethod
    def open_for_zip(self, key: str) -> BinaryIO:
        """Open an object as a stream for ZIP creation without loading it all in memory."""

    @abstractmethod
    def url_for_display(self, key: str, expires_s: int = 900) -> str:
        """Return a short-lived or authenticated application URL for display."""

    @abstractmethod
    def get_json(self, key: str) -> Any:
        """Read and decode a JSON object."""

    @abstractmethod
    def put_json(self, key: str, obj: Any) -> None:
        """Write JSON atomically where the backend supports it."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Delete an object. Do not expose this through a route unless explicitly needed."""
