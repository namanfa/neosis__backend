"""Tests for the local object store and shared brand manifest."""
import io
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from storage.brands import add_brand, get_brands
from storage.local import LocalBackend


class LocalBackendTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.storage = LocalBackend(self.tempdir.name)

    def tearDown(self):
        self.tempdir.cleanup()

    def test_put_get_and_exists(self):
        self.storage.put("testing/acme/photo.png", io.BytesIO(b"image"), "image/png")
        self.assertTrue(self.storage.exists("testing/acme/photo.png"))
        with self.storage.get("testing/acme/photo.png") as stored:
            self.assertEqual(stored.read(), b"image")

    def test_list_supports_recursive_and_immediate_modes(self):
        self.storage.put("testing/acme/general.jpg", b"a")
        self.storage.put("testing/acme/drinks/cola.jpg", b"b")
        self.assertEqual(self.storage.list("testing/acme", recursive=False), ["testing/acme/general.jpg"])
        self.assertEqual(self.storage.list("testing/acme"), [
            "testing/acme/drinks/cola.jpg",
            "testing/acme/general.jpg",
        ])

    def test_rejects_traversal_and_absolute_keys(self):
        for key in ("../secret", "testing/../secret", "/absolute/file", "C:/private/file", "testing\\secret", "testing/\x00file"):
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.storage.put(key, b"blocked")

    def test_json_manifest_and_brand_duplicate_detection(self):
        self.assertEqual(get_brands(self.storage), [])
        brand = add_brand(self.storage, "  Acme   Foods ")
        self.assertEqual(brand["slug"], "acme-foods")
        self.assertEqual(self.storage.get_json("brands.json")[0]["name"], "Acme Foods")
        with self.assertRaisesRegex(ValueError, "already exists"):
            add_brand(self.storage, "acme foods")


if __name__ == "__main__":
    unittest.main()
