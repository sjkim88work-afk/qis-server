"""화면 시험 — RCA 상세 창
   실행: python tests/e2e_browser.py tests/sample_backup.json --only rca"""
import json      # noqa: F401
import os      # noqa: F401
import signal      # noqa: F401
import time      # noqa: F401

from e2e_lib import ROOT, URL, ok, settle, start      # noqa: F401


def run(c):
    A, B, C, tmp, env, b = c.A, c.B, c.C, c.tmp, c.env, c.b
    # RCA 상세: 페이지가 아니라 창(팝업)으로 — NCR / 8D 처럼
    r = A.evaluate("""async () => {const wait=ms=>window.__settle(ms),o={},q=s=>document.querySelector(s),m=q('#modal'),o0=window.askConfirm;let asked=0;window.askConfirm=async()=>{asked++;return true};
      mfDirty=false;closeModal(true);const c=czCreateCase({Title:'팝업 시험 RCA',Tier:'TIER 1'});save();go('defect');await wait(200);
      await czOpenCase(c.id);await wait(250);
      o.on=m.classList.contains('on')&&m.dataset.cz===c.id;o.tab=state.tab;o.title=q('#mt').textContent;o.inView=!!q('#view .chead');o.inModal=!!q('#modal .czm .chead');
      o.foot=[...q('#mfoot').children].map(e=>e.className.includes('mfsp')?'|':e.textContent).join(',');o.back=!!q('#modal [data-v="cases"]');
      q('#modal .tab[data-tab="actions"]').click();await wait(200);o.tabOn=q('#modal .tab.on').dataset.tab;o.stillOn=m.dataset.cz===c.id;
      q('#modal .tab[data-tab="basic"]').click();await wait(200);
      const na=q('#modal [data-scope="case"][data-f="NextAction"]');na.focus();na.value='창에서 고친 다음 행동';na.dispatchEvent(new Event('input',{bubbles:true}));na.dispatchEvent(new Event('change',{bubbles:true}));await wait(250);
      o.saved=czById('cases',c.id).NextAction;o.focus=document.activeElement&&document.activeElement.dataset.f;o.dirty=mfDirty;
      window._cz={id:c.id,o0,n:()=>asked};asked=0;o.id=c.id;return o}""")
    settle(A, 900); C.evaluate("srvSync()"); settle(C, 900)
    rc = C.evaluate("""async id => {const wait=ms=>window.__settle(ms),q=s=>document.querySelector(s);if(!czById('cases',id))return {has:false};
      await czOpenCase(id);await wait(400);const vis=e=>e.offsetParent!==null;
      const o={has:true,on:q('#modal').dataset.cz===id,foot:[...q('#mfoot').querySelectorAll('button')].map(e=>e.textContent).join(),
        locked:[...document.querySelectorAll('#czm input,#czm select,#czm textarea')].every(e=>e.disabled),
        acts:[...document.querySelectorAll('#czm [data-act]')].filter(e=>vis(e)&&!['tab','report','gotoTab'].includes(e.dataset.act)).map(e=>e.dataset.act).join()};
      await closeModal(true);return o}""", r["id"])
    ok(rc.get("has") and rc["on"] and rc["foot"] == "닫기" and rc["locked"] and rc["acts"] in ("", "showGate"), f"조회: RCA 창은 보기만 (단추 {rc.get('foot')} · 입력 잠금 · {rc.get('acts')})")
    A.click('#modal [data-scope="case"][data-f="Title"]'); A.keyboard.press("End"); A.keyboard.type(" 닫을 때 저장"); A.click("#mfoot button:has-text('닫기')"); settle(A, 400)
    r.update(A.evaluate("""async () => {const wait=ms=>window.__settle(ms),o={},q=s=>document.querySelector(s),m=q('#modal'),c=czById('cases',window._cz.id),o0=window._cz.o0;
      o.closed=!m.classList.contains('on');o.asked=window._cz.n();o.title2=c.Title;o.openId=czUi.openId;
      await czOpenCase(c.id);await wait(200);editNcr(db.ncrs[0].id);await wait(250);o.ncr=!m.dataset.cz&&/NCR|QNCN|통보/.test(q('#mt').textContent+q('#mbody').textContent.slice(0,400));
      mfDirty=false;await closeModal(true);await wait(250);o.ret=m.classList.contains('on')&&m.dataset.cz===c.id;
      await closeModal();await wait(150);o.closed2=!m.classList.contains('on')&&czUi.openId==null;
      const iz={id:'isz',no:'ISS-Z',title:'돌아오기 시험',at:today(),urg:'보통',logs:[],photos:[],defectIds:[],caseIds:[c.id],createdAt:now()};db.issues.push(iz);go('issue');issOpen('isz');await wait(200);
      await czOpenCase(c.id);await wait(200);o.i1=m.dataset.cz===c.id&&state.tab==='issue';await closeModal();await wait(200);o.i2=m.classList.contains('on')&&m.dataset.iss==='isz';await closeModal(true);db.issues=db.issues.filter(x=>x!==iz);render();
      await czOpenCase(c.id);await wait(200);q('#mfoot button.d').click();await wait(400);o.deleted=!czById('cases',c.id)&&!m.classList.contains('on');
      hideUndo();window.askConfirm=o0;delete window._cz;render();return o}"""))
    ok(r["on"] and r["tab"] == "defect" and r["inModal"] and not r["inView"] and not r["back"], f"RCA 상세가 창으로 열림 · 보던 화면(불량 관리)은 그대로 ({r['title']})")
    ok(r["foot"] == "RCA 삭제,|,닫기,저장", f"RCA 창 아래 단추: 삭제는 왼쪽 끝 · 닫기 · 저장 ({r['foot']})")
    ok(r["tabOn"] == "actions" and r["stillOn"], "RCA 창 안에서 탭을 바꿔도 창이 유지됨")
    ok(r["saved"] == "창에서 고친 다음 행동" and r["focus"] == "NextAction" and not r["dirty"], "RCA 창: 칸을 고치면 바로 저장 · 쓰던 칸 유지")
    ok(r["closed"] and r["asked"] == 0 and r["title2"] == "팝업 시험 RCA 닫을 때 저장" and r["openId"] is None, "RCA 창: 쓰던 칸을 저장하고 닫음 (확인을 묻지 않음)")
    ok(r["ncr"] and r["ret"] and r["closed2"], "RCA 창에서 NCR 창을 열고 닫으면 RCA 창으로 돌아옴")
    ok(r["i1"] and r["i2"], "이슈 상세에서 RCA 창을 열고 닫으면 이슈 상세로 돌아옴")
    ok(r["deleted"], "RCA 삭제 → 창이 닫힘")

    # RCA 메뉴는 목록이 먼저 (‘오늘 할 일’ 탭 없음). ‘내가 볼 것’ 단추로 재확인일이 된 RCA 만 보고, 그 줄에서 +2일
    r = A.evaluate("""async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),q=s=>document.querySelector(s),o={};
      go('prog');await wait(250);o.prog=state.tab;go('case');await wait(250);o.view=czUi.view;
      o.tabs=[...document.querySelectorAll('.cz .seg a')].map(a=>a.textContent.trim().replace(/\\s*\\d+$/,'')).join('|');
      o.h1=q('.cz h1').textContent;
      const c={id:'t_rca_todo',CaseNo:'RCA-T-0001',Title:'시험용',Status:'진행중',Stage:CZ_STAGES[0],Tier:'TIER 1',Ball:'나',RecheckDate:today(),Created:today(),DefectIds:[]};db.cases.push(c);czUi.filt.status='';czUi.filt.todo='';render();await wait(200);
      const btn=[...document.querySelectorAll('.cz .bar button')].find(b=>b.textContent.includes('내가 볼 것'));o.n=btn.textContent.trim();
      btn.click();await wait(250);o.rows=document.querySelectorAll('.cz table.t tbody tr.click').length;o.on=[...document.querySelectorAll('.cz .bar button.on')].length;
      const bump=q('.cz table.t tbody [data-act=bump]');o.bump=!!bump;if(bump){bump.click();await wait(300)}
      o.bumpTxt=bump?bump.textContent:'';o.after=db.cases.find(x=>x.id===c.id).RecheckDate>today();o.modal=q('#modal').classList.contains('on');
      db.cases=db.cases.filter(x=>x.id!==c.id);czUi.filt.todo='';czUi.filt.status='미종결';save();render();return o}""")
    ok(r["prog"] == "prog" and r["view"] == "cases" and r["tabs"] == "RCA 목록|조치" and "오늘 할 일" not in r["tabs"] and "RCA" in r["h1"], f"RCA 메뉴: 목록이 먼저 · ‘오늘 할 일’ 탭 없음 ({r['tabs']})")
    if not r.get("skip"):
        ok(r["rows"] >= 1 and r["on"] == 1 and r["bump"] and r["bumpTxt"] == "2일 뒤 다시 보기" and r["after"] and not r["modal"], f"RCA 목록: ‘내가 볼 것’ 단추로 거르고 그 줄에서 +2일 (창은 열리지 않음) ({r['n']} · {r['rows']}줄)")

