/* ================= 판정 로직 ================= */
/* ---- 심각도 평가 ---- */
const SEV_F = {
  impact: ['영향도', ['외관 경미', '외관 주요·조립성', '기능 저하', '안전·법규·기능 상실']],
  stage: ['유출 단계', ['수입검사', '공정', '출하검사', '고객·필드']],
  scope: ['발생 범위', ['단품', 'LOT 일부', 'LOT 전체', '복수 LOT·타 품목']],
  get repeat() {
    const S = (typeof db !== 'undefined' && db && db.settings) || {};
    return [
      '반복성',
      ['최초', `${num(S.repeatWindow) || 90}일 내 2회`, `${num(S.repeatWindow) || 90}일 내 ${num(S.ncrRepeat) || 3}회 이상`, '대책 후 재발'],
    ];
  },
};
const RESP = { A: '8D 보고서', B: '간이 대책서', C: '단순 통보' };
// 귀책 판정에 따른 다음 단계 (협력사 → NCR · 사내 → RCA · 미정 → 병행)
function routeOf(d) {
  const v = sevOf(d),
    g = v.grade,
    st = stageOf(d.source),
    S = [],
    iv = d.inv || {},
    ic = d.ica || {};
  const n = d.ncrId && db.ncrs.find((x) => x.id === d.ncrId),
    c =
      d.caseId && typeof czById === 'function'
        ? czById('cases', d.caseId)
        : n && n.caseId && typeof czById === 'function'
          ? czById('cases', n.caseId)
          : null;
  const sc = c ? c.RcaScope || '' : '',
    big = g === 'A' || st >= 4;
  const go = (sec, f) =>
    sec === 'invWrap'
      ? `editInv('${d.id}','${f || ''}')`
      : sec === 'icaWrap'
        ? `editIca('${d.id}')`
        : `editDefect('${d.id}');setTimeout(()=>{const w=document.getElementById('${sec}');if(w){if(w.tagName==='DETAILS')w.open=true;w.scrollIntoView({block:'start'})}${
            f ? `const e=document.querySelector('#mf [name=${f}]');if(e)e.focus();` : ''
          }},150)`;
  const ncrStep = (why) => {
    if (!d.partNo && !n) {
      S.push({
        t: '원인 부품 지정',
        why: 'NCR은 원인 부품 · 협력사 기준으로 발행합니다',
        done: false,
        btn: `editDefect('${d.id}')`,
        bl: '지정',
        rec: true,
        warn: true,
      });
      return;
    }
    S.push({
      t: `NCR 발행 — ${RESP[g]} 요구`,
      why,
      done: !!n,
      doneT: n ? `${n.no} · ${ncrStatus(n)}` : '',
      btn: n ? `editNcr('${n.id}')` : `ncrFromDefect('${d.id}')`,
      bl: n ? 'NCR 열기' : 'NCR 발행',
      rec: g !== 'C',
    });
  };
  const rcaStep = (t, why, rec, need) =>
    S.push({
      t,
      why,
      done: !!c && (!need || sc.includes(need)),
      doneT: c ? `RCA ${c.CaseNo} · ${c.Stage}${sc ? ' · 사내 분석 ' + (CZ_RCA_LBL[sc] || sc) : ''}` : '',
      btn: c ? `czOpenCase('${c.id}','cause')` : `czFromDefect('${d.id}')`,
      bl: c ? 'RCA 열기' : 'RCA 요청',
      rec,
      k: /RCA로 관리$/.test(t) && c ? 'rcaOwn' : 'rca',
    });
  const icaStep = (rec) => {
    const lv = icaLevel(d),
      vi = icaVerify(d);
    S.push({
      t: `사내 대책 — ${lv}`,
      why: '불량 목록 ‘진행 · 다음 할 일’ 칸의 ‘사내 대책’ (A: 8D · B: 간이 대책) · 완료 후 유효성 검증',
      done: !!ic.doneDate,
      doneT: `완료 ${ic.doneDate || ''}${vi ? ' · ' + vi.label : ''}`,
      btn: go('icaWrap'),
      bl: '사내 대책',
      rec,
    });
  };
  if (d.resp === '협력사') {
    ncrStep(g === 'C' ? 'C등급 — 통보 후 다음 입고 LOT 재발 확인' : '협력사에 원인·대책 회신 요구');
    if (st >= 2) {
      const ej = d.escJudge || '';
      S.push({
        t: '수입검사 검출 판정 — 수입검사에서 왜 못 걸렀나',
        why: `${d.source || ''} 단계에서 발견 → ① 샘플링 한계 ② 검사 항목 아님 ③ 검사 누락·오판정 중 선택`,
        done: !!ej,
        doneT: ej === '샘플링 한계' ? '샘플링 한계 — 사내 RCA 없이 협력사 8D에 유출 원인 · 출하검사 대책 요구' : ej,
        btn: go('escRow', 'escJudge'),
        bl: ej ? '변경' : '판정',
        rec: !ej && g !== 'C',
      });
      if (ej && ej !== '샘플링 한계')
        rcaStep(
          `유출 원인 분석 (사내 RCA) — ${ej}`,
          ej === '검사 항목 아님' ? '수입검사 기준서 · 관리계획서에 이 특성 추가 검토' : '검사 방법 · 판정 기준 · 검사원 교육 점검',
          g !== 'C',
          '유출',
        );
    }
  } else if (d.resp === '사내') {
    if (c) rcaStep('사내 대책 — RCA로 관리', '', true, '');
    else if (icaLevel(d) === ICA_NONE)
      S.push({
        t: '사내 대책 불필요 (기록만)',
        why: 'C등급 — 처리 완료일 입력으로 종결, 반복되면 대책 수준을 올리세요',
        done: !!d.doneDate,
        doneT: '처리 완료',
        btn: '',
        rec: false,
      });
    else {
      icaStep(!big);
      rcaStep('큰 건은 RCA로 관리 (RCA 워크시트 · 조치 · 단계 게이트)', big ? 'A등급 · 고객 유출 — RCA 권장' : '필요할 때만', big, '');
    }
  } else if (d.resp === '공동') {
    ncrStep('협력사 몫의 원인 · 대책 회신 요구');
    if (!c) icaStep(true);
    else rcaStep('사내 몫 — RCA로 관리', '', true, '');
    S.push({
      t: '비용 분담 비율 확정',
      why: 'FAR 화면의 협력사 부담 비율 (%)',
      done: iv.share !== '' && iv.share != null,
      doneT: `협력사 ${iv.share}%`,
      btn: go('invWrap', 'inv_share'),
      bl: '입력',
      k: 'far',
      rec: true,
    });
  } else if (d.resp === '고객')
    S.push({
      t: '고객 귀책 — 고객 협의 내용을 실행 기록으로 남기기',
      why: 'NCR · RCA 대상 아님 · 처리 완료일을 넣으면 끝',
      done: !!d.doneDate,
      doneT: '처리 완료',
      btn: '',
      rec: false,
    });
  else {
    const ii = invInfo(d);
    S.push({
      t: '원인(추정) 부품 지정',
      why: '완성품 불량이면 의심 부품을 원인 품번에 넣습니다 (FAR 대상 협력사)',
      done: !!d.partNo,
      doneT: `${d.partNo} ${d.partName || ''} · ${supName(d.supplierId) || '협력사 미지정'}`,
      btn: `editDefect('${d.id}')`,
      bl: '지정',
      rec: !d.partNo,
    });
    S.push({
      t: 'FAR 요청 — 협력사에 원인 분석 요청',
      why: '귀책 인정 요구가 아닌 분석 요청',
      done: !!iv.farReq,
      doneT: ii.label,
      btn: go('invWrap', 'inv_farReq'),
      bl: iv.farReq ? 'FAR 보기' : 'FAR 요청',
      rec: !iv.farReq && !!d.supplierId,
      k: 'far',
    });
    S.push({
      t: '사내 RCA 요청 — 사내 공정 · 취급 원인 분석',
      why: '재현시험 · 측정 · 분해 분석 → 사내 원인이면 공정 개선 · 내부 8D (간단한 건은 귀책 조사 화면의 사내 분석 메모에 기록해도 됩니다)',
      done: !!(iv.rca || '').trim() || !!c,
      doneT: c ? `RCA ${c.CaseNo} · ${c.Stage}` : '귀책 조사에 사내 분석 기록됨',
      btn: c ? `czOpenCase('${c.id}','cause')` : `czFromDefect('${d.id}')`,
      bl: c ? 'RCA 열기' : 'RCA 요청',
      rec: g !== 'C',
      k: 'rca',
    });
    S.push({
      t: '귀책 판정 → 협력사: NCR · 사내: 사내 대책 · 공동: 분담',
      why: `판정·근거가 실패비용 정산 기준 · 기한 ${ntfDue(d)} 지나면 원인 불명 검토`,
      done: !!iv.verdict,
      doneT: iv.verdict,
      btn: go('invWrap', 'inv_verdict'),
      bl: '귀책 판정',
      rec: !!iv.farRecv || !!(iv.rca || '').trim(),
      k: 'far',
    });
  }
  return S;
}
// form=true: 불량 등록 창용 — FAR · RCA 는 넣지 않음 (등록 창은 등록만. FAR · RCA 는 불량 목록의 ‘진행 · 다음 할 일’ 칸과 각 화면에서 시작)
function routeHTML(d, form) {
  if (!d || !d.id) return '';
  let S = routeOf(d);
  if (form) S = S.filter((x) => x.k !== 'far' && x.k !== 'rca').map((x) => (x.k === 'rcaOwn' ? { ...x, btn: '' } : x));
  if (!S.length) return '';
  return `<div class="route"><div class="rh">다음 단계 <span class="muted">귀책 ‘${esc(d.resp || '미정')}’ · 심각도 ${sevOf(d).grade} 기준</span></div>${S.map(
    (x) =>
      `<div class="ri ${x.done ? 'dn' : x.warn ? 'wn' : x.rec ? 'rc' : ''}"><span class="ck">${
        x.done ? '✓' : x.warn ? '!' : x.rec ? '●' : '○'
      }</span><div class="tx"><b>${esc(x.t)}</b><br><span class="muted">${x.done ? esc(x.doneT) : esc(x.why)}</span></div>${
        x.btn ? `<button type="button" class="b s ${x.done ? '' : 'p'}" onclick="routeGo(\`${x.btn}\`)">${x.bl}</button>` : ''
      }</div>`,
  ).join('')}</div>`;
}
async function routeGo(js) {
  if (
    mfDirty &&
    !(await askConfirm({ title: '저장하지 않고 이동할까요?', msg: '먼저 저장하려면 취소 후 저장을 누르세요.', ok: '이동', danger: false }))
  )
    return;
  mfDirty = false;
  if ($('#modal').classList.contains('on') && !/^czFromDefect/.test(js)) closeModal(true);
  runCall(js);
}
// 'fn(\'a\',\'b\')' 형태의 화면 이동 문자열을 eval 없이 실행 (보안 정책상 문자열 코드 실행 금지)
function runCall(js) {
  const m = /^\s*([A-Za-z_$][\w$]*)\(([\s\S]*)\)\s*;?\s*$/.exec(String(js || ''));
  if (!m || typeof window[m[1]] !== 'function') {
    console.warn('runCall: 알 수 없는 호출', js);
    return;
  }
  const args = [...m[2].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|(-?\d+(?:\.\d+)?)|\b(true|false|null)\b/g)].map((a) =>
    a[1] != null
      ? a[1].replace(/\\(.)/g, '$1')
      : a[2] != null
        ? a[2].replace(/\\(.)/g, '$1')
        : a[3] != null
          ? +a[3]
          : a[4] === 'true'
            ? true
            : a[4] === 'false'
              ? false
              : null,
  );
  return window[m[1]](...args);
}
const SEV_CLS = { A: 'svA', B: 'svB', C: 'svC' }; // 심각도 전용 배지 — 지연·요구 유형 색과 구분
// 숫자만 있으면 천 단위 콤마 (예: 10000 → 10,000), 단위·문자가 섞이면 그대로
const fmtQtyTxt = (v) => {
  const t = String(v ?? '').trim();
  if (/^[\d,]+(\.\d+)?$/.test(t)) {
    const [i, f] = t.replace(/,/g, '').split('.');
    return Number(i).toLocaleString('en-US') + (f ? '.' + f : '');
  }
  return t;
};
const lotOf = (d) => (d.delivDate ? d.delivDate.replace(/-/g, '') : d.lot || '');
// 수입검사 검출 판정 — 공정 · 출하 · 고객에서 발견된 협력사 귀책 불량을 수입검사가 왜 못 걸렀나
// 샘플링 한계면 사내 RCA 없이 협력사 8D에 유출 원인 · 출하검사 대책을 요구. 검사 항목 아님 · 누락/오판정만 사내 유출 RCA
const ESC_JUDGE = ['샘플링 한계', '검사 항목 아님', '검사 누락·오판정'];
const escAsk = (d) => !!d && stageOf(d.source) >= 2 && ['협력사', '공동'].includes(d.resp || '협력사');
const escRca = (d) => escAsk(d) && d.escJudge !== '샘플링 한계'; // 판정 전이거나 ②③이면 사내 유출 RCA 대상
// NCR 요구사항의 유출 문구: 0 없음 · 1 유출 원인 · 2 + 출하 전수/자동 검출 (샘플링 한계)
const escLevel = (ds) => (ds.some((d) => escAsk(d) && d.escJudge === '샘플링 한계') ? 2 : ds.some(escAsk) ? 1 : 0);
function stageOf(src) {
  src = src || '';
  return /고객|필드|클레임/.test(src) ? 4 : /출하/.test(src) ? 3 : /공정|라인|조립/.test(src) ? 2 : 1;
}
function impactAuto(type) {
  const v = (db.settings.impactMap || {})[type];
  return v >= 1 && v <= 4 ? v : 2;
}
function scopeAuto(d) {
  const q = num(d.qty),
    i = num(d.inspQty);
  if (q <= 1) return 1;
  if (q >= num(db.settings.ncrQty) || (i && q / i >= 0.1)) return 3;
  return 2;
}
function repeatInfo(d) {
  const S = db.settings;
  if (!d.supplierId || !d.date) return { v: 1, n: 1, re: false };
  const lo = addDays(d.date, -num(S.repeatWindow));
  let pool = db.defects;
  if (sevMemo) {
    if (!repIdx || repIdx.m !== sevMemo) {
      const g = new Map();
      db.defects.forEach((x) => {
        if (!x.date) return;
        const k = x.supplierId + '\u0001' + x.type;
        let a = g.get(k);
        if (!a) g.set(k, (a = []));
        a.push(x);
      });
      repIdx = { m: sevMemo, g };
    }
    pool = repIdx.g.get(d.supplierId + '\u0001' + d.type) || [];
  }
  const same = pool.filter((x) => x.supplierId === d.supplierId && x.type === d.type && x.id !== d.id && x.date && x.date <= d.date && x.date >= lo);
  const n = same.length + 1;
  const re = db.ncrs.some(
    (c) =>
      c.supplierId === d.supplierId &&
      ((c.verifyResult === '유효' && c.verifyDate && c.verifyDate < d.date) ||
        (c.validity === '적정' && c.approvedDate && c.approvedDate < d.date)) &&
      !(c.defectIds || []).includes(d.id) &&
      (c.defectIds || []).some((i) => {
        const x = defById(i);
        return x && x.id !== d.id && x.type === d.type && (!d.partNo || x.partNo === d.partNo);
      }),
  );
  return { v: re ? 4 : n >= num(S.ncrRepeat) ? 3 : n === 2 ? 2 : 1, n, re };
}
let sevMemo = null,
  defIdx = null,
  repIdx = null,
  pcMemo = null;
