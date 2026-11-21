'use strict';
/* ---- 서버판 전용 (v2.0.0) ----
   두 가지 방식으로만 열림:
   · 서버판 — 서버가 화면을 보낼 때 로그인 사용자 정보 (qisServer) 를 넣어 줌 → SRV
   · 읽기 전용 공유본 — 서버판의 설정 › 데이터 · 백업 › ‘읽기 전용 공유’ 로 만든 HTML 파일. 파일 안에 데이터 (qmsShare) 가 들어 있음 → SHARE
   둘 다 아니면 = 서버 없이 이 파일을 직접 연 것 → 안내만 보이고 멈춤. 브라우저에 남아 있는 예전 단일 파일판 데이터는 읽지도 쓰지도 않음 */
const APP_SRC = (() => {
  try {
    return (
      '<!doctype html>\n' + document.documentElement.outerHTML.replace(new RegExp('<script id="qis' + 'Server"[^>]*>[\\s\\S]*?<\\/script>\\s*'), '')
    );
  } catch (e) {
    return '';
  }
})();
const SHARE = (() => {
  try {
    const e = document.getElementById('qmsShare');
    return e ? JSON.parse(e.textContent) : null;
  } catch (e) {
    return null;
  }
})();
const SRV = (() => {
  if (SHARE) return null;
  try {
    const e = document.getElementById('qisServer');
    return e ? JSON.parse(e.textContent) : null;
  } catch (e) {
    return null;
  }
})();
if (!SRV && !SHARE) {
  const d = document.createElement('div');
  d.id = 'nosrv';
  d.innerHTML = `<div class="box"><h1>QIS 는 데스크톱 프로그램으로 엽니다</h1>
    <p>v2.0.0 부터 QIS 는 <b>서버판 (데스크톱 프로그램 QIS.app · QIS.exe)</b> 만 씁니다. 이 파일을 직접 열어서는 쓸 수 없습니다.</p>
    <p>혼자 쓰는 경우에도 데스크톱 프로그램의 <b>‘이 PC 혼자 쓰기’</b> 로 같은 기능을 씁니다.</p>
    <p class="sub">예전에 이 파일로 쓰던 데이터가 있으면: 예전 버전 (v1.x) 의 파일로 열어 <b>설정 · 백업 › 백업 파일 내보내기</b> 를 한 뒤, 데스크톱 프로그램의 <b>관리 › 백업 · 데이터 › 가져오기</b> 로 넣으세요. 이 화면은 예전 데이터를 읽거나 지우지 않습니다.</p></div>`;
  document.body.appendChild(d);
  document.body.classList.add('nosrv');
  throw new Error('QIS: 서버 없이 열림 — 안내만 표시하고 멈춤');
}
const RO = !!SHARE || SRV.role === 'viewer'; // 공유본 · 조회 권한 = 읽기 전용
const RO_PH = new Map(SHARE && Array.isArray(SHARE.photos) ? SHARE.photos.filter((p) => p && p.id).map((p) => [p.id, p]) : []);
