"""프로그램 창 (pywebview) — 창 · 화면 전환 · 다리(DesktopApi) · 닫을 때 저장 확인.

창과 화면 사이의 다리(DesktopApi)는 꼭 필요한 일만 한다: 모드 고르기(고르는 화면에서만) · 새 창 · 파일 저장/열기.
가져오기 · 복원처럼 데이터를 바꾸는 일은 화면(웹 페이지)에서 부를 수 없고 프로그램 메뉴(menu.py)에서만 한다.
첨부 저장 · 열어보기의 형식 검사는 attach.py 에 있다.
"""
from __future__ import annotations

import logging
import re
import shutil
import sys
import tempfile
import threading
import webbrowser
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .. import __version__
from . import attach, core, pages, paths
from .attach import OPEN_DIR, open_name  # noqa: F401  (open_name 은 시험 · 바깥에서 gui.open_name 으로 참조)
from .lock import AlreadyRunning, InstanceLock
from .menu import COPYRIGHT, MenuActions  # noqa: F401
from .paths import user_data_dir

log = logging.getLogger("qis.desktop")

TITLE = "QIS 품질정보시스템"

# 창을 닫기 전: 보내지 못한 변경을 서버로 보내고, 그래도 남았거나 작성 창이 고친 채 열려 있으면 1
FLUSH_JS = ("(async function(){try{if(typeof srvSync==='function')await srvSync()}catch(e){}"
            "var u=false;try{u=(typeof srvUnsaved==='function'&&srvUnsaved())||"
            "(typeof mfDirty!=='undefined'&&mfDirty&&typeof srvModalOpen==='function'&&srvModalOpen())}catch(e){}"
            "return u?1:0})()")


class DesktopApi:
    """화면의 window.pywebview.api — 공개 메서드만 화면에 보임 (밑줄로 시작하는 속성은 숨김).
    모든 메서드는 창에 열린 페이지가 QIS 것일 때만 동작 (_ok)."""

    def __init__(self, ctl: "Controller"):
        self._c = ctl

    def _ok(self, what: str) -> bool:
        """pywebview 는 창에 뜬 페이지가 어디 것이든 이 다리를 붙이므로, QIS 밖의 페이지가 열려 있으면 거부.
        (pywebview 가 인자 이름을 읽어 화면 쪽 함수를 만들므로 꾸밈 함수 대신 메서드마다 직접 확인)"""
        if self._c.api_trusted():
            return True
        log.warning("다리 호출 거부 (QIS 밖의 페이지가 열려 있음): %s", what)
        return False

    # 첫 실행 · 모드 바꾸기 화면
    def setup(self, d):
        if not self._ok("setup"):
            return None
        return self._c.apply_setup(d if isinstance(d, dict) else {})

    def cancel_setup(self):
        if not self._ok("cancel_setup"):
            return None
        self._c.back_to_app()

    def recover(self, choice):
        if not self._ok("recover"):
            return None
        return self._c.apply_recover(str(choice))

    def go_app(self):
        if not self._ok("go_app"):
            return None
        self._c.back_to_app()

    # QIS 화면 보조 (desktop.js)
    def reenter(self):
        if not self._ok("reenter"):
            return None
        r = self._c.runner
        return r.enter_url if r and r.mode == "solo" else None

    def open_page(self, path):
        if not self._ok("open_page"):
            return None
        self._c.open_page(str(path))

    def open_report(self, html):
        if not self._ok("open_report"):
            return None
        self._c.open_report(str(html))

    def save_file(self, name, data_url):
        if not self._ok("save_file"):
            return None
        return self._c.save_file(str(name), data_url)

    def open_file(self, name, data_url):
        if not self._ok("open_file"):
            return None
        return self._c.open_file(str(name), data_url)

    def export_backup(self):
        if not self._ok("export_backup"):
            return None
        return self._c.export_backup()

    def open_url(self, url):
        if not self._ok("open_url"):
            return None
        u = str(url)
        if re.match(r"^(mailto:|https?://)", u, re.I):
            webbrowser.open(u)


