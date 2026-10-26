import os
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.fernet import Fernet
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from services import auth_store, control_panel, control_panel_store, model_dashboard, model_dashboard_store as store
from services import model_dashboard_sync as sync


class FakeBlobProvider:
    def __init__(self):
        self.blobs = {}
        self.error = None
        self.block = None
        self.calls = []

    def list_blob_metadata(self, connection):
        self.calls.append(connection)
        if self.block:
            self.block.set()
            time.sleep(0.25)
        if self.error:
            raise RuntimeError(self.error)
        return list(self.blobs.get(connection, []))

    def result_for_error(self, error):
        return "unreachable"


class ModelDashboardTests(unittest.TestCase):
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
        store.init_model_dashboard_store()
        auth_store.add_ir_member("ir@fieldassist.com")
        self.provider = FakeBlobProvider()
        self.role = "IR"
        self.app = FastAPI()
        self.app.state.tenant_blob_provider = self.provider

        @self.app.middleware("http")
        async def attach_test_user(request: Request, call_next):
            request.state.user = {"email": "ir@fieldassist.com", "role": self.role}
            return await call_next(request)

        self.app.include_router(control_panel.router)
        self.app.include_router(model_dashboard.router)
        self.app.include_router(model_dashboard.sync_router)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        for name, old in (("AUTH_DB_PATH", self.old_db), ("TENANT_ENCRYPTION_KEY", self.old_key), ("IR_MEMBER_EMAILS", self.old_seed)):
            if old is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = old
        self.temp.cleanup()

    def add_tenant(self, name="General", tenant_type="general", connection="connection-1"):
        fingerprint = control_panel_store.connection_fingerprint(connection)
        control_panel_store.record_connection_test("ir@fieldassist.com", fingerprint, "success")
        return control_panel_store.create_tenant(name, tenant_type,
            control_panel_store.encrypt_connection(connection), "ir@fieldassist.com", fingerprint)

    @staticmethod
    def blob(name, day=1):
        return {"name": name, "last_modified": datetime(2026, 1, day, tzinfo=timezone.utc)}

    def test_suffix_parser_and_documented_underscore_ambiguities(self):
        for suffix, parsed_company, slot in (("_asset.pt", "acme", "asset_pt"),
                                              ("_rack.pt", "acme", "rack_pt"),
                                              ("_obj.pt", "acme", "obj_pt")):
            parsed = sync.parse_blob_name("acme" + suffix, datetime(2026, 1, 1, tzinfo=timezone.utc))
            self.assertEqual((parsed["company_id"], parsed["slot"]), (parsed_company, slot))
        ambiguous = sync.parse_blob_name("acme_asset.pt", datetime(2026, 1, 1, tzinfo=timezone.utc))
        self.assertEqual((ambiguous["company_id"], ambiguous["slot"]), ("acme", "asset_pt"))
        self.assertIsNone(sync.parse_blob_name("notes.csv", None))

    def test_v0_unchanged_changed_new_deleted_reappearing_and_collapsed_changes(self):
        tenant = self.add_tenant()
        key = "connection-1"
        self.provider.blobs[key] = [self.blob("acme.pt", 1), self.blob("acme_class.txt", 1)]
        first = sync.run_sync(force=True, provider=self.provider)
        self.assertEqual(first["status"], "success")
        companies = store.companies()
        self.assertEqual(len(companies), 1)
        company_id = companies[0]["id"]
        detail = store.company_detail(company_id)
        model_file = next(item for item in detail["files"] if item["slot"] == "sku_pt")
        self.assertEqual(model_file["current_version"], 0)
        self.assertEqual([row["version"] for row in store.file_history(model_file["id"])], [0])

        sync.run_sync(force=True, provider=self.provider)
        self.assertEqual(len(store.file_history(model_file["id"])), 1)
        self.provider.blobs[key] = [self.blob("acme.pt", 2), self.blob("acme_class.txt", 1), self.blob("newco.pt", 1)]
        sync.run_sync(force=True, provider=self.provider)
        self.assertEqual(len(store.file_history(model_file["id"])), 2)
        self.assertEqual(store.file_history(model_file["id"])[0]["version"], 1)
        new_company = next(row for row in store.companies() if row["company_id"] == "newco")
        new_file = next(item for item in store.company_detail(new_company["id"])["files"] if item["slot"] == "sku_pt")
        self.assertEqual(new_file["current_version"], 0)

        self.provider.blobs[key] = [self.blob("acme_class.txt", 1), self.blob("newco.pt", 1)]
        sync.run_sync(force=True, provider=self.provider)
        self.assertTrue(store.file_detail(model_file["id"])["removed_from_storage"])
        self.provider.blobs[key] = [self.blob("acme.pt", 2), self.blob("acme_class.txt", 1), self.blob("newco.pt", 1)]
        sync.run_sync(force=True, provider=self.provider)
        self.assertFalse(store.file_detail(model_file["id"])["removed_from_storage"])
        self.assertEqual(store.file_detail(model_file["id"])["current_version"], 2)

        # Two upstream updates between syncs collapse to one observed version.
        self.provider.blobs[key] = [self.blob("acme.pt", 3), self.blob("acme_class.txt", 1), self.blob("newco.pt", 1)]
        self.provider.blobs[key] = [self.blob("acme.pt", 4), self.blob("acme_class.txt", 1), self.blob("newco.pt", 1)]
        sync.run_sync(force=True, provider=self.provider)
        self.assertEqual(store.file_detail(model_file["id"])["current_version"], 3)
        self.assertEqual(len(store.file_history(model_file["id"])), 4)

    def test_brand_precedence_and_missing_brand_files_do_not_fall_back(self):
        general = self.add_tenant("General", "general", "general-conn")
        brand = self.add_tenant("Brand", "brand", "brand-conn")
        self.provider.blobs["general-conn"] = [self.blob("acme.pt"), self.blob("acme_nano.onnx")]
        self.provider.blobs["brand-conn"] = [self.blob("acme.pt")]
        sync.run_sync(force=True, provider=self.provider)
        live = self.client.get("/api/model-dashboard").json()["companies"]
        self.assertEqual(len(live), 1)
        self.assertEqual(live[0]["tenant_id"], brand["id"])
        self.assertNotEqual(live[0]["tenant_id"], general["id"])
        detail = self.client.get(f"/api/model-dashboard/companies/{live[0]['id']}").json()
        sku_onnx = next(row for row in detail["files"] if row["slot"] == "sku_onnx")
        self.assertTrue(sku_onnx["absent"])
        self.assertEqual(sku_onnx["name"], "acme_nano.onnx")

    def test_flags_are_sku_models_and_include_earlier_versions(self):
        self.add_tenant()
        self.provider.blobs["connection-1"] = [self.blob("acme.pt"), self.blob("acme_asset.pt")]
        sync.run_sync(force=True, provider=self.provider)
        summary = self.client.get("/api/model-dashboard").json()["companies"]
        acme = next(row for row in summary if row["company_id"] == "acme")
        self.assertEqual(acme["flagged_count"], 1)
        detail = self.client.get(f"/api/model-dashboard/companies/{acme['id']}").json()
        sku = next(row for row in detail["files"] if row["slot"] == "sku_pt")
        asset = next(row for row in detail["files"] if row["slot"] == "asset_pt")
        self.assertTrue(sku["flagged"])
        self.assertFalse(asset["flagged"])
        self.provider.blobs["connection-1"] = [self.blob("acme.pt", 2), self.blob("acme_asset.pt")]
        sync.run_sync(force=True, provider=self.provider)
        updated = self.client.get(f"/api/model-dashboard/companies/{acme['id']}").json()
        sku = next(row for row in updated["files"] if row["slot"] == "sku_pt")
        self.assertTrue(sku["flagged"])  # V1 remains incomplete, and earlier gaps persist.
        self.client.patch(f"/api/model-dashboard/files/{sku['id']}/versions/1", json={"remark": "current", "accuracy": 99})
        self.assertTrue(next(row for row in self.client.get(f"/api/model-dashboard/companies/{acme['id']}").json()["files"] if row["slot"] == "sku_pt")["flagged"])

    def test_ir_edits_current_and_only_fills_missing_earlier_fields(self):
        self.add_tenant()
        self.provider.blobs["connection-1"] = [self.blob("acme.pt")]
        sync.run_sync(force=True, provider=self.provider)
        company = store.companies()[0]
        file_row = store.company_detail(company["id"])["files"][0]
        self.provider.blobs["connection-1"] = [self.blob("acme.pt", 2)]
        sync.run_sync(force=True, provider=self.provider)
        path = f"/api/model-dashboard/files/{file_row['id']}/versions"
        self.assertEqual(self.client.patch(path + "/0", json={"remark": "old", "accuracy": 80}).status_code, 200)
        history_response = self.client.get(f"/api/model-dashboard/files/{file_row['id']}/history")
        self.assertEqual([item["version"] for item in history_response.json()["versions"]], [1, 0])
        self.assertEqual(self.client.patch(path + "/0", json={"remark": "changed", "accuracy": 80}).status_code, 409)
        self.assertEqual(self.client.patch(path + "/1", json={"remark": "now", "accuracy": 100.001}).status_code, 400)
        self.assertEqual(self.client.patch(path + "/1", json={"remark": "now", "accuracy": 0}).status_code, 200)
        # An earlier version may fill a missing accuracy without changing its saved remark.
        other = self.add_tenant("Other", "general", "connection-2")
        self.provider.blobs["connection-2"] = [self.blob("otherco.pt")]
        sync.run_sync(force=True, provider=self.provider)
        other_company = next(row for row in store.companies() if row["company_id"] == "otherco")
        other_file = next(row for row in store.company_detail(other_company["id"])["files"] if row["slot"] == "sku_pt")
        self.provider.blobs["connection-2"] = [self.blob("otherco.pt", 2)]
        sync.run_sync(force=True, provider=self.provider)
        self.assertEqual(self.client.patch(f"/api/model-dashboard/files/{other_file['id']}/versions/0", json={"remark": "old remark"}).status_code, 200)
        self.assertEqual(self.client.patch(f"/api/model-dashboard/files/{other_file['id']}/versions/0", json={"accuracy": 91.5}).status_code, 200)
        self.role = "Viewer"
        self.assertEqual(self.client.patch(path + "/1", json={"remark": "viewer", "accuracy": 1}).status_code, 403)

    def test_hide_restore_storage_deleted_and_tenant_delete_visibility(self):
        tenant = self.add_tenant()
        self.provider.blobs["connection-1"] = [self.blob("acme.pt")]
        sync.run_sync(force=True, provider=self.provider)
        company = store.companies()[0]
        file_row = store.company_detail(company["id"])["files"][0]
        self.assertEqual(self.client.post(f"/api/model-dashboard/files/{file_row['id']}/hide").status_code, 200)
        self.assertEqual(self.client.get("/api/model-dashboard?filter=deleted").json()["companies"][0]["hidden_file_count"], 1)
        self.assertEqual(self.client.post(f"/api/model-dashboard/files/{file_row['id']}/restore").status_code, 200)
        self.provider.blobs["connection-1"] = []
        sync.run_sync(force=True, provider=self.provider)
        detail = self.client.get(f"/api/model-dashboard/companies/{company['id']}").json()
        self.assertTrue(next(row for row in detail["files"] if row["id"] == file_row["id"])["removed_from_storage"])
        self.assertEqual(self.client.post(f"/api/model-dashboard/companies/{company['id']}/hide").status_code, 200)
        self.assertEqual(self.client.post(f"/api/model-dashboard/companies/{company['id']}/restore").status_code, 200)
        # Deleting the tenant clears its credential but leaves its data in Deleted.
        self.assertEqual(self.client.delete(f"/api/control-panel/tenants/{tenant['id']}").status_code, 200)
        deleted = self.client.get("/api/model-dashboard?filter=deleted").json()["companies"]
        self.assertTrue(any(row["tenant_id"] == tenant["id"] for row in deleted))
        restored_tenant = self.add_tenant(name=tenant["name"], tenant_type=tenant["type"], connection="connection-restored")
        self.assertEqual(restored_tenant["id"], tenant["id"])
        self.assertTrue(any(row["tenant_id"] == tenant["id"] for row in self.client.get("/api/model-dashboard").json()["companies"]))

    def test_unreachable_tenant_keeps_last_data_and_never_echoes_secret(self):
        secret = "private-sas-token"
        self.add_tenant(connection=secret)
        self.provider.blobs[secret] = [self.blob("acme.pt")]
        sync.run_sync(force=True, provider=self.provider)
        prior = store.companies()[0]
        last = prior["last_sync_at"]
        self.provider.error = secret
        with self.assertNoLogs("services.model_dashboard_sync", level="DEBUG"):
            response = self.client.post("/api/control-panel/sync")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(secret, response.text)
        dashboard = self.client.get("/api/model-dashboard").json()
        self.assertEqual(dashboard["companies"][0]["tenant_status"], "unreachable")
        self.assertEqual(dashboard["companies"][0]["tenant_last_sync_at"], last)
        self.assertNotIn(secret, self.client.get("/api/control-panel/sync").text)

    def test_startup_scheduler_catches_up_and_two_workers_cannot_overlap(self):
        self.add_tenant()
        db = sqlite3.connect(os.environ["AUTH_DB_PATH"])
        try:
            old = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
            recent_attempt = datetime.now(timezone.utc).isoformat()
            db.execute("UPDATE tenants SET last_sync_at=?,last_attempt_at=?,status='unreachable'", (old, recent_attempt))
            db.commit()
        finally:
            db.close()
        self.provider.blobs["connection-1"] = [self.blob("acme.pt")]
        stop = threading.Event()
        scheduler = threading.Thread(target=sync.scheduler_loop, args=(stop, self.provider), daemon=True)
        scheduler.start()
        deadline = time.time() + 3
        while not store.companies() and time.time() < deadline:
            time.sleep(0.02)
        stop.set()
        scheduler.join(timeout=1)
        self.assertEqual(len(store.companies()), 1)

        self.provider.block = threading.Event()
        first = threading.Thread(target=sync.run_sync, kwargs={"force": True, "provider": self.provider})
        first.start()
        self.assertTrue(self.provider.block.wait(1))
        second = sync.run_sync(force=True, provider=self.provider)
        self.assertEqual(second["status"], "running")
        first.join(timeout=2)
        self.assertFalse(first.is_alive())

    def test_company_name_and_all_write_routes_are_ir_only(self):
        self.add_tenant()
        self.provider.blobs["connection-1"] = [self.blob("acme.pt")]
        sync.run_sync(force=True, provider=self.provider)
        company = store.companies()[0]
        self.assertEqual(self.client.patch(f"/api/model-dashboard/companies/{company['id']}/name", json={"name": "Acme"}).status_code, 200)
        self.role = "Viewer"
        for method, path, body in [
            ("patch", f"/api/model-dashboard/companies/{company['id']}/name", {"name": "Blocked"}),
            ("patch", f"/api/model-dashboard/files/{company['id']}/versions/0", {"remark": "Blocked"}),
            ("post", f"/api/model-dashboard/companies/{company['id']}/hide", {}),
            ("post", f"/api/model-dashboard/companies/{company['id']}/restore", {}),
            ("post", f"/api/model-dashboard/files/{company['id']}/hide", {}),
            ("post", f"/api/model-dashboard/files/{company['id']}/restore", {}),
            ("post", "/api/control-panel/sync", {}),
        ]:
            response = getattr(self.client, method)(path, json=body)
            self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(self.client.get("/api/model-dashboard").status_code, 200)
        self.assertEqual(self.client.get(f"/api/model-dashboard/companies/{company['id']}").status_code, 200)


if __name__ == "__main__":
    unittest.main()
