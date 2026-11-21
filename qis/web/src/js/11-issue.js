/* ================= 이슈 (이상 발생 → 기록 → 처리 방향 분류) =================
   원인 · 처리 방향이 정해지기 전의 이상 건을 먼저 열고, 발견 · 격리 · 공유 · 인터뷰 · 회의를 기록한 뒤
   불량 등록 · FAR · NCR · RCA · 종결 중 처리 방향을 고름. 일상 불량은 지금처럼 불량 관리에서 바로 등록.
   이슈는 상위 기록 — 후속 건(불량 · NCR · RCA)은 각자 화면에서 진행하고, 여기서는 이어서 보기만 함 */
const ISS_URG = ['긴급', '높음', '보통'],
  ISS_UCLS = { 긴급: 'bad', 높음: 'warn', 보통: 'mut' };
const ISS_KINDS = ['발견', '격리', '공유', '인터뷰', '회의', '조사 · 측정', '기타'];
const ISS_KCLS = {
  발견: 'bad',
  격리: 'ok',
  공유: 'mut',
  인터뷰: 'warn',
  회의: 'inf',
  '조사 · 측정': 'inf',
  분류: 'inf',
  종결: 'ok',
  '다시 열기': 'warn',
  기타: 'mut',
};
// 처리 방향 — 이슈 다음은 불량 등록 · RCA · 종결. FAR 요청과 NCR 발행은 불량 등록 뒤의 단계라 불량의 ‘다음 단계’에서 함
const ISS_ROUTES = [
  {
    k: 'defect',
    l: '불량 등록',
    w: '불량으로 확인됐을 때',
    cta: '불량 등록 창 열기',
    m: [
      '불량 등록 창 — 이슈의 품목 · 수량 · 현상 · 사진 · 격리 내용이 채워짐 (불량 유형 · 귀책 · 처리는 직접)',
      '저장하면 이 이슈의 후속 건으로 연결',
      'FAR 요청 · NCR 발행은 불량을 등록한 뒤 불량의 ‘다음 단계’에서 진행 (귀책 미정 → FAR 요청, 협력사 → NCR 발행)',
    ],
  },
  {
    k: 'rca',
    l: 'RCA 요청',
    w: '사내 원인이거나 큰 건일 때',
    cta: 'RCA 만들기',
    m: ['RCA 1건 — 제목 · 현상 · 격리 내용 · 우선순위 복사, 이슈 기록은 이력에서 볼 수 있음', '불량이 따로 필요하면 ‘불량 등록’도 이어서'],
  },
  { k: 'close', l: '종결', w: '이상 없음 · 관찰만 필요할 때', cta: '이슈 종결', m: ['후속 건 없이 종결 — 사유가 기록에 남음 (다시 열 수 있음)'] },
];
const issById = (id) => (db.issues || []).find((x) => x.id === id);
const nowMin = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
// 일시 표시 — 날짜는 필수, 시간은 선택: 정확한 시각이 없으면 시간대(오전 · 오후 · 야간)나 날짜만 보임
const issAt = (s, band) => {
  const v = String(s || ''),
    d = v.slice(0, 10),
    t = v.slice(11, 16);
  return d + (t ? ' ' + t : band ? ' ' + band : '');
};
const TBANDS = ['오전', '오후', '야간'],
  TBAND_T = { 오전: '09:00', 오후: '15:00', 야간: '22:00' }; // 야간 = 그날 야간조 (저녁 ~ 다음 날 새벽)
