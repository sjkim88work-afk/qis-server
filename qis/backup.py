"""서버 자동 백업.

매일 정한 시각(기본 02시) 이후 첫 확인 때 한 번:
  backup/db/qis_YYYYMMDD_HHMM.sqlite   DB 전체 사본 (확장자는 DB 종류에 따라) (보관 개수만큼 유지)
  backup/json/QIS_서버백업_YYYYMMDD.json  기록 전체 (기존 QIS 화면에서 '백업으로 교체'로 열 수 있음, 사진 제외)
  backup/files/…                        첨부 파일 사본 (새 파일만 복사, 지우지 않음)
backup_dir 을 다른 PC · 네트워크 드라이브로 지정하면 서버 PC가 고장 나도 복구 가능.
"""
from __future__ import annotations

import json
import shutil
import threading
import time
from datetime import datetime
from pathlib import Path

from .db import DB, now


class Backup:
    def __init__(self, db: DB, store, cfg):
        self.db = db
        self.store = store
        self.cfg = cfg
        self._stop = threading.Event()
        self._run_lock = threading.Lock()

    @property
    def root(self) -> Path:
        return self.cfg.backup_path

    def run(self, reason="auto", user=None) -> dict:
        with self._run_lock:
            t0 = time.time()
            stamp = datetime.now().strftime("%Y%m%d_%H%M")
            day = stamp[:8]
            if reason not in ("auto", "manual"):   # 비우기 · 가져오기 전 안전 사본 — 같은 분에 겹쳐도 덮어쓰지 않게
                stamp = datetime.now().strftime("%Y%m%d_%H%M%S") + "_" + reason
            (self.root / "db").mkdir(parents=True, exist_ok=True)
            (self.root / "json").mkdir(parents=True, exist_ok=True)
            dbf = self.root / "db" / f"qis_{stamp}{self.db.backup_suffix}"
            self.db.backup_to(dbf)
            jf = self.root / "json" / f"QIS_서버백업_{day}.json"
            tmp = jf.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.store.export(), ensure_ascii=False), encoding="utf-8")
            tmp.replace(jf)
            copied = self._mirror_files()
            self._prune(self.root / "db", f"qis_*{self.db.backup_suffix}")
            self._prune(self.root / "json", "QIS_서버백업_*.json")
            info = {"at": now(), "reason": reason, "db": dbf.name, "files_copied": copied,
                    "seconds": round(time.time() - t0, 1), "dir": str(self.root)}
            self.db.set_meta("last_backup", json.dumps(info, ensure_ascii=False))
            with self.db.tx() as c:
                self.db.audit(c, user=user, action="backup", label=dbf.name, detail=info)
            return info

    def _mirror_files(self) -> int:
        src = self.cfg.files_dir
        dst = self.root / "files"
        n = 0
        if not src.exists():
            return 0
        for p in src.rglob("*.json"):
            q = dst / p.relative_to(src)
            try:
                st = p.stat()
                if q.exists() and q.stat().st_size == st.st_size and q.stat().st_mtime >= st.st_mtime:
                    continue
                q.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(p, q)
                n += 1
            except OSError:
                pass
        return n

    def _prune(self, d: Path, pat: str):
        keep = max(1, int(self.cfg.backup_keep))
        fs = sorted(d.glob(pat))
        for f in fs[:-keep]:
            try:
                f.unlink()
            except OSError:
                pass

    def last(self) -> dict | None:
        v = self.db.get_meta("last_backup")
        return json.loads(v) if v else None

    def list(self) -> list[dict]:
        d = self.root / "db"
        if not d.exists():
            return []
        return [{"name": f.name, "size": f.stat().st_size} for f in sorted(d.glob(f"qis_*{self.db.backup_suffix}"), reverse=True)]

    def due(self) -> bool:
        n = datetime.now()
        if n.hour < int(self.cfg.backup_hour):
            return False
        last = self.last()
        if not last:
            return True
        try:
            at = datetime.fromisoformat(last["at"].replace("Z", "+00:00")).astimezone()
        except Exception:
            return True
        return at.date() < n.date()

    def start(self):
        def loop():
            while not self._stop.wait(5):
                try:
                    if self.due():
                        self.run("auto")
                except Exception as e:  # 백업 실패는 기록만 하고 계속
                    try:
                        self.db.set_meta("last_backup_error", json.dumps({"at": now(), "error": str(e)}, ensure_ascii=False))
                    except Exception:
                        pass
                self._stop.wait(600)
        threading.Thread(target=loop, name="qis-backup", daemon=True).start()

    def stop(self):
        self._stop.set()
