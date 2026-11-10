"""프로그램 메뉴 — 백업 · 가져오기 · 복원 · 접속 주소 · 버전 정보.

가져오기 · 복원처럼 데이터를 바꾸는 일은 화면(웹 페이지)에서 부를 수 없고 여기(메뉴)에서만 한다.
서버를 멈춘 채 작업하고(_with_server_stopped) 끝나면 다시 켜서 QIS 화면으로 돌아간다.
"""
from __future__ import annotations

import logging
from pathlib import Path

from .. import __build__, __version__
from . import core, pages

log = logging.getLogger("qis.desktop")

COPYRIGHT = "© 2026 김선중. All rights reserved. 사내 사용 허락 (LICENSE 참고)"


class MenuActions:
    """메뉴 항목의 동작. Controller(창 · 서버 · 상태)를 받아 그 위에서 일한다."""

    def __init__(self, ctl):
        self.c = ctl

    def build(self):
        from webview.menu import Menu, MenuAction, MenuSeparator
        c = self.c
        return [
            Menu("파일", [
                MenuAction("지금 백업", self.backup_now),
                MenuAction("백업 폴더 열기", lambda: core.open_in_os(_mkdir(c.cfg.backup_path))),
                MenuAction("데이터 폴더 열기", lambda: core.open_in_os(c.data_dir)),
                MenuSeparator(),
                MenuAction("가져오기: 개인판 HTML 백업 (JSON)…", self.import_json),
                MenuAction("가져오기: 서버판 data 폴더…", self.import_folder),
                MenuAction("백업에서 복원…", self.restore),
            ]),
            Menu("설정", [
                MenuAction("사용 방식 바꾸기 (혼자 쓰기 / 사내 서버)…", c.m_switch_mode),
                MenuAction("접속 주소 보기", self.addresses),
            ]),
            Menu("보기", [
                MenuAction("화면 새로 고침", self.reload),
                MenuAction("버전 정보", self.about),
            ]),
        ]

    # ------------------------------------------------------------ 보조
    def _tell(self, msg: str):
        self.c.tell(msg)

    def _ready(self) -> bool:
        if self.c.state != "app" or not self.c.runner:
            self._tell("먼저 사용 방식을 고르고 QIS를 시작하세요")
            return False
        return True

    def _pick_file(self, directory: Path, types):
        import webview
        r = self.c.window.create_file_dialog(webview.FileDialog.OPEN, directory=str(directory), file_types=types)
        return Path(r[0] if isinstance(r, (list, tuple)) else r) if r else None

    def _with_server_stopped(self, msg: str, work):
        """서버를 멈추고 work() 실행 → 서버 다시 켜고 QIS 화면. 결과 문구 또는 오류를 알림."""
        c = self.c
        if not c._op.acquire(blocking=False):
            self._tell("다른 작업이 진행 중입니다")
            return
        try:
            c.flush_screen()          # 화면에 남은 변경 먼저 보내기
            c.state = "busy"
            c.show(html=pages.busy_page(msg))
            if c.runner:
                c.runner.stop()
                c.runner = None
            result, err = None, None
            try:
                result = work()
            except Exception as e:
                log.exception("작업 실패: %s", msg)
                err = e
            c.restart_server()
            self._tell(f"하지 못했습니다: {err}" if err else result)
        finally:
            c._op.release()

    # ------------------------------------------------------------ 파일
    def backup_now(self):
        if not self._ready():
            return
        try:
            info = self.c.runner.app.state.backup.run("manual")
            self._tell(f"백업했습니다.\n\n폴더: {info['dir']}\nDB: {info['db']} · 첨부 {info['files_copied']}개 복사")
        except Exception as e:
            log.exception("백업 실패")
            self._tell(f"백업 실패: {e}")

    def import_json(self):
        c = self.c
        if not self._ready():
            return
        p = self._pick_file(Path.home(), ("QIS 백업 (*.json)", "모든 파일 (*.*)"))
        if not p:
            return
        replace = False
        if core.has_records(c.cfg):
            if not c.window.create_confirmation_dialog(
                    "QIS — 가져오기", f"{p.name}\n\n이미 기록이 있습니다. 지금 데이터를 이 백업으로 바꿀까요?\n"
                    "지금 DB는 지우지 않고 데이터 폴더의 restore_before_날짜 폴더에 보관합니다. 사용자 계정은 그대로 둡니다."):
                return
            replace = True

        def work():
            r = core.import_json_backup(c.cfg, p, replace=replace,
                                        by_username=core.SOLO_USER if c.settings.mode == "solo" else None)
            cnt = ", ".join(f"{k} {v}" for k, v in r["imported"].items() if v)
            return f"가져왔습니다: {cnt or '기록 없음'}" + (f"\n\n이전 DB 보관: {r['kept']}" if r["kept"] else "")
        self._with_server_stopped("백업 가져오는 중…", work)

    def import_folder(self):
        import webview
        c = self.c
        if not self._ready():
            return
        r = c.window.create_file_dialog(webview.FileDialog.FOLDER, directory=str(Path.home()))
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
        if not c.window.create_confirmation_dialog(
                "QIS — 서버판 데이터 가져오기",
                f"{src}\n기록: {recs} · 사용자 {info['users']}명\n\n지금 데이터를 이것으로 바꿀까요? "
                "(지금 DB는 restore_before_날짜 폴더에 보관 · 원본 폴더는 바꾸지 않음)\n"
                "먼저 기존 서버판(검은 창)을 닫아 두세요."):
            return

        def work():
            res = core.import_server_folder(c.cfg, folder)
            note = "\n\n사내 서버 모드에서는 기존 서버판의 아이디 · 비밀번호로 로그인합니다." if c.settings.mode == "lan" else ""
            return (f"가져왔습니다: {', '.join(f'{k} {v}' for k, v in res['records'].items()) or '기록 없음'}"
                    f" · 첨부 {res.get('files_filled', 0)}개" + (f"\n이전 DB 보관: {res['kept']}" if res.get("kept") else "") + note)
        self._with_server_stopped("서버판 데이터 가져오는 중…", work)

    def restore(self):
        c = self.c
        if not self._ready():
            return
        d = c.cfg.backup_path / "db"
        p = self._pick_file(d if d.is_dir() else c.cfg.backup_path, ("QIS 백업 DB (*.sqlite)",))
        if not p:
            return
        from ..restore import RestoreError, check
        try:
            info = check(c.cfg, p)
        except RestoreError as e:
            self._tell(f"복원할 수 없습니다: {e}")
            return
        recs = ", ".join(f"{k} {v}" for k, v in info["records"].items()) or "없음"
        if not c.window.create_confirmation_dialog(
                "QIS — 복원", f"{p.name}\n기록: {recs} · 사용자 {info['users']}명\n\n"
                "지금 데이터를 이 백업으로 바꿀까요? (지금 DB는 restore_before_날짜 폴더에 보관)"):
            return

        def work():
            r = core.restore_backup_file(c.cfg, p)
            return "복원했습니다." + (f"\n\n이전 DB 보관: {r['kept']}" if r.get("kept") else "")
        self._with_server_stopped("복원하는 중…", work)

    # ------------------------------------------------------------ 설정 · 보기
    def addresses(self):
        c = self.c
        if not c.runner:
            return
        if c.runner.mode == "solo":
            self._tell("지금은 ‘이 PC 혼자 쓰기’ 모드입니다 — 다른 PC · 핸드폰에서는 접속할 수 없습니다.\n"
                       "사내에서 같이 쓰려면 ‘설정 › 사용 방식 바꾸기’에서 ‘사내 서버로 쓰기’를 고르세요.")
            return
        c.state = "app"
        c.show(html=c.lan_html())

    def reload(self):
        c = self.c
        if c.state == "app" and c.runner:
            c.show(url=c.runner.enter_url)

    def about(self):
        c = self.c
        mode = {"solo": "이 PC 혼자 쓰기", "lan": "사내 서버"}.get(c.settings.mode if c.settings else "", "미설정")
        upd = ""
        try:
            if c.runner and c.runner.app:
                u = c.runner.app.state.updater.status()
                upd = f"새 버전 {u['latest']['version']} 이 있습니다 — 관리 › 버전 · 업데이트\n" if u["available"] else ""
        except Exception:
            log.exception("업데이트 상태")
        self._tell(f"QIS 품질정보시스템 데스크톱 · 서버 {__version__} (빌드 {__build__})\n{upd}사용 방식: {mode}\n데이터 폴더: {c.data_dir}\n\n"
                   f"{COPYRIGHT}\n오픈소스 구성요소: FastAPI · uvicorn · pywebview · sql.js 등 (NOTICE 파일 참고)")


def _mkdir(p: Path) -> Path:
    p.mkdir(parents=True, exist_ok=True)
    return p
