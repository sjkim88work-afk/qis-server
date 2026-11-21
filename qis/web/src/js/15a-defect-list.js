// ── 불량 — 목록 (조건 · 진행 · 다음 할 일 칸 · 표) ──
/* ================= 불량 관리 ================= */
function filteredDefects() {
  const f = state.df,
    q = f.q.toLowerCase();
  return db.defects
    .filter(
      (d) =>
        (!f.from || d.date >= f.from) &&
        (!f.to || d.date <= f.to) &&
        (!f.sup || d.supplierId === f.sup) &&
        (!f.status ||
          (f.status === 'open'
            ? !isDone(d)
            : f.status === 'done'
              ? isDone(d)
              : f.status === 'vwait'
                ? isDone(d) && ['wait', 'late'].includes((d.ncrId ? verifyInfo(db.ncrs.find((n) => n.id === d.ncrId)) : icaVerify(d))?.k)
                : f.status === 'inv'
                  ? invOpen(d)
                  : f.status === 'ica'
                    ? icaNeed(d) && !d.ica?.doneDate
                    : f.status === 'ncrRec'
                      ? !d.ncrId && d.date && diffDays(d.date, today()) <= 90 && ncrReasons(d).length > 0
                      : defStage(d).label === f.status)) &&
        (!f.type || d.type === f.type) &&
        (!f.sev || sevOf(d).grade === f.sev) &&
        (!q ||
          [
            d.partNo,
            d.partName,
            d.fgNo,
            d.fgName,
            d.model,
            d.lot,
            d.delivDate,
            d.desc,
            d.inv?.farResult,
            d.inv?.rca,
            ...(d.logs || []).map((l) => l.text),
            supName(d.supplierId),
            d.owner,
            d.source,
          ]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    )
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
}
// 불량 목록의 ‘진행 · 다음 할 일’ 칸 — 시작한 일은 링크로, 다음 할 일은 버튼 한 개로, 나머지 할 일은 ⋯ 안에
function actCell(d) {
  const L = [],
    T = [],
    line = (k, h) => L.push(`<div class="act"><span class="ak">${k}</span>${h}</div>`),
    todo = (label, on, title, hot) => T.push({ label, on, title, hot });
  const iv = d.inv || {},
    r = d.resp || '협력사',
    done = isDone(d),
    c = defCase(d),
    n = d.ncrId && db.ncrs.find((x) => x.id === d.ncrId);
  {
    const is = d.issueId && issById(d.issueId);
    if (is) line('이슈', `<a class="bg mut" onclick="issOpen('${is.id}')" title="${esc(is.title)}">${esc(is.no)}</a>`);
  }
  // FAR (귀책 조사)
  if (iv.farReq) {
    const ii = invInfo(d);
    line(
      'FAR',
      iv.verdict
        ? `<a class="bg ok" onclick="editInv('${d.id}')">판정 ${esc(iv.verdict)}</a>`
        : `<a class="bg ${ii.cls}" onclick="editInv('${d.id}')">${esc(ii.label.replace('FAR ', ''))}</a>`,
    );
  } else if (r === '미정' && !done) todo('FAR 요청', `editInv('${d.id}','inv_farReq')`, '귀책 조사 요청', true);
  // NCR (협력사 대책서)
  if (n)
    line(
      'NCR',
      `<a class="bg inf" onclick="editNcr('${n.id}')">${esc(n.no)}</a> <span class="muted" style="font-size:12px">${esc(ncrStatus(n))}</span>`,
    );
  else if (['협력사', '공동'].includes(r) && !done) {
    const rs = ncrReasons(d);
    todo('NCR 발행', `ncrFromDefect('${d.id}')`, rs.join(' / ') || '협력사에 대책서 요청', rs.length > 0);
  }
  // 사내 대책 (RCA가 없을 때)
  if (!c && ['사내', '공동'].includes(r)) {
    const ch = icaChip(d);
    if (ch) line('대책', ch);
    else if (!done) {
      const lv = icaLevel(d);
      todo('사내 대책', `editIca('${d.id}')`, '권장 수준: ' + lv, lv !== ICA_NONE);
    }
  }
  // RCA (사내 원인분석)
  if (c)
    line(
      'RCA',
      `<a class="bg inf" onclick="czOpenCase('${c.id}','cause')" title="${esc(c.Title || '')}">${esc(c.CaseNo)}</a> <span class="muted" style="font-size:12px">${esc(c.Stage || '')}</span>`,
    );
  else if (
    !done &&
    !(d.ica && (icaStarted(d.ica) || d.ica.doneDate)) &&
    (['사내', '공동', '미정'].includes(r) || (r === '협력사' && stageOf(d.source) >= 2 && d.escJudge !== '샘플링 한계'))
  )
    todo(
      r === '협력사' ? '유출 RCA' : 'RCA 요청',
      `czFromDefect('${d.id}')`,
      r === '협력사' ? '수입검사에서 왜 못 걸렀는지 사내 유출 원인 분석' : '사내 원인분석 요청',
    );
  // 다음 할 일: 권장(hot) 이 먼저. 한 개만 버튼으로 보이고 나머지는 ⋯ 안에
  T.sort((a, b) => (b.hot ? 1 : 0) - (a.hot ? 1 : 0));
  const btn = (t, cls) => `<button class="b s ${cls}" onclick="${t.on}" title="${esc(t.title || '')}">${t.label}</button>`;
  let next = '';
  if (T.length)
    next = `<div class="act nx noprint">${btn(T[0], 'p')}${
      T.length > 1
        ? `<details class="actm"><summary title="다른 할 일 ${T.length - 1}개" aria-label="다른 할 일 ${T.length - 1}개">${LG_ICO.more}</summary><div class="mn">${T.slice(
            1,
          )
            .map((t) => btn(t, ''))
            .join('')}</div></details>`
        : ''
    }</div>`;
  else if (r === '고객' && !L.length) next = '<span class="bg mut">고객 귀책</span>';
  else next = `<span class="muted actn">${done ? '할 일 없음' : L.length ? '진행 중' : '할 일 없음'}</span>`;
  return L.join('') + next;
}
function defectTable() {
  const ds = filteredDefects();
  const gc = { A: 0, B: 0, C: 0 };
  ds.forEach((d) => gc[sevOf(d).grade]++);
  return `<div class="row plsum" style="margin-bottom:8px"><span>심각도 <span class="bg svA">A ${gc.A}</span> <span class="bg svB">B ${gc.B}</span> <span class="bg svC">C ${gc.C}</span> · </span><span><b>${ds.length.toLocaleString()}</b>건 · 수량 <b>${sum(ds, 'qty').toLocaleString()}</b> · 비용 <b>${won(sum(ds, costTotal))}</b>원</span></div>
  <div class="tw"><table><thead><tr><th>발생일</th><th>발생처</th><th>심각도</th><th>부품</th><th>사진</th><th>차종</th><th>협력사</th><th>유형</th>
    <th class="n">수량</th><th>처리</th><th>귀책</th><th class="n">비용(원)</th>
      <th>진행 · 다음 할 일</th><th>담당</th><th>상태</th><th class="noprint"></th></tr></thead><tbody>
  ${
    ds
      .map(
        (d) =>
          `<tr><td style="white-space:nowrap">${esc(d.date)}</td><td>${esc(d.source)}</td><td>${sevBadge(d)}</td><td>${
            d.partNo || d.partName
              ? `<b>${esc(d.partNo)}</b><br><span class="muted">${esc(d.partName)}</span>`
              : invOpen(d)
                ? '<span class="bg warn">원인 부품 조사 중</span>'
                : '<span class="muted">원인 부품 없음</span>'
          }${
            d.fgNo || d.fgName
              ? `<br><span class="muted" style="font-size:11px" title="발견 품목 (완성품)">▸ 발견: ${esc(d.fgNo || d.fgName)}${d.fgQty ? ` (${num(d.fgQty)})` : ''}</span>`
              : ''
          }</td><td>${photoBadge(d)}</td><td>${esc(d.model)}</td><td>${esc(supName(d.supplierId))}</td>
            <td>${esc(d.type)}</td><td class="n">${num(d.qty).toLocaleString()}</td><td>${esc(d.disposition)}</td><td>${d.resp === '미정' && !isDone(d) ? '<span class="bg warn">미정</span>' : esc(d.resp)}${
              d.resp === '공동' && d.inv && d.inv.share !== '' && d.inv.share != null
                ? `<br><span class="muted" style="font-size:11px">협력사 ${num(d.inv.share)}%</span>`
                : ''
            }</td><td class="n" style="white-space:nowrap">${
              costTotal(d)
                ? `<a class="lk" onclick="openCost('${d.id}')">${won(costTotal(d))}</a>`
                : needCost(d)
                  ? `<a class="bg warn" style="cursor:pointer" onclick="openCost('${d.id}')">입력</a>`
                  : `<a class="lk muted" onclick="openCost('${d.id}')">0</a>`
            }${
              claimStatus(d) ? `<br><span class="bg ${CLAIM_CLS[claimStatus(d)]}" style="font-size:11px">${claimStatus(d)}</span>` : ''
            }</td><td class="actc">${actCell(d)}</td><td>${esc(d.owner)}</td><td class="stc">${stageBadges(d)}<br>${(() => {
              const n = (d.logs || []).length,
                l = lastLog(d);
              return `<button type="button" class="lgchip ${n ? 'on' : ''}" onclick="openLog('${d.id}')" title="${
                n ? esc(l.date + ' ' + l.kind + ': ' + l.text.slice(0, 80)) : '진행 기록 추가'
              }">${LG_ICO.note}기록 ${n || '+'}</button>`;
            })()}</td><td class="noprint" style="white-space:nowrap"><button class="b s" onclick="editDefect('${d.id}')">상세</button></td></tr>`,
      )
      .join('') || '<tr><td colspan="16" class="muted" style="text-align:center;padding:30px">조건에 맞는 불량이 없습니다.</td></tr>'
  }
  </tbody></table></div>`;
}
function renderDefect() {
  const f = state.df,
    S = db.settings;
  return `<div class="pl"><div class="card noprint pltool"><div class="row">
    <button class="b p" onclick="editDefect()">+ 불량 등록</button>
    <span class="muted">기간</span><input type="date" value="${f.from}" onchange="state.df.from=this.value;refreshDT()"> ~ <input type="date" value="${f.to}" onchange="state.df.to=this.value;refreshDT()">
    <select onchange="state.df.sup=this.value;refreshDT()">${supOpts(f.sup, '전체 협력사')}</select>
    <select onchange="state.df.type=this.value;refreshDT()"><option value="">전체 유형</option>${opts(S.defectTypes, f.type)}</select>
    <select onchange="state.df.sev=this.value;refreshDT()"><option value="">전체 심각도</option>${['A', 'B', 'C']
      .map((g) => `<option value="${g}" ${f.sev === g ? 'selected' : ''}>${g} (${RESP[g]})</option>`)
      .join('')}</select>
    <select onchange="state.df.status=this.value;refreshDT()">${[
      ['', '전체 단계'],
      ['open', '미완료 전체'],
      ['처리 대기', '처리 대기'],
      ['inv', '귀책 조사 중 (FAR·RCA)'],
      ['NCR 발행 필요', 'NCR 발행 필요'],
      ['ica', '사내 대책 진행'],
      ['ncrRec', 'NCR 권고 · 미발행 (90일)'],
      ['공동 귀책 — 분담 협의', '공동 귀책 — 분담 협의'],
      ['처리 중', '처리 중'],
      ['대책서 대기', '대책서 대기'],
      ['대책서 검토', '대책서 검토'],
      ['대책서 보완', '대책서 보완'],
      ['done', '완료 전체'],
      ['vwait', '완료 · 검증 대기'],
    ]
      .map(([v, l]) => `<option value="${v}" ${v === f.status ? 'selected' : ''}>${l}</option>`)
      .join('')}</select>
    <input placeholder="검색 (부품·납품일·내용·담당)" value="${esc(f.q)}" oninput="state.df.q=this.value;deb(refreshDT)" style="width:200px">
    <span style="flex:1"></span><details class="tbm"><summary>엑셀</summary><div class="mn"><button type="button" onclick="this.closest('details').open=false;openImport()">엑셀 일괄 등록 <span>여러 건을 한 번에 넣기</span></button><button type="button" onclick="this.closest('details').open=false;exportDefectsCSV()">엑셀 내보내기 <span>지금 보이는 목록</span></button></div></details>
  </div></div>
  <div class="card" id="dtab">${defectTable()}</div></div>`;
}
function refreshDT() {
  const own = !sevMemo;
  if (own) sevMemo = new Map();
  try {
    $('#dtab').innerHTML = defectTable();
  } finally {
    if (own) sevMemo = null;
  }
}

// FAR 창 · 사내 대책 창 위쪽의 불량 요약 상자 (품번 · 심각도 · 발생 내용 · ‘불량 열기’). badge: 심각도 뒤에 붙일 표시 · tail: 둘째 줄 끝에 붙일 글
function defHeadBox(d, badge, tail) {
  return `<div class="route" style="margin-top:0;margin-bottom:6px"><div class="ri"><div class="tx"><b>${esc(d.partNo || d.fgNo || '')} ${esc(d.partName || d.fgName || '')}</b> ${sevBadge(d)}${badge || ''}<br>
    <span class="muted">${esc(d.date)} · ${esc(d.source || '')} · ${esc(d.type || '')} · ${num(d.qty).toLocaleString()}EA${tail || ''}</span>${
      d.desc ? `<br><span style="font-size:13px">${esc(d.desc)}</span>` : ''
    }</div>
    <button type="button" class="b s" onclick="routeGo(&quot;editDefect('${d.id}')&quot;)">불량 열기</button></div></div>`;
}
