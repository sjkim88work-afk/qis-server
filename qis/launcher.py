"""한 번에 시작: python -m qis.launcher  (start-mac.command · start-windows.bat 이 부름)

  1. 처음이면 설치(init) — 관리자 아이디 · 이름 · 비밀번호를 물어봄
  2. 이미 켜져 있으면 브라우저만 열고 끝냄
  3. 서버를 켜고, 준비되면 브라우저를 엶. 핸드폰 · 다른 PC 접속 주소도 보여 줌
창을 닫거나 Ctrl+C 를 누르면 서버가 멈춘다.
"""
from __future__ import annotations

import sys

if sys.version_info < (3, 11):
    print(f"Python 3.11 이상이 필요합니다 (지금 {sys.version.split()[0]}). python.org 에서 설치한 뒤 다시 실행하세요.")
    sys.exit(1)

import socket
import ssl
import threading
import time
import urllib.request
import webbrowser


def _url(cfg, host="localhost") -> str:
    return f"{'https' if cfg.https else 'http'}://{host}:{cfg.port}"


def _is_qis(cfg) -> bool | None:
    """포트에 QIS가 떠 있으면 True, 다른 프로그램이면 False, 비어 있으면 None."""
    with socket.socket() as s:
        s.settimeout(0.5)
        if s.connect_ex(("127.0.0.1", int(cfg.port))) != 0:
            return None
    try:
        ctx = ssl._create_unverified_context() if cfg.https else None   # 사내 인증서라도 자기 PC 확인만 하므로
        with urllib.request.urlopen(_url(cfg, "127.0.0.1") + "/healthz", timeout=2, context=ctx) as r:
            return r.status == 200
    except Exception:
        return False


def _lan_addresses(cfg) -> list[str]:
    out = []
    host = socket.gethostname()
    if host:
        if sys.platform == "darwin" and not host.endswith(".local"):
            host += ".local"   # Mac은 '이름.local' 로 같은 Wi-Fi에서 찾을 수 있음
        out.append(_url(cfg, host))
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))   # 실제로 보내지 않음 — 이 PC의 사내망 주소 확인용
            ip = s.getsockname()[0]
        if ip and not ip.startswith("127."):
            out.append(_url(cfg, ip))
    except OSError:
        pass
    return list(dict.fromkeys(out))


def _open_when_ready(cfg):
    for _ in range(120):
        if _is_qis(cfg):
            webbrowser.open(_url(cfg))
            return
        time.sleep(0.5)


def _needs_init(cfg) -> bool:
    if not (cfg.data_dir / "qis.json").exists():
        return True
    from .auth import Auth
    from .db import open_db
    db = open_db(cfg)
    try:
        return Auth(db, cfg).user_count() == 0
    finally:
        db.close()


def main() -> int:
    from . import __version__
    from .__main__ import main as cli
    from .config import load_config

    cfg = load_config()
    print(f"QIS 서버 {__version__} — 데이터 폴더: {cfg.data_dir}")

    if _needs_init(cfg):
        print("\n처음 실행입니다. 관리자 계정을 만듭니다 (이 계정으로 로그인해 사용자를 추가합니다).")
        rc = cli(["init"])
        if rc:
            return rc
        cfg = load_config()

    state = _is_qis(cfg)
    if state:
        print(f"\n이미 실행 중입니다 — 브라우저를 엽니다: {_url(cfg)}")
        webbrowser.open(_url(cfg))
        return 0
    if state is False:
        print(f"\n[오류] {cfg.port}번 포트를 다른 프로그램이 쓰고 있습니다.")
        print(f"  {cfg.data_dir / 'qis.json'} 의 \"port\" 값을 8090 같은 다른 번호로 바꾼 뒤 다시 실행하세요.")
        return 1

    print("\n접속 주소")
    print(f"  이 PC        {_url(cfg)}")
    for u in _lan_addresses(cfg):
        print(f"  다른 PC·핸드폰 {u}   (같은 사내망 · Wi-Fi)")
    if sys.platform.startswith("win"):
        print("  다른 PC에서 안 열리면 방화벽을 엽니다 (관리자 권한 명령 창):")
        print(f'    netsh advfirewall firewall add rule name="QIS" dir=in action=allow protocol=TCP localport={cfg.port}')
    print("\n이 창을 닫거나 Ctrl+C 를 누르면 서버가 멈춥니다.\n")

    threading.Thread(target=_open_when_ready, args=(cfg,), daemon=True).start()
    try:
        return cli(["serve"])
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
