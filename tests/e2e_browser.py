"""브라우저 시험 (실제 서버 + 화면)
  전체:      python tests/e2e_browser.py tests/sample_backup.json
  일부만:    python tests/e2e_browser.py tests/sample_backup.json --only issue,ncr
  목록:      python tests/e2e_browser.py --list
시험 내용은 tests/e2e_parts/ 에 기능별로 있음. 각 파일은 혼자서도 돌아감 (다른 파일의 결과에 기대지 않음).
"""
import importlib.util
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e_lib as lib      # noqa: E402
from playwright.sync_api import sync_playwright      # noqa: E402

PARTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "e2e_parts")


def parts():
    out = []
    for f in sorted(os.listdir(PARTS_DIR)):
        if f.startswith("p") and f.endswith(".py"):
            out.append((f[4:-3], os.path.join(PARTS_DIR, f)))
    return out


def load(name, path):
    spec = importlib.util.spec_from_file_location("e2e_part_" + name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main(argv):
    if "--list" in argv:
        for n, p in parts():
            print(f"{n:10s} {load(n, p).__doc__.splitlines()[0]}")
        return 0
    only = None
    if "--only" in argv:
        only = [x for x in argv[argv.index("--only") + 1].split(",") if x]
        unknown = [x for x in only if x not in [n for n, _ in parts()]]
        if unknown:
            print("모르는 이름:", ", ".join(unknown), "— --list 로 확인")
            return 2
    c = lib.setup_server(argv[0])
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path=os.environ.get("QIS_CHROME") or None)
            lib.setup_users(c, b)
            for n, path in parts():
                if only and n not in only:
                    continue
                t = time.time()
                print(f"--- {n} ---", flush=True)
                load(n, path).run(c)
                for who, pg in (("A", c.A), ("B", c.B), ("C", c.C)):
                    lib.ok(not pg._errs, f"[{n}] {who} 화면 오류 없음 {pg._errs[:2]}")
                print(f"--- {n}: {time.time() - t:.1f}초 ---", flush=True)
            c.A.click("button:has-text('로그아웃')"); c.A.wait_for_url("**/login")
            lib.ok(True, "로그아웃")
            b.close()
    finally:
        lib.teardown(c)
    print("FAILS:", len(lib.fails))
    return 1 if lib.fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
