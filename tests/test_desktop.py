"""데스크톱 프로그램 시험 (창 없이 — 내장 서버 켜기 · 끄기 로직만): python -m pytest -q

빈 포트 선택 · 사용자 데이터 폴더 · 단일 실행 잠금 · 혼자 쓰기(127.0.0.1 · 로그인 생략) ·
사내 서버 모드(로그인 필요) · 종료 시 정리(DB 체크포인트) · 비정상 종료 뒤 손상 검사 · 가져오기
"""
import json
import socket
import sys
from pathlib import Path

import httpx
import pytest

from qis.auth import Auth
from qis.config import Config, load_config
from qis.db import SqliteDB, open_db
from qis.desktop import paths
from qis.desktop.instance import InstanceLock
from qis.desktop.server import LOCAL_USER, DesktopServer, NullUI

H = {"X-QIS": "1"}
SAMPLE = Path(__file__).parent / "sample_backup.json"


class FakeUI(NullUI):
    def __init__(self):
        self.opened, self.loaded, self.folder, self.file, self.answer = [], [], None, None, True

    def pick_folder(self, start=""):
        return self.folder

    def pick_file(self, start="", types=()):
        return self.file

    def confirm(self, title, message):
        return self.answer

    def load_url(self, url):
        self.loaded.append(url)

    def open_path(self, path):
        self.opened.append(Path(path))


def make_cfg(tmp_path, mode=""):
    c = Config()
    c.data_dir = tmp_path / "QIS"
    c.desktop_mode = mode
    c.save()
    return load_config(c.data_dir)


@pytest.fixture()
def ctrl_factory(tmp_path):
    made = []

    def make(mode="", ui=None, sub="QIS"):
        c = Config()
        c.data_dir = tmp_path / sub
        c.desktop_mode = mode
        c.port = _free_port()
        c.save()
        cfg = load_config(c.data_dir)
        lock = InstanceLock(cfg.data_dir)
        assert lock.acquire()
        ctrl = DesktopServer(cfg, ui=ui or FakeUI(), lock=lock)
        made.append((ctrl, lock))
        return ctrl
    yield make
    for ctrl, lock in made:
        ctrl.stop()
        lock.release()


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def http(ctrl):
    return httpx.Client(base_url=ctrl.url, follow_redirects=False, timeout=10)


def enter_solo(ctrl):
    c = http(ctrl)
    r = c.get(f"/desktop/enter?key={ctrl.key}")
    assert r.status_code == 303 and r.headers["location"] == "/"
    return c


# ---- 사용자 데이터 폴더 ----
def test_user_data_dir(monkeypatch, tmp_path):
    monkeypatch.delenv("QIS_DATA_DIR", raising=False)
    monkeypatch.setattr(sys, "platform", "darwin")
    assert paths.user_data_dir() == Path.home() / "Library" / "Application Support" / "QIS"
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setenv("APPDATA", str(tmp_path / "Roaming"))
    assert paths.user_data_dir() == tmp_path / "Roaming" / "QIS"
    monkeypatch.setenv("QIS_DATA_DIR", str(tmp_path / "x"))
    assert paths.user_data_dir() == (tmp_path / "x").resolve()


def test_first_start_creates_data_folder(tmp_path):
    cfg = Config()
    cfg.data_dir = tmp_path / "새폴더" / "QIS"
    ctrl = DesktopServer(cfg)
    ctrl.start()
    try:
        assert (cfg.data_dir / "qis.db").exists()
        assert ctrl.mode == "" and ctrl.health()
        assert "/desktop/setup?key=" in ctrl.entry_url()
    finally:
        ctrl.stop()


