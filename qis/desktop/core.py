"""데스크톱 프로그램의 바탕 — 창(pywebview) 없이 동작 · 시험할 수 있는 부분.

· 설정: 데이터 폴더의 desktop.json  {"mode": "solo" | "lan", "solo_name": 이름}
    solo (이 PC 혼자 쓰기)  127.0.0.1 에만 열고(외부 접속 차단) 빈 포트 자동 선택, 로그인 없이 로컬 관리자로 입장
    lan  (사내 서버로 쓰기) 기존 서버판처럼 사내망에 공개(0.0.0.0:qis.json 의 port) · 로그인
· 서버 켜기/끄기: ServerRunner — 같은 프로세스 안의 uvicorn. 끌 때 WAL을 DB 파일에 합치고 닫음
· 비정상 종료 감지: 켜는 동안 desktop.running 표시 파일, 정상 종료 때 지움 → 남아 있으면 다음 실행 때 DB 손상 검사
· 가져오기 · 복원: 기존 restore · import 기능을 그대로 씀 (지금 DB는 지우지 않고 restore_before_<시각>/ 에 보관)
"""
from __future__ import annotations

import dataclasses
import json
import logging
import os
import secrets
import shutil
import socket
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

from ..auth import Auth, AuthError, hash_pw, pw_problem
from ..config import Config, load_config
from ..db import now, open_db, parse_db_url

log = logging.getLogger("qis.desktop")

MODES = ("solo", "lan")
SOLO_USER = "local"          # 혼자 쓰기 모드의 로컬 관리자 아이디 (비밀번호는 아무도 모르는 무작위 값)
RUNNING = "desktop.running"


