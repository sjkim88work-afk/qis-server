# Tailscale로 나만 쓰기 (회사 PC + 내 휴대폰)

회사 PC에서 QIS 서버를 실행하고, **내 Tailscale 계정에 연결된 기기에서만** 접속하도록 설정합니다.

```
[회사 PC]  QIS 서버 (이 PC 안에서만 받음: 127.0.0.1:8080)
     │
     └─ Tailscale serve ── https://회사pc이름.xxxx.ts.net ──▶ [내 휴대폰 · 내 노트북 (Tailscale 켬)]

   같은 사내망의 다른 PC ✕   인터넷 ✕   내 Tailscale 계정이 아닌 기기 ✕
```

| 막히는 쪽 | 이유 |
|---|---|
| 같은 사내망의 다른 PC | QIS가 회사 PC 자신(127.0.0.1)에서만 접속을 받음 |
| 인터넷 | Tailscale 주소는 공개 주소가 아니며, Tailscale 망 밖에서는 열리지 않음 |
| 남의 기기 | 내 Tailscale 계정(tailnet)에 로그인한 기기만 주소에 닿음 |
| 기기를 잃어버린 경우 | QIS 로그인이 한 번 더 막음 → [Tailscale 관리 페이지](https://login.tailscale.com/admin/machines)에서 그 기기를 삭제 |

> **먼저 확인하세요.** Tailscale은 원격 접속(VPN) 프로그램입니다. 회사 PC에 설치하기 전에 IT팀 승인을 받으세요.
> 데이터는 회사 PC 안에만 저장되고, Tailscale은 연결만 암호화해서 이어 줍니다.

## 준비
- 회사 PC에 QIS 서버가 설치되어 있어야 합니다 ([설치 가이드](설치_가이드.md) 2-1 ~ 2-4).
- Tailscale 계정이 필요합니다. 개인 사용은 무료이고, 구글 · 마이크로소프트 계정 등으로 만들 수 있습니다.

## 설정 순서

### 1. 회사 PC에 Tailscale 설치
1. [tailscale.com/download](https://tailscale.com/download)에서 Windows용을 설치합니다.
2. 작업 표시줄의 Tailscale 아이콘 → **Log in** → 내 계정으로 로그인합니다.

### 2. 휴대폰에 Tailscale 설치
1. App Store · Play 스토어에서 **Tailscale**을 설치합니다.
2. **회사 PC와 같은 계정**으로 로그인하고 연결(Connect)을 켭니다.

### 3. QIS를 Tailscale 전용으로 바꾸기 (회사 PC)
1. `qis-server\scripts\windows\tailscale_personal.bat`을 더블클릭합니다.
   - QIS가 회사 PC 안에서만 접속을 받도록 바뀝니다.
   - Tailscale에 HTTPS 주소가 열립니다. 처음이면 Tailscale 관리 페이지에서 **HTTPS 인증서 사용**을 허용하라는 안내가 나옵니다. 화면 안내대로 허용하세요.
   - 마지막에 `https://회사pc이름.xxxx.ts.net` 형태의 접속 주소가 나옵니다. 이 주소를 적어 두세요.
2. QIS 서버를 다시 시작합니다. `run.bat` 창을 닫았다가 다시 실행하거나, 자동 실행을 등록했으면 PC를 재시작합니다.

### 4. 휴대폰에서 접속
1. Tailscale이 켜진 상태에서 휴대폰 브라우저로 3단계의 주소를 엽니다.
2. QIS 아이디 · 비밀번호로 로그인합니다.
3. 아이콘 만들기:
   - **iPhone (Safari)**: 공유 버튼 → **홈 화면에 추가**
   - **Android (Chrome)**: 메뉴(⋮) → **홈 화면에 추가** 또는 **앱 설치**

### 5. 회사 PC에서 쓸 때
- 회사 PC에서는 지금처럼 `http://localhost:8080`으로 엽니다.

## 꼭 지킬 것
- **`tailscale funnel`은 쓰지 마세요.** 인터넷 전체에 공개하는 기능입니다. 이 설정은 `serve`(내 기기 전용)만 씁니다.
- **회사 PC가 켜져 있어야** 휴대폰에서 접속됩니다. 절전 모드에 들어가면 끊깁니다. Windows **설정 › 시스템 › 전원**에서 *절전 모드 전환: 안 함*으로 바꾸세요. 노트북이면 덮개를 닫을 때의 동작도 함께 바꿉니다.
- 휴대폰을 바꾸거나 잃어버리면 [Tailscale 관리 페이지](https://login.tailscale.com/admin/machines)에서 그 기기를 **삭제**합니다.
- QIS 비밀번호는 Tailscale과 별개로 꼭 유지하세요. 두 겹으로 막는 구조입니다.

## 확인 · 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 휴대폰에서 주소가 안 열림 | 휴대폰 Tailscale이 켜져 있는지, 회사 PC Tailscale이 연결돼 있는지(작업 표시줄 아이콘), 회사 PC가 켜져 있는지 |
| "이 사이트에 연결할 수 없음" | QIS 서버가 실행 중인지 확인합니다. 회사 PC에서 `http://localhost:8080/healthz` → `{"ok":true}` |
| 주소를 잊어버림 | 회사 PC 명령 창에서 `tailscale serve status` |
| 회사 Wi-Fi에서만 안 됨 | 회사 방화벽이 Tailscale을 막는 경우 → IT팀 문의 |

## 나중에 팀원도 쓰게 할 때
1. `scripts\windows\tailscale_off.bat`을 실행합니다. Tailscale 주소를 닫고 사내망 접속으로 되돌립니다.
2. [설치 가이드](설치_가이드.md) 2-6 ~ 2-8대로 계정과 방화벽을 설정합니다. 팀용은 사내 서버(IT 가상 서버)로 옮기는 것을 권장합니다.
