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
      o.log0=i.logs[0].date+'/'+i.logs[0].time+'/'+i.logs[0].band;
      issOpen(i.id);await wait(200);
      const add=async(b,t,tx)=>{if(!q('#lgText'))lgOpen();q('#lgAtD').value='2026-11-10';q('#lgAtB').value=b;dtpBand('lgAt');if(t)q('#lgAtT').value=t;q('#lgText').value=tx;addLog();await wait(200)};
      lgOpen();o.def={band:q('#lgAtB').value,time:/^\\d\\d:\\d\\d$/.test(q('#lgAtT').value),kind:q('#lgKind').value};
      await add('?','','모름');await add('','14:20','시각');await add('오전','','오전');await add('오후','','오후');
      const cur=()=>issById(i.id),rec=t=>cur().logs.find(l=>l.text===t);
      const TXT=()=>[...document.querySelectorAll('#modal ul.logs li .lt')].map(e=>e.textContent.trim()).join('>');
      o.saved=[rec('모름').date,rec('모름').time,rec('모름').band,rec('시각').time,rec('오전').band].join();
      o.order=TXT();o.cells=[...document.querySelectorAll('#modal ul.logs li .lh b')].map(e=>e.textContent).join('|');
      o.mv=document.querySelectorAll('#modal ul.logs .mv').length;
      lgMove(tl.own.findIndex(x=>x.text==='시각'),-1);await wait(250);o.order2=TXT();
      issLog(cur(),'기타','다른 날',{at:'2026-11-11'});touch(cur());save();render();await wait(250);o.order3=TXT();
      lgEdit(tl.own.findIndex(x=>x.text==='모름'));await wait(150);q('#leAtB').value='';dtpBand('leAt');q('#leAtT').value='08:00';saveLog(tl.edit);await wait(300);
      o.edited=rec('모름').time+'/'+cur().logs.filter(l=>l.date==='2026-11-10').map(l=>l.ord==null?'-':l.ord).join('')+'/'+rec('모름').hist[0].time+rec('모름').hist[0].band+'/'+rec('모름').hist[0].reason;o.order4=TXT();
      // 프로그램이 남긴 기록(분류 · 종결)은 고칠 수 없음 · 종결한 이슈는 읽기 전용
      issLog(cur(),'분류','불량 등록 — 시험');touch(cur());save();render();await wait(250);
      const sysLi=[...document.querySelectorAll('#modal ul.logs li')].find(e=>e.textContent.includes('불량 등록 — 시험'));o.sys={flag:rec('불량 등록 — 시험').sys===true,acts:sysLi.querySelectorAll('.la button,.la summary').length};
      cur().closedAt=today();cur().closeReason='시험';render();await wait(250);o.closed={comp:document.querySelectorAll('#modal #logBox .lgc').length,acts:document.querySelectorAll('#modal ul.logs .la button,#modal ul.logs .la summary').length,n:document.querySelectorAll('#modal ul.logs li').length};
      mfDirty=false;closeModal(true);removeRec('issues',i.id);save();
      // 불량 실행 기록: 같은 실행일끼리 순서 바꾸기
      const d=db.defects[0],keep=JSON.stringify(d.logs||[]),t0=today();
      d.logs=[{id:'mvA',date:t0,kind:LOG_KINDS[0],party:'',method:'',text:'A 기록',result:'',photos:[],by:'',at:'2026-11-19T01:00:00.000Z'},{id:'mvB',date:t0,kind:LOG_KINDS[0],party:'',method:'',text:'B 기록',result:'',photos:[],by:'',at:'2026-11-19T02:00:00.000Z'}];
      openLog(d.id);await wait(250);const TL=()=>[...document.querySelectorAll('#modal ul.logs li:not(.au) .lt')].map(e=>e.textContent).join('>');
      o.tl0=TL();o.tlmv=document.querySelectorAll('#modal ul.logs .mv').length;
      document.querySelectorAll('#modal ul.logs .mv button')[1].click();await wait(300);o.tl1=TL();o.tlSaved=db.defects[0].logs.map(l=>l.id+':'+l.ord).join();
      mfDirty=false;closeModal(true);d.logs=JSON.parse(keep);save();window.askConfirm=o0;render();return o}""")
    ok(r["form"] and r["needDate"], "이슈 ‘언제’: 날짜 · 시간대 · 시각 칸으로 나뉨 · 날짜가 없으면 저장하지 않음")
    ok(r["hid"] and r["at"] == "2026-11-10" and r["band"] == "야간" and r["show"] == "2026-11-10 야간" and r["log0"] == "2026-11-10//야간", f"야간을 고르면 시각 칸 숨김 · 날짜와 ‘야간’만 저장 ({r['show']})")
    ok(r["def"]["band"] == "" and r["def"]["time"] and r["def"]["kind"] == "인터뷰", f"이슈 기록 작성 칸의 처음 값: 지금 시각 · 구분 ‘인터뷰’ ({r['def']})")
    ok(r["saved"] == "2026-11-10,,,14:20,오전", f"기록 일시: 시간 모름 · 시각 · 시간대 저장 ({r['saved']})")
    ok(r["order"].startswith("모름>") and r["order"].index("오후") < r["order"].index("시각") < r["order"].index("오전"), f"화면 순서는 최근 것이 위: 시간 모름 → 오후 → 14:20 → 오전 ({r['order']})")
    ok("2026-11-10 오전" in r["cells"] and "2026-11-10 14:20" in r["cells"] and "2026-11-10 야간" in r["cells"] and r["mv"] >= 5, f"기록에 시각 또는 시간대 표시 · ▲▼ 단추 ({r['cells']})")
    ok(r["order2"].index("시각") < r["order2"].index("오후"), f"▲ → 같은 날 안에서 한 칸 위로 ({r['order2']})")
    ok(r["order3"].startswith("다른 날>"), f"프로그램이 넣은 기록도 창에 바로 보임 · 날짜가 늦은 기록이 위 ({r['order3'][:30]})")
    ok(r["edited"] == "08:00/-----//" and r["order4"].index("오후") < r["order4"].index("시각") < r["order4"].index("오전") < r["order4"].rindex("모름"), f"일시를 고치면 그날의 손으로 정한 순서는 풀림 · 이슈는 수정 사유가 선택 ({r['edited']})")
    ok(r["sys"] == {"flag": True, "acts": 0}, f"프로그램이 남긴 기록(분류)은 수정 · 취소 단추가 없음 ({r['sys']})")
    ok(r["closed"]["comp"] == 0 and r["closed"]["acts"] == 0 and r["closed"]["n"] >= 6, f"종결한 이슈: 기록 작성 칸 · 수정 단추 없음 (기록은 보임) ({r['closed']})")
    ok(r["tl0"] == "B 기록>A 기록" and r["tlmv"] == 2 and r["tl1"] == "A 기록>B 기록" and r["tlSaved"] == "mvA:1,mvB:0", f"실행 기록: 같은 실행일끼리 ▲▼로 순서 바꿈 · 바로 저장 ({r['tl0']} → {r['tl1']})")

    # 이슈 기록의 파일 첨부: PDF · 이미지를 붙여 저장 → 기록 아래에 표시 → 수정에서 빼기 · 추가 (이력에 남음) → 새로 열어도 유지
    import base64 as _b64, tempfile as _tf
    _fd = _tf.mkdtemp()
    open(os.path.join(_fd, "회의록.pdf"), "wb").write(b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")
    open(os.path.join(_fd, "현장.png"), "wb").write(_b64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="))
    open(os.path.join(_fd, "성적서.xlsx"), "wb").write(b"PK\x03\x04 test")
    A.evaluate("""()=>{const i={id:'isfx',no:'ISS-F',title:'첨부 시험',at:today(),urg:'보통',logs:[],photos:[],defectIds:[],caseIds:[],createdAt:now()};db.issues.push(touch(i));save();go('issue');issOpen('isfx')}"""); settle(A, 400)
    ok(A.locator("#modal .lgc input[type=file]").count() == 1 and "증빙 첨부" in A.inner_text("#modal .lgc"), "이슈 기록 남기기: 첨부 단추가 있음")
    A.set_input_files("#modal .lgc input[type=file]", [os.path.join(_fd, "회의록.pdf"), os.path.join(_fd, "현장.png")]); settle(A, 600)
    r = A.evaluate("()=>{const b=document.querySelector('#modal .lgc .lgph');return {chips:b.querySelectorAll('.t').length,img:b.querySelectorAll('img').length,doc:b.querySelectorAll('.t.dc').length,name:b.textContent,dirty:mfDirty}}")
    ok(r["chips"] == 2 and r["img"] == 1 and r["doc"] == 1 and "회의록.pdf" in r["name"] and r["dirty"], f"고른 파일 2개가 저장 전에 보임 — 이미지는 작은 그림, 문서는 이름 ({r['chips']})")
    A.click("#modal .lgc button.p:has-text('저장')"); settle(A, 300)
    ok("내용을 입력하세요" in A.inner_text("#toast") and A.evaluate("()=>tl.draftPh.length") == 2, "내용 없이 파일만으로는 저장 안 됨 — 고른 파일은 그대로")
    A.fill("#lgText", "회의록 첨부 기록"); A.fill("#lgResult", "다음 주 재검토"); A.evaluate("()=>{document.querySelector('#lgMethod').value='회의'}"); A.click("#modal .lgc button.p:has-text('저장')"); settle(A, 700)
    r = A.evaluate("""async()=>{const i=issById('isfx'),l=i.logs.find(x=>x.text==='회의록 첨부 기록'),got=await photoGetMany(l.photos||[]);
      const li=[...document.querySelectorAll('#modal ul.logs li')].find(e=>e.textContent.includes('회의록 첨부 기록'));
      return {n:(l.photos||[]).length,stored:got.length,doc:got.filter(g=>g.kind==='doc').map(g=>g.name).join(),shown:li.querySelectorAll('.lgph .t').length,draft:tl.draftPh.length,method:l.method,result:l.result,res:/결과/.test(li.textContent)&&/다음 주 재검토/.test(li.textContent)&&/회의/.test(li.querySelector('.lh').textContent)}}""")
    ok(r["n"] == 2 and r["stored"] == 2 and r["doc"] == "회의록.pdf" and r["shown"] == 2 and r["draft"] == 0, f"저장: 기록에 첨부 2개 · 저장소에 있음 · 기록 아래에 표시 ({r})")
    ok(r["method"] == "회의" and r["result"] == "다음 주 재검토" and r["res"], "이슈 기록에 방법 · 결과 · 합의 사항이 저장되고 보임")
    with A.expect_popup() as pop:
        A.click("#modal ul.logs .lgph .t.dc .o")
    ok(pop.value is not None, "문서 첨부를 누르면 열림 (PDF 는 새 창)"); pop.value.close()
    A.click("#modal ul.logs .lgph img"); settle(A, 250)
    ok(A.evaluate("()=>document.querySelector('#lb').classList.contains('on')"), "이미지 첨부를 누르면 크게 보기"); A.evaluate("()=>closeLb()")
    # 수정: 이미지 빼고 엑셀 추가 — 원문의 첨부는 이력에 남음
    A.evaluate("()=>lgEdit(tl.own.findIndex(x=>x.text==='회의록 첨부 기록'))"); settle(A, 300)
    ok(A.locator("#modal ul.logs li.ed .lgph .t").count() == 2 and A.locator("#modal ul.logs li.ed .lgph .t>a").count() == 2, "기록 수정: 지금 첨부 2개가 보이고 뺄 수 있음")
    A.click("#modal ul.logs li.ed .lgph .t:has(img)>a"); A.set_input_files("#modal ul.logs li.ed input[type=file]", [os.path.join(_fd, "성적서.xlsx")]); settle(A, 500)
    A.click("#modal ul.logs li.ed button.p"); settle(A, 700)
    r = A.evaluate("""async()=>{const i=issById('isfx'),l=i.logs.find(x=>x.text==='회의록 첨부 기록'),got=await photoGetMany(l.photos||[]),h=l.hist[l.hist.length-1];
      return {names:got.map(g=>g.name).sort().join(),histPh:h.photos.length,all:logPhotoIds(i.logs).length}}""")
    ok(r["names"] == "성적서.xlsx,회의록.pdf" and r["histPh"] == 2 and r["all"] == 4, f"수정 저장: 이미지 빼고 엑셀 추가 — 원문의 첨부 2개는 이력에 남음 ({r})")
    # 붙여넣기 (캡처 그림) · 취소
    r = A.evaluate("""async()=>{const wait=ms=>window.__settle(ms);lgOpen();document.querySelector('#lgText').focus();
      const bin=atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),u=new Uint8Array(bin.length);for(let k=0;k<bin.length;k++)u[k]=bin.charCodeAt(k);
      const dt=new DataTransfer();dt.items.add(new File([u],'capture.png',{type:'image/png'}));
      document.querySelector('#lgText').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));await wait(500);
      const a=tl.draftPh.length;lgClear();return {a,b:tl.draftPh.length,left:document.querySelectorAll('#modal .lgc .lgph .t').length}}""")
    ok(r["a"] == 1 and r["b"] == 0 and r["left"] == 0, f"기록 칸에서 Ctrl+V 로 그림 첨부 · 취소하면 지워짐 ({r})")
    # 새로 열어도 유지
    A.evaluate("()=>{mfDirty=false;closeModal(true);save()}"); settle(A, 900)
    A.evaluate("()=>{Object.keys(phCache).forEach(k=>delete phCache[k]);issOpen('isfx')}"); settle(A, 900)
    r = A.evaluate("()=>{const li=[...document.querySelectorAll('#modal ul.logs li')].find(x=>x.textContent.includes('회의록 첨부 기록'));return {n:li.querySelectorAll('.lgph .t').length,t:li.querySelector('.lgph').textContent}}")
    ok(r["n"] == 2 and "회의록.pdf" in r["t"] and "성적서.xlsx" in r["t"], f"창을 다시 열어도 첨부가 보임 ({r['t'][:40]})")
    A.evaluate("()=>{mfDirty=false;closeModal(true);const k=db.issues.findIndex(x=>x.id==='isfx');attDrop(logPhotoIds(db.issues[k].logs));removeRec('issues','isfx');save();go('dash')}"); settle(A, 600)
    # 예전 구조의 이슈 기록(at · who · rec · edits)은 공통 구조로 읽음 — 내용 · 수정 이력 · 취소 · 첨부를 잃지 않음
    r = A.evaluate("""()=>{const old={id:'o1',at:'2026-11-05T09:30',band:'',kind:'인터뷰',who:'생산팀',text:'예전 기록',by:'김',rec:'2026-11-05T00:31:00.000Z',photos:['p1'],ord:2,
        edits:[{at:'2026-11-06T10:00',by:'김',reason:'오타',prev:{kind:'회의',at:'2026-11-05',band:'오후',who:'생산',text:'예전 기룩'}}],void:{at:'2026-11-07T08:00',by:'김',reason:'중복'}};
      const sys={id:'o2',at:'2026-11-05',band:'야간',kind:'분류',who:'',text:'RCA 요청',by:'김',rec:'2026-11-05T01:00:00.000Z'};
      const a=logNorm(old),b=logNorm(sys),again=logNorm(a);
      const d=migrate({issues:[{id:'m1',no:'I',title:'t',logs:[JSON.parse(JSON.stringify(old)),{id:'n1',date:'2026-11-08',time:'',band:'',kind:'기타',party:'',method:'',text:'새 구조',result:'',photos:[],by:'',at:''}]}]});
      return {a,b,same:again===a,mig:d.issues[0].logs.map(l=>l.date+'|'+(l.party||'')+'|'+l.text).join(';')}}""")
    a_ = r["a"]
    ok(a_["date"] == "2026-11-05" and a_["time"] == "09:30" and a_["band"] == "" and a_["party"] == "생산팀" and a_["text"] == "예전 기록" and a_["at"] == "2026-11-05T00:31:00.000Z" and a_["photos"] == ["p1"] and a_["ord"] == 2 and "who" not in a_ and "rec" not in a_ and "edits" not in a_, f"예전 이슈 기록 → 공통 구조: 일시 · 상대방 · 작성 시각 · 첨부 · 순서 ({a_['date']} {a_['time']})")
    ok(a_["hist"] == [{"at": "2026-11-06T10:00", "by": "김", "reason": "오타", "date": "2026-11-05", "time": "", "band": "오후", "kind": "회의", "party": "생산", "method": "", "text": "예전 기룩", "result": "", "photos": []}] and a_["void"]["reason"] == "중복", "예전 이슈 기록 → 수정 이력(원문 · 사유) · 취소 사유를 그대로 가져옴")
    ok(r["b"]["date"] == "2026-11-05" and r["b"]["band"] == "야간" and r["b"]["sys"] is True and r["same"], "프로그램이 남긴 기록은 표시(sys) · 이미 공통 구조면 그대로 (여러 번 해도 같음)")
    ok(r["mig"] == "2026-11-05|생산팀|예전 기록;2026-11-08||새 구조", f"데이터를 열 때 이슈 기록을 공통 구조로 맞춤 ({r['mig']})")
    # 기록 이어 보기: 불량 진행 창에 그 불량이 나온 이슈의 기록 · 이슈 창에 그 이슈에서 만든 불량의 기록 (읽기 전용)
    r = A.evaluate("""async()=>{const wait=ms=>window.__settle(ms),o={};mfDirty=false;closeModal(true);
      const i={id:'lnk1',no:'ISS-LNK',title:'이어 보기',at:'2026-11-10T09:00',urg:'보통',logs:[],photos:[],defectIds:['lnkd'],caseIds:[],createdAt:now()};issLog(i,'발견','이슈에서 쓴 기록',{at:i.at});db.issues.push(i);
      const d={id:'lnkd',date:'2026-11-11',source:'공정',partNo:'P-1',type:'치수',qty:2,resp:'협력사',issueId:'lnk1',photos:[],logs:[{id:'dl1',date:'2026-11-12',kind:LOG_KINDS[0],party:'',method:'',text:'불량에서 쓴 기록',result:'',photos:[],by:'',at:now()}]};db.defects.push(d);
      const li=t=>[...document.querySelectorAll('#modal ul.logs li')].find(e=>e.textContent.includes(t));
      openLog('lnkd');await wait(350);const a=li('이슈에서 쓴 기록');
      o.def={shown:!!a,src:a?/이슈 ISS-LNK/.test(a.querySelector('.lh').textContent):false,acts:a?a.querySelectorAll('.la button,.la summary').length:-1,ro:a?/원본에서 수정/.test(a.textContent):false,own:li('불량에서 쓴 기록').querySelectorAll('.la button,.la summary').length,
        order:[...document.querySelectorAll('#modal ul.logs li:not(.au) .lt')].map(e=>e.textContent.trim()).join('>')};
      o.report=caseEntries('defect',d).some(e=>e.text==='이슈에서 쓴 기록');mfDirty=false;closeModal(true);
      go('issue');issOpen('lnk1');await wait(350);const b=li('불량에서 쓴 기록');
      o.iss={shown:!!b,acts:b?b.querySelectorAll('.la button,.la summary').length:-1,src:b?b.querySelector('.lh').textContent.includes('P-1'):false,auto:[...document.querySelectorAll('#modal ul.logs li.au')].some(e=>/불량 등록/.test(e.textContent)),own:li('이슈에서 쓴 기록').querySelectorAll('.la button,.la summary').length};
      document.querySelector('#modal .lgh input[type=checkbox]').click();await wait(150);o.hide=document.querySelectorAll('#modal ul.logs li.au').length;tl.hideAuto=false;
      mfDirty=false;closeModal(true);db.issues=db.issues.filter(x=>x.id!=='lnk1');db.defects=db.defects.filter(x=>x.id!=='lnkd');go('dash');return o}""")
    ok(r["def"]["shown"] and r["def"]["src"] and r["def"]["acts"] == 0 and r["def"]["ro"] and r["def"]["own"] >= 2, f"불량 진행 창: 이슈의 기록이 ‘이슈 ISS-LNK’ 표시와 함께 읽기 전용으로 보임 ({r['def']})")
    ok(r["def"]["order"] == "불량에서 쓴 기록>이슈에서 쓴 기록", f"이슈 기록과 불량 기록이 한 줄로 이어짐 — 최근 것이 위 ({r['def']['order']})")
    ok(not r["report"], "보고서 · 마지막 진행 계산에는 이슈 기록을 넣지 않음 (화면 · 기록 출력에서만 이어 보임)")
    ok(r["iss"]["shown"] and r["iss"]["acts"] == 0 and r["iss"]["src"] and r["iss"]["auto"] and r["iss"]["own"] >= 2 and r["hide"] == 0, f"이슈 창: 이 이슈에서 만든 불량의 기록 · 자동 기록이 읽기 전용으로 보임 · 자동 기록 숨기기 ({r['iss']})")
    # 기록 칸의 배치: 목록이 먼저 · 작성 칸은 ‘기록 남기기’로 엶 · 취소 처리와 삭제는 ⋯ 메뉴 안
    r = A.evaluate("""async()=>{const wait=ms=>window.__settle(ms),q=s=>document.querySelector(s),o={};mfDirty=false;closeModal(true);
      const i={id:'lay1',no:'ISS-LAY',title:'배치',at:'2026-11-10T09:00',urg:'보통',logs:[],photos:[],defectIds:[],caseIds:[],createdAt:now()};db.issues.push(i);go('issue');issOpen('lay1');await wait(300);
      o.empty={form:!!q('#modal .lgc'),btn:!!q('#lgOpenBtn')};
      q('#lgText').value='첫 기록';addLog();await wait(300);
      o.closed={form:!!q('#modal .lgc'),btn:!!q('#lgOpenBtn'),btnText:q('#lgOpenBtn').textContent.trim()};
      q('#lgOpenBtn').click();await wait(150);const f=q('#modal .lgc'),l=q('#modal ul.logs'),h=q('#modal .lgh');
      o.open={form:!!f,btn:!!q('#lgOpenBtn'),focus:document.activeElement===q('#lgText'),order:h.getBoundingClientRect().top<f.getBoundingClientRect().top&&f.getBoundingClientRect().top<l.getBoundingClientRect().top};
      lgClear();await wait(150);
      const li=q('#modal ul.logs li'),m=li.querySelector('details.lgm');
      o.acts={edit:[...li.querySelectorAll('.la>button')].map(b=>b.textContent).join(),inline:[...li.querySelectorAll('.la>a,.la>button')].some(b=>/삭제|취소 처리/.test(b.textContent)),menu:[...m.querySelectorAll('.mn button')].map(b=>b.textContent.trim().split(' —')[0]).join(),hidden:!m.open};
      m.querySelector('summary').click();await wait(100);o.menuOpen=m.open&&m.querySelector('.mn').getBoundingClientRect().height>40;
      q('#modal #mt').click();await wait(100);o.outside=!m.open;
      o.emoji=/[\\u{1F4CE}\\u{270E}]/u.test(q('#logBox').textContent);
      mfDirty=false;closeModal(true);db.issues=db.issues.filter(x=>x.id!=='lay1');save();go('dash');return o}""")
    ok(r["empty"] == {"form": True, "btn": False}, "기록이 없는 건은 작성 칸이 처음부터 열려 있음")
    ok(r["closed"] == {"form": False, "btn": True, "btnText": "기록 남기기"}, f"기록을 저장하면 작성 칸을 접고 ‘기록 남기기’ 단추를 보임 ({r['closed']})")
    ok(r["open"] == {"form": True, "btn": False, "focus": True, "order": True}, f"‘기록 남기기’ → 작성 칸이 목록 위에 열리고 내용 칸에 커서 ({r['open']})")
    ok(r["acts"] == {"edit": "수정", "inline": False, "menu": "취소 처리,삭제", "hidden": True}, f"기록의 단추: ‘수정’만 밖에 · ‘취소 처리’ · ‘삭제’는 ⋯ 메뉴 안 ({r['acts']})")
    ok(r["menuOpen"] and r["outside"] and not r["emoji"], "⋯ 메뉴: 누르면 열리고 바깥을 누르면 닫힘 · 그림 문자 아이콘 없음")
    ok(not A._errs, f"이슈 기록 첨부: 화면 오류 없음 {A._errs[:2]}")
