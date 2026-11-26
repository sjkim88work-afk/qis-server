"""화면 시험 — 신속대응(QRQC): 등록 · Exit Criteria 항목 · 조치 기록 · 권한 · 회의록
   실행: python tests/e2e_browser.py tests/sample_backup.json --only qrqc"""
from e2e_lib import logform, ok, settle


def run(c):
    A, C = c.A, c.C
    # 메뉴 · 등록
    r = A.evaluate("""async () => {
      mfDirty=false;closeModal(true);const wait=ms=>window.__settle(ms),q=s=>document.querySelector(s),o={};
      go('qrqc');await wait(200);
      o.nav=[...document.querySelectorAll('#nav button')].map(b=>b.textContent.trim().replace(/\\s*\\d+$/,''));
      o.add=!!q('button[onclick="editQrqc()"]');const n0=db.qrqcs.length;
      editQrqc();await wait(150);
      saveQrqc();await wait(100);o.need=db.qrqcs.length===n0;      // 품명 · 발견장소 · 문제내용이 비면 저장 안 됨
      const f=q('#mf');f.date.value=addDays(today(),-9);f.part.value='프론트 도어래치';f.model.value='NE1';f.line.value='도어래치 조립 2라인';
      f.issue.value='스트라이커 체결부 간섭으로 래치 걸림 불량';f.action.value='봉쇄: 선별 후 양품 투입';
      saveQrqc();await wait(400);
      const x=db.qrqcs[db.qrqcs.length-1];o.id=x.id;o.no=x.no;o.n=db.qrqcs.length-n0;
      o.crit=Object.keys(x.crit).length;o.log=x.logs.map(l=>l.kind+(l.sys?'*':''));
      o.modal=q('#modal').classList.contains('on')&&q('#modal').dataset.qq===x.id;o.title=q('#mt').textContent;
      o.cards=document.querySelectorAll('#modal button.qqc').length;
      o.ov=qqOverall(x);o.over=QQ_CRIT.filter(k=>qqOver(x,k)).map(k=>k.k).join();o.plan=qqPlan(x,QQ_CK.ll)===addDays(x.date,14);
      return o}""")
    ok("신속대응" in r["nav"] and r["nav"].index("신속대응") == r["nav"].index("이슈") + 1 and r["add"], "신속대응 메뉴 — 이슈 다음에 있고 작성 권한은 등록 단추가 보임")
    ok(r["need"], "신속대응 등록: 필수 칸이 비면 저장하지 않음")
    ok(r["n"] == 1 and r["no"].startswith("QRQC-") and r["crit"] == 9 and r["log"] == ["등록*"], f"등록 → 번호 {r['no']} · Exit Criteria 9개 · ‘등록’ 기록")
    ok(r["modal"] and r["cards"] == 9 and r["no"] in r["title"], f"저장하면 상세 창이 열림 ({r['title']})")
    ok(r["ov"] == "R" and r["over"].startswith("cont,rca") and r["plan"], f"계획일(발견일자 기준)을 넘긴 항목은 R ({r['over']})")
    qid = r["id"]

    # Exit Criteria 한 항목: 상태 G → 완료일자 · 확인자 채움, 첨부, 항목 저장 → ‘상태 변경’ 기록
    A.click("#modal button.qqc >> nth=0")
    settle(A, 300)
    A.click("#qqEd button.qqsb >> nth=2")
    settle(A, 300)
    A.fill("#qqNote", "의심 LOT 300개 격리 · 전수 선별 완료")
    px = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0500f00048501"
                       "80849a8c210000000049454e44ae426082")
    A.set_input_files("#qqEd input[type=file]", [
        {"name": "현장.png", "mimeType": "image/png", "buffer": px},
        {"name": "개선보고.pptx", "mimeType": "application/vnd.openxmlformats-officedocument.presentationml.presentation", "buffer": b"PK pptx body"},
    ])
    A.wait_for_function("()=>document.querySelectorAll('#qqFiles .t').length===2", timeout=8000)
    r = A.evaluate("()=>({s:state.qqDraft.s,done:state.qqDraft.done===today(),chk:!!state.qqDraft.checker,ph:state.qqDraft.photos.length,doc:document.querySelectorAll('#qqFiles .t.dc').length,"
                   "saved:qqS(qqById(state.qqId),'cont'),dirty:mfDirty})")
    ok(r["s"] == "G" and r["done"] and r["chk"], "항목을 G 로 바꾸면 완료일자 · 확인자가 채워짐")
    ok(r["ph"] == 2 and r["doc"] == 1 and r["saved"] == "R" and r["dirty"], "첨부(사진 · 파워포인트) 2개 — [항목 저장] 전에는 기록에 반영하지 않음")
    A.click("#qqEd button.p")
    settle(A, 600)
    r = A.evaluate("""(id)=>{const x=qqById(id),c=x.crit.cont,l=x.logs[x.logs.length-1];
      return {s:c.s,note:c.note,ph:c.photos.length,log:l.kind+':'+l.text,sys:!!l.sys,ed:!!document.querySelector('#qqEd'),on:document.querySelector('#modal').dataset.qq===id,
        cont:qqContWait(x),badge:document.querySelector('#modal button.qqc .qqs').textContent}}""", qid)
    ok(r["s"] == "G" and r["ph"] == 2 and "격리" in r["note"] and not r["ed"] and r["on"], "항목 저장 → 상태 · 상세내용 · 첨부가 남고 칸이 접힘 (상세 창은 그대로)")
    ok(r["log"].startswith("상태 변경:24HR 봉쇄조치: R → G") and r["sys"] and not r["cont"] and r["badge"] == "G", f"상태가 바뀌면 조치 · 진행 기록에 남음 ({r['log']})")

    # 조치 · 진행 기록 (공통 기록 부품) — 바로 저장되고 상세 창이 유지됨
    logform(A)
    A.fill("#lgText", "협력사에 불량 시료 5개 전달")
    A.fill("#lgResult", "귀책 인정")
    A.evaluate("addLog()")
    settle(A, 600)
    r = A.evaluate("""(id)=>{const x=qqById(id),l=x.logs[x.logs.length-1];
      return {n:qqLogN(x),text:l.text,res:l.result,kind:l.kind,on:document.querySelector('#modal').dataset.qq===id,shown:document.querySelector('#logBox').innerText.includes('불량 시료 5개')}}""", qid)
    ok(r["n"] == 1 and r["text"] == "협력사에 불량 시료 5개 전달" and r["res"] == "귀책 인정" and r["kind"] in ("현장 조치",), f"조치 · 진행 기록 추가 ({r['kind']})")
    ok(r["on"] and r["shown"], "기록을 남겨도 상세 창이 그대로 있고 목록에 보임")

    # 목록(추적표) · 대시보드 · 회의록 · 번호
    r = A.evaluate("""async (id)=>{mfDirty=false;closeModal(true);const wait=ms=>window.__settle(ms),o={};await wait(200);
      const x=qqById(id);o.closed=!document.querySelector('#modal').classList.contains('on')&&state.qqId==null;
      const tr=[...document.querySelectorAll('table.qqt tbody tr')].find(t=>t.innerText.includes(x.no));
      o.cells=tr?tr.querySelectorAll('td.qqcc').length:0;o.first=tr?tr.querySelector('td.qqcc .qqs').textContent:'';o.rec=tr?tr.innerText.includes('기록 1건'):false;
      o.badge=qqRedN();o.dash=qqDashItems().includes(x.no);o.next=genDocNo('qrqc',x.date).no!==x.no;
      let copied='';const o0=navigator.clipboard.writeText;try{navigator.clipboard.writeText=async t=>{copied=t}}catch(e){}
      Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{copied=t}},configurable:true});
      await qqMinutes();o.min=copied.includes('신속대응회의')&&copied.includes(x.no)&&copied.includes('원인분석')&&copied.includes('불량 시료 5개');
      // 실제 완료일자를 넣으면 종결
      editQrqc(id);await wait(150);document.querySelector('#mf').ac.value=today();saveQrqc(id);await wait(400);
      o.done=qqDone(x)&&qqOverall(x)==='G'&&x.logs.some(l=>l.kind==='종결');mfDirty=false;closeModal(true);await wait(100);
      state.qqf.status='open';render();await wait(100);o.hidden=![...document.querySelectorAll('table.qqt tbody tr')].some(t=>t.innerText.includes(x.no));
      state.qqf.status='';render();await wait(100);return o}""", qid)
    ok(r["closed"] and r["cells"] == 9 and r["first"] == "G" and r["rec"], "추적표 한 줄에 항목 9칸 · 기록 수가 보임")
    ok(r["badge"] >= 1 and r["dash"], "계획일을 넘긴 건은 메뉴 숫자 · 대시보드 ‘오늘 챙길 일’에 나옴")
    ok(r["next"] and r["min"], "다음 번호는 겹치지 않고, 회의록 복사에 R 항목 · 오늘 기록이 들어감")
    ok(r["done"] and r["hidden"], "실제 완료일자를 넣으면 종결(G) · ‘종결’ 기록 · 진행 중 목록에서 빠짐")

    # 서버 저장 → 조회 권한 화면: 보이지만 고칠 수 없음
    A.evaluate("srvSync()")
    settle(A, 1500)
    C.evaluate("srvSync()")
    settle(C, 1500)
    r = C.evaluate("""async (id)=>{const wait=ms=>window.__settle(ms),o={};go('qrqc');state.qqf={status:'',ov:'',q:''};render();await wait(200);
      o.has=!!qqById(id);o.add=!!document.querySelector('button[onclick="editQrqc()"]');
      qqOpen(id,'cont');await wait(600);o.foot=[...document.querySelectorAll('#mfoot button')].map(b=>b.textContent).join();
      o.dis=document.querySelector('#qqNote').disabled&&[...document.querySelectorAll('#qqEd button.qqsb')].every(b=>b.disabled);
      o.files=document.querySelectorAll('#qqFiles .t').length;o.pick=!document.querySelector('#qqEd input[type=file]');o.form=!document.querySelector('#lgText')&&!document.querySelector('#lgOpenBtn');
      mfDirty=false;closeModal(true);return o}""", qid)
    ok(r["has"] and not r["add"], "조회 권한: 신속대응 건이 보이고 등록 단추는 없음")
    ok(r["dis"] and r["pick"] and r["files"] == 2 and r["form"] and "저장" not in r["foot"] and "삭제" not in r["foot"], f"조회 권한: 항목 · 기록을 볼 수만 있음 (단추: {r['foot']})")

    # 삭제 → 되돌리기
    r = A.evaluate("""async (id)=>{const wait=ms=>window.__settle(ms),o={},n0=db.qrqcs.length;await delQrqc(id);await wait(300);
      o.gone=db.qrqcs.length===n0-1&&!qqById(id);await doUndo();await wait(400);o.back=!!qqById(id)&&qqById(id).crit.cont.photos.length===2;
      await delQrqc(id);await wait(300);hideUndo();save();return o}""", qid)
    ok(r["gone"] and r["back"], "삭제 → 되돌리기로 항목 · 첨부까지 돌아옴")
