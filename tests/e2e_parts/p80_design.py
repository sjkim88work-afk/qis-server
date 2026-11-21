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
    ok(s1["side"] and s1["navW"] == 168 and s1["gh"] == "업무,분석,관리", f"창 1400px: 좌측 사이드바 · 묶음 머리글 ({s1['gh']})")
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
    ok(d1["tdPad"] == "5px" and d1["thFs"] == "12px" and d1["card"] == "0px", f"위쪽 탭(1399px): NCR 표는 현장 도구 모양 — 칸 여백 5px · 머리글 12px · 카드 여백 없음 ({d1['tdPad']} · {d1['thFs']})")
    A.set_viewport_size({"width": 1400, "height": 900}); settle(A, 600)
    d2 = A.evaluate(DENS)
    ok(A.evaluate(NAVST)["side"] and d2["tdPad"] == "5px" and d2["thFs"] == "12px" and d2["card"] == "0px", f"사이드바(1400px): NCR 표 칸 여백 5px · 카드 여백 없음 ({d2['tdPad']} · {d2['card']} · 넘침 {d2['over']}px)")
    ok(d2["pos"] == "sticky" and d2["cls"], "목록의 단추 칸(마지막 열)은 오른쪽에 고정")
    r = A.evaluate("""()=>{const w=document.querySelector('#ntab .tw');w.style.width='620px';w.scrollLeft=0;const td=w.querySelector('tbody tr td:last-child').getBoundingClientRect(),c=w.getBoundingClientRect(),b=w.querySelector('tbody tr td:last-child button').getBoundingClientRect();
      const o={over:w.scrollWidth-w.clientWidth,in:td.right<=c.right+1&&td.left>=c.left,btn:b.right<=c.right+1&&b.left>=c.left};w.style.width='';return o}""")
    ok(r["over"] > 100 and r["in"] and r["btn"], f"표가 가로로 넘쳐도({r['over']}px) 단계 단추가 화면 안에 있음")
    A.evaluate("()=>{state.nf.status='open';go('dash')}")
    # 좁은 화면의 PC 보기: 요약 칸은 작은 숫자 유지 · 단추 칸은 고정하지 않음
    A.set_viewport_size({"width": 390, "height": 800}); settle(A, 500)
    A.evaluate("()=>mobSet('pc')"); settle(A, 400)
    A.evaluate("()=>go('issue')"); settle(A, 300)      # 요약 칸(타일)이 있는 화면 — 대시보드는 2026-11 부터 묶음 줄 모양
    k = A.evaluate("()=>({v:getComputedStyle(document.querySelector('.kpis .kpi .v')).fontSize,p:getComputedStyle(document.querySelector('.kpis .kpi')).paddingTop})")
    k["dash"] = A.evaluate("()=>{go('dash');const g=[...document.querySelectorAll('.kgs .kg')].map(e=>Math.round(e.getBoundingClientRect().left));return {n:g.length,oneCol:new Set(g).size===1,over:document.documentElement.scrollWidth>innerWidth+2}}")
    A.evaluate("()=>{state.df.from='2025-01-01';go('defect')}"); settle(A, 350)
    k["pos"] = A.evaluate("()=>{const t=document.querySelector('#dtab .tw tbody tr td:last-child');return t?getComputedStyle(t).position:'none'}")
    ok(k["dash"] == {"n": 3, "oneCol": True, "over": False}, f"휴대폰의 PC 보기: 대시보드 수치 묶음 3개가 한 줄씩 쌓임 · 옆으로 넘치지 않음 ({k['dash']})")
    ok(k["v"] == "19px" and k["p"] == "8px" and k["pos"] != "sticky", f"휴대폰의 PC 보기: 요약 숫자 19px 유지 · 단추 칸 고정 없음 ({k['v']} · {k['pos']})")
    A.evaluate("()=>{mobSet('auto')}"); A.set_viewport_size({"width": 1400, "height": 900}); settle(A, 700)
    A.evaluate("()=>{go('dash')}"); settle(A, 300)
    ok(A.evaluate(NAVST)["outIn"] == "nav" and not A._errs, f"원래 창 크기로 돌아옴 · 화면 오류 없음 {A._errs[:2]}")

    # 대시보드 배치 (2026-11): 진행 현황이 먼저 → 수치 묶음 3개(지연 · 진행 중 · 이번 달 발생) → 오늘 챙길 일 → 월간 특이사항 → 그림표
    r = A.evaluate("""async()=>{const wait=ms=>window.__settle(ms),q=s=>document.querySelector(s),o={};go('dash');await wait(300);
      const top=e=>e?Math.round(e.getBoundingClientRect().top+scrollY):-1,card=t=>[...document.querySelectorAll('#view .card')].find(c=>(c.querySelector('h3')||{}).textContent&&c.querySelector('h3').textContent.includes(t));
      o.order=[top(q('.pc1')),top(q('.kgs')),top(card('할 일')),top(card('월간 특이사항')),top(card('월별 불량 건수'))];
      o.groups=[...document.querySelectorAll('.kgs .kg h4')].map(h=>h.firstChild.textContent.trim()).join('|');
      o.rows=[...document.querySelectorAll('.kgs .kg')].map(g=>g.querySelectorAll('.kpi').length).join('');o.tiles=document.querySelectorAll('#view .kpis').length;
      const row=t=>[...document.querySelectorAll('.kgs .kpi')].find(e=>e.querySelector('.l').firstChild.textContent.trim()===t),cs=e=>getComputedStyle(e);
      const late=row('대책서 회신 지연'),zero=row('유효성 검증 지연'),on=row('미종결 NCR');
      o.late={n:late.querySelector('.v').textContent,cls:late.classList.contains('bad'),color:cs(late.querySelector('.v')).color,bg:cs(late).backgroundColor};
      o.zero={n:zero.querySelector('.v').textContent,cls:zero.classList.contains('z'),color:cs(zero.querySelector('.v')).color,bg:cs(zero).backgroundColor};
      o.on={n:on.querySelector('.v').textContent,color:cs(on.querySelector('.v')).color};
      o.noLateTile=![...document.querySelectorAll('.kgs .kpi .l')].some(e=>/지연 중인 건/.test(e.textContent));
      const chip=q('.pc1 h3 button.bg');o.chip=chip?chip.textContent.trim():'';
      on.click();await wait(300);o.go=state.tab+'/'+(state.nf.status||'');go('dash');await wait(200);
      if(q('.pc1 h3 button.bg')){q('.pc1 h3 button.bg').click();await wait(300);o.goLate=state.tab+'/'+((state.pf||{}).late||'');state.pf.late=''}
      go('dash');return o}""")
    ok(r["order"][1] < r["order"][0] and r["order"][2:] == sorted(r["order"][2:]) and r["order"][0] == r["order"][2] and min(r["order"]) > 0, f"대시보드 순서: 수치 → 할 일 (표 한 개) → 월간 특이사항 → 그림표 ({r['order']})")
    ok(r["groups"].startswith("지연|진행 중|") and r["groups"].endswith("발생") and r["rows"] == "234" and r["tiles"] == 0 and r["noLateTile"], f"수치는 세 묶음 9줄 — 지연 2 · 진행 중 3 · 이번 달 발생 4 ({r['groups']})")
    ok(r["late"]["n"] == "1" and r["late"]["cls"] and r["late"]["color"] == "rgb(185, 50, 31)" and r["late"]["bg"] == "rgba(0, 0, 0, 0)", f"지연이 있으면 빨간 숫자 (바탕색 없음 · 이름 앞에 빨간 사각 표시) ({r['late']})")
    ok(r["zero"]["n"] == "0" and r["zero"]["cls"] and r["zero"]["color"] == "rgb(107, 118, 137)" and r["zero"]["bg"] == "rgba(0, 0, 0, 0)", f"값이 0 이면 회색으로 약하게 ({r['zero']})")
    ok(r["on"]["color"] == "rgb(29, 36, 51)" and r["go"] == "ncr/open", f"진행 중인 수는 검은 숫자 · 누르면 그 목록으로 ({r['go']})")
    ok(r["chip"].startswith("지연 ") and r.get("goLate") == "prog/1", f"진행 현황의 ‘지연’ 표시를 누르면 지연 건만 보기 ({r['chip']} → {r.get('goLate')})")

    # 대시보드 현장 도구 모양: 숫자 줄이 맨 위 · 카드 테두리 없음 · 색 버튼 없음
    A.set_viewport_size({"width": 1400, "height": 900})
    A.evaluate("()=>{mfDirty=false;closeModal(true);go('dash')}"); settle(A, 350)
    r = A.evaluate("""()=>{const q=s=>document.querySelector(s),cs=e=>getComputedStyle(e),top=e=>e.getBoundingClientRect().top;
      const pri=cs(q('.pl .b')).getPropertyValue('--pri').trim().toLowerCase(),hex=c=>'#'+c.match(/\\d+/g).slice(0,3).map(x=>(+x).toString(16).padStart(2,'0')).join('');
      return {pld:!!q('.pl.pld'),kFirst:top(q('.pld .kgs'))<top(q('.pld .pc1')),radius:parseFloat(cs(q('.pld .kg')).borderTopLeftRadius),cardB:parseFloat(cs(q('.pld .pc1')).borderTopWidth),
        colored:[...document.querySelectorAll('.pld button.b')].filter(b=>hex(cs(b).backgroundColor)===pri).length}}""")
    ok(r["pld"] and r["kFirst"] and r["radius"] == 0 and r["cardB"] == 0 and r["colored"] == 0, f"대시보드: 숫자 줄이 맨 위 · 카드 테두리 없음 · 색 버튼 없음 ({r})")

    # 모든 화면 공통 규칙: 카드 · 버튼 모서리 3px · 본문의 배지는 배경 없는 글자
    r = A.evaluate("""async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),cs=e=>getComputedStyle(e),clear=c=>c==='rgba(0, 0, 0, 0)',o={};
      for(const t of ['issue','sup','copq','master','inv','case']){go(t);await wait(250);const m=document.querySelector('main');
        const cards=[...m.querySelectorAll('.card')],bgs=[...m.querySelectorAll('.bg')].filter(e=>e.offsetParent),btn=m.querySelector('button.b');
        o[t]={card:cards.every(c=>parseFloat(cs(c).borderTopLeftRadius)<=3),bg:bgs.every(b=>clear(cs(b).backgroundColor)),btn:!btn||parseFloat(cs(btn).borderTopLeftRadius)<=3}}
      go('dash');return o}""")
    bad = [k for k, v in r.items() if not (v["card"] and v["bg"] and v["btn"])]
    ok(not bad, f"모든 화면: 카드 · 버튼 모서리 3px 이하 · 배지는 배경 없는 글자 (어긋난 화면: {bad})")

    # 창도 같은 규칙: 창 모서리 4px · 묶음 3px · 배지는 배경 없는 글자 · 번호 원 없음
    r = A.evaluate("""async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),cs=e=>getComputedStyle(e),clear=c=>c==='rgba(0, 0, 0, 0)',q=s=>document.querySelector(s);
      editDefect(db.defects[0].id);await wait(350);
      const o={modal:parseFloat(cs(q('#modal .modal')).borderTopLeftRadius),grp:parseFloat(cs(q('#mf .fgrp')).borderTopLeftRadius),
        num:getComputedStyle(q('#mf .fgrp.dfn>.gh'),'::before').display,bg:[...document.querySelectorAll('#modal .bg')].filter(e=>e.offsetParent).every(b=>clear(cs(b).backgroundColor))};
      mfDirty=false;closeModal(true);editNcr(db.ncrs[0].id);await wait(350);
      o.ncrBg=[...document.querySelectorAll('#modal .bg')].filter(e=>e.offsetParent).every(b=>clear(cs(b).backgroundColor));o.ncrBtn=parseFloat(cs(q('#modal button.b')).borderTopLeftRadius);
      mfDirty=false;closeModal(true);return o}""")
    ok(r["modal"] == 4 and r["grp"] == 3 and r["num"] == "none" and r["bg"] and r["ncrBg"] and r["ncrBtn"] == 3, f"창: 모서리 4px · 묶음 3px · 번호 원 없음 · 배지는 글자 ({r})")

    # 대시보드 ‘할 일’: 표 한 개 (구분 · 대상 · 내용 · 버튼). 같은 건은 한 번만. 예전의 두 목록(ul)은 없음
    A.evaluate("()=>{state.dashAll=true;go('dash');render()}"); settle(A, 350)
    r = A.evaluate("""()=>{const q=s=>document.querySelector(s),rows=[...document.querySelectorAll('.pc1 .todot tbody tr')];
      const key=tr=>tr.cells[0].textContent.trim()+'|'+tr.cells[1].textContent.trim();
      const o={th:[...document.querySelectorAll('.pc1 .todot th')].map(x=>x.textContent).join('|'),n:rows.length,uls:document.querySelectorAll('.pld ul.act,.pld ul.todo').length,
        dup:rows.length-new Set(rows.map(key)).size,kinds:rows.every(tr=>tr.cells[0].textContent.trim()),btn:rows.some(tr=>tr.cells[3].querySelector('button')),
        cards:[...document.querySelectorAll('.pld .card>h3')].filter(h=>/오늘 챙길 일|진행 현황/.test(h.textContent)).length};
      state.dashAll=false;render();return o}""")
    ok(r["th"].startswith("구분|대상|내용") and r["n"] >= 6 and r["uls"] == 0 and r["cards"] == 0, f"대시보드 할 일: 표 한 개 · {r['n']}줄 · 예전 목록 없음 ({r['th']})")
    ok(r["dup"] == 0 and r["kinds"] and r["btn"], f"대시보드 할 일: 같은 줄 없음 · 줄마다 구분 있음 · 행동 버튼은 오른쪽 칸 ({r})")

    # 관리 화면 (/admin) 을 휴대폰 폭으로: 화면이 옆으로 넘치지 않음 · 탭은 한 줄
    vp = B.viewport_size
    back = B.url
    B.set_viewport_size({"width": 390, "height": 844})
    B.goto(back.split("/")[0] + "//" + back.split("/")[2] + "/admin"); settle(B, 800)
    r = B.evaluate("""async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),o=[];
      for(const b of [...document.querySelectorAll('#nav button')]){b.click();await wait(500);
        o.push({t:b.textContent,over:document.documentElement.scrollWidth-innerWidth,navH:document.querySelector('#nav').offsetHeight})}
      return o}""")
    ok(len(r) >= 4 and all(x["over"] <= 0 and x["navH"] < 60 for x in r), f"관리 화면 (390px): 탭 {len(r)}개 모두 옆으로 넘치지 않음 · 탭은 한 줄 ({[x['over'] for x in r]})")
    B.set_viewport_size(vp); B.goto(back); settle(B, 800)

    # 좁은 창의 대시보드 할 일: 줄이 세로로 쌓일 때 구분 · 대상 · 내용의 왼쪽이 같은 자리
    vpA = A.viewport_size
    A.set_viewport_size({"width": 430, "height": 900})
    settle(A, 400); A.evaluate("()=>mobSet('pc')"); settle(A, 400); A.evaluate("()=>{go('dash')}"); settle(A, 400)
    r = A.evaluate("""()=>{const tr=document.querySelector('.pc1 .todot tbody tr');if(!tr)return null;
      const x=e=>{const r=document.createRange();r.selectNodeContents(e);return Math.round(r.getClientRects()[0].left)};
      const cells=[...tr.cells].filter(c=>c.offsetParent&&c.textContent.trim());
      return {xs:cells.map(c=>Math.round(c.getBoundingClientRect().left+parseFloat(getComputedStyle(c).paddingLeft))),over:document.documentElement.scrollWidth-innerWidth}}""")
    ok(r and len(set(r["xs"])) == 1 and r["over"] <= 0, f"좁은 창의 할 일: 칸의 왼쪽 시작 자리가 같음 · 옆으로 넘치지 않음 ({r})")
    A.evaluate("()=>mobSet('auto')"); A.set_viewport_size(vpA); settle(A, 400)

    # 대시보드 그림표: RCA 그림표 없음 · 같은 종류끼리 한 줄 (월별 2개 → 파레토 2개 → 완성품 2개)
    A.evaluate("()=>{state.dashMonth='2026-10';go('dash')}"); settle(A, 500)
    r = A.evaluate("""()=>{const hs=[...document.querySelectorAll('.pld>.grid>.card')].map(c=>({t:c.querySelector('h3').textContent,y:Math.round(c.getBoundingClientRect().top)}));
      const o={titles:hs.map(h=>h.t),rows:[]};for(let i=0;i+1<hs.length;i+=2)o.rows.push(hs[i].y===hs[i+1].y);
      state.dashMonth=today().slice(0,7);render();return o}""")
    ok(not any("RCA" in t for t in r["titles"]) and len(r["titles"]) >= 4 and r["titles"][0].startswith("월별") and r["titles"][1].startswith("월별") and "파레토" in r["titles"][2] and "파레토" in r["titles"][3] and all(r["rows"]),
       f"대시보드 그림표: RCA 없음 · 월별끼리 · 파레토끼리 한 줄 ({r['titles']})")

    # 메뉴 ‘진행 현황’: 대시보드 바로 아래 · 왼쪽 표는 건 · 협력사 · 지금 단계 · 기한 · 줄을 누르면 오른쪽에 전체 이력
    A.evaluate("()=>{state.pf=null;go('prog')}"); settle(A, 400)
    r = A.evaluate("""async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),q=s=>document.querySelector(s),o={};
      o.nav=[...document.querySelectorAll('#nav button')].map(b=>b.firstChild.textContent.trim()).slice(0,3).join('|');
      o.th=[...document.querySelectorAll('.pgl thead th')].map(x=>x.textContent).join('|');
      o.rows=document.querySelectorAll('.pgl tbody tr[onclick]').length;o.empty=!q('.pgr .pgh');
      const c=progCases().find(c=>c.kind==='ncr')||progCases()[0];progSel(c.kind,c.id);await wait(300);
      o.sel=document.querySelectorAll('.pgl tr.sel').length;o.hth=[...document.querySelectorAll('.pgr thead th')].map(x=>x.textContent).join('|');
      o.hist=document.querySelectorAll('.pgr tbody tr').length;o.flow=[...document.querySelectorAll('.pgflow>div b')].map(b=>b.textContent).join('>');
      o.kinds=[...new Set([...document.querySelectorAll('.pgr tbody tr td:nth-child(2)')].map(t=>t.textContent))].join(',');
      const kb=[...document.querySelectorAll('.pgf button')].find(b=>b.textContent==='NCR');if(kb){kb.click();await wait(250);
        o.onlyNcr=[...document.querySelectorAll('.pgr tbody tr td:nth-child(2)')].every(t=>t.textContent==='NCR')}
      q('.pgr tbody a.lk').click();await wait(400);o.opened=q('#modal').classList.contains('on');mfDirty=false;closeModal(true);
      o.over=document.documentElement.scrollWidth-innerWidth;state.pf=null;go('dash');return o}""")
    ok(r["nav"] == "대시보드|진행 현황|이슈" and r["th"] == "건|협력사|지금 단계|기한" and r["rows"] >= 1 and r["empty"], f"진행 현황: 메뉴는 대시보드 아래 · 표의 칸 ({r['th']})")
    ok(r["sel"] == 1 and r["hth"] == "일자|구분|내용|출처|기록자" and r["hist"] >= 2 and "NCR" in r["flow"] and r.get("onlyNcr") and r["opened"] and r["over"] <= 0,
       f"진행 현황: 줄을 누르면 전체 이력 · 종류로 거름 · 출처를 누르면 창이 열림 (흐름 {r['flow']} · {r['hist']}줄 · {r['kinds']})")

    # 글자 크기 6단계: 화면에 보이는 글자의 크기는 11 · 12 · 13 · 15 · 18 · 22px 만 (인쇄 문서 · 휴대폰 화면 · 그림표 제외)
    r = A.evaluate("""async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),ok=new Set(['11px','12px','13px','15px','18px','22px']),bad={};
      const scan=(root,tag)=>{root.querySelectorAll('*').forEach(e=>{if(!e.offsetParent||e.closest('svg'))return;
        if(![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return;const f=getComputedStyle(e).fontSize;if(!ok.has(f)){const k=tag+' '+f;bad[k]=(bad[k]||0)+1}})};
      for(const t of ['dash','prog','issue','defect','inv','ncr','case','sup','copq','master']){go(t);await wait(250);scan(document.body,t)}
      editDefect(db.defects[0].id);await wait(350);scan(document.querySelector('#modal'),'불량 창');mfDirty=false;closeModal(true);
      editNcr(db.ncrs[0].id);await wait(350);scan(document.querySelector('#modal'),'NCR 창');mfDirty=false;closeModal(true);
      const v=getComputedStyle(document.documentElement);go('dash');
      return {bad,vars:['xs','sm','md','lg','xl','num'].map(k=>v.getPropertyValue('--fs-'+k).trim()).join(',')}}""")
    ok(r["vars"] == "11px,12px,13px,15px,18px,22px" and not r["bad"], f"글자 크기: 6단계만 씀 (어긋난 곳: {r['bad']})")

    # 조건 줄: 창 1240px 에서도 한 줄 · 협력사 선택 칸은 좁게 · 엑셀 버튼과 긴 안내는 접는 메뉴 안
    vpT = A.viewport_size
    A.set_viewport_size({"width": 1240, "height": 800}); settle(A, 400)
    r = A.evaluate("""async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),o={};
      for(const t of ['defect','ncr','inv','prog']){go(t);await wait(300);const tb=document.querySelector('.pltool'),k=[...tb.querySelector('.row').children].filter(e=>e.offsetParent);
        const mid=k.map(e=>{const r=e.getBoundingClientRect();return Math.round((r.top+r.bottom)/2)});
        o[t]={one:Math.max(...mid)-Math.min(...mid)<6,h:tb.offsetHeight,sel:Math.max(0,...[...tb.querySelectorAll('select')].map(s=>s.offsetWidth)),help:!!tb.querySelector(':scope > .help')}}
      go('defect');await wait(300);const m=document.querySelector('.pltool details.tbm');o.items=[...m.querySelectorAll('.mn button')].map(b=>b.firstChild.textContent.trim()).join('|');
      m.open=true;await wait(100);const mn=m.querySelector('.mn').getBoundingClientRect();o.inView=mn.right<=innerWidth&&mn.left>=0&&mn.height>40;
      m.querySelector('.mn button').click();await wait(400);o.imp=document.querySelector('#modal').classList.contains('on')||!!(document.querySelector('#toast')||{}).textContent;o.closed=!m.open;mfDirty=false;closeModal(true);return o}""")
    bad = [k for k in ("defect", "ncr", "inv", "prog") if not (r[k]["one"] and r[k]["h"] <= 50 and r[k]["sel"] <= 140 and not r[k]["help"])]
    ok(not bad, f"조건 줄 (1240px): 네 화면 모두 한 줄 · 선택 칸 140px 이하 · 긴 안내 없음 (어긋난 화면: {bad} · {[r[k]['h'] for k in ('defect','ncr','inv','prog')]})")
    ok(r["items"] == "엑셀 일괄 등록|엑셀 내보내기" and r["inView"] and r["imp"] and r["closed"], f"불량 목록의 ‘엑셀’ 메뉴: 일괄 등록 · 내보내기 ({r['items']} · {r['inView']} {r['imp']} {r['closed']})")
    A.set_viewport_size(vpT); settle(A, 300)

    # 진행 현황: 건이 많아도 왼쪽 표가 상자 밖으로 넘치지 않고 아래 글과 겹치지 않음 (낮은 창)
    vpP = A.viewport_size
    A.set_viewport_size({"width": 1400, "height": 520}); settle(A, 300)
    r = A.evaluate("""async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));const base=db.defects.find(d=>!d.ncrId&&!isDone(d))||db.defects[0],add=[];
      for(let i=0;i<14;i++){const d=Object.assign({},base,{id:'t_pg'+i,ncrId:'',caseId:'',issueId:'',doneDate:'',closed:undefined,logs:[],partName:'시험 부품 '+i});db.defects.push(d);add.push(d)}
      pcMemo=null;state.pf=null;go('prog');await wait(400);const q=s=>document.querySelector(s),R=e=>e.getBoundingClientRect();
      const box=R(q('.pl.pg')),tb=R(q('.pgl table')),help=R(q('.pgl .help')),tw=q('.pgl .tw');
      const o={rows:document.querySelectorAll('.pgl tbody tr[onclick]').length,inBox:tb.bottom<=box.bottom+1,noOverlap:help.top>=tb.bottom-1,noInner:tw.scrollHeight<=tw.clientHeight+1};
      db.defects=db.defects.filter(d=>!add.includes(d));pcMemo=null;state.pf=null;go('dash');return o}""")
    ok(r["rows"] >= 14 and r["inBox"] and r["noOverlap"] and r["noInner"], f"진행 현황: 건 {r['rows']}줄 — 표가 상자 안에 있고 아래 글과 겹치지 않음 ({r})")
    A.set_viewport_size(vpP); settle(A, 300)