const defById = (i) => {
  if (sevMemo) {
    if (!defIdx || defIdx.m !== sevMemo) defIdx = { m: sevMemo, map: new Map(db.defects.map((y) => [y.id, y])) };
    return defIdx.map.get(i);
  }
  return db.defects.find((y) => y.id === i);
};
function sevCalc(d) {
  const sv = d.sev || {},
    S = db.settings,
    rp = repeatInfo(d);
  const f = { impact: sv.impact || impactAuto(d.type), stage: stageOf(d.source), scope: sv.scope || scopeAuto(d), repeat: rp.v };
  const score = f.impact + f.stage + f.scope + f.repeat;
  const forced = [];
  if (sv.special) forced.push('특별특성(CC/SC)');
  if (f.stage === 4) forced.push('고객 클레임');
  if (rp.re) forced.push('대책 후 재발');
  if (f.impact === 4) forced.push('안전·법규·기능 상실');
  const auto = forced.length ? 'A' : score >= num(S.sevA) ? 'A' : score >= num(S.sevB) ? 'B' : 'C';
  return { f, score, forced, auto, rp };
}
// 완료됐거나 NCR이 발행된 불량은 그 시점 등급을 고정(sevLock) — 이후 기준 변경·과거 데이터 추가로 등급이 바뀌지 않음
function sevOf(d) {
  if (sevMemo && sevMemo.has(d)) return sevMemo.get(d);
  const sv = d.sev || {};
  const c =
    d.sevLock && d.sevLock.f
      ? { ...d.sevLock, rp: { v: d.sevLock.f.repeat, n: d.sevLock.rn || 1, re: (d.sevLock.forced || []).includes('대책 후 재발') } }
      : sevCalc(d);
  const grade = ['A', 'B', 'C'].includes(sv.override) ? sv.override : c.auto;
  const r = {
    f: c.f,
    score: c.score,
    forced: c.forced || [],
    auto: c.auto,
    grade,
    overridden: grade !== c.auto,
    reason: sv.reason || '',
    resp: RESP[grade],
    rp: c.rp,
    locked: !!d.sevLock,
  };
  if (sevMemo) sevMemo.set(d, r);
  return r;
}
function lockSev() {
  db.defects.forEach((d) => {
    const fin = d.closed || d.doneDate || d.status === '완료' || !!d.ncrId;
    if (d.sevLock && !fin) {
      delete d.sevLock;
      return;
    }
    if (!d.sevLock && fin) {
      const c = sevCalc(d);
      d.sevLock = { f: c.f, score: c.score, forced: c.forced, auto: c.auto, rn: c.rp.n, at: today() };
    }
  });
}
const sevBadge = (d, short) => {
  const v = sevOf(d);
  return `<span class="bg ${SEV_CLS[v.grade]}" title="${esc(
    `${v.score}점${v.forced.length ? ' · 강제 A: ' + v.forced.join(', ') : ''}${
      v.overridden ? ' · 수동 조정(' + v.auto + '→' + v.grade + '): ' + v.reason : ''
    }${v.locked ? ' · 완료/NCR 발행 시점 등급 고정' : ''}`,
  )}">${v.grade}${short ? '' : ' ' + v.score}${v.overridden ? '*' : ''}</span>`;
};
function ncrReasons(d) {
  if (d.closed || (d.resp && d.resp !== '협력사' && d.resp !== '공동')) return [];
  const v = sevOf(d);
  if (v.grade === 'C') return [];
  return [`심각도 ${v.grade} (${v.score}점${v.forced.length ? ' · ' + v.forced.join(', ') : ''}) → ${v.resp}`];
}
// 단순 통보는 회신 · 유효성 검증이 필요 없으므로, 협력사에 통보하면 바로 ‘종결’
// (재발하면 검증 결과에 ‘무효(재발)’을 넣어 ‘검증 무효’로 되돌릴 수 있음)
// 협력사 통보 여부 — 통보일이 있거나, 이미 회신·처리가 진행됐으면 통보한 것으로 봄
const ncrNotified = (n) => !!(n.notifyDate || n.replyDate || n.d3Date || n.validity === '적정' || n.verifyDate);
const NOTIFY_GRACE = 1; // 발행 후 이 일수가 지나도 통보 안 하면 ‘통보 지연’
const notifyLate = (n) => !ncrNotified(n) && !!n.issueDate && today() > addDays(n.issueDate, NOTIFY_GRACE);
const NOTIFY_METHODS = ['메일', '협력사 포털', '공문', '유선', '방문', '기타'];
function ncrStatus(n) {
  if (n.verifyDate && n.verifyResult === '유효') return '종결';
  if (n.verifyDate && String(n.verifyResult || '').startsWith('무효')) return '검증 무효';
  if (!ncrNotified(n)) return '미통보';
  if (n.reqType === '단순 통보') return '종결';
  if (n.validity === '적정') return '승인(검증대기)';
  if (n.replyDate) return n.validity === '보완요청' && !n.resubPending ? '보완요청' : '대책서 검토'; // 보완 대책서를 다시 받았으면(resubPending) 다시 검토 단계
  if (n.requestDate) return '대책요청';
  return '발행';
}
// 종결일 — 유효성 검증일, 단순 통보(검증 없음)는 협력사 통보일
const ncrCloseDate = (n) => (ncrStatus(n) !== '종결' ? '' : n.verifyDate || (n.reqType === '단순 통보' ? n.notifyDate || n.issueDate || '' : ''));
/* ---- 불량 단계 (자동) · 유효성 검증 (별도) ----
   defStage0 = 귀책별 주된 길 (NCR · 사내 대책 · RCA · 귀책 조사) 의 단계.
   defStage  = 그 길이 끝났어도 남은 사내 일 (공동 귀책의 사내 몫 · 유출 원인 분석) 이 있으면 끝난 것으로 보지 않음 (2026-11) */
