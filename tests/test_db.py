"""DB 계층 시험: python -m pytest -q

· db_url 해석 · 아직 없는 PostgreSQL 안내
· 1차 버전으로 만든 DB를 그대로 열 수 있는지 (데이터 · 순번 유지)
· 아이디 대소문자 무시 (기존 동작 유지)
· DB 전용 문법이 공통 코드에 다시 들어오지 않았는지 (나중에 PostgreSQL로 바꾸기 쉽게)
"""
import ast
import re
import sqlite3
from pathlib import Path

import pytest

from qis.__main__ import main
from qis.auth import Auth, AuthError
from qis.config import Config
from qis.db import DBConfigError, SqliteDB, db_ready, open_db, parse_db_url
from qis.db.sqlite import SCHEMA_1

ROOT = Path(__file__).resolve().parents[1]


def cfg_at(tmp_path, url=""):
    c = Config()
    c.data_dir = tmp_path / "data"
    c.db_url = url
    return c


def test_parse_db_url(tmp_path):
    c = cfg_at(tmp_path)
    assert parse_db_url(c) == ("sqlite", c.db_path)
    c.db_url = "sqlite:///other.db"
    assert parse_db_url(c) == ("sqlite", c.data_dir / "other.db")
    absf = tmp_path / "abs.db"
    c.db_url = "sqlite:///" + str(absf)
    assert parse_db_url(c) == ("sqlite", absf)
    c.db_url = "postgresql://qis_app@localhost:5432/qis"
    assert parse_db_url(c)[0] == "postgresql"
    c.db_url = "mysql://x"
    with pytest.raises(DBConfigError):
        parse_db_url(c)


def test_postgres_not_yet(tmp_path, capsys):
    c = cfg_at(tmp_path, "postgresql://qis_app@localhost:5432/qis")
    with pytest.raises(DBConfigError, match="PostgreSQL"):
        open_db(c)
    # 명령에서도 오류 대신 안내 문장으로 끝남
    c.data_dir.mkdir(parents=True)
    (c.data_dir / "qis.json").write_text('{"db_url": "postgresql://qis_app@localhost/qis"}', encoding="utf-8")
    assert main(["--data", str(c.data_dir), "backup"]) == 1
    assert "DB 설정 오류" in capsys.readouterr().out


def test_new_db_and_ready(tmp_path):
    c = cfg_at(tmp_path)
    assert not db_ready(c)
    db = open_db(c)
    assert isinstance(db, SqliteDB) and db_ready(c)
    assert db.schema_version() == 1 and db.seq() == 0 and db.get_meta("created")
    db.close()


def test_opens_db_made_by_first_version(tmp_path):
    """1차 버전이 만든 qis.db 와 같은 파일 → 내용 · 순번 · 스키마 번호가 그대로."""
    c = cfg_at(tmp_path)
    c.data_dir.mkdir(parents=True)
    con = sqlite3.connect(c.db_path)
    con.executescript(SCHEMA_1)
    con.executemany("INSERT INTO meta(k,v) VALUES(?,?)", [("schema", "1"), ("seq", "42"), ("created", "2026-10-30T00:00:00.000Z")])
    con.execute("INSERT INTO records(coll,id,rev,seq,data) VALUES('defects','d1',3,42,'{\"no\":\"X\"}')")
    con.commit()
    con.close()
    db = open_db(c)
    assert db.seq() == 42 and db.schema_version() == 1 and db.get_meta("created") == "2026-10-30T00:00:00.000Z"
    r = db.q1(f"SELECT rev, {db.json_text('data', 'no')} AS no FROM records WHERE id='d1'")
    assert r["rev"] == 3 and r["no"] == "X"
    with db.tx() as t:
        assert db.next_seq(t) == 43
    db.close()


def test_username_case_insensitive(tmp_path):
    db = open_db(cfg_at(tmp_path))
    a = Auth(db, cfg_at(tmp_path))
    u = a.create_user("Admin", "관리자", "admin", "Qadm2026x", must_change=False)
    assert isinstance(u["id"], int)
    with pytest.raises(AuthError):
        a.create_user("ADMIN", "다른 사람", "editor", "Editor1234")
    assert db.q1("SELECT id FROM users WHERE lower(username)=lower(?)", ("admin",))["id"] == u["id"]
    db.close()


def test_json_text_rejects_odd_names(tmp_path):
    db = open_db(cfg_at(tmp_path))
    with pytest.raises(ValueError):
        db.json_text("data", "no') OR 1=1 --")
    db.close()


# 공통 코드(qis/db/sqlite.py 밖)에 쓰면 안 되는 DB 전용 문법 — base.py 의 작성 규칙
FORBIDDEN = [r"INSERT\s+OR\s+(REPLACE|IGNORE)", r"json_extract", r"\blastrowid\b", r"\bPRAGMA\b",
             r"COLLATE\s+NOCASE", r"\bimport\s+sqlite3\b", r"BEGIN\s+IMMEDIATE", r"sqlite_master",
             r"\bWHERE\s+username\s*=\s*\?"]


def _without_module_docstring(text: str) -> str:
    """파일 맨 위 설명(docstring)은 SQL이 아니므로 빈 줄로 바꿔 검사에서 뺌 (줄 번호는 유지)."""
    body = ast.parse(text).body
    if body and isinstance(body[0], ast.Expr) and isinstance(getattr(body[0], "value", None), ast.Constant) \
            and isinstance(body[0].value.value, str):
        lines = text.split("\n")
        for i in range(body[0].lineno - 1, body[0].end_lineno):
            lines[i] = ""
        return "\n".join(lines)
    return text


def test_no_db_specific_sql_outside_implementation():
    bad = []
    for p in sorted((ROOT / "qis").rglob("*.py")):
        if p.name == "sqlite.py" and p.parent.name == "db":
            continue
        text = _without_module_docstring(p.read_text(encoding="utf-8"))
        for pat in FORBIDDEN:
            for m in re.finditer(pat, text, re.I):
                line = text.count("\n", 0, m.start()) + 1
                bad.append(f"{p.relative_to(ROOT)}:{line} {m.group(0)}")
    assert not bad, "DB 전용 문법은 qis/db/ 구현 안에만 두세요:\n" + "\n".join(bad)
