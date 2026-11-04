"""텔레그램 아침 요약 — 요약 계산 · 하루 한 번 자동 전송 · 관리자 API · 토큰 비노출."""
import json
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from qis.app import create_app
from qis.auth import Auth
from qis.config import Config, load_config
from qis.db import open_db
from qis.telegram import Telegram, TelegramError, build_summary, ncr_status

H = {"x-qis": "1"}
T = "2026-11-05"


def d(n):
    return (datetime.fromisoformat(T) + timedelta(days=n)).date().isoformat()


SAMPLE = {
    "settings": {"rcaT2": 30, "rcaT3": 45},
    "ncrs": [
        {"id": "n1", "no": "N-LATE", "issueDate": d(-20), "notifyDate": d(-20), "requestDate": d(-20), "dueDate": d(-3), "reqType": "8D 보고서"},
        {"id": "n2", "no": "N-TODAY", "issueDate": d(-7), "notifyDate": d(-7), "requestDate": d(-7), "dueDate": T, "reqType": "8D 보고서"},
        {"id": "n3", "no": "N-DONE", "issueDate": d(-30), "notifyDate": d(-30), "verifyDate": d(-1), "verifyResult": "유효", "reqType": "8D 보고서"},
        {"id": "n4", "no": "N-NOTIFY", "issueDate": d(-5), "reqType": "8D 보고서"},
    ],
    "defects": [
        {"id": "d1", "date": d(-10), "partNo": "P-1", "partName": "래치 스프링", "resp": "미정", "inv": {"farReq": d(-10), "farDue": d(-2)}},
        {"id": "d2", "date": d(-4), "partNo": "P-2", "resp": "사내", "ica": {"due": T}},
    ],
    "cases": [
        {"id": "c1", "CaseNo": "RCA-1", "Title": "비밀 제목", "Stage": "대책", "Status": "진행중", "Tier": "TIER 2", "Created": d(-40)},
        {"id": "c2", "CaseNo": "RCA-2", "Title": "정상", "Stage": "대책", "Status": "진행중", "Tier": "TIER 3", "Created": d(-10), "RecheckDate": T},
        {"id": "c3", "CaseNo": "RCA-3", "Title": "끝", "Stage": "종결", "Status": "종결", "Created": d(-60)},
    ],
    "actions": [{"id": "a1", "CaseId": "c2", "Title": "금형 수정 비밀", "Category": "발생대책", "DueDate": d(-1), "ActionStatus": "진행"}],
    "issues": [
        {"id": "i1", "no": "ISS-1", "title": "이슈 제목 비밀", "at": d(-4) + "T09:00", "urg": "긴급", "special": True, "logs": [], "defectIds": [], "caseIds": []},
        {"id": "i2", "no": "ISS-2", "title": "분류됨", "at": d(-1) + "T09:00", "urg": "보통", "defectIds": ["d1"], "caseIds": []},
        {"id": "i3", "no": "ISS-3", "title": "닫힘", "at": d(-9) + "T09:00", "closedAt": d(-1), "defectIds": [], "caseIds": []},
    ],
}


def test_status_and_summary():
    assert [ncr_status(n) for n in SAMPLE["ncrs"]] == ["대책요청", "대책요청", "종결", "미통보"]
    s = build_summary(SAMPLE, T)
    assert s.startswith("[QIS] 11/05(목) 아침 품질 요약")
    assert "■ 지연 5건" in s                              # N-LATE · N-NOTIFY · d1 FAR · RCA-1 목표 · RCA-2 조치
    assert "· NCR N-LATE — 대책서 회신 D+3" in s
    assert "· NCR N-NOTIFY — 협력사 통보 D+4" in s
    assert "래치 스프링 — FAR 회신 D+2" in s
    assert "· RCA RCA-1 — 목표 종결일 D+10" in s
    assert "· RCA RCA-2 — 조치 D+1" in s
    assert "■ 오늘 기한 2건" in s and "N-TODAY" in s and "P-2 — 사내 대책 기한" in s
    assert "■ 이슈 분류 대기 1건 · 격리 기록 없음 1건" in s and "· ISS-1 (긴급)" in s
    assert "미종결 NCR 3 · 진행 중 RCA 2 · 열린 이슈 2" in s
    assert "비밀" not in s                                 # 세부 내용 끄면 제목 없음
    s2 = build_summary(SAMPLE, T, detail=True)
    assert "금형 수정 비밀" in s2 and "이슈 제목 비밀" in s2
    # 목표 종결일을 직접 넣으면 그 날짜 기준
    c = dict(SAMPLE["cases"][0], TargetClose=d(5))
    assert "RCA-1" not in build_summary(dict(SAMPLE, cases=[c], actions=[]), T)


@pytest.fixture()
def env(tmp_path):
    cfg = Config()
    cfg.data_dir = tmp_path / "data"
    cfg.backup_dir = str(tmp_path / "bk")
    cfg.data_dir.mkdir()
    db = open_db(cfg)
    a = Auth(db, cfg)
    a.create_user("admin", "관리자", "admin", "Qadm2026x", must_change=False)
    a.create_user("kim", "김작성", "editor", "Editor1234", must_change=False)
    db.close()
    app = create_app(cfg, start_backup=False)
    return app, cfg


