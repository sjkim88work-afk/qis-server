"""프로그램 창에 직접 그리는 작은 화면들 (서버가 뜨기 전 · 작업 중): 첫 실행 모드 선택 · 작업 중 · 손상 복구 · 안내."""
from __future__ import annotations

import html
import json

CSS = """
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo",sans-serif;
background:#f3f5f8;color:#1f2937;font-size:14px}
.wrap{max-width:880px;margin:0 auto;padding:36px 24px}
h1{font-size:22px;margin:0 0 6px}h2{font-size:16px;margin:0 0 8px}.muted{color:#6b7280}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:22px 0}
.card{background:#fff;border:2px solid #e5e7eb;border-radius:12px;padding:18px;cursor:pointer}
.card.on{border-color:#2563eb;box-shadow:0 0 0 3px #dbeafe}
.card ul{margin:8px 0 0;padding-left:18px;color:#4b5563;line-height:1.6}
.box{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px;margin:14px 0}
label{display:block;margin:10px 0 4px;font-weight:600}input{width:100%;padding:9px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
button{padding:10px 18px;border-radius:8px;border:1px solid #d1d5db;background:#fff;font-size:14px;cursor:pointer}
button.p{background:#2563eb;border-color:#2563eb;color:#fff}button:disabled{opacity:.5}
.err{color:#b91c1c;margin:10px 0;font-weight:600;white-space:pre-wrap}.ok{color:#047857}
code{background:#eef2f7;padding:2px 6px;border-radius:4px}
.spin{width:28px;height:28px;border:3px solid #dbeafe;border-top-color:#2563eb;border-radius:50%;animation:s 1s linear infinite;margin:30px 0 12px}
@keyframes s{to{transform:rotate(360deg)}}
"""


def _page(title: str, body: str, script: str = "") -> str:
    return (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>{html.escape(title)}</title>'
            f"<style>{CSS}</style></head><body><div class=wrap>{body}</div>"
            f"<script>{script}</script></body></html>")


API_JS = """
function api(){return window.pywebview&&window.pywebview.api}
function ready(fn){if(api())fn();else window.addEventListener('pywebviewready',fn,{once:true})}
"""


