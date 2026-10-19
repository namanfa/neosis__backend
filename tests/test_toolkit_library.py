"""Coverage for the local Testing Images and Packshots API flows."""
import io
import os
import sys
import tempfile
import unittest
import zipfile

from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import Workbook

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from services.toolkit_library import router
from storage.brands import add_brand
from storage.local import LocalBackend


PNG = b"\x89PNG\r\n\x1a\n" + (b"fake-png-content" * 4)


class ToolkitLibraryApiTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.storage = LocalBackend(self.tempdir.name)
        self.brand = add_brand(self.storage, "Acme Foods")
        app = FastAPI()
        app.state.storage = self.storage
        app.include_router(router)
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.tempdir.cleanup()

    def test_testing_upload_filters_files_merges_assets_and_avoids_overwrite(self):
        response = self.client.post(
            f"/api/tools/testing/{self.brand['slug']}/upload",
            data={"relative_paths": '["drinks/can.png", "photo.png", "readme.txt"]'},
            files=[("files", ("can.png", PNG, "image/png")), ("files", ("photo.png", PNG, "image/png")), ("files", ("readme.txt", b"text", "text/plain"))],
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((response.json()["added"], response.json()["ignored"]), (2, 1))

        duplicate = self.client.post(
            f"/api/tools/testing/{self.brand['slug']}/upload",
            data={"relative_paths": '["drinks/can.png"]'},
            files=[("files", ("can.png", PNG, "image/png"))],
        )
        self.assertEqual(duplicate.json()["added"], 1)
        self.assertTrue(self.storage.exists(f"testing/{self.brand['slug']}/drinks/can_1.png"))

        gallery = self.client.get(f"/api/tools/testing/{self.brand['slug']}/images").json()
        self.assertEqual(len(gallery["images"]), 3)
        self.assertEqual(gallery["assets"], ["drinks"])
        filtered = self.client.get(f"/api/tools/testing/{self.brand['slug']}/images?asset=drinks").json()
        self.assertEqual(len(filtered["images"]), 2)

    def test_packshot_mapping_upload_replace_and_zip_download(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["Image name", "Annotation name", "Name", "ID"])
        sheet.append(["sku-a", "Cola 330ml", "Cola", "A1"])
        mapping = io.BytesIO()
        workbook.save(mapping)
        prepared = self.client.post("/api/tools/packshots/prepare", files={"mapping": ("map.xlsx", mapping.getvalue())})
        self.assertEqual(prepared.status_code, 200, prepared.text)
        labels = prepared.json()["rows"]["sku-a"]

        uploaded = self.client.post(
            f"/api/tools/packshots/{self.brand['slug']}/upload",
            data={"mapping_rows": __import__("json").dumps([labels, None])},
            files=[("files", ("sku-a.png", PNG, "image/png")), ("files", ("unmapped.jpg", b"\xff\xd8\xff" + b"jpeg", "image/jpeg"))],
        )
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        listing = self.client.get(f"/api/tools/packshots/{self.brand['slug']}").json()["images"]
        by_name = {image["file"]: image for image in listing}
        self.assertEqual(by_name["sku-a.png"]["annotation_name"], "Cola 330ml")
        self.assertEqual(by_name["unmapped.jpg"]["name"], "unmapped")

        replaced = self.client.post(
            f"/api/tools/packshots/{self.brand['slug']}/sku-a.png/replace",
            files={"image": ("new.png", PNG + b"replacement", "image/png")},
        )
        self.assertEqual(replaced.status_code, 200, replaced.text)
        after_replace = self.client.get(f"/api/tools/packshots/{self.brand['slug']}").json()["images"]
        self.assertEqual(next(row for row in after_replace if row["file"] == "sku-a.png")["annotation_name"], "Cola 330ml")

        archive_response = self.client.get(f"/api/tools/packshots/{self.brand['slug']}/download")
        self.assertEqual(archive_response.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(archive_response.content)) as archive:
            self.assertEqual(set(archive.namelist()), {"Cola_330ml.png", "unmapped.jpg"})

    def test_duplicate_mapping_names_are_rejected(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["Image name", "Annotation name", "Name", "ID"])
        sheet.append(["same.png", "First", "First", "1"])
        sheet.append(["SAME", "Second", "Second", "2"])
        stream = io.BytesIO()
        workbook.save(stream)
        response = self.client.post("/api/tools/packshots/prepare", files={"mapping": ("map.xlsx", stream.getvalue())})
        self.assertEqual(response.status_code, 400)
        self.assertIn("Duplicate image names", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
