"""서버 API 시험: python -m pytest -q"""
import json

import pytest
from fastapi.testclient import TestClient

from qis.app import create_app
from qis.auth import Auth
from qis.config import Config
from qis.db import open_db

H = {"X-QIS": "1"}


@pytest.fixture()
def env(tmp_path):
    cfg = Config()
    cfg.data_dir = tmp_path / "data"
    cfg.backup_dir = str(tmp_path / "bk")
    cfg.data_dir.mkdir()
    db = open_db(cfg)
    a = Auth(db, cfg)
    a.create_user("admin", "관리자", "admin", "Qadm2026x", must_change=False)
    a.create_user("kim", "김작성", "editor", "Editor1234", must_change=False)
    a.create_user("lee", "이조회", "viewer", "Viewer1234", must_change=False)
    db.close()
    app = create_app(cfg, start_backup=False)
    return app, cfg


def client(app, user=None, pw=None):
    c = TestClient(app)
    if user:
        r = c.post("/api/login", json={"username": user, "password": pw}, headers=H)
        assert r.status_code == 200, r.text
    return c


def sync(c, changes, since=0):
    r = c.post("/api/sync", json={"since": since, "changes": changes}, headers=H)
    return r


def test_login_and_pages(env):
    app, _ = env
    c = TestClient(app)
    assert c.get("/", follow_redirects=False).headers["location"] == "/login"
    assert c.get("/api/boot").status_code == 401
    r = c.post("/api/login", json={"username": "kim", "password": "wrong"}, headers=H)
    assert r.status_code == 400
    r = c.post("/api/login", json={"username": "kim", "password": "Editor1234"})  # 헤더 없음 → 차단
    assert r.status_code == 403
    c = client(app, "kim", "Editor1234")
    r = c.get("/")
    assert r.status_code == 200 and 'id="qisServer"' in r.text and '"role": "editor"' in r.text
    assert "fonts.googleapis" not in r.text
    assert "Content-Security-Policy" in r.headers
    assert c.get("/admin", follow_redirects=False).status_code == 303   # 작성자는 관리 화면 불가
    assert c.get("/api/admin/users").status_code == 403


def test_lockout(env):
    app, cfg = env
    c = TestClient(app)
    for _ in range(cfg.login_max_fail):
        c.post("/api/login", json={"username": "kim", "password": "nope"}, headers=H)
    r = c.post("/api/login", json={"username": "kim", "password": "Editor1234"}, headers=H)
    assert r.status_code == 400 and r.json()["error"] == "locked"


