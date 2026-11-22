"""데스크톱 프로그램(qis.desktop) 시험 — 창(pywebview)은 띄우지 않고 서버 기동 · 종료 로직만: python -m pytest -q"""
import http.cookiejar
import json
import os
import socket
import sqlite3
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from qis.auth import AuthError
from qis.desktop import core, pages
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


PW = "Qadm2026x"
LOCAL = dict(mode="lan", lan_scope="local")     # 접속 범위 ‘이 PC만’
SETUP = {"admin": "admin", "admin_name": "김선중", "password": PW, "scope": "local"}


def login(op, r, user="admin", pw=PW):
    """프로그램 창처럼 들어감: 창 표시 쿠키 → 로그인."""
    get(op, r.enter_url)
    return get(op, r.base_url + "/api/login", data=json.dumps({"username": user, "password": pw}).encode(),
               headers={"Content-Type": "application/json", "X-QIS": "1"})


def local_runner(data, name="김선중"):
    cfg = core.desktop_config(data)
    core.set_lan_admin(cfg, "admin", name, PW)
    st = core.DesktopSettings(**LOCAL)
    core.prepare(cfg, st)
    return cfg, core.ServerRunner(cfg, st).start()


@pytest.fixture()
def solo(data):
    """접속 범위 ‘이 PC만’ 으로 켠 서버 (예전의 혼자 쓰기 자리)."""
    cfg, r = local_runner(data)
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
    core.DesktopSettings(mode="lan", lan_scope="local", setup_user="admin").save(data)
    s = core.DesktopSettings.load(data)
    assert (s.mode, s.lan_scope, s.setup_user) == ("lan", "local", "admin")
    core.DesktopSettings.path(data).write_text('{"mode":"weird"}', encoding="utf-8")
    assert core.DesktopSettings.load(data).mode == ""          # 모르는 값은 첫 실행처럼


def test_legacy_solo_settings_move_to_local_scope(data):
    f = core.DesktopSettings.path(data)
    f.write_text('{"mode":"solo","solo_name":"김선중"}', encoding="utf-8")            # 예전: 로그인 없이 혼자 쓰기
    s = core.DesktopSettings.load(data)
    assert (s.mode, s.lan_scope, s.setup_user, s.setup_name) == ("", "local", "local", "김선중")   # 처음 설정을 한 번 거침
    f.write_text('{"mode":"solo","solo_name":"김선중","solo_login":true}', encoding="utf-8")   # 예전: 비밀번호로 잠금
    s = core.DesktopSettings.load(data)
    assert (s.mode, s.lan_scope) == ("lan", "local")                                   # 설정 없이 그대로 열림 (계정 local)


def test_local_scope_localhost_only_and_login(solo):
    cfg, r = solo
    host, port = r.bound
    assert host == "127.0.0.1" and port == r.port and port != cfg.port   # 이 PC 안에서만 · 빈 포트
    op = opener()
    st, body, url = get(op, r.base_url + "/")
    assert url.endswith("/login") and 'id="u"' in body and "qisOneUser" not in body   # 로그인 화면 (창이 아니면 아이디를 채우지 않음)
    assert get(opener(), r.base_url + "/desktop/enter?k=" + r.token)[0] == 404   # 자동 입장 경로 없음
    assert get(opener(), r.base_url + "/desktop/window?k=wrong")[0] == 403
    st, body, url = get(op, r.enter_url)
    assert url.endswith("/login") and 'id="qisOneUser"' in body and '"admin"' in body   # 프로그램 창 · 계정 한 개: 아이디를 미리 채움
    st, body, _ = login(op, r, pw="wrong")
    assert st == 400
    st, body, _ = login(op, r)
    assert st == 200, body
    st, body, url = get(op, r.base_url + "/")
    assert st == 200 and '"desktop": "local"' in body and '"name": "김선중"' in body and "/desktop.js" in body
    st, body, _ = get(op, r.base_url + "/api/boot")
    assert st == 200 and json.loads(body)["user"]["role"] == "admin"
    # 변경 저장도 됨
    st, body, _ = get(op, r.base_url + "/api/sync", data=json.dumps({"since": 0, "changes": [
        {"coll": "suppliers", "id": "s1", "rev": 0, "data": {"id": "s1", "name": "가나"}}]}).encode(),
        headers={"Content-Type": "application/json", "X-QIS": "1"})
    assert st == 200, body
    st, _, _ = get(op, r.base_url + "/desktop.js")
    assert st == 200
    # 프로그램 창에는 pywebview 다리(new Function · eval)가 돌도록 unsafe-eval 허용, 일반 접속에는 없음
    req = urllib.request.Request(r.base_url + "/")
    with op.open(req, timeout=10) as resp:
        assert "'unsafe-eval'" in resp.headers["Content-Security-Policy"]
    with opener().open(r.base_url + "/login", timeout=10) as resp:
        assert "'unsafe-eval'" not in resp.headers["Content-Security-Policy"]


