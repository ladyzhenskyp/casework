"""Accounts for the Casework beta: invite-only sign-up, email + password sign-in,
progress saved on the server, and tester feedback.

Storage is one SQLite file. Locally it lives at data/casework.db (gitignored);
on Railway, point CASEWORK_DB at a file on a mounted volume (for example
/data/casework.db) so accounts survive redeploys.

Security choices, in plain terms:
  * Passwords are never stored. We store a salted PBKDF2-SHA256 hash (600,000
    rounds, the current OWASP guidance for PBKDF2), which works on every Python
    build, including Apple's built-in Python 3.9.
  * Sign-in creates a random session token. The browser keeps it in an HttpOnly
    cookie (scripts can't read it); the database keeps only a hash of it.
  * State-changing requests must be JSON and come from this site (Origin check),
    which blocks cross-site form tricks.
  * Repeated failed sign-ins are slowed down per address and per email.

Settings (environment variables, or the project's .env file):
  CASEWORK_DB             path to the SQLite file
  CASEWORK_INVITE_CODES   comma-separated codes that allow sign-up
  CASEWORK_ADMIN_EMAILS   comma-separated emails that can open /admin
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from collections import defaultdict, deque
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COOKIE = "cw_session"
SESSION_DAYS = 30
PBKDF2_ROUNDS = 600_000
MAX_PROGRESS_BYTES = 400_000
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _env_list(name):
    return [x.strip() for x in os.environ.get(name, "").split(",") if x.strip()]


def db_path() -> Path:
    return Path(os.environ.get("CASEWORK_DB") or ROOT / "data" / "casework.db")


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


_init_lock = threading.Lock()
_ready = False


def _init(con):
    con.executescript("""
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      pw_hash TEXT NOT NULL,
      invite TEXT,
      created_at TEXT NOT NULL,
      last_seen TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS progress (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS usage (
      day TEXT NOT NULL,
      who TEXT NOT NULL,
      replies INTEGER NOT NULL DEFAULT 0,
      off_topic INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, who)
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      place TEXT,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    """)


@contextmanager
def db():
    global _ready
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fresh = not path.exists()
    con = sqlite3.connect(path, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    if fresh:
        _ready = False  # the file was created just now (first run, or removed while running)
    if not _ready:
        with _init_lock:
            if not _ready:
                con.execute("PRAGMA journal_mode = WAL")
                _init(con)
                _ready = True
    try:
        yield con
        con.commit()
    finally:
        con.close()


# ---------------------------------------------------------------- passwords and tokens
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${salt.hex()}${digest.hex()}"


def check_password(password: str, stored: str) -> bool:
    try:
        _, rounds, salt, digest = stored.split("$")
        test = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(test.hex(), digest)
    except (ValueError, TypeError):
        return False


_DUMMY = hash_password(secrets.token_hex(8))  # keeps failed sign-ins for unknown emails as slow as real ones


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ---------------------------------------------------------------- errors and rate limits
class AccountError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class Throttle:
    """At most `limit` events per key in `window` seconds."""

    def __init__(self, limit, window):
        self.limit, self.window = limit, window
        self.events = defaultdict(deque)
        self.lock = threading.Lock()

    def hit(self, key) -> bool:
        t = time.monotonic()
        with self.lock:
            q = self.events[key]
            while q and t - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(t)
            return True


LOGIN_THROTTLE = Throttle(8, 300)      # failed or attempted sign-ins per address / email, per 5 minutes
SIGNUP_THROTTLE = Throttle(5, 3600)    # sign-ups per address per hour
FEEDBACK_THROTTLE = Throttle(20, 3600)


# ---------------------------------------------------------------- users and sessions
def _clean_email(email) -> str:
    email = str(email or "").strip().lower()
    if len(email) > 200 or not EMAIL_RE.match(email):
        raise AccountError("Enter a valid email address.")
    return email


def _check_new_password(pw) -> str:
    pw = str(pw or "")
    if len(pw) < 8:
        raise AccountError("Use a password with at least 8 characters.")
    if len(pw) > 200:
        raise AccountError("That password is too long.")
    return pw


def public_user(row) -> dict:
    return {"id": row["id"], "email": row["email"], "name": row["name"],
            "admin": row["email"] in [e.lower() for e in _env_list("CASEWORK_ADMIN_EMAILS")]}


def signup(email, password, name, invite, ip) -> tuple[dict, str]:
    codes = _env_list("CASEWORK_INVITE_CODES")
    if not SIGNUP_THROTTLE.hit(ip):
        raise AccountError("Too many sign-ups from here. Try again later.", 429)
    if not codes or str(invite or "").strip() not in codes:
        raise AccountError("That invite code isn't valid. Ask Patricia for one.", 403)
    email = _clean_email(email)
    password = _check_new_password(password)
    name = str(name or "").strip()[:60] or email.split("@")[0]
    with db() as con:
        if con.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            raise AccountError("There's already an account with that email. Try signing in.", 409)
        cur = con.execute("INSERT INTO users (email, name, pw_hash, invite, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
                          (email, name, hash_password(password), str(invite).strip(), now(), now()))
        user = con.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
        token = _new_session(con, user["id"])
    return public_user(user), token


def login(email, password, ip) -> tuple[dict, str]:
    email_key = str(email or "").strip().lower()[:200]
    if not LOGIN_THROTTLE.hit(f"ip:{ip}") or not LOGIN_THROTTLE.hit(f"email:{email_key}"):
        raise AccountError("Too many sign-in attempts. Wait a few minutes and try again.", 429)
    with db() as con:
        user = con.execute("SELECT * FROM users WHERE email = ?", (email_key,)).fetchone()
        ok = check_password(str(password or ""), user["pw_hash"] if user else _DUMMY)
        if not user or not ok:
            raise AccountError("That email and password don't match.", 401)
        token = _new_session(con, user["id"])
        con.execute("UPDATE users SET last_seen = ? WHERE id = ?", (now(), user["id"]))
    return public_user(user), token


def _new_session(con, user_id) -> str:
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    con.execute("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (_token_hash(token), user_id, now(), expires))
    con.execute("DELETE FROM sessions WHERE expires_at < ?", (now(),))
    return token


def user_for_token(token) -> dict | None:
    if not token:
        return None
    with db() as con:
        row = con.execute("""SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                             WHERE s.token_hash = ? AND s.expires_at > ?""", (_token_hash(token), now())).fetchone()
        if not row:
            return None
        if (row["last_seen"] or "")[:10] != now()[:10]:
            con.execute("UPDATE users SET last_seen = ? WHERE id = ?", (now(), row["id"]))
        return public_user(row)


def logout(token):
    if token:
        with db() as con:
            con.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))


# ---------------------------------------------------------------- progress and feedback
def get_progress(user_id) -> dict | None:
    with db() as con:
        row = con.execute("SELECT data FROM progress WHERE user_id = ?", (user_id,)).fetchone()
    return json.loads(row["data"]) if row else None


def save_progress(user_id, data) -> None:
    if not isinstance(data, dict):
        raise AccountError("Progress must be an object.")
    text = json.dumps(data, separators=(",", ":"))
    if len(text) > MAX_PROGRESS_BYTES:
        raise AccountError("Saved progress is too large.", 413)
    with db() as con:
        con.execute("""INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?)
                       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at""",
                    (user_id, text, now()))


def add_feedback(user_id, place, text) -> None:
    text = str(text or "").strip()
    if not text:
        raise AccountError("Write something first.")
    if not FEEDBACK_THROTTLE.hit(user_id):
        raise AccountError("That's a lot of feedback for one hour. Thank you! Try again a bit later.", 429)
    with db() as con:
        con.execute("INSERT INTO feedback (user_id, place, text, created_at) VALUES (?, ?, ?, ?)",
                    (user_id, str(place or "")[:200], text[:4000], now()))


# ---------------------------------------------------------------- tutor usage (survives restarts)
def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def usage_today(who) -> int:
    with db() as con:
        row = con.execute("SELECT replies FROM usage WHERE day = ? AND who = ?", (_today(), who)).fetchone()
    return row["replies"] if row else 0


def usage_take(who, per_person, per_site):
    """Count one tutor reply. Returns None, or "visitor" / "server" when a daily limit is reached."""
    day = _today()
    with db() as con:
        con.execute("BEGIN IMMEDIATE")  # one writer at a time, so two quick clicks can't both slip past the limit
        total = con.execute("SELECT COALESCE(SUM(replies), 0) AS n FROM usage WHERE day = ?", (day,)).fetchone()["n"]
        if total >= per_site:
            return "server"
        mine = con.execute("SELECT replies FROM usage WHERE day = ? AND who = ?", (day, who)).fetchone()
        if mine and mine["replies"] >= per_person:
            return "visitor"
        con.execute("""INSERT INTO usage (day, who, replies) VALUES (?, ?, 1)
                       ON CONFLICT(day, who) DO UPDATE SET replies = replies + 1""", (day, who))
    return None


def usage_refund(who) -> None:
    with db() as con:
        con.execute("UPDATE usage SET replies = MAX(replies - 1, 0) WHERE day = ? AND who = ?", (_today(), who))


def usage_off_topic(who) -> None:
    with db() as con:
        con.execute("""INSERT INTO usage (day, who, off_topic) VALUES (?, ?, 1)
                       ON CONFLICT(day, who) DO UPDATE SET off_topic = off_topic + 1""", (_today(), who))


# ---------------------------------------------------------------- admin
def admin_overview() -> dict:
    with db() as con:
        users = [dict(r) for r in con.execute(
            """SELECT u.id, u.email, u.name, u.created_at, u.last_seen, p.data, p.updated_at
               FROM users u LEFT JOIN progress p ON p.user_id = u.id ORDER BY u.created_at""")]
        feedback = [dict(r) for r in con.execute(
            """SELECT f.created_at, f.place, f.text, u.name, u.email FROM feedback f
               LEFT JOIN users u ON u.id = f.user_id ORDER BY f.created_at DESC LIMIT 500""")]
    week_ago = (datetime.now(timezone.utc) - timedelta(days=6)).strftime("%Y-%m-%d")
    with db() as con:
        use = {r["who"]: dict(r) for r in con.execute(
            """SELECT who, SUM(CASE WHEN day = ? THEN replies ELSE 0 END) AS today,
                      SUM(CASE WHEN day >= ? THEN replies ELSE 0 END) AS week,
                      SUM(replies) AS total, SUM(off_topic) AS off_topic
               FROM usage GROUP BY who""", (_today(), week_ago))}
    for u in users:
        mine = use.get(f"user:{u['id']}", {})
        u["tutor_today"], u["tutor_week"] = mine.get("today") or 0, mine.get("week") or 0
        u["tutor_total"], u["off_topic"] = mine.get("total") or 0, mine.get("off_topic") or 0
        data = json.loads(u.pop("data") or "{}")
        cases = (data.get("cases") or {}).values()
        u["solved"] = sum(1 for c in cases if isinstance(c, dict) and c.get("status") == "solved")
        u["hints"] = sum(int(c.get("hints") or 0) for c in cases if isinstance(c, dict))
    return {"users": users, "feedback": feedback}


def admin_reset_password(email, new_password) -> None:
    email = _clean_email(email)
    pw = _check_new_password(new_password)
    with db() as con:
        cur = con.execute("UPDATE users SET pw_hash = ? WHERE email = ?", (hash_password(pw), email))
        if not cur.rowcount:
            raise AccountError("No account with that email.", 404)
        uid = con.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()["id"]
        con.execute("DELETE FROM sessions WHERE user_id = ?", (uid,))  # sign them out everywhere
