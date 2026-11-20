/* ================= 협력사 품질 ================= */
function supStats(from, to) {
  const S = db.settings,
    ds = db.defects.filter((d) => d.date >= from && d.date <= to),
    mf = from.slice(0, 7),
    mt = to.slice(0, 7);
  return db.suppliers
    .map((s) => {
      const my = ds.filter((d) => d.supplierId === s.id),
        sq = my.filter((d) => !d.resp || d.resp === '협력사' || d.resp === '공동');
      const qty = sum(sq, 'qty');
      const rcv = rcvSumRange(s.id, mf, mt);
      const ppm = rcv ? (qty / rcv) * 1e6 : null;
      const ns = db.ncrs.filter((n) => n.supplierId === s.id && n.issueDate >= from && n.issueDate <= to);
      const replied = ns.filter((n) => n.requestDate && n.replyDate);
      const avgReply = replied.length ? replied.reduce((a, n) => a + diffDays(n.requestDate, n.replyDate), 0) / replied.length : null;
      const late = ns.filter((n) => ncrFlags(n).replyLate || (n.replyDate && n.dueDate && n.replyDate > n.dueDate)).length;
      const grade = ppm == null ? '-' : ppm <= S.gradeA ? 'A' : ppm <= S.gradeB ? 'B' : ppm <= S.gradeC ? 'C' : 'D';
      const evs = ns.map(latestEval).filter(Boolean),
        firstEv = ns.map((n) => (n.evals || []).find(evalDone)).filter(Boolean);
      const avgEval = evs.length ? evs.reduce((a, e) => a + evalScore(e), 0) / evs.length : null,
        firstPass = firstEv.length ? firstEv.filter((e) => evalVerdict(e) === '승인').length / firstEv.length : null;
      const nA = sq.filter((d) => sevOf(d).grade === 'A').length;
      const pen = ns.filter((n) => ncrStatus(n) === '종결').reduce((a, n) => a + num(n.penalty), 0),
        escN = ns.filter((n) => ncrRejects(n) >= (num(S.escCount) || 2)).length;
      return {
        s,
        nA,
        pen,
        escN,
        avgEval,
        firstPass,
        nEval: evs.length,
        cnt: sq.length,
        qty,
        rcv,
        ppm,
        ncr: ns.length,
        open: ns.filter((n) => ncrStatus(n) !== '종결').length,
        late,
        avgReply,
        cost: db.defects.filter((d) => d.supplierId === s.id).reduce((a, d) => a + costRange(d, from, to), 0),
        rec: db.defects.filter((d) => d.supplierId === s.id).reduce((a, d) => a + recvRange(d, from, to), 0),
        os: db.defects.filter((d) => d.supplierId === s.id).reduce((a, d) => a + outstanding(d), 0),
        grade,
      };
    })
    .sort((a, b) => b.qty - a.qty || b.cnt - a.cnt || a.s.name.localeCompare(b.s.name, 'ko'));
}
function renderSup() {
  const S = db.settings,
    st = msState.supq.k ? msSort(supStats(state.supFrom, state.supTo), msState.supq, SQ_G) : supStats(state.supFrom, state.supTo);
  const gc = { A: 'ok', B: 'inf', C: 'warn', D: 'bad', '-': 'mut' };
  return `<div class="card noprint"><div class="row">
    <span class="muted">기간</span><input type="date" value="${state.supFrom}" onchange="state.supFrom=this.value;render()"> ~ <input type="date" value="${state.supTo}" onchange="state.supTo=this.value;render()">
    <button class="b p" onclick="openRcvLineImport()">입고 내역 가져오기 (MES 거래명세서)</button><button class="b" onclick="openRcvImport()">월별 입고수량 가져오기</button><button class="b" onclick="editReceipts()">직접 입력·수정</button><button class="b" onclick="editSup()">+ 협력사</button>
    <span style="flex:1"></span><button class="b" onclick="exportSupCSV()">엑셀 내보내기</button></div>
    <div class="help" style="margin-top:8px">불량건수·A등급·PPM은 협력사 귀책·공동 귀책분만 집계합니다 (사내·고객 귀책과 귀책 조사 중·원인 불명 건은 제외). PPM = 불량수량 ÷ 기간 입고수량 × 1,000,000. 등급: A ≤ ${S.gradeA} / B ≤ ${S.gradeB} / C ≤ ${S.gradeC} / D 초과 (설정에서 변경). 입고수량이 없으면 PPM·등급은 '-'로 표시됩니다.</div></div>
  <details class="card" ${state.sqOpen !== false ? 'open' : ''} ontoggle="state.sqOpen=this.open"><summary style="cursor:pointer;font-weight:bold;font-size:14px">협력사별 품질 현황 <span class="muted" style="font-weight:normal;font-size:12px">— ${st.length}개사 · 협력사 이름을 누르면 상세 · 제목 줄을 누르면 정렬</span></summary>
  <div class="tw" style="margin-top:10px"><table><thead>
    <tr>${sth('supq', 'name', '협력사')}${sth('supq', 'items', '주요 품목')}${sth('supq', 'cnt', '불량건수', 'n')}${sth('supq', 'nA', 'A등급', 'n')}${sth('supq', 'qty', '불량수량', 'n')}${sth('supq', 'rcv', '입고수량', 'n')}${sth('supq', 'ppm', 'PPM', 'n')}${sth('supq', 'grade', '등급')}${sth('supq', 'ncr', 'NCR', 'n')}${sth('supq', 'open', '미종결', 'n')}${sth('supq', 'late', '회신지연', 'n')}${sth(
      'supq',
      'avgReply',
      '평균 회신(일)',
      'n',
    )}${sth('supq', 'avgEval', '대책서 평균', 'n', '기간 내 NCR의 최종 대책서 평가 평균')}${sth(
      'supq',
      'firstPass',
      '1차 승인율',
      'n',
      '1차 제출에서 바로 승인된 비율',
    )}${sth('supq', 'escN', '에스컬레이션', 'n', '보완요청·반려·검증 무효가 기준 횟수 이상인 NCR 수')}${sth(
      'supq',
      'pen',
      '감점',
      'n',
      '기간 내 NCR의 협력사 평가 감점 합계',
    )}${sth('supq', 'cost', 'COPQ(원)', 'n')}${sth('supq', 'rec', '회수(원)', 'n')}${sth(
      'supq',
      'os',
      '미회수(원)',
      'n',
      '현재 기준 미회수 잔액',
    )}</tr></thead><tbody>
  ${
    st
      .map(
        (x) =>
          `<tr><td><a class="lk" onclick="supDetail('${x.s.id}')"><b>${esc(x.s.name)}</b></a> <span class="muted">${esc(x.s.code)}</span></td>
            <td>${esc(x.s.items)}</td><td class="n">${x.cnt}</td><td class="n">${
              x.nA ? `<span class="bg bad">${x.nA}</span>` : ''
            }</td><td class="n">${x.qty.toLocaleString()}</td><td class="n">${x.rcv ? x.rcv.toLocaleString() : '-'}</td><td class="n">${
              x.ppm == null ? '-' : Math.round(x.ppm).toLocaleString()
            }</td><td><span class="bg ${gc[x.grade]}">${x.grade}</span></td>
            <td class="n">${x.ncr}</td><td class="n">${x.open || ''}</td><td class="n">${
              x.late ? `<span class="bg bad">${x.late}</span>` : ''
            }</td><td class="n">${x.avgReply == null ? '-' : x.avgReply.toFixed(1)}</td><td class="n">${
              x.avgEval == null
                ? '-'
                : `<span class="bg ${
                    x.avgEval >= db.settings.evalPass ? 'ok' : x.avgEval >= db.settings.evalCond ? 'warn' : 'bad'
                  }">${Math.round(x.avgEval)}점</span>`
            }</td><td class="n">${x.firstPass == null ? '-' : Math.round(x.firstPass * 100) + '%'}</td><td class="n">${
              x.escN ? `<span class="bg bad">${x.escN}</span>` : ''
            }</td><td class="n">${
              x.pen ? `<span class="bg warn">${x.pen}</span>` : ''
            }</td><td class="n">${won(x.cost)}</td><td class="n">${won(x.rec)}</td><td class="n">${
              x.os ? `<span class="bg bad">${won(x.os)}</span>` : ''
            }</td></tr>`,
      )
      .join('') || '<tr><td colspan="19" class="muted" style="text-align:center;padding:30px">협력사를 먼저 등록하세요 (기준정보 탭).</td></tr>'
  }
  </tbody></table></div></details>
  ${rcvOverview()}
  ${rcvLinesCard()}`;
}
function rcvOverview() {
  const y = state.rcvYear || today().slice(0, 4),
    ms = Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`);
  const yrs = [...new Set([today().slice(0, 4), ...db.receipts.map((r) => (r.month || '').slice(0, 4)).filter(Boolean)])].sort().reverse();
  const sups = [...db.suppliers].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const v = rcvSum;
  const colT = ms.map((m) => sups.reduce((a, s) => a + v(s.id, m), 0));
  let rows = sups.map((s) => {
    const row = ms.map((m) => v(s.id, m));
    return { s, row, tot: row.reduce((a, b) => a + b, 0) };
  });
  if (msState.rcvq.k)
    rows = msSort(rows, msState.rcvq, {
      name: (x) => x.s.name || '',
      tot: (x) => x.tot,
      ...Object.fromEntries(ms.map((m, i) => ['m' + (i + 1), (x) => x.row[i] || ''])),
    });
  return `<details class="card" ${state.rcvOpen ? 'open' : ''} ontoggle="state.rcvOpen=this.open"><summary style="cursor:pointer;font-weight:bold;font-size:14px">월별 입고수량 현황 <span class="muted" style="font-weight:normal;font-size:12px">— 가져오기 결과 확인용 · 칸을 누르면 그 달 직접 수정</span></summary>
  <div class="row" style="margin:10px 0"><b>연도</b><select onchange="state.rcvYear=this.value;state.rcvOpen=true;render()">${yrs
    .map((x) => `<option ${x === y ? 'selected' : ''}>${x}</option>`)
    .join('')}</select></div>
  <div class="tw"><table><thead><tr>${sth('rcvq', 'name', '협력사')}${ms
    .map((m, i) => sth('rcvq', 'm' + (i + 1), `${+m.slice(5)}월`, 'n'))
    .join('')}${sth('rcvq', 'tot', '합계', 'n')}</tr></thead><tbody>
  ${
    rows
      .map(({ s, row }) => {
        return `<tr><td style="white-space:nowrap">${esc(s.name)}</td>${row
          .map(
            (q, i) =>
              `<td class="n"><a class="lk" style="color:${q ? 'inherit' : '#c4cad4'}" onclick="editReceipts('${ms[i]}')">${q ? q.toLocaleString() : '-'}</a></td>`,
          )
          .join('')}<td class="n"><b>${row.reduce((a, b) => a + b, 0).toLocaleString()}</b></td></tr>`;
      })
      .join('') || '<tr><td class="muted" colspan="14">협력사가 없습니다.</td></tr>'
  }
  <tr style="background:#f7f8fa;font-weight:bold"><td>합계</td>${colT
    .map((q) => `<td class="n">${q ? q.toLocaleString() : ''}</td>`)
    .join('')}<td class="n">${colT.reduce((a, b) => a + b, 0).toLocaleString()}</td></tr>
  </tbody></table></div></details>`;
}
/* ---- 입고 내역 (MES 거래명세서현황) — 줄 단위: 거래명세서 · 순번 · 입고일자 · 검사번호 · 품번 · 입고량 · 판정 ---- */
const rcvKey = (r) => (r.inspNo ? 'I:' + r.inspNo : 'D:' + (r.docNo || '') + '#' + (r.seq || ''));
const RCV_HEAD =
  '선택\t사업장\t협력사\t거래명세서번호\t순번\t입고일자\t검사번호\t차종\t품번\t품명\t입고량\t단위\t판정\t검사자\t비고\t관리자확인\t확인일자';
const RL_F = [
  ['sup', '협력사', 1],
  ['supCode', '협력사 코드'],
  ['plant', '사업장'],
  ['docNo', '거래명세서번호'],
  ['seq', '순번'],
  ['date', '입고일자', 1],
  ['inspNo', '검사번호'],
  ['model', '차종'],
  ['partNo', '품번', 1],
  ['partName', '품명'],
  ['qty', '입고량', 1],
  ['unit', '단위'],
  ['verdict', '판정'],
  ['inspector', '검사자'],
  ['note', '비고'],
  ['mgrOk', '관리자확인'],
  ['mgrDate', '확인일자'],
];
const RL_T = [
  ['supCode', (c) => /(협력사|업체|거래처|공급사|vendor).*(코드|code)/.test(c)],
  ['docNo', (c) => /거래명세|명세서|전표|invoice|납품서|송장/.test(c)],
  ['inspNo', (c) => /검사번호|검사no|inspno|lot/.test(c)],
  ['inspector', (c) => /검사자|검사원|inspector/.test(c)],
  ['verdict', (c) => /판정|결과|result|judg/.test(c)],
  ['mgrDate', (c) => /확인일/.test(c)],
  ['mgrOk', (c) => /관리자확인|^확인$/.test(c)],
  ['date', (c) => /입고일|납품일|입고일자|^일자$|date/.test(c)],
  ['seq', (c) => /^순번$|^no\.?$|^seq|항번/.test(c)],
  ['plant', (c) => /사업장|공장|plant/.test(c)],
  ['sup', (c) => /협력사|업체|거래처|공급사|vendor|supplier/.test(c)],
  ['model', (c) => /차종|model|vehicle/.test(c)],
  ['partNo', (c) => /^품번$|부품번호|품목코드|자재코드|partno|^part$/.test(c)],
  ['partName', (c) => /품명|부품명|품목명|description/.test(c)],
  ['qty', (c) => /입고량|입고수량|수량|qty|quantity/.test(c)],
  ['unit', (c) => /단위|unit|uom/.test(c)],
  ['note', (c) => /비고|remark|note|메모/.test(c)],
];
let rl = { rows: [], hdr: 0, map: {}, name: '', addSup: false };
const rlCode = (v) =>
  String(v || '')
    .replace(/^\s*[A-Za-z0-9]+\s*:\s*/, '')
    .trim(); // 'G: 합격' → 합격, 'EA: 개별' → 개별
const rlUnit = (v) => {
  const m = String(v || '').match(/^\s*([A-Za-z]+)\s*:/);
  return m ? m[1].toUpperCase() : String(v || '').trim();
};
const rlVerdict = (v) => {
  const t = String(v || '').trim();
  if (!t) return '';
  if (/불합격|reject|^N\b|^B\b|ng/i.test(t)) return '불합격';
  if (/특채|조건부|concession/i.test(t)) return '특채';
  if (/합격|pass|^G\b|ok/i.test(t)) return '합격';
  return rlCode(t);
};
function rlAutoMap(h) {
  const m = {},
    used = new Set(),
    cell = (i) =>
      String(h[i] || '')
        .replace(/\s+/g, '')
        .toLowerCase();
  RL_T.forEach(([k, t]) => {
    for (let i = 0; i < h.length; i++) {
      if (used.has(i)) continue;
      if (t(cell(i))) {
        m[k] = i;
        used.add(i);
        break;
      }
    }
  });
  return m;
}
function openRcvLineImport() {
  rl = { rows: [], hdr: 0, map: {}, name: '', addSup: false };
  openModal(
    '입고 내역 가져오기 (MES 거래명세서현황)',
    `<div class="help">MES <b>거래명세서현황</b>을 엑셀(.xlsx) · CSV로 올리거나, 화면의 표를 복사해 아래 <b>제목행 다음 줄</b>에 붙여넣으세요 (Ctrl+V).<br>
    줄마다 입고일자 · 품번 · 입고량 · 판정을 저장하고, <b>협력사 · 월별 입고수량(PPM 분모)은 이 내역 합계로 자동 계산</b>합니다. 같은 검사번호(없으면 거래명세서번호 + 순번)는 다시 올려도 한 번만 들어갑니다.</div>
  <div class="row" style="margin-top:10px"><label class="b p" style="cursor:pointer">파일 선택 (.xlsx / .csv)<input type="file" accept=".xlsx,.csv,.txt" style="display:none" onchange="rlFile(this.files[0]);this.value=''"></label><span id="rlSheet"></span>
    <label class="row" style="flex-direction:row;align-items:center;gap:6px;margin-left:8px"><input type="checkbox" onchange="rl.addSup=this.checked;rlRender()"> 기준정보에 없는 협력사는 새로 추가</label></div>
  <textarea id="rlPaste" style="min-height:120px;margin-top:8px;font-family:Consolas,monospace;font-size:12px;white-space:pre;tab-size:10" oninput="rlSet(parseRows(this.value),'붙여넣기')">${esc(RCV_HEAD)}\n</textarea>
  <div id="rlMap" style="margin-top:10px"></div>`,
    [
      { label: '취소', fn: closeModal },
      { label: '등록', cls: 'p', fn: rlApply },
    ],
  );
  setTimeout(() => {
    const t = $('#rlPaste');
    if (t) {
      t.focus();
      t.setSelectionRange(t.value.length, t.value.length);
    }
  }, 50);
}
function rlFile(f) {
  return sheetFile(f, rl, '#rlSheet', 'rlSet', 'rl');
}
function rlSet(rows, name) {
  rows = (rows || []).map((r) => (r || []).map((c) => String(c ?? '').trim()));
  if (rows.filter((r) => r.some((c) => c)).length < 2) {
    $('#rlMap').innerHTML = '<div class="muted">제목행 아래에 데이터를 붙여넣으세요.</div>';
    return;
  }
  let best = -1,
    bh = 0;
  rows.slice(0, 15).forEach((r, i) => {
    const c = Object.keys(rlAutoMap(r)).length;
    if (c > best) {
      best = c;
      bh = i;
    }
  });
  rl.rows = rows;
  rl.hdr = bh;
  rl.map = rlAutoMap(rows[bh]);
  rl.name = name;
  rlRender();
}
function rlData() {
  const m = rl.map,
    g = (r, k) => (m[k] != null && m[k] >= 0 ? String(r[m[k]] ?? '').trim() : '');
  const out = new Map(),
    skip = { nodate: 0, noqty: 0, nosup: 0 };
  rl.rows.slice(rl.hdr + 1).forEach((r) => {
    if (!r.some((c) => c)) return;
    const pn = g(r, 'partNo');
    if (!pn) return;
    const date = parseDateAny(g(r, 'date'));
    if (!date) {
      skip.nodate++;
      return;
    }
    const qty = numC(g(r, 'qty'));
    if (!(qty > 0)) {
      skip.noqty++;
      return;
    }
    const supTxt = g(r, 'sup'),
      codeTxt = g(r, 'supCode');
    let sp = (codeTxt && supFind(codeTxt)) || (supTxt && (supFind(supTxt) || findSupplier(rlCode(supTxt) || supTxt, ''))) || null;
    if (!sp) {
      const pt = partByNo(pn);
      if (pt && pt.supplierId) sp = supById(pt.supplierId);
    }
    const o = {
      kind: 'line',
      supplierId: sp ? sp.id : '',
      _sup: sp ? '' : rlCode(supTxt) || supTxt || codeTxt,
      month: date.slice(0, 7),
      date,
      docNo: g(r, 'docNo'),
      seq: g(r, 'seq'),
      inspNo: g(r, 'inspNo'),
      plant: rlCode(g(r, 'plant')) || g(r, 'plant'),
      model: g(r, 'model'),
      partNo: pn,
      partName: g(r, 'partName'),
      qty,
      unit: rlUnit(g(r, 'unit')),
      verdict: rlVerdict(g(r, 'verdict')),
      inspector: g(r, 'inspector'),
      note: g(r, 'note'),
      mgrOk: g(r, 'mgrOk'),
      mgrDate: parseDateAny(g(r, 'mgrDate')) || '',
    };
    if (!sp && !o._sup) {
      skip.nosup++;
      return;
    }
    out.set(rcvKey(o), o);
  });
  const L = [...out.values()];
  L.forEach((o) => {
    const ex = db.receipts.find((x) => isLine(x) && rcvKey(x) === rcvKey(o));
    o._st = ex ? '갱신' : '신규';
    o._ex = ex;
  });
  return { L, skip };
}
function rlRender() {
  const h = rl.rows[rl.hdr] || [],
    { L, skip } = rlData(),
    need = RL_F.filter((f) => f[2] && rl.map[f[0]] == null && !(f[0] === 'sup' && rl.map.supCode != null));
  const noSup = [...new Set(L.filter((o) => !o.supplierId).map((o) => o._sup))],
    nNew = L.filter((o) => o._st === '신규').length;
  const months = [...new Set(L.map((o) => o.month))].sort(),
    ng = L.filter((o) => o.verdict === '불합격').length;
  const cols = RL_F.filter(([f]) => rl.map[f] != null && !['mgrOk', 'mgrDate', 'plant', 'supCode'].includes(f));
  $('#rlMap').innerHTML =
    `<div class="sec">열 연결 확인 <span class="muted" style="font-weight:normal;font-size:12px">${esc(rl.name)} · 제목행 ${rl.hdr + 1}번째 줄 · 틀린 열만 바꾸세요</span></div>
  <div class="fg">${RL_F.map(
    ([k, l, req]) =>
      `<label>${l}${req ? ' *' : ''}<select onchange="if(this.value==='')delete rl.map.${k};else rl.map.${k}=+this.value;rlRender()"><option value="">(없음)</option>${h
        .map((c, i) => `<option value="${i}" ${rl.map[k] === i ? 'selected' : ''}>${esc(c || '열 ' + (i + 1))}</option>`)
        .join('')}</select></label>`,
  ).join('')}</div>
  <div class="${!need.length && L.length ? 'help' : 'banner'}" style="margin-top:8px">${
    need.length
      ? `<b>${need.map((f) => f[1]).join(' · ')}</b> 열을 고르세요.`
      : L.length
        ? `<b>${L.length}</b>줄 — 신규 <b>${nNew}</b> · 갱신 <b>${L.length - nNew}</b> · 대상 월 ${months.map(esc).join(', ')}${
            ng ? ` · <span style="color:var(--bad)">불합격 ${ng}줄</span>` : ''
          }${skip.nodate || skip.noqty ? ` · 날짜 · 수량 없는 ${skip.nodate + skip.noqty}줄 건너뜀` : ''}
    ${
      noSup.length
        ? `<br>⚠ 기준정보에서 찾지 못한 협력사 ${noSup.length}곳: ${noSup.slice(0, 6).map(esc).join(', ')}${noSup.length > 6 ? ' …' : ''} — ${
            rl.addSup
              ? '새로 추가해서 등록합니다.'
              : '이 줄들은 건너뜁니다 (위의 ‘새로 추가’를 체크하거나, 협력사 기준정보에 약어 · 코드를 넣으세요).'
          }`
        : ''
    }
    <br>등록하면 이 협력사 · 월의 입고수량은 입고 내역 합계로 바뀝니다 (직접 입력한 월 합계 대신).`
        : '읽은 줄이 없습니다. 열 연결을 확인하세요.'
  }</div>
  ${
    L.length
      ? `<div class="tw" style="max-height:240px;margin-top:6px"><table class="sm mip"><thead><tr><th>상태</th>${cols
          .map(([, l]) => `<th>${esc(l)}</th>`)
          .join('')}</tr></thead><tbody>${L.slice(0, 12)
          .map(
            (o) =>
              `<tr><td><span class="bg ${o._st === '신규' ? 'ok' : 'inf'}">${o._st}</span></td>${cols
                .map(
                  ([f]) =>
                    `<td>${
                      f === 'sup'
                        ? o.supplierId
                          ? esc(supName(o.supplierId))
                          : `<span style="color:var(--bad)">${esc(o._sup)} ?</span>`
                        : f === 'qty'
                          ? o.qty.toLocaleString()
                          : f === 'verdict'
                            ? `<span class="bg ${
                                o.verdict === '불합격' ? 'bad' : o.verdict === '합격' ? 'ok' : 'mut'
                              }">${esc(o.verdict || '-')}</span>`
                            : esc(o[f])
                    }</td>`,
                )
                .join('')}</tr>`,
          )
          .join(
            '',
          )}</tbody></table></div>${L.length > 12 ? `<div class="muted" style="font-size:12px;margin-top:4px">${L.length}줄 중 12줄 미리보기</div>` : ''}`
      : ''
  }`;
}
async function rlApply() {
  const { L } = rlData();
  if (!L.length) {
    toast('등록할 내역이 없습니다');
    return;
  }
  const snap = await takeSnap();
  let a = 0,
    u = 0,
    ns = 0,
    sk = 0;
  L.forEach((o) => {
    if (!o.supplierId) {
      if (!rl.addSup) {
        sk++;
        return;
      }
      let sp = db.suppliers.find((x) => x.name === o._sup);
      if (!sp) {
        sp = touch({
          id: uid(),
          code: '',
          name: o._sup,
          items: '',
          contact: '',
          phone: '',
          email: '',
          note: '입고 내역 가져오기 때 자동 추가',
          contacts: [],
          contactLog: [],
        });
        db.suppliers.push(sp);
        ns++;
      }
      o.supplierId = sp.id;
    }
    const { _st, _ex, _sup, ...rec } = o;
    if (_ex) {
      Object.assign(_ex, rec);
      touch(_ex);
      u++;
    } else {
      db.receipts.push(touch({ id: uid(), ...rec, src: rl.name }));
      a++;
    }
  });
  save();
  closeModal(true);
  state.rlOpen = true;
  render();
  toast(`입고 내역 신규 ${a} · 갱신 ${u}${ns ? ` · 협력사 ${ns}곳 추가` : ''}${sk ? ` · 협력사 미확인 ${sk}줄 제외` : ''}`);
  offerUndo(snap, `입고 내역 가져오기: 신규 ${a} · 갱신 ${u}`);
}
// 협력사 품질 화면: 입고 내역 목록
function rcvLinesCard() {
  const all = db.receipts.filter(isLine);
  if (!all.length)
    return `<div class="card noprint"><h3>입고 내역 (거래명세서 · 수입검사)</h3>
      <div class="muted">아직 입고 내역이 없습니다. 위의 <b>입고 내역 가져오기 (MES 거래명세서)</b>로 거래명세서현황을 올리면 줄마다 입고 · 판정이 저장되고, 월별 입고수량과 PPM이 자동으로 계산됩니다. 불량 등록 때 입고 건(검사번호)을 골라 연결할 수도 있습니다.</div></div>`;
  const f = state.rl || (state.rl = { m: '', sup: '', v: '', q: '' });
  const months = [...new Set(all.map((r) => r.month))].sort().reverse();
  if (!f.m || (f.m !== 'all' && !months.includes(f.m))) f.m = months[0];
  const w = String(f.q || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const L = all
    .filter(
      (r) =>
        (f.m === 'all' || r.month === f.m) &&
        (!f.sup || r.supplierId === f.sup) &&
        (!f.v || r.verdict === f.v) &&
        (!w.length || w.every((x) => [r.partNo, r.partName, r.docNo, r.inspNo, r.model, supName(r.supplierId)].join(' ').toLowerCase().includes(x))),
    )
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(a.docNo).localeCompare(String(b.docNo)) || (+a.seq || 0) - (+b.seq || 0));
  const sups = [...new Set(all.map((r) => r.supplierId))]
    .map(supById)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const dCnt = new Map();
  db.defects.forEach((d) => {
    if (d.rcvId) dCnt.set(d.rcvId, (dCnt.get(d.rcvId) || 0) + 1);
  });
  const tq = L.reduce((a, r) => a + num(r.qty), 0),
    ng = L.filter((r) => r.verdict === '불합격').length;
  return `<details class="card" ${state.rlOpen !== false ? 'open' : ''} ontoggle="state.rlOpen=this.open"><summary style="cursor:pointer;font-weight:bold;font-size:14px">입고 내역 (거래명세서 · 수입검사) <span class="muted" style="font-weight:normal;font-size:12px">— ${L.length.toLocaleString()}줄 · 입고량 ${tq.toLocaleString()}${
    ng ? ` · <span style="color:var(--bad)">불합격 ${ng}</span>` : ''
  }</span></summary>
  <div class="row" style="margin:10px 0;gap:6px"><select onchange="state.rl.m=this.value;render()"><option value="all" ${f.m === 'all' ? 'selected' : ''}>전체 기간</option>${months
    .map((m) => `<option ${m === f.m ? 'selected' : ''}>${m}</option>`)
    .join('')}</select>
    <select onchange="state.rl.sup=this.value;render()"><option value="">전체 협력사</option>${sups
      .map((s) => `<option value="${s.id}" ${s.id === f.sup ? 'selected' : ''}>${esc(s.name)}</option>`)
      .join('')}</select>
    <select onchange="state.rl.v=this.value;render()"><option value="">전체 판정</option>${['합격', '불합격', '특채']
      .map((v) => `<option ${v === f.v ? 'selected' : ''}>${v}</option>`)
      .join('')}</select>
    <input placeholder="검색 (품번 · 품명 · 거래명세서 · 검사번호 · 차종)" value="${esc(f.q)}" oninput="state.rl.q=this.value;deb(()=>{const y=window.scrollY;render();window.scrollTo(0,y)})" style="flex:1;min-width:200px">
    <button class="b s" onclick="exportRcvLinesCSV()">엑셀</button></div>
  <div class="tw" style="max-height:480px"><table class="mst" style="min-width:1100px">
    <colgroup><col style="width:92px"><col style="width:150px"><col style="width:132px"><col style="width:96px"><col style="width:64px"><col style="width:120px"><col><col style="width:84px"><col style="width:64px"><col style="width:70px"><col style="width:120px"></colgroup>
  <thead><tr><th>입고일자</th><th>협력사</th><th>거래명세서-순번</th><th>검사번호</th><th>차종</th><th>품번</th>
    <th>품명</th><th class="n">입고량</th><th>판정</th><th>검사자</th><th></th></tr></thead><tbody>
  ${
    L.slice(0, 500)
      .map(
        (r) => `<tr${
          r.verdict === '불합격' ? ' style="background:#fdf2f2"' : ''
        }><td class="nw">${esc(r.date)}</td><td class="nw" title="${esc(supName(r.supplierId))}">${esc(supName(r.supplierId))}</td>
          <td class="nw">${esc(r.docNo)}${r.seq ? `-${esc(r.seq)}` : ''}</td>
          <td class="nw">${esc(r.inspNo)}</td><td class="nw">${esc(r.model)}</td>
            <td class="nw"><b>${esc(r.partNo)}</b></td><td>${esc(r.partName)}</td>
    <td class="n">${num(r.qty).toLocaleString()}</td><td><span class="bg ${
      r.verdict === '불합격' ? 'bad' : r.verdict === '합격' ? 'ok' : 'mut'
    }">${esc(r.verdict || '-')}</span></td><td class="nw">${esc(r.inspector)}</td>
    <td class="noprint">${
      dCnt.get(r.id)
        ? `<a class="bg warn" style="cursor:pointer" onclick="state.df={...state.df,q:${jsq(r.partNo)},from:'',to:''};go('defect')">불량 ${dCnt.get(r.id)}</a> `
        : ''
    }<button class="b s ${r.verdict === '불합격' ? 'p' : ''}" onclick="rcvDefect('${r.id}')">불량 등록</button></td></tr>`,
      )
      .join('') || '<tr><td colspan="11" class="muted" style="text-align:center;padding:20px">조건에 맞는 입고 내역이 없습니다.</td></tr>'
  }
  </tbody></table></div>${
    L.length > 500 ? `<div class="muted" style="font-size:12px;margin-top:4px">${L.length}줄 중 500줄 표시 — 기간 · 협력사로 좁히세요.</div>` : ''
  }</details>`;
}
function exportRcvLinesCSV() {
  const L = db.receipts.filter(isLine).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  downloadCSV(`입고내역_${today()}.csv`, [
    [
      '입고일자',
      '협력사 코드',
      '협력사',
      '사업장',
      '거래명세서번호',
      '순번',
      '검사번호',
      '차종',
      '품번',
      '품명',
      '입고량',
      '단위',
      '판정',
      '검사자',
      '비고',
      '관리자확인',
      '확인일자',
    ],
    ...L.map((r) => [
      r.date,
      supById(r.supplierId)?.code || '',
      supName(r.supplierId),
      r.plant,
      r.docNo,
      r.seq,
      r.inspNo,
      r.model,
      r.partNo,
      r.partName,
      r.qty,
      r.unit,
      r.verdict,
      r.inspector,
      r.note,
      r.mgrOk,
      r.mgrDate,
    ]),
  ]);
}
// 입고 건 → 불량 등록 (수입검사 · 협력사 · 품번 · 납품일자 · 검사수량 · 검사번호 연결)
let curRcvId = '';
function rcvDefect(id) {
  const r = db.receipts.find((x) => x.id === id);
  if (!r) return;
  go('defect');
  editDefect();
  setTimeout(() => {
    const f = $('#mf');
    if (!f) return;
    if ([...f.source.options].some((o) => o.value === '수입검사')) {
      f.source.value = '수입검사';
      srcLayout();
    }
    f.date.value = today();
    f.partNo.value = r.partNo;
    onPartNo(r.partNo);
    if (!f.partName.value) f.partName.value = r.partName || '';
    if (r.supplierId) f.supplierId.value = r.supplierId;
    if (r.model && f.model && !f.model.value) f.model.value = r.model;
    rcvPick(id);
    mfDirty = true;
  }, 60);
}
function rcvPick(id) {
  const f = $('#mf'),
    r = db.receipts.find((x) => x.id === id);
  if (!f || !r) return;
  curRcvId = id;
  if (f.delivDate) f.delivDate.value = r.date || '';
  if (f.inspQty && (!f.inspQty.value || curRcvId)) f.inspQty.value = r.qty || '';
  if (r.supplierId && f.supplierId && !f.supplierId.value) f.supplierId.value = r.supplierId;
  mfDirty = true;
  rcvHint();
}
// 불량 입력 창: 같은 품번의 최근 입고 건을 보여 주고 고르면 연결
function rcvHint() {
  const b = $('#rcvBox'),
    f = $('#mf');
  if (!b || !f || !f.partNo) return;
  lbInsp();
  const pn = f.partNo.value.trim(),
    linked = curRcvId && db.receipts.find((x) => x.id === curRcvId);
  const L = pn
    ? db.receipts
        .filter((x) => isLine(x) && x.partNo === pn)
        .sort((a, c) => (c.date || '').localeCompare(a.date || ''))
        .slice(0, 8)
    : [];
  const lab = (r) =>
    `${esc(r.date)} · ${esc(r.docNo)}${r.seq ? '-' + esc(r.seq) : ''}${
      r.inspNo ? ` · 검사 ${esc(r.inspNo)}` : ''
    } · ${num(r.qty).toLocaleString()}${esc(r.unit || '')}${r.verdict ? ` · ${esc(r.verdict)}` : ''}`;
  const hid = `<input type="hidden" name="rcvId" value="${esc(curRcvId || '')}">${
    linked ? `<input type="hidden" name="lot" value="${esc((linked.docNo || '') + (linked.seq ? '-' + linked.seq : ''))}">` : ''
  }`;
  if (linked) {
    b.innerHTML = `${hid}<div class="bomx"><b>🚚 연결된 입고</b> ${lab(linked)} — ${esc(supName(linked.supplierId))} <a class="lk" onclick="curRcvId='';rcvHint();mfDirty=true">연결 해제</a></div>`;
    return;
  }
  if (!L.length) {
    b.innerHTML = hid;
    return;
  }
  const src = f.source ? f.source.value : '';
  b.innerHTML = `${hid}<div class="bomx"><b>🚚 이 품번의 최근 입고</b> <span class="muted">— ${
    src === '수입검사' ? '검사한 입고 건을 고르면' : '관련 입고 건을 고르면'
  } 납품일자 · 입고수량이 채워지고 거래명세서 · 검사번호가 연결됩니다</span>
    <div class="bomc">${L.map((r) => `<span class="bchip" onclick="rcvPick('${r.id}')">${lab(r)}</span>`).join('')}</div></div>`;
}
/* ---- 입고수량 파일 가져오기 ---- */
const RCV_FIELDS = [
  ['sup', '협력사명', ['협력사', '협력사명', '업체', '업체명', '거래처', '거래처명', '공급사', '공급업체', 'vendor', 'supplier']],
  ['code', '협력사코드', ['협력사코드', '업체코드', '거래처코드', '공급사코드', 'vendorcode']],
  ['part', '품번', ['품번', '부품번호', '품목코드', '자재코드', '자재번호', 'partno', 'material']],
  ['date', '입고일자', ['입고일', '입고일자', '일자', '날짜', '전기일', '입고일시', 'date']],
  ['month', '월', ['월', '년월', '입고월', '기준월', '연월', 'month']],
  ['qty', '입고수량', ['입고수량', '수량', '입고량', '입고qty', '합격수량', 'qty', 'quantity']],
];
function rcvAutoMap(h) {
  const map = h.map(() => ''),
    used = new Set();
  h.forEach((x, i) => {
    const n = normH(x);
    if (!n) return;
    const f = RCV_FIELDS.find(([k, , al]) => !used.has(k) && al.some((a) => normH(a) === n));
    if (f) {
      map[i] = f[0];
      used.add(f[0]);
    }
  });
  h.forEach((x, i) => {
    if (map[i]) return;
    const n = normH(x);
    if (!n || parseMonthAny(x, '')) return;
    const f = RCV_FIELDS.find(([k, , al]) => !used.has(k) && al.some((a) => normH(a).length > 1 && n.includes(normH(a))));
    if (f) {
      map[i] = f[0];
      used.add(f[0]);
    }
  });
  if (!used.has('qty') && !used.has('month'))
    h.forEach((x, i) => {
      if (!map[i]) {
        const m = parseMonthAny(x, ri.year);
        if (m) map[i] = 'm:' + m;
      }
    });
  return map;
}
function parseMonthAny(v, year) {
  if (v === '' || v == null) return '';
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) {
      const d = parseDateAny(v);
      return d ? d.slice(0, 7) : '';
    }
    if (v >= 200001 && v <= 209912) return `${String(v).slice(0, 4)}-${String(v).slice(4)}`;
    if (v >= 1 && v <= 12 && year) return `${year}-${pad(v)}`;
    return '';
  }
  const s = String(v).trim();
  let m;
  if ((m = /^(\d{4})\s*[.\-\/년]\s*(\d{1,2})\s*월?$/.exec(s))) return `${m[1]}-${pad(+m[2])}`;
  if ((m = /^(\d{4})(\d{2})$/.exec(s)) && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${m[2]}`;
  if ((m = /^(\d{2})\s*[.\-\/년]\s*(\d{1,2})\s*월?$/.exec(s))) return `20${m[1]}-${pad(+m[2])}`;
  if ((m = /^(\d{1,2})\s*월$/.exec(s)) && year && +m[1] <= 12) return `${year}-${pad(+m[1])}`;
  const d = parseDateAny(s);
  return d ? d.slice(0, 7) : '';
}
const supNorm = (x) =>
  String(x || '')
    .replace(/\s|\(주\)|㈜|주식회사|\(유\)|유한회사/g, '')
    .toLowerCase();
function findSupplier(name, code) {
  if (code) {
    const s = db.suppliers.find((x) => x.code && String(x.code).trim().toLowerCase() === String(code).trim().toLowerCase());
    if (s) return s;
  }
  if (name) {
    const n = supNorm(name);
    return db.suppliers.find((x) => x.name === String(name).trim()) || db.suppliers.find((x) => supNorm(x.name) === n) || null;
  }
  return null;
}
let ri = { rows: [], hdr: 0, map: [], year: today().slice(0, 4) };
function openRcvImport() {
  ri = { rows: [], hdr: 0, map: [], year: today().slice(0, 4), name: '' };
  const yrs = [...new Set([today().slice(0, 4), String(+today().slice(0, 4) - 1)])];
  openModal(
    '월별 입고수량 가져오기',
    `<div class="help">ERP에서 받은 입고 실적 엑셀(.xlsx)·CSV를 올리거나 범위를 복사해 붙여넣으세요. 다음 형식을 자동 인식합니다.<br>
   ① <b>입고 상세</b> (입고일자 · 협력사 또는 품번 · 수량) → 협력사·월별로 자동 합산 &nbsp; ② <b>월 합계</b> (협력사 · 월 · 수량) &nbsp; ③ <b>가로형</b> (협력사 행 × 1월~12월 열)<br>
   협력사명이 없고 품번만 있으면 부품 기준정보의 협력사로 연결합니다.</div>
  <div class="fg" style="margin-top:10px">
    <label>월이 없을 때 적용할 월<input type="month" name="defMonth" value="${lastMonths(today().slice(0, 7), 2)[0]}" onchange="riPreview()"></label>
    <label>‘1월’처럼 연도가 없는 열의 연도<select name="year" onchange="ri.year=this.value;if(ri.rows.length)riSet(ri.rows,ri.name)">${yrs
      .map((y) => `<option>${y}</option>`)
      .join('')}</select></label>
    <label>이미 값이 있는 달<select name="mode" onchange="riPreview()"><option value="replace">파일 값으로 덮어쓰기</option>
      <option value="add">기존 값에 더하기</option></select></label>
    <label class="row" style="flex-direction:row;align-items:center;gap:6px;margin-top:16px"><input type="checkbox" name="addSup" onchange="riPreview()"> 미등록 협력사 자동 추가</label>
  </div>
  <div class="row" style="margin-top:10px"><label class="b p" style="cursor:pointer">파일 선택 (.xlsx / .csv)<input type="file" accept=".xlsx,.csv,.txt" style="display:none" onchange="riFile(this.files[0]);this.value=''"></label>
    <button type="button" class="b" onclick="downloadCSV('입고수량_가져오기_양식.csv',[['협력사','월','입고수량'],['대성정밀','2026-09','12000'],['한일스프링','2026-09','8000']])">양식 내려받기</button><span id="riSheet"></span><span id="riName" class="muted"></span></div>
  <details style="margin-top:8px"><summary class="muted" style="cursor:pointer">또는 엑셀에서 복사해 붙여넣기</summary><textarea id="riPaste" style="min-height:110px;font-family:Consolas,monospace;font-size:12px;margin-top:6px" placeholder="제목행 포함해서 Ctrl+V"></textarea><button type="button" class="b s" onclick="riSet(parseCSV($('#riPaste').value),'붙여넣기')">붙여넣은 내용 읽기</button></details>
  <div id="riMap"></div><div id="riPrev" style="margin-top:10px"></div>`,
    [
      { label: '취소', fn: closeModal },
      { label: '반영', cls: 'p', fn: riCommit },
    ],
  );
  $('#mfoot .p').disabled = true;
}
function riFile(f) {
  return sheetFile(f, ri, '#riSheet', 'riSet', 'ri');
}
function riSet(rows, name) {
  rows = (rows || []).map((r) => r || []);
  if (rows.filter((r) => r.some((c) => String(c).trim() !== '')).length < 2) {
    toast('제목행과 데이터가 있는 범위를 넣으세요');
    return;
  }
  let best = 0,
    bi = 0;
  rows.slice(0, 15).forEach((r, i) => {
    const c = rcvAutoMap(r).filter(Boolean).length;
    if (c > best) {
      best = c;
      bi = i;
    }
  });
  ri.rows = rows;
  ri.hdr = bi;
  ri.name = name;
  ri.map = rcvAutoMap(rows[bi]);
  $('#riName').textContent = `${name} · 데이터 ${rows.slice(bi + 1).filter((r) => r.some((c) => String(c).trim() !== '')).length}행`;
  riRenderMap();
  riPreview();
}
function riRenderMap() {
  const h = ri.rows[ri.hdr],
    wide = ri.map.some((k) => k.startsWith('m:'));
  $('#riMap').innerHTML = `<div class="sec">열 연결 확인 <span class="muted" style="font-weight:normal;font-size:12px">${
    wide ? '가로형(월별 열)으로 인식했습니다' : '자동 인식 결과 · 틀린 열만 바꾸세요'
  }</span></div>
  <div class="row">${h
    .map((c, i) =>
      String(c).trim() === '' && !ri.map[i]
        ? ''
        : `<label style="display:flex;flex-direction:column;font-size:11px;color:var(--sub);gap:2px">${esc(c) || '(빈 제목)'}<select onchange="ri.map[${i}]=this.value;riPreview()" style="font-size:12px;${ri.map[i] ? '' : 'color:#999'}"><option value="">무시</option>${RCV_FIELDS.map(
            ([k, l]) => `<option value="${k}" ${ri.map[i] === k ? 'selected' : ''}>${l}</option>`,
          ).join('')}${
            ri.map[i].startsWith('m:') ? `<option value="${ri.map[i]}" selected>${ri.map[i].slice(2)} 수량</option>` : ''
          }</select></label>`,
    )
    .join('')}</div>`;
}
function riBuild() {
  const f = $('#mf'),
    defM = f.defMonth.value,
    map = ri.map,
    agg = new Map(),
    bad = [];
  let used = 0;
  const hasSup = map.includes('sup') || map.includes('code'),
    hasPart = map.includes('part'),
    wide = map.some((k) => k.startsWith('m:'));
  ri.rows.slice(ri.hdr + 1).forEach((r, ix) => {
    if (!r.some((c) => String(c).trim() !== '')) return;
    const g = (k) => {
      const i = map.indexOf(k);
      return i < 0 ? '' : r[i];
    };
    let sp = findSupplier(g('sup'), g('code')),
      label = String(g('sup') || g('code') || '').trim();
    if (!sp && !label && hasPart) {
      const pt = partByNo(String(g('part')).trim());
      if (pt && pt.supplierId) sp = supById(pt.supplierId);
      label = sp ? sp.name : `품번 ${g('part')}`;
    }
    if (!label && !sp) return;
    const add = (m, q) => {
      if (!m || !(q > 0)) return;
      const key = (sp ? sp.id : '?' + label) + '|' + m;
      const o = agg.get(key) || { sp, label: sp ? sp.name : label, m, qty: 0, rows: 0 };
      o.qty += q;
      o.rows++;
      agg.set(key, o);
      used++;
    };
    if (wide)
      map.forEach((k, i) => {
        if (k.startsWith('m:')) add(k.slice(2), numC(r[i]));
      });
    else {
      const q = numC(g('qty'));
      const m = map.includes('month')
        ? parseMonthAny(g('month'), ri.year)
        : map.includes('date')
          ? (parseDateAny(g('date')) || '').slice(0, 7)
          : defM;
      if (!m) {
        bad.push(ix + ri.hdr + 2);
        return;
      }
      add(m, q);
    }
  });
  return { list: [...agg.values()].sort((a, b) => a.label.localeCompare(b.label, 'ko') || a.m.localeCompare(b.m)), bad, used, hasSup, hasPart };
}
function riPreview() {
  if (!ri.rows.length) return;
  const f = $('#mf'),
    mode = f.mode.value,
    addSup = f.addSup.checked;
  const map = ri.map,
    wide = map.some((k) => k.startsWith('m:'));
  if (!wide && !map.includes('qty')) {
    $('#riPrev').innerHTML = '<div class="banner">입고수량 열을 지정하세요.</div>';
    $('#mfoot .p').disabled = true;
    return;
  }
  if (!(map.includes('sup') || map.includes('code') || map.includes('part'))) {
    $('#riPrev').innerHTML = '<div class="banner">협력사명·협력사코드·품번 중 하나의 열을 지정하세요.</div>';
    $('#mfoot .p').disabled = true;
    return;
  }
  const B = riBuild();
  ri.built = B;
  const cur = rcvSum;
  let nNew = 0,
    nChg = 0,
    nSame = 0,
    nSkip = 0,
    nLine = 0;
  const rowsH = B.list
    .map((o) => {
      let st, cls, after;
      if (!o.sp) {
        if (addSup) {
          st = '협력사 추가';
          cls = 'inf';
          after = o.qty;
          nNew++;
        } else {
          st = '미등록 — 제외';
          cls = 'bad';
          after = '';
          nSkip++;
        }
      } else if (rcvHasLines(o.sp.id, o.m)) {
        st = '입고 내역 있음 — 제외';
        cls = 'mut';
        after = cur(o.sp.id, o.m);
        nLine++;
      } else {
        const c = cur(o.sp.id, o.m);
        after = mode === 'add' ? c + o.qty : o.qty;
        if (!c) {
          st = '신규';
          cls = 'ok';
          nNew++;
        } else if (after === c) {
          st = '동일';
          cls = 'mut';
          nSame++;
        } else {
          st = '변경';
          cls = 'warn';
          nChg++;
        }
      }
      o.after = after;
      o.st = st;
      return `<tr style="${st.includes('제외') ? 'opacity:.55' : ''}"><td>${esc(o.label)}</td><td>${o.m}</td><td class="n">${o.qty.toLocaleString()}${
        o.rows > 1 ? ` <span class="muted" style="font-size:11px">(${o.rows}행 합산)</span>` : ''
      }</td><td class="n">${o.sp ? cur(o.sp.id, o.m).toLocaleString() : '-'}</td><td class="n"><b>${
        after === '' ? '-' : after.toLocaleString()
      }</b></td><td><span class="bg ${cls}">${st}</span></td></tr>`;
    })
    .join('');
  $('#riPrev').innerHTML =
    `<div class="row" style="margin-bottom:6px"><span class="bg ok">신규 ${nNew}</span><span class="bg warn">변경 ${nChg}</span><span class="bg mut">동일 ${nSame}</span>${
      nLine ? `<span class="bg mut" title="입고 내역(거래명세서)이 있는 달은 내역 합계를 씁니다">입고 내역 있는 달 ${nLine}건 제외</span>` : ''
    }${nSkip ? `<span class="bg bad">미등록 협력사 ${nSkip}건 제외</span>` : ''}${
      B.bad.length
        ? `<span class="bg bad">월 인식 실패 ${B.bad.length}행 (${B.bad.slice(0, 5).join(', ')}${B.bad.length > 5 ? '…' : ''}행)</span>`
        : ''
    }<span class="muted" style="font-size:12px">원본 ${B.used}건 → 협력사·월 ${B.list.length}개</span></div>
  <div class="tw" style="max-height:42vh"><table><thead><tr><th>협력사</th><th>월</th>
    <th class="n">파일 수량</th><th class="n">기존</th><th class="n">반영 후</th><th>구분</th></tr></thead><tbody>${
      rowsH || '<tr><td colspan="6" class="muted">반영할 데이터가 없습니다.</td></tr>'
    }</tbody></table></div>`;
  const n = nNew + nChg;
  const b = $('#mfoot .p');
  b.disabled = !n;
  b.textContent = n ? `${n}건 반영` : '반영';
}
async function riCommit() {
  const B = ri.built;
  if (!B) return;
  const f = $('#mf'),
    mode = f.mode.value,
    addSup = f.addSup.checked;
  const todo = B.list.filter((o) => (o.sp || addSup) && o.st !== '동일' && !o.st.includes('제외'));
  if (mode === 'replace') {
    const chg = todo.filter((o) => o.st === '변경');
    if (
      chg.length &&
      !(await askConfirm({
        title: `${chg.length}개 월 값을 덮어쓸까요?`,
        items: chg
          .slice(0, 8)
          .map(
            (o) =>
              `${esc(o.label)} ${o.m}: ${db.receipts
                .filter((r) => r.supplierId === o.sp.id && r.month === o.m)
                .reduce((a, r) => a + num(r.qty), 0)
                .toLocaleString()} → ${o.after.toLocaleString()}`,
          )
          .concat(chg.length > 8 ? [`외 ${chg.length - 8}건`] : []),
        ok: '덮어쓰기',
        danger: false,
      }))
    )
      return;
  }
  const snap = await takeSnap();
  let nSup = 0;
  todo.forEach((o) => {
    let sp = o.sp;
    if (!sp) {
      sp = db.suppliers.find((x) => x.name === o.label);
      if (!sp) {
        sp = touch({
          id: uid(),
          code: '',
          name: o.label,
          items: '',
          contact: '',
          phone: '',
          email: '',
          note: '입고수량 가져오기 시 자동 추가',
          contacts: [],
          contactLog: [],
        });
        db.suppliers.push(sp);
        nSup++;
      }
    }
    if (rcvHasLines(sp.id, o.m)) return; // 입고 내역이 있는 달은 내역 합계를 씀
    const ex = db.receipts.filter((r) => !isLine(r) && r.supplierId === sp.id && r.month === o.m);
    const base = mode === 'add' ? ex.reduce((a, r) => a + num(r.qty), 0) : 0;
    ex.slice(1).forEach((r) => removeRec('receipts', r.id));
    let r = ex[0];
    if (!r) {
      r = { id: uid(), supplierId: sp.id, month: o.m };
      db.receipts.push(r);
    }
    r.qty = base + o.qty;
    r.src = ri.name;
    touch(r);
  });
  save();
  closeModal(true);
  state.rcvOpen = true;
  render();
  offerUndo(snap, `입고수량 ${todo.length}건 반영${nSup ? ` · 협력사 ${nSup}곳 추가` : ''}`);
}
function contactTable(s, withInactive) {
  ensureContacts(s);
  const L = s.contacts
    .filter((c) => withInactive || c.active !== false)
    .sort((a, b) => b.primary - a.primary || (a.active === false) - (b.active === false));
  if (!L.length) return '<div class="muted" style="margin:6px 0">등록된 연락처 없음</div>';
  return `<div class="tw" style="max-height:none;margin-top:8px"><table><thead><tr><th>역할</th>
    <th>이름</th><th>부서/직급</th><th>전화</th><th>휴대폰</th><th>이메일</th><th>비고</th></tr></thead><tbody>${L.map(
      (c) =>
        `<tr style="${c.active === false ? 'opacity:.55' : ''}"><td>${c.primary ? '★ ' : ''}${esc(c.role)}</td><td><b>${esc(c.name)}</b>${
          c.active === false ? ` <span class="bg mut">${esc(c.until)} 종료</span>` : ''
        }</td><td>${esc(c.dept)}</td><td>${telLink(c.phone)}</td>
        <td>${telLink(c.mobile)}</td><td>${mailLink(c.email)}</td><td>${esc(c.note)}</td></tr>`,
    ).join('')}</tbody></table></div>`;
}
function contactCard(id) {
  const s = supById(id);
  ensureContacts(s);
  const log = [...s.contactLog].sort((a, b) => (b.ts || b.at || '').localeCompare(a.ts || a.at || '')).slice(0, 30);
  openModal(
    `${s.name} 연락처`,
    `${contactTable(s, true)}<div class="sec">최근 변경 이력</div>${
      log.length
        ? `<ul class="act">${log
            .map(
              (l) =>
                `<li><span class="muted">${esc(l.at)}</span> ${esc(l.text)}${l.reason ? ` <span class="muted">— ${esc(l.reason)}</span>` : ''}</li>`,
            )
            .join('')}</ul>`
        : '<div class="muted">이력 없음</div>'
    }`,
    [
      { label: '수정', fn: () => editSup(id) },
      { label: '닫기', cls: 'p', fn: closeModal },
    ],
  );
}
function exportContactsCSV() {
  const rows = [
    [
      '협력사',
      '코드',
      '약어',
      '국가',
      '국내외',
      '주소',
      '품목',
      '주담당',
      '역할',
      '이름',
      '부서/직급',
      '전화',
      '휴대폰',
      '이메일',
      '비고',
      '상태',
      '시작일',
      '종료일',
    ],
  ];
  [...db.suppliers]
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .forEach((s) => {
      ensureContacts(s);
      s.contacts.forEach((c) =>
        rows.push([
          s.name,
          s.code,
          s.short || '',
          s.country || '',
          s.region || '',
          s.address || '',
          s.items,
          c.primary && c.active !== false ? '★' : '',
          c.role,
          c.name,
          c.dept,
          c.phone,
          c.mobile,
          c.email,
          c.note,
          c.active === false ? '종료' : '재직',
          c.since,
          c.until,
        ]),
      );
    });
  downloadCSV(`협력사_연락망_${today()}.csv`, rows);
}
function supDetail(id) {
  const s = supById(id),
    from = state.supFrom,
    to = state.supTo;
  const ds = db.defects.filter((d) => d.supplierId === id && d.date >= from && d.date <= to).sort((a, b) => b.date.localeCompare(a.date));
  const tm = {};
  ds.forEach((d) => (tm[d.type || '(미지정)'] = (tm[d.type || '(미지정)'] || 0) + num(d.qty)));
  const ms = lastMonths(to.slice(0, 7), 12);
  const ns = db.ncrs.filter((n) => n.supplierId === id).sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
  const body = `<div class="help">${esc(s.code)} · ${esc(s.items)}</div>${contactTable(s, false)}
  <div class="grid g2" style="margin-top:10px"><div>${pareto(tm, '개')}</div><div>${barChart(
    ms.map((x) => x.slice(2).replace('-', '.')),
    [
      {
        name: '불량수량',
        values: ms.map((m) =>
          sum(
            db.defects.filter((d) => d.supplierId === id && (d.date || '').startsWith(m)),
            'qty',
          ),
        ),
        color: '#007A78',
      },
    ],
  )}</div></div>
  <div class="sec">불량 이력 (${from} ~ ${to}, ${ds.length}건)</div>
  <div class="tw" style="max-height:260px"><table><thead><tr><th>발생일</th><th>부품</th>
    <th>유형</th><th class="n">수량</th><th>처리</th><th>NCR</th></tr></thead><tbody>${ds
      .map(
        (d) =>
          `<tr><td>${d.date}</td><td>${esc(d.partNo)} ${esc(d.partName)}</td>
          <td>${esc(d.type)}</td><td class="n">${num(d.qty)}</td><td>${esc(d.disposition)}</td><td>${esc(
            db.ncrs.find((n) => n.id === d.ncrId)?.no || '',
          )}</td></tr>`,
      )
      .join('')}</tbody></table></div>
  <div class="sec">NCR 이력 (전체 ${ns.length}건)</div>
  <div class="tw" style="max-height:220px"><table><tbody>${ns
    .map((n) => `<tr><td>${esc(n.no)}</td><td>${esc(n.issueDate)}</td><td>${esc(n.title)}</td><td>${stB(ncrStatus(n))}</td></tr>`)
    .join('')}</tbody></table></div>`;
  openModal(`${s.name} 품질 이력`, body, [
    { label: '협력사 정보 수정', fn: () => editSup(id) },
    { label: '닫기', cls: 'p', fn: closeModal },
  ]);
}
async function rcvMonth(el) {
  const changed = [...document.querySelectorAll('#mf input[name^="r_"]')].some((i) => i.value !== i.defaultValue);
  if (
    changed &&
    !(await askConfirm({
      title: '입력한 수량을 저장하지 않고 월을 바꿀까요?',
      msg: `${esc(el.dataset.prev)} 에 입력한 수량은 사라집니다. 먼저 저장하려면 취소 후 ‘저장’을 누르세요.`,
      ok: '월 변경',
      danger: false,
    }))
  ) {
    el.value = el.dataset.prev;
    return;
  }
  mfDirty = false;
  editReceipts(el.value);
}
function editReceipts(month) {
  month = month || lastMonths(today().slice(0, 7), 2)[0];
  const sups = [...db.suppliers].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const body = `<div class="row" style="margin-bottom:10px"><b>대상월</b><input type="month" name="month" value="${month}" data-prev="${month}" onchange="rcvMonth(this)"><span class="help">ERP 입고실적을 월별로 입력하면 PPM이 계산됩니다.</span></div>
  <div class="tw" style="max-height:50vh"><table><thead><tr><th>협력사</th><th>품목</th><th class="n">입고수량</th></tr></thead><tbody>
  ${
    sups
      .map((s) => {
        const r = db.receipts.find((r) => !isLine(r) && r.supplierId === s.id && r.month === month);
        if (rcvHasLines(s.id, month))
          return `<tr><td>${esc(s.name)}</td><td class="muted">${esc(s.items)}</td>
            <td class="n" title="입고 내역(거래명세서)으로 계산 — 협력사 품질 탭의 입고 내역에서 확인">${rcvSum(s.id, month).toLocaleString()} <span class="bg inf">내역</span></td></tr>`;
        return `<tr><td>${esc(s.name)}</td><td class="muted">${esc(s.items)}</td>
          <td class="n"><input type="number" min="0" name="r_${s.id}" value="${r ? r.qty : ''}" style="width:140px;text-align:right"></td></tr>`;
      })
      .join('') || '<tr><td class="muted">협력사가 없습니다.</td></tr>'
  }
  </tbody></table></div>`;
  openModal('월별 입고수량', body, [
    { label: '취소', fn: closeModal },
    {
      label: '저장',
      cls: 'p',
      fn: async () => {
        const o = gather(),
          m = o.month;
        if (!m) {
          toast('대상월을 선택하세요');
          return;
        }
        const cleared = sups.filter(
          (s) =>
            !rcvHasLines(s.id, m) &&
            (o['r_' + s.id] === '' || o['r_' + s.id] == null) &&
            db.receipts.some((r) => !isLine(r) && r.supplierId === s.id && r.month === m),
        );
        if (
          cleared.length &&
          !(await askConfirm({
            title: '입고수량을 삭제할까요?',
            msg: `${esc(m)} 입고수량 칸을 비운 협력사가 있습니다.`,
            items: cleared.map(
              (s) => `${esc(s.name)} — 기존 ${num(db.receipts.find((r) => r.supplierId === s.id && r.month === m).qty).toLocaleString()}개`,
            ),
            note: '삭제하면 해당 월 PPM 계산에서 빠집니다.',
          }))
        )
          return;
        sups.forEach((s) => {
          if (rcvHasLines(s.id, m)) return;
          const v = o['r_' + s.id];
          let r = db.receipts.find((r) => !isLine(r) && r.supplierId === s.id && r.month === m);
          if (v === '' || v == null) {
            if (r) removeRec('receipts', r.id);
            return;
          }
          if (!r) {
            r = { id: uid(), supplierId: s.id, month: m };
            db.receipts.push(r);
          }
          r.qty = num(v);
          touch(r);
        });
        save();
        closeModal(true);
        render();
        toast(`${m} 입고수량 저장됨`);
      },
    },
  ]);
}
function exportSupCSV() {
  const st = supStats(state.supFrom, state.supTo);
  downloadCSV(`협력사품질_${state.supFrom}_${state.supTo}.csv`, [
    [
      '협력사',
      '코드',
      '품목',
      '불량건수',
      '불량수량',
      '입고수량',
      'PPM',
      '등급',
      'NCR',
      '미종결',
      '회신지연',
      '평균회신일',
      '에스컬레이션',
      '감점',
      'COPQ',
      '회수',
    ],
    ...st.map((x) => [
      x.s.name,
      x.s.code,
      x.s.items,
      x.cnt,
      x.qty,
      x.rcv,
      x.ppm == null ? '' : Math.round(x.ppm),
      x.grade,
      x.ncr,
      x.open,
      x.late,
      x.avgReply == null ? '' : x.avgReply.toFixed(1),
      x.escN,
      x.pen,
      Math.round(x.cost),
      x.rec,
    ]),
  ]);
}
