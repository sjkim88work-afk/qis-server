"""화면 시험 — 불량: 실행 기록 삭제 · 등록 창
   실행: python tests/e2e_browser.py tests/sample_backup.json --only defect"""
import json      # noqa: F401
import os      # noqa: F401
import signal      # noqa: F401
import time      # noqa: F401

from e2e_lib import ROOT, URL, ok, settle, start      # noqa: F401


def run(c):
    A, B, C, tmp, env, b = c.A, c.B, c.C, c.tmp, c.env, c.b
    # 실행 기록 삭제: 저장된 기록 · 취소 처리된 기록을 목록에서 없앨 수 있음
    did = A.evaluate("db.defects.find(d=>!d.deleted).id")
    A.evaluate("i=>{state.tab='defect';render();openLog(i)}", did); settle(A, 500)
    n0 = A.evaluate("tl.own.length")
    for t in ("삭제 시험 기록 1", "삭제 시험 기록 2"):
        A.fill("#lgText", t); A.click("#modal .lgc button.p:has-text('저장')"); settle(A, 250)
    r = A.evaluate("""i=>{const d=db.defects.find(x=>x.id===i),b=[...document.querySelectorAll('#modal .lgc .cf button')].map(x=>x.textContent).join();
      return {b,open:document.querySelector('#modal').classList.contains('on'),saved:(d.logs||[]).filter(l=>/삭제 시험 기록/.test(l.text)).length,pend:tl.own.filter(x=>x._new).length,dirty:mfDirty,empty:document.querySelector('#lgText').value===''}}""", did)
    ok(r["b"] == "취소,저장", f"실행 기록 작성 칸: 취소 · 저장 단추 ({r['b']})")
    ok(r["open"] and r["saved"] == 2 and r["pend"] == 0 and not r["dirty"] and r["empty"], f"작성 칸의 저장 → 창을 닫지 않고 바로 저장 · 작성 칸 비움 ({r})")
    A.fill("#lgText", "쓰다 만 내용"); A.fill("#lgParty", "누구"); A.click("#modal .lgc .cf button:has-text('취소')"); settle(A, 200)
    ok(A.evaluate("document.querySelector('#lgText').value+document.querySelector('#lgParty').value") == "" and not A.evaluate("mfDirty") and A.locator("#modal.on").count() == 1, "작성 칸의 취소 → 쓰던 내용만 지움 (창은 그대로)")
    A.click("#mfoot button.p:has-text('저장')"); settle(A, 900)
    A.evaluate("i=>openLog(i)", did); settle(A, 500)
    ok(A.evaluate("tl.own.length") == n0 + 2 and A.evaluate("tl.own.every(x=>!x._new)"), "실행 기록 2건 저장됨")
    A.evaluate("()=>{const k=tl.own.findIndex(x=>x.text==='삭제 시험 기록 1');tl.own[k].void={at:now(),by:'t',reason:'시험'};renderLogs(false)}"); settle(A, 150)
    ok(A.locator("#modal ul.logs li.vd a:has-text('삭제')").count() == 1, "취소 처리된 기록에 삭제 단추")
    A.click("#modal ul.logs li.vd a:has-text('삭제')"); settle(A, 300)   # 확인 창은 이 시험 화면에서 자동 승인(위에서 askConfirm 대체)
    A.click("#modal ul.logs li:has-text('삭제 시험 기록 2') a:has-text('삭제')"); settle(A, 300)
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
