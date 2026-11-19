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
            A.fill("#isTx", "창에서 쓴 기록"); A.click("#modal .isadd button.p:has-text('저장')"); A.wait_for_timeout(400)
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
            # 창 아래 단추: 삭제는 왼쪽 끝에 따로 · 상세 창에 저장 단추 · 삭제는 확인을 물음
            r = A.evaluate("""() => {const k=[...document.querySelector('#mfoot').children],lab=k.map(e=>e.className.includes('mfsp')?'|':e.textContent).join(','),
              d=k[0].getBoundingClientRect(),n=k[2].getBoundingClientRect();return {lab,gap:n.left-d.right,tx:document.querySelector('#isTx').value}}""")
            ok(r["lab"] == "삭제,|,수정,닫기,저장" and r["gap"] > 100, f"이슈 상세: 삭제는 왼쪽 끝 · 저장 단추 있음 ({r['lab']}, 간격 {round(r['gap'])}px)")
            ok(r["tx"] == "", "기록 추가 후 입력 칸 비움")
            r2 = A.evaluate("""() => {const b=[...document.querySelectorAll('#modal .isadd .cf button')].map(x=>x.textContent).join(),lgc=document.querySelector('#modal .isadd').classList.contains('lgc');
              document.querySelector('#isTx').value='지울 내용';document.querySelector('#isWho').value='누구';issClearLog();return {b,lgc,v:document.querySelector('#isTx').value+document.querySelector('#isWho').value,on:document.querySelector('#modal').classList.contains('on')}}""")
            ok(r2["b"] == "취소,저장" and r2["lgc"] and r2["v"] == "" and r2["on"], f"이슈 기록 작성 칸: 실행 기록과 같은 모양 · 취소 · 저장 ({r2['b']})")
            r = A.evaluate("""async i => {const o=window.askConfirm;let n=0;window.askConfirm=async()=>{n++;return false};
              document.querySelector('#mfoot button.d').click();await new Promise(r=>setTimeout(r,300));window.askConfirm=o;return {n,alive:!!issById(i)}}""", iid)
            ok(r["n"] == 1 and r["alive"], "이슈 삭제: 확인을 묻고, 취소하면 지우지 않음")
            A.fill("#isTx", "저장 단추로 쓴 기록"); A.click("#mfoot button.p"); A.wait_for_timeout(500)
            ok(A.evaluate("i=>!document.querySelector('#modal').classList.contains('on')&&issById(i).logs.filter(x=>x.text==='저장 단추로 쓴 기록').length===1", iid), "이슈 상세 저장 단추: 쓰던 기록 저장 후 창 닫음")
            r = A.evaluate("""() => {const lab=()=>[...document.querySelector('#mfoot').children].map(e=>e.className.includes('mfsp')?'|':e.textContent).join(',');
              editDefect(db.defects[0].id);const d=lab();mfDirty=false;closeModal(true);editNcr(db.ncrs[0].id,null,'issue');const n=lab();mfDirty=false;closeModal(true);return {d,n}}""")
            ok(r["d"] == "삭제,|,취소,저장" and r["n"].startswith("삭제,|,"), f"불량 · NCR 창: 삭제는 왼쪽 끝에 따로 · 불량 창은 취소 · 저장만 ({r['d']} / {r['n']})")
            A.evaluate("i=>issOpen(i)", iid); A.wait_for_timeout(300)
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
                A.fill("#lgText", t); A.click("#modal .lgc button.p:has-text('저장')"); A.wait_for_timeout(250)
            r = A.evaluate("""i=>{const d=db.defects.find(x=>x.id===i),b=[...document.querySelectorAll('#modal .lgc .cf button')].map(x=>x.textContent).join();
              return {b,open:document.querySelector('#modal').classList.contains('on'),saved:(d.logs||[]).filter(l=>/삭제 시험 기록/.test(l.text)).length,pend:tl.own.filter(x=>x._new).length,dirty:mfDirty,empty:document.querySelector('#lgText').value===''}}""", did)
            ok(r["b"] == "취소,저장", f"실행 기록 작성 칸: 취소 · 저장 단추 ({r['b']})")
            ok(r["open"] and r["saved"] == 2 and r["pend"] == 0 and not r["dirty"] and r["empty"], f"작성 칸의 저장 → 창을 닫지 않고 바로 저장 · 작성 칸 비움 ({r})")
            A.fill("#lgText", "쓰다 만 내용"); A.fill("#lgParty", "누구"); A.click("#modal .lgc .cf button:has-text('취소')"); A.wait_for_timeout(200)
            ok(A.evaluate("document.querySelector('#lgText').value+document.querySelector('#lgParty').value") == "" and not A.evaluate("mfDirty") and A.locator("#modal.on").count() == 1, "작성 칸의 취소 → 쓰던 내용만 지움 (창은 그대로)")
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
            # FAR 은 FAR 화면 한 곳에서: NCR 의 far 는 연결 불량의 FAR 를 비춘 값 · 옛 NCR 입력값은 FAR 화면으로 옮겨짐 · NCR 창에는 읽기 전용 요약만
            r = A.evaluate("""()=>{
              const free=db.defects.filter(x=>!x.deleted&&!x.ncrId),d=free[0]||db.defects[0],d2=free[1]||db.defects[1];
              d.inv=Object.assign({},d.inv,{farReq:'2026-11-02',farDue:'2026-11-09',farRecv:'',sample:'',farResult:'',farPurpose:'',farItems:[],farShipRef:''});touch(d);
              const n={id:uid(),no:'FAR-TEST',issueDate:today(),supplierId:d.supplierId,defectIds:[d.id],
                far:{reqDate:'2026-10-01',due:'2026-10-08',purpose:'고장 원인 규명',items:['치수 측정'],sampleQty:'5 EA',shipDate:'2026-11-03',shipRef:'A-1',replyDate:'',verdict:'',summary:'',review:'',note:'불량 귀책 조사에서 이어받음 (x)'}};
              db.ncrs.push(n);touch(n);farSyncAll();
              const a={req:n.far.reqDate,due:n.far.due,src:n.far.src===d.id,purpose:d.inv.farPurpose,items:(d.inv.farItems||[]).join(),ship:d.inv.farShipRef,sample:d.inv.sample,note:d.inv.farNote||'',mirror:n.far.purpose+'/'+n.far.shipRef};
              d.inv.farRecv='2026-11-06';d.inv.farResult='경도 미달';d.inv.farVerdict='협력사 귀책 인정';touch(d);farSyncAll();
              const b={reply:n.far.replyDate,sum:n.far.summary,vd:n.far.verdict,st:farState(n)};
              editNcr(n.id,null,'reply');const ui={inputs:document.querySelectorAll('#mf [name^=far_]').length,tab:!!document.querySelector('#ncrTabs [data-t=f]'),line:(document.querySelector('#farLine')||{innerText:''}).innerText,print:document.querySelector('#modal').innerText.includes('FAR 요청서 출력')};mfDirty=false;closeModal(true);
              // 옛 기록: 연결 불량에 FAR 가 없고 NCR 에만 있으면 그 불량의 FAR 로 옮김
              d2.inv=Object.assign({},d2.inv,{farReq:'',farDue:'',farRecv:''});
              const m={id:uid(),no:'FAR-OLD',issueDate:today(),supplierId:d2.supplierId,defectIds:[d2.id],far:{reqDate:'2026-09-01',due:'2026-09-08',purpose:'재현 시험',items:[],sampleQty:'2 EA',replyDate:'',summary:''}};
              db.ncrs.push(m);farSyncAll();const c={req:d2.inv.farReq,purpose:d2.inv.farPurpose,src:m.far.src===d2.id};
              // FAR 화면에서 FAR 를 지우면 NCR 쪽도 없어짐 · 연결 불량이 없는 NCR 의 FAR 는 그대로
              d2.inv.farReq='';farSyncAll();c.gone=m.far===null;
              const z={id:uid(),no:'FAR-NOLINK',issueDate:today(),defectIds:[],far:{reqDate:'2026-08-01',due:'2026-08-08',summary:'남김'}};db.ncrs.push(z);farSyncAll();c.keep=z.far.summary==='남김';
              // FAR 화면: 옮겨 온 항목을 입력 · 저장
              state.tab='inv';render();editInv(d.id);const f=document.querySelector('#mf');const scr={purpose:f.inv_farPurpose.value,item:f.querySelector('input[name=inv_farItem][value="치수 측정"]').checked,ship:f.inv_farShipRef.value,vd:f.inv_farVerdict.value};
              f.inv_farReview.value='재분석 요청';f.querySelector('input[name=inv_farItem][value="외관 관찰"]').checked=true;saveInv(d.id);
              scr.saved=(d.inv.farItems||[]).join()+'|'+d.inv.farReview+'|'+n.far.review+'|'+farState(n)+'|'+('farItem' in d.inv);
              db.ncrs=db.ncrs.filter(x=>x!==n&&x!==m&&x!==z);return {a,b,ui,c,scr};}""")
            ok(r["a"]["req"] == "2026-11-02" and r["a"]["due"] == "2026-11-09" and r["a"]["src"], "FAR: FAR 화면의 요청일 · 기한이 NCR 에 반영")
            ok(r["a"]["purpose"] == "고장 원인 규명" and r["a"]["items"] == "치수 측정" and r["a"]["ship"] == "A-1" and r["a"]["sample"] == "5 EA", f"FAR: NCR 에만 있던 값이 FAR 화면으로 옮겨짐 ({r['a']})")
            ok(r["a"]["note"] == "" and r["a"]["mirror"] == "고장 원인 규명/A-1", "FAR: 자동으로 만들었던 비고는 옮기지 않음 · NCR 은 같은 값을 비춤")
            ok(r["b"]["reply"] == "2026-11-06" and r["b"]["sum"] == "경도 미달" and r["b"]["vd"] == "협력사 귀책 인정" and r["b"]["st"] == "회신", "FAR: FAR 화면 회신을 고치면 NCR 도 같이 바뀜")
            ok(r["ui"]["inputs"] == 0 and not r["ui"]["tab"] and not r["ui"]["print"], "NCR 협력사 회신 창: FAR 탭 · 입력 칸 · 요청서 출력 없음")
            ok("FAR 열기" in r["ui"]["line"] and "2026-11-02" in r["ui"]["line"] and "경도 미달" in r["ui"]["line"], "NCR 창: FAR 읽기 전용 요약 · FAR 열기 링크")
            ok(r["c"]["req"] == "2026-09-01" and r["c"]["purpose"] == "재현 시험" and r["c"]["src"], "FAR: NCR 에만 있던 옛 FAR 는 연결 불량의 FAR 로 옮겨짐")
            ok(r["c"]["gone"] and r["c"]["keep"], "FAR: FAR 화면에서 지우면 NCR 쪽도 없어짐 · 연결 불량 없는 NCR 의 FAR 는 그대로")
            ok(r["scr"]["purpose"] == "고장 원인 규명" and r["scr"]["item"] and r["scr"]["ship"] == "A-1" and r["scr"]["vd"] == "협력사 귀책 인정", "FAR 화면: 요청 목적 · 분석 항목 · 송장 · 협력사 분석 판정 입력 칸")
            ok(r["scr"]["saved"] == "외관 관찰,치수 측정|재분석 요청|재분석 요청|재분석 요청|false", f"FAR 화면 저장: 분석 항목 · 당사 검토 저장, NCR 배지에 반영 ({r['scr']['saved']})")
            # FAR 화면: 요청 · 회신 · 판정을 따로 엶
            r = A.evaluate("""() => {
              mfDirty=false;closeModal(true);const d=db.defects.find(x=>!x.deleted&&!x.ncrId)||db.defects[0],inv0=d.inv,resp0=d.resp;d.resp='미정';d.inv={};state.tab='inv';state.ivf.status='all';render();
              const vis=()=>[...document.querySelectorAll('#mf .ivs')].filter(e=>e.style.display!=='none').map(e=>e.dataset.s).join(),foot=()=>[...document.querySelectorAll('#mfoot button')].map(b=>b.textContent).join(),tt=()=>document.querySelector('#mt').textContent;
              const o={};o.btn=[...document.querySelectorAll('#ivtab tbody tr')].map(tr=>[...tr.querySelectorAll('td:last-child button')].map(b=>b.textContent+(b.classList.contains('p')?'*':'')).join()).find(x=>x.includes('요청*'))||'';
              editInv(d.id);o.def0={v:vis(),t:tt(),f:foot()};
              const f=document.querySelector('#mf');f.inv_farReq.value='2026-11-10';invAuto();f.inv_farPurpose.value='재현 시험';saveInv(d.id);
              editInv(d.id);o.def1={v:vis(),t:tt(),f:foot(),sum:document.querySelector('#mf .ivs[data-s=reply]').innerText.includes('FAR 요청 2026-11-10')};
              const g=document.querySelector('#mf');g.inv_farRecv.value='2026-11-15';g.inv_farVerdict.value='협력사 귀책 인정';saveInv(d.id);
              o.kept=d.inv.farReq+'|'+d.inv.farPurpose+'|'+d.inv.farRecv+'|'+d.inv.farVerdict;
              editInv(d.id);o.def2={v:vis(),t:tt(),f:foot(),sum:document.querySelector('#mf .ivs[data-s=judge]').innerText.includes('FAR 회신 2026-11-15')};mfDirty=false;closeModal(true);
              editInv(d.id,'','req');o.req=vis();mfDirty=false;closeModal(true);editInv(d.id,'inv_verdict');o.foc=vis();mfDirty=false;closeModal(true);
              d.inv=inv0;d.resp=resp0;farSyncAll();render();return o}""")
            ok(r["btn"].startswith("요청*,회신,판정,불량"), f"FAR 목록: 요청 · 회신 · 판정 단추 (다음 단계 강조) ({r['btn']})")
            ok(r["def0"]["v"] == "req" and r["def0"]["t"].startswith("FAR 요청 —") and "저장 후 FAR 요청서 출력" in r["def0"]["f"], "FAR 요청 창: 요청 구역만 · 요청서 출력 단추")
            ok(r["def1"]["v"] == "reply" and r["def1"]["t"].startswith("FAR 회신 —") and r["def1"]["f"] == "취소,저장" and r["def1"]["sum"], "FAR 회신 창: 회신 구역만 · 요청 요약 표시")
            ok(r["def2"]["v"] == "judge" and r["def2"]["t"].startswith("귀책 판정 —") and r["def2"]["f"] == "취소,저장" and r["def2"]["sum"], "귀책 판정 창: 사내 분석 · 판정 구역만 · FAR 요약 표시")
            ok(r["kept"] == "2026-11-10|재현 시험|2026-11-15|협력사 귀책 인정", f"단계별로 저장해도 다른 단계 값은 그대로 ({r['kept']})")
            ok(r["req"] == "req" and r["foc"] == "judge", "단계를 지정해서 열기 · 판정 칸으로 열면 판정 창")
            # NCR 진행 기록 · 이슈 기록: 같은 작성 칸(취소 · 저장), 바로 저장
            r = A.evaluate("""async () => {
              mfDirty=false;closeModal(true);const wait=ms=>new Promise(r=>setTimeout(r,ms)),o={};
              const n=db.ncrs[0],n0=(n.logs||[]).length;state.tab='ncr';render();editNcr(n.id,null,'issue');ncrTab('d');await wait(150);
              o.btn=[...document.querySelectorAll('#modal .lgc .cf button')].map(x=>x.textContent).join();
              const ev=(el)=>el.dispatchEvent(new Event('input',{bubbles:true}));
              document.querySelector('#lgText').value='NCR 진행 기록 시험';ev(document.querySelector('#lgText'));addLog();await wait(200);
              o.saved=(n.logs||[]).length===n0+1&&n.logs.some(l=>l.text==='NCR 진행 기록 시험');o.open=document.querySelector('#modal').classList.contains('on');o.dirty1=mfDirty;
              const t=document.querySelector('#mf [name=title]');t.value=t.value+' ';ev(t);document.querySelector('#lgText').value='둘째 기록';ev(document.querySelector('#lgText'));addLog();await wait(200);o.dirty2=mfDirty;
              n.logs=n.logs.filter(l=>!/NCR 진행 기록 시험|둘째 기록/.test(l.text));mfDirty=false;closeModal(true);
              return o}""")
            ok(r["btn"] == "취소,저장" and r["saved"] and r["open"], "NCR 진행 기록: 같은 작성 칸 · 저장하면 창을 닫지 않고 바로 저장")
            ok(not r["dirty1"] and r["dirty2"], "NCR: 기록만 저장했으면 닫을 때 묻지 않음 · 다른 칸을 고쳤으면 물음")
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
            # NCR 목록의 단계 단추: 그 단계 화면만 열림 (단계 전환 줄 없음) · 통보서 단추 없음
            r = A.evaluate("""() => {mfDirty=false;closeModal(true);state.tab='ncr';render();
              const n=db.ncrs.find(x=>x.reqType!=='단순 통보')||db.ncrs[0],row=[...document.querySelectorAll('#ntab tbody tr')][0],btn=[...row.querySelectorAll('td:last-child button')].map(b=>b.textContent.trim()).join(',');
              const tabs=()=>[...document.querySelectorAll('#ncrTabs [data-t]')].filter(b=>b.style.display!=='none').map(b=>b.dataset.t).join('');
              const o={btn};for(const m of ['issue','reply','verify']){editNcr(n.id,null,m);o[m]={sw:!!document.querySelector('#ncrModes'),tabs:tabs(),t:document.querySelector('#mt').textContent};mfDirty=false;closeModal(true)}
              editNcr(n.id);o.link=!!document.querySelector('#ncrModes');mfDirty=false;closeModal(true);
              row.querySelector('a.lk').click();o.no=!!document.querySelector('#ncrModes');mfDirty=false;closeModal(true);return o}""")
            ok("통보서" not in r["btn"] and r["btn"].startswith("발행 정보"), f"NCR 목록: 통보서 단추 없음 ({r['btn']})")
            ok(not r["issue"]["sw"] and not r["reply"]["sw"] and not r["verify"]["sw"] and not r["no"], "NCR 목록의 단계 단추 · 번호: 단계 전환 줄 없이 그 단계만")
            ok(r["issue"]["tabs"] == "antd" and r["reply"]["tabs"] == "rbd" and r["verify"]["tabs"] == "cd", f"NCR 단계별 탭 ({r['issue']['tabs']}/{r['reply']['tabs']}/{r['verify']['tabs']})")
            r2 = A.evaluate("""() => {const n=db.ncrs[0];editNcr(n.id,null,'issue');const pane=k=>document.querySelector('#mf [name='+k+']').closest('.ntp').dataset.p,vis=k=>getComputedStyle(document.querySelector('#mf [name='+k+']').closest('.ntp')).display!=='none';
              const o={p:['notifyYN','notifyDate','notifyMethod'].map(pane).join(''),box:document.querySelector('#noticeBox').closest('.ntp').dataset.p,req:pane('reqType'),a:vis('notifyDate')};
              ncrTab('t');o.t=vis('notifyDate')&&!vis('reqType');o.lab=[...document.querySelectorAll('#ncrTabs [data-t]')].filter(b=>b.style.display!=='none').map(b=>b.textContent.trim().replace(/\\s*\\d+$/,'')).join('|');
              const f=document.querySelector('#mf');f.notifyDate.value='2000-01-01';const r=saveNcr(n.id);o.err=r===null&&document.querySelector('#ncrTabs [data-t=t]').getAttribute('aria-selected')==='true';mfDirty=false;closeModal(true);return o}""")
            ok(r2["p"] == "ttt" and r2["box"] == "t" and r2["req"] == "a" and not r2["a"] and r2["t"], f"NCR 발행 정보: 협력사 통보는 ‘③ 협력사 통보’ 탭에 따로 ({r2['lab']})")
            ok(r2["lab"].startswith("① 발행 정보|② 통보서 내용|③ 협력사 통보|진행 기록") and r2["err"], "탭 순서 · 통보일 오류는 통보 탭으로 이동")
            ok("발행 정보" in r["issue"]["t"] and "협력사 회신" in r["reply"]["t"] and "검증" in r["verify"]["t"], "NCR 창 제목에 단계 이름")
            ok(r["link"], "다른 화면의 NCR 링크(단계 지정 없음): 단계 전환 줄 유지")
            r = A.evaluate("""() => {const n=db.ncrs.find(x=>x.reqType!=='단순 통보')||db.ncrs[0],lab=()=>[...document.querySelector('#mfoot').children].filter(e=>!e.className.includes('mfsp')).map(e=>e.textContent).join(',');
              editNcr(n.id,null,'reply');const rp=lab();mfDirty=false;closeModal(true);editNcr(n.id,null,'verify');const vf=lab();mfDirty=false;closeModal(true);return {rp,vf,info:n.reqType==='단순 통보'}}""")
            ok(r["info"] or r["rp"] == "취소,저장", f"NCR 협력사 회신 창: 아래 단추는 취소 · 저장만 ({r['rp']})")
            ok("8D 출력" in r["vf"] and "RCA" not in r["vf"], f"NCR 검증 창: 8D 출력 있음 ({r['vf']})")
            # 조회 권한: 발행 정보 창에서 통보서 출력 (저장 단추는 없음)
            r = C.evaluate("""async () => {await srvSync();mfDirty=false;closeModal(true);editNcr(db.ncrs[0].id,null,'issue');await new Promise(r=>setTimeout(r,300));
              const v=[...document.querySelectorAll('#mfoot button')].filter(b=>b.style.display!=='none').map(b=>b.textContent.trim());closeModal(true);return v}""")
            ok("통보서 출력" in r and not any("저장" in x or "삭제" in x for x in r), f"조회: NCR 발행 정보 창에 통보서 출력만 ({','.join(r)})")
            # 이슈의 처리 방향: 불량 등록 · RCA · 종결만 (FAR · NCR 은 불량 등록 뒤 단계)
            r = A.evaluate("""async () => {
              mfDirty=false;closeModal(true);const wait=ms=>new Promise(r=>setTimeout(r,ms)),o0=window.askConfirm,out={};
              const n=db.ncrs.find(x=>(x.defectIds||[]).length&&ncrStatus(x)!=='종결'),d=db.defects.find(x=>x.id===n.defectIds[0]);
              const i={id:uid(),no:'ISS-FLOW',title:'업무 순서 시험',at:nowMin(),source:d.source,partNo:d.partNo,qty:1,urg:'보통',owner:'나',logs:[],photos:[],defectIds:[d.id]};db.issues.push(i);const iss0=d.issueId;d.issueId=i.id;
              out.keys=ISS_ROUTES.map(x=>x.k).join();state.tab='issue';state.issRoute='ncr';render();issOpen(i.id);await wait(200);
              out.btns=[...document.querySelectorAll('#modal .isr b')].map(b=>b.textContent).join();out.cta=document.querySelector('#modal .isprev .b.p').textContent;out.guide=document.querySelector('#modal .isprev').innerText.includes('FAR 요청 · NCR 발행은 불량을 등록한 뒤');
              // 불량 등록 창이 이슈 내용으로 열림
              await issRoute(i.id,'defect');await wait(200);out.form={t:document.querySelector('#mt').textContent,part:document.querySelector('#mf [name=partNo]').value,pend:!!issPend};mfDirty=false;closeModal(true);
              // 저장 직후: 이슈에 연결 · 귀책 미정이면 FAR 요청 안내만 (FAR · NCR 창을 바로 열지 않음)
              const d2={...d,id:uid(),ncrId:'',caseId:'',issueId:'',resp:'미정',inv:undefined,ica:undefined,logs:[],photos:[],costs:[],closed:undefined,doneDate:'',status:''};db.defects.push(d2);
              issPend={iid:i.id,route:'defect'};mfDirty=false;closeModal(true);state.issId=null;issAfterDefect(d2);await wait(400);
              out.after={linked:d2.issueId===i.id&&i.defectIds.includes(d2.id),log:(i.logs.slice(-1)[0]||{}).text||'',modal:document.querySelector('#modal').classList.contains('on'),bar:document.querySelector('#actbar').classList.contains('on')?document.querySelector('#actMsg').textContent+'|'+document.querySelector('#actBtn').textContent:''};hideAct();
              // 같은 이슈의 다른 불량에 진행 중인 NCR 이 있을 때 NCR 발행 → 기존 NCR 에 연결할지 물음
              d2.resp='협력사';let asked=[],ans=true;window.askConfirm=async a=>{asked.push(a);return ans};
              await ncrFromDefect(d2.id);await wait(250);out.link={ok:asked[0]&&asked[0].ok,alt:asked[0]&&asked[0].alt,t:document.querySelector('#mt').textContent,cur:ncrCurId===n.id,in:curLinks.includes(d2.id),dirty:mfDirty,saved:(n.defectIds||[]).includes(d2.id)};mfDirty=false;closeModal(true);
              ans=false;asked=[];await ncrFromDefect(d2.id);await wait(200);out.cancel=document.querySelector('#modal').classList.contains('on');
              ans='alt';asked=[];await ncrFromDefect(d2.id);await wait(250);out.alt={newNcr:ncrCurId===null&&document.querySelector('#modal').classList.contains('on'),in:curLinks.includes(d2.id)&&curLinks.length===1};mfDirty=false;closeModal(true);
              // 이슈가 다르면 묻지 않음
              d2.issueId='';asked=[];ans=true;await ncrFromDefect(d2.id);await wait(250);out.other={asked:asked.length,newNcr:ncrCurId===null};mfDirty=false;closeModal(true);
              window.askConfirm=o0;d.issueId=iss0;db.defects=db.defects.filter(x=>x!==d2);db.issues=db.issues.filter(x=>x!==i);state.issRoute='';out.no=n.no;return out}""")
            ok(r["keys"] == "defect,rca,close" and r["btns"] == "불량 등록,RCA 요청,종결", f"이슈 처리 방향: 불량 등록 · RCA 요청 · 종결만 ({r['btns']})")
            ok(r["cta"] == "불량 등록 창 열기" and r["guide"], "이슈: FAR · NCR 은 불량 등록 뒤에 한다고 안내")
            ok("불량 등록" in r["form"]["t"] and r["form"]["part"] and r["form"]["pend"], "이슈 → 불량 등록 창이 이슈 내용으로 열림")
            ok(r["after"]["linked"] and "불량 등록" in r["after"]["log"] and not r["after"]["modal"], f"불량 저장 → 이슈에 연결 · FAR/NCR 창을 바로 열지 않음 ({r['after']['log']})")
            ok("FAR 요청" in r["after"]["bar"], f"귀책 미정이면 다음 단계(FAR 요청) 안내 ({r['after']['bar']})")
            ok(r["link"]["ok"] == r["no"] + "에 연결" and r["link"]["alt"] == "새 NCR 발행", f"NCR 발행: 같은 이슈에 진행 중인 NCR 이 있으면 물음 ({r['link']['ok']} / {r['link']['alt']})")
            ok(r["link"]["cur"] and r["link"]["in"] and r["link"]["dirty"] and not r["link"]["saved"], "기존 NCR 에 연결 → 그 NCR 창이 열리고 연결 목록에 추가 (저장 전)")
            ok(not r["cancel"], "취소 → 아무 것도 열지 않음")
            ok(r["alt"]["newNcr"] and r["alt"]["in"], "새 NCR 발행 → 이 불량만 연결된 새 NCR 창")
            ok(r["other"]["asked"] == 0 and r["other"]["newNcr"], "이슈가 다른 불량은 묻지 않고 새 NCR 창")
            # 새 NCR: 불량 내용 서술에 작성 양식이 기본으로 들어감
            r = A.evaluate("""async () => {
              mfDirty=false;closeModal(true);const wait=ms=>new Promise(r=>setTimeout(r,ms)),o0=window.askConfirm;window.askConfirm=async()=>'alt';const o={};
              const src=db.defects.find(x=>x.partNo&&x.resp!=='미정'&&!x.inv)||db.defects[0],d={...src,id:uid(),ncrId:'',caseId:'',issueId:'',resp:'협력사',inv:undefined,fgNo:'81841-BE100',fgName:'CNTR BAL ASSY',fgQty:2,type:'치수',desc:'구멍 지름 큼',containment:'전수 선별',qty:3,inspQty:2160,logs:[],photos:[],costs:[]};db.defects.push(d);
              await ncrFromDefect(d.id);await wait(250);const v=document.querySelector('#mf [name=defectDesc]').value;o.fromDefect=v;o.dirty=mfDirty;mfDirty=false;closeModal(true);
              editNcr();await wait(150);const ta=document.querySelector('#mf [name=defectDesc]'),f=document.querySelector('#mf');o.blank=ta.value;
              f.basis.value='공정 감사';f.basis.onchange();o.audit=ta.value;f.basis.value='불량';f.basis.onchange();o.back=ta.value===o.blank;
              ta.value='직접 쓴 내용';f.basis.value='공정 감사';f.basis.onchange();o.keep=ta.value;mfDirty=false;closeModal(true);
              const n=db.ncrs[0],old=n.defectDesc;n.defectDesc='';editNcr(n.id,null,'issue');o.existing=document.querySelector('#mf [name=defectDesc]').value;mfDirty=false;closeModal(true);n.defectDesc=old;
              window.askConfirm=o0;db.defects=db.defects.filter(x=>x!==d);return o}""")
            fd = r["fromDefect"].split("\n")
            ok(len(fd) == 5 and fd[0].startswith("1. 발견 일시/장소 (When/Where) : ") and "완성품 81841-BE100 CNTR BAL ASSY 에서 발견 · 2대" in fd[0], f"불량 → NCR: 작성 양식이 기본으로 들어감 ({fd[0]})")
            ok(fd[1] == "2. 불량 현상 (What) : 치수 — 구멍 지름 큼" and fd[2].startswith("3. 발생 수량/범위 (How many) : 3 EA / 2,160 EA 중") and fd[3] == "4. 영향 (Impact) : " and fd[4] == "5. 당사 조치 (Containment) : 전수 선별", "양식의 2~5번이 불량 내용으로 채워짐 (요약 줄 중복 없음)")
            ok(r["blank"].startswith("1. 발견 일시/장소 (When/Where) : \n2. 불량 현상 (What) : ") and r["blank"].count("\n") == 4, "빈 새 NCR 에도 작성 양식이 기본으로")
            ok(r["audit"] == "" and r["back"] and r["keep"] == "직접 쓴 내용", "발행 근거를 바꾸면 손대지 않은 빈 양식만 지움 · 쓴 내용은 그대로")
            ok(r["existing"] == "", "기존 NCR 의 빈 서술 칸은 바꾸지 않음")
            # A3 보고서: 단순 통보 종결 · 대책 승인 뒤에만 출력 단추가 나옴
            r = A.evaluate("""() => {
              mfDirty=false;closeModal(true);const lab=()=>[...document.querySelector('#mfoot').children].filter(e=>!e.className.includes('mfsp')).map(e=>e.textContent).join(',');
              const mk=x=>{const n=Object.assign({id:uid(),issueDate:addDays(today(),-20),supplierId:db.suppliers[0].id,defectIds:[]},x);db.ncrs.push(n);return n},o={},has=(n,m)=>{editNcr(n.id,null,m);const v=lab().includes('A3 보고서');mfDirty=false;closeModal(true);return v};
              const a=mk({no:'A3-INFO',reqType:'단순 통보'});o.info0=has(a,'issue');a.notifyDate=addDays(today(),-19);o.info1=has(a,'issue');
              const b=mk({no:'A3-8D',reqType:'8D 보고서',notifyDate:addDays(today(),-19),requestDate:addDays(today(),-19)});o.d0=has(b,'issue')||has(b,'verify');
              b.replyDate=addDays(today(),-10);b.validity='보완요청';o.d1=has(b,'issue')||has(b,'verify');b.validity='적정';b.approvedDate=addDays(today(),-9);o.d2=has(b,'issue')&&has(b,'verify');
              const d=db.defects.find(x=>!x.deleted&&!x.ncrId)||db.defects[0],keep={ncrId:d.ncrId};
              d.ncrId=b.id;b.validity='';openLog(d.id);o.def0=lab().includes('A3 보고서');mfDirty=false;closeModal(true);b.validity='적정';openLog(d.id);o.def1=lab().includes('A3 보고서');mfDirty=false;closeModal(true);
              d.ncrId=keep.ncrId;db.ncrs=db.ncrs.filter(x=>x!==a&&x!==b);return o}""")
            ok(not r["info0"] and r["info1"], "A3 보고서: 단순 통보는 통보(종결) 뒤에 단추가 나옴")
            ok(not r["d0"] and not r["d1"] and r["d2"], "A3 보고서: 대책서 건은 대책 승인(적정) 뒤에 단추가 나옴")
            ok(not r["def0"] and r["def1"], "불량 진행 창의 A3 보고서도 같은 기준")
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
