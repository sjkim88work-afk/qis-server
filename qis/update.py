"""새 버전 확인 — 공개 배포 저장소(qis-releases)의 latest.json 을 하루 한 번 읽어 알려 준다. 자동 설치는 하지 않는다.

latest.json (desktop.yml 의 release 단계가 만듦):
  {"version": "1.3.9", "build": "2026-11-20", "notes": "…", "page": "https://github.com/…/releases/tag/v1.3.9",
   "assets": {"windows": "https://…/QIS-windows.zip", "mac": "https://…/QIS-mac.zip"}}
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

from . import __build__, __version__

log = logging.getLogger("qis.update")
CHECK_EVERY = 24 * 3600


def vtuple(v: str) -> tuple:
    return tuple(int(x) for x in re.findall(r"\d+", str(v or ""))[:4]) or (0,)


class Updater:
    def __init__(self, db, cfg, fetch=None):
        self.db, self.cfg = db, cfg
        self._fetch = fetch or self._http_fetch
        self._stop = threading.Event()
        self._th = None

    # ------------------------------------------------------------ 확인
    @staticmethod
    def _http_fetch(url: str) -> dict:
        req = urllib.request.Request(url, headers={"User-Agent": f"QIS/{__version__}", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode("utf-8"))

    def check(self, force: bool = False) -> dict:
        """latest.json 을 읽어 meta 에 저장. force 가 아니면 하루 한 번만. 실패해도 조용히(마지막 오류만 기록)."""
        if not self.cfg.update_check and not force:
            return self.status()
        last = self.db.get_meta("update_checked_at") or ""
        if not force and last:
            try:
                if (datetime.now(timezone.utc) - datetime.fromisoformat(last.replace("Z", "+00:00"))).total_seconds() < CHECK_EVERY:
                    return self.status()
            except ValueError:
                pass
        try:
            info = self._fetch(self.cfg.update_url)
            if not isinstance(info, dict) or not info.get("version"):
                raise ValueError("latest.json 형식이 아닙니다")
            keep = {k: info.get(k) for k in ("version", "build", "notes", "page", "assets")}
            self.db.set_meta("update_info", json.dumps(keep, ensure_ascii=False))
            self.db.set_meta("update_error", "")
        except Exception as e:  # 인터넷 없음 · 차단 · 형식 오류 — 알림 기능일 뿐이므로 조용히
            msg = str(e) if not isinstance(e, urllib.error.URLError) else "연결하지 못했습니다"
            self.db.set_meta("update_error", msg[:200])
            log.info("업데이트 확인 실패: %s", msg)
        self.db.set_meta("update_checked_at", datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"))
        return self.status()

    def status(self) -> dict:
        raw = self.db.get_meta("update_info")
        info = json.loads(raw) if raw else None
        st = {"current": __version__, "build": __build__, "checked_at": self.db.get_meta("update_checked_at") or "",
              "error": self.db.get_meta("update_error") or "", "enabled": bool(self.cfg.update_check),
              "available": False, "latest": None}
        if not info:
            return st
        st["latest"] = info
        st["available"] = vtuple(info.get("version")) > vtuple(__version__)
        return st

    def public(self) -> dict:
        s = self.status()
        if not s["available"]:
            return {"available": False}
        return {"available": True, "version": s["latest"].get("version"), "page": s["latest"].get("page")}

    # ------------------------------------------------------------ 배경 확인
    def start(self):
        if self._th or not self.cfg.update_check:
            return
        self._th = threading.Thread(target=self._loop, name="qis-update", daemon=True)
        self._th.start()

    def stop(self):
        self._stop.set()

    def _loop(self):
        time.sleep(20)                     # 시작 직후 바쁜 시간은 피함
        while not self._stop.is_set():
            try:
                self.check()
            except Exception:
                log.exception("업데이트 확인")
            self._stop.wait(3600)