def test_solo_ignores_lan_host(data):
    cfg = core.desktop_config(data)
    cfg.host = "0.0.0.0"
    cfg.save()
    core.set_lan_admin(cfg, "admin", "관리자", PW)
    st = core.DesktopSettings(**LOCAL)
    core.prepare(cfg, st)
    r = core.ServerRunner(cfg, st).start()
    try:
        assert r.bound[0] == "127.0.0.1"
    finally:
        r.stop()


def test_stop_cleans_up(data):
    cfg = core.desktop_config(data)
    core.set_lan_admin(cfg, "admin", "관리자", PW)
    st = core.DesktopSettings(**LOCAL)
    core.prepare(cfg, st)
    r = core.ServerRunner(cfg, st).start()
    port, th = r.port, r.thread
    op = opener()
    assert login(op, r)[0] == 200
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
    core.set_lan_admin(cfg, "admin", "나", PW)
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
    core.set_lan_admin(cfg, "admin", "나", PW)
    r = core.import_json_backup(cfg, SAMPLE)
    assert r["imported"]["defects"] == 5 and not r["kept"]
    with pytest.raises(ValueError):
        core.import_json_backup(cfg, SAMPLE)                    # 기록이 있으면 묻고(replace) 나서만
    r = core.import_json_backup(cfg, SAMPLE, replace=True)
    keep = Path(r["kept"])
    assert keep.is_dir() and (keep / "qis.db").exists()          # 이전 DB 보관
    con = sqlite3.connect(str(data / "qis.db"))
    assert con.execute("SELECT COUNT(*) FROM users WHERE username='admin'").fetchone()[0] == 1   # 계정 유지
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
    core.set_lan_admin(cfg, "local", "나", PW)
    r = core.import_server_folder(cfg, tmp_path / "server")      # data 위 폴더를 골라도 찾음
    assert r["records"].get("defects") == 5 and r["files_filled"] >= 1
    assert list(cfg.files_dir.rglob("*.json"))
    st = core.DesktopSettings(**LOCAL)
    core.prepare(cfg, st)                          # 가져온 뒤: 서버판의 관리자 계정으로 로그인
    run = core.ServerRunner(cfg, st).start()
    try:
        op = opener()
        assert login(op, run)[0] == 200
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
    assert c.state == "setup" and "QIS 처음 설정" in html and "사용 방식" not in html and url is None     # 첫 실행: 처음 설정 (방식 고르기 없음)
    c.window = FakeWindow()
    yield c
    c.shutdown()


def test_controller_setup_and_switch(ctl, data):
    assert "접속 범위" in ctl.apply_setup({**SETUP, "scope": "solo"})["error"]      # 모르는 범위
    assert "8자" in ctl.apply_setup({**SETUP, "password": "short"})["error"]       # 약한 비밀번호
    r = ctl.apply_setup(SETUP)
    assert r == {"ok": True} and ctl.state == "app"
    assert ctl.runner.bound[0] == "127.0.0.1" and ctl.window.loaded[-1] == ("url", ctl.runner.enter_url)   # 이 PC만: 바로 QIS (로그인 화면)
    s = core.DesktopSettings.load(data)
    assert (s.mode, s.lan_scope, s.setup_user) == ("lan", "local", "admin")
    assert ctl.apply_setup(SETUP)["error"]                            # 설정 화면이 아닐 때는 거부 (화면에서 함부로 못 바꿈)
    ctl.m_switch_mode()
    assert ctl.state == "setup"
    html = ctl.window.loaded[-1][1]
    assert "접속 설정 바꾸기" in html and 'value="admin"' in html and "비워 두기" in html
    assert "포트" in ctl.apply_setup({**SETUP, "scope": "lan", "port": "0"})["error"]
    port = core.free_port()
    r = ctl.apply_setup({"admin": "admin", "admin_name": "", "password": "", "scope": "lan", "port": str(port)})   # 비밀번호를 비워 두면 그대로
    assert r == {"ok": True}, r
    assert ctl.runner.bound == ("0.0.0.0", port) and "접속 주소" in ctl.window.loaded[-1][1]
    assert core.desktop_config(data).port == port                     # 포트는 qis.json 에 저장
    assert login(opener(), ctl.runner)[0] == 200                      # 처음 정한 비밀번호로 로그인
    ctl.m_switch_mode()
    assert ctl.apply_setup({"admin": "nobody", "admin_name": "누구", "password": "", "scope": "local"})["error"]   # 없는 아이디 + 빈 비밀번호
    assert ctl.apply_setup({"admin": "admin", "password": "Qnew2026y", "scope": "local"}) == {"ok": True}
    assert ctl.runner.bound[0] == "127.0.0.1"
    assert login(opener(), ctl.runner)[0] == 400 and login(opener(), ctl.runner, pw="Qnew2026y")[0] == 200   # 비밀번호를 새로 정함


