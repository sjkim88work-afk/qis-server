// ── RCA — 항목 정의 · 단계 · 게이트 ──
/* ================= RCA · 사내 8D =================
   Case · Action · 단계 게이트(IATF) · 원인분석 워크시트
   부품·협력사·불량유형·담당자는 개인 QMS 기준정보를 그대로 씁니다.
   컬럼 내부 이름은 SharePoint 설계서와 동일 (CSV 내보내기용)        */
const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const CZ_STAGES = ['접수', '격리', '처분', '원인분석', '대책', '효과검증', '표준화', '종결'];
const CZ_PATH = {
  'TIER 3': CZ_STAGES,
  'TIER 2': CZ_STAGES,
  'TIER 1': ['접수', '격리', '처분', '원인분석', '대책', '종결'],
  'TIER 0': ['접수', '처분', '종결'],
};
const CZ_NEXT_HINT = {
  격리: '격리 수량 확인 · 식별 표시',
  처분: '처분 방식 결정',
  원인분석: '발생·유출 원인 확정',
  대책: '영구대책 수립 · 담당/기한 지정',
  효과검증: '효과검증 데이터 수집',
  표준화: 'FMEA · 관리계획서 개정 확인',
  종결: '종결 완료',
};
const CZ_OPT = {
  Origin: ['수입검사', '공정', '최종검사', '고객사', '필드', '협력사요청', '고객요청'],
  RequestType: ['품질문제', '기술지원', '납기조정', '도면·사양변경', '샘플요청', '기타'],
  Customer: ['', 'HKMC', 'GM', '유럽OEM', '기타'],
  get DefectType() {
    return ['', ...db.settings.defectTypes];
  },
  Status: ['진행중', '보류', '종결', '취소'],
  Ball: ['나', '협력사', '고객', '타부서', '보류'],
  Priority: ['긴급', '높음', '보통', '낮음'],
  SevS: [
    ['', '-'],
    ['5', '5 고객 라인 정지'],
    ['4', '4 고객 불량 유출'],
    ['3', '3 사내 라인 정지'],
    ['2', '2 사내 불량 발견'],
    ['1', '1 경미 · 외관'],
  ],
  ImpI: [
    ['', '-'],
    ['5', '5 대량 (1000개↑)'],
    ['3', '3 중량 (100~1000개)'],
    ['1', '1 소량 (100개↓)'],
  ],
  Tier: ['', 'TIER 3', 'TIER 2', 'TIER 1', 'TIER 0'],
  Response: ['', '현장조치', '간이 대책서', '8D', 'RCA'],
  ContainMethod: ['', '적색라벨', '격리구역', '시스템홀드', '기타'],
  Disposition: ['미정', '선별', '재작업', '수리', '특채', '폐기', '반품'],
  CustNotify: ['', '불필요', '필요', '완료'],
  Score: ['', '0', '4', '7', '10'],
  PokaYoke: ['', '미적용', '검토중', '적용완료'],
  PokaYokeType: ['', '형상규제', '센서검출', '설비인터록', '자동정지', '경보', '기타'],
  DocUpd: ['', '해당없음', '필요', '완료'],
  Yokoten: ['', '해당없음', '검토중', '완료'],
  Recurred: ['', '없음', '있음'],
  VerifyResult: ['미검증', '합격', '조건부', '불합격'],
  Retention: ['3년', '5년', '10년', '부품수명+1년'],
  ActCat: ['봉쇄', '재작업·재검사', '발생대책', '유출대책', '시스템대책', '효과검증', '문서개정', '수평전개', '교육', '불합격조치', '기타'],
  ActStatus: ['대기', '진행', '완료', '취소'],
  SafetyChar: ['해당없음', '안전-S', '법규-R', '중요-C'],
  RcaScope: [
    ['', '-'],
    ['없음', '없음 — 협력사 대책으로 충분'],
    ['발생', '발생 원인 (사내 귀책)'],
    ['유출', '유출 원인 (왜 못 걸렀나)'],
    ['발생+유출', '발생 + 유출'],
  ],
};
const czById = (l, id) => (db[l] || []).find((x) => x.id === id);
// RCA 이력 — 단계 진행 · 되돌림 · 다시 열기 · 상태 · 조치 완료 · 귀책 판정 · 연결을 사건에 남김 (c.Log, 지우지 않음)
function czLog(c, type, text, x) {
  if (!c) return;
  (c.Log = c.Log || []).push(Object.assign({ at: now(), date: today(), by: czMe(), type, text: String(text || '') }, x || {}));
}
// 목표 종결일 — 직접 입력이 없으면 등록일 + TIER별 기준 일수 (설정 › NCR · 기한)
const RCA_DAYS = { 'TIER 3': 'rcaT3', 'TIER 2': 'rcaT2', 'TIER 1': 'rcaT1', 'TIER 0': 'rcaT0' },
  RCA_DAYS_DEF = { 'TIER 3': 45, 'TIER 2': 30, 'TIER 1': 20, 'TIER 0': 10 };
