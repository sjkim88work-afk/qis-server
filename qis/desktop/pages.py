"""프로그램 창에 직접 그리는 작은 화면들 (서버가 뜨기 전 · 작업 중): 처음 설정 · 작업 중 · 손상 복구 · 안내."""
from __future__ import annotations

import html
import json

CSS = """
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo",sans-serif;
background:#f3f5f8;color:#1a1f29;font-size:13px;line-height:1.5}
.wrap{max-width:720px;margin:0 auto;padding:32px 24px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;margin:0 0 4px}.muted{color:#5a6372;font-weight:400}
.box{background:#fff;border:1px solid #d5dae2;border-radius:4px;padding:14px 16px 16px;margin:12px 0}
label{display:block;margin:12px 0 4px;font-size:12px;font-weight:600;color:#3a4250}
input{width:100%;height:34px;padding:0 10px;border:1px solid #c9cfd8;border-radius:3px;font-size:13px;background:#fff}
input:disabled{background:#f3f5f8;color:#8a93a2}input[type=radio]{width:auto;height:auto;margin:3px 0 0;flex:none}
.row{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
.opts{border:1px solid #d5dae2;border-top:0;border-radius:3px;margin-top:8px}
.opt{display:flex;gap:8px;align-items:flex-start;margin:0;padding:7px 10px;border-top:1px solid #eceef2;font-size:13px;font-weight:400;color:#1a1f29;cursor:pointer}
.opt:has(input:checked){background:#f4f7f7}.opt b{font-weight:600}
.port{display:flex;align-items:center;gap:10px;margin-top:12px}
button{height:34px;padding:0 14px;border-radius:3px;border:1px solid #c9cfd8;background:#fff;font-size:13px;cursor:pointer}
button.p{background:#00635f;border-color:#00635f;color:#fff;font-weight:600;padding:0 18px}button:disabled{opacity:.5}
.err{color:#b91c1c;margin:10px 0;font-weight:600;white-space:pre-wrap}.ok{color:#047857}
ul{padding-left:18px;line-height:1.6}
.path{display:block;margin-top:8px;padding:6px 10px;border:1px solid #d5dae2;background:#f7f8fa;word-break:break-all;font-size:12.5px}
.kv{display:flex;gap:8px;padding:3px 0;font-size:12.5px}.kv:first-of-type{margin-top:8px}.kv>span:first-child{flex:0 0 96px;color:#5a6372}
.btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.btns button{height:30px;padding:0 12px;font-size:12.5px}
.warn{margin:10px 0;padding:8px 10px;border-left:3px solid #b4530a;background:#fff8ec;font-size:12.5px}.warn[bad]{border-color:#a62a1a;background:#fdf1ef}
code{background:#eef2f7;padding:2px 6px;border-radius:3px}
.spin{width:28px;height:28px;border:3px solid #d5dae2;border-top-color:#00635f;border-radius:50%;animation:s 1s linear infinite;margin:30px 0 12px}
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


def setup_page(*, first: bool = True, admin: str = "admin", admin_name: str = "", port: int = 8080, error: str = "",
               can_cancel: bool = False, version: str = "", scope: str = "local") -> str:
    """처음 설정 · 접속 설정 바꾸기 — 한 화면: 관리자 계정 + 접속 범위 (이 PC만 / 사내망 전체 / Tailscale 만).
    first=False (바꾸기) 에서는 비밀번호를 비워 두면 그대로 둠."""
    def radio(v: str, title: str, desc: str) -> str:
        return (f'<label class=opt><input type=radio name=sc value={v}{" checked" if scope == v else ""} onchange="scx()">'
                f"<span><b>{title}</b> <span class=muted>— {desc}</span></span></label>")
    keep = "" if first else ", 바꾸지 않으려면 비워 두기"
    body = f"""