def test_controller_first_setup_needs_password(ctl, data):
    assert ctl.apply_setup({"admin": "admin", "admin_name": "김", "password": "", "scope": "local"})["error"]
    assert ctl.state == "setup" and core.DesktopSettings.load(data).mode == ""


def test_controller_legacy_solo_goes_through_setup_once(data):
    """예전 ‘혼자 쓰기 (로그인 없음)’: 업데이트 후 처음 열면 설정 화면 — 아이디 local · 이름이 채워져 있고, 비밀번호를 정하면 기록은 그대로."""
    from qis.desktop.gui import Controller
    cfg = core.desktop_config(data)
    core.set_lan_admin(cfg, "local", "김선중", "Old" + PW)             # 예전 자동 입장 계정 (비밀번호는 아무도 모름)
    core.import_json_backup(cfg, SAMPLE)
    core.DesktopSettings.path(data).write_text('{"mode":"solo","solo_name":"김선중"}', encoding="utf-8")
    c = Controller(data)
    c.lock.acquire()
    try:
        c.cfg, c.settings = core.desktop_config(data), core.DesktopSettings.load(data)
        html, url = c._first_screen()
        assert c.state == "setup" and url is None and 'value="local"' in html and 'value="김선중"' in html
        assert 'value=local checked' in html                           # 접속 범위는 ‘이 PC만’
        c.window = FakeWindow()
        assert c.apply_setup({"admin": "local", "admin_name": "김선중", "password": PW, "scope": "local"}) == {"ok": True}
        op = opener()
        assert login(op, c.runner, "local")[0] == 200
        con = sqlite3.connect(str(data / "qis.db"))
        assert con.execute("SELECT COUNT(*) FROM records WHERE coll='defects'").fetchone()[0] == 5
        con.close()
        assert json.loads(get(op, c.runner.base_url + "/api/boot")[1])["user"]["username"] == "local"
    finally:
        c.shutdown()


def test_controller_close_and_shutdown(ctl, data):
    assert ctl._on_closing() is True                                   # 고르는 화면: 바로 닫힘
    assert ctl.apply_setup(SETUP) == {"ok": True}
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
    core.set_lan_admin(cfg, "admin", "관리자", PW)
    core.DesktopSettings(**LOCAL).save(data)
    core.prepare(cfg, core.DesktopSettings(**LOCAL))
    run = core.ServerRunner(cfg, core.DesktopSettings(**LOCAL)).start()
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


# ---------------------------------------------------------------- 윈도우 데이터 폴더 이전 (Roaming → Local)
def _old_folder(root):
    import json as _j
    old = root / "Roaming" / "QIS"
    (old / "files").mkdir(parents=True)
    (old / "qis.db").write_bytes(b"db")
    (old / "files" / "a.json").write_text("{}", encoding="utf-8")
    (old / "qis.json").write_text(_j.dumps({"ssl_certfile": str(old / "cert" / "qis.crt"), "port": 8080,
                                            "backup_dir": "D:\\\\백업"}), encoding="utf-8")
    return old


def test_migrate_legacy_moves_and_fixes_paths(tmp_path):
    import json as _j
    from qis.desktop import paths
    old = _old_folder(tmp_path)
    new = tmp_path / "Local" / "QIS"
    assert paths.migrate_legacy(old, new) == new
    assert (new / "qis.db").read_bytes() == b"db" and (new / "files" / "a.json").exists()
    assert not old.exists()
    cfg = _j.loads((new / "qis.json").read_text(encoding="utf-8"))
    assert cfg["ssl_certfile"] == str(new / "cert" / "qis.crt") and cfg["backup_dir"] == "D:\\\\백업"
    assert "옮겼습니다" in paths.migration_note
    assert paths.migrate_legacy(old, new) == new               # 두 번째 실행: 할 일 없음


def test_migrate_legacy_copy_when_rename_fails(tmp_path, monkeypatch):
    from qis.desktop import paths
    old = _old_folder(tmp_path)
    new = tmp_path / "Local" / "QIS"
    real = os.rename

    def rename(a, b):                                           # 다른 드라이브(네트워크 리디렉션)처럼: 첫 이름 바꾸기 실패
        if Path(a) == old and Path(b) == new:
            raise OSError("cross-device")
        return real(a, b)
    monkeypatch.setattr(paths.os, "rename", rename)
    assert paths.migrate_legacy(old, new) == new
    assert (new / "qis.db").exists() and not old.exists()
    kept = list((tmp_path / "Roaming").glob("QIS_이전됨_*"))
    assert len(kept) == 1 and (kept[0] / "qis.db").exists()     # 원본은 지우지 않고 보관