const czDays = (c) => num(db.settings[RCA_DAYS[c.Tier]]) || RCA_DAYS_DEF[c.Tier] || 30;
const czTargetAuto = (c) => (has(c.Created) ? addDays(c.Created, czDays(c)) : '');
const czTarget = (c) => (c ? (has(c.TargetClose) ? c.TargetClose : czTargetAuto(c)) : '');
// 단계에 들어간 날 — 이력이 있으면 이력, 없으면(도입 전 건) 접수=등록일만 앎
function czStageDate(c, s) {
  const l = (c.Log || []).filter((x) => x.to === s).pop();
  return l ? l.date : s === '접수' ? c.Created || '' : s === '종결' ? c.CloseDate || '' : '';
}
const CZ_RCA_LBL = { 없음: '없음 (협력사 대책으로 충분)', 발생: '발생 원인', 유출: '유출 원인', '발생+유출': '발생 + 유출' };
const czPart = (c) => (c && c.PartId ? db.parts.find((p) => p.id === c.PartId) : null);
const czActs = (c) => db.actions.filter((a) => a.CaseId === c.id);
const czMe = () => db.settings.owners[0] || '';
const czOpen = (c) => c && c.Status !== '종결' && c.Status !== '취소';
const czCaseOpenId = (id) => czOpen(czById('cases', id));
function czTierAuto(c) {
  if (!has(c.SevS) || !has(c.ImpI)) return '';
  const s = num(c.SevS) * num(c.ImpI);
  return s >= 20 ? 'TIER 3' : s >= 10 ? 'TIER 2' : s >= 5 ? 'TIER 1' : 'TIER 0';
}
const czFull8D = (c) => c.Response === '8D' && ['TIER 0', 'TIER 1'].includes(c.Tier);
// RCA(사내 분석 대상)가 있으면 TIER가 낮아도 원인분석 · 대책 단계는 거침
const czPath = (c) =>
  czFull8D(c) ? CZ_STAGES : c.Tier === 'TIER 0' && c.RcaScope && c.RcaScope !== '없음' ? CZ_PATH['TIER 1'] : CZ_PATH[c.Tier] || CZ_STAGES;
