"""텔레그램 아침 요약 — 서버가 매일 정한 시각에 한 번 보낸다.

화면(HTML판)의 '설정 › 알림 (텔레그램)'과 같은 내용(지연 · 오늘 기한 · 이슈 분류 대기)을 서버가 계산해
텔레그램 그룹으로 보낸다. 아무도 접속하지 않아도 보내고, 사용자가 여럿이어도 한 번만 간다.
봇 토큰은 데이터 폴더의 qis.json(서버 설정)에만 두고 화면에는 내려보내지 않는다.
판정 기준은 화면의 lateInfo() · progDue() 와 같게 맞춘다 (바뀌면 여기도 같이).
"""
from __future__ import annotations

import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta

from .db import now

NOTIFY_GRACE = 1          # 발행 후 이 일수가 지나도 통보 안 하면 '통보 지연' (화면과 동일)
RCA_DAYS = {"TIER 3": ("rcaT3", 45), "TIER 2": ("rcaT2", 30), "TIER 1": ("rcaT1", 20), "TIER 0": ("rcaT0", 10)}
DOW = "월화수목금토일"


# ---- 날짜 ----
def _d(s) -> date | None:
    s = str(s or "")[:10]
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def _add(s, n):
    d = _d(s)
    return (d + timedelta(days=int(n))).isoformat() if d else ""


def _diff(a, b) -> int:
    da, db_ = _d(a), _d(b)
    return (db_ - da).days if da and db_ else 0


def _has(v) -> bool:
    return v is not None and str(v).strip() != ""