<h1>{'QIS 처음 설정' if first else 'QIS 접속 설정 바꾸기'}</h1>
<div class=muted>QIS 품질정보시스템 {html.escape(version)} · 나중에 메뉴 ‘설정 › 접속 설정 바꾸기’에서 바꿀 수 있습니다. 데이터는 그대로 둡니다.</div>
<div class=box>
  <h2>1. 관리자 계정</h2>
  <div class=muted>QIS 를 열 때 이 계정으로 로그인합니다. 다른 사용자는 관리 화면에서 추가합니다. 이미 있는 아이디면 비밀번호를 새로 정합니다.</div>
  <div class=row><div><label for=au>아이디</label><input id=au value="{html.escape(admin)}"></div>
  <div><label for=an>이름 <span class=muted>(담당자 · 변경 이력에 남음)</span></label><input id=an value="{html.escape(admin_name)}" placeholder="예: 김선중"></div></div>
  <div class=row><div><label for=ap>비밀번호 <span class=muted>(8자 이상, 영문+숫자{keep})</span></label><input id=ap type=password autocomplete="new-password"></div>
  <div><label for=ap2>한 번 더</label><input id=ap2 type=password autocomplete="new-password"></div></div>
</div>
<div class=box>
  <h2>2. 접속 범위</h2>
  <div class=opts>
  {radio("local", "이 PC만", "다른 PC · 휴대폰에서는 열리지 않습니다. 혼자 쓸 때")}
  {radio("lan", "사내망 전체", "같은 사내망 · Wi-Fi 의 PC · 휴대폰. 이 PC가 켜져 있고 QIS가 열려 있어야 합니다")}
  {radio("tailscale", "Tailscale 만", "이 PC 와, 내 Tailscale 에 등록한 기기만. 사내망의 다른 PC 에서는 열리지 않습니다")}
  </div>
  <div class=port><label for=pt style="margin:0">포트</label><input id=pt value="{int(port)}" style="width:90px">
    <span class=muted id=ptn></span></div>
</div>
<div class=err id=err>{html.escape(error)}</div>
<div style="display:flex;gap:8px"><button class=p id=go onclick="go()">{'시작' if first else '바꾸기'}</button>
{'<button onclick="ready(function(){api().cancel_setup()})">취소</button>' if can_cancel else ''}</div>
<p class=muted style="margin-top:18px">기존 데이터(백업 파일 · 서버판 data 폴더)는 시작한 뒤 메뉴 ‘파일 › 가져오기’로 넣습니다.</p>
"""
    script = API_JS + f"""
var first={json.dumps(bool(first))};
function $(i){{return document.getElementById(i)}}
function sc(){{return (document.querySelector('input[name=sc]:checked')||{{}}).value||''}}
function scx(){{var l=sc()==='local';$('pt').disabled=l;
  $('ptn').textContent=l?'‘이 PC만’ 에서는 쓰지 않습니다':'접속 주소의 번호입니다 (보통 8080)'}}
scx();
function go(){{
  var d={{admin:$('au').value,admin_name:$('an').value,password:$('ap').value,port:$('pt').value,scope:sc()}};
  if(!d.scope){{$('err').textContent='접속 범위를 고르세요';return}}
  if($('ap').value!==$('ap2').value){{$('err').textContent='두 번 입력한 비밀번호가 다릅니다';return}}
  if(first&&!$('ap').value){{$('err').textContent='비밀번호를 정하세요';return}}
  $('go').disabled=true;$('err').textContent='시작하는 중…';
  ready(function(){{api().setup(d).then(function(r){{if(r&&r.error){{$('err').textContent=r.error;$('go').disabled=false}}}})}});
}}
"""
    return _page("QIS — 접속 설정", body, script)


def _mb(n) -> str:
    if n is None:
        return "-"
    return f"{n / 1073741824:.1f}GB" if n >= 1073741824 else f"{n / 1048576:.1f}MB"


def storage_page(info: dict, msg: str = "", can_move: bool = True) -> str:
    """메뉴 ‘설정 › 저장 위치’: 데이터 폴더와 자동 백업 폴더를 따로 정함. info = core.storage_info()."""
    e = html.escape
    last = info.get("last")
    last_txt = (f"{e(str(last.get('at', ''))[:16].replace('T', ' '))} · {'수동' if last.get('reason') == 'manual' else '자동'} · "
                f"첨부 {last.get('files_copied', 0)}개 복사") if last else "아직 없음"
    warn = []
    if info.get("data_risky"):
        warn.append(f"<div class=warn bad><b>데이터 폴더가 {e(info['data_risky'])}(으)로 보입니다.</b><br>"
                    "기록 파일이 손상될 수 있습니다. 이 PC의 디스크로 옮기고, 백업 폴더만 NAS · 공유 폴더에 두세요.</div>")
    if not info.get("backup_ok"):
        warn.append(f"<div class=warn bad><b>백업 폴더에 쓸 수 없습니다.</b><br>{e(info.get('backup_error', ''))}<br>"
                    "폴더가 연결되어 있는지 확인하거나 ‘폴더 바꾸기’ 로 다른 폴더를 고르세요. 그때까지 자동 백업이 되지 않습니다.</div>")
    elif info.get("backup_inside") or info.get("same_disk"):
        warn.append("<div class=warn><b>백업 폴더가 데이터 폴더와 같은 디스크에 있습니다.</b><br>"
                    "디스크가 고장 나면 원본과 백업을 같이 잃습니다. 다른 디스크나 NAS · 공유 폴더로 바꾸세요.</div>")
    state = "쓸 수 없음" if not info.get("backup_ok") else ("쓸 수 있음 · 데이터 폴더와 같은 디스크" if (info.get("backup_inside") or info.get("same_disk"))
                                                       else "쓸 수 있음 · 데이터 폴더와 다른 디스크")
    move = ('<button onclick="act(\'move_data\')">폴더 옮기기…</button>' if can_move else "")
    body = f"""
