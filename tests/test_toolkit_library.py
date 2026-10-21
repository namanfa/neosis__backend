"""Coverage for the local Testing Images and Packshots API flows."""
import io
import os
import sys
import tempfile
import unittest
import zipfile
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import Workbook
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from services import toolkit_library
from services.toolkit_library import router
from storage.brands import add_brand
from storage.local import LocalBackend


PNG = b"\x89PNG\r\n\x1a\n" + (b"fake-png-content" * 4)


def make_png(size=(500, 400), color=(20, 80, 160)):
    output = io.BytesIO()
    Image.new("RGB", size, color).save(output, format="PNG")
    return output.getvalue()


class ToolkitLibraryApiTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.storage = LocalBackend(self.tempdir.name)
        self.brand = add_brand(self.storage, "Acme Foods")
        app = FastAPI()
        app.state.storage = self.storage
        @app.middleware("http")
        async def attach_test_user(request, call_next):
            request.state.user = {"email": "reviewer@example.com"}
            return await call_next(request)
        app.include_router(router)
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        toolkit_library._derivative_pool.submit(lambda: None).result(timeout=10)
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
        self.assertEqual(gallery["asset_counts"], {"drinks": 2, "general": 1})
        self.assertEqual(gallery["asset_names"], {"drinks": "drinks"})
        filtered = self.client.get(f"/api/tools/testing/{self.brand['slug']}/images?asset=drinks").json()
        self.assertEqual(len(filtered["images"]), 2)

    def test_testing_asset_display_names_preserve_original_case_and_filter_by_slug(self):
        response = self.client.post(
            f"/api/tools/testing/{self.brand['slug']}/upload",
            data={"relative_paths": '["CA Berry Mint 55g/photo.png", "CA ME Xmen Pillow Bag & Co./photo.png", "5 Gum Peppermint Cobalt/photo.png"]'},
            files=[("files", ("photo.png", make_png(), "image/png")), ("files", ("photo.png", make_png(), "image/png")), ("files", ("photo.png", make_png(), "image/png"))],
        )
        self.assertEqual(response.status_code, 200, response.text)

        gallery = self.client.get(f"/api/tools/testing/{self.brand['slug']}/images").json()
        self.assertEqual(gallery["asset_names"], {
            "ca-berry-mint-55g": "CA Berry Mint 55g",
            "ca-me-xmen-pillow-bag-co": "CA ME Xmen Pillow Bag & Co.",
            "5-gum-peppermint-cobalt": "5 Gum Peppermint Cobalt",
        })
        self.assertEqual(
            {image["asset_name"] for image in gallery["images"]},
            {"CA Berry Mint 55g", "CA ME Xmen Pillow Bag & Co.", "5 Gum Peppermint Cobalt"},
        )
        toolkit_library._gallery_data_cache.clear()
        filtered = self.client.get(f"/api/tools/testing/{self.brand['slug']}/images?asset=CA-BERRY-MINT-55G").json()
        self.assertEqual(len(filtered["images"]), 1)
        self.assertEqual(filtered["images"][0]["asset_name"], "CA Berry Mint 55g")

    def test_existing_testing_asset_names_can_be_repaired_without_reupload(self):
        slug = self.brand["slug"]
        existing_key = f"testing/{slug}/ca-berry-mint-55g/photo.png"
        self.storage.put(existing_key, make_png(), "image/png")
        initial = self.client.get(f"/api/tools/testing/{slug}/images").json()
        self.assertEqual(initial["asset_names"], {})
        self.assertNotIn("asset_name", initial["images"][0])

        response = self.client.post(
            f"/api/tools/testing/{slug}/asset-names",
            json=["CA Berry Mint 55g/photo.png"],
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["asset_names"], {"ca-berry-mint-55g": "CA Berry Mint 55g"})
        self.assertTrue(self.storage.exists(existing_key))

        toolkit_library._gallery_data_cache.clear()
        gallery = self.client.get(f"/api/tools/testing/{slug}/images?asset=CA-BERRY-MINT-55G").json()
        self.assertEqual(len(gallery["images"]), 1)
        self.assertEqual(gallery["images"][0]["asset_name"], "CA Berry Mint 55g")

        # Labels live in durable storage and survive dropping/rebuilding the gallery index.
        toolkit_library._gallery_data_cache.clear()
        self.storage.delete(toolkit_library._gallery_index_key("testing", slug))
        rebuilt = self.client.get(f"/api/tools/testing/{slug}/images").json()
        self.assertEqual(rebuilt["asset_names"]["ca-berry-mint-55g"], "CA Berry Mint 55g")
        brand_row = next(row for row in self.client.get("/api/tools/brands").json()["brands"] if row["slug"] == slug)
        self.assertEqual(brand_row["testing_asset_names"]["ca-berry-mint-55g"], "CA Berry Mint 55g")

    def test_testing_asset_names_keep_first_case_and_unicode_labels(self):
        slug = self.brand["slug"]
        for folder in ("GT", "gt", "Co.op Phan Thiết Column", "CA Berry (Mint) & More", "COC Topline (AW DMR)", "Team-X Shelf"):
            response = self.client.post(
                f"/api/tools/testing/{slug}/upload",
                data={"relative_paths": __import__("json").dumps([f"{folder}/photo.png"], ensure_ascii=False)},
                files=[("files", ("photo.png", make_png(), "image/png"))],
            )
            self.assertEqual(response.status_code, 200, response.text)
        gallery = self.client.get(f"/api/tools/testing/{slug}/images").json()
        self.assertEqual(gallery["asset_names"]["gt"], "GT")
        self.assertEqual(gallery["asset_names"][toolkit_library._slug("COC Topline (AW DMR)", "Asset")], "COC Topline (AW DMR)")
        unicode_slug = toolkit_library._slug("Co.op Phan Thiết Column", "Asset")
        self.assertEqual(gallery["asset_names"][unicode_slug], "Co.op Phan Thiết Column")
        punctuation_slug = toolkit_library._slug("CA Berry (Mint) & More", "Asset")
        self.assertEqual(gallery["asset_names"][punctuation_slug], "CA Berry (Mint) & More")
        self.assertEqual(gallery["asset_names"][toolkit_library._slug("Team-X Shelf", "Asset")], "Team-X Shelf")
        self.assertEqual(gallery["asset_counts"]["gt"], 2)

    def test_corrupt_asset_name_metadata_does_not_break_listing(self):
        slug = self.brand["slug"]
        self.storage.put(f"testing/{slug}/legacy/photo.png", make_png(), "image/png")
        self.storage.put(toolkit_library._asset_names_key(slug), b"{invalid-json", "application/json")
        toolkit_library._gallery_data_cache.clear()
        response = self.client.get(f"/api/tools/testing/{slug}/images")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["assets"], ["legacy"])
        self.assertEqual(response.json()["asset_names"], {})

    def test_testing_image_and_collection_deletion_leave_packshots_untouched(self):
        slug = self.brand["slug"]
        testing_key = f"testing/{slug}/random/photo.png"
        packshot_key = f"packshots/{slug}/sku-a.png"
        self.storage.put(testing_key, make_png(), "image/png")
        self.storage.put(packshot_key, make_png(), "image/png")
        self.storage.put_json(f"packshots/{slug}/manifest.json", [{"file": "sku-a.png", "annotation_name": "SKU A"}])
        toolkit_library._refresh_gallery(self.storage, "testing", slug)
        toolkit_library._refresh_gallery(self.storage, "packshots", slug)

        rejected = self.client.request(
            "DELETE",
            f"/api/tools/testing/{slug}/images",
            content=__import__("json").dumps([packshot_key]),
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(rejected.status_code, 404)
        self.assertTrue(self.storage.exists(packshot_key))

        deleted = self.client.request(
            "DELETE",
            f"/api/tools/testing/{slug}/images",
            content=__import__("json").dumps([testing_key]),
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertFalse(self.storage.exists(testing_key))
        self.assertTrue(self.storage.exists(packshot_key))
        self.assertEqual(len(self.client.get(f"/api/tools/packshots/{slug}").json()["images"]), 1)

        self.storage.put(testing_key, make_png(), "image/png")
        toolkit_library._refresh_gallery(self.storage, "testing", slug)
        cleared = self.client.delete(f"/api/tools/testing/{slug}")
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertEqual(cleared.json()["deleted"], 1)
        self.assertFalse(self.storage.exists(testing_key))
        self.assertTrue(self.storage.exists(packshot_key))
        self.assertEqual(len(self.client.get(f"/api/tools/packshots/{slug}").json()["images"]), 1)

    def test_packshot_collection_deletion_leaves_testing_images_untouched(self):
        slug = self.brand["slug"]
        testing_key = f"testing/{slug}/random/photo.png"
        packshot_key = f"packshots/{slug}/sku-a.png"
        self.storage.put(testing_key, make_png(), "image/png")
        self.storage.put(packshot_key, make_png(), "image/png")
        self.storage.put_json(f"packshots/{slug}/manifest.json", [{"file": "sku-a.png", "annotation_name": "SKU A"}])
        toolkit_library._refresh_gallery(self.storage, "testing", slug)
        toolkit_library._refresh_gallery(self.storage, "packshots", slug)

        deleted = self.client.delete(f"/api/tools/packshots/{slug}")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(deleted.json()["deleted"], 1)
        self.assertFalse(self.storage.exists(packshot_key))
        self.assertTrue(self.storage.exists(testing_key))
        self.assertEqual(len(self.client.get(f"/api/tools/testing/{slug}/images").json()["images"]), 1)

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
        stored_keys = self.storage.list("packshots/" + self.brand["slug"])
        self.assertIn("unmapped.jpg", by_name, f"gallery rows={list(by_name)} storage={stored_keys}")
        self.assertEqual(by_name["unmapped.jpg"]["name"], "unmapped")

        replaced = self.client.post(
            f"/api/tools/packshots/{self.brand['slug']}/sku-a.png/replace",
            files={"image": ("new.png", make_png((400, 300)), "image/png")},
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

    def test_logo_upload_and_versioned_logo_response(self):
        logo = make_png((300, 200))
        saved = self.client.post(
            f"/api/tools/brands/{self.brand['slug']}/logo",
            files={"logo": ("brand.png", logo, "image/png")},
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        logo_url = saved.json()["logo_url"]
        response = self.client.get(logo_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "image/png")
        self.assertIn("immutable", response.headers["cache-control"])
        with Image.open(io.BytesIO(response.content)) as image:
            self.assertLessEqual(max(image.size), 128)
        response.close()

        brands = self.client.get("/api/tools/brands")
        self.assertEqual(brands.status_code, 200)
        self.assertEqual(brands.json()["brands"][0]["logo_url"], logo_url)
        self.assertIn("Server-Timing", brands.headers)
        self.assertEqual(self.client.get("/api/tools/brands", headers={"If-None-Match": brands.headers["etag"]}).status_code, 304)

    def test_gallery_thumbnail_is_generated_and_cached(self):
        image = make_png((2400, 800))
        uploaded = self.client.post(
            f"/api/tools/testing/{self.brand['slug']}/upload",
            data={"relative_paths": '["shelf/photo.png"]'},
            files=[("files", ("photo.png", image, "image/png"))],
        )
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        entry = self.client.get(f"/api/tools/testing/{self.brand['slug']}/images").json()["images"][0]
        self.assertEqual(entry["width"], 2400)
        thumb = self.client.get(entry["thumb_url"])
        self.assertEqual(thumb.status_code, 200, f"{entry['thumb_url']} -> {thumb.text}")
        self.assertEqual(thumb.headers["content-type"], "image/webp")
        self.assertIn("immutable", thumb.headers["cache-control"])
        with Image.open(io.BytesIO(thumb.content)) as derivative:
            self.assertLessEqual(max(derivative.size), 640)

    def test_derivative_size_and_dimension_gate_keeps_original_urls(self):
        cases = [
            ("small-1m.png", (1200, 800), 1024 * 1024, "none"),
            ("small-29m.png", (1200, 800), int(2.9 * 1024 * 1024), "none"),
            ("large-31m.png", (1200, 800), int(3.1 * 1024 * 1024), "generated"),
            ("wide-2m.png", (6000, 3000), 2 * 1024 * 1024, "generated"),
        ]
        files, paths, originals = [], [], {}
        for filename, dimensions, size, _ in cases:
            data = make_png(dimensions) + b"\x00" * max(0, size - len(make_png(dimensions)))
            originals[filename] = data
            files.append(("files", (filename, data, "image/png")))
            paths.append(filename)
        response = self.client.post(
            f"/api/tools/testing/{self.brand['slug']}/upload",
            data={"relative_paths": __import__("json").dumps(paths)},
            files=files,
        )
        self.assertEqual(response.status_code, 200, response.text)
        gallery = self.client.get(f"/api/tools/testing/{self.brand['slug']}/images").json()["images"]
        by_file = {row["file"]: row for row in gallery}
        self.assertEqual({name: by_file[name]["derivative"] for name, _, _, _ in cases}, {name: expected for name, _, _, expected in cases})
        for filename, _, _, decision in cases:
            if decision == "none":
                self.assertEqual(by_file[filename]["thumb_url"], by_file[filename]["url"])
                self.assertEqual(by_file[filename]["preview_url"], by_file[filename]["url"])
            with self.storage.get(f"testing/{self.brand['slug']}/{filename}") as source:
                self.assertEqual(source.read(), originals[filename])

    def test_derivative_threshold_can_be_changed_by_environment(self):
        with mock.patch.dict(os.environ, {"IMAGE_DERIVATIVE_MIN_BYTES": str(512 * 1024)}):
            self.assertTrue(toolkit_library._derivative_gate(1024 * 1024, 1200, 800))
        self.assertFalse(toolkit_library._derivative_gate(1024 * 1024, 1200, 800))

    def test_non_smaller_webp_falls_back_to_original(self):
        image = make_png((1200, 800)) + b"\x00" * (3 * 1024 * 1024)
        key = f"testing/{self.brand['slug']}/large.png"
        self.storage.put(key, image, "image/png")
        toolkit_library._refresh_gallery(self.storage, "testing", self.brand["slug"])
        with mock.patch.object(toolkit_library, "_make_webp", side_effect=[(b"x" * (len(image) + 1), 1200, 800), (b"y" * (len(image) + 1), 1200, 800)]):
            result = toolkit_library._generate_derivatives(self.storage, "testing", self.brand["slug"], key, toolkit_library._version_for(next(row for row in self.storage.list_entries(f"testing/{self.brand['slug']}") if row["key"] == key)), image)
        self.assertEqual(result["derivative"], "none")
        self.assertEqual(result["card"], key)
        self.assertEqual(result["preview"], key)

    def test_packshot_labels_edit_persist_and_zip_uses_updated_annotation(self):
        image = make_png((300, 200))
        uploaded = self.client.post(
            f"/api/tools/packshots/{self.brand['slug']}/upload",
            data={"mapping_rows": '[{"annotation_name":"Original label","name":"Cola","id":"A1"},{"annotation_name":"Other","name":"Juice","id":"B2"}]'},
            files=[("files", ("sku.png", image, "image/png")), ("files", ("other.png", image, "image/png"))],
        )
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        before = next(row for row in self.client.get(f"/api/tools/packshots/{self.brand['slug']}").json()["images"] if row["file"] == "sku.png")
        url = f"/api/tools/packshots/{self.brand['slug']}/sku.png/labels"
        edited = self.client.patch(url, headers={"If-Match": before["label_etag"]}, json={"field": "annotation", "value": "  New   label  "})
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()["annotation_name"], "New label")
        self.assertEqual(edited.json()["updated_by"], "reviewer@example.com")
        after = next(row for row in self.client.get(f"/api/tools/packshots/{self.brand['slug']}").json()["images"] if row["file"] == "sku.png")
        self.assertEqual(after["annotation_name"], "New label")
        conflict = self.client.patch(url, headers={"If-Match": before["label_etag"]}, json={"field": "id", "value": "B2"})
        self.assertEqual(conflict.status_code, 409)
        cleared = self.client.patch(url, headers={"If-Match": after["label_etag"]}, json={"field": "annotation", "value": ""})
        self.assertEqual(cleared.status_code, 200)
        self.assertEqual(cleared.json()["annotation_name"], "sku")
        named = self.client.patch(url, headers={"If-Match": cleared.json()["label_etag"]}, json={"field": "name", "value": "<script>alert(1)</script>"})
        self.assertEqual(named.status_code, 200)
        self.assertEqual(named.json()["name"], "<script>alert(1)</script>")
        identified = self.client.patch(url, headers={"If-Match": named.json()["label_etag"]}, json={"field": "id", "value": "B2"})
        self.assertEqual(identified.status_code, 200)
        self.assertEqual(identified.json()["id"], "B2")
        empty_name = self.client.patch(url, headers={"If-Match": identified.json()["label_etag"]}, json={"field": "name", "value": ""})
        self.assertEqual(empty_name.status_code, 200)
        self.assertEqual(empty_name.json()["name"], "")
        duplicate = self.client.patch(url, headers={"If-Match": empty_name.json()["label_etag"]}, json={"field": "annotation", "value": "Other"})
        self.assertEqual(duplicate.status_code, 200)
        self.assertTrue(duplicate.json()["duplicate_annotation_name"])
        invalid = self.client.patch(url, headers={"If-Match": duplicate.json()["label_etag"]}, json={"field": "name", "value": "x" * 201})
        self.assertEqual(invalid.status_code, 400)
        saved_zip = self.client.get(f"/api/tools/packshots/{self.brand['slug']}/download")
        with zipfile.ZipFile(io.BytesIO(saved_zip.content)) as archive:
            self.assertEqual(set(archive.namelist()), {"Other.png", "Other_1.png"})
        with self.storage.get(f"packshots/{self.brand['slug']}/sku.png") as source:
            self.assertEqual(source.read(), image)


if __name__ == "__main__":
    unittest.main()
