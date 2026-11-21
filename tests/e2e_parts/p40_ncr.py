"""화면 시험 — NCR: 진행 기록 · 단순 통보 · 단계 단추 · 작성 양식 · A3 · 재회신
   실행: python tests/e2e_browser.py tests/sample_backup.json --only ncr"""
import json      # noqa: F401
import os      # noqa: F401
import signal      # noqa: F401
import time      # noqa: F401

from e2e_lib import ROOT, URL, ok, settle, start      # noqa: F401


def run(c):
    A, B, C, tmp, env, b = c.A, c.B, c.C, c.tmp, c.env, c.b
    # NCR 진행 기록 · 이슈 기록: 같은 작성 칸(취소 · 저장), 바로 저장
    r = A.evaluate("""async () => {
      mfDirty=false;closeModal(true);const wait=ms=>window.__settle(ms),o={};
      const n=db.ncrs[0],n0=(n.logs||[]).length;state.tab='ncr';render();editNcr(n.id,null,'issue');ncrTab('d');await wait(150);
      if(!document.querySelector('#lgText'))lgOpen();o.btn=[...document.querySelectorAll('#modal .lgc .cf button')].map(x=>x.textContent).join();
      const ev=(el)=>el.dispatchEvent(new Event('input',{bubbles:true}));
      if(!document.querySelector('#lgText'))lgOpen();document.querySelector('#lgText').value='NCR 진행 기록 시험';ev(document.querySelector('#lgText'));addLog();await wait(200);
      o.saved=(n.logs||[]).length===n0+1&&n.logs.some(l=>l.text==='NCR 진행 기록 시험');o.open=document.querySelector('#modal').classList.contains('on');o.dirty1=mfDirty;
      const t=document.querySelector('#mf [name=title]');t.value=t.value+' ';ev(t);if(!document.querySelector('#lgText'))lgOpen();document.querySelector('#lgText').value='둘째 기록';ev(document.querySelector('#lgText'));addLog();await wait(200);o.dirty2=mfDirty;
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
      const o={btn};for(const m of ['issue','reply','verify']){editNcr(n.id,null,m);o[m]={sw:!!document.querySelector('#ncrNav')||!!document.querySelector('.qtrack button'),tabs:tabs(),t:document.querySelector('#mt').textContent};mfDirty=false;closeModal(true)}
      editNcr(n.id);o.link=document.querySelectorAll('#ncrNav .qtrack button').length>=3&&!!document.querySelector('#ncrNav .qlog');mfDirty=false;closeModal(true);
      row.querySelector('a.lk').click();o.no=!!document.querySelector('#ncrNav');mfDirty=false;closeModal(true);return o}""")
    ok("통보서" not in r["btn"] and r["btn"].startswith("발행 정보"), f"NCR 목록: 통보서 단추 없음 ({r['btn']})")
    ok(not r["issue"]["sw"] and not r["reply"]["sw"] and not r["verify"]["sw"] and not r["no"], "NCR 목록의 단계 단추 · 번호: 단계 전환 줄 없이 그 단계만")
    ok(r["issue"]["tabs"] == "antd" and r["reply"]["tabs"] == "rbd" and r["verify"]["tabs"] == "cd", f"NCR 단계별 탭 ({r['issue']['tabs']}/{r['reply']['tabs']}/{r['verify']['tabs']})")
    r2 = A.evaluate("""() => {const n=db.ncrs[0];editNcr(n.id,null,'issue');const pane=k=>document.querySelector('#mf [name='+k+']').closest('.ntp').dataset.p,vis=k=>getComputedStyle(document.querySelector('#mf [name='+k+']').closest('.ntp')).display!=='none';
      const o={p:['notifyYN','notifyDate','notifyMethod'].map(pane).join(''),box:document.querySelector('#noticeBox').closest('.ntp').dataset.p,req:pane('reqType'),a:vis('notifyDate')};
      ncrTab('t');o.t=vis('notifyDate')&&!vis('reqType');o.lab=[...document.querySelectorAll('#ncrTabs [data-t]')].filter(b=>b.style.display!=='none').map(b=>b.textContent.trim().replace(/\\s*\\d+$/,'')).join('|');
      const f=document.querySelector('#mf');f.notifyDate.value='2000-01-01';const r=saveNcr(n.id);o.err=r===null&&document.querySelector('#ncrTabs [data-t=t]').getAttribute('aria-selected')==='true';mfDirty=false;closeModal(true);return o}""")
    ok(r2["p"] == "ttt" and r2["box"] == "t" and r2["req"] == "a" and not r2["a"] and r2["t"], f"NCR 발행 정보: 협력사 통보는 ‘협력사 통보’ 탭에 따로 ({r2['lab']})")
    ok(r2["lab"].startswith("발행 정보|통보서 내용|협력사 통보|진행 기록") and r2["err"], "탭 순서 · 통보일 오류는 통보 탭으로 이동")
    ok("발행 정보" in r["issue"]["t"] and "협력사 회신" in r["reply"]["t"] and "검증" in r["verify"]["t"], "NCR 창 제목에 단계 이름")
    ok(r["link"], "다른 화면의 NCR 링크(단계 지정 없음): 단계 줄이 단추 · ‘진행 기록’ 단추")
    r = A.evaluate("""() => {const n=db.ncrs.find(x=>x.reqType!=='단순 통보')||db.ncrs[0],lab=()=>[...document.querySelector('#mfoot').children].filter(e=>!e.className.includes('mfsp')).map(e=>e.textContent).join(',');
      editNcr(n.id,null,'reply');const rp=lab();mfDirty=false;closeModal(true);editNcr(n.id,null,'verify');const vf=lab();mfDirty=false;closeModal(true);return {rp,vf,info:n.reqType==='단순 통보'}}""")
    ok(r["info"] or r["rp"] == "취소,저장", f"NCR 협력사 회신 창: 아래 단추는 취소 · 저장만 ({r['rp']})")
    ok("8D 출력" in r["vf"] and "RCA" not in r["vf"], f"NCR 검증 창: 8D 출력 있음 ({r['vf']})")
    # 조회 권한: 발행 정보 창에서 통보서 출력 (저장 단추는 없음)
    r = C.evaluate("""async () => {await srvSync();mfDirty=false;closeModal(true);editNcr(db.ncrs[0].id,null,'issue');await new Promise(r=>setTimeout(r,300));
      const v=[...document.querySelectorAll('#mfoot button')].filter(b=>b.style.display!=='none').map(b=>b.textContent.trim());closeModal(true);return v}""")
    ok("통보서 출력" in r and not any("저장" in x or "삭제" in x for x in r), f"조회: NCR 발행 정보 창에 통보서 출력만 ({','.join(r)})")

    # 새 NCR: 불량 내용 서술에 작성 양식이 기본으로 들어감
    r = A.evaluate("""async () => {
      mfDirty=false;closeModal(true);const wait=ms=>window.__settle(ms),o0=window.askConfirm;window.askConfirm=async()=>'alt';const o={};
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
    # A3 보고서: 건이 종결된 뒤에만 · 진행 현황의 전체 이력에서 출력. NCR 창 · 불량 진행 창에는 ‘전체 이력 · A3 보고서’ 로 가는 단추만 있음
    r = A.evaluate("""async() => {
      const wait=ms=>new Promise(r=>setTimeout(r,ms)),q=s=>document.querySelector(s);
      mfDirty=false;closeModal(true);const lab=()=>[...q('#mfoot').children].filter(e=>!e.className.includes('mfsp')).map(e=>e.textContent);
      const mk=x=>{const n=Object.assign({id:uid(),issueDate:addDays(today(),-20),supplierId:db.suppliers[0].id,defectIds:[]},x);db.ncrs.push(n);return n},o={};
      const b=mk({no:'A3-8D',reqType:'8D 보고서',notifyDate:addDays(today(),-19),requestDate:addDays(today(),-19),replyDate:addDays(today(),-10),validity:'적정',approvedDate:addDays(today(),-9)});
      o.why0=a3Ready(progBundle('ncr',b.id));o.st0=ncrStatus(b);
      editNcr(b.id,null,'issue');await wait(300);o.foot=lab();o.old=o.foot.includes('A3 보고서');
      const go1=[...q('#mfoot').children].find(e=>e.textContent==='전체 이력 · A3 보고서');o.link=!!go1;go1&&go1.click();await wait(400);
      o.tab=state.tab;o.modal=q('#modal').classList.contains('on');const a3=()=>[...document.querySelectorAll('.pgh button')].find(x=>x.textContent==='A3 보고서');
      o.dis0=a3()?a3().disabled:null;o.msg=q('.pgh').textContent.includes('NCR 종결 뒤');
      b.verifyDate=addDays(today(),-1);b.verifyResult='유효';o.st1=ncrStatus(b);o.why1=a3Ready(progBundle('ncr',b.id));
      progOpen('ncr',b.id);await wait(400);o.done=!!state.pf.done;o.dis1=a3()?a3().disabled:null;o.print=[...document.querySelectorAll('.pgh button')].some(x=>x.textContent==='이력 출력');
      o.rows=document.querySelectorAll('.pgl tbody tr[onclick]').length;o.th=[...document.querySelectorAll('.pgl thead th')].pop().textContent;
      const c={id:'t_a3',CaseNo:'RCA-A3-1',Title:'t',Status:'진행중',Stage:CZ_STAGES[0],NcrId:b.id,DefectIds:[],Created:today()};db.cases.push(c);
      o.why2=a3Ready(progBundle('ncr',b.id));c.Status='종결';o.why3=a3Ready(progBundle('rca',c.id));
      const d=db.defects.find(x=>!x.deleted&&!x.ncrId)||db.defects[0];openLog(d.id);await wait(300);o.def=lab();mfDirty=false;closeModal(true);
      // 고치던 내용이 있으면 이동 전에 물음: 취소하면 창이 그대로 남음
      editNcr(b.id,null,'issue');await wait(300);mfDirty=true;const keepAsk=window.askConfirm;let asked=0;window.askConfirm=async()=>{asked++;return false};
      await progOpen('ncr',b.id);await wait(200);o.asked=asked;o.stay=q('#modal').classList.contains('on');window.askConfirm=keepAsk;mfDirty=false;closeModal(true);
      db.cases=db.cases.filter(x=>x!==c);db.ncrs=db.ncrs.filter(x=>x!==b);state.pf=null;go('ncr');return o}""")
    ok(not r["old"] and r["link"] and r["tab"] == "prog" and not r["modal"], f"NCR 창: A3 단추 대신 ‘전체 이력 · A3 보고서’ → 진행 현황이 열림 ({r['foot']})")
    ok(r["why0"] != "" and r["dis0"] is True and r["msg"], f"A3 보고서: 대책 승인만으로는 출력할 수 없음 — 흐린 단추와 이유 ({r['st0']} · {r['why0']})")
    ok(r["st1"] == "종결" and r["why1"] == "" and r["dis1"] is False and r["done"] and r["print"] and r["th"] == "끝난 날" and r["rows"] >= 1, f"A3 보고서: NCR 종결 뒤에 출력 가능 · 끝난 건 목록에서 보임 ({r['st1']})")
    ok(r["why2"] != "" and r["why3"] == "", f"A3 보고서: RCA 가 있으면 RCA 종결이 기준 ({r['why2']})")
    ok("전체 이력 · A3 보고서" in r["def"] and "A3 보고서" not in r["def"], f"불량 진행 창: 같은 단추 ({r['def']})")
    ok(r["asked"] == 1 and r["stay"], "고치던 내용이 있으면 전체 이력으로 가기 전에 물음 — 취소하면 창이 그대로")
    # 보완요청 · 반려 뒤: 목록에 ‘재회신 접수’ 단추 → 다시 검토 단계 → 재제출 평가를 마치면 그 결과로
    r = A.evaluate("""async () => {
      mfDirty=false;closeModal(true);const wait=ms=>window.__settle(ms),o0=window.askConfirm;window.askConfirm=async()=>true;const o={};
      const sc=v=>Object.fromEntries(EVAL_SIMPLE.map(it=>[it.k,v]));
      const n={id:uid(),no:'RESUB-1',issueDate:addDays(today(),-30),supplierId:db.suppliers[0].id,defectIds:[],reqType:'간이 대책서',notifyDate:addDays(today(),-29),requestDate:addDays(today(),-29),dueDate:addDays(today(),-22),replyDate:addDays(today(),-23),
        validity:'보완요청',evals:[{id:'ev1',type:'간이 대책서',date:addDays(today(),-22),by:'나',sc:sc(0),cm:{},note:''}],evalVerdict:'반려',evalScore:0};db.ncrs.push(n);
      state.tab='ncr';state.nf.status='';render();await wait(100);
      const row=()=>[...document.querySelectorAll('#ntab tbody tr')].find(tr=>tr.innerText.includes('RESUB-1'));
      o.st0=ncrStatus(n);o.btn0=!!row()&&[...row().querySelectorAll('button')].some(b=>b.textContent==='재회신 접수');
      [...row().querySelectorAll('button')].find(b=>b.textContent==='재회신 접수').click();await wait(300);hideAct();
      o.st1=ncrStatus(n);o.pend=!!n.resubPending&&n.resubPending.evalId==='ev1';o.resubs=(n.resubs||[]).length;o.reply=n.replyDate===addDays(today(),-23);
      o.btn1=[...row().querySelectorAll('button')].some(b=>b.textContent==='재회신 접수');o.cell=row().innerText.includes('재회신 '+today().slice(5));
      editNcr(n.id,null,'reply');await wait(150);o.banner=document.querySelector('#modal').innerText.includes('보완 대책서 재회신 접수');
      saveNcr(n.id);await wait(200);o.st2=ncrStatus(n);                                   // 평가를 새로 하지 않고 저장 → 그대로 검토 단계
      editNcr(n.id,null,'reply');await wait(150);addEval();curEvals[curEvals.length-1].sc=sc(1);saveNcr(n.id);await wait(200);
      o.st3=ncrStatus(n);o.cleared=!n.resubPending;o.val=n.validity;
      window.askConfirm=o0;db.ncrs=db.ncrs.filter(x=>x!==n);render();return o}""")
    ok(r["st0"] == "보완요청" and r["btn0"], "NCR 목록: 보완요청 · 반려 건에 ‘재회신 접수’ 단추")
    ok(r["st1"] == "대책서 검토" and r["pend"] and r["resubs"] == 1 and r["reply"] and not r["btn1"] and r["cell"], f"재회신 접수 → 상태 ‘대책서 검토’, 처음 회신일은 그대로, 목록에 재회신일 표시 ({r['st1']})")
    ok(r["banner"] and r["st2"] == "대책서 검토", "회신 창에 재제출 평가 안내 · 평가 전에는 검토 단계 유지")
    ok(r["st3"] == "승인(검증대기)" and r["cleared"] and r["val"] == "적정", f"재제출 평가(승인)를 마치면 그 결과로 바뀜 ({r['st3']})")

    # NCR 창의 단계 줄: 단계가 단추 (누르면 그 단계의 화면) · ‘진행 기록’ 단추 · 요구 유형을 바꾸면 단계 줄도 바뀜
    r = A.evaluate("""async()=>{const wait=ms=>window.__settle(ms),q=s=>document.querySelector(s),o={};mfDirty=false;closeModal(true);
      const n=db.ncrs.find(x=>x.reqType!=='단순 통보')||db.ncrs[0];go('ncr');editNcr(n.id);await wait(300);
      const steps=()=>[...document.querySelectorAll('#ncrNav .qtrack button')],cur=()=>steps().filter(b=>b.getAttribute('aria-current')==='step').map(b=>b.firstChild.textContent.trim()).join(),
        tabs=()=>[...document.querySelectorAll('#ncrTabs [data-t]')].filter(b=>b.style.display!=='none').map(b=>b.dataset.t).join('');
      o.labels=steps().map(b=>b.firstChild.textContent.trim()).join('>');o.modes=!!q('#ncrModes');
      steps().find(b=>/^발행/.test(b.textContent)).click();await wait(150);o.a={cur:cur(),tabs:tabs(),t:q('#mt').textContent,sel:ncrTabCur};
      steps().find(b=>/^협력사 통보/.test(b.textContent)).click();await wait(150);o.t={cur:cur(),sel:ncrTabCur};
      steps().find(b=>/^대책서 회신/.test(b.textContent)).click();await wait(150);o.r={cur:cur(),tabs:tabs(),t:q('#mt').textContent,sel:ncrTabCur};
      steps().find(b=>/^유효성 검증/.test(b.textContent)).click();await wait(150);o.c={cur:cur(),tabs:tabs(),sel:ncrTabCur};
      q('#ncrNav .qlog').click();await wait(150);o.d={sel:ncrTabCur,on:q('#ncrNav .qlog').getAttribute('aria-selected'),log:!q('#logBox').closest('.ntp').hidden};
      steps()[0].click();await wait(100);const f=q('#mf');f.reqType.value='단순 통보';f.reqType.dispatchEvent(new Event('change',{bubbles:true}));await wait(200);
      o.info={labels:steps().map(b=>b.firstChild.textContent.trim()).join('>'),cur:cur()};
      mfDirty=false;closeModal(true);return o}""")
    ok(r["labels"] == "발행>협력사 통보>D3 봉쇄>대책서 회신>대책 승인>유효성 검증>종결" and not r["modes"], f"NCR 창: 단계 줄이 단추 · 큰 전환 단추는 없음 ({r['labels']})")
    ok(r["a"]["cur"] == "발행,협력사 통보" and r["a"]["tabs"] == "ant" and r["a"]["sel"] == "a" and r["t"]["sel"] == "t", f"‘발행’ · ‘협력사 통보’ 단계 → 발행 화면의 해당 탭 ({r['a']['tabs']})")
    ok(r["r"]["cur"] == "D3 봉쇄,대책서 회신,대책 승인" and r["r"]["tabs"] == "rb" and r["r"]["sel"] == "r" and "협력사 회신" in r["r"]["t"], f"‘대책서 회신’ 단계 → 회신 화면 ({r['r']['cur']})")
    ok(r["c"]["cur"] == "유효성 검증,종결" and r["c"]["tabs"] == "c" and r["c"]["sel"] == "c", "‘유효성 검증’ 단계 → 검증 · 종결 화면")
    ok(r["d"] == {"sel": "d", "on": "true", "log": True}, f"‘진행 기록’ 단추 → 기록 화면 (탭 줄에는 없음) ({r['d']})")
    ok(r["info"]["labels"] == "발행>협력사 통보>종결" and r["info"]["cur"] == "발행,협력사 통보", f"요구 유형을 단순 통보로 바꾸면 단계 줄도 바뀜 ({r['info']['labels']})")
