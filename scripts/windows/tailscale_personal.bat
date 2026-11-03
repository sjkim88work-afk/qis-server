@echo off
chcp 65001 >nul
rem ===== QIS 개인 사용: Tailscale로 연결된 내 기기에서만 접속 =====
rem  · QIS 서버가 이 PC 안(127.0.0.1)에서만 접속을 받도록 바꾸고
rem  · Tailscale이 내 Tailscale 계정의 기기(핸드폰 등)에만 HTTPS 주소로 열어 줍니다
rem  · 같은 사내망의 다른 PC, 인터넷에서는 접속할 수 없습니다
rem  먼저: Tailscale 설치 · 로그인 (이 PC와 핸드폰 모두 같은 계정)
cd /d "%~dp0\..\.."

set TS=tailscale
where tailscale >nul 2>nul || set TS="%ProgramFiles%\Tailscale\tailscale.exe"
%TS% status >nul 2>nul
if errorlevel 1 (
  echo [오류] Tailscale이 설치되지 않았거나 로그인되지 않았습니다.
  echo        tailscale.com/download 에서 설치하고 로그인한 뒤 다시 실행하세요.
  pause & exit /b 1
)
if not exist .venv\Scripts\python.exe (echo [오류] 먼저 install.bat 으로 QIS를 설치하세요 & pause & exit /b 1)

for /f %%p in ('.venv\Scripts\python -c "from qis.config import load_config;print(load_config().port)"') do set PORT=%%p
if "%PORT%"=="" set PORT=8080

echo 1/3  QIS가 이 PC 안에서만 접속을 받도록 바꿉니다...
.venv\Scripts\python -m qis set host 127.0.0.1 || goto :fail

echo 2/3  Tailscale에 HTTPS 주소를 엽니다 (내 Tailscale 기기 전용)...
echo      처음이면 Tailscale 관리 페이지에서 HTTPS 인증서 사용을 허용하라는 안내가 나올 수 있습니다 - 허용하세요.
%TS% serve --bg %PORT% || goto :fail

echo 3/3  접속 주소:
%TS% serve status
echo.
echo 위에 나온 https://....ts.net 주소를 핸드폰(Tailscale 켠 상태) 브라우저로 여세요.
echo QIS 서버를 다시 시작해야 적용됩니다: run.bat 창을 닫았다가 다시 실행, 또는 PC 재시작.
echo.
echo 예전에 사내망 접속용으로 방화벽을 열었다면 닫아도 됩니다 (관리자 명령 창):
echo   netsh advfirewall firewall delete rule name="QIS"
echo.
echo 주의: "tailscale funnel" 은 인터넷 전체에 공개하는 기능입니다. 절대 쓰지 마세요.
pause
exit /b 0

:fail
echo [오류] 설정하지 못했습니다. 위 메시지를 확인하세요.
pause
exit /b 1