function czNext(c) {
  const ci = CZ_STAGES.indexOf(c.Stage);
  return czPath(c).find((s) => CZ_STAGES.indexOf(s) > ci);
}
function czPrev(c) {
  const ci = CZ_STAGES.indexOf(c.Stage);
  return czPath(c)
    .filter((s) => CZ_STAGES.indexOf(s) < ci)
    .pop();
}
const czFar = (c) => num(c.D3Score) + num(c.D7Score) + num(c.D14Score);
const czNcr = (c) => (c && c.NcrId ? db.ncrs.find((x) => x.id === c.NcrId) : null);
const czNcrSt = (c) => {
  const n = czNcr(c);
  return n ? ncrStatus(n) : '';
};
const czNcrOk = (c) => ['승인(검증대기)', '종결'].includes(czNcrSt(c)); // 협력사 대책서 승인
const czNcrDone = (c) => czNcrSt(c) === '종결' && !!(czNcr(c) || {}).verifyDate; // NCR 유효성 검증 '유효'
const czUseFar = (c) => c.Response === 'FAR' && !c.NcrId;
const czNeedOcc = (c) => c.RcaScope === '발생' || c.RcaScope === '발생+유출';
const czNeedEsc = (c) => c.RcaScope === '유출' || c.RcaScope === '발생+유출';
const czTierCls = (t) => ({ 'TIER 3': 't3', 'TIER 2': 't2', 'TIER 1': 't1', 'TIER 0': 't0' })[t] || 't0';
const czStCls = (s) => ({ 진행중: 'st-ing', 보류: 'st-hold', 종결: 'st-done', 취소: 'st-cancel' })[s] || 'st-ing';
const CZ_RULES = [
  { st: '접수', tab: 'basic', f: 'Title', t: '제목', ok: (c) => has(c.Title) },
  { st: '접수', tab: 'basic', f: 'PartId', t: '부품', ok: (c) => has(c.PartId) },
  { st: '접수', tab: 'basic', f: 'DefectType', t: '불량유형', ok: (c) => has(c.DefectType) },
  { st: '접수', tab: 'basic', f: 'DefectQty', t: '불량수량', ok: (c) => has(c.DefectQty) },
  { st: '접수', tab: 'basic', f: 'Description', t: '불량내용', ok: (c) => has(c.Description) },
  { st: '접수', tab: 'basic', f: 'SevS', t: '심각도 S', ok: (c) => has(c.SevS) },
  { st: '접수', tab: 'basic', f: 'ImpI', t: '영향도 I', ok: (c) => has(c.ImpI) },
  { st: '접수', tab: 'basic', f: 'Tier', t: '확정 TIER', ok: (c) => has(c.Tier) },
  {
    st: '접수',
    tab: 'basic',
    f: 'TierReason',
    t: 'TIER 조정사유 (자동 판정과 다름)',
    ok: (c) => !has(c.Tier) || c.Tier === czTierAuto(c) || has(c.TierReason),
  },
  { st: '접수', tab: 'basic', f: 'Response', t: '대응방향', ok: (c) => has(c.Response) },
  { st: '접수', tab: 'head', f: 'NextAction', t: '공 · 다음 행동 · 재확인일', ok: (c) => has(c.Ball) && has(c.NextAction) && has(c.RecheckDate) },
  {
    st: '격리',
    tab: 'contain',
    f: 'QtyStock',
    t: '격리 수량 4칸 (없으면 0)',
    ok: (c) => ['QtyStock', 'QtyWIP', 'QtyTransit', 'QtyCustomer'].every((k) => has(c[k])),
  },
  { st: '격리', tab: 'contain', f: 'ContainDate', t: '격리 완료일', ok: (c) => has(c.ContainDate) },
  { st: '격리', tab: 'contain', f: 'ContainMethod', t: '식별 방법', ok: (c) => has(c.ContainMethod) },
  { st: '처분', tab: 'contain', f: 'Disposition', t: '처분 방식 (미정 불가)', ok: (c) => has(c.Disposition) && c.Disposition !== '미정' },
  {
    st: '처분',
    tab: 'contain',
    f: 'DeviationNo',
    t: '특채번호 · 고객 승인자 · 승인일 (특채/수리, IATF 8.7.1.1·8.7.1.5)',
    ok: (c) => !['특채', '수리'].includes(c.Disposition) || (has(c.DeviationNo) && has(c.CustApprover) && has(c.CustApproveDate)),
  },
  {
    st: '처분',
    tab: 'actions',
    t: '재작업·재검사 조치 1건 이상 (재작업, IATF 8.7.1.4)',
    ok: (c) => c.Disposition !== '재작업' || czActs(c).some((a) => a.Category === '재작업·재검사'),
  },
  { st: '처분', tab: 'contain', f: 'CustNotify', t: '고객통보 판정 (IATF 8.7.1.6)', ok: (c) => has(c.CustNotify) },
  {
    st: '처분',
    tab: 'contain',
    f: 'CustNotify',
    t: '고객사·필드 발견 건은 고객통보 필요/완료',
    ok: (c) => !['고객사', '필드'].includes(c.Origin) || ['필요', '완료'].includes(c.CustNotify),
  },
  { st: '처분', tab: 'contain', f: 'CustNotifyReason', t: '고객통보 불필요 사유', ok: (c) => c.CustNotify !== '불필요' || has(c.CustNotifyReason) },
  { st: '원인분석', tab: 'cause', f: 'RcaScope', t: '사내 분석 대상 판정 (없음 / 발생 / 유출)', ok: (c) => has(c.RcaScope) },
  {
    st: '원인분석',
    tab: 'cause',
    t: '사내 RCA 워크시트 1개 이상',
    ok: (c) => (c.Analyses || []).length > 0 || (!czNeedOcc(c) && !czNeedEsc(c) && (czNcrOk(c) || c.RcaScope === '없음')),
  },
  { st: '원인분석', tab: 'cause', f: 'CauseOccur', t: '발생 원인', ok: (c) => has(c.CauseOccur) },
  { st: '원인분석', tab: 'cause', f: 'CauseEscape', t: '유출 원인', ok: (c) => has(c.CauseEscape) || (!czNeedEsc(c) && czNcrOk(c)) },
  { st: '원인분석', tab: 'cause', f: 'CauseSystem', t: '시스템 원인 (TIER 3)', ok: (c) => c.Tier !== 'TIER 3' || has(c.CauseSystem) },
  { st: '원인분석', tab: 'far', f: 'D7Reply', t: 'FAR D+7 회신일 · 점수', ok: (c) => !czUseFar(c) || (has(c.D7Reply) && has(c.D7Score)) },
  {
    st: '대책',
    tab: 'actions',
    t: '발생대책 조치 1건 이상 (또는 연결 NCR 대책서 승인)',
    ok: (c) => (!czNeedOcc(c) && czNcrOk(c)) || czActs(c).some((a) => a.Category === '발생대책'),
  },
  {
    st: '대책',
    tab: 'actions',
    t: '유출대책 조치 1건 이상 (또는 연결 NCR 대책서 승인)',
    ok: (c) => (!czNeedEsc(c) && czNcrOk(c)) || czActs(c).some((a) => a.Category === '유출대책'),
  },
  {
    st: '대책',
    tab: 'actions',
    t: '미완료 조치 모두 담당자 · 기한 지정',
    ok: (c) =>
      czActs(c)
        .filter((a) => !['완료', '취소'].includes(a.ActionStatus))
        .every((a) => (has(a.Assignee) || has(a.ExternalOwner)) && has(a.DueDate)),
  },
  { st: '대책', tab: 'verify', f: 'PokaYoke', t: '실수방지 판정 (IATF 10.2.4)', ok: (c) => has(c.PokaYoke) },
  { st: '대책', tab: 'verify', f: 'PokaYokeReason', t: '실수방지 미적용 사유', ok: (c) => c.PokaYoke !== '미적용' || has(c.PokaYokeReason) },
  {
    st: '효과검증',
    tab: 'verify',
    f: 'VerifyStart',
    t: '검증 기간 (또는 NCR 유효성 검증 완료)',
    ok: (c) => czNcrDone(c) || (has(c.VerifyStart) && has(c.VerifyEnd)),
  },
  {
    st: '효과검증',
    tab: 'verify',
    f: 'RateBefore',
    t: '개선 전 · 후 불량률 (또는 NCR 유효성 검증 완료)',
    ok: (c) => czNcrDone(c) || (has(c.RateBefore) && has(c.RateAfter)),
  },
  { st: '효과검증', tab: 'verify', f: 'Recurred', t: '동일 불량 재발 여부', ok: (c) => czNcrDone(c) || has(c.Recurred) },
  { st: '효과검증', tab: 'verify', f: 'VerifyResult', t: '효과검증 판정 합격 또는 조건부', ok: (c) => ['합격', '조건부'].includes(c.VerifyResult) },
  {
    st: '효과검증',
    tab: 'actions',
    t: 'FAR 총점 15점 미만 → 불합격조치 등록',
    ok: (c) => !czUseFar(c) || czFar(c) >= 15 || czActs(c).some((a) => a.Category === '불합격조치'),
  },
  {
    st: '표준화',
    close: true,
    tab: 'close',
    f: 'FMEAUpdate',
    t: 'FMEA 갱신 판정 (완료/해당없음, IATF 10.2.3)',
    ok: (c) => ['완료', '해당없음'].includes(c.FMEAUpdate),
  },
  {
    st: '표준화',
    close: true,
    tab: 'close',
    f: 'CPUpdate',
    t: '관리계획서 갱신 판정 (완료/해당없음)',
    ok: (c) => ['완료', '해당없음'].includes(c.CPUpdate),
  },
  {
    st: '표준화',
    close: true,
    tab: 'close',
    f: 'DocNAReason',
    t: '문서 개정 해당없음 사유',
    ok: (c) => !(c.FMEAUpdate === '해당없음' || c.CPUpdate === '해당없음') || has(c.DocNAReason),
  },
  { st: '표준화', tab: 'close', f: 'Yokoten', t: '수평전개 판정 (해당없음/완료)', ok: (c) => ['해당없음', '완료'].includes(c.Yokoten) },
  { close: true, tab: 'actions', t: '미완료 조치 0건', ok: (c) => czActs(c).every((a) => ['완료', '취소'].includes(a.ActionStatus)) },
  {
    close: true,
    tab: 'close',
    f: 'CloseApprover',
    t: '종결 승인자 (TIER 2·3)',
    ok: (c) => !['TIER 2', 'TIER 3'].includes(c.Tier) || has(c.CloseApprover),
  },
  { close: true, tab: 'close', f: 'Retention', t: '보관기간', ok: (c) => has(c.Retention) },
];
function czGate(c, target) {
  const p = czPath(c),
    ti = p.indexOf(target);
  return CZ_RULES.filter((r) => {
    const si = r.st ? p.indexOf(r.st) : -1;
    return (si >= 0 && si < ti) || (r.close && target === '종결');
  }).filter((r) => !r.ok(c));
}
const F = (key, label, type, opt, x) => Object.assign({ key, label, type, opt }, x || {});
const CZ_TABS = [
  {
    id: 'basic',
    label: '기본',
    fields: [
      F('Title', '제목', 'text', null, { w: 2 }),
      F('Origin', '발생원천', 'select', 'Origin'),
      F('RequestType', '요청분류', 'select', 'RequestType'),
      F('PartId', '부품', 'part'),
      F('SupplierId', '협력사', 'supplier'),
      F('Customer', '고객사', 'select', 'Customer'),
      F('CustomerClaimNo', '고객 클레임번호', 'text'),
      F('DefectType', '불량유형', 'select', 'DefectType'),
      F('DefectQty', '불량수량 (EA)', 'number'),
      F('Priority', '우선순위', 'select', 'Priority'),
      F('Owner', '담당자', 'text', null, { list: 'dlOwners' }),
      F('Description', '불량내용', 'textarea', null, { w: 4 }),
      F('SevS', '심각도 S', 'select', 'SevS'),
      F('ImpI', '영향도 I', 'select', 'ImpI'),
      F('TierAuto', '판정 TIER (자동)', 'calc'),
      F('Tier', '확정 TIER', 'select', 'Tier'),
      F('TierReason', 'TIER 조정사유', 'textarea', null, { w: 4, showIf: (c) => has(c.Tier) && has(czTierAuto(c)) && c.Tier !== czTierAuto(c) }),
      F('Response', '대응방향', 'select', 'Response'),
      F('ParentCaseId', '연계 RCA (재발)', 'case'),
      F('LegacyNo', '기존 문서번호', 'text'),
      F('Created', '등록일', 'date'),
      F('TargetClose', '목표 종결일', 'date', null, {
        hint: (c) => `비워 두면 등록일 + ${c.Tier || 'TIER'} 기준 ${czDays(c)}일 = ${czTargetAuto(c) || '-'}`,
      }),
    ],
  },
  {
    id: 'contain',
    label: '격리·처분',
    note: 'IATF 8.7.1 — 부적합품은 식별·격리·기록 후 처분합니다. 격리 수량은 없으면 0을 입력하세요.',
    fields: [
      F('QtyStock', '격리 · 사내 재고', 'number'),
      F('QtyWIP', '격리 · 재공', 'number'),
      F('QtyTransit', '격리 · 이송중', 'number'),
      F('QtyCustomer', '격리 · 고객처', 'number'),
      F('ContainDate', '격리 완료일', 'date'),
      F('ContainMethod', '식별 방법', 'select', 'ContainMethod'),
      F('ContainScope', '소급 범위 (로트/기간)', 'text', null, { w: 2 }),
      F('Disposition', '처분', 'select', 'Disposition'),
      F('DispositionDate', '처분 완료일', 'date'),
      F('DeviationNo', '특채번호', 'text'),
      F('DeviationScope', '특채 유효범위 (수량/기한)', 'text'),
      F('CustNotify', '고객통보', 'select', 'CustNotify'),
      F('CustNotifyDate', '고객 통보일', 'date'),
      F('CustApprover', '고객 승인자', 'text'),
      F('CustApproveDate', '고객 승인일', 'date'),
      F('CustNotifyReason', '고객통보 불필요 사유', 'textarea', null, { w: 4, showIf: (c) => c.CustNotify === '불필요' }),
    ],
  },
  {
    id: 'cause',
    label: '원인분석',
    fields: [
      F('RcaScope', '사내 분석 대상 (RCA)', 'select', 'RcaScope', {
        w: 2,
        hint: '협력사 귀책이라도 공정·출하·고객 단계에서 발견됐으면 ‘유출’ — 수입검사가 왜 못 걸렀는지 사내에서 분석합니다',
      }),
      F('CauseOccur', '발생 원인', 'textarea', null, { w: 2 }),
      F('CauseEscape', '유출 원인 (왜 검출되지 않았나)', 'textarea', null, { w: 2 }),
      F('CauseSystem', '시스템 원인 (왜 시스템이 막지 못했나)', 'textarea', null, { w: 4 }),
    ],
  },
  {
    id: 'far',
    label: 'FAR 회신',
    showTab: (c) => czUseFar(c),
    note: '점수 기준 — 10 요구 충족·근거 완비 / 7 충족하나 근거 미흡 / 4 형식적 회신 / 0 미회신. 총점 24 이상 합격, 15~23 조건부, 15 미만 불합격.',
    fields: [
      F('FARIssueDate', 'FAR 발행일', 'date', null, {
        hint: (c) =>
          typeof invFarSrc === 'function' && invFarSrc(c.DefectIds) ? '귀책 조사의 FAR 요청일을 그대로 씁니다 — 수정은 귀책 조사에서' : '',
      }),
      F('FARDue', 'D+3 / D+7 / D+14 마감', 'calc', null, { w: 2 }),
      F('FARTotal', 'FAR 총점 (30점)', 'calc'),
      F('D3Reply', 'D+3 즉시조치 회신일', 'date'),
      F('D3Score', 'D+3 점수', 'select', 'Score'),
      F('D7Reply', 'D+7 근본원인 회신일', 'date'),
      F('D7Score', 'D+7 점수', 'select', 'Score'),
      F('D14Reply', 'D+14 영구대책 회신일', 'date'),
      F('D14Score', 'D+14 점수', 'select', 'Score'),
    ],
  },
  {
    id: 'verify',
    label: '대책·검증',
    fields: [
      F('PokaYoke', '실수방지 (IATF 10.2.4)', 'select', 'PokaYoke'),
      F('PokaYokeType', '적용 방식', 'select', 'PokaYokeType'),
      F('PokaYokeReason', '미적용 사유', 'text', null, { w: 2 }),
      F('VerifyStart', '검증 시작일', 'date'),
      F('VerifyEnd', '검증 종료일', 'date'),
      F('RateBefore', '개선 전 불량률 (% 또는 PPM)', 'number'),
      F('RateAfter', '개선 후 불량률', 'number'),
      F('Recurred', '동일 불량 재발', 'select', 'Recurred'),
      F('VerifyResult', '효과검증 판정', 'select', 'VerifyResult'),
    ],
  },
  { id: 'actions', label: '조치', fields: [] },
  {
    id: 'close',
    label: '표준화·종결',
    note: 'IATF 10.2.3 — 근본원인이 확정되면 FMEA와 관리계획서 갱신 여부를 반드시 판정합니다.',
    fields: [
      F('FMEAUpdate', '공정 FMEA 갱신', 'select', 'DocUpd'),
      F('FMEARev', 'FMEA 개정번호', 'text'),
      F('CPUpdate', '관리계획서 갱신', 'select', 'DocUpd'),
      F('CPRev', '관리계획서 개정번호', 'text'),
      F('DocNAReason', '해당없음 사유', 'textarea', null, { w: 4, showIf: (c) => c.FMEAUpdate === '해당없음' || c.CPUpdate === '해당없음' }),
      F('Yokoten', '수평전개', 'select', 'Yokoten'),
      F('CloseApprover', '종결 승인자', 'text'),
      F('Retention', '보관기간 (IATF 7.5.3.2.1)', 'select', 'Retention'),
      F('CloseDate', '종결일', 'date'),
    ],
  },
  { id: 'hist', label: '이력', fields: [] },
];

