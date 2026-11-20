"""화면 시험 — 디자인: 사이드바 · 표 밀도 · 좁은 화면
   실행: python tests/e2e_browser.py tests/sample_backup.json --only design"""
import json      # noqa: F401
import os      # noqa: F401
import signal      # noqa: F401
import time      # noqa: F401

from e2e_lib import ROOT, URL, ok, settle, start      # noqa: F401


def run(c):
    A, B, C, tmp, env, b = c.A, c.B, c.C, c.tmp, c.env, c.b
    # 2026-11 디자인 리뉴얼: 좌측 사이드바(창 1400px 이상) · 로그아웃 단추가 항상 있음 · 표 밀도 · 단추 칸 고정 · 좁은 화면 보정
    NAVST = """()=>{const q=s=>document.querySelector(s),v=e=>!!e&&e.offsetParent!==null,o=q('#hdrOut'),n=q('#nav'),r=o?o.getBoundingClientRect():null;
      return {side:getComputedStyle(document.body).display==='grid',mob:document.body.classList.contains('mob'),out:v(o),user:v(q('#srvUser')),
        outIn:o?(o.closest('nav')?'nav':o.closest('header')?'header':'?'):'none',inView:!!r&&r.top>=0&&r.bottom<=innerHeight,navW:n?n.offsetWidth:0,
        gh:[...document.querySelectorAll('#nav .gh')].filter(v).map(e=>e.textContent).join(','),
        order:[...q('header').children].map(e=>e.id).filter(Boolean).join(',')}}"""
    A.evaluate("()=>{mfDirty=false;closeModal(true);go('dash')}"); settle(A, 300)
    s1 = A.evaluate(NAVST)
    ok(s1["side"] and s1["navW"] == 200 and s1["gh"] == "업무,분석,관리", f"창 1400px: 좌측 사이드바 · 묶음 머리글 ({s1['gh']})")
    ok(s1["outIn"] == "nav" and s1["out"] and s1["user"] and s1["inView"], "사이드바: 사용자 · 로그아웃은 사이드바 아래 칸")
    A.set_viewport_size({"width": 1400, "height": 560}); settle(A, 300)
    s2 = A.evaluate(NAVST)
    ok(s2["out"] and s2["inView"], "창이 낮아도(560px) 로그아웃 단추가 보임 — 아래 칸 고정")
    A.set_viewport_size({"width": 1400, "height": 900}); settle(A, 200)
    A.evaluate("()=>mobSet('mobile')"); settle(A, 400)
    s3 = A.evaluate(NAVST)
    ok(s3["mob"] and s3["outIn"] == "header" and s3["out"] and s3["user"], "넓은 창의 휴대폰 화면: 로그아웃 · 사용자가 머리글에 있음 (사라지지 않음)")
    A.evaluate("()=>mobSet('auto')"); settle(A, 400)
    ok(A.evaluate(NAVST)["outIn"] == "nav", "PC 화면으로 돌아오면 다시 사이드바 아래 칸")
    A.set_viewport_size({"width": 700, "height": 900}); settle(A, 600)      # 한 번에 좁힘 (화면 반쪽 붙이기)
    s4 = A.evaluate(NAVST)
    ok(s4["mob"] and s4["outIn"] == "header" and s4["out"], "창을 한 번에 좁혀도(1400 → 700) 로그아웃 단추가 있음")
    A.set_viewport_size({"width": 1399, "height": 900}); settle(A, 600)
    s5 = A.evaluate(NAVST)
    ok(not s5["side"] and not s5["mob"] and s5["outIn"] == "header" and s5["gh"] == "" and s5["order"].endswith("copyInfo,hdrInstall,srvUser,hdrPw,hdrOut,hdrBk"),
       f"창 1399px: 위쪽 탭 · 머리글 단추는 원래 순서 ({s5['order'][-48:]})")
    # 표 밀도: 사이드바 옆에서도 관리대장 테마의 좁은 여백 · 작은 머리글을 씀 / 카드 여백
    A.evaluate("()=>{state.nf.status='';go('ncr')}"); settle(A, 350)
    DENS = """()=>{const q=s=>document.querySelector(s),cs=e=>getComputedStyle(e),td=q('#ntab .tw tbody td:nth-child(2)'),th=q('#ntab .tw thead th:nth-child(2)'),last=q('#ntab .tw tbody tr td:last-child'),w=q('#ntab .tw');
      return {tdPad:cs(td).paddingLeft,thFs:cs(th).fontSize,card:cs(q('#ntab')).paddingLeft,pos:cs(last).position,cls:last.className.includes('noprint'),over:w.scrollWidth-w.clientWidth}}"""
    d1 = A.evaluate(DENS)
    ok(d1["tdPad"] == "7px" and d1["thFs"] == "11px" and d1["card"] == "20px", f"위쪽 탭(1399px): 표 칸 여백 7px · 머리글 11px 유지 (리뉴얼 전과 같음) ({d1['tdPad']} · {d1['thFs']})")
    A.set_viewport_size({"width": 1400, "height": 900}); settle(A, 600)
    d2 = A.evaluate(DENS)
    ok(A.evaluate(NAVST)["side"] and d2["tdPad"] == "5px" and d2["thFs"] == "11px" and d2["card"] == "12px", f"사이드바(1400px): NCR 표 칸 여백 5px · 카드 여백 12px ({d2['tdPad']} · {d2['card']})")
    ok(d2["pos"] == "sticky" and d2["cls"], "목록의 단추 칸(마지막 열)은 오른쪽에 고정")
    r = A.evaluate("""()=>{const w=document.querySelector('#ntab .tw');w.style.width='620px';w.scrollLeft=0;const td=w.querySelector('tbody tr td:last-child').getBoundingClientRect(),c=w.getBoundingClientRect(),b=w.querySelector('tbody tr td:last-child button').getBoundingClientRect();
      const o={over:w.scrollWidth-w.clientWidth,in:td.right<=c.right+1&&td.left>=c.left,btn:b.right<=c.right+1&&b.left>=c.left};w.style.width='';return o}""")
    ok(r["over"] > 100 and r["in"] and r["btn"], f"표가 가로로 넘쳐도({r['over']}px) 단계 단추가 화면 안에 있음")
    A.evaluate("()=>{state.nf.status='open';go('dash')}")
    # 좁은 화면의 PC 보기: 요약 칸은 작은 숫자 유지 · 단추 칸은 고정하지 않음
    A.set_viewport_size({"width": 390, "height": 800}); settle(A, 500)
    A.evaluate("()=>mobSet('pc')"); settle(A, 400)
    k = A.evaluate("()=>({v:getComputedStyle(document.querySelector('.kpi .v')).fontSize,p:getComputedStyle(document.querySelector('.kpi')).paddingTop})")
    A.evaluate("()=>{state.df.from='2025-01-01';go('defect')}"); settle(A, 350)
    k["pos"] = A.evaluate("()=>{const t=document.querySelector('#dtab .tw tbody tr td:last-child');return t?getComputedStyle(t).position:'none'}")
    ok(k["v"] == "19px" and k["p"] == "8px" and k["pos"] != "sticky", f"휴대폰의 PC 보기: 요약 숫자 19px 유지 · 단추 칸 고정 없음 ({k['v']} · {k['pos']})")
    A.evaluate("()=>{mobSet('auto')}"); A.set_viewport_size({"width": 1400, "height": 900}); settle(A, 700)
    A.evaluate("()=>{go('dash')}"); settle(A, 300)
    ok(A.evaluate(NAVST)["outIn"] == "nav" and not A._errs, f"원래 창 크기로 돌아옴 · 화면 오류 없음 {A._errs[:2]}")
