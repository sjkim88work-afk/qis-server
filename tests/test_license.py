"""라이선스 — 서명 검증 · PC 코드 · 평가판 · 읽기 전용 · 유지보수 만료 · 동시 사용자 · 관리 API · 발급 도구"""
import json
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from qis import ed25519
from qis import license as L
from qis.app import create_app
from qis.config import Config

H = {"x-qis": "1"}
SK, PK = ed25519.generate_keypair()
PKH = PK.hex()
D0 = date(2026, 11, 10)


def mk_app(tmp_path, **lic_kw):
    cfg = Config(data_dir=tmp_path / "data")
    app = create_app(cfg, start_backup=False)
    app.state.auth.create_user("admin", "관리자", "admin", "Qadm2026x", must_change=False)
    app.state.auth.create_user("kim", "김", "editor", "Pass2026kx", must_change=False)
    app.state.auth.create_user("lee", "이", "editor", "Pass2026lx", must_change=False)
    # 시험용 키 · 날짜로 바꿔 끼움
    app.state.license = L.License(app.state.db, cfg.data_dir, pubkey=PKH, build=lic_kw.get("build", "2026-11-10"), today=lambda: app.state._today)
    app.state._today = lic_kw.get("today", D0)
    app.state.auth.user_limit = lambda: app.state.license.user_limit
    return app, cfg


def login(app, u, p):
    c = TestClient(app)
    r = c.post("/api/login", json={"username": u, "password": p}, headers=H)
    assert r.status_code == 200, r.text
    return c


def lic(tmp_path, **kw):
    me = L.machine_code(tmp_path / "data")
    kw.setdefault("machines", [me])
    kw.setdefault("id", "L-TEST-1"); kw.setdefault("customer", "시험회사"); kw.setdefault("seats", 2)
    kw.setdefault("maintenance_until", "2027-11-09")
    return L.issue(SK, **kw)


