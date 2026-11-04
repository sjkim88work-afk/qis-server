"""DB 공통 부분 — SQLite · PostgreSQL 구현이 함께 쓰는 기능과 지켜야 할 약속.

다른 모듈(store · auth · files · backup · app)은 이 파일에 있는 기능만 쓴다.
DB마다 다른 것은 구현 클래스(sqlite.py, 이후 postgres.py)에만 둔다.

SQL 작성 규칙 (두 DB에서 똑같이 동작하도록)
  · 값 자리는 ? 로 쓴다. PostgreSQL 구현이 보낼 때 %s 로 바꾼다
  · 표준 문법만: INSERT … ON CONFLICT(…) DO UPDATE SET x=excluded.x, COUNT(*), JOIN, ORDER BY, LIMIT
  · 쓰지 않는 것: INSERT OR REPLACE, json_extract, COLLATE NOCASE 비교, lastrowid, PRAGMA
  · JSON 안의 값을 조건에 쓸 때는 db.json_text("data", "no") 로 만든 식을 넣는다
  · 대소문자 무시 비교는 lower(col)=lower(?)
  · 새로 넣은 줄의 번호가 필요하면 db.insert_id(c, sql, args)
  · 테이블을 바꿀 때는 구현마다 MIGRATIONS 에 같은 번호로 하나씩 추가한다
"""
from __future__ import annotations

import json
from abc import ABC, abstractmethod
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class Database(ABC):
    kind: str = ""            # "sqlite" · "postgresql"
    backup_suffix: str = ""   # 백업 파일 확장자 (".sqlite" 등)
    MIGRATIONS: dict[int, str] = {}   # 스키마 번호 → 만드는 SQL (번호 순서대로 한 번씩 적용)

    # ---- 구현이 채우는 부분 ----
    @abstractmethod
    @contextmanager
    def tx(self) -> Iterator:
        """쓰기 묶음: 전부 저장되거나 전부 취소. 넘겨주는 c 는 c.execute(sql, args) 를 지원.

        묶음은 한 번에 하나씩만 실행된다 (변경 순번 seq 가 확정 순서와 같아야 동기화가 빠짐없이 됨)."""

    @abstractmethod
    def q(self, sql: str, args=()) -> list:
        """여러 줄 조회. 각 줄은 r["열이름"] 으로 읽는다."""

    @abstractmethod
    def q1(self, sql: str, args=()):
        """한 줄 조회 (없으면 None)."""

    @abstractmethod
    def x(self, sql: str, args=()) -> None:
        """묶음 없이 한 문장 실행 (단독 변경)."""

    @abstractmethod
    def json_text(self, col: str, key: str) -> str:
        """JSON 열 col 안의 key 값을 문자열로 꺼내는 SQL 식."""

    @abstractmethod
    def insert_id(self, c, sql: str, args=()) -> int:
        """INSERT 를 실행하고 새 줄의 자동 번호(id)를 돌려준다."""

    @abstractmethod
    def backup_to(self, dest: Path) -> None:
        """실행 중에도 일관된 사본을 dest 에 만든다."""

    @abstractmethod
    def close(self) -> None: ...

    @abstractmethod
    def _has_table(self, name: str) -> bool: ...

    @abstractmethod
    def _run_script(self, sql: str) -> None:
        """여러 문장 SQL 실행 (스키마 만들기)."""

    # ---- 공통 ----
    def describe(self) -> str:
        return self.kind

    def checkpoint(self) -> None:
        """종료 전 정리 (SQLite: WAL 내용을 DB 파일에 합침). 서버형 DB는 할 일 없음."""

    def schema_version(self) -> int:
        if not self._has_table("meta"):
            return 0
        return int(self.get_meta("schema") or 0)

    def migrate(self) -> None:
        """아직 적용하지 않은 스키마 번호만 차례로 적용. 처음 만든 DB면 기본 meta 값을 넣는다."""
        cur = self.schema_version()
        for n in sorted(self.MIGRATIONS):
            if n > cur:
                self._run_script(self.MIGRATIONS[n])
                self.set_meta("schema", str(n))
        if cur == 0:
            if self.get_meta("seq") is None:
                self.set_meta("seq", "0")
            if self.get_meta("created") is None:
                self.set_meta("created", now())

    def get_meta(self, k: str):
        r = self.q1("SELECT v FROM meta WHERE k=?", (k,))
        return r["v"] if r else None

    def set_meta(self, k: str, v: str) -> None:
        self.x("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (k, v))

    def next_seq(self, c) -> int:
        """서버 전체 변경 순번 +1. tx() 안에서 호출."""
        s = int(c.execute("SELECT v FROM meta WHERE k='seq'").fetchone()["v"]) + 1
        c.execute("UPDATE meta SET v=? WHERE k='seq'", (str(s),))
        return s

    def seq(self) -> int:
        return int(self.get_meta("seq") or 0)

    def audit(self, c, *, user=None, action: str, coll=None, rec_id=None, label=None, detail=None, ip=None):
        c.execute(
            "INSERT INTO audit(ts,user_id,username,name,action,coll,rec_id,label,detail,ip) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (now(), user["id"] if user else None, user["username"] if user else None, user["name"] if user else None,
             action, coll, rec_id, label, json.dumps(detail, ensure_ascii=False) if detail is not None else None, ip))
