"""데이터 폴더 위치 — 프로그램 폴더가 아니라 사용자 데이터 폴더에 둔다 (프로그램을 바꿔도 데이터 유지)."""
from __future__ import annotations

import os
import sys
from pathlib import Path


def user_data_dir() -> Path:
    """맥: ~/Library/Application Support/QIS · 윈도우: %APPDATA%\\QIS · 그 밖: ~/.local/share/QIS
    환경변수 QIS_DATA_DIR 가 있으면 그 폴더 (시험 · 휴대용)."""
    env = os.environ.get("QIS_DATA_DIR")
    if env:
        return Path(env).expanduser().resolve()
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "QIS"
    if sys.platform.startswith("win"):
        base = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(base) / "QIS"
    base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(base) / "QIS"


def os_user_name() -> str:
    try:
        import getpass
        return getpass.getuser() or "사용자"
    except Exception:
        return "사용자"
