#!/usr/bin/env python3
"""QIS 라이선스 발급 도구 (발급자 전용 — 고객에게 주지 않음).

  python scripts/license_tool.py keygen                       비밀키 파일 만들기 (한 번만). 공개키를 qis/license.py PUBLIC_KEY 에 넣는다
  python scripts/license_tool.py issue  --id L-2026-0001 --customer "한빛오토 품질팀" --seats 3 \
         --maintenance-until 2027-11-09 [--machine AAAA-BBBB-CCCC-DDDD ...] [--users 0] [--trial-until 2026-12-31] \
         [--note "..."] --out 한빛오토.lic
  python scripts/license_tool.py add-machine 한빛오토.lic AAAA-BBBB-CCCC-DDDD [--out 새파일.lic]   PC 추가 (대수 안에서)
  python scripts/license_tool.py renew 한빛오토.lic --maintenance-until 2028-11-09 [--out ...]     유지보수 연장
  python scripts/license_tool.py show  한빛오토.lic                                                 내용 · 서명 확인
  python scripts/license_tool.py machine                                                           이 PC 의 PC 코드

비밀키: 환경변수 QIS_LICENSE_KEY(파일 경로) 또는 ~/.qis/qis-license.key. 절대 저장소에 넣지 말 것.
발급 기록은 비밀키 옆 issued.jsonl 에 한 줄씩 남는다 (누구에게 · 언제 · 무엇을).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from qis import ed25519, license as L  # noqa: E402

KEY_PATH = Path(os.environ.get("QIS_LICENSE_KEY") or Path.home() / ".qis" / "qis-license.key")


def load_sk() -> bytes:
    if not KEY_PATH.is_file():
        raise SystemExit(f"비밀키가 없습니다: {KEY_PATH} — 먼저 keygen 을 실행하세요")
    sk = bytes.fromhex(KEY_PATH.read_text().strip())
    pk = ed25519.public_key(sk).hex()
    if L.PUBLIC_KEY != pk:
        print(f"주의: 프로그램의 PUBLIC_KEY 가 이 비밀키와 다릅니다.\n  프로그램: {L.PUBLIC_KEY}\n  비밀키의 공개키: {pk}\n"
              "  qis/license.py 의 PUBLIC_KEY 를 바꾸고 다시 빌드해야 이 서명을 받아들입니다.", file=sys.stderr)
    return sk


def log_issue(kind: str, payload: dict, out: Path) -> None:
    f = KEY_PATH.parent / "issued.jsonl"
    with f.open("a", encoding="utf-8") as fp:
        fp.write(json.dumps({"at": date.today().isoformat(), "kind": kind, "file": str(out), **{k: payload.get(k) for k in
                             ("id", "customer", "seats", "machines", "users", "maintenance_until", "trial_until")}}, ensure_ascii=False) + "\n")


def cmd_keygen(a):
    if KEY_PATH.exists() and not a.force:
        raise SystemExit(f"이미 있습니다: {KEY_PATH} (덮어쓰려면 --force — 그러면 이전에 발급한 라이선스는 모두 무효가 됩니다)")
    sk, pk = ed25519.generate_keypair()
    KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    KEY_PATH.write_text(sk.hex() + "\n", encoding="utf-8")
    try:
        os.chmod(KEY_PATH, 0o600)
    except OSError:
        pass
    print(f"비밀키 저장: {KEY_PATH}  ← 백업해 두고 절대 공유하지 마세요 (잃으면 재발급 불가)")
    print(f"공개키: {pk.hex()}")
    print(f"→ qis/license.py 의  PUBLIC_KEY = \"{pk.hex()}\"  로 바꾸고 커밋 · 빌드")


def cmd_issue(a):
    sk = load_sk()
    text = L.issue(sk, id=a.id, customer=a.customer, seats=a.seats, machines=a.machine or [], maintenance_until=a.maintenance_until,
                   users=a.users, trial_until=a.trial_until, note=a.note or "")
    out = Path(a.out or f"{a.id}.lic")
    out.write_text(text, encoding="utf-8")
    log_issue("issue", L.decode(text, ed25519.public_key(sk).hex()), out)
    print(f"발급: {out}")
    cmd_show(argparse.Namespace(file=str(out), _sk=sk))


def _reissue(a, change: dict, kind: str):
    sk = load_sk()
    pk = ed25519.public_key(sk).hex()
    p = L.decode(Path(a.file).read_text(encoding="utf-8"), pk)
    p.update(change)
    text = L.issue(sk, id=p["id"], customer=p["customer"], seats=p["seats"], machines=p["machines"], maintenance_until=p["maintenance_until"],
                   users=p.get("users", 0), trial_until=p.get("trial_until"), note=p.get("note", ""), issued=p.get("issued"))
    out = Path(a.out or a.file)
    out.write_text(text, encoding="utf-8")
    log_issue(kind, L.decode(text, pk), out)
    print(f"{kind}: {out}")
    cmd_show(argparse.Namespace(file=str(out), _sk=sk))


def cmd_add_machine(a):
    pk = ed25519.public_key(load_sk()).hex()
    p = L.decode(Path(a.file).read_text(encoding="utf-8"), pk)
    _reissue(a, {"machines": [*p.get("machines", []), *a.machine]}, "add-machine")


def cmd_renew(a):
    _reissue(a, {"maintenance_until": a.maintenance_until}, "renew")


def cmd_show(a):
    pk = ed25519.public_key(getattr(a, "_sk", None) or load_sk()).hex()
    try:
        p = L.decode(Path(a.file).read_text(encoding="utf-8"), pk)
    except L.LicenseError as e:
        raise SystemExit(f"검증 실패: {e}")
    print(json.dumps(p, ensure_ascii=False, indent=2))
    print(f"서명 OK · PC {len(p.get('machines') or [])}/{p.get('seats')} 등록 · 유지보수 {p.get('maintenance_until')}까지"
          + (f" · 기간제 {p['trial_until']}까지" if p.get("trial_until") else ""))


def cmd_machine(a):
    print(L.machine_code(Path(a.data_dir) if a.data_dir else Path.cwd()))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    k = sp.add_parser("keygen"); k.add_argument("--force", action="store_true"); k.set_defaults(f=cmd_keygen)
    i = sp.add_parser("issue")
    i.add_argument("--id", required=True); i.add_argument("--customer", required=True); i.add_argument("--seats", type=int, required=True)
    i.add_argument("--maintenance-until", required=True); i.add_argument("--machine", action="append"); i.add_argument("--users", type=int, default=0)
    i.add_argument("--trial-until"); i.add_argument("--note"); i.add_argument("--out"); i.set_defaults(f=cmd_issue)
    m = sp.add_parser("add-machine"); m.add_argument("file"); m.add_argument("machine", nargs="+"); m.add_argument("--out"); m.set_defaults(f=cmd_add_machine)
    r = sp.add_parser("renew"); r.add_argument("file"); r.add_argument("--maintenance-until", required=True); r.add_argument("--out"); r.set_defaults(f=cmd_renew)
    s = sp.add_parser("show"); s.add_argument("file"); s.set_defaults(f=cmd_show)
    c = sp.add_parser("machine"); c.add_argument("--data-dir"); c.set_defaults(f=cmd_machine)
    a = ap.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
