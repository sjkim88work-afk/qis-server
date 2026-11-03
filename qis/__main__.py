"""QIS 서버 명령.

  python -m qis init      처음 설치: 데이터 폴더 · 설정 파일 · 첫 관리자 계정 만들기
  python -m qis serve     서버 실행
  python -m qis import 백업.json   기존 QIS 백업(사진 포함 가능)을 빈 서버로 가져오기
  python -m qis backup    지금 백업
  python -m qis adduser   사용자 추가
  python -m qis resetpw   비밀번호 초기화 (관리자 비밀번호를 잊었을 때)
  python -m qis set 항목 값   설정 바꾸기 (예: set host 127.0.0.1 — 이 PC 안에서만 받기, Tailscale 개인 사용)

데이터 폴더는 --data 또는 환경변수 QIS_DATA_DIR (기본: 실행 위치의 data)
"""
from __future__ import annotations

import argparse
import getpass
import json
import sys

from . import __version__
from .auth import ROLES, Auth, AuthError
from .backup import Backup
from .config import load_config
from .db import DBConfigError, db_ready, open_db
from .files import Files
from .store import Store


def _ask(prompt, default=""):
    v = input(f"{prompt}{f' [{default}]' if default else ''}: ").strip()
    return v or default


def _pw(prompt="비밀번호"):
    while True:
        a = getpass.getpass(f"{prompt} (8자 이상, 영문+숫자): ")
        b = getpass.getpass("한 번 더: ")
        if a != b:
            print("  두 번 입력한 비밀번호가 다릅니다")
            continue
        return a


def _safe_console():
    """출력할 수 없는 문자는 ?로 바꿔 씀 — 로그 파일로 보낼 때 인코딩 오류로 서버가 멈추지 않게."""
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(errors="replace")
        except Exception:
            pass


def main(argv=None):
    _safe_console()
    try:
        return _main(argv)
    except DBConfigError as e:
        print("DB 설정 오류:", e)
        return 1


