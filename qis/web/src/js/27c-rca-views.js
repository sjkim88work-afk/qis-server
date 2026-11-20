// ── RCA — 창 · 목록 · 상세 화면 · 귀책 결론 · 조치 · 이력 ──
function czSoft() {
  if (czMouse) {
    czPending = true;
    return;
  }
  setTimeout(() => {
    czPending = false;
    if (state.tab !== 'case' && !$('#modal').dataset.cz) return;
    const k = czFkey(document.activeElement);
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    if (k) {
      const n = document.querySelector(k);
      if (n) n.focus();
    }
  }, 0);
}
document.addEventListener(
  'mousedown',
  () => {
    czMouse = true;
  },
  true,
);
document.addEventListener(
  'mouseup',
  () => {
    czMouse = false;
    if (czPending)
      setTimeout(() => {
        if (czPending) {
          czPending = false;
          czSoft();
        }
      }, 0);
  },
  true,
);

/* ---------- 상태 ---------- */
const czUi = {
  view: 'today',
  caseId: null,
  tab: 'basic',
  showGate: false,
  filt: { q: '', stage: '', tier: '', status: '미종결', ball: '', late: '' },
  actFilt: 'open',
  histOwn: false,
};
function czCounts() {
  const t = today(),
    open = db.cases.filter((c) => c.Status === '진행중' || c.Status === '보류');
  return {
    mine: open.filter((c) => c.Ball === '나' && has(c.RecheckDate) && c.RecheckDate <= t).length,
    chase: open.filter((c) => c.Ball !== '나' && has(c.RecheckDate) && c.RecheckDate <= t).length,
    lateActs: db.actions.filter((a) => !['완료', '취소'].includes(a.ActionStatus) && has(a.DueDate) && a.DueDate < t && czCaseOpenId(a.CaseId))
      .length,
    open: open.length,
    t3: open.filter((c) => c.Tier === 'TIER 3').length,
  };
}
function czBadgeN() {
  const k = czCounts();
  let p = 0;
  try {
    p = progCases().filter((c) => c.kind !== 'rca' && c.next && c.next.nextDate < today()).length;
  } catch (e) {}
  return k.mine + k.chase + k.lateActs + p;
}
function czGo(v) {
  state.tab = 'case';
  czUi.view = v;
  render();
  window.scrollTo(0, 0);
}
// RCA 상세는 창(팝업)으로 엶 — NCR / 8D 창과 같은 방식. 보던 화면은 그대로 뒤에 남음
async function czOpenCase(id, tab) {
  const m = $('#modal');
  if (m.classList.contains('on')) {
    if (m.dataset.cz) czFlush();
    else if (mfDirty && !(await askConfirm({ title: '작성 중인 내용을 저장하지 않고 이동할까요?', ok: '이동', danger: false }))) return;
  }
  if (!czById('cases', id)) {
    toast('이 RCA를 찾을 수 없습니다');
    return;
  }
  czUi.caseId = id;
  czUi.tab = tab || 'basic';
  czUi.showGate = false;
  czShow();
}
const czFoot = (c) => [
  { label: 'RCA 삭제', cls: 'd', fn: () => czDelCase(c.id) },
  { label: '닫기', fn: closeModal },
  { label: '저장', cls: 'p', fn: czSaveClose },
];
function czShow(keep) {
  const c = czById('cases', czUi.caseId),
    m = $('#modal');
  if (!c) return;
  const top = keep && m.dataset.cz === c.id && m.classList.contains('on') ? $('#mbody').scrollTop : 0;
  openModal(`${c.CaseNo} RCA`, `<div class="cz czm" id="czm">${czCaseHTML(c)}</div>`, czFoot(c));
  m.dataset.cz = c.id;
  czUi.openId = c.id;
  $('#mbody').scrollTop = top;
  mfDirty = false;
}
// 화면을 다시 그린 뒤: RCA 창이 떠 있으면 새 내용으로 갱신 (스크롤 위치 유지)
function czModalSync() {
  const m = $('#modal');
  if (!m.dataset.cz) return;
  if (!m.classList.contains('on')) {
    delete m.dataset.cz;
    return;
  }
  const c = czById('cases', m.dataset.cz),
    box = $('#czm');
  if (!c) {
    closeModal(true);
    return;
  }
  if (!box) return;
  const top = $('#mbody').scrollTop;
  box.innerHTML = czCaseHTML(c);
  $('#mt').textContent = `${c.CaseNo} RCA`;
  $('#mbody').scrollTop = top;
  mfDirty = false;
}
// 쓰던 칸의 내용을 저장 (RCA 는 칸을 벗어날 때 바로 저장됨)
function czFlush() {
  const a = document.activeElement;
  if (a && a.closest && a.closest('#czm') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) a.blur();
}
function czSaveClose() {
  czFlush();
  closeModal(true);
  toast('저장했습니다');
}
async function czDelCase(id) {
  const c = czById('cases', id);
  if (!c) return;
  if (
    !(await askConfirm({
      title: `${c.CaseNo} RCA를 삭제할까요?`,
      items: [esc(c.Title), `조치 ${czActs(c).length}건 함께 삭제`, `연결된 불량 ${(c.DefectIds || []).length}건 · NCR은 유지 (연결만 해제)`],
      note: '기록을 남기려면 상태를 ‘취소’로 바꾸는 편이 낫습니다. 삭제 후 10초 안에 되돌릴 수 있습니다.',
    }))
  )
    return;
  const snap = await takeSnap();
  db.defects.forEach((d) => {
    if (d.caseId === c.id) {
      d.caseId = '';
      touch(d);
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
  save();
  if ($('#modal').dataset.cz === id) closeModal(true);
  render();
  offerUndo(snap, `${c.CaseNo} RCA를 삭제했습니다`);
}
const czBall = (b) => `<span class="ball ${b === '나' ? 'me' : ''}">${esc(b || '-')}</span>`;
function czDate(d, closed) {
  if (!has(d)) return '<span class="muted">-</span>';
  if (closed) return esc(d);
  const t = today();
  return d < t ? `<span class="late">${esc(d)}</span>` : d === t ? `<span class="today">${esc(d)}</span>` : esc(d);
}
function czPartLabel(c) {
  const p = czPart(c);
  return p ? `${esc(p.partNo)} <span class="muted">${esc(p.name)}</span>` : '<span class="muted">-</span>';
}
const czSup = (id) => (supName(id) ? esc(supName(id)) : '<span class="muted">-</span>');

/* ---------- 화면 ---------- */
function czRender() {
  const k = czCounts(),
    v = czUi.view;
  const P = progCases(),
    pod = P.filter((c) => c.kind !== 'rca' && c.next && c.next.nextDate < today()).length;
  const seg = [
    ['today', '오늘 할 일', k.mine + k.chase + pod],
    ['prog', '진행 중 전체', 0],
    ['cases', 'RCA 목록', 0],
    ['actions', '조치', k.lateActs],
  ];
  const bar = `<div class="cz"><div class="bar noprint"><div class="seg">${seg
    .map(
      ([x, l, n]) =>
        `<a class="${v === x ? 'on' : ''}" data-act="czNav" data-v="${x}">${l}${
          n ? ` <span class="bg bad" style="font-size:10.5px">${n}</span>` : ''
        }</a>`,
    )
    .join('')}</div><span class="grow"></span><button class="btn pri" data-act="newCase">+ 새 RCA</button></div>`;
  if (v === 'prog') return bar + '</div>' + renderProg();
  const body = v === 'cases' ? czViewCases() : v === 'actions' ? czViewActions() : czViewToday();
  return bar + body + '</div>';
}
function czStartCard() {
  return `<div class="card start"><h2>RCA · 사내 8D</h2>
    <p class="sub" style="margin:0">사내 문제의 원인분석(RCA)과 공정 개선 · 내부 8D를 관리합니다. 공 · 다음 행동 · 재확인일과 IATF 단계 게이트로 끝까지 추적합니다.<br>
    <b>불량 관리</b>의 진행 보기에서 ‘RCA 요청’을 누르면 불량 정보·심각도가 그대로 채워집니다.</p>
    <div class="btns"><button class="btn pri" data-act="newCase">RCA 바로 등록</button><button class="btn" onclick="go('defect')">불량 관리로 가기</button><button class="btn" onclick="state.setTab='backup';go('data')">QMS 백업 가져오기</button></div></div>`;
}
function czViewToday() {
  const t = today(),
    k = czCounts(),
    open = db.cases.filter((c) => c.Status === '진행중' || c.Status === '보류');
  const mine = open
    .filter((c) => c.Ball === '나' && has(c.RecheckDate) && c.RecheckDate <= t)
    .sort((a, b) => a.RecheckDate.localeCompare(b.RecheckDate));
  const chase = open
    .filter((c) => c.Ball !== '나' && has(c.RecheckDate) && c.RecheckDate <= t)
    .sort((a, b) => a.RecheckDate.localeCompare(b.RecheckDate));
  const due = db.actions
    .filter((a) => !['완료', '취소'].includes(a.ActionStatus) && has(a.DueDate) && a.DueDate <= addDays(t, 3) && czCaseOpenId(a.CaseId))
    .sort((a, b) => a.DueDate.localeCompare(b.DueDate));
  const pd = progCases()
    .filter((c) => c.kind !== 'rca' && c.next && diffDays(t, c.next.nextDate) <= 3)
    .sort((a, b) => a.next.nextDate.localeCompare(b.next.nextDate));
  const jd = db.defects.filter((d) => invOpen(d) && !czOwns(d, 'defect') && invInfo(d).k === 'judge');
  const pItem = (c) =>
    `<div class="list-item"><span class="bg ${c.kind === 'ncr' ? 'inf' : 'mut'}">${c.kind === 'ncr' ? 'NCR' : '불량'}</span><div class="grow"><div class="t" onclick="openCase('${c.kind}','${c.id}')">${esc(c.title)}</div>
      <div class="d">${esc(c.next.next)} · ${esc(c.sup)}</div>
        </div><span style="min-width:84px;text-align:right">${czDate(c.next.nextDate)}</span></div>`;
  const caseItem = (c) => `<div class="list-item"><span class="badge ${czTierCls(c.Tier)}">${esc(c.Tier || '-')}</span>
    <div class="grow"><div class="t" data-act="open" data-id="${c.id}">${esc(c.CaseNo)} · ${esc(c.Title || '(제목 없음)')}</div>
      <div class="d">${esc(c.Stage)} · ${esc(c.NextAction || '다음 행동 미입력')}</div></div>
    ${czBall(c.Ball)} <span style="min-width:84px;text-align:right">${czDate(c.RecheckDate)}</span><button class="btn sm" data-act="bump" data-id="${c.id}" title="재확인일을 오늘+2일로">+2일</button></div>`;
  const actItem = (a) => {
    const c = czById('cases', a.CaseId);
    return `<div class="list-item"><div class="grow"><div class="t" data-act="open" data-id="${a.CaseId}" data-tab="actions">${esc(a.Title || '(내용 없음)')}</div>
    <div class="d">${esc(a.Category)} · ${c ? esc(c.CaseNo) : ''} · ${esc(a.Assignee || a.ExternalOwner || '담당 미지정')}</div></div>
    <span style="min-width:84px;text-align:right">${czDate(a.DueDate)}</span><button class="btn sm" data-act="actDone" data-id="${a.id}">완료</button></div>`;
  };
  return `<h1>오늘 할 일</h1><p class="sub">${t} · RCA · NCR · 불량의 오늘 챙길 일을 한 곳에 모았습니다. 기한이 지난 건부터 처리하세요.</p>
    <div class="kpis">
      <div class="kpi" data-act="czNav" data-v="cases"><div class="l">진행 중 RCA</div><div class="v">${k.open}</div></div>
      <div class="kpi ${k.mine ? 'bad' : 'ok'}"><div class="l">오늘 내가 볼 RCA</div><div class="v">${k.mine}</div></div>
      <div class="kpi ${k.lateActs ? 'bad' : 'ok'}" data-act="czNav" data-v="actions"><div class="l">기한 지난 조치</div>
        <div class="v">${k.lateActs}</div></div>
      <div class="kpi ${
        pd.filter((c) => c.next.nextDate < t).length ? 'bad' : 'ok'
      }" data-act="czNav" data-v="prog"><div class="l">협력사 · 불량 기한 초과</div><div class="v">${
        pd.filter((c) => c.next.nextDate < t).length
      }</div></div></div>
    <div class="two"><div>
      <div class="card"><h3>공이 나에게 있음 <span class="muted">${mine.length}건</span></h3>${
        mine.length ? mine.map(caseItem).join('') : '<div class="empty">오늘 확인할 RCA가 없습니다.</div>'
      }</div>
      <div class="card"><h3>회신 독촉 필요 <span class="muted">공이 밖에 있고 재확인일 도래 · ${chase.length}건</span></h3>${
        chase.length ? chase.map(caseItem).join('') : '<div class="empty">독촉할 RCA가 없습니다.</div>'
      }</div></div>
      <div><div class="card"><h3>협력사 · 불량 기한 <span class="muted">NCR 회신 · 유효성 · FAR · 사내 대책 · 3일 이내 ${pd.length}건</span></h3>${
        pd.length ? pd.map(pItem).join('') : '<div class="empty">임박한 기한이 없습니다.</div>'
      }</div>
      <div class="card"><h3>기한 임박 · 초과 조치 <span class="muted">RCA 조치 · 3일 이내 ${due.length}건</span></h3>${
        due.length ? due.map(actItem).join('') : '<div class="empty">임박한 조치가 없습니다.</div>'
      }</div>
      ${
        jd.length
          ? `<div class="card"><h3>귀책 판정 대기 <span class="muted">FAR 회신 · RCA 결과가 나온 귀책 미정 건 · ${jd.length}건</span></h3>${jd
              .map(
                (d) =>
                  `<div class="list-item"><div class="grow"><div class="t" onclick="editDefect('${d.id}')">${esc(defLabel(d))}</div>
                    <div class="d">${esc(supName(d.supplierId))} · FAR 회신 ${esc(d.inv.farRecv || '-')}</div></div></div>`,
              )
              .join('')}</div>`
          : ''
      }</div></div>
    ${db.cases.length ? '' : czStartCard()}`;
}
function czViewCases() {
  const f = czUi.filt,
    t = today();
  let rows = db.cases.slice();
  if (f.status) rows = rows.filter((c) => (f.status === '미종결' ? !['종결', '취소'].includes(c.Status) : c.Status === f.status));
  if (f.late) rows = rows.filter((c) => lateInfo('rca', c).length);
  if (f.stage) rows = rows.filter((c) => c.Stage === f.stage);
  if (f.tier) rows = rows.filter((c) => c.Tier === f.tier);
  if (f.ball) rows = rows.filter((c) => c.Ball === f.ball);
  if (f.q) {
    const q = f.q.toLowerCase();
    rows = rows.filter((c) => {
      const p = czPart(c);
      return [c.CaseNo, c.Title, c.LegacyNo, c.Description, p && p.partNo, p && p.name, supName(c.SupplierId)].some((v) =>
        String(v || '')
          .toLowerCase()
          .includes(q),
      );
    });
  }
  rows.sort((a, b) => (b.Created || '').localeCompare(a.Created || '') || (b.CaseNo || '').localeCompare(a.CaseNo || ''));
  const sel = (key, list, label) =>
    `<select data-act="filt" data-k="${key}" style="width:auto">${[['', label]]
      .concat(list.map((x) => [x, x]))
      .map(([v, l]) => `<option value="${esc(v)}" ${f[key] === v ? 'selected' : ''}>${esc(l)}</option>`)
      .join('')}</select>`;
  return `<h1>RCA · 사내 8D</h1><p class="sub">사내 원인분석(RCA)과 내부 8D 목록입니다. 불량·NCR과 연결해 두면 비용·협력사 대책서 진행이 함께 보입니다.</p>
    <div class="bar"><input type="text" placeholder="번호 · 제목 · 부품 · 협력사 검색" value="${esc(f.q)}" data-act="filtq" style="max-width:280px">
      ${sel('status', ['미종결', '진행중', '보류', '종결', '취소'], '상태 전체')}${sel('stage', CZ_STAGES, '단계 전체')}${sel(
        'tier',
        ['TIER 3', 'TIER 2', 'TIER 1', 'TIER 0'],
        'TIER 전체',
      )}${sel('ball', CZ_OPT.Ball, '공 전체')}<select data-act="filt" data-k="late" style="width:auto"><option value="">지연 전체</option>
        <option value="1" ${f.late ? 'selected' : ''}>지연만</option></select>
      <span class="grow"></span><span class="muted" style="font-size:12px">SharePoint 이전용 CSV</span>${['cases', 'actions', 'parts', 'suppliers']
        .map((l) => `<button class="btn sm" data-act="csv" data-list="${l}">${l[0].toUpperCase() + l.slice(1)}</button>`)
        .join('')}</div>
    <div class="tw"><table class="t"><thead><tr><th>RCA 번호</th><th>제목</th><th>부품</th><th>협력사</th><th>연결</th><th>TIER</th>
      <th>단계</th><th>상태</th><th>공</th><th>다음 행동</th><th>재확인일</th><th>목표 종결</th><th class="num">경과일</th></tr></thead>
    <tbody>${
      rows.length
        ? rows
            .map((c) => {
              const closed = ['종결', '취소'].includes(c.Status),
                n = c.NcrId && db.ncrs.find((x) => x.id === c.NcrId),
                nd = (c.DefectIds || []).length,
                lt = lateInfo('rca', c);
              return `<tr class="click${lt.length ? ' late' : ''}" data-act="open" data-id="${c.id}">
      <td class="mono">${esc(c.CaseNo)}</td><td>${esc(c.Title)}</td><td>${czPartLabel(c)}</td><td>${czSup(c.SupplierId)}</td>
      <td style="white-space:nowrap">${n ? `<span class="bg inf">${esc(n.no)}</span> ` : ''}${nd ? `<span class="bg mut">불량 ${nd}</span>` : ''}</td>
      <td><span class="badge ${czTierCls(c.Tier)}">${esc(c.Tier || '-')}</span></td><td>${esc(c.Stage)}</td>
        <td><span class="badge ${czStCls(c.Status)}">${esc(c.Status)}</span></td><td>${czBall(c.Ball)}</td>
      <td style="max-width:240px">${esc(c.NextAction)}</td><td>${czDate(c.RecheckDate, closed)}</td><td style="white-space:nowrap">${
        closed ? `<span class="muted">${esc(c.CloseDate || '')}</span>` : czDate(czTarget(c))
      }${lateBadge(lt) ? '<br>' + lateBadge(lt) : ''}</td><td class="num">${
        has(c.Created) ? diffDays(c.Created, closed && has(c.CloseDate) ? c.CloseDate : t) : ''
      }</td></tr>`;
            })
            .join('')
        : '<tr><td colspan="13" class="empty">조건에 맞는 RCA가 없습니다.</td></tr>'
    }</tbody></table></div>`;
}
function czField(c, fd, missSet) {
  if (fd.showIf && !fd.showIf(c)) return '';
  const ds = (c.DefectIds || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean);
  if (ds.length && fd.key === 'DefectQty')
    return `<div class="fld"><label>${esc(fd.label)}</label><div class="calc"><b>${num(c.DefectQty).toLocaleString()}</b> <span class="muted">연결 불량 ${ds.length}건 합계</span></div>
      <div class="hint">불량 관리에서 수정하면 자동 반영</div></div>`;
  if (ds.length && fd.key === 'Disposition') {
    const dp = ds.map((d) => d.disposition || '미정'),
      u = [...new Set(dp)];
    if (u.length === 1 && CZ_OPT.Disposition.includes(u[0]) && u[0] !== '미정')
      return `<div class="fld ${missSet.has(fd.key) ? 'miss' : ''}"><label>${esc(fd.label)}</label><div class="calc"><b>${esc(u[0])}</b></div>
        <div class="hint">연결 불량의 ‘처리’ — 불량 관리에서 수정</div></div>`;
    fd = Object.assign({}, fd, {
      hint:
        '연결 불량 처리: ' +
        u.map((x) => `${x} ${dp.filter((y) => y === x).length}`).join(' · ') +
        (u.includes('미정') ? ' — 불량의 처리를 입력하면 자동 반영' : ' — 처리가 섞여 있어 RCA 처분은 직접 고릅니다'),
    });
  }
  const v = c[fd.key],
    id = `czf_${fd.key}`,
    attr = `id="${id}" data-scope="case" data-f="${fd.key}"`;
  let inp = '';
  switch (fd.type) {
    case 'text':
      inp = `<input type="text" ${attr} value="${esc(v)}"${fd.list ? ` list="${fd.list}"` : ''}>`;
      break;
    case 'number':
      inp = `<input type="number" ${attr} value="${esc(v)}">`;
      break;
    case 'date':
      inp = `<input type="date" ${attr} value="${esc(v)}">`;
      break;
    case 'textarea':
      inp = `<textarea ${attr}>${esc(v)}</textarea>`;
      break;
    case 'select':
      inp = `<select ${attr}>${czOptHTML(CZ_OPT[fd.opt], v)}</select>`;
      break;
    case 'part': {
      const p = czPart(c);
      inp = `<input type="text" ${attr} data-combo="parts" autocomplete="off" value="${p ? esc(p.partNo) : ''}" placeholder="번호·품명·협력사로 검색">`;
      if (p)
        inp += `<div class="hint">${esc(p.name)}${p.model ? ' · ' + esc(p.model) : ''}${
          p.safety && p.safety !== '해당없음' ? ` · <b style="color:var(--red)">${esc(p.safety)}</b>` : ''
        }</div>`;
      break;
    }
    case 'supplier':
      inp = `<select ${attr}>${supOpts(v)}</select>`;
      break;
    case 'case':
      inp = `<select ${attr}>${czOptHTML(
        [['', '-']].concat(
          db.cases
            .filter((x) => x.id !== c.id)
            .sort((a, b) => (b.CaseNo || '').localeCompare(a.CaseNo || ''))
            .map((x) => [x.id, `${x.CaseNo} ${x.Title || ''}`]),
        ),
        v,
      )}</select>`;
      break;
    case 'calc': {
      let t = '';
      if (fd.key === 'TierAuto') {
        const a = czTierAuto(c);
        t = a
          ? `<span class="badge ${czTierCls(a)}">${a}</span> <span class="muted">S×I = ${num(c.SevS) * num(c.ImpI)}</span>`
          : '<span class="muted">S·I 선택 시 계산</span>';
        if (czFull8D(c)) t += `<div class="hint" style="color:var(--amb)">대응방향 8D — 효과검증·표준화까지 전체 단계 적용</div>`;
      }
      if (fd.key === 'FARDue')
        t = has(c.FARIssueDate)
          ? `${addDays(c.FARIssueDate, 3)} / ${addDays(c.FARIssueDate, 7)} / ${addDays(c.FARIssueDate, 14)}`
          : '<span class="muted">발행일 입력 시 계산</span>';
      if (fd.key === 'FARTotal') {
        const s = czFar(c);
        t = `<b>${s}</b> / 30 · ${
          s >= 24
            ? '<span style="color:var(--grn)">합격</span>'
            : s >= 15
              ? '<span style="color:var(--amb)">조건부</span>'
              : '<span style="color:var(--red)">불합격</span>'
        }`;
      }
      inp = `<div class="calc">${t}</div>`;
      break;
    }
  }
  return `<div class="fld ${
    fd.w === 2 ? 'w2' : fd.w === 4 ? 'w4' : ''
  } ${missSet.has(fd.key) ? 'miss' : ''}"><label for="${id}">${esc(fd.label)}</label>${inp}${
    fd.hint ? `<div class="hint">${esc(typeof fd.hint === 'function' ? fd.hint(c) : fd.hint)}</div>` : ''
  }</div>`;
}
/* 연결된 불량 · NCR */
function czLinkHTML(c) {
  const ds = (c.DefectIds || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean);
  const n = c.NcrId ? db.ncrs.find((x) => x.id === c.NcrId) : null;
  const cost = ds.reduce((a, d) => a + costTotal(d), 0),
    os = ds.reduce((a, d) => a + outstanding(d), 0);
  const candD = db.defects
    .filter((d) => !d.caseId && (!c.SupplierId || d.supplierId === c.SupplierId))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 80);
  const candN = db.ncrs
    .filter((x) => !x.caseId && (!c.SupplierId || x.supplierId === c.SupplierId))
    .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''))
    .slice(0, 80);
  return `<div class="lkbox"><div class="sec-t" style="margin-bottom:6px">연결된 불량 · NCR <span class="muted" style="font-weight:400">비용·구상은 불량 기록에서, 대책서 회신·평가는 NCR에서 관리합니다</span></div>
    <div class="row" style="gap:8px;margin-bottom:6px"><b style="font-size:12.5px">NCR</b>${
      n
        ? `<a class="bg inf" style="cursor:pointer" onclick="editNcr('${n.id}')">${esc(n.no)}</a> ${stB(ncrStatus(n))} <span class="muted" style="font-size:12px">${esc(n.reqType || '')} · 회신 기한 ${esc(n.dueDate || '-')}${
            n.replyDate ? ' · 회신 ' + esc(n.replyDate) : ''
          }${n.evalVerdict ? ` · 평가 ${n.evalScore}점 ${esc(n.evalVerdict)}` : ''}</span> ${farBadge(n)}${
            farOn(n) && n.far.verdict ? ` <span class="muted" style="font-size:12px">FAR 판정: ${esc(n.far.verdict)}</span>` : ''
          } <button class="btn sm" data-act="unlinkNcr">연결 해제</button>`
        : `<span class="muted" style="font-size:12px">없음</span>${
            candN.length
              ? `<select id="czLinkN"><option value="">— 기존 NCR 연결 —</option>${candN
                  .map((x) => `<option value="${x.id}">${esc(x.no)} · ${esc(x.issueDate)} · ${esc(x.title)}</option>`)
                  .join('')}</select><button class="btn sm" data-act="linkNcr">연결</button>`
              : ''
          }${ds.length ? `<button class="btn sm pri" data-act="issueNcr">연결 불량으로 NCR 발행</button>` : ''}`
    }</div>
    ${
      ds.length
        ? `<table><tbody>${ds
            .map(
              (d) =>
                `<tr><td style="white-space:nowrap">${esc(d.date)}</td><td>${esc(d.partNo)} ${esc(d.partName)}</td><td>${esc(d.type)}</td>
                  <td class="num" style="text-align:right">${num(d.qty).toLocaleString()}개</td><td>${sevBadge(d)}</td>
                    <td>${stageBadges(d).replace('<br>', ' ')}</td><td style="text-align:right;white-space:nowrap">${
                      costTotal(d) ? won(costTotal(d)) + '원' : ''
                    }</td><td style="white-space:nowrap"><button class="btn sm" onclick="openLog('${d.id}')">진행 보기</button> <button class="btn sm" data-act="unlinkDef" data-did="${d.id}">해제</button></td></tr>`,
            )
            .join('')}</tbody></table>
      <div class="muted" style="font-size:12px;margin-top:4px">불량 ${ds.length}건 · 수량 ${sum(ds, 'qty').toLocaleString()}개${cost ? ` · 실패비용 ${won(cost)}원` : ''}${
        os ? ` · <span style="color:var(--red)">구상 미회수 ${won(os)}원</span>` : ''
      }</div>`
        : '<div class="muted" style="font-size:12px">연결된 불량 없음</div>'
    }
    ${
      candD.length
        ? `<div class="row" style="margin-top:6px;gap:6px"><select id="czLinkD"><option value="">— 불량 추가 연결${c.SupplierId ? ' (같은 협력사)' : ''} —</option>${candD
            .map((d) => `<option value="${d.id}">${esc(d.date)} · ${esc(d.partNo)} ${esc(d.partName)} · ${esc(d.type)} · ${num(d.qty)}개</option>`)
            .join('')}</select><button class="btn sm" data-act="linkDef">추가</button></div>`
        : ''
    }</div>`;
}
function czCaseHTML(c) {
  const p = czPath(c),
    ns = czNext(c),
    ps = czPrev(c),
    closed = c.Status === '종결' || c.Status === '취소';
  const missing = ns ? czGate(c, ns) : [];
  const missSet = new Set(czUi.showGate ? missing.map((r) => r.f).filter(Boolean) : []),
    missTabs = new Set(czUi.showGate ? missing.map((r) => r.tab) : []);
  const ci = CZ_STAGES.indexOf(c.Stage);
  const pi = p.indexOf(c.Stage);
  const stages = CZ_STAGES.map((s, i) => {
    const inP = p.includes(s),
      cls = !inP ? 'skip' : i < ci ? 'done' : i === ci ? 'cur' : '',
      isN = !closed && s === ns,
      far = inP && Math.abs(p.indexOf(s) - pi) > 1 ? ' far' : '';
    const d = inP && i <= ci ? czStageDate(c, s) : '',
      stay = i === ci && !closed && d ? Math.max(0, diffDays(d, today())) : null;
    const sub = stay != null ? `${d.slice(5)} · ${stay}일째` : d ? d.slice(5) : isN && missing.length ? '남은 조건' : '';
    return `<div class="stg ${cls}${isN ? ' nx' : ''}${far}" ${
      isN
        ? `data-act="showGate" title="누르면 ${esc(s)} 단계로 가기 위해 남은 조건을 봅니다"`
        : `title="${inP ? (d ? `${esc(s)} 시작 ${d}` : '') : '이 TIER에서는 건너뜀'}"`
    }>${i < ci && inP ? '✓ ' : ''}${s}${
      isN && missing.length ? `<span class="gc">${missing.length}</span>` : ''
    }${sub ? `<small>${sub}</small>` : ''}</div>`;
  }).join('');
  const tabs = CZ_TABS.filter((t) => !t.showTab || t.showTab(c)),
    tab = tabs.find((t) => t.id === czUi.tab) || tabs[0];
  let body = '';
  if (tab.id === 'actions') body = czNcrNote(c, 'actions') + czCaseActions(c);
  else if (tab.id === 'hist') body = czHistHTML(c);
  else if (tab.id === 'cause') body = czNcrNote(c, 'cause') + czVerdictBox(c) + causeHTML(c, tab, missSet);
  else
    body =
      (tab.id === 'basic' ? czLinkHTML(c) : '') +
      (tab.id === 'verify' ? czNcrNote(c, 'verify') : '') +
      (tab.note ? `<div class="note">${esc(tab.note)}</div>` : '') +
      `<div class="grid">${tab.fields.map((fd) => czField(c, fd, missSet)).join('')}</div>`;
  const nOpen = czActs(c).filter((a) => !['완료', '취소'].includes(a.ActionStatus)).length;
  const n = c.NcrId ? db.ncrs.find((x) => x.id === c.NcrId) : null,
    ds = (c.DefectIds || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean),
    cost = ds.reduce((a, d) => a + costTotal(d), 0);
  return `<div class="chead"><div class="r1"><span class="mono">${esc(c.CaseNo)}</span><span class="badge ${czTierCls(c.Tier)}">${esc(c.Tier || 'TIER 미정')}</span><span class="badge ${czStCls(c.Status)}">${esc(c.Status)}</span>${
    !closed && czTarget(c)
      ? (() => {
          const t = czTarget(c),
            k = diffDays(today(), t);
          return `<span class="bg ${k < 0 ? 'bad' : k <= 7 ? 'warn' : 'mut'}" title="${
            has(c.TargetClose) ? '직접 입력한 목표 종결일' : `등록일 + ${esc(c.Tier || 'TIER')} 기준 ${czDays(c)}일 (기본 탭에서 바꿀 수 있음)`
          }">목표 종결 ${t} ${k < 0 ? 'D+' + -k : k === 0 ? '오늘' : 'D-' + k}</span>`;
        })()
      : ''
  }
      <h2>${esc(c.Title || '(제목 없음)')}</h2><select data-scope="case" data-f="Status">${czOptHTML(CZ_OPT.Status, c.Status)}</select>
      <button class="btn" data-act="a3">A3 보고서</button><button class="btn" data-act="report">8D 보고서</button>
      ${ps && !closed ? `<button class="btn" data-act="stagePrev">← ${esc(ps)}</button>` : ''}
      ${
        closed
          ? `<button class="btn" data-act="reopen">다시 열기</button>`
          : ns
            ? `<button class="btn pri" data-act="stageNext">${ns === '종결' ? '종결 처리' : esc(ns) + '(으)로 →'}</button>`
            : ''
      }</div>
      ${
        n || ds.length
          ? `<div class="lnk">${
              n ? `<a class="bg inf" style="cursor:pointer" onclick="editNcr('${n.id}')">${esc(n.no)} · ${esc(ncrStatus(n))}</a>` : ''
            }${ds.length ? `<span class="bg mut">불량 ${ds.length}건 · ${sum(ds, 'qty').toLocaleString()}개</span>` : ''}${
              ds.length
                ? (() => {
                    const g = ds.map((d) => sevOf(d).grade).sort()[0];
                    return `<span class="bg ${SEV_CLS[g]}">불량 심각도 ${g}</span>`;
                  })()
                : ''
            }${cost ? `<span class="bg mut">비용 ${won(cost)}원</span>` : ''}${
              c.RcaScope ? `<span class="bg ${c.RcaScope === '없음' ? 'mut' : 'warn'}">사내 분석: ${esc(CZ_RCA_LBL[c.RcaScope])}</span>` : ''
            }</div>`
          : c.RcaScope
            ? `<div class="lnk"><span class="bg ${c.RcaScope === '없음' ? 'mut' : 'warn'}">사내 분석: ${esc(CZ_RCA_LBL[c.RcaScope])}</span></div>`
            : ''
      }
      <div class="stages">${stages}</div>
      <div class="flow"><div><label>공</label><select data-scope="case" data-f="Ball" class="${missSet.has('NextAction') ? 'miss' : ''}">${czOptHTML(CZ_OPT.Ball, c.Ball)}</select></div>
        <div><label>다음 행동</label><input type="text" data-scope="case" data-f="NextAction" value="${esc(c.NextAction)}"></div>
        <div><label>재확인일</label><input type="date" data-scope="case" data-f="RecheckDate" value="${esc(c.RecheckDate)}"></div>
        <div><button class="btn" data-act="bump" data-id="${c.id}">+2일</button></div></div>
      ${
        czUi.showGate && missing.length
          ? `<div class="gate"><b>${esc(ns)} 단계로 넘어가려면 ${missing.length}개 항목이 필요합니다.</b><ul>${missing
              .map((r) => `<li><a data-act="gotoTab" data-tab="${r.tab}" data-f="${r.f || ''}">${esc(r.t)}</a></li>`)
              .join('')}</ul></div>`
          : ''
      }</div>
    <div class="tabs">${tabs
      .map(
        (t) =>
          `<div class="tab ${t.id === tab.id ? 'on' : ''}" data-act="tab" data-tab="${t.id}">${t.label}${
            t.id === 'actions' ? ` (${nOpen}/${czActs(c).length})` : ''
          }${t.id === 'cause' && (c.Analyses || []).length ? ` (${c.Analyses.length})` : ''}${
            t.id === 'hist' && (c.Log || []).length ? ` (${c.Log.length})` : ''
          }${missTabs.has(t.id) ? '<span class="dot"></span>' : ''}</div>`,
      )
      .join('')}</div>
    <div class="card">${body}</div>`;
}
// RCA 원인분석 결론 → 연결 불량의 귀책 판정 (귀책 조사와 연결)
const czCauseSum = (c) =>
  [c.CauseOccur && '발생: ' + String(c.CauseOccur).trim(), c.CauseEscape && '유출: ' + String(c.CauseEscape).trim()].filter(Boolean).join(' / ');
function czVerdictBox(c) {
  const ds = (c.DefectIds || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean);
  if (!ds.length) return '';
  const pend = (d) => !(d.inv && d.inv.verdict) && (d.resp === '미정' || !!d.inv);
  if (!ds.some((d) => pend(d) || (d.inv && d.inv.verdict))) return '';
  const sum = czCauseSum(c),
    noCause = !String(c.CauseOccur || '').trim();
  const rows = ds
    .filter((d) => d.resp === '미정' || d.inv)
    .map((d) => {
      const iv = d.inv || {},
        p = pend(d);
      return `<label class="vrow"><input type="checkbox" value="${d.id}" ${p ? 'checked' : ''}><span><b>${esc(defLabel(d))}</b> <span class="muted">${esc(supName(d.supplierId) || '협력사 미지정')}</span></span>
      <span class="badge ${iv.verdict ? 'st-done' : 'st-hold'}">${iv.verdict ? `판정: ${esc(iv.verdict)}` : esc(invInfo(d).label)}</span></label>`;
    })
    .join('');
  const allDone = !ds.some(pend);
  return `<details class="vbox" id="czVerdict" ${allDone ? '' : 'open'}><summary><b>귀책 판정 반영</b> <span class="muted">— 원인분석 결론으로 연결된 불량의 귀책을 판정합니다 (귀책 조사 종료)</span>${
    allDone ? ' <span class="badge st-done">판정 완료</span>' : ''
  }</summary>
    <div class="vlist">${rows}</div>
    <div class="vsum">${
      sum
        ? `<b>판정 근거</b> RCA ${esc(c.CaseNo)} — ${esc(sum.length > 160 ? sum.slice(0, 160) + '…' : sum)}`
        : '<span style="color:var(--amb)">아래 <b>발생 원인</b>을 먼저 입력하세요. 원인이 판정 근거로 기록됩니다.</span>'
    }</div>
    <div class="vbtn"><button class="btn" onclick="czApplyVerdict('${c.id}','사내')" ${noCause ? 'disabled' : ''}>사내 귀책</button><button class="btn" onclick="czApplyVerdict('${c.id}','협력사')" ${noCause ? 'disabled' : ''}>협력사 귀책</button>
      <span class="vshare"><button class="btn" onclick="czApplyVerdict('${c.id}','공동')" ${noCause ? 'disabled' : ''}>공동 귀책</button> 협력사 부담 <input type="number" id="czShare" min="0" max="100" style="width:70px" placeholder="%"> %</span>
      <button class="btn" onclick="czApplyVerdict('${c.id}','원인 불명')">원인 불명</button></div></details>`;
}
async function czApplyVerdict(cid, v) {
  const c = czById('cases', cid);
  if (!c) return;
  const ids = [...document.querySelectorAll('#czVerdict .vlist input:checked')].map((x) => x.value);
  if (!ids.length) {
    toast('판정할 불량을 선택하세요');
    return;
  }
  let share = '';
  if (v === '공동') {
    const e = $('#czShare');
    share = e && e.value !== '' ? Math.max(0, Math.min(100, num(e.value))) : '';
    if (share === '') {
      toast('공동 귀책은 협력사 부담 비율(%)을 입력하세요');
      e && e.focus();
      return;
    }
  }
  const ds = ids.map((i) => db.defects.find((d) => d.id === i)).filter(Boolean),
    sum = czCauseSum(c);
  const basis = `RCA ${c.CaseNo} 원인분석 결론${sum ? ' — ' + sum : ''}`.slice(0, 300);
  const next = {
    협력사: '원인 부품 기준으로 NCR을 발행합니다',
    사내: '이 RCA로 사내 대책을 진행합니다',
    공동: `협력사 ${share}% 분담 · NCR 발행과 사내 대책을 함께 진행합니다`,
    '원인 불명': '불량은 완료 처리되고, 재발하면 다시 조사합니다',
  }[v];
  if (
    !(await askConfirm({
      title: `귀책을 ‘${v}’(으)로 판정할까요?`,
      items: ds.map(
        (d) => `${esc(defLabel(d))}${d.inv && d.inv.verdict ? ` <span class="muted">(기존 판정 ${esc(d.inv.verdict)} → ${esc(v)})</span>` : ''}`,
      ),
      msg: `판정 근거: ${esc(basis)}`,
      note: `다음 단계 — ${next}`,
      ok: '판정',
      danger: false,
    }))
  )
    return;
  ds.forEach((d) => {
    d.inv = { ...(d.inv || {}), verdict: v, verdictDate: today(), basis, ...(v === '공동' ? { share } : {}) };
    d.resp = VERDICT_RESP[v] || d.resp;
    touch(d);
  });
  czLog(c, '귀책 판정', `${v}${v === '공동' ? ` (협력사 ${share}%)` : ''} — 불량 ${ds.length}건`);
  touch(c);
  save();
  render();
  const noPart = v !== '사내' && v !== '원인 불명' && ds.some((d) => !d.partNo);
  toast(`불량 ${ds.length}건 귀책 판정: ${v}${noPart ? ' — 원인 품번이 없는 불량은 지정 후 NCR을 발행하세요' : ''}`);
  setTimeout(
    () =>
      offerNcrAfterVerdict(
        ds.map((d) => d.id),
        v,
      ),
    350,
  );
}
function czNcrNote(c, where) {
  const n = czNcr(c);
  if (!n) return '';
  const st = ncrStatus(n),
    ok = czNcrOk(c),
    open = `<a class="lk" style="cursor:pointer" onclick="editNcr('${n.id}')">${esc(n.no)}</a>`;
  const M = {
    cause:
      (ok ? `협력사 대책서가 승인되어 ${open}의 D4 원인을 발생 원인에 옮겼습니다.` : `협력사 원인분석은 ${open}에서 받습니다 (현재: ${esc(st)}).`) +
      (czNeedEsc(c)
        ? ' <b>유출 원인(왜 못 걸렀나)은 협력사 대책서와 별개로 사내에서 분석해야 합니다.</b>'
        : ok
          ? ' 사내 분석 대상이 없으면 워크시트 없이 넘어갑니다.'
          : ' 사내 분석 대상이 ‘없음’이면 대책서 승인 후 원인분석 단계가 충족됩니다.'),
    actions: ok
      ? `협력사 대책은 ${open} 대책서(D5·D6)로 승인되었습니다. 여기에는 사내에서 할 일(수입검사 강화, 기준서 개정, 수평전개 등)만 등록하세요.${
          czNeedEsc(c) ? ' 유출 분석 대상이므로 유출대책 조치는 꼭 1건 이상 필요합니다.' : ''
        }`
      : `협력사 대책은 ${open}에서 회신·평가합니다. 대책서가 승인되면 발생·유출대책 조치 요건이 충족됩니다. 여기에는 사내 할 일만 등록하세요.`,
    verify: czNcrDone(c)
      ? `${open} 유효성 검증이 ‘유효’로 끝나 효과검증 판정을 합격으로 반영했습니다.`
      : `효과검증은 ${open}의 유효성 검증(기한 ${esc(n.verifyDue || '-')})이 ‘유효’로 끝나면 자동으로 충족됩니다.`,
  };
  return `<div class="note">${M[where]}</div>`;
}
function czCaseActions(c) {
  const list = czActs(c).sort((a, b) => (a.DueDate || '9').localeCompare(b.DueDate || '9'));
  return `<div class="bar"><span class="muted">봉쇄 · 대책 · 문서개정 · 수평전개 · 교육 등 담당자와 기한이 있는 모든 일을 한 줄씩 등록합니다.</span><span class="grow"></span><button class="btn pri sm" data-act="addAct">+ 조치 추가</button></div>
    <div class="tw"><table class="t"><thead><tr><th style="min-width:220px">조치 내용</th>
      <th>구분</th><th>담당자</th><th>외부 담당</th><th>기한</th><th>완료일</th><th>상태</th><th></th></tr></thead>
    <tbody>${list.map((a) => czActRow(a, false)).join('')}${czGhostRows(c)}</tbody></table></div>`;
}
// 기본 항목: 발생대책 · 유출대책이 없으면 빈 줄을 미리 보여 줌 (내용을 입력하면 조치로 등록)
function czGhostRows(c) {
  const have = new Set(czActs(c).map((a) => a.Category));
  const g = ['발생대책', '유출대책'].filter((k) => !have.has(k));
  if (czPath(c).includes('효과검증') && CZ_STAGES.indexOf(c.Stage) >= CZ_STAGES.indexOf('효과검증') && c.Stage !== '종결' && !have.has('효과검증'))
    g.push('효과검증');
  if (!g.length) return czActs(c).length ? '' : '<tr><td colspan="8" class="empty">등록된 조치가 없습니다.</td></tr>';
  return g
    .map(
      (k) => `<tr class="ghost"><td><input type="text" data-scope="ghost" data-cat="${k}" placeholder="${
        k === '발생대책'
          ? '왜 만들어졌나 → 재발 방지 대책 (예: 금형 수정, 공정 조건 변경)'
          : k === '유출대책'
            ? '왜 못 걸렀나 → 검출 대책 (예: 검사 항목 추가, 전수검사)'
            : '대책 적용 후 효과 확인 (예: 3 LOT 연속 무결점 · 불량률 비교)'
      }"></td>
    <td><span class="badge ${
      k === '발생대책' ? 't1' : k === '유출대책' ? 't2' : 't0'
    }">${k}</span></td><td class="muted">${esc(czMe() || '-')}</td><td></td><td><input type="date" data-scope="ghostdue" data-cat="${k}" value="${
      k === '효과검증' && has(c.VerifyEnd) ? c.VerifyEnd : addDays(today(), k === '효과검증' ? 30 : 7)
    }"></td><td></td><td class="muted">기본 항목</td><td></td></tr>`,
    )
    .join('');
}
function czActRow(a, showCase) {
  const c = czById('cases', a.CaseId),
    late = !['완료', '취소'].includes(a.ActionStatus) && has(a.DueDate) && a.DueDate < today();
  const at = (k) => `data-scope="act" data-id="${a.id}" data-f="${k}"`;
  return `<tr>${
    showCase
      ? `<td class="mono"><a style="cursor:pointer;color:var(--acc)" data-act="open" data-id="${a.CaseId}" data-tab="actions">${c ? esc(c.CaseNo) : '-'}</a></td>`
      : ''
  }
    <td><input type="text" ${at('Title')} value="${esc(a.Title)}"></td>
      <td><select ${at('Category')}>${czOptHTML(CZ_OPT.ActCat, a.Category)}</select></td>
    <td><input type="text" ${at('Assignee')} list="dlOwners" value="${esc(a.Assignee)}" style="width:96px"></td>
      <td><input type="text" ${at('ExternalOwner')} value="${esc(a.ExternalOwner)}" style="width:96px"></td>
    <td><input type="date" ${at('DueDate')} value="${esc(a.DueDate)}" style="${
      late ? 'border-color:var(--red);color:var(--red)' : ''
    }"></td><td><input type="date" ${at('DoneDate')} value="${esc(a.DoneDate)}"></td>
    <td><select ${at('ActionStatus')}>${czOptHTML(
      CZ_OPT.ActStatus,
      a.ActionStatus,
    )}</select></td><td><button class="btn sm danger" data-act="delAct" data-id="${a.id}" title="삭제">✕</button></td></tr>`;
}
// 이력 탭 — RCA에 남긴 기록 + 연결 NCR · 불량의 자동 이벤트 (기록 도입 전 건은 날짜로 추정해 표시)
function czHistHTML(c) {
  const own = c.Log || [],
    L = own.map((x) => ({ date: x.date || String(x.at || '').slice(0, 10), at: x.at || '', type: x.type, text: x.text, by: x.by, src: 'RCA' }));
  if (!own.some((x) => x.type === '생성') && has(c.Created))
    L.push({ date: c.Created, at: '', type: '생성', text: `${c.CaseNo} 등록`, src: 'RCA', est: true });
  if (c.Status === '종결' && has(c.CloseDate) && !own.some((x) => x.type === '종결'))
    L.push({ date: c.CloseDate, at: '', type: '종결', text: '종결', src: 'RCA', est: true });
  czActs(c).forEach((a) => {
    if (a.ActionStatus === '완료' && has(a.DoneDate) && !own.some((x) => x.actId === a.id && x.type === '조치 완료'))
      L.push({ date: a.DoneDate, at: '', type: '조치 완료', text: `${a.Category} — ${a.Title || ''}`, src: 'RCA', est: true });
  });
  if (!czUi.histOwn) {
    const n = czNcr(c);
    if (n) autoEvents(null, n).forEach((e) => L.push({ date: e.date, at: '', type: 'NCR', text: e.text, src: n.no }));
    (c.DefectIds || [])
      .map((i) => db.defects.find((d) => d.id === i))
      .filter(Boolean)
      .forEach((d) => autoEvents(d, null).forEach((e) => L.push({ date: e.date, at: '', type: '불량', text: e.text, src: defLabel(d) })));
  }
  L.sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.at).localeCompare(String(a.at)));
  const cls = {
    생성: 't0',
    단계: 't1',
    종결: 'st-done',
    되돌림: 't3',
    '다시 열기': 't3',
    상태: 't2',
    '조치 완료': 'st-done',
    조치: 't0',
    '귀책 판정': 't2',
    연결: 't0',
    NCR: 't1',
    불량: 't0',
  };
  return `<div class="bar"><span class="muted">단계 진행 · 되돌림 · 다시 열기 · 조치 완료 · 귀책 판정이 자동으로 남습니다. 지우거나 고칠 수 없습니다.</span><span class="grow"></span><button class="btn sm" data-act="histAll">${
    czUi.histOwn ? '연결 NCR · 불량 기록도 보기' : 'RCA 기록만 보기'
  }</button></div>
    <div class="tw"><table class="t"><thead><tr><th style="width:96px">일자</th>
      <th style="width:90px">구분</th><th>내용</th><th style="width:140px">출처 · 기록자</th></tr></thead><tbody>
    ${
      L.length
        ? L.map(
            (x) =>
              `<tr${x.est ? ' class="muted"' : ''}><td class="mono">${esc(x.date)}${
                x.at ? `<br><span class="muted" style="font-size:11px">${esc(loc(x.at).slice(11, 16))}</span>` : ''
              }</td><td><span class="badge ${cls[x.type] || 't0'}">${esc(x.type)}</span></td><td>${esc(x.text)}${
                x.est ? ' <span class="muted" style="font-size:11px">(이력 기록 도입 전 — 날짜로 추정)</span>' : ''
              }</td><td style="font-size:12px">${esc(x.src)}${x.by ? ` · ${esc(x.by)}` : ''}</td></tr>`,
          ).join('')
        : '<tr><td colspan="4" class="empty">기록이 없습니다.</td></tr>'
    }</tbody></table></div>`;
}
function czViewActions() {
  const t = today(),
    me = czMe(),
    f = czUi.actFilt;
  let rows = db.actions.filter((a) => czById('cases', a.CaseId));
  if (f === 'open') rows = rows.filter((a) => !['완료', '취소'].includes(a.ActionStatus));
  if (f === 'late') rows = rows.filter((a) => !['완료', '취소'].includes(a.ActionStatus) && has(a.DueDate) && a.DueDate < t);
  if (f === 'mine') rows = rows.filter((a) => !['완료', '취소'].includes(a.ActionStatus) && me && (a.Assignee || '').includes(me));
  rows.sort((a, b) => (a.DueDate || '9').localeCompare(b.DueDate || '9'));
  const seg = [
    ['open', '미완료'],
    ['late', '기한 초과'],
    ['mine', '내 조치'],
    ['all', '전체'],
  ];
  return `<h1>조치</h1><p class="sub">모든 RCA의 조치를 기한 순으로 봅니다. 여기서 바로 수정할 수 있습니다.</p>
    <div class="bar"><div class="seg">${seg
      .map(([v, l]) => `<a class="${f === v ? 'on' : ''}" data-act="actFilt" data-v="${v}">${l}</a>`)
      .join('')}</div>
      ${
        f === 'mine' && !me
          ? '<span class="muted">설정 › 일반의 담당자 목록 첫 줄이 ‘나’로 쓰입니다.</span>'
          : f === 'mine'
            ? `<span class="muted">담당자 ‘${esc(me)}’ 기준</span>`
            : ''
      }
      <span class="grow"></span><button class="btn" data-act="csv" data-list="actions">CSV</button></div>
    <div class="tw"><table class="t"><thead><tr><th>RCA</th><th style="min-width:220px">조치 내용</th>
      <th>구분</th><th>담당자</th><th>외부 담당</th><th>기한</th><th>완료일</th><th>상태</th><th></th></tr></thead>
    <tbody>${
      rows.length ? rows.map((a) => czActRow(a, true)).join('') : '<tr><td colspan="9" class="empty">해당하는 조치가 없습니다.</td></tr>'
    }</tbody></table></div>`;
}

/* ---------- 생성 · 수정 ---------- */