# ---- 단일 실행 잠금 · 비정상 종료 표시 ----
def test_single_instance_lock(tmp_path):
    a, b = InstanceLock(tmp_path), InstanceLock(tmp_path)
    assert a.acquire() and not a.was_dirty
    assert not b.acquire()                 # 같은 데이터 폴더는 하나만
    assert b.in_use_elsewhere()
    a.release()
    assert b.acquire() and not b.was_dirty  # 정상 종료 뒤에는 검사 안 함
    b.release(clean=False)                  # 비정상 종료 흉내 (표시 파일 남김)
    c = InstanceLock(tmp_path)
    assert c.acquire() and c.was_dirty
    c.release()


def test_restore_refuses_while_desktop_running(ctrl_factory):
    from qis.restore import RestoreError, restore
    ctrl = ctrl_factory("solo")
    ctrl.start()
    ctrl.app.state.backup.run("manual")
    bk = ctrl.latest_backup()
    with pytest.raises(RestoreError):
        restore(load_config(ctrl.cfg.data_dir), bk)   # 명령 창 복원도 프로그램이 열려 있으면 거부


# ---- 혼자 쓰기 ----
def test_solo_binds_localhost_free_port_and_skips_login(ctrl_factory):
    ctrl = ctrl_factory("solo")
    ctrl.start()
    assert ctrl.sock.getsockname()[0] == "127.0.0.1"          # 이 PC 안에서만
    assert ctrl.port != ctrl.cfg.port and ctrl.port > 0       # 빈 포트 자동 선택
    c = http(ctrl)
    assert c.get("/").headers["location"] == "/login"          # 열쇠 없이는 못 들어감
    assert c.get("/desktop/enter?key=wrong").headers["location"] == "/"
    c = enter_solo(ctrl)
    r = c.get("/")
    assert r.status_code == 200
    info = json.loads(r.text.split('id="qisServer" type="application/json">')[1].split("</script>")[0])
    assert info["user"] == LOCAL_USER and info["role"] == "admin" and info["desktop"] == "solo"
    assert c.get("/login").headers["location"] == "/desktop/enter"   # 로그인 화면 대신 자동 로그인
    # 다른 이름(Host)으로 오면 거부 — DNS 리바인딩 차단
    assert c.get("/healthz", headers={"Host": "evil.example:80"}).status_code == 403
    # 로컬 계정 비밀번호는 아무도 모름
    assert c.post("/api/login", json={"username": LOCAL_USER, "password": ""}, headers=H).status_code == 400


def test_setup_solo_then_change_to_server(ctrl_factory):
    ui = FakeUI()
    ctrl = ctrl_factory("", ui)
    ctrl.start()
    c = http(ctrl)
    assert c.get("/").headers["location"] == "/desktop/setup"
    assert c.get("/desktop/setup").status_code == 403                 # 열쇠 없음
    r = c.get(f"/desktop/setup?key={ctrl.key}")
    assert r.status_code == 200 and "qisSetup" in r.text
    r = c.post("/api/desktop/setup", json={"mode": "solo", "name": "김선중"}, headers=H)
    assert r.json() == {"next": "/desktop/enter"}
    assert load_config(ctrl.cfg.data_dir).desktop_mode == "solo"
    r = c.get("/desktop/enter")
    c.cookies.update(r.cookies)
    assert '"name": "김선중"' in c.get("/").text
    # 사내 서버로 바꾸기: 관리자 계정이 필요
    r = c.post("/api/desktop/setup", json={"mode": "server"}, headers=H)
    assert r.status_code == 400
    r = c.post("/api/desktop/setup", json={"mode": "server", "port": ctrl.cfg.port,
                                          "admin": {"username": "admin", "name": "관리자", "password": "Qadm2026x",
                                                    "password2": "Qadm2026x"}}, headers=H)
    assert r.json() == {"restart": True}
    for _ in range(100):                      # 다시 켜지고 창이 새 주소를 열 때까지
        if ui.loaded:
            break
        import time
        time.sleep(0.1)
    assert ui.loaded and ctrl.mode == "server"
    assert ctrl.sock.getsockname()[0] == "0.0.0.0" and ctrl.port == ctrl.cfg.port
    c = http(ctrl)
    assert c.get("/").headers["location"] == "/login"                # 사내 서버: 로그인 필요
    c.get(ui.loaded[-1].replace(ctrl.url, ""))                        # 창: 열쇠 쿠키만 받음
    assert c.get("/").headers["location"] == "/login"
    db = ctrl.app.state.db
    assert not db.q1("SELECT active FROM users WHERE username='local'")["active"]   # 비밀번호 없는 계정은 끔
    r = c.post("/api/login", json={"username": "admin", "password": "Qadm2026x"}, headers=H)
    assert r.status_code == 200
    assert c.get("/api/desktop/info").json()["mode"] == "server"


