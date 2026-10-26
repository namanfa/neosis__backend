"""SQLite-backed OAuth transactions and opaque login sessions."""
import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path


def _db_path():
    configured = os.environ.get("AUTH_DB_PATH")
    if configured:
        return configured
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.path.join(root, "output", "auth.sqlite3")


def _connect():
    path = _db_path()
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


@contextmanager
def _connection():
    db = _connect()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _hash(value):
    secret = os.environ.get("SESSION_SECRET", "development-only-rotate-before-production").encode("utf-8")
    return hmac.new(secret, value.encode("utf-8"), hashlib.sha256).hexdigest()


def init_auth_store():
    with _connection() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript("""
        CREATE TABLE IF NOT EXISTS auth_sessions (
            id_hash TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL,
            picture TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
            last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS oauth_transactions (
            state_hash TEXT PRIMARY KEY, nonce TEXT NOT NULL, verifier TEXT NOT NULL,
            next_path TEXT NOT NULL, expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ir_members (
            email TEXT PRIMARY KEY COLLATE NOCASE,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ir_member_seed_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            seeded_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS microsoft_identities (
            tenant_id TEXT NOT NULL, object_id TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE,
            created_at INTEGER NOT NULL, PRIMARY KEY(tenant_id,object_id), UNIQUE(tenant_id,email)
        );
        CREATE TABLE IF NOT EXISTS tool_sessions (
            session_id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, created_at INTEGER NOT NULL,
            session_type TEXT NOT NULL DEFAULT 'tool', last_activity INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS extraction_jobs (
            job_id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, created_at INTEGER NOT NULL,
            last_activity INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS session_operation_leases (
            operation_id TEXT PRIMARY KEY, resource_id TEXT NOT NULL, resource_type TEXT NOT NULL,
            operation TEXT NOT NULL, lease_until INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS session_operation_resource ON session_operation_leases(resource_id, lease_until);
        CREATE TABLE IF NOT EXISTS session_cleanup_lease (
            id INTEGER PRIMARY KEY CHECK(id=1), lease_until INTEGER NOT NULL, last_run INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
        CREATE INDEX IF NOT EXISTS oauth_transactions_expiry ON oauth_transactions(expires_at);
        """)
        columns = {row["name"] for row in db.execute("PRAGMA table_info(tool_sessions)").fetchall()}
        if "session_type" not in columns:
            db.execute("ALTER TABLE tool_sessions ADD COLUMN session_type TEXT NOT NULL DEFAULT 'tool'")
        if "last_activity" not in columns:
            db.execute("ALTER TABLE tool_sessions ADD COLUMN last_activity INTEGER NOT NULL DEFAULT 0")
            db.execute("UPDATE tool_sessions SET last_activity=created_at WHERE last_activity=0")
        extraction_columns = {row["name"] for row in db.execute("PRAGMA table_info(extraction_jobs)").fetchall()}
        if "last_activity" not in extraction_columns:
            db.execute("ALTER TABLE extraction_jobs ADD COLUMN last_activity INTEGER NOT NULL DEFAULT 0")
            db.execute("UPDATE extraction_jobs SET last_activity=created_at WHERE last_activity=0")
        oauth_columns = {row["name"] for row in db.execute("PRAGMA table_info(oauth_transactions)").fetchall()}
        if "provider" not in oauth_columns:
            db.execute("ALTER TABLE oauth_transactions ADD COLUMN provider TEXT NOT NULL DEFAULT 'google'")
        # Seed only a truly empty member list. Removing a configured seed is durable.
        member_count = db.execute("SELECT COUNT(*) FROM ir_members").fetchone()[0]
        seed_complete = db.execute("SELECT 1 FROM ir_member_seed_state WHERE id = 1").fetchone()
        configured = os.environ.get("IR_MEMBER_EMAILS", "")
        emails = {item.strip().casefold() for item in configured.split(",") if item.strip()}
        if member_count == 0 and not seed_complete and emails:
            now = int(time.time())
            db.executemany("INSERT OR IGNORE INTO ir_members(email, created_at) VALUES (?, ?)", [(email, now) for email in sorted(emails)])
            db.execute("INSERT INTO ir_member_seed_state(id, seeded_at) VALUES (1, ?)", (now,))


def is_ir_member(email):
    normalized = str(email or "").strip().casefold()
    if not normalized:
        return False
    with _connection() as db:
        row = db.execute("SELECT 1 FROM ir_members WHERE email = ? COLLATE NOCASE", (normalized,)).fetchone()
    return row is not None


