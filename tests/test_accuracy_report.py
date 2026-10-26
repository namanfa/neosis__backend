import io
import json
import os
import sys
import tempfile
import unittest
import uuid
import zipfile
from pathlib import Path
from unittest.mock import AsyncMock, patch
import xml.etree.ElementTree as ET

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from services import accuracy_report as report
from services import auth, auth_store
from services.session_manager import get_session_dir


def jpeg_bytes(color=(220, 30, 20)):
    output = io.BytesIO()
    Image.new("RGB", (32, 24), color).save(output, "JPEG")
    return output.getvalue()


class AccuracyReportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_db = os.environ.get("AUTH_DB_PATH")
        self.old_sessions = os.environ.get("SESSION_BASE_DIR")
        self.old_secure = os.environ.get("COOKIE_SECURE")
        self.old_config = {key: os.environ.get(key) for key in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OAUTH_REDIRECT_URI", "APP_BASE_URL", "ALLOWED_EMAIL_DOMAINS")}
        os.environ["AUTH_DB_PATH"] = str(Path(self.temp.name) / "auth.sqlite3")
        os.environ["SESSION_BASE_DIR"] = str(Path(self.temp.name) / "sessions")
        os.environ["COOKIE_SECURE"] = "false"
        os.environ["GOOGLE_CLIENT_ID"] = "test-client-id"
        os.environ["GOOGLE_CLIENT_SECRET"] = "test-client-secret"
        os.environ["OAUTH_REDIRECT_URI"] = "http://testserver/auth/callback"
        os.environ["APP_BASE_URL"] = "http://testserver"
        os.environ["ALLOWED_EMAIL_DOMAINS"] = "fieldassist.com"
        auth_store.init_auth_store()
        self.app = FastAPI()
        self.app.include_router(report.router)
        self.app.include_router(auth.router)

        @self.app.middleware("http")
        async def user_context(request: Request, call_next):
            request.state.user = {"email": "person@fieldassist.com", "role": "Viewer"}
            return await call_next(request)

        self.client = TestClient(self.app)
        created = self.client.post("/api/accuracy-report/sessions")
        self.assertEqual(created.status_code, 200)
        self.session_id = created.json()["session_id"]
        self.directory = Path(get_session_dir(self.session_id)) / "accuracy_report"

    def tearDown(self):
        self.client.close()
        for name, value in (("AUTH_DB_PATH", self.old_db), ("SESSION_BASE_DIR", self.old_sessions), ("COOKIE_SECURE", self.old_secure)):
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        for name, value in self.old_config.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        self.temp.cleanup()

    def test_format2_mapping_numeric_order_extension_independent_and_skip_lists(self):
        rows = [
            {"row_number": 2, "prediction": "[]"},
            {"row_number": 9, "prediction": "[]"},
            {"row_number": 10, "prediction": "[]"},
            {"row_number": 12, "prediction": "[]"},
        ]
        images = [{"key": name, "name": name} for name in ("image_10.png", "image_9.jpg", "image_2.webp", "image_4.jpg", "unmatched.png")]
        preview = report.build_format2_preview(rows, images)
        self.assertEqual([block["row_number"] for block in preview["blocks"]], [2, 9, 10])
        self.assertEqual([block["image_name"] for block in preview["blocks"]], ["image_2.webp", "image_9.jpg", "image_10.png"])
        self.assertEqual(preview["skipped_rows"], [12])
        self.assertEqual(preview["skipped_images"], ["image_4.jpg", "unmatched.png"])
        self.assertEqual(preview["matched_count"], 3)

    def test_workbook_sheet_and_column_values_are_read_by_excel_row_number(self):
        from openpyxl import Workbook
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Predictions"
        sheet.append(["ID", "PredictionResult"])
        sheet.append(["a", '[{"Product":"Soda","Count":2}]'])
        sheet.append(["b", "[]"])
        content = io.BytesIO()
        workbook.save(content)
        workbook.close()
        sheets = report._workbook_info(content.getvalue())
        self.assertEqual(sheets["Predictions"][1]["name"], "PredictionResult")
        rows = report._read_rows(content.getvalue(), "Predictions", 1)
        self.assertEqual([row["row_number"] for row in rows], [2, 3])
        self.assertEqual(rows[0]["prediction"], '[{"Product":"Soda","Count":2}]')

    def test_duplicate_row_images_flagged_and_skipped_and_zero_matches(self):
        rows = [{"row_number": 2, "prediction": "[]"}]
        duplicate = report.build_format2_preview(rows, [
            {"key": "a", "name": "image_2.jpg"}, {"key": "b", "name": "image_2.png"}])
        self.assertEqual(duplicate["matched_count"], 0)
        self.assertEqual(len(duplicate["duplicate_images"]), 2)
        self.assertEqual(duplicate["skipped_rows"], [2])
        blocked = report.build_format2_preview(rows, [{"key": "x", "name": "image_3.jpg"}])
        self.assertEqual(blocked["matched_count"], 0)

    def test_json_escape_empty_invalid_count_others_repeat_and_no_execution(self):
        parsed = report._parse_prediction('[{"Product":"Cola\\u002B","Count":2},{"Label":"Others seasonal","Count":1},{"Product":"Cola+","Count":3}]')
        self.assertEqual(parsed, [{"sku_name": "Cola+", "detected": 5, "available": 5}, {"sku_name": "Others seasonal", "detected": 1, "available": 1}])
        self.assertEqual(report._parse_prediction("[]"), [])
        self.assertIsNone(report._parse_prediction("not JSON"))
        self.assertIsNone(report._parse_prediction('[{"Product":"A","Count":-1}]'))
        self.assertIsNone(report._parse_prediction('[{"Product":"A","Count":"one"}]'))
        marker = Path(self.temp.name) / "executed.txt"
        payload = f'__import__("pathlib").Path({str(marker)!r}).write_text("bad")'
        self.assertIsNone(report._parse_prediction(payload))
        self.assertFalse(marker.exists())

    def test_format1_natural_order_starts_at_one(self):
        preview = report.build_format1_preview([{"key": name, "name": name} for name in ("image_10.png", "image_2.jpg", "image_1.jpg")])
        self.assertEqual([item["image_name"] for item in preview["blocks"]], ["image_1.jpg", "image_2.jpg", "image_10.png"])
        self.assertTrue(all(item["total_detected"] is None for item in preview["blocks"]))

    def test_unreadable_upload_is_skipped_and_cleanup_tag_is_registered(self):
        response = self.client.post(f"/api/accuracy-report/sessions/{self.session_id}/images", files=[
            ("files", ("bad.jpg", b"not an image", "image/jpeg")),
            ("files", ("good.jpg", jpeg_bytes(), "image/jpeg")),
        ])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["images"], 1)
        self.assertEqual(response.json()["skipped"][0]["reason"], "unreadable image")
        self.assertEqual((self.directory / "cleanup-tag.json").exists(), True)
        db = __import__("sqlite3").connect(os.environ["AUTH_DB_PATH"])
        try:
            row = db.execute("SELECT session_type FROM tool_sessions WHERE session_id=?", (self.session_id,)).fetchone()
        finally:
            db.close()
        self.assertEqual(row[0], "accuracy_report")

    def test_image_processing_keeps_original_and_corrects_orientates_compresses(self):
        source = self.directory / "source.jpg"
        source.write_bytes(jpeg_bytes())
        before = source.read_bytes()
        destination = Path(self.temp.name) / "processed.jpg"
        report._processed_image(source, destination, {"max_dimension": 20, "jpeg_quality": 78})
        self.assertEqual(source.read_bytes(), before)
        with Image.open(destination) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertLessEqual(max(image.size), 20)
        with self.assertRaises(Exception):
            report._processed_image(Path(self.temp.name) / "bad.jpg", destination, report.limits())
        oriented = Path(self.temp.name) / "oriented.jpg"
        image = Image.new("RGB", (20, 10), (20, 80, 180))
        exif = image.getexif()
        exif[274] = 6
        image.save(oriented, "JPEG", exif=exif)
        rotated = Path(self.temp.name) / "rotated.jpg"
        report._processed_image(oriented, rotated, {"max_dimension": 100, "jpeg_quality": 80})
        with Image.open(rotated) as image:
            self.assertEqual(image.size, (10, 20))

    def test_docx_format2_contains_images_sums_and_blank_accuracy_cells(self):
        source = self.directory / "source.jpg"
        source.write_bytes(jpeg_bytes())
        preview = {"format": 2, "blocks": [{"image_key": "a", "items": [{"sku_name": "Soda", "detected": 3, "available": 3}],
                    "total_available": 3, "total_detected": 3, "invalid_prediction": False}]}
        output = Path(self.temp.name) / "report.docx"
        report._build_docx(preview, self.directory, "My report", output, {"a": str(source)}, report.limits())
        with zipfile.ZipFile(output) as archive:
            self.assertIn("word/media/image1.jpg", archive.namelist())
            root = ET.fromstring(archive.read("word/document.xml"))
        text = [element.text or "" for element in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")]
        self.assertIn("Total SKU Available: ", text)
        self.assertIn("SKU Detected: ", text)
        self.assertIn("Accuracy: ", text)
        self.assertIn("3", text)
        self.assertIn("Available", text)
        self.assertNotIn("0%", text)
        tables = root.findall(".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tbl")
        self.assertEqual(len(tables), 1)
        rows = tables[0].findall("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tr")
        self.assertEqual(len(rows), 3)
        accuracy_cell = rows[-1].findall("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tc")[-1]
        self.assertEqual("".join(element.text or "" for element in accuracy_cell.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")), "")

    def test_docx_format1_has_no_table_and_fields_are_blank(self):
        source = self.directory / "source.jpg"
        source.write_bytes(jpeg_bytes())
        preview = {"format": 1, "blocks": [{"image_key": "a", "items": [], "invalid_prediction": False}]}
        output = Path(self.temp.name) / "image-report.docx"
        report._build_docx(preview, self.directory, "Image report", output, {"a": str(source)}, report.limits())
        with zipfile.ZipFile(output) as archive:
            root = ET.fromstring(archive.read("word/document.xml"))
        self.assertEqual(root.findall(".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tbl"), [])
        text = [element.text or "" for element in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")]
        self.assertIn("Incorrect: ", text)
        self.assertIn("Missing: ", text)
        self.assertIn("Accuracy: ", text)

    def test_google_authorize_requests_drive_file_and_oauth_decline_missing_permission_success(self):
        response = self.client.get(f"/api/accuracy-report/google/authorize?session_id={self.session_id}", follow_redirects=False)
        self.assertEqual(response.status_code, 302)
        self.assertIn("drive.file", response.headers["location"])
        self.assertIn("include_granted_scopes=true", response.headers["location"])

        def transaction():
            state = uuid.uuid4().hex
            auth_store.save_oauth_transaction(state, "nonce", "verifier", "__accuracy_report_oauth__")
            return state

        declined = self.client.get("/auth/callback", params={"state": transaction(), "error": "access_denied"})
        self.assertIn('"error": "declined"', declined.text)

        session_token = auth_store.create_session("person@fieldassist.com", "Person", "", 480, 1)
        cookie = {auth.cookie_name(): session_token}
        state = transaction()

        class FakeResponse:
            status_code = 200
            def __init__(self, data): self.data = data
            def json(self): return self.data

        class FakeClient:
            def __init__(self, data): self.data = data
            async def __aenter__(self): return self
            async def __aexit__(self, *args): return None
            async def post(self, *args, **kwargs): return FakeResponse(self.data)

        with patch.object(auth.httpx, "AsyncClient", lambda **kwargs: FakeClient({"id_token": "id", "access_token": "report-secret"})), \
             patch.object(auth, "_verify_id_token", new=AsyncMock(return_value={"email": "person@fieldassist.com"})):
            success = self.client.get("/auth/callback", params={"state": state, "code": "fake-code"}, cookies=cookie)
        self.assertIn('"access_token": "report-secret"', success.text)
        self.assertEqual(success.headers.get("cache-control"), "no-store")

        state = transaction()
        with patch.object(auth.httpx, "AsyncClient", lambda **kwargs: FakeClient({"id_token": "id"})), \
             patch.object(auth, "_verify_id_token", new=AsyncMock(return_value={"email": "person@fieldassist.com"})):
            missing = self.client.get("/auth/callback", params={"state": state, "code": "fake-code"}, cookies=cookie)
        self.assertIn('"error": "missing_permission"', missing.text)

    def test_generation_success_and_failure_stage_with_mocked_drive(self):
        images_dir = self.directory / "images"
        images_dir.mkdir(exist_ok=True)
        (images_dir / "source.jpg").write_bytes(jpeg_bytes())
        preview = {"format": 1, "blocks": [{"row_number": None, "image_key": "source.jpg", "image_name": "photo.jpg", "items": [],
                    "invalid_prediction": False, "total_available": None, "total_detected": None}]}
        (self.directory / "preview.json").write_text(json.dumps(preview), encoding="utf-8")
        good = AsyncMock(return_value=("drive-id", "https://docs.google.com/document/d/drive-id/edit"))
        with patch.object(report, "_drive_create", new=good):
            response = self.client.post(f"/api/accuracy-report/sessions/{self.session_id}/generate", headers={"Authorization": "Bearer test-token"}, data={"title": "Test"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn('"state": "complete"', response.text)
        for stage in ("Reading data", "Mapping images", "Preparing images", "Creating document"):
            self.assertIn(stage, response.text)
        self.assertTrue((self.directory / "result.json").exists())

        (self.directory / "result.json").unlink(missing_ok=True)
        failed = AsyncMock(side_effect=RuntimeError("private provider response"))
        with patch.object(report, "_drive_create", new=failed), self.assertLogs(report.logger, level="WARNING") as captured:
            failure = self.client.post(f"/api/accuracy-report/sessions/{self.session_id}/generate", headers={"Authorization": "Bearer another-token"}, data={"title": "Test"})
        self.assertIn('"stage": "Creating document"', failure.text)
        self.assertNotIn("another-token", "\n".join(captured.output))
        self.assertNotIn("private provider response", failure.text)
        self.assertFalse((self.directory / "result.json").exists())

    def test_generate_200_image_report_streams_all_images_to_mocked_drive(self):
        images_dir = self.directory / "images"
        images_dir.mkdir(exist_ok=True)
        image_bytes = jpeg_bytes()
        blocks = []
        for index in range(200):
            key = f"image-{index}.jpg"
            (images_dir / key).write_bytes(image_bytes)
            blocks.append({"row_number": None, "image_key": key, "image_name": key, "items": [],
                           "invalid_prediction": False, "total_available": None, "total_detected": None})
        (self.directory / "preview.json").write_text(json.dumps({"format": 1, "blocks": blocks}), encoding="utf-8")
        with patch.object(report, "_drive_create", new=AsyncMock(return_value=("doc-200", "https://docs.google.com/document/d/doc-200/edit"))):
            response = self.client.post(f"/api/accuracy-report/sessions/{self.session_id}/generate", headers={"Authorization": "Bearer request-token"}, data={"title": "200 images"})
        self.assertEqual(response.status_code, 200, response.text[-500:])
        self.assertIn('"total": 200', response.text)
        self.assertIn('"state": "complete"', response.text)

    def test_download_exports_live_doc_with_lro_and_hides_provider_errors(self):
        (self.directory / "result.json").write_text(json.dumps({"doc_id": "doc-id", "doc_url": "https://docs.google.com/document/d/doc-id/edit"}), encoding="utf-8")
        calls = []

        class FakeResponse:
            status_code = 200
            headers = {}
            content = b"current docx bytes"
            def __init__(self, data=None, status=200, headers=None, content=None):
                self.data, self.status_code = data, status
                self.headers = headers or {}
                self.content = content or b""
            def json(self): return self.data

        class FakeClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *args): return None
            async def post(self, url, **kwargs):
                calls.append(("post", url, kwargs["headers"].get("Authorization")))
                return FakeResponse({"name": "operations/op-1", "done": True,
                    "response": {"downloadUri": "https://drive.google.com/uc?id=doc-id"}})
            async def get(self, url, **kwargs):
                calls.append(("get", url, kwargs.get("headers", {}).get("Authorization")))
                return FakeResponse(status=200, content=b"latest edited docx")

        with patch.object(report.httpx, "AsyncClient", lambda **kwargs: FakeClient()):
            response = self.client.post(f"/api/accuracy-report/sessions/{self.session_id}/download", headers={"Authorization": "Bearer transient-token"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.content, b"latest edited docx")
        self.assertEqual(calls[0][2], "Bearer transient-token")
        self.assertIsNone(calls[1][2])

        class BadClient(FakeClient):
            async def post(self, url, **kwargs):
                return FakeResponse({"error": {"message": "provider secret"}}, status=403)
        with patch.object(report.httpx, "AsyncClient", lambda **kwargs: BadClient()):
            failure = self.client.post(f"/api/accuracy-report/sessions/{self.session_id}/download", headers={"Authorization": "Bearer transient-token"})
        self.assertEqual(failure.status_code, 502)
        self.assertNotIn("provider secret", failure.text)

    def test_foreign_user_cannot_read_report_image_or_use_session(self):
        image_dir = self.directory / "images"
        image_dir.mkdir(exist_ok=True)
        (image_dir / "x.jpg").write_bytes(jpeg_bytes())
        foreign_app = FastAPI()
        foreign_app.include_router(report.router)

        @foreign_app.middleware("http")
        async def foreign_user(request: Request, call_next):
            request.state.user = {"email": "other@fieldassist.com", "role": "Viewer"}
            return await call_next(request)

        client = TestClient(foreign_app)
        response = client.get(f"/api/accuracy-report/sessions/{self.session_id}/images/x.jpg")
        self.assertEqual(response.status_code, 404)
        client.close()


if __name__ == "__main__":
    unittest.main()
