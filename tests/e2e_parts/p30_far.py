"""화면 시험 — FAR 화면
   실행: python tests/e2e_browser.py tests/sample_backup.json --only far"""
import json      # noqa: F401
import os      # noqa: F401
import signal      # noqa: F401
import time      # noqa: F401

from e2e_lib import ROOT, URL, ok, settle, start      # noqa: F401


def run(c):
    A, B, C, tmp, env, b = c.A, c.B, c.C, c.tmp, c.env, c.b
    # FAR 은 FAR 화면 한 곳에서: NCR 의 far 는 연결 불량의 FAR 를 비춘 값 · 옛 NCR 입력값은 FAR 화면으로 옮겨짐 · NCR 창에는 읽기 전용 요약만
    r = A.evaluate("""()=>{
      const free=db.defects.filter(x=>!x.deleted&&!x.ncrId),d=free[0]||db.defects[0],d2=free[1]||db.defects[1];
      d.inv=Object.assign({},d.inv,{farReq:'2026-11-02',farDue:'2026-11-09',farRecv:'',sample:'',farResult:'',farPurpose:'',farItems:[],farShipRef:''});touch(d);
      const n={id:uid(),no:'FAR-TEST',issueDate:today(),supplierId:d.supplierId,defectIds:[d.id],
        far:{reqDate:'2026-10-01',due:'2026-10-08',purpose:'고장 원인 규명',items:['치수 측정'],sampleQty:'5 EA',shipDate:'2026-11-03',shipRef:'A-1',replyDate:'',verdict:'',summary:'',review:'',note:'불량 귀책 조사에서 이어받음 (x)'}};
      db.ncrs.push(n);touch(n);farSyncAll();
      const a={req:n.far.reqDate,due:n.far.due,src:n.far.src===d.id,purpose:d.inv.farPurpose,items:(d.inv.farItems||[]).join(),ship:d.inv.farShipRef,sample:d.inv.sample,note:d.inv.farNote||'',mirror:n.far.purpose+'/'+n.far.shipRef};
      d.inv.farRecv='2026-11-06';d.inv.farResult='경도 미달';d.inv.farVerdict='협력사 귀책 인정';touch(d);farSyncAll();
      const b={reply:n.far.replyDate,sum:n.far.summary,vd:n.far.verdict,st:farState(n)};
      editNcr(n.id,null,'reply');const ui={inputs:document.querySelectorAll('#mf [name^=far_]').length,tab:!!document.querySelector('#ncrTabs [data-t=f]'),line:(document.querySelector('#farLine')||{innerText:''}).innerText,print:document.querySelector('#modal').innerText.includes('FAR 요청서 출력')};mfDirty=false;closeModal(true);
      // 옛 기록: 연결 불량에 FAR 가 없고 NCR 에만 있으면 그 불량의 FAR 로 옮김
      d2.inv=Object.assign({},d2.inv,{farReq:'',farDue:'',farRecv:''});
      const m={id:uid(),no:'FAR-OLD',issueDate:today(),supplierId:d2.supplierId,defectIds:[d2.id],far:{reqDate:'2026-09-01',due:'2026-09-08',purpose:'재현 시험',items:[],sampleQty:'2 EA',replyDate:'',summary:''}};
      db.ncrs.push(m);farSyncAll();const c={req:d2.inv.farReq,purpose:d2.inv.farPurpose,src:m.far.src===d2.id};
      // FAR 화면에서 FAR 를 지우면 NCR 쪽도 없어짐 · 연결 불량이 없는 NCR 의 FAR 는 그대로
      d2.inv.farReq='';farSyncAll();c.gone=m.far===null;
      const z={id:uid(),no:'FAR-NOLINK',issueDate:today(),defectIds:[],far:{reqDate:'2026-08-01',due:'2026-08-08',summary:'남김'}};db.ncrs.push(z);farSyncAll();c.keep=z.far.summary==='남김';
      // FAR 화면: 옮겨 온 항목을 입력 · 저장
      state.tab='inv';render();editInv(d.id);const f=document.querySelector('#mf');const scr={purpose:f.inv_farPurpose.value,item:f.querySelector('input[name=inv_farItem][value="치수 측정"]').checked,ship:f.inv_farShipRef.value,vd:f.inv_farVerdict.value};
      f.inv_farReview.value='재분석 요청';f.querySelector('input[name=inv_farItem][value="외관 관찰"]').checked=true;saveInv(d.id);
      scr.saved=(d.inv.farItems||[]).join()+'|'+d.inv.farReview+'|'+n.far.review+'|'+farState(n)+'|'+('farItem' in d.inv);
      db.ncrs=db.ncrs.filter(x=>x!==n&&x!==m&&x!==z);return {a,b,ui,c,scr};}""")
    ok(r["a"]["req"] == "2026-11-02" and r["a"]["due"] == "2026-11-09" and r["a"]["src"], "FAR: FAR 화면의 요청일 · 기한이 NCR 에 반영")
    ok(r["a"]["purpose"] == "고장 원인 규명" and r["a"]["items"] == "치수 측정" and r["a"]["ship"] == "A-1" and r["a"]["sample"] == "5 EA", f"FAR: NCR 에만 있던 값이 FAR 화면으로 옮겨짐 ({r['a']})")
    ok(r["a"]["note"] == "" and r["a"]["mirror"] == "고장 원인 규명/A-1", "FAR: 자동으로 만들었던 비고는 옮기지 않음 · NCR 은 같은 값을 비춤")
    ok(r["b"]["reply"] == "2026-11-06" and r["b"]["sum"] == "경도 미달" and r["b"]["vd"] == "협력사 귀책 인정" and r["b"]["st"] == "회신", "FAR: FAR 화면 회신을 고치면 NCR 도 같이 바뀜")
    ok(r["ui"]["inputs"] == 0 and not r["ui"]["tab"] and not r["ui"]["print"], "NCR 협력사 회신 창: FAR 탭 · 입력 칸 · 요청서 출력 없음")
    ok("FAR 열기" in r["ui"]["line"] and "2026-11-02" in r["ui"]["line"] and "경도 미달" in r["ui"]["line"], "NCR 창: FAR 읽기 전용 요약 · FAR 열기 링크")
    ok(r["c"]["req"] == "2026-09-01" and r["c"]["purpose"] == "재현 시험" and r["c"]["src"], "FAR: NCR 에만 있던 옛 FAR 는 연결 불량의 FAR 로 옮겨짐")
    ok(r["c"]["gone"] and r["c"]["keep"], "FAR: FAR 화면에서 지우면 NCR 쪽도 없어짐 · 연결 불량 없는 NCR 의 FAR 는 그대로")
    ok(r["scr"]["purpose"] == "고장 원인 규명" and r["scr"]["item"] and r["scr"]["ship"] == "A-1" and r["scr"]["vd"] == "협력사 귀책 인정", "FAR 화면: 요청 목적 · 분석 항목 · 송장 · 협력사 분석 판정 입력 칸")
    ok(r["scr"]["saved"] == "외관 관찰,치수 측정|재분석 요청|재분석 요청|재분석 요청|false", f"FAR 화면 저장: 분석 항목 · 당사 검토 저장, NCR 배지에 반영 ({r['scr']['saved']})")
    # FAR 화면: 요청 · 회신 · 판정을 따로 엶
    r = A.evaluate("""() => {
      mfDirty=false;closeModal(true);const d=db.defects.find(x=>!x.deleted&&!x.ncrId)||db.defects[0],inv0=d.inv,resp0=d.resp;d.resp='미정';d.inv={};state.tab='inv';state.ivf.status='all';render();
      const vis=()=>[...document.querySelectorAll('#mf .ivs')].filter(e=>e.style.display!=='none').map(e=>e.dataset.s).join(),foot=()=>[...document.querySelectorAll('#mfoot button')].map(b=>b.textContent).join(),tt=()=>document.querySelector('#mt').textContent;
      const o={};o.btn=[...document.querySelectorAll('#ivtab tbody tr')].map(tr=>[...tr.querySelectorAll('td:last-child button')].map(b=>b.textContent+(b.classList.contains('p')?'*':'')).join()).find(x=>x.includes('요청*'))||'';
      editInv(d.id);o.def0={v:vis(),t:tt(),f:foot()};
      const f=document.querySelector('#mf');f.inv_farReq.value='2026-11-10';invAuto();f.inv_farPurpose.value='재현 시험';saveInv(d.id);
      editInv(d.id);o.def1={v:vis(),t:tt(),f:foot(),sum:document.querySelector('#mf .ivs[data-s=reply]').innerText.includes('FAR 요청 2026-11-10')};
      const g=document.querySelector('#mf');g.inv_farRecv.value='2026-11-15';g.inv_farVerdict.value='협력사 귀책 인정';saveInv(d.id);
      o.kept=d.inv.farReq+'|'+d.inv.farPurpose+'|'+d.inv.farRecv+'|'+d.inv.farVerdict;
      editInv(d.id);o.def2={v:vis(),t:tt(),f:foot(),sum:document.querySelector('#mf .ivs[data-s=judge]').innerText.includes('FAR 회신 2026-11-15')};mfDirty=false;closeModal(true);
      editInv(d.id,'','req');o.req=vis();mfDirty=false;closeModal(true);editInv(d.id,'inv_verdict');o.foc=vis();mfDirty=false;closeModal(true);
      d.inv=inv0;d.resp=resp0;farSyncAll();render();return o}""")
    ok(r["btn"].startswith("요청*,회신,판정,불량"), f"FAR 목록: 요청 · 회신 · 판정 단추 (다음 단계 강조) ({r['btn']})")
    ok(r["def0"]["v"] == "req" and r["def0"]["t"].startswith("FAR 요청 —") and "저장 후 FAR 요청서 출력" in r["def0"]["f"], "FAR 요청 창: 요청 구역만 · 요청서 출력 단추")
    ok(r["def1"]["v"] == "reply" and r["def1"]["t"].startswith("FAR 회신 —") and r["def1"]["f"] == "취소,저장" and r["def1"]["sum"], "FAR 회신 창: 회신 구역만 · 요청 요약 표시")
    ok(r["def2"]["v"] == "judge" and r["def2"]["t"].startswith("귀책 판정 —") and r["def2"]["f"] == "취소,저장" and r["def2"]["sum"], "귀책 판정 창: 사내 분석 · 판정 구역만 · FAR 요약 표시")
    ok(r["kept"] == "2026-11-10|재현 시험|2026-11-15|협력사 귀책 인정", f"단계별로 저장해도 다른 단계 값은 그대로 ({r['kept']})")
    ok(r["req"] == "req" and r["foc"] == "judge", "단계를 지정해서 열기 · 판정 칸으로 열면 판정 창")

    # FAR 메뉴는 불량 관리 안의 보기 ‘귀책 조사 중’ 으로 옮김 (2026-11): 메뉴에 FAR 없음 · 맨 위 줄에서 보기를 고름
    r = A.evaluate("""async()=>{const wait=ms=>window.__settle(ms),o={};mfDirty=false;closeModal(true);
      const navs=()=>[...document.querySelectorAll('#nav button')].map(b=>b.firstChild.textContent.trim());
      const view=()=>({on:(document.querySelector('.dvb .b.on')||{dataset:{}}).dataset.dv,far:!!document.querySelector('#ivtab'),list:!!document.querySelector('#dtab'),
        kpis:document.querySelectorAll('.kpis .kpi').length,add:!!document.querySelector('.dvb button.b.p'),navOn:(document.querySelector('#nav button.on')||{}).textContent||''});
      go('defect');await wait(300);o.nav=navs();o.all=view();
      o.chips=[...document.querySelectorAll('.dvb [data-dv]')].map(b=>b.textContent.replace(/\\s+/g,' ').trim());
      document.querySelector('.dvb [data-dv=inv]').click();await wait(300);o.inv=view();
      o.cnt={chip:+document.querySelector('.dvb [data-dv=inv] .mono').textContent,open:db.defects.filter(invOpen).length};
      document.querySelector('.dvb [data-dv=all]').click();await wait(300);o.back=view();
      go('inv');await wait(300);o.goInv=view();go('defect');await wait(300);o.goDef=view();
      // 지연이 있으면 메뉴 ‘불량 관리’ 에 숫자 · 단추에 ‘지연 n’
      const d=db.defects.find(x=>!x.ncrId)||db.defects[0],inv0=d.inv,resp0=d.resp;d.resp='미정';d.inv={farReq:addDays(today(),-30),farDue:addDays(today(),-20)};render();await wait(200);
      o.late={n:invLateN(),badge:([...document.querySelectorAll('#nav button')].find(b=>b.textContent.includes('불량 관리'))||{}).textContent||'',chip:(document.querySelector('.dvb .dvl')||{}).textContent||''};
      d.inv=inv0;d.resp=resp0;farSyncAll();render();return o}""")
    ok("FAR" not in r["nav"] and "불량 관리" in r["nav"] and "NCR / 8D" in r["nav"], f"메뉴: FAR 없음 — 불량 관리 안으로 옮김 ({r['nav']})")
    ok(r["all"] == {"on": "all", "far": False, "list": True, "kpis": 0, "add": True, "navOn": r["all"]["navOn"]} and "불량 관리" in r["all"]["navOn"]
       and r["chips"][0].startswith("전체 ") and r["chips"][1].startswith("귀책 조사 중 "), f"불량 관리 맨 위 줄: 등록 단추 + 보기 2개 ({r['chips']})")
    ok(r["inv"]["on"] == "inv" and r["inv"]["far"] and not r["inv"]["list"] and r["inv"]["kpis"] == 6 and r["inv"]["add"] and "불량 관리" in r["inv"]["navOn"]
       and r["cnt"]["chip"] == r["cnt"]["open"], f"보기 ‘귀책 조사 중’: FAR 숫자 6개 + FAR 표 · 메뉴는 ‘불량 관리’ 그대로 · 단추의 숫자 = 조사 중 {r['cnt']['open']}건")
    ok(r["back"]["on"] == "all" and r["back"]["list"] and r["goInv"]["on"] == "inv" and r["goInv"]["far"] and r["goDef"]["on"] == "all" and r["goDef"]["list"],
       "보기 바꾸기: ‘전체’ 로 돌아옴 · go('inv') 는 ‘귀책 조사 중’ · 메뉴 ‘불량 관리’ 는 ‘전체’")
    ok(r["late"]["n"] >= 1 and str(r["late"]["n"]) in r["late"]["badge"] and "지연" in r["late"]["chip"], f"FAR 회신 지연: 메뉴 ‘불량 관리’ 에 숫자 · 단추에 표시 ({r['late']})")
