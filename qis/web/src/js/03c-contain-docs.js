// ── 공통 부품 — 봉쇄 · 재고 처리 표 / 표준화 문서 표 ──
// 불량 창 · NCR 창 · RCA 가 같은 표를 씀. 여기를 고치면 세 곳이 같이 바뀜.

/* 1. 봉쇄 · 재고 처리 표 — 줄: { loc 위치, target 대상, sorted 선별, ng 불량, act 처리, done 완료일 } */
const CT_ACT = ['', '선별 중', '선별', '재작업', '폐기', '반품', '특채'];
const CT_DEF_IN = ['당사 재고', '생산 라인', '협력사 재고'];
const CT_DEF_CASE = ['사내 재고', '재공', '이송 중', '고객처'];
const ctRow = (r) => ({
  loc: r.loc || '',
  target: r.target ?? '',
  sorted: r.sorted ?? '',
  ng: r.ng ?? '',
  act: r.act || '',
  done: r.done || '',
});
const ctUsed = (r) => !!(String(r.target ?? '') !== '' || String(r.sorted ?? '') !== '' || String(r.ng ?? '') !== '' || r.done || r.act);
// 저장 · 계산에 쓰는 줄 (빈 줄은 뺌)
const ctClean = (rows) => (rows || []).map(ctRow).filter(ctUsed);
function ctTot(rows) {
  const t = (k) => (rows || []).reduce((a, r) => a + numC(r[k]), 0),
    T = t('target'),
    S = t('sorted');
  return { T, S, N: t('ng'), left: Math.max(0, T - S) };
}
const ctSumText = (rows) => {
  const r = ctClean(rows);
  if (!r.length) return '';
  const o = ctTot(r);
  return `대상 ${o.T.toLocaleString()} · 선별 ${o.S.toLocaleString()} · 불량 ${o.N.toLocaleString()} · 남음 ${o.left.toLocaleString()} EA`;
};
const ctFootHTML = (rows) => {
  const o = ctTot(rows);
  return `<tr><td><b>합계</b></td><td style="padding-left:12px">${o.T.toLocaleString()}</td>
    <td style="padding-left:12px">${o.S.toLocaleString()}</td>
    <td style="padding-left:12px">${o.N.toLocaleString()}</td><td colspan="3" class="muted" style="font-size:12px">${
      o.T ? `남음 ${o.left.toLocaleString()} EA` : ''
    }</td></tr>`;
};
const CT_HEAD = '<th>위치</th><th>대상 (EA)</th><th>선별 (EA)</th><th>불량 (EA)</th><th>처리</th><th>완료일</th>';
// 고치는 표. mode: 'form' = 창 (curContain · 저장 단추로 저장) / 'case' = RCA (바꾸면 바로 저장)
function ctEditHTML(rows, mode) {
  const ev = (i, k) =>
    mode === 'case'
      ? `onchange="czCtSet(${i},'${k}',this.value)"`
      : `oninput="curContain[${i}].${k}=this.value;mfDirty=true${['target', 'sorted', 'ng'].includes(k) ? ';containFoot()' : ''}"`;
  const del = (i) => (mode === 'case' ? `czCtDel(${i})` : `curContain.splice(${i},1);mfDirty=true;renderContain()`);
  return `<table class="ct ctb" style="margin-top:4px"><thead><tr>${CT_HEAD}<th></th></tr></thead><tbody>${rows
    .map(
      (r, i) => `<tr>
    <td><input value="${esc(r.loc)}" style="width:140px" placeholder="예: 협력사 창고" ${ev(i, 'loc')}></td>
    ${['target', 'sorted', 'ng']
      .map((k) => `<td><input value="${esc(r[k])}" style="width:90px" inputmode="numeric" data-ct="${k}" ${ev(i, k)}></td>`)
      .join('')}
    <td><select data-ct="act" ${ev(i, 'act').replace('oninput', 'onchange')}>${CT_ACT.map(
      (a) => `<option value="${a}" ${a === r.act ? 'selected' : ''}>${a || '-'}</option>`,
    ).join('')}</select></td>
    <td><input type="date" value="${esc(r.done)}" ${ev(i, 'done')}></td>
    <td><button type="button" class="b s d" title="이 줄 지우기" onclick="${del(i)}">✕</button></td></tr>`,
    )
    .join('')}</tbody>
    <tfoot id="containFoot">${ctFootHTML(rows)}</tfoot></table>`;
}
// 보기만 하는 표
function ctViewHTML(rows) {
  const r = ctClean(rows);
  if (!r.length) return '<div class="muted" style="font-size:12px;padding:6px 0">입력한 줄이 없습니다</div>';
  return `<table class="ct ctb ctro" style="margin-top:4px"><thead><tr>${CT_HEAD}</tr></thead><tbody>${r
    .map(
      (x) =>
        `<tr><td>${esc(x.loc)}</td><td>${esc(x.target)}</td><td>${esc(x.sorted)}</td><td>${esc(x.ng)}</td><td>${esc(x.act || '-')}</td><td>${esc(x.done || '-')}</td></tr>`,
    )
    .join('')}</tbody><tfoot>${ctFootHTML(r).replace('colspan="3"', 'colspan="2"')}</tfoot></table>`;
}
// 인쇄용 표
function ctPrintHTML(rows) {
  const r = ctClean(rows);
  if (!r.length) return '';
  return `<table class="sm"><tr><th>재고 위치</th><th>대상 (EA)</th><th>선별 (EA)</th><th>불량 (EA)</th><th>처리</th><th>완료일</th></tr>${r
    .map(
      (x) =>
        `<tr><td>${esc(x.loc)}</td><td>${esc(x.target)}</td><td>${esc(x.sorted)}</td><td>${esc(x.ng)}</td><td>${esc(x.act)}</td><td>${esc(x.done)}</td></tr>`,
    )
    .join('')}</table>`;
}
// 창 (불량 · NCR) 에서 쓰는 상태 — 한 번에 창 한 개만 열림
let curContain = [],
  ctMode = ''; // '' | 'defect' | 'ncr'