# ---------------------------------------------------------------- 설정
@dataclasses.dataclass
class DesktopSettings:
    mode: str = ""               # 비어 있으면 첫 실행 — 모드를 고르는 화면부터
    solo_name: str = ""          # 혼자 쓰기: 기록(담당자 · 변경 이력)에 남을 이름

    @staticmethod
    def path(data_dir: Path) -> Path:
        return Path(data_dir) / "desktop.json"

    @classmethod
    def load(cls, data_dir: Path) -> "DesktopSettings":
        f = cls.path(data_dir)
        s = cls()
        if f.exists():
            try:
                d = json.loads(f.read_text(encoding="utf-8"))
                for k in ("mode", "solo_name"):
                    if isinstance(d.get(k), str):
                        setattr(s, k, d[k])
            except (OSError, ValueError):
                log.exception("desktop.json 을 읽지 못함 — 첫 실행처럼 진행")
        if s.mode not in MODES:
            s.mode = ""
        return s

    def save(self, data_dir: Path) -> None:
        f = self.path(data_dir)
        tmp = f.with_suffix(".tmp")
        tmp.write_text(json.dumps(dataclasses.asdict(self), ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(f)


def desktop_config(data_dir: Path) -> Config:
    """데이터 폴더의 qis.json 을 읽은 설정 (없으면 기본값으로 만들어 저장)."""
    cfg = load_config(data_dir)
    if not (cfg.data_dir / "qis.json").exists():
        cfg.save()
    return cfg


# ---------------------------------------------------------------- 계정
def ensure_solo_user(cfg: Config, name: str = "") -> dict:
    """혼자 쓰기용 로컬 관리자(local)를 만들거나 되살림. 비밀번호는 무작위 — 로그인 화면으로는 못 들어옴."""
    name = (name or "").strip() or "이 PC 사용자"
    db = open_db(cfg)
    try:
        u = db.q1("SELECT * FROM users WHERE lower(username)=lower(?)", (SOLO_USER,))
        if not u:
            Auth(db, cfg).create_user(SOLO_USER, name, "admin", "Ql" + secrets.token_urlsafe(24) + "9",
                                      must_change=False)
        else:
            with db.tx() as c:
                c.execute("UPDATE users SET role='admin', active=1, must_change=0, name=? WHERE id=?", (name, u["id"]))
                if u["name"] != name or u["role"] != "admin" or not u["active"]:
                    db.audit(c, action="user.update", coll="users", rec_id=str(u["id"]),
                             label=f"{name} ({SOLO_USER})", detail={"desktop": "solo"})
        u = db.q1("SELECT id, username, name, role FROM users WHERE lower(username)=lower(?)", (SOLO_USER,))
        with db.tx() as c:   # 지난 실행의 자동 입장 세션은 모두 끝냄 (실행마다 새 열쇠 · 새 세션)
            c.execute("DELETE FROM sessions WHERE user_id=?", (u["id"],))
        return dict(u)
    finally:
        db.close()


def set_lan_admin(cfg: Config, username: str, name: str, password: str) -> dict:
    """사내 서버로 쓰기: 로그인할 관리자 계정을 만들거나(없으면) 비밀번호를 정함(있으면)."""
    username = (username or "").strip()
    name = (name or "").strip()
    db = open_db(cfg)
    try:
        auth = Auth(db, cfg)
        u = db.q1("SELECT * FROM users WHERE lower(username)=lower(?)", (username,))
        if not u:
            auth.create_user(username, name, "admin", password, must_change=False)
        else:
            p = pw_problem(password, username)
            if p:
                raise AuthError(p, "weak_password")
            with db.tx() as c:
                c.execute("UPDATE users SET pw_hash=?, role='admin', active=1, must_change=0, fail_count=0, "
                          "locked_until=NULL, name=? WHERE id=?", (hash_pw(password), name or u["name"], u["id"]))
                c.execute("DELETE FROM sessions WHERE user_id=?", (u["id"],))
                db.audit(c, action="user.reset_password", coll="users", rec_id=str(u["id"]),
                         label=f"{name or u['name']} ({u['username']})", detail={"desktop": "lan"})
        return dict(db.q1("SELECT id, username, name, role FROM users WHERE lower(username)=lower(?)", (username,)))
    finally:
        db.close()


# ---------------------------------------------------------------- 비정상 종료 · 손상 검사
def mark_running(data_dir: Path) -> None:
    (Path(data_dir) / RUNNING).write_text(json.dumps({"pid": os.getpid(), "at": now()}), encoding="utf-8")


def clear_running(data_dir: Path) -> None:
    try:
        (Path(data_dir) / RUNNING).unlink()
    except FileNotFoundError:
        pass


def was_unclean(data_dir: Path) -> bool:
    """지난번에 정상 종료하지 않았는지 (켜는 동안 남기는 표시 파일이 그대로 있음)."""
    return (Path(data_dir) / RUNNING).exists()


def check_db(cfg: Config) -> str:
    """DB 무결성 검사. 'ok' 또는 문제 설명. DB가 아직 없으면 'ok'.
    WAL 에 남은 내용까지 반영해 검사하도록 보통 방식으로 연다 (SQLite가 WAL을 자동 복구)."""
    kind, target = parse_db_url(cfg)
    if kind != "sqlite" or not Path(target).exists():
        return "ok"
    from ..db import SqliteDB
    return SqliteDB.check_file(Path(target))


def latest_backup(cfg: Config) -> Path | None:
    d = cfg.backup_path / "db"
    fs = sorted(d.glob("qis_*.sqlite")) if d.is_dir() else []
    return fs[-1] if fs else None


# ---------------------------------------------------------------- 서버
def free_port(host: str = "127.0.0.1") -> int:
    with socket.socket() as s:
        s.bind((host, 0))
        return s.getsockname()[1]


def lan_url(cfg: Config) -> str:
    return f"{'https' if cfg.https else 'http'}://localhost:{cfg.port}"


class PortInUse(Exception):
    pass


class ServerRunner:
    """같은 프로세스 안에서 QIS 서버(uvicorn)를 켜고 끈다.

    소켓을 먼저 직접 열어 uvicorn 에 넘긴다 — 빈 포트를 고른 뒤 다른 프로그램이 가로챌 틈이 없고,
    어느 주소(127.0.0.1 / 0.0.0.0)에 열렸는지 확실히 알 수 있다.
    """

    def __init__(self, cfg: Config, settings: DesktopSettings):
        self.base_cfg = cfg
        self.cfg = cfg
        self.settings = settings
        self.mode = settings.mode
        if self.mode not in MODES:
            raise ValueError("모드를 먼저 고르세요")
        # 실행마다 새 열쇠: 혼자 쓰기는 자동 입장, 사내 서버는 '프로그램 창' 표시용 (로그인은 따로 필요)
        self.token = secrets.token_urlsafe(32)
        self.app = None
        self.server = None
        self.thread = None
        self.sock = None
        self.host = "127.0.0.1" if self.mode == "solo" else (cfg.host or "0.0.0.0")
        self.port = 0

    # -- 주소
    @property
    def scheme(self) -> str:
        return "https" if self.cfg.https else "http"

    @property
    def base_url(self) -> str:
        return f"{self.scheme}://127.0.0.1:{self.port}"

    @property
    def enter_url(self) -> str:
        """창이 처음 여는 주소: 혼자 쓰기는 자동 입장, 사내 서버는 로그인 화면."""
        if self.mode == "solo":
            return f"{self.base_url}/desktop/enter?k={self.token}"
        return f"{self.base_url}/desktop/window?k={self.token}"

    @property
    def bound(self) -> tuple[str, int]:
        return self.sock.getsockname()[:2] if self.sock else ("", 0)

    # -- 켜기
    def _runtime_cfg(self) -> Config:
        c = self.base_cfg
        if self.mode == "solo":
            # 혼자 쓰기: 이 PC 안에서만, HTTPS 불필요 (qis.json 은 바꾸지 않음).
            # 로그인은 마지막 사용 후 하루 유지 — 넘으면 창이 비밀번호 없이 다시 들어감(desktop_enter.html)
            return dataclasses.replace(c, host="127.0.0.1", ssl_certfile="", ssl_keyfile="", session_hours=24)
        if c.host in ("127.0.0.1", "localhost"):
            return c          # 사용자가 일부러 127.0.0.1 로 정한 경우(Tailscale 개인 사용 등)는 존중
        return dataclasses.replace(c, host="0.0.0.0")

    def _open_socket(self, host: str, port: int) -> socket.socket:
        fam = socket.AF_INET6 if ":" in host else socket.AF_INET
        s = socket.socket(fam, socket.SOCK_STREAM)
        if not sys.platform.startswith("win"):
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)   # 윈도우에서는 다른 프로그램의 포트를 뺏을 수 있어 쓰지 않음
        try:
            s.bind((host, port))
        except OSError as e:
            s.close()
            raise PortInUse(f"{port}번 포트를 다른 프로그램이 쓰고 있습니다") from e
        s.listen(128)
        s.set_inheritable(True)
        return s

    def start(self, timeout: float = 30) -> "ServerRunner":
        import uvicorn
        from ..app import create_app

        self.cfg = self._runtime_cfg()
        self.host = self.cfg.host
        self.sock = self._open_socket(self.host, 0 if self.mode == "solo" else int(self.cfg.port))
        self.port = self.sock.getsockname()[1]
        desktop = {"mode": self.mode, "token": self.token, "user": SOLO_USER}
        try:
            self.app = create_app(self.cfg, desktop=desktop)
            kw = {}
            if self.cfg.https:
                kw.update(ssl_certfile=self.cfg.ssl_certfile, ssl_keyfile=self.cfg.ssl_keyfile)
            ucfg = uvicorn.Config(self.app, log_config=None, access_log=False, proxy_headers=False,
                                  lifespan="on", timeout_graceful_shutdown=5, **kw)
            self.server = uvicorn.Server(ucfg)
            self.thread = threading.Thread(target=self.server.run, kwargs={"sockets": [self.sock]},
                                           name="qis-server", daemon=True)
            self.thread.start()
            t0 = time.time()
            while not self.server.started:
                if not self.thread.is_alive():
                    raise RuntimeError("서버가 시작되지 못했습니다 (기록: logs/desktop.log)")
                if time.time() - t0 > timeout:
                    raise RuntimeError("서버 시작이 너무 오래 걸립니다")
                time.sleep(0.05)
        except BaseException:
            self.stop()
            raise
        log.info("서버 시작 %s %s:%s", self.mode, self.host, self.port)
        return self

    @property
    def running(self) -> bool:
        return bool(self.thread and self.thread.is_alive() and self.server and self.server.started)

    # -- 끄기
    def stop(self, timeout: float = 15) -> None:
        """서버를 멈추고(진행 중 요청은 마무리) DB를 정리해 닫음. 여러 번 불러도 안전."""
        if self.server:
            self.server.should_exit = True
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout)
            if self.thread.is_alive() and self.server:
                self.server.force_exit = True
                self.thread.join(5)
        if self.app is not None:
            db = self.app.state.db
            try:
                self.app.state.backup.stop()
            except Exception:
                pass
            try:
                db.checkpoint()
            except Exception:
                log.exception("WAL 정리 실패 (데이터는 qis.db-wal 에 안전하게 남아 있음)")
            try:
                db.close()
            except Exception:
                pass
            self.app = None
        if self.sock:
            try:
                self.sock.close()
            except OSError:
                pass
            self.sock = None
        self.server = None
        self.thread = None
        log.info("서버 종료")


