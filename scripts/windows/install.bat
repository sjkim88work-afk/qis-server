@echo off
chcp 65001 >nul
rem ===== QIS 서버 설치 (Windows) =====
rem  1) Python 3.11 이상 설치 (python.org, 설치 때 "Add python.exe to PATH" 체크)
rem  2) 이 폴더(qis-server)에서 이 파일을 실행
rem  인터넷이 막힌 PC: 인터넷 되는 PC에서 "pip download -r requirements.txt -d wheels" 후 wheels 폴더를 같이 복사
cd /d "%~dp0\..\.."

where python >nul 2>nul || (echo [오류] Python이 없습니다. python.org 에서 설치하세요. & pause & exit /b 1)

if not exist .venv (
  echo 가상환경 만드는 중...
  python -m venv .venv || (echo [오류] 가상환경을 만들지 못했습니다 & pause & exit /b 1)
)

if exist wheels (
  .venv\Scripts\python -m pip install --no-index --find-links wheels -r requirements.txt || goto :fail
) else (
  .venv\Scripts\python -m pip install -r requirements.txt || goto :fail
)

echo.
echo 처음 설정: 관리자 계정을 만듭니다.
.venv\Scripts\python -m qis init || goto :fail

echo.
echo 설치 완료. run.bat 으로 서버를 실행하세요.
echo 다른 PC에서 접속하려면 방화벽을 엽니다 (관리자 권한 명령 창):
echo   netsh advfirewall firewall add rule name="QIS" dir=in action=allow protocol=TCP localport=8080
pause
exit /b 0

:fail
echo [오류] 설치 중 문제가 생겼습니다. 위 메시지를 확인하세요.
pause
exit /b 1
