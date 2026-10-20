"""Focused tests for spreadsheet column selection and image extraction."""
import asyncio
import csv
import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, UploadFile
from openpyxl import Workbook

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from services import image_extraction as extraction
from services import auth_store


PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"test-png-data"


class SpreadsheetColumnTests(unittest.TestCase):
    def test_csv_headers_keep_order_and_replace_blank_names(self):
        columns = extraction._read_sheet("links.csv", b"Product,Image URL,\nA,https://example.com/a.png,x\n")[1]
        self.assertEqual(columns, [
            {"index": 0, "name": "Product"},
            {"index": 1, "name": "Image URL"},
            {"index": 2, "name": "Column 3"},
        ])

    def test_xlsx_headers_are_returned_for_the_picker(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["SKU", "Photo Link"])
        sheet.append(["123", "https://example.com/123.jpg"])
        stream = io.BytesIO()
        workbook.save(stream)

        rows, columns = extraction._read_sheet("products.xlsx", stream.getvalue())

        self.assertEqual([column["name"] for column in columns], ["SKU", "Photo Link"])
        self.assertEqual(rows[1][1], "https://example.com/123.jpg")

    def test_rejects_unsupported_spreadsheet(self):
        with self.assertRaises(HTTPException) as raised:
            extraction._read_sheet("products.xls", b"data")
        self.assertEqual(raised.exception.status_code, 400)


class DownloadSafetyTests(unittest.TestCase):
    def test_private_address_is_rejected(self):
        private_result = [(2, 1, 6, "", ("127.0.0.1", 80))]
        with patch.object(extraction.socket, "getaddrinfo", return_value=private_result):
            with self.assertRaisesRegex(ValueError, "Private or reserved"):
                extraction._validate_public_url("http://localhost/image.png")

    def test_image_download_uses_content_type_and_writes_to_disk(self):
        transport = httpx.MockTransport(lambda request: httpx.Response(
            200,
            headers={"content-type": "image/png"},
            content=PNG_BYTES,
        ))
        with tempfile.TemporaryDirectory() as folder:
            destination = os.path.join(folder, "download")
            with httpx.Client(transport=transport, trust_env=False) as client:
                with patch.object(extraction, "_validate_public_url", return_value=urlparse("https://example.com/image")):
                    extension, error = extraction._download_one(client, "https://example.com/image", destination)
            self.assertIsNone(error)
            self.assertEqual(extension, ".png")
            with open(destination, "rb") as downloaded:
                self.assertEqual(downloaded.read(), PNG_BYTES)


class ExtractionFlowTests(unittest.IsolatedAsyncioTestCase):
    async def test_column_selection_stream_and_zip_names(self):
        with tempfile.TemporaryDirectory() as folder:
            original_results_dir = extraction.RESULTS_DIR
            original_auth_db = os.environ.get("AUTH_DB_PATH")
            original_session_secret = os.environ.get("SESSION_SECRET")
            os.environ["AUTH_DB_PATH"] = os.path.join(folder, "auth.sqlite3")
            os.environ["SESSION_SECRET"] = "test-session-pepper"
            auth_store.init_auth_store()
            owner = SimpleNamespace(state=SimpleNamespace(user={"email": "owner@example.org"}))
            extraction.RESULTS_DIR = folder
            real_client = httpx.Client
            transport = httpx.MockTransport(lambda request: httpx.Response(
                200,
                headers={"content-type": "image/png"},
                content=PNG_BYTES,
            ))

            def fake_client(*args, **kwargs):
                return real_client(transport=transport, trust_env=False)

            csv_bytes = b'SKU,Photos\n1,"https://public.example/a.png,https://public.example/b.png"\n'
            upload = UploadFile(filename="products.csv", file=io.BytesIO(csv_bytes))
            try:
                with patch.object(extraction.httpx, "Client", side_effect=fake_client), \
                     patch.object(extraction, "_validate_public_url", return_value=urlparse("https://public.example/")):
                    columns_response = await extraction.get_columns(UploadFile(filename="products.csv", file=io.BytesIO(csv_bytes)))
                    self.assertEqual([column["name"] for column in columns_response["columns"]], ["SKU", "Photos"])

                    response = await extraction.run_extraction(owner, upload, column_index=1)
                    payload = ""
                    async for chunk in response.body_iterator:
                        payload += chunk.decode() if isinstance(chunk, bytes) else chunk

                final_event = [line[6:] for line in payload.splitlines() if line.startswith("data: ")][-1]
                result = json.loads(final_event)
                self.assertTrue(result["done"])
                self.assertEqual(result["saved"], 2)
                job_id = result["download_url"].rsplit("/", 1)[1]

                with self.assertRaises(Exception):
                    await extraction.download_extraction(job_id, SimpleNamespace(state=SimpleNamespace(user={"email": "other@example.org"})))
                download = await extraction.download_extraction(job_id, owner)
                with zipfile.ZipFile(download.path) as archive:
                    self.assertEqual(set(archive.namelist()), {"image_2_1.png", "image_2_2.png"})
                await download.background()
                self.assertFalse(os.path.exists(os.path.dirname(download.path)))
            finally:
                extraction.RESULTS_DIR = original_results_dir
                if original_auth_db is None:
                    os.environ.pop("AUTH_DB_PATH", None)
                else:
                    os.environ["AUTH_DB_PATH"] = original_auth_db
                if original_session_secret is None:
                    os.environ.pop("SESSION_SECRET", None)
                else:
                    os.environ["SESSION_SECRET"] = original_session_secret


if __name__ == "__main__":
    unittest.main()
