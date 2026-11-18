"""브라우저 시험 (실제 서버 + 화면): python tests/e2e_browser.py seed.json
  두 사람 동시 작업 · 조회 권한 · 관리자 전용 · 첨부 · 서버 끊김 · 로그인 만료 · 관리 화면 · 백업
"""
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8791
URL = f"http://127.0.0.1:{PORT}"
fails = []


def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
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


def login(b, user, pw):
    ctx = b.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True, bypass_csp=True)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL + "/")
    pg.fill("#u", user)
    pg.fill("#p", pw)
    pg.click("#b")
    pg.wait_for_url(URL + "/**")
    pg.wait_for_function("typeof dataReady!=='undefined'&&dataReady")
    pg.wait_for_timeout(1200)
    pg._errs = errs
    return pg


def main(seed_path):
    tmp = tempfile.mkdtemp(prefix="qis_e2e_")
    env = {**os.environ, "QIS_DATA_DIR": os.path.join(tmp, "data"), "QIS_PORT": str(PORT), "QIS_HOST": "127.0.0.1"}
    r = run("init", "--admin", "admin", "--name", "관리자", "--password", "Qadm2026x", "--company", "한빛오토", env=env)
    ok(r.returncode == 0, "init: " + r.stdout.strip().splitlines()[-1])
    run("adduser", "kim", "--name", "김작성", "--role", "editor", "--password", "Qk1m2026a", env=env)
    run("adduser", "lee", "--name", "이조회", "--role", "viewer", "--password", "Ql3e2026a", env=env)
    seed = json.load(open(seed_path, encoding="utf-8"))
    seed["photos"] = [{"id": "ph1", "name": "a.png", "data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
                       "thumb": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "createdAt": "2026-10-20"}]
    seed["defects"][0]["photos"] = ["ph1"]
    sp = os.path.join(tmp, "seed.json")
    json.dump(seed, open(sp, "w", encoding="utf-8"), ensure_ascii=False)
    r = run("import", sp, env=env)
    ok(r.returncode == 0 and "photos 1" in r.stdout, "기존 QIS 백업 가져오기: " + r.stdout.strip())
    srv = start(env)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path=os.environ.get("QIS_CHROME") or None)
            # --- 처음 로그인: 비밀번호 변경 강제 ---
            ctx = b.new_context()
            pg = ctx.new_page()
            pg.goto(URL + "/")
            ok(pg.url.endswith("/login"), "로그인 안 하면 로그인 화면")
            pg.fill("#u", "kim"); pg.fill("#p", "틀림123a"); pg.click("#b"); pg.wait_for_timeout(500)
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

            A = login(b, "kim", "Qk1m2026b")      # 작성
            B = login(b, "admin", "Qadm2026x")    # 관리자
            C = login(b, "lee", "Ql3e2026b")      # 조회
            ok(A.evaluate("db.defects.length") == 5 and A.evaluate("db.ncrs.length") == 2, "서버 데이터 불러옴 (불량 5 · NCR 2)")
            ok("김작성" in A.inner_text("#srvUser") and "작성" in A.inner_text("#srvUser"), "상단에 사용자 · 권한")
            ok("서버 저장" in A.inner_text("#saveInfo") or A.inner_text("#saveInfo") == "", "저장 표시: " + A.inner_text("#saveInfo"))
            ok(A.locator("#nav button:has-text('설정')").count() == 0 and B.locator("#nav button:has-text('설정')").count() == 1,
               "설정 탭은 관리자만")
            B.evaluate("setS('company','한빛오토 품질','str')"); B.wait_for_timeout(1000)
            A.evaluate("srvSync()"); A.wait_for_timeout(700)
            ok(A.evaluate("db.settings.company") == "한빛오토 품질", "관리자가 바꾼 설정 → 작성자 화면 반영")
            ok("관리자만" not in A.inner_text("#toast"), "작성자 화면에 설정 거부 안내 없음")

            # --- 1. 작성자 A 가 불량 수정 → B 에 반영 ---
            A.evaluate("()=>{const d=db.defects.find(x=>x.id==='d1');d.qty=12;touch(d);save()}")
            A.wait_for_timeout(1200)
            B.evaluate("srvSync()"); B.wait_for_timeout(800)
            ok(B.evaluate("db.defects.find(x=>x.id==='d1').qty") == 12, "A 수정 → B 화면에 반영")
            ok("김작성" in B.inner_text("#toast"), "받아온 변경 안내: " + B.inner_text("#toast"))

            # --- 2. 동시 수정 (다른 항목) → 둘 다 남음 ---
            A.evaluate("()=>{clearInterval();const d=db.defects.find(x=>x.id==='d2');d.lot='LOT-A';touch(d)}")
            B.evaluate("()=>{const d=db.defects.find(x=>x.id==='d2');d.disposition='폐기';touch(d)}")
            A.evaluate("srvSync()"); A.wait_for_timeout(600)
            B.evaluate("srvSync()"); B.wait_for_timeout(600)
            A.evaluate("srvSync()"); A.wait_for_timeout(600)
            a2, b2 = A.evaluate("db.defects.find(x=>x.id==='d2')"), B.evaluate("db.defects.find(x=>x.id==='d2')")
            ok(a2["lot"] == "LOT-A" and a2["disposition"] == "폐기" and b2["lot"] == "LOT-A" and b2["disposition"] == "폐기",
               "동시 수정(다른 항목): 두 사람 변경 모두 반영")

            # --- 3. 같은 항목 동시 수정 → 나중 저장 + 안내 ---
            A.evaluate("()=>{const d=db.defects.find(x=>x.id==='d3');d.qty=30;touch(d)}")
            B.evaluate("()=>{const d=db.defects.find(x=>x.id==='d3');d.qty=40;touch(d)}")
            A.evaluate("srvSync()"); A.wait_for_timeout(600)
            B.evaluate("srvSync()"); B.wait_for_timeout(700)
            ok("먼저 고쳤습니다" in B.inner_text("#toast"), "같은 항목 동시 수정 안내: " + B.inner_text("#toast"))
            A.evaluate("srvSync()"); A.wait_for_timeout(600)
            ok(A.evaluate("db.defects.find(x=>x.id==='d3').qty") == 40, "같은 항목은 나중 저장 값으로 통일")

            # --- 4. 새 불량 등록 · 삭제 ---
            A.evaluate("()=>{db.defects.push(touch({id:'dnew',date:'2026-11-02',partNo:'P-NEW',qty:1,photos:[],supplierId:'s1'}));save()}")
            A.wait_for_timeout(1000); B.evaluate("srvSync()"); B.wait_for_timeout(600)
            ok(B.evaluate("!!db.defects.find(x=>x.id==='dnew')"), "새 등록 → B 반영")
            B.evaluate("()=>{removeRec('defects','dnew');save()}"); B.wait_for_timeout(1000)
            A.evaluate("srvSync()"); A.wait_for_timeout(600)
            ok(not A.evaluate("!!db.defects.find(x=>x.id==='dnew')"), "삭제 → A 반영")

            # --- 4b. 이슈 (0.6.0): A 등록 · 사진 → B 반영 · 기록 추가 → A 반영 ---
            A.evaluate("()=>{window.askConfirm=async()=>true;go('issue');editIssue()}"); A.wait_for_timeout(300)
            A.fill("#mf [name=title]", "서버 이슈 시험")
            A.check("#mf [name=contain]"); A.fill("#mf [name=containText]", "재공 보류")
            A.evaluate("()=>{curPhotos.push({id:'iph1',name:'i.jpg',caption:'',data:'data:image/jpeg;base64,AAAA',thumb:'data:image/jpeg;base64,AAAA',createdAt:now(),isNew:true})}")
            A.evaluate("saveIssue(null,true)"); A.wait_for_timeout(1500)
            iid = A.evaluate("(db.issues.find(i=>i.title==='서버 이슈 시험')||{}).id")
            ok(bool(iid) and A.evaluate("state.tab") == "issue", "이슈 등록 (작성자)")
            B.evaluate("srvSync()"); B.wait_for_timeout(800)
            ok(B.evaluate("i=>{const x=db.issues.find(y=>y.id===i);return !!x&&x.logs.length===2&&x.photos[0]==='iph1'}", iid), "이슈 → B 반영 (기록 · 사진 목록)")
            ok(B.evaluate("photoGetMany(['iph1']).then(a=>a.length)") == 1, "B: 이슈 사진을 서버에서 읽음")
            B.evaluate("i=>{issLog(issById(i),'회의','B 기록',{who:'생산팀'});touch(issById(i));save()}", iid); B.wait_for_timeout(1000)
            A.evaluate("srvSync()"); A.wait_for_timeout(800)
            ok(A.evaluate("i=>issById(i).logs.some(l=>l.text==='B 기록')&&issStatus(issById(i))==='조사 중'", iid), "B 기록 → A 반영 · 조사 중")
            C.evaluate("srvSync()"); C.wait_for_timeout(500); C.evaluate("go('issue')"); C.wait_for_timeout(300)
            ok(C.locator("#view button:has-text('이슈 등록'):visible").count() == 0 and "서버 이슈 시험" in C.inner_text("#view"), "조회: 이슈 보기만 (등록 버튼 없음)")
            # 이슈 삭제: 조회는 삭제 버튼 없음 · 작성자 삭제 → 사진 휴지통 · 연결된 불량은 남고 연결만 끊김 · B 반영
            C.evaluate("i=>issOpen(i)", iid); C.wait_for_timeout(300)
            ok(" 이슈" in C.locator("#modal.on #mt").inner_text() and C.locator("#modal.on .isl").count() == 1, "이슈 상세는 창(팝업)으로 열림")
            ok(C.locator("#modal button:has-text('삭제'):visible").count() == 0, "조회: 이슈 삭제 버튼 없음")
            C.evaluate("closeModal()"); C.wait_for_timeout(200)
            ok(C.evaluate("state.issId===null && !document.querySelector('#modal').classList.contains('on')"), "상세 창 닫기 → 목록")
            A.evaluate("i=>{const d={id:'diss',date:today(),partNo:'P-ISS',qty:1,photos:[],issueId:i};db.defects.push(touch(d));issById(i).defectIds=['diss'];touch(issById(i));save()}", iid); A.wait_for_timeout(1200)
            A.evaluate("i=>issOpen(i)", iid); A.wait_for_timeout(300)
            ok(A.locator("#mfoot button:has-text('삭제'):visible").count() == 1, "작성자: 이슈 상세에 삭제 버튼")
            # 상세 창에서 기록 추가 → 창이 그대로 열린 채 갱신 · 수정 창을 닫으면 상세로 돌아옴
            A.fill("#isTx", "창에서 쓴 기록"); A.click("#modal button:has-text('기록 추가')"); A.wait_for_timeout(400)
            ok(A.locator("#modal.on").count() == 1 and "창에서 쓴 기록" in A.inner_text("#modal .isl"), "상세 창에서 기록 추가 → 창 유지 · 갱신")
            # 기록 수정: 사유 없이도 저장 · 사유를 적으면 이력에 남음 · 수정 전 내용 보관
            A.click("#modal .isl li:has-text('창에서 쓴 기록') button:has-text('수정')"); A.wait_for_timeout(300)
            A.fill("#ieTx", "창에서 쓴 기록 (고침)"); A.click("#modal button:has-text('수정 저장')"); A.wait_for_timeout(400)
            ok(A.evaluate("i=>{const l=issById(i).logs.find(x=>x.text==='창에서 쓴 기록 (고침)');return !!l&&l.edits.length===1&&l.edits[0].reason===''&&l.edits[0].prev.text==='창에서 쓴 기록'}", iid), "기록 수정: 사유 없이 저장 · 수정 전 내용 보관")
            A.click("#modal .isl li:has-text('창에서 쓴 기록 (고침)') button:has-text('수정')"); A.wait_for_timeout(300)
            A.fill("#ieTx", "창에서 쓴 기록 (두 번 고침)"); A.fill("#ieWhy", "오타 수정"); A.click("#modal button:has-text('수정 저장')"); A.wait_for_timeout(400)
            ok(A.evaluate("i=>{const l=issById(i).logs.find(x=>x.text==='창에서 쓴 기록 (두 번 고침)');return !!l&&l.edits.length===2&&l.edits[1].reason==='오타 수정'}", iid) and "수정 2회" in A.inner_text("#modal .isl") and "오타 수정" in A.inner_text("#modal .isl"), "기록 수정: 사유가 이력에 남고 화면에 표시")
            A.click("#modal .isl li:has-text('두 번 고침') button:has-text('수정')"); A.wait_for_timeout(300); A.click("#modal button:has-text('수정 저장')"); A.wait_for_timeout(300)
            ok(A.evaluate("i=>issById(i).logs.find(x=>x.text==='창에서 쓴 기록 (두 번 고침)').edits.length===2", iid), "바꾼 것 없이 저장 → 이력 늘지 않음")
            A.click("#mfoot button:has-text('수정')"); A.wait_for_timeout(300)
            ok(A.locator("#mt").inner_text().endswith("수정"), "상세 → 수정 창")
            A.evaluate("closeModal(true)"); A.wait_for_timeout(300)
            ok(A.locator("#modal.on .isl").count() == 1, "수정 창 닫기 → 상세 창으로 돌아옴")
            A.click("#mfoot button:has-text('삭제')"); A.wait_for_timeout(1500)
            ok(A.evaluate("i=>!issById(i)&&state.issId===null", iid), "이슈 삭제 → 목록으로")
            ok(A.evaluate("()=>{const d=db.defects.find(x=>x.id==='diss');return !!d&&!d.issueId}"), "연결된 불량은 남고 이슈 연결만 끊김")
            B.evaluate("srvSync()"); B.wait_for_timeout(800)
            ok(B.evaluate("i=>!issById(i)", iid), "이슈 삭제 → B 반영")
            ok(not A.evaluate("srvApi('/api/files/ids').then(j=>j.ids.includes('iph1'))"), "이슈 사진도 삭제 (서버 휴지통)")
            A.evaluate("()=>{removeRec('defects','diss');save()}"); A.wait_for_timeout(800)

            # --- 5. 권한: 작성자는 기준정보 삭제 · 설정 불가 ---
            A.evaluate("delSup('s1')"); A.wait_for_timeout(300)
            ok("관리자만" in A.inner_text("#toast"), "작성자: 협력사 삭제 → 관리자만")
            A.evaluate("()=>{db.settings.sevA=4;save()}"); A.wait_for_timeout(1200)
            ok(A.evaluate("db.settings.sevA") == 12, "작성자가 설정을 바꿔도 서버가 거부 → 되돌림")
            A.evaluate("()=>{db.suppliers.find(s=>s.id==='s1').addr='평택';touch(db.suppliers.find(s=>s.id==='s1'));save()}"); A.wait_for_timeout(1000)
            B.evaluate("srvSync()"); B.wait_for_timeout(600)
            ok(B.evaluate("db.suppliers.find(s=>s.id==='s1').addr") == "평택", "작성자: 협력사 정보 수정은 가능")

            # --- 6. 조회 권한 ---
            ok(C.locator(".roBar").count() == 1 and "조회 권한" in C.inner_text(".roBar"), "조회: 안내 줄")
            C.evaluate("go('defect')"); C.wait_for_timeout(300)
            ok(C.locator("#view button:has-text('불량 등록'):visible").count() == 0, "조회: 등록 버튼 없음")
            C.evaluate("()=>{db.defects[0].qty=999;save()}"); C.wait_for_timeout(800)
            C.evaluate("srvSync()"); C.wait_for_timeout(500)
            B.evaluate("srvSync()"); B.wait_for_timeout(500)
            ok(B.evaluate("db.defects.find(x=>x.id==='d1').qty") == 12, "조회 사용자는 저장 안 됨")

            # --- 7. 첨부: 기존 사진 · 통보서 파일 ---
            ok(C.evaluate("photoGetMany(['ph1']).then(a=>a.length)") == 1, "가져온 사진을 서버에서 읽음")
            D = os.path.join(tmp, "f"); os.makedirs(D)
            open(os.path.join(D, "통보서.pdf"), "wb").write(b"%PDF-1.4\n%%EOF\n")
            A.evaluate("editNcr('n1',null,'issue')"); A.wait_for_timeout(600)
            A.set_input_files("#noticeBox input[type=file]", [os.path.join(D, "통보서.pdf")]); A.wait_for_timeout(600)
            A.evaluate("saveNcr('n1')"); A.wait_for_timeout(1500)
            A.evaluate("closeModal(true)")
            ids = A.evaluate("db.ncrs.find(n=>n.id==='n1').noticeDocs")
            ok(ids and len(ids) == 1, "NCR에 통보서 첨부 저장")
            B.evaluate("srvSync()"); B.wait_for_timeout(700)
            ok(B.evaluate("db.ncrs.find(n=>n.id==='n1').noticeDocs||[]") == ids, "B: NCR 첨부 목록 반영")
            ok(B.evaluate("ids=>photoGetMany(ids).then(a=>a[0]&&a[0].name)", ids) == "통보서.pdf", "B: 첨부 파일 내용 열람")
            fpath = os.path.join(tmp, "data", "files", ids[0][:2], ids[0] + ".json")
            ok(os.path.exists(fpath), "첨부는 서버 files 폴더에 저장")

            # --- 8. 서버 끊김 → 변경 보관 → 다시 연결되면 저장 ---
            srv.send_signal(signal.SIGTERM); srv.wait(5)
            A.evaluate("()=>{const d=db.defects.find(x=>x.id==='d4');d.qty=44;touch(d);save()}")
            A.wait_for_timeout(1500)
            ok("연결할 수 없습니다" in A.inner_text("#alertBar") and A.is_visible("#alertBar"), "서버 끊김 안내 줄")
            ok("끊김" in A.inner_text("#saveInfo"), "저장 표시: " + A.inner_text("#saveInfo"))
            srv = start(env)
            A.evaluate("srvSync()"); A.wait_for_timeout(1000)
            ok(not A.is_visible("#alertBar"), "다시 연결 → 안내 줄 사라짐")
            B.evaluate("srvSync()"); B.wait_for_timeout(700)
            ok(B.evaluate("db.defects.find(x=>x.id==='d4').qty") == 44, "끊긴 동안 고친 내용이 다시 연결 후 저장됨")

            # --- 9. 로그인 만료 ---
            import sqlite3
            con = sqlite3.connect(os.path.join(tmp, "data", "qis.db"))
            con.execute("DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE username='kim')"); con.commit(); con.close()
            A.evaluate("()=>{const d=db.defects.find(x=>x.id==='d5');d.qty=55;touch(d);save()}"); A.wait_for_timeout(1200)
            ok("로그인이 만료" in A.inner_text("#alertBar"), "로그인 만료 안내 (변경은 창에 보관)")
            ok(A.evaluate("srvUnsaved()") is True, "로그인 만료 중 보내지 못한 변경 → 창 닫기 확인 대상")
            ctx2 = A.context.new_page()
            ctx2.goto(URL + "/login"); ctx2.fill("#u", "kim"); ctx2.fill("#p", "Qk1m2026b"); ctx2.click("#b"); ctx2.wait_for_timeout(800)
            ctx2.close()
            A.evaluate("srvState.expired=false;srvSync()"); A.wait_for_timeout(1000)
            B.evaluate("srvSync()"); B.wait_for_timeout(700)
            ok(B.evaluate("db.defects.find(x=>x.id==='d5').qty") == 55, "다시 로그인 → 보관된 변경 저장")

            # --- 10. 관리 화면 ---
            M = B.context.new_page()
            M.goto(URL + "/admin"); M.wait_for_timeout(800)
            ok("김작성" in M.inner_text("#view") and "이조회" in M.inner_text("#view"), "관리: 사용자 목록")
            M.click("nav button:has-text('변경 이력')"); M.wait_for_timeout(800)
            t = M.inner_text("#view")
            ok("수정" in t and "qty" in t and "로그인" in t, "관리: 변경 이력 (수정 · 로그인)")
            ok("동시 수정" in t, "관리: 동시 수정 표시")
            M.fill("input[placeholder^='검색']", "QNCN"); M.dispatch_event("input[placeholder^='검색']", "change")
            M.click("button:has-text('조회')"); M.wait_for_timeout(600)
            ok("QNCN-2026-002" in M.inner_text("#view"), "관리: NCR 번호로 이력 검색")
            M.screenshot(path=os.path.join(os.environ.get("SHOT_DIR", tmp), "admin_audit.png"), full_page=False)
            M.click("nav button:has-text('백업')"); M.wait_for_timeout(500)
            M.click("button:has-text('지금 백업')"); M.wait_for_timeout(1500)
            ok("qis_" in M.inner_text("#view"), "관리: 지금 백업")
            ok(os.listdir(os.path.join(tmp, "data", "backup", "db")), "백업 파일 생성")
            # 알림 (텔레그램) — 텔레그램 서버는 브라우저에서 흉내낼 수 없으므로 설정 · 미리 보기 · 토큰 비노출만
            M.click("nav button:has-text('알림')"); M.wait_for_timeout(600)
            ok("봇 토큰" in M.inner_text("#view") and "받을 곳" in M.inner_text("#view"), "관리: 알림 (텔레그램) 화면")
            M.fill("#tgTok", "123:SECRET"); M.click("#tgTok ~ button"); M.wait_for_timeout(700)
            ok("저장됨" in M.inner_text("#view") and "123:SECRET" not in M.content(), "관리: 토큰 저장 — 화면에 다시 내려오지 않음")
            M.fill("#tgChat", "-100777"); M.click("#tgChat ~ button"); M.wait_for_timeout(700)
            M.click("button:has-text('미리 보기')"); M.wait_for_timeout(700)
            ok("아침 품질 요약" in M.inner_text("#tgPrev"), "관리: 아침 요약 미리 보기")
            ok("123:SECRET" not in B.evaluate("JSON.stringify(db)"), "작성자 화면 데이터에 토큰 없음")
            # 사용자 추가
            M.click("nav button:has-text('사용자')"); M.wait_for_timeout(500)
            M.fill("#nu", "park"); M.fill("#nn", "박신규"); M.fill("#np", "Qp4rk2026"); M.click("button:has-text('추가')"); M.wait_for_timeout(800)
            ok("박신규" in M.inner_text("#view"), "관리: 사용자 추가")
            # 작성자는 관리 화면 못 들어감
            A2 = A.context.new_page(); A2.goto(URL + "/admin"); A2.wait_for_timeout(500)
            ok(not A2.url.endswith("/admin"), "작성자: 관리 화면 접근 불가")
            A2.close()

            # --- 11. 화면 상태 ---
            A.evaluate("go('ncr')"); A.wait_for_timeout(400)
            A.screenshot(path=os.path.join(os.environ.get("SHOT_DIR", tmp), "app_editor.png"))
            C.screenshot(path=os.path.join(os.environ.get("SHOT_DIR", tmp), "app_viewer.png"))
            B.evaluate("()=>{state.setTab='backup';go('data')}"); B.wait_for_timeout(400)
            ok("사내 서버" in B.inner_text("#view"), "관리자 설정 › 데이터: 서버 안내")
            B.screenshot(path=os.path.join(os.environ.get("SHOT_DIR", tmp), "app_admin_data.png"))
            # 실행 기록 삭제: 저장된 기록 · 취소 처리된 기록을 목록에서 없앨 수 있음
            did = A.evaluate("db.defects.find(d=>!d.deleted).id")
            A.evaluate("i=>{state.tab='defect';render();openLog(i)}", did); A.wait_for_timeout(500)
            n0 = A.evaluate("tl.own.length")
            for t in ("삭제 시험 기록 1", "삭제 시험 기록 2"):
                A.fill("#lgText", t); A.click("#modal button:has-text('기록 추가')"); A.wait_for_timeout(150)
            A.click("#mfoot button.p:has-text('저장')"); A.wait_for_timeout(900)
            A.evaluate("i=>openLog(i)", did); A.wait_for_timeout(500)
            ok(A.evaluate("tl.own.length") == n0 + 2 and A.evaluate("tl.own.every(x=>!x._new)"), "실행 기록 2건 저장됨")
            A.evaluate("()=>{const k=tl.own.findIndex(x=>x.text==='삭제 시험 기록 1');tl.own[k].void={at:now(),by:'t',reason:'시험'};renderLogs(false)}"); A.wait_for_timeout(150)
            ok(A.locator("#modal ul.logs li.vd a:has-text('삭제')").count() == 1, "취소 처리된 기록에 삭제 단추")
            A.click("#modal ul.logs li.vd a:has-text('삭제')"); A.wait_for_timeout(300)   # 확인 창은 이 시험 화면에서 자동 승인(위에서 askConfirm 대체)
            A.click("#modal ul.logs li:has-text('삭제 시험 기록 2') a:has-text('삭제')"); A.wait_for_timeout(300)
            A.click("#mfoot button.p:has-text('저장')"); A.wait_for_timeout(900)
            ok(A.evaluate("i=>(db.defects.find(d=>d.id===i).logs||[]).filter(l=>/삭제 시험 기록/.test(l.text)).length", did) == 0, "실행 기록 삭제 → 저장 후 사라짐")
            ok(A.evaluate("i=>(db.defects.find(d=>d.id===i).logs||[]).length", did) == n0, "다른 기록은 그대로")
            # FAR 단일 원본: 귀책 조사 값이 NCR 의 FAR 로 그대로 반영, NCR 전용 항목은 유지, 귀책 조사가 비어 있으면 NCR 값이 귀책 조사로 옮겨짐
            r = A.evaluate("""()=>{
              const d=db.defects.find(x=>!x.deleted&&!x.ncrId)||db.defects[0];
              d.inv=Object.assign({},d.inv,{farReq:'2026-11-02',farDue:'2026-11-09',farRecv:'',sample:'',farResult:''});touch(d);
              const n={id:uid(),no:'FAR-TEST',issueDate:today(),supplierId:d.supplierId,defectIds:[d.id],
                far:{reqDate:'2026-10-01',due:'2026-10-08',purpose:'고장 분석',items:['치수'],sampleQty:'5 EA',shipDate:'2026-11-03',shipRef:'A-1',replyDate:'',verdict:'',summary:'',review:'',note:''}};
              db.ncrs.push(n);touch(n);farSyncAll();
              const a={req:n.far.reqDate,due:n.far.due,purpose:n.far.purpose,ship:n.far.shipRef,invSample:d.inv.sample};
              d.inv.farRecv='2026-11-06';d.inv.farResult='경도 미달';touch(d);farSyncAll();
              const b={reply:n.far.replyDate,sum:n.far.summary};
              editNcr(n.id);const ro=document.querySelector('#mf [name=far_reqDate]').readOnly&&document.querySelector('#mf [name=far_summary]').readOnly&&!document.querySelector('#mf [name=far_shipRef]').readOnly;
              const banner=document.querySelector('#farWrap').innerText.includes('귀책 조사');closeModal(true);
              db.ncrs=db.ncrs.filter(x=>x!==n);return {a,b,ro,banner};}""")
            ok(r["a"]["req"] == "2026-11-02" and r["a"]["due"] == "2026-11-09", "FAR: 귀책 조사의 요청일 · 기한이 NCR 에 반영")
            ok(r["a"]["purpose"] == "고장 분석" and r["a"]["ship"] == "A-1", "FAR: NCR 전용 항목은 그대로")
            ok(r["a"]["invSample"] == "5 EA", "FAR: 귀책 조사에 없던 시료 수량은 NCR 값이 귀책 조사로 옮겨짐")
            ok(r["b"]["reply"] == "2026-11-06" and r["b"]["sum"] == "경도 미달", "FAR: 귀책 조사 회신을 고치면 NCR 도 같이 바뀜")
            ok(r["ro"] and r["banner"], "FAR: NCR 창에서 공통 항목은 읽기 전용 · 귀책 조사 안내")
            # 단순 통보 NCR: 유효성 검증 없이 통보하면 종결
            r = A.evaluate("""() => {
              const n={id:uid(),no:'N-INFO',issueDate:addDays(today(),-40),reqType:'단순 통보',supplierId:db.suppliers[0].id,defectIds:[]};db.ncrs.push(n);
              const s0=ncrStatus(n);n.notifyDate=addDays(today(),-39);n.verifyDue=addDays(today(),-10);
              const s1=ncrStatus(n),fl=ncrFlags(n),steps=ncrSteps(n).S.map(x=>x.l).join('>'),cd=ncrCloseDate(n)===n.notifyDate,vi=verifyInfo(n)===null;
              editNcr(n.id,null,'verify');const hint=!document.querySelector('#vfInfo').hidden,dueHidden=document.querySelector('#mf [name=verifyDue]').closest('label').style.display==='none';closeModal(true);
              n.verifyDate=today();n.verifyResult='무효(재발)';const s2=ncrStatus(n);
              const m={id:uid(),no:'N-8D',issueDate:addDays(today(),-40),reqType:'8D 보고서',notifyDate:addDays(today(),-39),requestDate:addDays(today(),-39),replyDate:addDays(today(),-30),validity:'적정',verifyDue:addDays(today(),-10)};
              const s3=ncrStatus(m),late3=ncrFlags(m).verifyLate;
              db.ncrs=db.ncrs.filter(x=>x!==n);return {s0,s1,late:fl.verifyLate||fl.verifySoon,steps,cd,vi,hint,dueHidden,s2,s3,late3};}""")
            ok(r["s0"] == "미통보" and r["s1"] == "종결", "단순 통보: 통보하면 유효성 검증 없이 종결")
            ok(not r["late"] and r["vi"] and r["cd"], "단순 통보: 유효성 검증 지연 · 대기로 세지 않고 종결일은 통보일")
            ok(r["steps"] == "발행>협력사 통보>종결", "단순 통보: 진행 단계에 검증 단계 없음")
            ok(r["hint"] and r["dueHidden"], "단순 통보: NCR 창에 검증 불필요 안내 · 검증 기한 칸 숨김")
            ok(r["s2"] == "검증 무효", "단순 통보: 재발은 무효(재발)로 기록할 수 있음")
            ok(r["s3"] == "승인(검증대기)" and r["late3"], "8D NCR 은 유효성 검증을 그대로 요구")
            # 로그아웃
            A.click("button:has-text('로그아웃')"); A.wait_for_url("**/login")
            ok(True, "로그아웃")
            for n, pg in (("A", A), ("B", B), ("C", C)):
                ok(not pg._errs, f"{n} 화면 오류 없음 {pg._errs[:2]}")
            b.close()
    finally:
        srv.send_signal(signal.SIGTERM)
        try:
            srv.wait(5)
        except Exception:
            srv.kill()
        shutil.rmtree(tmp, ignore_errors=True)
    print("FAILS:", len(fails))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
