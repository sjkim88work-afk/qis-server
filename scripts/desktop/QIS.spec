# -*- mode: python ; coding: utf-8 -*-
# PyInstaller 설정: pyinstaller scripts/desktop/QIS.spec  (저장소 맨 위에서 실행)
#   맥     → dist/QIS.app
#   윈도우 → dist/QIS/QIS.exe (폴더째 압축해 배포)
import sys
from pathlib import Path

ROOT = Path(SPECPATH).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from qis import __version__  # noqa: E402

is_mac = sys.platform == "darwin"
icon = str(ROOT / "build" / ("QIS.icns" if is_mac else "QIS.ico"))
if not Path(icon).exists():
    icon = None

a = Analysis(
    [str(ROOT / "scripts" / "desktop" / "qis_desktop.py")],
    pathex=[str(ROOT)],
    datas=[(str(ROOT / "qis" / "web"), "qis/web")],
    hiddenimports=[
        "uvicorn.logging", "uvicorn.loops", "uvicorn.loops.auto", "uvicorn.loops.asyncio",
        "uvicorn.protocols", "uvicorn.protocols.http", "uvicorn.protocols.http.auto", "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets", "uvicorn.protocols.websockets.auto", "uvicorn.lifespan", "uvicorn.lifespan.on",
        "qis.desktop.routes", "qis.desktop.importer",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "pytest", "playwright", "httpx", "numpy", "scipy", "pandas", "matplotlib", "PIL"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="QIS",
    debug=False,
    strip=False,
    upx=False,
    console=False,          # 창 프로그램 (명령 창 없음)
    icon=icon,
    target_arch="arm64" if is_mac else None,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="QIS")
if is_mac:
    app = BUNDLE(
        coll,
        name="QIS.app",
        icon=icon,
        bundle_identifier="kr.qis.desktop",
        version=__version__,
        info_plist={
            "CFBundleDisplayName": "QIS",
            "CFBundleShortVersionString": __version__,
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "12.0",
            "NSAppTransportSecurity": {"NSAllowsLocalNetworking": True},
        },
    )
