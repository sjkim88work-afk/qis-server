"""/api/boot · sync · files/* · history — 로그인한 모든 사용자."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ..auth import public_user
from ..store import COLLS, Forbidden
from .deps import current, ip_of, st

router = APIRouter(prefix="/api")


def writable(request: Request) -> None:
    lic = st(request).license
    if lic.readonly:
        raise Forbidden("읽기 전용 상태입니다 — " + lic.status()["message"])


@router.get("/license")
def license_info(request: Request, user=Depends(current)):
    return st(request).license.public()


@router.get("/boot")
def boot(request: Request, user=Depends(current)):
    return {**st(request).store.boot(), "user": public_user(user)}


@router.post("/sync")
async def sync(request: Request, user=Depends(current)):
    b = await request.json()
    ch = b.get("changes") or []
    if not isinstance(ch, list) or len(ch) > 20000:
        raise ValueError("요청 형식이 올바르지 않습니다")
    if ch and user["role"] == "viewer":
        raise Forbidden("조회 권한은 저장할 수 없습니다")
    if ch:
        writable(request)
    since = b.get("since")
    return st(request).store.sync(user, int(since) if since is not None else None, ch, ip=ip_of(request))


@router.post("/files/get")
async def files_get(request: Request, user=Depends(current)):
    b = await request.json()
    return {"files": st(request).files.get_many(b.get("ids") or [])}


@router.get("/files/ids")
def files_ids(request: Request, user=Depends(current)):
    return {"ids": st(request).files.all_ids()}


@router.post("/files/put")
async def files_put(request: Request, user=Depends(current)):
    writable(request)
    b = await request.json()
    return {"saved": st(request).files.put_many(user, b.get("files") or [], ip=ip_of(request))}


@router.post("/files/delete")
async def files_del(request: Request, user=Depends(current)):
    writable(request)
    b = await request.json()
    return {"deleted": st(request).files.delete_many(user, b.get("ids") or [], ip=ip_of(request))}


@router.get("/history")
def history(request: Request, user=Depends(current)):
    """기록 한 건의 변경 이력 (모든 사용자 — 화면의 '변경 이력' 버튼)."""
    p = request.query_params
    if not p.get("coll") or not p.get("id"):
        raise ValueError("기록을 지정하세요")
    if user["role"] != "admin" and p.get("coll") not in (*COLLS, "doc", "files"):
        raise Forbidden("이 이력은 관리자만 볼 수 있습니다")
    return {"items": st(request).store.audit_list(coll=p.get("coll"), rec_id=p.get("id"), limit=300)}
