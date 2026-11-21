"""데스크톱 창 보조(desktop.js) 브라우저 시험: python tests/e2e_desktop.py
  내장 서버(혼자 쓰기 모드)를 켜고, 프로그램 창 대신 Chromium 에 가짜 window.pywebview.api 를 넣어
  자동 입장 · 버튼 정리 · 새 창 · 보고서 창 · 파일 저장 · 백업 저장이 프로그램 쪽으로 넘어가는지 확인한다.
"""
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from playwright.sync_api import sync_playwright  # noqa: E402

from qis.desktop import core  # noqa: E402

fails = []

FAKE_API = """
window.__calls=[];
(function(){
  function rec(n){return function(){window.__calls.push([n].concat([].slice.call(arguments)));return Promise.resolve(null)}}
  window.pywebview={api:{open_page:rec('open_page'),open_report:rec('open_report'),save_file:rec('save_file'),
    open_file:rec('open_file'),export_backup:rec('export_backup'),open_url:rec('open_url'),reenter:rec('reenter')}};
  setTimeout(function(){window.dispatchEvent(new Event('pywebviewready'))},0);
})();
"""


def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c:
        fails.append(m)


def calls(pg, name):
    return [c for c in pg.evaluate("window.__calls") if c[0] == name]


def main():
    tmp = Path(tempfile.mkdtemp(prefix="qis_e2e_desktop_"))
    cfg = core.desktop_config(tmp)
    st = core.DesktopSettings(mode="solo", solo_name="김선중")
    core.prepare(cfg, st)
    core.import_json_backup(cfg, Path(__file__).parent / "sample_backup.json", by_username=core.SOLO_USER)
    r = core.ServerRunner(cfg, st).start()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path=os.environ.get("QIS_CHROME") or None)
            ctx = b.new_context(viewport={"width": 1400, "height": 900})
            ctx.add_init_script(FAKE_API)
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(r.enter_url)
            pg.wait_for_function("typeof dataReady!=='undefined'&&dataReady")
            pg.wait_for_timeout(800)
            ok(pg.url == r.base_url + "/", "자동 입장 (로그인 없음): " + pg.url)
            # pywebview 다리는 new Function · eval 로 만들어짐 — 프로그램 창의 CSP가 이를 막으면 창 ↔ 프로그램 연결이 죽음
            pg.route("**/csp_probe.js", lambda route: route.fulfill(content_type="text/javascript", body=
                "try{window.__nf=new Function('return 1')()}catch(e){window.__nf='ERR '+e.name}"
                "try{window.__ev=eval('1+1')}catch(e){window.__ev='ERR '+e.name}"))
            pg.evaluate("new Promise(r=>{var s=document.createElement('script');s.src='/csp_probe.js';s.onload=r;s.onerror=r;document.head.appendChild(s)})")
            ok(pg.evaluate("[window.__nf,window.__ev]") == [1, 2], "프로그램 창 CSP: new Function · eval 허용 (pywebview 다리)")
            ok(pg.evaluate("db.defects.length") == 5, "가져온 기록이 보임")
            ok(pg.evaluate("SRV.desktop") == "solo" and pg.evaluate("SRV.name") == "김선중", "혼자 쓰기 · 이름")
            ok(not pg.is_visible("button[onclick='srvLogout()']"), "로그아웃 버튼 숨김")
            ok(not pg.is_visible("button[onclick=\"location.href='/account'\"]"), "비밀번호 버튼 숨김")
            # 다시 로그인 → 프로그램 새 창 (이 창의 미저장 내용 유지)
            pg.evaluate("window.open('/login','qisLogin')")
            pg.wait_for_timeout(100)
            ok(calls(pg, "open_page") == [["open_page", "/login"]], "다시 로그인 → 프로그램 새 창")
            # 보고서 창 → 프로그램 새 창(html)
            pg.evaluate("dashReport()")
            pg.wait_for_timeout(300)
            rep = calls(pg, "open_report")
            ok(len(rep) == 1 and "인쇄" in rep[0][1] and "<html" in rep[0][1].lower(), "보고서 → 프로그램 새 창")
            # 보고서 창의 '닫기': 프로그램에 닫기를 요청 (macOS 프로그램 창은 window.close() 가 듣지 않음)
            ctx2 = b.new_context()
            ctx2.add_init_script("window.__c=[];window.print=function(){};window.pywebview={api:{close_report:function(){window.__c.push('close_report')}}}")
            rp = ctx2.new_page()
            rp.set_content(rep[0][1])
            rp.click(".rbar button:has-text('닫기')")
            ok(rp.evaluate("window.__c") == ["close_report"], "보고서 창 닫기 → 프로그램에 닫기 요청 (close_report)")
            ctx2.close()
            # 파일 내려받기 → 저장 창
            pg.evaluate("download('시험.csv','a,b','text/csv')")
            pg.wait_for_timeout(400)
            sv = calls(pg, "save_file")
            ok(len(sv) == 1 and sv[0][1] == "시험.csv" and sv[0][2].startswith("data:text/csv"), "내려받기 → 저장 창")
            # 화면에 붙이지 않은 링크 .click() 도
            pg.evaluate("(()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['x']));a.download='QIS.sqlite';a.click()})()")
            pg.wait_for_timeout(400)
            ok(len(calls(pg, "save_file")) == 2, "분리된 링크 내려받기 → 저장 창")
            # 백업 파일 저장(관리자) → 프로그램
            pg.evaluate("exportJSON()")
            pg.wait_for_timeout(100)
            ok(len(calls(pg, "export_backup")) == 1, "백업 내려받기 → 프로그램 저장")
            # 브라우저 폴더 선택 · 파일 백업 기능은 지움 (백업 · 복원은 프로그램 메뉴)
            gone = pg.evaluate("['pickRoot','pickDir','pickImport','restoreFromFolder','resetAll','autoBackup'].filter(n=>typeof window[n]!=='undefined').join()")
            ok(gone == "", f"브라우저 폴더 · 파일 백업 기능 없음 ({gone or '없음'})")
            # 설정 › 데이터 문구
            panel = pg.evaluate("srvPanel()")
            ok("이 PC의 QIS 데이터 폴더" in panel and "사내 서버에 저장" not in panel, "혼자 쓰기 안내 문구")
            # 변경 저장 → 서버
            pg.evaluate("db.suppliers.push({id:'sx1',name:'시험협력사',contacts:[]});persist()")
            pg.wait_for_timeout(1500)
            ok(not pg.evaluate("srvUnsaved()"), "변경이 서버에 저장됨")
            # 관리 화면 → 저장 후 같은 창에서 이동
            pg.evaluate("window.open('/admin','qisAdmin')")
            pg.wait_for_url(r.base_url + "/admin", timeout=5000)
            pg.wait_for_selector("text=QIS로 돌아가기")
            ok(pg.url == r.base_url + "/admin", "관리 화면 열림 (같은 창)")
            ok(not errs, f"화면 오류 없음 {errs}")
            b.close()
    finally:
        r.stop()
    print("FAILS:", len(fails))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
