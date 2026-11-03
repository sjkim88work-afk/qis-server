"""점검(2026-11-04) 결과 수정 확인: python -m pytest -q

1-2 첨부 덮어쓰기 · 휴지통 · 1-3 복원(WAL) · 1-6 출력 인코딩 · 1-7 내보내기 잘림 · 2-9 권한
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from qis.config import Config
from qis.db import open_db
from qis.files import Files
from qis.restore import RestoreError, restore

from test_api import H, client, env  # noqa: F401  (fixture 재사용)

ROOT = Path(__file__).resolve().parents[1]


def photo(fid, text="x"):
    return {"id": fid, "name": f"{fid}.jpg", "mime": "image/jpeg", "data": "data:image/jpeg;base64," + text}


# ---- 1-2 첨부 ----
def test_file_replace_keeps_previous_version_and_logs(env):
    app, cfg = env
    ed = client(app, "kim", "Editor1234")
    ad = client(app, "admin", "Qadm2026x")
    assert ed.post("/api/files/put", json={"files": [photo("doc1", "AAAA")]}, headers=H).json()["saved"] == 1
    assert ed.post("/api/files/put", json={"files": [photo("doc1", "AAAA")]}, headers=H).json()["saved"] == 1  # 같은 내용
    assert not list((cfg.files_dir / "_versions").glob("doc1_*"))
    assert ed.post("/api/files/put", json={"files": [photo("doc1", "BBBB")]}, headers=H).json()["saved"] == 1  # 바뀐 내용
    kept = list((cfg.files_dir / "_versions").glob("doc1_*.json"))
    assert len(kept) == 1 and "AAAA" in kept[0].read_text(encoding="utf-8")
    acts = [i["action"] for i in ad.get("/api/history?coll=files&id=doc1").json()["items"]]
    assert "file.add" in acts and "file.replace" in acts


def test_trash_never_overwritten(env):
    app, cfg = env
    ed = client(app, "kim", "Editor1234")
    for text in ("ORIG", "SECOND"):
        ed.post("/api/files/put", json={"files": [photo("ph9", text)]}, headers=H)
        assert ed.post("/api/files/delete", json={"ids": ["ph9"]}, headers=H).json()["deleted"] == 1
    trash = sorted((cfg.files_dir / "_trash").glob("ph9_*.json"))
    assert len(trash) == 2
    assert any("ORIG" in t.read_text(encoding="utf-8") for t in trash)


def test_file_id_must_be_plain(env):
    app, cfg = env
    ed = client(app, "kim", "Editor1234")
    for bad in ("..evil", "a:b", "a.b", "../x", "-x"):
        r = ed.post("/api/files/put", json={"files": [photo(bad)]}, headers=H)
        assert r.status_code == 400, bad
    assert not list(cfg.data_dir.glob("*evil*"))


# ---- 1-7 내보내기 ----
def test_export_includes_all_photos(env):
    app, cfg = env
    ad = client(app, "admin", "Qadm2026x")
    db = app.state.db
    admin = db.q1("SELECT * FROM users WHERE username='admin'")
    fs = Files(db, cfg)
    for i in range(0, 620, 50):
        fs.put_many(admin, [photo(f"p{j:04d}") for j in range(i, min(i + 50, 620))])
    data = ad.get("/api/admin/export?photos=1").json()
    assert len(data["photos"]) == 620


# ---- 2-9 권한 ----
def test_viewer_cannot_read_user_history(env):
    app, _ = env
    vw = client(app, "lee", "Viewer1234")
    ad = client(app, "admin", "Qadm2026x")
    assert vw.get("/api/history?coll=users&id=1").status_code == 403
    assert ad.get("/api/history?coll=users&id=1").status_code == 200
    assert vw.get("/api/history?coll=defects&id=d1").status_code == 200


# ---- 1-3 복원 ----
def make_cfg(tmp_path):
    c = Config()
    c.data_dir = tmp_path / "data"
    c.port = 18999   # 비어 있는 포트 (서버 꺼짐)
    return c


def put(db, rid, seq):
    with db.tx() as t:
        t.execute("INSERT INTO records(coll,id,rev,seq,data) VALUES('defects',?,1,?,'{}')", (rid, seq))
        t.execute("UPDATE meta SET v=? WHERE k='seq'", (str(seq),))


def test_restore_ignores_leftover_wal(tmp_path):
    """서버가 강제 종료돼 -wal 이 남은 상태에서도 복원 결과는 백업 그대로, 원래 DB는 보관."""
    cfg = make_cfg(tmp_path)
    db = open_db(cfg)
    put(db, "d1", 1)
    bk = tmp_path / "backup" / "db" / "qis_1.sqlite"
    db.backup_to(bk)
    put(db, "d2", 2)
    put(db, "d3", 3)
    wal = Path(str(cfg.db_path) + "-wal")
    assert wal.exists() and wal.stat().st_size > 0      # 최근 변경이 WAL에만 있는 상태 (강제 종료와 같음)
    r = restore(cfg, bk)
    db.close()
    after = open_db(cfg)
    assert [x["id"] for x in after.q("SELECT id FROM records ORDER BY id")] == ["d1"]
    assert after.seq() == 1
    after.close()
    kept = Path(r["kept"])
    assert {"qis.db", "qis.db-wal"} <= set(os.listdir(kept))
    c2 = Config(); c2.data_dir = kept; c2.db_url = "sqlite:///" + str(kept / "qis.db")
    old = open_db(c2)
    assert old.q1("SELECT COUNT(*) n FROM records")["n"] == 3   # 원래 DB는 WAL과 함께 보관 → 최신 내용 유지
    old.close()


def test_restore_fills_missing_files_only(tmp_path):
    cfg = make_cfg(tmp_path)
    db = open_db(cfg)
    put(db, "d1", 1)
    bk = tmp_path / "backup" / "db" / "qis_1.sqlite"
    db.backup_to(bk)
    db.close()
    (tmp_path / "backup" / "files" / "ab").mkdir(parents=True)
    (tmp_path / "backup" / "files" / "ab" / "ab1.json").write_text("old", encoding="utf-8")
    (tmp_path / "backup" / "files" / "ab" / "ab2.json").write_text("old", encoding="utf-8")
    (cfg.files_dir / "ab").mkdir(parents=True)
    (cfg.files_dir / "ab" / "ab1.json").write_text("current", encoding="utf-8")
    r = restore(cfg, bk)
    assert r["files_filled"] == 1
    assert (cfg.files_dir / "ab" / "ab1.json").read_text(encoding="utf-8") == "current"


def test_restore_rejects_bad_file_and_running_server(tmp_path):
    cfg = make_cfg(tmp_path)
    open_db(cfg).close()
    junk = tmp_path / "junk.sqlite"
    junk.write_bytes(b"not a database")
    with pytest.raises(RestoreError):
        restore(cfg, junk)
    import socket
    s = socket.socket()
    s.bind(("127.0.0.1", 0)); s.listen()
    cfg.port = s.getsockname()[1]
    bk = tmp_path / "bk.sqlite"
    db = open_db(cfg); db.backup_to(bk); db.close()
    with pytest.raises(RestoreError, match="서버가 켜져"):
        restore(cfg, bk)
    s.close()


# ---- 1-6 출력 인코딩 ----
def test_console_survives_cp949_log_file(tmp_path):
    """한국어 Windows 작업 스케줄러처럼 출력이 cp949 파일이어도 '—' 때문에 멈추지 않음."""
    code = "from qis.__main__ import _safe_console; _safe_console(); print('QIS 서버 — 시작')"
    out = tmp_path / "server.log"
    with open(out, "wb") as f:
        p = subprocess.run([sys.executable, "-c", code], cwd=ROOT, stdout=f, stderr=subprocess.PIPE,
                           env={**os.environ, "PYTHONIOENCODING": "cp949"})
    assert p.returncode == 0, p.stderr.decode(errors="replace")
    assert "QIS".encode() in out.read_bytes()
