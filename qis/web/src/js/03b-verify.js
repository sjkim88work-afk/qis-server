/* ── 공통 부품: 유효성 검증 ──────────────────────────────────────────
   대책이 효과가 있었는지 확인하는 칸 · 검증 LOT · 판정 · 출력을 한 곳에 둠.
   쓰는 곳: 불량의 사내 대책 (d.ica) · NCR (n) · RCA (판정 이름과 표시만 — 값은 합격 / 조건부 / 불합격 그대로).
   기록에 저장하는 이름은 같음: verifyDue · verifyDate · verifyResult · vlots · verifyHist.
   이 파일을 고치면 세 화면이 같이 바뀜. */
const VF_RESULTS = ['유효', '무효(재발)'];
const vfOk = (r) => r === '유효';
const vfNg = (r) => String(r || '').startsWith('무효');

// 판정: 검증 완료 · 재발 · 검증 대기 · 검증 지연. v = { verifyDue, verifyDate, verifyResult }
function vfInfo(v) {
  if (!v) return null;
  if (v.verifyDate && vfOk(v.verifyResult)) return { k: 'ok', label: '검증 완료', cls: 'ok' };
  if (v.verifyDate && vfNg(v.verifyResult)) return { k: 'ng', label: '재발(검증 무효)', cls: 'bad' };
  if (!v.verifyDue) return { k: 'wait', label: '검증 대기', cls: 'mut' };
  const x = diffDays(today(), v.verifyDue);
  return x < 0 ? { k: 'late', label: `검증 지연 D+${-x}`, cls: 'bad' } : { k: 'wait', label: `검증 대기 D-${x}`, cls: x <= 3 ? 'warn' : 'mut' };
}
// RCA 의 효과검증을 같은 이름으로 보임: 합격 · 조건부 = 검증 완료 (조건부는 표시), 불합격 = 재발, 그 밖은 종료일로 대기 · 지연
function vfRcaInfo(c) {
  if (!c) return null;
  if (c.VerifyResult === '합격') return { k: 'ok', label: '검증 완료', cls: 'ok' };
  if (c.VerifyResult === '조건부') return { k: 'ok', label: '검증 완료(조건부)', cls: 'warn' };
  if (c.VerifyResult === '불합격') return { k: 'ng', label: '재발(검증 무효)', cls: 'bad' };
  return vfInfo({ verifyDue: c.VerifyEnd || '' });
}

/* ---- 검증 LOT (대책 적용 뒤에 들어온 LOT 별 결과) — 한 창에 한 개 ---- */
let curVLots = [];
function vfLotsInit(v) {
  curVLots = (v && v.vlots && v.vlots.length ? v.vlots : [{}, {}, {}]).map((r) => ({
    lot: r.lot || '',
    date: r.date || '',
    insp: r.insp ?? '',
    ng: r.ng ?? '',
  }));
}
const vfLotsOut = () => curVLots.filter((r) => r.lot || r.date || r.insp || r.ng);
function vlotVerdict(r) {
  const i = numC(r.insp),
    g = numC(r.ng);
  if (!i && !String(r.ng || '').trim()) return '';
  return g > 0 ? '불합격' : i > 0 ? '합격' : '';
}
const vfLotCount = (rows) => {
  const vs = (rows || []).map(vlotVerdict);
  return { ok: vs.filter((v) => v === '합격').length, ng: vs.filter((v) => v === '불합격').length };
};
function renderVLots() {
  const b = $('#vlotBox');
  if (!b) return;
  b.innerHTML = `<table class="ct" style="margin-top:4px"><thead><tr><th>LOT No.</th>
    <th>입고일</th><th>검사 (EA)</th><th>불량 (EA)</th><th>판정</th><th></th></tr></thead><tbody>${curVLots
      .map(
        (r, i) => `<tr>
    <td><input value="${esc(r.lot)}" style="width:150px" oninput="curVLots[${i}].lot=this.value;mfDirty=true"></td>
    <td><input type="date" value="${esc(r.date)}" oninput="curVLots[${i}].date=this.value;mfDirty=true"></td>
    <td><input value="${esc(r.insp)}" style="width:90px" inputmode="numeric" oninput="curVLots[${i}].insp=this.value;mfDirty=true;vlotRefresh()"></td>
    <td><input value="${esc(r.ng)}" style="width:90px" inputmode="numeric" oninput="curVLots[${i}].ng=this.value;mfDirty=true;vlotRefresh()"></td>
    <td data-vv="${i}"></td>
    <td><button type="button" class="b s d" onclick="curVLots.splice(${i},1);mfDirty=true;renderVLots()">✕</button></td></tr>`,
      )
      .join('')}</tbody></table>
    <div class="muted" id="vlotNote" style="font-size:12px;margin-top:4px"></div>`;
  vlotRefresh();
}
function vlotRefresh() {
  const vs = curVLots.map(vlotVerdict),
    { ok, ng } = vfLotCount(curVLots),
    need = num(db.settings.verifyLots) || 3;
  document.querySelectorAll('#vlotBox [data-vv]').forEach((td) => {
    const v = vs[td.dataset.vv];
    td.innerHTML = v ? `<span class="bg ${v === '합격' ? 'ok' : 'bad'}">${v}</span>` : '<span class="muted">-</span>';
  });
  const e = $('#vlotNote');
  if (e)
    e.innerHTML = `합격 ${ok} LOT${ng ? ` · <span style="color:var(--bad)">불합격 ${ng} LOT — 검증 결과 ‘무효(재발)’ 검토</span>` : ''}${
      ok >= need && !ng ? ` · ${need} LOT 무불량 충족 — 검증일·결과 ‘유효’를 입력하면 종결됩니다` : ''
    }`;
}