def test_sync_roles_merge_audit(env):
    app, _ = env
    ed = client(app, "kim", "Editor1234")
    ad = client(app, "admin", "Qadm2026x")
    vw = client(app, "lee", "Viewer1234")

    # 작성자: 불량 등록
    d = {"id": "d1", "date": "2026-11-02", "partNo": "P-1", "qty": 3, "desc": "찍힘"}
    r = sync(ed, [{"coll": "defects", "id": "d1", "rev": 0, "data": d}]).json()
    assert r["results"][0]["ok"] and r["results"][0]["rev"] == 1
    # 조회자: 저장 불가, 읽기 가능
    assert sync(vw, [{"coll": "defects", "id": "d1", "rev": 1, "data": {**d, "qty": 9}}]).status_code == 403
    assert [x["id"] for x in vw.get("/api/boot").json()["records"]] == ["d1"]

    # 동시 수정: 관리자가 qty, 작성자가 desc 를 (같은 rev 1 기준으로) 고침 → 둘 다 반영
    r = sync(ad, [{"coll": "defects", "id": "d1", "rev": 1, "base": d, "data": {**d, "qty": 5}}]).json()
    assert r["results"][0]["rev"] == 2
    r = sync(ed, [{"coll": "defects", "id": "d1", "rev": 1, "base": d, "data": {**d, "desc": "찍힘 2곳"}}]).json()
    res = r["results"][0]
    assert res["ok"] and res["merged"] and res["data"]["qty"] == 5 and res["data"]["desc"] == "찍힘 2곳"
    assert res["conflicts"] == []
    # 같은 항목 동시 수정 → 지금 저장한 값, conflicts 표시
    b3 = {**d, "qty": 5, "desc": "찍힘 2곳"}
    sync(ad, [{"coll": "defects", "id": "d1", "rev": 3, "base": b3, "data": {**b3, "qty": 6}}])
    r = sync(ed, [{"coll": "defects", "id": "d1", "rev": 3, "base": b3, "data": {**b3, "qty": 7}}]).json()
    assert r["results"][0]["conflicts"] == ["qty"] and r["results"][0]["data"]["qty"] == 7

    # 받아오기: since 이후 변경
    r = sync(vw, [], since=0).json()
    assert r["pulled"][-1]["data"]["qty"] == 7

    # 기준정보: 작성자는 등록 · 수정 가능, 삭제 불가
    s = {"id": "s1", "name": "MSJ"}
    assert sync(ed, [{"coll": "suppliers", "id": "s1", "rev": 0, "data": s}]).json()["results"][0]["ok"]
    r = sync(ed, [{"coll": "suppliers", "id": "s1", "rev": 1, "base": s, "data": None}]).json()["results"][0]
    assert not r["ok"] and r["error"] == "forbidden" and r["data"]["name"] == "MSJ"
    assert sync(ad, [{"coll": "suppliers", "id": "s1", "rev": 1, "base": s, "data": None}]).json()["results"][0]["ok"]

    # 설정: 관리자만 (작성자는 담당자 목록만)
    st = {"company": "한빛오토", "owners": ["김작성"], "sevA": 12}
    assert sync(ad, [{"coll": "doc", "id": "settings", "rev": 0, "data": st}]).json()["results"][0]["ok"]
    r = sync(ed, [{"coll": "doc", "id": "settings", "rev": 1, "base": st, "data": {**st, "sevA": 4}}]).json()["results"][0]
    assert not r["ok"] and r["data"]["sevA"] == 12
    r = sync(ed, [{"coll": "doc", "id": "settings", "rev": 1, "base": st, "data": {**st, "owners": ["김작성", "박신규"]}}]).json()
    assert r["results"][0]["ok"]
    # BOM 은 관리자만
    assert not sync(ed, [{"coll": "doc", "id": "bom", "rev": 0, "data": {"rows": []}}]).json()["results"][0]["ok"]
    # 잘못된 기록 종류
    assert not sync(ed, [{"coll": "users", "id": "x", "rev": 0, "data": {}}]).json()["results"][0]["ok"]

    # 변경 이력
    items = ad.get("/api/admin/audit?coll=defects&id=d1").json()["items"]
    acts = [i["action"] for i in items]
    assert acts.count("update") == 4 and "create" in acts
    up = [i for i in items if i["action"] == "update"][0]
    assert up["detail"]["changes"]["qty"] == [6, 7] and up["detail"]["conflicts"] == ["qty"] and up["name"] == "김작성"
    assert ed.get("/api/history?coll=defects&id=d1").status_code == 200
    # 이전 버전 보관
    v = ad.get("/api/admin/versions?coll=defects&id=d1").json()["versions"]
    assert [x["rev"] for x in v] == [4, 3, 2, 1]
    # 이력은 고칠 수 없음
    db = app.state.db
    with pytest.raises(Exception):
        db.x("DELETE FROM audit")


def test_ncr_duplicate_warning(env):
    app, _ = env
    a = client(app, "admin", "Qadm2026x")
    b = client(app, "kim", "Editor1234")
    sync(a, [{"coll": "ncrs", "id": "n1", "rev": 0, "data": {"id": "n1", "no": "NCR-2611-001"}}])
    r = sync(b, [{"coll": "ncrs", "id": "n2", "rev": 0, "data": {"id": "n2", "no": "NCR-2611-001"}}]).json()
    assert r["warnings"] and "NCR-2611-001" in r["warnings"][0]


def test_files_and_backup_and_import(env, tmp_path):
    app, cfg = env
    ed = client(app, "kim", "Editor1234")
    vw = client(app, "lee", "Viewer1234")
    ad = client(app, "admin", "Qadm2026x")
    f = {"id": "ph1", "name": "a.jpg", "mime": "image/jpeg", "data": "data:image/jpeg;base64,AAAA", "thumb": ""}
    assert ed.post("/api/files/put", json={"files": [f]}, headers=H).json()["saved"] == 1
    assert vw.post("/api/files/put", json={"files": [f]}, headers=H).status_code == 403
    assert vw.post("/api/files/get", json={"ids": ["ph1", "nope"]}, headers=H).json()["files"][0]["name"] == "a.jpg"
    assert ed.post("/api/files/delete", json={"ids": ["ph1"]}, headers=H).json()["deleted"] == 1
    assert ed.post("/api/files/get", json={"ids": ["ph1"]}, headers=H).json()["files"] == []
    assert list((cfg.files_dir / "_trash").glob("ph1_*.json"))   # 지워도 휴지통에 남음 (시각이 붙은 이름)

    # 백업
    info = ad.post("/api/admin/backup", headers=H).json()["info"]
    assert (cfg.backup_path / "db" / info["db"]).exists()
    assert list((cfg.backup_path / "json").glob("*.json"))

    # 가져오기: 기록이 있으면 거부
    bk = {"settings": {"company": "X"}, "defects": [{"id": "x1"}], "ncrs": [], "photos": [f]}
    sync(ed, [{"coll": "defects", "id": "z", "rev": 0, "data": {"id": "z"}}])
    assert ad.post("/api/admin/import", json=bk, headers=H).status_code == 409   # 기록이 있으면 바꿀지 물음


