"""윈도우 시작 보정 (qis/desktop/winfix.py): python -m pytest -q tests/test_winfix.py
실제 차단 표시 제거는 윈도우 CI(desktop.yml '인터넷에서 받은 zip 처럼 시험')에서 확인."""
import sys

from qis.desktop import winfix


def test_unblock_noop_outside_windows_or_unfrozen(tmp_path):
    if not sys.platform.startswith("win"):
        assert winfix.unblock(tmp_path) == 0
    assert winfix.bundle_dir() is None            # 시험은 묶음 프로그램이 아님


def test_startup_error_text():
    e = RuntimeError(r"Failed to resolve Python.Runtime.Loader.Initialize from C:\QIS\_internal\pythonnet\runtime\Python.Runtime.dll")
    t = winfix.startup_error_text(e)
    assert "차단 해제" in t and "보안 프로그램" in t and "Python.Runtime" in t
    assert "WebView2" in winfix.startup_error_text(Exception("WebView2 runtime not found"))
    assert winfix.startup_error_text(ValueError("x")).startswith("QIS 를 시작하지 못했습니다")