// 일시 입력 칸: 날짜 + [시각 입력 | 오전 | 오후 | 야간 | 시간 모름] + 시각
function dtpHTML(id, at, band) {
  const v = String(at || ''),
    d = v.slice(0, 10),
    t = v.slice(11, 16),
    m = t ? '' : TBANDS.includes(band) ? band : '?';
  return `<span class="dtp"><input type="date" id="${id}D" value="${esc(d)}" max="${today()}"><select id="${id}B" onchange="dtpBand('${id}')" title="정확한 시각을 모르면 오전 · 오후 · 야간(그날 야간조)이나 ‘시간 모름’을 고르세요">${[
    ['', '시각 입력'],
    ['오전', '오전'],
    ['오후', '오후'],
    ['야간', '야간'],
    ['?', '시간 모름'],
  ]
    .map(([k, l]) => `<option value="${k}" ${k === m ? 'selected' : ''}>${l}</option>`)
    .join('')}</select><input type="time" id="${id}T" value="${esc(t)}" ${m ? 'style="display:none"' : ''}></span>`;
}
function dtpSync(id) {
  const b = $('#' + id + 'B'),
    t = $('#' + id + 'T');
  if (b && t) t.style.display = b.value ? 'none' : '';
}
function dtpBand(id) {
  const b = $('#' + id + 'B'),
    t = $('#' + id + 'T');
  if (b.value) t.value = '';
  else if (!t.value) t.value = nowMin().slice(11, 16);
  dtpSync(id);
  if (!b.value) t.focus();
  mfDirty = true;
}
function dtpVal(id) {
  const d = ($('#' + id + 'D') || {}).value || '',
    b = ($('#' + id + 'B') || {}).value || '',
    t = b ? '' : ($('#' + id + 'T') || {}).value || '';
  return { at: d ? (t ? d + 'T' + t : d) : '', band: TBANDS.includes(b) ? b : '' };
}
function issLinks(i) {
  const ds = (i.defectIds || []).map((x) => db.defects.find((d) => d.id === x)).filter(Boolean);
  const ns = [...new Set(ds.map((d) => d.ncrId).filter(Boolean))].map((x) => db.ncrs.find((n) => n.id === x)).filter(Boolean);
  const cs = [...new Set([...(i.caseIds || []), ...ds.map((d) => d.caseId).filter(Boolean)])].map((x) => czById('cases', x)).filter(Boolean);
  return { ds, ns, cs, n: ds.length + cs.length };
}
// 상태는 기록 · 연결에서 자동: 접수 → 조사 중 (인터뷰 · 회의 · 조사 기록) → 분류 완료 (후속 건 있음) → 종결
function issStatus(i) {
  if (i.closedAt) return '종결';
  if (issLinks(i).n) return '분류 완료';
  return (i.logs || []).some((l) => !l.void && ['인터뷰', '회의', '조사 · 측정', '기타'].includes(l.kind)) ? '조사 중' : '접수';
}
const ISS_SCLS = { 접수: 'warn', '조사 중': 'warn', '분류 완료': 'inf', 종결: 'ok' };
const issWait = (i) => !i.closedAt && !issLinks(i).n; // 분류 대기 — 처리 방향 미정
const issStale = (i) => issWait(i) && diffDays((i.at || i.createdAt || '').slice(0, 10) || today(), today()) > 2;
const issHot = (i) => !i.closedAt && (i.urg === '긴급' || !!i.special);
const issWaitN = () => (db.issues || []).filter(issWait).length;
// 후속 건이 모두 끝났나 — 불량 완료 · NCR 종결 · RCA 종결/취소
function issOpenFollow(i) {
  const L = issLinks(i);
  return [
    ...L.ds.filter((d) => !isDone(d)).map((d) => `불량 ${defLabel(d)} — ${defStage(d).label}`),
    ...L.ns.filter((n) => ncrStatus(n) !== '종결').map((n) => `${n.no} — ${ncrStatus(n)}`),
    ...L.cs.filter(czOpen).map((c) => `${c.CaseNo} — ${c.Stage}`),
  ];
}
// 이슈에 기록 한 건을 넣음 (등록 · 분류 · 종결 때 프로그램이 씀). x: { at:'YYYY-MM-DD[THH:MM]', band, who }
const ISS_SYS = ['분류', '종결', '다시 열기']; // 프로그램이 남긴 기록 — 수정 · 취소 불가
function issLog(i, kind, text, x) {
  x = x || {};
  const at = String(x.at || nowMin());
  (i.logs = i.logs || []).push({
    id: uid(),
    date: at.slice(0, 10),
    time: at.slice(11, 16),
    band: at.length > 10 ? '' : TBANDS.includes(x.band) ? x.band : '',
    kind,
    party: x.who || '',
    method: '',
    text: String(text || ''),
    result: '',
    photos: [],
    by: czMe(),
    at: now(),
    ...(ISS_SYS.includes(kind) ? { sys: true } : {}),
  });
}
function renderIssue() {
  setTimeout(issSync, 0); // 이슈 상세 창이 열려 있으면 새 내용으로 다시 그림
  const f = (state.isf = state.isf || { status: 'open', src: '', hot: false, q: '' }),
    all = db.issues || [];
  let L = all.slice();
  if (f.status === 'open') L = L.filter((i) => !i.closedAt);
  else if (f.status === 'wait') L = L.filter(issWait);
  else if (f.status === 'closed') L = L.filter((i) => i.closedAt);
  if (f.src) L = L.filter((i) => i.source === f.src);
  if (f.hot) L = L.filter(issHot);
  if (f.q) {
    const q = f.q.toLowerCase();
    L = L.filter((i) => [i.no, i.title, i.desc, i.partNo, i.loc, ...(i.logs || []).map((l) => l.text)].join(' ').toLowerCase().includes(q));
  }
  L.sort((a, b) => !!a.closedAt - !!b.closedAt || (b.at || '').localeCompare(a.at || ''));
  const m = today().slice(0, 7),
    open = all.filter((i) => !i.closedAt),
    wait = all.filter(issWait),
    hot = all.filter(issHot);
  const kpi = (l, v, s, cls, fn) =>
    `<div class="kpi go ${cls}" onclick="${fn}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const out = (i) => {
    const k = issLinks(i);
    return (
      [k.ds.length && `불량 ${k.ds.length}`, k.ns.length && `NCR ${k.ns.length}`, k.cs.length && `RCA ${k.cs.length}`].filter(Boolean).join(' · ') ||
      '<span class="muted">—</span>'
    );
  };
  return `<div class="row noprint" style="margin-bottom:12px;align-items:baseline"><h2 style="margin:0;font-size:22px">이슈</h2><span class="muted" style="font-size:13px">원인 · 처리 방향이 아직 정해지지 않은 이상 건. 일상 불량은 불량 관리에서 바로 등록합니다.</span><span style="flex:1"></span>${
    RO ? '' : '<button class="b p" onclick="editIssue()">+ 이슈 등록</button>'
  }</div>
  <div class="kpis">
    ${kpi(
      '열린 이슈',
      open.length,
      `접수 · 조사 중 ${open.filter(issWait).length} · 분류 완료 ${open.length - open.filter(issWait).length}`,
      open.length ? 'warn' : 'ok',
      "state.isf.status='open';render()",
    )}
    ${kpi(
      '분류 대기 (처리 방향 미정)',
      wait.length,
      `2일 넘은 건 ${wait.filter(issStale).length} — 오늘 챙길 일에 표시`,
      wait.filter(issStale).length ? 'bad' : wait.length ? 'warn' : 'ok',
      "state.isf.status='wait';render()",
    )}
    ${kpi(
      '긴급 · 특별특성',
      hot.length,
      `격리 기록 없음 ${hot.filter((i) => !i.contain).length}`,
      hot.length ? 'bad' : 'ok',
      "state.isf.hot=!state.isf.hot;state.isf.status='open';render()",
    )}
    ${kpi(`${m} 종결`, all.filter((i) => (i.closedAt || '').startsWith(m)).length, '후속 건 이관 · 이상 없음 포함', 'ok', "state.isf.status='closed';render()")}
  </div>
  <div class="card"><div class="row noprint" style="margin-bottom:8px">
    <select onchange="state.isf.status=this.value;render()">${[
      ['open', '열린 이슈'],
      ['wait', '분류 대기'],
      ['', '전체'],
      ['closed', '종결'],
    ]
      .map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`)
      .join('')}</select>
    <select onchange="state.isf.src=this.value;render()"><option value="">발견 위치 전체</option>${opts(db.settings.sources, f.src)}</select>
    <label class="row" style="gap:6px;font-size:13px"><input type="checkbox" ${f.hot ? 'checked' : ''} onchange="state.isf.hot=this.checked;render()"> 긴급 · 특별특성만</label>
    <span style="flex:1"></span><input placeholder="번호 · 제목 · 품목 · 기록 내용" value="${esc(f.q)}" oninput="state.isf.q=this.value;deb(render)" style="width:240px"></div>
  <div class="tw"><table><thead><tr><th>이슈 번호</th><th>제목</th><th>발견</th><th>긴급도</th>
    <th>상태</th><th class="n">기록</th><th>후속 건</th><th>담당</th><th>경과</th></tr></thead><tbody>
  ${
    L.map((i) => {
      const st = issStatus(i),
        age = i.closedAt ? '종결' : diffDays((i.at || '').slice(0, 10) || today(), today()) + '일';
      return `<tr class="${issStale(i) ? 'late' : ''}" style="cursor:pointer" onclick="if(!event.target.closest('a,button,input'))issOpen('${i.id}')">
    <td class="mono"><a class="lk" onclick="issOpen('${i.id}')"><b>${esc(i.no)}</b></a></td>
    <td style="min-width:220px"><b>${esc(i.title)}</b><br><span class="muted" style="font-size:12px">${esc(
      [i.partNo, i.qty ? num(i.qty).toLocaleString() + 'EA' : ''].filter(Boolean).join(' · ') || '품목 미정',
    )}</span></td>
    <td style="white-space:nowrap">${esc(issAt(i.at, i.band).slice(5))}<br><span class="muted" style="font-size:12px">${esc(
      [i.source, i.loc].filter(Boolean).join(' · '),
    )}</span></td>
    <td style="white-space:nowrap"><span class="bg ${ISS_UCLS[i.urg] || 'mut'}">${esc(i.urg || '보통')}</span>${
      i.special ? ' <span class="bg svA">CC/SC</span>' : ''
    }</td>
    <td style="white-space:nowrap"><span class="bg ${ISS_SCLS[st]}">${
      st === '접수' ? '접수 · 분류 대기' : st === '종결' && !issLinks(i).n ? '종결 · 이상 없음' : st
    }</span></td>
    <td class="n">${(i.logs || []).filter((l) => !l.void).length}</td><td>${out(i)}</td><td>${esc(i.owner)}</td><td class="mono">${age}</td></tr>`;
    }).join('') || '<tr><td colspan="9" class="muted" style="text-align:center;padding:28px">조건에 맞는 이슈가 없습니다.</td></tr>'
  }
  </tbody></table></div></div>`;
}
// 이슈 상세 — 불량 · NCR 처럼 창(팝업)으로 엶. 목록은 뒤에 그대로 있음
function issOpen(id) {
  if (!issById(id)) return;
  state.tab = 'issue';
  state.issId = id;
  state.issRoute = state.issRoute || 'defect';
  render();
  issShow(id);
}
function issShow(id, keep) {
  const i = issById(id),
    m = $('#modal');
  if (!i) return;
  // 다시 그릴 때(keep): 쓰던 기록 입력 · 수정 중인 기록 · 스크롤 위치를 지킴 — 기록 부품(tl)의 상태는 그대로 두고 화면만 다시 그림
  const same = !!keep && m.dataset.iss === id && tl.kind === 'issue' && tl.obj && tl.obj.id === id;
  const old = same ? { v: LOG_DRAFT.map((k) => ($('#' + k) ? $('#' + k).value : null)), top: $('#mbody').scrollTop, dirty: mfDirty } : null;
  openModal(`${i.no} 이슈`, issDetailHTML(i), [
    ...(RO
      ? []
      : [
          { label: '삭제', cls: 'd', fn: () => delIssue(id) },
          ...(i.closedAt ? [{ label: '다시 열기', fn: () => issReopen(id) }] : []),
          { label: '수정', fn: () => editIssue(id) },
        ]),
    { label: '닫기', fn: closeModal },
    ...(RO ? [] : [{ label: '저장', cls: 'p', fn: () => issSaveAll(id) }]),
  ]);
  m.dataset.iss = id;
  const ro = RO || !!i.closedAt;
  if (!same) {
    tlInit('issue', i, { ro });
    return;
  }
  tlResync(i, { ro });
  renderLogs(false);
  LOG_DRAFT.forEach((k, n) => {
    if ($('#' + k) && old.v[n] != null) $('#' + k).value = old.v[n];
  });
  dtpSync('lgAt');
  dtpSync('leAt');
  $('#mbody').scrollTop = old.top;
  mfDirty = tl.edit != null || tlDraftHas();
}
// 화면을 다시 그린 뒤: 상세 창이 떠 있으면 갱신, 아무 창도 없으면 '보고 있던 이슈' 표시를 지움
function issSync() {
  const m = $('#modal'),
    on = m.classList.contains('on');
  if (m.dataset.iss) {
    if (!on) {
      delete m.dataset.iss;
      return;
    }
    if (!issById(m.dataset.iss)) {
      closeModal(true);
      return;
    }
    issShow(m.dataset.iss, true);
  } else if (!on) state.issId = null;
}

function editIssue(id) {
  const S = db.settings,
    i = id
      ? { ...issById(id) }
      : { at: nowMin(), source: S.sources.find((x) => /공정/.test(x)) || S.sources[0], urg: '높음', owner: czMe(), special: false, contain: false };
  const body = `<div class="fg">
    <label class="full">무엇이 (제목) *<input name="title" value="${esc(i.title)}" placeholder="예: 도어 래치 스프링 미조립 의심"></label>
    <label class="w2"><span>언제 * <span class="muted" style="font-size:11px">— 날짜는 필수 · 시간은 선택</span></span>${dtpHTML('iat', i.at, i.band)}</label>
    <label>어디서 *<select name="source">${opts(S.sources, i.source)}</select></label>
    <label>세부 위치<input name="loc" value="${esc(i.loc)}" placeholder="예: 조립 2라인"></label>
    <label>담당<input name="owner" list="dlOwners" value="${esc(i.owner)}"></label>
    <label class="full">현상<textarea name="desc" placeholder="확인한 사실 — 무엇이 · 어떻게 · 몇 개">${esc(i.desc)}</textarea></label>
    <label>품목 (추정 · 선택)<input name="partNo" data-combo="parts" autocomplete="off" value="${esc(i.partNo)}" placeholder="품번 · 품명 · 차종 · 협력사로 검색 (모르면 비워 두기)"></label>
    <label>발견 수량 (선택)<input type="number" min="0" name="qty" value="${esc(i.qty)}"></label>
    <label>긴급도 *<select name="urg">${opts(ISS_URG, i.urg)}</select></label>
    <label class="row" style="flex-direction:row;align-items:center;gap:6px;margin-top:16px"><input type="checkbox" name="special" ${i.special ? 'checked' : ''}> 특별특성(CC/SC) 관련</label>
    <label class="row full" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" name="contain" ${i.contain ? 'checked' : ''}> 즉시 조치 (격리 · 보류) 했음</label>
    <label class="full">즉시 조치 내용<input name="containText" value="${esc(i.containText)}" placeholder="예: 2라인 재공 120EA 보류 · 적색라벨, 창고 LOT 홀드"></label>
    ${id ? '' : `<label class="full">공유 대상 <span class="muted">(기록에 ‘공유’로 남음)</span><input name="shareTo" placeholder="예: 생산팀장, 품질팀"></label>`}
  </div>
  <div class="help">모르는 칸은 비워 두세요. 품목 · 귀책 · 불량 유형은 처리 방향을 정할 때 정합니다. 긴급 · 특별특성 건은 즉시 조치 내용을 꼭 남기세요.</div>
  <div class="sec">사진 <span class="muted" style="font-weight:normal;font-size:12px">클릭 · 끌어다 놓기 · Ctrl+V</span></div><div id="photoBox"></div>`;
  openModal(id ? `${i.no} 수정` : '이슈 등록', body, [
    ...(id ? [{ label: '삭제', cls: 'd', fn: () => delIssue(id) }] : []),
    { label: '취소', fn: closeModal },
    ...(id ? [] : [{ label: '저장 (분류는 나중에)', fn: () => saveIssue(null, false) }]),
    { label: id ? '저장' : '저장하고 기록 · 분류로', cls: 'p', fn: () => saveIssue(id, true) },
  ]);
  initPhotoBox(i.photos || []);
}
async function saveIssue(id, open) {
  const f = $('#mf'),
    g = (k) => (f[k] ? String(f[k].value || '').trim() : '');
  const dv = dtpVal('iat'),
    o = {
      title: g('title'),
      source: g('source'),
      loc: g('loc'),
      at: dv.at,
      band: dv.band,
      owner: g('owner'),
      desc: g('desc'),
      partNo: g('partNo'),
      qty: g('qty') === '' ? '' : num(g('qty')),
      urg: g('urg') || '보통',
      special: !!f.special.checked,
      contain: !!f.contain.checked,
      containText: g('containText'),
    };
  if (!o.title) {
    toast('무엇이 (제목)을 입력하세요');
    f.title.focus();
    return;
  }
  if (!o.at) {
    toast('언제(날짜)를 입력하세요');
    $('#iatD').focus();
    return;
  }
  if (o.at.slice(0, 10) > today()) {
    toast('발견 날짜는 오늘 이후일 수 없습니다');
    return;
  }
  if (
    (o.special || o.urg === '긴급') &&
    !o.contain &&
    !(await askConfirm({
      title: '즉시 조치(격리) 없이 저장할까요?',
      msg: '긴급 · 특별특성 건입니다. 재고 · 재공 · 이송 중 물량을 막았는지 확인하세요 (IATF 8.7.1).',
      ok: '그래도 저장',
      danger: false,
    }))
  )
    return;
  let i;
  if (id) {
    i = issById(id);
    if (!i) {
      toast('이 이슈를 찾을 수 없습니다');
      return;
    }
    Object.assign(i, o);
  } else {
    const g2 = genDocNo('iss', o.at.slice(0, 10));
    i = { id: uid(), no: g2.no, ...o, photos: [], logs: [], defectIds: [], caseIds: [], createdAt: now() };
    issLog(i, '발견', [o.desc || o.title, o.qty ? `${num(o.qty).toLocaleString()}EA` : ''].filter(Boolean).join(' · '), { at: o.at, band: o.band });
    if (o.contain) issLog(i, '격리', o.containText || '격리 · 보류함', { at: o.at, band: o.band });
    const sh = g('shareTo');
    if (sh) issLog(i, '공유', `${o.title} — 현상 · 사진 · 즉시 조치 공유`, { who: sh });
    db.issues.push(i);
  }
  try {
    const put = curPhotos
      .filter((p) => p.isNew || p.dirty)
      .map((p) => ({
        id: p.id,
        defectId: i.id,
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
      curRemoved.forEach((x) => db.deleted.push({ id: x, at: now() }));
    }
    i.photos = curPhotos.map((p) => p.id);
    if (put.length || curRemoved.length) photoStr = null;
  } catch (e) {
    toast('사진 저장 실패: ' + e.message);
  }
  if (o.owner && !db.settings.owners.includes(o.owner)) db.settings.owners.push(o.owner);
  touch(i);
  save();
  closeModal(true);
  if (open) issOpen(i.id);
  else {
    state.tab = 'issue';
    render();
    toast(`${i.no} 등록 — 처리 방향은 이슈 화면에서 정합니다`);
  }
}

function issDetailHTML(i) {
  const st = issStatus(i),
    L = issLinks(i),
    r = ISS_ROUTES.find((x) => x.k === state.issRoute) || ISS_ROUTES[0],
    ro = RO || !!i.closedAt;
  setTimeout(() => issPhotos(i), 0);
  const kv = (k, v, s) =>
    `<div><div class="muted" style="font-size:12px">${k}</div><div style="font-weight:600;margin-top:2px">${v}</div>${
      s ? `<div style="font-size:13px">${s}</div>` : ''
    }</div>`;
  const p = partByNo(i.partNo || '');
  const fol = [
    ...L.ds.map(
      (d) =>
        `<a class="isf" onclick="editDefect('${d.id}')"><span class="bg mut">불량</span><span style="flex:1">${esc(d.date)} ${esc(d.source || '')} · ${esc(d.partNo || '품번 미정')} ${num(d.qty).toLocaleString()}EA</span>${sevBadge(d)} <span class="bg ${defStage(d).cls}">${esc(defStage(d).label)}</span></a>`,
    ),
    ...L.ns.map(
      (n) =>
        `<a class="isf" onclick="editNcr('${n.id}')"><span class="bg inf">NCR</span><span style="flex:1">${esc(n.no)} · ${esc(n.reqType || '8D 보고서')}</span>${stB(ncrStatus(n))}${
          n.dueDate && !n.replyDate && n.reqType !== '단순 통보'
            ? ` <span class="bg ${ncrFlags(n).replyLate ? 'bad' : 'warn'}">회신 기한 ${esc(n.dueDate.slice(5))}</span>`
            : ''
        }</a>`,
    ),
    ...L.cs.map(
      (c) =>
        `<a class="isf" onclick="czOpenCase('${c.id}')"><span class="bg warn">RCA</span><span style="flex:1">${esc(c.CaseNo)} · ${esc(c.Title || '')}</span><span class="bg inf">${esc(c.Stage)}</span></a>`,
    ),
  ].join('');
  const of = issOpenFollow(i);
  return `<div class="card">
    <div class="row" style="gap:8px;align-items:center"><span class="mono muted">${esc(i.no)}</span><span class="bg ${ISS_UCLS[i.urg] || 'mut'}">${esc(i.urg || '보통')}</span>${
      i.special ? '<span class="bg svA">CC/SC 특별특성</span>' : ''
    }<span class="bg ${ISS_SCLS[st]}">${st}</span>
      <h2 style="margin:0;font-size:18px">${esc(i.title)}</h2></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-top:14px;font-size:13px">
      ${kv('발견', esc(issAt(i.at, i.band)), esc([i.source, i.loc].filter(Boolean).join(' · ')))}
      ${kv('품목 (추정)', esc(i.partNo || '미정'), p ? esc(`${p.name} · ${supName(p.supplierId) || '협력사 미지정'}`) : '')}
      ${kv('수량', i.qty !== '' && i.qty != null ? num(i.qty).toLocaleString() + ' EA' : '미정', '')}
      ${kv(
        '즉시 조치 (격리)',
        i.contain ? '<span style="color:var(--ok)">했음</span>' : issHot(i) ? '<span style="color:var(--bad)">기록 없음</span>' : '—',
        esc(i.containText || ''),
      )}
      ${kv('담당', esc(i.owner || '-'), '')}
    </div>
    ${i.desc ? `<div style="background:var(--mut);border-radius:6px;padding:10px 12px;margin-top:12px;line-height:1.6">${nl(i.desc)}</div>` : ''}
    <div id="issPh" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"></div>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start">
    <div class="card" style="flex:999 1 520px;min-width:0"><h3 style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><span style="white-space:nowrap">기록</span><span class="muted" style="font-weight:normal;font-size:12px;flex:1 1 200px">발견부터 종결까지 한 일 — 최근 것이 위. 이 이슈에서 만든 불량 · NCR 의 기록도 함께 보입니다</span></h3>
      <div id="logBox"></div>
    </div>
    <div style="flex:1 1 380px;min-width:0;display:flex;flex-direction:column;gap:14px">
      ${
        ro
          ? ''
          : `<div class="card noprint"><h3 style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><span style="white-space:nowrap">처리 방향</span><span class="muted" style="font-weight:normal;font-size:12px;flex:1 1 160px">이슈 내용 · 사진이 넘어갑니다. 여러 번 보낼 수 있습니다. FAR · NCR은 불량 등록 뒤에 합니다</span></h3>
        <div style="display:flex;flex-direction:column;gap:6px">${ISS_ROUTES.map(
          (x) =>
            `<button type="button" class="isr ${x.k === r.k ? 'on' : ''}" aria-pressed="${x.k === r.k}" onclick="state.issRoute='${x.k}';render()"><b>${x.l}</b><span class="muted">${x.w}</span></button>`,
        ).join('')}</div>
        <div class="isprev"><div class="muted" style="font-size:12px;font-weight:600">누르면 만들어지는 것</div><ul>${r.m
          .map((x) => `<li>${esc(x)}</li>`)
          .join('')}</ul>
          ${
            r.k === 'close' && of.length
              ? `<div style="color:var(--warn);font-size:13px">진행 중인 후속 건 ${of.length}건 — 종결해도 후속 건은 각자 계속 진행됩니다</div>`
              : ''
          }
          <button class="b p" style="width:100%;padding:10px" onclick="issRoute('${i.id}','${r.k}')">${r.cta}</button></div></div>`
      }
      <div class="card"><h3>후속 건 <span class="muted" style="font-weight:normal;font-size:12px">이 이슈에서 만든 기록</span></h3>
        ${fol ? `<div style="display:flex;flex-direction:column;gap:6px">${fol}</div>` : '<div class="muted">아직 없습니다 — 처리 방향을 정하면 여기에 이어집니다.</div>'}
        ${
          i.closedAt
            ? `<div class="muted" style="font-size:12px;margin-top:8px">종결 ${esc(i.closedAt)} — ${esc(i.closeReason || '')}</div>`
            : fol
              ? `<div class="muted" style="font-size:12px;margin-top:8px">${
                  of.length ? `진행 중 ${of.length}건 — 모두 끝나면 이슈를 종결하세요` : '후속 건이 모두 끝났습니다 — ‘종결’로 이슈를 닫으세요'
                }</div>`
              : ''
        }</div>
    </div>
  </div>`;
}
async function delIssue(id) {
  const i = issById(id);
  if (!i) return;
  const L = issLinks(i),
    ph = [...(i.photos || []), ...logPhotoIds(i.logs)],
    nl = (i.logs || []).filter((l) => !l.void).length;
  if (
    !(await askConfirm({
      title: `${i.no}을(를) 삭제할까요?`,
      items: [esc(i.title), `기록 ${nl}건${ph.length ? ` · 사진 ${ph.length}장` : ''} 함께 삭제`],
      note: L.n ? `이 이슈에서 만든 후속 건 ${L.n}건(불량 · NCR · RCA)은 지우지 않습니다 — 이슈 연결만 끊깁니다.` : '',
    }))
  )
    return;
  const snap = await takeSnap(ph);
  db.defects.forEach((d) => {
    if (d.issueId === id) {
      delete d.issueId;
      touch(d);
    }
  });
  (db.cases || []).forEach((c) => {
    if (c.IssueId === id) {
      c.IssueId = '';
      touch(c);
    }
  });
  attDrop(ph);
  removeRec('issues', id);
  if ($('#modal').classList.contains('on')) closeModal(true);
  if (state.issId === id) state.issId = null;
  save();
  render();
  offerUndo(snap, `${i.no}을(를) 삭제했습니다`);
}
async function issPhotos(i) {
  const b = $('#issPh');
  if (!b || !(i.photos || []).length) return;
  try {
    const rs = await photoGetMany(i.photos);
    if (!$('#issPh')) return;
    b.innerHTML = rs
      .map(
        (p, k) =>
          `<img src="${p.thumb || p.data}" alt="${esc(p.caption || '이슈 사진')}" title="${esc(p.caption || '')}" style="width:140px;height:100px;object-fit:cover;border-radius:6px;cursor:pointer" onclick="issLb('${i.id}',${k})">`,
      )
      .join('');
  } catch (e) {}
}
async function issLb(id, k) {
  const i = issById(id);
  if (!i) return;
  try {
    const rs = await photoGetMany(i.photos);
    lbOpen(
      rs.map((r) => ({ ...r, caption: `${i.no} · ${r.caption || ''}` })),
      k,
    );
  } catch (e) {}
}
// 상세 창의 ‘저장’ — 쓰던 기록(새 기록 · 수정 중인 기록)이 있으면 저장하고 창을 닫음. ‘닫기’는 저장하지 않음
function issSaveAll(id) {
  if (tl.edit != null) {
    toast('수정 중인 기록을 먼저 저장하거나 취소하세요');
    return;
  }
  if (tlDraftHas() && !addLog()) return;
  mfDirty = false;
  closeModal(true);
  toast('저장했습니다');
}
let issPend = null; // 이슈에서 연 불량 등록 창 — 저장하면 이슈에 연결
async function issRoute(id, k) {
  const i = issById(id);
  if (!i) return;
  const p = partByNo((i.partNo || '').trim()),
    date = (i.at || '').slice(0, 10) || today();
  if (k === 'close') {
    const of = issOpenFollow(i);
    const r = await askConfirm({
      title: `${i.no} 이슈를 종결할까요?`,
      msg: of.length ? `진행 중인 후속 건이 있습니다 — 후속 건은 각자 화면에서 계속 진행됩니다.` : '',
      items: of.map(esc),
      ok: '종결',
      danger: false,
      input: { label: '종결 사유', ph: issLinks(i).n ? '예: 후속 건으로 이관 완료' : '예: 한도견본 이내 · 재발 시 재조사' },
    });
    if (!r) return;
    i.closedAt = today();
    i.closeReason = r;
    issLog(i, '종결', r);
    touch(i);
    save();
    render();
    toast(`${i.no} 종결`);
    return;
  }
  if (k === 'rca') {
    const o = {
      Title: i.title,
      Origin: czOrigin(i.source),
      PartId: p ? p.id : '',
      SupplierId: p ? p.supplierId || '' : '',
      DefectQty: i.qty !== '' && i.qty != null ? String(i.qty) : '',
      Description: [i.desc || i.title, i.containText ? `[즉시 조치] ${i.containText}` : ''].filter(Boolean).join('\n'),
      Owner: i.owner || czMe(),
      Priority: i.urg === '긴급' ? '긴급' : i.urg === '높음' ? '높음' : '보통',
      ContainDate: i.contain ? date : '',
      ContainScope: i.containText || '',
      IssueId: i.id,
      Created: today(),
    };
    if (
      !(await askConfirm({
        title: '이 이슈로 RCA를 만들까요?',
        items: [esc(i.title), `발견 ${esc(i.source || '')} · ${esc(issAt(i.at, i.band))}`, '심각도 S · 영향도 I와 TIER는 RCA 기본 탭에서 정합니다'],
        ok: 'RCA 만들기',
        danger: false,
      }))
    )
      return;
    const c = czCreateCase(o);
    i.caseIds = [...new Set([...(i.caseIds || []), c.id])];
    issLog(i, '분류', `RCA 요청 — ${c.CaseNo}`);
    czLog(c, '연결', `이슈 ${i.no}에서 생성`);
    touch(i);
    save();
    czOpenCase(c.id);
    toast(`${c.CaseNo} RCA를 만들었습니다`);
    return;
  }
  const resp = /수입/.test(i.source || '') ? '협력사' : '미정';
  const preset = {
    date,
    source: i.source || db.settings.sources[0],
    partNo: p ? p.partNo : i.partNo || '',
    partName: p ? p.name : '',
    supplierId: p ? p.supplierId || '' : '',
    model: p ? p.model || '' : '',
    qty: i.qty ?? '',
    desc: [i.title, i.desc].filter(Boolean).join(' — '),
    containment: i.contain ? i.containText || '격리 · 보류함' : '',
    owner: i.owner || czMe(),
    resp,
    sev: { special: !!i.special },
    issueId: i.id,
  };
  issPend = { iid: i.id, route: 'defect' };
  editDefect(null, null, preset);
  if ((i.photos || []).length) {
    try {
      const rs = await photoGetMany(i.photos);
      if ($('#photoBox')) {
        rs.forEach((r) =>
          curPhotos.push({ id: uid(), name: r.name, caption: r.caption || '', data: r.data, thumb: r.thumb, createdAt: now(), isNew: true }),
        );
        renderPhotoBox();
      }
    } catch (e) {}
  }
}
// 불량 저장 직후 — 이슈에서 연 창이면 이슈에 연결. FAR · NCR 은 불량의 다음 단계라 여기서 바로 열지 않고 안내만 함
function issAfterDefect(d) {
  const ip = issPend;
  issPend = null;
  if (!ip) return;
  const i = issById(ip.iid);
  if (!i) return;
  d.issueId = i.id;
  i.defectIds = [...new Set([...(i.defectIds || []), d.id])];
  issLog(i, '분류', `불량 등록 — ${d.partNo || '품번 미정'} ${num(d.qty).toLocaleString()}EA · 귀책 ${d.resp || '-'}`);
  touch(i);
  touch(d);
  save();
  if (invOpen(d)) offerAction(`${i.no} → 불량 등록 완료 · 귀책 미정 — 다음 단계: FAR 요청`, 'FAR 요청', () => editInv(d.id, 'inv_farReq'));
}
async function issReopen(id) {
  const i = issById(id);
  if (!i) return;
  const r = await askConfirm({
    title: `${i.no} 이슈를 다시 열까요?`,
    ok: '다시 열기',
    danger: false,
    input: { label: '다시 여는 사유', ph: '예: 동일 현상 재발' },
  });
  if (!r) return;
  issLog(i, '다시 열기', `${r} (종결 ${i.closedAt} 취소)`);
  i.closedAt = '';
  i.closeReason = '';
  touch(i);
  save();
  render();
}
// 대시보드 '오늘 챙길 일'
function issDashItems() {
  const L = [];
  (db.issues || [])
    .filter((i) => issHot(i) && !i.contain)
    .forEach((i) =>
      L.push(
        `<li><span class="bg bad">격리 확인</span> <a class="lk" onclick="issOpen('${i.id}')">${esc(i.no)} ${esc(i.title)}</a> — ${esc(i.urg)}${i.special ? ' · 특별특성' : ''} 이슈에 즉시 조치(격리) 기록 없음</li>`,
      ),
    );
  (db.issues || [])
    .filter(issStale)
    .forEach((i) =>
      L.push(
        `<li><span class="bg warn">이슈 분류 대기</span> <a class="lk" onclick="issOpen('${i.id}')">${esc(i.no)} ${esc(i.title)}</a> — 발견 ${esc(issAt(i.at).slice(5, 10))} · ${diffDays(
          (i.at || i.createdAt || today()).slice(0, 10),
          today(),
        )}일째 처리 방향 미정</li>`,
      ),
    );
  return L.join('');
}