# ---------------------------------------------------------------- 시작 준비 (창이 뜨기 전)
def prepare(cfg: Config, settings: DesktopSettings) -> None:
    """모드에 맞게 DB · 계정을 준비. 사내 서버 모드는 관리자 계정이 이미 있어야 함."""
    if settings.mode == "solo":
        ensure_solo_user(cfg, settings.solo_name)
    elif settings.mode == "lan":
        db = open_db(cfg)
        try:
            n = db.q1("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1 AND lower(username)<>lower(?)",
                      (SOLO_USER,))["n"]
            with db.tx() as c:   # 혼자 쓰기 때의 자동 입장 세션이 사내 서버 모드로 이어지지 않게
                c.execute("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE lower(username)=lower(?))",
                          (SOLO_USER,))
        finally:
            db.close()
        if not n:
            raise AuthError("사내 서버로 쓰려면 로그인할 관리자 계정이 필요합니다", "no_admin")


# ---------------------------------------------------------------- 가져오기 · 복원 (서버를 멈춘 상태에서)
def _keep_dir(cfg: Config) -> Path:
    return cfg.data_dir / f"restore_before_{datetime.now().strftime('%Y%m%d_%H%M%S')}"


def has_records(cfg: Config) -> bool:
    db = open_db(cfg)
    try:
        return db.q1("SELECT COUNT(*) n FROM records")["n"] > 0
    finally:
        db.close()


