// ── 불량 — 심각도 칸 · 품번 찾기 · 저장 · 삭제 · CSV ──
function sevDraft() {
  const f = $('#mf');
  const o = {
    id: curSev._id,
    date: f.date.value,
    source: f.source.value,
    partNo: f.partNo.value.trim(),
    supplierId: f.supplierId.value,
    type: f.type.value,
    qty: f.qty.value,
    inspQty: f.inspQty.value,
  };
  const sv = { special: !!curSev.special, override: curSev.override || '', reason: curSev.reason || '' };
  if (curSev._touched.impact) sv.impact = curSev.impact;
  if (curSev._touched.scope) sv.scope = curSev.scope;
  o.sev = sv;
  return o;
}
function setSevF(k, v) {
  curSev[k] = v;
  curSev._touched[k] = true;
  mfDirty = true;
  renderSev();
}
function renderSev() {
  const b = $('#sevBox');
  if (!b) return;
  setTimeout(icaSync, 0);
  const d = sevDraft(),
    v = sevOf(d),
    S = db.settings;
  const rb = $('#routeBox');
  if (rb && curSev._id) {
    const o = db.defects.find((x) => x.id === curSev._id);
    if (o) rb.innerHTML = routeHTML({ ...o, ...d, resp: $('#mf').resp.value, id: o.id, ncrId: o.ncrId, caseId: o.caseId }, true);
  }
  const lv = (k, cur, auto) =>
    `<div class="row" style="gap:4px">${SEV_F[k][1]
      .map((l, i) =>
        auto
          ? `<span class="bg ${cur === i + 1 ? 'inf' : 'mut'}" style="${cur === i + 1 ? 'font-weight:bold' : 'opacity:.55'}">${i + 1} ${l}</span>`
          : `<button type="button" class="b s ${cur === i + 1 ? 'p' : ''}" onclick="setSevF('${k}',${i + 1})">${i + 1} ${l}</button>`,
      )
      .join('')}</div>`;
  const note = {
    impact: curSev._touched.impact ? '직접 선택' : `유형 ‘${esc(d.type)}’ 기본값`,
    stage: `발생처 ‘${esc(d.source)}’ 기준 (자동)`,
    scope: curSev._touched.scope ? '직접 선택' : '수량·비율 기준 자동',
    repeat: `동일 협력사·유형 ${S.repeatWindow}일 내 ${v.rp.n}회${v.rp.re ? ' · 대책 종결 후 재발' : ''} (자동)`,
  };
  b.innerHTML = `<table class="ct"><tbody>${['impact', 'stage', 'scope', 'repeat']
    .map(
      (k) =>
        `<tr><td style="width:84px"><b>${SEV_F[k][0]}</b></td><td>${lv(
          k,
          v.f[k],
          k === 'stage' || k === 'repeat',
        )}</td><td class="muted" style="font-size:12px">${note[k]}</td><td class="n" style="width:40px"><b>${v.f[k]}</b></td></tr>`,
    )
    .join('')}
    <tr><td><b>특별특성</b></td><td colspan="2"><label class="row" style="gap:6px;font-size:13px"><input type="checkbox" ${curSev.special ? 'checked' : ''} onchange="curSev.special=this.checked;mfDirty=true;renderSev()"> CC/SC(특별특성) 항목의 불량 — 점수와 관계없이 A</label></td><td></td></tr></tbody>
    <tfoot><tr><td colspan="4" style="background:#f7f8fa;padding:8px">
      <div class="row" style="gap:10px"><span>합계 <b style="font-size:18px">${v.score}</b>점</span>
      <span>자동 판정 <span class="bg ${SEV_CLS[v.auto]}" style="font-size:13px;padding:2px 10px">${v.auto}</span>${
        v.forced.length
          ? ` <span class="muted" style="font-size:12px">강제 A: ${esc(v.forced.join(', '))}</span>`
          : ` <span class="muted" style="font-size:12px">(A ≥ ${S.sevA} · B ≥ ${S.sevB} · C 그 미만)</span>`
      }</span>
      <span style="flex:1"></span>
      <label class="fgl" style="flex-direction:row;align-items:center;gap:4px">수동 조정<select onchange="curSev.override=this.value;mfDirty=true;renderSev()"><option value="">자동 판정 사용</option>${[
        'A',
        'B',
        'C',
      ]
        .map((g) => `<option ${curSev.override === g ? 'selected' : ''}>${g}</option>`)
        .join('')}</select></label>
      ${
        curSev.override
          ? `<input value="${esc(curSev.reason)}" placeholder="조정 사유 (필수)" style="width:220px;${
              curSev.reason ? '' : 'border-color:#e7a29a'
            }" oninput="curSev.reason=this.value;mfDirty=true">`
          : ''
      }</div>
      <div style="margin-top:6px">최종 등급 <span class="bg ${SEV_CLS[v.grade]}" style="font-size:13px;padding:3px 14px">${v.grade}</span> → 대응 수준 <b>${v.resp}</b>${
        v.grade === 'C' ? ' <span class="muted" style="font-size:12px">(NCR 발행 시 회신 불요 통보)</span>' : ''
      }</div>
    </td></tr></tfoot></table>`;
  const ss = $('#sevSum');
  if (ss)
    ss.innerHTML = `<span class="bg ${SEV_CLS[v.grade]}" style="font-size:12px">${v.grade} · ${v.score}점</span> <span style="font-weight:normal;font-size:12px;color:var(--ink)">→ ${v.resp}${v.overridden ? ' (수동 조정)' : ''}</span>`;
}
// 발견 품목(완성품) 품번 → 품명 · 차종 자동 입력 (차종은 비어 있을 때만)
function onFgNo(v) {
  v = String(v || '').trim();
  const f = $('#mf');
  if (!f || !f.fgName) return;
  const p = partByNo(v),
    br = bomIx().byFg.get(v) || [],
    bf = bomIx().byFg.has(v) ? bomFg(v) : null;
  if (p || bf) {
    f.fgName.value = bf?.name || p?.name || '';
    const bm = bf?.model,
      m = bm || p?.model;
    if (f.model && m && (bm || !f.model.value.trim())) f.model.value = m;
    mfDirty = true;
  }
  bomDefect();
}
function srcLayout() {
  const f = $('#mf');
  if (!f || !f.source || !$('#grpFg')) return;
  const inc = /수입/.test(f.source.value),
    hasFg = !!(f.fgNo.value.trim() || f.fgName.value.trim()),
    set = (id, t) => {
      const e = document.getElementById(id);
      if (e) {
        e.textContent = t;
        e.title = t;
      }
    };
  $('#grpFg').style.display = inc && !hasFg ? 'none' : '';
  set('grpPartH', inc ? '입고 부품 (불량 부품)' : '원인 · 의심 부품');
  $('#grpPartS').textContent = inc ? '수입검사 — 검사한 부품이 곧 불량 부품입니다' : '확인 전이면 의심 부품을 넣거나 비워 두면 ‘조사 중’';
  set('lbPn', inc ? '품번' : '원인·의심 품번');
  set('lbPm', inc ? '품명' : '원인·의심 품명');
  set('lbDv', inc ? '입고(납품)일자' : '원인 부품 납품일자');
  set('lbQty', inc ? '불량수량' : '불량수량 (원인 부품 기준)');
  lbInsp();
  f.partNo.placeholder = inc ? '번호·품명·협력사로 검색' : '번호·품명·협력사로 검색 (모르면 비움 → 조사 중)';
}
// 불량률 · PPM의 모수: 원인 부품의 입고(로트) 수량 — 입고 건을 연결했거나 수입검사면 ‘입고수량’, 아니면 생산 · 투입수량도 허용
function lbInsp() {
  const f = $('#mf'),
    e = $('#lbInsp');
  if (!f || !e) return;
  const inc = f.source && /수입/.test(f.source.value),
    t = inc || curRcvId ? '입고수량 (로트)' : '입고(로트) · 생산수량';
  e.textContent = t;
  e.title = '불량률 · PPM 계산의 모수 — 불량이 나온 원인 부품의 입고(로트) 수량. 입고 건을 연결하면 자동으로 채워집니다';
}
function onPartNo(v) {
  const p = partByNo(v.trim());
  if (p) {
    const f = $('#mf'),
      fgM = f.fgNo && bomIx().byFg.has(f.fgNo.value.trim()) && bomFg(f.fgNo.value.trim()).model;
    f.partName.value = p.name || '';
    if (p.model && !fgM) f.model.value = p.model;
    if (p.supplierId) f.supplierId.value = p.supplierId;
  } // 완성품의 BOM 차종이 있으면 그것을 유지
  bomDefect();
  rcvHint();
}
function quickSup() {
  const n = prompt('추가할 협력사명');
  if (!n || !n.trim()) return;
  let s = db.suppliers.find((x) => x.name === n.trim());
  if (!s) {
    s = touch({ id: uid(), code: '', name: n.trim(), items: '', contact: '', phone: '', email: '', note: '', contacts: [], contactLog: [] });
    db.suppliers.push(s);
    save();
  }
  const sel = $('#mf').supplierId;
  sel.innerHTML = supOpts(s.id);
  sel.value = s.id;
}
const NUMF = ['qty', 'inspQty', 'fgQty'];
function gather() {
  const o = {};
  new FormData($('#mf')).forEach((v, k) => (o[k] = typeof v === 'string' ? v.trim() : v));
  return o;
}
let savingDefect = false;
async function saveDefect(id) {
  if (savingDefect) return null;
  const o = gather();
  if (!o.date) {
    toast('발생일을 입력하세요');
    return null;
  }
  if (o.date > today()) {
    toast('발생일이 오늘보다 뒤입니다 — 날짜를 확인하세요');
    return null;
  }
  NUMF.forEach((k) => (o[k] = o[k] === '' || o[k] == null ? '' : num(o[k])));
  if (num(o.inspQty) > 0 && num(o.qty) > num(o.inspQty)) {
    toast(
      `불량 수량 (${num(o.qty).toLocaleString()}) 이 ${(($('#lbInsp') || {}).textContent || '입고 · 검사 수량').trim()} (${num(o.inspQty).toLocaleString()}) 보다 큽니다`,
    );
    return null;
  }
  {
    const inForm = !!$('#mf').inv_verdict,
      exInv = id ? (db.defects.find((x) => x.id === id) || {}).inv : null;
    const iv = !inForm && exInv ? JSON.parse(JSON.stringify(exInv)) : {},
      c = { std: {} };
    Object.keys(o).forEach((k) => {
      if (k.startsWith('inv_')) {
        iv[k.slice(4)] = o[k];
        delete o[k];
      } else if (k.startsWith('ica_std_')) {
        c.std[k.slice(8)] = true;
        delete o[k];
      } else if (k.startsWith('ica_')) {
        c[k.slice(4)] = o[k];
        delete o[k];
      }
    });
    iv.costNotice = !!iv.costNotice;
    if (iv.share !== '' && iv.share != null) iv.share = Math.max(0, Math.min(100, num(iv.share)));
    if (iv.verdict) {
      if (inForm) o.resp = VERDICT_RESP[iv.verdict] || o.resp;
      if (!iv.verdictDate) iv.verdictDate = today();
    } else iv.verdictDate = '';
    if (inForm && iv.verdict === '협력사' && !o.partNo) toast('협력사 귀책으로 판정했지만 원인 품번이 비어 있습니다');
    const hasInv =
      ['farReq', 'farDue', 'farRecv', 'farResult', 'rca', 'verdict', 'sample', 'basis', 'share'].some((k) => iv[k] !== '' && iv[k] != null) ||
      iv.costNotice;
    if (hasInv || o.resp === '미정') o.inv = iv;
    else o.inv = undefined;
    if (o.resp === '공동' && !hasInv) o.inv = iv;
    if (!$('#mf').ica_level) {
      const ex = id ? (db.defects.find((x) => x.id === id) || {}).ica : null;
      if (ex) o.ica = ex;
      else if (o.resp === '사내') {
        const lv = icaLevelAuto({ ...(id ? db.defects.find((x) => x.id === id) : {}), ...o });
        o.ica =
          lv !== ICA_NONE ? { std: {}, due: addDays(iv.verdictDate || o.date, typeDays(lv === '8D' ? '8D 보고서' : '간이 대책서')) } : undefined;
      } else o.ica = undefined;
    } else {
      const hasIca = ICA_KEYS.some((k) => (c[k] || '').trim()) || c.doneDate || c.due || Object.keys(c.std).length;
      if (o.resp === '사내' || hasIca) {
        const lvEff = ($('#mf').ica_level || {}).value || ICA_NONE;
        if (c.doneDate && lvEff === '8D') {
          const miss = ['d4', 'd5', 'd6', 'd7'].filter((k) => !String(c[k] || '').trim());
          if (miss.length) {
            toast(`사내 8D 완료 전에 ${miss.map((k) => k.toUpperCase()).join(' · ')}을(를) 작성하세요 (원인 · 대책 · 효과 · 재발방지)`);
            return null;
          }
        }
        if (c.doneDate && !c.verifyDue) c.verifyDue = addDays(c.doneDate, num(db.settings.verifyDays) || 21);
        if (!c.due && o.resp === '사내' && lvEff !== ICA_NONE)
          c.due = addDays(iv.verdictDate || o.date, typeDays(lvEff === '8D' ? '8D 보고서' : '간이 대책서'));
        const sel = $('#mf').ica_level;
        if (!(sel && sel.dataset.touched)) delete c.level;
        o.ica = c;
      } else o.ica = undefined;
    }
    if (id && defCase(db.defects.find((x) => x.id === id))) delete o.ica;
  }
  if (curSev.override && !(curSev.reason || '').trim()) {
    toast('심각도를 수동 조정한 사유를 입력하세요');
    return null;
  }
  {
    const sv = { special: !!curSev.special };
    if (curSev._touched.impact) sv.impact = curSev.impact;
    if (curSev._touched.scope) sv.scope = curSev.scope;
    if (curSev.override) {
      sv.override = curSev.override;
      sv.reason = curSev.reason.trim();
    }
    o.sev = sv;
  }
  savingDefect = true;
  if (o.closedChk) {
    if (!(o.closedReason || '').trim()) {
      toast('수동 종결 사유를 입력하세요');
      savingDefect = false;
      return null;
    }
  }
  o.closed = o.closedChk ? { date: (id && db.defects.find((x) => x.id === id)?.closed?.date) || today(), reason: o.closedReason.trim() } : undefined;
  delete o.closedChk;
  delete o.closedReason;
  if (o.status === undefined && id) {
    const ex = db.defects.find((x) => x.id === id);
    if (ex && ex.status === '완료' && !o.closed && !o.doneDate) o.doneDate = ex.doneDate || ex.date;
  }
  o.costs = costOut();
  o.claim = claimOut();
  o.costBase = baseOut();
  if (o.costs.length) o.noCost = false;
  let d;
  if (id) {
    d = db.defects.find((x) => x.id === id);
    if (!d) {
      savingDefect = false;
      toast('이 불량 기록을 찾을 수 없습니다 (다른 창에서 삭제됨)');
      return null;
    }
    Object.assign(d, o);
    delete d.sevLock;
  } else {
    d = { id: uid(), ...o, ncrId: '', photos: [] };
    db.defects.push(d);
  }
  try {
    const put = curPhotos
      .filter((p) => p.isNew || p.dirty)
      .map((p) => ({
        id: p.id,
        defectId: d.id,
        name: p.name,
        caption: p.caption || '',
        data: p.data,
        thumb: p.thumb,
        createdAt: p.createdAt,
        updatedAt: now(),
      }));
    if (put.length) await photoPut(put);
    if (curRemoved.length) {
      await photoDel(curRemoved);
      curRemoved.forEach((i) => db.deleted.push({ id: i, at: now() }));
    }
    d.photos = curPhotos.map((p) => p.id);
    if (put.length || curRemoved.length) photoStr = null;
  } catch (e) {
    toast('사진 저장 실패: ' + e.message);
    d.photos = curPhotos.filter((p) => !p.isNew).map((p) => p.id);
  }
  savingDefect = false;
  touch(d);
  if (o.owner && !db.settings.owners.includes(o.owner)) db.settings.owners.push(o.owner);
  save();
  closeModal(true);
  render();
  if (!d.ncrId) {
    const v = sevOf(d),
      st = defStage(d);
    toast(`심각도 ${v.grade} (${v.score}점) → ${st.label}`);
    const rs = ncrReasons(d);
    if (rs.length && ['협력사', '공동'].includes(d.resp || '협력사') && !invOpen(d))
      offerAction(`${rs[0]} — NCR 발행 권고`, 'NCR 발행', () => ncrFromDefect(d.id));
  }
  if (!id) issAfterDefect(d);
  return d.id;
}
const logPhotoIds = (logs) => (logs || []).flatMap((l) => [...(l.photos || []), ...(l.hist || []).flatMap((h) => h.photos || [])]);
// 불량에 연결된 문서 · 함께 지워지는 기록 정리
function defLinks(d) {
  const n = d.ncrId ? db.ncrs.find((x) => x.id === d.ncrId) : db.ncrs.find((x) => (x.defectIds || []).includes(d.id));
  const cs = db.cases.filter((c) => c.id === d.caseId || (c.DefectIds || []).includes(d.id));
  const others = (ids) => (ids || []).filter((x) => x !== d.id && db.defects.some((y) => y.id === x)).length;
  return {
    ncr: n ? { n, others: others(n.defectIds), photos: logPhotoIds(n.logs).length, logs: (n.logs || []).length } : null,
    cases: cs.map((c) => ({ c, others: others(c.DefectIds) + (c.NcrId && (!n || c.NcrId !== n.id) ? 1 : 0), acts: czActs(c).length })),
    photos: (d.photos || []).length,
    logs: (d.logs || []).length,
    logPh: logPhotoIds(d.logs).length,
    costs: (d.costs || []).length,
    cost: costTotal(d),
    claim: !!d.claim,
    inv: !!d.inv,
    ica: !!d.ica,
  };
}
function delDefectDialog(d, L) {
  return new Promise((res) => {
    const c = $('#cfm'),
      prevFocus = document.activeElement;
    const own = [
      `불량 기록 — ${qi(d.date)} ${esc(d.source || '')} · ${qi(d.partNo || d.fgNo || '-')} ${esc(d.partName || d.fgName || '')} · ${esc(d.type || '')} ${num(d.qty).toLocaleString()}개`,
    ]
      .concat(L.photos ? [`사진 ${qi(L.photos + '장')} (사진 파일 삭제)`] : [])
      .concat(L.logs ? [`조사 · 진행 기록 ${qi(L.logs + '건')}${L.logPh ? ` · 첨부 사진 ${L.logPh}장` : ''}`] : [])
      .concat(L.costs || L.claim ? [`비용 ${L.costs}건${L.cost ? ` (${won(L.cost)}원)` : ''}${L.claim ? ' · 구상(청구·회수) 기록' : ''}`] : [])
      .concat(L.inv ? [`귀책 조사 기록 (FAR 요청·회신 · 판정)`] : [])
      .concat(L.ica ? ['사내 대책 기록'] : []);
    const opt = (key, label, delLabel, blocked, why) => `<div class="dl-o"><div class="dl-h">${label}</div>
      <label><input type="radio" name="dl_${key}" value="keep" checked> 연결만 해제 <span class="muted">— 문서는 그대로 남깁니다</span></label>
      <label class="${blocked ? 'off' : ''}"><input type="radio" name="dl_${key}" value="del" ${blocked ? 'disabled' : ''}> ${delLabel}</label>
      ${blocked ? `<div class="dl-why">${why}</div>` : ''}</div>`;
    const docs = [];
    if (L.ncr) {
      const n = L.ncr.n;
      docs.push(
        opt(
          'ncr',
          `NCR ${qi(n.no)} · ${esc(ncrStatus(n))} · ${esc(n.reqType || '8D 보고서')}`,
          `NCR도 삭제 <span class="muted">— 통보·대책서·평가 기록${L.ncr.logs ? ` · 진행 기록 ${L.ncr.logs}건` : ''}${
            L.ncr.photos ? ` · 사진 ${L.ncr.photos}장` : ''
          }${(n.concDocs || []).length ? ` · 특채 문서 ${n.concDocs.length}건` : ''}</span>`,
          L.ncr.others > 0,
          `다른 불량 ${L.ncr.others}건도 이 NCR에 연결되어 있어 삭제할 수 없습니다. 연결만 해제됩니다.`,
        ),
      );
    }
    L.cases.forEach((x, k) =>
      docs.push(
        opt(
          'case' + k,
          `RCA ${qi(x.c.CaseNo)} · ${esc(x.c.Stage || '')} · ${esc(x.c.Title || '')}`,
          `RCA도 삭제 <span class="muted">— 원인분석 워크시트${x.acts ? ` · 조치 ${x.acts}건` : ''}</span>`,
          x.others > 0,
          `다른 불량·NCR ${x.others}건도 이 RCA에 연결되어 있어 삭제할 수 없습니다. 연결만 해제됩니다.`,
        ),
      ),
    );
    c.innerHTML = `<div class="cbox wide" role="alertdialog" aria-modal="true"><div class="ch"><span class="ic dz">!</span>불량 기록을 삭제할까요?</div>
      <div class="cb"><div class="dl-s">이 불량과 함께 삭제되는 기록</div><ul>${own.map((t) => `<li>${t}</li>`).join('')}</ul>
      <div class="dl-s" style="margin-top:12px">연결된 문서 — 처리 방법을 고르세요</div>
      ${docs.length ? docs.join('') : '<div class="muted" style="font-size:13px">연결된 NCR · RCA가 없습니다.</div>'}
      <label class="dl-ck"><input type="checkbox" id="dlChk"> 연결된 문서와 함께 삭제되는 내용을 확인했습니다</label>
      <div class="note">삭제 후 10초 안에 되돌릴 수 있습니다.</div></div>
      <div class="cf"><button type="button" class="b" id="cfmNo">취소</button><button type="button" class="b dz" id="cfmOk" disabled>삭제</button></div></div>`;
    c.classList.add('on');
    const done = (v) => {
      c.classList.remove('on');
      c.innerHTML = '';
      document.removeEventListener('keydown', kh, true);
      try {
        prevFocus && prevFocus.focus && prevFocus.focus();
      } catch (e) {}
      res(v);
    };
    const kh = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        done(null);
      }
    };
    $('#dlChk').onchange = (e) => {
      $('#cfmOk').disabled = !e.target.checked;
    };
    $('#cfmNo').onclick = () => done(null);
    $('#cfmOk').onclick = () => {
      const v = (k) => (c.querySelector(`input[name="dl_${k}"]:checked`) || {}).value === 'del';
      done({ ncr: !!L.ncr && v('ncr'), cases: L.cases.map((x, k) => v('case' + k)) });
    };
    c.onmousedown = (e) => {
      if (e.target === c) done(null);
    };
    document.addEventListener('keydown', kh, true);
    setTimeout(() => $('#dlChk').focus(), 0);
  });
}
async function delDefect(id) {
  const d0 = db.defects.find((x) => x.id === id);
  if (!d0) return;
  const L = defLinks(d0),
    ch = await delDefectDialog(d0, L);
  if (!ch) return;
  const delN = ch.ncr && L.ncr && L.ncr.others === 0 ? L.ncr.n : null;
  const delC = L.cases.filter((x, k) => ch.cases[k] && x.others === 0).map((x) => x.c);
  const ph = [...(d0.photos || []), ...logPhotoIds(d0.logs), ...(delN ? [...logPhotoIds(delN.logs), ...ncrDocIds(delN)] : [])];
  const snap = await takeSnap(ph);
  // NCR: 삭제 또는 연결 해제
  if (delN) {
    czUnlinkNcrAll(delN.id);
    db.defects.forEach((x) => {
      if (x.ncrId === delN.id && x.id !== id) {
        x.ncrId = '';
        touch(x);
      }
    });
    removeRec('ncrs', delN.id);
  }
  db.ncrs.forEach((n) => {
    if ((n.defectIds || []).includes(id)) {
      n.defectIds = n.defectIds.filter((x) => x !== id);
      touch(n);
    }
  });
  // RCA: 삭제 또는 연결 해제
  delC.forEach((c) => {
    db.defects.forEach((x) => {
      if (x.caseId === c.id) {
        x.caseId = '';
        touch(x);
      }
    });
    db.ncrs.forEach((n) => {
      if (n.caseId === c.id) {
        n.caseId = '';
        touch(n);
      }
    });
    czActs(c).forEach((a) => removeRec('actions', a.id));
    removeRec('cases', c.id);
  });
  czUnlinkDefectAll(id);
  // 사진 파일
  attDrop(ph);
  removeRec('defects', id);
  if ($('#modal').classList.contains('on')) closeModal(true);
  save();
  render();
  const extra = [delN && `${delN.no}`, ...delC.map((c) => c.CaseNo)].filter(Boolean);
  offerUndo(snap, `불량 기록 1건을 삭제했습니다${extra.length ? ` (${extra.join(', ')} 포함)` : ''}${ph.length ? ` · 사진 ${ph.length}장` : ''}`);
}
function exportDefectsCSV() {
  const ds = filteredDefects();
  const head = [
    '발생일',
    '발생처',
    '심각도',
    '심각도점수',
    '대응수준',
    '완성품 품번',
    '완성품명',
    '완성품 수량',
    '원인 품번',
    '원인 품명',
    '차종',
    '협력사',
    '불량유형',
    '불량수량',
    '입고(로트)수량',
    '납품일자',
    '도면 규격',
    '실측',
    '불량내용',
    '임시조치',
    '처리',
    '귀책',
    ...COST_CATS.map((c) => c + '비'),
    '비용합계',
    '구상상태',
    '청구액',
    '회수액',
    '미회수',
    'NCR번호',
    '담당자',
    '진행단계',
    '유효성검증',
    '처리완료일',
    '수동종결사유',
    'FAR요청일',
    'FAR회신기한',
    'FAR회신일',
    'FAR결과',
    '사내RCA',
    '귀책판정',
    '판정일',
    '협력사부담%',
    '사내대책수준',
    '사내대책완료일',
    '표준화반영',
    '진행기록',
  ];
  downloadCSV(`불량목록_${today()}.csv`, [
    head,
    ...ds.map((d) => {
      const v = sevOf(d);
      return [
        d.date,
        d.source,
        v.grade,
        v.score,
        v.resp,
        d.fgNo || '',
        d.fgName || '',
        d.fgQty ?? '',
        d.partNo,
        d.partName,
        d.model,
        supName(d.supplierId),
        d.type,
        d.qty,
        d.inspQty,
        d.delivDate || d.lot,
        d.spec || '',
        d.actual || '',
        d.desc,
        d.containment,
        d.disposition,
        d.resp,
        ...COST_CATS.map((c) => (d.costs || []).filter((x) => x.cat === c).reduce((a, x) => a + num(x.amt), 0)),
        costTotal(d),
        claimStatus(d),
        d.claim?.reqAmt ?? '',
        d.claim?.recvAmt ?? '',
        outstanding(d),
        db.ncrs.find((n) => n.id === d.ncrId)?.no || '',
        d.owner,
        defStage(d).label,
        (() => {
          const n = d.ncrId && db.ncrs.find((x) => x.id === d.ncrId);
          return n && isDone(d) ? verifyInfo(n).label : icaVerify(d)?.label || '';
        })(),
        d.doneDate || '',
        d.closed?.reason || '',
        d.inv?.farReq || '',
        d.inv?.farDue || '',
        d.inv?.farRecv || '',
        d.inv?.farResult || '',
        d.inv?.rca || '',
        d.inv?.verdict || '',
        d.inv?.verdictDate || '',
        d.inv?.share ?? '',
        d.resp === '사내' ? icaLevel(d) : '',
        d.ica?.doneDate || '',
        ICA_STD.filter(([k]) => d.ica?.std?.[k])
          .map((x) => x[1])
          .join(', '),
        (d.logs || [])
          .slice()
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
          .map((l) => `[${l.date} ${l.kind}] ${l.text}`)
          .join('\n'),
      ];
    }),
  ]);
}
