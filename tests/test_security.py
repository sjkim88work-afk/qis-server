"""보안 보강 시험 (2026-11 점검 후속): python -m pytest -q tests/test_security.py

· 데스크톱 다리: 첨부 '열어보기'는 보기 전용 형식만, QIS 밖의 페이지가 창에 뜨면 다리 거부 · 되돌림
· 로그인: 한 접속 주소(IP)에서 실패가 많으면 그 주소 차단
· 혼자 쓰기: 쿠키는 프로그램을 닫으면 사라짐, 지난 실행의 세션은 시작할 때 끝냄
· 화면: 클릭 코드(onclick) 안의 글자는 jsq() 로
"""
import base64
import re
import threading
import urllib.request
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from qis.app import create_app
from qis.auth import Auth, AuthError
from qis.config import Config
from qis.db import open_db
from qis.desktop import core, gui

WEB = Path(__file__).parent.parent / "qis" / "web"
PDF = "data:application/pdf;base64," + base64.b64encode(b"%PDF-1.4 test").decode()
PNG = "data:image/png;base64,iVBORw0KGgo="
BAT = "data:application/octet-stream;base64," + base64.b64encode(b"@echo off\r\ncalc\r\n").decode()
HTML = "data:text/html;base64," + base64.b64encode(b"<script>alert(1)</script>").decode()


# ---------------------------------------------------------------- 첨부 열어보기
@pytest.mark.parametrize("name,data,want", [
    ("검사성적서.pdf", PDF, "검사성적서.pdf"),
    ("사진.PNG", PNG, "사진.PNG"),
    ("첨부", PDF, "첨부.pdf"),                       # 확장자 없음 → 형식으로 붙임
    ("evil.bat", PNG, "evil.png"),                   # 실행 확장자는 버리고 보기 형식으로
    ("run.command", PDF, "run.pdf"),
    ("evil.bat", BAT, None),                         # 실행 파일 → 열지 않음
    ("x.exe", "data:application/x-msdownload;base64,TVo=", None),
    ("page", HTML, None),                            # html 은 브라우저에서 스크립트가 돌 수 있어 제외
    ("매크로.xlsm", "data:application/vnd.ms-excel.sheet.macroEnabled.12;base64,UEs=", None),
    ("../../etc/x.pdf", PDF, "_.._etc_x.pdf"),       # 경로 문자 · 앞 점 제거
])
def test_open_name(name, data, want):
    assert gui.open_name(name, data) == want


class Ev:
    def __init__(self, on=True):
        self._e = threading.Event()
        if on:
            self._e.set()
        self.items = []

    def is_set(self):
        return self._e.is_set()

    def __iadd__(self, f):
        self.items.append(f)
        return self

    def fire(self):
        for f in self.items:
            f()


class Events:
    def __init__(self):
        self.loaded, self.closed, self.closing = Ev(), Ev(False), Ev(False)


class Win:
    def __init__(self, url=None):
        self.url, self.events, self.loaded_urls, self.saved = url, Events(), [], []

    def get_current_url(self):
        return self.url

    def load_url(self, u):
        self.loaded_urls.append(u)
        self.url = u

    def load_html(self, h):
        self.loaded_urls.append("html")
        self.url = None

    def create_file_dialog(self, *a, **k):
        self.saved.append(k.get("save_filename"))
        return None                                   # 사용자가 저장 창에서 취소

    def create_confirmation_dialog(self, *a):
        return True


@pytest.fixture()
def app_ctl(tmp_path, monkeypatch):
    c = gui.Controller(tmp_path / "QIS")
    c.cfg = core.desktop_config(c.data_dir)
    c.settings = core.DesktopSettings(mode="solo", solo_name="김선중")
    c.settings.save(c.data_dir)
    c.lock.acquire()
    c._start_server()
    c.window = Win(c.runner.base_url + "/")
    c._watch(c.window, main=True)
    opened = []
    monkeypatch.setattr(core, "open_in_os", lambda p: opened.append(Path(p)))
    monkeypatch.setattr(gui.tempfile, "gettempdir", lambda: str(tmp_path / "tmp"))
    (tmp_path / "tmp").mkdir()
    c._ask_save = lambda name, types=(): (c.window.saved.append(name), None)[1]   # 저장 창: 사용자가 취소 (CI엔 pywebview 없음)
    c._opened = opened
    yield c
    c.shutdown()


