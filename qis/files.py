"""첨부 저장소 (사진 · 통보서 · 대책서 …).

화면의 첨부 한 건(JSON: id · name · mime · data(data URL) · thumb …)을
data/files/<앞 2글자>/<id>.json 으로 그대로 저장한다.
지우면 data/files/_trash/ 로 옮김 (실제 삭제는 하지 않음 — 데이터 유실 방지).
같은 id에 다른 내용이 오면 이전 내용을 data/files/_versions/ 에 보관하고 이력(file.replace)을 남김.
휴지통 · 이전 버전 파일 이름에는 시각을 붙여 서로 덮어쓰지 않음.
"""
from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime
from pathlib import Path

from .db import DB, now
from .store import Forbidden

# 첨부 id: 영문 · 숫자로 시작, 영문 · 숫자 · _ · - 만 (경로 · Windows 특수 문자 차단)
FILE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$")
# 개인 QIS 가 '아직 받지 못한 사진' 자리에 두는 회색 자리표시 이미지 — 사진 본체가 아님
PH_IMG_HEAD = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAkCAIAAABAJy5d"
DATA_URL_RE = re.compile(r"^data:[\w.+-]+/[\w.+-]+(;[^,;]*)*;base64,[A-Za-z0-9+/]")


def has_body(rec) -> bool:
    """첨부 기록에 실제 내용(data URL)이 있는지. 사진 정보만 있는 기록(개인 QIS 사진 폴더 방식)은 False."""
    d = rec.get("data") if isinstance(rec, dict) else None
    return isinstance(d, str) and not d.startswith(PH_IMG_HEAD) and bool(DATA_URL_RE.match(d[:300]))


def photo_refs(data) -> list[str]:
    """기록(JSON) 안에서 첨부 ID 참조를 모두 찾는다: photos 목록 · …Docs 목록 (어디에 있든 — 진행 기록 · 이력 포함)."""
    out: list[str] = []

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if (k == "photos" or k.endswith("Docs")) and isinstance(v, list):
                    out.extend(x for x in v if isinstance(x, str) and FILE_ID_RE.match(x))
                else:
                    walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(data)
    return out


def _stamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S_%f")