def test_server_mode_requires_login(ctrl_factory):
    ctrl = ctrl_factory("server")
    d = open_db(ctrl.cfg)
    Auth(d, ctrl.cfg).create_user("admin", "관리자", "admin", "Qadm2026x", must_change=False)
    d.close()
    ctrl.start()
    assert ctrl.sock.getsockname()[0] == "0.0.0.0"
    c = http(ctrl)
    assert c.get(f"/desktop/enter?key={ctrl.key}").headers["location"] == "/"
    assert c.get("/").headers["location"] == "/login"
    assert c.get("/api/boot").status_code == 401
    assert ctrl.lan_addresses() == [] or all(str(ctrl.port) in u for u in ctrl.lan_addresses())


def test_server_mode_port_in_use_falls_back(ctrl_factory):
    ctrl = ctrl_factory("server")
    with socket.socket() as s:
        s.bind(("0.0.0.0", ctrl.cfg.port))
        s.listen()
        ctrl.start()
        assert ctrl.port != ctrl.cfg.port and ctrl.notice


# ---- 종료 · 정리 ----
def test_stop_cleans_up(ctrl_factory):
    ctrl = ctrl_factory("solo")
    ctrl.start()
    c = enter_solo(ctrl)
    r = c.post("/api/sync", json={"since": 0, "changes": [
        {"coll": "defects", "id": "d1", "rev": 0, "data": {"id": "d1", "date": "2026-11-04", "qty": 3}}]}, headers=H)
    assert r.status_code == 200, r.text
    port, dbf = ctrl.port, ctrl.cfg.data_dir / "qis.db"
    ctrl.stop()
    assert not ctrl.running and ctrl.app is None
    with socket.socket() as s:                       # 포트가 닫힘
        assert s.connect_ex(("127.0.0.1", port)) != 0
    wal = Path(str(dbf) + "-wal")
    assert not wal.exists() or wal.stat().st_size == 0   # 체크포인트 → qis.db 하나로 완전
    assert SqliteDB.inspect_file(dbf)["records"].get("defects") == 1
    ctrl.start()                                     # 다시 켜도 그대로
    assert enter_solo(ctrl).get("/api/boot").status_code == 200


