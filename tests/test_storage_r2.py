"""Contract tests for the Cloudflare R2 storage adapter."""
import io
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from storage.factory import get_storage
from storage.r2 import R2Backend


class FakePaginator:
    def __init__(self, pages):
        self.pages = pages
        self.params = None

    def paginate(self, **params):
        self.params = params
        return iter(self.pages)


class FakeR2Client:
    def __init__(self):
        self.objects = {}
        self.paginator = FakePaginator([])
        self.last_put = None
        self.last_presign = None

    def put_object(self, **kwargs):
        self.last_put = kwargs
        body = kwargs["Body"]
        self.objects[kwargs["Key"]] = body if isinstance(body, bytes) else body.read()

    def get_object(self, Bucket, Key):
        return {"Body": io.BytesIO(self.objects[Key])}

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            exc = RuntimeError("missing")
            exc.response = {"Error": {"Code": "NoSuchKey"}, "ResponseMetadata": {"HTTPStatusCode": 404}}
            raise exc
        return {}

    def get_paginator(self, name):
        assert name == "list_objects_v2"
        return self.paginator

    def generate_presigned_url(self, operation, Params, ExpiresIn):
        self.last_presign = (operation, Params, ExpiresIn)
        return "https://signed.example/image"

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)


class R2BackendTests(unittest.TestCase):
    def setUp(self):
        self.client = FakeR2Client()
        self.storage = R2Backend(
            endpoint_url="https://account.r2.cloudflarestorage.com",
            bucket="library",
            access_key_id="test-key",
            secret_access_key="test-secret",
            client=self.client,
        )

    def test_put_get_exists_and_delete(self):
        self.storage.put("testing/acme/image.png", io.BytesIO(b"png"), "image/png")
        self.assertEqual(self.client.last_put["ContentType"], "image/png")
        self.assertTrue(self.storage.exists("testing/acme/image.png"))
        self.assertFalse(self.storage.exists("testing/acme/missing.png"))
        with self.storage.get("testing/acme/image.png") as source:
            self.assertEqual(source.read(), b"png")
        self.storage.delete("testing/acme/image.png")
        self.assertFalse(self.storage.exists("testing/acme/image.png"))

    def test_json_round_trip_and_safe_display_url(self):
        self.storage.put_json("brands.json", [{"slug": "acme"}])
        self.assertEqual(self.storage.get_json("brands.json"), [{"slug": "acme"}])
        self.assertEqual(self.storage.url_for_display("testing/acme/a b.png", 900), "https://signed.example/image")
        self.assertEqual(self.client.last_presign[0], "get_object")
        self.assertEqual(self.client.last_presign[1], {"Bucket": "library", "Key": "testing/acme/a b.png"})

    def test_list_scopes_prefix_and_supports_immediate_mode(self):
        self.client.paginator.pages = [{"Contents": [{"Key": "testing/acme/a.png"}, {"Key": "testing/acme/nested/b.png"}]}]
        self.assertEqual(self.storage.list("testing/acme"), ["testing/acme/a.png", "testing/acme/nested/b.png"])
        self.assertEqual(self.client.paginator.params, {"Bucket": "library", "Prefix": "testing/acme/"})
        self.storage.list("testing/acme", recursive=False)
        self.assertEqual(self.client.paginator.params["Delimiter"], "/")

    def test_rejects_unsafe_keys_and_bucket_in_endpoint(self):
        for key in ("../secret", "/absolute", "folder\\file", "C:/private"):
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.storage.put(key, b"blocked")
        with self.assertRaisesRegex(RuntimeError, "without a bucket path"):
            R2Backend(
                endpoint_url="https://account.r2.cloudflarestorage.com/library",
                bucket="library",
                access_key_id="test-key",
                secret_access_key="test-secret",
                client=self.client,
            )

    def test_factory_selects_r2_and_requires_configuration(self):
        env = {
            "STORAGE_BACKEND": "r2",
            "R2_ENDPOINT_URL": "https://account.r2.cloudflarestorage.com",
            "R2_BUCKET_NAME": "library",
            "R2_ACCESS_KEY_ID": "test-key",
            "R2_SECRET_ACCESS_KEY": "test-secret",
        }
        with patch.dict(os.environ, env, clear=True):
            with patch("storage.factory.R2Backend") as backend_class:
                self.assertIs(get_storage(), backend_class.return_value)
                backend_class.assert_called_once_with()
        with patch.dict(os.environ, {"STORAGE_BACKEND": "r2"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "R2 requires"):
                get_storage()


if __name__ == "__main__":
    unittest.main()
