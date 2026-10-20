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
        CREATE TABLE IF NOT EXISTS tool_sessions (
            session_id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS extraction_jobs (
            job_id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
        CREATE INDEX IF NOT EXISTS oauth_transactions_expiry ON oauth_transactions(expires_at);
        """)


def save_oauth_transaction(state, nonce, verifier, next_path, ttl=600):
    now = int(time.time())
    with _connection() as db:
        db.execute("DELETE FROM oauth_transactions WHERE expires_at <= ?", (now,))
        db.execute("INSERT INTO oauth_transactions VALUES (?, ?, ?, ?, ?)", (_hash(state), nonce, verifier, next_path, now + ttl))


def consume_oauth_transaction(state):
    now = int(time.time())
    state_hash = _hash(state)
    with _connection() as db:
        row = db.execute("SELECT * FROM oauth_transactions WHERE state_hash = ? AND expires_at > ?", (state_hash, now)).fetchone()
        db.execute("DELETE FROM oauth_transactions WHERE state_hash = ?", (state_hash,))
    return dict(row) if row else None


def create_session(email, name, picture, idle_minutes, max_days):
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


def bind_tool_session(session_id, owner_email):
    with _connection() as db:
        db.execute("INSERT OR REPLACE INTO tool_sessions(session_id, owner_email, created_at) VALUES (?, ?, ?)", (session_id, owner_email.casefold(), int(time.time())))


def owns_tool_session(session_id, owner_email):
    with _connection() as db:
        row = db.execute("SELECT 1 FROM tool_sessions WHERE session_id = ? AND owner_email = ?", (session_id, owner_email.casefold())).fetchone()
    return row is not None


def bind_extraction_job(job_id, owner_email):
    with _connection() as db:
        db.execute("INSERT OR REPLACE INTO extraction_jobs(job_id, owner_email, created_at) VALUES (?, ?, ?)", (job_id, owner_email.casefold(), int(time.time())))


def owns_extraction_job(job_id, owner_email):
    with _connection() as db:
        row = db.execute("SELECT 1 FROM extraction_jobs WHERE job_id = ? AND owner_email = ?", (job_id, owner_email.casefold())).fetchone()
    return row is not None


def delete_extraction_job(job_id):
    with _connection() as db:
        db.execute("DELETE FROM extraction_jobs WHERE job_id = ?", (job_id,))
