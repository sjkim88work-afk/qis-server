@echo off
chcp 65001 >nul
rem ===== QIS 서버 시작 (Windows) — 더블클릭 =====
rem 처음: 필요한 프로그램 설치 → 관리자 계정 만들기 → 서버 시작
rem 다음부터: 바로 서버 시작 + 브라우저 열기. 창을 닫으면 서버가 멈춥니다.
cd /d "%~dp0"

set "PY="
py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY python --version >nul 2>nul && set "PY=python"
if not defined PY (
  echo [오류] Python 3.11 이상이 필요합니다.
  echo   python.org 에서 설치하세요. 설치 첫 화면에서 "Add python.exe to PATH" 를 체크합니다.
  goto :fail
)

if not exist .venv\Scripts\python.exe (
  echo 처음 실행 — 프로그램을 준비합니다 (1~2분^)...
  %PY% -m venv .venv || (echo [오류] 가상환경을 만들지 못했습니다 & goto :fail)
)
fc /b requirements.txt .venv\requirements.installed >nul 2>nul
if errorlevel 1 (
  if exist wheels (
    .venv\Scripts\python -m pip install -q --no-index --find-links wheels -r requirements.txt || goto :pipfail
  ) else (
    .venv\Scripts\python -m pip install -q -r requirements.txt || goto :pipfail
  )
  copy /y requirements.txt .venv\requirements.installed >nul
)

.venv\Scripts\python -m qis.launcher
if errorlevel 1 goto :fail
exit /b 0

:pipfail
echo [오류] 프로그램 설치에 실패했습니다. 인터넷 연결을 확인하세요.
echo   인터넷이 막힌 PC는 README 의 wheels 폴더 방법을 따릅니다.
:fail
pause
exit /b 1
