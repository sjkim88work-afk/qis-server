"""서버 라우트 — 역할별 모듈.

  deps     공통: 세션 확인(current · admin_only · page_user) · 쿠키 · 요청 IP
  pages    화면: / · /login · /account · /admin · 정적 파일 · /healthz · 데스크톱 창 입장
  auth     /api/login · logout · me · me/password
  data     /api/boot · sync · files/* · history
  admin    /api/admin/users · audit · versions · backup · export · import · reset · photos/missing
  telegram /api/admin/telegram/*

모든 라우트는 request.app.state 의 cfg · db · auth · store · files · backup · telegram · desktop 을 쓴다.
"""
from __future__ import annotations

from fastapi import FastAPI

from . import admin, auth, data, pages, telegram


def mount(app: FastAPI) -> None:
    pages.mount(app)
    app.include_router(auth.router)
    app.include_router(data.router)
    app.include_router(admin.router)
    app.include_router(telegram.router)