def restore_backup_file(cfg: Config, src: Path) -> dict:
    """백업 DB 파일(backup/db/qis_*.sqlite)로 복원 — 기존 restore 그대로 (지금 DB는 보관)."""
    from ..restore import restore
    return restore(cfg, Path(src), check_server=False)


def find_server_db(folder: Path) -> Path | None:
    """서버판 data 폴더(또는 그 위 폴더)에서 qis.db 찾기."""
    folder = Path(folder)
    for p in (folder / "qis.db", folder / "data" / "qis.db"):
        if p.is_file():
            return p
    return None


def import_server_folder(cfg: Config, folder: Path) -> dict:
    """기존 서버판 data 폴더 가져오기: DB(사용자 · 이력 포함) + 첨부. 지금 DB는 restore_before_… 에 보관.

    원본 폴더는 바꾸지 않는다. 원본의 qis.db-wal 에 남은 내용까지 담기도록 SQLite 백업 기능으로 복사한 뒤
    그 사본을 기존 복원 절차(검사 · 보관 · 교체 · 건수 확인)로 넣는다."""
    from ..restore import RestoreError
    src = find_server_db(folder)
    if not src:
        raise RestoreError("이 폴더에서 qis.db 를 찾지 못했습니다 — 서버판의 data 폴더를 고르세요")
    if Path(src).resolve() == Path(parse_db_url(cfg)[1]).resolve():
        raise RestoreError("지금 쓰고 있는 데이터 폴더입니다")
    tmp = cfg.data_dir / "import_server.tmp.sqlite"
    try:
        from ..db import SqliteDB
        SqliteDB.copy_file(src, tmp)
        r = restore_backup_file(cfg, tmp)
    finally:
        try:
            tmp.unlink()
        except FileNotFoundError:
            pass
    filled = 0
    sf = Path(src).parent / "files"
    if sf.is_dir():
        for p in sf.rglob("*.json"):
            q = cfg.files_dir / p.relative_to(sf)
            if not q.exists():
                q.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(p, q)
                filled += 1
    r["files_filled"] = r.get("files_filled", 0) + filled
    return r


