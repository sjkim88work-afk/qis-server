"""내장 서버 켜기 · 끄기 — 창(pywebview)과 분리해서 창 없이도 시험할 수 있게 한다.

  ctrl = DesktopServer(cfg)          cfg 는 사용자 데이터 폴더의 설정
  ctrl.preflight()                   지난번 비정상 종료였으면 DB 손상 검사
  ctrl.start()                       서버 켜기 — 혼자 쓰기 · 처음 설정: 127.0.0.1 의 빈 포트
                                                 사내 서버: 0.0.0.0 의 설정 포트(사용 중이면 빈 포트)
  ctrl.entry_url()                   창에 처음 열 주소
  ctrl.stop()                        서버 끄기 — 진행 중 백업을 기다린 뒤 DB 닫기 (WAL 체크포인트)
창이 없을 때 ui 는 아무것도 하지 않는 NullUI.
"""
from __future__ import annotations

import copy
import logging
import os
import secrets
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

from .. import __version__
from ..db import SqliteDB, parse_db_url

log = logging.getLogger("qis.desktop")

LOCAL_USER = "local"          # '이 PC 혼자 쓰기' 때 자동으로 쓰는 관리자 계정
SOLO_SESSION_HOURS = 24 * 365  # 혼자 쓰기: 로그인 만료 없음 (이 PC 안에서만 접속 가능)
MODES = ("solo", "server")
OPEN_DIR = "열어보기"            # 첨부 · 출력물을 PC 기본 프로그램으로 열 때 잠시 두는 폴더


class NullUI:
    """창이 없을 때(시험 · 서버만) 쓰는 기본값. main.py 의 WebviewUI 가 같은 이름으로 실제 창을 다룬다."""

    def pick_folder(self, start: str = "") -> str | None:
        return None

    def pick_file(self, start: str = "", types=()) -> str | None:
        return None

    def confirm(self, title: str, message: str) -> bool:
        return False

    def load_url(self, url: str) -> None:
        pass

    def open_path(self, path) -> None:
        open_with_os(path)


def open_with_os(path) -> None:
    """파일 · 폴더를 PC 기본 프로그램(Finder · 탐색기 · 브라우저 · PDF 보기)으로 연다."""
    p = str(path)
    if sys.platform == "darwin":
        subprocess.Popen(["open", p])
    elif sys.platform.startswith("win"):
        os.startfile(p)  # noqa: S606 — 사용자가 고른 데이터 폴더 안의 파일
    else:
        subprocess.Popen(["xdg-open", p])


def _bind(host: str, port: int) -> socket.socket:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if os.name != "nt":     # 윈도우의 SO_REUSEADDR 는 다른 프로그램의 포트를 가로챌 수 있어 쓰지 않음
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        s.bind((host, port))
    except OSError:
        s.close()
        raise
    s.listen(128)
    s.set_inheritable(True)
    return s


def random_password() -> str:
    from ..auth import pw_problem
    while True:
        pw = "Qd7" + secrets.token_urlsafe(24)
        if not pw_problem(pw, LOCAL_USER):
            return pw


def ensure_local_user(auth, name: str | None = None):
    """혼자 쓰기용 로컬 관리자 계정을 쓸 수 있는 상태로 (없으면 만들고, 꺼져 있으면 켬). 비밀번호는 아무도 모름."""
    from .paths import os_user_name
    db = auth.db
    u = db.q1("SELECT * FROM users WHERE lower(username)=lower(?)", (LOCAL_USER,))
    if not u:
        auth.create_user(LOCAL_USER, name or os_user_name(), "admin", random_password(), must_change=False)
    else:
        kw = {}
        if not u["active"]:
            kw["active"] = True
        if u["role"] != "admin":
            kw["role"] = "admin"
        if name and name.strip() and name.strip() != u["name"]:
            kw["name"] = name
        if kw:
            auth.update_user(u["id"], by=None, **kw)
        if u["must_change"]:
            with db.tx() as c:
                c.execute("UPDATE users SET must_change=0 WHERE id=?", (u["id"],))
    return db.q1("SELECT * FROM users WHERE lower(username)=lower(?)", (LOCAL_USER,))


