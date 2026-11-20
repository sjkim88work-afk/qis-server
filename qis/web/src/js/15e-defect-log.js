// ── 불량 · NCR 실행 기록 — 자동 이벤트 · 기록 작성/수정/취소 · 출력 · 불량 진행 창 ──
function autoEvents(d, n, lbl) {
  const E = [],
    add = (date, text, src) => {
      if (date) E.push({ date, kind: '자동', text, auto: true, src });
    };
  if (d) {
    const sl = lbl || '',
      iv = d.inv || {},
      ic = d.ica || {};
    if (iv.farReq) add(iv.farReq, `FAR 요청 — 회신 기한 ${iv.farDue || '-'}${iv.costNotice ? ' · 비용 청구 가능성 통보' : ''}`, sl);
    if (iv.farRecv) add(iv.farRecv, `FAR 회신 접수${iv.farDue && iv.farRecv > iv.farDue ? ' (기한 초과)' : ''}`, sl);
    if (iv.verdict)
      add(
        iv.verdictDate,
        `귀책 판정 — ${iv.verdict}${
          iv.verdict === '공동' && iv.share !== '' && iv.share != null ? ` (협력사 ${iv.share}%)` : ''
        }${iv.basis ? ' · ' + iv.basis : ''}`,
        sl,
      );
    if (ic.doneDate) add(ic.doneDate, `사내 대책 완료 (${icaLevel(d)}) — 유효성 검증 기한 ${ic.verifyDue || '-'}`, sl);
    if (ic.verifyDate) add(ic.verifyDate, `사내 대책 유효성 검증 — ${ic.verifyResult || '결과 미입력'}`, sl);
    if (d.closed) add(d.closed.date, `수동 종결 — ${d.closed.reason || ''}`, sl);
    if (d.doneDate && !d.ncrId) add(d.doneDate, '처리 완료', sl);
    add(d.date, `불량 등록 — ${d.source || ''} ${d.type || ''} ${num(d.qty).toLocaleString()}개 · 심각도 ${sevOf(d).grade}`, sl);
    const c = d.claim;
    if (c) {
      if (c.reqDate) add(c.reqDate, `구상 청구 ${won(c.reqAmt)}원`, sl);
      if (c.agreeDate) add(c.agreeDate, `구상 합의 ${won(c.agreeAmt)}원`, sl);
      if (c.recvDate) add(c.recvDate, `구상 회수 ${won(c.recvAmt)}원${c.method ? ' (' + c.method + ')' : ''}`, sl);
    }
  }
  if (n) {
    add(n.issueDate, `${n.no} 발행 — ${n.reqType || '8D 보고서'}${n.basis ? ' · 근거: ' + n.basis : ''}`, 'NCR');
    add(n.notifyDate, `협력사 통보${n.notifyMethod ? ' (' + n.notifyMethod + ')' : ''}`, 'NCR');
    if (n.reqType !== '단순 통보') {
      add(n.requestDate, `대책 요청 — 회신 기한 ${n.dueDate || '-'}`, 'NCR');
      add(
        n.d3Date,
        `D3 봉쇄 회신 접수${n.d3Due && n.d3Date > n.d3Due ? ' (기한 초과)' : ''}${n.cleanPoint ? ' — 클린 포인트 ' + n.cleanPoint : ''}`,
        'NCR',
      );
      add(n.replyDate, `대책서 회신 접수${n.dueDate && n.replyDate && n.replyDate > n.dueDate ? ' (기한 초과)' : ''}`, 'NCR');
      (n.resubs || []).forEach((x, k) => add(x.date, `보완 대책서 재회신 접수 (${k + 1}차)`, 'NCR'));
    }
    (n.evals || []).filter(evalDone).forEach((e, i) => add(e.date, `대책서 평가 ${i + 1}차 — ${evalScore(e)}점 ${evalVerdict(e)}`, 'NCR'));
    if (n.approvedDate) add(n.approvedDate, `대책서 승인 — 연결 불량 완료 처리 · 유효성 검증 기한 ${n.verifyDue || '-'}`, 'NCR');
    if (n.verifyDate) add(n.verifyDate, `유효성 검증 — ${n.verifyResult || '결과 미입력'}`, 'NCR');
    if (farOn(n)) {
      const f = n.far;
      add(f.reqDate, `FAR 요청 — ${f.purpose || '불량 분석'}${f.sampleQty ? ' · 시료 ' + f.sampleQty : ''} · 회신 기한 ${f.due || '-'}`, 'NCR');
      add(f.shipDate, `FAR 시료 발송${f.shipRef ? ' — ' + f.shipRef : ''}`, 'NCR');
      add(f.replyDate, `FAR 분석 결과 회신 — ${f.verdict || '판정 미입력'}${f.due && f.replyDate > f.due ? ' (기한 초과)' : ''}`, 'NCR');
    }
  }
  return E;
}
function caseReadonly(kind, obj) {
  if (kind === 'defect') {
    const n = ncrOfDefect(obj);
    return [...autoEvents(obj, null), ...(n ? autoEvents(null, n) : []), ...(n ? (n.logs || []).map((l) => ({ ...l, src: 'NCR', ro: true })) : [])];
  }
  const ds = (obj.defectIds || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean);
  return [
    ...autoEvents(null, obj),
    ...ds.flatMap((d) => [...autoEvents(d, null, defLabel(d)), ...(d.logs || []).map((l) => ({ ...l, src: defLabel(d), ro: true, _did: d.id }))]),
  ];
}
function caseEntries(kind, obj) {
  return [...(obj.logs || []), ...caseReadonly(kind, obj)];
}
const caseLast = (kind, obj) => caseEntries(kind, obj).reduce((a, e) => (e.date > a ? e.date : a), '');
const caseLastManual = (kind, obj) =>
  caseEntries(kind, obj)
    .filter((e) => !e.auto)
    .sort(lgCmpDesc)[0];
