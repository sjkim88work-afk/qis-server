"""로그인 · 사용자 · 세션.

· 비밀번호는 scrypt 해시로만 저장 (원문 저장 안 함)
· 연속 실패 시 일정 시간 잠금
· 세션 토큰은 해시만 DB에 저장 — DB 파일이 새어도 세션을 가로챌 수 없음
· 역할: viewer(조회) · editor(작성) · admin(관리자)
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

from .db import DB, now

ROLES = {"viewer": "조회", "editor": "작성", "admin": "관리자"}
USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{2,40}$")


class AuthError(Exception):
    def __init__(self, msg: str, code: str = "auth"):
        super().__init__(msg)
        self.code = code


# ---- 비밀번호 ----
def hash_pw(pw: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return "scrypt$16384$8$1$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(h).decode()


def check_pw(pw: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, h = stored.split("$")
        got = hashlib.scrypt(pw.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(got, base64.b64decode(h))
    except Exception:
        return False


def pw_problem(pw: str, username: str = "") -> str | None:
    if len(pw) < 8:
        return "비밀번호는 8자 이상이어야 합니다"
    if not (re.search(r"[A-Za-z]", pw) and re.search(r"[0-9]", pw)):
        return "비밀번호에 영문과 숫자를 모두 넣어 주세요"
    if username and username.lower() in pw.lower():
        return "비밀번호에 아이디를 넣을 수 없습니다"
    return None


_DUMMY = hash_pw("dummy-password-0")


def _ts(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds").replace("+00:00", "Z")


def _parse(s: str | None) -> datetime | None:
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def public_user(u) -> dict:
    return {"id": u["id"], "username": u["username"], "name": u["name"], "role": u["role"],
            "roleName": ROLES[u["role"]], "active": bool(u["active"]), "mustChange": bool(u["must_change"]),
            "lastLogin": u["last_login"], "createdAt": u["created_at"]}


class Auth:
    IP_FAIL_FACTOR = 4           # 한 IP에서 (계정 잠금 횟수 × 4)번 실패하면 그 IP를 잠금 시간 동안 차단

    def __init__(self, db: DB, cfg):
        self.db = db
        self.cfg = cfg
        self._ip_fails: dict[str, list[float]] = {}
        self._ip_lock = threading.Lock()

    # ---- 접속 주소(IP)별 실패 기록 (메모리 — 서버를 다시 켜면 비워짐) ----
    def _ip_window(self) -> float:
        return self.cfg.login_lock_minutes * 60

    def _ip_blocked(self, ip) -> bool:
        if not ip:
            return False
        cut = time.monotonic() - self._ip_window()
        with self._ip_lock:
            fs = [t for t in self._ip_fails.get(ip, []) if t > cut]
            if fs:
                self._ip_fails[ip] = fs
            else:
                self._ip_fails.pop(ip, None)
            return len(fs) >= self.cfg.login_max_fail * self.IP_FAIL_FACTOR

    def _ip_fail(self, ip):
        if not ip:
            return
        with self._ip_lock:
            self._ip_fails.setdefault(ip, []).append(time.monotonic())
            if len(self._ip_fails) > 10000:           # 메모리 보호
                self._ip_fails.clear()

    # ---- 사용자 ----
    def user_count(self) -> int:
        return self.db.q1("SELECT COUNT(*) n FROM users")["n"]

    def get_user(self, uid: int):
        return self.db.q1("SELECT * FROM users WHERE id=?", (uid,))

    def list_users(self):
        return [public_user(u) for u in self.db.q("SELECT * FROM users ORDER BY active DESC, role, name")]

    def create_user(self, username: str, name: str, role: str, password: str, *, by=None, must_change=True, ip=None):
        username = (username or "").strip()
        name = (name or "").strip()
        if not USERNAME_RE.match(username):
            raise AuthError("아이디는 영문 · 숫자 · . _ - 로 2~40자", "bad_username")
        if not name:
            raise AuthError("이름을 입력하세요", "bad_name")
        if role not in ROLES:
            raise AuthError("역할이 올바르지 않습니다", "bad_role")
        p = pw_problem(password, username)
        if p:
            raise AuthError(p, "weak_password")
        if self.db.q1("SELECT 1 FROM users WHERE lower(username)=lower(?)", (username,)):
            raise AuthError("이미 있는 아이디입니다", "dup_username")
        with self.db.tx() as c:
            uid = self.db.insert_id(
                c, "INSERT INTO users(username,name,role,pw_hash,active,must_change,created_at) VALUES(?,?,?,?,1,?,?)",
                (username, name, role, hash_pw(password), 1 if must_change else 0, now()))
            self.db.audit(c, user=by, action="user.create", coll="users", rec_id=str(uid), label=f"{name} ({username})",
                          detail={"role": role}, ip=ip)
        return public_user(self.get_user(uid))

    def update_user(self, uid: int, *, by, name=None, role=None, active=None, ip=None):
        u = self.get_user(uid)
        if not u:
            raise AuthError("사용자를 찾을 수 없습니다", "not_found")
        ch = {}
        if name is not None and name.strip() and name.strip() != u["name"]:
            ch["name"] = [u["name"], name.strip()]
        if role is not None and role != u["role"]:
            if role not in ROLES:
                raise AuthError("역할이 올바르지 않습니다", "bad_role")
            ch["role"] = [u["role"], role]
        if active is not None and bool(active) != bool(u["active"]):
            ch["active"] = [bool(u["active"]), bool(active)]
        if not ch:
            return public_user(u)
        # 마지막 관리자를 없애지 않음
        if u["role"] == "admin" and u["active"] and (("role" in ch) or ch.get("active") == [True, False]):
            n = self.db.q1("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1")["n"]
            if n <= 1:
                raise AuthError("관리자가 한 명은 있어야 합니다", "last_admin")
        with self.db.tx() as c:
            if "name" in ch:
                c.execute("UPDATE users SET name=? WHERE id=?", (ch["name"][1], uid))
            if "role" in ch:
                c.execute("UPDATE users SET role=? WHERE id=?", (ch["role"][1], uid))
            if "active" in ch:
                c.execute("UPDATE users SET active=? WHERE id=?", (1 if ch["active"][1] else 0, uid))
                if not ch["active"][1]:
                    c.execute("DELETE FROM sessions WHERE user_id=?", (uid,))
            if "role" in ch:
                c.execute("DELETE FROM sessions WHERE user_id=?", (uid,))  # 권한이 바뀌면 다시 로그인
            self.db.audit(c, user=by, action="user.update", coll="users", rec_id=str(uid),
                          label=f"{u['name']} ({u['username']})", detail=ch, ip=ip)
        return public_user(self.get_user(uid))

    def reset_password(self, uid: int, new_pw: str, *, by, ip=None):
        u = self.get_user(uid)
        if not u:
            raise AuthError("사용자를 찾을 수 없습니다", "not_found")
        p = pw_problem(new_pw, u["username"])
        if p:
            raise AuthError(p, "weak_password")
        with self.db.tx() as c:
            c.execute("UPDATE users SET pw_hash=?, must_change=1, fail_count=0, locked_until=NULL WHERE id=?",
                      (hash_pw(new_pw), uid))
            c.execute("DELETE FROM sessions WHERE user_id=?", (uid,))
            self.db.audit(c, user=by, action="user.reset_password", coll="users", rec_id=str(uid),
                          label=f"{u['name']} ({u['username']})", ip=ip)

    def change_password(self, user, old_pw: str, new_pw: str, *, keep_token_hash=None, ip=None):
        u = self.get_user(user["id"])
        if not check_pw(old_pw, u["pw_hash"]):
            raise AuthError("현재 비밀번호가 맞지 않습니다", "bad_password")
        if old_pw == new_pw:
            raise AuthError("새 비밀번호가 지금과 같습니다", "same_password")
        p = pw_problem(new_pw, u["username"])
        if p:
            raise AuthError(p, "weak_password")
        with self.db.tx() as c:
            c.execute("UPDATE users SET pw_hash=?, must_change=0 WHERE id=?", (hash_pw(new_pw), u["id"]))
            c.execute("DELETE FROM sessions WHERE user_id=? AND token_hash<>?", (u["id"], keep_token_hash or ""))
            self.db.audit(c, user=u, action="user.change_password", coll="users", rec_id=str(u["id"]),
                          label=f"{u['name']} ({u['username']})", ip=ip)

    # ---- 로그인 ----
    def login(self, username: str, password: str, *, ip=None, ua=None) -> tuple[str, dict]:
        if self._ip_blocked(ip):
            raise AuthError(f"이 PC에서 로그인 실패가 너무 많습니다 — {self.cfg.login_lock_minutes}분 뒤 다시 시도하세요",
                            "ip_locked")
        u = self.db.q1("SELECT * FROM users WHERE lower(username)=lower(?)", ((username or "").strip(),))
        if not u:
            check_pw(password or "", _DUMMY)  # 아이디 유무를 시간 차로 알 수 없게
            self._ip_fail(ip)
            with self.db.tx() as c:
                self.db.audit(c, action="login.fail", label=(username or "")[:40], detail={"reason": "no_user"}, ip=ip)
            raise AuthError("아이디 또는 비밀번호가 맞지 않습니다", "bad_login")
        lock = _parse(u["locked_until"])
        if lock and lock > datetime.now(timezone.utc):
            raise AuthError(f"로그인 실패가 많아 잠겼습니다 — {self.cfg.login_lock_minutes}분 뒤 다시 시도하세요", "locked")
        if not check_pw(password or "", u["pw_hash"]):
            self._ip_fail(ip)
            fails = u["fail_count"] + 1
            until = None
            if fails >= self.cfg.login_max_fail:
                until = _ts(datetime.now(timezone.utc) + timedelta(minutes=self.cfg.login_lock_minutes))
                fails = 0
            with self.db.tx() as c:
                c.execute("UPDATE users SET fail_count=?, locked_until=? WHERE id=?", (fails, until, u["id"]))
                self.db.audit(c, user=u, action="login.fail", label=u["username"],
                              detail={"locked": bool(until)}, ip=ip)
            raise AuthError("아이디 또는 비밀번호가 맞지 않습니다" + (" — 계정이 잠겼습니다" if until else ""), "bad_login")
        if not u["active"]:
            raise AuthError("사용이 중지된 계정입니다 — 관리자에게 문의하세요", "inactive")
        return self.open_session(u, ip=ip, ua=ua)

    def open_session(self, u, *, ip=None, ua=None, action="login") -> tuple[str, dict]:
        """확인을 마친 사용자의 세션을 연다 (로그인)."""
        token = secrets.token_urlsafe(32)
        th = hashlib.sha256(token.encode()).hexdigest()
        t = now()
        with self.db.tx() as c:
            c.execute("UPDATE users SET fail_count=0, locked_until=NULL, last_login=? WHERE id=?", (t, u["id"]))
            c.execute("INSERT INTO sessions(token_hash,user_id,created_at,last_seen,ip,ua) VALUES(?,?,?,?,?,?)",
                      (th, u["id"], t, t, ip, (ua or "")[:200]))
            self.db.audit(c, user=u, action=action, label=u["username"], ip=ip)
        return token, public_user(self.get_user(u["id"]))

    def session_user(self, token: str | None):
        """유효한 세션이면 (user row, token_hash), 아니면 None. 마지막 사용 시각을 갱신."""
        if not token:
            return None
        th = hashlib.sha256(token.encode()).hexdigest()
        s = self.db.q1("SELECT s.*, u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=?", (th,))
        if not s:
            return None
        last = _parse(s["last_seen"])
        if not s["active"] or (last and datetime.now(timezone.utc) - last > timedelta(hours=self.cfg.session_hours)):
            self.db.x("DELETE FROM sessions WHERE token_hash=?", (th,))
            return None
        if not last or datetime.now(timezone.utc) - last > timedelta(minutes=1):
            self.db.x("UPDATE sessions SET last_seen=? WHERE token_hash=?", (now(), th))
        return self.get_user(s["user_id"]), th

    def logout(self, token_hash: str, user=None, ip=None):
        with self.db.tx() as c:
            c.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))
            if user:
                self.db.audit(c, user=user, action="logout", label=user["username"], ip=ip)

    def purge_sessions(self):
        cut = _ts(datetime.now(timezone.utc) - timedelta(hours=self.cfg.session_hours))
        self.db.x("DELETE FROM sessions WHERE last_seen < ?", (cut,))
