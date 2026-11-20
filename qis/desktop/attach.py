"""첨부 파일 저장 · 열어보기 — 화면이 넘긴 data URL 을 이 PC 의 파일로.

열어보기(기본 프로그램으로 바로 실행)는 실행될 수 없는 보기 전용 형식(PDF · 그림 · 글자)만.
그 밖의 형식(실행 파일 · 스크립트 · 매크로가 들 수 있는 문서 · html 등)은 저장 위치를 묻는 창으로 돌린다.
"""
from __future__ import annotations

import base64
import logging
import re
import tempfile
from pathlib import Path

from . import core

log = logging.getLogger("qis.desktop")

def _safe_name(name: str, default: str = "QIS_파일") -> str:
    n = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", str(name or "")).strip(" .")
    return n[:120] or default


OPEN_MIME_EXT = {"application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif",
                 "image/webp": ".webp", "image/bmp": ".bmp", "text/plain": ".txt", "text/csv": ".csv"}
OPEN_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".txt", ".csv"}
OPEN_DIR = "QIS_열어보기"

# 저장할 때 붙이는 확장자 — 파일 이름에 확장자가 없으면 내용의 형식으로 정함
SAVE_MIME_EXT = {
    **OPEN_MIME_EXT,
    "image/svg+xml": ".svg", "image/tiff": ".tif", "application/zip": ".zip", "application/x-zip-compressed": ".zip",
    "application/json": ".json", "text/html": ".html", "application/x-sqlite3": ".sqlite", "application/sql": ".sql",
    "message/rfc822": ".eml", "application/vnd.ms-outlook": ".msg",
    "application/msword": ".doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel.sheet.macroenabled.12": ".xlsm",
    "application/vnd.ms-powerpoint": ".ppt", "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/x-hwp": ".hwp", "application/haansofthwp": ".hwp", "application/vnd.hancom.hwp": ".hwp", "application/vnd.hancom.hwpx": ".hwpx",
}
SAME_EXT = ({".jpg", ".jpeg"}, {".htm", ".html"}, {".tif", ".tiff"})      # 같은 형식으로 보는 확장자
_EXT_RE = re.compile(r"\.[a-z0-9]{1,8}")


def save_name(name: str, data_url) -> tuple[str, str]:
    """저장 창에 넣을 파일 이름과 지켜야 할 확장자. 이름에 확장자가 없으면 내용의 형식에서 찾는다 (모르면 "")."""
    n = _safe_name(name)
    ext = Path(n).suffix.lower()
    if _EXT_RE.fullmatch(ext):
        return n, ext
    ext = SAVE_MIME_EXT.get(_mime_of(data_url), "")
    return (n[:112] + ext if ext else n), ext


def keep_ext(p: Path, ext: str) -> Path:
    """사용자가 저장 창에서 이름을 바꾸며 확장자를 빼거나 다르게 쓰면 원래 확장자를 붙인다.
    확장자가 없거나 다르면 파일이 열리지 않기 때문 (PPT · 엑셀 · 메일 파일 등). 같은 이름이 있으면 덮어쓰지 않고 (1) 을 붙인다."""
    if not ext:
        return p
    cur = p.suffix.lower()
    if cur == ext or any(cur in g and ext in g for g in SAME_EXT):
        return p
    q, k = p.with_name(p.name + ext), 1
    while q.exists():
        q = p.with_name(f"{p.name} ({k}){ext}")
        k += 1
    return q


def _mime_of(d: str) -> str:
    head = d.split(",", 1)[0][5:] if isinstance(d, str) and d.startswith("data:") else ""
    return head.split(";", 1)[0].strip().lower()


def open_name(name: str, data_url: str) -> str | None:
    """열어보기용 파일 이름 (확장자는 허용 목록 안에서만). 열어보면 안 되는 형식이면 None."""
    n = _safe_name(name, "첨부")
    ext = Path(n).suffix.lower()
    if ext in OPEN_EXT:
        return n
    ext = OPEN_MIME_EXT.get(_mime_of(data_url))
    if not ext:
        return None
    stem = Path(n).stem if Path(n).suffix else n
    return _safe_name(stem, "첨부")[:100] + ext


def _decode_data_url(d: str) -> bytes:
    if not isinstance(d, str) or not d.startswith("data:") or "," not in d:
        raise ValueError("파일 내용이 올바르지 않습니다")
    head, body = d.split(",", 1)
    if ";base64" in head:
        return base64.b64decode(body)
    from urllib.parse import unquote_to_bytes
    return unquote_to_bytes(body)



def ask_save(window, name: str, types=()) -> Path | None:
    """저장 위치를 묻는 창 (기본: 내려받기 폴더). 취소하면 None."""
    import webview
    d = Path.home() / "Downloads"
    r = window.create_file_dialog(webview.FileDialog.SAVE, directory=str(d if d.is_dir() else Path.home()),
                                  save_filename=name, file_types=types)
    if not r:
        return None
    return Path(r if isinstance(r, str) else r[0])


def save_file(ask, name: str, data_url) -> str | None:
    """data URL 을 사용자가 고른 위치에 저장. ask(name, types) 는 저장 창을 띄워 경로를 돌려주는 함수."""
    try:
        data = _decode_data_url(data_url)
        n, ext = save_name(name, data_url)
        # 저장 창에 파일 형식을 알려 줌 — 이름만 바꿔 써도 확장자가 붙음
        p = ask(n, (f"{ext[1:].upper()} 파일 (*{ext})", "모든 파일 (*.*)") if ext else ())
        if not p:
            return None
        p = keep_ext(Path(p), ext)
        p.write_bytes(data)
        return f"저장했습니다: {p.name}"
    except Exception as e:
        log.exception("파일 저장 실패")
        return f"저장하지 못했습니다: {e}"


def open_file(ask, name: str, data_url) -> str | None:
    """첨부 열어보기 — 보기 전용 형식만 임시 폴더에 두고 기본 프로그램으로 연다. 다른 형식은 저장 창으로."""
    try:
        fn = open_name(name, data_url)
        if not fn:
            log.warning("열어보기 거부 (형식 %r · 이름 %r) → 저장 창", _mime_of(data_url), name)
            return save_file(ask, name, data_url)
        data = _decode_data_url(data_url)
        d = Path(tempfile.gettempdir()) / OPEN_DIR
        d.mkdir(exist_ok=True)
        p = d / fn
        p.write_bytes(data)
        core.open_in_os(p)
        return None
    except Exception as e:
        log.exception("첨부 열기 실패")
        return f"열지 못했습니다: {e}"
