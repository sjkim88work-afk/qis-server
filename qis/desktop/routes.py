"""데스크톱 프로그램 전용 화면 · API (서버판에는 붙지 않음).

  /desktop/setup        처음 설정 · 사용 방식 바꾸기 (혼자 쓰기 / 사내 서버)
  /desktop/enter        창이 처음 여는 주소 — 실행 열쇠를 쿠키로 받아 두고, 혼자 쓰기면 로컬 관리자로 자동 로그인
  /api/desktop/...      데이터 폴더 열기 · 백업 폴더 바꾸기(네이티브 대화상자) · 가져오기 · 첨부/출력물 열기

보호
  · 실행 열쇠: 프로그램이 실행할 때마다 새로 만들어 창에만 알려 줌. 쿠키(HttpOnly · SameSite=Strict)로 보관
  · /desktop · /api/desktop 은 이 PC(127.0.0.1)에서 온 요청만, API 는 열쇠 + 관리자 로그인까지 확인
  · 혼자 쓰기 · 처음 설정 때는 Host 헤더가 127.0.0.1 · localhost 일 때만 응답 (DNS 리바인딩 차단)
"""
from __future__ import annotations

import base64
import binascii
import hmac
import json
import re
import time
from pathlib import Path

from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from .. import __version__
from ..app import COOKIE, WEB
from ..auth import AuthError
from . import importer
from .paths import os_user_name
from .server import LOCAL_USER, MODES, ensure_local_user, other_admins

KEY_COOKIE = "qis_desk"
LOCAL_HOSTS = ("127.0.0.1", "::1", "localhost")


def _host_name(request: Request) -> str:
    h = (request.headers.get("host") or "").strip().lower()
    if h.startswith("["):
        return h[1:h.find("]")] if "]" in h else h
    return h.rsplit(":", 1)[0] if ":" in h else h


def _safe_name(name: str, default: str) -> str:
    n = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', "_", (name or "").strip())[:120].strip(" .")
    return n or default


