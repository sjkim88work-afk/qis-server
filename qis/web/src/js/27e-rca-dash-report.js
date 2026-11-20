// ── RCA — 대시보드 항목 · 보고서 · CSV ──
function czDashItems() {
  const t = today(),
    open = db.cases.filter((c) => c.Status === '진행중' || c.Status === '보류'),
    L = [];
  open
    .filter((c) => has(c.RecheckDate) && c.RecheckDate <= t)
    .sort((a, b) => a.RecheckDate.localeCompare(b.RecheckDate))
    .slice(0, 8)
    .forEach((c) =>
      L.push(
        `<li><span class="bg ${c.Ball === '나' ? 'inf' : 'warn'}">${c.Ball === '나' ? 'RCA 재확인' : 'RCA 독촉'}</span> <a class="lk" onclick="czOpenCase('${c.id}')">${esc(c.CaseNo)} ${esc(c.Title)}</a> — ${esc(c.Stage)} · ${esc(c.NextAction || '')} (${esc(c.RecheckDate)})</li>`,
      ),
    );
  db.actions
    .filter((a) => !['완료', '취소'].includes(a.ActionStatus) && has(a.DueDate) && a.DueDate < t && czCaseOpenId(a.CaseId))
    .sort((a, b) => a.DueDate.localeCompare(b.DueDate))
    .slice(0, 8)
    .forEach((a) => {
      const c = czById('cases', a.CaseId);
      L.push(
        `<li><span class="bg bad">조치 지연</span> <a class="lk" onclick="czOpenCase('${a.CaseId}','actions')">${esc(a.Title || '(내용 없음)')}</a> ${esc(c.CaseNo)} — 기한 ${esc(a.DueDate)}</li>`,
      );
    });
  return L.join('');
}