# ---- 비정상 종료 뒤 검사 ----
def test_preflight_detects_corruption(tmp_path):
    cfg = make_cfg(tmp_path, "solo")
    d = open_db(cfg)
    d.close()
    lock = InstanceLock(cfg.data_dir)
    lock.acquire()
    lock.release(clean=False)                        # 지난번 비정상 종료
    lock = InstanceLock(cfg.data_dir)
    lock.acquire()
    ctrl = DesktopServer(cfg, lock=lock)
    assert ctrl.preflight() == {"dirty": True, "check": "ok"}
    dbf = cfg.data_dir / "qis.db"
    raw = bytearray(dbf.read_bytes())
    raw[100:4096] = b"\x00\xff" * ((4096 - 100) // 2)  # 파일 손상 흉내
    dbf.write_bytes(bytes(raw))
    assert ctrl.preflight()["check"] != "ok"
    lock.release()


# ---- 데스크톱 API: 백업 폴더 · 열기 · 가져오기 ----
def test_backup_dir_and_open(ctrl_factory, tmp_path):
    ui = FakeUI()
    ctrl = ctrl_factory("solo", ui)
    ctrl.start()
    c = enter_solo(ctrl)
    assert c.post("/api/desktop/backup-dir", json={}).status_code == 403          # X-QIS 헤더 없음
    ui.folder = str(tmp_path / "내 백업")
    r = c.post("/api/desktop/backup-dir", json={}, headers=H)
    assert r.json()["dir"] == str(tmp_path / "내 백업")
    assert load_config(ctrl.cfg.data_dir).backup_dir == str(tmp_path / "내 백업")   # 저장됨
    r = c.post("/api/desktop/backup-now", json={}, headers=H)
    assert r.status_code == 200 and list((tmp_path / "내 백업" / "db").glob("qis_*.sqlite"))
    r = c.post("/api/desktop/open", json={"name": "보고서.html", "html": "<p>x</p>"}, headers=H)
    assert r.status_code == 200 and ui.opened[-1].read_text(encoding="utf-8") == "<p>x</p>"
    r = c.post("/api/desktop/open", json={"name": "../../a.txt", "data": "data:text/plain;base64,aGk="}, headers=H)
    assert ui.opened[-1].parent == ctrl.open_dir and ui.opened[-1].read_bytes() == b"hi"
    # 열쇠 쿠키가 없는 곳(일반 브라우저)에서는 못 씀
    c2 = httpx.Client(base_url=ctrl.url)
    c2.cookies.set("qis_sid", c.cookies.get("qis_sid"))
    assert c2.post("/api/desktop/open-folder", json={}, headers=H).status_code == 403


def test_import_json_into_empty(ctrl_factory):
    ctrl = ctrl_factory("solo")
    ctrl.start()
    c = enter_solo(ctrl)
    r = c.post("/api/desktop/import", json={"path": str(SAMPLE)}, headers=H)
    assert r.status_code == 200, r.text
    n = r.json()["imported"]
    assert n["defects"] > 0
    r = c.post("/api/desktop/import", json={"path": str(SAMPLE)}, headers=H)     # 기록이 있으면 거부
    assert r.status_code == 400


def test_import_server_data_folder(ctrl_factory, tmp_path):
    # 기존 서버판 data 폴더 만들기 (WAL 에만 있는 변경 포함)
    old = Config()
    old.data_dir = tmp_path / "qis-server" / "data"
    old.save()
    d = open_db(old)
    a = Auth(d, old)
    a.create_user("admin", "관리자", "admin", "Qadm2026x", must_change=False)
    from qis.store import Store
    with open(SAMPLE, encoding="utf-8") as f:
        Store(d, old).import_backup(d.q1("SELECT * FROM users"), json.load(f))
    (old.files_dir / "ab").mkdir(parents=True)
    (old.files_dir / "ab" / "f1.json").write_text("{}", encoding="utf-8")
    want = SqliteDB.inspect_file  # noqa
    ui = FakeUI()
    ctrl = ctrl_factory("solo", ui)
    ctrl.start()
    c = enter_solo(ctrl)
    r = c.post("/api/desktop/import", json={"path": str(tmp_path / "qis-server"), "confirmed": True}, headers=H)
    assert r.json() == {"restart": True}
    import time
    for _ in range(150):
        if ui.loaded:
            break
        time.sleep(0.1)
    d.close()
    assert ui.loaded and ctrl.running
    c = enter_solo(ctrl)                                  # 로컬 계정을 다시 만들어 바로 들어감
    boot = c.get("/api/boot").json()
    assert any(x["coll"] == "defects" for x in boot["records"])
    assert (ctrl.cfg.files_dir / "ab" / "f1.json").exists()
    assert list(ctrl.cfg.data_dir.glob("restore_before_*"))   # 이전 DB 보관
