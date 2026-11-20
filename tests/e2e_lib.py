"""화면 시험 공통 — 서버 띄우기 · 로그인 · 검사 기록 · 화면이 조용해질 때까지 기다리기"""
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8791
URL = f"http://127.0.0.1:{PORT}"
fails = []


def ok(c, m):
    print(("PASS " if c else "FAIL ") + m, flush=True)
    if not c:
        fails.append(m)


def run(*a, env=None):
    return subprocess.run([sys.executable, "-m", "qis", *a], cwd=ROOT, env=env, capture_output=True, text=True)


def start(env):
    p = subprocess.Popen([sys.executable, "-m", "qis", "serve"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL)
    for _ in range(80):
        try:
            urllib.request.urlopen(URL + "/healthz", timeout=0.5)
            return p
        except Exception:
            time.sleep(0.15)
    raise RuntimeError("server did not start")


# 화면이 하는 일(서버 요청 · 2초 이하 타이머)을 셈 — settle() 이 이 값이 0 이 될 때까지만 기다림
BUSY_JS = """(()=>{if(window.__busy)return;let f=0;const t=new Set(),of=window.fetch,st=window.setTimeout,ct=window.clearTimeout;
  if(of)window.fetch=function(){f++;let p;try{p=of.apply(this,arguments)}catch(e){f--;throw e}return p.finally(()=>{f--})};
  window.setTimeout=function(fn,ms,...a){ms=+ms||0;if(ms>2000||typeof fn!=='function')return st(fn,ms,...a);
    const id=st(function(){t.delete(id);return fn.apply(this,arguments)},ms,...a);t.add(id);return id};
  window.clearTimeout=function(id){t.delete(id);return ct(id)};
  window.__busy=()=>f+t.size;
  window.__settle=ms=>new Promise(res=>{const t0=Date.now();let q=0;(function tick(){if(f+t.size)q=0;else q++;if(q>=3||Date.now()-t0>=ms)return res();st(tick,20)})()})})()"""
QUIET_JS = "()=>{if(window.__busy()){window.__q=0;return false}window.__q=(window.__q||0)+1;return window.__q>=3}"


def settle(pg, ms):
    """화면이 조용해지면(요청 · 타이머 없음이 연속 3번) 바로 돌아옴. 길어도 ms 까지만 기다림 (예전의 고정 대기 시간)."""
    try:
        if not pg.evaluate("()=>{window.__q=0;return !!window.__busy}"):
            pg.wait_for_timeout(ms)
            return
        pg.wait_for_function(QUIET_JS, timeout=ms, polling=25)
    except Exception:
        pass


def login(b, user, pw):
    ctx = b.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True, bypass_csp=True)
    ctx.add_init_script(BUSY_JS)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL + "/")
    pg.fill("#u", user)
    pg.fill("#p", pw)
    pg.click("#b")
    pg.wait_for_url(URL + "/**")
    pg.wait_for_function("typeof dataReady!=='undefined'&&dataReady")
    settle(pg, 1200)
    pg._errs = errs
    return pg


class Ctx:
    """시험 한 번의 공통 상태 — 서버 · 브라우저 · 사용자 화면 3개 (A 작성 · B 관리자 · C 조회)"""
    A = B = C = b = srv = tmp = env = None


def setup_server(seed_path):
    c = Ctx()
    c.tmp = tmp = tempfile.mkdtemp(prefix="qis_e2e_")
    c.env = env = {**os.environ, "QIS_DATA_DIR": os.path.join(tmp, "data"), "QIS_PORT": str(PORT), "QIS_HOST": "127.0.0.1"}
    r = run("init", "--admin", "admin", "--name", "관리자", "--password", "Qadm2026x", "--company", "한빛오토", env=env)
    ok(r.returncode == 0, "init: " + r.stdout.strip().splitlines()[-1])
    run("adduser", "kim", "--name", "김작성", "--role", "editor", "--password", "Qk1m2026a", env=env)
    run("adduser", "lee", "--name", "이조회", "--role", "viewer", "--password", "Ql3e2026a", env=env)
    seed = json.load(open(seed_path, encoding="utf-8"))
    px = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    seed["photos"] = [{"id": "ph1", "name": "a.png", "data": px, "thumb": px, "createdAt": "2026-10-20"}]
    seed["defects"][0]["photos"] = ["ph1"]
    sp = os.path.join(tmp, "seed.json")
    json.dump(seed, open(sp, "w", encoding="utf-8"), ensure_ascii=False)
    r = run("import", sp, env=env)
    ok(r.returncode == 0 and "photos 1" in r.stdout, "기존 QIS 백업 가져오기: " + r.stdout.strip())
    c.srv = start(env)
    return c


def setup_users(c, b):
    """처음 로그인(비밀번호 변경 강제)을 거친 뒤 사용자 화면 3개를 엶"""
    c.b = b
    # --- 처음 로그인: 비밀번호 변경 강제 ---
    ctx = b.new_context()
    pg = ctx.new_page()
    pg.goto(URL + "/")
    ok(pg.url.endswith("/login"), "로그인 안 하면 로그인 화면")
    pg.fill("#u", "kim"); pg.fill("#p", "틀림123a"); pg.click("#b")
    try:
        pg.wait_for_function("()=>document.querySelector('#e').innerText.includes('맞지 않습니다')", timeout=8000)      # 비밀번호 확인이 느린 실행기에서도 기다림
    except Exception:
        pass
    ok("맞지 않습니다" in pg.inner_text("#e"), "틀린 비밀번호 안내")
    pg.fill("#p", "Qk1m2026a"); pg.click("#b"); pg.wait_for_url("**/account?first=1")
    ok(pg.is_visible("#first"), "처음 로그인 → 비밀번호 변경 화면")
    pg.fill("#o", "Qk1m2026a"); pg.fill("#n", "Qk1m2026b"); pg.fill("#n2", "Qk1m2026b"); pg.click("#b")
    pg.wait_for_url(URL + "/", timeout=5000)
    ok(True, "비밀번호 바꾸면 QIS로")
    ctx.close()
    # lee 도 비밀번호 변경
    ctx = b.new_context(); pg = ctx.new_page(); pg.goto(URL + "/login")
    pg.fill("#u", "lee"); pg.fill("#p", "Ql3e2026a"); pg.click("#b"); pg.wait_for_url("**/account?first=1")
    pg.fill("#o", "Ql3e2026a"); pg.fill("#n", "Ql3e2026b"); pg.fill("#n2", "Ql3e2026b"); pg.click("#b"); pg.wait_for_url(URL + "/")
    ctx.close()

    c.A = login(b, "kim", "Qk1m2026b")      # 작성
    c.B = login(b, "admin", "Qadm2026x")    # 관리자
    c.C = login(b, "lee", "Ql3e2026b")      # 조회
    c.A.evaluate("()=>{window.askConfirm=async()=>true}")      # A 화면은 확인 창을 자동 승인 (확인 창 자체를 보는 시험은 그 안에서 바꿨다가 되돌림)


def teardown(c):
    try:
        c.srv.send_signal(signal.SIGTERM)
        c.srv.wait(5)
    except Exception:
        try:
            c.srv.kill()
        except Exception:
            pass
    shutil.rmtree(c.tmp, ignore_errors=True)