def _main(argv=None):
    ap = argparse.ArgumentParser(prog="qis", description="QIS 품질정보시스템 서버 " + __version__)
    ap.add_argument("--data", help="데이터 폴더 (기본: ./data)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("init", help="처음 설치")
    p.add_argument("--admin", help="관리자 아이디")
    p.add_argument("--name", help="관리자 이름")
    p.add_argument("--password", help="관리자 비밀번호 (생략하면 입력 받음)")
    p.add_argument("--port", type=int)
    p.add_argument("--company")
    sub.add_parser("serve", help="서버 실행")
    p = sub.add_parser("import", help="기존 QIS 백업 가져오기")
    p.add_argument("file")
    p.add_argument("--by", help="가져오기 실행자 아이디 (기본: 첫 관리자)")
    sub.add_parser("backup", help="지금 백업")
    p = sub.add_parser("restore", help="백업 DB 파일로 복원 (서버를 멈춘 뒤)")
    p.add_argument("file", help="backup/db/qis_YYYYMMDD_HHMM.sqlite")
    p.add_argument("--yes", action="store_true", help="확인 질문 없이 진행")
    p = sub.add_parser("adduser", help="사용자 추가")
    p.add_argument("username")
    p.add_argument("--name", required=True)
    p.add_argument("--role", choices=list(ROLES), default="editor")
    p.add_argument("--password")
    p = sub.add_parser("set", help="설정 바꾸기 (data/qis.json)")
    p.add_argument("key")
    p.add_argument("value")
    p = sub.add_parser("resetpw", help="비밀번호 초기화")
    p.add_argument("username")
    p.add_argument("--password")
    a = ap.parse_args(argv)

    cfg = load_config(a.data)

    if a.cmd == "init":
        first = not (cfg.data_dir / "qis.json").exists()
        if a.port:
            cfg.port = a.port
        if a.company:
            cfg.company = a.company
        cfg.save()
        db = open_db(cfg)
        auth = Auth(db, cfg)
        print(f"데이터 폴더: {cfg.data_dir} · DB: {db.describe()}")
        if auth.user_count():
            print("이미 사용자가 있습니다 — 설정 파일만 확인했습니다.")
            return 0
        username = a.admin or _ask("관리자 아이디", "admin")
        name = a.name or _ask("관리자 이름", "관리자")
        pw = a.password or _pw()
        try:
            auth.create_user(username, name, "admin", pw, must_change=False)
        except AuthError as e:
            print("오류:", e)
            return 1
        print(f"관리자 '{username}' 를 만들었습니다. {'설정 파일: ' + str(cfg.data_dir / 'qis.json') if first else ''}")
        print("다음: python -m qis serve")
        return 0

    if a.cmd == "restore":
        from .restore import RestoreError, check, restore
        try:
            info = check(cfg, a.file)
        except RestoreError as e:
            print("복원할 수 없습니다:", e)
            return 1
        print(f"백업 파일: {a.file}")
        print("  기록:", ", ".join(f"{k} {v}" for k, v in info["records"].items()) or "없음", f"· 사용자 {info['users']}명 · 변경 순번 {info['seq']}")
        if not a.yes and input("지금 데이터를 이 백업으로 바꿉니다 (지금 DB는 따로 보관). 계속할까요? [y/N] ").strip().lower() not in ("y", "yes", "예"):
            print("취소했습니다")
            return 1
        try:
            r = restore(cfg, a.file)
        except RestoreError as e:
            print("복원 실패:", e)
            return 1
        print("복원했습니다.")
        if r["kept"]:
            print(f"  복원 전 DB 보관: {r['kept']}  ({', '.join(r['moved'])})")
        if r["files_filled"]:
            print(f"  백업 폴더에서 빠진 첨부 {r['files_filled']}개를 채웠습니다")
        print("  서버를 다시 시작하고, 열려 있던 모든 사용자 화면은 새로고침(F5)하세요.")
        return 0

    if a.cmd == "set":
        if a.key == "data_dir" or a.key not in cfg.__dataclass_fields__:
            print("바꿀 수 있는 항목:", ", ".join(k for k in cfg.__dataclass_fields__ if k != "data_dir"))
            return 1
        cur = getattr(cfg, a.key)
        try:
            val = type(cur)(a.value) if not isinstance(cur, bool) else a.value.lower() in ("1", "true", "yes")
        except ValueError:
            print(f"{a.key} 는 {type(cur).__name__} 값이어야 합니다")
            return 1
        setattr(cfg, a.key, val)
        cfg.save()
        print(f"{a.key}: {cur!r} → {val!r}  (서버를 다시 시작하면 적용)")
        return 0

    if a.cmd == "serve":
        import uvicorn
        from .app import create_app
        if not db_ready(cfg):
            print("먼저 python -m qis init 으로 설치하세요")
            return 1
        kw = {}
        if cfg.https:
            kw.update(ssl_certfile=cfg.ssl_certfile, ssl_keyfile=cfg.ssl_keyfile)
        print(f"QIS 서버 {__version__} — {'https' if cfg.https else 'http'}://{cfg.host}:{cfg.port}  (데이터: {cfg.data_dir})")
        if cfg.host in ("127.0.0.1", "localhost"):
            print("  이 PC 안에서만 접속을 받습니다 (다른 PC · 사내망 접속 차단). 핸드폰은 Tailscale 주소로 접속하세요.")
        uvicorn.run(create_app(cfg), host=cfg.host, port=cfg.port, log_level="info", proxy_headers=False, **kw)
        return 0

    db = open_db(cfg)
    auth = Auth(db, cfg)
    store = Store(db, cfg)

    if a.cmd == "import":
        by = db.q1("SELECT * FROM users WHERE lower(username)=lower(?)", (a.by,)) if a.by else \
            db.q1("SELECT * FROM users WHERE role='admin' AND active=1 ORDER BY id LIMIT 1")
        if not by:
            print("가져오기를 실행할 관리자 계정이 없습니다 — 먼저 init")
            return 1
        with open(a.file, encoding="utf-8") as f:
            data = json.load(f)
        photos = data.pop("photos", None)
        try:
            cnt = store.import_backup(by, data)
        except ValueError as e:
            print("오류:", e)
            return 1
        if isinstance(photos, list):
            fs = Files(db, cfg)
            ok = [p for p in photos if isinstance(p, dict) and p.get("id") and p.get("data")]
            for i in range(0, len(ok), 50):
                fs.put_many(by, ok[i:i + 50])
            cnt["photos"] = len(ok)
            skipped = len(photos) - len(ok)
            if skipped:
                print(f"  사진 정보만 있고 내용이 없는 {skipped}건은 건너뜀 (사진 포함 백업으로 다시 가져오세요)")
        print("가져왔습니다:", ", ".join(f"{k} {v}" for k, v in cnt.items()))
        return 0

    if a.cmd == "backup":
        info = Backup(db, store, cfg).run("manual")
        print("백업 완료:", info["dir"], info["db"], f"첨부 {info['files_copied']}개 복사")
        return 0

    if a.cmd == "adduser":
        try:
            u = auth.create_user(a.username, a.name, a.role, a.password or _pw())
        except AuthError as e:
            print("오류:", e)
            return 1
        print(f"추가: {u['name']} ({u['username']}) · {u['roleName']} — 첫 로그인 때 비밀번호를 바꾸게 됩니다")
        return 0

    if a.cmd == "resetpw":
        u = db.q1("SELECT * FROM users WHERE lower(username)=lower(?)", (a.username,))
        if not u:
            print("없는 아이디입니다")
            return 1
        try:
            auth.reset_password(u["id"], a.password or _pw("새 비밀번호"), by=None)
        except AuthError as e:
            print("오류:", e)
            return 1
        print("초기화했습니다 — 다음 로그인 때 비밀번호를 바꾸게 됩니다")
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
