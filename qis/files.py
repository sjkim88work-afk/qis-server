"""첨부 저장소 (사진 · 통보서 · 대책서 …).

화면의 첨부 한 건(JSON: id · name · mime · data(data URL) · thumb …)을
data/files/<앞 2글자>/<id>.json 으로 그대로 저장한다.
지우면 data/files/_trash/ 로 옮김 (실제 삭제는 하지 않음 — 데이터 유실 방지).
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from .db import DB, now
from .store import ID_RE, Forbidden


class Files:
    def __init__(self, db: DB, cfg):
        self.db = db
        self.cfg = cfg
        self.root = cfg.files_dir
        (self.root / "_trash").mkdir(parents=True, exist_ok=True)

    def path(self, fid: str) -> Path:
        return self.root / fid[:2] / f"{fid}.json"

    def get_many(self, ids: list[str]) -> list[dict]:
        out = []
        for i in ids[:500]:
            if not isinstance(i, str) or not ID_RE.match(i):
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

    def put_many(self, user, recs: list[dict], ip=None) -> int:
        if user["role"] == "viewer":
            raise Forbidden("조회 권한은 첨부할 수 없습니다")
        lim = self.cfg.max_file_mb * 1048576
        n = 0
        for r in recs:
            if not isinstance(r, dict) or not isinstance(r.get("id"), str) or not ID_RE.match(r["id"]):
                raise ValueError("첨부 형식이 올바르지 않습니다")
            raw = json.dumps(r, ensure_ascii=False, separators=(",", ":"))
            if len(raw.encode()) > lim:
                raise ValueError(f"첨부가 너무 큽니다 (최대 {self.cfg.max_file_mb:g}MB): {r.get('name') or r['id']}")
        with self.db.tx() as c:
            for r in recs:
                fid = r["id"]
                p = self.path(fid)
                p.parent.mkdir(parents=True, exist_ok=True)
                tmp = p.with_suffix(".tmp")
                tmp.write_text(json.dumps(r, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
                os.replace(tmp, p)
                old = c.execute("SELECT deleted FROM files WHERE id=?", (fid,)).fetchone()
                size = int(r.get("size") or len(r.get("data") or "") * 3 // 4)
                c.execute("""INSERT INTO files(id,name,mime,size,kind,created_at,created_by,deleted) VALUES(?,?,?,?,?,?,?,0)
                             ON CONFLICT(id) DO UPDATE SET name=excluded.name, mime=excluded.mime, size=excluded.size, deleted=0""",
                          (fid, r.get("name") or "", r.get("mime") or r.get("type") or "", size,
                           r.get("kind") or "photo", now(), user["name"]))
                if not old:
                    self.db.audit(c, user=user, action="file.add", coll="files", rec_id=fid,
                                  label=r.get("name") or ("사진" if (r.get("kind") or "photo") != "doc" else fid),
                                  detail={"size": size, "kind": r.get("kind") or "photo"}, ip=ip)
                n += 1
        return n

    def delete_many(self, user, ids: list[str], ip=None) -> int:
        if user["role"] == "viewer":
            raise Forbidden("조회 권한은 첨부를 지울 수 없습니다")
        n = 0
        with self.db.tx() as c:
            for fid in ids:
                if not isinstance(fid, str) or not ID_RE.match(fid):
                    continue
                row = c.execute("SELECT name,deleted FROM files WHERE id=?", (fid,)).fetchone()
                p = self.path(fid)
                if p.exists():
                    shutil.move(str(p), str(self.root / "_trash" / p.name))
                if row and not row["deleted"]:
                    c.execute("UPDATE files SET deleted=1, deleted_at=?, deleted_by=? WHERE id=?", (now(), user["name"], fid))
                    self.db.audit(c, user=user, action="file.delete", coll="files", rec_id=fid, label=row["name"] or fid, ip=ip)
                    n += 1
        return n
