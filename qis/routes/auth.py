"""/api/login · logout · me · me/password"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from ..auth import public_user
from .deps import COOKIE, current, ip_of, set_cookie, st

router = APIRouter(prefix="/api")


@router.post("/login")
async def login(request: Request):
    b = await request.json()
    token, user = st(request).auth.login(b.get("username", ""), b.get("password", ""), ip=ip_of(request),
                                         ua=request.headers.get("user-agent"))
    resp = JSONResponse({"user": user})
    set_cookie(request, resp, token)
    return resp


@router.post("/logout")
def logout(request: Request):
    auth = st(request).auth
    s = auth.session_user(request.cookies.get(COOKIE))
    if s:
        auth.logout(s[1], s[0], ip_of(request))
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE, path="/")
    return resp


@router.get("/me")
def me(user=Depends(current)):
    return {"user": public_user(user)}


@router.post("/me/password")
async def me_pw(request: Request, user=Depends(current)):
    b = await request.json()
    st(request).auth.change_password(user, b.get("old", ""), b.get("new", ""), keep_token_hash=request.state.token_hash,
                                     ip=ip_of(request))
    return {"ok": True}
