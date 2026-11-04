"""python -m qis.desktop — QIS 데스크톱 프로그램 실행 (pywebview 필요: pip install -r requirements-desktop.txt)."""
import sys

from .main import main

sys.exit(main())
