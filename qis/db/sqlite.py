"""SQLite 구현 (파일 하나: data/qis.db) — 기본 DB.

· 연결 하나를 잠금으로 보호해 씀 — 품질팀 수십 명 규모에 충분
· WAL 모드: 읽기와 쓰기가 서로 막지 않음, 갑작스런 종료에도 안전
"""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

from .base import Database

# 스키마 1 — 1차 버전의 테이블 그대로. 이후 변경은 2, 3 … 으로 추가 (postgres 쪽도 같은 번호로)
SCHEMA_1 = """
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);

-- 기록: 불량 · NCR · 협력사 · 부품 · 입고 … 한 건 = 한 줄 (내용은 JSON)
CREATE TABLE IF NOT EXISTS records (
  coll TEXT NOT NULL, id TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,        -- 고칠 때마다 +1 (동시 수정 확인용)
  seq INTEGER NOT NULL,                  -- 서버 전체 변경 순번 (다른 사용자 변경 받아오기)
  data TEXT,                             -- JSON, 삭제되면 마지막 내용 유지
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT, updated_by TEXT,
  PRIMARY KEY (coll, id)
);
CREATE INDEX IF NOT EXISTS ix_records_seq ON records(seq);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer','editor','admin')),
  pw_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  must_change INTEGER NOT NULL DEFAULT 1,
  created_at TEXT, last_login TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0, locked_until TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT, last_seen TEXT, ip TEXT, ua TEXT
);

-- 이전 버전: 기록을 고치거나 지울 때 바로 앞 내용을 보관 (되돌리기 · 심사 증빙)
CREATE TABLE IF NOT EXISTS record_versions (
  coll TEXT NOT NULL, id TEXT NOT NULL, rev INTEGER NOT NULL,
  data TEXT, saved_at TEXT, saved_by TEXT,
  PRIMARY KEY (coll, id, rev)
);

-- 변경 이력: 지우거나 고칠 수 없음 (트리거로 막음)
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL, user_id INTEGER, username TEXT, name TEXT,
  action TEXT NOT NULL, coll TEXT, rec_id TEXT, label TEXT,
  detail TEXT, ip TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_rec ON audit(coll, rec_id);
CREATE INDEX IF NOT EXISTS ix_audit_ts ON audit(ts);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;

-- 첨부(사진 · 문서): 내용은 data/files/<id>.json, 여기는 목록
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, name TEXT, mime TEXT, size INTEGER, kind TEXT,
  created_at TEXT, created_by TEXT,
  deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, deleted_by TEXT
);
"""


