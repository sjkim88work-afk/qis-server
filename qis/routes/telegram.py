"""/api/admin/telegram/* — 텔레그램 아침 요약 (관리자)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..telegram import TelegramError
from .deps import admin_only, ip_of, st

router = APIRouter(prefix="/api/admin/telegram")


@router.get("")
def telegram_info(request: Request, user=Depends(admin_only)):
    return st(request).telegram.status()


@router.post("")
async def telegram_set(request: Request, user=Depends(admin_only)):
    s = st(request)
    ch = await request.json()
    try:
        s.telegram.update(ch if isinstance(ch, dict) else {})
    except ValueError as e:
        raise HTTPException(400, str(e))
    with s.db.tx() as c:
        s.db.audit(c, user=user, action="telegram.update", label="알림 설정 변경",
                   detail={k: ("***" if k in ("token", "teams_webhook") else v) for k, v in (ch or {}).items()}, ip=ip_of(request))
    return s.telegram.status()


@router.get("/preview")
def telegram_preview(request: Request, user=Depends(admin_only)):
    return {"text": st(request).telegram.summary()}


@router.post("/test")
def telegram_test(request: Request, user=Depends(admin_only)):
    try:
        st(request).telegram.send_text("[QIS] 텔레그램 알림 시험 전송입니다.")
    except TelegramError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.post("/teams/test")
def teams_test(request: Request, user=Depends(admin_only)):
    try:
        st(request).telegram.send_teams("[QIS] 팀즈 알림 시험 전송입니다.\n이 글이 보이면 설정이 맞습니다.")
    except TelegramError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.post("/send")
def telegram_send(request: Request, user=Depends(admin_only)):
    try:
        return {"text": st(request).telegram.send_summary("manual", user=user)}
    except TelegramError as e:
        raise HTTPException(400, str(e))


@router.post("/chats")
def telegram_chats(request: Request, user=Depends(admin_only)):
    try:
        return {"chats": st(request).telegram.find_chats()}
    except TelegramError as e:
        raise HTTPException(400, str(e))
