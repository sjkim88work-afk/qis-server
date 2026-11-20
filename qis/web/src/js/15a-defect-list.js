// ── 불량 — 목록 (조건 · 후속 조치 칸 · 표) ──
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
function ncrCell(d) {
  const n = d.ncrId && db.ncrs.find((x) => x.id === d.ncrId);
  if (n) return `<a class="bg inf" onclick="editNcr('${n.id}')" style="cursor:pointer">${esc(n.no)}</a>`;
  if (invOpen(d))
    return `<a class="bg inf" style="cursor:pointer" onclick="editDefect('${d.id}')" title="귀책 조사 중 — FAR·RCA 후 판정">조사 중</a>`;
  if (d.resp === '사내') return `<span class="bg mut" title="사내 귀책 — 사내 대책으로 처리">사내</span>`;
  if (d.resp === '미정' && d.inv?.verdict === '원인 불명') return `<span class="bg mut">원인 불명</span>`;
  const r = ncrReasons(d);
  return (
    (r.length ? `<span class="bg warn" title="${esc(r.join(' / '))}">권고</span> ` : '') +
    `<button class="b s noprint" onclick="ncrFromDefect('${d.id}')">발행</button>`
  );
}
// 불량 목록의 후속 조치 칸 — 귀책에 맞는 FAR · RCA · NCR 진행 상태 또는 발행 버튼
function actCell(d) {
  const L = [],
    line = (k, h) => L.push(`<div class="act"><span class="ak">${k}</span>${h}</div>`);
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
  } else if (r === '미정' && !done) line('FAR', `<button class="b s noprint" onclick="editInv('${d.id}','inv_farReq')">FAR 요청</button>`);
  // RCA (사내 원인분석)
  if (c)
    line(
      'RCA',
      `<a class="bg inf" onclick="czOpenCase('${c.id}','cause')" title="${esc(c.Title || '')}">${esc(c.CaseNo)}</a> <span class="muted" style="font-size:11.5px">${esc(c.Stage || '')}</span>`,
    );
  else if (
    !done &&
    !(d.ica && (icaStarted(d.ica) || d.ica.doneDate)) &&
    (['사내', '공동', '미정'].includes(r) || (r === '협력사' && stageOf(d.source) >= 2 && d.escJudge !== '샘플링 한계'))
  )
    line(
      'RCA',
      `<button class="b s noprint" onclick="czFromDefect('${d.id}')" title="${
        r === '협력사' ? '수입검사에서 왜 못 걸렀는지 사내 유출 원인 분석' : '사내 원인분석 요청'
      }">${r === '협력사' ? '유출 RCA' : 'RCA 요청'}</button>`,
    );
  // 사내 대책 (RCA가 없을 때)
  if (!c && ['사내', '공동'].includes(r)) {
    const ch = icaChip(d);
    if (ch) line('대책', ch);
    else if (!done) {
      const lv = icaLevel(d);
      line(
        '대책',
        `<button class="b s noprint ${lv !== ICA_NONE ? 'p' : ''}" onclick="editIca('${d.id}')" title="권장 수준: ${esc(lv)}">사내 대책</button>`,
      );
    }
  }
  // NCR (협력사 대책서)
  if (n)
    line(
      'NCR',
      `<a class="bg inf" onclick="editNcr('${n.id}')">${esc(n.no)}</a> <span class="muted" style="font-size:11.5px">${esc(ncrStatus(n))}</span>`,
    );
  else if (['협력사', '공동'].includes(r) && !done) {
    const rs = ncrReasons(d);
    line(
      'NCR',
      `<button class="b s noprint ${rs.length ? 'p' : ''}" onclick="ncrFromDefect('${d.id}')" title="${esc(rs.join(' / ') || '협력사에 대책서 요청')}">NCR 발행</button>`,
    );
  } else if (r === '미정' && !done) line('NCR', '<span class="muted" style="font-size:11.5px">귀책 판정 후</span>');
  return L.join('') || (r === '고객' ? '<span class="bg mut">고객 귀책</span>' : '<span class="muted">-</span>');
}
function defectTable() {
  const ds = filteredDefects();
  const gc = { A: 0, B: 0, C: 0 };
  ds.forEach((d) => gc[sevOf(d).grade]++);
  return `<div class="row" style="margin-bottom:8px"><span>심각도 <span class="bg svA">A ${gc.A}</span> <span class="bg svB">B ${gc.B}</span> <span class="bg svC">C ${gc.C}</span> · </span><span><b>${ds.length.toLocaleString()}</b>건 · 수량 <b>${sum(ds, 'qty').toLocaleString()}</b> · 비용 <b>${won(sum(ds, costTotal))}</b>원</span></div>
  <div class="tw"><table><thead><tr><th>발생일</th><th>발생처</th><th>심각도</th><th>부품</th><th>사진</th><th>차종</th><th>협력사</th><th>유형</th>
    <th class="n">수량</th><th>처리</th><th>귀책</th><th class="n">비용(원)</th>
      <th>후속 조치</th><th>담당</th><th>상태</th><th class="noprint"></th></tr></thead><tbody>
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
            <td>${esc(d.type)}</td><td class="n">${num(d.qty).toLocaleString()}</td><td>${esc(d.disposition)}</td><td>${esc(d.resp)}${
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
              return `<a class="bg lgchip ${n ? 'inf' : 'mut'}" onclick="openLog('${d.id}')" title="${
                n ? esc(l.date + ' ' + l.kind + ': ' + l.text.slice(0, 80)) : '진행 기록 추가'
              }">📝 ${n || '+'}</a>`;
            })()}</td><td class="noprint" style="white-space:nowrap"><button class="b s" onclick="editDefect('${d.id}')">상세</button></td></tr>`,
      )
      .join('') || '<tr><td colspan="16" class="muted" style="text-align:center;padding:30px">조건에 맞는 불량이 없습니다.</td></tr>'
  }
  </tbody></table></div>`;
}
function renderDefect() {
  const f = state.df,
    S = db.settings;
  return `<div class="card noprint"><div class="row">
    <button class="b p" onclick="editDefect()">+ 불량 등록</button>
    <button class="b" onclick="openImport()">엑셀 일괄 등록</button>
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
    <span style="flex:1"></span><button class="b" onclick="exportDefectsCSV()">엑셀 내보내기</button>
  </div></div>
  <div class="card" id="dtab">${defectTable()}</div>`;
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
