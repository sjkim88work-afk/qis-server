#!/usr/bin/env python3
"""qis/web/src/ → qis/web/index.html 한 파일로 합치기.

QIS 화면은 '파일 하나'여야 한다: 서버 없이 더블클릭으로 열리고, 화면 안의 '공유 파일 만들기'가
자기 자신(document.outerHTML)을 복사해 데이터를 끼워 넣기 때문이다. 그래서 소스는 나누어 두고
이 스크립트로 합친 index.html 을 저장소에 함께 둔다 (서버 · 데스크톱 · PyInstaller 는 합친 파일만 본다).

  python scripts/build_web.py          합치기 (바뀐 경우에만 씀)
  python scripts/build_web.py --check  합친 결과가 저장된 index.html 과 같은지만 확인 (CI)

순서: head.html → <style> css/*.css (이름순) </style> → body.html → <script> js/*.js (이름순) </script>
파일 이름의 숫자 앞머리가 순서를 정한다. 모든 js 는 한 <script> 안에 이어지므로 전역 범위를 공유한다 (전과 같음).
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "qis" / "web" / "src"
OUT = ROOT / "qis" / "web" / "index.html"


def _read(p: Path) -> str:
    t = p.read_text(encoding="utf-8")
    if not t.endswith("\n"):
        t += "\n"
    return t


def _parts(folder: Path, ext: str) -> list[Path]:
    fs = sorted(p for p in folder.glob(f"*{ext}") if p.is_file())
    if not fs:
        raise SystemExit(f"{folder} 에 {ext} 파일이 없습니다")
    return fs


def build() -> str:
    head = _read(SRC / "head.html")
    body = _read(SRC / "body.html")
    css = "".join(_read(p) for p in _parts(SRC / "css", ".css"))
    js = "".join(_read(p) for p in _parts(SRC / "js", ".js"))
    return head + "<style>\n" + css + "</style>\n</head>\n<body>\n" + body + "<script>\n" + js + "</script>\n</body>\n</html>\n"


def main(argv: list[str]) -> int:
    html = build()
    cur = OUT.read_text(encoding="utf-8") if OUT.exists() else None
    if "--check" in argv:
        if cur == html:
            print(f"OK: {OUT.relative_to(ROOT)} 은 src/ 와 일치")
            return 0
        print(f"다릅니다: src/ 를 고쳤으면 `python scripts/build_web.py` 로 다시 합치고 함께 커밋하세요 "
              f"({OUT.relative_to(ROOT)} 을 직접 고쳤으면 src/ 쪽을 고치세요)", file=sys.stderr)
        return 1
    if cur == html:
        print("변경 없음")
        return 0
    OUT.write_text(html, encoding="utf-8", newline="\n")
    print(f"썼습니다: {OUT.relative_to(ROOT)} ({len(html):,}자)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
