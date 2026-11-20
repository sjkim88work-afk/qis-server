// ── RCA — 만들기 · 값 저장 · 단계 이동 · 불량/NCR 연결 · 동기화 ──
function czCreateCase(d) {
  const c = Object.assign(
    {
      Title: '',
      Origin: '수입검사',
      RequestType: '품질문제',
      PartId: '',
      SupplierId: '',
      Customer: '',
      CustomerClaimNo: '',
      DefectType: '',
      DefectQty: '',
      Description: '',
      Priority: '보통',
      Owner: czMe(),
      SevS: '',
      ImpI: '',
      Tier: '',
      TierReason: '',
      Response: '',
      ParentCaseId: '',
      LegacyNo: '',
      Stage: '접수',
      Status: '진행중',
      Ball: '나',
      NextAction: '임시조치 확인 · 격리',
      RecheckDate: addDays(today(), 2),
      Disposition: '미정',
      VerifyResult: '미검증',
      Retention: '5년',
      AnalysisTools: [],
      Analyses: [],
      DefectIds: [],
      NcrId: '',
      Created: today(),
    },
    d,
  );
  c.id = uid();
  if (has(c.PartId) && !has(c.SupplierId)) {
    const p = db.parts.find((x) => x.id === c.PartId);
    if (p) c.SupplierId = p.supplierId || '';
  }
  if (!has(c.Tier)) c.Tier = czTierAuto(c);
  const g = genDocNo(c.Response === '8D' ? 'i8d' : 'rca', c.Created || today());
  c.CaseNo = g.no;
  db.meta.caseSeq = Math.max(num(db.meta.caseSeq), g.seq);
  czLog(c, '생성', `${c.CaseNo} 등록${c.Origin ? ' — ' + c.Origin : ''}`, { to: '접수' });
  touch(c);
  db.cases.push(c);
  return c;
}
function czCreateAction(d) {
  const a = Object.assign(
    {
      Title: '',
      CaseId: null,
      Category: '발생대책',
      Assignee: czMe(),
      ExternalOwner: '',
      DueDate: addDays(today(), 7),
      DoneDate: '',
      ActionStatus: '대기',
    },
    d,
  );
  a.id = uid();
  touch(a);
  db.actions.push(a);
  return a;
}
function czSetField(c, k, v) {
  if (k === 'PartId') {
    if (!String(v).trim()) {
      c.PartId = '';
      return;
    }
    const p = db.parts.find((x) => x.partNo === String(v).trim());
    if (!p) {
      toast('기준정보에 없는 품번입니다. 기준정보 탭에서 먼저 등록하세요.');
      c.PartId = '';
      return;
    }
    c.PartId = p.id;
    if (p.supplierId) c.SupplierId = p.supplierId;
    return;
  }
  if (k === 'Status' && c.Status === '종결' && v !== '종결') {
    setTimeout(() => czReopen(c, v), 0);
    return false;
  } // 다시 열기는 사유를 받음
  if (k === 'Status' && v === '종결' && c.Stage !== '종결') {
    const miss = czGate(c, '종결');
    if (miss.length) {
      czUi.showGate = true;
      toast(`종결 조건 ${miss.length}개가 남아 있습니다 — 단계 진행 버튼으로 하나씩 채운 뒤 종결하세요`);
      return false;
    }
    czLog(c, '종결', `${c.Stage} → 종결 (상태 변경)`, { from: c.Stage, to: '종결' });
    c.Stage = '종결';
    c.Ball = '나';
    c.NextAction = '종결 완료';
  } else if (k === 'Status' && v !== c.Status) czLog(c, '상태', `${c.Status || '-'} → ${v}`);
  const before = czTierAuto(c);
  c[k] = v;
  if ((k === 'SevS' || k === 'ImpI') && (!has(c.Tier) || c.Tier === before)) c.Tier = czTierAuto(c);
  if (k === 'Status') {
    if (v === '종결' && !has(c.CloseDate)) c.CloseDate = today();
    if (v === '진행중' && c.Stage === '종결') {
      const ps = czPrev(c);
      if (ps) c.Stage = ps;
    }
  }
}
function czStageNext() {
  const c = czById('cases', czUi.caseId),
    ns = czNext(c);
  if (!ns) return;
  const miss = czGate(c, ns);
  if (miss.length) {
    czUi.showGate = true;
    const first = miss[0];
    if (first.tab !== 'head') czUi.tab = first.tab;
    render();
    return;
  }
  const from = c.Stage;
  c.Stage = ns;
  czUi.showGate = false;
  czLog(
    c,
    ns === '종결' ? '종결' : '단계',
    `${from} → ${ns}${czStageDate(c, from) ? ` (${from} ${Math.max(0, diffDays(czStageDate(c, from), today()))}일)` : ''}`,
    { from, to: ns },
  );
  if (ns === '종결') {
    c.Status = '종결';
    c.CloseDate = today();
    c.Ball = '나';
    c.NextAction = '종결 완료';
  } else {
    c.NextAction = CZ_NEXT_HINT[ns];
    c.RecheckDate = addDays(today(), 3);
  }
  czUi.tab =
    { 격리: 'contain', 처분: 'contain', 원인분석: 'cause', 대책: 'actions', 효과검증: 'verify', 표준화: 'close', 종결: 'close' }[ns] || czUi.tab;
  touch(c);
  save();
  render();
  toast(ns === '종결' ? 'RCA를 종결했습니다.' : `${ns} 단계로 넘어갔습니다. 다음 행동을 확인하세요.`);
}
async function czReopen(c, toStatus) {
  if (!c) return;
  const ps = czPrev(c) || c.Stage;
  const r = await askConfirm({
    title: `${c.CaseNo} 종결을 취소하고 다시 열까요?`,
    msg: `단계는 <b>${esc(ps)}</b>(으)로 돌아가고 종결일이 지워집니다. 사유와 함께 이력에 남습니다.`,
    ok: '다시 열기',
    danger: false,
    input: { label: '다시 여는 사유', ph: '예: 동일 불량 재발 · 고객 추가 요청 · 종결 판단 오류' },
  });
  if (!r) {
    render();
    return;
  }
  const old = c.CloseDate;
  c.Status = toStatus && toStatus !== '종결' ? toStatus : '진행중';
  if (c.Stage === '종결') {
    const p = czPrev(c);
    if (p) c.Stage = p;
  }
  c.CloseDate = '';
  czLog(c, '다시 열기', `${r} (종결일 ${old || '-'} 취소 · ${c.Stage} 단계로)`, { from: '종결', to: c.Stage, reason: r });
  touch(c);
  save();
  render();
  toast('다시 열었습니다. 사유가 이력에 남았습니다.');
}
function czNewCaseModal() {
  const S = db.settings;
  openModal(
    '새 RCA',
    `<div class="fg">
    <label class="full">제목 *<input name="Title" placeholder="예: 도어래치 스프링 파단"></label>
    <label>발생원천<select name="Origin">${czOptHTML(CZ_OPT.Origin, '수입검사')}</select></label>
    <label>품번<input name="part" data-combo="parts" autocomplete="off" placeholder="번호·품명·협력사로 검색"></label>
    <label>불량유형<select name="DefectType">${czOptHTML(CZ_OPT.DefectType, '')}</select></label>
    <label>불량수량 (EA)<input type="number" name="DefectQty"></label>
    <label class="full">불량내용<textarea name="Description"></textarea></label>
    <label>심각도 S<select name="SevS">${czOptHTML(CZ_OPT.SevS, '')}</select></label>
    <label>영향도 I<select name="ImpI">${czOptHTML(CZ_OPT.ImpI, '')}</select></label>
    <label>대응방향<select name="Response">${czOptHTML(CZ_OPT.Response, '')}</select></label></div>
    <div class="help" style="margin-top:8px">TIER는 S×I로 자동 판정되며 상세 화면에서 바꿀 수 있습니다. 대응방향에 따라 번호 접두어(NCR/FAR/8D)가 정해집니다.<br>불량 관리에 이미 등록된 건이면 그 불량의 ‘진행 보기’에서 <b>RCA 요청</b>를 쓰는 편이 빠릅니다.</div>`,
    [
      { label: '취소', fn: closeModal },
      {
        label: '등록',
        cls: 'p',
        fn: async () => {
          const o = gather();
          if (!o.Title) {
            toast('제목을 입력하세요.');
            return;
          }
          let pid = '';
          if (o.part) {
            const p = partByNo(o.part);
            if (!p) {
              if (
                !(await askConfirm({
                  title: '기준정보에 없는 품번입니다',
                  msg: '부품 없이 등록할까요? 나중에 기본 탭에서 부품을 고를 수 있습니다.',
                  ok: '부품 없이 등록',
                  danger: false,
                }))
              )
                return;
            } else pid = p.id;
          }
          const c = czCreateCase({
            Title: o.Title,
            Origin: o.Origin,
            PartId: pid,
            DefectType: o.DefectType,
            DefectQty: o.DefectQty,
            Description: o.Description,
            SevS: o.SevS,
            ImpI: o.ImpI,
            Response: o.Response,
          });
          if (['고객사', '필드'].includes(c.Origin)) c.CustNotify = '필요';
          save();
          closeModal(true);
          czOpenCase(c.id);
          toast(`${c.CaseNo} 등록했습니다.${c.Response ? '' : ' 대응방향을 정하세요.'}`);
        },
      },
    ],
  );
}

