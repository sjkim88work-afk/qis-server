"""DB 선택 — 설정 db_url 하나로 정한다.

  db_url 비움              → SQLite, 데이터 폴더의 qis.db (기본)
  sqlite:///경로/qis.db    → SQLite, 그 파일 (상대 경로는 데이터 폴더 기준)
  postgresql://…           → PostgreSQL (2단계에서 추가 예정)

다른 모듈은 open_db(cfg) 로 받은 Database 만 쓴다 (규칙은 base.py).
"""
from __future__ import annotations

from pathlib import Path

from .base import Database, now
from .sqlite import SqliteDB

DB = Database   # 형식 표시용 별칭 (예: def f(db: DB))

__all__ = ["DB", "Database", "SqliteDB", "DBConfigError", "now", "open_db", "db_ready", "parse_db_url"]


class DBConfigError(Exception):
    pass


def parse_db_url(cfg) -> tuple[str, object]:
    """(종류, 대상) — sqlite 면 파일 경로, postgresql 이면 접속 주소."""
    url = (getattr(cfg, "db_url", "") or "").strip()
    if not url or url in ("sqlite", "sqlite://", "sqlite:///"):
        return "sqlite", cfg.db_path
    if url.startswith("sqlite:///"):
        p = Path(url[len("sqlite:///"):])
        return "sqlite", p if p.is_absolute() else (cfg.data_dir / p)
    if url.startswith(("postgresql://", "postgres://")):
        return "postgresql", url
    raise DBConfigError(f"db_url 형식을 알 수 없습니다: {url} — 비워 두면 SQLite(qis.db)를 씁니다")


def open_db(cfg) -> Database:
    kind, target = parse_db_url(cfg)
    if kind == "sqlite":
        return SqliteDB(target)
    raise DBConfigError("PostgreSQL은 아직 지원하지 않습니다 (다음 단계에서 추가). "
                        "지금은 qis.json 의 db_url 을 비워 두세요 — SQLite(qis.db)를 씁니다")


def db_ready(cfg) -> bool:
    """설치(init)를 마친 DB가 있는지 — 서버 시작 전 확인용."""
    kind, target = parse_db_url(cfg)
    if kind == "sqlite":
        return Path(target).exists()
    return True   # 서버형 DB는 접속해 봐야 알 수 있으므로 시작 때 확인
