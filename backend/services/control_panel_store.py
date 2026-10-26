"""Persistent Control Panel records stored beside auth and session data."""
import base64
import hashlib
import hmac
import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from services import auth_store

TEST_TTL_SECONDS = 600


class TenantNotFound(Exception):
    pass


class TenantNameConflict(Exception):
    pass


class ConnectionTestRequired(Exception):
    pass


class LastIrMember(Exception):
    pass


class IrMemberNotFound(Exception):
    pass


def _connect():
    path = auth_store._db_path()
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


@contextmanager
def _connection(immediate=False):
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


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def init_control_panel_store():
    with _connection() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS tenants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('general', 'brand')),
            encrypted_connection TEXT,
            status TEXT NOT NULL DEFAULT 'never',
            last_attempt_at TEXT,
            last_sync_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS active_tenant_name
            ON tenants(name COLLATE NOCASE) WHERE deleted_at IS NULL;
        CREATE TABLE IF NOT EXISTS tenant_connection_tests (
            email TEXT PRIMARY KEY COLLATE NOCASE,
            fingerprint TEXT NOT NULL,
            result TEXT NOT NULL,
            checked_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS tenants_deleted_at ON tenants(deleted_at);
        """)
        columns = {row[1] for row in db.execute("PRAGMA table_info(tenants)")}
        if "last_attempt_at" not in columns:
            db.execute("ALTER TABLE tenants ADD COLUMN last_attempt_at TEXT")


def _fernet():
    configured = os.environ.get("TENANT_ENCRYPTION_KEY", "").strip()
    if not configured:
        raise RuntimeError("Tenant credential encryption is not configured")
    try:
        return Fernet(configured.encode("ascii"))
    except (ValueError, UnicodeEncodeError):
        raise RuntimeError("Tenant credential encryption is not configured") from None


def encrypt_connection(connection_string):
    try:
        return _fernet().encrypt(connection_string.encode("utf-8")).decode("ascii")
    except RuntimeError:
        raise
    except Exception:
        raise RuntimeError("Tenant credential encryption failed") from None


def decrypt_connection(encrypted):
    try:
        return _fernet().decrypt(encrypted.encode("ascii")).decode("utf-8")
    except InvalidToken:
        raise RuntimeError("Tenant credential could not be decrypted") from None
    except RuntimeError:
        raise
    except Exception:
        raise RuntimeError("Tenant credential could not be decrypted") from None


def connection_fingerprint(connection_string):
    configured = os.environ.get("TENANT_ENCRYPTION_KEY", "").strip()
    if not configured:
        raise RuntimeError("Tenant credential encryption is not configured")
    try:
        key_material = base64.urlsafe_b64decode(configured.encode("ascii"))
    except Exception:
        raise RuntimeError("Tenant credential encryption is not configured") from None
    if len(key_material) != 32:
        raise RuntimeError("Tenant credential encryption is not configured")
    fingerprint_key = hmac.new(key_material, b"tenant-connection-test", hashlib.sha256).digest()
    return hmac.new(fingerprint_key, connection_string.encode("utf-8"), hashlib.sha256).hexdigest()


def record_connection_test(email, fingerprint, result):
    with _connection() as db:
        db.execute("""
            INSERT INTO tenant_connection_tests(email, fingerprint, result, checked_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
                fingerprint=excluded.fingerprint,
                result=excluded.result,
                checked_at=excluded.checked_at
        """, (email.casefold(), fingerprint, result, int(time.time())))


def _consume_successful_test(db, email, fingerprint):
    row = db.execute(
        "SELECT fingerprint, result, checked_at FROM tenant_connection_tests WHERE email = ? COLLATE NOCASE",
        (email.casefold(),),
    ).fetchone()
    db.execute("DELETE FROM tenant_connection_tests WHERE email = ? COLLATE NOCASE", (email.casefold(),))
    if (not row or row["result"] != "success" or row["checked_at"] < int(time.time()) - TEST_TTL_SECONDS
            or not hmac.compare_digest(row["fingerprint"], fingerprint)):
        raise ConnectionTestRequired


def _tenant_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "type": row["type"],
        "connection_configured": bool(row["encrypted_connection"]),
        "last_sync_at": row["last_sync_at"],
        "status": row["status"],
    }


def list_tenants(include_deleted=False):
    with _connection() as db:
        if include_deleted:
            rows = db.execute("SELECT * FROM tenants ORDER BY name COLLATE NOCASE, id").fetchall()
        else:
            rows = db.execute("SELECT * FROM tenants WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE, id").fetchall()
    return [_tenant_dict(row) for row in rows]


def get_tenant(tenant_id):
    with _connection() as db:
        row = db.execute("SELECT * FROM tenants WHERE id = ? AND deleted_at IS NULL", (tenant_id,)).fetchone()
    return _tenant_dict(row) if row else None


def create_tenant(name, tenant_type, encrypted_connection, email, fingerprint):
    try:
        with _connection(immediate=True) as db:
            _consume_successful_test(db, email, fingerprint)
            now = _now()
            deleted = db.execute("SELECT id FROM tenants WHERE name=? COLLATE NOCASE AND deleted_at IS NOT NULL ORDER BY id DESC LIMIT 1",
                                 (name,)).fetchone()
            if deleted:
                db.execute("""UPDATE tenants SET name=?,type=?,encrypted_connection=?,status='never',last_attempt_at=NULL,
                              deleted_at=NULL,updated_at=? WHERE id=?""",
                           (name, tenant_type, encrypted_connection, now, deleted["id"]))
                row = db.execute("SELECT * FROM tenants WHERE id=?", (deleted["id"],)).fetchone()
                return _tenant_dict(row)
            cursor = db.execute("""
                INSERT INTO tenants(name, type, encrypted_connection, status, created_at, updated_at)
                VALUES (?, ?, ?, 'never', ?, ?)
            """, (name, tenant_type, encrypted_connection, now, now))
            row = db.execute("SELECT * FROM tenants WHERE id = ?", (cursor.lastrowid,)).fetchone()
            return _tenant_dict(row)
    except sqlite3.IntegrityError:
        raise TenantNameConflict from None


def update_tenant(tenant_id, *, name=None, tenant_type=None, encrypted_connection=None,
                  connection_email=None, fingerprint=None):
    with _connection(immediate=True) as db:
        row = db.execute("SELECT * FROM tenants WHERE id = ? AND deleted_at IS NULL", (tenant_id,)).fetchone()
        if not row:
            raise TenantNotFound
        if encrypted_connection is not None:
            _consume_successful_test(db, connection_email, fingerprint)
        new_name = name if name is not None else row["name"]
        new_type = tenant_type if tenant_type is not None else row["type"]
        new_connection = encrypted_connection if encrypted_connection is not None else row["encrypted_connection"]
        new_status = row["status"] if new_connection else "never"
        try:
            db.execute("""
                UPDATE tenants SET name=?, type=?, encrypted_connection=?, status=?, updated_at=?
                WHERE id=? AND deleted_at IS NULL
            """, (new_name, new_type, new_connection, new_status, _now(), tenant_id))
        except sqlite3.IntegrityError:
            raise TenantNameConflict from None
        updated = db.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,)).fetchone()
        return _tenant_dict(updated)


def delete_tenant(tenant_id):
    with _connection(immediate=True) as db:
        row = db.execute("SELECT id FROM tenants WHERE id = ? AND deleted_at IS NULL", (tenant_id,)).fetchone()
        if not row:
            raise TenantNotFound
        now = _now()
        db.execute("""
            UPDATE tenants SET encrypted_connection=NULL, status='deleted', deleted_at=?, updated_at=?
            WHERE id=? AND deleted_at IS NULL
        """, (now, now, tenant_id))
        return True


def remove_ir_member(email):
    normalized = email.strip().casefold()
    with _connection(immediate=True) as db:
        count = db.execute("SELECT COUNT(*) FROM ir_members").fetchone()[0]
        row = db.execute("SELECT email FROM ir_members WHERE email = ? COLLATE NOCASE", (normalized,)).fetchone()
        if not row:
            raise IrMemberNotFound
        if count <= 1:
            raise LastIrMember
        db.execute("DELETE FROM ir_members WHERE email = ? COLLATE NOCASE", (normalized,))
        return normalized