// 2026-11 에 더한 ‘끝난 것으로 보는 조건’ 은 이 날짜부터 발생한 불량에만 적용 — 그 전에 끝난 기록이 다시 열리지 않게
const RULES_FROM = '2026-11-22';
const newRules = (d) => (d.date || '') >= RULES_FROM;
function defStage(d) {
  const s = defStage0(d);
  return (s.done && !d.closed && newRules(d) && inHouseLeft(d)) || s;
}
// NCR 쪽 (또는 처리) 이 끝난 불량에 남은 사내 일. 없으면 null
function inHouseLeft(d) {
  const r = d.resp || '협력사',
    cs = defCase(d);
  if (r === '공동') {
    // 공동 귀책: 협력사 몫 (NCR) 과 따로, 사내 몫의 대책도 끝나야 함
    if (cs) {
      if (cs.Status !== '종결') return { label: `사내 몫 — RCA ${cs.Stage}`, cls: 'inf' };
    } else {
      const lv = icaLevel(d),
        c = d.ica || {};
      if (lv !== ICA_NONE) {
        if (!c.doneDate) return icaStarted(c) ? { label: `사내 몫 — ${lv} 진행`, cls: 'inf' } : { label: `사내 몫 — ${lv} 필요`, cls: 'bad' };
        if (icaVerify(d)?.k === 'ng') return { label: '재발 — 재대책 필요 (사내 몫)', cls: 'bad' };
      }
    }
  }
  // 유출 원인: 수입검사 뒤 단계에서 찾은 협력사 · 공동 귀책 (A · B 등급) — 검출 판정을 하고, ‘샘플링 한계’ 가 아니면 사내 RCA 가 끝나야 함
  if (escAsk(d) && sevOf(d).grade !== 'C') {
    if (!d.escJudge) return { label: '수입검사 검출 판정 필요', cls: 'warn' };
    if (d.escJudge !== '샘플링 한계') {
      const n = d.ncrId ? db.ncrs.find((x) => x.id === d.ncrId) : null,
        c2 = cs || (n && n.caseId && typeof czById === 'function' ? czById('cases', n.caseId) : null);
      if (!c2) return { label: '유출 원인 분석 필요 (사내 RCA)', cls: 'bad' };
      if (c2.Status !== '종결') return { label: `유출 RCA ${c2.Stage}`, cls: 'inf' };
    }
  }
  return null;
}
function defStage0(d) {
  if (d.closed) return { done: true, label: '완료(수동)', cls: 'ok' };
  const n = d.ncrId ? db.ncrs.find((x) => x.id === d.ncrId) : null;
  if (n) {
    const st = ncrStatus(n);
    if (st === '검증 무효') return { label: '재발 — 재대책 필요', cls: 'bad' };
    if (n.reqType === '단순 통보')
      return ncrNotified(n) && (d.disposition || n.verifyDate)
        ? { done: true, label: '완료(통보)', cls: 'ok' }
        : { label: ncrNotified(n) ? '처리 대기' : 'NCR 통보 전', cls: 'warn' };
    if (st === '종결') return { done: true, label: '완료(검증 종결)', cls: 'ok' };
    // 대책서 승인 = 불량 쪽 일은 끝. NCR 은 유효성 검증이 남아 ‘승인(검증대기)’ — 이름을 NCR 과 맞춤 (예전 ‘완료(대책 승인)’)
    if (n.validity === '적정') return { done: true, label: '대책 승인(검증 대기)', cls: 'ok' };
    return {
      label:
        { 미통보: 'NCR 통보 전', 발행: '대책 요청 전', 대책요청: '대책서 대기', '대책서 검토': '대책서 검토', 보완요청: '대책서 보완' }[st] || st,
      cls: st === '보완요청' ? 'warn' : 'inf',
    };
  }
  if (d.status === '완료') return { done: true, label: '완료', cls: 'ok' };
  if (!d.disposition) return { label: '처리 대기', cls: 'warn' };
  const r = d.resp || '협력사',
    iv = d.inv || {};
  if (r === '미정') {
    if (iv.verdict === '원인 불명') return { done: true, label: '완료(원인 불명)', cls: 'ok' };
    if (d.doneDate && !d.inv && (sevOf(d).grade === 'C' || !newRules(d))) return { done: true, label: '완료', cls: 'ok' }; // C 등급만 조사 없이 끝낼 수 있음
    const ii = invInfo(d);
    return { label: ii.label, cls: ii.cls };
  }
  if (r === '사내' && defCase(d)) {
    const cs = defCase(d);
    return cs.Status === '종결' ? { done: true, label: '완료(RCA 종결)', cls: 'ok' } : { label: `RCA ${cs.Stage}`, cls: 'inf' };
  }
  if (r === '사내') {
    const lv = icaLevel(d);
    if (lv !== ICA_NONE) {
      const c = d.ica || {};
      if (c.doneDate)
        return icaVerify(d)?.k === 'ng' ? { label: '재발 — 재대책 필요', cls: 'bad' } : { done: true, label: '완료(사내 대책)', cls: 'ok' };
      return icaStarted(c) ? { label: `사내 ${lv} 진행`, cls: 'inf' } : { label: `사내 ${lv} 필요`, cls: 'bad' };
    }
  }
  if (r === '공동' && (iv.share === '' || iv.share == null)) return { label: '공동 귀책 — 분담 협의', cls: 'warn' };
  const g = sevOf(d).grade;
  if (g !== 'C' && (r === '협력사' || r === '공동')) return { label: r === '공동' ? 'NCR 발행 필요 (협력사 몫)' : 'NCR 발행 필요', cls: 'bad' };
  if (d.doneDate) return { done: true, label: '완료', cls: 'ok' };
  return { label: '처리 중', cls: 'warn' };
}
/* ---- 귀책 조사 (FAR · 사내 RCA) · 사내 대책 ---- */
const VERDICTS = ['협력사', '사내', '공동', '원인 불명'];
const VERDICT_RESP = { 협력사: '협력사', 사내: '사내', 공동: '공동', '원인 불명': '미정' };
const RESP_OPTS = ['협력사', '사내', '공동', '고객', '미정'];
function addBiz(s, n) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  let k = 0;
  while (k < num(n)) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) k++;
  }
  return fmtD(d);
}
// 귀책 조사가 열려 있음: 귀책 미정이고 판정 전. (C 등급은 조사 없이 처리 완료일만으로 끝낼 수 있음 — A · B 등급은 판정 또는 ‘원인 불명’ 이 필요)
const invOpen = (d) =>
  !d.ncrId && !d.closed && d.resp === '미정' && !(d.inv && d.inv.verdict) && !(d.doneDate && !d.inv && (sevOf(d).grade === 'C' || !newRules(d)));