def _num(v, default=0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


# ---- NCR (화면의 ncrStatus · ncrFlags) ----
def ncr_notified(n) -> bool:
    return bool(n.get("notifyDate") or n.get("replyDate") or n.get("d3Date") or n.get("validity") == "적정" or n.get("verifyDate"))


def ncr_status(n) -> str:
    if n.get("verifyDate") and n.get("verifyResult") == "유효":
        return "종결"
    if n.get("verifyDate") and str(n.get("verifyResult") or "").startswith("무효"):
        return "검증 무효"
    if not ncr_notified(n):
        return "미통보"
    if n.get("reqType") == "단순 통보":
        return "통보 완료(검증대기)"
    if n.get("validity") == "적정":
        return "승인(검증대기)"
    if n.get("replyDate"):
        return "보완요청" if n.get("validity") == "보완요청" else "대책서 검토"
    if n.get("requestDate"):
        return "대책요청"
    return "발행"


def ncr_late(n, today: str) -> list[dict]:
    st = ncr_status(n)
    if st == "종결":
        return []
    info = n.get("reqType") == "단순 통보"
    notified = ncr_notified(n)
    L = []

    def add(l, d):
        if d and str(d) < today:
            L.append({"l": l, "d": str(d), "n": _diff(d, today)})

    if not notified and n.get("issueDate") and today > _add(n["issueDate"], NOTIFY_GRACE):
        add("협력사 통보", _add(n["issueDate"], NOTIFY_GRACE))
    if not info and notified and n.get("d3Due") and not n.get("d3Date") and not n.get("replyDate"):
        add("D3 봉쇄 회신", n["d3Due"])
    if not info and notified and n.get("requestDate") and not n.get("replyDate") and n.get("dueDate"):
        add("대책서 회신", n["dueDate"])
    if st in ("승인(검증대기)", "통보 완료(검증대기)") and n.get("verifyDue"):
        add("유효성 검증", n["verifyDue"])
    far = n.get("far") or {}
    if far.get("reqDate") and not far.get("replyDate") and far.get("due"):
        add("FAR 분석 회신", far["due"])
    return sorted(L, key=lambda x: -x["n"])


def ncr_next(n) -> dict | None:
    st = ncr_status(n)
    c = []
    if st in ("대책요청", "보완요청") and n.get("dueDate"):
        c.append(("보완 회신 기한" if st == "보완요청" else "대책서 회신 기한", n["dueDate"]))
    if st == "승인(검증대기)" and n.get("verifyDue"):
        c.append(("유효성 검증 기한", n["verifyDue"]))
    far = n.get("far") or {}
    if far.get("reqDate") and not far.get("replyDate") and far.get("due"):
        c.append(("FAR 분석 회신 기한", far["due"]))
    c = [x for x in c if x[1]]
    return dict(zip(("next", "nextDate"), min(c, key=lambda x: x[1]))) if c else None


# ---- 불량 (화면의 invOpen · icaNeed · 사내 검증) ----
def defect_open_inv(d) -> bool:
    inv = d.get("inv") or {}
    return (not d.get("ncrId") and not d.get("closed") and d.get("resp") == "미정"
            and not inv.get("verdict") and not (d.get("doneDate") and not d.get("inv")))


def defect_late(d, today: str) -> list[dict]:
    inv, ica = d.get("inv") or {}, d.get("ica") or {}
    L = []

    def add(l, dd):
        if dd and str(dd) < today:
            L.append({"l": l, "d": str(dd), "n": _diff(dd, today)})

    if defect_open_inv(d) and inv.get("farReq") and not inv.get("farRecv"):
        add("FAR 회신", inv.get("farDue"))
    if not d.get("ncrId") and not d.get("closed") and d.get("resp") == "사내" and not d.get("caseId") and ica and not ica.get("doneDate"):
        add("사내 대책", ica.get("due"))
    if not d.get("ncrId") and ica.get("doneDate") and not ica.get("verifyDate"):
        add("사내 유효성 검증", ica.get("verifyDue"))
    return sorted(L, key=lambda x: -x["n"])


def defect_next(d) -> dict | None:
    inv, ica = d.get("inv") or {}, d.get("ica") or {}
    if defect_open_inv(d) and inv.get("farReq") and not inv.get("farRecv") and inv.get("farDue"):
        return {"next": "FAR 회신 기한", "nextDate": inv["farDue"]}
    if d.get("resp") == "사내" and not d.get("ncrId") and not d.get("caseId") and ica and not ica.get("doneDate") and ica.get("due"):
        return {"next": "사내 대책 기한", "nextDate": ica["due"]}
    if ica.get("doneDate") and ica.get("verifyDue") and not ica.get("verifyDate"):
        return {"next": "사내 유효성 검증 기한", "nextDate": ica["verifyDue"]}
    return None


def defect_label(d) -> str:
    return f"{d.get('date') or ''} {d.get('partName') or d.get('partNo') or (('[완성품] ' + (d.get('fgName') or d.get('fgNo'))) if (d.get('fgName') or d.get('fgNo')) else '')}".strip()


# ---- RCA ----
def rca_open(c) -> bool:
    return c.get("Status") not in ("종결", "취소")


def rca_target(c, settings) -> str:
    if _has(c.get("TargetClose")):
        return str(c["TargetClose"])
    key, default = RCA_DAYS.get(c.get("Tier") or "", (None, 30))
    days = _num(settings.get(key), 0) if key else 0
    return _add(c.get("Created"), days or default) if _has(c.get("Created")) else ""


def rca_late(c, actions, settings, today: str) -> list[dict]:
    if not rca_open(c):
        return []
    L = []

    def add(l, dd):
        if dd and str(dd) < today:
            L.append({"l": l, "d": str(dd), "n": _diff(dd, today)})

    add("목표 종결일", rca_target(c, settings))
    for a in actions:
        if a.get("ActionStatus") not in ("완료", "취소"):
            add("조치 · " + str(a.get("Title") or a.get("Category") or ""), a.get("DueDate"))
    return sorted(L, key=lambda x: -x["n"])


def rca_next(c, actions, settings) -> dict | None:
    cands = []
    if _has(c.get("RecheckDate")):
        cands.append((f"재확인 — {c.get('NextAction') or '다음 행동'}", str(c["RecheckDate"])))
    od = sorted([a for a in actions if a.get("ActionStatus") not in ("완료", "취소") and _has(a.get("DueDate"))], key=lambda a: a["DueDate"])
    if od:
        cands.append((f"조치 — {od[0].get('Title') or od[0].get('Category')}", str(od[0]["DueDate"])))
    t = rca_target(c, settings)
    if t:
        cands.append(("목표 종결일", t))
    return dict(zip(("next", "nextDate"), min(cands, key=lambda x: x[1]))) if cands else None


# ---- 이슈 ----
def issue_links(i, defects_by_id) -> int:
    ds = [defects_by_id[x] for x in (i.get("defectIds") or []) if x in defects_by_id]
    cs = set(i.get("caseIds") or []) | {d["caseId"] for d in ds if d.get("caseId")}
    return len(ds) + len(cs)


# ---- 요약 ----
def _short(s: str) -> str:
    for sep in (" · ", " — "):
        s = s.split(sep)[0]
    return s


def build_summary(data: dict, today: str | None = None, detail: bool = False) -> str:
    """store.export() 결과(또는 백업 JSON)로 아침 요약 문장을 만든다."""
    today = today or date.today().isoformat()
    settings = data.get("settings") or {}
    ncrs, defects, cases = data.get("ncrs") or [], data.get("defects") or [], data.get("cases") or []
    actions, issues = data.get("actions") or [], data.get("issues") or []
    acts = {}
    for a in actions:
        acts.setdefault(a.get("CaseId"), []).append(a)
    open_case_ids = {c["id"] for c in cases if rca_open(c)}
    by_id = {d["id"]: d for d in defects if d.get("id")}
    lbl = (lambda s: s) if detail else _short
    items = []   # (kind, title, late[], next)
    for n in ncrs:
        if ncr_status(n) == "종결" or (n.get("caseId") in open_case_ids):
            continue
        items.append(("NCR", str(n.get("no") or ""), ncr_late(n, today), ncr_next(n)))
    for d in defects:
        if d.get("ncrId") or d.get("closed") or (d.get("caseId") in open_case_ids):
            continue
        late, nx = defect_late(d, today), defect_next(d)
        if late or nx:
            items.append(("불량", defect_label(d), late, nx))
    for c in cases:
        if not rca_open(c):
            continue
        items.append(("RCA", str(c.get("CaseNo") or ""), rca_late(c, acts.get(c.get("id"), []), settings, today), rca_next(c, acts.get(c.get("id"), []), settings)))

    late = sorted([x for x in items if x[2]], key=lambda x: -x[2][0]["n"])
    due = [x for x in items if not x[2] and x[3] and x[3]["nextDate"] == today]
    d = _d(today) or date.today()
    L = [f"[QIS] {d.month:02d}/{d.day:02d}({DOW[d.weekday()]}) 아침 품질 요약", "", f"■ 지연 {len(late)}건"]
    for k, t, lt, _ in late[:10]:
        L.append(f"· {k} {t} — {lbl(lt[0]['l'])} D+{lt[0]['n']}" + (f" (외 {len(lt) - 1})" if len(lt) > 1 else ""))
    if len(late) > 10:
        L.append(f"· 외 {len(late) - 10}건")
    L += ["", f"■ 오늘 기한 {len(due)}건"]
    for k, t, _, nx in due[:10]:
        L.append(f"· {k} {t} — {lbl(nx['next'])}")
    if len(due) > 10:
        L.append(f"· 외 {len(due) - 10}건")
    wait = [i for i in issues if not i.get("closedAt") and issue_links(i, by_id) == 0]
    hot = [i for i in issues if not i.get("closedAt") and (i.get("urg") == "긴급" or i.get("special")) and not i.get("contain")]
    if wait or hot:
        L += ["", f"■ 이슈 분류 대기 {len(wait)}건" + (f" · 격리 기록 없음 {len(hot)}건" if hot else "")]
        seen, shown = set(), []
        for i in hot + wait:
            if i.get("id") in seen:
                continue
            seen.add(i.get("id"))
            shown.append(i)
        for i in shown[:5]:
            L.append(f"· {i.get('no') or ''}" + (f" {i.get('title') or ''}" if detail else "") + (" (긴급)" if i.get("urg") == "긴급" else ""))
    L += ["", f"미종결 NCR {sum(1 for n in ncrs if ncr_status(n) != '종결')} · 진행 중 RCA {len(open_case_ids)} · 열린 이슈 {sum(1 for i in issues if not i.get('closedAt'))}"]
    return "\n".join(L)


# ---- 텔레그램 API ----
class TelegramError(Exception):
    pass


def tg_call(token: str, method: str, params: dict | None = None, timeout: float = 15) -> dict:
    if not token:
        raise TelegramError("봇 토큰이 없습니다")
    url = f"https://api.telegram.org/bot{token}/{method}"
    body = urllib.parse.urlencode(params or {}).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=body), timeout=timeout) as r:
            j = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            j = json.loads(e.read().decode("utf-8"))
        except Exception:
            raise TelegramError(f"텔레그램 응답 오류 ({e.code})") from None
    except (urllib.error.URLError, OSError, TimeoutError) as e:
        raise TelegramError("텔레그램에 연결하지 못했습니다 — 인터넷 · 회사망 차단(api.telegram.org)을 확인하세요") from e
    if not j.get("ok"):
        raise TelegramError(j.get("description") or "텔레그램 응답 오류")
    return j.get("result")