# ---------------------------------------------------------------- 형식 · 서명
def test_encode_decode_and_tamper(tmp_path):
    t = lic(tmp_path)
    p = L.decode(t, PKH)
    assert p["customer"] == "시험회사" and p["seats"] == 2 and L._BEGIN in t
    with pytest.raises(L.LicenseError, match="서명"):
        L.decode(t, ed25519.generate_keypair()[1].hex())          # 다른 키
    body, sig = t.split(L._BEGIN)[1].split(L._END)[0].replace("\n", "").split(".")
    import base64
    j = json.loads(base64.b64decode(body)); j["seats"] = 99
    forged = base64.b64encode(json.dumps(j, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).decode() + "." + sig
    with pytest.raises(L.LicenseError, match="서명"):
        L.decode(forged, PKH)
    with pytest.raises(L.LicenseError):
        L.decode("hello", PKH)


def test_machine_code_stable_and_format(tmp_path):
    a, b = L.machine_code(tmp_path), L.machine_code(tmp_path)
    assert a == b and len(a) == 19 and a.count("-") == 3 and L.norm_code(a.lower().replace("-", " ")) == L.norm_code(a)


# ---------------------------------------------------------------- 상태 흐름
def test_trial_then_readonly_then_install(tmp_path):
    app, cfg = mk_app(tmp_path)
    adm = login(app, "admin", "Qadm2026x")
    s = adm.get("/api/license").json()
    assert s["mode"] == "trial" and s["trial_left"] == 30 and s["machine"]
    assert "licbadge trial" not in adm.get("/").text and '"mode": "trial"' in adm.get("/").text   # 화면 정보에 포함 (배지는 JS 가 그림)
    # 저장 가능
    r = adm.post("/api/sync", json={"since": 0, "changes": [{"coll": "suppliers", "id": "s1", "op": "put",
                                                            "data": {"id": "s1", "name": "A"}, "ts": 1}]}, headers=H)
    assert r.status_code == 200
    # 31일 뒤 → 읽기 전용: 저장 403, 조회 200
    app.state._today = D0 + timedelta(days=31)
    s = adm.get("/api/license").json()
    assert s["mode"] == "readonly" and "평가 기간" in s["message"]
    r = adm.post("/api/sync", json={"since": 0, "changes": [{"coll": "suppliers", "id": "s2", "op": "put",
                                                            "data": {"id": "s2", "name": "B"}, "ts": 2}]}, headers=H)
    assert r.status_code == 403 and "읽기 전용" in r.json()["message"]
    assert adm.post("/api/sync", json={"since": 0, "changes": []}, headers=H).status_code == 200
    assert adm.post("/api/files/put", json={"files": [{"id": "f1", "data": "x"}]}, headers=H).status_code == 403
    assert adm.get("/api/boot").status_code == 200
    # 라이선스 등록 → 정식
    bad = adm.post("/api/admin/license", json={"text": lic(tmp_path).replace("A", "B", 1)}, headers=H)
    assert bad.status_code == 400
    r = adm.post("/api/admin/license", json={"text": lic(tmp_path)}, headers=H)
    assert r.status_code == 200 and r.json()["mode"] == "full" and r.json()["registered"], r.text
    assert (cfg.data_dir / "qis.lic").is_file()
    r = adm.post("/api/sync", json={"since": 0, "changes": [{"coll": "suppliers", "id": "s2", "op": "put",
                                                            "data": {"id": "s2", "name": "B"}, "ts": 2}]}, headers=H)
    assert r.status_code == 200
    au = adm.get("/api/admin/audit?action=license.install").json()["items"]
    assert au and au[0]["detail"]["seats"] == 2
    # 다시 시작해도(새 License 객체) 파일에서 읽음
    L2 = L.License(app.state.db, cfg.data_dir, pubkey=PKH, build="2026-11-10", today=D0)
    assert L2.status()["mode"] == "full"


def test_unregistered_machine_is_trial(tmp_path):
    app, cfg = mk_app(tmp_path)
    adm = login(app, "admin", "Qadm2026x")
    r = adm.post("/api/admin/license", json={"text": lic(tmp_path, machines=["AAAA-BBBB-CCCC-DDDD"])}, headers=H).json()
    assert r["mode"] == "trial" and not r["registered"] and "등록되지 않았습니다" in r["message"] and r["machine"] in r["message"]
    app.state._today = D0 + timedelta(days=40)
    assert adm.get("/api/license").json()["mode"] == "readonly"


def test_maintenance_expiry_only_blocks_newer_builds(tmp_path):
    app, cfg = mk_app(tmp_path, build="2027-11-09")
    (cfg.data_dir / "qis.lic").write_text(lic(tmp_path, maintenance_until="2027-11-09"), encoding="utf-8")
    app.state.license.load()
    assert app.state.license.status()["mode"] == "full"                 # 만료일 당일 빌드까지 OK
    app.state.license.build = "2027-11-10"
    s = app.state.license.status()
    assert s["mode"] == "readonly" and "유지보수" in s["message"]
    app.state.license.build = "2026-12-01"
    app.state._today = date(2030, 1, 1)                                 # 세월이 흘러도 옛 빌드는 영구
    assert app.state.license.status()["mode"] == "full"


def test_trial_until_license(tmp_path):
    app, cfg = mk_app(tmp_path)
    (cfg.data_dir / "qis.lic").write_text(lic(tmp_path, trial_until="2026-12-31"), encoding="utf-8")
    app.state.license.load()
    assert app.state.license.status()["mode"] == "full"
    app.state._today = date(2027, 1, 1)
    assert app.state.license.status()["mode"] == "readonly"


def test_concurrent_user_limit(tmp_path):
    app, cfg = mk_app(tmp_path)
    (cfg.data_dir / "qis.lic").write_text(lic(tmp_path, users=2), encoding="utf-8")
    app.state.license.load()
    login(app, "admin", "Qadm2026x"); login(app, "kim", "Pass2026kx")
    r = TestClient(app).post("/api/login", json={"username": "lee", "password": "Pass2026lx"}, headers=H)
    assert r.status_code == 400 and r.json()["error"] == "user_limit"
    assert TestClient(app).post("/api/login", json={"username": "kim", "password": "Pass2026kx"}, headers=H).status_code == 200  # 같은 사람 재로그인은 됨
    # 평가판(라이선스 없음)에서는 제한 없음
    (cfg.data_dir / "qis.lic").unlink(); app.state.license.load()
    assert TestClient(app).post("/api/login", json={"username": "lee", "password": "Pass2026lx"}, headers=H).status_code == 200


def test_viewer_sees_license_but_cannot_install(tmp_path):
    app, cfg = mk_app(tmp_path)
    app.state.auth.create_user("view1", "뷰어", "viewer", "Pass2026vx", must_change=False)
    c = login(app, "view1", "Pass2026vx")
    assert c.get("/api/license").status_code == 200
    assert c.post("/api/admin/license", json={"text": lic(tmp_path)}, headers=H).status_code == 403


# ---------------------------------------------------------------- 발급 도구
def test_license_tool_roundtrip(tmp_path, monkeypatch):
    key = tmp_path / "k" / "qis-license.key"
    env = {"QIS_LICENSE_KEY": str(key), "PYTHONIOENCODING": "utf-8"}
    run = lambda *a: subprocess.run([sys.executable, "scripts/license_tool.py", *a], capture_output=True, text=True,
                                    encoding="utf-8", env={**__import__("os").environ, **env}, cwd=Path(__file__).resolve().parent.parent)
    r = run("keygen"); assert r.returncode == 0 and key.is_file() and "공개키:" in r.stdout
    pk = r.stdout.split("공개키: ")[1].split()[0]
    out = tmp_path / "a.lic"
    r = run("issue", "--id", "L-1", "--customer", "회사", "--seats", "2", "--maintenance-until", "2027-01-01",
            "--machine", "aaaa-bbbb-cccc-dddd", "--out", str(out))
    assert r.returncode == 0, r.stderr
    p = L.decode(out.read_text(encoding="utf-8"), pk)
    assert p["machines"] == ["AAAA-BBBB-CCCC-DDDD"] and p["seats"] == 2
    r = run("add-machine", str(out), "EEEE-FFFF-GGGG-HHHH"); assert r.returncode == 0, r.stderr
    assert len(L.decode(out.read_text(encoding="utf-8"), pk)["machines"]) == 2
    r = run("add-machine", str(out), "IIII-JJJJ-KKKK-LLLL"); assert r.returncode != 0 and "대수" in (r.stderr + r.stdout)
    r = run("renew", str(out), "--maintenance-until", "2028-01-01"); assert r.returncode == 0
    assert L.decode(out.read_text(encoding="utf-8"), pk)["maintenance_until"] == "2028-01-01"
    assert run("show", str(out)).returncode == 0
    assert (key.parent / "issued.jsonl").read_text(encoding="utf-8").count("\n") == 3
