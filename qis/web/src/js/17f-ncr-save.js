// ── NCR — 작성 양식 · 기본값 · 연결 불량 · 저장 · 삭제 · 8D 출력 · CSV ──
// 불량 내용 서술의 작성 양식 (발행 근거 ‘불량’) — 연결 불량의 내용으로 채움. 새 NCR 에는 기본으로 들어감
function descTplDefect(d, lot) {
  const fg =
    d && (d.fgNo || d.fgName)
      ? ` (완성품 ${[d.fgNo, d.fgName].filter(Boolean).join(' ')} 에서 발견${d.fgQty ? ` · ${num(d.fgQty).toLocaleString()}대` : ''})`
      : '';
  return [
    `1. 발견 일시/장소 (When/Where) : ${d ? (d.date || '') + ' / ' + (d.source || '') + fg : ''}`,
    `2. 불량 현상 (What) : ${d ? [d.type, d.desc].filter(Boolean).join(' — ') : ''}`,
    `3. 발생 수량/범위 (How many) : ${
      d ? num(d.qty).toLocaleString() + ' EA' + (d.inspQty ? ' / ' + num(d.inspQty).toLocaleString() + ' EA 중' : '') : ''
    }${lot ? ' (LOT ' + lot + ')' : ''}`,
    `4. 영향 (Impact) : `,
    `5. 당사 조치 (Containment) : ${d?.containment || ''}`,
  ].join('\n');
}
// 발행 근거를 바꿀 때 — 손대지 않은 빈 불량 양식은 지우고(감사 · PPM 은 양식이 다름), 새 NCR 에서 ‘불량’으로 돌아오면 다시 넣음
function descBasisSwap() {
  const f = $('#mf'),
    ta = f && f.defectDesc;
  if (!ta) return;
  const blank = descTplDefect(null, '').trim(),
    b = f.basis.value;
  if (b !== '불량' && ta.value.trim() === blank) ta.value = '';
  else if (b === '불량' && !ncrCurId && !ta.value.trim())
    ta.value = descTplDefect(db.defects.find((x) => x.id === curLinks[0]) || null, f.lotNo.value);
}
async function descTemplate() {
  const f = $('#mf'),
    ta = f.defectDesc,
    d = db.defects.find((x) => x.id === curLinks[0]);
  const t = basisTpl(f) || descTplDefect(d || null, f.lotNo.value);
  if (
    ta.value.trim() &&
    !(await askConfirm({
      title: '작성 양식을 추가할까요?',
      msg: '이미 작성한 내용 <b>아래에</b> 양식이 추가됩니다.',
      ok: '아래에 추가',
      danger: false,
    }))
  )
    return;
  ta.value = (ta.value.trim() ? ta.value.trim() + '\n\n' : '') + t;
  mfDirty = true;
  ta.focus();
}
function defaultReq(type, due, far, site, esc) {
  let b = defaultReq0(type, due);
  const k = () => (b.match(/^\d+\./gm) || []).length + 1;
  if (esc && type !== '단순 통보')
    b += `\n${k()}. Outflow cause — why not detected at your outgoing inspection, and detection countermeasure${
      esc >= 2 ? ' (100% inspection or error-proofing before shipment)' : ''
    } (유출 원인 · 출하검사 대책${esc >= 2 ? ' — 출하 전 전수 또는 자동 검출' : ''})`;
  if (far && far.reqDate && !far.replyDate) {
    const fd = far.due ? `${+far.due.slice(5, 7)}/${+far.due.slice(8, 10)}` : '';
    b += `\n${k()}. Failure analysis report (FAR) for returned samples${far.sampleQty ? ' (' + far.sampleQty + ')' : ''} : ~ ${fd} 限`;
  }
  if (site) b += `\n${k()}. On-site audit at your plant will be conducted (현장 감사 예정)`;
  return b;
}
function defaultReq0(type, due) {
  const md = due ? `${+due.slice(5, 7)}/${+due.slice(8, 10)}` : '';
  if (type === '단순 통보')
    return '1. For your information — please strengthen quality control (No reply required)\n2. 다음 입고 LOT에서 재발 여부 확인 예정';
  return type === '간이 대책서'
    ? `1. Need corrective action report (cause / countermeasure / effective date) : ~ ${md} 限`
    : `1. Need 8D report : ~ ${md} 限\n2. Containment action (D3) reply within 24 hours`;
}
function ncrVerifyDueAuto(n) {
  if (n.reqType === '단순 통보') return '';
  const S = db.settings,
    b = n.validity === '적정' && n.approvedDate ? n.approvedDate : n.issueDate;
  return b ? addDays(b, S.verifyDays) : '';
}
function ncrDue(n) {
  return n.reqType === '단순 통보' ? '' : n.dueDate || addDays(n.requestDate || n.issueDate || today(), typeDays(n.reqType));
}
// 지금 열린 NCR 창의 FAR (연결 불량 기준)
function ncrFarCur() {
  const pf = ((ncrCurId && db.ncrs.find((x) => x.id === ncrCurId)) || {}).far || null,
    r = farAlign(pf, curLinks, false);
  return r ? r.far : pf;
}
function fillReq() {
  const f = $('#mf');
  const due = f.dueDate.value || addDays(f.requestDate.value || f.issueDate.value || today(), typeDays(f.reqType.value));
  f.requirements.value = defaultReq(
    f.reqType.value,
    due,
    ncrFarCur(),
    !!(f.siteAudit && f.siteAudit.value === '요청'),
    escLevel((curLinks || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean)),
  );
  mfDirty = true;
}
async function renderNcrPhotos() {
  const b = $('#ncrPhotoBox');
  if (!b) return;
  const ids = curLinks.flatMap((i) => db.defects.find((d) => d.id === i)?.photos || []);
  if (!ids.length) {
    b.innerHTML = '<span class="muted" style="font-size:12px">연결된 불량에 사진이 없습니다. 불량 기록에 사진을 첨부하면 여기에 나타납니다.</span>';
    return;
  }
  let rs = [];
  try {
    rs = await photoGetMany(ids);
  } catch (e) {}
  if (!$('#ncrPhotoBox')) return;
  b.innerHTML = rs
    .map(
      (p) =>
        `<label style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;cursor:pointer"><img src="${p.thumb || p.data}" style="width:110px;height:80px;object-fit:cover;border-radius:4px;border:2px solid ${curExcl.has(p.id) ? '#ddd' : '#007A78'};opacity:${curExcl.has(p.id) ? 0.4 : 1}"><span><input type="checkbox" ${curExcl.has(p.id) ? '' : 'checked'} onchange="this.checked?curExcl.delete('${p.id}'):curExcl.add('${p.id}');mfDirty=true;renderNcrPhotos()"> ${esc((p.caption || '').slice(0, 12))}</span></label>`,
    )
    .join('');
}
function ncrNotify(src) {
  const f = $('#mf');
  mfDirty = true;
  if (src === 'yn') {
    if (f.notifyYN.value === '통보 완료' && !f.notifyDate.value) f.notifyDate.value = today();
    if (f.notifyYN.value === '미통보') f.notifyDate.value = '';
  } else f.notifyYN.value = f.notifyDate.value ? '통보 완료' : '미통보';
  const d = f.notifyDate.value,
    prev = f.notifyDate.dataset.prev || '';
  if (d && f.reqType.value !== '단순 통보' && !(f.replyDate && f.replyDate.value)) {
    const r = f.requestDate.value;
    if (!r || r === prev || r === f.issueDate.value || r < d) {
      f.requestDate.value = d;
      ncrAutoDates('req');
    }
  }
  f.notifyDate.dataset.prev = d;
}
function ncrAutoDates(which) {
  const f = $('#mf'),
    S = db.settings;
  if (which === 'req' && f.requestDate.value) f.dueDate.value = addDays(f.requestDate.value, typeDays(f.reqType.value));
  if (which === 'issue' && f.issueDate.value) {
    const prev = f.issueDate.dataset.prev || '';
    if (f.reqType.value !== '단순 통보' && !f.notifyDate.value && (!f.requestDate.value || f.requestDate.value === prev)) {
      f.requestDate.value = f.issueDate.value;
      f.dueDate.value = addDays(f.issueDate.value, typeDays(f.reqType.value));
    }
    f.issueDate.dataset.prev = f.issueDate.value;
  }
  if (f.d3Due && f.reqType.value !== '단순 통보' && f.requestDate.value && (which === 'req' || which === 'issue'))
    f.d3Due.value = d3DefaultDue(f.requestDate.value);
}
async function unlinkDefect(id) {
  const d = db.defects.find((x) => x.id === id);
  if (
    !(await askConfirm({
      title: '불량 연결을 해제할까요?',
      items: [`${esc(d?.date)} · ${esc(d?.partNo)} ${esc(d?.partName)} · ${num(d?.qty)}개`],
      note: '불량 기록 자체는 삭제되지 않습니다. NCR 창에서 저장해야 반영됩니다.',
      ok: '연결 해제',
      danger: false,
    }))
  )
    return;
  curLinks = curLinks.filter((x) => x !== id);
  mfDirty = true;
  refreshLinks();
}
function repHint() {
  const f = $('#mf'),
    el = $('#repHint');
  if (!f || !el || !f.repeatOf) return;
  const v = f.repeatOf.value.trim(),
    me = ncrCurId;
  if (v) {
    const p = db.ncrs.find((x) => x.no === v && x.id !== me);
    el.innerHTML = p
      ? `이전 NCR ${esc(p.issueDate)} 발행 · ${esc(ncrStatus(p))}${p.verifyResult ? ' · 검증 ' + esc(p.verifyResult) : ''}`
      : '<span style="color:var(--warn)">등록되지 않은 번호입니다 (그대로 저장은 됩니다)</span>';
    return;
  }
  const sid = f.supplierId.value,
    pn = f.partNo.value.trim();
  const c = pn
    ? db.ncrs
        .filter((x) => x.id !== me && x.no && x.partNo === pn && (!sid || x.supplierId === sid))
        .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''))[0]
    : null;
  el.innerHTML = c
    ? `같은 품번의 이전 NCR <b>${esc(c.no)}</b> (${esc(c.issueDate)} · ${esc(ncrStatus(c))}) <button type="button" class="b s" onclick="const f=$('#mf');f.repeatOf.value=${jsq(c.no)};mfDirty=true;repHint()">재발로 연결</button>`
    : '';
}
function renderNcrCost() {
  const box = $('#ncrCostBox');
  if (!box) return;
  const ds = curLinks.map((i) => db.defects.find((d) => d.id === i)).filter(Boolean);
  if (!ds.length) {
    box.innerHTML = '<div class="muted" style="font-size:13px">연결된 불량이 없습니다.</div>';
    return;
  }
  const cat = {};
  let tot = 0,
    req = 0,
    recv = 0;
  ds.forEach((d) => {
    (d.costs || []).forEach((c) => {
      cat[c.cat || '기타'] = (cat[c.cat || '기타'] || 0) + num(c.amt);
      tot += num(c.amt);
    });
    if (d.claim) {
      req += num(d.claim.agreeAmt || d.claim.reqAmt);
      recv += num(d.claim.recvAmt);
    }
  });
  const rows = COST_CATS.filter((k) => cat[k])
    .map((k) => `<tr><td>${esc(k)}</td><td class="n">${won(cat[k])} 원</td></tr>`)
    .join('');
  box.innerHTML =
    tot || req
      ? `<div class="tw" style="max-width:420px"><table><tbody>${rows}<tr><th>합계</th><th class="n">${won(tot)} 원</th></tr>${
          req
            ? `<tr><td>구상 청구(합의)</td><td class="n">${won(req)} 원</td></tr><tr><td>회수</td><td class="n">${won(recv)} 원${
                req > recv ? ` <span class="bg warn">미회수 ${won(req - recv)}</span>` : ''
              }</td></tr>`
            : ''
        }</tbody></table></div>`
      : `<div class="muted" style="font-size:13px">연결된 불량 ${ds.length}건에 입력된 비용이 없습니다.</div>`;
}
function refreshLinks() {
  const box = $('#linkBox');
  if (!box) return;
  setTimeout(() => {
    renderNcrCost();
    repHint();
  }, 0);
  setTimeout(renderNcrPhotos, 0);
  setTimeout(() => {
    if (tl.kind === 'ncr') {
      tl.obj.defectIds = curLinks;
      renderLogs();
    }
  }, 0);
  {
    const sp = supById($('#mf').supplierId.value);
    $('#dlAttn').innerHTML = sp
      ? ensureContacts(sp)
          .contacts.filter((c) => c.active !== false)
          .map((c) => `<option value="${esc(c.name)}">${esc(c.role)}</option>`)
          .join('')
      : '';
  }
  const sid = $('#mf').supplierId.value;
  const linked = curLinks.map((i) => db.defects.find((d) => d.id === i)).filter(Boolean);
  const cand = db.defects
    .filter((d) => !curLinks.includes(d.id) && !d.ncrId && (!sid || d.supplierId === sid))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 100);
  box.innerHTML =
    (linked.length
      ? `<table><tbody>${linked
          .map(
            (d) =>
              `<tr><td>${esc(d.date)}</td><td>${esc(d.partNo)} ${esc(d.partName)}</td><td>${esc(d.type)}</td><td class="n">${num(d.qty)}개</td>
                <td>${photoBadge(d)}</td><td><button type="button" class="b s d" onclick="unlinkDefect('${d.id}')">해제</button></td></tr>`,
          )
          .join('')}</tbody></table>`
      : '<div class="muted">연결된 불량 없음</div>') +
    `<div class="row" style="margin-top:8px"><select id="linkSel" style="max-width:520px"><option value="">— 불량 추가 연결 (같은 협력사, NCR 미연결) —</option>${cand
      .map((d) => `<option value="${d.id}">${esc(d.date)} · ${esc(d.partNo)} ${esc(d.partName)} · ${esc(d.type)} · ${num(d.qty)}개</option>`)
      .join(
        '',
      )}</select><button type="button" class="b s" onclick="const v=$('#linkSel').value;if(v){curLinks.push(v);refreshLinks()}">추가</button></div>`;
}
function saveNcr(id) {
  const o = gather(),
    S = db.settings;
  if (tl.kind === 'ncr' && ((document.getElementById('lgText') || {}).value || '').trim()) {
    if (!tlPushDraft()) {
      ncrTab('d');
      return null;
    }
    renderLogs(false);
  } // 진행 기록에 쓰던 내용도 함께 저장
  {
    const pf = ((id && db.ncrs.find((x) => x.id === id)) || {}).far || null,
      r = farAlign(pf, curLinks);
    o.far = r ? r.far : pf;
    if (r && r.chInv && r.src) touch(r.src);
  } // FAR 은 FAR 화면이 원본 — NCR 은 비춘 값만 가짐
  if (!o.issueDate) {
    ncrTab('a');
    toast('발행일을 입력하세요');
    return null;
  }
  if (o.notifyYN === '통보 완료' && !o.notifyDate) o.notifyDate = today();
  delete o.notifyYN;
  if (o.notifyDate && o.notifyDate < o.issueDate) {
    ncrTab('t');
    toast('통보일이 발행일보다 빠릅니다');
    return null;
  }
  // 날짜 순서: 발행 → 대책 요청 · 봉쇄 회신 · 대책서 회신 → 유효성 검증
  for (const [k, lbl, tab] of [
    ['requestDate', '대책 요청일', 'r'],
    ['d3Date', '봉쇄 회신일', 'r'],
    ['replyDate', '대책서 회신일', 'r'],
    ['verifyDate', '유효성 검증일', 'c'],
  ])
    if (o[k] && o[k] < o.issueDate) {
      ncrTab(tab);
      toast(`${lbl}이 발행일 (${o.issueDate}) 보다 빠릅니다`);
      return null;
    }
  if (o.verifyDate && o.replyDate && o.verifyDate < o.replyDate) {
    ncrTab('c');
    toast(`유효성 검증일이 대책서 회신일 (${o.replyDate}) 보다 빠릅니다`);
    return null;
  }
  if (o.no && db.ncrs.some((x) => x.id !== id && x.no === o.no.trim())) {
    ncrTab('a');
    toast(`NCR 번호 ${o.no} 은(는) 이미 사용 중입니다`);
    return null;
  }
  if (o.reqType !== '단순 통보' && !o.requestDate) o.requestDate = o.issueDate;
  if (o.reqType === '단순 통보') {
    o.dueDate = '';
  } else if (o.requestDate && !o.dueDate) o.dueDate = addDays(o.requestDate, typeDays(o.reqType));
  if (o.reqType === '단순 통보') {
    o.d3Due = '';
    o.d3Date = '';
  }
  if (o.basis !== '공정 감사') ['auditDate', 'auditType', 'auditRef', 'finding'].forEach((k) => (o[k] = ''));
  if (o.basis !== 'PPM 초과') ['ppmFrom', 'ppmTo', 'ppmVal', 'ppmTarget', 'ppmDetail'].forEach((k) => (o[k] = ''));
  if (o.basis === '불량') delete o.basis;
  const prevN = id ? db.ncrs.find((x) => x.id === id) : null;
  if (
    o.validity === '적정' &&
    !(prevN && prevN.validity === '적정') &&
    o.reqType !== '단순 통보' &&
    !o.replyDate &&
    !curEvals.some((e) => evalDone(e) && evalVerdict(e) === '승인')
  ) {
    ncrTab('r');
    toast('대책서 회신일을 먼저 입력하세요 — 회신 없이 ‘적정’으로 승인할 수 없습니다');
    return null;
  }
  if (o.verifyResult === '유효' && !(prevN && prevN.verifyResult === '유효')) {
    const le0 = curEvals.filter((e) => evalDone(e)).slice(-1)[0],
      valid = le0 ? evalVerdict(le0) === '승인' : o.validity === '적정';
    if (o.reqType !== '단순 통보' && !valid) {
      ncrTab('c');
      toast('대책서가 승인(적정)되지 않아 ‘유효’로 종결할 수 없습니다 — 먼저 대책서를 평가·승인하세요');
      return null;
    }
    const vmsg = vfValidMsg(curVLots, o.reqType === '단순 통보' ? 0 : num(S.verifyLots));
    if (vmsg) {
      ncrTab('c');
      toast(vmsg);
      return null;
    }
    if (!o.verifyDate) o.verifyDate = today();
  }
  if (o.repeatOf && o.no && o.repeatOf === o.no.trim()) {
    ncrTab('a');
    toast('재발 이전 NCR 번호에 자기 번호를 넣을 수 없습니다');
    return null;
  }
  if (o.concession === '특채 승인' && !curConc.length)
    setTimeout(() => toast('특채 승인 문서가 첨부되지 않았습니다 — ④ 검증·종결 탭에서 첨부할 수 있습니다'), 900);
  if (isSysBasis(o) && !o.supplierId) {
    ncrTab('a');
    toast('감사·PPM 근거 NCR은 협력사를 선택하세요');
    return null;
  }
  let n;
  if (id) {
    n = db.ncrs.find((x) => x.id === id);
    Object.assign(n, o);
  } else {
    n = { id: uid(), ...o };
    db.ncrs.push(n);
  }
  if (!n.no) n.no = genNcrNo(n.issueDate);
  const old = n.defectIds || [];
  old
    .filter((i) => !curLinks.includes(i))
    .forEach((i) => {
      const d = db.defects.find((x) => x.id === i);
      if (d && d.ncrId === n.id) {
        d.ncrId = '';
        touch(d);
      }
    });
  curLinks.forEach((i) => {
    const d = db.defects.find((x) => x.id === i);
    if (d && d.ncrId !== n.id) {
      d.ncrId = n.id;
      touch(d);
    }
  });
  if (tl.kind === 'ncr') {
    const r = tlCommit();
    n.logs = r.logs;
  }
  n.defectIds = [...curLinks];
  n.stock = curStock.filter((r) => r.loc || r.stocked || r.ng);
  concCommit(n);
  dkCommit('notice', n);
  dkCommit('reply', n);
  n.contain = ctClean(curContain);
  n.vlots = vfLotsOut();
  n.photoExcl = [...curExcl];
  n.evals = curEvals.map((e) => ({ ...e, score: evalScore(e), verdict: evalVerdict(e) }));
  const le = latestEval(n);
  if (le) {
    const pv = o.validity,
      nv = le.verdict === '승인' ? '적정' : '보완요청';
    if (pv && pv !== nv) setTimeout(() => toast(`대책서 평가 결과(${le.verdict})에 따라 타당성을 ‘${nv}’(으)로 맞췄습니다`), 400);
    n.validity = nv;
    n.evalScore = le.score;
    n.evalVerdict = le.verdict;
  } else {
    delete n.evalScore;
    delete n.evalVerdict;
  }
  if (n.resubPending && (n.validity === '적정' || (le && (le.id || '') !== (n.resubPending.evalId || '')))) delete n.resubPending; // 재제출분 평가를 마침
  if (n.validity === '적정') {
    if (!n.approvedDate) n.approvedDate = (le && le.verdict === '승인' && le.date) || n.replyDate || today();
  } else delete n.approvedDate;
  {
    const auto = ncrVerifyDueAuto(n),
      prevAuto = n._vdAuto || addDays(n.issueDate, S.verifyDays);
    if (n.reqType === '단순 통보' && !n.verifyDate) n.verifyDue = '';
    else if (!n.verifyDue || n.verifyDue === prevAuto) n.verifyDue = auto;
    n._vdAuto = auto;
  }
  czSyncNcr(n);
  touch(n);
  save();
  closeModal(true);
  if (state.tab !== 'ncr' && state.tab !== 'case' && !id) {
    state.tab = 'ncr';
  }
  render();
  toast(`${n.no} 저장됨 (상태: ${ncrStatus(n)})`);
  return n.id;
}
async function delNcr(id) {
  const n = db.ncrs.find((x) => x.id === id);
  if (!n) return;
  const filled = D8.filter(([k]) => String(n[k] || '').trim()).length;
  if (
    !(await askConfirm({
      title: `${n.no}을(를) 삭제할까요?`,
      items: [
        `${esc(supName(n.supplierId))} · ${esc(n.partNo)} ${esc(n.partName)}`,
        `${esc(n.title)}`,
        `상태: ${ncrStatus(n)}${filled ? ` · 8D 작성 항목 ${filled}개 함께 삭제` : ''}`,
        `연결된 불량 ${(n.defectIds || []).length}건은 유지 (연결만 해제)`,
      ],
      note: '삭제 후 10초 안에 되돌릴 수 있습니다.',
    }))
  )
    return;
  const snap = await takeSnap(ncrDocIds(n));
  db.defects.forEach((d) => {
    if (d.ncrId === id) {
      d.ncrId = '';
      touch(d);
    }
  });
  if (state.tab !== 'ncr') closeModal(true);
  {
    const docs = ncrDocIds(n);
    attDrop(docs);
  }
  czUnlinkNcrAll(id);
  removeRec('ncrs', id);
  save();
  render();
  offerUndo(snap, `${n.no}을(를) 삭제했습니다`);
}
async function print8D(id) {
  const n = db.ncrs.find((x) => x.id === id);
  if (!n) return;
  const ds = (n.defectIds || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean);
  const w = reportWin();
  let phs = [];
  try {
    phs = await photoGetMany(ds.flatMap((d) => d.photos || []));
  } catch (e) {}
  let rds = [],
    nds = [];
  try {
    rds = await photoGetMany(n.replyDocs || []);
    nds = await photoGetMany(n.noticeDocs || []);
  } catch (e) {}
  const html =
    reportFrame(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(n.no)} 8D</title><style>body{font-family:'Malgun Gothic',sans-serif;font-size:12px;margin:24px;color:#111}table{width:100%;border-collapse:collapse;margin-bottom:12px}td,th{border:1px solid #555;padding:6px;vertical-align:top}th{background:#eef1f5;width:17%;text-align:left}h1{font-size:18px;margin:0 0 12px}.sm td,.sm th{font-size:11px;width:auto}.pg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.pg figure{margin:0;border:1px solid #999;padding:4px;break-inside:avoid}.pg img{width:100%;max-height:220px;object-fit:contain}.pg figcaption{font-size:11px;text-align:center;margin-top:3px}</style></head><body>
  ${logoHead()}<h1>8D Report — ${esc(n.no)}</h1>
  <table><tr><th>협력사</th><td>${esc(supName(n.supplierId))}</td><th>발행일</th><td>${esc(n.issueDate)}</td></tr>
  <tr><th>품번</th><td>${esc(n.partNo)}</td><th>품명</th><td>${esc(n.partName)}</td></tr>
  <tr><th>제목</th><td colspan="3">${esc(n.title)}</td></tr>${
    n.basis === '공정 감사'
      ? `<tr><th>발행 근거</th><td colspan="3">공정 감사 — ${esc(n.auditDate)} ${esc(n.auditType)} ${esc(n.auditRef)}${
          n.finding ? '<br>' + esc(n.finding) : ''
        }</td></tr>`
      : ''
  }${
    n.basis === 'PPM 초과'
      ? `<tr><th>발행 근거</th><td colspan="3">PPM 초과 — ${esc(n.ppmFrom)}~${esc(n.ppmTo)} 실적 ${esc(n.ppmVal)} PPM / 목표 ${esc(n.ppmTarget)} PPM</td></tr>`
      : ''
  }${n.basis === '기타' ? `<tr><th>발행 근거</th><td colspan="3">기타</td></tr>` : ''}
  <tr><th>대책 요청일</th><td>${esc(n.requestDate)}</td><th>회신 기한 / 회신일</th><td>${esc(n.dueDate)} / ${esc(n.replyDate)}</td></tr>
  <tr><th>유효성 기한</th><td>${esc(n.verifyDue)}</td><th>검증일 / 결과</th><td>${esc(n.verifyDate)} / ${esc(n.verifyResult)}</td></tr>
  <tr><th>상태</th><td>${ncrStatus(n)}${ncrRejects(n) ? ` · 보완요청·반려 ${ncrRejects(n)}회` : ''}</td><th>담당</th><td>${esc(n.owner)}</td></tr>${
    nds.length ? `<tr><th>발송한 통보서 파일</th><td colspan="3">${nds.map((r) => esc(r.name)).join(' · ')}</td></tr>` : ''
  }${rds.length ? `<tr><th>협력사 대책서 파일</th><td colspan="3">${rds.map((r) => esc(r.name)).join(' · ')}</td></tr>` : ''}${
    n.reqType !== '단순 통보'
      ? `<tr><th>D3 봉쇄 기한 / 회신일</th><td>${esc(n.d3Due)} / ${esc(n.d3Date)}</td><th>클린 포인트</th><td>${esc(n.cleanPoint)}${
          n.cleanMark ? '<br>' + esc(n.cleanMark) : ''
        }</td></tr>`
      : ''
  }${
    n.concession && n.concession !== '없음'
      ? `<tr><th>특채</th><td colspan="3">${esc(n.concession)}${(n.concDocs || []).length ? ` · 첨부 문서 ${n.concDocs.length}건` : ''}</td></tr>`
      : ''
  }${n.penalty !== undefined && n.penalty !== '' ? `<tr><th>협력사 평가 감점</th><td colspan="3">${esc(n.penalty)}점</td></tr>` : ''}</table>${ctPrintHTML(
    n.contain,
  )}${vfLotsPrint(n.vlots)}
  <table>${D8.map(([k, l]) => `<tr><th>${l}</th><td style="height:48px">${nl(n[k])}</td></tr>`).join('')}</table>
  ${(n.evals || [])
    .filter(evalDone)
    .map(
      (e, ri, arr) => `<table class="sm" style="break-inside:avoid"><tr>
        <th colspan="5" style="background:#dde4ef">대책서 평가 ${(n.evals || []).indexOf(e) + 1}차 — ${esc(e.date)} · 평가자 ${esc(e.by)} · <b>${evalScore(e)}점 / ${evalVerdict(e)}</b></th></tr>
    <tr><th>항목</th><th>배점</th><th>평가</th><th>점수</th><th>의견</th></tr>
    ${evItems(e)
      .map((it) => {
        const v = e.sc[it.k];
        return `<tr><td>${it.t}</td><td>${it.w}</td><td>${
          (EV_LV.find((l) => l[0] === v) || ['', '', ''])[2]
        }</td><td>${Math.round(v * it.w)}</td><td>${esc(e.cm?.[it.k])}</td></tr>`;
      })
      .join('')}
    ${e.note ? `<tr><th>종합 의견</th><td colspan="4">${esc(e.note)}</td></tr>` : ''}</table>`,
    )
    .join('')}
  ${
    ds.length
      ? `<table class="sm"><tr><th>발생일</th><th>발생처</th><th>부품</th><th>유형</th><th>수량</th><th>납품일자</th><th>내용</th></tr>${ds
          .map(
            (d) =>
              `<tr><td>${esc(d.date)}</td><td>${esc(d.source)}</td><td>${esc(d.partNo)} ${esc(d.partName)}</td>
                <td>${esc(d.type)}</td><td>${num(d.qty)}</td><td>${esc(d.delivDate || d.lot)}</td><td>${nl(d.desc)}</td></tr>`,
          )
          .join('')}</table>`
      : ''
  }
  ${(() => {
    const lg = [...(n.logs || []), ...ds.flatMap((d) => (d.logs || []).map((l) => ({ ...l, dd: d })))].sort((a, b) =>
      (a.date || '').localeCompare(b.date || ''),
    );
    return lg.length
      ? `<table class="sm"><tr><th colspan="3" style="background:#dde4ef">조사 · 진행 경과</th></tr><tr><th>일자</th><th>구분</th><th>내용</th></tr>${lg
          .map(
            (l) =>
              `<tr><td style="white-space:nowrap">${esc(l.date)}</td><td style="white-space:nowrap">${esc(l.kind)}</td><td>${nl(l.text)}</td></tr>`,
          )
          .join('')}</table>`
      : '';
  })()}
  ${
    phs.length
      ? `<h3 style="font-size:14px">불량 사진</h3><div class="pg">${phs
          .map((p) => {
            const d = ds.find((x) => x.id === p.defectId) || {};
            return `<figure><img src="${p.data}"><figcaption>${esc(d.date || '')} ${esc(d.partName || d.partNo || '')}${p.caption ? ' · ' + esc(p.caption) : ''}</figcaption></figure>`;
          })
          .join('')}</div>`
      : ''
  }
  </body></html>`);
  reportShow(w, html, `8D_${n.no}.html`);
}
function exportNcrCSV() {
  const ns = filteredNcrs();
  downloadCSV(`NCR목록_${today()}.csv`, [
    [
      'NCR번호',
      '발행일',
      '협력사',
      '품번',
      '품명',
      '제목',
      '상태',
      '통보일',
      '통보방법',
      '통보서파일',
      '대책요청일',
      '회신기한',
      '회신일',
      '대책서파일',
      '타당성',
      '유효성기한',
      '검증일',
      '검증결과',
      '특채',
      '담당',
      ...D8.map((x) => x[1]),
    ],
    ...ns.map((n) => [
      n.no,
      n.issueDate,
      supName(n.supplierId),
      n.partNo,
      n.partName,
      n.title,
      ncrStatus(n),
      n.notifyDate || '',
      n.notifyMethod || '',
      (n.noticeDocs || []).length || '',
      n.requestDate,
      n.dueDate,
      n.replyDate,
      (n.replyDocs || []).length || '',
      n.validity,
      n.verifyDue,
      n.verifyDate,
      n.verifyResult,
      n.concession,
      n.owner,
      ...D8.map(([k]) => n[k]),
    ]),
  ]);
}