def test_migrate_legacy_keeps_old_when_busy_or_new_has_data(tmp_path):
    from qis.desktop import paths
    from qis.desktop.lock import InstanceLock
    old = _old_folder(tmp_path)
    new = tmp_path / "Local" / "QIS"
    with InstanceLock(old):                                     # 예전 버전이 실행 중 → 그대로 예전 폴더
        assert paths.migrate_legacy(old, new) == old
    assert (old / "qis.db").exists() and not new.exists()
    new.mkdir(parents=True)
    (new / "desktop.json").write_text("{}", encoding="utf-8")
    assert paths.migrate_legacy(old, new) == new and (old / "qis.db").exists()   # 새 폴더에 데이터 있으면 손대지 않음


def test_migrate_legacy_failure_falls_back(tmp_path, monkeypatch):
    from qis.desktop import paths
    old = _old_folder(tmp_path)
    new = tmp_path / "Local" / "QIS"
    monkeypatch.setattr(paths.os, "rename", lambda a, b: (_ for _ in ()).throw(OSError("denied")))
    assert paths.migrate_legacy(old, new) == old and (old / "qis.db").exists()
    assert not (tmp_path / "Local" / "QIS.moving").exists() and "실패" in paths.migration_note


def test_windows_data_dir_is_local(tmp_path, monkeypatch):
    from qis.desktop import paths
    monkeypatch.delenv("QIS_DESKTOP_DIR", raising=False)
    import types
    monkeypatch.setattr(paths, "sys", types.SimpleNamespace(platform="win32"))   # 잠금(lock.py)은 실제 OS 방식 그대로
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "Local"))
    monkeypatch.setenv("APPDATA", str(tmp_path / "Roaming"))
    _old_folder(tmp_path)
    p = paths.user_data_dir()
    assert p == (tmp_path / "Local" / "QIS").resolve() and (p / "qis.db").exists()


# ---------------------------------------------------------------- 사내 서버 모드: 창 닫기 전 경고
def _wait_destroyed(w, n=60):
    import time
    for _ in range(n):
        if w.destroyed:
            return True
        time.sleep(0.05)
    return w.destroyed


def test_lan_close_warns_about_other_users(ctl, data):
    port = core.free_port()
    assert ctl.apply_setup({"scope": "lan", "admin": "admin", "admin_name": "관리자", "password": "Qadm2026x",
                            "port": str(port)}) == {"ok": True}
    db = ctl.runner.app.state.db
    uid = db.q1("SELECT id FROM users WHERE username='admin'")["id"]
    with db.tx() as c:                                          # 다른 PC(10.0.0.5)에서 방금 쓴 세션 + 이 PC 창 세션
        c.execute("INSERT INTO sessions(token_hash,user_id,created_at,last_seen,ip) VALUES('t1',?,?,?,'10.0.0.5')",
                  (uid, core.now(), core.now()))
        c.execute("INSERT INTO sessions(token_hash,user_id,created_at,last_seen,ip) VALUES('t2',?,?,?,'127.0.0.1')",
                  (uid, core.now(), core.now()))
    assert ctl._lan_others() == 1
    ctl.window.confirm = False                                  # '아니요' → 닫히지 않음
    assert ctl._on_closing() is False
    import time
    time.sleep(0.3)
    assert not ctl.window.destroyed and "다른 사용자 1명" in ctl.window.dialogs[-1]
    assert "사내 서버도 꺼져" in ctl.window.dialogs[-1]
    ctl.window.confirm = True                                   # '예' → 닫힘
    assert ctl._on_closing() is False and _wait_destroyed(ctl.window)


def test_local_scope_close_has_no_lan_warning(ctl, data):
    assert ctl.apply_setup(SETUP) == {"ok": True}
    ctl.window.confirm = False
    assert ctl._on_closing() is False and _wait_destroyed(ctl.window)
    assert not any("사내 서버" in d for d in ctl.window.dialogs)


def test_weak_admin_password_rejected(data):
    cfg = core.desktop_config(data)
    with pytest.raises(AuthError):
        core.set_lan_admin(cfg, "admin", "김", "1234")


def test_login_page_prefills_only_for_one_user_in_local_window(data):
    cfg, r = local_runner(data)
    try:
        op = opener()
        assert 'id="qisOneUser"' in get(op, r.enter_url)[1]
        db = r.app.state.db
        from qis.auth import Auth
        Auth(db, r.cfg).create_user("kim", "김", "editor", "Edit2026pwx", must_change=False)
        assert 'id="qisOneUser"' not in get(opener(), r.enter_url)[1]      # 계정이 두 개면 채우지 않음
    finally:
        r.stop()


