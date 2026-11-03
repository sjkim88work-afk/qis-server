#!/bin/bash
# ===== QIS 서버 시작 (Mac) — 더블클릭 =====
# 처음: 필요한 프로그램 설치 → 관리자 계정 만들기 → 서버 시작
# 다음부터: 바로 서버 시작 + 브라우저 열기. 창을 닫으면 서버가 멈춥니다.
cd "$(dirname "$0")" || exit 1

pause_exit() { echo; read -r -p "Enter 를 누르면 창이 닫힙니다 " _; exit "${1:-1}"; }

PY=""
for c in python3.14 python3.13 python3.12 python3.11 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
    PY="$c"; break
  fi
done
if [ -z "$PY" ]; then
  echo "[오류] Python 3.11 이상이 필요합니다."
  echo "  https://www.python.org/downloads/ 에서 설치한 뒤 이 파일을 다시 실행하세요."
  pause_exit 1
fi

if [ ! -x .venv/bin/python ]; then
  echo "처음 실행 — 프로그램을 준비합니다 (1~2분)..."
  "$PY" -m venv .venv || { echo "[오류] 가상환경을 만들지 못했습니다"; pause_exit 1; }
fi
if ! cmp -s requirements.txt .venv/requirements.installed; then
  if [ -d wheels ]; then
    .venv/bin/python -m pip install -q --no-index --find-links wheels -r requirements.txt
  else
    .venv/bin/python -m pip install -q -r requirements.txt
  fi || { echo "[오류] 프로그램 설치에 실패했습니다. 인터넷 연결을 확인하세요."; pause_exit 1; }
  cp requirements.txt .venv/requirements.installed
fi

.venv/bin/python -m qis.launcher
rc=$?
[ "$rc" -ne 0 ] && pause_exit "$rc"
exit 0
