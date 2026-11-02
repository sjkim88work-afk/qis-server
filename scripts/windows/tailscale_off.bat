@echo off
chcp 65001 >nul
rem ===== Tailscale 개인 사용 해제 → 사내망 접속으로 되돌리기 (팀 사용 전환 때) =====
cd /d "%~dp0\..\.."
set TS=tailscale
where tailscale >nul 2>nul || set TS="%ProgramFiles%\Tailscale\tailscale.exe"
%TS% serve reset
.venv\Scripts\python -m qis set host 0.0.0.0
echo.
echo Tailscale 주소를 닫고, QIS가 사내망 접속을 받도록 되돌렸습니다. QIS 서버를 다시 시작하세요.
echo 다른 PC에서 접속하려면 방화벽을 엽니다 (관리자 명령 창):
echo   netsh advfirewall firewall add rule name="QIS" dir=in action=allow protocol=TCP localport=8080
pause