def import_json_backup(cfg: Config, path: Path, *, replace: bool = False, by_username: str | None = None) -> dict:
    """개인판 HTML 백업(QIS_최신백업.json · QIS_data.json · 서버 내보내기 JSON) 가져오기 — 기존 import 그대로.

    기록이 이미 있으면 replace=True 일 때만: 지금 DB를 restore_before_… 로 옮겨 보관하고,
    사용자 계정은 새 DB로 옮긴 뒤 가져온다 (변경 이력 · 이전 기록은 보관한 DB에 그대로 남음)."""
    from ..files import Files
    from ..store import Store
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("defects"), list) or not isinstance(data.get("settings"), dict):
        raise ValueError("QIS 백업 형식이 아닙니다 (QIS_최신백업.json · QIS_data.json 같은 파일을 고르세요)")
    kept = ""
    if has_records(cfg):
        if not replace:
            raise ValueError("이미 기록이 있습니다")
        kind, target = parse_db_url(cfg)
        if kind != "sqlite":
            raise ValueError("SQLite DB에서만 바꿀 수 있습니다")
        dest = Path(target)
        keep = _keep_dir(cfg)
        keep.mkdir(parents=True)
        db = open_db(cfg)
        try:
            db.checkpoint()
        finally:
            db.close()
        for suf in ("", "-wal", "-shm"):
            f = Path(str(dest) + suf)
            if f.exists():
                shutil.move(str(f), str(keep / f.name))
        kept = str(keep)
        db = open_db(cfg)                        # 빈 DB (스키마 생성)
        try:
            db.copy_users_from(keep / dest.name)
        finally:
            db.close()
    db = open_db(cfg)
    try:
        by = (db.q1("SELECT * FROM users WHERE lower(username)=lower(?)", (by_username,)) if by_username else None) or \
            db.q1("SELECT * FROM users WHERE role='admin' AND active=1 ORDER BY id LIMIT 1")
        if not by:
            raise ValueError("가져오기를 실행할 관리자 계정이 없습니다")
        photos = data.pop("photos", None)
        cnt = Store(db, cfg).import_backup(by, data)
        if isinstance(photos, list):
            fs = Files(db, cfg)
            ok = [p for p in photos if isinstance(p, dict) and p.get("id") and p.get("data")]
            for i in range(0, len(ok), 50):
                fs.put_many(by, ok[i:i + 50])
            cnt["photos"] = len(ok)
        if kept:
            with db.tx() as c:
                db.audit(c, user=by, action="import", label="가져오기 전 DB 보관", detail={"kept": kept})
        return {"imported": cnt, "kept": kept}
    finally:
        db.close()


def export_json(app, path: Path, user_name: str | None = None, photos: bool = True) -> int:
    """지금 데이터를 JSON 파일로 저장 (관리 화면 '백업 내려받기'와 같은 내용) — 데스크톱 창의 '백업 파일 저장'."""
    store, files, db = app.state.store, app.state.files, app.state.db
    data = store.export()
    if photos:
        data["photos"] = files.get_many(files.all_ids(), limit=None)
    p = Path(path)
    tmp = p.with_name(p.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tmp.replace(p)
    u = db.q1("SELECT * FROM users WHERE lower(username)=lower(?)", (user_name,)) if user_name else None
    with db.tx() as c:
        db.audit(c, user=u, action="export", label="QIS 백업 파일 저장 (데스크톱)", detail={"photos": photos})
    return p.stat().st_size


def open_in_os(path: Path) -> None:
    """폴더 · 파일을 Finder / 탐색기 / 기본 프로그램으로 엶."""
    import subprocess
    p = str(path)
    if sys.platform == "darwin":
        subprocess.Popen(["open", p])
    elif sys.platform.startswith("win"):
        os.startfile(p)  # type: ignore[attr-defined]
    else:
        subprocess.Popen(["xdg-open", p])


def setup_logging(data_dir: Path) -> Path:
    """기록 파일: 데이터 폴더/logs/desktop.log (창 프로그램은 콘솔이 없으므로)."""
    from logging.handlers import RotatingFileHandler
    d = Path(data_dir) / "logs"
    d.mkdir(parents=True, exist_ok=True)
    f = d / "desktop.log"
    h = RotatingFileHandler(f, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    if not any(isinstance(x, RotatingFileHandler) and getattr(x, "baseFilename", "") == str(f) for x in root.handlers):
        root.addHandler(h)
    root.setLevel(logging.INFO)
    if sys.stdout is None or sys.stderr is None:      # 창 프로그램(콘솔 없음): print 등이 오류 나지 않게
        stream = open(d / "console.log", "a", encoding="utf-8", errors="replace", buffering=1)
        if sys.stdout is None:
            sys.stdout = stream
        if sys.stderr is None:
            sys.stderr = stream
    return f