/* ---------- 불량 · NCR → 사건 ---------- */
const CZ_TR = { 'TIER 0': 0, 'TIER 1': 1, 'TIER 2': 2, 'TIER 3': 3 };
const CZ_FLOOR = { A: 'TIER 2', B: 'TIER 1', C: 'TIER 0' };
function czOrigin(src) {
  const s = stageOf(src);
  return s === 4 ? '고객사' : s === 3 ? '최종검사' : s === 2 ? '공정' : '수입검사';
}
function czRespOfNcr(n) {
  return n.reqType === '간이 대책서' ? '간이 대책서' : n.reqType === '단순 통보' ? '현장조치' : '8D';
}
// 개인 QMS 심각도(A/B/C) → 사건 S·I·TIER 제안. 자동 판정보다 낮지 않게 등급 하한을 적용하고 사유를 남김
function czSuggest(ds) {
  const vs = ds.map(sevOf),
    g = vs.map((v) => v.grade).sort()[0] || 'C';
  const stage = Math.max(...vs.map((v) => v.f.stage)),
    impact = Math.max(...vs.map((v) => v.f.impact)),
    qty = sum(ds, 'qty');
  const SevS = String(stage === 4 ? 4 : impact === 4 ? 3 : impact === 1 ? 1 : 2),
    ImpI = String(qty >= 1000 ? 5 : qty >= 100 ? 3 : 1);
  const auto = czTierAuto({ SevS, ImpI });
  let Tier = auto,
    TierReason = '';
  if (CZ_TR[CZ_FLOOR[g]] > CZ_TR[auto]) {
    Tier = CZ_FLOOR[g];
    const v = vs.find((x) => x.grade === g);
    TierReason = `불량 심각도 ${g}등급(${v.score}점${v.forced.length ? ' · ' + v.forced.join(', ') : ''}) 반영 — 자동 판정 ${auto} 대신 ${Tier} 적용`;
  }
  return { g, SevS, ImpI, Tier, TierReason, Response: { A: '8D', B: '간이 대책서', C: '현장조치' }[g] };
}
function czBuildFrom(ds, n) {
  const d = ds[0] || {},
    sg = czSuggest(ds.length ? ds : [d]),
    p = d.partNo ? partByNo(d.partNo) : null,
    qty = sum(ds, 'qty');
  const desc = [
    (n && (n.defectDesc || n.d2)) || ds.map((x) => `[${x.date} ${x.source || ''}] ${x.desc || ''}`).join('\n'),
    ...ds.filter((x) => x.containment).map((x) => `[임시조치] ${x.containment}`),
  ]
    .filter(Boolean)
    .join('\n');
  const o = {
    Title: (n && n.title) || `${d.type || ''} — ${d.partName || d.partNo || ''}`,
    Origin: czOrigin(d.source),
    PartId: p ? p.id : '',
    SupplierId: (n && n.supplierId) || d.supplierId || '',
    DefectType: d.type || '',
    DefectQty: String(qty || ''),
    Description: desc,
    Owner: (n && n.owner) || d.owner || czMe(),
    SevS: sg.SevS,
    ImpI: sg.ImpI,
    Tier: sg.Tier,
    TierReason: sg.TierReason,
    Response: n ? czRespOfNcr(n) : sg.Response,
    ContainScope: ds.map(lotOf).filter(Boolean).length ? 'LOT/납품일 ' + [...new Set(ds.map(lotOf).filter(Boolean))].join(', ') : '',
    Disposition: CZ_OPT.Disposition.includes(d.disposition) ? d.disposition : '미정',
    DefectIds: ds.map((x) => x.id),
    NcrId: n ? n.id : '',
  };
  if (o.Origin === '고객사') o.CustNotify = '필요';
  const rs = [...new Set(ds.map((x) => x.resp || '미정'))],
    st = Math.max(...(ds.length ? ds : [d]).map((x) => stageOf(x.source)));
  if (!o.CauseOccur) {
    const r = ds.map((x) => (x.ica && x.ica.d4) || (x.inv && x.inv.rca)).filter(Boolean)[0];
    if (r) o.CauseOccur = '[불량 기록] ' + r;
  }
  o.RcaScope =
    rs.includes('미정') || rs.includes('공동') || rs.length > 1
      ? '발생+유출'
      : rs[0] === '사내'
        ? st >= 4
          ? '발생+유출'
          : '발생'
        : rs[0] === '협력사'
          ? st >= 2 && (ds.length ? ds : [d]).some(escRca)
            ? '유출'
            : '없음'
          : '';
  return { o, g: sg.g };
}
function czAttach(c, ds, n) {
  ds.forEach((d) => {
    d.caseId = c.id;
    touch(d);
  });
  if (n) {
    n.caseId = c.id;
    touch(n);
  }
  czSyncCase(c);
}
async function czFromDefect(id) {
  const d = db.defects.find((x) => x.id === id);
  if (!d) return;
  if (d.caseId && czById('cases', d.caseId)) return czOpenCase(d.caseId);
  const n = d.ncrId ? db.ncrs.find((x) => x.id === d.ncrId) : null;
  if (n && n.caseId && czById('cases', n.caseId)) {
    const c = czById('cases', n.caseId);
    c.DefectIds = [...new Set([...(c.DefectIds || []), d.id])];
    czAttach(c, [d], null);
    touch(c);
    save();
    return czOpenCase(c.id);
  }
  const ds = n ? (n.defectIds || []).map((i) => db.defects.find((x) => x.id === i)).filter((x) => x && !x.caseId) : [d];
  const { o, g } = czBuildFrom(ds.length ? ds : [d], n);
  if (
    !(await askConfirm({
      title: 'RCA를 요청할까요?',
      msg: '불량 정보로 새 RCA를 만들고 연결합니다. 심각도는 아래처럼 제안했고, 상세 화면에서 바꿀 수 있습니다.',
      items: [
        `불량 ${ds.length || 1}건${n ? ` · ${esc(n.no)} 함께 연결` : ''}`,
        `심각도 ${g}등급 → S ${o.SevS} × I ${o.ImpI} · <b>${o.Tier}</b> · 대응 ${o.Response}`,
      ].concat(o.TierReason ? [esc(o.TierReason)] : []),
      ok: 'RCA 요청',
      danger: false,
    }))
  )
    return;
  const c = czCreateCase(o);
  czAttach(c, ds.length ? ds : [d], n);
  save();
  czOpenCase(c.id);
  toast(`${c.CaseNo} RCA를 요청했습니다.`);
}
async function czFromNcr(id) {
  const n = db.ncrs.find((x) => x.id === id);
  if (!n) return;
  if (n.caseId && czById('cases', n.caseId)) return czOpenCase(n.caseId);
  const ds = (n.defectIds || []).map((i) => db.defects.find((x) => x.id === i)).filter(Boolean);
  const exist = ds.map((d) => d.caseId && czById('cases', d.caseId)).find(Boolean);
  if (exist) {
    exist.NcrId = n.id;
    n.caseId = exist.id;
    touch(n);
    touch(exist);
    save();
    return czOpenCase(exist.id);
  }
  if (!ds.length) {
    toast('연결된 불량이 없는 NCR입니다. NCR에 불량을 먼저 연결하거나 RCA를 직접 등록하세요.');
    return;
  }
  const { o, g } = czBuildFrom(ds, n);
  if (
    !(await askConfirm({
      title: `${n.no}을(를) RCA를 요청할까요?`,
      msg: 'NCR과 연결 불량으로 새 RCA를 만듭니다.',
      items: [
        `불량 ${ds.length}건 · ${sum(ds, 'qty').toLocaleString()}개`,
        `심각도 ${g}등급 → S ${o.SevS} × I ${o.ImpI} · <b>${o.Tier}</b> · 대응 ${o.Response} (요구 회신: ${esc(n.reqType || '8D 보고서')})`,
      ].concat(o.TierReason ? [esc(o.TierReason)] : []),
      ok: 'RCA 요청',
      danger: false,
    }))
  )
    return;
  const c = czCreateCase(o);
  czAttach(c, ds, n);
  save();
  czOpenCase(c.id);
  toast(`${c.CaseNo} RCA를 요청했습니다.`);
}
// NCR 상태가 바뀔 때마다 사건의 공 · 다음 행동 · 재확인일을 맞춤 (수동 수정은 다음 상태 변화까지 유지)
const CZ_NCR_FLOW = {
  미통보: (n) => ['나', '협력사에 NCR 통보 (NCR ' + n.no + ')', today()],
  발행: (n) => ['나', '협력사에 대책 요청 발송 (NCR ' + n.no + ')', today()],
  대책요청: (n) => ['협력사', '협력사 대책서 회신 확인', n.dueDate || addDays(today(), 2)],
  '대책서 검토': (n) => ['나', '협력사 대책서 평가 (NCR ' + n.no + ')', today()],
  보완요청: (n) => ['협력사', '대책서 보완 회신 확인', addDays(today(), 5)],
  '승인(검증대기)': (n) => ['나', '대책 효과(유효성) 검증 — NCR ' + n.no, n.verifyDue || addDays(today(), 14)],
  종결: (n) => ['나', (n.reqType === '단순 통보' && !n.verifyDate ? 'NCR 단순 통보 완료' : 'NCR 유효성 검증 완료') + ' — RCA 단계 마무리', today()],
  '검증 무효': (n) => ['나', '유효성 검증 무효 — 재대책 요구 여부 결정', today()],
};
function czSyncCase(c) {
  let ch = false;
  const set = (k, v) => {
    if (String(c[k] ?? '') !== String(v ?? '')) {
      c[k] = v;
      ch = true;
    }
  };
  // 2) 연결 불량에서 수량 · 처분을 읽어옴 (사건에서 따로 입력하지 않음)
  const ds = (c.DefectIds || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean);
  if (ds.length) {
    set('DefectQty', String(sum(ds, 'qty')));
    const dp = [...new Set(ds.map((d) => d.disposition).filter(Boolean))];
    if (dp.length === 1 && ds.every((d) => d.disposition) && CZ_OPT.Disposition.includes(dp[0])) set('Disposition', dp[0]);
  }
  if (!has(c.RcaScope) && CZ_STAGES.indexOf(c.Stage) > 3) set('RcaScope', c.NcrId ? '없음' : '발생');
  // FAR 발행일 — 연결 불량의 귀책 조사에 FAR 요청일이 있으면 그 값을 씀 (따로 입력하지 않음)
  if (czUseFar(c)) {
    const fs = typeof invFarSrc === 'function' ? invFarSrc(c.DefectIds) : null;
    if (fs) set('FARIssueDate', fs.inv.farReq);
  }
  // 1) 연결 NCR 상태를 사건 흐름에 반영
  const n = czNcr(c);
  if (n && czOpen(c)) {
    const st = ncrStatus(n);
    if (c._ncrSt !== st) {
      c._ncrSt = st;
      ch = true;
      const f = CZ_NCR_FLOW[st];
      if (f && c.Stage !== '종결') {
        const [b, na, rd] = f(n);
        c.Ball = b;
        c.NextAction = na;
        c.RecheckDate = rd;
      }
      if (st === '대책요청' && c.Response === 'FAR' && !has(c.FARIssueDate)) c.FARIssueDate = n.requestDate || '';
    }
    const d4 = String(n.d4 || '').trim();
    if (d4 && ['승인(검증대기)', '종결', '대책서 검토', '보완요청'].includes(st)) {
      const tag = '[NCR 대책서] ';
      if (!has(c.CauseOccur)) set('CauseOccur', tag + d4);
      else if (String(c.CauseOccur).startsWith(tag) && c.CauseOccur !== tag + d4) set('CauseOccur', tag + d4);
    }
    if (farOn(n) && n.far.replyDate && n.far.summary && !has(c.CauseOccur)) set('CauseOccur', '[FAR 분석] ' + n.far.summary);
    if (st === '종결' && n.verifyDate) {
      if (!has(c.VerifyResult) || c.VerifyResult === '미검증') set('VerifyResult', '합격');
      if (!has(c.VerifyEnd) && n.verifyDate) set('VerifyEnd', n.verifyDate);
      if (!has(c.Recurred)) set('Recurred', '없음');
    }
    if (st === '검증 무효' && c.VerifyResult !== '불합격') set('VerifyResult', '불합격');
  }
  if (ch) touch(c);
  return ch;
}
function czSyncAll() {
  let n = 0;
  try {
    if (typeof farSyncAll === 'function') farSyncAll();
  } catch (e) {
    console.error(e);
  }
  try {
    (db.cases || []).forEach((c) => {
      if (czSyncCase(c)) n++;
    });
  } catch (e) {
    console.error(e);
  }
  return n;
}
// RCA로 관리 중인 불량 · NCR (대시보드 · 진행 현황에서 중복 표시하지 않음)
function czOwns(o, kind) {
  if (!o || !db.cases) return false;
  if (o.caseId && czCaseOpenId(o.caseId)) return true;
  if (kind === 'defect' && o.ncrId) {
    const n = db.ncrs.find((x) => x.id === o.ncrId);
    if (n && n.caseId && czCaseOpenId(n.caseId)) return true;
  }
  return false;
}
// NCR 저장 시: 연결 불량이 사건에 묶여 있으면 사건에도 NCR을 연결
function czSyncNcr(n) {
  if (n.caseId && czById('cases', n.caseId)) return;
  const c = (n.defectIds || [])
    .map((i) => db.defects.find((d) => d.id === i))
    .map((d) => d && d.caseId && czById('cases', d.caseId))
    .find(Boolean);
  if (c && !c.NcrId) {
    c.NcrId = n.id;
    n.caseId = c.id;
    delete c._ncrSt;
    touch(c);
  }
}
function czUnlinkDefectAll(id) {
  db.cases.forEach((c) => {
    if ((c.DefectIds || []).includes(id)) {
      c.DefectIds = c.DefectIds.filter((x) => x !== id);
      touch(c);
    }
  });
}
function czUnlinkNcrAll(id) {
  db.cases.forEach((c) => {
    if (c.NcrId === id) {
      c.NcrId = '';
      delete c._ncrSt;
      touch(c);
    }
  });
}
const czCaseBadge = (o) => {
  const c = o.caseId && czById('cases', o.caseId);
  return c
    ? `<a class="bg ${czOpen(c) ? 'inf' : 'ok'}" style="cursor:pointer;font-size:10.5px" onclick="czOpenCase('${c.id}')" title="${esc(c.Title)} · ${esc(c.Stage)}">RCA ${esc(c.CaseNo)}</a>`
    : '';
};