def other_admins(auth) -> list[dict]:
    """로컬 계정이 아닌, 사용 중인 관리자 (사내 서버 모드로 바꿀 때 로그인할 계정)."""
    rows = auth.db.q("SELECT username, name FROM users WHERE role='admin' AND active=1 AND lower(username)<>lower(?) "
                     "ORDER BY id", (LOCAL_USER,))
    return [{"username": r["username"], "name": r["name"]} for r in rows]


class DesktopServer:
    def __init__(self, cfg, *, ui=None, lock=None):
        self.cfg = cfg                       # 저장되는 설정 (qis.json)
        self.ui = ui or NullUI()
        self.lock = lock
        self.key = secrets.token_urlsafe(32)  # 이번 실행에서만 쓰는 열쇠 — 창만 알고 있음 (혼자 쓰기 자동 로그인)
        self.app = None
        self.server = None
        self.thread = None
        self.sock = None
        self.port = None
        self.host = None
        self.notice = ""                     # 사내 서버 포트가 사용 중이어서 다른 포트로 켰을 때 안내
        self._busy = threading.Lock()        # 다시 켜기 · 가져오기가 겹치지 않게
        self.started_ok = False

    # ---- 상태 ----
    @property
    def mode(self) -> str:
        m = (self.cfg.desktop_mode or "").strip()
        return m if m in MODES else ""

    @property
    def running(self) -> bool:
        return bool(self.thread and self.thread.is_alive() and self.server and self.server.started)

    @property
    def scheme(self) -> str:
        return "https" if (self.mode == "server" and self.cfg.https) else "http"

    @property
    def url(self) -> str:
        return f"{self.scheme}://127.0.0.1:{self.port}"

    def entry_url(self) -> str:
        if self.mode == "solo":
            return f"{self.url}/desktop/enter?key={self.key}"
        if self.mode == "":
            return f"{self.url}/desktop/setup?key={self.key}"
        return f"{self.url}/desktop/enter?key={self.key}"     # 사내 서버: 열쇠 쿠키만 두고 로그인 화면으로

    def lan_addresses(self) -> list[str]:
        if self.mode != "server" or not self.port:
            return []
        from ..launcher import _lan_addresses
        c = copy.copy(self.cfg)
        c.port = self.port
        return _lan_addresses(c)

    def runtime_cfg(self):
        """실행 중에만 쓰는 설정 사본 — 저장하지 않음. 혼자 쓰기는 로그인 만료 없음 · HTTPS 끔."""
        rt = copy.copy(self.cfg)
        if self.mode != "server":
            rt.ssl_certfile = ""
            rt.ssl_keyfile = ""
        if self.mode == "solo":
            rt.session_hours = SOLO_SESSION_HOURS
        return rt

    def update_config(self, **kw) -> None:
        """설정 바꾸고 저장 — 실행 중인 서버에도 바로 반영."""
        for k, v in kw.items():
            setattr(self.cfg, k, v)
            if self.app is not None:
                setattr(self.app.state.cfg, k, v)
        self.cfg.save()

    # ---- 시작 전 검사 ----
    def db_path(self) -> Path | None:
        kind, target = parse_db_url(self.cfg)
        return Path(target) if kind == "sqlite" else None

    def preflight(self) -> dict:
        """지난번에 비정상 종료됐으면(잠금의 표시 파일이 남아 있음) DB 손상 검사."""
        dirty = bool(self.lock and self.lock.was_dirty)
        res = {"dirty": dirty, "check": "ok"}
        p = self.db_path()
        if dirty and p and p.exists():
            res["check"] = SqliteDB.check_file(p)
            log.warning("지난 실행이 정상 종료되지 않음 — DB 검사: %s", res["check"])
        return res

    def latest_backup(self) -> Path | None:
        d = self.cfg.backup_path / "db"
        if not d.is_dir():
            return None
        fs = sorted(d.glob("qis_*.sqlite"))
        return fs[-1] if fs else None

    # ---- 켜기 · 끄기 ----
    def _make_socket(self) -> socket.socket:
        self.notice = ""
        if self.mode == "server":
            self.host = "0.0.0.0"
            try:
                return _bind(self.host, int(self.cfg.port))
            except OSError:
                s = _bind(self.host, 0)
                self.notice = (f"{self.cfg.port}번 포트를 다른 프로그램이 쓰고 있어 {s.getsockname()[1]}번으로 켰습니다. "
                               "핸드폰 · 다른 PC 주소가 바뀌었으니 확인하세요.")
                return s
        self.host = "127.0.0.1"          # 혼자 쓰기 · 처음 설정: 이 PC 안에서만, 빈 포트
        return _bind(self.host, 0)

    def start(self, timeout: float = 30) -> str:
        import uvicorn
        from ..app import create_app
        from .routes import install
        if self.running:
            return self.url
        self.cfg.data_dir.mkdir(parents=True, exist_ok=True)
        rt = self.runtime_cfg()
        app = create_app(rt)
        install(app, self)
        if self.mode == "solo":
            ensure_local_user(app.state.auth)
        self._clean_open_dir()
        sock = self._make_socket()
        self.port = sock.getsockname()[1]
        kw = {}
        if self.scheme == "https":
            kw.update(ssl_certfile=rt.ssl_certfile, ssl_keyfile=rt.ssl_keyfile)
        config = uvicorn.Config(app, log_config=None, log_level="warning", lifespan="on", proxy_headers=False,
                                timeout_graceful_shutdown=5, **kw)
        server = uvicorn.Server(config)
        th = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, name="qis-server", daemon=True)
        self.app, self.server, self.thread, self.sock = app, server, th, sock
        th.start()
        t0 = time.time()
        while not server.started:
            if not th.is_alive() or time.time() - t0 > timeout:
                self._close_db()
                sock.close()
                raise RuntimeError("내장 서버를 켜지 못했습니다")
            time.sleep(0.05)
        self.started_ok = True
        log.info("QIS %s 내장 서버 — %s (%s, 데이터 %s)", __version__, self.url, self.mode or "설정 전", self.cfg.data_dir)
        return self.url

    def stop(self, timeout: float = 15) -> None:
        """서버를 멈추고 DB를 닫는다. 백업이 진행 중이면 끝날 때까지 기다림."""
        if self.server is not None:
            self.server.should_exit = True
        if self.thread is not None:
            self.thread.join(timeout)
            if self.thread.is_alive() and self.server is not None:
                self.server.force_exit = True
                self.thread.join(5)
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass
        self._close_db()
        self.server = self.thread = self.sock = None

    def _close_db(self) -> None:
        app, self.app = self.app, None
        if app is None:
            return
        try:
            app.state.backup.stop()
            with app.state.backup._run_lock:     # 백업 중이면 끝날 때까지
                app.state.db.close()             # 닫으면서 WAL 내용을 qis.db 에 모두 반영
        except Exception:
            log.exception("DB 닫기 실패")

    def health(self) -> bool:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/healthz", timeout=2) as r:
                return r.status == 200
        except Exception:
            return False

    # ---- 다시 켜기 · 서버를 멈추고 하는 작업 ----
    def restart(self) -> None:
        with self._busy:
            self.stop()
            self.start()

    def offline(self, task):
        """서버를 멈춘 상태에서 task() 실행 (복원 · 가져오기) → 다시 켬. task 결과를 돌려주고, 실패해도 서버는 다시 켬."""
        with self._busy:
            self.stop()
            try:
                return task()
            finally:
                self.start()

    def later(self, fn, delay: float = 0.4) -> None:
        """요청에 응답한 뒤에 실행 (자기 자신을 처리 중인 서버를 멈춰야 할 때)."""
        def go():
            time.sleep(delay)
            try:
                fn()
            except Exception:
                log.exception("작업 실패")
        threading.Thread(target=go, name="qis-desktop-task", daemon=True).start()

    def restart_and_reload(self, message: str = "") -> None:
        def fn():
            self.restart()
            self.ui.load_url(self.entry_url())
            if self.notice:
                self.ui.confirm("QIS", self.notice)
        self.later(fn)

    # ---- 첨부 · 출력물 열기 ----
    @property
    def open_dir(self) -> Path:
        return self.cfg.data_dir / OPEN_DIR

    def _clean_open_dir(self) -> None:
        """하루 넘은 '열어보기' 파일 정리 (원본은 DB · 첨부 폴더에 있음)."""
        d = self.open_dir
        if not d.is_dir():
            return
        cut = time.time() - 86400
        for f in d.iterdir():
            try:
                if f.is_file() and f.stat().st_mtime < cut:
                    f.unlink()
            except OSError:
                pass
