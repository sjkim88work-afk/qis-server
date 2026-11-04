"""QIS 데스크톱 프로그램 시작점 — python -m qis.desktop  (QIS.app · QIS.exe 가 부름)

  1. 사용자 데이터 폴더의 잠금을 얻음 (이미 열려 있으면 안내만 하고 끝)
  2. 창을 띄우고, 뒤에서: 지난번 비정상 종료면 DB 손상 검사 → 내장 서버 켜기 → 화면 열기
  3. 창을 닫으면: 아직 서버에 못 보낸 변경을 보낸 뒤 닫음 → 서버 끄기(DB 체크포인트) → 잠금 풀기
"""
from __future__ import annotations

import html
import logging
import logging.handlers
import os
import sys
import threading
import time

from .. import __version__
from ..config import load_config
from .instance import InstanceLock
from .paths import user_data_dir
from .server import DesktopServer, NullUI, open_with_os

log = logging.getLogger("qis.desktop")

PAGE = """<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#14213d;
font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#1d2433}
.c{background:#fff;border-radius:12px;padding:28px 30px;max-width:560px;box-shadow:0 10px 40px rgba(0,0,0,.25)}
h1{margin:0 0 8px;font-size:20px}p{margin:6px 0;color:#475467;font-size:13.5px;line-height:1.6;white-space:pre-line}
code{background:#f3f5f9;padding:2px 5px;border-radius:4px;font-size:12px;word-break:break-all}</style></head>
<body><div class="c"><h1>{title}</h1><p>{body}</p></div></body></html>"""


def page(title: str, body: str) -> str:
    return PAGE.replace("{title}", html.escape(title)).replace("{body}", body)