const ntfDue = (d) => addDays(d.date, num(db.settings.ntfDays) || 30);
function invInfo(d) {
  const iv = d.inv || {};
  if (!iv.farReq) return { k: 'pre', label: '귀책 조사 (FAR 요청 전)', cls: 'warn' };
  if (!iv.farRecv) {
    if (!iv.farDue) return { k: 'far', label: 'FAR 회신 대기', cls: 'inf' };
    const x = diffDays(today(), iv.farDue);
    return x < 0 ? { k: 'far', label: `FAR 회신 지연 D+${-x}`, cls: 'bad', late: true } : { k: 'far', label: `FAR 회신 대기 D-${x}`, cls: 'inf' };
  }
  return { k: 'judge', label: '귀책 판정 대기', cls: 'inf' };
}
const ICA_NONE = '불필요(기록만)',
  ICA_LV = ['8D', '간이 대책', ICA_NONE];
const icaLevelAuto = (d) => {
  const g = sevOf(d).grade;
  return g === 'A' ? '8D' : g === 'B' ? '간이 대책' : ICA_NONE;
};
const icaLevel = (d) => (d.ica && ICA_LV.includes(d.ica.level) ? d.ica.level : icaLevelAuto(d));
const ICA_KEYS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'];
const icaStarted = (c) => !!c && ICA_KEYS.some((k) => (c[k] || '').trim());
const ICA_STD = [
  ['fmea', 'FMEA'],
  ['cp', '관리계획서(CP)'],
  ['ws', '작업표준'],
  ['insp', '검사기준'],
];
function icaVerify(d) {
  const c = d && d.ica;
  if (!c || !c.doneDate) return null;
  if (c.verifyDate && c.verifyResult === '유효') return { k: 'ok', label: '검증 완료', cls: 'ok' };
  if (c.verifyDate && String(c.verifyResult || '').startsWith('무효')) return { k: 'ng', label: '재발(검증 무효)', cls: 'bad' };
  if (!c.verifyDue) return { k: 'wait', label: '검증 대기', cls: 'mut' };
  const x = diffDays(today(), c.verifyDue);
  return x < 0 ? { k: 'late', label: `검증 지연 D+${-x}`, cls: 'bad' } : { k: 'wait', label: `검증 대기 D-${x}`, cls: x <= 3 ? 'warn' : 'mut' };
}
const defCase = (d) => (d && d.caseId && typeof czById === 'function' ? czById('cases', d.caseId) : null);
// 사내 대책이 필요한 불량: 사내 귀책 (NCR 없음) · 공동 귀책 (NCR 이 있어도 사내 몫은 따로)
const icaNeed = (d) =>
  !d.closed && icaLevel(d) !== ICA_NONE && !defCase(d) && ((d.resp === '사내' && !d.ncrId) || (d.resp === '공동' && newRules(d)));
