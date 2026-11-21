"""QIS 데스크톱 프로그램 실행: python -m qis.desktop

  --data 폴더          데이터 폴더 바꾸기 (기본: 맥 ~/Library/Application Support/QIS, 윈도우 %APPDATA%\\QIS)
  --selftest 결과.json  창 없이 점검 (빌드 확인용): 임시 폴더에서 서버 켜기 · 로그인 화면 · 끄기
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path


def selftest(out: str | None, unblocked: int = 0) -> int:
    """묶음 프로그램(PyInstaller)에 서버 · 화면 파일 · 창 라이브러리가 모두 들어갔는지 확인."""
    import http.cookiejar
    import socket
    import urllib.request

    from .. import __version__
    from . import core
    res = {"version": __version__, "platform": sys.platform, "checks": {}, "unblocked": unblocked}
    ok = True

    def chk(name, cond, detail=""):
        nonlocal ok
        res["checks"][name] = {"ok": bool(cond), "detail": str(detail)[:300]}
        ok = ok and bool(cond)

    try:
        with tempfile.TemporaryDirectory(prefix="qis_selftest_") as tmp:
            data = Path(tmp) / "QIS"
            data.mkdir()
            cfg = core.desktop_config(data)
            st = core.DesktopSettings(mode="lan", lan_scope="local")
            core.set_lan_admin(cfg, "admin", "점검", "Qchk2026pwx")
            core.prepare(cfg, st)
            r = core.ServerRunner(cfg, st).start()
            try:
                host, port = r.bound
                chk("bind_localhost", host == "127.0.0.1", f"{host}:{port}")
                op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
                with op.open(r.enter_url, timeout=10) as resp:
                    page = resp.read().decode("utf-8")
                chk("login_page", "/login" in resp.url and 'id="p"' in page, resp.url)
                with op.open(r.base_url + "/desktop.js", timeout=10) as resp:
                    chk("desktop_js", resp.status == 200)
                with op.open(r.base_url + "/lib/sql-wasm.wasm", timeout=10) as resp:
                    chk("web_files", resp.status == 200)
            finally:
                r.stop()
            with socket.socket() as s:
                s.settimeout(1)
                chk("stopped", s.connect_ex(("127.0.0.1", port)) != 0)
            chk("wal_checkpointed", not (data / "qis.db-wal").exists() or (data / "qis.db-wal").stat().st_size == 0)
    except Exception as e:
        chk("server", False, repr(e))
    try:
        import webview  # noqa: F401
        plat = "cocoa" if sys.platform == "darwin" else "winforms" if sys.platform.startswith("win") else None
        if plat:
            __import__(f"webview.platforms.{plat}")
        chk("webview", True, plat or "")
    except Exception as e:
        chk("webview", False, repr(e))
    res["ok"] = ok
    txt = json.dumps(res, ensure_ascii=False, indent=2)
    if out:
        Path(out).write_text(txt, encoding="utf-8")
    try:
        print(txt)
    except Exception:
        pass
    return 0 if ok else 1


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="QIS", description="QIS 품질정보시스템 데스크톱")
    ap.add_argument("--data", help="데이터 폴더")
    ap.add_argument("--selftest", nargs="?", const="", default=None, metavar="결과.json")
    a, _ = ap.parse_known_args(argv)      # 맥이 붙이는 -psn_… 같은 인자는 무시
    from . import winfix
    n = winfix.unblock()                   # 윈도우: 받은 zip 의 '인터넷에서 받은 파일' 표시 지우기 (창 라이브러리 전에)
    if a.selftest is not None:
        return selftest(a.selftest or None, n)
    try:
        from .gui import Controller
        return Controller(Path(a.data) if a.data else None).run()
    except Exception as e:
        # 오류 내용(영문 traceback) 대신 할 일을 알려 주는 창 · 자세한 내용은 logs/desktop.log
        import logging
        logging.getLogger("qis.desktop").exception("시작 실패")
        if getattr(sys, "frozen", False):
            winfix.message_box("QIS", winfix.startup_error_text(e))
            return 1
        raise


if __name__ == "__main__":
    sys.exit(main())