def setup_logging(data_dir) -> None:
    d = data_dir / "logs"
    d.mkdir(parents=True, exist_ok=True)
    h = logging.handlers.RotatingFileHandler(d / "qis-desktop.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.addHandler(h)
    root.setLevel(logging.INFO)
    # 창 프로그램(콘솔 없음)은 stdout 이 없음 — print 가 오류 나지 않게 로그 파일로
    if sys.stdout is None or sys.stderr is None:
        f = open(d / "console.log", "a", encoding="utf-8", errors="replace", buffering=1)
        sys.stdout = sys.stdout or f
        sys.stderr = sys.stderr or f


class WebviewUI(NullUI):
    """pywebview 창의 네이티브 대화상자 — 브라우저 폴더 선택(showDirectoryPicker)을 쓰지 않는다."""

    def __init__(self, window):
        self.w = window

    def pick_folder(self, start: str = ""):
        import webview
        r = self.w.create_file_dialog(webview.FileDialog.FOLDER, directory=start or "")
        return r[0] if r else None

    def pick_file(self, start: str = "", types=()):
        import webview
        r = self.w.create_file_dialog(webview.FileDialog.OPEN, directory=start or "", file_types=tuple(types))
        return r[0] if r else None

    def confirm(self, title: str, message: str) -> bool:
        return bool(self.w.create_confirmation_dialog(title, message))

    def load_url(self, url: str) -> None:
        self.w.load_url(url)

    def open_path(self, path) -> None:
        open_with_os(path)


def _flush_js():
    # 화면에 서버로 아직 못 보낸 변경이 있으면 보내기 시작하고 1, 없으면 0
    return "(function(){try{if(typeof srvUnsaved==='function'&&srvUnsaved()){if(typeof srvSync==='function')srvSync();return 1}}catch(e){}return 0})()"


def main() -> int:
    import webview

    cfg = load_config(user_data_dir())
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    setup_logging(cfg.data_dir)
    log.info("QIS 데스크톱 %s 시작 — 데이터 %s", __version__, cfg.data_dir)

    webview.settings["ALLOW_DOWNLOADS"] = True                 # 내보내기 · CSV · 백업 파일 저장 (저장 위치를 물음)
    webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True   # 새 창 링크는 PC 브라우저로 (이 창은 그대로)
    if cfg.desktop_mode == "server" and cfg.https:
        webview.settings["IGNORE_SSL_ERRORS"] = True            # 이 PC 자신(127.0.0.1)에 사내 인증서로 접속

    lock = InstanceLock(cfg.data_dir)
    if not lock.acquire():
        log.warning("이미 실행 중")
        webview.create_window("QIS", html=page(
            "QIS가 이미 열려 있습니다",
            "같은 데이터를 두 프로그램이 함께 고치면 손상될 수 있어 하나만 엽니다.\n"
            "열려 있는 QIS 창을 쓰세요 (Dock · 작업 표시줄 확인).\n\n"
            f"데이터 폴더: <code>{html.escape(str(cfg.data_dir))}</code>"), width=560, height=320)
        webview.start()
        return 0

    window = webview.create_window(f"QIS {__version__}", html=page("QIS를 여는 중…", "잠시만 기다려 주세요."),
                                   width=1440, height=920, min_size=(960, 620), text_select=True)
    ui = WebviewUI(window)
    ctrl = DesktopServer(cfg, ui=ui, lock=lock)
    state = {"close_ok": False, "flushing": False}

    def boot():
        try:
            pre = ctrl.preflight()
            if pre["check"] != "ok":
                latest = ctrl.latest_backup()
                msg = ("지난번에 QIS가 정상적으로 닫히지 않았고, 데이터 파일 검사에서 문제가 발견됐습니다.\n"
                       f"({pre['check'][:200]})\n\n")
                if latest and ui.confirm("데이터 손상 발견",
                                         msg + f"가장 최근 백업 '{latest.name}' 으로 복원할까요?\n"
                                               "지금 파일은 지우지 않고 restore_before_… 폴더에 보관합니다."):
                    from .importer import import_db_file
                    import_db_file(cfg, latest)
                    log.warning("손상 DB → 백업 %s 로 복원", latest.name)
                else:
                    window.load_html(page("데이터 파일을 확인해야 합니다", html.escape(msg) +
                                          "QIS를 닫고, 데이터 폴더의 backup 폴더에 있는 백업으로 복원하세요 "
                                          "(문서: 데스크톱_프로그램.md › 문제 해결).\n\n"
                                          f"데이터 폴더: <code>{html.escape(str(cfg.data_dir))}</code>"))
                    return
            ctrl.start()
            window.load_url(ctrl.entry_url())
            if ctrl.notice:
                ui.confirm("QIS", ctrl.notice)
        except Exception as e:
            log.exception("시작 실패")
            window.load_html(page("QIS를 시작하지 못했습니다", html.escape(str(e)) +
                                  f"\n\n기록: <code>{html.escape(str(cfg.data_dir / 'logs'))}</code>"))

    def flush_then_close():
        try:
            for _ in range(30):                  # 최대 6초 동안 저장 끝나기를 기다림
                if not window.evaluate_js(_flush_js()):
                    break
                time.sleep(0.2)
            else:
                if not ui.confirm("저장하지 못한 변경", "아직 저장하지 못한 변경이 있습니다. 그래도 닫을까요?\n"
                                                    "(취소를 누르면 창이 그대로 열려 있습니다)"):
                    return
        except Exception:
            log.exception("닫기 전 저장 확인 실패")
        state["close_ok"] = True
        window.destroy()

    def on_closing():
        if state["close_ok"] or not ctrl.running:
            return True
        if not state["flushing"]:
            state["flushing"] = True

            def go():
                try:
                    flush_then_close()
                finally:
                    state["flushing"] = False
            threading.Thread(target=go, daemon=True).start()
        return False                              # 저장을 확인한 뒤 flush_then_close 가 창을 닫음

    window.events.closing += on_closing
    try:
        webview.start(boot, private_mode=True, debug=bool(os.environ.get("QIS_DEBUG")))
    finally:
        ok = ctrl.started_ok
        ctrl.stop()
        lock.release(clean=ok)        # 정상적으로 켜졌다가 꺼졌을 때만 '비정상 종료' 표시를 지움
        log.info("QIS 데스크톱 종료")
    return 0


if __name__ == "__main__":
    sys.exit(main())