let curLogs = [];
let tl = {
  own: [],
  kind: '',
  obj: null,
  edit: null,
  voiding: null,
  hist: new Set(),
  hideAuto: false,
  next: null,
  newPh: {},
  draftPh: [],
  editPh: null,
};
const LOG_METHODS = ['전화', '메일', '방문', '회의', '메신저', '공문', '기타'];
const phCache = {};
function tlInit(kind, obj) {
  tl = {
    own: JSON.parse(JSON.stringify(obj.logs || [])),
    kind,
    obj,
    edit: null,
    voiding: null,
    hist: new Set(),
    hideAuto: tl.hideAuto,
    newPh: {},
    draftPh: [],
    editPh: null,
    other: false,
  };
  curLogs = tl.own;
  renderLogs();
  tlLoadThumbs();
  // 기록은 바로 저장하므로, 창의 ‘저장하지 않은 내용’ 표시(mfDirty)를 기록과 그 밖의 입력으로 나눠서 봄
  const mf = $('#mf'),
    lb = $('#logBox');
  if (mf && !mf._tlWatch) {
    mf._tlWatch = 1;
    const h = (e) => {
      if (!(e.target.closest && e.target.closest('#logBox'))) tl.other = true;
    };
    mf.addEventListener('input', h);
    mf.addEventListener('change', h);
  }
  if (lb && !lb._tlWatch) {
    lb._tlWatch = 1;
    lb.addEventListener('focusin', () => {
      if (mfDirty && !tlDraftHas() && tl.edit == null) tl.other = true;
    });
  }
}
// 쓰다 만 기록이 있나
function tlDraftHas() {
  return ['lgText', 'lgResult', 'lgParty'].some((k) => ((document.getElementById(k) || {}).value || '').trim()) || tl.draftPh.length > 0;
}
// 실행 기록은 바로 저장 — 추가 · 수정 · 취소 처리 · 삭제를 할 때마다 대상(불량 · NCR)에 반영. 아직 저장하지 않은 새 NCR 은 창을 저장할 때 함께 저장
function tlPersist(msg) {
  const id = tl.obj && tl.obj.id,
    o = id && (tl.kind === 'ncr' ? db.ncrs : db.defects).find((x) => x.id === id);
  if (!o || (typeof RO !== 'undefined' && RO)) {
    mfDirty = true;
    return false;
  }
  o.logs = tlCommit().logs;
  tl.own.forEach((x) => {
    delete x._new;
    delete x._dirty;
  });
  touch(o);
  save();
  mfDirty = (tl.kind === 'ncr' && !!tl.other) || tl.edit != null || tlDraftHas();
  render();
  renderLogs();
  if (msg) toast(msg);
  return true;
}
async function tlLoadThumbs() {
  const ids = [...tl.own, ...caseReadonly(tl.kind, tl.obj)].flatMap((l) => l.photos || []).filter((i) => !phCache[i] && !tl.newPh[i]);
  if (!ids.length) return;
  try {
    (await photoGetMany(ids)).forEach((r) => {
      phCache[r.id] = r;
    });
    renderLogs();
  } catch (e) {}
}
const phRec = (id) => tl.newPh[id] || phCache[id];
const LOG_DRAFT = [
  'lgDate',
  'lgKind',
  'lgParty',
  'lgMethod',
  'lgText',
  'lgResult',
  'leDate',
  'leKind',
  'leParty',
  'leMethod',
  'leText',
  'leResult',
  'leReason',
  'lvReason',
];
function renderLogs(keepDraft = true) {
  const b = $('#logBox');
  if (!b) return;
  const draft = {};
  if (keepDraft)
    LOG_DRAFT.forEach((k) => {
      const e = document.getElementById(k);
      if (e) draft[k] = e.value;
    });
  renderLogsInner(b);
  LOG_DRAFT.forEach((k) => {
    const e = document.getElementById(k);
    if (e && draft[k] !== undefined) e.value = draft[k];
  });
}
const lgLate = (x) => x.at && x.date && diffDays(x.date, loc(x.at, 10)) >= 2;
function lgThumbs(ids, editable) {
  return (ids || []).length
    ? `<div class="lgph">${ids
        .map((id, k) => {
          const r = phRec(id);
          return `<span class="t">${
            r
              ? `<img src="${r.thumb || r.data}" onclick="lgViewPh('${id}')" title="${esc(r.caption || r.name || '')}">`
              : '<span class="ld">📎</span>'
          }${editable ? `<a onclick="${editable}(${k})" title="빼기">✕</a>` : ''}</span>`;
        })
        .join('')}</div>`
    : '';
}
function lgViewPh(id) {
  const all = [...new Set([...tl.own, ...caseReadonly(tl.kind, tl.obj)].flatMap((l) => l.photos || []).concat(tl.draftPh, tl.editPh || []))]
    .map(phRec)
    .filter(Boolean);
  const i = all.findIndex((r) => r.id === id);
  if (i >= 0) lbOpen(all, i);
}
async function lgAddFiles(files, target) {
  const imgs = files.filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) {
    if (files.length) toast('이미지 파일만 첨부할 수 있습니다 (메일·문서는 화면 캡처로 첨부)');
    return;
  }
  const S = db.settings;
  for (const f of imgs) {
    try {
      const im = await readImg(f);
      const r = {
        id: uid(),
        name: f.name || '붙여넣은 이미지.jpg',
        caption: '',
        data: shrink(im, num(S.photoMax) || 1600, (num(S.photoQ) || 80) / 100),
        thumb: shrink(im, 320, 0.7),
        createdAt: now(),
        isNew: true,
      };
      tl.newPh[r.id] = r;
      (target === 'edit' ? tl.editPh : tl.draftPh).push(r.id);
    } catch (e) {
      toast(e.message);
    }
  }
  mfDirty = true;
  renderLogs();
}
function lgPartyList() {
  const sid = tl.obj && tl.obj.supplierId,
    s = sid && db.suppliers.find((x) => x.id === sid);
  const names = s
    ? (s.contacts || []).filter((c) => c.active !== false && c.name).map((c) => `${s.name} ${c.name}${c.role ? ' (' + c.role + ')' : ''}`)
    : [];
  return names.map((n) => `<option value="${esc(n)}">`).join('');
}
function renderLogsInner(b) {
  const ownL = tl.own.map((x, i) => ({ ...x, _i: i }));
  let L = [...ownL, ...caseReadonly(tl.kind, tl.obj)];
  if (tl.hideAuto) L = L.filter((e) => !e.auto);
  L.sort(lgCmpDesc);
  // 같은 날 직접 쓴 기록이 2건 이상이면 ▲▼로 순서를 바꿀 수 있음 (화면은 최근 것이 위)
  const ownDay = {};
  L.filter((x) => x._i != null).forEach((x) => {
    (ownDay[x.date || ''] = ownDay[x.date || ''] || []).push(x._i);
  });
  const mv = (x) => {
    const D = ownDay[x.date || ''] || [],
      n = D.indexOf(x._i);
    if (D.length < 2 || tl.edit != null || tl.voiding != null) return '';
    return `<span class="mv"><button type="button" class="b s" ${n ? '' : 'disabled'} onclick="lgMove(${x._i},-1)" title="같은 날 안에서 위로" aria-label="위로">▲</button><button type="button" class="b s" ${n < D.length - 1 ? '' : 'disabled'} onclick="lgMove(${x._i},1)" title="같은 날 안에서 아래로" aria-label="아래로">▼</button></span> `;
  };
  const nOwn = L.filter((x) => !x.auto).length,
    nAuto = L.filter((x) => x.auto).length,
    pend = tl.own.filter((x) => x._new).length,
    pendEd = tl.own.filter((x) => x._dirty && !x._new).length;
  const ownCase =
    typeof czOwns === 'function' && czOwns(tl.obj, tl.kind)
      ? (() => {
          const id = tl.obj.caseId || (db.ncrs.find((n) => n.id === tl.obj.ncrId) || {}).caseId;
          return czById('cases', id);
        })()
      : null;
  const dd = (dt) => {
    if (!dt) return '';
    const x = diffDays(today(), dt);
    return `<span class="bg ${x < 0 ? 'bad' : x <= 2 ? 'warn' : 'mut'}">${dt} ${x < 0 ? 'D+' + -x : x === 0 ? '오늘' : 'D-' + x}</span>`;
  };
  const plan = ownCase
    ? `<div class="lgplan" style="background:#f5f9ff;border-color:#cfdcef">이 건은 <a class="lk" onclick="czOpenCase('${ownCase.id}')">RCA ${esc(ownCase.CaseNo)}</a>(으)로 관리 중입니다 · 현재 단계 ${esc(ownCase.Stage)}</div>`
    : '';
  // ② 실행 기록 쓰기
  const comp = `<div class="lgc"><div class="ch">✎ 실행 기록 남기기 <span class="muted" style="font-weight:normal">— 실제로 한 일과 결과만 적습니다. 저장한 기록을 고치면 수정 이력이 남습니다.</span></div>
    <div class="cg"><label>실행일<input type="date" id="lgDate" value="${today()}" max="${today()}"></label>
      <label>구분<select id="lgKind">${opts(LOG_KINDS, LOG_KINDS[0])}</select></label>
      <label>상대방<input id="lgParty" list="lgParties" placeholder="예: 대성정밀 박OO 과장"></label>
      <label>방법<select id="lgMethod">${opts(LOG_METHODS, '', true)}</select></label></div>
    <datalist id="lgParties">${lgPartyList()}</datalist>
    <div class="cg2"><label>실행 내용 *<textarea id="lgText" placeholder="무엇을 했는가 — 예: 출하 대기 재고 300개 전수 선별, 협력사에 불량 시료 5개 전달"></textarea></label>
      <label>결과 · 합의 사항<textarea id="lgResult" placeholder="예: 불량 4개 추가 검출 / 협력사 귀책 인정, 선별비 부담 합의"></textarea></label></div>
    <div class="cf"><label class="b s" style="cursor:pointer">📎 증빙 첨부<input type="file" accept="image/*" multiple style="display:none" onchange="lgAddFiles([...this.files]);this.value=''"></label>
      <span>메일 · 성적서 · 현장 사진 (캡처 후 Ctrl+V 가능)</span>${lgThumbs(tl.draftPh, 'lgRmDraft')}
      <span style="flex:1"></span><button type="button" class="b" onclick="lgClear()">취소</button><button type="button" class="b p" onclick="addLog()">저장</button></div></div>`;
  const warn =
    pend || pendEd
      ? `<div class="lgpend">${pend ? `새 기록 ${pend}건` : ''}${pend && pendEd ? ' · ' : ''}${pendEd ? `수정 ${pendEd}건` : ''}이 아직 저장되지 않았습니다. 창 아래 <b>저장</b>을 누르면 함께 저장됩니다.</div>`
      : '';
  const head = `<div class="lgh">실행 기록 <span class="bg mut" style="font-weight:normal">직접 기록 ${nOwn}${nAuto ? ` · 자동 ${nAuto}` : ''}</span><span style="flex:1"></span>
    <label><input type="checkbox" ${tl.hideAuto ? 'checked' : ''} onchange="tl.hideAuto=this.checked;renderLogs()"> 자동 기록 숨기기</label><button type="button" class="b s" onclick="lgPrint()">기록 출력</button></div>`;
  const item = (x) => {
    const own = x._i != null,
      ed = own && tl.edit === x._i,
      vo = own && tl.voiding === x._i,
      saved = own && !x._new,
      hist = x.hist || [];
    const tags = [
      x._new ? '<span class="bg warn">저장 전</span>' : '',
      x.void ? '<span class="bg bad">취소됨</span>' : '',
      hist.length ? `<a class="bg mut" style="cursor:pointer" onclick="lgTogHist('${x.id}')">수정 ${hist.length}회 · 이력</a>` : '',
      lgLate(x) ? `<span class="bg warn" title="실행일보다 늦게 작성">사후 기록 · 작성 ${loc(x.at, 10).slice(5)}</span>` : '',
    ].join(' ');
    const who = [x.party, x.method].filter(Boolean).join(' · ');
    const del = `<a class="lk" style="font-size:11px;color:var(--bad)" onclick="delLog(${x._i})">삭제</a>`;
    const acts =
      own && !ed && !vo && x.void
        ? mv(x) + del
        : own && !ed && !vo
          ? `${mv(x)}<a class="lk" style="font-size:11px" onclick="lgEdit(${x._i})">수정</a> ${
              x._new ? '' : `<a class="lk" style="font-size:11px;color:var(--bad)" onclick="tl.voiding=${x._i};renderLogs()">취소 처리</a> `
            }${del}`
          : x.ro && !x.auto
            ? '<span class="muted" style="font-size:11px">원본에서 수정</span>'
            : '';
    if (ed)
      return `<li class="ed"><div class="lh"><b>기록 수정</b>${saved ? ' <span class="muted" style="font-size:11.5px">— 원문은 이력으로 보존됩니다</span>' : ''}</div>
      <div class="cg" style="margin-top:6px"><label>실행일<input type="date" id="leDate" value="${esc(x.date)}" max="${today()}"></label><label>구분<select id="leKind">${opts(
        LOG_KINDS.includes(x.kind) ? LOG_KINDS : [x.kind, ...LOG_KINDS],
        x.kind,
      )}</select></label>
        <label>상대방<input id="leParty" list="lgParties" value="${esc(x.party)}"></label><label>방법<select id="leMethod">${opts(LOG_METHODS, x.method || '', true)}</select></label></div>
      <div class="cg2"><label>실행 내용<textarea id="leText">${esc(x.text)}</textarea></label><label>결과 · 합의 사항<textarea id="leResult">${esc(x.result)}</textarea></label></div>
      <div class="cf"><label class="b s" style="cursor:pointer">📎 증빙 추가<input type="file" accept="image/*" multiple style="display:none" onchange="lgAddFiles([...this.files],'edit');this.value=''"></label>${lgThumbs(tl.editPh, 'lgRmEdit')}</div>
      ${saved ? `<label class="lgreason">수정 사유 *<input id="leReason" placeholder="예: 협력사 회신 메일 확인 후 수량 정정"></label>` : ''}
      <div class="row" style="margin-top:6px;justify-content:flex-end"><button type="button" class="b s" onclick="tl.edit=null;tl.editPh=null;renderLogs(false)">취소</button><button type="button" class="b s p" onclick="saveLog(${x._i})">저장</button></div></li>`;
    return `<li class="${x.auto ? 'au' : ''} ${x._new ? 'nw' : ''} ${x.void ? 'vd' : ''}"><div class="lh"><b>${esc(x.date)}</b> <span class="bg ${LOG_CLS[x.kind] || 'mut'}">${esc(x.kind)}</span>${
      x.src ? ` <span class="bg mut" style="font-weight:normal">${esc(x.src)}</span>` : ''
    }${
      who ? ` <span style="font-size:12px">${esc(who)}</span>` : ''
    } <span class="muted" style="font-size:11px">${esc(x.by || '')}</span> ${tags}<span style="flex:1"></span>${acts}</div>
      <div class="lt">${nl(x.text)}</div>${x.result ? `<div class="lr"><b>결과</b> ${nl(x.result)}</div>` : ''}${lgThumbs(x.photos)}
      ${x.void ? `<div class="lv">취소 ${esc(loc(x.void.at))} ${esc(x.void.by || '')} — 사유: ${esc(x.void.reason)}</div>` : ''}
      ${
        vo
          ? `<div class="lgreason" style="margin-top:6px">취소 사유 *<div class="row" style="gap:6px"><input id="lvReason" placeholder="예: 다른 건 기록을 잘못 입력" style="flex:1"><button type="button" class="b s" onclick="tl.voiding=null;renderLogs(false)">그만두기</button><button type="button" class="b s" style="color:var(--bad);border-color:#f0c4bf" onclick="lgVoid(${x._i})">취소 처리</button></div><span class="muted">취소 처리한 기록은 취소선과 사유가 남습니다. 아예 없애려면 '삭제'를 누르세요.</span></div>`
          : ''
      }
      ${
        hist.length && tl.hist.has(x.id)
          ? `<div class="lhist">${hist
              .map(
                (h, k) =>
                  `<div><b>${k + 1}차 원문</b> <span class="muted">${esc(loc(h.at))} 수정 · ${esc(h.by || '')} · 사유: ${esc(h.reason || '-')}</span><br>${esc(h.date)} · ${esc(h.kind)}${h.party ? ' · ' + esc(h.party) : ''}${h.method ? ' · ' + esc(h.method) : ''}<br>${nl(h.text)}${
                    h.result ? `<br>결과: ${nl(h.result)}` : ''
                  }</div>`,
              )
              .join('')}</div>`
          : ''
      }</li>`;
  };
  b.innerHTML =
    plan +
    comp +
    warn +
    head +
    (L.length
      ? `<ul class="logs">${L.map(item).join('')}</ul>`
      : '<div class="muted" style="font-size:12px;padding:6px 2px">아직 기록이 없습니다.</div>');
}
// 실행 기록 순서 (최근 것이 위): 실행일 → 직접 쓴 기록이 자동 기록보다 위 → 손으로 정한 순서(ord) → 작성 시각
const lgOrd = (x) => (x.ord == null ? 1e9 : x.ord);
function lgCmpDesc(a, c) {
  return (
    (c.date || '').localeCompare(a.date || '') ||
    (a.auto ? 1 : 0) - (c.auto ? 1 : 0) ||
    (a.ord != null || c.ord != null ? lgOrd(c) - lgOrd(a) : 0) ||
    (c.at || '').localeCompare(a.at || '')
  );
}
// 같은 실행일의 직접 쓴 기록을 한 칸 옮김 (dir: -1 위로 · +1 아래로) — 바로 저장
function lgMove(i, dir) {
  const x = tl.own[i];
  if (!x) return;
  const D = tl.own.filter((y) => (y.date || '') === (x.date || '')).sort(lgCmpDesc),
    a = D.indexOf(x),
    b = a + dir;
  if (b < 0 || b >= D.length) return;
  [D[a], D[b]] = [D[b], D[a]];
  D.forEach((y, n) => {
    y.ord = D.length - 1 - n;
  });
  renderLogs(false);
  tlPersist('순서를 바꿨습니다');
}
const lgRmDraft = (k) => {
  tl.draftPh.splice(k, 1);
  renderLogs();
};
const lgRmEdit = (k) => {
  tl.editPh.splice(k, 1);
  renderLogs();
};
const lgTogHist = (id) => {
  tl.hist.has(id) ? tl.hist.delete(id) : tl.hist.add(id);
  renderLogs();
};
// 쓴 내용을 기록 목록에 넣음 (입력 검사 포함) — 저장은 tlPersist
function tlPushDraft() {
  const t = $('#lgText').value.trim();
  if (!t) {
    toast('실행 내용을 입력하세요');
    $('#lgText').focus();
    return false;
  }
  const d = $('#lgDate').value || today();
  if (d > today()) {
    toast('실행일은 오늘 이후일 수 없습니다. 실제로 한 일만 기록합니다.');
    return false;
  }
  tl.own.push({
    id: uid(),
    date: d,
    kind: $('#lgKind').value,
    party: $('#lgParty').value.trim(),
    method: $('#lgMethod').value,
    text: t,
    result: $('#lgResult').value.trim(),
    photos: [...tl.draftPh],
    by: db.settings.owners[0] || '',
    at: now(),
    _new: true,
  });
  tl.draftPh = [];
  return true;
}
// 작성 칸의 ‘저장’ — 기록을 바로 저장하고 작성 칸을 비움
function addLog() {
  if (!tlPushDraft()) return false;
  renderLogs(false);
  tlPersist('기록을 저장했습니다');
  return true;
}
// 작성 칸의 ‘취소’ — 쓰던 내용을 지움
function lgClear() {
  const had = tlDraftHas();
  tl.draftPh = [];
  renderLogs(false);
  mfDirty = (tl.kind === 'ncr' && !!tl.other) || tl.edit != null || tl.own.some((x) => x._new || x._dirty);
  if (had) toast('쓰던 내용을 지웠습니다');
}
function lgEdit(i) {
  tl.edit = i;
  tl.voiding = null;
  tl.editPh = [...(tl.own[i].photos || [])];
  renderLogs(false);
}
function saveLog(i) {
  const x = tl.own[i],
    t = $('#leText').value.trim();
  if (!t) {
    toast('실행 내용을 입력하세요');
    return;
  }
  const d = $('#leDate').value || x.date;
  if (d > today()) {
    toast('실행일은 오늘 이후일 수 없습니다');
    return;
  }
  const nv = {
    date: d,
    kind: $('#leKind').value,
    party: $('#leParty').value.trim(),
    method: $('#leMethod').value,
    text: t,
    result: $('#leResult').value.trim(),
    photos: [...tl.editPh],
  };
  const same =
    ['date', 'kind', 'party', 'method', 'text', 'result'].every((k) => String(x[k] || '') === String(nv[k] || '')) &&
    JSON.stringify(x.photos || []) === JSON.stringify(nv.photos);
  if (same) {
    tl.edit = null;
    tl.editPh = null;
    renderLogs(false);
    return;
  }
  if (!x._new) {
    const r = ($('#leReason')?.value || '').trim();
    if (!r) {
      toast('수정 사유를 입력하세요');
      $('#leReason')?.focus();
      return;
    }
    x.hist = [
      ...(x.hist || []),
      {
        at: now(),
        by: db.settings.owners[0] || '',
        reason: r,
        date: x.date,
        kind: x.kind,
        party: x.party || '',
        method: x.method || '',
        text: x.text,
        result: x.result || '',
        photos: [...(x.photos || [])],
      },
    ];
    x.editedAt = now();
    x._dirty = true;
  }
  if (nv.date !== x.date) delete x.ord; // 실행일을 고치면 손으로 정한 순서는 풀림
  Object.assign(x, nv);
  delete x.next;
  delete x.nextDate;
  delete x.done;
  tl.edit = null;
  tl.editPh = null;
  renderLogs();
  tlPersist('기록을 수정했습니다');
}
function lgVoid(i) {
  const r = ($('#lvReason')?.value || '').trim();
  if (!r) {
    toast('취소 사유를 입력하세요');
    $('#lvReason')?.focus();
    return;
  }
  tl.own[i].void = { at: now(), by: db.settings.owners[0] || '', reason: r };
  tl.own[i]._dirty = true;
  tl.voiding = null;
  renderLogs();
  tlPersist('기록을 취소 처리했습니다');
}
// 기록 삭제 — 확인 뒤 바로 삭제 (취소 처리된 기록 포함)
async function delLog(i) {
  const x = tl.own[i];
  if (!x) return;
  if (
    !(await askConfirm({
      title: x._new ? '저장 전 기록을 삭제할까요?' : '이 기록을 삭제할까요?',
      items: [`${esc(x.date)} · ${esc(x.kind)}${x.void ? ' · 취소됨' : ''}`, esc(x.text.slice(0, 60)) + (x.text.length > 60 ? '…' : '')],
      note: x._new ? '' : '삭제하면 실행 기록과 기록 출력에서 바로 사라집니다.',
      ok: '삭제',
      danger: true,
    }))
  )
    return;
  tl.own.splice(i, 1);
  tl.edit = null;
  tl.voiding = null;
  renderLogs();
  if (!x._new) tlPersist('기록을 삭제했습니다');
}
// 모달 저장 시 호출: 정리된 기록 · 다음 행동을 돌려주고 새 증빙 사진을 저장소에 넣음
function tlCommit() {
  const logs = tl.own.map(({ _new, _dirty, ...x }) => x);
  const used = new Set(logs.flatMap((l) => [...(l.photos || []), ...(l.hist || []).flatMap((h) => h.photos || [])]));
  const recs = Object.values(tl.newPh)
    .filter((r) => used.has(r.id))
    .map(({ isNew, ...r }) => r);
  recs.forEach((r) => {
    phCache[r.id] = r;
  }); // 저장을 기다리지 않고 화면에 바로 보이게
  if (recs.length) {
    photoPut(recs)
      .then(() => {
        photoStr = null;
      })
      .catch((e) => toast('증빙 사진 저장 실패: ' + e.message));
  }
  tl.newPh = {};
  tl.draftPh = [];
  return { logs };
}
// 기록 출력 (클레임 협의 · 감사 제출용)
async function lgPrint() {
  const w = reportWin(),
    o = tl.obj,
    isN = tl.kind === 'ncr';
  const L = [...tl.own.filter((x) => !x._new), ...caseReadonly(tl.kind, o)].sort((a, c) => lgCmpDesc(c, a));
  const ids = [...new Set(L.flatMap((l) => l.photos || []))];
  let P = {};
  try {
    (await photoGetMany(ids)).forEach((r) => {
      P[r.id] = r;
    });
  } catch (e) {}
  const pn = {};
  let k = 0;
  L.forEach((l) =>
    (l.photos || []).forEach((id) => {
      if (!pn[id]) pn[id] = ++k;
    }),
  );
  const title = isN ? `${o.no} · ${supName(o.supplierId) || ''}` : `${defLabel(o)} · ${supName(o.supplierId) || ''}`;
  const unsaved = tl.own.filter((x) => x._new || x._dirty).length;
  const html = reportFrame(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>실행기록_${esc(isN ? o.no : o.date)}</title><style>
  body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:11px;color:#111;margin:24px}h1{font-size:17px;margin:6px 0 2px}.s{color:#555}
  table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef1f5;white-space:nowrap}
  tr.au td{color:#555;background:#fafafa}tr.vd td{color:#888;text-decoration:line-through}tr.vd td.nt{text-decoration:none}.pre{white-space:pre-wrap}
  .ph{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}.ph div{border:1px solid #ccc;padding:4px;break-inside:avoid}.ph img{width:100%;max-height:220px;object-fit:contain}
  h3{font-size:13px;margin:16px 0 4px}</style></head><body>${logoHead()}
  <h1>조사 · 진행 실행 기록</h1><div class="s">${esc(title)} · 출력 ${loc(now())} · 출력자 ${esc(db.settings.owners[0] || '')}${
    unsaved ? ` · <b>저장 전 기록 ${unsaved}건 제외</b>` : ''
  }</div>
  <table><tr><th>실행일</th><th>구분</th><th>상대방 · 방법</th><th>실행 내용</th><th>결과 · 합의</th><th>증빙</th><th>작성</th><th>비고</th></tr>
  ${L.map(
    (l) => `<tr class="${l.auto ? 'au' : ''} ${l.void ? 'vd' : ''}"><td>${esc(l.date)}</td><td>${esc(l.auto ? '시스템' : l.kind)}${
      l.src && !l.auto ? '<br>' + esc(l.src) : ''
    }</td><td>${esc([l.party, l.method].filter(Boolean).join(' · '))}</td>
    <td class="pre">${esc(l.text)}</td><td class="pre">${esc(l.result || '')}</td><td>${(l.photos || []).map((id) => '#' + pn[id]).join(' ')}</td>
    <td>${l.auto ? '자동' : `${esc(l.by || '')}<br>${esc(loc(l.at || ''))}`}</td>
    <td class="nt">${[
      lgLate(l) ? '사후 기록' : '',
      (l.hist || []).length ? `수정 ${l.hist.length}회` : '',
      l.void ? `취소 (${esc(l.void.reason)})` : '',
    ]
      .filter(Boolean)
      .join('<br>')}</td></tr>`,
  ).join('')}</table>
  ${
    L.some((l) => (l.hist || []).length)
      ? `<h3>수정 이력 (원문)</h3><table><tr><th>기록</th><th>수정 시각 · 수정자</th><th>사유</th><th>수정 전 내용</th></tr>${L.filter(
          (l) => (l.hist || []).length,
        )
          .flatMap((l) =>
            l.hist.map(
              (h) =>
                `<tr><td>${esc(l.date)} ${esc(l.kind)}</td><td>${esc(loc(h.at))} ${esc(h.by || '')}</td>
                  <td>${esc(h.reason || '')}</td>
                    <td class="pre">${esc(h.date)} · ${esc(h.kind)}${h.party ? ' · ' + esc(h.party) : ''}\n${esc(h.text)}${
                      h.result ? '\n결과: ' + esc(h.result) : ''
                    }</td></tr>`,
            ),
          )
          .join('')}</table>`
      : ''
  }
  ${
    ids.length
      ? `<h3>증빙 자료</h3><div class="ph">${ids
          .map((id) => (P[id] ? `<div><img src="${P[id].data}"><br><b>#${pn[id]}</b> ${esc(P[id].caption || P[id].name || '')}</div>` : ''))
          .join('')}</div>`
      : ''
  }
  <p class="s" style="margin-top:12px">‘작성’은 기록을 입력한 시각이며 실행일과 2일 이상 차이 나면 ‘사후 기록’으로 표시됩니다. 수정된 기록은 원문과 사유가 위 이력에 남고, 취소된 기록은 지우지 않고 취소선으로 표시합니다.</p>
  </body></html>`);
  reportShow(w, html, `실행기록_${isN ? o.no : o.date}.html`);
}
function openLog(id) {
  const d = db.defects.find((x) => x.id === id);
  if (!d) return;
  const n = ncrOfDefect(d),
    v = sevOf(d);
  openModal(
    `불량 진행 — ${defLabel(d)} (${supName(d.supplierId) || '-'})`,
    `<div class="psum">
    <div><span class="muted">현상</span> ${nl(d.desc || '-')}</div><div><span class="muted">임시조치</span> ${nl(d.containment || '-')}</div>
    <div class="row" style="gap:6px;margin-top:4px">${sevBadge(d)} <span class="bg mut">${esc(d.type || '')} ${num(d.qty).toLocaleString()}개</span> <span class="bg mut">처리 ${esc(d.disposition || '-')}</span> <span class="bg mut">귀책 ${esc(d.resp || '-')}</span> ${stageBadges(d).replace('<br>', ' ')}
      ${
        n
          ? `<a class="bg inf" style="cursor:pointer" onclick="gotoNcr('${n.id}')">${esc(n.no)} · ${ncrStatus(n)}</a>`
          : `<span class="bg mut">NCR 없음 (${v.resp})</span>`
      } ${costTotal(d) ? `<span class="bg mut">비용 ${won(costTotal(d))}원</span>` : ''}${
        claimStatus(d) ? ` <span class="bg ${CLAIM_CLS[claimStatus(d)]}">구상 ${claimStatus(d)}</span>` : ''
      }</div></div>
    ${routeHTML(d)}
    <div class="sec">조사 · 진행 기록 <span class="muted" style="font-weight:normal;font-size:12px">— 실제로 한 일과 결과만 남기는 증빙용 기록 · NCR·대책서·구상 진행(자동)이 함께 표시</span></div>
      <div id="logBox"></div>`,
    [
      ...(a3ReadyDefect(d) ? [{ label: 'A3 보고서', fn: () => a3Report('defect', id) }] : []),
      {
        label: '불량 정보 수정',
        fn: async () => {
          if (mfDirty && !(await askConfirm({ title: '기록을 저장하지 않고 이동할까요?', ok: '이동', danger: false }))) return;
          closeModal(true);
          editDefect(id);
        },
      },
      { label: '닫기', fn: closeModal },
      {
        label: '저장',
        cls: 'p',
        fn: () => {
          if (tl.edit != null) {
            toast('수정 중인 기록을 먼저 저장하거나 취소하세요');
            return;
          }
          if (tlDraftHas() && !tlPushDraft()) return; // 쓰던 기록이 있으면 함께 저장
          const r = tlCommit();
          d.logs = r.logs;
          touch(d);
          save();
          mfDirty = false;
          closeModal(true);
          render();
          toast('진행 기록 저장');
        },
      },
    ],
  );
  tlInit('defect', d);
  setTimeout(() => $('#lgText')?.focus(), 0);
}
async function gotoProgress(id) {
  if (
    mfDirty &&
    !(await askConfirm({
      title: '수정 중인 불량 정보를 저장하지 않고 이동할까요?',
      msg: '먼저 저장하려면 취소 후 저장을 누르세요.',
      ok: '이동',
      danger: false,
    }))
  )
    return;
  closeModal(true);
  openLog(id);
}
async function gotoNcr(nid) {
  if (mfDirty && !(await askConfirm({ title: '기록을 저장하지 않고 이동할까요?', ok: '이동', danger: false }))) return;
  closeModal(true);
  editNcr(nid);
}
/* ---- 비용 · 구상 패널 ---- */
let curCosts = [],
  curClaim = {},
  costCtx = null,
  curBase = {};
