"""화면 문구 규칙(docs/문구_규칙.md): 쓰지 않는 말이 화면 소스에 다시 들어오지 않게 한다."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANNED = ["핸드폰", "모바일 화면", "부품번호", "부품명", "다운로드", "업로드", "불러오기", "공급업체", "하십시오",
          "넣어주세요", "바꿔주세요", "골라주세요"]
# 엑셀 열 이름 인식 목록 · 정규식은 예외 — 사용자의 옛 파일에 있는 말을 읽어야 함
ALIAS = re.compile(r"c=>/|test\(c\)|'품목코드'|\|품목코드|'자재코드'|'[^']+',\s*\[\s*'[^']+'(,\s*'[^']+')+\s*\]")


def _files():
    yield from sorted((ROOT / "qis/web/src").rglob("*.js"))
    yield from sorted((ROOT / "qis/web/src").rglob("*.html"))
    yield ROOT / "qis/web/admin.html"
    yield from sorted((ROOT / "qis/desktop").glob("*.py"))


def test_no_banned_words():
    bad = []
    for f in _files():
        for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if ALIAS.search(line):
                continue
            for w in BANNED:
                if w in line:
                    bad.append(f"{f.relative_to(ROOT)}:{i}: '{w}' — docs/문구_규칙.md 의 '쓰는 말'로 바꾸세요")
    assert not bad, "\n".join(bad[:20])