const isDone = (d) => defStage(d).done;
// A3 보고서는 결과 보고용 — 건이 종결된 뒤에만 출력 (2026-11). 건의 종결 = 가장 위의 기록이 끝남:
// RCA 가 있으면 RCA 종결, RCA 가 없고 NCR 이 있으면 NCR 종결, NCR 도 없으면 불량 처리 완료. 출력은 진행 현황의 전체 이력에서
function a3Ready(B) {
  if (B.rca) return B.rca.Status === '종결' ? '' : 'RCA 종결 뒤에 출력할 수 있습니다';
  if (B.ncr)
    return ncrStatus(B.ncr) !== '종결'
      ? 'NCR 종결 뒤에 출력할 수 있습니다'
      : B.defs.every(isDone)
        ? ''
        : '연결된 불량의 처리가 끝난 뒤에 출력할 수 있습니다';
  return B.defs.length && B.defs.every(isDone) ? '' : '불량 처리가 완료된 뒤에 출력할 수 있습니다';
}
function verifyInfo(n) {
  if (!n) return null;
  if (n.reqType === '단순 통보' && !n.verifyDate) return null; // 단순 통보는 유효성 검증 대상이 아님
  if (n.verifyDate && n.verifyResult === '유효') return { k: 'ok', label: '검증 완료', cls: 'ok' };
  if (n.verifyDate && String(n.verifyResult || '').startsWith('무효')) return { k: 'ng', label: '재발(검증 무효)', cls: 'bad' };
  const due = n.verifyDue;
  if (!due) return { k: 'wait', label: '검증 대기', cls: 'mut' };
  const x = diffDays(today(), due);
  return x < 0 ? { k: 'late', label: `검증 지연 D+${-x}`, cls: 'bad' } : { k: 'wait', label: `검증 대기 D-${x}`, cls: x <= 3 ? 'warn' : 'mut' };
}
function stageBadges(d) {
  const s = defStage(d),
    n = d.ncrId ? db.ncrs.find((x) => x.id === d.ncrId) : null,
    v = s.done ? (n ? verifyInfo(n) : icaVerify(d)) : null,
    vd = n ? n.verifyDue : d.ica && d.ica.verifyDue;
  return `<span class="bg ${s.cls}">${esc(s.label)}</span>${
    v ? `<br><span class="bg ${v.cls}" style="font-size:11px" title="유효성 검증 기한 ${esc(vd || '-')}">${esc(v.label)}</span>` : ''
  }`;
}
function ncrSteps(n) {
  const t = today(),
    info = n.reqType === '단순 통보',
    st = ncrStatus(n),
    closed = st === '종결';
  const S = [
    { l: '발행', d: n.issueDate, done: true },
    {
      l: '협력사 통보',
      d: n.notifyDate || (ncrNotified(n) ? '' : addDays(n.issueDate || today(), NOTIFY_GRACE)),
      done: ncrNotified(n) || closed,
      due: !ncrNotified(n) && n.issueDate ? addDays(n.issueDate, NOTIFY_GRACE) : '',
    },
  ];
  if (!info) {
    S.push({ l: 'D3 봉쇄', d: n.d3Date || n.d3Due, done: !!n.d3Date || !!n.replyDate, due: !n.d3Date && n.d3Due, skip: !n.d3Date && !n.d3Due });
    S.push({ l: '대책서 회신', d: n.replyDate || n.dueDate, done: !!n.replyDate, due: !n.replyDate && n.dueDate });
    {
      const ad = n.replyDate && !n.validity ? addDays(n.replyDate, num(db.settings.approveDays) || 3) : '';
      S.push({ l: '대책 승인', d: n.approvedDate || ad, done: n.validity === '적정', due: n.validity === '적정' ? '' : ad });
    }
    S.push({
      l: '유효성 검증',
      d: n.verifyDate || n.verifyDue,
      done: !!(n.verifyDate && n.verifyResult === '유효'),
      due: !n.verifyDate && n.verifyDue,
    });
  }
  S.push({ l: '종결', d: ncrCloseDate(n), done: closed });
  let cur = S.findIndex((x) => !x.done && !x.skip);
  if (cur < 0) cur = S.length;
  S.forEach((x, i) => {
    x.state = i < cur || x.done ? 'past' : i === cur ? 'cur' : '';
    x.late = !x.done && x.due && t > x.due;
  });
  return { S, cur, closed, bad: st === '검증 무효' };
}
// 단계 → NCR 창의 화면(mode) · 탭. 창 위쪽의 단계 줄을 누르면 그 단계의 화면으로 감
const NCR_STEP_GO = {
  발행: ['issue', 'a'],
  '협력사 통보': ['issue', 't'],
  'D3 봉쇄': ['reply', 'b'],
  '대책서 회신': ['reply', 'r'],
  '대책 승인': ['reply', 'r'],
  '유효성 검증': ['verify', 'c'],
  종결: ['verify', 'c'],
};
// nav=true: NCR 창용 — 단계가 단추가 되고(누르면 그 단계의 화면), 오른쪽 끝에 ‘진행 기록’ 단추
function ncrTrack(n, nav) {
  const r = ncrSteps(n),
    tag = nav ? 'button' : 'div',
    lg = (n.logs || []).length;
  const bar = `<div class="qtrack${r.closed ? ' closed' : ''}${r.bad ? ' bad' : ''}${nav ? ' nav' : ''}" style="grid-template-columns:repeat(${r.S.length},minmax(0,1fr))">${r.S.map(
    (x) =>
      `<${tag}${
        nav
          ? ` type="button" data-m="${(NCR_STEP_GO[x.l] || ['issue'])[0]}" onclick="ncrMode('${(NCR_STEP_GO[x.l] || ['issue', 'a']).join("','")}')"`
          : ''
      } class="${x.state}${x.late ? ' late' : ''}${x.skip ? ' skip' : ''}">${x.l}<b>${
        x.d ? (x.due && !x.done ? '기한 ' : '') + esc(String(x.d).slice(5)) : '–'
      }${
        x.state === 'cur' && x.due && !x.done
          ? (() => {
              const k = diffDays(today(), x.due);
              return k < 0 ? ` · D+${-k} 초과` : k === 0 ? ' · 오늘' : ` · D-${k}`;
            })()
          : x.late
            ? ' 초과'
            : ''
      }</b></${tag}>`,
  ).join('')}</div>`;
  return nav
    ? `<div class="qnav" id="ncrNav">${bar}<button type="button" class="b qlog" data-t="d" onclick="ncrTab('d')">진행 기록${
        lg ? ` <span class="mono">${lg}</span>` : ''
      }</button></div>`
    : bar;
}
function ncrMini(n) {
  const r = ncrSteps(n);
  return `<div class="qsteps${r.closed ? ' done' : ''}">${r.S.slice(1)
    .map((x, i) => `<i class="${i + 1 < r.cur || x.done ? 'on' : ''}"></i>`)
    .join('')}</div>`;
}
const NCR_BASIS = ['불량', '공정 감사', 'PPM 초과', '기타'];
const AUDIT_TYPES = ['정기 공정 감사', '특별 감사', '제품 감사', '시스템 감사'];
const isSysBasis = (n) => n && (n.basis === '공정 감사' || n.basis === 'PPM 초과');
/* 입고: db.receipts에 두 종류 — 월 합계(직접 입력 · 월별 가져오기)와 입고 내역 줄(kind:'line', MES 거래명세서현황).
   같은 협력사 · 같은 달에 내역 줄이 있으면 그 합계를 쓰고 월 합계 값은 무시 (이중 집계 방지) */