def login(app, user, pw):
    c = TestClient(app)
    assert c.post("/api/login", json={"username": user, "password": pw}, headers=H).status_code == 200
    return c


class FakeTG:
    def __init__(self, fail=None):
        self.calls, self.fail = [], fail

    def __call__(self, token, method, params=None, timeout=15):
        self.calls.append((token, method, dict(params or {})))
        if self.fail:
            raise TelegramError(self.fail)
        if method == "getUpdates":
            return [{"update_id": 1, "my_chat_member": {"chat": {"id": -100555, "title": "품질팀", "type": "supergroup"}}}]
        return {"message_id": 1}


def test_admin_api_and_token_hidden(env):
    app, cfg = env
    fake = FakeTG()
    app.state.telegram._call = fake
    adm = login(app, "admin", "Qadm2026x")
    kim = login(app, "kim", "Editor1234")
    assert kim.get("/api/admin/telegram").status_code == 403
    r = adm.post("/api/admin/telegram", json={"token": "123:ABC", "time": "07:30", "on": True}, headers=H).json()
    assert r["token_set"] and r["time"] == "07:30" and r["on"] and "123:ABC" not in json.dumps(r)
    assert load_config(cfg.data_dir).telegram_token == "123:ABC"       # qis.json 에만
    assert "123:ABC" not in json.dumps(app.state.store.export())      # 기록 · 설정 문서에는 없음
    assert adm.post("/api/admin/telegram", json={"time": "25:99"}, headers=H).status_code == 400
    # 받을 곳 찾기 → 선택 → 시험 전송
    chats = adm.post("/api/admin/telegram/chats", headers=H).json()["chats"]
    assert chats == [{"id": "-100555", "type": "supergroup", "title": "품질팀"}]
    adm.post("/api/admin/telegram", json={"chat": "-100555"}, headers=H)
    assert adm.post("/api/admin/telegram/test", headers=H).status_code == 200
    assert fake.calls[-1][1] == "sendMessage" and fake.calls[-1][2]["chat_id"] == "-100555" and "시험" in fake.calls[-1][2]["text"]
    # 미리 보기 · 지금 보내기 → 보낸 날짜 · 이력
    assert "아침 품질 요약" in adm.get("/api/admin/telegram/preview").json()["text"]
    r = adm.post("/api/admin/telegram/send", headers=H)
    assert r.status_code == 200 and "아침 품질 요약" in r.json()["text"]
    st = adm.get("/api/admin/telegram").json()
    assert st["sent"] == datetime.now().date().isoformat() and st["error"] is None
    au = adm.get("/api/admin/audit?action=telegram").json()["items"]
    assert au and au[0]["label"] == "아침 요약 전송"
    au2 = adm.get("/api/admin/audit?action=telegram.update").json()["items"]
    assert au2 and "123:ABC" not in json.dumps(au2)                    # 이력에도 토큰은 가려짐
    # 실패 → 400 · 날짜 안 남김
    fake.fail = "Bad Request: chat not found"
    app.state.db.set_meta("telegram_sent", "")
    r = adm.post("/api/admin/telegram/send", headers=H)
    assert r.status_code == 400 and "chat not found" in r.json()["message"]
    assert not app.state.db.get_meta("telegram_sent")


def test_due_once_a_day(env):
    app, cfg = env
    tg: Telegram = app.state.telegram
    fake = FakeTG()
    tg._call = fake
    tg.update({"token": "t", "chat": "-1", "on": True, "time": "08:00", "weekend": False})
    mon7 = datetime(2026, 11, 2, 7, 59)
    mon8 = datetime(2026, 11, 2, 8, 0)
    sat9 = datetime(2026, 11, 7, 9, 0)
    assert not tg.due(mon7) and tg.due(mon8)
    assert not tg.due(sat9)
    tg.update({"weekend": True})
    assert tg.due(sat9)
    tg.update({"on": False})
    assert not tg.due(mon8)
    tg.update({"on": True})
    tg.send_summary("auto")
    assert len([c for c in fake.calls if c[1] == "sendMessage"]) == 1
    assert not tg.due(datetime.combine(datetime.now().date(), datetime.min.time()).replace(hour=9))   # 오늘은 이미 보냄
    assert tg.due(datetime.now() + timedelta(days=1))                                                   # 내일은 다시


def test_loop_sends_and_records_error(env, monkeypatch):
    app, cfg = env
    tg: Telegram = app.state.telegram
    fake = FakeTG(fail="연결 실패")
    tg._call = fake
    tg.update({"token": "t", "chat": "-1", "on": True, "time": "00:00", "weekend": True})
    with pytest.raises(TelegramError):
        tg.send_summary("auto")
    tg.db.set_meta("telegram_error", json.dumps({"at": "x", "error": "연결 실패"}))
    assert tg.status()["error"]["error"] == "연결 실패" and not tg.status()["sent"]
    fake.fail = None
    tg.send_summary("auto")
    assert tg.status()["sent"] and tg.status()["error"] is None
