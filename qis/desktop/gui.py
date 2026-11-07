"""프로그램 창 (pywebview) — 메뉴 · 첫 실행 화면 · 닫을 때 저장 확인.

창과 화면 사이의 다리(DesktopApi)는 꼭 필요한 일만 한다: 모드 고르기(고르는 화면에서만) · 새 창 · 파일 저장/열기.
가져오기 · 복원처럼 데이터를 바꾸는 일은 화면(웹 페이지)에서 부를 수 없고 프로그램 메뉴에서만 한다.
"""
from __future__ import annotations

import base64
import logging
import re
import shutil
import sys
import tempfile
import threading
import webbrowser
from datetime import datetime
from pathlib import Path

from .. import __version__
from . import core, pages
from .lock import AlreadyRunning, InstanceLock
from . import paths
from .paths import user_data_dir

log = logging.getLogger("qis.desktop")

TITLE = "QIS 품질정보시스템"
COPYRIGHT = "© 2026 김선중. All rights reserved. 사내 사용 허락 (LICENSE 참고)"

# 창을 닫기 전: 보내지 못한 변경을 서버로 보내고, 그래도 남았거나 작성 창이 고친 채 열려 있으면 1
FLUSH_JS = ("(async function(){try{if(typeof srvSync==='function')await srvSync()}catch(e){}"
            "var u=false;try{u=(typeof srvUnsaved==='function'&&srvUnsaved())||"
            "(typeof mfDirty!=='undefined'&&mfDirty&&typeof srvModalOpen==='function'&&srvModalOpen())}catch(e){}"
            "return u?1:0})()")


def _safe_name(name: str, default: str = "QIS_파일") -> str:
    n = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", str(name or "")).strip(" .")
    return n[:120] or default


# 첨부 '열어보기'(이 PC의 기본 프로그램으로 바로 실행)는 실행될 수 없는 보기 전용 형식만.
# 그 밖의 형식(실행 파일 · 스크립트 · 매크로가 들 수 있는 문서 · html 등)은 저장 위치를 묻는 창으로 돌린다.
OPEN_MIME_EXT = {"application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif",
                 "image/webp": ".webp", "image/bmp": ".bmp", "text/plain": ".txt", "text/csv": ".csv"}
OPEN_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".txt", ".csv"}
OPEN_DIR = "QIS_열어보기"


def _mime_of(d: str) -> str:
    head = d.split(",", 1)[0][5:] if isinstance(d, str) and d.startswith("data:") else ""
    return head.split(";", 1)[0].strip().lower()


def open_name(name: str, data_url: str) -> str | None:
    """열어보기용 파일 이름 (확장자는 허용 목록 안에서만). 열어보면 안 되는 형식이면 None."""
    n = _safe_name(name, "첨부")
    ext = Path(n).suffix.lower()
    if ext in OPEN_EXT:
        return n
    ext = OPEN_MIME_EXT.get(_mime_of(data_url))
    if not ext:
        return None
    stem = Path(n).stem if Path(n).suffix else n
    return _safe_name(stem, "첨부")[:100] + ext


