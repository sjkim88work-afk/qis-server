# -*- mode: python ; coding: utf-8 -*-
"""QIS 데스크톱 묶음 설정 — pyinstaller packaging/QIS.spec
  맥: dist/QIS.app  (arm64)      윈도우: dist/QIS/QIS.exe (폴더째 배포)
"""
import re
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

ROOT = Path(SPECPATH).parent
VERSION = re.search(r'__version__\s*=\s*"([^"]+)"', (ROOT / "qis" / "__init__.py").read_text(encoding="utf-8")).group(1)
MAC = sys.platform == "darwin"
ICON = str(ROOT / "qis" / "web" / "icons" / "icon-512.png")   # Pillow 가 .icns / .ico 로 바꿔 줌

hidden = collect_submodules("uvicorn") + collect_submodules("qis") + ["webview"]
# 화면 파일: qis/web 전체에서 src/ (합치기 전 소스)는 뺀다 — 프로그램은 합친 index.html 만 쓴다
WEB = ROOT / "qis" / "web"
datas = [(str(p), str(Path("qis/web") / p.relative_to(WEB).parent)) for p in WEB.rglob("*")
         if p.is_file() and "src" not in p.relative_to(WEB).parts]
datas += [(str(ROOT / "LICENSE"), "."), (str(ROOT / "NOTICE"), ".")] + collect_data_files("webview")

a = Analysis(
    [str(ROOT / "packaging" / "qis_desktop.py")],
    pathex=[str(ROOT)],
    datas=datas,
    hiddenimports=hidden,
    excludes=["tkinter", "pytest", "playwright", "IPython", "numpy"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="QIS",
    console=False,
    icon=ICON,
    target_arch="arm64" if MAC else None,
    codesign_identity=None,
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name="QIS", upx=False)
if MAC:
    app = BUNDLE(
        coll,
        name="QIS.app",
        icon=ICON,
        bundle_identifier="kr.sjkim.qis",
        version=VERSION,
        info_plist={
            "CFBundleDisplayName": "QIS",
            "CFBundleName": "QIS",
            "CFBundleShortVersionString": VERSION,
            "CFBundleVersion": VERSION,
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "11.0",
            "NSHumanReadableCopyright": "© 2026 김선중. All rights reserved.",
        },
    )