class Controller:
    def __init__(self, data_dir: Path | None = None):
        self.data_dir = Path(data_dir) if data_dir else user_data_dir()
        self.lock = InstanceLock(self.data_dir)
        self.cfg = None
        self.settings = None
        self.runner: core.ServerRunner | None = None
        self.window = None
        self.state = "init"          # setup · app · busy · recover
        self.api = DesktopApi(self)
        self.menu = MenuActions(self)
        self._closing_ok = False
        self._api_wins: list = []    # 다리(js_api)를 붙인 창들 — 주 창 · open_page 창
        self._own_bases: set[str] = set()   # 이번 실행에서 이 프로그램이 연 서버 주소들 (복원 뒤 포트가 바뀌어도 열린 창 인정)
        self._op = threading.Lock()  # 가져오기 · 복원 · 모드 바꾸기는 한 번에 하나만

    # ------------------------------------------------------------ 실행
    def run(self) -> int:
        import webview
        core.setup_logging(self.data_dir)
        log.info("QIS 데스크톱 %s 시작 · 데이터 폴더 %s", __version__, self.data_dir)
        if paths.migration_note:
            log.warning(paths.migration_note)
        try:
            self.lock.acquire()
        except AlreadyRunning as e:
            webview.create_window(TITLE, html=pages.message_page(
                "QIS가 이미 열려 있습니다", f"{e}\n\n열려 있는 QIS 창을 쓰세요. 창이 안 보이면 Dock(작업 표시줄)에서 찾아보세요."),
                width=620, height=320)
            webview.start()
            return 1
        try:
            self.cfg = core.desktop_config(self.data_dir)
            self.settings = core.DesktopSettings.load(self.data_dir)
            first_html, first_url = self._first_screen()
            core.mark_running(self.data_dir)
            shutil.rmtree(Path(tempfile.gettempdir()) / OPEN_DIR, ignore_errors=True)   # 지난번 열어본 첨부 정리
            webview.settings["ALLOW_DOWNLOADS"] = True
            if self.cfg.https:
                webview.settings["IGNORE_SSL_ERRORS"] = True   # 자기 PC(127.0.0.1)로만 접속 — 사내 인증서 이름 불일치 허용
            self.window = webview.create_window(
                TITLE, url=first_url, html=first_html, js_api=self.api, width=1440, height=920,
                min_size=(900, 600), menu=self.menu.build(), text_select=True, zoomable=True)
            self._watch(self.window, main=True)
            self.window.events.closing += self._on_closing
            self.window.events.closed += self._on_closed
            webview.start(private_mode=False, storage_path=str(self.data_dir / "webview"))
            return 0
        finally:
            self.shutdown()

    def shutdown(self):
        if self.runner:
            self.runner.stop()
            self.runner = None
        if self.lock.held:
            core.clear_running(self.data_dir)
            self.lock.release()
        log.info("QIS 데스크톱 종료")

    # ------------------------------------------------------------ 다리 보호
    def _trusted_url(self, u: str | None) -> bool:
        """QIS 서버 주소 · 프로그램이 직접 그린 화면(about: · data: · file:)이면 True."""
        if not u or re.match(r"^(about|data|file):", u, re.I):
            return True
        bases = set(self._own_bases)
        if self.runner:
            bases.add(self.runner.base_url)
        return any(u == b or u.startswith(b + "/") for b in bases)

    def api_trusted(self) -> bool:
        for w in list(self._api_wins):
            try:
                if not w.events.loaded.is_set():
                    continue
                u = w.get_current_url()
            except Exception:
                continue
            if not self._trusted_url(u):
                log.warning("QIS 밖의 페이지: %s", u)
                return False
        return True

    def _watch(self, w, main: bool = False):
        """다리를 붙인 창 등록 + QIS 밖의 주소로 이동하면 되돌림."""
        self._api_wins.append(w)

        def loaded():
            try:
                u = w.get_current_url()
            except Exception:
                return
            if self._trusted_url(u):
                return
            log.warning("QIS 밖의 주소로 이동 차단: %s", u)
            if self.runner and self.runner.running:
                w.load_url(self.runner.enter_url if main else self.runner.base_url + "/")
            else:
                w.load_html(pages.message_page("QIS", "QIS 밖의 주소는 이 창에서 열 수 없습니다."))

        def closed():
            try:
                self._api_wins.remove(w)
            except ValueError:
                pass
        w.events.loaded += loaded
        w.events.closed += closed

    # ------------------------------------------------------------ 서버 · 화면
    def _first_screen(self):
        """(html, url) — 손상 의심 → 복구 화면, 첫 실행 → 모드 고르기, 아니면 서버를 켜고 QIS 화면."""
        if core.was_unclean(self.data_dir):
            problem = core.check_db(self.cfg)
            log.warning("지난 실행이 정상 종료되지 않음 — DB 검사: %s", problem)
            if problem != "ok":
                self.state = "recover"
                lb = core.latest_backup(self.cfg)
                return pages.recover_page(problem, lb.name if lb else ""), None
        if not self.settings.mode:
            self.state = "setup"
            return self._setup_html(), None
        try:
            return None, self._start_server()
        except Exception as e:
            log.exception("서버 시작 실패")
            self.state = "setup"
            return self._setup_html(error=f"시작하지 못했습니다: {e}"), None

    def _start_server(self) -> str:
        core.prepare(self.cfg, self.settings)
        self.runner = core.ServerRunner(self.cfg, self.settings).start()
        self._own_bases.add(self.runner.base_url)
        self.state = "app"
        return self.runner.enter_url

    def restart_server(self):
        """서버를 켜고 QIS 화면으로. 실패하면 고르는 화면에 오류를 보여 줌."""
        try:
            self.show(url=self._start_server())
        except Exception as e:
            log.exception("서버 시작 실패")
            self.state = "setup"
            self.show(html=self._setup_html(error=f"시작하지 못했습니다: {e}"))

    def _setup_html(self, error: str = "") -> str:
        s, c = self.settings, self.cfg
        return pages.setup_page(current=s.mode, solo_name=s.solo_name, port=c.port, error=error,
                                can_cancel=bool(self.runner and self.runner.running), version=__version__)

    def lan_html(self) -> str:
        from ..launcher import _lan_addresses
        return pages.lan_info_page(_lan_addresses(self.runner.cfg), self.runner.port, sys.platform.startswith("win"),
                                   https=self.runner.cfg.https)

    def show(self, html=None, url=None):
        if url:
            self.window.load_url(url)
        else:
            self.window.load_html(html)

    _show = show   # 이전 이름

    def tell(self, msg: str):
        try:
            self.window.create_confirmation_dialog("QIS", msg)
        except Exception:
            log.exception("알림 실패")

    def flush_screen(self, timeout: float = 8) -> int | None:
        """화면에 남은 변경을 서버로 보냄. 작성 중인 내용이 남아 있으면 1, 아니면 0, 확인 못 하면 None."""
        ev, res = threading.Event(), {}

        def cb(v):
            res["v"] = v
            ev.set()
        try:
            self.window.evaluate_js(FLUSH_JS, cb)
            ev.wait(timeout)
        except Exception:
            log.exception("화면 저장 확인 실패")
        return res.get("v")

    def back_to_app(self):
        if self.runner and self.runner.running:
            self.state = "app"
            self.show(url=self.runner.enter_url)

    # ------------------------------------------------------------ 모드 · 복구 화면
    def apply_setup(self, d: dict):
        if self.state != "setup":
            return {"error": "지금은 바꿀 수 없습니다"}
        if not self._op.acquire(blocking=False):
            return {"error": "다른 작업이 진행 중입니다"}
        try:
            mode = d.get("mode")
            if mode not in core.MODES:
                return {"error": "사용 방식을 고르세요"}
            if mode == "lan":
                try:
                    port = int(str(d.get("port") or "8080").strip())
                    assert 1 <= port <= 65535
                except (ValueError, AssertionError):
                    return {"error": "포트는 1~65535 숫자입니다"}
            if self.runner:
                self.runner.stop()
                self.runner = None
            try:
                if mode == "solo":
                    self.settings.solo_name = str(d.get("solo_name") or "").strip()[:40]
                else:
                    core.set_lan_admin(self.cfg, str(d.get("admin") or ""), str(d.get("admin_name") or ""),
                                       str(d.get("password") or ""))
                    if port != self.cfg.port:
                        self.cfg.port = port
                        self.cfg.save()
                self.settings.mode = mode
                url = self._start_server()
            except Exception as e:
                log.exception("모드 적용 실패")
                return {"error": str(e)}
            self.settings.save(self.data_dir)
            if mode == "lan":
                self.show(html=self.lan_html())
            else:
                self.show(url=url)
            return {"ok": True}
        finally:
            self._op.release()

    def apply_recover(self, choice: str):
        if self.state != "recover":
            return {"error": "지금은 할 수 없습니다"}
        if choice == "quit":
            self._closing_ok = True
            self.window.destroy()
            return {"ok": True}
        if choice == "restore":
            lb = core.latest_backup(self.cfg)
            if not lb:
                return {"error": "백업 파일이 없습니다"}
            try:
                r = core.restore_backup_file(self.cfg, lb)
                log.info("손상 복구: %s 로 복원, 보관 %s", lb, r.get("kept"))
            except Exception as e:
                log.exception("복원 실패")
                return {"error": f"복원 실패: {e}"}
        if not self.settings.mode:
            self.state = "setup"
            self.show(html=self._setup_html())
            return {"ok": True}
        self.restart_server()
        return {"ok": True}

    def m_switch_mode(self):
        if self.state not in ("app", "setup"):
            return
        self.state = "setup"
        self.show(html=self._setup_html())

    # ------------------------------------------------------------ 창 닫기
    def _on_closing(self):
        if self._closing_ok or self.state != "app" or not self.runner:
            return True
        threading.Thread(target=self._flush_and_close, daemon=True).start()
        return False

    def _flush_and_close(self):
        if self.runner and self.runner.mode == "lan":
            n = self._lan_others()
            who = f"지금 다른 사용자 {n}명이 접속해 있습니다.\n" if n else ""
            if not self.window.create_confirmation_dialog(
                    "QIS — 사내 서버 끄기",
                    f"{who}창을 닫으면 사내 서버도 꺼져 다른 PC · 핸드폰에서 QIS에 접속할 수 없게 됩니다.\n"
                    "(다른 사용자가 작성 중이던 내용은 저장되지 않을 수 있습니다)\n\n그래도 닫을까요?"):
                return
        if self.flush_screen() == 1 and not self.window.create_confirmation_dialog(
                "QIS", "아직 저장하지 않은 내용이 있습니다 (작성 중인 창 등).\n그래도 닫을까요?"):
            return
        self._closing_ok = True
        self.window.destroy()

    def _lan_others(self, minutes: int = 15) -> int:
        """사내 서버 모드: 최근 minutes분 안에 다른 PC · 핸드폰에서 QIS를 쓴 사용자 수.
        이 PC의 프로그램 창은 127.0.0.1 로 접속하므로 세지 않음."""
        try:
            db = self.runner.app.state.db
            since = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat(timespec="milliseconds")
            since = since.replace("+00:00", "Z")
            r = db.q1("SELECT COUNT(DISTINCT user_id) n FROM sessions WHERE last_seen >= ? "
                      "AND COALESCE(ip,'') NOT IN ('127.0.0.1','::1','localhost')", (since,))
            return int(r["n"] or 0)
        except Exception:
            log.exception("접속 사용자 수 확인 실패")
            return 0

    def _on_closed(self):
        import webview
        for w in list(webview.windows):
            if w is not self.window:
                try:
                    w.destroy()
                except Exception:
                    pass

    # ------------------------------------------------------------ 새 창 · 파일 (다리에서 부름)
    def open_page(self, path: str):
        import webview
        if not self.runner or not re.match(r"^/(?!/)[\w\-./?=&%]*$", path):
            log.warning("새 창 거부: %r", path)
            return
        log.info("새 창: %s", path)
        w = webview.create_window(TITLE, url=self.runner.base_url + path, js_api=self.api, width=1300, height=880,
                                  text_select=True, zoomable=True)
        self._watch(w)

    def open_report(self, html: str):
        import webview
        log.info("보고서 창 (%d자)", len(html))
        webview.create_window("QIS 보고서", html=html, width=1200, height=900, text_select=True, zoomable=True)

    def _ask_save(self, name: str, types=()):
        return attach.ask_save(self.window, name, types)

    def save_file(self, name: str, data_url):
        return attach.save_file(self._ask_save, name, data_url)

    def open_file(self, name: str, data_url):
        return attach.open_file(self._ask_save, name, data_url)

    def export_backup(self):
        if not self.runner or not self.runner.app:
            return "서버가 꺼져 있습니다"
        try:
            p = self._ask_save(f"QIS_백업_{datetime.now().strftime('%Y%m%d')}.json", ("QIS 백업 (*.json)",))
            if not p:
                return None
            size = core.export_json(self.runner.app, p, core.SOLO_USER if self.runner.mode == "solo" else None)
            return f"백업 파일을 저장했습니다: {p.name} ({size / 1048576:.1f} MB · 사진 포함)"
        except Exception as e:
            log.exception("백업 파일 저장 실패")
            return f"저장하지 못했습니다: {e}"
