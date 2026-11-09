"""새 버전 확인 — latest.json 읽기 · 하루 한 번 · 실패 조용히 · API · 화면 정보"""
import json
from fastapi.testclient import TestClient

from qis import __version__
from qis.app import create_app
from qis.config import Config
from qis.update import Updater, vtuple

H = {"x-qis": "1"}


def mk(tmp_path, fetch):
    cfg = Config(data_dir=tmp_path / "data")
    app = create_app(cfg, start_backup=False)
    app.state.auth.create_user("admin", "관리자", "admin", "Qadm2026x", must_change=False)
    app.state.updater = Updater(app.state.db, cfg, fetch=fetch)
    c = TestClient(app)
    assert c.post("/api/login", json={"username": "admin", "password": "Qadm2026x"}, headers=H).status_code == 200
    return app, c


def test_vtuple():
    assert vtuple("1.3.9") > vtuple("1.3.8") and vtuple("v1.10.0") > vtuple("1.9.9") and vtuple("") == (0,)


def test_check_once_a_day_and_status(tmp_path):
    calls = []
    def fetch(url):
        calls.append(url)
        return {"version": "9.9.9", "build": "2030-01-01", "page": "https://example.com/r", "notes": "고침", "assets": {"windows": "https://example.com/w.zip"}}
    app, c = mk(tmp_path, fetch)
    assert c.get("/api/update").json() == {"available": False}        # 아직 확인 전
    r = c.post("/api/admin/update/check", headers=H).json()
    assert r["available"] and r["latest"]["version"] == "9.9.9" and r["current"] == __version__ and calls == [app.state.cfg.update_url]
    app.state.updater.check()                                         # 하루 안: 다시 안 읽음
    assert len(calls) == 1
    app.state.updater.check(force=True)
    assert len(calls) == 2
    assert c.get("/api/update").json() == {"available": True, "version": "9.9.9", "page": "https://example.com/r"}
    assert '"update": {"available": true' in c.get("/").text.replace("\n", "")
    # 같은 버전이면 available=False
    def fetch2(url): return {"version": __version__, "build": "2026-01-01"}
    app.state.updater._fetch = fetch2
    assert not app.state.updater.check(force=True)["available"]


def test_check_failure_is_quiet(tmp_path):
    def fetch(url): raise OSError("no network")
    app, c = mk(tmp_path, fetch)
    r = c.post("/api/admin/update/check", headers=H).json()
    assert not r["available"] and "no network" in r["error"] and r["checked_at"]
    assert c.get("/api/update").json() == {"available": False}
    def fetch3(url): return {"nope": 1}
    app.state.updater._fetch = fetch3
    assert "형식" in app.state.updater.check(force=True)["error"]


def test_disabled_by_config(tmp_path):
    calls = []
    def fetch(url): calls.append(1); return {"version": "9.9.9"}
    app, c = mk(tmp_path, fetch)
    app.state.cfg.update_check = False
    app.state.updater.check()
    assert not calls                                                   # 자동은 안 함
    assert app.state.updater.check(force=True)["available"] and len(calls) == 1   # 손으로 누르면 됨
    assert not app.state.updater.status()["enabled"]