def _decode_data_url(d: str) -> bytes:
    if not isinstance(d, str) or not d.startswith("data:") or "," not in d:
        raise ValueError("파일 내용이 올바르지 않습니다")
    head, body = d.split(",", 1)
    if ";base64" in head:
        return base64.b64decode(body)
    from urllib.parse import unquote_to_bytes
    return unquote_to_bytes(body)


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
                min_size=(900, 600), menu=self._menu(), text_select=True, zoomable=True)
            self._watch(self.window, main=True)
            self.window.events.closing += self._on_closing
            self.window.events.closed += self._on_closed
            webview.start(private_mode=False, storage_path=str(self.data_dir / "webview"))
            return 0
        finally:
            self.shutdown()

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

    def shutdown(self):
        if self.runner:
            self.runner.stop()
            self.runner = None
        if self.lock.held:
            core.clear_running(self.data_dir)
            self.lock.release()
        log.info("QIS 데스크톱 종료")

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

    def _setup_html(self, error: str = "") -> str:
        s, c = self.settings, self.cfg
        return pages.setup_page(current=s.mode, solo_name=s.solo_name, port=c.port, error=error,
                                can_cancel=bool(self.runner and self.runner.running), version=__version__)

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
        ev, res = threading.Event(), {}

        def cb(v):
            res["v"] = v
            ev.set()
        try:
            self.window.evaluate_js(FLUSH_JS, cb)
            ev.wait(8)
        except Exception:
            log.exception("닫기 전 저장 확인 실패")
        if res.get("v") == 1 and not self.window.create_confirmation_dialog(
                "QIS", "아직 저장하지 않은 내용이 있습니다 (작성 중인 창 등).\n그래도 닫을까요?"):
            return
        self._closing_ok = True
        self.window.destroy()

    def _lan_others(self, minutes: int = 15) -> int:
        """사내 서버 모드: 최근 minutes분 안에 다른 PC · 핸드폰에서 QIS를 쓴 사용자 수.
        이 PC의 프로그램 창은 127.0.0.1 로 접속하므로 세지 않음."""
        try:
            from datetime import timedelta, timezone
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

    # ------------------------------------------------------------ 화면 바꾸기
    def _show(self, html=None, url=None):
        if url:
            self.window.load_url(url)
        else:
            self.window.load_html(html)

    def back_to_app(self):
        if self.runner and self.runner.running:
            self.state = "app"
            self._show(url=self.runner.enter_url)

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
                self._show(html=self._lan_html())
            else:
                self._show(url=url)
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
            self._show(html=self._setup_html())
            return {"ok": True}
        try:
            self._show(url=self._start_server())
        except Exception as e:
            log.exception("서버 시작 실패")
            self.state = "setup"
            self._show(html=self._setup_html(error=f"시작하지 못했습니다: {e}"))
        return {"ok": True}

    def _lan_html(self) -> str:
        from ..launcher import _lan_addresses
        return pages.lan_info_page(_lan_addresses(self.runner.cfg), self.runner.port, sys.platform.startswith("win"),
                                   https=self.runner.cfg.https)

    # ------------------------------------------------------------ 새 창 · 파일
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
        import webview
        d = Path.home() / "Downloads"
        r = self.window.create_file_dialog(webview.FileDialog.SAVE, directory=str(d if d.is_dir() else Path.home()),
                                           save_filename=name, file_types=types)
        if not r:
            return None
        return Path(r if isinstance(r, str) else r[0])

    def save_file(self, name: str, data_url):
        try:
            data = _decode_data_url(data_url)
            p = self._ask_save(_safe_name(name))
            if not p:
                return None
            p.write_bytes(data)
            return f"저장했습니다: {p.name}"
        except Exception as e:
            log.exception("파일 저장 실패")
            return f"저장하지 못했습니다: {e}"

    def open_file(self, name: str, data_url):
        """첨부 열어보기 — 보기 전용 형식(PDF · 그림 · 글자)만 이 PC의 기본 프로그램으로 연다.
        다른 형식은 실행될 수 있으므로 바로 열지 않고 저장 위치를 묻는다."""
        try:
            fn = open_name(name, data_url)
            if not fn:
                log.warning("열어보기 거부 (형식 %r · 이름 %r) → 저장 창", _mime_of(data_url), name)
                return self.save_file(name, data_url)
            data = _decode_data_url(data_url)
            d = Path(tempfile.gettempdir()) / OPEN_DIR
            d.mkdir(exist_ok=True)
            p = d / fn
            p.write_bytes(data)
            core.open_in_os(p)
            return None
        except Exception as e:
            log.exception("첨부 열기 실패")
            return f"열지 못했습니다: {e}"

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

    # ------------------------------------------------------------ 메뉴
    def _menu(self):
        from webview.menu import Menu, MenuAction, MenuSeparator
        return [
            Menu("파일", [
                MenuAction("지금 백업", self.m_backup_now),
                MenuAction("백업 폴더 열기", lambda: core.open_in_os(self._mkdir(self.cfg.backup_path))),
                MenuAction("데이터 폴더 열기", lambda: core.open_in_os(self.data_dir)),
                MenuSeparator(),
                MenuAction("가져오기: 개인판 HTML 백업 (JSON)…", self.m_import_json),
                MenuAction("가져오기: 서버판 data 폴더…", self.m_import_folder),
                MenuAction("백업에서 복원…", self.m_restore),
            ]),
            Menu("설정", [
                MenuAction("사용 방식 바꾸기 (혼자 쓰기 / 사내 서버)…", self.m_switch_mode),
                MenuAction("접속 주소 보기", self.m_addresses),
            ]),
            Menu("보기", [
                MenuAction("화면 새로 고침", self.m_reload),
                MenuAction("버전 정보", self.m_about),
            ]),
        ]

    @staticmethod
    def _mkdir(p: Path) -> Path:
        p.mkdir(parents=True, exist_ok=True)
        return p

    def _tell(self, msg: str):
        try:
            self.window.create_confirmation_dialog("QIS", msg)
        except Exception:
            log.exception("알림 실패")

    def _ready(self) -> bool:
        if self.state != "app" or not self.runner:
            self._tell("먼저 사용 방식을 고르고 QIS를 시작하세요")
            return False
        return True

    def m_backup_now(self):
        if not self._ready():
            return
        try:
            info = self.runner.app.state.backup.run("manual")
            self._tell(f"백업했습니다.\n\n폴더: {info['dir']}\nDB: {info['db']} · 첨부 {info['files_copied']}개 복사")
        except Exception as e:
            log.exception("백업 실패")
            self._tell(f"백업 실패: {e}")

    def _with_server_stopped(self, msg: str, work):
        """서버를 멈추고 work() 실행 → 서버 다시 켜고 QIS 화면. 결과 문구 또는 오류를 알림."""
        if not self._op.acquire(blocking=False):
            self._tell("다른 작업이 진행 중입니다")
            return
        try:
            try:   # 화면에 남은 변경 먼저 보내기
                ev = threading.Event()
                self.window.evaluate_js(FLUSH_JS, lambda v: ev.set())
                ev.wait(8)
            except Exception:
                pass
            self.state = "busy"
            self._show(html=pages.busy_page(msg))
            if self.runner:
                self.runner.stop()
                self.runner = None
            result, err = None, None
            try:
                result = work()
            except Exception as e:
                log.exception("작업 실패: %s", msg)
                err = e
            try:
                self._show(url=self._start_server())
            except Exception as e:
                log.exception("서버 다시 시작 실패")
                self.state = "setup"
                self._show(html=self._setup_html(error=f"시작하지 못했습니다: {e}"))
            self._tell(f"하지 못했습니다: {err}" if err else result)
        finally:
            self._op.release()

    def _pick_file(self, directory: Path, types):
        import webview
        r = self.window.create_file_dialog(webview.FileDialog.OPEN, directory=str(directory), file_types=types)
        return Path(r[0] if isinstance(r, (list, tuple)) else r) if r else None

    def m_import_json(self):
        if not self._ready():
            return
        p = self._pick_file(Path.home(), ("QIS 백업 (*.json)", "모든 파일 (*.*)"))
        if not p:
            return
        replace = False
        if core.has_records(self.cfg):
            if not self.window.create_confirmation_dialog(
                    "QIS — 가져오기", f"{p.name}\n\n이미 기록이 있습니다. 지금 데이터를 이 백업으로 바꿀까요?\n"
                    "지금 DB는 지우지 않고 데이터 폴더의 restore_before_날짜 폴더에 보관합니다. 사용자 계정은 그대로 둡니다."):
                return
            replace = True

        def work():
            r = core.import_json_backup(self.cfg, p, replace=replace,
                                        by_username=core.SOLO_USER if self.settings.mode == "solo" else None)
            cnt = ", ".join(f"{k} {v}" for k, v in r["imported"].items() if v)
            return f"가져왔습니다: {cnt or '기록 없음'}" + (f"\n\n이전 DB 보관: {r['kept']}" if r["kept"] else "")
        self._with_server_stopped("백업 가져오는 중…", work)

    def m_import_folder(self):
        import webview
        if not self._ready():
            return
        r = self.window.create_file_dialog(webview.FileDialog.FOLDER, directory=str(Path.home()))
        if not r:
            return
        folder = Path(r[0] if isinstance(r, (list, tuple)) else r)
        src = core.find_server_db(folder)
        if not src:
            self._tell("이 폴더에서 qis.db 를 찾지 못했습니다.\n서버판의 data 폴더(qis.db 가 있는 폴더)를 고르세요.")
            return
        from ..db import SqliteDB
        try:
            info = SqliteDB.inspect_file(src)
        except Exception as e:
            self._tell(f"QIS 서버 DB가 아닙니다: {e}")
            return
        recs = ", ".join(f"{k} {v}" for k, v in info["records"].items()) or "없음"
        if not self.window.create_confirmation_dialog(
                "QIS — 서버판 데이터 가져오기",
                f"{src}\n기록: {recs} · 사용자 {info['users']}명\n\n지금 데이터를 이것으로 바꿀까요? "
                "(지금 DB는 restore_before_날짜 폴더에 보관 · 원본 폴더는 바꾸지 않음)\n"
                "먼저 기존 서버판(검은 창)을 닫아 두세요."):
            return

        def work():
            res = core.import_server_folder(self.cfg, folder)
            note = "\n\n사내 서버 모드에서는 기존 서버판의 아이디 · 비밀번호로 로그인합니다." if self.settings.mode == "lan" else ""
            return (f"가져왔습니다: {', '.join(f'{k} {v}' for k, v in res['records'].items()) or '기록 없음'}"
                    f" · 첨부 {res.get('files_filled', 0)}개" + (f"\n이전 DB 보관: {res['kept']}" if res.get("kept") else "") + note)
        self._with_server_stopped("서버판 데이터 가져오는 중…", work)

    def m_restore(self):
        if not self._ready():
            return
        d = self.cfg.backup_path / "db"
        p = self._pick_file(d if d.is_dir() else self.cfg.backup_path, ("QIS 백업 DB (*.sqlite)",))
        if not p:
            return
        from ..restore import RestoreError, check
        try:
            info = check(self.cfg, p)
        except RestoreError as e:
            self._tell(f"복원할 수 없습니다: {e}")
            return
        recs = ", ".join(f"{k} {v}" for k, v in info["records"].items()) or "없음"
        if not self.window.create_confirmation_dialog(
                "QIS — 복원", f"{p.name}\n기록: {recs} · 사용자 {info['users']}명\n\n"
                "지금 데이터를 이 백업으로 바꿀까요? (지금 DB는 restore_before_날짜 폴더에 보관)"):
            return

        def work():
            r = core.restore_backup_file(self.cfg, p)
            return "복원했습니다." + (f"\n\n이전 DB 보관: {r['kept']}" if r.get("kept") else "")
        self._with_server_stopped("복원하는 중…", work)

    def m_switch_mode(self):
        if self.state not in ("app", "setup"):
            return
        self.state = "setup"
        self._show(html=self._setup_html())

    def m_addresses(self):
        if not self.runner:
            return
        if self.runner.mode == "solo":
            self._tell("지금은 ‘이 PC 혼자 쓰기’ 모드입니다 — 다른 PC · 핸드폰에서는 접속할 수 없습니다.\n"
                       "사내에서 같이 쓰려면 ‘설정 › 사용 방식 바꾸기’에서 ‘사내 서버로 쓰기’를 고르세요.")
            return
        self.state = "app"
        self._show(html=self._lan_html())

    def m_reload(self):
        if self.state == "app" and self.runner:
            self._show(url=self.runner.enter_url)

    def m_about(self):
        mode = {"solo": "이 PC 혼자 쓰기", "lan": "사내 서버"}.get(self.settings.mode if self.settings else "", "미설정")
        self._tell(f"QIS 품질정보시스템 데스크톱 · 서버 {__version__}\n사용 방식: {mode}\n데이터 폴더: {self.data_dir}\n\n"
                   f"{COPYRIGHT}\n오픈소스 구성요소: FastAPI · uvicorn · pywebview · sql.js 등 (NOTICE 파일 참고)")
