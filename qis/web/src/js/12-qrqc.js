/* ================= 신속대응 (QRQC — 공정품질 신속대응회의 추적표) =================
   공정에서 생긴 품질 문제를 Exit Criteria 9개 항목(24HR 봉쇄조치 … 14D 교훈 반영)으로 끝까지 추적함.
   · 항목마다 상태 R(미착수) · Y(실행 중) · G(완료) · N/A, 완료일자 · 확인자 · 상세내용 · 첨부
   · 계획일 = 발견일자 + 항목별 일수. 계획일을 넘긴 미완료 항목은 R 로 보임
   · 조치 · 진행 기록은 이슈 · 불량 · NCR 과 같은 공통 기록 부품(15e-defect-log.js)을 씀
   · 이슈(11-issue.js)와는 별도 기록 — 관련 이슈를 골라 서로 이어 볼 수 있음 */
const QQ_CRIT = [
  { k: 'cont', d: 1, g: '24HR', l: '봉쇄조치' },
  { k: 'rca', d: 2, g: '2D', l: '원인분석' },
  { k: 'act', d: 7, g: '7D', l: '개선조치 실행' },
  { k: 'ep', d: 7, g: '7D', l: '실수방지 검출' },
  { k: 'lpa', d: 7, g: '7D', l: '계층적 공정감사' },
  { k: 'ver', d: 9, g: '9D', l: '개선조치 검증' },
  { k: 'pfmea', d: 10, g: '10D', l: 'PFMEA / CP' },
  { k: 'sw', d: 10, g: '10D', l: '표준작업 · 훈련' },
  { k: 'll', d: 14, g: '14D', l: '교훈 반영' },
];
const QQ_CK = Object.fromEntries(QQ_CRIT.map((c) => [c.k, c]));
const QQ_ST = ['R', 'Y', 'G', 'NA'],
  QQ_SL = { R: '미착수', Y: '실행 중', G: '완료', NA: '해당 없음' },
  QQ_SCLS = { R: 'bad', Y: 'warn', G: 'ok', NA: 'mut' },
  qqSN = (s) => (s === 'NA' ? 'N/A' : s);
const QQ_KINDS = [
  '현장 조치',
  '선별 · 격리',
  '원인 조사',
  '협력사 연락',
  '고객 연락',
  '회의 · 협의',
  '검사 · 측정',
  '시험 · 분석',
  '표준 · 문서 개정',
  '교육',
  '기타',
];
const QQ_SYS = ['등록', '상태 변경', '종결', '다시 열기']; // 프로그램이 남긴 기록 — 수정 · 취소 불가
const QQ_ACCEPT = 'image/*,.pdf,.xlsx,.xlsm,.xls,.csv,.pptx,.pptm,.ppt,.docx,.doc,.hwp,.hwpx,.txt,.zip';
const qqAll = () => db.qrqcs || [];
const qqById = (id) => qqAll().find((x) => x.id === id);
const qqC = (r, k) => (r.crit && r.crit[k]) || {};
const qqS = (r, k) => (QQ_ST.includes(qqC(r, k).s) ? qqC(r, k).s : 'R');
const qqFin = (r, k) => ['G', 'NA'].includes(qqS(r, k));
const qqPlan = (r, c) => (r.date ? addDays(r.date, c.d) : '');
const qqOver = (r, c) => !qqFin(r, c.k) && !!qqPlan(r, c) && qqPlan(r, c) < today();
const qqShown = (r, c) => (qqOver(r, c) ? 'R' : qqS(r, c.k)); // 화면에 보이는 상태 — 계획일을 넘긴 미완료는 R
const qqDone = (r) => !!r.ac || QQ_CRIT.every((c) => qqFin(r, c.k));
const qqOverall = (r) => (qqDone(r) ? 'G' : QQ_CRIT.some((c) => qqOver(r, c)) ? 'R' : 'Y');
const qqContWait = (r) => !qqDone(r) && !qqFin(r, 'cont');
const qqNext = (r) =>
  QQ_CRIT.filter((c) => !qqFin(r, c.k))
    .map((c) => qqPlan(r, c))
    .filter(Boolean)
    .sort()[0] ||
  r.fc ||
  '';
