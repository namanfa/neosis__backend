import os
import logging
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

from cryptography.fernet import Fernet
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from services import auth_store, control_panel, control_panel_store


class FakeBlobProvider:
    def __init__(self, result="success", raised=None):
        self.result = result
        self.raised = raised
        self.seen = []

    def test_connection(self, value):
        self.seen.append(value)
        if self.raised:
            raise RuntimeError(self.raised)
        return self.result

    def list_blob_metadata(self, value):
        return iter(())


class ControlPanelTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_db = os.environ.get("AUTH_DB_PATH")
        self.old_key = os.environ.get("TENANT_ENCRYPTION_KEY")
        self.old_seed = os.environ.get("IR_MEMBER_EMAILS")
        os.environ["AUTH_DB_PATH"] = str(Path(self.temp.name) / "auth.sqlite3")
        os.environ["TENANT_ENCRYPTION_KEY"] = Fernet.generate_key().decode("ascii")
        os.environ["IR_MEMBER_EMAILS"] = ""
        auth_store.init_auth_store()
        control_panel_store.init_control_panel_store()
        auth_store.add_ir_member("lead@fieldassist.com")
        self.provider = FakeBlobProvider()
        self.role = "IR"
        self.app = FastAPI()
        self.app.state.tenant_blob_provider = self.provider

        @self.app.middleware("http")
        async def attach_test_user(request: Request, call_next):
            request.state.user = {"email": "lead@fieldassist.com", "role": self.role}
            return await call_next(request)

        self.app.include_router(control_panel.router)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        for name, old in (("AUTH_DB_PATH", self.old_db), ("TENANT_ENCRYPTION_KEY", self.old_key), ("IR_MEMBER_EMAILS", self.old_seed)):
            if old is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = old
        self.temp.cleanup()

    def test_member_domain_normalization_duplicates_and_last_member_guard(self):
        for domain in ("flick2know.com", "flick2know.in", "fieldassist.com", "fieldassist.in"):
            response = self.client.post("/api/control-panel/ir-members", json={"email": "  New.User@" + domain.upper() + " "})
            self.assertEqual(response.status_code, 201, response.text)
            self.assertEqual(response.json()["member"], "new.user@" + domain)
            self.assertEqual(self.client.post("/api/control-panel/ir-members", json={"email": "new.user@" + domain}).status_code, 409)
        self.assertEqual(self.client.post("/api/control-panel/ir-members", json={"email": "person@example.net"}).status_code, 400)
        members = self.client.get("/api/control-panel/ir-members").json()["members"]
        for member in members[1:]:
            self.assertEqual(self.client.delete("/api/control-panel/ir-members/" + member).status_code, 200)
        final = self.client.get("/api/control-panel/ir-members").json()["members"][0]
        self.assertEqual(self.client.delete("/api/control-panel/ir-members/" + final).status_code, 409)

    def test_viewer_is_denied_all_control_panel_routes(self):
        self.role = "Viewer"
        calls = [
            ("get", "/api/control-panel/ir-members", None),
            ("post", "/api/control-panel/ir-members", {"email": "x@fieldassist.com"}),
            ("delete", "/api/control-panel/ir-members/lead%40fieldassist.com", None),
            ("get", "/api/control-panel/tenants", None),
            ("post", "/api/control-panel/tenants/test-connection", {"connection_string": "secret-value"}),
            ("post", "/api/control-panel/tenants", {"name": "T", "type": "general", "connection_string": "secret-value"}),
            ("patch", "/api/control-panel/tenants/1", {"name": "X"}),
            ("delete", "/api/control-panel/tenants/1", None),
        ]
        for method, path, body in calls:
            response = getattr(self.client, method)(path, json=body) if body is not None else getattr(self.client, method)(path)
            self.assertEqual(response.status_code, 403, (method, path, response.text))

    def test_connection_test_mapping_and_secret_redaction_on_error(self):
        secret = "AccountKey=private-example-token"
        for result in ("success", "authentication_failed", "unreachable", "not_found"):
            self.provider.result = result
            response = self.client.post("/api/control-panel/tenants/test-connection", json={"connection_string": secret})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json(), {"result": result})
            self.assertNotIn(secret, response.text)
        self.provider.raised = secret
        with self.assertNoLogs("services.control_panel", level=logging.DEBUG):
            response = self.client.post("/api/control-panel/tenants/test-connection", json={"connection_string": secret})
        self.assertEqual(response.json(), {"result": "unreachable"})
        self.assertNotIn(secret, response.text)

    def test_tenant_save_requires_test_and_never_returns_or_stores_plaintext(self):
        secret = "DefaultEndpointsProtocol=https;AccountKey=private-example-token"
        payload = {"name": "Tenant One", "type": "general", "connection_string": secret}
        self.assertEqual(self.client.post("/api/control-panel/tenants", json=payload).status_code, 409)
        tested = self.client.post("/api/control-panel/tenants/test-connection", json={"connection_string": secret})
        self.assertEqual(tested.json(), {"result": "success"})
        response = self.client.post("/api/control-panel/tenants", json=payload)
        self.assertEqual(response.status_code, 201, response.text)
        tenant = response.json()
        self.assertTrue(tenant["connection_configured"])
        self.assertNotIn(secret, response.text)
        self.assertNotIn("encrypted_connection", response.json())
        db = sqlite3.connect(os.environ["AUTH_DB_PATH"])
        try:
            stored = db.execute("SELECT encrypted_connection FROM tenants WHERE id=?", (tenant["id"],)).fetchone()[0]
        finally:
            db.close()
        self.assertNotIn(secret, stored)
        self.assertEqual(control_panel_store.decrypt_connection(stored), secret)
        self.assertNotIn(secret, self.client.get("/api/control-panel/tenants").text)

    def test_metadata_edit_and_replace_only_connection_semantics(self):
        first = "first-private-connection"
        self.client.post("/api/control-panel/tenants/test-connection", json={"connection_string": first})
        created = self.client.post("/api/control-panel/tenants", json={"name": "Original", "type": "general", "connection_string": first}).json()
        metadata = self.client.patch(f"/api/control-panel/tenants/{created['id']}", json={"name": "Renamed", "type": "brand"})
        self.assertEqual(metadata.status_code, 200, metadata.text)
        self.assertTrue(metadata.json()["connection_configured"])
        self.assertNotIn(first, metadata.text)
        second = "replacement-private-connection"
        self.assertEqual(self.client.patch(f"/api/control-panel/tenants/{created['id']}", json={"connection_string": second}).status_code, 409)
        self.client.post("/api/control-panel/tenants/test-connection", json={"connection_string": second})
        replaced = self.client.patch(f"/api/control-panel/tenants/{created['id']}", json={"connection_string": second})
        self.assertEqual(replaced.status_code, 200, replaced.text)
        self.assertNotIn(first, replaced.text)
        self.assertNotIn(second, replaced.text)
        db = sqlite3.connect(os.environ["AUTH_DB_PATH"])
        try:
            stored = db.execute("SELECT encrypted_connection FROM tenants WHERE id=?", (created["id"],)).fetchone()[0]
        finally:
            db.close()
        self.assertEqual(control_panel_store.decrypt_connection(stored), second)

    def test_delete_clears_secret_and_keeps_tombstone(self):
        value = "delete-private-connection"
        self.client.post("/api/control-panel/tenants/test-connection", json={"connection_string": value})
        tenant = self.client.post("/api/control-panel/tenants", json={"name": "Delete me", "type": "brand", "connection_string": value}).json()
        response = self.client.delete(f"/api/control-panel/tenants/{tenant['id']}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/control-panel/tenants").json()["tenants"], [])
        self.assertEqual(control_panel_store.list_tenants(include_deleted=True)[0]["connection_configured"], False)
        db = sqlite3.connect(os.environ["AUTH_DB_PATH"])
        try:
            self.assertIsNone(db.execute("SELECT encrypted_connection FROM tenants WHERE id=?", (tenant["id"],)).fetchone()[0])
        finally:
            db.close()

    def test_invalid_connection_payload_does_not_echo_secret(self):
        secret = "do-not-echo-this"
        response = self.client.post("/api/control-panel/tenants/test-connection", json={"connection_string": [secret]})
        self.assertEqual(response.status_code, 400)
        self.assertNotIn(secret, response.text)


if __name__ == "__main__":
    unittest.main()
