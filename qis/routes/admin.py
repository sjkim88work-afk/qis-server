"""/api/admin/* — 사용자 · 변경 이력 · 백업 · 내보내기 · 가져오기 · 비우기 (관리자만)."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from ..auth import ROLES
from ..files import has_body
from .deps import admin_only, ip_of, st

router = APIRouter(prefix="/api/admin")


@router.get("/users")
def users(request: Request, user=Depends(admin_only)):
    return {"users": st(request).auth.list_users(), "roles": ROLES}


@router.post("/users")
async def user_add(request: Request, user=Depends(admin_only)):
    b = await request.json()
    u = st(request).auth.create_user(b.get("username", ""), b.get("name", ""), b.get("role", "editor"),
                                     b.get("password", ""), by=user, ip=ip_of(request))
    return {"user": u}


@router.patch("/users/{uid}")
async def user_upd(uid: int, request: Request, user=Depends(admin_only)):
    b = await request.json()
    return {"user": st(request).auth.update_user(uid, by=user, name=b.get("name"), role=b.get("role"),
                                                 active=b.get("active"), ip=ip_of(request))}


@router.post("/users/{uid}/reset")
async def user_reset(uid: int, request: Request, user=Depends(admin_only)):
    b = await request.json()
    st(request).auth.reset_password(uid, b.get("password", ""), by=user, ip=ip_of(request))
    return {"ok": True}


@router.get("/audit")
def audit(request: Request, user=Depends(admin_only)):
    p = request.query_params
    return {"items": st(request).store.audit_list(
        coll=p.get("coll"), rec_id=p.get("id"), user=p.get("user"), action=p.get("action"), q=p.get("q"),
        frm=p.get("from"), to=p.get("to"), before_id=p.get("before"), limit=p.get("limit") or 200)}


@router.get("/versions")
def versions(request: Request, user=Depends(admin_only)):
    p = request.query_params
    return {"versions": st(request).store.versions(p.get("coll"), p.get("id"))}


@router.get("/backup")
def backup_info(request: Request, user=Depends(admin_only)):
    s = st(request)
    err = s.db.get_meta("last_backup_error")
    return {"last": s.backup.last(), "error": json.loads(err) if err else None, "list": s.backup.list(),
            "dir": str(s.backup.root), "keep": s.cfg.backup_keep, "hour": s.cfg.backup_hour}


@router.post("/backup")
def backup_now(request: Request, user=Depends(admin_only)):
    return {"info": st(request).backup.run("manual", user=user)}


@router.get("/export")
def export(request: Request, user=Depends(admin_only)):
    s = st(request)
    data = s.store.export()
    if request.query_params.get("photos") == "1":
        data["photos"] = s.files.get_many(s.files.all_ids(), limit=None)
    with s.db.tx() as c:
        s.db.audit(c, user=user, action="export", label="QIS 백업 내려받기",
                   detail={"photos": "photos" in data}, ip=ip_of(request))
    return JSONResponse(data, headers={"Content-Disposition": "attachment; filename=\"QIS_server_export.json\""})


def reset_all(request: Request, user, reason: str) -> dict:
    """비우기 전 DB 백업 → 기록 · 첨부 비우기. 되돌리려면 그 백업으로 복원."""
    s = st(request)
    ip = ip_of(request)
    info = s.backup.run(reason, user=user)
    cnt = s.store.clear_all(user, ip=ip)
    cnt["files"] = s.files.clear_all(user, ip=ip)
    return {"cleared": cnt, "backup": info["db"]}


@router.get("/update")
def update_status(request: Request, user=Depends(admin_only)):
    return st(request).updater.status()


@router.post("/update/check")
def update_check(request: Request, user=Depends(admin_only)):
    return st(request).updater.check(force=True)


@router.get("/photos/missing")
def photos_missing(request: Request, user=Depends(admin_only)):
    """기록이 가리키는데 내용이 없는 첨부 목록 — 관리 화면 '빠진 사진 채우기'."""
    return st(request).files.missing()


@router.post("/reset")
async def reset(request: Request, user=Depends(admin_only)):
    b = await request.json()
    if b.get("confirm") != "비우기":
        raise ValueError("확인 문구가 맞지 않습니다")
    return reset_all(request, user, "before_reset")


@router.post("/import")
async def import_(request: Request, user=Depends(admin_only)):
    s = st(request)
    b = await request.json()
    photos = b.pop("photos", None)
    replace = bool(b.pop("_replace", False))
    if s.store.has_records():
        if not replace:
            return JSONResponse({"error": "has_records", "message": "서버에 이미 기록이 있습니다"}, status_code=409)
        reset_all(request, user, "before_import")
    cnt = s.store.import_backup(user, b, ip=ip_of(request))
    if isinstance(photos, list) and photos:
        ok = [p for p in photos if isinstance(p, dict) and p.get("id")]
        for i in range(0, len(ok), 50):
            s.files.put_many(user, ok[i:i + 50], ip=ip_of(request))
        cnt["photos"] = sum(1 for p in ok if has_body(p))
        if len(ok) != cnt["photos"]:
            cnt["photos_meta_only"] = len(ok) - cnt["photos"]
    return {"imported": cnt}