/* ---------- 분석 도구 (워크시트) ---------- */
const TOOLS = [
  {
    key: '5why',
    name: '5 Why',
    lv: '기본',
    when: '단순·반복 불량. 원인이 한 줄기로 이어질 때',
    how: [
      '문제를 한 문장으로 정의합니다 (무엇이 · 어디서 · 얼마나).',
      '"왜?"에 추측이 아닌 확인된 사실로 답하고, 그 답을 다음 "왜?"의 대상으로 삼습니다. 질문 칸은 앞 답을 받아 자동으로 바뀝니다.',
      '작업자 실수가 아니라 관리 가능한 원인(설비·방법·기준·시스템)에 닿으면 멈춥니다. 보통 3~5단계입니다.',
      '발생(왜 만들어졌나)과 유출(왜 못 걸렀나)을 따로 씁니다.',
      '거꾸로 읽기 검증: 마지막 답부터 "그래서"로 이어 읽어 문제까지 논리가 닿는지 확인합니다.',
    ],
  },
  {
    key: 'isnot',
    name: 'Is / Is Not',
    lv: '기본',
    when: '원인 범위가 불분명할 때. 정상인 것과 비교해 후보를 좁힘',
    how: [
      'IS에는 불량이 나타난 대상·위치·시점·양을, IS NOT에는 나타날 수 있었는데 나타나지 않은 것을 씁니다.',
      '두 칸의 차이점을 적습니다. 원인은 이 차이 안에 있습니다.',
      '차이점마다 가능한 원인을 적고, 아래 원인 후보 표로 옮겨 검증 방법을 정합니다.',
      '검증 결과가 ○인 후보만 결론에 씁니다.',
    ],
  },
  {
    key: 'timeline',
    name: 'Timeline',
    lv: '기본',
    when: '언제부터 이상이 생겼는지 시간 순서로 재현할 때',
    how: [
      '정상이던 마지막 시점부터 불량 발견 시점까지 사건을 시간 순으로 적습니다.',
      '생산·검사·설비 정비·자재 입고·인원 변경 기록을 함께 모읍니다.',
      '정상 → 이상으로 바뀐 경계 구간을 찾고, 그 사이 변화를 아래 변화점 표에 적습니다.',
    ],
  },
  {
    key: 'change',
    name: '변화점 (4M+1E)',
    lv: '기본',
    when: '어느 시점 이후 갑자기 불량이 생겼을 때',
    how: [
      '불량 발생 전후를 기준으로 사람·설비·자재·방법·환경의 변화 전/후를 적습니다.',
      '변화가 없는 항목은 "변화 없음"으로 명시합니다. 빈칸은 확인하지 않은 것입니다.',
      '영향도 상 항목부터 재현 시험이나 데이터로 확인하고 결과를 ○ / ×로 남깁니다.',
      '협력사 부품이면 4M 변경 신고 이력과 대조합니다. 신고 없이 바뀐 항목이 있으면 그 자체로 부적합입니다.',
    ],
  },
  {
    key: 'fishbone',
    name: '특성요인도',
    lv: '기본',
    when: '원인 후보를 빠짐없이 펼쳐 볼 때 (팀 브레인스토밍)',
    how: [
      '결과(특성)를 한 문장으로 씁니다.',
      '6M 분류별로 생각나는 원인을 모두 적습니다. 이 단계에서는 거르지 않습니다.',
      '현장·데이터로 확인해 "검증-원인" 또는 "기각"으로 표시합니다.',
      '"검증-원인" 항목은 5 Why 워크시트를 추가해 더 파고듭니다.',
    ],
  },
  {
    key: 'fta',
    name: 'FTA 고장나무',
    lv: '심화',
    when: '여러 원인이 겹쳐야 생기는 복합 고장. AND/OR 구조 파악',
    how: [
      '최상위 사건(Top event)을 정의합니다.',
      '바로 아래 원인들을 적고, 그 원인들이 모두 있어야 생기면 AND, 하나만 있어도 생기면 OR를 고릅니다.',
      '"+ 하위"로 더 나눌 수 없는 기본 원인까지 내려갑니다. 하위가 없는 칸이 기본 원인이 됩니다.',
      '기본 원인에 발생 확률(%)을 모두 넣으면 최상위 확률이 계산됩니다. AND 아래 원인은 하나만 막아도 사건이 막히므로 대책 대상으로 좋습니다.',
    ],
  },
  {
    key: 'logic',
    name: 'Logic Tree',
    lv: '심화',
    when: '문제를 MECE로 분해해 검증 대상을 정할 때',
    how: [
      '분해 기준(4M+1E, 공정 단계, 구성품)을 먼저 정합니다.',
      '같은 수준의 가지끼리 겹치지 않고(ME), 합치면 빠짐없게(CE) 나눕니다.',
      '가지마다 가능성을 판단하고, 가능성이 높은 가지만 한 단계 더 나눕니다.',
      '끝 가지를 검증해 원인확인 / 기각을 표시합니다.',
    ],
  },
  {
    key: 'cem',
    name: 'C&E Matrix',
    lv: '심화',
    when: '원인 후보가 많아 우선순위를 점수로 정해야 할 때',
    how: [
      '결과 항목(Y)과 중요도(1~10)를 정합니다.',
      '원인 후보(X)마다 각 Y와의 관계를 9(강) · 3(중) · 1(약) · 0(없음)으로 매깁니다.',
      '총점 = Σ(관계 × 중요도)가 자동 계산되고 순위가 매겨집니다.',
      '상위 원인부터 검증하거나 대책을 세웁니다.',
    ],
  },
  {
    key: 'eta',
    name: 'ETA 사건나무',
    lv: '심화',
    when: '불량이 어느 검출 단계를 뚫고 유출되는지 볼 때 (유출 원인)',
    how: [
      '초기 사건(예: 치수 불량 발생)과 그 발생률(%)을 적습니다.',
      '그 뒤의 방어 단계(공정검사, 출하검사, 수입검사 등)를 순서대로 적고, 단계별로 불량을 놓칠 확률(%)을 넣습니다.',
      '경로별 확률이 계산됩니다. 고객 유출 확률을 가장 크게 줄이는 방어 단계를 강화 대상으로 정합니다.',
    ],
  },
];
const toolOf = (k) => TOOLS.find((t) => t.key === k) || { name: k, how: [] };
const REC = {
  'TIER 1': ['5why', 'isnot', 'timeline', 'change'],
  'TIER 2': ['5why', 'isnot', 'change', 'fishbone', 'fta', 'cem'],
  'TIER 3': ['fishbone', 'fta', 'logic', 'cem', 'eta', '5why'],
};
const GUIDE = [
  ['갑자기 생겼다', 'change'],
  ['언제부터인지 모른다', 'timeline'],
  ['범위가 애매하다', 'isnot'],
  ['원인이 한 줄기다', '5why'],
  ['후보를 다 펼쳐야 한다', 'fishbone'],
  ['여러 원인이 겹친다', 'fta'],
  ['후보가 너무 많다', 'cem'],
  ['왜 못 걸렀나', 'eta'],
];
let anaSeq = 0;