# ---------------------------------------------------------------- 접속 범위: Tailscale 만
def _own_ip():
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            ip = s.getsockname()[0]
    except OSError:
        return ""
    return "" if ip.startswith("127.") else ip


def test_tailscale_ip_range():
    assert core.is_tailscale_ip("100.64.0.1") and core.is_tailscale_ip("100.127.255.254")
    assert not core.is_tailscale_ip("100.63.0.1") and not core.is_tailscale_ip("100.128.0.1")
    assert not core.is_tailscale_ip("192.168.0.5") and not core.is_tailscale_ip("")
    assert core.tailscale_ip() == "" or core.is_tailscale_ip(core.tailscale_ip())


def test_lan_scope_saved(data):
    st = core.DesktopSettings(mode="lan", lan_scope="tailscale")
    st.save(data)
    assert core.DesktopSettings.load(data).lan_scope == "tailscale"
    (data / "desktop.json").write_text('{"mode":"lan","lan_scope":"everything"}', encoding="utf-8")
    assert core.DesktopSettings.load(data).lan_scope == "lan"     # 모르는 값은 기본으로


def test_tailscale_scope_without_tailscale(data, monkeypatch):
    """Tailscale 이 없으면 이 PC 에서만 열림 — 사내망으로 새지 않음."""
    monkeypatch.setattr(core, "tailscale_ip", lambda: "")
    cfg = core.desktop_config(data)
    cfg.port = core.free_port()
    st = core.DesktopSettings(mode="lan", lan_scope="tailscale")
    core.set_lan_admin(cfg, "admin", "관리자", "Qadm2026x")
    core.prepare(cfg, st)
    r = core.ServerRunner(cfg, st).start()
    try:
        assert r.bound == ("127.0.0.1", cfg.port) and r.ts_ip == "" and len(r.socks) == 1
        assert get(opener(), r.base_url + "/healthz")[0] == 200
        ip = _own_ip()
        if ip:
            with pytest.raises(OSError):
                get(opener(), f"http://{ip}:{r.port}/healthz")   # 사내 IP 로는 연결 거부
    finally:
        r.stop()
    assert "찾지 못했습니다" in pages.lan_info_page([], cfg.port, True, tailscale=True)


def test_tailscale_scope_binds_only_that_address(data, monkeypatch):
    """Tailscale 주소(시험에서는 이 PC 의 실제 주소로 대신)와 127.0.0.1 두 곳에만 열림."""
    ip = _own_ip()
    if not ip:
        pytest.skip("네트워크 주소 없음")
    monkeypatch.setattr(core, "tailscale_ip", lambda: ip)
    cfg = core.desktop_config(data)
    cfg.port = core.free_port()
    st = core.DesktopSettings(mode="lan", lan_scope="tailscale")
    core.set_lan_admin(cfg, "admin", "관리자", "Qadm2026x")
    core.prepare(cfg, st)
    r = core.ServerRunner(cfg, st).start()
    try:
        assert r.ts_ip == ip and sorted(s.getsockname()[0] for s in r.socks) == sorted(["127.0.0.1", ip])
        assert get(opener(), r.base_url + "/healthz")[0] == 200
        assert get(opener(), f"http://{ip}:{r.port}/healthz")[0] == 200
    finally:
        r.stop()
    h = pages.lan_info_page([f"http://{ip}:{cfg.port}"], cfg.port, True, tailscale=True)
    assert "remoteip=100.64.0.0/10" in h and ip in h


def test_report_window_can_close(monkeypatch):
    """보고서 창: '닫기' 단추가 부르는 close_report 가 그 창을 닫음 (macOS 에서 window.close() 가 듣지 않음)."""
    import sys, time, types
    from qis.desktop import gui

    made = []

    class Win:
        def __init__(self):
            self.destroyed = 0

        def destroy(self):
            self.destroyed += 1

    def create_window(title, **kw):
        w = Win()
        made.append((title, kw, w))
        return w

    monkeypatch.setitem(sys.modules, "webview", types.SimpleNamespace(create_window=create_window))
    gui.Controller.open_report(types.SimpleNamespace(), "<html><body>보고서</body></html>")
    title, kw, w = made[0]
    api = kw["js_api"]
    assert title == "QIS 보고서" and isinstance(api, gui.ReportApi) and api._win is w
    assert [n for n in dir(api) if not n.startswith("_")] == ["close_report"]     # 화면에 보이는 메서드는 닫기뿐
    api.close_report()
    for _ in range(40):
        if w.destroyed:
            break
        time.sleep(0.02)
    assert w.destroyed == 1
    gui.ReportApi().close_report()                                               # 창이 없으면 아무 것도 하지 않음


