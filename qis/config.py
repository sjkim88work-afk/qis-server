"""QIS 서버 설정.

설정은 아래 순서로 읽는다 (뒤가 앞을 덮어씀).
  1. 기본값
  2. 데이터 폴더의 qis.json (python -m qis init 이 만든다)
  3. 환경변수 QIS_<항목 대문자>  (예: QIS_PORT=8443)
데이터 폴더는 환경변수 QIS_DATA_DIR 또는 실행 위치의 ./data
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from pathlib import Path


@dataclass
class Config:
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("QIS_DATA_DIR", "data")).resolve())
    host: str = "0.0.0.0"
    port: int = 8080
    # DB — 비우면 SQLite(데이터 폴더의 qis.db). 형식은 qis/db/__init__.py 참고
    db_url: str = ""
    # HTTPS — 사내 인증서 파일 경로 (둘 다 있으면 HTTPS로 실행)
    ssl_certfile: str = ""
    ssl_keyfile: str = ""
    # 백업 — 비우면 data_dir/backup. 네트워크 드라이브(\\server\share\QIS) 권장
    backup_dir: str = ""
    backup_keep: int = 30          # 날짜별 DB 백업 보관 개수
    backup_hour: int = 2           # 매일 이 시각 이후 첫 확인 때 백업
    session_hours: int = 12        # 마지막 사용 후 로그인 유지 시간
    login_max_fail: int = 5        # 연속 실패 시 잠금
    login_lock_minutes: int = 10
    max_record_mb: float = 5.0     # 기록 1건 최대 크기 (BOM은 별도)
    max_bom_mb: float = 60.0
    max_file_mb: float = 30.0      # 첨부 1개 최대 크기 (base64 포함)
    company: str = ""
    # 텔레그램 아침 요약 — 관리 화면 › 알림에서 설정 (토큰은 이 파일에만, 화면에는 내려보내지 않음)
    telegram_on: bool = False
    telegram_token: str = ""
    telegram_chat: str = ""
    telegram_time: str = "08:00"
    telegram_weekend: bool = False   # True면 주말에도
    telegram_detail: bool = False    # True면 조치 · 이슈 제목까지
    # 업데이트 확인 — 하루 한 번 latest.json 을 읽어 새 버전을 알려만 준다(자동 설치 없음). 사내망 정책상 끄려면 update_check=false
    update_check: bool = True
    update_url: str = "https://github.com/sjkim88work-afk/qis-releases/releases/latest/download/latest.json"
    teams_on: bool = False           # 팀즈(Workflows 웹훅)로도 같은 요약을 보냄 — 시각 · 주말 · 세부 설정은 텔레그램과 공유
    teams_webhook: str = ""          # Teams › Workflows 앱 '웹훅 요청을 받으면 채널에 게시' 흐름의 HTTP POST 주소 (qis.json 에만)

    @property
    def db_path(self) -> Path:
        return self.data_dir / "qis.db"

    @property
    def files_dir(self) -> Path:
        return self.data_dir / "files"

    @property
    def backup_path(self) -> Path:
        return Path(self.backup_dir).resolve() if self.backup_dir else self.data_dir / "backup"

    @property
    def https(self) -> bool:
        return bool(self.ssl_certfile and self.ssl_keyfile)

    def save(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        d = asdict(self)
        d.pop("data_dir")
        (self.data_dir / "qis.json").write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")


def load_config(data_dir: str | Path | None = None) -> Config:
    cfg = Config()
    if data_dir:
        cfg.data_dir = Path(data_dir).resolve()
    f = cfg.data_dir / "qis.json"
    if f.exists():
        for k, v in json.loads(f.read_text(encoding="utf-8")).items():
            if hasattr(cfg, k) and k != "data_dir":
                setattr(cfg, k, v)
    for k in list(Config.__dataclass_fields__):
        env = os.environ.get("QIS_" + k.upper())
        if env is None or k == "data_dir":
            continue
        cur = getattr(cfg, k)
        if isinstance(cur, bool):
            setattr(cfg, k, env.strip().lower() in ("1", "true", "yes", "on"))
        else:
            setattr(cfg, k, type(cur)(env) if not isinstance(cur, Path) else Path(env))
    return cfg
