"""화면 시험 — 불량: 실행 기록 삭제 · 등록 창
   실행: python tests/e2e_browser.py tests/sample_backup.json --only defect"""
import json      # noqa: F401
import os      # noqa: F401
import signal      # noqa: F401
import time      # noqa: F401

from e2e_lib import ROOT, URL, logform, ok, settle, start      # noqa: F401


def run(c):
    A, B, C, tmp, env, b = c.A, c.B, c.C, c.tmp, c.env, c.b
    # 실행 기록 삭제: 저장된 기록 · 취소 처리된 기록을 목록에서 없앨 수 있음
    did = A.evaluate("db.defects.find(d=>!d.deleted).id")
    A.evaluate("i=>{state.tab='defect';render();openLog(i)}", did); settle(A, 500)
    n0 = A.evaluate("tl.own.length")
    for t in ("삭제 시험 기록 1", "삭제 시험 기록 2"):
        logform(A); A.fill("#lgText", t); A.click("#modal .lgc button.p:has-text('저장')"); settle(A, 250)
    r = A.evaluate("""i=>{lgOpen();const d=db.defects.find(x=>x.id===i),b=[...document.querySelectorAll('#modal .lgc .cf button')].map(x=>x.textContent).join();
      return {b,open:document.querySelector('#modal').classList.contains('on'),saved:(d.logs||[]).filter(l=>/삭제 시험 기록/.test(l.text)).length,pend:tl.own.filter(x=>x._new).length,dirty:mfDirty,empty:document.querySelector('#lgText').value===''}}""", did)
    ok(r["b"] == "취소,저장", f"실행 기록 작성 칸: 취소 · 저장 단추 ({r['b']})")
    ok(r["open"] and r["saved"] == 2 and r["pend"] == 0 and not r["dirty"] and r["empty"], f"작성 칸의 저장 → 창을 닫지 않고 바로 저장 · 작성 칸 비움 ({r})")
    logform(A); A.fill("#lgText", "쓰다 만 내용"); A.fill("#lgParty", "누구"); A.click("#modal .lgc .cf button:has-text('취소')"); settle(A, 200)
    ok(A.evaluate("!document.querySelector('#modal .lgc')&&!!document.querySelector('#lgOpenBtn')") and not A.evaluate("mfDirty") and A.locator("#modal.on").count() == 1, "작성 칸의 취소 → 쓰던 내용만 지움 (창은 그대로)")
    A.click("#mfoot button.p:has-text('저장')"); settle(A, 900)
    A.evaluate("i=>openLog(i)", did); settle(A, 500)
    ok(A.evaluate("tl.own.length") == n0 + 2 and A.evaluate("tl.own.every(x=>!x._new)"), "실행 기록 2건 저장됨")
    A.evaluate("()=>{const k=tl.own.findIndex(x=>x.text==='삭제 시험 기록 1');tl.own[k].void={at:now(),by:'t',reason:'시험'};renderLogs(false)}"); settle(A, 150)
    ok(A.locator("#modal ul.logs li.vd .lgm .mn button").count() == 1 and A.locator("#modal ul.logs li.vd .lgm .mn button.d").count() == 1, "취소 처리된 기록: ⋯ 메뉴에 삭제만 있음")
    A.click("#modal ul.logs li.vd .lgm summary"); A.click("#modal ul.logs li.vd .lgm .mn button.d"); settle(A, 300)   # 확인 창은 이 시험 화면에서 자동 승인(위에서 askConfirm 대체)
    A.click("#modal ul.logs li:has-text('삭제 시험 기록 2') .lgm summary"); A.click("#modal ul.logs li:has-text('삭제 시험 기록 2') .lgm .mn button.d"); settle(A, 300)
    A.click("#mfoot button.p:has-text('저장')"); settle(A, 900)
    ok(A.evaluate("i=>(db.defects.find(d=>d.id===i).logs||[]).filter(l=>/삭제 시험 기록/.test(l.text)).length", did) == 0, "실행 기록 삭제 → 저장 후 사라짐")
    ok(A.evaluate("i=>(db.defects.find(d=>d.id===i).logs||[]).length", did) == n0, "다른 기록은 그대로")

    # 불량 등록 창에는 FAR · RCA 가 없음 (등록만). NCR · 사내 대책 단계는 남음. 불량 진행 창 · 목록의 후속 조치 칸은 그대로
    r = A.evaluate("""async()=>{const wait=ms=>window.__settle(ms),q=s=>document.querySelector(s),out={};
      const mk=(id,resp,x)=>{const d={id,date:today(),source:'수입검사',partNo:'P-1',supplierId:(db.suppliers[0]||{}).id||'',type:'치수',qty:3,resp,logs:[],photos:[],createdAt:now(),...x};db.defects.push(d);return d};
      const d1=mk('dnf1','미정',{inv:{farReq:today()}});mk('dnf2','협력사',{});mk('dnf3','사내',{});
      const look=async id=>{editDefect(id);await wait(350);const m=q('#mbody'),rb=q('#routeBox'),t=m.textContent;
        const o={sec:[...m.querySelectorAll('.sec')].some(e=>/^귀책 조사/.test(e.textContent.trim())),open:/귀책 조사 열기|저장하면 귀책 조사/.test(t),route:rb?[...rb.querySelectorAll('.ri b')].map(e=>e.textContent).join('|'):'',btn:rb?[...rb.querySelectorAll('button')].map(e=>e.textContent).join('|'):'',help:/FAR 화면에서 판정/.test(t)&&!/FAR·RCA 조사 후 판정/.test(t)};
        mfDirty=false;closeModal(true);return o};
      out.a=await look('dnf1');out.b=await look('dnf2');out.c=await look('dnf3');
      openLog('dnf1');await wait(300);out.log=[...document.querySelectorAll('#mbody .route .ri b')].map(e=>e.textContent).join('|');mfDirty=false;closeModal(true);
      out.cell=actCell(d1).replace(/<[^>]+>/g,' ');
      db.defects=db.defects.filter(x=>!/^dnf/.test(x.id));return out}""")
    ok(not r["a"]["sec"] and not r["a"]["open"] and r["a"]["help"], "불량 등록 창: 귀책 조사(FAR) 블록이 없음 · 안내 문구는 ‘FAR 화면에서 판정’")
    ok("FAR" not in r["a"]["route"] and "RCA" not in r["a"]["route"] and "FAR" not in r["a"]["btn"] and "RCA" not in r["a"]["btn"], f"불량 등록 창(귀책 미정): 다음 단계에 FAR · RCA 가 없음 ({r['a']['route']})")
    ok("NCR 발행" in r["b"]["route"] and "NCR 발행" in r["b"]["btn"] and "RCA" not in r["b"]["route"], f"불량 등록 창(협력사): NCR 발행 단계는 남음 ({r['b']['route']})")
    ok("RCA" not in r["c"]["route"] and "RCA" not in r["c"]["btn"], f"불량 등록 창(사내): RCA 단추가 없음 ({r['c']['route']} / {r['c']['btn']})")
    ok("FAR 요청" in r["log"] and "RCA" in r["log"] and "FAR" in r["cell"], f"불량 진행 창 · 목록의 후속 조치 칸에는 FAR · RCA 가 그대로 있음 ({r['cell'].strip()[:30]})")

    # 첨부 공통 부품: 불량 사진 · 실행 기록 증빙 · 휴대폰 사진이 같은 모양의 기록을 만듦 (줄인 그림 + 작은 그림) · 특채 문서는 내용 그대로
    r = A.evaluate("""async()=>{const wait=ms=>window.__settle(ms),q=s=>document.querySelector(s),out={};
      const bin=atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),u=new Uint8Array(bin.length);for(let k=0;k<bin.length;k++)u[k]=bin.charCodeAt(k);
      const png=()=>new File([u],'현장.png',{type:'image/png'}),pdf=new File(['%PDF-1.4'],'특채.pdf',{type:'application/pdf'});
      const good=r=>!!r&&/^data:image\\//.test(r.data)&&/^data:image\\//.test(r.thumb)&&!!r.id&&!!r.createdAt;
      const id=db.defects.find(d=>!d.deleted).id;
      editDefect(id);await wait(400);const n0=curPhotos.length;await addPhotoFiles([png()]);const p=curPhotos[curPhotos.length-1];
      out.photo={n:curPhotos.length-n0,ok:good(p),name:p.name,isNew:p.isNew===true,dirty:mfDirty};mfDirty=false;closeModal(true);
      openLog(id);await wait(400);await lgAddFiles([png()]);const lid=tl.draftPh[tl.draftPh.length-1],l=tl.newPh[lid];
      out.log={ok:good(l),isNew:l&&l.isNew===true,shown:document.querySelectorAll('#logBox .lgph img').length>0};await lgAddFiles([pdf]);
      out.log.doc=tl.draftPh.length===2&&document.querySelectorAll('#logBox .lgc .lgph .t.dc').length===1&&/특채.pdf/.test(q('#logBox .lgc .lgph').textContent);tl.draftPh=[];tl.newPh={};mfDirty=false;closeModal(true);
      const im=await attImgRec(png(),'사진.jpg');out.rec={keys:Object.keys(im).sort().join(),ok:good(im)};
      const dc=await attDocRec(pdf,20);out.doc={kind:dc.kind,name:dc.name,mime:dc.mime,size:dc.size,data:/^data:application\\/pdf;base64,/.test(dc.data),thumb:dc.thumb,isNew:dc.isNew};
      const big=await attDocRec({name:'큰파일.zip',size:21*1048576,type:''},20);out.big=big===null&&/20MB/.test(q('#toast').textContent);
      const d0=db.deleted.length;attDrop([]);const d1=db.deleted.length;attDrop(['zz-none']);out.drop=d1===d0&&db.deleted.length===d0+1&&db.deleted[db.deleted.length-1].id==='zz-none';db.deleted.pop();
      return out}""".replace("\\\\", "\\"))
    ok(r["photo"]["n"] == 1 and r["photo"]["ok"] and r["photo"]["name"] == "현장.png" and r["photo"]["isNew"] and r["photo"]["dirty"], f"불량 사진 추가: 줄인 그림 + 작은 그림 ({r['photo']})")
    ok(r["log"]["ok"] and r["log"]["isNew"] and r["log"]["shown"] and r["log"]["doc"], f"실행 기록 증빙: 이미지 + 문서 파일 · 바로 보임 ({r['log']})")
    ok(r["rec"]["ok"] and r["rec"]["keys"] == "caption,createdAt,data,id,isNew,name,thumb", f"첨부 공통 부품(이미지): 기록 모양 ({r['rec']['keys']})")
    ok(r["doc"] == {"kind": "doc", "name": "특채.pdf", "mime": "application/pdf", "size": 8, "data": True, "thumb": "", "isNew": True}, f"첨부 공통 부품(문서): 내용 그대로 ({r['doc']})")
    ok(r["big"] and r["drop"], "첨부 공통 부품: 20MB 넘으면 거절 · 지울 때 삭제 표시를 남김")

    # 크게 보기의 ‘원본 저장’: 저장 이름의 확장자는 내용의 형식에 맞춤 (확장자가 없거나 틀리면 파일이 안 열림)
    r = A.evaluate("""()=>{const px='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';const o=[];
      lbOpen([{id:'a',name:'image',data:px},{id:'b',name:'현장.png',data:'data:image/jpeg;base64,/9j/4AAQ'},{id:'c',name:'',data:px}],0);o.push(document.querySelector('#lbdl').getAttribute('download'));
      lbMove(1);o.push(document.querySelector('#lbdl').getAttribute('download'));lbMove(1);o.push(document.querySelector('#lbdl').getAttribute('download'));closeLb();return o}""")
    ok(r == ["image.png", "현장.jpg", "photo.png"], f"원본 저장 이름: 내용 형식의 확장자 ({r})")
    # 기록 공통 구조: 일시(시각 · 시간대는 선택) · 같은 날은 시각 순서(최근이 위, 시간 모름은 맨 위) · 수정하면 원문의 일시도 이력에 남음
    r = A.evaluate("""async()=>{const wait=ms=>window.__settle(ms),q=s=>document.querySelector(s),out={};
      const d={id:'dlu1',date:'2026-11-10',source:'수입검사',partNo:'P-1',type:'치수',qty:1,resp:'협력사',logs:[{id:'old1',date:'2026-11-10',kind:'조사',party:'',method:'',text:'예전 기록 (시각 없음)',result:'',photos:[],by:'t',at:'2026-11-10T01:00:00.000Z'}],photos:[],createdAt:now()};db.defects.push(d);
      openLog('dlu1');await wait(400);
      lgOpen();out.form={dtp:!!q('#lgAtD')&&!!q('#lgAtB')&&!!q('#lgAtT'),band:q('#lgAtB').value,tHidden:q('#lgAtT').style.display==='none',lab:[...document.querySelectorAll('#logBox .lgc label')].map(e=>e.textContent.trim().slice(0,7)).join('|')};
      const add=async(b,t,tx)=>{if(!q('#lgText'))lgOpen();q('#lgAtD').value='2026-11-10';q('#lgAtB').value=b;dtpBand('lgAt');if(t)q('#lgAtT').value=t;q('#lgText').value=tx;addLog();await wait(250)};
      await add('','14:30','오후 두 시 반');await add('오전','','오전 기록');await add('?','','시간 모름 기록');
      const cur=()=>db.defects.find(x=>x.id==='dlu1'),rec=tx=>cur().logs.find(l=>l.text===tx);
      out.saved={t:rec('오후 두 시 반').time,b:rec('오후 두 시 반').band,t2:rec('오전 기록').time,b2:rec('오전 기록').band,t3:rec('시간 모름 기록').time,b3:rec('시간 모름 기록').band,date:rec('오전 기록').date};
      const texts=()=>[...document.querySelectorAll('#logBox ul.logs li:not(.au) .lt')].map(e=>e.textContent.trim());
      out.order=texts().join('>');out.when=[...document.querySelectorAll('#logBox ul.logs li:not(.au) .lh b')].map(e=>e.textContent).join('|');
      lgEdit(tl.own.findIndex(x=>x.text==='오전 기록'));await wait(200);q('#leAtB').value='';dtpBand('leAt');q('#leAtT').value='16:00';saveLog(tl.edit);await wait(200);
      out.needReason=/수정 사유/.test(q('#toast').textContent)&&tl.edit!=null;q('#leReason').value='시각 확인';saveLog(tl.edit);await wait(300);
      const e=rec('오전 기록');out.edit={t:e.time,b:e.band,h:(e.hist||[]).length,hb:e.hist[0].band,ht:e.hist[0].time};out.order2=texts().join('>');
      mfDirty=false;closeModal(true);db.defects=db.defects.filter(x=>x.id!=='dlu1');return out}""")
    ok(r["form"]["dtp"] and r["form"]["band"] == "?" and r["form"]["tHidden"], f"실행 기록 작성 칸: 일시(날짜 + 시각 선택) — 처음은 ‘시간 모름’ ({r['form']['lab']})")
    ok(r["saved"] == {"t": "14:30", "b": "", "t2": "", "b2": "오전", "t3": "", "b3": "", "date": "2026-11-10"}, f"기록에 시각 · 시간대가 저장됨 ({r['saved']})")
    ok(r["order"] == "시간 모름 기록>예전 기록 (시각 없음)>오후 두 시 반>오전 기록" or r["order"] == "예전 기록 (시각 없음)>시간 모름 기록>오후 두 시 반>오전 기록", f"같은 날 순서: 시간 모름 → 늦은 시각 → 이른 시각 ({r['order']})")
    ok("2026-11-10 14:30" in r["when"] and "2026-11-10 오전" in r["when"], f"기록에 일시가 보임 ({r['when']})")
    ok(r["needReason"] and r["edit"] == {"t": "16:00", "b": "", "h": 1, "hb": "오전", "ht": ""}, f"시각 수정: 사유 필수 · 원문의 시간대가 이력에 남음 ({r['edit']})")
    ok(r["order2"].index("오전 기록") < r["order2"].index("오후 두 시 반"), f"시각을 16:00 으로 고치면 14:30 보다 위 ({r['order2']})")

    # 불량 목록 ‘진행 · 다음 할 일’ 칸: 다음 할 일 버튼은 한 개, 나머지는 ⋯ 안. 기록 버튼은 글자 이름. 불량 창은 번호 카드 + 접는 줄
    r = A.evaluate("""async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));const out={};
      go('defect');await wait(300);
      out.th=[...document.querySelectorAll('#view thead th')].map(x=>x.textContent).join('|');
      const cells=[...document.querySelectorAll('#view td.actc')];
      out.maxBtn=Math.max(...cells.map(c=>[...c.querySelectorAll('.act.nx > button')].length));
      out.hidden=cells.some(c=>{const m=c.querySelector('.actm');return m&&!m.open&&m.querySelectorAll('.mn button').length>0});
      out.wait=document.querySelector('#view').textContent.includes('귀책 판정 후');
      out.rec=[...document.querySelectorAll('#view button.lgchip')].map(b=>b.textContent.trim())[0]||'';
      const d=db.defects[0];editDefect(d.id);await wait(350);
      out.cards=[...document.querySelectorAll('#mf .fgrp.dfn')].filter(e=>e.offsetParent).length;
      out.folds=[...document.querySelectorAll('#mf details.dfold > summary')].map(s=>s.textContent.trim().slice(0,6)).join('|');
      out.sevOpen=document.querySelector('#sevWrap').open;out.route=!!document.querySelector('.dfnext #routeBox');
      out.recBtn=(document.querySelector('.dfrec button')||{}).textContent||'';
      mfDirty=false;closeModal(true);editDefect();await wait(300);out.newSev=document.querySelector('#sevWrap').open;out.newNext=!!document.querySelector('.dfnext');
      mfDirty=false;closeModal(true);return out}""")
    ok("진행 · 다음 할 일" in r["th"] and "후속 조치" not in r["th"], "불량 목록: 칸 이름 ‘진행 · 다음 할 일’")
    ok(r["maxBtn"] == 1 and r["hidden"] and not r["wait"], f"불량 목록: 다음 할 일 버튼은 줄마다 한 개 · 나머지는 ⋯ 안 · 누를 수 없는 ‘귀책 판정 후’ 없음 ({r['maxBtn']})")
    ok(r["rec"].startswith("기록"), f"불량 목록: 기록 버튼에 글자 이름 ({r['rec']})")
    ok(r["cards"] >= 5 and r["folds"].startswith("심각도 평가") and "비용" in r["folds"] and "사진" in r["folds"], f"불량 창: 번호 카드 {r['cards']}개 + 접는 줄 ({r['folds']})")
    ok(not r["sevOpen"] and r["newSev"] and r["route"] and not r["newNext"], "불량 창: 심각도 평가는 등록된 불량에서 접힘 · 새 불량에서 펼침 · 다음 단계는 등록된 불량에만")
    ok("진행 기록" in r["recBtn"], f"불량 창: 진행 기록 버튼 ({r['recBtn'].strip()})")

    # 현장 도구 모양 (불량 목록): 카드 테두리 없음 · 정상 값은 배지 배경 없음 · 색 버튼은 ‘+ 불량 등록’ 한 개
    r = A.evaluate("""async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));go('defect');await wait(300);
      const cs=e=>getComputedStyle(e),clear=c=>c==='rgba(0, 0, 0, 0)'||c==='transparent',pri=cs(document.querySelector('.pl .pltool button.b.p')).backgroundColor;
      const bgs=[...document.querySelectorAll('.pl .tw .bg')];
      return {card:parseFloat(cs(document.querySelector('.pl #dtab')).borderTopWidth),
        badge:bgs.length>0&&bgs.every(b=>clear(cs(b).backgroundColor)),
        colored:[...document.querySelectorAll('.pl button.b')].filter(b=>cs(b).backgroundColor===pri).map(b=>b.textContent.trim()).join(),
        radius:parseFloat(cs(document.querySelector('.pl .tw button.b')).borderTopLeftRadius),
        emoji:/[\\u{1F4DD}\\u{1F4F7}]/u.test(document.querySelector('.pl').textContent)}}""")
    ok(r["card"] == 0 and r["badge"], "불량 목록: 카드 테두리 없음 · 표 안의 배지는 배경 없는 글자")
    ok(r["colored"] == "+ 불량 등록" and r["radius"] <= 4 and not r["emoji"], f"불량 목록: 색 버튼은 ‘+ 불량 등록’ 한 개 · 모서리 {r['radius']}px · 그림 문자 없음 ({r['colored']})")

