"""데스크톱 프로그램(qis.desktop) 시험 — 창(pywebview)은 띄우지 않고 서버 기동 · 종료 로직만: python -m pytest -q"""
import http.cookiejar
import json
import socket
import sqlite3
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from qis.desktop import core
from qis.desktop.lock import AlreadyRunning, InstanceLock
from qis.desktop.paths import user_data_dir

SAMPLE = Path(__file__).parent / "sample_backup.json"


def opener():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def get(op, url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with op.open(req, timeout=10) as r:
            return r.status, r.read().decode("utf-8"), r.url
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8"), url


def port_open(port):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


@pytest.fixture()
def data(tmp_path):
    d = tmp_path / "QIS"
    d.mkdir()
    return d


@pytest.fixture()
def solo(data):
    cfg = core.desktop_config(data)
    st = core.DesktopSettings(mode="solo", solo_name="김선중")
    core.prepare(cfg, st)
    r = core.ServerRunner(cfg, st).start()
    yield cfg, r
    r.stop()


def test_user_data_dir(tmp_path, monkeypatch):
    target = tmp_path / "AppSupport" / "QIS"
    monkeypatch.setenv("QIS_DESKTOP_DIR", str(target))
    assert not target.exists()
    assert user_data_dir() == target.resolve()
    assert target.is_dir()                        # 없으면 만듦
    monkeypatch.delenv("QIS_DESKTOP_DIR")
    p = user_data_dir(create=False)
    assert p.name == "QIS" and "qis-server" not in str(p)   # 프로그램 폴더가 아님


def test_free_port():
    p = core.free_port()
    assert 1024 < p < 65536
    with socket.socket() as s:                    # 정말 비어 있음
        s.bind(("127.0.0.1", p))


def test_instance_lock(data):
    a = InstanceLock(data).acquire()
    with pytest.raises(AlreadyRunning):
        InstanceLock(data).acquire()              # 같은 데이터 폴더 두 번째 실행은 막힘
    a.release()
    with InstanceLock(data) as b:                 # 닫으면 다시 열 수 있음
        assert b.held


def test_settings_roundtrip(data):
    assert core.DesktopSettings.load(data).mode == ""          # 첫 실행
    core.DesktopSettings(mode="lan", solo_name="김").save(data)
    s = core.DesktopSettings.load(data)
    assert (s.mode, s.solo_name) == ("lan", "김")
    core.DesktopSettings.path(data).write_text('{"mode":"weird"}', encoding="utf-8")
    assert core.DesktopSettings.load(data).mode == ""          # 모르는 값은 첫 실행처럼


def test_solo_localhost_only_and_no_login(solo):
    cfg, r = solo
    host, port = r.bound
    assert host == "127.0.0.1" and port == r.port and port != cfg.port   # 이 PC 안에서만 · 빈 포트
    op = opener()
    st, body, url = get(op, r.base_url + "/")
    assert url.endswith("/login") and "pywebview" in body      # 로그인 화면 대신 자동 재입장 화면
    st, _, _ = get(opener(), r.base_url + "/desktop/enter?k=wrong")
    assert st == 403                                           # 열쇠 없이는 못 들어옴
    st, body, url = get(op, r.enter_url)
    assert st == 200 and url == r.base_url + "/"
    assert '"desktop": "solo"' in body and '"name": "김선중"' in body and "/desktop.js" in body
    st, body, _ = get(op, r.base_url + "/api/boot")
    assert st == 200 and json.loads(body)["user"]["role"] == "admin"
    # 변경 저장도 됨
    st, body, _ = get(op, r.base_url + "/api/sync", data=json.dumps({"since": 0, "changes": [
        {"coll": "suppliers", "id": "s1", "rev": 0, "data": {"id": "s1", "name": "가나"}}]}).encode(),
        headers={"Content-Type": "application/json", "X-QIS": "1"})
    assert st == 200, body
    st, _, _ = get(op, r.base_url + "/desktop.js")
    assert st == 200


def test_solo_ignores_lan_host(data):
    cfg = core.desktop_config(data)
    cfg.host = "0.0.0.0"
    cfg.save()
    st = core.DesktopSettings(mode="solo")
    core.prepare(cfg, st)
    r = core.ServerRunner(cfg, st).start()
    try:
        assert r.bound[0] == "127.0.0.1"
    finally:
        r.stop()


def test_stop_cleans_up(data):
    cfg = core.desktop_config(data)
    st = core.DesktopSettings(mode="solo")
    core.prepare(cfg, st)
    r = core.ServerRunner(cfg, st).start()
    port, th = r.port, r.thread
    op = opener()
    get(op, r.enter_url)
    get(op, r.base_url + "/api/sync", data=json.dumps({"since": 0, "changes": [
        {"coll": "parts", "id": "p1", "rev": 0, "data": {"id": "p1", "partNo": "A-1"}}]}).encode(),
        headers={"Content-Type": "application/json", "X-QIS": "1"})
    assert port_open(port)
    r.stop()
    assert not th.is_alive() and not port_open(port) and not r.running
    wal = data / "qis.db-wal"
    assert not wal.exists() or wal.stat().st_size == 0          # WAL 을 DB 파일에 합침
    con = sqlite3.connect(str(data / "qis.db"))
    assert con.execute("SELECT COUNT(*) FROM records WHERE coll='parts'").fetchone()[0] == 1
    con.close()
    r.stop()                                                     # 두 번 불러도 안전


def test_lan_mode_login(data):
    cfg = core.desktop_config(data)
    cfg.port = core.free_port()
    st = core.DesktopSettings(mode="lan")
    with pytest.raises(core.AuthError):
        core.prepare(cfg, st)                                    # 관리자 계정 없이는 시작 안 함
    core.set_lan_admin(cfg, "admin", "관리자", "Qadm2026x")
    core.prepare(cfg, st)
    r = core.ServerRunner(cfg, st).start()
    try:
        assert r.bound == ("0.0.0.0", cfg.port)                  # 사내망 공개 · 정한 포트
        st_, body, url = get(opener(), r.base_url + "/")
        assert url.endswith("/login") and 'id="u"' in body       # 일반 로그인 화면
        st_, _, _ = get(opener(), r.base_url + f"/desktop/enter?k={r.token}")
        assert st_ == 404                                        # 자동 입장 없음
        op = opener()
        st_, body, _ = get(op, r.base_url + "/api/login", data=json.dumps({"username": "admin", "password": "Qadm2026x"}).encode(),
                           headers={"Content-Type": "application/json", "X-QIS": "1"})
        assert st_ == 200, body
        st_, body, _ = get(op, r.base_url + "/")
        assert '"desktop"' not in body and "/desktop.js" not in body   # 팀원 브라우저: 일반 서버 화면 그대로
        st_, _, _ = get(op, r.base_url + "/desktop/window?k=wrong")
        assert st_ == 403
        st_, body, url = get(op, r.enter_url)                          # 프로그램 창: 표시 쿠키 → 창 보조 붙음
        assert url == r.base_url + "/" and '"desktop": "lan"' in body and "/desktop.js" in body
    finally:
        r.stop()
    # 이미 있는 아이디면 비밀번호를 새로 정함
    core.set_lan_admin(cfg, "admin", "관리자", "Qnew2026y")


def test_lan_port_in_use(data):
    cfg = core.desktop_config(data)
    core.set_lan_admin(cfg, "admin", "관리자", "Qadm2026x")
    with socket.socket() as s:
        s.bind(("0.0.0.0", 0))
        s.listen()
        cfg.port = s.getsockname()[1]
        with pytest.raises(core.PortInUse):
            core.ServerRunner(cfg, core.DesktopSettings(mode="lan")).start()


def test_unclean_shutdown_check(data):
    cfg = core.desktop_config(data)
    core.ensure_solo_user(cfg, "나")
    assert not core.was_unclean(data)
    core.mark_running(data)
    assert core.was_unclean(data)                                # 표시 파일이 남으면 비정상 종료
    assert core.check_db(cfg) == "ok"
    core.clear_running(data)
    assert not core.was_unclean(data)
    (data / "qis.db").write_bytes(b"SQLite format 3\x00" + b"\x00" * 200 + b"garbage" * 500)
    for suf in ("-wal", "-shm"):
        Path(str(data / "qis.db") + suf).unlink(missing_ok=True)
    assert core.check_db(cfg) != "ok"


def test_import_json_backup(data):
    cfg = core.desktop_config(data)
    core.ensure_solo_user(cfg, "나")
    r = core.import_json_backup(cfg, SAMPLE, by_username=core.SOLO_USER)
    assert r["imported"]["defects"] == 5 and not r["kept"]
    with pytest.raises(ValueError):
        core.import_json_backup(cfg, SAMPLE)                    # 기록이 있으면 묻고(replace) 나서만
    r = core.import_json_backup(cfg, SAMPLE, replace=True, by_username=core.SOLO_USER)
    keep = Path(r["kept"])
    assert keep.is_dir() and (keep / "qis.db").exists()          # 이전 DB 보관
    con = sqlite3.connect(str(data / "qis.db"))
    assert con.execute("SELECT COUNT(*) FROM users WHERE username='local'").fetchone()[0] == 1   # 계정 유지
    assert con.execute("SELECT COUNT(*) FROM records WHERE coll='defects'").fetchone()[0] == 5
    con.close()


def test_import_server_folder(tmp_path, data):
    from qis.auth import Auth
    from qis.config import Config
    from qis.db import open_db
    from qis.files import Files
    from qis.store import Store
    old = Config()
    old.data_dir = tmp_path / "server" / "data"
    old.save()
    db = open_db(old)
    Auth(db, old).create_user("admin", "관리자", "admin", "Qadm2026x", must_change=False)
    u = db.q1("SELECT * FROM users WHERE username='admin'")
    Store(db, old).import_backup(u, json.loads(SAMPLE.read_text(encoding="utf-8")))
    Files(db, old).put_many(u, [{"id": "ph1", "name": "a.png", "data": "data:image/png;base64,AAAA"}])
    db.close()                                    # WAL 파일이 남은 상태 그대로 가져와도 됨
    cfg = core.desktop_config(data)
    core.ensure_solo_user(cfg, "나")
    r = core.import_server_folder(cfg, tmp_path / "server")      # data 위 폴더를 골라도 찾음
    assert r["records"].get("defects") == 5 and r["files_filled"] >= 1
    assert list(cfg.files_dir.rglob("*.json"))
    st = core.DesktopSettings(mode="solo")
    core.prepare(cfg, st)                          # 가져온 뒤 혼자 쓰기 계정 되살림
    run = core.ServerRunner(cfg, st).start()
    try:
        op = opener()
        assert get(op, run.enter_url)[0] == 200
        boot = json.loads(get(op, run.base_url + "/api/boot")[1])
        assert boot
    finally:
        run.stop()
    assert (tmp_path / "server" / "data" / "qis.db").exists()  # 원본은 그대로


def test_restore_latest_backup(solo):
    cfg, r = solo
    info = r.app.state.backup.run("manual")
    lb = core.latest_backup(cfg)
    assert lb and lb.name == info["db"]
    r.stop()
    res = core.restore_backup_file(cfg, lb)
    assert res["integrity"] == "ok"


# ---- 창 제어(Controller) — 진짜 창 대신 가짜 창 객체로 ----
class FakeWindow:
    def __init__(self, confirm=True):
        self.loaded, self.dialogs, self.destroyed, self.confirm = [], [], False, confirm

    def load_url(self, u):
        self.loaded.append(("url", u))

    def load_html(self, h):
        self.loaded.append(("html", h))

    def create_confirmation_dialog(self, title, msg):
        self.dialogs.append(msg)
        return self.confirm

    def evaluate_js(self, script, cb=None):
        if cb:
            cb(0)

    def destroy(self):
        self.destroyed = True


@pytest.fixture()
def ctl(data):
    from qis.desktop.gui import Controller
    c = Controller(data)
    c.lock.acquire()
    c.cfg = core.desktop_config(data)
    c.settings = core.DesktopSettings.load(data)
    html, url = c._first_screen()
    assert c.state == "setup" and "사용 방식" in html and url is None     # 첫 실행: 모드 고르기
    c.window = FakeWindow()
    yield c
    c.shutdown()


def test_controller_setup_and_switch(ctl, data):
    r = ctl.apply_setup({"mode": "solo", "solo_name": "김선중"})
    assert r == {"ok": True} and ctl.state == "app"
    assert ctl.runner.bound[0] == "127.0.0.1" and ctl.window.loaded[-1] == ("url", ctl.runner.enter_url)
    assert core.DesktopSettings.load(data).mode == "solo"
    assert ctl.apply_setup({"mode": "lan"})["error"]                  # 고르는 화면이 아닐 때는 거부 (화면에서 함부로 못 바꿈)
    ctl.m_switch_mode()
    assert ctl.state == "setup"
    r = ctl.apply_setup({"mode": "lan", "admin": "admin", "admin_name": "관리자", "password": "short", "port": "8080"})
    assert "8자" in r["error"]                                         # 약한 비밀번호
    port = core.free_port()
    r = ctl.apply_setup({"mode": "lan", "admin": "admin", "admin_name": "관리자", "password": "Qadm2026x", "port": str(port)})
    assert r == {"ok": True}, r
    assert ctl.runner.bound == ("0.0.0.0", port) and "접속 주소" in ctl.window.loaded[-1][1]
    assert core.desktop_config(data).port == port                     # 포트는 qis.json 에 저장
    ctl.m_switch_mode()
    assert ctl.apply_setup({"mode": "solo", "solo_name": "김선중"}) == {"ok": True}
    assert ctl.runner.bound[0] == "127.0.0.1"


def test_controller_close_and_shutdown(ctl, data):
    assert ctl._on_closing() is True                                   # 고르는 화면: 바로 닫힘
    ctl.apply_setup({"mode": "solo"})
    core.mark_running(data)
    assert ctl._on_closing() is False                                  # QIS 화면: 먼저 저장 확인
    for _ in range(50):
        if ctl.window.destroyed:
            break
        import time
        time.sleep(0.05)
    assert ctl.window.destroyed and ctl._on_closing() is True
    port = ctl.runner.port
    ctl.shutdown()
    assert not port_open(port) and not core.was_unclean(data) and not ctl.lock.held


def test_controller_recover(data):
    from qis.desktop.gui import Controller
    cfg = core.desktop_config(data)
    core.DesktopSettings(mode="solo").save(data)
    core.prepare(cfg, core.DesktopSettings(mode="solo"))
    run = core.ServerRunner(cfg, core.DesktopSettings(mode="solo")).start()
    run.app.state.backup.run("manual")
    run.stop()
    core.mark_running(data)                                            # 지난번 비정상 종료
    (data / "qis.db").write_bytes(b"SQLite format 3\x00" + b"\x01" * 3000)
    c = Controller(data)
    c.lock.acquire()
    try:
        c.cfg, c.settings = core.desktop_config(data), core.DesktopSettings.load(data)
        html, _ = c._first_screen()
        assert c.state == "recover" and "최근 백업으로 복원" in html
        c.window = FakeWindow()
        assert c.apply_recover("restore") == {"ok": True}
        assert c.state == "app" and c.runner.running
        assert list(data.glob("restore_before_*"))                     # 손상된 DB도 지우지 않고 보관
    finally:
        c.shutdown()
