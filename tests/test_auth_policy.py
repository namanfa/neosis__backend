"""Security policy checks for the OAuth gateway."""
import os
import sqlite3
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from services import auth_store
from services.auth_policy import email_is_allowed, safe_next


class AuthPolicyTests(unittest.TestCase):
    def test_domain_allowlist_is_exact_and_case_insensitive(self):
        domains = ["flick2know.com", "fieldassist.in"]
        self.assertTrue(email_is_allowed("User@FieldAssist.IN", domains))
        self.assertFalse(email_is_allowed("user@evilfieldassist.in", domains))
        self.assertFalse(email_is_allowed("user@fieldassist.in.attacker.io", domains))
        self.assertFalse(email_is_allowed("user@fieldassist.in.", domains))

    def test_exact_email_exceptions_are_supported(self):
        self.assertTrue(email_is_allowed("Named@Example.org", [], ["named@example.org"]))
        self.assertFalse(email_is_allowed("other@example.org", [], ["named@example.org"]))

    def test_redirect_targets_must_be_same_origin_relative_paths(self):
        self.assertEqual(safe_next("/#/packshots"), "/#/packshots")
        for target in ("//evil.example", "https://evil.example", "/\\evil.example", "/%5cevil.example"):
            with self.subTest(target=target):
                self.assertEqual(safe_next(target), "/#/")


class AuthStoreTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.old_db = os.environ.get("AUTH_DB_PATH")
        self.old_secret = os.environ.get("SESSION_SECRET")
        self.old_members = os.environ.get("IR_MEMBER_EMAILS")
        os.environ["AUTH_DB_PATH"] = str(Path(self.tempdir.name) / "auth.sqlite3")
        os.environ["SESSION_SECRET"] = "test-session-pepper"
        os.environ["IR_MEMBER_EMAILS"] = "naman.swarnkar@fieldassist.com,naman.swarnkar@flick2know.com"
        auth_store.init_auth_store()

    def tearDown(self):
        if self.old_db is None:
            os.environ.pop("AUTH_DB_PATH", None)
        else:
            os.environ["AUTH_DB_PATH"] = self.old_db
        if self.old_secret is None:
            os.environ.pop("SESSION_SECRET", None)
        else:
            os.environ["SESSION_SECRET"] = self.old_secret
        if self.old_members is None:
            os.environ.pop("IR_MEMBER_EMAILS", None)
        else:
            os.environ["IR_MEMBER_EMAILS"] = self.old_members
        self.tempdir.cleanup()

    def test_oauth_state_is_single_use(self):
        auth_store.save_oauth_transaction("opaque-state", "nonce", "verifier", "/#/packshots")
        first = auth_store.consume_oauth_transaction("opaque-state")
        self.assertEqual(first["next_path"], "/#/packshots")
        self.assertEqual(first["verifier"], "verifier")
        self.assertIsNone(auth_store.consume_oauth_transaction("opaque-state"))

    def test_server_session_and_tool_ownership(self):
        token = auth_store.create_session("user@example.org", "User", "", 480, 7)
        self.assertEqual(auth_store.load_session(token, 480)["email"], "user@example.org")
        auth_store.bind_tool_session("session-id", "user@example.org")
        self.assertTrue(auth_store.owns_tool_session("session-id", "USER@example.org"))
        self.assertFalse(auth_store.owns_tool_session("session-id", "someone-else@example.org"))
        auth_store.bind_extraction_job("job-id", "user@example.org")
        self.assertTrue(auth_store.owns_extraction_job("job-id", "user@example.org"))
        self.assertFalse(auth_store.owns_extraction_job("job-id", "someone-else@example.org"))

    def test_ir_seed_is_casefolded_and_removed_seed_does_not_return(self):
        self.assertEqual(auth_store.list_ir_members(), ["naman.swarnkar@fieldassist.com", "naman.swarnkar@flick2know.com"])
        self.assertTrue(auth_store.is_ir_member("Naman.Swarnkar@FieldAssist.com"))
        self.assertTrue(auth_store.remove_ir_member("NAMAN.SWARNKAR@FIELDASSIST.COM"))
        auth_store.init_auth_store()
        self.assertEqual(auth_store.list_ir_members(), ["naman.swarnkar@flick2know.com"])

    def test_seed_does_not_add_configured_members_when_list_is_nonempty(self):
        auth_store.remove_ir_member("naman.swarnkar@fieldassist.com")
        auth_store.remove_ir_member("naman.swarnkar@flick2know.com")
        auth_store.add_ir_member("manual@example.com")
        # Reset just the migration seed marker to model a pre-existing nonempty list.
        db = sqlite3.connect(os.environ["AUTH_DB_PATH"])
        try:
            db.execute("DELETE FROM ir_member_seed_state")
            db.commit()
        finally:
            db.close()
        auth_store.init_auth_store()
        self.assertEqual(auth_store.list_ir_members(), ["manual@example.com"])

    def test_auth_me_includes_current_role(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from services import auth
        app = FastAPI()
        app.include_router(auth.router)
        with mock.patch("services.auth.cookie_token", return_value="opaque"), \
             mock.patch("services.auth.auth_store.load_session", return_value={"email":"Naman@FieldAssist.com","name":"Naman","picture":""}), \
             mock.patch("services.auth.auth_store.is_ir_member", return_value=True):
            response = TestClient(app).get("/auth/me")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["role"], "IR")
        self.assertEqual(response.json()["email"], "naman@fieldassist.com")

    def test_idle_expiry_deletes_server_session(self):
        token = auth_store.create_session("user@example.org", "User", "", 480, 7)
        db = sqlite3.connect(os.environ["AUTH_DB_PATH"])
        try:
            db.execute("UPDATE auth_sessions SET last_seen=0")
            db.commit()
        finally:
            db.close()
        self.assertIsNone(auth_store.load_session(token, 480))


if __name__ == "__main__":
    unittest.main()