def bind_microsoft_identity(tenant_id, object_id, email):
    """Keep Entra's immutable principal bound to its first Neosis email key."""
    tenant_id = str(tenant_id or "").strip().casefold()
    object_id = str(object_id or "").strip().casefold()
    email = str(email or "").strip().casefold()
    if not tenant_id or not object_id or not email:
        return False
    with _connection() as db:
        row = db.execute("SELECT email FROM microsoft_identities WHERE tenant_id=? AND object_id=?",
                         (tenant_id, object_id)).fetchone()
        if row:
            return secrets.compare_digest(row["email"].casefold(), email)
        try:
            db.execute("INSERT INTO microsoft_identities(tenant_id,object_id,email,created_at) VALUES (?,?,?,?)",
                       (tenant_id, object_id, email, int(time.time())))
        except sqlite3.IntegrityError:
            row = db.execute("SELECT email FROM microsoft_identities WHERE tenant_id=? AND object_id=?",
                             (tenant_id, object_id)).fetchone()
            return bool(row and secrets.compare_digest(row["email"].casefold(), email))
    return True


def list_ir_members():
    with _connection() as db:
        rows = db.execute("SELECT email FROM ir_members ORDER BY email COLLATE NOCASE").fetchall()
    return [row["email"] for row in rows]


def add_ir_member(email):
    normalized = str(email or "").strip().casefold()
    if not normalized or "@" not in normalized:
        raise ValueError("A valid email address is required")
    with _connection() as db:
        db.execute("INSERT INTO ir_members(email, created_at) VALUES (?, ?)", (normalized, int(time.time())))
    return normalized


def remove_ir_member(email):
    normalized = str(email or "").strip().casefold()
    with _connection() as db:
        cursor = db.execute("DELETE FROM ir_members WHERE email = ? COLLATE NOCASE", (normalized,))
    return cursor.rowcount > 0


def save_oauth_transaction(state, nonce, verifier, next_path, ttl=600, provider="google"):
    now = int(time.time())
    with _connection() as db:
        db.execute("DELETE FROM oauth_transactions WHERE expires_at <= ?", (now,))
        db.execute("INSERT INTO oauth_transactions(state_hash,nonce,verifier,next_path,expires_at,provider) VALUES (?, ?, ?, ?, ?, ?)", (_hash(state), nonce, verifier, next_path, now + ttl, provider))


def consume_oauth_transaction(state):
    now = int(time.time())
    state_hash = _hash(state)
    with _connection() as db:
        row = db.execute("SELECT * FROM oauth_transactions WHERE state_hash = ? AND expires_at > ?", (state_hash, now)).fetchone()
        db.execute("DELETE FROM oauth_transactions WHERE state_hash = ?", (state_hash,))
    return dict(row) if row else None


def create_session(email, name, picture, idle_minutes, max_days):
    email = str(email or "").strip().casefold()
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    with _connection() as db:
        db.execute("DELETE FROM auth_sessions WHERE expires_at <= ? OR last_seen <= ?", (now, now - idle_minutes * 60))
        db.execute("INSERT INTO auth_sessions VALUES (?, ?, ?, ?, ?, ?, ?)", (_hash(token), email, name, picture or "", now, now, now + max_days * 86400))
    return token


def load_session(token, idle_minutes):
    if not token:
        return None
    now = int(time.time())
    token_hash = _hash(token)
    with _connection() as db:
        row = db.execute("SELECT * FROM auth_sessions WHERE id_hash = ?", (token_hash,)).fetchone()
        if not row:
            return None
        if row["expires_at"] <= now or row["last_seen"] <= now - idle_minutes * 60:
            db.execute("DELETE FROM auth_sessions WHERE id_hash = ?", (token_hash,))
            return None
        db.execute("UPDATE auth_sessions SET last_seen = ? WHERE id_hash = ?", (now, token_hash))
        return {"email": row["email"], "name": row["name"], "picture": row["picture"]}


def delete_session(token):
    if token:
        with _connection() as db:
            db.execute("DELETE FROM auth_sessions WHERE id_hash = ?", (_hash(token),))


def bind_tool_session(session_id, owner_email, session_type="tool"):
    with _connection() as db:
        now = int(time.time())
        db.execute("INSERT OR REPLACE INTO tool_sessions(session_id, owner_email, created_at, session_type,last_activity) VALUES (?, ?, ?, ?,?)", (session_id, owner_email.casefold(), now, session_type, now))


