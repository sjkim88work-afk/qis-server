"""SQLite 저장소 (파일 하나: data/qis.db).

· 연결 하나를 잠금으로 보호해 씀 — 품질팀 수십 명 규모에 충분
· WAL 모드: 읽기와 쓰기가 서로 막지 않음, 갑작스런 종료에도 안전
· 나중에 PostgreSQL로 옮길 때는 이 파일과 store.py 의 SQL만 바꾸면 됨
"""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1

SCHEMA = """
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


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class DB:
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
            self.conn.executescript(SCHEMA)
            if self.get_meta("schema") is None:
                self.set_meta("schema", str(SCHEMA_VERSION))
                self.set_meta("seq", "0")
                self.set_meta("created", now())

    # ---- 기본 ----
    @contextmanager
    def tx(self):
        """쓰기 묶음: 전부 저장되거나 전부 취소."""
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

    def x(self, sql: str, args=()):
        with self.lock:
            return self.conn.execute(sql, args)

    def get_meta(self, k: str):
        r = self.q1("SELECT v FROM meta WHERE k=?", (k,))
        return r["v"] if r else None

    def set_meta(self, k: str, v: str) -> None:
        self.x("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (k, v))

    def next_seq(self, c) -> int:
        """트랜잭션 안에서 호출."""
        s = int(c.execute("SELECT v FROM meta WHERE k='seq'").fetchone()["v"]) + 1
        c.execute("UPDATE meta SET v=? WHERE k='seq'", (str(s),))
        return s

    def seq(self) -> int:
        return int(self.get_meta("seq") or 0)

    def audit(self, c, *, user=None, action: str, coll=None, rec_id=None, label=None, detail=None, ip=None):
        import json
        c.execute(
            "INSERT INTO audit(ts,user_id,username,name,action,coll,rec_id,label,detail,ip) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (now(), user["id"] if user else None, user["username"] if user else None, user["name"] if user else None,
             action, coll, rec_id, label, json.dumps(detail, ensure_ascii=False) if detail is not None else None, ip))

    def backup_to(self, dest: Path) -> None:
        """실행 중에도 일관된 사본을 만든다 (SQLite 온라인 백업)."""
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(".tmp")
        out = sqlite3.connect(str(tmp))
        with self.lock:
            self.conn.backup(out)
        out.close()
        tmp.replace(dest)

    def close(self):
        with self.lock:
            self.conn.close()