const isLine = (r) => r && r.kind === 'line';
function rcvSum(sid, m) {
  const L = db.receipts.filter((r) => r.supplierId === sid && r.month === m),
    has = L.some(isLine);
  return L.filter((r) => (has ? isLine(r) : !isLine(r))).reduce((a, r) => a + num(r.qty), 0);
}
function rcvSumRange(sid, mf, mt) {
  const ms = new Set(db.receipts.filter((r) => r.supplierId === sid && r.month >= mf && r.month <= mt).map((r) => r.month));
  let t = 0;
  ms.forEach((m) => (t += rcvSum(sid, m)));
  return t;
}
const rcvHasLines = (sid, m) => db.receipts.some((r) => isLine(r) && r.supplierId === sid && r.month === m);
// PPM 에 넣는 불량: 협력사 · 공동 귀책 (귀책을 안 넣은 것 포함). 귀책 미정은 판정 전까지 빠짐
const ppmCounts = (d) => !d.resp || d.resp === '협력사' || d.resp === '공동';
// PPM 에 넣는 수량: 공동 귀책은 협력사 분담 비율만큼 (설정 ppmJoint = 0 이면 전량 · 분담 비율이 비어 있으면 전량)
const ppmQty = (d) =>
  num(d.qty) * (d.resp === '공동' && num(db.settings.ppmJoint ?? 1) && d.inv && d.inv.share !== '' && d.inv.share != null ? shareOf(d) : 1);
