"""빠진 사진 채우기: python -m pytest -q tests/test_fill_photos.py
개인 QIS 의 '사진 정보만' 든 백업(QMS_data.json 방식)으로 가져온 뒤, 기록이 가리키는 사진 내용이 없는 것을
/api/admin/photos/missing 으로 찾고 /api/files/put 으로 채운다."""
import base64
import json
from pathlib import Path

from qis.files import has_body, photo_refs
from tests.test_api import H, client, env  # noqa: F401

JPG = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff" + b"x" * 400).decode()
PH_IMG = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAkCAIAAABAJy5dAAAANElEQVR42u3OQQkAAAgEsOvf0I9Pc1hDYbAAS/"
          "WcEiEhISEhISEhISEhISEhISEhIaFPoQXCU6TAPfWPWAAAAABJRU5ErkJggg==")


def sample():
    d = json.loads((Path(__file__).parent / "sample_backup.json").read_text(encoding="utf-8"))
    d["defects"][0]["photos"] = ["ph1", "ph2"]
    d["defects"][1]["logs"] = [{"date": "2026-10-01", "kind": "메모", "text": "x", "photos": ["ph3"]}]
    d["ncrs"][0]["noticeDocs"] = ["doc1"]
    # 사진 정보만 (본체는 개인 QIS 사진 폴더의 파일) · 자리표시 이미지 · 본체 있음 · 정보조차 없음(ph2)
    d["photos"] = [{"id": "ph1", "name": "사진.jpg", "file": "QNCN-2026-001_20261001_01.jpg", "caption": "앞면"},
                   {"id": "ph3", "name": "사진.jpg", "data": PH_IMG, "file": "QNCN-2026-001_20261001_02.jpg"},
                   {"id": "doc1", "name": "통보서.pdf", "kind": "doc", "data": "data:application/pdf;base64," + "QUJD" * 100}]
    return d


def test_helpers():
    assert has_body({"data": JPG}) and not has_body({"file": "a.jpg"}) and not has_body({"data": PH_IMG})
    assert photo_refs({"photos": ["a"], "logs": [{"hist": [{"photos": ["b"]}]}], "replyDocs": ["c"], "n": 1}) == ["a", "b", "c"]


def test_missing_and_fill(env):
    app, _ = env
    c = client(app, "admin", "Qadm2026x")
    r = c.post("/api/admin/import", json=sample(), headers=H)
    assert r.status_code == 200, r.text
    m = c.get("/api/admin/photos/missing").json()
    assert m["referenced"] == 4
    ids = {x["id"]: x for x in m["missing"]}
    assert set(ids) == {"ph1", "ph2", "ph3"}                       # doc1 은 본체 있음
    assert ids["ph1"]["file"] == "QNCN-2026-001_20261001_01.jpg" and ids["ph1"]["refs"][0].startswith("불량 ")
    assert ids["ph2"]["file"] == "" and ids["ph3"]["refs"]
    # 채우기 (관리 화면이 하는 일과 같음)
    r = c.post("/api/files/put", json={"files": [
        {"id": "ph1", "name": "사진.jpg", "mime": "image/jpeg", "kind": "photo", "data": JPG, "file": "QNCN-2026-001_20261001_01.jpg"},
        {"id": "ph3", "name": "사진.jpg", "mime": "image/jpeg", "kind": "photo", "data": JPG}]}, headers=H)
    assert r.json()["saved"] == 2
    m = c.get("/api/admin/photos/missing").json()
    assert [x["id"] for x in m["missing"]] == ["ph2"]
    got = c.post("/api/files/get", json={"ids": ["ph1"]}, headers=H).json()["files"]
    assert got and got[0]["data"] == JPG
    # 조회 권한은 못 봄
    assert client(app, "lee", "Viewer1234").get("/api/admin/photos/missing").status_code == 403
