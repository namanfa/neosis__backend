"""Cloudflare R2 object storage through its S3-compatible API."""
import json
import os
import threading
import time
from pathlib import PurePosixPath, PureWindowsPath
from urllib.parse import quote, urlsplit

from .base import FileInput, StorageBackend


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


class R2Backend(StorageBackend):
    def __init__(self, endpoint_url=None, bucket=None, access_key_id=None, secret_access_key=None, region=None, client=None):
        self.endpoint_url = (endpoint_url or os.environ.get("R2_ENDPOINT_URL", "")).rstrip("/")
        self.bucket = bucket or os.environ.get("R2_BUCKET_NAME", "")
        access_key_id = access_key_id or os.environ.get("R2_ACCESS_KEY_ID", "")
        secret_access_key = secret_access_key or os.environ.get("R2_SECRET_ACCESS_KEY", "")
        region = region or os.environ.get("R2_REGION", "auto")

        if not self.endpoint_url or not self.bucket or not access_key_id or not secret_access_key:
            raise RuntimeError("R2 requires R2_ENDPOINT_URL, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY")
        endpoint = urlsplit(self.endpoint_url)
        if endpoint.scheme != "https" or not endpoint.netloc:
            raise RuntimeError("R2_ENDPOINT_URL must be an HTTPS account endpoint")
        if endpoint.path:
            raise RuntimeError("R2_ENDPOINT_URL must be the account endpoint without a bucket path")

        if client is None:
            try:
                import boto3
                from botocore.config import Config
            except ImportError as exc:
                raise RuntimeError("R2 storage requires boto3; install backend/requirements.txt") from exc
            client = boto3.client(
                "s3",
                endpoint_url=self.endpoint_url,
                aws_access_key_id=access_key_id,
                aws_secret_access_key=secret_access_key,
                region_name=region,
                config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
            )
        self.client = client
        self._display_url_lock = threading.Lock()
        self._display_urls = {}

    def put(self, key: str, fileobj_or_bytes: FileInput, content_type: str = "application/octet-stream", cache_control: str | None = None) -> None:
        params = {"Bucket": self.bucket, "Key": _clean_key(key), "Body": fileobj_or_bytes, "ContentType": content_type}
        if cache_control:
            params["CacheControl"] = cache_control
        self.client.put_object(**params)

    def get(self, key: str):
        return self.client.get_object(Bucket=self.bucket, Key=_clean_key(key))["Body"]

    def get_prefix(self, key: str, max_bytes: int = 524288) -> bytes:
        end = max(0, int(max_bytes) - 1)
        response = self.client.get_object(Bucket=self.bucket, Key=_clean_key(key), Range=f"bytes=0-{end}")
        with response["Body"] as source:
            return source.read(max_bytes)

    def get_size(self, key: str) -> int | None:
        try:
            response = self.client.head_object(Bucket=self.bucket, Key=_clean_key(key))
        except Exception as exc:
            response_data = getattr(exc, "response", {}) or {}
            status = response_data.get("ResponseMetadata", {}).get("HTTPStatusCode")
            code = response_data.get("Error", {}).get("Code")
            if status == 404 or code in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise
        return int(response["ContentLength"]) if response.get("ContentLength") is not None else None

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=_clean_key(key))
            return True
        except Exception as exc:
            response = getattr(exc, "response", {}) or {}
            error = response.get("Error", {})
            status = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if status == 404 or error.get("Code") in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise

    def list(self, prefix: str = "", recursive: bool = True):
        return [entry["key"] for entry in self.list_entries(prefix, recursive=recursive)]

    def list_entries(self, prefix: str = "", recursive: bool = True):
        clean_prefix = _clean_key(prefix, allow_empty=True)
        object_prefix = f"{clean_prefix}/" if clean_prefix else ""
        paginator = self.client.get_paginator("list_objects_v2")
        params = {"Bucket": self.bucket, "Prefix": object_prefix}
        if not recursive:
            params["Delimiter"] = "/"
        entries = []
        for page in paginator.paginate(**params):
            for item in page.get("Contents", []):
                entries.append({
                    "key": item["Key"],
                    "size": int(item.get("Size", 0)),
                    "etag": f'"{str(item.get("ETag", "")).strip(chr(34))}"' if item.get("ETag") else "",
                    "last_modified": item.get("LastModified").timestamp() if item.get("LastModified") else None,
                })
        return sorted(entries, key=lambda item: item["key"])

    def open_for_zip(self, key: str):
        return self.get(key)

    def url_for_display(self, key: str, expires_s: int = 900) -> str:
        expires_s = max(1, min(int(expires_s), 604800))
        clean_key = _clean_key(key)
        cache_key = (clean_key, expires_s)
        now = time.time()
        with self._display_url_lock:
            cached = self._display_urls.get(cache_key)
            if cached and cached[0] > now:
                return cached[1]
            url = self.client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": clean_key, "ResponseCacheControl": "private, max-age=86400"},
                ExpiresIn=expires_s,
            )
            self._display_urls[cache_key] = (now + max(1, expires_s - min(60, expires_s // 4)), url)
            if len(self._display_urls) > 5000:
                self._display_urls = {item: value for item, value in self._display_urls.items() if value[0] > now}
            return url

    def get_json(self, key: str):
        with self.get(key) as source:
            return json.load(source)

    def put_json(self, key: str, obj) -> None:
        payload = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
        self.put(key, payload, "application/json")

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=_clean_key(key))