def test_open_file_only_viewable(app_ctl):
    c = app_ctl
    assert c.api.open_file("성적서", PDF) is None
    assert [p.name for p in c._opened] == ["성적서.pdf"] and c._opened[0].read_bytes().startswith(b"%PDF")
    # 실행 파일: 열지 않고 저장 창으로 (취소)
    assert c.api.open_file("setup.bat", BAT) is None
    assert len(c._opened) == 1 and c.window.saved == ["setup.bat"]
    assert not list(Path(c._opened[0]).parent.glob("*.bat"))


def test_bridge_refused_on_foreign_page(app_ctl):
    c = app_ctl
    assert c.api.reenter() == c.runner.enter_url                     # QIS 화면: 정상
    c.window.url = "https://evil.example/page"                       # 창이 QIS 밖으로 이동한 상태
    assert c.api.reenter() is None                                    # 자동 입장 열쇠를 넘기지 않음
    assert c.api.open_file("a.pdf", PDF) is None and not c._opened    # 파일 실행 안 함
    assert c.api.save_file("a.pdf", PDF) is None and not c.window.saved
    old = c.runner.base_url
    c.runner.stop()
    c._start_server()                                                 # 복원 등으로 서버를 다시 켬 (포트 바뀜)
    assert c.runner.base_url != old
    c.window.url = old + "/"                                          # 예전 포트에 남은 창도 이 프로그램 것
    assert c.api.reenter() == c.runner.enter_url
    c.window.url = "http://127.0.0.1:1/"                              # 같은 PC라도 다른 포트는 남의 것
    assert c.api.reenter() is None
    c.window.url = None                                               # 프로그램이 직접 그린 화면
    assert c.api.reenter() == c.runner.enter_url


def test_foreign_navigation_bounced(app_ctl):
    c = app_ctl
    c.window.url = "https://evil.example/"
    c.window.events.loaded.fire()
    assert c.window.loaded_urls[-1] == c.runner.enter_url             # QIS 화면으로 되돌림
    w = Win("http://example.com/")
    c._watch(w)
    w.events.loaded.fire()
    assert w.loaded_urls[-1] == c.runner.base_url + "/"
    n = len(c.window.loaded_urls)
    c.window.url = c.runner.base_url + "/admin"
    c.window.events.loaded.fire()
    assert len(c.window.loaded_urls) == n                             # QIS 안의 이동은 그대로


def test_trusted_url(app_ctl):
    c, b = app_ctl, app_ctl.runner.base_url
    for u in (None, "", "about:blank", "data:text/html,x", "file:///Applications/QIS.app/", b, b + "/admin?x=1"):
        assert c._trusted_url(u), u
    for u in ("https://evil.example/", b + ".evil.example/", b.replace("127.0.0.1", "localhost") + "/",
              "http://127.0.0.1:1/"):
        assert not c._trusted_url(u), u


# ---------------------------------------------------------------- 로그인: IP 차단
@pytest.fixture()
def auth(tmp_path):
    cfg = Config()
    cfg.data_dir = tmp_path / "data"
    cfg.data_dir.mkdir()
    db = open_db(cfg)
    a = Auth(db, cfg)
    for i in range(6):
        a.create_user(f"u{i}", f"사용자{i}", "editor", "Qpass2026x", must_change=False)
    yield a, cfg
    db.close()


def test_ip_block_after_spraying(auth):
    a, cfg = auth
    limit = cfg.login_max_fail * Auth.IP_FAIL_FACTOR
    n = 0
    for i in range(limit):            # 여러 아이디를 돌아가며 (계정 잠금은 피하면서) 비밀번호 맞춰 보기
        with pytest.raises(AuthError) as e:
            a.login(f"u{i % 6}" if i % 7 else "nobody", "Wrong12345", ip="10.0.0.9")
        n += 1
        assert e.value.code in ("bad_login", "locked")
    with pytest.raises(AuthError) as e:
        a.login("u0", "Qpass2026x", ip="10.0.0.9")              # 맞는 비밀번호여도 이 주소는 잠시 차단
    assert e.value.code == "ip_locked"
    tok, u = a.login("u5", "Qpass2026x", ip="10.0.0.10")      # 다른 주소는 그대로
    assert tok and u["username"] == "u5"


