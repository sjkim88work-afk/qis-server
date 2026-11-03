"""한 번에 시작(qis.launcher) 시험: python -m pytest -q"""
import socket

from qis import launcher
from qis.auth import Auth
from qis.config import Config
from qis import db as dbmod


def cfg_at(tmp_path, port):
    c = Config()
    c.data_dir = tmp_path / "data"
    c.port = port
    return c


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_needs_init(tmp_path):
    c = cfg_at(tmp_path, 8080)
    assert launcher._needs_init(c)                 # 설정 파일 없음
    c.save()
    assert launcher._needs_init(c)                 # 설정은 있으나 사용자 없음 (설치 중단)
    open_db = getattr(dbmod, "open_db", None)
    d = open_db(c) if open_db else dbmod.DB(c.db_path)
    Auth(d, c).create_user("admin", "관리자", "admin", "Qadm2026x", must_change=False)
    d.close()
    assert not launcher._needs_init(c)


def test_port_state(tmp_path):
    c = cfg_at(tmp_path, free_port())
    assert launcher._is_qis(c) is None             # 비어 있음
    with socket.socket() as s:                     # QIS가 아닌 프로그램이 차지
        s.bind(("127.0.0.1", c.port))
        s.listen()
        assert launcher._is_qis(c) is False