// 협력사 월별 PPM: 협력사·공동 귀책 불량수량 ÷ 그 달 입고수량 (협력사 품질 표와 같은 기준)
function supMonthPpm(sid, m) {
  const rcv = rcvSum(sid, m);
  const q = db.defects.filter((d) => d.supplierId === sid && (d.date || '').startsWith(m) && ppmCounts(d)).reduce((a, d) => a + ppmQty(d), 0);
  return { m, rcv, q, ppm: rcv ? (q / rcv) * 1e6 : null };
}
function ppmRange(sid, from, to) {
  if (!sid || !from || !to || from > to) return null;
  const ms = [];
  let m = from;
  for (let i = 0; i < 36 && m <= to; i++) {
    ms.push(m);
    m = nextMonth(m);
  }
  const rows = ms.map((x) => supMonthPpm(sid, x)),
    rcv = rows.reduce((a, r) => a + r.rcv, 0),
    q = rows.reduce((a, r) => a + r.q, 0);
  return { rows, rcv, q, ppm: rcv ? (q / rcv) * 1e6 : null };
}
function nextMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
const ppmTxt = (v) => (v == null ? '-' : Math.round(v).toLocaleString());
// 최근 완료된 N개월 연속으로 기준 PPM을 넘은 협력사 (같은 기간 이후 PPM 근거 NCR이 이미 있으면 제외)
function ppmScarRecs() {
  const S = db.settings,
    lim = num(S.ppmScar),
    N = Math.max(1, num(S.ppmScarMonths) || 3);
  if (!lim) return [];
  const prev = lastMonths(today().slice(0, 7), 2)[0],
    ms = lastMonths(prev, N);
  return db.suppliers
    .map((s) => {
      const rows = ms.map((m) => supMonthPpm(s.id, m));
      if (!rows.every((r) => r.ppm != null && r.ppm > lim)) return null;
      if (db.ncrs.some((n) => n.supplierId === s.id && n.basis === 'PPM 초과' && (n.issueDate || '') >= ms[0] + '-01')) return null;
      return { s, rows, from: ms[0], to: ms[ms.length - 1] };
    })
    .filter(Boolean);
}
function ppmScarPreset(sid) {
  const r = ppmScarRecs().find((x) => x.s.id === sid);
  if (!r) return null;
  const S = db.settings,
    tot = ppmRange(sid, r.from, r.to);
  return {
    supplierId: sid,
    basis: 'PPM 초과',
    reqType: '8D 보고서',
    ppmFrom: r.from,
    ppmTo: r.to,
    ppmVal: tot && tot.ppm != null ? Math.round(tot.ppm) : '',
    ppmTarget: num(S.ppmScar),
    ppmDetail: r.rows.map((x) => `${x.m}: ${ppmTxt(x.ppm)} PPM (불량 ${x.q.toLocaleString()} / 입고 ${x.rcv.toLocaleString()})`).join('\n'),
    title: `PPM 목표 초과 (${r.from}~${r.to}, 기준 ${num(S.ppmScar).toLocaleString()} PPM)`,
  };
}
function ppmScarIssue(sid) {
  const p = ppmScarPreset(sid);
  if (p) editNcr(null, p);
}
function applyBasis(changed) {
  const f = $('#mf');
  if (!f || !f.basis) return;
  const b = f.basis.value;
  const a = $('#auditBox'),
    pp = $('#ppmBox');
  if (a) a.style.display = b === '공정 감사' ? '' : 'none';
  if (pp) pp.style.display = b === 'PPM 초과' ? '' : 'none';
  if (changed && (b === '공정 감사' || b === 'PPM 초과') && f.reqType.value !== '8D 보고서') {
    f.reqType.value = '8D 보고서';
    applyReqType(true);
  }
  const h = $('#basisHint');
  if (h)
    h.textContent =
      b === '공정 감사'
        ? '불량 없이 감사 지적으로 시정조치(8D)를 요구합니다'
        : b === 'PPM 초과'
          ? '불량 한 건이 아니라 기간 PPM 실적으로 품질 개선 대책(8D)을 요구합니다'
          : '';
}
function ppmFill() {
  const f = $('#mf');
  if (!f) return;
  const sid = f.supplierId.value,
    from = f.ppmFrom.value,
    to = f.ppmTo.value;
  if (!sid) {
    toast('협력사를 먼저 선택하세요');
    return;
  }
  if (!from || !to || from > to) {
    toast('대상 기간(시작·끝 월)을 확인하세요');
    return;
  }
  const r = ppmRange(sid, from, to);
  if (!r || !r.rcv) {
    toast('해당 기간 입고수량이 없습니다 — 협력사 품질 탭에서 입고수량을 먼저 입력하세요');
    return;
  }
  f.ppmVal.value = Math.round(r.ppm);
  if (!f.ppmTarget.value) f.ppmTarget.value = num(db.settings.ppmScar) || '';
  f.ppmDetail.value = r.rows.map((x) => `${x.m}: ${ppmTxt(x.ppm)} PPM (불량 ${x.q.toLocaleString()} / 입고 ${x.rcv.toLocaleString()})`).join('\n');
  mfDirty = true;
  toast(`기간 PPM ${Math.round(r.ppm).toLocaleString()} 계산됨`);
}
function basisTpl(f) {
  const b = f.basis && f.basis.value;
  if (b === '공정 감사')
    return [
      `1. 감사 일자 / 구분 : ${f.auditDate.value || ''} / ${f.auditType.value || ''}`,
      `2. 감사 번호·보고서 : ${f.auditRef.value || ''}`,
      `3. 지적 내용 (What) : ${f.finding.value || ''}`,
      `4. 관련 기준·요구사항 : `,
      `5. 요구 사항 : 지적 사항의 원인 분석 및 시정조치(8D) 제출`,
    ].join('\n');
  if (b === 'PPM 초과') {
    const top = (() => {
      const sid = f.supplierId.value,
        fr = f.ppmFrom.value,
        to = f.ppmTo.value;
      if (!sid || !fr || !to) return '';
      const m = {};
      db.defects
        .filter(
          (d) =>
            d.supplierId === sid &&
            d.date &&
            d.date.slice(0, 7) >= fr &&
            d.date.slice(0, 7) <= to &&
            (!d.resp || d.resp === '협력사' || d.resp === '공동'),
        )
        .forEach((d) => {
          const k = d.type || '기타';
          m[k] = (m[k] || 0) + num(d.qty);
        });
      return Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, v]) => `${k} ${v.toLocaleString()}EA`)
        .join(', ');
    })();
    return [
      `1. 대상 기간 : ${f.ppmFrom.value || ''} ~ ${f.ppmTo.value || ''}`,
      `2. 기간 PPM 실적 / 목표 : ${f.ppmVal.value ? Number(f.ppmVal.value).toLocaleString() : ''} PPM / ${
        f.ppmTarget.value ? Number(f.ppmTarget.value).toLocaleString() : ''
      } PPM`,
      `3. 월별 실적 :\n${f.ppmDetail.value || ''}`,
      `4. 주요 불량 유형 : ${top}`,
      `5. 요구 사항 : PPM 개선 대책서(8D) 및 월별 개선 목표 제출`,
    ].join('\n');
  }
  return '';
}
const CONTAIN_DEF = ['협력사 완제품', '협력사 공정 재공', '운송 중', '당사 재고'];
function d3DefaultDue(req) {
  return req ? addDays(req, num(db.settings.d3Days) || 1) : '';
}
function ncrRejects(n) {
  let k = 0;
  try {
    k = (n.evals || []).filter((e) => evalDone(e) && evalVerdict(e) !== '승인').length;
  } catch (e) {}
  return (
    k +
    (String(n.verifyResult || '').startsWith('무효') ? 1 : 0) +
    (n.verifyHist || []).filter((h) => String(h.result || '').startsWith('무효')).length
  );
}
// 검증 무효(재발) → 재대책 요청: 이번 검증 기록은 이력으로 남기고, 협력사에 대책서를 다시 요청한 상태로 되돌림
async function ncrRework(id) {
  const n = db.ncrs.find((x) => x.id === id);
  if (!n || !String(n.verifyResult || '').startsWith('무효')) return;
  if (
    mfDirty &&
    !(await askConfirm({ title: '저장하지 않은 변경이 있습니다', msg: '먼저 저장하려면 취소 후 저장을 누르세요.', ok: '계속', danger: false }))
  )
    return;
  if (
    !(await askConfirm({
      title: `${n.no} 재대책을 요청할까요?`,
      items: [
        '이번 검증 결과(무효)와 검증 LOT는 이력으로 남깁니다',
        '대책서 회신 · 승인을 비우고 오늘 날짜로 대책서를 다시 요청합니다',
        '에스컬레이션 횟수에 계속 포함됩니다',
      ],
      ok: '재대책 요청',
      danger: false,
    }))
  )
    return;
  n.verifyHist = (n.verifyHist || []).concat([
    {
      date: n.verifyDate || today(),
      result: n.verifyResult,
      vlots: n.vlots || [],
      approvedDate: n.approvedDate || '',
      replyDate: n.replyDate || '',
      at: today(),
    },
  ]);
  n.verifyDate = '';
  n.verifyResult = '';
  n.vlots = [];
  n.validity = '';
  delete n.approvedDate;
  n.replyDate = '';
  n.requestDate = today();
  n.dueDate = addDays(n.requestDate, typeDays(n.reqType));
  n.verifyDue = '';
  delete n._vdAuto;
  touch(n);
  save();
  closeModal(true);
  render();
  toast(`${n.no} 재대책 요청 — 회신 기한 ${n.dueDate}`);
  editNcr(id, null, 'reply');
}
function ncrEsc(n) {
  return ncrStatus(n) !== '종결' && ncrRejects(n) >= (num(db.settings.escCount) || 2);
}
const escB = (n) =>
  ncrEsc(n)
    ? `<span class="bg bad" title="대책서 보완요청·반려 및 검증 무효 횟수 (기준 ${num(db.settings.escCount) || 2}회)">에스컬레이션 ${ncrRejects(n)}회</span>`
    : '';
