"""qis/web/icons/icon-512.png → build/QIS.icns (맥) · build/QIS.ico (윈도우)  (빌드 때 CI가 실행)"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
src = ROOT / "qis" / "web" / "icons" / "icon-512.png"
out = ROOT / "build"
out.mkdir(exist_ok=True)
im = Image.open(src).convert("RGBA")
im.save(out / "QIS.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
im.save(out / "QIS.icns")
print("icons:", out / "QIS.ico", out / "QIS.icns", file=sys.stderr)