def setup_page(*, current: str = "", solo_name: str = "", solo_login: bool = False, admin: str = "admin",
               admin_name: str = "", port: int = 8080, error: str = "", can_cancel: bool = False,
               version: str = "", lan_scope: str = "lan") -> str:
    init = json.dumps({"mode": current or "solo"})
    body = f"""
<h1>QIS 사용 방식 고르기</h1>
<div class=muted>QIS 품질정보시스템 {html.escape(version)} · 나중에 메뉴 ‘설정 › 사용 방식 바꾸기’에서 바꿀 수 있습니다. 데이터는 그대로 유지됩니다.</div>
<div class=cards>
  <div class=card id=c_solo onclick="pick('solo')"><h2>🖥 이 PC 혼자 쓰기</h2>
    <ul><li>바로 시작 (원하면 비밀번호 잠금)</li><li>이 PC 안에서만 열림 (다른 PC · 핸드폰 접속 차단)</li><li>개인 업무 · 시험용</li></ul></div>
  <div class=card id=c_lan onclick="pick('lan')"><h2>🏢 사내 서버로 쓰기</h2>
    <ul><li>같은 사내망의 다른 PC · 핸드폰에서 접속</li><li>사람마다 아이디 · 비밀번호로 로그인, 권한(조회 · 작성 · 관리자)</li><li>이 PC가 켜져 있고 QIS가 열려 있어야 함</li></ul></div>
</div>
<div class=box id=f_solo>
  <label for=sn>내 이름 <span class=muted>(담당자 · 변경 이력에 남는 이름)</span></label>
  <input id=sn value="{html.escape(solo_name)}" placeholder="예: 김선중">
  <label style="display:flex;gap:8px;align-items:center;margin-top:14px;cursor:pointer"><input type=checkbox id=sl{' checked' if solo_login else ''} onchange="slx()" style="width:auto;margin:0">
    비밀번호로 잠그기 <span class=muted>— 프로그램을 열 때 로그인 화면이 뜹니다 (자리 비움 · 공용 PC)</span></label>
  <div id=f_sl style="display:none;margin-top:10px">
    <div class=row><div><label for=sp>비밀번호 <span class=muted>(8자 이상, 영문+숫자{', 바꾸지 않으려면 비워 두기' if solo_login else ''})</span></label><input id=sp type=password autocomplete="new-password"></div>
    <div><label for=sp2>한 번 더</label><input id=sp2 type=password autocomplete="new-password"></div></div>
    <div class=muted>로그인 아이디는 <b>local</b> 입니다. 잊으면 ‘설정 › 사용 방식 바꾸기’에서 새로 정할 수 있습니다.</div>
  </div>
</div>
<div class=box id=f_lan style="display:none">
  <div class=muted>관리자 계정 — 이 계정으로 로그인해 관리 화면에서 다른 사용자를 추가합니다. 이미 있는 아이디면 비밀번호를 새로 정합니다.</div>
  <div class=row><div><label for=au>관리자 아이디</label><input id=au value="{html.escape(admin)}"></div>
  <div><label for=an>이름</label><input id=an value="{html.escape(admin_name or solo_name)}"></div></div>
  <div class=row><div><label for=ap>비밀번호 <span class=muted>(8자 이상, 영문+숫자)</span></label><input id=ap type=password></div>
  <div><label for=ap2>한 번 더</label><input id=ap2 type=password></div></div>
  <label for=pt>포트 <span class=muted>(접속 주소의 번호, 보통 8080)</span></label><input id=pt value="{int(port)}" style="max-width:160px">
  <label style="margin-top:14px">접속 허용 범위</label>
  <label style="display:flex;gap:8px;align-items:center;cursor:pointer;font-weight:400"><input type=radio name=sc value=lan{' checked' if lan_scope != 'tailscale' else ''} style="width:auto;margin:0">
    사내망 전체 <span class=muted>— 같은 사내망 · Wi-Fi 의 PC · 핸드폰</span></label>
  <label style="display:flex;gap:8px;align-items:center;cursor:pointer;font-weight:400;margin-top:6px"><input type=radio name=sc value=tailscale{' checked' if lan_scope == 'tailscale' else ''} style="width:auto;margin:0">
    Tailscale 만 <span class=muted>— 이 PC 와, 내 Tailscale 에 등록한 기기(핸드폰)만. 사내망의 다른 PC 에서는 열리지 않습니다</span></label>
</div>
<div class=err id=err>{html.escape(error)}</div>
<div style="display:flex;gap:10px"><button class=p id=go onclick="go()">시작</button>
{'<button onclick="ready(function(){api().cancel_setup()})">취소</button>' if can_cancel else ''}</div>
<p class=muted style="margin-top:22px">기존 데이터(개인판 HTML 백업 · 서버판 data 폴더)는 시작한 뒤 메뉴 ‘파일 › 가져오기’로 넣습니다.</p>
"""
    script = API_JS + f"""
var mode={init}.mode;
function $(i){{return document.getElementById(i)}}
function pick(m){{mode=m;$('c_solo').classList.toggle('on',m==='solo');$('c_lan').classList.toggle('on',m==='lan');
  $('f_solo').style.display=m==='solo'?'':'none';$('f_lan').style.display=m==='lan'?'':'none'}}
pick(mode);
var hadPw={json.dumps(bool(solo_login))};
function slx(){{$('f_sl').style.display=$('sl').checked?'':'none'}}
slx();
function go(){{
  var d={{mode:mode,solo_name:$('sn').value,solo_login:$('sl').checked,solo_password:$('sp').value,admin:$('au').value,admin_name:$('an').value,password:$('ap').value,port:$('pt').value,
    lan_scope:(document.querySelector('input[name=sc]:checked')||{{}}).value||'lan'}};
  if(mode==='lan'&&$('ap').value!==$('ap2').value){{$('err').textContent='두 번 입력한 비밀번호가 다릅니다';return}}
  if(mode==='solo'&&$('sl').checked){{
    if($('sp').value!==$('sp2').value){{$('err').textContent='두 번 입력한 비밀번호가 다릅니다';return}}
    if(!$('sp').value&&!hadPw){{$('err').textContent='잠그려면 비밀번호를 정하세요';return}}
  }}
  $('go').disabled=true;$('err').textContent='시작하는 중…';
  ready(function(){{api().setup(d).then(function(r){{if(r&&r.error){{$('err').textContent=r.error;$('go').disabled=false}}}})}});
}}
"""
    return _page("QIS — 사용 방식", body, script)


def _tailscale_info_page(addresses: list[str], port: int, windows: bool) -> str:
    """접속 범위 = Tailscale 만: 이 PC(127.0.0.1)와 Tailscale 주소에만 열림."""
    if addresses:
        rows = "".join(f"<li><code>{html.escape(a)}</code></li>" for a in addresses)
        head = "<h2>핸드폰 접속 주소 (Tailscale 을 켠 내 기기에서만)</h2>"
        miss = ""
    else:
        rows = "<li>지금은 이 PC 에서만 열려 있습니다</li>"
        head = "<h2>Tailscale 주소를 찾지 못했습니다</h2>"
        miss = ("<div class=box style='border-color:#f59e0b;background:#fffbeb'><b>⚠ 이 PC 의 Tailscale 이 꺼져 있거나 설치되어 있지 않습니다</b>"
                "<p class=muted style='margin:6px 0 0'>Tailscale 을 켜고 로그인한 뒤 QIS 를 다시 여세요. 그때까지는 다른 기기에서 접속할 수 없습니다 "
                "(사내망으로도 열리지 않습니다).</p></div>")
    fw = (f"<p class=muted>핸드폰에서 안 열리면 Windows 방화벽 규칙이 필요합니다 — Tailscale 대역에서 오는 연결만 허용합니다. 관리자 권한 명령 창에서<br>"
          f"<code>netsh advfirewall firewall add rule name=\"QIS (Tailscale)\" dir=in action=allow protocol=TCP localport={port} remoteip=100.64.0.0/10</code></p>"
          if windows else "<p class=muted>맥에서 ‘들어오는 네트워크 연결을 허용할까요?’ 창이 뜨면 ‘허용’을 누르세요.</p>")
    body = f"""
<h1>🔒 Tailscale 로만 접속되게 켜졌습니다</h1>{miss}
<div class=box>{head}<ul>{rows}</ul>{fw}
<p class=muted>사내망 · 인터넷의 다른 PC 에서는 이 주소로도, 이 PC 의 사내 IP 로도 열리지 않습니다. 오가는 내용은 Tailscale(WireGuard)이 암호화합니다.
Tailscale 주소가 바뀌거나 Tailscale 을 나중에 켰다면 QIS 를 다시 여세요. 메뉴 ‘설정 › 접속 주소 보기’에서 다시 볼 수 있습니다.</p></div>
<button class=p onclick="ready(function(){{api().go_app()}})">QIS 열기 (로그인)</button>
"""
    return _page("QIS — 접속 주소", body, API_JS)