def test_ip_block_expires(auth, monkeypatch):
    a, cfg = auth
    now = [1000.0]
    monkeypatch.setattr("qis.auth.time.monotonic", lambda: now[0])
    for _ in range(cfg.login_max_fail * Auth.IP_FAIL_FACTOR):
        with pytest.raises(AuthError):
            a.login("nobody", "x", ip="10.0.0.9")
    with pytest.raises(AuthError):
        a.login("u1", "Qpass2026x", ip="10.0.0.9")
    now[0] += cfg.login_lock_minutes * 60 + 1
    assert a.login("u1", "Qpass2026x", ip="10.0.0.9")[0]


def test_ip_block_api(tmp_path):
    cfg = Config()
    cfg.data_dir = tmp_path / "data"
    cfg.data_dir.mkdir()
    db = open_db(cfg)
    Auth(db, cfg).create_user("admin", "관리자", "admin", "Qadm2026x", must_change=False)
    db.close()
    c = TestClient(create_app(cfg, start_backup=False))
    H = {"X-QIS": "1"}
    for i in range(cfg.login_max_fail * Auth.IP_FAIL_FACTOR):
        c.post("/api/login", json={"username": f"x{i}", "password": "nope"}, headers=H)
    r = c.post("/api/login", json={"username": "admin", "password": "Qadm2026x"}, headers=H)
    assert r.status_code == 400 and r.json()["error"] == "ip_locked"


# ---------------------------------------------------------------- 혼자 쓰기 세션
def test_solo_cookie_not_persistent_and_old_sessions_end(tmp_path):
    data = tmp_path / "QIS"
    data.mkdir()
    cfg = core.desktop_config(data)
    st = core.DesktopSettings(mode="solo", solo_name="김선중")
    core.prepare(cfg, st)
    r = core.ServerRunner(cfg, st).start()
    try:
        assert r.cfg.session_hours == 24
        op = urllib.request.build_opener(NoRedirect)
        try:
            op.open(r.enter_url, timeout=10)
        except urllib.error.HTTPError as e:
            cookies = e.headers.get_all("set-cookie")
        sid = [x for x in cookies if x.startswith("qis_sid=")][0]
        assert "max-age" not in sid.lower() and "expires" not in sid.lower()   # 닫으면 사라지는 쿠키
        assert "httponly" in sid.lower() and "samesite=strict" in sid.lower()
    finally:
        r.stop()
    db = open_db(cfg)
    try:
        assert db.q1("SELECT COUNT(*) n FROM sessions")["n"] == 1
    finally:
        db.close()
    core.prepare(cfg, st)                                     # 다음 실행
    db = open_db(cfg)
    try:
        assert db.q1("SELECT COUNT(*) n FROM sessions")["n"] == 0
    finally:
        db.close()
    core.set_lan_admin(cfg, "admin", "관리자", "Qadm2026x")
    core.prepare(cfg, core.DesktopSettings(mode="lan"))         # 사내 서버로 바꿔도 local 세션은 없음
    db = open_db(cfg)
    try:
        assert db.q1("SELECT COUNT(*) n FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.username='local'")["n"] == 0
    finally:
        db.close()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def test_lan_cookie_capped(tmp_path):
    cfg = Config()
    cfg.data_dir = tmp_path / "data"
    cfg.data_dir.mkdir()
    cfg.session_hours = 24 * 365
    db = open_db(cfg)
    Auth(db, cfg).create_user("admin", "관리자", "admin", "Qadm2026x", must_change=False)
    db.close()
    c = TestClient(create_app(cfg, start_backup=False))
    r = c.post("/api/login", json={"username": "admin", "password": "Qadm2026x"}, headers={"X-QIS": "1"})
    m = re.search(r"max-age=(\d+)", r.headers["set-cookie"], re.I)
    assert m and int(m.group(1)) == 30 * 24 * 3600


# ---------------------------------------------------------------- 화면: onclick 안의 글자
def test_no_html_escape_inside_js_handlers():
    """onclick="f('${esc(x)}')" 는 브라우저가 &#39; 를 ' 로 되돌려 코드가 끼어들 수 있음 → jsq(x) 를 써야 함."""
    bad = []
    for f in WEB.glob("*.html"):
        s = f.read_text(encoding="utf-8")
        for m in re.finditer(r'on[a-z]+="[^"]*\'\$\{esc\(', s):
            bad.append(f"{f.name}:{s.count(chr(10), 0, m.start()) + 1}")
    assert not bad, bad


def test_lan_info_warns_on_http():
    from qis.desktop import pages
    assert "암호화되지 않은" in pages.lan_info_page(["http://pc:8080"], 8080, True)
    assert "암호화되지 않은" not in pages.lan_info_page(["https://pc:8080"], 8080, True, https=True)
