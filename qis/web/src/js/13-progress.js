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
function renderProg() {
  const f = (state.pf = state.pf || { kind: '', owner: '', stale: '', sup: '', sort: 'stale', late: '' });
  let C = progCases();
  const owners = [...new Set(C.map((c) => c.owner).filter(Boolean))];
  if (f.kind) C = C.filter((c) => c.kind === f.kind);
  if (f.owner) C = C.filter((c) => c.owner === f.owner);
  if (f.sup) C = C.filter((c) => (c.kind === 'rca' ? c.obj.SupplierId : c.obj.supplierId) === f.sup);
  if (f.stale) C = C.filter((c) => c.stale >= +f.stale);
  if (f.late) C = C.filter((c) => c.late.length);
  const srt = {
    stale: (a, b) => b.stale - a.stale,
    next: (a, b) => (a.next?.nextDate || '9999').localeCompare(b.next?.nextDate || '9999'),
    grade: (a, b) => (SEV_ORD[a.grade] ?? 3) - (SEV_ORD[b.grade] ?? 3) || b.stale - a.stale,
  }[f.sort];
  C.sort(srt);
  const all = progCases(),
    od = all.filter((c) => c.late.length),
    soon = all.filter((c) => c.next && c.next.nextDate >= today() && diffDays(today(), c.next.nextDate) <= 3);
  return `<div class="kpis">
    <div class="kpi"><div class="l">진행 중 RCA</div><div class="v">${
      all.filter((c) => c.kind === 'rca').length
    }</div><div class="s">사내 원인분석 · 내부 8D</div></div>
    <div class="kpi"><div class="l">진행 중 NCR</div><div class="v">${all.filter((c) => c.kind === 'ncr').length}</div><div class="s">미종결</div></div>
    <div class="kpi"><div class="l">진행 중 불량 (NCR 없음)</div><div class="v">${
      all.filter((c) => c.kind === 'defect').length
    }</div><div class="s">처리 대기 · 처리 중 · NCR 발행 필요</div></div>
    <div class="kpi ${
      all.filter((c) => c.stale >= 14).length ? 'warn' : 'ok'
    }"><div class="l">14일 이상 정체</div><div class="v">${all.filter((c) => c.stale >= 14).length}</div><div class="s">마지막 기록·진행 기준</div></div>
    <div class="kpi go ${od.length ? 'bad' : 'ok'}" onclick="state.pf.late=state.pf.late?'':'1';render()" title="누르면 지연 건만 보기"><div class="l">지연 (기한 초과)</div>
      <div class="v">${od.length}</div><div class="s">회신·검증·FAR·조치·목표 종결일 · 3일 내 ${soon.length}</div></div>
  </div>
  <div class="card"><h3>진행 중인 건 <span class="bg mut">${C.length}</span> <span class="muted" style="font-weight:normal;font-size:12px">RCA로 관리 중인 불량 · NCR은 RCA 한 줄로 표시</span></h3>
    <div class="row noprint" style="margin-bottom:8px">
      <select onchange="state.pf.kind=this.value;render()"><option value="">RCA + NCR + 불량</option>
        <option value="rca" ${f.kind === 'rca' ? 'selected' : ''}>RCA만</option>
        <option value="ncr" ${f.kind === 'ncr' ? 'selected' : ''}>NCR만</option>
          <option value="defect" ${f.kind === 'defect' ? 'selected' : ''}>불량만 (NCR 없음)</option></select>
      <select onchange="state.pf.sup=this.value;render()">${supOpts(f.sup, '전체 협력사')}</select>
      <select onchange="state.pf.owner=this.value;render()"><option value="">전체 담당</option>${owners
        .map((o) => `<option ${o === f.owner ? 'selected' : ''}>${esc(o)}</option>`)
        .join('')}</select>
      <select onchange="state.pf.late=this.value;render()"><option value="">지연 전체</option>
        <option value="1" ${f.late ? 'selected' : ''}>지연만</option></select>
      <select onchange="state.pf.stale=this.value;render()"><option value="">정체 기간 전체</option>${[7, 14, 30]
        .map((d) => `<option value="${d}" ${+f.stale === d ? 'selected' : ''}>${d}일 이상 정체</option>`)
        .join('')}</select>
      <span style="flex:1"></span><span class="muted">정렬</span><select onchange="state.pf.sort=this.value;render()"><option value="stale" ${f.sort === 'stale' ? 'selected' : ''}>오래 정체된 순</option>
        <option value="next" ${f.sort === 'next' ? 'selected' : ''}>기한 순</option>
          <option value="grade" ${f.sort === 'grade' ? 'selected' : ''}>심각도 순</option></select></div>
    <div class="tw"><table><thead><tr><th>구분</th><th>건</th><th>협력사</th><th>심각도</th>
      <th>상태</th><th>마지막 진행</th><th>최근 기록</th><th>다음 기한</th><th>담당</th></tr></thead><tbody>
    ${
      C.map(
        (
          c,
        ) => `<tr class="${c.late.length ? 'late' : ''}" style="cursor:pointer" onclick="if(!event.target.closest('a,input,button'))openCase('${c.kind}','${c.id}')">
      <td><span class="bg ${c.kind === 'ncr' ? 'inf' : c.kind === 'rca' ? 'warn' : 'mut'}">${
        c.kind === 'ncr' ? 'NCR' : c.kind === 'rca' ? 'RCA' : '불량'
      }</span></td>
      <td><a class="lk" onclick="openCase('${c.kind}','${c.id}')"><b>${esc(c.title)}</b></a><br><span class="muted" style="font-size:11.5px">${esc(c.sub)}</span></td>
      <td>${esc(c.sup)}</td><td>${c.grade ? `<span class="bg ${SEV_CLS[c.grade]}">${c.grade}</span>` : ''}</td>
      <td>${c.kind === 'rca' ? `<span class="bg inf">${esc(c.status)}</span>` : stB(c.status)}${
        c.kind === 'ncr' ? ' ' + farBadge(c.obj) : ''
      } ${lateBadge(c.late)}</td>
      <td style="white-space:nowrap">${c.last || '-'}<br>${staleBadge(c.stale)}</td>
      <td style="max-width:300px">${
        c.kind === 'rca'
          ? `<span class="muted" style="font-size:11.5px">RCA · ${esc(c.sub)}</span>`
          : c.lastM
            ? `<span class="muted" style="font-size:11.5px">${esc(c.lastM.date)} ${esc(c.lastM.kind)}</span><br>${esc(c.lastM.text.slice(0, 70))}${c.lastM.text.length > 70 ? '…' : ''}`
            : '<span class="muted">직접 쓴 기록 없음</span>'
      }</td>
      <td>${c.next ? `${esc(c.next.next)}<br>${nxBadge(c.next.nextDate)}` : '<span class="muted">-</span>'}</td><td>${esc(c.owner)}</td></tr>`,
      ).join('') || '<tr><td colspan="9" class="muted" style="text-align:center;padding:24px">조건에 맞는 진행 중인 건이 없습니다.</td></tr>'
    }
    </tbody></table></div>
    <div class="help" style="margin-top:6px">‘마지막 진행’은 직접 쓴 기록과 자동 이벤트(NCR 발행·대책 요청·회신·평가·구상 등) 중 가장 최근 날짜입니다. 행을 누르면 RCA는 RCA 상세, NCR은 NCR 화면, 불량은 진행 보기 창이 열립니다.</div></div>`;
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
