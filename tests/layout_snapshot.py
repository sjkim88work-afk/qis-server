"""화면 배치 사진(스냅숏) — 리팩토링 전후에 화면이 같은지 확인하는 도구.
   python tests/layout_snapshot.py before.json        (바꾸기 전)
   python tests/layout_snapshot.py after.json         (바꾼 뒤)
   python tests/layout_snapshot.py --diff before.json after.json

장면(탭 · 창 · 보고서)마다 모든 요소의 태그 · 위치 · 크기와 보이는 글자를 적는다.
태그 사이의 빈칸 · 줄바꿈만 바뀐 코드는 결과가 같아야 한다. CSS 를 옮긴 뒤에도 같아야 한다.
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = os.getcwd()
PORT = 8794
URL = f"http://127.0.0.1:{PORT}"

SNAP = """()=>{const out=[];const walk=el=>{const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
  out.push(el.tagName+(el.id?'#'+el.id:'')+'|'+Math.round(r.left)+','+Math.round(r.top)+','+Math.round(r.width)+','+Math.round(r.height)+'|'+cs.fontSize+'|'+cs.color+'|'+cs.backgroundColor);
  for(const c of el.children)walk(c)};walk(document.body);
  return {els:out,text:document.body.innerText.replace(/\\d{1,2}:\\d{2}(:\\d{2})?/g,'T').replace(/\\s+/g,' ').trim()}}"""

SEED = """async()=>{
  window.askConfirm=async()=>true;window.__cap=[];
  window.open=()=>({closed:false,focus(){},document:{open(){},write(h){window.__cap.push(h)},close(){}}});
  const T=today(),d=db.defects,S=(db.suppliers[0]||{}).id||'';
  // FAR 진행 중 · 사내 대책 · 공동 귀책
  if(d[1]){d[1].resp='미정';d[1].inv={farReq:addDays(T,-9),farDue:addDays(T,-2),farPurpose:'불량 분석',sample:'5EA',farRecv:addDays(T,-1),farSummary:'금형 마모 추정',rca:'사내 조립 조건 확인'};touch(d[1])}
  if(d[2]){d[2].resp='사내';d[2].ica={cause:'작업 표준 미준수',action:'표준서 개정 · 교육',owner:'생산팀',due:addDays(T,5)};touch(d[2])}
  if(d[3]){d[3].resp='공동';d[3].inv={farReq:addDays(T,-20),farRecv:addDays(T,-12),verdict:'공동',verdictDate:addDays(T,-10),share:60};touch(d[3])}
  d.forEach((x,k)=>{x.logs=(x.logs||[]).concat([{id:'lg'+k,date:addDays(T,-3),kind:(typeof LOG_KINDS!=='undefined'?LOG_KINDS[0]:'조치'),party:'대성정밀 박OO',method:'',text:'재고 300개 전수 선별',result:'불량 4개 추가 검출',at:now(),by:'t'}])});
  // 이슈: 기록 여러 종류 · 취소 · 수정 이력
  const i={id:'snapIss',no:'ISS-SNAP-1',title:'도어 체커 이음 발생',at:T+'T09:10',urg:'긴급',special:true,source:'공정',loc:'조립 2라인',partNo:(db.parts[0]||{}).no||'',qty:12,contain:true,containText:'라인 재고 격리',owner:'김선중',desc:'개폐 시 이음 발생\\n초물 3개에서 확인',photos:[],defectIds:[],caseIds:[],createdAt:now(),
    logs:[{id:'a1',at:T+'T09:10',kind:'발견',who:'',text:'조립 중 이음 확인',by:'t'},{id:'a2',at:T,band:'오후',kind:'인터뷰',who:'생산팀 · 생산기술팀',text:'작업자 면담\\n\\n토크 조건 확인',by:'t',edits:[{at:T+'T15:00',by:'t',reason:'오타 수정',prev:{kind:'인터뷰',at:T,band:'오후',who:'생산팀',text:'작업자 면담'}}]},
      {id:'a3',at:T,kind:'기타',who:'',text:'잘못 쓴 기록',by:'t',void:{at:T+'T16:00',by:'t',reason:'다른 건'}}]};
  db.issues=(db.issues||[]).concat([i]);
  const i2={...JSON.parse(JSON.stringify(i)),id:'snapIss2',no:'ISS-SNAP-2',title:'종결한 이슈',urg:'보통',special:false,closedAt:T,closeReason:'한도견본 이내'};db.issues.push(i2);
  // RCA
  try{const b=czBuildFrom([d[0]],null);const c=czCreateCase(b.o);czAttach(c,[d[0]],null);window.__case=c.id}catch(e){window.__caseErr=e.message}
  save();render();return {iss:i.id,cs:window.__case||'',err:window.__caseErr||''}}"""


def start(env):
    p = subprocess.Popen([sys.executable, "-m", "qis", "serve"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(80):
        try:
            urllib.request.urlopen(URL + "/healthz", timeout=0.5)
            return p
        except Exception:
            time.sleep(0.15)
    raise RuntimeError("server did not start")


def take(out_path):
    from playwright.sync_api import sync_playwright
    res, errs = {}, []
    with tempfile.TemporaryDirectory() as tmp:
        env = {**os.environ, "QIS_DATA_DIR": os.path.join(tmp, "data"), "QIS_PORT": str(PORT), "QIS_HOST": "127.0.0.1"}
        for a in (["init", "--admin", "admin", "--name", "관리자", "--password", "Qadm2026x", "--company", "한빛오토"], ["import", "tests/sample_backup.json"]):
            r = subprocess.run([sys.executable, "-m", "qis", *a], cwd=ROOT, env=env, capture_output=True, text=True)
            if r.returncode:
                print(r.stdout, r.stderr)
                return 1
        srv = start(env)
        try:
            with sync_playwright() as pw:
                b = pw.chromium.launch(executable_path=os.environ.get("QIS_CHROME") or None)
                ctx = b.new_context(viewport={"width": 1400, "height": 900}, bypass_csp=True)
                pg = ctx.new_page()
                pg.on("pageerror", lambda e: errs.append(str(e)))
                pg.goto(URL + "/login"); pg.fill("#u", "admin"); pg.fill("#p", "Qadm2026x"); pg.click("button[type=submit]")
                pg.wait_for_url(URL + "/")
                pg.wait_for_function("typeof dataReady!=='undefined'&&dataReady")
                pg.wait_for_timeout(800)
                seed = pg.evaluate(SEED)
                pg.wait_for_timeout(500)

                def shot(name, js=None, wait=350):
                    try:
                        if js:
                            pg.evaluate(js)
                        pg.wait_for_timeout(wait)
                        res[name] = pg.evaluate(SNAP)
                    except Exception as e:      # 장면이 없는 판(함수 이름이 다름)은 오류로 적음 — 전후가 같으면 통과
                        res[name] = {"els": [], "text": "ERROR " + str(e).splitlines()[0][:200]}

                close = "()=>{mfDirty=false;if(document.querySelector('#modal').classList.contains('on'))closeModal(true)}"
                tabs = pg.evaluate("TABS.map(t=>t[0])")
                for w in (1400, 1366):
                    pg.set_viewport_size({"width": w, "height": 900}); pg.wait_for_timeout(300)
                    for t in tabs:
                        shot(f"tab:{t}@{w}", f"()=>go('{t}')")
                for st in ("backup", "storage", "tg"):
                    shot(f"set:{st}", f"()=>{{state.setTab='{st}';go('data')}}")
                pg.set_viewport_size({"width": 1400, "height": 900})
                ids = pg.evaluate("db.defects.map(d=>d.id)")
                for k, i in enumerate(ids):
                    shot(f"defect:{k}", f"()=>{{go('defect');editDefect('{i}')}}", 500); pg.evaluate(close)
                    shot(f"log:{k}", f"()=>openLog('{i}')", 500); pg.evaluate(close)
                    for stg in ("req", "reply", "judge"):
                        shot(f"inv:{k}:{stg}", f"()=>editInv('{i}','','{stg}')", 450); pg.evaluate(close)
                    shot(f"ica:{k}", f"()=>editIca('{i}')", 450); pg.evaluate(close)
                    shot(f"cost:{k}", f"()=>openCost('{i}')", 450); pg.evaluate(close)
                shot("defect:new", "()=>editDefect()", 500); pg.evaluate(close)
                nids = pg.evaluate("db.ncrs.map(n=>n.id)")
                ntabs = pg.evaluate("NCR_TABS.map(t=>t[0])")
                for k, i in enumerate(nids):
                    shot(f"ncr:{k}", f"()=>{{go('ncr');editNcr('{i}')}}", 600)
                    for t in ntabs:
                        shot(f"ncr:{k}:tab:{t}", f"()=>ncrTab('{t}')", 350)
                    pg.evaluate(close)
                    for stg in ("issue", "reply", "verify"):
                        shot(f"ncr:{k}:stage:{stg}", f"()=>editNcr('{i}',null,'{stg}')", 600); pg.evaluate(close)
                shot("ncr:new", "()=>editNcr()", 600); pg.evaluate(close)
                shot("issue:open", "()=>{go('issue');issOpen('snapIss')}", 500)
                shot("issue:editlog", "()=>issEditLog('snapIss',1)", 400); pg.evaluate(close)
                shot("issue:closed", "()=>issOpen('snapIss2')", 500); pg.evaluate(close)
                shot("issue:new", "()=>editIssue()", 500); pg.evaluate(close)
                shot("issue:edit", "()=>editIssue('snapIss')", 500); pg.evaluate(close)
                if seed.get("cs"):
                    for t in pg.evaluate("CZ_TABS.map(t=>t.id)"):
                        shot(f"case:{t}", f"()=>{{go('case');czOpenCase('{seed['cs']}','{t}')}}", 500); pg.evaluate(close)
                sid = pg.evaluate("(db.suppliers[0]||{}).id||''")
                pid = pg.evaluate("(db.parts[0]||{}).id||''")
                shot("sup:edit", f"()=>{{go('master');editSup('{sid}')}}", 450); pg.evaluate(close)
                shot("sup:new", "()=>editSup()", 450); pg.evaluate(close)
                shot("part:edit", f"()=>editPart('{pid}')", 450); pg.evaluate(close)
                shot("part:new", "()=>editPart()", 450); pg.evaluate(close)
                shot("receipts", "()=>{go('sup');editReceipts()}", 450); pg.evaluate(close)
                for fn in ("openImport", "openBomImport", "openRcvImport", "showUsage"):
                    shot(f"win:{fn}", f"()=>{fn}()", 450); pg.evaluate(close)
                # 휴대폰 화면
                pg.evaluate("()=>go('dash')")
                pg.set_viewport_size({"width": 390, "height": 800}); pg.wait_for_timeout(600)
                shot("mob:home")
                n = pg.evaluate("document.querySelectorAll('.mtabs button').length")
                for k in range(n):
                    shot(f"mob:tab{k}", f"()=>document.querySelectorAll('.mtabs button')[{k}].click()", 450)
                shot("mob:pc", "()=>mobSet('pc')", 500)
                for t in ("defect", "ncr", "issue"):
                    shot(f"mobpc:{t}", f"()=>go('{t}')", 400)
                pg.evaluate("()=>mobSet('auto')")
                pg.set_viewport_size({"width": 1400, "height": 900}); pg.wait_for_timeout(500)
                # 보고서 — 만든 HTML 을 새 창에 그려서 배치를 적음
                reps = pg.evaluate("""async()=>{const got={},d=db.defects[0],d1=db.defects[1]||d,n=db.ncrs[0],c=(db.cases||[])[0];
                  const run=async(name,fn)=>{try{window.__cap=[];await fn();got[name]=window.__cap.filter(h=>h.includes('<html')).join('')}catch(e){got[name]='ERROR '+e.message}};
                  await run('dashReport',()=>dashReport());await run('weekReport',()=>weekReport());
                  if(n){await run('printNotice',()=>printNotice(n.id));await run('print8D',()=>print8D(n.id));await run('a3Report_ncr',()=>a3Report('ncr',n.id))}
                  if(d){await run('printIca',()=>printIca(db.defects[2].id));await run('printFar',()=>printFar(d1.id))}
                  if(c){await run('czReport',()=>{state.czId=c.id;return czReport()});await run('a3Report_case',()=>a3Report('case',c.id))}
                  try{openLog(d.id);await new Promise(r=>setTimeout(r,400));await run('lgPrint',()=>lgPrint());mfDirty=false;closeModal(true)}catch(e){}
                  return got}""")
                rp = ctx.new_page()
                rp.set_viewport_size({"width": 1100, "height": 900})
                for name, html in reps.items():
                    if html.startswith("ERROR") or not html:
                        res["report:" + name] = {"els": [], "text": html or "EMPTY"}
                        continue
                    rp.set_content(html); rp.wait_for_timeout(200)
                    res["report:" + name] = rp.evaluate(SNAP)
                b.close()
        finally:
            srv.terminate(); srv.wait()
    res["_errors"] = {"els": errs, "text": ""}
    json.dump(res, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    bad = [k for k, v in res.items() if v["text"].startswith("ERROR")]
    print(f"장면 {len(res) - 1}개 · 요소 {sum(len(v['els']) for v in res.values())}개 · 장면 오류 {len(bad)}개 {bad[:6]} · 화면 오류 {len(errs)}개 {errs[:2]}")
    return 0


def diff(a_path, b_path):
    a, b = json.load(open(a_path, encoding="utf-8")), json.load(open(b_path, encoding="utf-8"))
    bad = 0
    for k in sorted(set(a) | set(b)):
        x, y = a.get(k), b.get(k)
        if x is None or y is None:
            print(f"DIFF {k}: 한쪽에만 있음"); bad += 1; continue
        if x["els"] != y["els"]:
            n = next((i for i, (p, q) in enumerate(zip(x["els"], y["els"])) if p != q), min(len(x["els"]), len(y["els"])))
            print(f"DIFF {k}: 요소 {len(x['els'])} → {len(y['els'])} · 처음 다른 곳 #{n}: {x['els'][n] if n < len(x['els']) else '-'}  →  {y['els'][n] if n < len(y['els']) else '-'}")
            bad += 1
        elif x["text"] != y["text"]:
            n = next((i for i, (p, q) in enumerate(zip(x["text"], y["text"])) if p != q), 0)
            print(f"DIFF {k}: 글자 다름 @{n}: …{x['text'][max(0, n - 30):n + 40]}…  →  …{y['text'][max(0, n - 30):n + 40]}…")
            bad += 1
    print(f"장면 {len(a)}개 비교 · 다른 장면 {bad}개")
    return 1 if bad else 0


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "--diff":
        sys.exit(diff(sys.argv[2], sys.argv[3]))
    sys.exit(take(sys.argv[1]))
