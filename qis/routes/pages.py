"""화면 · 정적 파일 · 데스크톱 창 입장."""
from __future__ import annotations

import hmac
import json
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse

from .. import __version__
from ..auth import ROLES
from .deps import in_window, ip_of, page_user, set_cookie, set_win_cookie

WEB = Path(__file__).parent.parent / "web"
_idx = {"mtime": 0, "html": ""}


def index_html() -> str:
    f = WEB / "index.html"
    m = f.stat().st_mtime
    if m != _idx["mtime"]:
        h = f.read_text(encoding="utf-8")
        # 외부(인터넷) 글꼴 연결 제거 — 사내망 전용, 글꼴은 PC의 맑은 고딕 사용
        h = re.sub(r'<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\s*', "", h)
        _idx.update(mtime=m, html=h)
    return _idx["html"]


def static_page(name: str):
    return HTMLResponse((WEB / name).read_text(encoding="utf-8"))


def _static(folder: str, name: str, media_type: str | None = None):
    f = WEB / folder / name
    if not re.match(r"^[\w.-]+$", name) or not f.is_file():
        raise HTTPException(404, "없음")
    return FileResponse(f, media_type=media_type)


def _check_token(request: Request, k: str) -> dict:
    d = request.app.state.desktop or {}
    if not d.get("token") or not hmac.compare_digest(k.encode(), str(d["token"]).encode()):
        raise HTTPException(403, "잘못된 요청입니다")
    return d


def mount(app: FastAPI) -> None:
    """화면 라우트. 데스크톱 전용 경로는 그 모드로 띄울 때만 생긴다 (app.state.desktop)."""
    desktop = app.state.desktop
    solo = bool(desktop and desktop.get("mode") == "solo")

    @app.get("/", response_class=HTMLResponse)
    def home(request: Request):
        u = page_user(request)
        if not u:
            return RedirectResponse("/login", status_code=303)
        if u["must_change"]:
            return RedirectResponse("/account?first=1", status_code=303)
        info = {"user": u["username"], "name": u["name"], "role": u["role"], "roleName": ROLES[u["role"]],
                "server": __version__, "company": request.app.state.cfg.company}
        win = bool(desktop) and in_window(request)
        if win:
            info["desktop"] = desktop.get("mode")
        tag = '<script id="qisServer" type="application/json">' + \
              json.dumps(info, ensure_ascii=False).replace("</", "<\\/") + "</script>"
        if win:   # 데스크톱 창 보조 (새 창 · 보고서 창 · 혼자 쓰기 화면 정리) — 화면 파일은 그대로
            tag += '\n<script src="/desktop.js"></script>'
        return HTMLResponse(index_html().replace("<head>", "<head>\n" + tag, 1))

    @app.get("/login", response_class=HTMLResponse)
    def login_page(request: Request):
        if page_user(request):
            return RedirectResponse("/", status_code=303)
        if solo:   # 혼자 쓰기: 비밀번호 없이 다시 들어가기
            return static_page("desktop_enter.html")
        return static_page("login.html")

    if desktop:
        @app.get("/desktop.js")
        def desktop_js():
            return FileResponse(WEB / "desktop.js", media_type="text/javascript")

    if desktop and not solo:
        @app.get("/desktop/window")
        def desktop_window(request: Request, k: str = ""):
            """사내 서버 모드: 프로그램 창 표시 쿠키만 붙이고 로그인 화면으로 (로그인은 그대로 필요)."""
            _check_token(request, k)
            resp = RedirectResponse("/", status_code=303)
            set_win_cookie(request, resp)
            return resp

    if solo:
        @app.get("/desktop/enter")
        def desktop_enter(request: Request, k: str = ""):
            """프로그램이 창을 열 때만 아는 열쇠(k)로 로컬 관리자 세션을 연다 — 127.0.0.1 전용 실행에서만."""
            d = _check_token(request, k)
            s = request.app.state
            u = s.db.q1("SELECT * FROM users WHERE lower(username)=lower(?) AND active=1", (d.get("user") or "",))
            if not u:
                raise HTTPException(403, "이 PC 사용자 계정이 없습니다 — 프로그램을 다시 시작하세요")
            token, _ = s.auth.open_session(u, ip=ip_of(request), ua=request.headers.get("user-agent"),
                                           action="login.desktop")
            resp = RedirectResponse("/", status_code=303)
            set_cookie(request, resp, token)
            set_win_cookie(request, resp)
            return resp

    @app.get("/account", response_class=HTMLResponse)
    def account_page(request: Request):
        if not page_user(request):
            return RedirectResponse("/login", status_code=303)
        return static_page("account.html")

    @app.get("/admin", response_class=HTMLResponse)
    def admin_page(request: Request):
        u = page_user(request)
        if not u:
            return RedirectResponse("/login", status_code=303)
        if u["role"] != "admin":
            return RedirectResponse("/", status_code=303)
        return static_page("admin.html")

    @app.get("/manifest.webmanifest")
    def manifest():
        return FileResponse(WEB / "manifest.webmanifest", media_type="application/manifest+json")

    @app.get("/lib/{name}")
    def lib(name: str):
        return _static("lib", name, "application/wasm" if name.endswith(".wasm") else None)

    @app.get("/icons/{name}")
    def icons(name: str):
        return _static("icons", name)

    @app.get("/assets/{name}")
    def assets(name: str):
        return _static("assets", name)

    @app.get("/healthz")
    def health():
        return {"ok": True, "version": __version__}
