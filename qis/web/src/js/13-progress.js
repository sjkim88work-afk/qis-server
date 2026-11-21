/* ================= 진행 현황 ================= */
const SEV_ORD = { A: 0, B: 1, C: 2 };
// NCR 상태에서 다음 기한을 자동으로 정함 (회신 기한 · 유효성 검증 기한)
function progDue(n) {
  const a = progDue0(n),
    f = farOn(n) && !n.far.replyDate && n.far.due ? { next: 'FAR 분석 회신 기한', nextDate: n.far.due } : null;
  return !a ? f : !f ? a : f.nextDate < a.nextDate ? f : a;
}
function progDue0(n) {
  const st = ncrStatus(n);
  if ((st === '대책요청' || st === '보완요청') && n.dueDate)
    return { next: st === '보완요청' ? '보완 회신 기한' : '대책서 회신 기한', nextDate: n.dueDate };
  if (st === '승인(검증대기)' && n.verifyDue) return { next: '유효성 검증 기한', nextDate: n.verifyDue };
  return null;
}
function progCases(all) {
  if (pcMemo) {
    const k = String(all);
    if (pcMemo[k]) return pcMemo[k];
    return (pcMemo[k] = progCases0(all));
  }
  return progCases0(all);
}
function progCases0(all) {
  const C = [];
  db.ncrs
    .filter((n) => ncrStatus(n) !== '종결' && (all || !czOwns(n, 'ncr')))
    .forEach((n) => {
      const ds = (n.defectIds || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean);
      const g = ds.map((d) => sevOf(d).grade).sort((a, b) => SEV_ORD[a] - SEV_ORD[b])[0] || '';
      const nx = progDue(n);
      C.push({
        kind: 'ncr',
        obj: n,
        id: n.id,
        title: n.no,
        sub: `${n.partNo || ''} ${n.partName || ''}`.trim(),
        sup: supName(n.supplierId),
        grade: g,
        status: ncrStatus(n),
        owner: n.owner || '',
        last: caseLast('ncr', n),
        lastM: caseLastManual('ncr', n),
        next: nx,
        flags: ncrFlags(n),
      });
    });
  db.defects
    .filter(
      (d) =>
        !(d.ncrId && db.ncrs.some((n) => n.id === d.ncrId)) &&
        (!isDone(d) || ['wait', 'late', 'ng'].includes(icaVerify(d)?.k)) &&
        (all || !czOwns(d, 'defect')),
    )
    .forEach((d) => {
      const iv = d.inv || {},
        ic = d.ica || {},
        nx =
          invOpen(d) && iv.farReq && !iv.farRecv && iv.farDue
            ? { next: 'FAR 회신 기한', nextDate: iv.farDue }
            : icaNeed(d) && !ic.doneDate && ic.due
              ? { next: '사내 대책 기한', nextDate: ic.due }
              : ic.doneDate && ic.verifyDue && !ic.verifyDate
                ? { next: '사내 유효성 검증 기한', nextDate: ic.verifyDue }
                : null;
      C.push({
        kind: 'defect',
        obj: d,
        id: d.id,
        title: defLabel(d),
        sub: `${d.type || ''} ${num(d.qty).toLocaleString()}개`,
        sup: supName(d.supplierId),
        grade: sevOf(d).grade,
        status: isDone(d) ? '사내 대책 — ' + icaVerify(d).label : defStage(d).label,
        owner: d.owner || '',
        last: caseLast('defect', d),
        lastM: caseLastManual('defect', d),
        next: nx,
        flags: {},
      });
    });
  if (all !== 'noRca' && db.cases)
    db.cases
      .filter((c) => c.Status === '진행중' || c.Status === '보류')
      .forEach((c) => {
        const ds = (c.DefectIds || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean),
          g = ds.map((d) => sevOf(d).grade).sort((a, b) => SEV_ORD[a] - SEV_ORD[b])[0] || '';
        const acts = czActs(c),
          la =
            [c.Created, ...acts.map((a) => a.DoneDate), ...(c.Analyses || []).map((a) => String(a.updatedAt || '').slice(0, 10))]
              .filter(Boolean)
              .sort()
              .pop() || '';
        const od = acts
          .filter((a) => !['완료', '취소'].includes(a.ActionStatus) && has(a.DueDate))
          .sort((a, b) => a.DueDate.localeCompare(b.DueDate))[0];
        const tg = czTarget(c),
          nx =
            [
              has(c.RecheckDate) ? { next: `재확인 — ${c.NextAction || '다음 행동'}`, nextDate: c.RecheckDate } : null,
              od ? { next: `조치 — ${od.Title || od.Category}`, nextDate: od.DueDate } : null,
              tg ? { next: '목표 종결일', nextDate: tg } : null,
            ]
              .filter(Boolean)
              .sort((a, b) => a.nextDate.localeCompare(b.nextDate))[0] || null;
        C.push({
          kind: 'rca',
          obj: c,
          id: c.id,
          title: c.CaseNo,
          sub: c.Title || '',
          sup: supName(c.SupplierId),
          grade: g,
          status: `${c.Stage}${c.Status === '보류' ? ' (보류)' : ''} · 공 ${c.Ball || '-'}`,
          owner: c.Owner || '',
          last: la,
          lastM: null,
          next: nx,
          flags: {},
        });
      });
  C.forEach((c) => {
    c.stale = c.last ? diffDays(c.last, today()) : 999;
    c.late = lateInfo(c.kind, c.obj);
  });
  return C;
}
// 지연 = 미종결 + 기한 경과. 판정은 여기 한 곳에서 — 대시보드 · 진행 현황 · 목록 · 주간 보고가 같은 기준을 씀
// 돌려주는 값: 지난 기한 목록 [{l:무엇, d:기한, n:경과일}] (오래된 순). 비어 있으면 지연 아님
function lateInfo(kind, o) {
  const t = today(),
    L = [],
    add = (l, d) => {
      if (d && d < t) L.push({ l, d, n: diffDays(d, t) });
    };
  if (!o) return L;
  if (kind === 'ncr') {
    if (ncrStatus(o) === '종결') return L;
    const f = ncrFlags(o);
    if (f.requestLate) add('협력사 통보', addDays(o.issueDate, NOTIFY_GRACE));
    if (f.d3Late) add('D3 봉쇄 회신', o.d3Due);
    if (f.replyLate) add('대책서 회신', o.dueDate);
    if (f.verifyLate) add('유효성 검증', o.verifyDue);
    if (f.farLate && o.far) add('FAR 분석 회신', o.far.due);
  } else if (kind === 'defect') {
    const iv = o.inv || {},
      ic = o.ica || {};
    if (invOpen(o) && iv.farReq && !iv.farRecv) add('FAR 회신', iv.farDue);
    if (icaNeed(o) && !ic.doneDate) add('사내 대책', ic.due);
    if (!o.ncrId && ic.doneDate && !ic.verifyDate) add('사내 유효성 검증', ic.verifyDue);
  } else if (kind === 'rca') {
    if (!czOpen(o)) return L;
    add('목표 종결일', czTarget(o));
    czActs(o)
      .filter((a) => !['완료', '취소'].includes(a.ActionStatus))
      .forEach((a) => add('조치 · ' + (a.Title || a.Category || ''), a.DueDate));
  }
  return L.sort((a, b) => b.n - a.n);
}
const lateBadge = (L) =>
  L && L.length
    ? `<span class="bg bad" title="${esc(
        L.map((x) => `${x.l} 기한 ${x.d} (D+${x.n})`).join('\n'),
      )}">지연 D+${L[0].n}${L.length > 1 ? ` · ${L.length}건` : ''}</span>`
    : '';
