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
from .deps import in_window, page_user, set_win_cookie

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
    local = bool(desktop and desktop.get("scope") == "local")   # 접속 범위 ‘이 PC만’

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
            info["desktop"] = desktop.get("scope") or "lan"   # 접속 범위: local · lan · tailscale
        tag = '<script id="qisServer" type="application/json">' + \
              json.dumps(info, ensure_ascii=False).replace("</", "<\\/") + "</script>"
        if win:   # 데스크톱 창 보조 (새 창 · 보고서 창 · 파일 저장) — 화면 파일은 그대로
            tag += '\n<script src="/desktop.js"></script>'
        return HTMLResponse(index_html().replace("<head>", "<head>\n" + tag, 1))

    @app.get("/login", response_class=HTMLResponse)
    def login_page(request: Request):
        if page_user(request):
            return RedirectResponse("/", status_code=303)
        if local and in_window(request):
            # ‘이 PC만’ 의 프로그램 창: 계정이 한 개뿐이면 아이디를 미리 채움 (혼자 쓰는 PC — 비밀번호만 넣으면 됨)
            us = request.app.state.db.q("SELECT username FROM users WHERE active=1 LIMIT 2")
            if len(us) == 1:
                h = (WEB / "login.html").read_text(encoding="utf-8")
                tag = ('<script id="qisOneUser">document.addEventListener("DOMContentLoaded",function(){'
                       'var u=document.getElementById("u"),p=document.getElementById("p");if(!u||!p||u.value)return;'
                       'u.value=' + json.dumps(us[0]["username"]).replace("</", "<\\/") + ';p.focus()})</script>')
                return HTMLResponse(h.replace("</head>", tag + "\n</head>", 1))
        return static_page("login.html")

    if desktop:
        @app.get("/desktop.js")
        def desktop_js():
            return FileResponse(WEB / "desktop.js", media_type="text/javascript")

    if desktop:
        @app.get("/desktop/window")
        def desktop_window(request: Request, k: str = ""):
            """프로그램 창 표시 쿠키만 붙이고 QIS 로 (로그인은 그대로 필요)."""
            _check_token(request, k)
            resp = RedirectResponse("/", status_code=303)
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
