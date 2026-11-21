/* ================= 화면 라우팅 ================= */
const NAV_GRP = { dash: '업무', sup: '분석', copq: '분석', master: '관리', data: '관리' }; // 좌측 사이드바 그룹 머리글
/* 좌측 사이드바 모드(창 너비 1400px 이상 · 휴대폰 화면 아님)면 머리글의 사용자 · 비밀번호 · 관리 · 로그아웃 · 저작권을 사이드바 맨 아래로 옮기고,
   아니면 머리글의 원래 자리로 되돌림. 휴대폰 화면을 그리기 전에도 부름(06-mobile.js) — 안 그러면 사이드바와 함께 로그아웃 단추가 지워짐 */
const NAV_MQ = window.matchMedia ? window.matchMedia('(min-width:1400px)') : null; // css/25-renewal.css 의 사이드바 조건과 같은 값
const NAV_FT_IDS = ['srvUser', 'hdrPw', 'hdrAdm', 'hdrOut', 'copyInfo'];
const navSide = () => !!(NAV_MQ && NAV_MQ.matches) && !mobView();
function navFoot() {
  const nav = $('#nav'),
    hd = document.querySelector('header');
  if (!nav || !hd) return;
  let ft = $('#navFt') || window.__navFt || null; // 떼어 둔 구역(문서 밖)도 재사용 — 그 안에 옮겨 둔 항목이 들어 있음
  const find = (i) => $('#' + i) || (ft && ft.querySelector('#' + i)) || null;
  if (navSide()) {
    if (!ft) {
      ft = document.createElement('div');
      ft.id = 'navFt';
      ft.className = 'navft noprint';
    }
    window.__navFt = ft;
    nav.appendChild(ft);
    NAV_FT_IDS.forEach((i) => {
      const e = find(i);
      if (e) ft.appendChild(e);
    });
  } else {
    // 머리글의 원래 순서: … 저작권 · 사용자 · 비밀번호 · 관리 · 로그아웃 (hdrBk 는 자리 표시)
    const bk = $('#hdrBk');
    NAV_FT_IDS.forEach((i) => {
      const e = find(i);
      if (e && e.parentNode !== hd) hd.insertBefore(e, i === 'copyInfo' ? $('#srvUser') || bk : bk);
    });
    if (ft) ft.remove();
    window.__navFt = null;
  }
}
// 창 너비가 기준을 넘나들면 아래 칸만 옮김 (화면 전체를 다시 그리지 않음 — 쓰던 입력을 지우지 않게)
try {
  if (NAV_MQ) NAV_MQ.addEventListener('change', navFoot);
} catch (e) {}
const TABS = [
  ['dash', '대시보드'],
  ['prog', '진행 현황'],
  ['issue', '이슈'],
  ['defect', '불량 관리'],
  ['inv', 'FAR'],
  ['ncr', 'NCR / 8D'],
  ['case', 'RCA'],
  ['sup', '협력사 품질'],
  ['copq', 'COPQ'],
  ['master', '기준정보'],
  ['data', '설정 · 백업'],
];
const state = {
  setTab: 'general',
  tab: 'dash',
  dashMonth: today().slice(0, 7),
  df: { from: today().slice(0, 4) + '-01-01', to: '', sup: '', status: '', type: '', q: '' },
  nf: { status: 'open', q: '', sup: '', type: '', from: '', to: '' },
  ivf: { status: 'open', q: '' },
  supFrom: today().slice(0, 4) + '-01-01',
  supTo: today(),
  copqYear: today().slice(0, 4),
};
// 보이는 화면: 공유본은 협력사 품질 · 기준정보 · 설정을 숨김. 서버판은 관리자가 아니면 설정 · 백업을 숨김
const RO_TABS = SHARE
  ? ['dash', 'prog', 'issue', 'defect', 'inv', 'ncr', 'case', 'copq']
  : !srvCanAdmin()
    ? ['dash', 'prog', 'issue', 'defect', 'inv', 'ncr', 'case', 'sup', 'copq', 'master']
    : TABS.map((t) => t[0]);
function go(t) {
  if (!RO_TABS.includes(t)) t = 'dash';
  state.tab = t;
  render();
  window.scrollTo(0, 0);
}
