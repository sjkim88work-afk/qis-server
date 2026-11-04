"""PyInstaller 시작 파일 — QIS.app · QIS.exe 를 열면 여기서 시작 (python -m qis.desktop 과 같음)."""
import sys

from qis.desktop.__main__ import main

if __name__ == "__main__":
    sys.exit(main())