def test_import_into_empty(env):
    app, _ = env
    ad = client(app, "admin", "Qadm2026x")
    bk = {"settings": {"company": "X"}, "defects": [{"id": "x1", "qty": 1}], "ncrs": [{"id": "n1", "no": "N-1"}],
          "suppliers": [{"id": "s1", "name": "A"}], "bom": {"rows": [{"fgNo": "F"}]},
          "photos": [{"id": "p1", "data": "data:image/png;base64,AA"}]}
    r = ad.post("/api/admin/import", json=bk, headers=H).json()["imported"]
    assert r["defects"] == 1 and r["photos"] == 1
    recs = ad.get("/api/boot").json()["records"]
    assert {(x["coll"], x["id"]) for x in recs} >= {("defects", "x1"), ("doc", "settings"), ("doc", "bom")}
    ex = ad.get("/api/admin/export?photos=1").json()
    assert ex["defects"][0]["id"] == "x1" and ex["photos"][0]["id"] == "p1"


def test_user_admin(env):
    app, _ = env
    ad = client(app, "admin", "Qadm2026x")
    r = ad.post("/api/admin/users", json={"username": "park", "name": "박", "role": "editor", "password": "short"}, headers=H)
    assert r.status_code == 400
    u = ad.post("/api/admin/users", json={"username": "park", "name": "박", "role": "editor", "password": "Qpk2026aa"},
                headers=H).json()["user"]
    assert u["mustChange"]
    c = client(app, "park", "Qpk2026aa")
    assert c.get("/", follow_redirects=False).headers["location"] == "/account?first=1"
    assert c.post("/api/me/password", json={"old": "Qpk2026aa", "new": "Qpk2026bb"}, headers=H).status_code == 200
    assert c.get("/").status_code == 200
    # 사용 중지 → 세션 끊김
    ad.patch(f"/api/admin/users/{u['id']}", json={"active": False}, headers=H)
    assert c.get("/api/boot").status_code == 401
    # 마지막 관리자 강등 불가
    me = [x for x in ad.get("/api/admin/users").json()["users"] if x["username"] == "admin"][0]
    assert ad.patch(f"/api/admin/users/{me['id']}", json={"role": "editor"}, headers=H).status_code == 400


# ---- 관리자: 데이터 비우기 · 기록이 있어도 가져오기 (바꾸기) ----
SAMPLE = __import__("pathlib").Path(__file__).parent / "sample_backup.json"