function ctInit(rows, defs, mode) {
  curContain = (rows && rows.length ? rows : (defs || []).map((l) => ({ loc: l }))).map(ctRow);
  ctMode = mode || '';
}
function renderContain() {
  const b = $('#containBox');
  if (b) b.innerHTML = ctEditHTML(curContain, 'form');
}
function containFoot() {
  const e = $('#containFoot');
  if (e) e.innerHTML = ctFootHTML(curContain);
}
function ctAddRow() {
  curContain.push(ctRow({}));
  mfDirty = true;
  renderContain();
}
// 창 안의 봉쇄 칸 (제목 줄 + 표 자리)
const ctBoxHTML = (title) =>
  `<div class="ctl">${title} <button type="button" class="b s" onclick="ctAddRow()">+ 위치 추가</button></div><div id="containBox"></div>`;
// 불량 한 건의 봉쇄 표: NCR 이 있으면 NCR 의 표 (보기만), 없으면 불량의 표
function defContain(d) {
  const n = d && d.ncrId ? db.ncrs.find((x) => x.id === d.ncrId) : null;
  if (n) {
    const nr = ctClean(n.contain);
    return { ncr: n, ro: true, rows: nr.length ? nr : ctClean(d.contain), fromNcr: !!nr.length };
  }
  return { ncr: null, ro: false, rows: ctClean(d && d.contain), fromNcr: false };
}
// 불량의 임시조치를 글 한 줄로 (목록 · 출력용): 표 요약 + 메모
const defContainText = (d) => {
  if (!d) return '';
  const s = ctSumText(defContain(d).rows);
  return [s, d.containment].filter(Boolean).join('\n');
};