class Files:
    def __init__(self, db: DB, cfg):
        self.db = db
        self.cfg = cfg
        self.root = cfg.files_dir
        (self.root / "_trash").mkdir(parents=True, exist_ok=True)
        (self.root / "_versions").mkdir(parents=True, exist_ok=True)

    def path(self, fid: str) -> Path:
        return self.root / fid[:2] / f"{fid}.json"

    def get_many(self, ids: list[str], limit: int | None = 500) -> list[dict]:
        """화면 요청은 한 번에 limit 개까지. 서버 내부(내보내기)는 limit=None 으로 전부."""
        out = []
        for i in (ids if limit is None else ids[:limit]):
            if not isinstance(i, str) or not FILE_ID_RE.match(i):
                continue
            p = self.path(i)
            if p.exists():
                try:
                    out.append(json.loads(p.read_text(encoding="utf-8")))
                except Exception:
                    pass
        return out

    def all_ids(self) -> list[str]:
        return [r["id"] for r in self.db.q("SELECT id FROM files WHERE deleted=0")]

    def missing(self) -> dict:
        """기록이 가리키는데 내용이 없는 첨부 — 가져오기 때 '사진 정보만' 들어온 것 · 파일이 사라진 것.
        각 항목: id · 개인 QIS 사진 폴더의 파일 이름(file, 있으면) · 이름 · 종류 · 어느 기록이 쓰는지."""
        LABEL = {"defects": "불량", "ncrs": "NCR", "issues": "이슈", "cases": "RCA", "receipts": "입고"}
        refs: dict[str, list[str]] = {}
        for r in self.db.q("SELECT coll, id, data FROM records WHERE deleted=0 AND data IS NOT NULL"):
            try:
                d = json.loads(r["data"])
            except Exception:
                continue
            lab = f"{LABEL.get(r['coll'], r['coll'])} {d.get('no') or d.get('partNo') or d.get('date') or r['id']}" if isinstance(d, dict) else r["coll"]
            for fid in photo_refs(d):
                refs.setdefault(fid, [])
                if lab not in refs[fid]:
                    refs[fid].append(lab)
        out = []
        for fid, labs in refs.items():
            p = self.path(fid)
            meta = {}
            if p.exists():
                try:
                    meta = json.loads(p.read_text(encoding="utf-8"))
                except Exception:
                    meta = {}
                if has_body(meta):
                    continue
            out.append({"id": fid, "file": meta.get("file") or "", "name": meta.get("name") or "",
                        "kind": meta.get("kind") or "photo", "refs": labs[:5]})
        out.sort(key=lambda x: (x["refs"][0] if x["refs"] else "", x["id"]))
        return {"referenced": len(refs), "missing": out}

    def put_many(self, user, recs: list[dict], ip=None) -> int:
        if user["role"] == "viewer":
            raise Forbidden("조회 권한은 첨부할 수 없습니다")
        lim = self.cfg.max_file_mb * 1048576
        n = 0
        for r in recs:
            if not isinstance(r, dict) or not isinstance(r.get("id"), str) or not FILE_ID_RE.match(r["id"]):
                raise ValueError("첨부 형식이 올바르지 않습니다")
            raw = json.dumps(r, ensure_ascii=False, separators=(",", ":"))
            if len(raw.encode()) > lim:
                raise ValueError(f"첨부가 너무 큽니다 (최대 {self.cfg.max_file_mb:g}MB): {r.get('name') or r['id']}")
        with self.db.tx() as c:
            for r in recs:
                fid = r["id"]
                p = self.path(fid)
                p.parent.mkdir(parents=True, exist_ok=True)
                body = json.dumps(r, ensure_ascii=False, separators=(",", ":"))
                old = c.execute("SELECT name,deleted FROM files WHERE id=?", (fid,)).fetchone()
                replaced = False
                if p.exists():
                    prev = p.read_text(encoding="utf-8")
                    if prev == body and old and not old["deleted"]:
                        n += 1
                        continue          # 같은 내용 다시 저장 — 할 일 없음
                    if prev != body:      # 내용이 바뀜 → 이전 내용 보관
                        shutil.copy2(p, self.root / "_versions" / f"{fid}_{_stamp()}.json")
                        replaced = True
                tmp = p.with_suffix(".tmp")
                with open(tmp, "w", encoding="utf-8") as fh:
                    fh.write(body)
                    fh.flush()
                    os.fsync(fh.fileno())
                os.replace(tmp, p)
                size = int(r.get("size") or len(r.get("data") or "") * 3 // 4)
                c.execute("""INSERT INTO files(id,name,mime,size,kind,created_at,created_by,deleted) VALUES(?,?,?,?,?,?,?,0)
                             ON CONFLICT(id) DO UPDATE SET name=excluded.name, mime=excluded.mime, size=excluded.size, deleted=0""",
                          (fid, r.get("name") or "", r.get("mime") or r.get("type") or "", size,
                           r.get("kind") or "photo", now(), user["name"]))
                label = r.get("name") or ("사진" if (r.get("kind") or "photo") != "doc" else fid)
                if not old:
                    self.db.audit(c, user=user, action="file.add", coll="files", rec_id=fid, label=label,
                                  detail={"size": size, "kind": r.get("kind") or "photo"}, ip=ip)
                elif old["deleted"]:
                    self.db.audit(c, user=user, action="file.restore", coll="files", rec_id=fid, label=label,
                                  detail={"size": size}, ip=ip)
                elif replaced:
                    self.db.audit(c, user=user, action="file.replace", coll="files", rec_id=fid, label=label,
                                  detail={"size": size, "kept": "_versions"}, ip=ip)
                n += 1
        return n

    def clear_all(self, user, ip=None) -> int:
        """모든 첨부를 휴지통(_trash/reset_<시각>/)으로 옮기고 목록에서 '지움' 표시 — 데이터 비우기."""
        dest = self.root / "_trash" / f"reset_{_stamp()}"
        n = 0
        with self.db.tx() as c:
            for d in list(self.root.iterdir()):
                if d.is_dir() and not d.name.startswith("_"):
                    dest.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(d), str(dest / d.name))
            n = c.execute("UPDATE files SET deleted=1, deleted_at=?, deleted_by=? WHERE deleted=0", (now(), user["name"])).rowcount
            self.db.audit(c, user=user, action="reset", coll="files", label="모든 첨부 비우기", detail={"files": n, "kept": dest.name}, ip=ip)
        return n

    def delete_many(self, user, ids: list[str], ip=None) -> int:
        if user["role"] == "viewer":
            raise Forbidden("조회 권한은 첨부를 지울 수 없습니다")
        n = 0
        with self.db.tx() as c:
            for fid in ids:
                if not isinstance(fid, str) or not FILE_ID_RE.match(fid):
                    continue
                row = c.execute("SELECT name,deleted FROM files WHERE id=?", (fid,)).fetchone()
                p = self.path(fid)
                if p.exists():
                    shutil.move(str(p), str(self.root / "_trash" / f"{fid}_{_stamp()}.json"))
                if row and not row["deleted"]:
                    c.execute("UPDATE files SET deleted=1, deleted_at=?, deleted_by=? WHERE id=?", (now(), user["name"], fid))
                    self.db.audit(c, user=user, action="file.delete", coll="files", rec_id=fid, label=row["name"] or fid, ip=ip)
                    n += 1
        return n
