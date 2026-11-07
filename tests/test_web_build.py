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