/* 2. 표준화 문서 표 — 문서마다 { st 갱신, rev 개정번호, date 개정일 } */
const SD_DOCS = [
  ['fmea', '공정 FMEA'],
  ['cp', '관리계획서 (CP)'],
  ['ws', '작업표준'],
  ['insp', '검사기준'],
];
const SD_ST = [
  ['', '미정'],
  ['필요', '필요'],
  ['완료', '완료'],
  ['해당없음', '해당 없음'],
];
// RCA 는 칸 이름이 따로 있음 (이전 자료와 맞춤)
const SD_CASE = {
  fmea: ['FMEAUpdate', 'FMEARev', 'FMEADate'],
  cp: ['CPUpdate', 'CPRev', 'CPDate'],
  ws: ['WSUpdate', 'WSRev', 'WSDate'],
  insp: ['InspUpdate', 'InspRev', 'InspDate'],
};
const sdDone = (st) => st === '완료' || st === '해당없음';
// 사내 대책 (ica) 에서 읽음 — 예전 체크 (std) 는 ‘완료’ 로 읽음
function sdOf(c) {
  const o = {};
  SD_DOCS.forEach(([k]) => {
    const x = c && c.docs && c.docs[k];
    o[k] = x ? { st: x.st || '', rev: x.rev || '', date: x.date || '' } : { st: c && c.std && c.std[k] ? '완료' : '', rev: '', date: '' };
  });
  return o;
}
function sdOfCase(c) {
  const o = {};
  SD_DOCS.forEach(([k]) => {
    const [a, b, d] = SD_CASE[k];
    o[k] = { st: c[a] || '', rev: c[b] || '', date: c[d] || '' };
  });
  return o;
}
const sdOpen = (docs) => SD_DOCS.filter(([k]) => !sdDone(docs[k].st)).map((x) => x[1]);
const sdHasNA = (docs) => SD_DOCS.some(([k]) => docs[k].st === '해당없음');
const sdAny = (docs) => SD_DOCS.some(([k]) => docs[k].st || docs[k].rev || docs[k].date);
// 끝낼 수 있는지 — 안 되면 이유 글, 되면 ''
function sdValidMsg(docs, naReason) {
  const open = sdOpen(docs);
  if (open.length) return `표준화 문서의 갱신 판정이 남았습니다: ${open.join(' · ')} (완료 또는 해당 없음)`;
  if (sdHasNA(docs) && !String(naReason || '').trim()) return '표준화 문서가 ‘해당 없음’ 이면 사유를 적으세요';
  return '';
}
// at(k, part) → 칸의 속성 글 (part: st · rev · date)
function sdTableHTML(docs, at) {
  return `<table class="ct sdt"><thead><tr><th>문서</th><th>갱신</th><th>개정번호</th><th>개정일</th></tr></thead><tbody>${SD_DOCS.map(
    ([k, l]) => `<tr><td>${l}</td>
    <td><select ${at(k, 'st')}>${SD_ST.map(([v, t]) => `<option value="${v}" ${v === docs[k].st ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
    <td><input type="text" ${at(k, 'rev')} value="${esc(docs[k].rev)}" placeholder="예: Rev.07" style="width:110px"></td>
    <td><input type="date" ${at(k, 'date')} value="${esc(docs[k].date)}"></td></tr>`,
  ).join('')}</tbody></table>`;
}
// 창에서 모은 값 (gather) 에서 문서 칸을 빼내어 { docs, docNA, std } 로 돌려줌
function sdGather(o, pre) {
  const docs = {};
  SD_DOCS.forEach(([k]) => {
    docs[k] = {};
    ['st', 'rev', 'date'].forEach((p) => {
      const key = `${pre}doc_${k}_${p}`;
      docs[k][p] = o[key] || '';
      delete o[key];
    });
  });
  const docNA = o[`${pre}docNA`] || '';
  delete o[`${pre}docNA`];
  const std = {};
  SD_DOCS.forEach(([k]) => {
    if (docs[k].st === '완료') std[k] = true;
  });
  return { docs, docNA, std };
}
// 글 한 줄 (출력용)
const sdText = (docs, naReason) =>
  SD_DOCS.map(([k, l]) => {
    const x = docs[k],
      st = (SD_ST.find((s) => s[0] === x.st) || ['', '미정'])[1];
    return `${l}: ${st}${x.rev || x.date ? ` (${[x.rev, x.date].filter(Boolean).join(', ')})` : ''}`;
  }).join(' · ') + (naReason ? ` — 해당 없음 사유: ${naReason}` : '');