def test_admin_reset_and_replace_import(env):
    app, cfg = env
    a = client(app, "admin", "Qadm2026x")
    data = json.loads(SAMPLE.read_text(encoding="utf-8"))
    data["photos"] = [{"id": "ph1", "name": "a.png", "data": "data:image/png;base64,AAAA"}]
    r = a.post("/api/admin/import", json=data, headers=H)
    assert r.status_code == 200 and r.json()["imported"]["defects"] == 5
    # 작성자 화면이 떠 있음 (현재 순번 기억)
    k = client(app, "kim", "Editor1234")
    seq = k.get("/api/boot").json()["seq"]
    # 기록이 있으면 그냥은 거부 (409 has_records), 바꾸기면 비운 뒤 가져옴
    r = a.post("/api/admin/import", json=data, headers=H)
    assert r.status_code == 409 and r.json()["error"] == "has_records"
    r = a.post("/api/admin/import", json={**data, "_replace": True}, headers=H)
    assert r.status_code == 200 and r.json()["imported"]["defects"] == 5, r.text
    boot = a.get("/api/boot").json()
    assert len([x for x in boot["records"] if x["coll"] == "defects"]) == 5          # 같은 id 로 되살아남 (중복 없음)
    assert all(x["rev"] >= 2 for x in boot["records"] if x["coll"] == "defects")
    assert list((cfg.backup_path / "db").glob("qis_*_before_import.sqlite"))        # 바꾸기 전 자동 백업
    # 다른 사용자 화면은 변경 순번으로 바뀐 기록(되살아난 최종 상태)을 받음
    pulled = sync(k, [], since=seq).json()["pulled"]
    assert len(pulled) >= 5 and all(p["data"] for p in pulled)
    # 비우기: 확인 문구 필요, 백업 받고 모두 지움, 첨부는 휴지통으로
    assert a.post("/api/admin/reset", json={"confirm": "x"}, headers=H).status_code == 400
    r = a.post("/api/admin/reset", json={"confirm": "비우기"}, headers=H)
    assert r.status_code == 200 and r.json()["cleared"]["defects"] == 5 and r.json()["cleared"]["files"] == 1
    assert r.json()["backup"].endswith("_before_reset.sqlite")
    assert a.get("/api/boot").json()["records"] == []
    assert a.get("/api/files/ids").json()["ids"] == []
    pulled = sync(k, [], since=k.get("/api/boot").json()["seq"] - 20).json()["pulled"]
    assert pulled and all(p["data"] is None for p in pulled)                        # 열린 화면들은 지움을 받음
    assert list((cfg.files_dir / "_trash").glob("reset_*/ph/ph1.json"))
    # 작성자는 못 함
    assert k.post("/api/admin/reset", json={"confirm": "비우기"}, headers=H).status_code == 403
    # 비운 뒤 다시 가져오기는 묻지 않고 됨
    assert a.post("/api/admin/import", json=data, headers=H).status_code == 200
    # 이력에 남음
    acts = [x["action"] for x in a.get("/api/admin/audit").json()["items"]]
    assert "reset" in acts and acts.count("import") >= 3


def test_qrqc_collection(env):
    """신속대응(QRQC): 저장 · 권한 · 항목별 동시 수정 · 변경 이력 · 첨부 참조"""
    from qis.files import photo_refs

    app, _ = env
    ed = client(app, "kim", "Editor1234")
    ad = client(app, "admin", "Qadm2026x")
    vw = client(app, "lee", "Viewer1234")
    crit = {k: {"s": "R", "done": "", "checker": "", "note": "", "photos": []}
            for k in ("cont", "rca", "act", "ep", "lpa", "ver", "pfmea", "sw", "ll")}
    q = {"id": "q1", "no": "QRQC-26-11-01", "date": "2026-11-17", "part": "프론트 도어래치", "line": "조립 2라인",
         "issue": "래치 걸림", "owner": "김작성", "action": "", "crit": crit, "logs": []}
    r = sync(ed, [{"coll": "qrqcs", "id": "q1", "rev": 0, "data": q}]).json()["results"][0]
    assert r["ok"] and r["rev"] == 1
    # 조회 권한은 저장 못 함, 읽기는 됨
    assert sync(vw, [{"coll": "qrqcs", "id": "q1", "rev": 1, "data": {**q, "owner": "x"}}]).status_code == 403
    assert [x["coll"] for x in vw.get("/api/boot").json()["records"]] == ["qrqcs"]
    # 두 사람이 같은 버전에서 서로 다른 항목을 고침 → 둘 다 남음
    a = {**q, "action": "봉쇄: 전수 선별"}
    b = {**q, "crit": {**crit, "cont": {"s": "G", "done": "2026-11-18", "checker": "김작성", "note": "격리", "photos": ["ph_q1"]}}}
    assert sync(ad, [{"coll": "qrqcs", "id": "q1", "rev": 1, "base": q, "data": a}]).json()["results"][0]["rev"] == 2
    res = sync(ed, [{"coll": "qrqcs", "id": "q1", "rev": 1, "base": q, "data": b}]).json()["results"][0]
    assert res["ok"] and res["merged"] and res["data"]["action"] == "봉쇄: 전수 선별" and res["data"]["crit"]["cont"]["s"] == "G"
    # 변경 이력: 이름 · 표시 이름
    items = ad.get("/api/admin/audit?coll=qrqcs&id=q1").json()["items"]
    assert items[0]["collName"] == "신속대응" and "QRQC-26-11-01" in items[0]["label"] and "프론트 도어래치" in items[0]["label"]
    assert [i["action"] for i in items].count("update") == 2
    # 항목 첨부는 photos 목록 — 서버가 '쓰는 첨부'로 알아봄
    assert photo_refs(res["data"]) == ["ph_q1"]
    # 백업 내보내기에 들어감
    assert [x["id"] for x in app.state.store.export()["qrqcs"]] == ["q1"]