const qqRedN = () => qqAll().filter((r) => qqOverall(r) === 'R').length; // 메뉴 옆 숫자
const qqLogN = (r) => (r.logs || []).filter((l) => !l.void && !l.sys).length;
const qqFileIds = (r) => [...QQ_CRIT.flatMap((c) => qqC(r, c.k).photos || []), ...logPhotoIds(r.logs)];
const qqOneLine = (t) =>
  String(t || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .join(' / ');
const qqTitle = (r) => [r.part, qqOneLine(r.issue)].filter(Boolean).join(' — ');
function qqNorm(r) {
  if (!r || typeof r !== 'object') return r;
  if (!r.crit || typeof r.crit !== 'object' || Array.isArray(r.crit)) r.crit = {};
  QQ_CRIT.forEach((c) => {
    const x = r.crit[c.k];
    if (!x || typeof x !== 'object') r.crit[c.k] = { s: 'R', done: '', checker: '', note: '', photos: [] };
    else if (!Array.isArray(x.photos)) x.photos = [];
  });
  r.logs = Array.isArray(r.logs) ? r.logs.map(logNorm) : [];
  return r;
}
function qqLog(r, kind, text) {
  const at = nowMin();
  (r.logs = r.logs || []).push({
    id: uid(),
    date: at.slice(0, 10),
    time: at.slice(11, 16),
    band: '',
    kind,
    party: '',
    method: '',
    text: String(text || ''),
    result: '',
    photos: [],
    by: czMe(),
    at: now(),
    ...(QQ_SYS.includes(kind) ? { sys: true } : {}),
  });
}
const qqBadge = (s, title) => `<span class="bg ${QQ_SCLS[s]} qqs"${title ? ` title="${esc(title)}"` : ''}>${qqSN(s)}</span>`;

/* ---------------- 목록 (추적표) ---------------- */
function qqList() {
  const f = (state.qqf = state.qqf || { status: 'open', ov: '', q: '' });
  let L = qqAll().slice();
  if (f.status === 'open') L = L.filter((r) => !qqDone(r));
  else if (f.status === 'closed') L = L.filter(qqDone);
  else if (f.status === 'cont') L = L.filter(qqContWait);
  if (f.ov) L = L.filter((r) => qqOverall(r) === f.ov);
  if (f.q) {
    const q = f.q.toLowerCase();
    L = L.filter((r) =>
      [r.no, r.part, r.partNo, r.model, r.line, r.issue, r.owner, r.dept, r.action, ...(r.logs || []).map((l) => l.text)]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }
  const rank = { R: 0, Y: 1, G: 2 };
  L.sort((a, b) => rank[qqOverall(a)] - rank[qqOverall(b)] || (b.date || '').localeCompare(a.date || '') || (b.no || '').localeCompare(a.no || ''));
  return L;
}
function renderQrqc() {
  setTimeout(qqSync, 0); // 상세 창이 열려 있으면 새 내용으로 다시 그림
  const f = (state.qqf = state.qqf || { status: 'open', ov: '', q: '' }),
    all = qqAll(),
    L = qqList(),
    open = all.filter((r) => !qqDone(r)),
    red = open.filter((r) => qqOverall(r) === 'R'),
    cont = open.filter(qqContWait),
    m = today().slice(0, 7);
  state.qqOrder = L.map((r) => r.id);
  const kpi = (l, v, s, cls, fn) =>
    `<div class="kpi go ${cls}" onclick="${fn}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const cell = (r, c) => {
    const s = qqShown(r, c),
      p = qqPlan(r, c),
      x = qqC(r, c.k);
    return `<td class="qqcc" onclick="event.stopPropagation();qqOpen('${r.id}','${c.k}')" title="${esc(
      `${c.g} ${c.l} — ${QQ_SL[s]}${qqOver(r, c) ? ' · 계획일 초과' : ''}${x.done ? ' · 완료 ' + x.done : ''}`,
    )}">${qqBadge(s)}<div class="mono muted qqd${qqOver(r, c) ? ' late' : ''}">${esc((s === 'G' && x.done ? x.done : p).slice(5))}</div></td>`;
  };
  return `<div class="row noprint" style="margin-bottom:12px;align-items:baseline"><h2 style="margin:0;font-size:22px">신속대응</h2><span class="muted" style="font-size:13px">공정품질 신속대응회의(QRQC) 추적표 — Exit Criteria 9개 항목을 24시간부터 14일까지 추적</span><span style="flex:1"></span>
    <button class="b" onclick="qqMinutes()">회의록 복사</button>${RO ? '' : '<button class="b p" onclick="editQrqc()">+ 신속대응 등록</button>'}</div>
  <div class="kpis">
    ${kpi('진행 중', open.length, `최근 7일 신규 ${all.filter((r) => (r.date || '') >= addDays(today(), -7)).length}건`, open.length ? 'warn' : 'ok', "state.qqf.status='open';state.qqf.ov='';render()")}
    ${kpi('진행현황 R', red.length, '계획일을 넘긴 항목이 있는 건', red.length ? 'bad' : 'ok', "state.qqf.status='open';state.qqf.ov='R';render()")}
    ${kpi('24HR 봉쇄 미완료', cont.length, '봉쇄조치가 G 가 아닌 건', cont.length ? 'bad' : 'ok', "state.qqf.status='cont';state.qqf.ov='';render()")}
    ${kpi(`${m} 종결`, all.filter((r) => qqDone(r) && (r.ac || '').startsWith(m)).length, '실제 완료일자 기준', 'ok', "state.qqf.status='closed';state.qqf.ov='';render()")}
  </div>
  <div class="card"><div class="row noprint" style="margin-bottom:8px">
    <select onchange="state.qqf.status=this.value;render()">${[
      ['open', '진행 중'],
      ['cont', '봉쇄 미완료'],
      ['', '전체'],
      ['closed', '종결'],
    ]
      .map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`)
      .join('')}</select>
    <select onchange="state.qqf.ov=this.value;render()">${[
      ['', '진행현황 전체'],
      ['R', 'R — 계획일 초과'],
      ['Y', 'Y — 진행 중'],
      ['G', 'G — 완료'],
    ]
      .map(([v, l]) => `<option value="${v}" ${f.ov === v ? 'selected' : ''}>${l}</option>`)
      .join('')}</select>
    <span class="muted" style="font-size:12px">${QQ_ST.map((s) => `${qqBadge(s)} ${QQ_SL[s]}`).join(' &nbsp; ')} · 계획일을 넘긴 미완료 항목은 R</span>
    <span style="flex:1"></span><input placeholder="번호 · 품명 · 품번 · 담당 · 기록 내용" value="${esc(f.q)}" oninput="state.qqf.q=this.value;deb(render)" style="width:240px"></div>
  <div class="tw"><table class="qqt"><thead><tr><th>진행</th><th>번호</th><th>발견일</th><th>품목</th><th>발견장소</th><th style="min-width:200px">문제내용</th>
    ${QQ_CRIT.map((c) => `<th class="qqh" title="${esc(c.g + ' ' + c.l)}"><span class="mono">${c.g}</span><br>${esc(c.l)}</th>`).join('')}
    <th>담당</th><th style="min-width:180px">조치사항</th><th>예상 완료</th></tr></thead><tbody>
  ${
    L.map((r) => {
      const ov = qqOverall(r),
        n = qqLogN(r);
      return `<tr class="${ov === 'R' ? 'late' : ''}" style="cursor:pointer" onclick="if(!event.target.closest('a,button,input'))qqOpen('${r.id}')">
    <td>${qqBadge(ov, ov === 'R' ? '계획일을 넘긴 항목이 있음' : ov === 'G' ? '종결' : '진행 중')}</td>
    <td class="mono" style="white-space:nowrap"><a class="lk" onclick="qqOpen('${r.id}')"><b>${esc(r.no)}</b></a>${r.recur === '재발' ? '<br><span class="bg bad">재발</span>' : ''}</td>
    <td class="mono" style="white-space:nowrap">${esc(r.date || '')}</td>
    <td style="min-width:130px"><b>${esc(r.part || '')}</b><br><span class="muted" style="font-size:12px">${esc([r.partNo, r.model].filter(Boolean).join(' · '))}</span></td>
    <td>${esc(r.line || '')}</td><td>${nl(r.issue || '')}</td>
    ${QQ_CRIT.map((c) => cell(r, c)).join('')}
    <td style="white-space:nowrap">${esc(r.owner || '')}${r.dept ? `<br><span class="muted" style="font-size:12px">${esc(r.dept)}</span>` : ''}</td>
    <td><div class="qqclamp">${nl(r.action || '')}</div>${n ? `<span class="muted" style="font-size:12px">기록 ${n}건</span>` : ''}</td>
    <td class="mono" style="white-space:nowrap">${esc(r.ac ? r.ac + ' 완료' : r.fc || '')}</td></tr>`;
    }).join('') ||
    `<tr><td colspan="${9 + QQ_CRIT.length}" class="muted" style="text-align:center;padding:28px">조건에 맞는 신속대응 건이 없습니다.${
      RO || all.length ? '' : ' 위의 ‘+ 신속대응 등록’ 으로 첫 건을 등록하세요.'
    }</td></tr>`
  }
  </tbody></table></div></div>`;
}

/* ---------------- 상세 창 ---------------- */
function qqOpen(id, k) {
  if (!qqById(id)) return;
  const other = state.qqId !== id;
  if (other) qqDraftDrop();
  state.tab = 'qrqc';
  state.qqId = id;
  if (k && QQ_CK[k]) {
    if (!(state.qqDraft && state.qqDraft.k === k)) qqDraftDrop();
    state.qqCrit = k;
  } else if (other) state.qqCrit = null;
  render();
  qqShow(id);
}
function qqShow(id, keep) {
  const r = qqById(id),
    m = $('#modal');
  if (!r) return;
  const same = !!keep && m.dataset.qq === id && tl.kind === 'qrqc' && tl.obj && tl.obj.id === id;
  const old = same ? { v: LOG_DRAFT.map((k) => ($('#' + k) ? $('#' + k).value : null)), top: $('#mbody').scrollTop } : null;
  const ord = state.qqOrder || [],
    pos = ord.indexOf(id);
  openModal(`${r.no} 신속대응${pos >= 0 ? ` (${pos + 1} / ${ord.length})` : ''}`, qqDetailHTML(r), [
    ...(RO ? [] : [{ label: '삭제', cls: 'd', fn: () => delQrqc(id) }]),
    ...(pos > 0 ? [{ label: '▲ 이전', left: true, fn: () => qqGo(ord[pos - 1]) }] : []),
    ...(pos >= 0 && pos < ord.length - 1 ? [{ label: '▼ 다음', left: true, fn: () => qqGo(ord[pos + 1]) }] : []),
    ...(RO ? [] : [{ label: '기본 정보 수정', fn: () => editQrqc(id) }]),
    { label: '닫기', fn: closeModal },
    ...(RO ? [] : [{ label: '저장', cls: 'p', fn: () => qqSaveAll(id) }]),
  ]);
  m.dataset.qq = id;
  qqFilesFill();
  if (!same) {
    tlInit('qrqc', r, { ro: RO });
    return;
  }
  tlResync(r, { ro: RO });
  renderLogs(false);
  LOG_DRAFT.forEach((k, n) => {
    if ($('#' + k) && old.v[n] != null) $('#' + k).value = old.v[n];
  });
  dtpSync('lgAt');
  dtpSync('leAt');
  $('#mbody').scrollTop = old.top;
  mfDirty = tl.edit != null || tlDraftHas() || qqDraftDirty();
}
// 화면을 다시 그린 뒤: 상세 창이 떠 있으면 갱신, 아무 창도 없으면 '보고 있던 건' 표시를 지움
function qqSync() {
  const m = $('#modal'),
    on = m.classList.contains('on');
  if (m.dataset.qq) {
    if (!on) {
      delete m.dataset.qq;
      return;
    }
    if (!qqById(m.dataset.qq)) {
      closeModal(true);
      return;
    }
    qqShow(m.dataset.qq, true);
  } else if (!on) state.qqId = null;
}
// 이전 · 다음 건으로 — 쓰던 내용이 있으면 먼저 확인
async function qqGo(id) {
  if (tl.edit != null || tlDraftHas() || qqDraftDirty()) {
    if (
      !(await askConfirm({ title: '작성 중인 내용이 있습니다', msg: '다른 건으로 넘어가면 입력한 내용이 사라집니다.', ok: '저장 안 하고 넘어가기' }))
    )
      return;
  }
  qqDraftDrop();
  state.qqCrit = null;
  mfDirty = false;
  delete $('#modal').dataset.qq;
  state.qqId = id;
  qqShow(id);
}
// 상세 창의 ‘저장’ — 쓰던 항목 · 기록이 있으면 저장하고 창을 닫음. ‘닫기’는 저장하지 않음
function qqSaveAll(id) {
  if (tl.edit != null) {
    toast('수정 중인 기록을 먼저 저장하거나 취소하세요');
    return;
  }
  if (qqDraftDirty() && !qqCritSave(id, true)) return;
  if (tlDraftHas() && !addLog()) return;
  qqDraftDrop();
  state.qqCrit = null;
  mfDirty = false;
  closeModal(true);
  toast('저장했습니다');
}
function qqDetailHTML(r) {
  const ov = qqOverall(r),
    p = partByNo(r.partNo || ''),
    iss = r.issueId ? issById(r.issueId) : null;
  const kv = (k, v, s) =>
    `<div><div class="muted" style="font-size:12px">${k}</div><div style="font-weight:600;margin-top:2px">${v}</div>${
      s ? `<div style="font-size:13px">${s}</div>` : ''
    }</div>`;
  const card = (c) => {
    const s = qqShown(r, c),
      x = qqC(r, c.k),
      on = state.qqCrit === c.k;
    return `<button type="button" class="qqc ${on ? 'on' : ''}" aria-pressed="${on}" onclick="qqPick('${c.k}')">
      <span class="h"><b><span class="mono">${c.g}</span> · ${esc(c.l)}</b>${qqBadge(s)}</span>
      <span class="muted mono" style="font-size:12px">계획 ${esc(qqPlan(r, c).slice(5))}${qqOver(r, c) ? ' · <span style="color:var(--bad)">초과</span>' : ''}${
        x.done ? ` · 완료 ${esc(x.done.slice(5))}` : ''
      }</span>
      <span class="n">${esc(qqOneLine(x.note)) || '<span class="muted">상세내용 없음</span>'}</span>
      <span class="muted" style="font-size:12px">${[x.checker ? '확인 ' + esc(x.checker) : '', (x.photos || []).length ? `첨부 ${x.photos.length}` : ''].filter(Boolean).join(' · ') || '&nbsp;'}</span></button>`;
  };
  return `<div class="card">
    <div class="row" style="gap:8px;align-items:center"><span class="mono muted">${esc(r.no)}</span>${qqBadge(ov)}${r.recur === '재발' ? '<span class="bg bad">재발</span>' : ''}
      <h2 style="margin:0;font-size:18px">${esc(r.part || '')}</h2></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-top:14px;font-size:13px">
      ${kv('발견', esc(r.date || '-'), esc(r.line || ''))}
      ${kv('품목', esc(r.partNo || '품번 없음'), esc([r.model, p ? supName(p.supplierId) : ''].filter(Boolean).join(' · ')))}
      ${kv('주관부서 · 담당', esc([r.dept, r.owner].filter(Boolean).join(' · ') || '-'), '')}
      ${kv('완료일자', r.ac ? `<span style="color:var(--ok)">${esc(r.ac)} 완료</span>` : `예상 ${esc(r.fc || '-')}`, r.cc ? '고객 ' + esc(r.cc) : '')}
      ${iss ? kv('관련 이슈', `<a class="lk" onclick="issOpen('${iss.id}')">${esc(iss.no)}</a>`, esc(iss.title || '')) : ''}
    </div>
    ${r.issue ? `<div style="background:var(--mut);border-radius:6px;padding:10px 12px;margin-top:12px;line-height:1.6"><span class="muted" style="font-size:12px">문제내용</span><br>${nl(r.issue)}</div>` : ''}
    ${r.action ? `<div style="border:1px solid var(--line);border-radius:6px;padding:10px 12px;margin-top:8px;line-height:1.6"><span class="muted" style="font-size:12px">조치사항</span><br>${nl(r.action)}</div>` : ''}
  </div>
  <div class="card"><h3 style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><span style="white-space:nowrap">Exit Criteria</span><span class="muted" style="font-weight:normal;font-size:12px">항목을 누르면 상태 · 완료일자 · 확인자 · 상세내용 · 첨부를 적는 칸이 열립니다. 계획일은 발견일자 기준입니다.</span></h3>
    <div class="qqg">${QQ_CRIT.map(card).join('')}</div>
    ${state.qqCrit && QQ_CK[state.qqCrit] ? qqCritHTML(r, QQ_CK[state.qqCrit]) : ''}
  </div>
  <div class="card"><h3 style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><span style="white-space:nowrap">조치 · 진행 기록</span><span class="muted" style="font-weight:normal;font-size:12px">실제로 한 일과 결과를 날짜별로 남깁니다. 상태 변경 · 등록 · 종결은 프로그램이 함께 남깁니다.</span></h3>
    <div id="logBox"></div>
  </div>`;
}

/* ---------------- Exit Criteria 한 항목 적기 ---------------- */
// 적는 중인 내용(state.qqDraft)은 화면을 다시 그려도 남음 — [항목 저장]을 눌러야 기록에 반영
function qqDraftOf(r, c) {
  if (state.qqDraft && state.qqDraft.id === r.id && state.qqDraft.k === c.k) return state.qqDraft;
  const x = qqC(r, c.k);
  return (state.qqDraft = {
    id: r.id,
    k: c.k,
    s: qqS(r, c.k),
    done: x.done || '',
    checker: x.checker || '',
    note: x.note || '',
    photos: (x.photos || []).slice(),
    added: [],
    dirty: false,
  });
}
const qqDraftDirty = () => !!(state.qqDraft && state.qqDraft.dirty);
// 적다 만 내용을 버림 — 그동안 올린 새 첨부도 지움
function qqDraftDrop() {
  const d = state.qqDraft;
  if (d && d.added.length) {
    photoDel(d.added).catch(() => {});
    photoStr = null;
  }
  state.qqDraft = null;
}
async function qqPick(k) {
  if (state.qqCrit === k) {
    if (
      qqDraftDirty() &&
      !(await askConfirm({ title: '적던 내용을 버릴까요?', msg: '항목 저장을 누르지 않은 내용은 사라집니다.', ok: '버리고 접기' }))
    )
      return;
    qqDraftDrop();
    state.qqCrit = null;
  } else {
    if (
      qqDraftDirty() &&
      !(await askConfirm({ title: '적던 내용을 버릴까요?', msg: '항목 저장을 누르지 않은 내용은 사라집니다.', ok: '버리고 다른 항목 열기' }))
    )
      return;
    qqDraftDrop();
    state.qqCrit = k;
  }
  if (state.qqId) qqShow(state.qqId, true);
}
function qqCritHTML(r, c) {
  const d = qqDraftOf(r, c),
    ro = RO;
  return `<div class="qqe" id="qqEd">
    <div class="row" style="gap:8px;align-items:baseline;flex-wrap:wrap"><b style="font-size:15px"><span class="mono">${c.g}</span> · ${esc(c.l)}</b>
      <span class="muted mono" style="font-size:12px">계획일 ${esc(qqPlan(r, c))}${qqOver(r, c) ? ' · <span style="color:var(--bad)">초과</span>' : ''}</span></div>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px" role="group" aria-label="상태">${QQ_ST.map(
      (s) =>
        `<button type="button" class="b qqsb ${d.s === s ? 'on ' + QQ_SCLS[s] : ''}" aria-pressed="${d.s === s}" ${ro ? 'disabled' : ''} onclick="qqSet('s','${s}')">${qqSN(s)} · ${QQ_SL[s]}</button>`,
    ).join('')}</div>
    <div class="fg" style="margin-top:10px">
      <label>완료일자<input type="date" id="qqDone" value="${esc(d.done)}" ${ro ? 'disabled' : ''} oninput="qqSet('done',this.value)"></label>
      <label>확인자<input id="qqChecker" list="dlOwners" value="${esc(d.checker)}" ${ro ? 'disabled' : ''} oninput="qqSet('checker',this.value)"></label>
      <label class="full">상세내용<textarea id="qqNote" style="min-height:96px" ${ro ? 'disabled' : ''} placeholder="무엇을 · 어떻게 했는지, 확인한 결과" oninput="qqSet('note',this.value)">${esc(d.note)}</textarea></label>
    </div>
    <div class="sec" style="margin-top:10px">첨부 <span class="muted" style="font-weight:normal;font-size:12px">사진 · PDF · 엑셀 · 파워포인트 (파일당 20MB)</span></div>
    <div id="qqFiles" class="lgph"></div>
    ${
      ro
        ? ''
        : `<div class="row noprint" style="gap:8px;margin-top:8px;align-items:center">
      <label class="b" style="cursor:pointer">파일 선택<input type="file" multiple accept="${QQ_ACCEPT}" style="display:none" onchange="qqAddFiles([...this.files]);this.value=''"></label>
      <span style="flex:1"></span><button type="button" class="b" onclick="qqPick('${c.k}')">접기</button><button type="button" class="b p" onclick="qqCritSave('${r.id}')">항목 저장</button></div>`
    }
  </div>`;
}
function qqSet(key, v) {
  const d = state.qqDraft;
  if (!d || RO) return;
  d[key] = v;
  d.dirty = true;
  mfDirty = true;
  if (key !== 's') return;
  // 완료(G)로 바꾸면 완료일자 · 확인자를 채워 줌 (비어 있을 때만)
  if (v === 'G') {
    if (!d.done) d.done = today();
    if (!d.checker) d.checker = czMe();
  }
  if (state.qqId) qqShow(state.qqId, true);
}
const qqPh = {}; // 첨부 정보 (작은 그림 · 이름) — 상세 창을 다시 그려도 다시 받지 않게
async function qqFilesFill() {
  const b = $('#qqFiles'),
    d = state.qqDraft;
  if (!b || !d) return;
  const miss = d.photos.filter((i) => !qqPh[i]);
  if (miss.length) {
    try {
      (await photoGetMany(miss)).forEach((x) => (qqPh[x.id] = x));
    } catch (e) {}
  }
  const bx = $('#qqFiles');
  if (!bx || state.qqDraft !== d) return;
  bx.innerHTML =
    d.photos
      .map((id, k) => {
        const x = qqPh[id],
          rm = RO ? '' : `<a onclick="qqRmFile(${k})" title="빼기" aria-label="첨부 빼기">✕</a>`;
        if (!x) return `<span class="t"><span class="ld">${LG_ICO.clip}</span>${rm}</span>`;
        return isDocRec(x)
          ? `<span class="t dc"><span class="o" role="button" tabindex="0" onclick="qqOpenFile('${id}')" title="${esc(x.name)} — 열기"><span class="dk">${docIcon(x)}</span><b>${esc(x.name)}</b>${
              x.size ? `<span class="muted">${fmtBytes(x.size)}</span>` : ''
            }</span>${rm}</span>`
          : `<span class="t"><img src="${x.thumb || x.data}" onclick="qqOpenFile('${id}')" title="${esc(x.caption || x.name || '')}">${rm}</span>`;
      })
      .join('') || '<span class="muted" style="font-size:13px">첨부 없음</span>';
}
function qqOpenFile(id) {
  const x = qqPh[id],
    d = state.qqDraft;
  if (!x) return;
  if (isDocRec(x)) return docOpenRec(x);
  const imgs = ((d && d.photos) || [id]).map((i) => qqPh[i]).filter((y) => y && !isDocRec(y));
  lbOpen(
    imgs,
    Math.max(
      0,
      imgs.findIndex((y) => y.id === id),
    ),
  );
}
async function qqAddFiles(files) {
  const d = state.qqDraft,
    r = d && qqById(d.id);
  if (!d || !r || RO) return;
  const recs = [];
  for (const f of files) {
    try {
      const x = (f.type || '').startsWith('image/') ? await attImgRec(f) : await attDocRec(f, 20);
      if (!x) continue;
      x.defectId = r.id;
      recs.push(x);
    } catch (e) {
      toast(e.message);
    }
  }
  if (!recs.length) return;
  recs.forEach((x) => {
    qqPh[x.id] = x;
    d.photos.push(x.id);
    d.added.push(x.id);
  });
  attStore(recs, '첨부');
  d.dirty = true;
  mfDirty = true;
  qqFilesFill();
}
function qqRmFile(k) {
  const d = state.qqDraft;
  if (!d || RO) return;
  d.photos.splice(k, 1);
  d.dirty = true;
  mfDirty = true;
  qqFilesFill();
}
// 항목 저장 — 상태가 바뀌면 조치 · 진행 기록에 '상태 변경'을 남김. quiet: 창 전체 저장에서 부름 (안내 · 다시 그리기 생략)
function qqCritSave(id, quiet) {
  const r = qqById(id),
    d = state.qqDraft;
  if (!r || !d || d.id !== id || RO) return false;
  const c = QQ_CK[d.k],
    old = qqS(r, d.k),
    prev = qqC(r, d.k);
  if (d.done && d.done > today()) {
    toast('완료일자는 오늘 이후일 수 없습니다');
    return false;
  }
  const gone = (prev.photos || []).filter((i) => !d.photos.includes(i)),
    dropNew = d.added.filter((i) => !d.photos.includes(i));
  r.crit = r.crit || {};
  r.crit[d.k] = { s: d.s, done: d.done || '', checker: String(d.checker || '').trim(), note: String(d.note || '').trim(), photos: d.photos.slice() };
  if (gone.length) attDrop(gone);
  if (dropNew.length) photoDel(dropNew).catch(() => {});
  if (old !== d.s) qqLog(r, '상태 변경', `${c.g} ${c.l}: ${qqSN(old)} → ${qqSN(d.s)}${d.s === 'G' && d.done ? ` (완료일 ${d.done})` : ''}`);
  state.qqDraft = null;
  state.qqCrit = null;
  touch(r);
  save();
  if (quiet) return true;
  mfDirty = tl.edit != null || tlDraftHas();
  render();
  toast(`${c.g} ${c.l} 저장했습니다`);
  return true;
}

/* ---------------- 등록 · 기본 정보 수정 ---------------- */
function editQrqc(id, pre) {
  const r = id ? { ...qqById(id) } : { date: today(), recur: '일시', owner: czMe(), ...(pre || {}) };
  if (id && !qqById(id)) return;
  const lines = [
      ...new Set(
        qqAll()
          .map((x) => x.line)
          .filter(Boolean),
      ),
    ],
    depts = [
      ...new Set(
        qqAll()
          .map((x) => x.dept)
          .filter(Boolean),
      ),
    ],
    iss = (db.issues || []).filter((i) => !i.closedAt || i.id === r.issueId);
  const body = `<div class="fg">
    <label>발견일자 *<input type="date" name="date" value="${esc(r.date)}" max="${today()}"></label>
    <label>품번<input name="partNo" data-combo="parts" autocomplete="off" value="${esc(r.partNo)}" placeholder="품번 · 품명 · 차종으로 검색" onchange="qqPartFill()"></label>
    <label>품명 *<input name="part" value="${esc(r.part)}" placeholder="예: 프론트 도어래치"></label>
    <label>차종<input name="model" value="${esc(r.model)}" placeholder="예: NE1"></label>
    <label>발견장소 *<input name="line" list="qqLines" value="${esc(r.line)}" placeholder="예: 도어래치 조립 2라인"><datalist id="qqLines">${lines
      .map((x) => `<option value="${esc(x)}">`)
      .join('')}</datalist></label>
    <label>재발유무<select name="recur">${opts(['일시', '재발'], r.recur || '일시')}</select></label>
    <label>주관부서<input name="dept" list="qqDepts" value="${esc(r.dept)}" placeholder="예: 생산"><datalist id="qqDepts">${depts
      .map((x) => `<option value="${esc(x)}">`)
      .join('')}</datalist></label>
    <label>담당<input name="owner" list="dlOwners" value="${esc(r.owner)}"></label>
    <label class="full">문제내용 (현상 · 수량) *<textarea name="issue" placeholder="예: 스트라이커 체결부 간섭으로 래치 걸림 불량 (3개/6,100개)">${esc(r.issue)}</textarea></label>
    <label class="full">조치사항 (봉쇄 · 원인 · 대책 요약)<textarea name="action" placeholder="봉쇄: …&#10;원인: …&#10;대책: …">${esc(r.action)}</textarea></label>
    <label>예상 완료일자<input type="date" name="fc" value="${esc(r.fc)}"></label>
    <label>실제 완료일자<input type="date" name="ac" value="${esc(r.ac)}" max="${today()}"></label>
    <label>고객 완료일자<input type="date" name="cc" value="${esc(r.cc)}"></label>
    <label>관련 이슈 (선택)<select name="issueId"><option value="">없음</option>${iss
      .map((i) => `<option value="${i.id}" ${i.id === r.issueId ? 'selected' : ''}>${esc(i.no)} · ${esc(i.title || '')}</option>`)
      .join('')}</select></label>
  </div>
  <div class="help">Exit Criteria 9개 항목의 계획일은 발견일자 기준으로 정해집니다 (24시간 · 2일 · 7일 · 9일 · 10일 · 14일). 실제 완료일자를 넣으면 종결로 봅니다.</div>`;
  openModal(id ? `${r.no} 기본 정보 수정` : '신속대응 등록', body, [
    { label: '취소', fn: closeModal },
    { label: id ? '저장' : '저장하고 항목 · 기록으로', cls: 'p', fn: () => saveQrqc(id) },
  ]);
}
// 품번을 고르면 비어 있는 품명 · 차종을 기준정보에서 채움
function qqPartFill() {
  const f = $('#mf'),
    p = f && f.partNo ? partByNo(String(f.partNo.value || '').trim()) : null;
  if (!p) return;
  if (f.part && !f.part.value.trim()) f.part.value = p.name || '';
  if (f.model && !f.model.value.trim()) f.model.value = p.model || '';
}
function saveQrqc(id) {
  const f = $('#mf'),
    g = (k) => (f[k] ? String(f[k].value || '').trim() : '');
  const o = {
    date: g('date'),
    partNo: g('partNo'),
    part: g('part'),
    model: g('model'),
    line: g('line'),
    recur: g('recur') === '재발' ? '재발' : '일시',
    dept: g('dept'),
    owner: g('owner'),
    issue: g('issue'),
    action: g('action'),
    fc: g('fc'),
    ac: g('ac'),
    cc: g('cc'),
    issueId: g('issueId'),
  };
  const need = (ok, msg, el) => {
    if (ok) return true;
    toast(msg);
    if (f[el]) f[el].focus();
    return false;
  };
  if (!need(o.date, '발견일자를 입력하세요', 'date')) return;
  if (!need(o.date <= today(), '발견일자는 오늘 이후일 수 없습니다', 'date')) return;
  if (!need(o.part, '품명을 입력하세요', 'part')) return;
  if (!need(o.line, '발견장소를 입력하세요', 'line')) return;
  if (!need(o.issue, '문제내용을 입력하세요', 'issue')) return;
  if (!need(!o.ac || o.ac <= today(), '실제 완료일자는 오늘 이후일 수 없습니다', 'ac')) return;
  let r;
  if (id) {
    r = qqById(id);
    if (!r) {
      toast('이 건을 찾을 수 없습니다');
      return;
    }
    const was = r.ac;
    Object.assign(r, o);
    if (!was && o.ac) qqLog(r, '종결', `실제 완료일자 ${o.ac}`);
    else if (was && !o.ac) qqLog(r, '다시 열기', '실제 완료일자 삭제');
  } else {
    r = qqNorm({ id: uid(), no: genDocNo('qrqc', o.date).no, ...o, crit: {}, logs: [], createdAt: now() });
    qqLog(r, '등록', `발견 ${o.date} · ${o.line} · ${qqOneLine(o.issue)}`);
    if (o.ac) qqLog(r, '종결', `실제 완료일자 ${o.ac}`);
    db.qrqcs.push(r);
  }
  if (o.owner && !db.settings.owners.includes(o.owner)) db.settings.owners.push(o.owner);
  touch(r);
  save();
  closeModal(true);
  qqOpen(r.id);
  if (!id) toast(`${r.no} 등록 — Exit Criteria 항목과 조치 · 진행 기록을 남기세요`);
}
async function delQrqc(id) {
  const r = qqById(id);
  if (!r) return;
  const ph = qqFileIds(r),
    n = qqLogN(r);
  if (
    !(await askConfirm({
      title: `${r.no}을(를) 삭제할까요?`,
      items: [esc(qqTitle(r)), `Exit Criteria 9개 항목 · 기록 ${n}건${ph.length ? ` · 첨부 ${ph.length}개` : ''} 함께 삭제`],
    }))
  )
    return;
  const snap = await takeSnap(ph);
  qqDraftDrop();
  state.qqCrit = null;
  attDrop(ph);
  removeRec('qrqcs', id);
  if ($('#modal').classList.contains('on')) closeModal(true);
  if (state.qqId === id) state.qqId = null;
  save();
  render();
  offerUndo(snap, `${r.no}을(를) 삭제했습니다`);
}

/* ---------------- 회의록 · 대시보드 ---------------- */
// 회의록 — 진행 현황 · 신규 · R 항목(지연 항목) · 오늘 남긴 기록을 한 번에 복사
async function qqMinutes() {
  const T = today(),
    open = qqAll().filter((r) => !qqDone(r)),
    who = (r) => [r.line, r.owner && '담당 ' + r.owner].filter(Boolean).join(', '),
    neu = open.filter((r) => (r.date || '') >= addDays(T, -2)).sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    red = open.filter((r) => qqOverall(r) === 'R').sort((a, b) => qqNext(a).localeCompare(qqNext(b))),
    late = (r) =>
      QQ_CRIT.filter((c) => qqOver(r, c))
        .map((c) => `${c.l}(${qqPlan(r, c).slice(5)})`)
        .join(', '),
    logs = qqAll().flatMap((r) => (r.logs || []).filter((l) => !l.void && !l.sys && l.date === T).map((l) => ({ r, l })));
  const list = (a, fn) => (a.length ? a.map((x, i) => `${i + 1}. ${fn(x)}`) : ['(없음)']);
  const txt = [
    `[공정품질 신속대응회의] ${T}`,
    `- 진행 중 ${open.length}건 · 진행현황 R ${red.length}건 · 24HR 봉쇄 미완료 ${open.filter(qqContWait).length}건`,
    '',
    '■ 신규 (최근 2일)',
    ...list(neu, (r) => `${r.no} ${r.part} — ${qqOneLine(r.issue)} (${who(r)})`),
    '',
    '■ R 항목 · 계획일 초과',
    ...list(red, (r) => `${r.no} ${r.part} — 지연: ${late(r)} · ${who(r)}`),
    '',
    '■ 오늘 조치 · 진행 기록',
    ...list(
      logs,
      ({ r, l }) =>
        `${r.no} ${r.part} — [${l.kind}] ${qqOneLine(l.text)}${l.result ? ' → ' + qqOneLine(l.result) : ''}${l.party ? ` (${l.party})` : ''}`,
    ),
  ].join('\n');
  let ok = false;
  try {
    await navigator.clipboard.writeText(txt);
    ok = true;
  } catch (e) {
    const t = document.createElement('textarea');
    t.value = txt;
    t.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(t);
    t.select();
    try {
      ok = document.execCommand('copy');
    } catch (e2) {}
    t.remove();
  }
  toast(ok ? '회의록을 복사했습니다 — 메일이나 메신저에 붙여 넣으세요' : '복사하지 못했습니다');
}
// 대시보드 ‘오늘 챙길 일’ — 봉쇄조치가 계획일을 넘긴 건 · 그 밖의 항목이 계획일을 넘긴 건
function qqDashItems() {
  const L = [];
  qqAll()
    .filter((r) => !qqDone(r))
    .forEach((r) => {
      const ov = QQ_CRIT.filter((c) => qqOver(r, c));
      if (!ov.length) return;
      const cont = ov.some((c) => c.k === 'cont');
      L.push(
        `<li><span class="bg bad">${cont ? '봉쇄 지연' : '신속대응 지연'}</span> <a class="lk" onclick="qqOpen('${r.id}','${ov[0].k}')">${esc(r.no)} ${esc(r.part || '')}</a> — ${esc(
          ov.map((c) => `${c.l} ${qqPlan(r, c).slice(5)}`).join(', '),
        )} 계획일 초과${r.owner ? ' · 담당 ' + esc(r.owner) : ''}</li>`,
      );
    });
  return L.join('');
}
