@echo off
chcp 65001 >nul
rem ===== PC를 켤 때 QIS 서버 자동 실행 (작업 스케줄러) =====
rem 관리자 권한으로 실행하세요 (마우스 오른쪽 → 관리자 권한으로 실행).
rem 로그인하지 않아도 PC가 켜지면 실행됩니다. 지우려면: schtasks /delete /tn "QIS Server" /f
cd /d "%~dp0\..\.."
set ROOT=%cd%
schtasks /create /tn "QIS Server" /sc onstart /ru SYSTEM /rl HIGHEST /f ^
  /tr "cmd /c cd /d \"%ROOT%\" && \"%ROOT%\.venv\Scripts\python.exe\" -m qis serve >> \"%ROOT%\data\server.log\" 2>&1"
if errorlevel 1 (echo [오류] 등록하지 못했습니다 - 관리자 권한으로 실행했는지 확인하세요 & pause & exit /b 1)
echo 등록했습니다. 지금 시작하려면: schtasks /run /tn "QIS Server"
pause
