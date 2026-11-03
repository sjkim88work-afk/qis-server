"""QIS 서버 — 웹 화면 + API.

화면: /login · / (QIS 본 화면) · /account (비밀번호 변경) · /admin (사용자 · 변경 이력 · 백업)
API : /api/... (로그인 세션 쿠키 필요, 변경 요청은 X-QIS 헤더 필요 — 다른 사이트에서의 위조 요청 차단)
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response

from . import __version__
from .auth import ROLES, Auth, AuthError, public_user
from .backup import Backup
from .config import Config, load_config
from .db import open_db
from .files import Files
from .store import COLLS, Forbidden, Store

WEB = Path(__file__).parent / "web"
COOKIE = "qis_sid"

CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' data: blob:; "
       "frame-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; "
       "form-action 'self'; frame-ancestors 'none'")


def create_app(cfg: Config | None = None, *, start_backup=True) -> FastAPI:
    cfg = cfg or load_config()
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    db = open_db(cfg)
    auth = Auth(db, cfg)
    store = Store(db, cfg)
    files = Files(db, cfg)
    backup = Backup(db, store, cfg)
    app = FastAPI(title="QIS", version=__version__, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.cfg, app.state.db, app.state.auth, app.state.store, app.state.files, app.state.backup = \
        cfg, db, auth, store, files, backup

    if start_backup:
        @app.on_event("startup")
        def _start():
            auth.purge_sessions()
            backup.start()

        @app.on_event("shutdown")
        def _stop():
            backup.stop()

    # ---- 공통: 보안 헤더 · 위조 요청 차단 ----
    @app.middleware("http")
    async def guard(request: Request, call_next):
        if request.url.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
            if request.headers.get("x-qis") != "1":
                return JSONResponse({"error": "csrf", "message": "잘못된 요청입니다"}, status_code=403)
        resp = await call_next(request)
        h = resp.headers
        h["Content-Security-Policy"] = CSP
        h["X-Content-Type-Options"] = "nosniff"
        h["X-Frame-Options"] = "DENY"
        h["Referrer-Policy"] = "same-origin"
        h["Permissions-Policy"] = "geolocation=(), microphone=(), camera=(self)"
        if cfg.https:
            h["Strict-Transport-Security"] = "max-age=31536000"
        if request.url.path.startswith("/api/") or request.url.path in ("/", "/admin", "/account"):
            h["Cache-Control"] = "no-store"
        return resp

    def ip_of(request: Request) -> str:
        return request.client.host if request.client else ""

    def current(request: Request):
        s = auth.session_user(request.cookies.get(COOKIE))
        if not s:
            raise HTTPException(401, "로그인이 필요합니다")
        request.state.token_hash = s[1]
        if s[0]["must_change"] and request.url.path not in ("/api/me", "/api/me/password", "/api/logout"):
            raise HTTPException(403, "비밀번호를 먼저 바꿔 주세요")
        return s[0]

    def admin_only(user=Depends(current)):
        if user["role"] != "admin":
            raise HTTPException(403, "관리자만 할 수 있습니다")
        return user

    def page_user(request: Request):
        s = auth.session_user(request.cookies.get(COOKIE))
        return s[0] if s else None

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

    def set_cookie(resp: Response, token: str):
        resp.set_cookie(COOKIE, token, httponly=True, samesite="strict", secure=cfg.https, path="/",
                        max_age=cfg.session_hours * 3600 * 14)

    # ---- 화면 ----
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

    @app.get("/", response_class=HTMLResponse)
    def home(request: Request):
        u = page_user(request)
        if not u:
            return RedirectResponse("/login", status_code=303)
        if u["must_change"]:
            return RedirectResponse("/account?first=1", status_code=303)
        info = {"user": u["username"], "name": u["name"], "role": u["role"], "roleName": ROLES[u["role"]],
                "server": __version__, "company": cfg.company}
        tag = '<script id="qisServer" type="application/json">' + \
              json.dumps(info, ensure_ascii=False).replace("</", "<\\/") + "</script>"
        return HTMLResponse(index_html().replace("<head>", "<head>\n" + tag, 1))

    def static_page(name: str):
        return HTMLResponse((WEB / name).read_text(encoding="utf-8"))

    @app.get("/login", response_class=HTMLResponse)
    def login_page(request: Request):
        if page_user(request):
            return RedirectResponse("/", status_code=303)
        return static_page("login.html")

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
        f = WEB / "lib" / name
        if not re.match(r"^[\w.-]+$", name) or not f.is_file():
            raise HTTPException(404, "없음")
        return FileResponse(f, media_type="application/wasm" if name.endswith(".wasm") else None)

    @app.get("/icons/{name}")
    def icons(name: str):
        f = WEB / "icons" / name
        if not re.match(r"^[\w.-]+$", name) or not f.is_file():
            raise HTTPException(404, "없음")
        return FileResponse(f)

    @app.get("/assets/{name}")
    def assets(name: str):
        f = WEB / "assets" / name
        if not re.match(r"^[\w.-]+$", name) or not f.is_file():
            raise HTTPException(404, "없음")
        return FileResponse(f)

    @app.get("/healthz")
    def health():
        return {"ok": True, "version": __version__}

    # ---- 로그인 ----
    @app.post("/api/login")
    async def login(request: Request):
        b = await request.json()
        token, user = auth.login(b.get("username", ""), b.get("password", ""), ip=ip_of(request),
                                 ua=request.headers.get("user-agent"))
        resp = JSONResponse({"user": user})
        set_cookie(resp, token)
        return resp

    @app.post("/api/logout")
    def logout(request: Request):
        s = auth.session_user(request.cookies.get(COOKIE))
        if s:
            auth.logout(s[1], s[0], ip_of(request))
        resp = JSONResponse({"ok": True})
        resp.delete_cookie(COOKIE, path="/")
        return resp

    @app.get("/api/me")
    def me(user=Depends(current)):
        return {"user": public_user(user)}

    @app.post("/api/me/password")
    async def me_pw(request: Request, user=Depends(current)):
        b = await request.json()
        auth.change_password(user, b.get("old", ""), b.get("new", ""), keep_token_hash=request.state.token_hash,
                             ip=ip_of(request))
        return {"ok": True}

    # ---- 데이터 ----
    @app.get("/api/boot")
    def boot(user=Depends(current)):
        return {**store.boot(), "user": public_user(user)}

    @app.post("/api/sync")
    async def sync(request: Request, user=Depends(current)):
        b = await request.json()
        ch = b.get("changes") or []
        if not isinstance(ch, list) or len(ch) > 20000:
            raise ValueError("요청 형식이 올바르지 않습니다")
        if ch and user["role"] == "viewer":
            raise Forbidden("조회 권한은 저장할 수 없습니다")
        since = b.get("since")
        return store.sync(user, int(since) if since is not None else None, ch, ip=ip_of(request))

    @app.post("/api/files/get")
    async def files_get(request: Request, user=Depends(current)):
        b = await request.json()
        return {"files": files.get_many(b.get("ids") or [])}

    @app.get("/api/files/ids")
    def files_ids(user=Depends(current)):
        return {"ids": files.all_ids()}

    @app.post("/api/files/put")
    async def files_put(request: Request, user=Depends(current)):
        b = await request.json()
        return {"saved": files.put_many(user, b.get("files") or [], ip=ip_of(request))}

    @app.post("/api/files/delete")
    async def files_del(request: Request, user=Depends(current)):
        b = await request.json()
        return {"deleted": files.delete_many(user, b.get("ids") or [], ip=ip_of(request))}

    # ---- 관리자 ----
    @app.get("/api/admin/users")
    def users(user=Depends(admin_only)):
        return {"users": auth.list_users(), "roles": ROLES}

    @app.post("/api/admin/users")
    async def user_add(request: Request, user=Depends(admin_only)):
        b = await request.json()
        u = auth.create_user(b.get("username", ""), b.get("name", ""), b.get("role", "editor"), b.get("password", ""),
                             by=user, ip=ip_of(request))
        return {"user": u}

    @app.patch("/api/admin/users/{uid}")
    async def user_upd(uid: int, request: Request, user=Depends(admin_only)):
        b = await request.json()
        return {"user": auth.update_user(uid, by=user, name=b.get("name"), role=b.get("role"), active=b.get("active"),
                                         ip=ip_of(request))}

    @app.post("/api/admin/users/{uid}/reset")
    async def user_reset(uid: int, request: Request, user=Depends(admin_only)):
        b = await request.json()
        auth.reset_password(uid, b.get("password", ""), by=user, ip=ip_of(request))
        return {"ok": True}

    @app.get("/api/admin/audit")
    def audit(request: Request, user=Depends(admin_only)):
        p = request.query_params
        return {"items": store.audit_list(coll=p.get("coll"), rec_id=p.get("id"), user=p.get("user"),
                                          action=p.get("action"), q=p.get("q"), frm=p.get("from"), to=p.get("to"),
                                          before_id=p.get("before"), limit=p.get("limit") or 200)}

    @app.get("/api/history")
    def history(request: Request, user=Depends(current)):
        """기록 한 건의 변경 이력 (모든 사용자 — 화면의 '변경 이력' 버튼)."""
        p = request.query_params
        if not p.get("coll") or not p.get("id"):
            raise ValueError("기록을 지정하세요")
        if user["role"] != "admin" and p.get("coll") not in (*COLLS, "doc", "files"):
            raise Forbidden("이 이력은 관리자만 볼 수 있습니다")
        return {"items": store.audit_list(coll=p.get("coll"), rec_id=p.get("id"), limit=300)}

    @app.get("/api/admin/versions")
    def versions(request: Request, user=Depends(admin_only)):
        p = request.query_params
        return {"versions": store.versions(p.get("coll"), p.get("id"))}

    @app.get("/api/admin/backup")
    def backup_info(user=Depends(admin_only)):
        err = db.get_meta("last_backup_error")
        return {"last": backup.last(), "error": json.loads(err) if err else None, "list": backup.list(),
                "dir": str(backup.root), "keep": cfg.backup_keep, "hour": cfg.backup_hour}

    @app.post("/api/admin/backup")
    def backup_now(user=Depends(admin_only)):
        return {"info": backup.run("manual", user=user)}

    @app.get("/api/admin/export")
    def export(request: Request, user=Depends(admin_only)):
        data = store.export()
        if request.query_params.get("photos") == "1":
            data["photos"] = files.get_many(files.all_ids(), limit=None)
        with db.tx() as c:
            db.audit(c, user=user, action="export", label="QIS 백업 내려받기",
                     detail={"photos": "photos" in data}, ip=ip_of(request))
        return JSONResponse(data, headers={"Content-Disposition": "attachment; filename=\"QIS_server_export.json\""})

    @app.post("/api/admin/import")
    async def import_(request: Request, user=Depends(admin_only)):
        b = await request.json()
        photos = b.pop("photos", None)
        cnt = store.import_backup(user, b, ip=ip_of(request))
        if isinstance(photos, list) and photos:
            ok = [p for p in photos if isinstance(p, dict) and p.get("id")]
            for i in range(0, len(ok), 50):
                files.put_many(user, ok[i:i + 50], ip=ip_of(request))
            cnt["photos"] = len(ok)
        return {"imported": cnt}

    return app
