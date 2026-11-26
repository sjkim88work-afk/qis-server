"""기록 저장 · 동기화 · 변경 이력.

화면(브라우저)은 기록을 한 건씩 보낸다: {coll, id, rev, base, data}
  rev  = 화면이 마지막으로 받은 서버 버전 (새 기록이면 0)
  base = 그 버전의 내용 (동시 수정 때 합치기용)
  data = 새 내용 (null 이면 삭제)

· rev 가 서버와 같으면 그대로 저장
· 다르면 (그 사이 다른 사람이 고침) 항목별로 합침:
    내가 고친 항목만 내 값으로, 나머지는 서버 값 유지.
    같은 항목을 둘 다 고쳤으면 지금 저장한 값으로 하고 '동시 수정'으로 이력에 남김
· 모든 저장 · 삭제는 audit(변경 이력)에 '누가 · 언제 · 무엇을 · 이전 → 새 값'으로 남김
"""
from __future__ import annotations

import json
import re

from .db import DB, now

COLLS = ("suppliers", "parts", "defects", "ncrs", "receipts", "reviews", "cases", "actions", "issues", "qrqcs")
DOCS = ("settings", "bom")              # coll='doc' 인 단일 문서
MASTER = ("suppliers", "parts")
EDITOR_SETTINGS_KEYS = {"owners"}       # 작성자가 바꿀 수 있는 설정 (불량 담당자 추가 등)
ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,80}$")
SKIP_DIFF = {"updatedAt", "_dirty"}
NO_CONFLICT = SKIP_DIFF | {"createdAt"}   # 동시 수정 판정에서 빼는 자동 항목

COLL_NAME = {"suppliers": "협력사", "parts": "부품", "defects": "불량", "ncrs": "NCR", "receipts": "입고",
             "reviews": "월간 검토", "cases": "RCA", "actions": "RCA 조치", "issues": "이슈", "qrqcs": "신속대응", "doc": "설정"}


def label_of(coll: str, rid: str, d: dict | None) -> str:
    d = d or {}
    g = lambda *ks: " ".join(str(d.get(k) or "") for k in ks).strip()
    if coll == "doc":
        return {"settings": "설정", "bom": "BOM"}.get(rid, rid)
    if coll == "suppliers":
        return g("code", "name")
    if coll == "parts":
        return g("partNo", "name")
    if coll == "defects":
        return g("date", "partNo", "defectType") or g("date", "partNo")
    if coll == "ncrs":
        return g("no", "title")
    if coll == "receipts":
        return g("month", "date", "partNo")
    if coll == "reviews":
        return g("month")
    if coll == "cases":
        return g("CaseNo", "Title")
    if coll == "actions":
        return g("Title")
    if coll == "issues":
        return g("no", "title")
    if coll == "qrqcs":
        return g("no", "part")
    return rid


def _short(v, n=300):
    if isinstance(v, (list, dict)):
        s = json.dumps(v, ensure_ascii=False)
        if len(s) <= n:
            return v
        return f"[목록 {len(v)}개]" if isinstance(v, list) else f"[항목 {len(v)}개]"
    if isinstance(v, str) and len(v) > n:
        if v.startswith("data:"):
            return f"[파일 {len(v) // 1365}KB]"
        return v[:n] + "…"
    return v


def _empty(v) -> bool:
    return v is None or v == "" or v == [] or v == {}


def diff(old: dict | None, new: dict | None) -> dict:
    old, new = old or {}, new or {}
    out = {}
    for k in sorted(set(old) | set(new)):
        if k in SKIP_DIFF:
            continue
        a, b = old.get(k), new.get(k)
        if a != b and not (_empty(a) and _empty(b)):   # 빈 값끼리(없음 · '' · [])는 바뀐 것으로 보지 않음
            out[k] = [_short(a), _short(b)]
    return out


class Forbidden(Exception):
    pass


