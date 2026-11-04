"""QIS 데스크톱 프로그램 (맥 QIS.app · 윈도우 QIS.exe).

기존 서버판을 그대로 품은 프로그램: 내장 서버 + 프로그램 창(pywebview).
  paths.py   사용자 데이터 폴더 (맥 ~/Library/Application Support/QIS, 윈도우 %APPDATA%\\QIS)
  lock.py    같은 데이터 폴더를 두 번 여는 것 막기 (단일 실행 잠금)
  core.py    설정(desktop.json) · 서버 켜기/끄기 · 손상 검사 · 가져오기/복원 — 창 없이 시험 가능
  gui.py     프로그램 창 · 메뉴 · 첫 실행 화면 (pywebview)
  __main__.py  실행: python -m qis.desktop   (--selftest 결과파일: 창 없이 기동 · 종료 점검)
"""
