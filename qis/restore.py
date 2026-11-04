"""복원: python -m qis restore <백업 DB 파일>

  1. 서버가 켜져 있으면 멈춤 (켜진 채로 바꾸면 DB가 손상될 수 있음)
  2. 백업 파일 검사 — 무결성 · 스키마 · 건수
  3. 지금 DB(qis.db · qis.db-wal · qis.db-shm)를 data/restore_before_<시각>/ 로 옮겨 보관 (지우지 않음)
  4. 백업을 qis.db 로 복사하고 다시 열어 확인
  5. 백업 폴더의 files/ 에서 지금 없는 첨부만 채움 (있는 첨부는 덮어쓰지 않음)
"""
from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path

from .db import SqliteDB, open_db, parse_db_url


class RestoreError(Exception):
    pass


def _server_running(cfg) -> bool:
    from .desktop.instance import InstanceLock
    from .launcher import _is_qis
    # 데스크톱 프로그램(QIS.app · QIS.exe)은 빈 포트를 쓰므로 데이터 폴더 잠금으로도 확인
    return InstanceLock(cfg.data_dir).in_use_elsewhere() or _is_qis(cfg) is not None


def check(cfg, src: Path) -> dict:
    kind, _ = parse_db_url(cfg)
    if kind != "sqlite":
        raise RestoreError("이 명령은 SQLite DB만 복원합니다")
    src = Path(src)
    if not src.is_file():
        raise RestoreError(f"백업 파일이 없습니다: {src}")
    try:
        info = SqliteDB.inspect_file(src)
    except ValueError as e:
        raise RestoreError(str(e)) from e
    if info["integrity"] != "ok":
        raise RestoreError(f"백업 파일이 손상됐습니다 (integrity_check: {info['integrity']})")
    return info


def restore(cfg, src: Path, *, check_server=True) -> dict:
    info = check(cfg, src)
    if check_server and _server_running(cfg):
        raise RestoreError(f"서버가 켜져 있습니다 ({cfg.port}번 포트 · 또는 QIS 프로그램이 데이터 폴더를 쓰는 중). "
                           "서버 창 · QIS 창을 닫거나 Ctrl+C 로 멈춘 뒤 다시 실행하세요")
    _, dest = parse_db_url(cfg)
    dest = Path(dest)
    keep = cfg.data_dir / f"restore_before_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    moved = SqliteDB.replace_file(Path(src), dest, keep)
    db = open_db(cfg)                       # 다시 열어 스키마 확인 · 적용
    after = {"seq": db.seq(), "schema": db.schema_version()}
    db.close()
    after_info = SqliteDB.inspect_file(dest)
    if after_info["records"] != info["records"]:
        raise RestoreError("복원한 DB의 건수가 백업과 다릅니다 — 보관 폴더의 원래 DB로 되돌리세요: " + str(keep))
    filled = 0
    src_files = Path(src).resolve().parent.parent / "files"     # backup/db/x.sqlite → backup/files
    if src_files.is_dir():
        for p in src_files.rglob("*.json"):
            q = cfg.files_dir / p.relative_to(src_files)
            if not q.exists():
                q.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(p, q)
                filled += 1
    return {**info, **after, "kept": str(keep) if moved else "", "moved": moved, "files_filled": filled}