const lateTxt = (L) => L.map((x) => `${x.l} ${x.d} (D+${x.n})`).join(' · ');
const openCase = (kind, id) => (kind === 'ncr' ? editNcr(id) : kind === 'rca' ? czOpenCase(id) : openLog(id));
const nxBadge = (dt) => {
  if (!dt) return '<span class="bg mut">일자 미정</span>';
  const x = diffDays(today(), dt);
  return `<span class="bg ${x < 0 ? 'bad' : x <= 2 ? 'warn' : 'mut'}">${dt} ${x < 0 ? 'D+' + -x : x === 0 ? '오늘' : 'D-' + x}</span>`;
};
const staleBadge = (n) =>
  n >= 999 ? '<span class="bg mut">기록 없음</span>' : `<span class="bg ${n >= 30 ? 'bad' : n >= 14 ? 'warn' : 'mut'}">${n}일 전</span>`;
// ── 진행 현황 (메뉴) — 왼쪽: 끝나지 않은 건 (한 줄 = 한 건: 연결된 이슈 · 불량 · FAR · NCR · RCA 를 묶음), 오른쪽: 고른 건의 전체 이력 ──
const progName = (c) => {
  const o = c.obj;
  if (c.kind === 'rca') return o.Title || o.CaseNo;
  if (c.kind === 'ncr') return `${o.partName || o.partNo || ''} ${o.title || ''}`.trim() || o.no;
  return `${o.partName || o.partNo || o.fgName || '(부품 미정)'} ${o.type || ''}`.trim();
};
const progKind = (k) => (k === 'ncr' ? 'NCR' : k === 'rca' ? 'RCA' : '불량');
// 한 건에 묶인 기록: 이슈 · 불량들 · NCR · RCA
function progBundle(kind, id) {
  let rca = null,
    ncr = null,
    defs = [];
  const D = (ids) => (ids || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean);
  if (kind === 'rca') {
    rca = (db.cases || []).find((x) => x.id === id) || null;
    if (rca) {
      ncr = czNcr(rca);
      defs = D(rca.DefectIds);
    }
  } else if (kind === 'ncr') {
    ncr = db.ncrs.find((x) => x.id === id) || null;
    if (ncr) rca = (db.cases || []).find((x) => x.NcrId === ncr.id) || null;
  } else {
    const d = db.defects.find((x) => x.id === id);
    if (d) {
      defs = [d];
      ncr = (d.ncrId && db.ncrs.find((x) => x.id === d.ncrId)) || null;
      rca = defCase(d);
    }
  }
  if (ncr) D(ncr.defectIds).forEach((d) => defs.includes(d) || defs.push(d));
  if (!rca && defs.length) rca = defs.map(defCase).find(Boolean) || null;
  const iss = defs.map((d) => d.issueId && issById(d.issueId)).find(Boolean) || null;
  return { rca, ncr, defs, iss };
}
// 전체 이력 줄: {date, time, kind(이슈|불량|FAR|NCR|RCA), text, src, open, by, auto, att}
function progEvents(B) {
  const E = [],
    man = (logs, kind, src, open) =>
      (logs || [])
        .filter((l) => !l.void)
        .forEach((l) =>
          E.push({
            date: l.date || String(l.at || '').slice(0, 10),
            time: l.time || '',
            kind,
            text: `${l.kind ? l.kind + ' — ' : ''}${l.text || ''}${l.result ? ' → ' + l.result : ''}`,
            src,
            open,
            by: l.by || '',
            auto: !!l.sys,
            att: (l.photos || []).length,
          }),
        );
  if (B.iss) man(B.iss.logs, '이슈', B.iss.no, `issOpen('${B.iss.id}')`);
  B.defs.forEach((d) => {
    const src = `불량 ${String(d.date || '').slice(5)}`,
      open = `openLog('${d.id}')`;
    autoEvents(d, null).forEach((e) =>
      E.push({ date: e.date, time: '', kind: /FAR/.test(e.text) ? 'FAR' : '불량', text: e.text, src, open, by: '', auto: true }),
    );
    man(d.logs, '불량', src, open);
  });
  if (B.ncr) {
    const open = `editNcr('${B.ncr.id}')`;
    autoEvents(null, B.ncr).forEach((e) => E.push({ date: e.date, time: '', kind: 'NCR', text: e.text, src: B.ncr.no, open, by: '', auto: true }));
    man(B.ncr.logs, 'NCR', B.ncr.no, open);
  }
  if (B.rca)
    czHistRows(B.rca).forEach((x) =>
      E.push({
        date: x.date,
        time: x.at ? loc(x.at).slice(11, 16) : '',
        kind: 'RCA',
        text: `${x.type ? x.type + ' — ' : ''}${x.text || ''}`,
        src: B.rca.CaseNo,
        open: `czOpenCase('${B.rca.id}')`,
        by: x.by || '',
        auto: !!x.est,
      }),
    );
  return E.filter((e) => e.date).sort((a, b) => b.date.localeCompare(a.date) || String(b.time).localeCompare(String(a.time)));
}
// 끝난 건 (진행 현황의 ‘끝난 건’ 단추) — 가장 위의 기록 기준: RCA 종결 → RCA 한 줄, RCA 없는 NCR 종결 → NCR 한 줄, NCR 도 없는 완료 불량 → 불량 한 줄
function progDoneCases() {
  const C = [],
    hasCase = (n) => (db.cases || []).some((x) => x.NcrId === n.id);
  (db.cases || [])
    .filter((c) => c.Status === '종결')
    .forEach((c) =>
      C.push({
        kind: 'rca',
        obj: c,
        id: c.id,
        title: c.CaseNo,
        sub: c.Title || '',
        sup: supName(c.SupplierId),
        status: '종결',
        owner: c.Owner || '',
        end: c.CloseDate || '',
      }),
    );
  db.ncrs
    .filter((n) => ncrStatus(n) === '종결' && !hasCase(n))
    .forEach((n) =>
      C.push({
        kind: 'ncr',
        obj: n,
        id: n.id,
        title: n.no,
        sub: `${n.partNo || ''} ${n.partName || ''}`.trim(),
        sup: supName(n.supplierId),
        status: '종결',
        owner: n.owner || '',
        end: caseLast('ncr', n),
      }),
    );
  db.defects
    .filter((d) => !d.ncrId && !defCase(d) && isDone(d) && !['wait', 'late', 'ng'].includes(icaVerify(d)?.k))
    .forEach((d) =>
      C.push({
        kind: 'defect',
        obj: d,
        id: d.id,
        title: defLabel(d),
        sub: '',
        sup: supName(d.supplierId),
        status: '완료',
        owner: d.owner || '',
        end: d.doneDate || caseLast('defect', d),
      }),
    );
  C.forEach((c) => {
    c.late = [];
    c.next = null;
    c.stale = 0;
    c.done = true;
  });
  return C.sort((a, b) => (b.end || '').localeCompare(a.end || ''));
}
// 전체 이력만 인쇄 (목록 · 조건 줄은 빼고)
function progPrint() {
  document.body.classList.add('pgprint');
  const off = () => {
    document.body.classList.remove('pgprint');
    window.removeEventListener('afterprint', off);
  };
  window.addEventListener('afterprint', off);
  window.print();
  setTimeout(off, 60000);
}
function progSel(kind, id) {
  state.pf.sel = state.pf.sel && state.pf.sel.id === id ? null : { kind, id };
  state.pf.hk = '';
  render();
}
// 다른 화면 (RCA 창 등) 에서 전체 이력 열기
async function progOpen(kind, id) {
  if ($('#modal').classList.contains('on')) {
    // 창에서 고치던 내용이 있으면 먼저 물음 (저장하지 않고 닫히는 것을 막음)
    if (
      mfDirty &&
      !(await askConfirm({ title: '고치던 내용을 저장하지 않고 이동할까요?', msg: '먼저 저장하려면 취소를 누른 뒤 저장하세요.', ok: '이동' }))
    )
      return;
    mfDirty = false;
    closeModal(true);
  }
  state.pf = {
    ...(state.pf || {}),
    late: '',
    stale: '',
    q: '',
    sup: '',
    owner: '',
    kind: '',
    done: !progCases().some((c) => c.kind === kind && c.id === id),
    sel: { kind, id },
    hk: '',
  };
  go('prog');
}
function progHistHTML(c) {
  const f = state.pf,
    B = progBundle(c.kind, c.id),
    all = progEvents(B),
    nd = B.defs.length,
    far = B.defs.filter((d) => d.inv && d.inv.farReq);
  const steps = [];
  if (B.iss) steps.push(['이슈', B.iss.no, B.iss.status === '종결']);
  if (nd) steps.push(['불량', `${nd}건 · ${sum(B.defs, 'qty').toLocaleString()}개`, B.defs.every(isDone)]);
  if (far.length)
    steps.push(['FAR', far.every((d) => d.inv.verdict) ? '판정 ' + far.map((d) => d.inv.verdict)[0] : '조사 중', far.every((d) => d.inv.verdict)]);
  if (B.ncr) steps.push(['NCR', `${B.ncr.no} · ${ncrStatus(B.ncr)}`, ncrStatus(B.ncr) === '종결']);
  if (B.rca) steps.push(['RCA', `${B.rca.CaseNo} · ${B.rca.Stage || ''}`, ['종결', '취소'].includes(B.rca.Status)]);
  const kinds = [...new Set(all.map((e) => e.kind))],
    E = all.filter((e) => (!f.hk || e.kind === f.hk) && (f.hauto !== false || !e.auto));
  const kb = (k, l) => `<button type="button" class="b s${(f.hk || '') === k ? ' on' : ''}" onclick="state.pf.hk='${k}';render()">${l}</button>`;
  return `<div class="pgh"><h3>${esc(progName(c))}</h3><span class="muted">${esc(c.sup || '')} · 전체 이력 ${all.length}건</span><span style="flex:1"></span>${(() => {
    const why = a3Ready(B);
    return `<button type="button" class="b s noprint" ${why ? 'disabled' : ''} title="${esc(why || '경영진 보고용 한 장 (A3 가로)')}" onclick="a3Report('${c.kind === 'rca' ? 'case' : c.kind}','${c.id}')">A3 보고서</button>${
      why ? `<span class="muted noprint" style="font-size:11.5px">${esc(why)}</span>` : ''
    }`;
  })()}<button type="button" class="b s noprint" onclick="progPrint()">이력 출력</button><button type="button" class="b s noprint" onclick="openCase('${c.kind}','${c.id}')">${progKind(c.kind)} 열기</button><button type="button" class="b s noprint" onclick="progSel('${c.kind}','${c.id}')">닫기</button></div>
    <div class="pgflow">${steps
      .map(
        ([k, t, done]) =>
          `<div class="${done ? 'done' : 'on'}"><b>${k}</b> <span>${done ? '끝남' : '진행 중'}</span><small title="${esc(t)}">${esc(t)}</small></div>`,
      )
      .join('')}</div>
    <div class="pgf noprint"><span class="muted">보기</span>${kb('', '전체')}${['이슈', '불량', 'FAR', 'NCR', 'RCA']
      .filter((k) => kinds.includes(k))
      .map((k) => kb(k, k))
      .join(
        '',
      )}<span style="flex:1"></span><label><input type="checkbox" ${f.hauto !== false ? 'checked' : ''} onchange="state.pf.hauto=this.checked;render()"> 자동 기록 포함</label></div>
    <div class="tw"><table class="pght"><thead><tr><th>일자</th><th>구분</th><th>내용</th><th>출처</th><th>기록자</th></tr></thead><tbody>${
      E.map(
        (e) =>
          `<tr><td class="mono">${esc(e.date.slice(5))}${e.time ? ` <span class="muted">${esc(e.time)}</span>` : ''}</td><td><b>${e.kind}</b></td><td>${esc(e.text)}${
            e.att ? ` <span class="muted">${LG_ICO.clip} ${e.att}</span>` : ''
          }</td><td><a class="lk" onclick="${e.open}" title="누르면 열림">${esc(e.src)}</a></td><td class="muted">${esc(e.by || (e.auto ? '자동' : ''))}</td></tr>`,
      ).join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">조건에 맞는 기록이 없습니다.</td></tr>'
    }</tbody></table></div>
    <div class="help" style="margin:8px 12px">여기서는 보기만 합니다. 기록은 출처의 창 (불량 진행 · NCR · RCA · 이슈) 에서 씁니다.</div>`;
}
function renderProg() {
  const f = (state.pf = {
    kind: '',
    owner: '',
    stale: '',
    sup: '',
    sort: 'stale',
    late: '',
    q: '',
    sel: null,
    hk: '',
    done: false,
    ...(state.pf || {}),
  });
  const all = progCases(),
    lateN = all.filter((c) => c.late.length).length,
    staleN = all.filter((c) => c.stale >= 14).length;
  const doneAll = f.done ? progDoneCases() : null;
  let C = (doneAll || all).slice();
  const owners = [...new Set(C.map((c) => c.owner).filter(Boolean))];
  if (f.kind) C = C.filter((c) => c.kind === f.kind);
  if (f.owner) C = C.filter((c) => c.owner === f.owner);
  if (f.sup) C = C.filter((c) => (c.kind === 'rca' ? c.obj.SupplierId : c.obj.supplierId) === f.sup);
  if (!f.done && f.stale) C = C.filter((c) => c.stale >= +f.stale);
  if (!f.done && f.late) C = C.filter((c) => c.late.length);
  if (f.q) {
    const q = f.q.toLowerCase();
    C = C.filter((c) =>
      [progName(c), c.title, c.sub, c.sup, c.owner].some((v) =>
        String(v || '')
          .toLowerCase()
          .includes(q),
      ),
    );
  }
  // 지연이 먼저, 그 다음 기한이 빠른 순
  if (!f.done)
    C.sort((a, b) => (b.late.length ? 1 : 0) - (a.late.length ? 1 : 0) || (a.next?.nextDate || '9999').localeCompare(b.next?.nextDate || '9999'));
  const shown = C.slice(0, 300);
  const sel = f.sel && (doneAll || all).find((c) => c.id === f.sel.id && c.kind === f.sel.kind),
    selC = sel || (f.sel ? progClosed(f.sel) : null);
  const chip = (on, l, n, js) =>
    `<button type="button" class="b s${on ? ' on' : ''}" onclick="${js};render()">${l} <span class="mono">${n}</span></button>`;
  return `<div class="pl pg"><div class="card noprint pltool"><div class="row">
    ${chip(!f.done && !f.late && !f.stale, '진행 중', all.length, "state.pf.late='';state.pf.stale='';state.pf.done=false")}${chip(
      !f.done && !!f.late,
      '지연',
      lateN,
      "state.pf.late=state.pf.late?'':'1';state.pf.stale='';state.pf.done=false",
    )}${chip(!f.done && !!f.stale, '정체', staleN, "state.pf.stale=state.pf.stale?'':'14';state.pf.late='';state.pf.done=false")}${chip(
      f.done,
      '끝난 건',
      doneAll ? doneAll.length : '',
      "state.pf.done=!state.pf.done;state.pf.late='';state.pf.stale='';state.pf.sel=null",
    )}
    <select onchange="state.pf.kind=this.value;render()"><option value="">RCA + NCR + 불량</option>
      <option value="rca" ${f.kind === 'rca' ? 'selected' : ''}>RCA만</option>
      <option value="ncr" ${f.kind === 'ncr' ? 'selected' : ''}>NCR만</option>
      <option value="defect" ${f.kind === 'defect' ? 'selected' : ''}>불량만 (NCR 없음)</option></select>
    <select onchange="state.pf.sup=this.value;render()">${supOpts(f.sup, '전체 협력사')}</select>
    <select onchange="state.pf.owner=this.value;render()"><option value="">전체 담당</option>${owners
      .map((o) => `<option ${o === f.owner ? 'selected' : ''}>${esc(o)}</option>`)
      .join('')}</select>
    <input placeholder="검색 (부품 · 번호 · 협력사)" value="${esc(f.q)}" oninput="state.pf.q=this.value;deb(render)" style="width:200px">
  </div></div>
  <div class="pgw"><div class="pgl" id="pgtab"><div class="tw"><table><thead><tr><th>건</th><th>협력사</th><th>지금 단계</th><th>${f.done ? '끝난 날' : '기한'}</th></tr></thead><tbody>${
    shown
      .map(
        (c) =>
          `<tr class="${selC && selC.id === c.id ? 'sel' : ''}" style="cursor:pointer" onclick="progSel('${c.kind}','${c.id}')" title="${esc(c.title)}${c.sub ? ' · ' + esc(c.sub) : ''}">
      <td><b>${esc(progName(c))}</b></td><td>${esc(c.sup)}</td><td>${progKind(c.kind)} ${esc(c.status)}</td>
      <td style="white-space:nowrap" title="${esc(c.next ? c.next.next : '')}">${
        c.done
          ? `<span class="mono">${esc(c.end || '-')}</span>`
          : c.late.length
            ? lateBadge(c.late)
            : c.next
              ? nxBadge(c.next.nextDate)
              : '<span class="muted">-</span>'
      }</td></tr>`,
      )
      .join('') ||
    `<tr><td colspan="4" class="muted" style="text-align:center;padding:24px">${f.done ? '끝난 건이 없습니다.' : '조건에 맞는 진행 중인 건이 없습니다.'}</td></tr>`
  }</tbody></table></div>
  <div class="help" style="margin:8px 12px">${
    C.length > shown.length ? `최근 ${shown.length}건만 보입니다 (전체 ${C.length}건) — 검색으로 좁히세요. ` : ''
  }한 줄은 한 건입니다. 연결된 이슈 · 불량 · FAR · NCR · RCA 를 한 줄로 묶습니다. 줄을 누르면 전체 이력이 나옵니다. A3 보고서는 끝난 건의 전체 이력에서 출력합니다.</div></div>
  <div class="pgr">${selC ? progHistHTML(selC) : '<div class="muted" style="padding:40px 16px;text-align:center">왼쪽에서 건을 누르면 전체 이력이 여기에 나옵니다.</div>'}</div></div></div>`;
}
// 목록에 없는 (끝난) 건의 전체 이력도 볼 수 있게 — RCA 창의 ‘전체 이력 보기’ 로 들어온 경우
function progClosed(sel) {
  const B = progBundle(sel.kind, sel.id),
    o = sel.kind === 'rca' ? B.rca : sel.kind === 'ncr' ? B.ncr : B.defs[0];
  if (!o) return null;
  return { kind: sel.kind, id: sel.id, obj: o, sup: supName(sel.kind === 'rca' ? o.SupplierId : o.supplierId), title: '', sub: '' };
}
// 대시보드의 ‘할 일’ — 표 한 개: 오늘 챙길 일(it: <li> 문장들) + 기한 임박 + 오래 정체된 건. 같은 건은 한 줄로 (정체는 내용 끝에 덧붙임)
function todoCell(li) {
  const t = document.createElement('template');
  t.innerHTML = li.replace(/^<li[^>]*>/, '').replace(/<\/li>$/, '');
  const f = t.content,
    take = (sel) => {
      const e = f.querySelector(sel);
      if (!e) return '';
      e.remove();
      return e.outerHTML;
    };
  const kind = take('.bg');
  // 대상: 구분 바로 뒤에 오는 링크만 (문장 가운데의 링크는 내용에 그대로 둠)
  let who = '';
  {
    let n = f.firstChild;
    while (n && n.nodeType === 3 && !n.textContent.trim()) n = n.nextSibling;
    if (n && n.nodeType === 1 && n.matches('a.lk, b')) {
      n.remove();
      who = n.outerHTML;
    }
  }
  let btns = '';
  f.querySelectorAll('button').forEach((e) => {
    btns += e.outerHTML + ' ';
    e.remove();
  });
  const d = document.createElement('div');
  d.appendChild(f);
  return { kind, who, btns, text: d.innerHTML.trim().replace(/^(—|·)\s*/, ''), raw: li };
}
function todoCard(it) {
  const C = progCases(),
    due = C.filter((c) => c.next && diffDays(today(), c.next.nextDate) <= 3).sort((a, b) => a.next.nextDate.localeCompare(b.next.nextDate)),
    od = due.filter((c) => c.next.nextDate < today());
  const st = C.filter((c) => c.stale >= 14)
    .sort((a, b) => b.stale - a.stale)
    .slice(0, 4);
  const lateN = C.filter((c) => c.late.length).length, // 지연 = 미종결 + 기한 경과 (진행 현황 화면과 같은 기준)
    soonN = due.length - od.length,
    staleN = C.filter((c) => c.stale >= 14).length;
  const all = !!state.dashAll,
    R = it.map(todoCell),
    has = (id) => R.find((r) => r.raw.includes(`'${id}'`));
  const open = (c) => `<a class="lk" onclick="openCase('${c.kind}','${c.id}')">${esc(c.title)}</a>`;
  // 기한 임박 · 초과: 오늘 챙길 일에 이미 있는 건은 다시 넣지 않음
  due.slice(0, 6).forEach((c) => {
    if (!has(c.id)) R.push({ kind: nxBadge(c.next.nextDate), who: open(c), btns: '', text: `${esc(c.next.next)} · ${esc(c.sup)}`, raw: `'${c.id}'` });
  });
  const nAct = R.length;
  st.forEach((c) => {
    const r = has(c.id);
    if (r) r.text += ` <span class="muted">· 기록 ${c.stale >= 999 ? '없음' : c.stale + '일 전'}</span>`;
    else
      R.push({
        kind: staleBadge(c.stale).replace('일 전</span>', '일 정체</span>'),
        who: open(c),
        btns: `<button class="b s noprint" onclick="openCase('${c.kind}','${c.id}')">기록</button>`,
        text: `${esc(c.sup)} · ${c.lastM ? esc(c.lastM.text.slice(0, 30)) + (c.lastM.text.length > 30 ? '…' : '') : '직접 쓴 기록 없음'}`,
        raw: `'${c.id}'`,
      });
  });
  const show = all ? R : R.slice(0, 6).concat(R.slice(nAct > 6 ? nAct : 6));
  const hid = R.length - show.length;
  return `<div class="card pc1"><h3>할 일 ${R.length ? `<span class="muted cnt">${R.length}건</span>` : ''}${
    lateN ? ` <button type="button" class="bg bad" onclick="dashGo('late')" title="누르면 지연 건만 보기">지연 ${lateN}</button>` : ''
  }${soonN ? ` <span class="bg warn">3일 안에 기한 ${soonN}</span>` : ''}${staleN ? ` <span class="bg warn">14일+ 정체 ${staleN}</span>` : ''}
    ${
      C.length
        ? `<span class="muted cnt">미종결 — RCA ${C.filter((c) => c.kind === 'rca').length} · NCR ${C.filter((c) => c.kind === 'ncr').length} · 불량 ${
            C.filter((c) => c.kind === 'defect').length
          }</span>`
        : ''
    }<span class="sp"></span>${
      hid || all
        ? `<button class="b s noprint" onclick="state.dashAll=!state.dashAll;render()">${all ? '줄여 보기' : `전체 ${R.length}건 보기`}</button>`
        : ''
    }<button class="b s" onclick="go('prog')">진행 화면</button></h3>${
      R.length
        ? `<table class="todot"><thead><tr><th>구분</th><th>대상</th><th>내용</th><th class="noprint"></th></tr></thead><tbody>${show
            .map((r) => `<tr><td class="k">${r.kind}</td><td class="w">${r.who}</td><td>${r.text}</td><td class="a noprint">${r.btns}</td></tr>`)
            .join('')}</tbody></table>${
            hid
              ? `<div class="muted" style="font-size:12px;margin-top:6px">외 ${hid}건 — <a class="lk" onclick="state.dashAll=true;render()">모두 펼치기</a></div>`
              : ''
          }`
        : '<div class="muted">지연 · 임박 항목이 없습니다.</div>'
    }</div>`;
}
