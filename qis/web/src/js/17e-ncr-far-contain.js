// ── NCR — FAR 맞춤 · D3 봉쇄 · 검증 LOT · 재고 ──
function farState(n) {
  if (!farOn(n)) return '';
  const f = n.far;
  if (f.replyDate) return f.review === '재분석 요청' ? '재분석 요청' : '회신';
  return f.due && today() > f.due ? '지연' : '요청';
}
const FAR_CLS = { 요청: 'inf', 지연: 'bad', 회신: 'ok', '재분석 요청': 'warn' };
const farBadge = (n) => {
  const st = farState(n);
  return st ? `<span class="bg ${FAR_CLS[st]}" title="불량 분석 요청 (FAR)">FAR ${st}</span>` : '';
};
// NCR 창 위쪽의 FAR 요약 (읽기 전용) — 입력 · 요청서 출력은 FAR 화면에서 함
function farLine(n) {
  const f = n && n.far;
  if (!f || !f.reqDate) return '';
  const bits = [
    `요청 ${esc(f.reqDate)}`,
    f.replyDate ? `회신 ${esc(f.replyDate)}` : f.due ? `회신 기한 ${esc(f.due)}` : '',
    f.verdict ? `협력사 분석 판정: ${esc(f.verdict)}` : '',
    f.review ? `당사 검토: ${esc(f.review)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return `<div class="banner" id="farLine" style="background:var(--pri2);border-color:transparent;color:var(--ink)">${farBadge(n) || '<b>FAR</b>'} ${bits}${
    f.src && db.defects.find((d) => d.id === f.src)
      ? ` <a class="lk" onclick="farGoInv('${f.src}')">FAR 열기</a>`
      : ' <span class="muted">(연결 불량이 없는 NCR — 읽기만 됩니다)</span>'
  }${f.summary ? `<div style="margin-top:3px;font-size:13px;white-space:pre-wrap">${esc(f.summary)}</div>` : ''}</div>`;
}
// FAR 은 FAR 화면(연결 불량의 귀책 조사)이 원본 — NCR 창에서는 입력하지 않음.
// n.far 는 연결 불량의 FAR 를 그대로 비춘 값(목록 배지 · 통보서 문구 · 지연 알림용)이고, src 에 원본 불량 id 를 둠.
const FAR_SHARED = [
  ['reqDate', 'farReq'],
  ['due', 'farDue'],
  ['replyDate', 'farRecv'],
  ['sampleQty', 'sample'],
  ['summary', 'farResult'],
  ['purpose', 'farPurpose'],
  ['items', 'farItems'],
  ['shipDate', 'farShipDate'],
  ['shipRef', 'farShipRef'],
  ['verdict', 'farVerdict'],
  ['review', 'farReview'],
  ['note', 'farNote'],
];
const farEmpty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
const farSame = (a, b) => JSON.stringify(farEmpty(a) ? '' : a) === JSON.stringify(farEmpty(b) ? '' : b);
function farFromInv(d) {
  const iv = d.inv || {},
    f = { src: d.id };
  FAR_SHARED.forEach(([nk, ik]) => {
    const v = iv[ik];
    f[nk] = nk === 'items' ? (Array.isArray(v) ? [...v] : []) : String(v ?? '');
  });
  return f;
}
function invFarSrc(ids) {
  return (
    (ids || [])
      .map((i) => db.defects.find((d) => d.id === i))
      .filter((d) => d && d.inv && d.inv.farReq)
      .sort((a, b) => (b.inv.farReq || '').localeCompare(a.inv.farReq || ''))[0] || null
  );
}
// NCR 의 far 를 연결 불량의 FAR 에 맞춤. 돌려줌: {far, src, chFar, chInv} — 할 일이 없으면 null
//  · 예전에 NCR 창에서 입력한 값(요청 목적 · 분석 항목 · 발송 · 판정 · 검토 등)은 FAR 화면이 비어 있을 때만 FAR 화면으로 옮김
//  · 연결 불량에 FAR 가 없고 NCR 에만 있으면(옛 기록) 첫 연결 불량의 FAR 로 옮김. 연결 불량이 없는 NCR 은 그대로 둠
function farAlign(far, ids, write = true) {
  const ds = (ids || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean),
    has = !!(far && far.reqDate);
  let src = invFarSrc(ids),
    chInv = false;
  if (!src) {
    if (!has) return null;
    if (far.src) return { far: null, src: null, chFar: true, chInv: false }; // FAR 화면에서 지웠거나 그 불량의 연결을 해제함
    if (!ds.length || !write) return null; // 연결 불량이 없는 옛 NCR — 그대로 둠
    src = ds[0];
    src.inv = src.inv || {};
  }
  const iv = src.inv;
  // 예전에 FAR 화면 값에서 자동으로 만들었던 항목은 옮기지 않음
  const der =
    has && /^불량 귀책 조사에서 이어받음/.test(far.note || '')
      ? {
          note: far.note,
          purpose: '귀책 판정',
          review: iv.verdict ? '수용' : '',
          verdict: { 협력사: '협력사 귀책 인정', 공동: '추가 분석 필요', 사내: '귀책 불인정', '원인 불명': '원인 불명·재현 안 됨' }[iv.verdict] || '',
        }
      : {};
  if (has && write)
    FAR_SHARED.forEach(([nk, ik]) => {
      const b = far[nk];
      if (farEmpty(iv[ik]) && !farEmpty(b) && !(nk in der && der[nk] === b)) {
        iv[ik] = Array.isArray(b) ? [...b] : b;
        chInv = true;
      }
    });
  const f = farFromInv(src);
  return { far: f, src, chFar: !has || far.src !== f.src || FAR_SHARED.some(([nk]) => !farSame(far[nk], f[nk])), chInv };
}
// 저장된 모든 NCR 을 FAR 화면에 맞춤 (화면을 그릴 때 · 저장할 때 호출 — 바뀐 것만 고침)
function farSyncAll() {
  if (typeof RO !== 'undefined' && RO) return 0;
  let n = 0;
  (db.ncrs || []).forEach((x) => {
    const r = farAlign(x.far, x.defectIds);
    if (!r) return;
    if (r.chFar) {
      x.far = r.far;
      touch(x);
      n++;
    }
    if (r.chInv && r.src) {
      touch(r.src);
      n++;
    }
  });
  return n;
}
// NCR 창에서 FAR 화면으로 — 쓰던 내용이 있으면 물어봄
async function farGoInv(did) {
  if (
    mfDirty &&
    !(await askConfirm({
      title: '저장하지 않은 내용이 있습니다',
      msg: 'NCR 창을 닫고 FAR 화면을 엽니다. 쓰던 내용은 사라집니다.',
      ok: 'FAR 열기',
      danger: false,
    }))
  )
    return;
  closeModal(true);
  state.tab = 'defect';
  state.defView = 'inv';
  render();
  editInv(did);
}

function typeDays(t, S) {
  S = S || db.settings;
  return t === '간이 대책서' ? num(S.replySimple) || 5 : num(S.reply8D) || num(S.replyDays) || 7;
}
let curStock = [],
  curExcl = new Set(),
  curContain = [];
function renderContain() {
  const b = $('#containBox');
  if (!b) return;
  b.innerHTML = `<table class="ct" style="margin-top:4px"><thead><tr><th>재고 위치</th><th>대상 (EA)</th>
    <th>선별 (EA)</th><th>불량 (EA)</th><th>완료일</th><th></th></tr></thead><tbody>${curContain
      .map(
        (r, i) => `<tr>
    <td><input value="${esc(r.loc)}" style="width:140px" placeholder="예: 협력사 창고" oninput="curContain[${i}].loc=this.value;mfDirty=true"></td>
    ${['target', 'sorted', 'ng']
      .map(
        (k) =>
          `<td><input value="${esc(r[k])}" style="width:100px" inputmode="numeric" oninput="curContain[${i}].${k}=this.value;mfDirty=true;containFoot()"></td>`,
      )
      .join('')}
    <td><input type="date" value="${esc(r.done)}" oninput="curContain[${i}].done=this.value;mfDirty=true"></td>
    <td><button type="button" class="b s d" onclick="curContain.splice(${i},1);mfDirty=true;renderContain()">✕</button></td></tr>`,
      )
      .join('')}</tbody>
    <tfoot id="containFoot"></tfoot></table>`;
  containFoot();
}
function containFoot() {
  const e = $('#containFoot');
  if (!e) return;
  const tot = (k) => curContain.reduce((a, r) => a + numC(r[k]), 0),
    T = tot('target'),
    So = tot('sorted');
  e.innerHTML = `<tr><td><b>합계</b></td><td style="padding-left:12px">${T.toLocaleString()}</td>
    <td style="padding-left:12px">${So.toLocaleString()}</td>
    <td style="padding-left:12px">${tot('ng').toLocaleString()}</td><td colspan="2" class="muted" style="font-size:12px">${
      T && So < T ? `미선별 ${(T - So).toLocaleString()} EA` : ''
    }</td></tr>`;
}
function renderStock() {
  const b = $('#stockBox');
  if (!b) return;
  b.innerHTML = `<table class="ct" style="margin-top:4px"><thead><tr><th>구분</th>
    <th>Quantity Stocked (재고보유수량)</th><th>Check Quality (확인된 불량수량)</th><th></th></tr></thead><tbody>${curStock
      .map(
        (r, i) => `<tr>
    <td><input value="${esc(r.loc)}" style="width:150px" placeholder="예: Customer, W/H" oninput="curStock[${i}].loc=this.value;mfDirty=true"></td>
    <td><input value="${esc(r.stocked)}" style="width:170px" placeholder="예: 76,000EA 또는 -" oninput="curStock[${i}].stocked=this.value;mfDirty=true"></td>
    <td><input value="${esc(r.ng)}" style="width:170px" placeholder="예: 24,000EA 또는 -" oninput="curStock[${i}].ng=this.value;mfDirty=true"></td>
    <td><button type="button" class="b s d" onclick="curStock.splice(${i},1);mfDirty=true;renderStock()">✕</button></td></tr>`,
      )
      .join('')}</tbody></table>`;
}
