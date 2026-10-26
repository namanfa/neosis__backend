"""Owner-recorded temporary session cleanup shared by the scheduler and CLI."""
import argparse
import os
import re
import shutil
import threading
import time
from contextlib import contextmanager
from pathlib import Path

from services import auth_store
from services.session_manager import get_base_dir

IDLE_SECONDS = 24 * 60 * 60


@contextmanager
def operation_lease(resource_id, resource_type, operation):
    """Persist a renewable lease so cleanup cannot remove in-flight work."""
    lease_id = auth_store.acquire_operation_lease(resource_id, resource_type, operation)
    stop = threading.Event()

    def touch():
        if resource_type == "tool_session":
            auth_store.touch_tool_session(resource_id)
        elif resource_type == "extraction_job":
            auth_store.touch_extraction_job(resource_id)

    touch()

    def renew():
        while not stop.wait(30):
            touch()
            if not auth_store.renew_operation_lease(lease_id):
                return

    worker = threading.Thread(target=renew, name="temporary-operation-lease", daemon=True)
    worker.start()
    try:
        yield
    finally:
        stop.set()
        worker.join(timeout=1)
        touch()
        auth_store.release_operation_lease(lease_id)


def _safe_child(base, child):
    root = Path(base).resolve()
    path = Path(child)
    if path.is_symlink() or path.parent.resolve() != root or path.resolve().parent != root:
        return None
    return path


def _remove_session_folder(base, session_id):
    if not re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", session_id):
        return False
    path = _safe_child(base, Path(base) / session_id)
    if path is None:
        return False
    if path.is_dir():
        shutil.rmtree(path)
    return True


def _remove_extraction_folders(base, job_id):
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", job_id):
        return 0
    count = 0
    for child in Path(base).glob(f"extract_{job_id}_*"):
        safe = _safe_child(base, child)
        if safe is not None and safe.is_dir():
            shutil.rmtree(safe)
            count += 1
    return count


def cleanup_temporary_data(now=None, dry_run=False):
    """Delete stale owned data only; legacy/unowned folders are never selected."""
    now = int(time.time()) if now is None else int(now)
    cutoff = now - IDLE_SECONDS
    base = get_base_dir()
    Path(base).mkdir(parents=True, exist_ok=True)
    extraction_base = os.path.abspath(os.environ.get("EXTRACTION_TEMP_DIR", base))
    result = {"sessions": [], "extraction_jobs": []}
    db = auth_store._connect()
    try:
        db.execute("BEGIN IMMEDIATE")
        sessions = db.execute("""SELECT session_id,session_type FROM tool_sessions t
            WHERE last_activity < ? AND NOT EXISTS (SELECT 1 FROM session_operation_leases l
              WHERE l.resource_id=t.session_id AND l.lease_until>?)""", (cutoff, now)).fetchall()
        jobs = db.execute("""SELECT job_id FROM extraction_jobs j WHERE last_activity < ?
            AND NOT EXISTS (SELECT 1 FROM session_operation_leases l
              WHERE l.resource_id=j.job_id AND l.lease_until>?)""", (cutoff, now)).fetchall()
        for row in sessions:
            session_id = row["session_id"]
            if dry_run:
                result["sessions"].append(session_id)
                continue
            if _remove_session_folder(base, session_id):
                db.execute("DELETE FROM session_operation_leases WHERE resource_id=?", (session_id,))
                db.execute("DELETE FROM tool_sessions WHERE session_id=?", (session_id,))
                result["sessions"].append(session_id)
        for row in jobs:
            job_id = row["job_id"]
            if dry_run:
                result["extraction_jobs"].append(job_id)
                continue
            _remove_extraction_folders(extraction_base, job_id)
            db.execute("DELETE FROM session_operation_leases WHERE resource_id=?", (job_id,))
            db.execute("DELETE FROM extraction_jobs WHERE job_id=?", (job_id,))
            result["extraction_jobs"].append(job_id)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return result


def run_scheduled_cleanup(now=None):
    now = int(time.time()) if now is None else int(now)
    if not auth_store.claim_cleanup_lease(now=now):
        return {"status": "not_due", "sessions": [], "extraction_jobs": []}
    try:
        result = cleanup_temporary_data(now=now)
        auth_store.finish_cleanup_lease(True)
        return {"status": "complete", **result}
    except Exception:
        auth_store.finish_cleanup_lease(False)
        return {"status": "failed", "sessions": [], "extraction_jobs": []}


def _legacy_candidates(base):
    root = Path(base).resolve()
    if not root.is_dir():
        return []
    with auth_store._connection() as db:
        owned_sessions = {row[0] for row in db.execute("SELECT session_id FROM tool_sessions")}
        job_ids = {row[0] for row in db.execute("SELECT job_id FROM extraction_jobs")}
    candidates = []
    for child in root.iterdir():
        if child.is_symlink() or not child.is_dir() or child.resolve().parent != root:
            continue
        if child.name.startswith("extract_"):
            match = re.match(r"^extract_([0-9a-fA-F-]{36})_", child.name)
            if match and match.group(1) not in job_ids:
                candidates.append(child)
        elif re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", child.name) and child.name not in owned_sessions:
            candidates.append(child)
    return candidates


def _all_legacy_candidates():
    roots = list(dict.fromkeys((get_base_dir(), os.path.abspath(os.environ.get("EXTRACTION_TEMP_DIR", get_base_dir())))))
    return [(root, path) for root in roots for path in _legacy_candidates(root)]


def main():
    parser = argparse.ArgumentParser(description="Inspect legacy temporary folders; deletion requires --apply.")
    parser.add_argument("--apply", action="store_true", help="explicitly delete the legacy folders listed by this command")
    args = parser.parse_args()
    base = get_base_dir()
    candidates = _all_legacy_candidates()
    print(f"Legacy folders found: {len(candidates)}")
    for _, path in candidates:
        print(path.name)
    if not args.apply:
        print("Dry run only. Re-run with --apply to delete these folders.")
        return
    for root, path in candidates:
        safe = _safe_child(root, path)
        if safe is not None and safe.is_dir():
            shutil.rmtree(safe)
    print(f"Deleted legacy folders: {len(candidates)}")


if __name__ == "__main__":
    main()
