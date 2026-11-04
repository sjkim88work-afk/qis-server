"""같은 데이터 폴더를 두 프로그램이 동시에 열지 않게 하는 잠금 + 비정상 종료 표시.

· qis.lock     실행 중인 동안 운영체제 파일 잠금을 쥐고 있음. 프로그램이 강제 종료돼도 운영체제가 풀어 줌
· qis.running  실행하는 동안만 있는 표시 파일. 정상 종료 때 지움 →
               다음 실행 때 남아 있으면 '지난번에 비정상 종료' → DB 손상 검사
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path


def _try_lock(fh) -> bool:
    try:
        if os.name == "nt":
            import msvcrt
            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except OSError:
        return False


def _unlock(fh) -> None:
    try:
        if os.name == "nt":
            import msvcrt
            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
    except OSError:
        pass


class InstanceLock:
    def __init__(self, data_dir):
        self.dir = Path(data_dir)
        self.lock_path = self.dir / "qis.lock"
        self.mark_path = self.dir / "qis.running"
        self._fh = None
        self._mark = False
        self.was_dirty = False      # 지난 실행이 정상 종료되지 않았음

    @property
    def held(self) -> bool:
        return self._fh is not None

    def acquire(self, mark: bool = True) -> bool:
        """잠금을 얻으면 True. 다른 프로그램(QIS 창 · 서버)이 이 데이터 폴더를 쓰고 있으면 False."""
        if self._fh is not None:
            return True
        self.dir.mkdir(parents=True, exist_ok=True)
        fh = open(self.lock_path, "a+b")
        if not _try_lock(fh):
            fh.close()
            return False
        self._fh = fh
        self._mark = mark
        if mark:
            self.was_dirty = self.mark_path.exists()
            self.mark_path.write_text(json.dumps({"pid": os.getpid(), "started": datetime.now().isoformat(timespec="seconds")}),
                                      encoding="utf-8")
        return True

    def release(self, clean: bool = True) -> None:
        """clean=False 면 표시 파일을 남김 → 다음 실행 때 다시 검사."""
        if self._fh is None:
            return
        if clean and self._mark:
            try:
                self.mark_path.unlink()
            except OSError:
                pass
        _unlock(self._fh)
        self._fh.close()
        self._fh = None

    def in_use_elsewhere(self) -> bool:
        """다른 프로그램이 잠금을 쥐고 있는지만 확인 (잠금을 가져가지 않음)."""
        if self._fh is not None:
            return False
        if not self.lock_path.exists():
            return False
        fh = open(self.lock_path, "a+b")
        try:
            if _try_lock(fh):
                _unlock(fh)
                return False
            return True
        finally:
            fh.close()