<h1>저장 위치</h1>
<div class=muted>데이터와 자동 백업을 두는 폴더를 따로 정합니다.</div>
<div class=err id=msg style="color:#1a1f29;font-weight:400">{e(msg)}</div>
{''.join(warn)}
<div class=box>
  <h2>1. 데이터 폴더</h2>
  <div class=muted>기록 (qis.db) 과 사진 · 첨부 (files) 가 있는 곳입니다. 이 PC의 디스크에 두세요.</div>
  <code class=path>{e(info['data'])}</code>
  <div class=kv><span>크기</span><span>기록 {_mb(info.get('db_bytes'))} · 첨부 {_mb(info.get('files_bytes'))} ({info.get('files', 0)}개)</span></div>
  <div class=kv><span>디스크</span><span>남은 용량 {_mb(info.get('data_free'))}</span></div>
  <div class=btns>{move}<button onclick="act('open_data')">폴더 열기</button></div>
  <div class=muted style="margin-top:8px">{'옮기기: QIS를 잠시 멈추고 새 폴더로 복사한 뒤 QIS를 닫습니다. 다시 열면 새 폴더로 열립니다. 예전 폴더는 지우지 않습니다.' if can_move else '--data 옵션으로 시작한 QIS 는 여기서 옮길 수 없습니다.'}</div>
</div>
<div class=box>
  <h2>2. 자동 백업 폴더</h2>
  <div class=muted>하루 한 번 ({int(info.get('hour', 2))}시 이후 처음 켜져 있을 때) 기록의 사본과 새 첨부를 여기에 복사합니다. 다른 디스크나 NAS · 공유 폴더를 권장합니다.</div>
  <code class=path>{e(info['backup'])}</code>
  <div class=kv><span>마지막 백업</span><span>{last_txt}</span></div>
  <div class=kv><span>보관</span><span>날짜별 사본 {int(info.get('keep', 30))}개</span></div>
  <div class=kv><span>상태</span><span>{state} · 남은 용량 {_mb(info.get('backup_free'))}</span></div>
  <div class=btns><button onclick="act('pick_backup')">폴더 바꾸기…</button><button onclick="act('backup_now')">지금 백업</button><button onclick="act('open_backup')">폴더 열기</button></div>
</div>
<div style="display:flex;gap:8px"><button class=p onclick="ready(function(){{api().go_app()}})">QIS로 돌아가기</button></div>
"""
    script = API_JS + """
var busy=false;
function act(a){if(busy)return;busy=true;var m=document.getElementById('msg');
  if(a==='backup_now')m.textContent='백업하는 중…';
  ready(function(){api().storage(a).then(function(r){busy=false;if(r&&r.error)m.textContent=r.error},function(){busy=false})})}