# ---- 첨부 저장: 확장자를 지킴 (2026-11 — 이름만 바꿔 저장하면 확장자가 빠져서 파일이 안 열리던 문제) ----
def _b64(b: bytes, mime: str) -> str:
    import base64
    return f"data:{mime};base64," + base64.b64encode(b).decode()


def test_save_file_tells_the_dialog_the_file_type(tmp_path):
    from qis.desktop import attach
    seen = {}

    def ask(name, types=()):
        seen["name"], seen["types"] = name, tuple(types)
        return tmp_path / name

    msg = attach.save_file(ask, "회의자료.pptx", _b64(b"PK", "application/vnd.openxmlformats-officedocument.presentationml.presentation"))
    assert seen["name"] == "회의자료.pptx"
    assert seen["types"] == ("PPTX 파일 (*.pptx)", "모든 파일 (*.*)")
    assert (tmp_path / "회의자료.pptx").read_bytes() == b"PK" and "회의자료.pptx" in msg


def test_save_file_puts_the_extension_back_when_the_user_drops_it(tmp_path):
    """저장 창에서 이름을 새로 쓰면서 확장자를 빼도 원래 확장자로 저장한다."""
    from qis.desktop import attach
    cases = [("성적서.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "새이름", "새이름.xlsx"),
             ("RE_ 회의.eml", "message/rfc822", "메일", "메일.eml"),
             ("image.jpg", "image/jpeg", "고품확인", "고품확인.jpg"),
             ("image.jpg", "image/jpeg", "사진.jpeg", "사진.jpeg"),            # 같은 형식은 그대로
             ("보고.pptx", "application/octet-stream", "보고 v1.2", "보고 v1.2.pptx"),   # 이름 안의 점은 확장자가 아님
             ("자료.pdf", "application/pdf", "자료.PDF", "자료.PDF")]            # 대소문자만 다르면 그대로
    for name, mime, typed, want in cases:
        msg = attach.save_file(lambda n, t=(): tmp_path / typed, name, _b64(b"x", mime))
        assert (tmp_path / want).exists(), (typed, want, msg)
        (tmp_path / want).unlink()


def test_save_file_finds_the_extension_from_the_content_when_the_name_has_none(tmp_path):
    from qis.desktop import attach
    assert attach.save_name("image", _b64(b"x", "image/png")) == ("image.png", ".png")
    assert attach.save_name("메일", _b64(b"x", "message/rfc822")) == ("메일.eml", ".eml")
    assert attach.save_name("메일", _b64(b"x", "application/vnd.ms-outlook")) == ("메일.msg", ".msg")
    assert attach.save_name("이름없음", _b64(b"x", "application/octet-stream")) == ("이름없음", "")      # 모르는 형식은 그대로
    seen = {}
    attach.save_file(lambda n, t=(): seen.update(n=n, t=t) or (tmp_path / n), "image", _b64(b"x", "image/png"))
    assert seen["n"] == "image.png" and seen["t"][0] == "PNG 파일 (*.png)" and (tmp_path / "image.png").exists()


def test_save_file_does_not_overwrite_when_it_adds_the_extension(tmp_path):
    """확장자를 붙인 이름의 파일이 이미 있으면 (저장 창은 그 이름을 묻지 않았으므로) 덮어쓰지 않는다."""
    from qis.desktop import attach
    (tmp_path / "새이름.xlsx").write_bytes(b"old")
    attach.save_file(lambda n, t=(): tmp_path / "새이름", "성적서.xlsx", _b64(b"new", "application/octet-stream"))
    assert (tmp_path / "새이름.xlsx").read_bytes() == b"old"
    assert (tmp_path / "새이름 (1).xlsx").read_bytes() == b"new"


def test_save_dialog_file_types_have_the_format_the_window_library_accepts():
    """pywebview 는 '설명 (*.확장자)' 형식만 받는다 — 형식이 틀리면 저장 창이 열리지 않는다."""
    import re
    from qis.desktop import attach
    pat = re.compile(r"^([\w ]+)\((\*(?:\.(?:\w+|\*))*(?:;\*\.\w+)*)\)$")
    for ext in sorted(set(attach.SAVE_MIME_EXT.values()) | {".msg", ".eml", ".hwpx", ".xlsm"}):
        assert pat.match(f"{ext[1:].upper()} 파일 (*{ext})"), ext
    assert pat.match("모든 파일 (*.*)")


# ---------------------------------------------------------------- 저장 위치: 데이터 폴더 · 자동 백업 폴더
def test_risky_folder_detects_network_and_sync_folders():
    for p in (r"\\nas\품질\QIS", "C:\\Users\\a\\OneDrive - 회사\\QIS", "/Users/a/Library/CloudStorage/OneDrive-x/QIS", "/Users/a/Dropbox/q"):
        assert core.risky_folder(Path(p) if p.startswith("/") else p), p
    for p in ("D:\\QIS_데이터", "/home/a/QIS", "/Users/a/Documents/QIS"):
        assert core.risky_folder(p) == "", p


def test_pointer_roundtrip(data, tmp_path):
    assert core.read_pointer(data) is None
    core.write_pointer(data, tmp_path / "다른곳")
    assert core.read_pointer(data) == tmp_path / "다른곳"
    core.write_pointer(data, data)                               # 기본 폴더로 되돌리면 표지를 지움
    assert core.read_pointer(data) is None and not (data / core.POINTER).exists()
    (data / core.POINTER).write_text("{broken", encoding="utf-8")
    assert core.read_pointer(data) is None                       # 깨진 표지는 없는 것으로


def test_set_backup_dir(data, tmp_path):
    cfg = core.desktop_config(data)
    assert cfg.backup_path == data / "backup"
    with pytest.raises(core.StorageError):
        core.set_backup_dir(cfg, data)                           # 데이터 폴더 자체는 안 됨
    with pytest.raises(core.StorageError):
        core.set_backup_dir(cfg, data.parent)                    # 데이터 폴더를 품은 폴더도 안 됨
    nas = tmp_path / "nas" / "QIS_백업"
    assert core.set_backup_dir(cfg, nas) == nas and nas.is_dir()
    assert core.desktop_config(data).backup_path == nas          # qis.json 에 저장됨
    core.set_backup_dir(cfg, data / "backup")                    # 기본 위치로 되돌리면 값을 비움
    assert core.desktop_config(data).backup_dir == ""


def test_copy_data_dir(data, tmp_path):
    cfg, r = local_runner(data)
    op = opener()
    assert login(op, r)[0] == 200
    H = {"Content-Type": "application/json", "X-QIS": "1"}
    get(op, r.base_url + "/api/sync", data=json.dumps({"since": 0, "changes": [
        {"coll": "suppliers", "id": "s1", "rev": 0, "data": {"id": "s1", "name": "가나"}}]}).encode(), headers=H)
    get(op, r.base_url + "/api/files/put", data=json.dumps({"files": [
        {"id": "ph1", "name": "a.png", "data": "data:image/png;base64,AAAA"}]}).encode(), headers=H)
    r.stop()
    (data / "webview").mkdir()
    (data / "webview" / "cookie").write_text("x")
    (data / "restore_before_20260101_000000").mkdir()
    new = tmp_path / "D" / "QIS_데이터"
    res = core.copy_data_dir(data, new)
    assert res["files"] == 1 and (new / "qis.db").is_file() and list((new / "files").rglob("ph1.json"))
    assert not (new / "webview").exists() and not (new / "restore_before_20260101_000000").exists()   # 창 저장소 · 보관본은 복사하지 않음
    assert (data / "qis.db").is_file() and (data / core.OLD_NOTE).is_file()                             # 예전 폴더는 그대로 + 안내 파일
    con = sqlite3.connect(str(new / "qis.db"))
    assert con.execute("SELECT COUNT(*) FROM records WHERE coll='suppliers'").fetchone()[0] == 1
    assert con.execute("SELECT COUNT(*) FROM users WHERE username='admin'").fetchone()[0] == 1
    con.close()
    with pytest.raises(core.StorageError):
        core.copy_data_dir(data, new)                            # 이미 QIS 데이터가 있는 폴더: 덮어쓰지 않음
    busy = tmp_path / "busy"
    busy.mkdir()
    (busy / "다른파일.txt").write_text("x")
    with pytest.raises(core.StorageError):
        core.copy_data_dir(data, busy)                           # 빈 폴더가 아님
    with pytest.raises(core.StorageError):
        core.copy_data_dir(data, data / "안쪽")                  # 데이터 폴더의 안쪽


def test_copy_data_dir_failure_leaves_nothing_behind(data, tmp_path, monkeypatch):
    cfg = core.desktop_config(data)
    core.set_lan_admin(cfg, "admin", "관리자", PW)
    from qis.db import SqliteDB
    monkeypatch.setattr(SqliteDB, "check_file", staticmethod(lambda p: "깨짐"))
    new = tmp_path / "new"
    with pytest.raises(core.StorageError):
        core.copy_data_dir(data, new)
    assert not has_any(new) and (data / "qis.db").is_file() and not (data / core.OLD_NOTE).exists()


def has_any(p):
    return p.exists() and any(p.iterdir())


def test_controller_storage_backup_folder(ctl, data, tmp_path):
    assert ctl.apply_setup(SETUP) == {"ok": True}
    assert ctl.apply_storage("pick_backup")["error"]             # 저장 위치 화면이 아닐 때는 거부
    ctl.m_storage()
    html = ctl.window.loaded[-1][1]
    assert ctl.state == "storage" and "저장 위치" in html and "같은 디스크" in html and str(data) in html
    nas = tmp_path / "nas" / "QIS_백업"
    ctl._pick_folder = lambda start=None: nas
    assert ctl.apply_storage("pick_backup") == {"ok": True}
    assert str(nas) in ctl.window.loaded[-1][1] and core.desktop_config(data).backup_path == nas
    assert ctl.apply_storage("backup_now") == {"ok": True}       # 켜져 있는 서버가 바로 새 폴더에 백업
    assert list((nas / "db").glob("qis_*.sqlite")) and not (data / "backup" / "db").exists()
    ctl._pick_folder = lambda start=None: data                   # 데이터 폴더를 고르면 거부하고 그대로
    ctl.apply_storage("pick_backup")
    assert "다른 폴더" in ctl.window.loaded[-1][1] and core.desktop_config(data).backup_path == nas
    ctl.api.go_app()
    assert ctl.state == "app"


def test_controller_move_data_folder(ctl, data, tmp_path):
    from qis.desktop.gui import Controller
    assert ctl.apply_setup(SETUP) == {"ok": True}
    op = opener()
    assert login(op, ctl.runner)[0] == 200
    get(op, ctl.runner.base_url + "/api/sync", data=json.dumps({"since": 0, "changes": [
        {"coll": "parts", "id": "p1", "rev": 0, "data": {"id": "p1", "partNo": "A-1"}}]}).encode(),
        headers={"Content-Type": "application/json", "X-QIS": "1"})
    ctl.m_storage()
    assert "옮길 수 없습니다" in ctl.window.loaded[-1][1] and "폴더 옮기기" not in ctl.window.loaded[-1][1]   # --data 로 연 경우
    ctl.home = data                                              # 기본 폴더로 연 경우
    ctl.m_storage()
    assert "폴더 옮기기" in ctl.window.loaded[-1][1]
    bad = tmp_path / "busy"
    bad.mkdir()
    (bad / "x.txt").write_text("x")
    ctl._pick_folder = lambda start=None: bad                    # 실패: 예전 폴더로 서버를 다시 켬
    ctl.apply_storage("move_data")
    assert ctl.runner and ctl.runner.running and ctl.state == "app" and not ctl.window.destroyed
    assert core.read_pointer(data) is None and "옮기지 못했습니다" in ctl.window.dialogs[-1]
    new = tmp_path / "D" / "QIS_데이터"
    ctl.m_storage()
    ctl.window.confirm = False                                   # 확인 창에서 ‘아니요’ → 아무 일도 없음
    ctl._pick_folder = lambda start=None: new
    ctl.apply_storage("move_data")
    assert ctl.runner.running and not new.exists()
    ctl.window.confirm = True
    ctl.apply_storage("move_data")
    assert ctl.window.destroyed and ctl.runner is None and core.read_pointer(data) == new
    assert "다시 열어 주세요" in ctl.window.dialogs[-1] and (data / "qis.db").is_file()
    ctl.shutdown()
    # 다시 열면 새 폴더로
    import qis.desktop.gui as gui
    orig = gui.user_data_dir
    gui.user_data_dir = lambda: data
    try:
        c2 = Controller()
        assert c2.data_dir == new and c2.missing_data is None
        c2.lock.acquire()
        c2.cfg, c2.settings = core.desktop_config(c2.data_dir), core.DesktopSettings.load(c2.data_dir)
        _, url = c2._first_screen()
        try:
            assert url and c2.state == "app"                     # 설정 · 계정이 그대로 — 처음 설정 화면이 아님
            op = opener()
            assert login(op, c2.runner)[0] == 200
            con = sqlite3.connect(str(new / "qis.db"))
            assert con.execute("SELECT COUNT(*) FROM records WHERE coll='parts'").fetchone()[0] == 1
            con.close()
        finally:
            c2.shutdown()
        import shutil
        shutil.rmtree(new)                                       # 옮긴 폴더가 사라짐 (외장 디스크 분리)
        c3 = Controller()
        assert c3.missing_data == new and c3.data_dir == data    # 기본 폴더로 조용히 열지 않고 안내
    finally:
        gui.user_data_dir = orig


def test_controller_move_to_folder_that_has_data(ctl, data, tmp_path):
    assert ctl.apply_setup(SETUP) == {"ok": True}
    other = tmp_path / "other"
    other.mkdir()
    core.set_lan_admin(core.desktop_config(other), "admin", "다른", PW)
    ctl.home = data
    ctl.m_storage()
    ctl._pick_folder = lambda start=None: other
    ctl.apply_storage("move_data")
    assert ctl.window.destroyed and core.read_pointer(data) == other
    assert "이미 있습니다" in ctl.window.dialogs[-2] and not (other / "files").exists()   # 복사하지 않음
