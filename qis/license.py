"""라이선스 — 영구 사용권 + 연 유지보수, PC 대수 제한. 오프라인(서버 없음).

라이선스 파일 qis.lic (데이터 폴더):
    -----BEGIN QIS LICENSE-----
    <base64(JSON)>.<base64(Ed25519 서명)>
    -----END QIS LICENSE-----
JSON: {"v":1, "id":"L-2026-0001", "customer":"회사명", "seats":3, "machines":["PC코드",...], "users":0,
       "issued":"2026-11-10", "maintenance_until":"2027-11-09", "trial_until": null, "note": ""}
  · seats     설치할 수 있는 PC 수. machines 에 든 PC 코드만 정식 사용 (코드는 프로그램의 라이선스 화면에 표시)
  · users     사내 서버 모드 동시 로그인 사용자 수 (0 = 제한 없음)
  · maintenance_until  이 날짜까지 만들어진(빌드된) 버전은 영구 사용. 그 뒤 버전은 읽기 전용 → 예전 버전을 쓰거나 유지보수 갱신
  · trial_until        있으면 기간제(평가용 발급). 지나면 읽기 전용

서명은 발급자(scripts/license_tool.py, 비밀키 보관)만 할 수 있고, 프로그램에는 공개키(PUBLIC_KEY)만 들어 있다.
상태(mode):
    full      정식 (등록된 PC · 유지보수 안)
    trial     평가판 — 라이선스 없음 / 이 PC 미등록 / 서명 불량: 처음 실행부터 30일, 모든 기능
    readonly  평가 기간 끝 · 유지보수 만료 뒤 버전 · 기간제 만료 → 보기 · 검색 · 출력 · 내보내기만 (데이터는 그대로)
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
import secrets
import subprocess
import sys
from datetime import date
from pathlib import Path

from . import __build__, ed25519

log = logging.getLogger("qis.license")

# 발급자 공개키 (hex 64자). scripts/license_tool.py keygen 으로 만든 값으로 바꿔 넣는다. 비밀키는 저장소 밖에!
PUBLIC_KEY = "0000000000000000000000000000000000000000000000000000000000000000"
TRIAL_DAYS = 30
LIC_NAME = "qis.lic"
_BEGIN, _END = "-----BEGIN QIS LICENSE-----", "-----END QIS LICENSE-----"


class LicenseError(ValueError):
    pass


# ------------------------------------------------------------------ 파일 형식
def encode(payload: dict, sk: bytes) -> str:
    body = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    sig = ed25519.sign(sk, body)
    b64 = lambda b: base64.b64encode(b).decode()
    text = b64(body) + "." + b64(sig)
    lines = [text[i:i + 76] for i in range(0, len(text), 76)]
    return "\n".join([_BEGIN, *lines, _END]) + "\n"


def decode(text: str, pubkey_hex: str = PUBLIC_KEY) -> dict:
    """서명이 맞으면 payload, 아니면 LicenseError."""
    t = (text or "").strip()
    if _BEGIN in t:
        t = t.split(_BEGIN, 1)[1].split(_END, 1)[0]
    t = re.sub(r"\s+", "", t)
    if "." not in t:
        raise LicenseError("라이선스 파일 형식이 아닙니다")
    try:
        body, sig = (base64.b64decode(x, validate=True) for x in t.split(".", 1))
        payload = json.loads(body.decode("utf-8"))
    except Exception:
        raise LicenseError("라이선스 파일을 읽을 수 없습니다 (손상됨)") from None
    if not isinstance(payload, dict) or payload.get("v") != 1:
        raise LicenseError("지원하지 않는 라이선스 형식입니다")
    if not ed25519.verify(bytes.fromhex(pubkey_hex), body, sig):
        raise LicenseError("라이선스 서명이 맞지 않습니다 (위조되었거나 다른 제품의 파일)")
    return payload


# ------------------------------------------------------------------ PC 코드
def _raw_machine_id(data_dir: Path) -> str:
    try:
        if sys.platform.startswith("win"):
            import winreg
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography",
                                0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as k:
                return "win:" + winreg.QueryValueEx(k, "MachineGuid")[0]
        if sys.platform == "darwin":
            out = subprocess.run(["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"], capture_output=True, text=True, timeout=5).stdout
            m = re.search(r'"IOPlatformUUID"\s*=\s*"([^"]+)"', out)
            if m:
                return "mac:" + m.group(1)
        for f in ("/etc/machine-id", "/var/lib/dbus/machine-id"):
            if os.path.isfile(f):
                v = Path(f).read_text().strip()
                if v:
                    return "lnx:" + v
    except Exception:
        log.exception("PC 식별값 읽기 실패")
    # 못 읽으면 데이터 폴더에 한 번 만들어 둔 값 (폴더를 옮기면 코드가 바뀔 수 있음)
    f = data_dir / "machine.id"
    if not f.is_file():
        f.write_text("gen:" + secrets.token_hex(16), encoding="utf-8")
    return f.read_text(encoding="utf-8").strip()


def machine_code(data_dir: Path) -> str:
    """사람이 읽어 보낼 수 있는 PC 코드: XXXX-XXXX-XXXX-XXXX (대소문자 구분 없음)."""
    h = hashlib.sha256(("QIS-PC|" + _raw_machine_id(Path(data_dir))).encode()).digest()
    s = base64.b32encode(h[:10]).decode().rstrip("=")[:16]
    return "-".join(s[i:i + 4] for i in range(0, 16, 4))


def norm_code(c: str) -> str:
    return re.sub(r"[^A-Z2-7]", "", (c or "").upper())


# ------------------------------------------------------------------ 상태
class License:
    def __init__(self, db, data_dir: Path, *, pubkey: str = PUBLIC_KEY, build: str = __build__, today=None):
        self.db, self.data_dir, self.pubkey, self.build = db, Path(data_dir), pubkey, build
        self._today = today            # 시험용
        self.payload: dict | None = None
        self.error = ""
        self.load()

    @property
    def path(self) -> Path:
        return self.data_dir / LIC_NAME

    def today(self) -> date:
        return self._today() if callable(self._today) else (self._today or date.today())

    def load(self) -> None:
        self.payload, self.error = None, ""
        if self.path.is_file():
            try:
                self.payload = decode(self.path.read_text(encoding="utf-8"), self.pubkey)
            except LicenseError as e:
                self.error = str(e)
                log.warning("라이선스 파일 무시: %s", e)

    def install(self, text: str) -> dict:
        """관리 화면 · 메뉴에서 올린 파일을 검증해 저장. 틀리면 LicenseError (기존 파일 유지)."""
        p = decode(text, self.pubkey)
        mine = machine_code(self.data_dir)
        if p.get("machines") and norm_code(mine) not in {norm_code(m) for m in p["machines"]}:
            # 저장은 하되 상태에서 미등록으로 알림 (고객이 다른 PC 파일을 넣은 경우를 설명)
            pass
        self.path.write_text(text.strip() + "\n", encoding="utf-8")
        self.load()
        return self.status()

    def _trial_start(self) -> date:
        v = self.db.get_meta("trial_start")
        if not v:
            v = self.today().isoformat()
            self.db.set_meta("trial_start", v)
        try:
            return date.fromisoformat(v)
        except ValueError:
            return self.today()

    def status(self) -> dict:
        today, mine = self.today(), machine_code(self.data_dir)
        st = {"mode": "trial", "machine": mine, "build": self.build, "trial_days": TRIAL_DAYS,
              "customer": "", "id": "", "seats": 0, "users": 0, "registered": False,
              "maintenance_until": "", "trial_until": "", "message": "", "error": self.error}
        p = self.payload
        if p:
            st.update(customer=str(p.get("customer") or ""), id=str(p.get("id") or ""), seats=int(p.get("seats") or 0),
                      users=int(p.get("users") or 0), maintenance_until=str(p.get("maintenance_until") or ""),
                      trial_until=str(p.get("trial_until") or ""), machines=len(p.get("machines") or []))
            regs = {norm_code(m) for m in (p.get("machines") or [])}
            st["registered"] = norm_code(mine) in regs
            if not st["registered"]:
                st["message"] = f"이 PC는 라이선스에 등록되지 않았습니다 — PC 코드 {mine} 를 발급처에 보내 등록하세요"
            elif p.get("trial_until") and today > date.fromisoformat(p["trial_until"]):
                st.update(mode="readonly", message=f"기간제 라이선스가 {p['trial_until']} 에 끝났습니다")
                return st
            elif p.get("maintenance_until") and self.build > p["maintenance_until"]:
                st.update(mode="readonly", message=f"유지보수가 {p['maintenance_until']} 에 끝났습니다. 이 버전({self.build} 빌드)은 "
                                                   "읽기 전용입니다 — 유지보수를 갱신하거나 그 날짜 이전 버전을 쓰세요")
                return st
            else:
                st.update(mode="full")
                left = (date.fromisoformat(p["maintenance_until"]) - today).days if p.get("maintenance_until") else None
                st["maintenance_left"] = left
                return st
        # 라이선스 없음 · 서명 불량 · 이 PC 미등록 → 평가판
        start = self._trial_start()
        left = TRIAL_DAYS - (today - start).days
        st["trial_left"] = max(0, left)
        if left <= 0:
            st.update(mode="readonly", message=(st["message"] + " · " if st["message"] else "") +
                      f"평가 기간 {TRIAL_DAYS}일이 끝났습니다 — 라이선스를 등록하면 바로 다시 쓸 수 있습니다 (데이터는 그대로)")
        elif not st["message"]:
            st["message"] = f"평가판 — {left}일 남음" + (f" ({self.error})" if self.error else "")
        return st

    @property
    def readonly(self) -> bool:
        return self.status()["mode"] == "readonly"

    @property
    def user_limit(self) -> int:
        return int((self.payload or {}).get("users") or 0) if self.status()["mode"] == "full" else 0

    def public(self) -> dict:
        """화면에 내려보낼 요약 (PC 코드 포함 — 관리자가 발급처에 보낼 수 있게)."""
        s = self.status()
        return {k: s.get(k) for k in ("mode", "message", "customer", "trial_left", "maintenance_until", "maintenance_left",
                                       "machine", "registered", "seats", "users")}


# ------------------------------------------------------------------ 발급 (license_tool 에서 씀)
def issue(sk: bytes, *, id: str, customer: str, seats: int, machines: list[str], maintenance_until: str,
          users: int = 0, trial_until: str | None = None, note: str = "", issued: str | None = None) -> str:
    for d in (maintenance_until, trial_until):
        if d:
            date.fromisoformat(d)
    if seats < 1:
        raise LicenseError("PC 대수는 1 이상")
    machines = [norm_code(m) for m in machines if norm_code(m)]
    machines = ["-".join(m[i:i + 4] for i in range(0, len(m), 4)) for m in dict.fromkeys(machines)]
    if len(machines) > seats:
        raise LicenseError(f"등록 PC({len(machines)})가 대수({seats})보다 많습니다")
    payload = {"v": 1, "id": id, "customer": customer, "seats": int(seats), "machines": machines, "users": int(users or 0),
               "issued": issued or date.today().isoformat(), "maintenance_until": maintenance_until,
               "trial_until": trial_until or None, "note": note or ""}
    return encode(payload, sk)
