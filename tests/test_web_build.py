"""qis/web/src/ 를 합친 결과가 저장된 index.html 과 같은지 — 둘 중 하나만 고치고 커밋하면 여기서 걸린다."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_index_html_matches_src():
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "build_web.py"), "--check"],
                       capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr or r.stdout


def test_src_layout():
    src = ROOT / "qis" / "web" / "src"
    assert (src / "head.html").is_file() and (src / "body.html").is_file()
    js = sorted(p.name for p in (src / "js").glob("*.js"))
    assert js and js[0].startswith("00-") and all(p[:2].isdigit() for p in js)   # 숫자 앞머리로 순서
    for p in (src / "js").glob("*.js"):      # 한 <script> 안에 들어가므로 닫는 태그가 그대로 들어 있으면 안 됨 (<\/script> 는 됨)
        assert "</script>" not in p.read_text(encoding="utf-8").lower(), p.name


def test_static_pages_call_no_outside_address():
    """사내망 전용: 로그인 · 관리 · 비밀번호 · 입장 화면은 바깥 주소(구글 글꼴 등)를 부르지 않는다.
    서버의 보안 정책(CSP)이 막으므로 넣어도 콘솔 오류만 난다 (메인 화면의 글꼴 연결은 서버가 지워서 내보냄)."""
    import re
    web = ROOT / "qis" / "web"
    for name in ("login.html", "admin.html", "account.html", "desktop_enter.html"):
        h = (web / name).read_text(encoding="utf-8")
        assert not re.search(r"""(?:href|src)\s*=\s*["']https?://""", h), name
        assert "fonts.googleapis.com" not in h and "fonts.gstatic.com" not in h, name


def test_sidebar_breakpoint_is_the_same_in_css_and_js():
    """좌측 사이드바를 켜는 창 너비는 CSS(25-renewal.css)와 JS(05-routing.js NAV_MQ)가 같아야 한다.
    다르면 사이드바는 보이는데 로그아웃 칸은 머리글에 남는(또는 그 반대) 구간이 생긴다."""
    import re
    src = ROOT / "qis" / "web" / "src"
    css = (src / "css" / "25-renewal.css").read_text(encoding="utf-8")
    js = (src / "js" / "05-routing.js").read_text(encoding="utf-8")
    m = re.search(r"NAV_MQ\s*=.*?matchMedia\(['\"]\(min-width:(\d+)px\)['\"]\)", js)
    assert m, "NAV_MQ 를 찾지 못함"
    bp = m.group(1)
    assert re.search(r"@media screen and \(min-width:%spx\)\{\s*body:not\(\.mob\)\{display:grid" % bp, css), bp
    lows = set(re.findall(r"@media screen and \(min-width:(\d+)px\)", css))
    assert lows == {bp}, lows      # 사이드바 관련 구간은 모두 같은 값에서 시작
    names = sorted(p.name for p in (src / "css").glob("*.css"))
    assert names.index("25-renewal.css") < names.index("30-mobile.css")      # 휴대폰 규칙이 맨 뒤에서 이김
