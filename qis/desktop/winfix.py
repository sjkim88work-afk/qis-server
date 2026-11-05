"""윈도우 전용 시작 보정.

인터넷에서 받은 zip 을 풀면 안의 파일마다 '인터넷에서 받은 파일' 표시(Zone.Identifier 대체 데이터 스트림,
Mark-of-the-Web)가 붙는다. .NET Framework 는 이 표시가 붙은 DLL(Python.Runtime.dll 등)을 불러오지 않아서
pywebview(winforms)가 시작하지 못한다:
    Failed to resolve Python.Runtime.Loader.Initialize from ...\\_internal\\pythonnet\\runtime\\Python.Runtime.dll
그래서 창 라이브러리를 불러오기 전에 이 프로그램 폴더 안 파일들의 표시를 지운다
(파일 탐색기의 속성 › '차단 해제'와 같은 일 — 사용자 권한으로 자기 파일에만).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

STREAM = ":Zone.Identifier"
EXTS = {".dll", ".exe", ".pyd", ".config", ".json"}   # .NET 이 확인하는 것은 어셈블리 · 설정 파일


def bundle_dir() -> Path | None:
    """묶음 프로그램(PyInstaller)으로 실행 중이면 그 폴더 (QIS.exe 가 있는 곳)."""
    if not getattr(sys, "frozen", False):
        return None
    return Path(sys.executable).resolve().parent


def unblock(root: Path | None = None) -> int:
    """root 아래 파일들의 '인터넷에서 받은 파일' 표시를 지움. 지운 개수. 윈도우가 아니면 0."""
    if not sys.platform.startswith("win") or os.environ.get("QIS_NO_UNBLOCK") == "1":
        return 0
    root = root or bundle_dir()
    if not root:
        return 0
    n = 0
    for dirpath, _dirs, files in os.walk(root):
        for f in files:
            if os.path.splitext(f)[1].lower() not in EXTS:
                continue
            try:
                os.remove(os.path.join(dirpath, f) + STREAM)
                n += 1
            except OSError:      # 표시 없음(대부분) · 지울 권한 없음 → 그냥 넘어감
                pass
    return n


def startup_error_text(err: BaseException) -> str:
    s = f"{type(err).__name__}: {err}"
    if any(k in s for k in ("Python.Runtime", "clr", "pythonnet", "ClrLoader", ".NET")):
        return ("QIS 창을 띄우는 구성요소(.NET)를 불러오지 못했습니다.\n\n"
                "1) 받은 QIS-windows.zip 을 우클릭 › 속성 › '차단 해제' 체크 후 다시 압축을 풀어 실행해 보세요.\n"
                "2) 그래도 같으면 회사 보안 프로그램이 QIS 폴더의 DLL 을 막고 있을 수 있습니다. "
                "IT 담당자에게 QIS 폴더 예외 등록을 요청하세요.\n"
                "3) .NET Framework 4.8 이 설치되어 있는지 확인하세요.\n\n"
                f"자세한 내용: {s[:300]}")
    if "WebView2" in s or "EdgeChromium" in s:
        return ("Microsoft Edge WebView2 런타임이 필요합니다. Microsoft 사이트에서 'WebView2 런타임'을 설치한 뒤 "
                f"다시 실행하세요.\n\n자세한 내용: {s[:300]}")
    return f"QIS 를 시작하지 못했습니다.\n\n{s[:500]}"


def message_box(title: str, text: str):
    if not sys.platform.startswith("win"):
        return
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, text, title, 0x10)   # MB_ICONERROR
    except Exception:
        pass