def touch_tool_session(session_id):
    with _connection() as db:
        return db.execute("UPDATE tool_sessions SET last_activity=? WHERE session_id=?", (int(time.time()), session_id)).rowcount == 1


def cleanup_tool_sessions(cutoff, now=None):
    now = int(time.time()) if now is None else int(now)
    with _connection() as db:
        rows = db.execute("""SELECT session_id,session_type FROM tool_sessions t
            WHERE last_activity < ? AND NOT EXISTS (SELECT 1 FROM session_operation_leases l
              WHERE l.resource_id=t.session_id AND l.lease_until>?)""", (int(cutoff), now)).fetchall()
        return [dict(row) for row in rows]


def delete_tool_session(session_id):
    with _connection() as db:
        db.execute("DELETE FROM session_operation_leases WHERE resource_id=?", (session_id,))
        return db.execute("DELETE FROM tool_sessions WHERE session_id=?", (session_id,)).rowcount == 1


def owns_tool_session(session_id, owner_email):
    with _connection() as db:
        row = db.execute("SELECT 1 FROM tool_sessions WHERE session_id = ? AND owner_email = ?", (session_id, owner_email.casefold())).fetchone()
    return row is not None


def bind_extraction_job(job_id, owner_email):
    with _connection() as db:
        now = int(time.time())
        db.execute("INSERT OR REPLACE INTO extraction_jobs(job_id, owner_email, created_at,last_activity) VALUES (?, ?, ?,?)", (job_id, owner_email.casefold(), now, now))


def touch_extraction_job(job_id):
    with _connection() as db:
        return db.execute("UPDATE extraction_jobs SET last_activity=? WHERE job_id=?", (int(time.time()), job_id)).rowcount == 1


def cleanup_extraction_jobs(cutoff, now=None):
    now = int(time.time()) if now is None else int(now)
    with _connection() as db:
        rows = db.execute("""SELECT job_id FROM extraction_jobs j WHERE last_activity < ?
            AND NOT EXISTS (SELECT 1 FROM session_operation_leases l
              WHERE l.resource_id=j.job_id AND l.lease_until>?)""", (int(cutoff), now)).fetchall()
        return [row["job_id"] for row in rows]


def owns_extraction_job(job_id, owner_email):
    with _connection() as db:
        row = db.execute("SELECT 1 FROM extraction_jobs WHERE job_id = ? AND owner_email = ?", (job_id, owner_email.casefold())).fetchone()
    return row is not None


def delete_extraction_job(job_id):
    with _connection() as db:
        db.execute("DELETE FROM session_operation_leases WHERE resource_id=?", (job_id,))
        db.execute("DELETE FROM extraction_jobs WHERE job_id = ?", (job_id,))


def claim_cleanup_lease(now=None, lease_seconds=300, minimum_interval=60):
    now = int(time.time()) if now is None else int(now)
    with _connection() as db:
        db.execute("INSERT OR IGNORE INTO session_cleanup_lease(id,lease_until,last_run) VALUES (1,0,0)")
        cur = db.execute("UPDATE session_cleanup_lease SET lease_until=? WHERE id=1 AND lease_until<=? AND last_run<=?",
                         (now + lease_seconds, now, now - minimum_interval))
        return cur.rowcount == 1


def finish_cleanup_lease(success, now=None):
    now = int(time.time()) if now is None else int(now)
    with _connection() as db:
        db.execute("UPDATE session_cleanup_lease SET lease_until=0,last_run=CASE WHEN ? THEN ? ELSE last_run END WHERE id=1",
                   (int(bool(success)), now))


def renew_operation_lease(operation_id, lease_seconds=300):
    with _connection() as db:
        return db.execute("UPDATE session_operation_leases SET lease_until=? WHERE operation_id=?",
                          (int(time.time()) + lease_seconds, operation_id)).rowcount == 1


def acquire_operation_lease(resource_id, resource_type, operation, lease_seconds=300):
    operation_id = secrets.token_hex(16)
    now = int(time.time())
    with _connection() as db:
        db.execute("DELETE FROM session_operation_leases WHERE lease_until<=?", (now,))
        db.execute("INSERT INTO session_operation_leases VALUES (?,?,?,?,?)",
                   (operation_id, resource_id, resource_type, operation, now + lease_seconds))
    return operation_id


def release_operation_lease(operation_id):
    with _connection() as db:
        db.execute("DELETE FROM session_operation_leases WHERE operation_id=?", (operation_id,))
