"""화면 시험 — 이슈: 처리 방향 · 일시 · 기록 첨부
   실행: python tests/e2e_browser.py tests/sample_backup.json --only issue"""
import json      # noqa: F401
import os      # noqa: F401
import signal      # noqa: F401
import time      # noqa: F401

from e2e_lib import ROOT, URL, ok, settle, start      # noqa: F401


def run(c):
    A, B, C, tmp, env, b = c.A, c.B, c.C, c.tmp, c.env, c.b
    # 이슈의 처리 방향: 불량 등록 · RCA · 종결만 (FAR · NCR 은 불량 등록 뒤 단계)
    r = A.evaluate("""async () => {
      mfDirty=false;closeModal(true);const wait=ms=>window.__settle(ms),o0=window.askConfirm,out={};
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

    # 일시: 날짜는 필수 · 시간은 선택 (오전 · 오후 · 야간 · 시간 모름) · 같은 날 순서 바꾸기
    r = A.evaluate("""async () => {const wait=ms=>window.__settle(ms),o={},q=s=>document.querySelector(s),o0=window.askConfirm;window.askConfirm=async()=>true;
      mfDirty=false;closeModal(true);go('issue');editIssue();await wait(150);
      o.form=!!q('#iatD')&&!!q('#iatB')&&!!q('#iatT')&&!document.querySelector('#mf input[type=datetime-local]');
      q('#mf [name=title]').value='시간 선택 시험';const n0=db.issues.length;
      q('#iatD').value='';saveIssue(null,false);await wait(150);o.needDate=db.issues.length===n0;
      q('#iatD').value='2026-11-10';q('#iatB').value='야간';dtpBand('iat');o.hid=q('#iatT').style.display==='none';
      saveIssue(null,false);await wait(300);const i=db.issues.find(x=>x.title==='시간 선택 시험');o.at=i.at;o.band=i.band;o.show=issAt(i.at,i.band);
      o.log0=i.logs[0].at+'/'+i.logs[0].band;
      issOpen(i.id);await wait(200);
      const add=async(b,t,tx)=>{q('#isAtD').value='2026-11-10';q('#isAtB').value=b;dtpBand('isAt');if(t)q('#isAtT').value=t;q('#isTx').value=tx;issAddLog(i.id);await wait(120)};
      await add('?','','모름');await add('','14:20','시각');await add('오전','','오전');await add('오후','','오후');
      const L=()=>[...document.querySelectorAll('#modal ol.isl li')].map(li=>li.querySelector('div').innerText.trim().split('\\n').pop()).join('>');
      const rec=t=>i.logs.find(l=>l.text===t);
      o.saved=[rec('모름').at,rec('모름').band||'',rec('시각').at,rec('오전').at+rec('오전').band].join();
      o.order=[...i.logs].sort(issCmp).map(l=>l.text).join('>');o.cells=[...document.querySelectorAll('#modal ol.isl li>.mono')].map(e=>e.textContent).join('|');
      o.mv=document.querySelectorAll('#modal ol.isl .mv').length;
      issMove(i.id,i.logs.indexOf(rec('모름')),-1);await wait(150);o.order2=[...i.logs].sort(issCmp).map(l=>l.text).join('>');
      issLog(i,'기타','다른 날',{at:'2026-11-11'});const k=i.logs.length-1;issMove(i.id,k,-1);o.order3=[...i.logs].sort(issCmp).map(l=>l.text).join('>');
      issOpen(i.id);await wait(150);issEditLog(i.id,i.logs.indexOf(rec('모름')));await wait(150);q('#ieAtB').value='';dtpBand('ieAt');q('#ieAtT').value='08:00';issSaveLog(i.id,i.logs.indexOf(rec('모름')));await wait(200);
      o.edited=rec('모름').at+'/'+i.logs.every(l=>l.ord==null)+'/'+JSON.stringify(rec('모름').edits[0].prev.at);o.order4=[...i.logs].sort(issCmp).map(l=>l.text).join('>');
      mfDirty=false;closeModal(true);removeRec('issues',i.id);save();
      // 불량 실행 기록: 같은 실행일끼리 순서 바꾸기
      const d=db.defects[0],keep=JSON.stringify(d.logs||[]),t0=today();
      d.logs=[{id:'mvA',date:t0,kind:LOG_KINDS[0],party:'',method:'',text:'A 기록',result:'',photos:[],by:'',at:'2026-11-19T01:00:00.000Z'},{id:'mvB',date:t0,kind:LOG_KINDS[0],party:'',method:'',text:'B 기록',result:'',photos:[],by:'',at:'2026-11-19T02:00:00.000Z'}];
      openLog(d.id);await wait(250);const TL=()=>[...document.querySelectorAll('#modal ul.logs li:not(.au) .lt')].map(e=>e.textContent).join('>');
      o.tl0=TL();o.tlmv=document.querySelectorAll('#modal ul.logs .mv').length;
      document.querySelectorAll('#modal ul.logs .mv button')[1].click();await wait(300);o.tl1=TL();o.tlSaved=db.defects[0].logs.map(l=>l.id+':'+l.ord).join();
      mfDirty=false;closeModal(true);d.logs=JSON.parse(keep);save();window.askConfirm=o0;render();return o}""")
    ok(r["form"] and r["needDate"], "이슈 ‘언제’: 날짜 · 시간대 · 시각 칸으로 나뉨 · 날짜가 없으면 저장하지 않음")
    ok(r["hid"] and r["at"] == "2026-11-10" and r["band"] == "야간" and r["show"] == "2026-11-10 야간" and r["log0"] == "2026-11-10/야간", f"야간을 고르면 시각 칸 숨김 · 날짜와 ‘야간’만 저장 ({r['show']})")
    ok(r["saved"] == "2026-11-10,,2026-11-10T14:20,2026-11-10오전", f"기록 일시: 시간 모름 · 시각 · 시간대 저장 ({r['saved']})")
    ok(r["order"] == "오전>시각>오후>시간 선택 시험>모름" or r["order"].startswith("오전>시각>오후>") and r["order"].endswith(">모름"), f"같은 날 순서: 오전 → 14:20 → 오후 → 야간 → 시간 모름 ({r['order']})")
    ok("11-10 오전" in r["cells"] and "11-10 14:20" in r["cells"] and "11-10 야간" in r["cells"] and r["mv"] >= 5, f"목록에 시각 대신 시간대 표시 · ▲▼ 단추 ({r['cells']})")
    ok(r["order2"].endswith(">모름>" + r["order"].split(">")[-2]) , f"▲ → 같은 날 안에서 한 칸 위로 ({r['order2']})")
    ok(r["order3"].endswith(">다른 날"), "날짜가 다른 기록과는 순서를 바꾸지 않음")
    ok(r["edited"] == '2026-11-10T08:00/true/"2026-11-10"' and r["order4"].startswith("모름>오전>시각>오후>"), f"일시를 고치면 그날은 다시 시간순 · 수정 이력에 전 일시 ({r['order4']})")
    ok(r["tl0"] == "B 기록>A 기록" and r["tlmv"] == 2 and r["tl1"] == "A 기록>B 기록" and r["tlSaved"] == "mvA:1,mvB:0", f"실행 기록: 같은 실행일끼리 ▲▼로 순서 바꿈 · 바로 저장 ({r['tl0']} → {r['tl1']})")

    # 이슈 기록의 파일 첨부: PDF · 이미지를 붙여 저장 → 기록 아래에 표시 → 수정에서 빼기 · 추가 (이력에 남음) → 새로 열어도 유지
    import base64 as _b64, tempfile as _tf
    _fd = _tf.mkdtemp()
    open(os.path.join(_fd, "회의록.pdf"), "wb").write(b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")
    open(os.path.join(_fd, "현장.png"), "wb").write(_b64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="))
    open(os.path.join(_fd, "성적서.xlsx"), "wb").write(b"PK\x03\x04 test")
    A.evaluate("""()=>{const i={id:'isfx',no:'ISS-F',title:'첨부 시험',at:today(),urg:'보통',logs:[],photos:[],defectIds:[],caseIds:[],createdAt:now()};db.issues.push(i);go('issue');issOpen('isfx')}"""); settle(A, 300)
    ok(A.locator("#modal .isadd input[type=file]").count() == 1 and "파일 첨부" in A.inner_text("#modal .isadd"), "이슈 기록 남기기: 파일 첨부 단추가 있음")
    A.set_input_files("#modal .isadd input[type=file]", [os.path.join(_fd, "회의록.pdf"), os.path.join(_fd, "현장.png")]); settle(A, 600)
    r = A.evaluate("()=>({chips:document.querySelectorAll('#isF .f').length,img:document.querySelectorAll('#isF .f.im img').length,x:document.querySelectorAll('#isF .x').length,name:document.querySelector('#isF').textContent,dirty:mfDirty})")
    ok(r["chips"] == 2 and r["img"] == 1 and r["x"] == 2 and "회의록.pdf" in r["name"] and r["dirty"], f"고른 파일 2개가 저장 전에 보임 — 이미지는 작은 그림, 문서는 이름 ({r['chips']})")
    A.click("#modal .isadd button.p:has-text('저장')"); settle(A, 300)
    ok("내용을 입력하세요" in A.inner_text("#toast") and A.evaluate("()=>issF.nw.length") == 2, "내용 없이 파일만으로는 저장 안 됨 — 고른 파일은 그대로")
    A.fill("#isTx", "회의록 첨부 기록"); A.click("#modal .isadd button.p:has-text('저장')"); settle(A, 700)
    r = A.evaluate("""async()=>{const i=issById('isfx'),l=i.logs.find(x=>x.text==='회의록 첨부 기록'),got=await photoGetMany(l.photos||[]);
      const li=[...document.querySelectorAll('#modal ol.isl li')].find(e=>e.textContent.includes('회의록 첨부 기록'));
      return {n:(l.photos||[]).length,stored:got.length,doc:got.filter(g=>g.kind==='doc').map(g=>g.name).join(),shown:li.querySelectorAll('.isfl .f').length,x:li.querySelectorAll('.isfl .x').length,draft:issF.nw.length,left:document.querySelectorAll('#isF .f').length}}""")
    ok(r["n"] == 2 and r["stored"] == 2 and r["doc"] == "회의록.pdf" and r["shown"] == 2 and r["x"] == 0 and r["draft"] == 0 and r["left"] == 0, f"저장: 기록에 첨부 2개 · 저장소에 있음 · 기록 아래에 표시 ({r})")
    with A.expect_popup() as pop:
        A.click("#modal ol.isl .isfl a.o")
    ok(pop.value is not None, "문서 첨부를 누르면 열림 (PDF 는 새 창)"); pop.value.close()
    A.click("#modal ol.isl .isfl .f.im img"); settle(A, 250)
    ok(A.evaluate("()=>document.querySelector('#lb').classList.contains('on')"), "이미지 첨부를 누르면 크게 보기"); A.evaluate("()=>closeLb()")
    # 수정: 이미지 빼고 엑셀 추가
    A.evaluate("()=>{const i=issById('isfx');issEditLog('isfx',i.logs.findIndex(x=>x.text==='회의록 첨부 기록'))}"); settle(A, 300)
    ok(A.locator("#ieF .f").count() == 2 and A.locator("#ieF .x").count() == 2, "기록 수정: 지금 첨부 2개가 보이고 뺄 수 있음")
    A.click("#ieF .f.im .x"); A.set_input_files("#modal .ised input[type=file]", [os.path.join(_fd, "성적서.xlsx")]); settle(A, 500)
    A.click("#modal .ised button.p"); settle(A, 700)
    r = A.evaluate("""async()=>{const i=issById('isfx'),l=i.logs.find(x=>x.text==='회의록 첨부 기록'),got=await photoGetMany(l.photos||[]),e=l.edits[l.edits.length-1];
      const li=[...document.querySelectorAll('#modal ol.isl li')].find(x=>x.textContent.includes('회의록 첨부 기록'));
      return {names:got.map(g=>g.name).sort().join(),files:e.files,hist:li.querySelector('details').textContent,del:db.deleted.length>0}}""")
    ok(r["names"] == "성적서.xlsx,회의록.pdf" and r["files"] == {"add": 1, "del": 1} and "첨부 추가 1 · 삭제 1" in r["hist"], f"수정 저장: 이미지 삭제 · 엑셀 추가 — 수정 이력에 남음 ({r['names']})")
    # 붙여넣기 (캡처 그림) · 취소
    r = A.evaluate("""async()=>{const wait=ms=>window.__settle(ms);document.querySelector('#isTx').focus();
      const bin=atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),u=new Uint8Array(bin.length);for(let k=0;k<bin.length;k++)u[k]=bin.charCodeAt(k);
      const dt=new DataTransfer();dt.items.add(new File([u],'capture.png',{type:'image/png'}));
      document.querySelector('#isTx').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));await wait(500);
      const a=issF.nw.length;issClearLog();return {a,b:issF.nw.length,left:document.querySelectorAll('#isF .f').length}}""")
    ok(r["a"] == 1 and r["b"] == 0 and r["left"] == 0, f"기록 칸에서 Ctrl+V 로 그림 첨부 · 취소하면 지워짐 ({r})")
    # 새로 열어도 유지 · 백업 대상에 들어감 · 조회 전용 사용자도 봄
    A.evaluate("()=>{mfDirty=false;closeModal(true);save()}"); settle(A, 900)
    A.evaluate("()=>{Object.keys(issFC).forEach(k=>delete issFC[k]);issOpen('isfx')}"); settle(A, 700)
    r = A.evaluate("()=>{const li=[...document.querySelectorAll('#modal ol.isl li')].find(x=>x.textContent.includes('회의록 첨부 기록'));return {n:li.querySelectorAll('.isfl .f').length,t:li.querySelector('.isfl').textContent,ids:logPhotoIds(issById('isfx').logs).length}}")
    ok(r["n"] == 2 and "회의록.pdf" in r["t"] and "성적서.xlsx" in r["t"] and r["ids"] == 2, f"창을 다시 열어도 첨부가 보임 ({r['t'][:40]})")
    A.evaluate("()=>{mfDirty=false;closeModal(true);const k=db.issues.findIndex(x=>x.id==='isfx');const ph=logPhotoIds(db.issues[k].logs);photoDel(ph).catch(()=>{});ph.forEach(x=>db.deleted.push({id:x,at:now()}));removeRec('issues','isfx');save();go('dash')}"); settle(A, 600)
    ok(not A._errs, f"이슈 기록 첨부: 화면 오류 없음 {A._errs[:2]}")
