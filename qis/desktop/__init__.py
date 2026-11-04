"""QIS 데스크톱 프로그램 (QIS.app · QIS.exe).

기존 서버판을 그대로 묶은 것 — 화면(qis/web)과 서버(qis.app)는 같고, 아래만 더한다.
  paths.py     사용자 데이터 폴더 (맥 ~/Library/Application Support/QIS · 윈도우 %APPDATA%\\QIS)
  instance.py  같은 데이터 폴더를 두 번 열지 않게 잠금 + 비정상 종료 표시
  server.py    내장 서버 켜기 · 끄기 · 다시 켜기 (창 없이 시험할 수 있게 창과 분리)
  routes.py    처음 설정(혼자 쓰기 / 사내 서버) · 자동 로그인 · 데이터 폴더 · 가져오기 API
  importer.py  기존 서버판 data 폴더 · 백업 DB · 개인판 JSON 가져오기
  main.py      pywebview 창 (python -m qis.desktop)
"""
