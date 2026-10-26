"""24-hour cleanup safety tests for owner-registered temporary data."""
import os
import sys
import tempfile
import threading
import time
import unittest
import uuid
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from services import auth_store, session_cleanup


class SessionCleanupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old = {name: os.environ.get(name) for name in ("AUTH_DB_PATH", "SESSION_BASE_DIR", "SESSION_SECRET")}
        os.environ["AUTH_DB_PATH"] = str(Path(self.temp.name) / "auth.sqlite3")
        os.environ["SESSION_BASE_DIR"] = str(Path(self.temp.name) / "sessions")
        os.environ["SESSION_SECRET"] = "cleanup-test-key"
        Path(os.environ["SESSION_BASE_DIR"]).mkdir()
        auth_store.init_auth_store()

    def tearDown(self):
        for name, value in self.old.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        self.temp.cleanup()

    def _session(self, age, active=False):
        session_id = str(uuid.uuid4())
        folder = Path(os.environ["SESSION_BASE_DIR"]) / session_id
        folder.mkdir()
        auth_store.bind_tool_session(session_id, "person@example.com", "accuracy_report")
        with auth_store._connection() as db:
            db.execute("UPDATE tool_sessions SET last_activity=? WHERE session_id=?", (int(time.time()) - age, session_id))
        if active:
            auth_store.acquire_operation_lease(session_id, "tool_session", "generation")
        return session_id, folder

    def test_expired_sessions_delete_files_and_ownership_but_recent_sessions_remain(self):
        expired, expired_dir = self._session(24 * 3600 + 1)
        recent, recent_dir = self._session(24 * 3600 - 1)
        result = session_cleanup.cleanup_temporary_data()
        self.assertEqual(result["sessions"], [expired])
        self.assertFalse(expired_dir.exists())
        self.assertTrue(recent_dir.exists())
        self.assertFalse(auth_store.owns_tool_session(expired, "person@example.com"))
        self.assertTrue(auth_store.owns_tool_session(recent, "person@example.com"))

    def test_active_inference_export_and_generation_lease_prevents_deletion(self):
        session_id, folder = self._session(48 * 3600, active=True)
        result = session_cleanup.cleanup_temporary_data()
        self.assertEqual(result["sessions"], [])
        self.assertTrue(folder.exists())
        self.assertTrue(auth_store.owns_tool_session(session_id, "person@example.com"))

    def test_extraction_job_files_and_owner_row_are_expired(self):
        job_id = str(uuid.uuid4())
        auth_store.bind_extraction_job(job_id, "person@example.com")
        with auth_store._connection() as db:
            db.execute("UPDATE extraction_jobs SET last_activity=? WHERE job_id=?", (int(time.time()) - 86401, job_id))
        folder = Path(os.environ["SESSION_BASE_DIR"]) / f"extract_{job_id}_abc"
        folder.mkdir()
        result = session_cleanup.cleanup_temporary_data()
        self.assertEqual(result["extraction_jobs"], [job_id])
        self.assertFalse(folder.exists())
        self.assertFalse(auth_store.owns_extraction_job(job_id, "person@example.com"))

    def test_legacy_folders_are_dry_run_and_require_explicit_apply(self):
        legacy = Path(os.environ["SESSION_BASE_DIR"]) / str(uuid.uuid4())
        legacy.mkdir()
        auth_store.claim_cleanup_lease(now=200000)
        with mock.patch.object(session_cleanup, "get_base_dir", return_value=os.environ["SESSION_BASE_DIR"]), \
             mock.patch("sys.argv", ["session_cleanup"]):
            session_cleanup.main()
        self.assertTrue(legacy.exists())
        with mock.patch.object(session_cleanup, "get_base_dir", return_value=os.environ["SESSION_BASE_DIR"]), \
             mock.patch("sys.argv", ["session_cleanup", "--apply"]):
            session_cleanup.main()
        self.assertFalse(legacy.exists())

    def test_persistent_scheduler_cleanup_lease_allows_minute_scans_without_overlap(self):
        now = 2_000_000
        self.assertTrue(auth_store.claim_cleanup_lease(now=now))
        self.assertFalse(auth_store.claim_cleanup_lease(now=now + 10))
        auth_store.finish_cleanup_lease(True, now=now)
        self.assertFalse(auth_store.claim_cleanup_lease(now=now + 59))
        self.assertTrue(auth_store.claim_cleanup_lease(now=now + 60))

    def test_two_scheduler_workers_cannot_claim_the_same_cleanup_tick(self):
        barrier = threading.Barrier(2)
        results = []
        def claim():
            barrier.wait()
            results.append(auth_store.claim_cleanup_lease(now=3_000_000))
        workers = [threading.Thread(target=claim) for _ in range(2)]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=5)
        self.assertEqual(results.count(True), 1)
        self.assertEqual(results.count(False), 1)

if __name__ == "__main__":
    unittest.main()
