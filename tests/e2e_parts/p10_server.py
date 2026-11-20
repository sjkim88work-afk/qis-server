"""화면 시험 — 여러 사용자 · 권한 · 첨부 · 서버 끊김 · 로그인 만료 · 관리 화면
   실행: python tests/e2e_browser.py tests/sample_backup.json --only server"""
import json      # noqa: F401
import os      # noqa: F401
import signal      # noqa: F401
import time      # noqa: F401

from e2e_lib import ROOT, URL, ok, settle, start      # noqa: F401


def run(c):
    A, B, C, tmp, env, b = c.A, c.B, c.C, c.tmp, c.env, c.b
    ok(A.evaluate("db.defects.length") == 5 and A.evaluate("db.ncrs.length") == 2, "서버 데이터 불러옴 (불량 5 · NCR 2)")
    ok("김작성" in A.inner_text("#srvUser") and "작성" in A.inner_text("#srvUser"), "상단에 사용자 · 권한")
    ok("서버 저장" in A.inner_text("#saveInfo") or A.inner_text("#saveInfo") == "", "저장 표시: " + A.inner_text("#saveInfo"))
    ok(A.locator("#nav button:has-text('설정')").count() == 0 and B.locator("#nav button:has-text('설정')").count() == 1,
       "설정 탭은 관리자만")
    B.evaluate("setS('company','한빛오토 품질','str')"); settle(B, 1000)
    A.evaluate("srvSync()"); settle(A, 700)
    ok(A.evaluate("db.settings.company") == "한빛오토 품질", "관리자가 바꾼 설정 → 작성자 화면 반영")
    ok("관리자만" not in A.inner_text("#toast"), "작성자 화면에 설정 거부 안내 없음")

    # --- 1. 작성자 A 가 불량 수정 → B 에 반영 ---
    A.evaluate("()=>{const d=db.defects.find(x=>x.id==='d1');d.qty=12;touch(d);save()}")
    settle(A, 1200)
    B.evaluate("srvSync()"); settle(B, 800)
    ok(B.evaluate("db.defects.find(x=>x.id==='d1').qty") == 12, "A 수정 → B 화면에 반영")
    ok("김작성" in B.inner_text("#toast"), "받아온 변경 안내: " + B.inner_text("#toast"))

    # --- 2. 동시 수정 (다른 항목) → 둘 다 남음 ---
    A.evaluate("()=>{clearInterval();const d=db.defects.find(x=>x.id==='d2');d.lot='LOT-A';touch(d)}")
    B.evaluate("()=>{const d=db.defects.find(x=>x.id==='d2');d.disposition='폐기';touch(d)}")
    A.evaluate("srvSync()"); settle(A, 600)
    B.evaluate("srvSync()"); settle(B, 600)
    A.evaluate("srvSync()"); settle(A, 600)
    a2, b2 = A.evaluate("db.defects.find(x=>x.id==='d2')"), B.evaluate("db.defects.find(x=>x.id==='d2')")
    ok(a2["lot"] == "LOT-A" and a2["disposition"] == "폐기" and b2["lot"] == "LOT-A" and b2["disposition"] == "폐기",
       "동시 수정(다른 항목): 두 사람 변경 모두 반영")

    # --- 3. 같은 항목 동시 수정 → 나중 저장 + 안내 ---
    A.evaluate("()=>{const d=db.defects.find(x=>x.id==='d3');d.qty=30;touch(d)}")
    B.evaluate("()=>{const d=db.defects.find(x=>x.id==='d3');d.qty=40;touch(d)}")
    A.evaluate("srvSync()"); settle(A, 600)
    B.evaluate("srvSync()"); settle(B, 700)
    ok("먼저 고쳤습니다" in B.inner_text("#toast"), "같은 항목 동시 수정 안내: " + B.inner_text("#toast"))
    A.evaluate("srvSync()"); settle(A, 600)
    ok(A.evaluate("db.defects.find(x=>x.id==='d3').qty") == 40, "같은 항목은 나중 저장 값으로 통일")

    # --- 4. 새 불량 등록 · 삭제 ---
    A.evaluate("()=>{db.defects.push(touch({id:'dnew',date:'2026-11-02',partNo:'P-NEW',qty:1,photos:[],supplierId:'s1'}));save()}")
    settle(A, 1000); B.evaluate("srvSync()"); settle(B, 600)
    ok(B.evaluate("!!db.defects.find(x=>x.id==='dnew')"), "새 등록 → B 반영")
    B.evaluate("()=>{removeRec('defects','dnew');save()}"); settle(B, 1000)
    A.evaluate("srvSync()"); settle(A, 600)
    ok(not A.evaluate("!!db.defects.find(x=>x.id==='dnew')"), "삭제 → A 반영")

    # --- 4b. 이슈 (0.6.0): A 등록 · 사진 → B 반영 · 기록 추가 → A 반영 ---
    A.evaluate("()=>{window.askConfirm=async()=>true;go('issue');editIssue()}"); settle(A, 300)
    A.fill("#mf [name=title]", "서버 이슈 시험")
    A.check("#mf [name=contain]"); A.fill("#mf [name=containText]", "재공 보류")
    A.evaluate("()=>{curPhotos.push({id:'iph1',name:'i.jpg',caption:'',data:'data:image/jpeg;base64,AAAA',thumb:'data:image/jpeg;base64,AAAA',createdAt:now(),isNew:true})}")
    A.evaluate("saveIssue(null,true)"); settle(A, 1500)
    iid = A.evaluate("(db.issues.find(i=>i.title==='서버 이슈 시험')||{}).id")
    ok(bool(iid) and A.evaluate("state.tab") == "issue", "이슈 등록 (작성자)")
    B.evaluate("srvSync()"); settle(B, 800)
    ok(B.evaluate("i=>{const x=db.issues.find(y=>y.id===i);return !!x&&x.logs.length===2&&x.photos[0]==='iph1'}", iid), "이슈 → B 반영 (기록 · 사진 목록)")
    ok(B.evaluate("photoGetMany(['iph1']).then(a=>a.length)") == 1, "B: 이슈 사진을 서버에서 읽음")
    B.evaluate("i=>{issLog(issById(i),'회의','B 기록',{who:'생산팀'});touch(issById(i));save()}", iid); settle(B, 1000)
    A.evaluate("srvSync()"); settle(A, 800)
    ok(A.evaluate("i=>issById(i).logs.some(l=>l.text==='B 기록')&&issStatus(issById(i))==='조사 중'", iid), "B 기록 → A 반영 · 조사 중")
    C.evaluate("srvSync()"); settle(C, 500); C.evaluate("go('issue')"); settle(C, 300)
    ok(C.locator("#view button:has-text('이슈 등록'):visible").count() == 0 and "서버 이슈 시험" in C.inner_text("#view"), "조회: 이슈 보기만 (등록 버튼 없음)")
    # 이슈 삭제: 조회는 삭제 버튼 없음 · 작성자 삭제 → 사진 휴지통 · 연결된 불량은 남고 연결만 끊김 · B 반영
    C.evaluate("i=>issOpen(i)", iid); settle(C, 300)
    ok(" 이슈" in C.locator("#modal.on #mt").inner_text() and C.locator("#modal.on #logBox ul.logs").count() == 1 and C.locator("#modal.on #logBox .lgc").count() == 0 and C.locator("#modal.on #logBox ul.logs a.lk").count() == 0, "이슈 상세는 창(팝업)으로 열림 · 조회 권한은 기록 작성 칸 · 수정 단추 없음")
    ok(C.locator("#modal button:has-text('삭제'):visible").count() == 0, "조회: 이슈 삭제 버튼 없음")
    C.evaluate("closeModal()"); settle(C, 200)
    ok(C.evaluate("state.issId===null && !document.querySelector('#modal').classList.contains('on')"), "상세 창 닫기 → 목록")
    A.evaluate("i=>{const d={id:'diss',date:today(),partNo:'P-ISS',qty:1,photos:[],issueId:i};db.defects.push(touch(d));issById(i).defectIds=['diss'];touch(issById(i));save()}", iid); settle(A, 1200)
    A.evaluate("i=>issOpen(i)", iid); settle(A, 300)
    ok(A.locator("#mfoot button:has-text('삭제'):visible").count() == 1, "작성자: 이슈 상세에 삭제 버튼")
    # 상세 창에서 기록 추가 → 창이 그대로 열린 채 갱신 · 수정 창을 닫으면 상세로 돌아옴
    A.fill("#lgText", "창에서 쓴 기록"); A.click("#modal .lgc button.p:has-text('저장')"); settle(A, 400)
    ok(A.locator("#modal.on").count() == 1 and "창에서 쓴 기록" in A.inner_text("#modal ul.logs"), "상세 창에서 기록 추가 → 창 유지 · 갱신")
    ok(A.evaluate("i=>{const l=issById(i).logs.find(x=>x.text==='창에서 쓴 기록');return !!l&&l.date===today()&&/^\\d\\d:\\d\\d$/.test(l.time)&&l.party===''&&l.result===''&&!('who' in l)&&!('rec' in l)}", iid), "이슈 기록은 공통 구조로 저장 (date · time · party · result)")
    # 기록 수정: 이슈는 사유 없이도 저장 · 사유를 적으면 이력에 남음 · 수정 전 내용 보관
    A.click("#modal ul.logs li:has-text('창에서 쓴 기록') a:text-is('수정')"); settle(A, 300)
    A.fill("#leText", "창에서 쓴 기록 (고침)"); A.click("#modal ul.logs li.ed button.p"); settle(A, 400)
    ok(A.evaluate("i=>{const l=issById(i).logs.find(x=>x.text==='창에서 쓴 기록 (고침)');return !!l&&l.hist.length===1&&l.hist[0].reason===''&&l.hist[0].text==='창에서 쓴 기록'}", iid), "기록 수정: 사유 없이 저장 · 수정 전 내용 보관")
    A.click("#modal ul.logs li:has-text('창에서 쓴 기록 (고침)') a:text-is('수정')"); settle(A, 300)
    A.fill("#leText", "창에서 쓴 기록 (두 번 고침)"); A.fill("#leReason", "오타 수정"); A.click("#modal ul.logs li.ed button.p"); settle(A, 400)
    A.click("#modal ul.logs li:has-text('두 번 고침') a:has-text('이력')"); settle(A, 200)
    ok(A.evaluate("i=>{const l=issById(i).logs.find(x=>x.text==='창에서 쓴 기록 (두 번 고침)');return !!l&&l.hist.length===2&&l.hist[1].reason==='오타 수정'}", iid) and "수정 2회" in A.inner_text("#modal ul.logs") and "오타 수정" in A.inner_text("#modal ul.logs"), "기록 수정: 사유가 이력에 남고 화면에 표시")
    A.click("#modal ul.logs li:has-text('두 번 고침') a:text-is('수정')"); settle(A, 300); A.click("#modal ul.logs li.ed button.p"); settle(A, 300)
    ok(A.evaluate("i=>issById(i).logs.find(x=>x.text==='창에서 쓴 기록 (두 번 고침)').hist.length===2", iid), "바꾼 것 없이 저장 → 이력 늘지 않음")
    A.click("#mfoot button:has-text('수정')"); settle(A, 300)
    ok(A.locator("#mt").inner_text().endswith("수정"), "상세 → 수정 창")
    A.evaluate("closeModal(true)"); settle(A, 300)
    ok(A.locator("#modal.on #logBox ul.logs").count() == 1, "수정 창 닫기 → 상세 창으로 돌아옴")
    # 창 아래 단추: 삭제는 왼쪽 끝에 따로 · 상세 창에 저장 단추 · 삭제는 확인을 물음
    r = A.evaluate("""() => {const k=[...document.querySelector('#mfoot').children],lab=k.map(e=>e.className.includes('mfsp')?'|':e.textContent).join(','),
      d=k[0].getBoundingClientRect(),n=k[2].getBoundingClientRect();return {lab,gap:n.left-d.right,tx:document.querySelector('#lgText').value}}""")
    ok(r["lab"] == "삭제,|,수정,닫기,저장" and r["gap"] > 100, f"이슈 상세: 삭제는 왼쪽 끝 · 저장 단추 있음 ({r['lab']}, 간격 {round(r['gap'])}px)")
    ok(r["tx"] == "", "기록 추가 후 입력 칸 비움")
    r2 = A.evaluate("""() => {const b=[...document.querySelectorAll('#modal .lgc .cf button')].map(x=>x.textContent).join(),lab=[...document.querySelectorAll('#modal .lgc label')].map(x=>x.textContent.trim().slice(0,12)).join('|');
      document.querySelector('#lgText').value='지울 내용';document.querySelector('#lgParty').value='누구';lgClear();return {b,lab,v:document.querySelector('#lgText').value+document.querySelector('#lgParty').value,on:document.querySelector('#modal').classList.contains('on'),dirty:mfDirty}}""")
    ok(r2["b"] == "취소,저장" and r2["v"] == "" and r2["on"] and not r2["dirty"], f"이슈 기록 작성 칸: 취소 · 저장 ({r2['b']})")
    ok("방법" in r2["lab"] and "결과 · 합의 사항" in r2["lab"] and "상대방 · 참석" in r2["lab"] and "내용 *" in r2["lab"], f"이슈 기록 작성 칸: 방법 · 결과 · 합의 사항 칸이 있음 ({r2['lab']})")
    r = A.evaluate("""async i => {const o=window.askConfirm;let n=0;window.askConfirm=async()=>{n++;return false};
      document.querySelector('#mfoot button.d').click();await new Promise(r=>setTimeout(r,300));window.askConfirm=o;return {n,alive:!!issById(i)}}""", iid)
    ok(r["n"] == 1 and r["alive"], "이슈 삭제: 확인을 묻고, 취소하면 지우지 않음")
    A.fill("#lgText", "저장 단추로 쓴 기록"); A.click("#mfoot button.p"); settle(A, 500)
    ok(A.evaluate("i=>!document.querySelector('#modal').classList.contains('on')&&issById(i).logs.filter(x=>x.text==='저장 단추로 쓴 기록').length===1", iid), "이슈 상세 저장 단추: 쓰던 기록 저장 후 창 닫음")
    r = A.evaluate("""() => {const lab=()=>[...document.querySelector('#mfoot').children].map(e=>e.className.includes('mfsp')?'|':e.textContent).join(',');
      editDefect(db.defects[0].id);const d=lab();mfDirty=false;closeModal(true);editNcr(db.ncrs[0].id,null,'issue');const n=lab();mfDirty=false;closeModal(true);return {d,n}}""")
    ok(r["d"] == "삭제,|,취소,저장" and r["n"].startswith("삭제,|,"), f"불량 · NCR 창: 삭제는 왼쪽 끝에 따로 · 불량 창은 취소 · 저장만 ({r['d']} / {r['n']})")
    A.evaluate("i=>issOpen(i)", iid); settle(A, 300)
    A.click("#mfoot button:has-text('삭제')"); settle(A, 1500)
    ok(A.evaluate("i=>!issById(i)&&state.issId===null", iid), "이슈 삭제 → 목록으로")
    ok(A.evaluate("()=>{const d=db.defects.find(x=>x.id==='diss');return !!d&&!d.issueId}"), "연결된 불량은 남고 이슈 연결만 끊김")
    B.evaluate("srvSync()"); settle(B, 800)
    ok(B.evaluate("i=>!issById(i)", iid), "이슈 삭제 → B 반영")
    ok(not A.evaluate("srvApi('/api/files/ids').then(j=>j.ids.includes('iph1'))"), "이슈 사진도 삭제 (서버 휴지통)")
    A.evaluate("()=>{removeRec('defects','diss');save()}"); settle(A, 800)

    # --- 5. 권한: 작성자는 기준정보 삭제 · 설정 불가 ---
    A.evaluate("delSup('s1')"); settle(A, 300)
    ok("관리자만" in A.inner_text("#toast"), "작성자: 협력사 삭제 → 관리자만")
    A.evaluate("()=>{db.settings.sevA=4;save()}"); settle(A, 1200)
    ok(A.evaluate("db.settings.sevA") == 12, "작성자가 설정을 바꿔도 서버가 거부 → 되돌림")
    A.evaluate("()=>{db.suppliers.find(s=>s.id==='s1').addr='평택';touch(db.suppliers.find(s=>s.id==='s1'));save()}"); settle(A, 1000)
    B.evaluate("srvSync()"); settle(B, 600)
    ok(B.evaluate("db.suppliers.find(s=>s.id==='s1').addr") == "평택", "작성자: 협력사 정보 수정은 가능")

    # --- 6. 조회 권한 ---
    ok(C.locator(".roBar").count() == 1 and "조회 권한" in C.inner_text(".roBar"), "조회: 안내 줄")
    C.evaluate("go('defect')"); settle(C, 300)
    ok(C.locator("#view button:has-text('불량 등록'):visible").count() == 0, "조회: 등록 버튼 없음")
    C.evaluate("()=>{db.defects[0].qty=999;save()}"); settle(C, 800)
    C.evaluate("srvSync()"); settle(C, 500)
    B.evaluate("srvSync()"); settle(B, 500)
    ok(B.evaluate("db.defects.find(x=>x.id==='d1').qty") == 12, "조회 사용자는 저장 안 됨")

    # --- 7. 첨부: 기존 사진 · 통보서 파일 ---
    ok(C.evaluate("photoGetMany(['ph1']).then(a=>a.length)") == 1, "가져온 사진을 서버에서 읽음")
    D = os.path.join(tmp, "f"); os.makedirs(D)
    open(os.path.join(D, "통보서.pdf"), "wb").write(b"%PDF-1.4\n%%EOF\n")
    A.evaluate("editNcr('n1',null,'issue')"); settle(A, 600)
    A.set_input_files("#noticeBox input[type=file]", [os.path.join(D, "통보서.pdf")]); settle(A, 600)
    A.evaluate("saveNcr('n1')"); settle(A, 1500)
    A.evaluate("closeModal(true)")
    ids = A.evaluate("db.ncrs.find(n=>n.id==='n1').noticeDocs")
    ok(ids and len(ids) == 1, "NCR에 통보서 첨부 저장")
    B.evaluate("srvSync()"); settle(B, 700)
    ok(B.evaluate("db.ncrs.find(n=>n.id==='n1').noticeDocs||[]") == ids, "B: NCR 첨부 목록 반영")
    ok(B.evaluate("ids=>photoGetMany(ids).then(a=>a[0]&&a[0].name)", ids) == "통보서.pdf", "B: 첨부 파일 내용 열람")
    fpath = os.path.join(tmp, "data", "files", ids[0][:2], ids[0] + ".json")
    ok(os.path.exists(fpath), "첨부는 서버 files 폴더에 저장")

    # --- 8. 서버 끊김 → 변경 보관 → 다시 연결되면 저장 ---
    c.srv.send_signal(signal.SIGTERM); c.srv.wait(5)
    A.evaluate("()=>{const d=db.defects.find(x=>x.id==='d4');d.qty=44;touch(d);save()}")
    settle(A, 1500)
    ok("연결할 수 없습니다" in A.inner_text("#alertBar") and A.is_visible("#alertBar"), "서버 끊김 안내 줄")
    ok("끊김" in A.inner_text("#saveInfo"), "저장 표시: " + A.inner_text("#saveInfo"))
    c.srv = start(env)
    A.evaluate("srvSync()"); settle(A, 1000)
    ok(not A.is_visible("#alertBar"), "다시 연결 → 안내 줄 사라짐")
    B.evaluate("srvSync()"); settle(B, 700)
    ok(B.evaluate("db.defects.find(x=>x.id==='d4').qty") == 44, "끊긴 동안 고친 내용이 다시 연결 후 저장됨")

    # --- 9. 로그인 만료 ---
    import sqlite3
    con = sqlite3.connect(os.path.join(tmp, "data", "qis.db"))
    con.execute("DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE username='kim')"); con.commit(); con.close()
    A.evaluate("()=>{const d=db.defects.find(x=>x.id==='d5');d.qty=55;touch(d);save()}"); settle(A, 1200)
    ok("로그인이 만료" in A.inner_text("#alertBar"), "로그인 만료 안내 (변경은 창에 보관)")
    ok(A.evaluate("srvUnsaved()") is True, "로그인 만료 중 보내지 못한 변경 → 창 닫기 확인 대상")
    ctx2 = A.context.new_page()
    ctx2.goto(URL + "/login"); ctx2.fill("#u", "kim"); ctx2.fill("#p", "Qk1m2026b"); ctx2.click("#b"); settle(ctx2, 800)
    ctx2.close()
    A.evaluate("srvState.expired=false;srvSync()"); settle(A, 1000)
    B.evaluate("srvSync()"); settle(B, 700)
    ok(B.evaluate("db.defects.find(x=>x.id==='d5').qty") == 55, "다시 로그인 → 보관된 변경 저장")

    # --- 10. 관리 화면 ---
    M = B.context.new_page()
    M.goto(URL + "/admin"); settle(M, 800)
    ok("김작성" in M.inner_text("#view") and "이조회" in M.inner_text("#view"), "관리: 사용자 목록")
    M.click("nav button:has-text('변경 이력')"); settle(M, 800)
    t = M.inner_text("#view")
    ok("수정" in t and "qty" in t and "로그인" in t, "관리: 변경 이력 (수정 · 로그인)")
    ok("동시 수정" in t, "관리: 동시 수정 표시")
    M.fill("input[placeholder^='검색']", "QNCN"); M.dispatch_event("input[placeholder^='검색']", "change")
    M.click("button:has-text('조회')"); settle(M, 600)
    ok("QNCN-2026-002" in M.inner_text("#view"), "관리: NCR 번호로 이력 검색")
    M.screenshot(path=os.path.join(os.environ.get("SHOT_DIR", tmp), "admin_audit.png"), full_page=False)
    M.click("nav button:has-text('백업')"); settle(M, 500)
    M.click("button:has-text('지금 백업')"); settle(M, 1500)
    ok("qis_" in M.inner_text("#view"), "관리: 지금 백업")
    ok(os.listdir(os.path.join(tmp, "data", "backup", "db")), "백업 파일 생성")
    # 알림 (텔레그램) — 텔레그램 서버는 브라우저에서 흉내낼 수 없으므로 설정 · 미리 보기 · 토큰 비노출만
    M.click("nav button:has-text('알림')"); settle(M, 600)
    ok("봇 토큰" in M.inner_text("#view") and "받을 곳" in M.inner_text("#view"), "관리: 알림 (텔레그램) 화면")
    M.fill("#tgTok", "123:SECRET"); M.click("#tgTok ~ button"); settle(M, 700)
    ok("저장됨" in M.inner_text("#view") and "123:SECRET" not in M.content(), "관리: 토큰 저장 — 화면에 다시 내려오지 않음")
    M.fill("#tgChat", "-100777"); M.click("#tgChat ~ button"); settle(M, 700)
    M.click("button:has-text('미리 보기')"); settle(M, 700)
    ok("아침 품질 요약" in M.inner_text("#tgPrev"), "관리: 아침 요약 미리 보기")
    ok("123:SECRET" not in B.evaluate("JSON.stringify(db)"), "작성자 화면 데이터에 토큰 없음")
    # 사용자 추가
    M.click("nav button:has-text('사용자')"); settle(M, 500)
    M.fill("#nu", "park"); M.fill("#nn", "박신규"); M.fill("#np", "Qp4rk2026"); M.click("button:has-text('추가')"); settle(M, 800)
    ok("박신규" in M.inner_text("#view"), "관리: 사용자 추가")
    # 작성자는 관리 화면 못 들어감
    A2 = A.context.new_page(); A2.goto(URL + "/admin"); settle(A2, 500)
    ok(not A2.url.endswith("/admin"), "작성자: 관리 화면 접근 불가")
    A2.close()

    # --- 11. 화면 상태 ---
    A.evaluate("go('ncr')"); settle(A, 400)
    A.screenshot(path=os.path.join(os.environ.get("SHOT_DIR", tmp), "app_editor.png"))
    C.screenshot(path=os.path.join(os.environ.get("SHOT_DIR", tmp), "app_viewer.png"))
    B.evaluate("()=>{state.setTab='backup';go('data')}"); settle(B, 400)
    ok("사내 서버" in B.inner_text("#view"), "관리자 설정 › 데이터: 서버 안내")
    B.screenshot(path=os.path.join(os.environ.get("SHOT_DIR", tmp), "app_admin_data.png"))
