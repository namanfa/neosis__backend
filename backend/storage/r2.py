"""Cloudflare R2 object storage through its S3-compatible API."""
import json
import os
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

    def put(self, key: str, fileobj_or_bytes: FileInput, content_type: str = "application/octet-stream") -> None:
        self.client.put_object(Bucket=self.bucket, Key=_clean_key(key), Body=fileobj_or_bytes, ContentType=content_type)

    def get(self, key: str):
        return self.client.get_object(Bucket=self.bucket, Key=_clean_key(key))["Body"]

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
        clean_prefix = _clean_key(prefix, allow_empty=True)
        object_prefix = f"{clean_prefix}/" if clean_prefix else ""
        paginator = self.client.get_paginator("list_objects_v2")
        params = {"Bucket": self.bucket, "Prefix": object_prefix}
        if not recursive:
            params["Delimiter"] = "/"
        keys = []
        for page in paginator.paginate(**params):
            keys.extend(item["Key"] for item in page.get("Contents", []))
        return sorted(keys)

    def open_for_zip(self, key: str):
        return self.get(key)

    def url_for_display(self, key: str, expires_s: int = 900) -> str:
        expires_s = max(1, min(int(expires_s), 604800))
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": _clean_key(key)},
            ExpiresIn=expires_s,
        )

    def get_json(self, key: str):
        with self.get(key) as source:
            return json.load(source)

    def put_json(self, key: str, obj) -> None:
        payload = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
        self.put(key, payload, "application/json")

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=_clean_key(key))