"""
    return _page("QIS — 저장 위치", body, script)


def _tailscale_info_page(addresses: list[str], port: int, windows: bool) -> str:
    """접속 범위 = Tailscale 만: 이 PC(127.0.0.1)와 Tailscale 주소에만 열림."""
    if addresses:
        rows = "".join(f"<li><code>{html.escape(a)}</code></li>" for a in addresses)
        head = "<h2>휴대폰 접속 주소 (Tailscale 을 켠 내 기기에서만)</h2>"
        miss = ""
    else:
        rows = "<li>지금은 이 PC 에서만 열려 있습니다</li>"
        head = "<h2>Tailscale 주소를 찾지 못했습니다</h2>"
        miss = ("<div class=box style='border-color:#f59e0b;background:#fffbeb'><b>이 PC 의 Tailscale 이 꺼져 있거나 설치되어 있지 않습니다</b>"
                "<p class=muted style='margin:6px 0 0'>Tailscale 을 켜고 로그인한 뒤 QIS 를 다시 여세요. 그때까지는 다른 기기에서 접속할 수 없습니다 "
                "(사내망으로도 열리지 않습니다).</p></div>")
    fw = (f"<p class=muted>휴대폰에서 안 열리면 Windows 방화벽 규칙이 필요합니다 — Tailscale 대역에서 오는 연결만 허용합니다. 관리자 권한 명령 창에서<br>"
          f"<code>netsh advfirewall firewall add rule name=\"QIS (Tailscale)\" dir=in action=allow protocol=TCP localport={port} remoteip=100.64.0.0/10</code></p>"
          if windows else "<p class=muted>맥에서 ‘들어오는 네트워크 연결을 허용할까요?’ 창이 뜨면 ‘허용’을 누르세요.</p>")
    body = f"""
<h1>Tailscale 로만 접속되게 켜졌습니다</h1>{miss}
<div class=box>{head}<ul>{rows}</ul>{fw}
<p class=muted>사내망 · 인터넷의 다른 PC 에서는 이 주소로도, 이 PC 의 사내 IP 로도 열리지 않습니다. 오가는 내용은 Tailscale(WireGuard)이 암호화합니다.
Tailscale 주소가 바뀌거나 Tailscale 을 나중에 켰다면 QIS 를 다시 여세요. 메뉴 ‘설정 › 접속 주소 보기’에서 다시 볼 수 있습니다.</p></div>
<button class=p onclick="ready(function(){{api().go_app()}})">QIS 열기 (로그인)</button>
"""
    return _page("QIS — 접속 주소", body, API_JS)


def busy_page(msg: str) -> str:
    return _page("QIS", f'<div class=spin></div><h2>{html.escape(msg)}</h2><div class=muted>잠시 기다리세요. 창을 닫지 마세요.</div>')


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
        "<div class=box style='border-color:#f59e0b;background:#fffbeb'><b>암호화되지 않은 연결(http)입니다</b>"
        "<p class=muted style='margin:6px 0 0'>같은 사내망에서 오가는 아이디 · 비밀번호 · 기록 내용을 다른 사람이 엿볼 수 있습니다. "
        "IT에서 받은 인증서를 데이터 폴더의 <code>qis.json</code>에 <code>ssl_certfile</code> · <code>ssl_keyfile</code>로 넣고 "
        "프로그램을 다시 열면 https로 바뀝니다 (사용 안내서 ‘사내망 HTTPS’).</p></div>")
    body = f"""
<h1>사내망에서 접속되게 켜졌습니다</h1>{warn}
<div class=box><h2>다른 PC · 휴대폰 접속 주소 (같은 사내망 · Wi-Fi)</h2><ul>{rows}</ul>{fw}
<p class=muted>이 PC가 켜져 있고 QIS 창이 열려 있는 동안만 접속됩니다. 메뉴 ‘설정 › 접속 주소 보기’에서 다시 볼 수 있습니다.</p></div>
<button class=p onclick="ready(function(){{api().go_app()}})">QIS 열기 (로그인)</button>
"""
    return _page("QIS — 접속 주소", body, API_JS)
