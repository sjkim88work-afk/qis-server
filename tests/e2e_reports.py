"""보고서 출력 동등성 확인 — 보고서 함수들이 만드는 HTML 을 그대로 받아 파일로 저장 (window.open 을 가로챔) + sheetFile 경로 확인.
   python tests/e2e_reports.py out.json  (리팩토링 전후 두 번 돌려 json 을 비교)  — 서버는 사내 서버 모드로 띄워 admin 으로 로그인."""
import json, os, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright
ROOT = os.getcwd(); PORT = 8793; URL = f"http://127.0.0.1:{PORT}"
out_path = sys.argv[1]
with tempfile.TemporaryDirectory() as tmp:
    env = {**os.environ, "QIS_DATA_DIR": os.path.join(tmp, "data"), "QIS_PORT": str(PORT), "QIS_HOST": "127.0.0.1"}
    r = subprocess.run([sys.executable, "-m", "qis", "init", "--admin", "admin", "--name", "관리자", "--password", "Qadm2026x", "--company", "한빛오토"], cwd=ROOT, env=env, capture_output=True, text=True)
    if r.returncode: print(r.stdout, r.stderr); sys.exit(1)
    r = subprocess.run([sys.executable, "-m", "qis", "import", "tests/sample_backup.json"], cwd=ROOT, env=env, capture_output=True, text=True)
    if r.returncode: print(r.stdout, r.stderr); sys.exit(1)
    p = subprocess.Popen([sys.executable, "-m", "qis", "serve"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(80):
            try: urllib.request.urlopen(URL + "/healthz", timeout=0.5); break
            except Exception: time.sleep(0.15)
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path=os.environ.get("QIS_CHROME") or None)
            ctx = b.new_context(); pg = ctx.new_page()
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(URL + "/login"); pg.fill("#u", "admin"); pg.fill("#p", "Qadm2026x"); pg.click("button[type=submit]")
            pg.wait_for_url(URL + "/")
            pg.wait_for_function("typeof bootReady!=='undefined'"); pg.evaluate("bootReady")
            res = pg.evaluate("""async()=>{
              const got={};window.__cap=[];
              window.open=()=>({closed:false,document:{open(){},write(h){window.__cap.push(h)},close(){}}});
              const d=db.defects[0],n=db.ncrs[0],c=(db.cases||[])[0];
              const run=async(name,fn)=>{try{window.__cap=[];await fn();got[name]=window.__cap.filter(h=>h.includes('<html')).join('\\n=====\\n')}catch(e){got[name]='ERROR '+e.message}};
              await run('dashReport',()=>dashReport());
              await run('weekReport',()=>weekReport());
              if(n){await run('printNotice',()=>printNotice(n.id));}
              if(d){await run('printIca',()=>printIca(d.id));await run('printFar',()=>printFar(d.id));}
              if(n){await run('print8D',()=>print8D(n.id));await run('a3Report_ncr',()=>a3Report('ncr',n.id));}
              if(c){await run('czReport',()=>{state.czId=c.id;return czReport()});await run('a3Report_case',()=>a3Report('case',c.id));}
              got._counts={defects:db.defects.length,ncrs:db.ncrs.length,cases:(db.cases||[]).length};
              // sheetFile: csv 파일로 협력사 성적서 읽기 → rlSet 이 불렸는지
              try{const f=new File(['부품,수량\\nA,1\\n'],'t.csv',{type:'text/csv'});let called=null;const o=window.rlSet;window.rlSet=(rows,name)=>{called=[rows,name]};await rlFile(f);window.rlSet=o;got.sheetFile_csv=JSON.stringify(called)}catch(e){got.sheetFile_csv='ERROR '+e.message}
              return got}""")
            res["_errors"] = errs
            json.dump(res, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print({k: (len(v) if isinstance(v, str) else v) for k, v in res.items()})
            b.close()
    finally:
        p.terminate(); p.wait()
