"""PyInstaller 시작점 — QIS.app · QIS.exe 가 실행하는 파일."""
import multiprocessing
import sys

multiprocessing.freeze_support()

from qis.desktop.main import main  # noqa: E402

sys.exit(main())
