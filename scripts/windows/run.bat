@echo off
chcp 65001 >nul
rem ===== QIS 서버 실행 =====
rem 창을 닫으면 서버가 멈춥니다. PC를 켤 때 자동으로 실행하려면 register_startup.bat 을 관리자 권한으로 실행하세요.
cd /d "%~dp0\..\.."
.venv\Scripts\python -m qis serve