/* ---- 입력 화면 조각 ---- */
// 칸 3개: 검증 기한 · 검증일 · 검증 결과. o.pre = 칸 이름 앞머리 ('' = NCR, 'ica_' = 사내 대책)
function vfFieldsHTML(v, o = {}) {
  const p = o.pre || '';
  v = v || {};
  return `<label ${o.dueTitle ? `title="${esc(o.dueTitle)}"` : ''}>${esc(o.dueLabel || '유효성 검증 기한')}<input type="date" name="${p}verifyDue" value="${esc(v.verifyDue)}"></label>
    <label>유효성 검증일<input type="date" name="${p}verifyDate" value="${esc(v.verifyDate)}"></label>
    <label>검증 결과<select name="${p}verifyResult">${opts(VF_RESULTS, v.verifyResult, true)}</select></label>`;
}
// 검증 LOT 표 (제목 + 행 추가 + 표 자리). 그린 뒤 renderVLots() 를 부름
function vfLotsHTML(note) {
  return `<div style="font-size:12px;color:var(--sub);margin-top:10px">검증 LOT ${note ? `<span class="muted">${note}</span> ` : ''}<button type="button" class="b s" onclick="curVLots.push({lot:'',date:'',insp:'',ng:''});mfDirty=true;renderVLots()">+ 행</button></div>
  <div id="vlotBox"></div>`;
}
// 검증 결과가 무효(재발) 일 때의 안내와 ‘재대책’ 단추 · 이전 검증 이력
function vfReworkHTML(v, onclick, label) {
  v = v || {};
  return `${
    vfNg(v.verifyResult) && onclick
      ? `<div class="banner" style="background:var(--badb);border-color:transparent;margin-top:10px">검증 결과 <b>무효(재발)</b> — 대책이 효과가 없었습니다. <button type="button" class="b s" onclick="${onclick}">${esc(label || '재대책 요청')}</button> <span class="muted">이번 검증 기록은 이력으로 남습니다.</span></div>`
      : ''
  }${
    (v.verifyHist || []).length
      ? `<div class="muted" style="font-size:12px;margin-top:8px">이전 검증 이력: ${v.verifyHist
          .map((h, i) => `${i + 1}차 ${esc(h.date)} ${esc(h.result)}`)
          .join(' · ')}</div>`
      : ''
  }`;
}
// ‘유효’ 로 저장해도 되는지: 안 되면 그 이유 (글), 되면 ''. need = 필요한 합격 LOT 수 (0 = 보지 않음)
function vfValidMsg(rows, need) {
  const { ok, ng } = vfLotCount(rows);
  if (ng) return `검증 LOT에 불합격 ${ng}건이 있어 ‘유효’로 할 수 없습니다 — ‘무효(재발)’을 검토하세요`;
  if (need && ok < need) return `검증 LOT 합격이 ${ok}개입니다 — ${need}개 이상이어야 ‘유효’로 종결합니다 (설정에서 변경)`;
  return '';
}
// 재대책: 이번 검증 기록을 이력으로 옮기고 검증 칸을 비움. extra = 이력에 같이 남길 값
function vfArchive(v, extra) {
  v.verifyHist = (v.verifyHist || []).concat([
    { date: v.verifyDate || today(), result: v.verifyResult, vlots: v.vlots || [], ...(extra || {}), at: today() },
  ]);
  v.verifyDate = '';
  v.verifyResult = '';
  v.vlots = [];
  v.verifyDue = '';
}
// 재발 횟수: 지금 결과 + 이력
const vfNgCount = (v) => (vfNg(v && v.verifyResult) ? 1 : 0) + ((v && v.verifyHist) || []).filter((h) => vfNg(h.result)).length;

/* ---- 출력 문서 조각 ---- */
function vfLotsPrint(rows) {
  return (rows || []).length
    ? `<table class="sm"><tr><th>검증 LOT</th><th>입고일</th><th>검사 (EA)</th><th>불량 (EA)</th><th>판정</th></tr>${rows
        .map((r) => `<tr><td>${esc(r.lot)}</td><td>${esc(r.date)}</td><td>${esc(r.insp)}</td><td>${esc(r.ng)}</td><td>${vlotVerdict(r)}</td></tr>`)
        .join('')}</table>`
    : '';
}