class Telegram:
    """설정(cfg.telegram_*)대로 매일 한 번 보냄. 보낸 날짜는 DB meta 'telegram_sent'."""

    def __init__(self, db, store, cfg, call=tg_call):
        self.db, self.store, self.cfg, self._call = db, store, cfg, call
        self._stop = threading.Event()
        self._lock = threading.Lock()

    # 설정
    @property
    def enabled(self) -> bool:
        return bool(self.cfg.telegram_on and self.cfg.telegram_token and self.cfg.telegram_chat)

    def status(self) -> dict:
        err = self.db.get_meta("telegram_error")
        return {"on": bool(self.cfg.telegram_on), "token_set": bool(self.cfg.telegram_token), "chat": self.cfg.telegram_chat,
                "time": self.cfg.telegram_time, "weekend": bool(self.cfg.telegram_weekend), "detail": bool(self.cfg.telegram_detail),
                "sent": self.db.get_meta("telegram_sent") or "", "error": json.loads(err) if err else None}

    def update(self, ch: dict) -> None:
        for k in ("on", "token", "chat", "time", "weekend", "detail"):
            if k in ch and ch[k] is not None:
                v = ch[k]
                if k in ("on", "weekend", "detail"):
                    v = bool(v)
                elif k == "time":
                    v = str(v).strip()[:5] or "08:00"
                    try:
                        datetime.strptime(v, "%H:%M")
                    except ValueError:
                        raise ValueError("시각은 HH:MM 형식으로 입력하세요")
                else:
                    v = str(v).strip()
                setattr(self.cfg, "telegram_" + k, v)
        self.cfg.save()

    # 보내기
    def summary(self, today: str | None = None) -> str:
        return build_summary(self.store.export(), today, bool(self.cfg.telegram_detail))

    def send_text(self, text: str) -> None:
        if not self.cfg.telegram_chat:
            raise TelegramError("받을 곳(chat ID)이 없습니다")
        self._call(self.cfg.telegram_token, "sendMessage", {"chat_id": self.cfg.telegram_chat, "text": text, "disable_web_page_preview": "true"})

    def send_summary(self, reason="auto", user=None) -> str:
        with self._lock:
            text = self.summary()
            self.send_text(text)
            self.db.set_meta("telegram_sent", date.today().isoformat())
            self.db.set_meta("telegram_error", "")
            with self.db.tx() as c:
                self.db.audit(c, user=user, action="telegram", label="아침 요약 전송", detail={"reason": reason, "chars": len(text)})
            return text

    def find_chats(self) -> list[dict]:
        ups = self._call(self.cfg.telegram_token, "getUpdates", {"limit": "50"})
        m = {}
        for u in ups or []:
            ch = ((u.get("message") or u.get("channel_post") or u.get("my_chat_member") or u.get("edited_message") or {}).get("chat"))
            if ch and ch.get("id") is not None:
                m[str(ch["id"])] = {"id": str(ch["id"]), "type": ch.get("type", ""),
                                    "title": ch.get("title") or " ".join(x for x in (ch.get("first_name"), ch.get("last_name")) if x) or ch.get("username") or str(ch["id"])}
        return list(m.values())

    # 자동
    def due(self, now_: datetime | None = None) -> bool:
        if not self.enabled:
            return False
        n = now_ or datetime.now()
        if not self.cfg.telegram_weekend and n.weekday() >= 5:
            return False
        try:
            hh, mm = (int(x) for x in str(self.cfg.telegram_time or "08:00").split(":")[:2])
        except ValueError:
            hh, mm = 8, 0
        if (n.hour, n.minute) < (hh, mm):
            return False
        return (self.db.get_meta("telegram_sent") or "") != n.date().isoformat()

    def start(self):
        def loop():
            while not self._stop.wait(10):
                try:
                    if self.due():
                        self.send_summary("auto")
                except Exception as e:   # 실패는 기록만 하고 다음 확인 때 다시
                    try:
                        self.db.set_meta("telegram_error", json.dumps({"at": now(), "error": str(e)}, ensure_ascii=False))
                    except Exception:
                        pass
                self._stop.wait(60)
        threading.Thread(target=loop, name="qis-telegram", daemon=True).start()

    def stop(self):
        self._stop.set()
