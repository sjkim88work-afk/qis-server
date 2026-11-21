"""라우트 공통 — 세션 · 권한 · 쿠키. 서버 객체는 request.app.state 에서 꺼낸다."""
from __future__ import annotations

import hmac

from fastapi import Depends, HTTPException, Request, Response

COOKIE = "qis_sid"
WIN_COOKIE = "qis_win"       # 데스크톱 프로그램 창에서 온 요청 표시


def st(request: Request):
    return request.app.state


def ip_of(request: Request) -> str:
    return request.client.host if request.client else ""


def in_window(request: Request) -> bool:
    """프로그램 창에서 온 요청인지 — 창을 열 때 받은 표시 쿠키로 구분.
    팀원 브라우저로 접속한 화면에는 데스크톱 보조를 붙이지 않는다."""
    d = st(request).desktop or {}
    k = request.cookies.get(WIN_COOKIE) or ""
    t = str(d.get("token") or "")
    return bool(t) and hmac.compare_digest(k.encode(), t.encode())


def current(request: Request):
    s = st(request).auth.session_user(request.cookies.get(COOKIE))
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
    s = st(request).auth.session_user(request.cookies.get(COOKIE))
    return s[0] if s else None


def set_cookie(request: Request, resp: Response, token: str) -> None:
    # 마지막 사용 후 session_hours 동안 유지(서버가 확인) · 쿠키 자체는 최대 30일
    cfg = st(request).cfg
    max_age = min(cfg.session_hours * 3600 * 14, 30 * 24 * 3600)
    resp.set_cookie(COOKIE, token, httponly=True, samesite="strict", secure=cfg.https, path="/", max_age=max_age)


def set_win_cookie(request: Request, resp: Response) -> None:
    s = st(request)
    resp.set_cookie(WIN_COOKIE, str(s.desktop["token"]), httponly=True, samesite="strict", secure=s.cfg.https, path="/")