function ncrFlags(n) {
  const t = today(),
    st = ncrStatus(n),
    S = db.settings,
    info = n.reqType === '단순 통보';
  return {
    requestLate: notifyLate(n),
    d3Late: !info && ncrNotified(n) && !!(n.d3Due && !n.d3Date && !n.replyDate && t > n.d3Due),
    replyLate: !info && ncrNotified(n) && !!(n.requestDate && !n.replyDate && n.dueDate && t > n.dueDate),
    verifyLate: !!(st === '승인(검증대기)' && n.verifyDue && t > n.verifyDue),
    verifySoon: !!(st === '승인(검증대기)' && n.verifyDue && t <= n.verifyDue && diffDays(t, n.verifyDue) <= 3),
    farLate: farState(n) === '지연',
    rework: st === '검증 무효',
  };
}
const ST_CLS = {
  미통보: 'warn',
  발행: 'mut',
  대책요청: 'inf',
  보완요청: 'warn',
  '대책서 검토': 'inf',
  '승인(검증대기)': 'ok',
  '검증 무효': 'bad',
  유효성검증: 'inf',
  종결: 'ok',
  진행: 'warn',
  완료: 'ok',
};
const stB = (s) => `<span class="bg ${ST_CLS[s] || 'mut'}">${esc(s)}</span>`;
function dday(due, done) {
  if (!due) return '<span class="muted">-</span>';
  if (done) return `<span class="muted">${due}</span>`;
  const d = diffDays(today(), due);
  const cls = d < 0 ? 'bad' : d <= 2 ? 'warn' : 'mut';
  return `${due} <span class="bg ${cls}">${d < 0 ? 'D+' + -d : d === 0 ? 'D-day' : 'D-' + d}</span>`;
}
/* ---- 문서번호: 설정 › 문서번호의 형식 · 일련번호 초기화 기준으로 발행 ---- */
const DOCNO = {
  ncr: { label: 'NCR', key: 'ncrFormat', rk: 'ncrReset', def: 'NCR-{YY}{MM}-{SEQ3}' },
  rca: { label: 'RCA', key: 'rcaFormat', rk: 'rcaReset', def: 'RCA-{YYYY}{MM}{DD}-{SEQ4}' },
  i8d: { label: '사내 8D', key: 'i8dFormat', rk: 'i8dReset', def: 'I8D-{YYYY}{MM}{DD}-{SEQ4}' },
  iss: { label: '이슈', key: 'issFormat', rk: 'issReset', def: 'ISS-{YY}{MM}-{SEQ3}' },
};
const DOC_RESETS = [
  ['auto', '형식에 따름'],
  ['year', '매년'],
  ['month', '매월'],
  ['day', '매일'],
  ['none', '초기화 안 함'],
];
function fmtNo(f, date) {
  return f
    .replace(/\{YYYY\}/g, date.slice(0, 4))
    .replace(/\{YYY\}/g, date.slice(1, 4))
    .replace(/\{YY\}/g, date.slice(2, 4))
    .replace(/\{MM\}/g, date.slice(5, 7))
    .replace(/\{DD\}/g, date.slice(8, 10));
}
function docFmt(k) {
  const d = DOCNO[k];
  let f = String(db.settings[d.key] || d.def).trim();
  if (!/\{SEQ\d\}/.test(f)) f += '-{SEQ3}';
  return f;
}
function docReset(k, f) {
  let r = db.settings[DOCNO[k].rk] || (k === 'ncr' || k === 'iss' ? 'auto' : 'none');
  if (r === 'auto') r = /\{DD\}/.test(f) ? 'day' : /\{MM\}/.test(f) ? 'month' : /\{Y{2,4}\}/.test(f) ? 'year' : 'none';
  return r;
}
const docPer = (d, r) => (r === 'day' ? d.slice(0, 10) : r === 'month' ? d.slice(0, 7) : r === 'year' ? d.slice(0, 4) : '');
function docRegex(f) {
  const W = { YYYY: 4, YYY: 3, YY: 2, MM: 2, DD: 2 },
    re = /\{(YYYY|YYY|YY|MM|DD|SEQ\d)\}/g,
    q = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let src = '',
    i = 0,
    m,
    first = true;
  while ((m = re.exec(f))) {
    src += q(f.slice(i, m.index));
    src += m[1].startsWith('SEQ') ? (first ? ((first = false), '(\\d+)') : '\\d+') : `\\d{${W[m[1]]}}`;
    i = re.lastIndex;
  }
  return new RegExp('^' + src + q(f.slice(i)) + '$');
}
function genDocNo(k, date) {
  date = date || today();
  const f = docFmt(k),
    r = docReset(k, f),
    rx = docRegex(f),
    pk = docPer(date, r),
    w = +/\{SEQ(\d)\}/.exec(f)[1];
  const recs =
    k === 'ncr'
      ? db.ncrs.map((n) => [n.no, n.issueDate])
      : k === 'iss'
        ? (db.issues || []).map((i) => [i.no, String(i.at || '').slice(0, 10)])
        : db.cases.map((c) => [c.CaseNo, c.Created]);
  let mx = 0;
  recs.forEach(([no, d]) => {
    const m = rx.exec(no || '');
    if (m && docPer(String(d || ''), r) === pk) mx = Math.max(mx, parseInt(m[1]) || 0);
  });
  if ((k === 'rca' || k === 'i8d') && r === 'none') mx = Math.max(mx, num(db.meta.caseSeq)); // 지운 RCA 번호를 다시 쓰지 않음
  const used = new Set(recs.map((x) => x[0]));
  let no;
  do {
    mx++;
    no = fmtNo(f, date).replace(/\{SEQ\d\}/g, String(mx).padStart(w, '0'));
  } while (used.has(no));
  return { no, seq: mx };
}
function genNcrNo(date) {
  return genDocNo('ncr', date).no;
}