def busy_page(msg: str) -> str:
    return _page("QIS", f'<div class=spin></div><h2>{html.escape(msg)}</h2><div class=muted>잠시 기다려 주세요. 창을 닫지 마세요.</div>')


def message_page(title: str, msg: str) -> str:
    return _page("QIS", f"<h1>{html.escape(title)}</h1><p style='white-space:pre-wrap'>{html.escape(msg)}</p>")


def recover_page(problem: str, latest: str) -> str:
    has = bool(latest)
    restore_btn = '<button class=p onclick="act(\'restore\')">최근 백업으로 복원</button>' if has else ''
    body = f"""
<h1>⚠ 지난번에 QIS가 정상적으로 닫히지 않았습니다</h1>
<p>데이터(DB)를 검사했더니 문제가 있습니다:</p><p class=err>{html.escape(problem)}</p>
<div class=box>
{f'<p>가장 최근 자동 백업: <code>{html.escape(latest)}</code></p>' if has else '<p>자동 백업 파일이 없습니다.</p>'}
<p class=muted>복원해도 지금 DB는 지우지 않고 데이터 폴더의 <code>restore_before_날짜</code> 폴더에 보관합니다.</p>
<div style="display:flex;gap:10px;flex-wrap:wrap">
{restore_btn}
<button onclick="act('open')">그대로 열기 (권장하지 않음)</button><button onclick="act('quit')">닫기</button></div>
</div><div class=err id=err></div>
"""
    script = API_JS + """
function act(c){document.querySelectorAll('button').forEach(function(b){b.disabled=true});
  ready(function(){api().recover(c).then(function(r){if(r&&r.error){document.getElementById('err').textContent=r.error;
    document.querySelectorAll('button').forEach(function(b){b.disabled=false})}})})}
"""
    return _page("QIS — 복구", body, script)


def lan_info_page(addresses: list[str], port: int, windows: bool, https: bool = False, tailscale: bool = False) -> str:
    if tailscale:
        return _tailscale_info_page(addresses, port, windows)
    rows = "".join(f"<li><code>{html.escape(a)}</code></li>" for a in addresses) or "<li>사내망 주소를 찾지 못했습니다 — 네트워크 연결을 확인하세요</li>"
    fw = (f"<p class=muted>다른 PC에서 안 열리면: 처음 실행 때 뜬 Windows 방화벽 창에서 ‘액세스 허용’을 눌렀는지 확인하세요. "
          f"또는 관리자 권한 명령 창에서 <code>netsh advfirewall firewall add rule name=\"QIS\" dir=in action=allow protocol=TCP localport={port}</code></p>"
          if windows else "<p class=muted>맥에서 ‘들어오는 네트워크 연결을 허용할까요?’ 창이 뜨면 ‘허용’을 누르세요.</p>")
    warn = "" if https else (
        "<div class=box style='border-color:#f59e0b;background:#fffbeb'><b>⚠ 암호화되지 않은 연결(http)입니다</b>"
        "<p class=muted style='margin:6px 0 0'>같은 사내망에서 오가는 아이디 · 비밀번호 · 기록 내용을 다른 사람이 엿볼 수 있습니다. "
        "IT에서 받은 인증서를 데이터 폴더의 <code>qis.json</code>에 <code>ssl_certfile</code> · <code>ssl_keyfile</code>로 넣고 "
        "프로그램을 다시 열면 https로 바뀝니다 (사용 안내서 ‘사내 서버 모드 HTTPS’).</p></div>")
    body = f"""
<h1>🏢 사내 서버로 켜졌습니다</h1>{warn}
<div class=box><h2>다른 PC · 핸드폰 접속 주소 (같은 사내망 · Wi-Fi)</h2><ul>{rows}</ul>{fw}
<p class=muted>이 PC가 켜져 있고 QIS 창이 열려 있는 동안만 접속됩니다. 메뉴 ‘설정 › 접속 주소 보기’에서 다시 볼 수 있습니다.</p></div>
<button class=p onclick="ready(function(){{api().go_app()}})">QIS 열기 (로그인)</button>
"""
    return _page("QIS — 접속 주소", body, API_JS)
