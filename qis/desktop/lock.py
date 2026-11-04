"""단일 실행 잠금 — 같은 데이터 폴더를 프로그램 두 개가 동시에 열지 못하게.

데이터 폴더의 qis.lock 파일을 운영체제 잠금으로 잡는다. 프로그램이 비정상 종료돼도
운영체제가 잠금을 풀어 주므로, 다음 실행이 '이미 열려 있음'으로 막히지 않는다.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


class AlreadyRunning(Exception):
    pass


class InstanceLock:
    def __init__(self, data_dir: Path):
        self.path = Path(data_dir) / "qis.lock"
        self._f = None

    def acquire(self) -> "InstanceLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        f = open(self.path, "a+")
        try:
            if sys.platform.startswith("win"):
                import msvcrt
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as e:
            f.close()
            raise AlreadyRunning(f"QIS가 이미 이 데이터 폴더로 열려 있습니다: {self.path.parent}") from e
        f.seek(0)
        f.truncate()
        f.write(str(os.getpid()))
        f.flush()
        self._f = f
        return self

    def release(self) -> None:
        f, self._f = self._f, None
        if not f:
            return
        try:
            if sys.platform.startswith("win"):
                import msvcrt
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        except OSError:
            pass
        f.close()

    @property
    def held(self) -> bool:
        return self._f is not None

    def __enter__(self):
        return self.acquire()

    def __exit__(self, *a):
        self.release()
