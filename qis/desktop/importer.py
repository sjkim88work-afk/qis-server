"""데스크톱 프로그램으로 기존 데이터 가져오기.

  · 기존 서버판 data 폴더 (qis.db + files/)          → 지금 DB를 보관한 뒤 그 내용으로 바꿈 (restore 재사용)
  · 서버 백업 DB 파일 (backup/db/qis_*.sqlite)        → restore 그대로
  · 개인판 HTML 백업 JSON (QIS_최신백업.json · QIS_data.json · 서버 내보내기 JSON)
                                                      → 빈 DB에만 넣음 (import 그대로)
DB를 바꾸는 가져오기는 서버를 멈춘 상태에서만 한다 (server.py 가 멈추고 → 가져오고 → 다시 켬).
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from ..db import SqliteDB, parse_db_url
from ..restore import RestoreError, restore


class ImportError_(Exception):
    pass


DB_SUFFIXES = (".sqlite", ".db", ".sqlite3")


def find_server_db(folder) -> Path | None:
    """고른 폴더에서 서버판 DB 찾기 — data 폴더 자체, 또는 그 위의 qis-server 폴더."""
    folder = Path(folder)
    for c in (folder / "qis.db", folder / "data" / "qis.db"):
        if c.is_file():
            return c
    return None


def _same_file(a: Path, b: Path) -> bool:
    try:
        return a.resolve() == b.resolve()
    except OSError:
        return False


def import_server_folder(cfg, folder) -> dict:
    """서버를 멈춘 뒤에 부른다. 그쪽 DB의 일관된 사본(-wal 포함)을 만들어 복원 → 없는 첨부만 복사."""
    src = find_server_db(folder)
    if not src:
        raise ImportError_("고른 폴더에 qis.db 가 없습니다 — 서버판의 data 폴더(qis.db 가 있는 폴더)를 고르세요")
    kind, dest = parse_db_url(cfg)
    if kind != "sqlite":
        raise ImportError_("SQLite DB에만 가져올 수 있습니다")
    if _same_file(src, Path(dest)):
        raise ImportError_("지금 이 프로그램이 쓰는 데이터 폴더입니다")
    work = cfg.data_dir / "import_tmp"
    shutil.rmtree(work, ignore_errors=True)
    snap = work / "db" / "qis_import.sqlite"
    try:
        try:
            SqliteDB.snapshot(src, snap)
            r = restore(cfg, snap, check_server=False)
        except (RestoreError, ValueError) as e:
            raise ImportError_(str(e)) from e
        except Exception as e:  # sqlite 오류 등
            raise ImportError_(f"DB를 읽지 못했습니다: {e}") from e
    finally:
        shutil.rmtree(work, ignore_errors=True)
    filled = 0
    src_files = src.parent / "files"
    if src_files.is_dir():
        for p in src_files.rglob("*.json"):
            q = cfg.files_dir / p.relative_to(src_files)
            if not q.exists():
                q.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(p, q)
                filled += 1
    r["files_filled"] = r.get("files_filled", 0) + filled
    return r


def import_db_file(cfg, path) -> dict:
    """서버를 멈춘 뒤에 부른다. 서버판 백업 DB(backup/db/qis_*.sqlite)로 복원."""
    try:
        return restore(cfg, Path(path), check_server=False)
    except RestoreError as e:
        raise ImportError_(str(e)) from e


def import_json(store, files, user, path) -> dict:
    """개인판 백업 JSON을 빈 DB에 넣는다 (서버를 켠 채로). 사진 포함 백업이면 사진도."""
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ImportError_(f"JSON 파일을 읽지 못했습니다: {e}") from e
    if not isinstance(data, dict):
        raise ImportError_("QIS 백업 형식이 아닙니다")
    photos = data.pop("photos", None)
    try:
        cnt = store.import_backup(user, data)
    except ValueError as e:
        raise ImportError_(str(e)) from e
    if isinstance(photos, list):
        ok = [p for p in photos if isinstance(p, dict) and p.get("id") and p.get("data")]
        for i in range(0, len(ok), 50):
            files.put_many(user, ok[i:i + 50])
        cnt["photos"] = len(ok)
        cnt["photos_skipped"] = len(photos) - len(ok)
    return cnt


def kind_of(path) -> str:
    p = Path(path)
    if p.is_dir():
        return "folder"
    if p.suffix.lower() == ".json":
        return "json"
    if p.suffix.lower() in DB_SUFFIXES:
        return "db"
    return ""
