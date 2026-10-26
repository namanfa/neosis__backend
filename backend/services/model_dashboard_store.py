"""Persistent model registry and sync coordination state."""
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from services import auth_store

LEASE_SECONDS = 60


def _connect():
    path = auth_store._db_path()
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    return db


@contextmanager
def _db(immediate=False):
    db = _connect()
    try:
        if immediate:
            db.execute("BEGIN IMMEDIATE")
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def init_model_dashboard_store():
    with _db() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS model_companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            company_id TEXT NOT NULL,
            hidden_by_ir INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (tenant_id, company_id),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE TABLE IF NOT EXISTS model_company_names (
            company_id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS model_company_display_name_unique
            ON model_company_names(display_name COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS model_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_row_id INTEGER NOT NULL,
            slot TEXT NOT NULL,
            blob_name TEXT NOT NULL,
            last_modified TEXT,
            current_version INTEGER NOT NULL DEFAULT 0,
            removed_from_storage INTEGER NOT NULL DEFAULT 0,
            hidden_by_ir INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (company_row_id, slot),
            FOREIGN KEY (company_row_id) REFERENCES model_companies(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS model_file_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            version INTEGER NOT NULL,
            last_modified TEXT,
            remark TEXT NOT NULL DEFAULT '',
            accuracy REAL,
            edited_by TEXT,
            edited_at TEXT,
            created_at TEXT NOT NULL,
            UNIQUE (file_id, version),
            FOREIGN KEY (file_id) REFERENCES model_files(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS model_sync_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            trigger TEXT NOT NULL CHECK (trigger IN ('scheduled','forced')),
            status TEXT NOT NULL,
            tenant_count INTEGER NOT NULL DEFAULT 0,
            success_count INTEGER NOT NULL DEFAULT 0,
            failure_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS model_sync_leases (
            name TEXT PRIMARY KEY,
            owner TEXT NOT NULL,
            lease_until INTEGER NOT NULL,
            run_id INTEGER,
            FOREIGN KEY (run_id) REFERENCES model_sync_runs(id)
        );
        CREATE INDEX IF NOT EXISTS model_companies_tenant ON model_companies(tenant_id, company_id);
        CREATE INDEX IF NOT EXISTS model_files_company ON model_files(company_row_id, slot);
        CREATE INDEX IF NOT EXISTS model_versions_file ON model_file_versions(file_id, version DESC);
        CREATE INDEX IF NOT EXISTS model_sync_runs_started ON model_sync_runs(started_at DESC);
        """)


def claim_sync(owner, trigger):
    now = int(time.time())
    started = now_iso()
    with _db(immediate=True) as db:
        lease = db.execute("SELECT owner, lease_until FROM model_sync_leases WHERE name='sync'").fetchone()
        if lease and lease["lease_until"] > now:
            return None
        # A lease that expired while a worker died leaves only generic running
        # statuses behind; recover them without discarding the prior data.
        db.execute("UPDATE tenants SET status='failed' WHERE status='running'")
        cursor = db.execute("INSERT INTO model_sync_runs(started_at, trigger, status) VALUES (?, ?, 'running')", (started, trigger))
        run_id = cursor.lastrowid
        db.execute("""INSERT INTO model_sync_leases(name, owner, lease_until, run_id)
                      VALUES ('sync', ?, ?, ?)
                      ON CONFLICT(name) DO UPDATE SET owner=excluded.owner, lease_until=excluded.lease_until, run_id=excluded.run_id""",
                   (owner, now + LEASE_SECONDS, run_id))
        return run_id


def renew_sync(owner):
    with _db(immediate=True) as db:
        result = db.execute("UPDATE model_sync_leases SET lease_until=? WHERE name='sync' AND owner=?",
                            (int(time.time()) + LEASE_SECONDS, owner))
        return result.rowcount == 1


def release_sync(owner, run_id, status, success_count, failure_count, tenant_count):
    finished = now_iso()
    with _db(immediate=True) as db:
        db.execute("UPDATE model_sync_runs SET finished_at=?, status=?, tenant_count=?, success_count=?, failure_count=? WHERE id=?",
                   (finished, status, tenant_count, success_count, failure_count, run_id))
        db.execute("DELETE FROM model_sync_leases WHERE name='sync' AND owner=?", (owner,))


def sync_state():
    with _db() as db:
        lease = db.execute("SELECT lease_until FROM model_sync_leases WHERE name='sync'").fetchone()
        running = bool(lease and lease["lease_until"] > int(time.time()))
        run = db.execute("SELECT * FROM model_sync_runs ORDER BY id DESC LIMIT 1").fetchone()
        tenants = db.execute("""SELECT id,name,type,status,last_sync_at,deleted_at FROM tenants
                              WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE""").fetchall()
        last = db.execute("SELECT MAX(last_sync_at) FROM tenants WHERE deleted_at IS NULL").fetchone()[0]
    return {
        "running": running,
        "last_sync_at": last,
        "status": run["status"] if run else "never",
        "run": dict(run) if run else None,
        "tenants": [dict(row) for row in tenants],
    }


def due_tenant_ids(now=None, force=False, catch_up=False):
    now = now or datetime.now(timezone.utc)
    timestamp = int(now.timestamp())
    with _db() as db:
        rows = db.execute("""SELECT id,last_sync_at,last_attempt_at FROM tenants WHERE deleted_at IS NULL
                              AND encrypted_connection IS NOT NULL ORDER BY id""").fetchall()
    due = []
    for row in rows:
        if force or (catch_up and not row["last_sync_at"]):
            due.append(row["id"])
            continue
        last_value = row["last_sync_at"] if catch_up else row["last_attempt_at"]
        if catch_up and row["last_sync_at"]:
            last_value = row["last_sync_at"]
        if not last_value:
            due.append(row["id"])
            continue
        try:
            last = datetime.fromisoformat(last_value)
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if timestamp - int(last.timestamp()) >= 86400:
                due.append(row["id"])
        except (ValueError, TypeError):
            due.append(row["id"])
    return due


def sync_target(tenant_id):
    with _db() as db:
        row = db.execute("""SELECT id,name,type,encrypted_connection,deleted_at FROM tenants
                           WHERE id=? AND deleted_at IS NULL AND encrypted_connection IS NOT NULL""", (tenant_id,)).fetchone()
    return dict(row) if row else None


def set_tenant_status(tenant_id, status):
    with _db() as db:
        db.execute("UPDATE tenants SET status=?,last_attempt_at=? WHERE id=? AND deleted_at IS NULL",
                   (status, now_iso(), tenant_id))


def record_tenant_success(tenant_id, metadata):
    """Apply one complete metadata snapshot; partial listings never reach here."""
    seen = {}
    for item in metadata:
        slot = item["slot"]
        key = (item["company_id"], slot)
        # Stable tie-break for duplicate basenames in a flat-model namespace.
        if key not in seen or item["blob_name"] < seen[key]["blob_name"]:
            seen[key] = item
    timestamp = now_iso()
    with _db(immediate=True) as db:
        tenant = db.execute("SELECT id FROM tenants WHERE id=? AND deleted_at IS NULL", (tenant_id,)).fetchone()
        if not tenant:
            return
        company_ids = sorted({item["company_id"] for item in seen.values()})
        for company_id in company_ids:
            db.execute("""INSERT OR IGNORE INTO model_companies(tenant_id,company_id,created_at,updated_at)
                          VALUES (?,?,?,?)""", (tenant_id, company_id, timestamp, timestamp))
        company_rows = {row["company_id"]: row["id"] for row in db.execute(
            "SELECT id,company_id FROM model_companies WHERE tenant_id=?", (tenant_id,)).fetchall()}
        for (company_id, slot), item in seen.items():
            company_row_id = company_rows[company_id]
            file_row = db.execute("SELECT * FROM model_files WHERE company_row_id=? AND slot=?",
                                  (company_row_id, slot)).fetchone()
            modified = item["last_modified"]
            if file_row is None:
                cur = db.execute("""INSERT INTO model_files(company_row_id,slot,blob_name,last_modified,current_version,
                                 removed_from_storage,created_at,updated_at) VALUES (?,?,?,?,0,0,?,?)""",
                                 (company_row_id, slot, item["blob_name"], modified, timestamp, timestamp))
                db.execute("""INSERT INTO model_file_versions(file_id,version,last_modified,created_at)
                              VALUES (?,0,?,?)""", (cur.lastrowid, modified, timestamp))
                continue
            changed = file_row["last_modified"] != modified or bool(file_row["removed_from_storage"])
            version = file_row["current_version"] + (1 if changed else 0)
            db.execute("""UPDATE model_files SET blob_name=?,last_modified=?,current_version=?,removed_from_storage=0,updated_at=?
                          WHERE id=?""", (item["blob_name"], modified, version, timestamp, file_row["id"]))
            if changed:
                db.execute("""INSERT INTO model_file_versions(file_id,version,last_modified,created_at)
                              VALUES (?,?,?,?)""", (file_row["id"], version, modified, timestamp))
        # Mark only absent files in companies belonging to this tenant. Keep
        # hidden flags, version history, remarks, accuracy, and company rows.
        rows = db.execute("""SELECT f.id,c.company_id,f.slot FROM model_files f JOIN model_companies c
                            ON c.id=f.company_row_id WHERE c.tenant_id=?""", (tenant_id,)).fetchall()
        seen_pairs = set(seen)
        for row in rows:
            if (row["company_id"], row["slot"]) not in seen_pairs:
                db.execute("UPDATE model_files SET removed_from_storage=1,updated_at=? WHERE id=?",
                           (timestamp, row["id"]))
        db.execute("UPDATE tenants SET status='ok',last_sync_at=?,updated_at=? WHERE id=?", (timestamp, timestamp, tenant_id))


def record_tenant_failure(tenant_id, status="unreachable"):
    with _db() as db:
        db.execute("UPDATE tenants SET status=? WHERE id=? AND deleted_at IS NULL", (status, tenant_id))


def companies(filter_name="all", tenant_id=None, search=""):
    with _db() as db:
        rows = db.execute("""SELECT c.id,c.tenant_id,c.company_id,c.hidden_by_ir,n.display_name,
                                   t.name tenant_name,t.type tenant_type,t.status tenant_status,t.last_sync_at,
                                   CASE WHEN t.deleted_at IS NOT NULL THEN 1 ELSE 0 END tenant_deleted
                            FROM model_companies c JOIN tenants t ON t.id=c.tenant_id
                            LEFT JOIN model_company_names n ON n.company_id=c.company_id
                            ORDER BY c.company_id COLLATE NOCASE,c.tenant_id""").fetchall()
        result = []
        for row in rows:
            file_rows = db.execute("SELECT * FROM model_files WHERE company_row_id=?", (row["id"],)).fetchall()
            file_details = []
            flagged = 0
            hidden_files = 0
            for file_row in file_rows:
                if file_row["hidden_by_ir"]:
                    hidden_files += 1
                versions = db.execute("SELECT remark,accuracy FROM model_file_versions WHERE file_id=?", (file_row["id"],)).fetchall()
                if file_row["slot"] in {"sku_pt", "sku_onnx"} and any(not v["remark"].strip() or v["accuracy"] is None for v in versions):
                    flagged += 1
                file_details.append(dict(file_row))
            is_deleted = bool(row["tenant_deleted"] or row["hidden_by_ir"])
            if filter_name == "deleted":
                is_deleted = is_deleted or hidden_files > 0 or any(f["removed_from_storage"] for f in file_details)
                if not is_deleted:
                    continue
            elif is_deleted:
                continue
            label = (row["display_name"] or row["company_id"]).casefold()
            if search and search.casefold() not in label and search.casefold() not in row["company_id"].casefold():
                continue
            result.append({**dict(row), "flagged_count": flagged, "hidden_file_count": hidden_files,
                           "has_storage_deleted": any(f["removed_from_storage"] for f in file_details),
                           "hidden": is_deleted})
        # The model PRD treats a brand tenant as live per company, with no
        # fallback for missing files. Keep shadowed general rows for Deleted.
        if filter_name != "deleted":
            winners = {}
            for row in result:
                previous = winners.get(row["company_id"])
                if previous is None or (row["tenant_type"] == "brand" and previous["tenant_type"] != "brand"):
                    winners[row["company_id"]] = row
            result = list(winners.values())
        if tenant_id is not None:
            result = [row for row in result if row["tenant_id"] == tenant_id]
        if filter_name == "flagged":
            result = [row for row in result if row["flagged_count"] > 0]
        return result


def company_detail(company_row_id):
    with _db() as db:
        company = db.execute("""SELECT c.*,n.display_name,t.name tenant_name,t.type tenant_type,t.status tenant_status,
                                     t.last_sync_at,t.deleted_at tenant_deleted
                              FROM model_companies c JOIN tenants t ON t.id=c.tenant_id
                              LEFT JOIN model_company_names n ON n.company_id=c.company_id WHERE c.id=?""",
                             (company_row_id,)).fetchone()
        if not company:
            return None
        files = db.execute("SELECT * FROM model_files WHERE company_row_id=? ORDER BY slot", (company_row_id,)).fetchall()
    return {**dict(company), "files": [dict(row) for row in files]}


def set_company_name(company_id, display_name):
    with _db(immediate=True) as db:
        db.execute("""INSERT INTO model_company_names(company_id,display_name,updated_at) VALUES (?,?,?)
                      ON CONFLICT(company_id) DO UPDATE SET display_name=excluded.display_name,updated_at=excluded.updated_at""",
                   (company_id, display_name, now_iso()))


def company_name_in_use(company_id, display_name):
    with _db() as db:
        row = db.execute("SELECT 1 FROM model_company_names WHERE company_id<>? AND display_name=? COLLATE NOCASE",
                         (company_id, display_name)).fetchone()
    return row is not None


def set_hidden(kind, row_id, hidden):
    table, column = ("model_companies", "hidden_by_ir") if kind == "company" else ("model_files", "hidden_by_ir")
    with _db(immediate=True) as db:
        cur = db.execute(f"UPDATE {table} SET {column}=?,updated_at=? WHERE id=?", (int(hidden), now_iso(), row_id))
        return cur.rowcount == 1


def file_detail(file_id):
    with _db() as db:
        row = db.execute("""SELECT f.*,c.company_id,c.tenant_id FROM model_files f
                            JOIN model_companies c ON c.id=f.company_row_id WHERE f.id=?""", (file_id,)).fetchone()
        return dict(row) if row else None


def file_history(file_id):
    with _db() as db:
        rows = db.execute("SELECT * FROM model_file_versions WHERE file_id=? ORDER BY version DESC", (file_id,)).fetchall()
    return [dict(row) for row in rows]


def edit_version(file_id, version, *, remark, accuracy, editor):
    with _db(immediate=True) as db:
        file_row = db.execute("SELECT * FROM model_files WHERE id=?", (file_id,)).fetchone()
        row = db.execute("SELECT * FROM model_file_versions WHERE file_id=? AND version=?", (file_id, version)).fetchone()
        if not file_row or not row:
            return None, "not_found"
        current = version == file_row["current_version"]
        old_remark, old_accuracy = row["remark"], row["accuracy"]
        if not current and ((old_remark and remark != old_remark) or (old_accuracy is not None and accuracy != old_accuracy)):
            return None, "immutable"
        if not current and not old_remark.strip() and not remark.strip() and old_accuracy is None and accuracy is None:
            return None, "missing_value"
        is_model = file_row["slot"] not in {"sku_class", "asset_class"}
        if not is_model:
            accuracy = None
        db.execute("""UPDATE model_file_versions SET remark=?,accuracy=?,edited_by=?,edited_at=?
                      WHERE id=?""", (remark.strip(), accuracy, editor, now_iso(), row["id"]))
        updated = db.execute("SELECT * FROM model_file_versions WHERE id=?", (row["id"],)).fetchone()
        return dict(updated), None
