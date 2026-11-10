"""QIS 서버 — 웹 화면 + API.

화면: /login · / (QIS 본 화면) · /account (비밀번호 변경) · /admin (사용자 · 변경 이력 · 백업)
API : /api/... (로그인 세션 쿠키 필요, 변경 요청은 X-QIS 헤더 필요 — 다른 사이트에서의 위조 요청 차단)

이 파일은 서버 객체를 만들고(app.state) 보안 헤더 · 오류 응답 같은 공통 처리를 붙인다.
라우트는 qis/routes/ 에 역할별로 있다.
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from . import __version__
from .auth import Auth, AuthError
from .backup import Backup
from .config import Config, load_config
from .db import open_db
from .files import Files
from .routes import mount
from .routes.deps import COOKIE, in_window  # noqa: F401  (COOKIE 는 바깥에서 참조할 수 있게 그대로 둠)
from .routes.pages import WEB  # noqa: F401
from .store import Forbidden, Store
from .telegram import Telegram
from .update import Updater

CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' data: blob:; "
       "frame-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; "
       "form-action 'self'; frame-ancestors 'none'")
# 데스크톱 창(프로그램 창에서 온 요청에만): pywebview 가 화면 ↔ 프로그램 다리를 new Function · eval 로 만들므로
# 'unsafe-eval' 허용, 내려받을 파일(blob:)을 읽어 프로그램의 '저장' 창으로 넘기려면 blob: 읽기 허용
CSP_DESKTOP = CSP.replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'") \
                 .replace("connect-src 'self'", "connect-src 'self' blob: data:")


def create_app(cfg: Config | None = None, *, start_backup=True, desktop: dict | None = None) -> FastAPI:
    """desktop: 데스크톱 프로그램(qis.desktop)에서 띄울 때만 —
       {"mode": "solo" | "lan", "token": 자동 입장 열쇠(solo), "user": 로컬 관리자 아이디(solo)}"""
    cfg = cfg or load_config()
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    db = open_db(cfg)
    auth = Auth(db, cfg)
    store = Store(db, cfg)
    files = Files(db, cfg)
    backup = Backup(db, store, cfg)
    telegram = Telegram(db, store, cfg)
    app = FastAPI(title="QIS", version=__version__, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.cfg, app.state.db, app.state.auth, app.state.store, app.state.files, app.state.backup = \
        cfg, db, auth, store, files, backup
    app.state.desktop = desktop
    app.state.telegram = telegram
    app.state.updater = Updater(db, cfg)

    if start_backup:
        @app.on_event("startup")
        def _start():
            auth.purge_sessions()
            backup.start()
            telegram.start()
            app.state.updater.start()

        @app.on_event("shutdown")
        def _stop():
            backup.stop()
            telegram.stop()
            app.state.updater.stop()

    # ---- 공통: 보안 헤더 · 위조 요청 차단 ----
    @app.middleware("http")
    async def guard(request: Request, call_next):
        if request.url.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
            if request.headers.get("x-qis") != "1":
                return JSONResponse({"error": "csrf", "message": "잘못된 요청입니다"}, status_code=403)
        resp = await call_next(request)
        h = resp.headers
        h["Content-Security-Policy"] = CSP_DESKTOP if desktop and in_window(request) else CSP
        h["X-Content-Type-Options"] = "nosniff"
        h["X-Frame-Options"] = "DENY"
        h["Referrer-Policy"] = "same-origin"
        h["Permissions-Policy"] = "geolocation=(), microphone=(), camera=(self)"
        if cfg.https:
            h["Strict-Transport-Security"] = "max-age=31536000"
        if request.url.path.startswith("/api/") or request.url.path in ("/", "/admin", "/account"):
            h["Cache-Control"] = "no-store"
        return resp

    # ---- 오류 응답은 모두 JSON {error, message} ----
    @app.exception_handler(HTTPException)
    async def http_err(request: Request, exc: HTTPException):
        return JSONResponse({"error": "http", "message": exc.detail}, status_code=exc.status_code)

    @app.exception_handler(AuthError)
    async def auth_err(request: Request, exc: AuthError):
        return JSONResponse({"error": exc.code, "message": str(exc)}, status_code=400)

    @app.exception_handler(Forbidden)
    async def forb(request: Request, exc: Forbidden):
        return JSONResponse({"error": "forbidden", "message": str(exc)}, status_code=403)

    @app.exception_handler(ValueError)
    async def bad(request: Request, exc: ValueError):
        return JSONResponse({"error": "invalid", "message": str(exc)}, status_code=400)

    mount(app)
    return app
