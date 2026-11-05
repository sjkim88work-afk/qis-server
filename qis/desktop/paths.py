"""데이터 폴더 위치 — 프로그램 폴더가 아니라 사용자 데이터 폴더.

프로그램(QIS.app · QIS 폴더)을 새 버전으로 바꿔도 데이터는 그대로 남는다.
  맥      ~/Library/Application Support/QIS
  윈도우  %LOCALAPPDATA%\\QIS   (예: C:\\Users\\이름\\AppData\\Local\\QIS)
  그 밖   ~/.local/share/QIS
환경변수 QIS_DESKTOP_DIR 로 바꿀 수 있음 (시험 · 특별한 경우).

윈도우는 1.3.5 까지 %APPDATA%(Roaming)에 두었다. 회사 PC가 로밍 프로필 · 폴더 리디렉션을 쓰면
Roaming 폴더가 로그온 · 로그오프 때 네트워크로 동기화되어 SQLite DB가 손상되거나 느려질 수 있어
Local 로 옮긴다. 예전 폴더가 있으면 처음 실행 때 한 번 옮기고(migrate_legacy), 원본은 지우지 않고
'QIS_이전됨_날짜' 이름으로 남긴다.
"""
from __future__ import annotations

import logging
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

APP_NAME = "QIS"
MARKERS = ("qis.db", "desktop.json")        # 이것 중 하나라도 있으면 '쓰던 데이터 폴더'

log = logging.getLogger("qis.desktop")
# 이번 실행에서 데이터 폴더를 옮긴 결과 (기록 파일이 준비되기 전이라 나중에 기록에 남김)
migration_note: str = ""


def _has_data(p: Path) -> bool:
    return any((p / m).exists() for m in MARKERS)


def _fix_config_paths(old: Path, new: Path) -> None:
    """옮긴 폴더의 qis.json 에 예전 폴더 경로(인증서 · 백업 위치 등)가 적혀 있으면 새 경로로 바꿈."""
    import json
    f = new / "qis.json"
    if not f.is_file():
        return
    try:
        d = json.loads(f.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    if not isinstance(d, dict):
        return
    o = str(old)
    changed = False
    for k, v in d.items():
        if isinstance(v, str) and (v == o or v.lower().startswith(o.lower() + os.sep) or v.lower().startswith(o.lower() + "/")):
            d[k] = str(new) + v[len(o):]
            changed = True
    if changed:
        f.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")


def migrate_legacy(old: Path, new: Path) -> Path:
    """예전 데이터 폴더(old)를 새 위치(new)로 옮기고 쓸 폴더를 돌려준다. 실패하면 old 를 그대로 쓴다.

    · new 에 이미 데이터가 있으면 아무것도 안 함 → new
    · old 에 데이터가 없으면 → new
    · old 를 다른 QIS(예전 버전)가 쓰는 중이면 → old (다음 실행 때 다시 시도)
    · 같은 드라이브면 폴더 이름 바꾸기, 아니면(Roaming 이 네트워크로 리디렉션된 경우) 복사 후 원본은 이름만 바꿔 보관
    """
    global migration_note
    old, new = Path(old), Path(new)
    if _has_data(new) or not old.is_dir() or not _has_data(old):
        return new
    from .lock import AlreadyRunning, InstanceLock
    lk = InstanceLock(old)
    try:
        lk.acquire()
    except AlreadyRunning:
        migration_note = f"예전 데이터 폴더를 다른 QIS가 쓰는 중이라 옮기지 못함 — 그대로 사용: {old}"
        return old
    except OSError as e:
        migration_note = f"예전 데이터 폴더 확인 실패 — 그대로 사용: {old} ({e})"
        return old
    lk.release()
    keep = old.with_name(f"{APP_NAME}_이전됨_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    tmp = new.with_name(new.name + ".moving")
    try:
        new.parent.mkdir(parents=True, exist_ok=True)
        if new.exists():
            if any(new.iterdir()):     # 데이터는 없지만 무언가 있음(기록 폴더 등) → 덮지 않게 옆으로
                new.rename(new.with_name(f"{new.name}_빈폴더_{datetime.now().strftime('%Y%m%d_%H%M%S')}"))
            else:
                new.rmdir()
        try:
            os.rename(old, new)        # 같은 드라이브: 바로 옮김
            _fix_config_paths(old, new)
            migration_note = f"데이터 폴더를 옮겼습니다: {old} → {new}"
            return new
        except OSError:
            pass
        shutil.rmtree(tmp, ignore_errors=True)
        shutil.copytree(old, tmp, ignore=shutil.ignore_patterns("qis.lock", "desktop.running"))
        os.rename(tmp, new)
        _fix_config_paths(old, new)
        try:
            os.rename(old, keep)       # 원본은 지우지 않고 보관 (예전 버전이 다시 쓰지 않게 이름만 바꿈)
        except OSError:
            pass
        migration_note = f"데이터 폴더를 복사해 옮겼습니다: {old} → {new} (원본 보관: {keep if keep.exists() else old})"
        return new
    except Exception as e:             # 어떤 이유로든 실패 → 예전 폴더를 계속 씀 (데이터 안전이 우선)
        shutil.rmtree(tmp, ignore_errors=True)
        migration_note = f"데이터 폴더 옮기기 실패 — 예전 폴더 그대로 사용: {old} ({e})"
        return old


def user_data_dir(create: bool = True) -> Path:
    env = os.environ.get("QIS_DESKTOP_DIR")
    if env:
        p = Path(env)
    elif sys.platform == "darwin":
        p = Path.home() / "Library" / "Application Support" / APP_NAME
    elif sys.platform.startswith("win"):
        local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        roaming = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        p = Path(local) / APP_NAME
        if create:
            p = migrate_legacy(Path(roaming) / APP_NAME, p)
    else:
        base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
        p = Path(base) / APP_NAME
    p = p.resolve()
    if create:
        p.mkdir(parents=True, exist_ok=True)
    return p