def install(app, ctrl) -> None:
    auth = app.state.auth
    st = app.state
    st.desktop = ctrl
    st.page_extra = {"desktop": ctrl.mode}

    def key_ok(request: Request) -> bool:
        k = request.query_params.get("key") or request.cookies.get(KEY_COOKIE) or ""
        return hmac.compare_digest(k.encode(), ctrl.key.encode())

    def is_local(request: Request) -> bool:
        return bool(request.client and request.client.host in ("127.0.0.1", "::1"))

    def session_admin(request: Request):
        s = auth.session_user(request.cookies.get(COOKIE))
        if s and s[0]["role"] == "admin" and s[0]["active"] and not s[0]["must_change"]:
            return s[0]
        return None

    def set_key_cookie(resp):
        resp.set_cookie(KEY_COOKIE, ctrl.key, httponly=True, samesite="strict", path="/", secure=ctrl.scheme == "https")

    def set_session_cookie(resp, token):
        resp.set_cookie(COOKIE, token, httponly=True, samesite="strict", path="/", secure=ctrl.scheme == "https",
                        max_age=st.cfg.session_hours * 3600 * 14)

    def err(msg, code=400):
        return JSONResponse({"error": "desktop", "message": msg}, status_code=code)

    @app.middleware("http")
    async def desktop_guard(request: Request, call_next):
        path = request.url.path
        mode = ctrl.mode
        if mode != "server" and _host_name(request) not in LOCAL_HOSTS:
            return JSONResponse({"error": "host", "message": "이 PC에서만 열 수 있습니다"}, status_code=403)
        if path.startswith(("/desktop/", "/api/desktop/")) and not is_local(request):
            return JSONResponse({"error": "local", "message": "QIS 프로그램 창에서만 쓸 수 있습니다"}, status_code=403)
        if mode == "" and path in ("/", "/login", "/account", "/admin"):
            return RedirectResponse("/desktop/setup", status_code=303)
        if mode == "solo" and path == "/login" and key_ok(request):
            return RedirectResponse("/desktop/enter", status_code=303)   # 혼자 쓰기: 로그인 화면 대신 자동 로그인
        return await call_next(request)

    # ---- 처음 설정 · 사용 방식 바꾸기 ----
    def can_setup(request: Request) -> bool:
        if ctrl.mode == "":
            return key_ok(request)
        return key_ok(request) and session_admin(request) is not None

    @app.get("/desktop/setup", response_class=HTMLResponse)
    def setup_page(request: Request):
        if not can_setup(request):
            if ctrl.mode:
                return RedirectResponse("/", status_code=303)
            return HTMLResponse("<p style='font-family:sans-serif;padding:24px'>QIS 프로그램 창에서 여세요.</p>", status_code=403)
        info = {"mode": ctrl.mode, "version": __version__, "osUser": os_user_name(), "port": ctrl.cfg.port,
                "admins": other_admins(auth), "dataDir": str(ctrl.cfg.data_dir),
                "localName": (auth.db.q1("SELECT name FROM users WHERE lower(username)=lower(?)", (LOCAL_USER,)) or {"name": ""})["name"]}
        tag = '<script id="qisSetup" type="application/json">' + json.dumps(info, ensure_ascii=False).replace("</", "<\\/") + "</script>"
        html = (WEB / "desktop_setup.html").read_text(encoding="utf-8").replace("<head>", "<head>\n" + tag, 1)
        resp = HTMLResponse(html, headers={"Cache-Control": "no-store"})
        if request.query_params.get("key"):
            set_key_cookie(resp)
        return resp

    @app.post("/api/desktop/setup")
    async def setup_save(request: Request):
        if not can_setup(request):
            return err("권한이 없습니다", 403)
        b = await request.json()
        mode = b.get("mode")
        if mode not in MODES:
            return err("사용 방식을 고르세요")
        before = ctrl.mode
        by = session_admin(request)
        if mode == "solo":
            name = (b.get("name") or "").strip() or os_user_name()
            ensure_local_user(auth, name)
        else:
            port = b.get("port")
            if port not in (None, ""):
                try:
                    port = int(port)
                except (TypeError, ValueError):
                    return err("포트는 숫자로 넣으세요")
                if not 1024 <= port <= 65535:
                    return err("포트는 1024~65535 사이로 넣으세요")
            adm = b.get("admin") or {}
            if adm.get("username"):
                if adm.get("username", "").strip().lower() == LOCAL_USER:
                    return err(f"'{LOCAL_USER}' 는 프로그램이 쓰는 아이디입니다 — 다른 아이디를 넣으세요")
                if adm.get("password") != adm.get("password2"):
                    return err("두 번 입력한 비밀번호가 다릅니다")
                try:
                    auth.create_user(adm["username"], adm.get("name", ""), "admin", adm.get("password", ""),
                                     by=by, must_change=False, ip="127.0.0.1")
                except AuthError as e:
                    return err(str(e))
            elif not other_admins(auth):
                return err("사내 서버로 쓰려면 로그인할 관리자 계정을 만드세요")
            u = auth.db.q1("SELECT * FROM users WHERE lower(username)=lower(?)", (LOCAL_USER,))
            if u and u["active"]:
                auth.update_user(u["id"], by=by, active=False)   # 사내 서버에서는 비밀번호 없는 계정을 쓰지 않음
            if port:
                ctrl.cfg.port = port
        ctrl.update_config(desktop_mode=mode)
        st.page_extra["desktop"] = mode
        # 바인드 주소가 바뀌면(127.0.0.1 ↔ 0.0.0.0) 서버를 다시 켬 → 창이 새 주소를 엶
        if mode == "server" or before == "server":
            ctrl.restart_and_reload()
            return {"restart": True}
        return {"next": "/desktop/enter"}

    @app.get("/desktop/enter")
    def enter(request: Request):
        if not key_ok(request):
            return RedirectResponse("/", status_code=303)
        if ctrl.mode == "":
            resp = RedirectResponse("/desktop/setup", status_code=303)
        elif ctrl.mode == "solo":
            u = ensure_local_user(auth)
            token, _ = auth.start_session(u, ip="127.0.0.1", ua=request.headers.get("user-agent"), action="login.desktop")
            resp = RedirectResponse("/", status_code=303)
            set_session_cookie(resp, token)
        else:
            resp = RedirectResponse("/", status_code=303)
        if request.query_params.get("key"):
            set_key_cookie(resp)
        return resp

    # ---- 데스크톱 API (열쇠 + 관리자) ----
    def guard(request: Request):
        if not key_ok(request):
            return None, err("QIS 프로그램 창에서만 쓸 수 있습니다", 403)
        u = session_admin(request)
        if not u:
            return None, err("관리자만 할 수 있습니다", 403)
        return u, None

    @app.get("/api/desktop/info")
    @app.post("/api/desktop/info")
    def info(request: Request):
        u, e = guard(request)
        if e:
            return e
        return {"mode": ctrl.mode, "version": __version__, "dataDir": str(ctrl.cfg.data_dir),
                "backupDir": str(ctrl.cfg.backup_path), "backupCustom": bool(ctrl.cfg.backup_dir),
                "port": ctrl.port, "addresses": ctrl.lan_addresses(), "notice": ctrl.notice,
                "windows": ctrl_is_windows()}

    @app.post("/api/desktop/open-folder")
    async def open_folder(request: Request):
        u, e = guard(request)
        if e:
            return e
        b = await request.json()
        p = ctrl.cfg.backup_path if b.get("which") == "backup" else ctrl.cfg.data_dir
        p.mkdir(parents=True, exist_ok=True)
        ctrl.ui.open_path(p)
        return {"ok": True, "path": str(p)}

    @app.post("/api/desktop/backup-dir")
    async def backup_dir(request: Request):
        u, e = guard(request)
        if e:
            return e
        b = await request.json()
        if b.get("reset"):
            new = ""
        else:
            picked = ctrl.ui.pick_folder(str(ctrl.cfg.backup_path))
            if not picked:
                return {"cancelled": True}
            p = Path(picked)
            try:                                            # 쓸 수 있는 폴더인지 먼저 확인
                p.mkdir(parents=True, exist_ok=True)
                t = p / ".qis_write_test"
                t.write_text("ok", encoding="utf-8")
                t.unlink()
            except OSError as ex:
                return err(f"이 폴더에 쓸 수 없습니다: {ex}")
            new = str(p)
        old = str(ctrl.cfg.backup_path)
        ctrl.update_config(backup_dir=new)
        with auth.db.tx() as c:
            auth.db.audit(c, user=u, action="settings.backup_dir", label="백업 폴더 변경",
                          detail={"from": old, "to": str(ctrl.cfg.backup_path)}, ip="127.0.0.1")
        return {"dir": str(ctrl.cfg.backup_path)}

    @app.post("/api/desktop/backup-now")
    def backup_now(request: Request):
        u, e = guard(request)
        if e:
            return e
        return {"info": st.backup.run("manual", user=u)}

    @app.post("/api/desktop/import")
    async def do_import(request: Request):
        u, e = guard(request)
        if e:
            return e
        b = await request.json()
        if b.get("path"):                   # 시험용 · 고급: 경로를 직접 지정
            picked = b["path"]
        elif b.get("kind") == "folder":
            picked = ctrl.ui.pick_folder("")
        else:
            picked = ctrl.ui.pick_file("", ("QIS 백업 (*.json;*.sqlite;*.db)", "모든 파일 (*.*)"))
        if not picked:
            return {"cancelled": True}
        kind = importer.kind_of(picked)
        if kind == "json":
            try:
                cnt = importer.import_json(st.store, st.files, u, picked)
            except importer.ImportError_ as ex:
                return err(str(ex))
            return {"imported": cnt}
        if kind == "folder" and not importer.find_server_db(picked):
            return err("고른 폴더에 qis.db 가 없습니다 — 서버판의 data 폴더(qis.db 가 있는 폴더)를 고르세요")
        if kind not in ("folder", "db"):
            return err("가져올 수 있는 파일: 개인판 백업(.json) · 서버 백업 DB(.sqlite) · 서버판 data 폴더")
        if not b.get("confirmed") and not ctrl.ui.confirm(
                "데이터 바꾸기",
                f"지금 데이터를 '{Path(picked).name}' 의 내용으로 바꿉니다.\n"
                "지금 데이터는 지우지 않고 데이터 폴더의 restore_before_… 폴더에 보관합니다.\n계속할까요?"):
            return {"cancelled": True}
        task = (lambda: importer.import_server_folder(ctrl.cfg, picked)) if kind == "folder" else \
            (lambda: importer.import_db_file(ctrl.cfg, picked))

        def run():
            msg = ""
            try:
                r = ctrl.offline(task)
                n = sum((r.get("records") or {}).values())
                msg = f"가져왔습니다 — 기록 {n}건 · 사용자 {r.get('users', 0)}명" + \
                      (f" · 첨부 {r['files_filled']}개" if r.get("files_filled") else "") + \
                      (f"\n이전 데이터 보관: {r['kept']}" if r.get("kept") else "")
            except Exception as ex:      # 실패해도 서버는 다시 켜져 있음 (offline)
                msg = f"가져오지 못했습니다: {ex}"
            ctrl.ui.load_url(ctrl.entry_url())
            ctrl.ui.confirm("QIS 가져오기", msg)
        ctrl.later(run)
        return {"restart": True}

    @app.post("/api/desktop/open")
    async def open_file(request: Request):
        """첨부(PDF · 사진 · 문서) · 출력물(HTML)을 PC 기본 프로그램으로 열기 — 창 안에서 새 창을 띄울 수 없어서."""
        u = auth.session_user(request.cookies.get(COOKIE))
        if not key_ok(request) or not u:
            return err("QIS 프로그램 창에서만 쓸 수 있습니다", 403)
        b = await request.json()
        name = _safe_name(b.get("name", ""), "QIS_파일")
        if b.get("html") is not None:
            raw = str(b["html"]).encode("utf-8")
            if not name.lower().endswith((".html", ".htm")):
                name += ".html"
        else:
            m = re.match(r"^data:[^;,]*(;base64)?,(.*)$", b.get("data") or "", re.S)
            if not m:
                return err("파일 내용이 없습니다")
            try:
                raw = base64.b64decode(m.group(2)) if m.group(1) else m.group(2).encode("utf-8")
            except (binascii.Error, ValueError):
                return err("파일 내용을 읽지 못했습니다")
        if len(raw) > st.cfg.max_file_mb * 1024 * 1024 * 2:
            return err("파일이 너무 큽니다")
        d = ctrl.open_dir
        d.mkdir(parents=True, exist_ok=True)
        stem, dot, ext = name.rpartition(".")
        f = d / name
        if f.exists():
            f = d / (f"{stem}_{int(time.time())}.{ext}" if dot else f"{name}_{int(time.time())}")
        f.write_bytes(raw)
        ctrl.ui.open_path(f)
        return {"ok": True, "path": str(f)}


def ctrl_is_windows() -> bool:
    import sys
    return sys.platform.startswith("win")