class Store:
    def __init__(self, db: DB, cfg):
        self.db = db
        self.cfg = cfg

    # ---- 읽기 ----
    def boot(self):
        rows = self.db.q("SELECT coll,id,rev,data FROM records WHERE deleted=0")
        return {"seq": self.db.seq(),
                "records": [{"coll": r["coll"], "id": r["id"], "rev": r["rev"], "data": json.loads(r["data"])} for r in rows]}

    def changes_since(self, c, since: int, limit=5000):
        rows = c.execute("SELECT coll,id,rev,seq,data,deleted,updated_by FROM records WHERE seq>? ORDER BY seq LIMIT ?",
                         (since, limit + 1)).fetchall()
        if len(rows) > limit:
            return None
        return [{"coll": r["coll"], "id": r["id"], "rev": r["rev"], "by": r["updated_by"],
                 "data": None if r["deleted"] else json.loads(r["data"])} for r in rows]

    # ---- 권한 ----
    @staticmethod
    def check(user, coll, rid, cur: dict | None, new: dict | None, cur_deleted: bool):
        role = user["role"]
        if role == "admin":
            return
        if role != "editor":
            raise Forbidden("조회 권한은 저장할 수 없습니다")
        if coll == "doc":
            if rid == "bom":
                raise Forbidden("BOM 변경은 관리자만 할 수 있습니다")
            if rid == "settings":
                ch = {k for k in set(cur or {}) | set(new or {}) if (cur or {}).get(k) != (new or {}).get(k)}
                added = {k for k in ch if k not in (cur or {})}   # 새 버전 화면이 채우는 기본값
                if cur is None or ch - EDITOR_SETTINGS_KEYS - added:
                    raise Forbidden("설정 변경은 관리자만 할 수 있습니다")
                return
        if coll in MASTER and new is None and cur is not None and not cur_deleted:
            raise Forbidden("기준정보(협력사 · 부품) 삭제는 관리자만 할 수 있습니다")

    # ---- 쓰기 ----
    def sync(self, user, since: int, changes: list, ip=None):
        results, warns = [], []
        with self.db.tx() as c:
            pulled = self.changes_since(c, since) if since is not None else []
            for ch in changes:
                try:
                    results.append(self._apply(c, user, ch, ip))
                except Forbidden as e:
                    results.append(self._reject(c, ch, "forbidden", str(e)))
                except ValueError as e:
                    results.append(self._reject(c, ch, "invalid", str(e)))
            # NCR · RCA 번호 중복 알림 (저장은 하고 알려줌)
            for r in results:
                if r.get("ok") and r["coll"] in ("ncrs", "cases") and r.get("_no"):
                    key = "no" if r["coll"] == "ncrs" else "CaseNo"
                    dup = c.execute(
                        f"SELECT COUNT(*) n FROM records WHERE coll=? AND deleted=0 AND id<>? AND {self.db.json_text('data', key)}=?",
                        (r["coll"], r["id"], r["_no"])).fetchone()["n"]
                    if dup:
                        warns.append(f"{COLL_NAME[r['coll']]} 번호 중복: {r['_no']} — 다른 사용자가 같은 번호를 먼저 썼습니다. 번호를 확인하세요")
            seq = self.db.seq()
        for r in results:
            r.pop("_no", None)
        return {"seq": seq, "results": results, "pulled": pulled, "reload": pulled is None, "warnings": warns}

    def _reject(self, c, ch, code, msg):
        coll, rid = ch.get("coll"), ch.get("id")
        row = c.execute("SELECT rev,data,deleted FROM records WHERE coll=? AND id=?", (coll, rid)).fetchone() \
            if isinstance(coll, str) and isinstance(rid, str) else None
        return {"coll": coll, "id": rid, "ok": False, "error": code, "message": msg,
                "rev": row["rev"] if row else 0,
                "data": json.loads(row["data"]) if row and not row["deleted"] else None}

    def _apply(self, c, user, ch, ip):
        coll, rid = ch.get("coll"), ch.get("id")
        if not ((coll in COLLS) or (coll == "doc" and rid in DOCS)) or not isinstance(rid, str) or not ID_RE.match(rid):
            raise ValueError("알 수 없는 기록입니다")
        new = ch.get("data")
        if new is not None and not isinstance(new, dict):
            raise ValueError("기록 형식이 올바르지 않습니다")
        if new is not None:
            raw = json.dumps(new, ensure_ascii=False, separators=(",", ":"))
            lim = self.cfg.max_bom_mb if (coll == "doc" and rid == "bom") else self.cfg.max_record_mb
            if len(raw.encode()) > lim * 1048576:
                raise ValueError(f"기록이 너무 큽니다 (최대 {lim:g}MB)")
            if coll != "doc" and new.get("id") not in (None, rid):
                raise ValueError("기록 번호가 맞지 않습니다")
        base_rev = int(ch.get("rev") or 0)
        base = ch.get("base") if isinstance(ch.get("base"), dict) else None

        row = c.execute("SELECT rev,data,deleted FROM records WHERE coll=? AND id=?", (coll, rid)).fetchone()
        cur = json.loads(row["data"]) if row and row["data"] else None
        cur_deleted = bool(row and row["deleted"])
        merged, conflicts = False, []

        if new is None:  # 삭제
            if not row or cur_deleted:
                return {"coll": coll, "id": rid, "ok": True, "rev": row["rev"] if row else 0}
            self.check(user, coll, rid, cur, None, False)
            action, result = "delete", None
        elif not row:
            self.check(user, coll, rid, None, new, False)
            action, result = "create", new
        elif cur_deleted:
            self.check(user, coll, rid, None, new, False)
            action, result = "restore", new
        elif base_rev == row["rev"]:
            result = new
            self.check(user, coll, rid, cur, result, False)
            action = "update"
        else:
            # 그 사이 다른 사람이 고침 → 항목별 합치기
            b = base or {}
            result = dict(cur)
            for k in set(b) | set(new):
                if b.get(k) == new.get(k):
                    continue  # 나는 안 고친 항목 → 서버 값 유지
                if k not in NO_CONFLICT and cur.get(k) != b.get(k) and cur.get(k) != new.get(k):
                    conflicts.append(k)
                if k in new:
                    result[k] = new[k]
                else:
                    result.pop(k, None)
            merged = True
            self.check(user, coll, rid, cur, result, False)
            action = "update"

        d = diff(cur if not cur_deleted else None, result)
        if action == "update" and not d:
            return {"coll": coll, "id": rid, "ok": True, "rev": row["rev"],
                    **({"data": result, "merged": True} if merged else {})}
        rev = (row["rev"] + 1) if row else 1
        seq = self.db.next_seq(c)
        t = now()
        if row and row["data"] and not (coll == "doc" and rid == "bom"):  # BOM은 크기가 커서 버전 보관 제외
            c.execute("""INSERT INTO record_versions(coll,id,rev,data,saved_at,saved_by) VALUES(?,?,?,?,?,?)
                         ON CONFLICT(coll,id,rev) DO UPDATE SET data=excluded.data, saved_at=excluded.saved_at,
                         saved_by=excluded.saved_by""",
                      (coll, rid, row["rev"], row["data"], t, user["username"]))
        if result is None:
            c.execute("UPDATE records SET rev=?, seq=?, deleted=1, updated_at=?, updated_by=? WHERE coll=? AND id=?",
                      (rev, seq, t, user["name"], coll, rid))
        else:
            data = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
            c.execute("""INSERT INTO records(coll,id,rev,seq,data,deleted,updated_at,updated_by) VALUES(?,?,?,?,?,0,?,?)
                         ON CONFLICT(coll,id) DO UPDATE SET rev=excluded.rev, seq=excluded.seq, data=excluded.data,
                         deleted=0, updated_at=excluded.updated_at, updated_by=excluded.updated_by""",
                      (coll, rid, rev, seq, data, t, user["name"]))
        detail = {"changes": d if not (coll == "doc" and rid == "bom") else
                  {"rows": [len((cur or {}).get("rows") or []), len((result or {}).get("rows") or [])]}}
        if merged:
            detail["merged"] = True
        if conflicts:
            detail["conflicts"] = sorted(conflicts)
        self.db.audit(c, user=user, action=action, coll=coll, rec_id=rid,
                      label=label_of(coll, rid, result or cur), detail=detail, ip=ip)
        out = {"coll": coll, "id": rid, "ok": True, "rev": rev}
        if merged:
            out.update(data=result, merged=True, conflicts=sorted(conflicts))
        if result and coll in ("ncrs", "cases"):
            no = result.get("no" if coll == "ncrs" else "CaseNo")
            if no and (not cur or cur.get("no" if coll == "ncrs" else "CaseNo") != no):
                out["_no"] = no
        return out

    # ---- 가져오기 (기존 QIS 백업 JSON) ----
    def has_records(self) -> bool:
        return self.db.q1("SELECT COUNT(*) n FROM records WHERE deleted=0")["n"] > 0

    def clear_all(self, user, ip=None) -> dict:
        """모든 기록을 '지움'으로 표시 (내용은 남기고, 변경 순번을 올려 열린 화면들도 비워짐). 관리자 전용 — 가져오기 전 · 시험 초기화.
        되돌리려면 백업 DB로 복원 (호출 전에 백업을 받아 둘 것)."""
        cnt = {}
        t = now()
        with self.db.tx() as c:
            rows = c.execute("SELECT coll,id,rev,data FROM records WHERE deleted=0").fetchall()
            for r in rows:
                c.execute("INSERT INTO record_versions(coll,id,rev,data,saved_at,saved_by) "
                          "SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM record_versions WHERE coll=? AND id=? AND rev=?)",
                          (r["coll"], r["id"], r["rev"], r["data"], t, user["name"], r["coll"], r["id"], r["rev"]))
                c.execute("UPDATE records SET deleted=1, rev=rev+1, seq=?, updated_at=?, updated_by=? WHERE coll=? AND id=?",
                          (self.db.next_seq(c), t, user["name"], r["coll"], r["id"]))
                cnt[r["coll"]] = cnt.get(r["coll"], 0) + 1
            self.db.audit(c, user=user, action="reset", label="모든 기록 비우기", detail=cnt, ip=ip)
        return cnt

    def import_backup(self, user, backup: dict, ip=None) -> dict:
        """빈 서버(지운 기록만 있는 서버 포함)에 기존 QIS 백업을 넣는다. 살아 있는 기록이 있으면 거부."""
        if self.has_records():
            raise ValueError("서버에 이미 기록이 있습니다 — 먼저 관리 화면에서 데이터를 비우거나, 바꾸기를 선택하세요")
        if not isinstance(backup, dict) or not isinstance(backup.get("defects"), list) or not isinstance(backup.get("settings"), dict):
            raise ValueError("QIS 백업 형식이 아닙니다")
        cnt = {}
        t = now()
        with self.db.tx() as c:
            def put(coll, rid, data):
                seq = self.db.next_seq(c)
                js = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
                old = c.execute("SELECT rev FROM records WHERE coll=? AND id=?", (coll, rid)).fetchone()
                if old:   # 비운 뒤 다시 가져온 같은 id — 되살리고 버전을 올림
                    c.execute("UPDATE records SET rev=?, seq=?, data=?, deleted=0, updated_at=?, updated_by=? WHERE coll=? AND id=?",
                              (old["rev"] + 1, seq, js, t, user["name"], coll, rid))
                else:
                    c.execute("INSERT INTO records(coll,id,rev,seq,data,deleted,updated_at,updated_by) VALUES(?,?,1,?,?,0,?,?)",
                              (coll, rid, seq, js, t, user["name"]))
            for coll in COLLS:
                seen = set()
                for r in backup.get(coll) or []:
                    if not isinstance(r, dict) or not isinstance(r.get("id"), str) or not ID_RE.match(r["id"]) or r["id"] in seen:
                        continue
                    seen.add(r["id"])
                    put(coll, r["id"], r)
                cnt[coll] = len(seen)
            put("doc", "settings", backup["settings"])
            if isinstance(backup.get("bom"), dict):
                put("doc", "bom", backup["bom"])
            self.db.audit(c, user=user, action="import", label="QIS 백업 가져오기", detail=cnt, ip=ip)
        return cnt

    def export(self) -> dict:
        out = {c: [] for c in COLLS}
        for r in self.db.q("SELECT coll,id,data FROM records WHERE deleted=0"):
            d = json.loads(r["data"])
            if r["coll"] == "doc":
                out[r["id"]] = d
            elif r["coll"] in out:
                out[r["coll"]].append(d)
        out.setdefault("settings", {})
        out.setdefault("bom", {"updatedAt": "", "rows": []})
        out["meta"] = {"version": 1, "saved": now(), "exportedFrom": "QIS server"}
        out["deleted"] = []
        return out

    # ---- 이력 ----
    def audit_list(self, *, coll=None, rec_id=None, user=None, action=None, q=None, frm=None, to=None,
                   before_id=None, limit=200):
        w, a = [], []
        for col, v in (("coll", coll), ("rec_id", rec_id), ("username", user), ("action", action)):
            if v:
                w.append(f"{col}=?")
                a.append(v)
        if q:
            w.append("(label LIKE ? OR detail LIKE ? OR name LIKE ?)")
            a += [f"%{q}%"] * 3
        if frm:
            w.append("ts>=?")
            a.append(frm)
        if to:
            w.append("ts<?")
            a.append(to + "T99")
        if before_id:
            w.append("id<?")
            a.append(int(before_id))
        sql = "SELECT * FROM audit" + (" WHERE " + " AND ".join(w) if w else "") + " ORDER BY id DESC LIMIT ?"
        rows = self.db.q(sql, (*a, min(int(limit), 1000)))
        return [{**dict(r), "detail": json.loads(r["detail"]) if r["detail"] else None,
                 "collName": COLL_NAME.get(r["coll"] or "", r["coll"])} for r in rows]

    def versions(self, coll, rid):
        rows = self.db.q("SELECT rev,data,saved_at,saved_by FROM record_versions WHERE coll=? AND id=? ORDER BY rev DESC",
                         (coll, rid))
        return [{"rev": r["rev"], "savedAt": r["saved_at"], "savedBy": r["saved_by"], "data": json.loads(r["data"])}
                for r in rows]
