"""데이터 폴더 위치 — 프로그램 폴더가 아니라 사용자 데이터 폴더.

프로그램(QIS.app · QIS 폴더)을 새 버전으로 바꿔도 데이터는 그대로 남는다.
  맥      ~/Library/Application Support/QIS
  윈도우  %APPDATA%\\QIS   (예: C:\\Users\\이름\\AppData\\Roaming\\QIS)
  그 밖   ~/.local/share/QIS
환경변수 QIS_DESKTOP_DIR 로 바꿀 수 있음 (시험 · 특별한 경우).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

APP_NAME = "QIS"


def user_data_dir(create: bool = True) -> Path:
    env = os.environ.get("QIS_DESKTOP_DIR")
    if env:
        p = Path(env)
    elif sys.platform == "darwin":
        p = Path.home() / "Library" / "Application Support" / APP_NAME
    elif sys.platform.startswith("win"):
        base = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        p = Path(base) / APP_NAME
    else:
        base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
        p = Path(base) / APP_NAME
    p = p.resolve()
    if create:
        p.mkdir(parents=True, exist_ok=True)
    return p
