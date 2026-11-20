// ── 사내 대책 — 창 · 저장 · 출력 / FAR 요청서 출력 / 불량 창 안의 칸 연동 ──
function editIca(id) {
  const d = db.defects.find((x) => x.id === id);
  if (!d) return;
  icaCurId = id;
  const cs = defCase(d),
    lv = icaLevel(d);
  const body = `<div class="route" style="margin-top:0;margin-bottom:6px"><div class="ri"><div class="tx"><b>${esc(d.partNo || d.fgNo || '')} ${esc(d.partName || d.fgName || '')}</b> ${sevBadge(d)} <span class="bg mut">귀책 ${esc(d.resp || '-')}</span><br>
    <span class="muted">${esc(d.date)} · ${esc(d.source || '')} · ${esc(d.type || '')} · ${num(d.qty).toLocaleString()}EA</span>${
      d.desc ? `<br><span style="font-size:12.5px">${esc(d.desc)}</span>` : ''
    }</div>
    <button type="button" class="b s" onclick="routeGo(&quot;editDefect('${id}')&quot;)">불량 열기</button></div></div>
  ${
    cs
      ? ''
      : `<div class="help" style="margin:8px 0 0">간단한 건은 여기서 사내 대책을 기록하고, 원인분석·조치·단계 관리가 필요한 큰 건(A등급 · 고객 유출)은 <a class="lk" onclick="routeGo(&quot;czFromDefect('${id}')&quot;)">RCA로 관리</a>하세요.</div>`
  }
  ${icaSection(d, true)}`;
  const btns = cs
    ? [{ label: '닫기', fn: closeModal }]
    : [
        { label: '취소', fn: closeModal },
        { label: '저장', cls: 'p', fn: () => saveIca(id) },
      ];
  openModal(`사내 대책 — ${defLabel(d)}`, body, btns);
  if (d.ica && d.ica.doneDate) $('#mt').insertAdjacentHTML('beforeend', '<span class="qstamp">완료</span>');
  icaShow();
}
function saveIca(id, keep) {
  const d = db.defects.find((x) => x.id === id);
  if (!d) return false;
  const o = gather(),
    c = { std: {} };
  Object.keys(o).forEach((k) => {
    if (k.startsWith('ica_std_')) c.std[k.slice(8)] = true;
    else if (k.startsWith('ica_')) c[k.slice(4)] = o[k];
  });
  if (c.doneDate && !c.verifyDue) c.verifyDue = addDays(c.doneDate, num(db.settings.verifyDays) || 21);
  const lvEff = c.level || ICA_NONE;
  if (!c.due && lvEff !== ICA_NONE) c.due = addDays((d.inv && d.inv.verdictDate) || d.date, typeDays(lvEff === '8D' ? '8D 보고서' : '간이 대책서'));
  const sel = $('#mf').ica_level;
  if (!(sel && sel.dataset.touched)) delete c.level;
  d.ica = c;
  touch(d);
  save();
  if (!keep) closeModal(true);
  render();
  toast(c.doneDate ? `사내 대책 완료 — 유효성 검증 기한 ${c.verifyDue}` : '사내 대책을 저장했습니다');
  return true;
}
// 불량 목록 후속 조치 칸의 사내 대책 상태
function icaChip(d) {
  const c = d.ica || {},
    vi = icaVerify(d);
  if (c.doneDate) return `<a class="bg ${vi && vi.k === 'ng' ? 'bad' : 'ok'}" onclick="editIca('${d.id}')">${vi ? esc(vi.label) : '완료'}</a>`;
  if (icaStarted(c)) {
    const late = c.due && today() > c.due;
    return `<a class="bg ${late ? 'bad' : 'inf'}" onclick="editIca('${d.id}')">${esc(icaLevel(d))} 작성 중${late ? ' · 기한 초과' : ''}</a>`;
  }
  return '';
}
function icaSection(d, force) {
  const c = d.ica || {},
    lv = icaLevel(d),
    auto = icaLevelAuto(d);
  const lbl8 = {
    d1: 'D1 팀 구성',
    d2: 'D2 문제 기술',
    d3: 'D3 임시조치 (봉쇄)',
    d4: 'D4 근본원인 (발생 / 유출)',
    d5: 'D5 영구대책 선정',
    d6: 'D6 대책 실행 및 효과 확인',
    d7: 'D7 재발방지 (표준화)',
    d8: 'D8 팀 격려 · 종결',
  };
  const cs = defCase(d);
  if (cs)
    return `<div id="icaWrap" style="${
      force || d.resp === '사내' ? '' : 'display:none'
    }"><div class="banner" style="margin-top:14px;background:var(--pri2);border-color:#c9d8f2;color:#1d2433">사내 대책은 <a class="lk" onclick="czOpenCase('${cs.id}','cause')">RCA ${esc(cs.CaseNo)}</a>에서 관리합니다 (현재 ${esc(cs.Stage)}). 원인분석 워크시트 · 조치 · 단계 게이트를 거쳐 종결하면 이 불량도 완료됩니다.${
      icaStarted(d.ica) ? ' 이 칸에 먼저 적어 둔 사내 대책 내용은 그대로 보관됩니다.' : ''
    }</div></div>`;
  return `<div id="icaWrap" style="${force || d.resp === '사내' ? '' : 'display:none'}">
  <div class="sec">사내 대책 (RCA → 대책) <span class="muted" style="font-weight:normal;font-size:12px">심각도 기준 권장: <b id="icaAuto">${auto}</b> — A: 8D · B: 간이 대책 · C: 기록만</span></div>
  <div class="fg">
    <label>대책 수준<select name="ica_level" ${c.level ? 'data-touched="1"' : ''} onchange="this.dataset.touched=1;icaShow()">${opts(ICA_LV, lv)}</select></label>
    <label>대책 기한<input type="date" name="ica_due" value="${esc(c.due)}"></label>
    <label>대책 완료일 (승인)<input type="date" name="ica_doneDate" value="${esc(c.doneDate)}"></label>
    <label>유효성 검증 기한<input type="date" name="ica_verifyDue" value="${esc(c.verifyDue)}" placeholder="완료일 + ${db.settings.verifyDays}일"></label>
    <label>검증일<input type="date" name="ica_verifyDate" value="${esc(c.verifyDate)}"></label>
    <label>검증 결과<select name="ica_verifyResult">${opts(['유효', '무효(재발)'], c.verifyResult, true)}</select></label>
  </div>
  <div id="icaD">${ICA_KEYS.map(
    (k) =>
      `<label class="full" data-ik="${k}" style="display:block;margin-top:6px"><span class="il" data-o="${lbl8[k]}">${lbl8[k]}</span><textarea name="ica_${k}" style="min-height:44px">${esc(c[k])}</textarea></label>`,
  ).join('')}</div>
  <div class="row" id="icaStd" style="margin-top:8px;gap:12px;font-size:13px"><b>표준화 반영 확인</b>${ICA_STD.map(
    ([k, l]) => `<label class="row" style="gap:4px"><input type="checkbox" name="ica_std_${k}" ${c.std && c.std[k] ? 'checked' : ''}> ${l}</label>`,
  ).join('')}
    ${d.id ? `<span style="flex:1"></span><button type="button" class="b s" onclick="icaPrint('${d.id}')">사내 대책서 출력</button>` : ''}</div>
  </div>`;
}
function icaPrint(id) {
  const w = reportWin();
  if (mfDirty && $('#mf') && !$('#mf').date) {
    if (saveIca(id, true)) printIca(id, w);
    else if (w) w.close();
    return;
  }
  if (mfDirty) {
    saveDefect(id).then((nid) => {
      if (nid) printIca(nid, w);
      else if (w) w.close();
    });
    return;
  }
  printIca(id, w);
}
async function printIca(id, w0) {
  const d = db.defects.find((x) => x.id === id);
  if (!d) return;
  const w = w0 || reportWin(),
    c = d.ica || {},
    iv = d.inv || {},
    lv = icaLevel(d),
    simple = lv === '간이 대책';
  const SL = { d4: '원인 (발생 · 유출)', d5: '대책 내용', d6: '적용일 · 효과 확인' };
  const keys = simple ? ['d4', 'd5', 'd6'] : ICA_KEYS;
  let phs = [];
  try {
    phs = (await photoGetMany(d.photos || [])).slice(0, 4);
  } catch (e) {}
  const vi = icaVerify(d);
  const html =
    reportFrame(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>사내 대책서 — ${esc(defLabel(d))}</title><style>body{font-family:'Malgun Gothic',sans-serif;font-size:12px;margin:24px;color:#111}table{width:100%;border-collapse:collapse;margin-bottom:12px}td,th{border:1px solid #555;padding:6px;vertical-align:top;text-align:left}th{background:#eef1f6;width:20%}h1{font-size:18px;margin:6px 0 10px}.pg{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pg img{width:100%;max-height:60mm;object-fit:contain}figure{margin:0}</style></head><body>
  ${logoHead()}<h1>사내 대책서 (${esc(lv === '8D' ? '8D' : '간이 대책')})</h1>
  <table><tr><th>발생일 / 발생처</th><td>${esc(d.date)} / ${esc(d.source)}</td><th>담당</th><td>${esc(d.owner)}</td></tr>
  ${
    d.fgNo || d.fgName
      ? `<tr><th>발견 품목 (완성품)</th><td colspan="3">${esc(d.fgNo)} ${esc(d.fgName)}${d.fgQty ? ` · ${num(d.fgQty)} EA` : ''}</td></tr>`
      : ''
  }
  <tr><th>원인 부품</th><td>${esc(d.partNo)} ${esc(d.partName)}</td><th>불량유형 / 수량</th><td>${esc(d.type)} / ${num(d.qty).toLocaleString()} EA</td></tr>
  <tr><th>불량 현상</th><td colspan="3">${nl(d.desc)}</td></tr>
  ${
    iv.verdict
      ? `<tr><th>귀책 판정</th><td colspan="3">${esc(iv.verdict)} (${esc(iv.verdictDate)})${iv.basis ? ' — ' + esc(iv.basis) : ''}</td></tr>`
      : ''
  }
  ${iv.rca ? `<tr><th>사내 RCA</th><td colspan="3">${nl(iv.rca)}</td></tr>` : ''}
  <tr><th>대책 기한 / 완료일</th><td>${esc(c.due)} / ${esc(c.doneDate)}</td><th>유효성 검증</th>
    <td>${esc(c.verifyDue)} / ${esc(c.verifyDate)} ${esc(c.verifyResult)}${vi ? ` (${esc(vi.label)})` : ''}</td></tr></table>
  <table>${keys
    .map((k) => `<tr><th>${simple ? SL[k] : (D8.find((x) => x[0] === k) || [k, k])[1]}</th><td style="height:46px">${nl(c[k])}</td></tr>`)
    .join('')}
  <tr><th>표준화 반영</th><td>${ICA_STD.map(([k, l]) => `${c.std && c.std[k] ? '☑' : '☐'} ${l}`).join(' &nbsp; ')}</td></tr></table>
  ${phs.length ? `<div class="pg">${phs.map((p) => `<figure><img src="${p.data}"></figure>`).join('')}</div>` : ''}
  </body></html>`);
  reportShow(w, html, `사내대책서_${d.date}.html`);
}
async function printFar(id, w0) {
  const d = db.defects.find((x) => x.id === id);
  if (!d) return;
  const w = w0 || reportWin(),
    S = db.settings,
    iv = d.inv || {},
    sp = supById(d.supplierId),
    att = sp ? primaryOf(sp) : null;
  const exP = new Set(iv.photoExcl || []);
  let phs = [];
  try {
    phs = (await photoGetMany(invPhotoIds(d).filter((i) => !exP.has(i)))).slice(0, FAR_PH_MAX);
  } catch (e) {}
  const due = iv.farDue || addBiz(iv.farReq || today(), num(S.farDays) || 5);
  const row = (k, v) => `<tr><th>${k}</th><td>${v || '-'}</td></tr>`;
  const html = reportFrame(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>FAR 요청 — ${esc(defLabel(d))}</title><style>
  body{font-family:'Malgun Gothic',sans-serif;font-size:12px;margin:24px;color:#111}h1{font-size:19px;margin:6px 0 2px;text-align:center;letter-spacing:2px}
  .sub{text-align:center;color:#555;margin-bottom:14px}table{width:100%;border-collapse:collapse;margin-bottom:12px}th,td{border:1px solid #555;padding:6px 8px;vertical-align:top;text-align:left}
  th{background:#eef1f6;width:22%;font-weight:600}.two td{width:28%}.req li{margin:4px 0;line-height:1.5}.ntc{border:1.5px solid #b42318;color:#7a1414;padding:8px 10px;margin:10px 0;line-height:1.5}
  .pg{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pg figure{margin:0;border:1px solid #ccc;padding:4px;break-inside:avoid}.pg img{width:100%;max-height:62mm;object-fit:contain}.pg figcaption{font-size:10.5px;color:#444;text-align:center}
  .sig{margin-top:18px;display:flex;justify-content:space-between;color:#333}</style></head><body>
  ${logoHead()}<h1>불량 원인 분석 요청서</h1><div class="sub">Failure Analysis Report (FAR) Request</div>
  <table class="two"><tr><th>수신</th><td>${esc(sp?.name || '-')}${att ? ` · ${esc(att.name)}` : ''}</td>
    <th>발신</th><td>${esc(S.company)} ${esc(S.dept)} · ${esc(d.owner || '')}</td></tr>
  <tr><th>요청일</th><td>${esc(iv.farReq || today())}</td><th>회신 기한</th><td><b style="color:#b42318">${esc(due)}</b></td></tr></table>
  <table>${row('발생일 / 발생처', `${esc(d.date)} / ${esc(d.source)}`)}
  ${
    d.fgNo || d.fgName
      ? row(
          '발견 품목 (완성품)',
          `${esc(d.fgNo)} ${esc(d.fgName)}${d.fgQty !== '' && d.fgQty != null ? ` · ${num(d.fgQty).toLocaleString()} EA` : ''}`,
        )
      : ''
  }
  ${row('대상 부품 (추정)', d.partNo || d.partName ? `${esc(d.partNo)} ${esc(d.partName)}` : '조사 중')}
  ${row('불량 유형 / 수량', `${esc(d.type)} / ${num(d.qty).toLocaleString()} EA${d.inspQty ? ` (로트 ${num(d.inspQty).toLocaleString()} EA 중)` : ''}`)}
  ${row('LOT / 납품일자', esc(lotOf(d)))}
  ${row('불량 현상', nl(d.desc))}
  ${row('당사 임시조치', nl(d.containment))}
  ${iv.farPurpose ? row('요청 목적', esc(iv.farPurpose)) : ''}
  ${(iv.farItems || []).length ? row('요청 분석 항목', esc(iv.farItems.join(' / '))) : ''}
  ${
    iv.sample || iv.farShipDate || iv.farShipRef
      ? row('불량 샘플', esc([iv.sample, iv.farShipDate && '발송 ' + iv.farShipDate, iv.farShipRef].filter(Boolean).join(' · ')))
      : ''
  }</table>
  <b>요청 사항</b><ol class="req">
    <li>불량 원인 분석 보고서(FAR)를 <b>${esc(due)}</b>까지 회신 바랍니다 — 발생 원인 · 유출 원인, 분석 근거(측정 데이터 · 시험 결과 · 사진) 포함.</li>
    <li>동일 LOT 및 의심 LOT의 재고(사내 · 운송 중)를 즉시 확인 · 격리하고 결과를 함께 회신 바랍니다.</li>
    <li>분석 방법 · 조건과 측정 데이터 원본을 첨부하고, 분석 후 시료 반환 여부를 알려 주시기 바랍니다.</li>
    <li>분석 결과 귀사 부품의 문제로 확인될 경우, 별도 부적합 통보(NCR)에 따라 대책서를 요청드립니다.</li></ol>
  ${
    iv.costNotice
      ? `<div class="ntc">※ 본 건의 원인이 귀사 부품으로 확인될 경우, 선별 · 재작업 · 폐기 · 물류 등 당사에 발생한 비용을 청구할 수 있음을 알려드립니다. 비용 내역은 원인 확정 후 별도 통보드립니다.</div>`
      : ''
  }
  ${
    phs.length
      ? `<b>불량 사진</b><div class="pg">${phs
          .map((p) => `<figure><img src="${p.data}">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`)
          .join('')}</div>`
      : ''
  }
  <div class="sig"><span>${esc(S.issuerPhone ? 'Tel. ' + S.issuerPhone : '')} ${esc(
    S.issuerEmail ? 'E-mail. ' + S.issuerEmail : '',
  )}</span><span>${esc(S.company)} 품질 담당 ${esc(d.owner || '')}</span></div>
  </body></html>`);
  reportShow(w, html, `FAR요청_${d.date}_${(d.partNo || d.fgNo || '').replace(/[^\w가-힣-]/g, '')}.html`);
}
function respChanged(init) {
  const f = $('#mf');
  if (!f || !f.resp) return;
  const r = f.resp.value;
  const iw = $('#invWrap');
  if (iw && r === '미정') iw.open = true;
  const cw = $('#icaWrap');
  if (cw) cw.style.display = r === '사내' ? '' : 'none';
  const sl = $('#shareL');
  if (sl) sl.style.display = r === '공동' || (f.inv_verdict && f.inv_verdict.value === '공동') ? '' : 'none';
  icaShow();
  escShow();
}
// 수입검사 검출 판정 칸은 공정 · 출하 · 고객 발견 + 협력사/공동 귀책일 때만
function escShow() {
  const f = $('#mf'),
    w = $('#escRow');
  if (!f || !w || !f.source || !f.resp) return;
  w.style.display = escAsk({ source: f.source.value, resp: f.resp.value }) ? '' : 'none';
}
function icaSync() {
  const f = $('#mf');
  if (!f || !f.ica_level || typeof sevDraft !== 'function') return;
  const a = icaLevelAuto(sevDraft());
  const e = $('#icaAuto');
  if (e) e.textContent = a;
  if (!f.ica_level.dataset.touched && f.ica_level.value !== a) {
    f.ica_level.value = a;
    icaShow();
  }
}
function icaShow() {
  const f = $('#mf');
  if (!f || !f.ica_level) return;
  const lv = f.ica_level.value,
    simple = lv === '간이 대책',
    none = lv === ICA_NONE;
  const SL = { d4: '원인 (발생 · 유출)', d5: '대책 내용', d6: '적용일 · 효과 확인' };
  document.querySelectorAll('#icaD [data-ik]').forEach((el) => {
    const k = el.dataset.ik;
    el.style.display = none ? 'none' : simple && !SL[k] ? 'none' : 'block';
    const lb = el.querySelector('.il');
    lb.textContent = simple && SL[k] ? SL[k] : lb.dataset.o;
  });
  $('#icaStd').style.display = none ? 'none' : '';
}
function invAuto() {
  const f = $('#mf');
  if (f.inv_farReq.value) f.inv_farDue.value = addBiz(f.inv_farReq.value, num(db.settings.farDays) || 5);
}
let curSev = {};
/* ---- 조사 · 진행 기록 (통합 타임라인) ---- */
const LOG_KINDS = ['협력사 연락', '현장 확인', '측정·시험', '회의·보고', '조치 실시', '조사', '기타'];
const LOG_CLS = {
  조사: 'inf',
  '협력사 연락': 'warn',
  '현장 확인': 'inf',
  '측정·시험': 'inf',
  '시험·분석': 'inf',
  '회의·보고': 'mut',
  '조치 실시': 'ok',
  조치: 'ok',
  기타: 'mut',
  자동: 'mut',
};
const lastLog = (d) => (d.logs || []).slice().sort(lgCmpDesc)[0];
const defLabel = (d) => `${d.date} ${d.partName || d.partNo || (d.fgName || d.fgNo ? '[완성품] ' + (d.fgName || d.fgNo) : '')}`;
const ncrOfDefect = (d) => (d.ncrId ? db.ncrs.find((n) => n.id === d.ncrId) : null);
