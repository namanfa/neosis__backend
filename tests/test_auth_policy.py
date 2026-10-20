"""Security policy checks for the OAuth gateway."""
import os
import sqlite3
import sys
import tempfile
import unittest
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
        os.environ["AUTH_DB_PATH"] = str(Path(self.tempdir.name) / "auth.sqlite3")
        os.environ["SESSION_SECRET"] = "test-session-pepper"
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