/* ---------- 이벤트 ---------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !el.closest('.cz')) return;
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const act = el.dataset.act,
    id = el.dataset.id;
  switch (act) {
    case 'czNav':
      czGo(el.dataset.v);
      break;
    case 'open':
      czOpenCase(id, el.dataset.tab);
      break;
    case 'tab':
      czUi.tab = el.dataset.tab;
      render();
      break;
    case 'gotoTab':
      if (el.dataset.tab !== 'head') czUi.tab = el.dataset.tab;
      render();
      {
        const f = el.dataset.f,
          t = f && document.getElementById('czf_' + f);
        if (t) t.focus();
      }
      break;
    case 'bump': {
      const c = czById('cases', id);
      c.RecheckDate = addDays(today(), 2);
      touch(c);
      save();
      render();
      toast('재확인일을 ' + c.RecheckDate + '로 옮겼습니다.');
      break;
    }
    case 'stageNext':
      czStageNext();
      break;
    case 'stagePrev': {
      const c = czById('cases', czUi.caseId),
        ps = czPrev(c);
      if (!ps) break;
      const r = await askConfirm({
        title: `${ps} 단계로 되돌릴까요?`,
        msg: '되돌린 사유가 이력에 남습니다.',
        ok: '되돌리기',
        danger: false,
        input: { label: '되돌리는 사유', ph: '예: 원인 재분석 필요 · 대책 효과 미흡' },
      });
      if (r) {
        const from = c.Stage;
        c.Stage = ps;
        czUi.showGate = false;
        czLog(c, '되돌림', `${from} → ${ps} — ${r}`, { from, to: ps, reason: r });
        touch(c);
        save();
        render();
      }
      break;
    }
    case 'reopen':
      czReopen(czById('cases', czUi.caseId));
      break;
    case 'showGate':
      czUi.showGate = true;
      render();
      break;
    case 'histAll':
      czUi.histOwn = !czUi.histOwn;
      render();
      break;
    case 'delCase':
      czDelCase(czUi.caseId);
      break;
    case 'addAct': {
      czCreateAction({ CaseId: czUi.caseId });
      save();
      render();
      const last = [...document.querySelectorAll('[data-scope="act"][data-f="Title"]')].find((x) => !x.value);
      if (last) last.focus();
      break;
    }
    case 'delAct': {
      const a = czById('actions', id);
      if (a && (!a.Title || (await askConfirm({ title: '이 조치를 삭제할까요?', items: [esc(a.Title)] })))) {
        if (a.Title) {
          const c = czById('cases', a.CaseId);
          czLog(c, '조치', `조치 삭제 — ${a.Category}: ${a.Title}`, { actId: a.id });
          c && touch(c);
        }
        removeRec('actions', id);
        save();
        render();
      }
      break;
    }
    case 'actDone': {
      const a = czById('actions', id);
      a.ActionStatus = '완료';
      a.DoneDate = today();
      {
        const c = czById('cases', a.CaseId);
        czLog(c, '조치 완료', `${a.Category} — ${a.Title || ''}`, { actId: a.id });
        c && touch(c);
      }
      touch(a);
      save();
      render();
      toast('완료 처리했습니다.');
      break;
    }
    case 'actFilt':
      czUi.actFilt = el.dataset.v;
      render();
      break;
    case 'newCase':
      czNewCaseModal();
      break;
    case 'report':
      czReport();
      break;
    case 'a3':
      a3Report('case', czUi.caseId);
      break;
    case 'csv':
      czCSV(el.dataset.list);
      break;
    case 'linkDef': {
      const c = czById('cases', czUi.caseId),
        v = $('#czLinkD').value,
        d = db.defects.find((x) => x.id === v);
      if (!d) break;
      c.DefectIds = [...new Set([...(c.DefectIds || []), d.id])];
      czAttach(c, [d], null);
      czLog(c, '연결', `불량 연결 — ${defLabel(d)}`);
      if (!c.NcrId && d.ncrId) {
        const n = db.ncrs.find((x) => x.id === d.ncrId);
        if (n && !n.caseId) {
          c.NcrId = n.id;
          czAttach(c, [], n);
        }
      }
      touch(c);
      save();
      render();
      break;
    }
    case 'unlinkDef': {
      const c = czById('cases', czUi.caseId),
        did = el.dataset.did,
        d = db.defects.find((x) => x.id === did);
      c.DefectIds = (c.DefectIds || []).filter((x) => x !== did);
      if (d && d.caseId === c.id) {
        d.caseId = '';
        touch(d);
      }
      czLog(c, '연결', `불량 연결 해제 — ${d ? defLabel(d) : did}`);
      touch(c);
      save();
      render();
      break;
    }
    case 'linkNcr': {
      const c = czById('cases', czUi.caseId),
        n = db.ncrs.find((x) => x.id === $('#czLinkN').value);
      if (!n) break;
      c.NcrId = n.id;
      delete c._ncrSt;
      czAttach(c, [], n);
      czLog(c, '연결', `NCR 연결 — ${n.no}`);
      (n.defectIds || []).forEach((i) => {
        const d = db.defects.find((x) => x.id === i);
        if (d && !d.caseId) {
          c.DefectIds = [...new Set([...(c.DefectIds || []), d.id])];
          czAttach(c, [d], null);
        }
      });
      touch(c);
      save();
      render();
      break;
    }
    case 'unlinkNcr': {
      const c = czById('cases', czUi.caseId),
        n = db.ncrs.find((x) => x.id === c.NcrId);
      if (n && n.caseId === c.id) {
        n.caseId = '';
        touch(n);
      }
      if (n) czLog(c, '연결', `NCR 연결 해제 — ${n.no}`);
      c.NcrId = '';
      delete c._ncrSt;
      touch(c);
      save();
      render();
      break;
    }
    case 'issueNcr': {
      const c = czById('cases', czUi.caseId),
        d = (c.DefectIds || []).map((i) => db.defects.find((x) => x.id === i)).find((x) => x && !x.ncrId);
      if (!d) {
        toast('NCR이 없는 연결 불량이 없습니다.');
        break;
      }
      ncrFromDefect(d.id);
      break;
    }
    case 'escActs': {
      const c = czById('cases', czUi.caseId),
        p = czPart(c),
        pn = p ? p.partNo : '';
      czCreateAction({
        CaseId: c.id,
        Category: '유출대책',
        Title: `수입검사기준서 개정 — ${pn} 검사 항목 · 샘플링 · 측정 방법 재검토`,
        DueDate: addDays(today(), 14),
      });
      czCreateAction({
        CaseId: c.id,
        Category: '문서개정',
        Title: `한도견본 · 검사원 교육 · 유사 부품 수평전개 — ${pn}`,
        DueDate: addDays(today(), 21),
      });
      touch(c);
      save();
      czUi.tab = 'actions';
      render();
      toast('유출 대책 2건을 조치에 추가했습니다.');
      break;
    }
    case 'addAna':
    case 'anaToggle':
    case 'anaDel':
    case 'anaAdd':
    case 'anaApply':
      anaClick(act, el);
      break;
  }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (!el.closest || !el.closest('.cz')) return;
  if (el.dataset.act === 'filt') {
    czUi.filt[el.dataset.k] = el.value;
    render();
    return;
  }
  const scope = el.dataset.scope;
  if (!scope) return;
  if (scope === 'case') {
    const c = czById('cases', czUi.caseId);
    if (!c) return;
    if (el.dataset.multi) {
      const k = el.dataset.multi,
        set = new Set(c[k] || []);
      el.checked ? set.add(el.value) : set.delete(el.value);
      c[k] = [...set];
    } else if (czSetField(c, el.dataset.f, el.value) === false) {
      el.value = c[el.dataset.f] || '';
      render();
      return;
    }
    touch(c);
    save();
    czSoft();
  } else if (scope === 'ghost') {
    const c = czById('cases', czUi.caseId),
      t = el.value.trim();
    if (!c || !t || el.dataset.done) return;
    el.dataset.done = '1';
    if (czActs(c).some((a) => a.Category === el.dataset.cat && a.Title === t)) return;
    const du = document.querySelector(`.cz [data-scope="ghostdue"][data-cat="${el.dataset.cat}"]`);
    const na = czCreateAction({ CaseId: c.id, Category: el.dataset.cat, Title: t, DueDate: (du && du.value) || addDays(today(), 7) });
    czLog(c, '조치', `조치 등록 — ${na.Category}: ${t}`, { actId: na.id });
    touch(c);
    save();
    czSoft();
    toast(`${el.dataset.cat} 조치를 등록했습니다.`);
  } else if (scope === 'ghostdue') {
  } else if (scope === 'act') {
    const a = czById('actions', el.dataset.id);
    if (!a) return;
    const f = el.dataset.f,
      old = a[f],
      wasDone = a.ActionStatus === '완료';
    a[f] = el.value;
    if (f === 'ActionStatus') {
      if (el.value === '완료' && !has(a.DoneDate)) a.DoneDate = today();
      if (el.value !== '완료' && wasDone) a.DoneDate = '';
    } // 완료 해제 → 완료일도 비움
    if (f === 'DoneDate') {
      if (has(el.value) && a.ActionStatus !== '취소') a.ActionStatus = '완료';
      else if (!has(el.value) && wasDone) a.ActionStatus = '진행';
    }
    const c = czById('cases', a.CaseId),
      isDone = a.ActionStatus === '완료';
    if (c) {
      const n0 = (c.Log || []).length;
      if (!wasDone && isDone) czLog(c, '조치 완료', `${a.Category} — ${a.Title || ''}`, { actId: a.id });
      else if (wasDone && !isDone) czLog(c, '조치', `완료 해제 — ${a.Category}: ${a.Title || ''} (${a.ActionStatus})`, { actId: a.id });
      else if (f === 'Title' && !has(old) && has(el.value)) czLog(c, '조치', `조치 등록 — ${a.Category}: ${el.value}`, { actId: a.id });
      if ((c.Log || []).length > n0) touch(c);
    }
    touch(a);
    save();
    czSoft();
  } else if (scope === 'ana') {
    const c = czById('cases', czUi.caseId);
    if (!c) return;
    const a = (c.Analyses || []).find((x) => String(x.id) === el.dataset.aid);
    if (!a) return;
    setPath(a, el.dataset.path, el.type === 'checkbox' ? el.checked : el.value);
    a.updatedAt = now();
    touch(c);
    save();
    czSoft();
  }
});
document.addEventListener('input', (e) => {
  if (e.target.dataset && e.target.dataset.act === 'filtq' && e.target.closest('.cz')) {
    czUi.filt.q = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const n = document.querySelector('.cz [data-act="filtq"]');
    if (n) {
      n.focus();
      n.setSelectionRange(pos, pos);
    }
  }
});

/* ---------- 보고서 (8D 형식 요약) ---------- */
function czReport() {
  const c = czById('cases', czUi.caseId);
  if (!c) return;
  const w = reportWin(),
    p = czPart(c),
    A = czActs(c);
  const ds = (c.DefectIds || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean),
    n = c.NcrId ? db.ncrs.find((x) => x.id === c.NcrId) : null;
  const row = (k, v) => `<tr><th>${esc(k)}</th><td class="pre">${esc(v || '')}</td></tr>`;
  const actTable = (cats) => {
    const l = A.filter((a) => cats.includes(a.Category));
    return l.length
      ? `<table><tr><th style="width:auto">조치</th><th style="width:14%">구분</th><th style="width:14%">담당</th>
        <th style="width:13%">기한</th><th style="width:13%">완료일</th><th style="width:10%">상태</th></tr>${l
          .map(
            (a) =>
              `<tr><td>${esc(a.Title)}</td><td>${esc(a.Category)}</td><td>${esc(a.Assignee || a.ExternalOwner)}</td>
                <td>${esc(a.DueDate)}</td><td>${esc(a.DoneDate)}</td><td>${esc(a.ActionStatus)}</td></tr>`,
          )
          .join('')}</table>`
      : '<p class="muted">등록된 조치 없음</p>';
  };
  const html = reportFrame(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(c.CaseNo)} 문제해결 보고서</title><style>
  body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:12px;color:#111;margin:24px}h1{font-size:18px;margin:0 0 4px}
  h3{font-size:13px;margin:16px 0 6px;padding:4px 8px;background:#eef2f7;border-radius:4px;break-after:avoid}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px}td,th{border:1px solid #bbb;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f5f7f9;width:22%;font-weight:600}
  .pre{white-space:pre-wrap}.muted{color:#777}</style></head><body>${logoHead()}
  <h1>문제해결 보고서 (8D) — ${esc(c.CaseNo)}</h1><div class="muted">출력일 ${today()} · 상태 ${esc(c.Status)} · 단계 ${esc(c.Stage)}</div>
  <h3>D0 · D1 개요와 팀</h3><table>${row('제목', c.Title)}${row('부품', p ? `${p.partNo} ${p.name}` : '')}${row(
    '협력사 / 고객사',
    `${supName(c.SupplierId) || '-'} / ${c.Customer || '-'}`,
  )}
    ${row('발생원천 / 등록일', `${c.Origin} / ${c.Created}`)}${row('TIER / 대응방향', `${c.Tier} (S${c.SevS} × I${c.ImpI}) / ${c.Response}`)}${
      c.TierReason ? row('TIER 조정사유', c.TierReason) : ''
    }${row('담당자', c.Owner)}${row('연결 NCR', n ? `${n.no} (${ncrStatus(n)})` : '')}${row('기존 문서번호', c.LegacyNo)}</table>
  <h3>D2 문제 정의</h3><table>${row('불량유형 / 수량', `${c.DefectType} / ${c.DefectQty} EA`)}${row('불량내용', c.Description)}</table>
  ${
    ds.length
      ? `<table><tr><th style="width:auto">발생일</th><th style="width:auto">발생처</th><th style="width:auto">부품</th>
        <th style="width:auto">유형</th><th style="width:auto">수량</th><th style="width:auto">심각도</th><th style="width:auto">비용(원)</th></tr>${ds
          .map(
            (d) =>
              `<tr><td>${esc(d.date)}</td><td>${esc(d.source)}</td><td>${esc(d.partNo)} ${esc(d.partName)}</td><td>${esc(d.type)}</td>
                <td>${num(d.qty).toLocaleString()}</td><td>${sevOf(d).grade}</td><td>${costTotal(d) ? won(costTotal(d)) : ''}</td></tr>`,
          )
          .join('')}</table>`
      : ''
  }
  <h3>D3 임시 봉쇄 · 처분</h3><table>${row(
    '격리 수량',
    `재고 ${c.QtyStock || 0} · 재공 ${c.QtyWIP || 0} · 이송중 ${c.QtyTransit || 0} · 고객처 ${c.QtyCustomer || 0} EA`,
  )}
    ${row('격리 완료일 / 식별', `${c.ContainDate || ''} / ${c.ContainMethod || ''}`)}${row('소급 범위', c.ContainScope)}
    ${row(
      '처분',
      `${c.Disposition}${c.DeviationNo ? ' · 특채번호 ' + c.DeviationNo : ''}${
        c.CustApprover ? ' · 고객승인 ' + c.CustApprover + ' ' + (c.CustApproveDate || '') : ''
      }`,
    )}${row('고객통보', `${c.CustNotify || ''} ${c.CustNotifyDate || ''} ${c.CustNotifyReason || ''}`)}</table>${actTable(['봉쇄', '재작업·재검사'])}
  <h3>D4 근본 원인</h3><table>${row(
    '분석도구',
    (c.AnalysisTools || []).join(', '),
  )}${row('발생 원인', c.CauseOccur)}${row('유출 원인', c.CauseEscape)}${row('시스템 원인', c.CauseSystem)}</table>${anaReport(c)}
  <h3>D5 영구 대책</h3>${actTable(['발생대책', '유출대책', '시스템대책'])}<table>${row(
    '실수방지',
    `${c.PokaYoke || ''} ${c.PokaYokeType || ''} ${c.PokaYokeReason || ''}`,
  )}</table>
  <h3>D6 효과 검증</h3><table>${row('검증 기간', `${c.VerifyStart || ''} ~ ${c.VerifyEnd || ''}`)}${row(
    '불량률',
    `개선 전 ${c.RateBefore || ''} → 개선 후 ${c.RateAfter || ''}`,
  )}${row('재발 / 판정', `${c.Recurred || ''} / ${c.VerifyResult || ''}`)}</table>
  <h3>D7 재발 방지 · 표준화</h3><table>${row('공정 FMEA', `${c.FMEAUpdate || ''} ${c.FMEARev || ''}`)}${row(
    '관리계획서',
    `${c.CPUpdate || ''} ${c.CPRev || ''}`,
  )}${row('해당없음 사유', c.DocNAReason)}${row('수평전개', c.Yokoten)}</table>${actTable(['문서개정', '수평전개', '교육'])}
  <h3>D8 종결</h3><table>${row('종결일', c.CloseDate)}${row('종결 승인자', c.CloseApprover)}${row('보관기간', c.Retention)}</table>
  </body></html>`);
  reportShow(w, html, `8D_${c.CaseNo}.html`);
}

/* ---------- CSV (SharePoint 이전용 · 설계서 내부 이름) ---------- */
function czCSV(list) {
  const pNo = (id) => (db.parts.find((p) => p.id === id) || {}).partNo || '',
    cNo = (id) => (czById('cases', id) || {}).CaseNo || '';
  let cols = [],
    rows = [];
  if (list === 'cases') {
    cols = [
      'CaseNo',
      'Title',
      'Origin',
      'RequestType',
      'Part',
      'Supplier',
      'Customer',
      'CustomerClaimNo',
      'DefectType',
      'DefectQty',
      'Description',
      'ParentCase',
      'LegacyNo',
      'LinkedNCR',
      'LinkedDefects',
      'Stage',
      'Status',
      'Ball',
      'NextAction',
      'RecheckDate',
      'TargetClose',
      'Owner',
      'Priority',
      'Created',
      'SevS',
      'ImpI',
      'Score',
      'TierAuto',
      'Tier',
      'TierReason',
      'Response',
      'QtyStock',
      'QtyWIP',
      'QtyTransit',
      'QtyCustomer',
      'ContainDate',
      'ContainMethod',
      'ContainScope',
      'Disposition',
      'DeviationNo',
      'DeviationScope',
      'CustApprover',
      'CustApproveDate',
      'DispositionDate',
      'CustNotify',
      'CustNotifyDate',
      'CustNotifyReason',
      'RcaScope',
      'AnalysisTools',
      'CauseOccur',
      'CauseEscape',
      'CauseSystem',
      'FARIssueDate',
      'D3Reply',
      'D3Score',
      'D7Reply',
      'D7Score',
      'D14Reply',
      'D14Score',
      'FARTotal',
      'PokaYoke',
      'PokaYokeType',
      'PokaYokeReason',
      'FMEAUpdate',
      'FMEARev',
      'CPUpdate',
      'CPRev',
      'DocNAReason',
      'Yokoten',
      'VerifyStart',
      'VerifyEnd',
      'RateBefore',
      'RateAfter',
      'Recurred',
      'VerifyResult',
      'CloseDate',
      'CloseApprover',
      'Retention',
    ];
    rows = db.cases.map((c) =>
      Object.assign({}, c, {
        Part: pNo(c.PartId),
        Supplier: supName(c.SupplierId),
        ParentCase: cNo(c.ParentCaseId),
        LinkedNCR: (db.ncrs.find((n) => n.id === c.NcrId) || {}).no || '',
        LinkedDefects: (c.DefectIds || [])
          .map((i) => db.defects.find((d) => d.id === i))
          .filter(Boolean)
          .map((d) => `${d.date} ${d.partNo} ${d.qty}`)
          .join('; '),
        TargetClose: czTarget(c),
        Score: has(c.SevS) && has(c.ImpI) ? num(c.SevS) * num(c.ImpI) : '',
        TierAuto: czTierAuto(c),
        FARTotal: c.Response === 'FAR' ? czFar(c) : '',
        AnalysisTools: (c.AnalysisTools || []).join(';'),
      }),
    );
  } else if (list === 'actions') {
    cols = ['Title', 'Case', 'Category', 'Assignee', 'ExternalOwner', 'DueDate', 'DoneDate', 'ActionStatus'];
    rows = db.actions.map((a) => Object.assign({}, a, { Case: cNo(a.CaseId) }));
  } else if (list === 'parts') {
    cols = ['Title', 'PartName', 'Supplier', 'VehicleCodes', 'SafetyChar', 'UnitPrice'];
    rows = db.parts.map((p) => ({
      Title: p.partNo,
      PartName: p.name,
      Supplier: supName(p.supplierId),
      VehicleCodes: p.model,
      SafetyChar: p.safety || '해당없음',
      UnitPrice: p.price,
    }));
  } else if (list === 'suppliers') {
    cols = ['Title', 'SupplierCode', 'ContactName', 'ContactEmail', 'Items'];
    rows = db.suppliers.map((s) => {
      const pc = primaryOf(s);
      return { Title: s.name, SupplierCode: s.code, ContactName: pc ? pc.name : '', ContactEmail: pc ? pc.email : '', Items: s.items };
    });
  }
  downloadCSVText(
    `QMS_${list}_${today().replace(/-/g, '')}.csv`, // SharePoint 가져오기용이라 진짜 CSV 유지
    [cols, ...rows.map((r) => cols.map((k) => (Array.isArray(r[k]) ? r[k].join(';') : (r[k] ?? ''))))],
  );
}