class SqliteDB(Database):
    kind = "sqlite"
    backup_suffix = ".sqlite"
    MIGRATIONS = {1: SCHEMA_1}

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.path), check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        with self.lock:
            self.conn.execute("PRAGMA journal_mode=WAL")
            self.conn.execute("PRAGMA synchronous=FULL")
            self.conn.execute("PRAGMA foreign_keys=ON")
            # 스키마 1은 모두 IF NOT EXISTS 라 매번 실행해도 안전 (1차 버전과 같은 동작: 빠진 테이블 · 인덱스 보충)
            self.conn.executescript(SCHEMA_1)
        self.migrate()

    def describe(self) -> str:
        return f"sqlite ({self.path})"

    @contextmanager
    def tx(self):
        with self.lock:
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                yield self.conn
            except BaseException:
                self.conn.execute("ROLLBACK")
                raise
            else:
                self.conn.execute("COMMIT")

    def q(self, sql: str, args=()):
        with self.lock:
            return self.conn.execute(sql, args).fetchall()

    def q1(self, sql: str, args=()):
        with self.lock:
            return self.conn.execute(sql, args).fetchone()

    def x(self, sql: str, args=()) -> None:
        with self.lock:
            self.conn.execute(sql, args)

    def json_text(self, col: str, key: str) -> str:
        _check_ident(col)
        _check_ident(key)
        return f"json_extract({col},'$.{key}')"

    def insert_id(self, c, sql: str, args=()) -> int:
        return c.execute(sql, args).lastrowid

    def backup_to(self, dest: Path) -> None:
        """SQLite 온라인 백업 — 쓰는 중에도 일관된 사본."""
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(".tmp")
        out = sqlite3.connect(str(tmp))
        with self.lock:
            self.conn.backup(out)
        out.close()
        tmp.replace(dest)

    def checkpoint(self) -> None:
        """WAL(qis.db-wal)의 내용을 qis.db 에 모두 합치고 WAL을 비움 — 프로그램을 닫을 때."""
        with self.lock:
            self.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")

    def close(self) -> None:
        with self.lock:
            self.conn.close()

    # ---- 복원 (서버를 멈춘 상태에서 python -m qis restore) ----
    @staticmethod
    def inspect_file(path: Path) -> dict:
        """백업 파일을 읽기 전용으로 열어 무결성 · 스키마 · 건수를 확인 (파일을 바꾸지 않음)."""
        uri = Path(path).resolve().as_uri() + "?mode=ro&immutable=1"
        con = sqlite3.connect(uri, uri=True)
        con.row_factory = sqlite3.Row
        try:
            ok = con.execute("PRAGMA integrity_check").fetchone()[0]
            meta = {r["k"]: r["v"] for r in con.execute("SELECT k,v FROM meta")}
            colls = {r["coll"]: r["n"] for r in con.execute(
                "SELECT coll, COUNT(*) n FROM records WHERE deleted=0 GROUP BY coll ORDER BY coll")}
            users = con.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        except sqlite3.DatabaseError as e:
            raise ValueError(f"QIS 백업 DB가 아닙니다: {e}") from e
        finally:
            con.close()
        return {"integrity": ok, "schema": int(meta.get("schema") or 0), "seq": int(meta.get("seq") or 0),
                "records": colls, "users": users}

    @staticmethod
    def check_file(path: Path) -> str:
        """비정상 종료 뒤 검사: 'ok' 또는 문제 설명. inspect_file 과 달리 보통 방식으로 열어
        WAL(qis.db-wal)에 남은 내용까지 반영해 검사한다 (SQLite가 WAL을 자동 복구)."""
        try:
            con = sqlite3.connect(str(path), timeout=10)
            try:
                rows = con.execute("PRAGMA integrity_check").fetchall()
                con.execute("SELECT COUNT(*) FROM records").fetchone()
            finally:
                con.close()
        except sqlite3.DatabaseError as e:
            return f"DB를 열 수 없습니다: {e}"
        msg = "; ".join(str(r[0]) for r in rows[:5])
        return "ok" if msg == "ok" else msg

    @staticmethod
    def copy_file(src: Path, dest: Path) -> None:
        """다른 QIS DB 파일(예: 서버판 data/qis.db)을 원본은 바꾸지 않고 WAL 내용까지 담아 한 파일로 복사."""
        con = sqlite3.connect(f"{Path(src).resolve().as_uri()}?mode=ro", uri=True, timeout=10)
        out = sqlite3.connect(str(dest))
        try:
            con.backup(out)
        finally:
            out.close()
            con.close()

    def copy_users_from(self, old_path: Path) -> int:
        """보관한 이전 DB의 사용자 계정을 이 (빈) DB로 옮김 — 데스크톱 '백업으로 바꾸기' 때."""
        cols = "id,username,name,role,pw_hash,active,must_change,created_at,last_login,fail_count,locked_until"
        with self.lock:
            self.conn.execute("ATTACH DATABASE ? AS old", (str(old_path),))
            try:
                with self.tx() as c:
                    n = c.execute(f"INSERT INTO users({cols}) SELECT {cols} FROM old.users").rowcount
            finally:
                self.conn.execute("DETACH DATABASE old")
        return n

    @staticmethod
    def replace_file(src: Path, dest: Path, keep_dir: Path) -> list[str]:
        """dest(+ -wal · -shm)를 keep_dir 로 옮긴 뒤 src 를 dest 로 복사.
        -wal 을 남겨 두면 SQLite가 그 내용을 복원한 파일 위에 다시 적용하므로 셋을 함께 옮긴다."""
        import shutil
        keep_dir.mkdir(parents=True, exist_ok=True)
        moved = []
        for suf in ("", "-wal", "-shm"):
            f = Path(str(dest) + suf)
            if f.exists():
                shutil.move(str(f), str(keep_dir / f.name))
                moved.append(f.name)
        tmp = Path(str(dest) + ".restoring")
        shutil.copy2(src, tmp)
        tmp.replace(dest)
        return moved

    def _has_table(self, name: str) -> bool:
        return self.q1("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)) is not None

    def _run_script(self, sql: str) -> None:
        with self.lock:
            self.conn.executescript(sql)


def _check_ident(s: str) -> None:
    """SQL 식에 그대로 넣는 이름은 영문 · 숫자 · _ 만 허용."""
    if not s.replace("_", "").isalnum() or not s.isascii():
        raise ValueError(f"허용되지 않는 이름: {s!r}")
