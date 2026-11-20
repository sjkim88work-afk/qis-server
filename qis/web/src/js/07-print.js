/* ================= 출력 공통 (새 창 → 막히면 파일로) ================= */
const REPORT_HEAD = `<style>@page{size:A4;margin:11mm}.rbar{position:sticky;top:0;background:#0B4F4D;color:#fff;padding:8px 12px;display:flex;gap:8px;align-items:center;margin:-24px -24px 16px;font-family:'Malgun Gothic',sans-serif;font-size:13px}.rbar button{font:inherit;padding:5px 12px;border-radius:5px;border:0;cursor:pointer}.rbar .pp{background:#fff;color:#0B4F4D;font-weight:bold}@media print{.rbar{display:none}}</style></head>`;
/* 보고서 창의 ‘닫기’ — 프로그램(데스크톱) 창은 window.close() 가 듣지 않아(macOS) 프로그램에 닫기를 요청, 브라우저는 window.close() */
const REPORT_CLOSE =
  'try{var a=window.pywebview&&window.pywebview.api;if(a&&a.close_report){a.close_report()}else{window.close()}}catch(e){window.close()}';
const REPORT_BAR = `<div class="rbar"><span style="flex:1">인쇄 미리보기 — 인쇄 창에서 ‘대상: PDF로 저장’을 고르면 PDF 파일로 저장됩니다.</span><button class="pp" onclick="window.print()">인쇄 / PDF 저장</button><button onclick="${REPORT_CLOSE}">닫기</button></div><script>window.addEventListener('load',function(){setTimeout(function(){try{window.print()}catch(e){}},400)})<\/script>`;
const inFrame = (() => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
})();
function reportWin() {
  let w = null;
  try {
    w = window.open('', '_blank');
  } catch (e) {}
  if (w) {
    try {
      w.document.write('<p style="font-family:sans-serif;padding:20px">보고서 준비 중…</p>');
    } catch (e) {
      w = null;
    }
  }
  return w;
}
/* 보고서 HTML 에 인쇄 설정(REPORT_HEAD)과 위쪽 인쇄 막대(REPORT_BAR)를 끼움 */
function reportFrame(html) {
  return html.replace('</head>', REPORT_HEAD).replace('<body>', '<body>' + REPORT_BAR);
}
function reportShow(w, html, fname) {
  if (w && !w.closed) {
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
      return;
    } catch (e) {}
  }
  download(fname, html, 'text/html;charset=utf-8');
  toast('새 창을 열 수 없어 보고서 파일을 내려받았습니다. 내려받은 파일을 열면 인쇄 창이 뜹니다.');
}
function dashReport() {
  const w = reportWin(),
    S = db.settings,
    m = state.dashMonth,
    pm = lastMonths(m, 2)[0];
  const ds = db.defects.filter((d) => (d.date || '').startsWith(m)),
    pds = db.defects.filter((d) => (d.date || '').startsWith(pm));
  const cost = allCostIn(m),
    pcost = allCostIn(pm),
    rec = allRecvIn(m),
    prec = allRecvIn(pm);
  const nNew = db.ncrs.filter((n) => (n.issueDate || '').startsWith(m)).length,
    pnNew = db.ncrs.filter((n) => (n.issueDate || '').startsWith(pm)).length;
  const nClose = db.ncrs.filter((n) => ncrCloseDate(n).startsWith(m)).length,
    pnClose = db.ncrs.filter((n) => ncrCloseDate(n).startsWith(pm)).length;
  const open = db.ncrs.filter((n) => ncrStatus(n) !== '종결'),
    fl = open.map((n) => ({ n, f: ncrFlags(n) }));
  const replyLate = fl.filter((x) => x.f.replyLate),
    verLate = fl.filter((x) => x.f.verifyLate);
  const recs = db.defects.filter((d) => !d.ncrId && d.date && diffDays(d.date, today()) <= 90 && ncrReasons(d).length);
  const dl = (a, b, f = (v) => v.toLocaleString()) => {
    const d = a - b;
    return d === 0 ? '－' : (d > 0 ? '▲ ' : '▼ ') + f(Math.abs(d));
  };
  const ms = lastMonths(m, 12),
    byM = ms.map((x) => db.defects.filter((d) => (d.date || '').startsWith(x)));
  const supMap = {},
    typeMap = {};
  ds.forEach((d) => {
    const sn = supName(d.supplierId) || '(미지정)';
    supMap[sn] = (supMap[sn] || 0) + num(d.qty);
    typeMap[d.type || '(미지정)'] = (typeMap[d.type || '(미지정)'] || 0) + 1;
  });
  const st = supStats(m + '-01', m + '-31')
    .filter((x) => x.cnt || x.open)
    .slice(0, 10);
  const top = [...ds].sort((a, b) => num(b.qty) - num(a.qty)).slice(0, 10);
  const acts = [
    ...replyLate.map((x) => ['회신 지연', x.n.no, supName(x.n.supplierId), `기한 ${x.n.dueDate}`]),
    ...verLate.map((x) => ['유효성 지연', x.n.no, supName(x.n.supplierId), `기한 ${x.n.verifyDue}`]),
    ...recs.map((d) => ['NCR 권고', `${d.date} ${d.partName || d.partNo}`, supName(d.supplierId), ncrReasons(d).join(', ')]),
  ];
  const lbl = ms.map((x) => x.slice(2).replace('-', '.'));
  const rv = getReview(m) || {};
  const html = reportFrame(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>품질현황보고_${m}</title><style>
  body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:11px;color:#111;margin:24px}
  .hd{display:flex;align-items:center;gap:14px;border-bottom:2.5px solid #0B4F4D;padding-bottom:8px}
  .hd img{max-height:46px;max-width:170px;object-fit:contain}.hd .t{flex:1}.hd h1{font-size:19px;margin:0}.hd .s{color:#555;margin-top:3px}
  table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef1f5;white-space:nowrap}td.n,th.n{text-align:right}
  .sign{width:auto}.sign th{text-align:center;width:62px;font-weight:normal}.sign td{height:42px}
  h2{font-size:13px;margin:16px 0 6px;padding-left:7px;border-left:4px solid #007A78}
  .kp{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px}.kp div{border:1px solid #bbb;border-radius:5px;padding:7px}.kp b{display:block;font-size:17px;margin-top:2px}.kp span{color:#555;font-size:10px}.kp .r b{color:#c0392b}.kp .w b{color:#b7791f}
  .g{display:grid;grid-template-columns:1fr 1fr;gap:8px}.g>div{border:1px solid #ccc;border-radius:5px;padding:6px}.g h3{font-size:11px;margin:0 0 4px}
  svg{width:100%;height:auto;display:block}.sec{break-inside:avoid}.memo td{height:70px;line-height:1.6}@media print{.scr{display:none}}@media screen{.ed{outline:1px dashed #9db4dc;background:#fbfdff}.ed:focus{outline:2px solid #007A78;background:#fff}}
  </style></head><body>
  <div class="hd">${S.logo ? `<img src="${S.logo}">` : ''}<div class="t"><h1>월간 품질 현황 보고 (${m.replace('-', '년 ')}월)</h1>
    <div class="s">${esc(S.company)}${S.dept ? ' · ' + esc(S.dept) : ''} · 출력일 ${today()}</div></div>
  <table class="sign"><tr><th>작성</th><th>검토</th><th>승인</th></tr><tr><td></td><td></td><td></td></tr></table></div>
  <div class="kp">
    <div><span>불량 건수</span><b>${ds.length}</b><span>전월 ${pds.length} / ${dl(ds.length, pds.length)}</span></div>
    <div><span>불량 수량</span><b>${sum(ds, 'qty').toLocaleString()}</b><span>전월 ${sum(pds, 'qty').toLocaleString()} / ${dl(sum(ds, 'qty'), sum(pds, 'qty'))}</span></div>
    <div><span>실패비용(COPQ)</span><b>${won(cost)}원</b><span>회수 ${won(rec)}원 (${cost ? Math.round((rec / cost) * 100) : 0}%)</span></div>
    <div class="${open.length ? 'w' : ''}"><span>미종결 NCR</span><b>${open.length}</b><span>당월 발행 ${nNew} / 종결 ${nClose}</span></div>
    <div class="${replyLate.length ? 'r' : ''}"><span>대책서 회신 지연</span><b>${replyLate.length}</b><span>회신 기한 (8D ${num(S.reply8D) || 7}일 · 간이 ${num(S.replySimple) || 5}일) 기준</span></div>
    <div class="${verLate.length ? 'r' : ''}"><span>유효성 검증 지연</span><b>${verLate.length}</b><span>승인 후 D+${S.verifyDays}</span></div>
    <div class="${recs.length ? 'w' : ''}"><span>NCR 권고 미발행</span><b>${recs.length}</b><span>최근 90일</span></div>
    <div><span>순손실 (COPQ−회수)</span><b>${won(cost - rec)}원</b><span>전월 ${won(pcost - prec)}원</span></div>
  </div>
  <div class="sec"><h2>1. 특이사항 및 검토 의견</h2>
    <div class="scr" style="color:#007A78;margin-bottom:4px">✎ 점선 칸은 인쇄 직전에 바로 고칠 수 있습니다. (이 창에서 고친 내용은 저장되지 않으니, 계속 남길 내용은 대시보드에서 입력하세요)</div><table class="memo">
    <tr><th style="width:17%">특이사항</th><td class="ed" contenteditable="true">${nl(rv.issues)}</td></tr>
      <tr><th>검토 의견 · 향후 조치</th><td class="ed" contenteditable="true">${nl(rv.opinion)}</td></tr></table>${
        rv.author
          ? `<div style="text-align:right;margin-top:4px;color:#555">작성: ${esc(rv.author)}${
              rv.updatedAt ? ' (' + loc(rv.updatedAt, 10) + ')' : ''
            }</div>`
          : ''
      }</div>
  <div class="sec"><h2>2. 주요 지표 (전월 대비)</h2><table><tr><th>항목</th><th class="n">${pm}</th><th class="n">${m}</th><th class="n">증감</th></tr>
    <tr><td>불량 건수</td><td class="n">${pds.length}</td><td class="n">${ds.length}</td><td class="n">${dl(ds.length, pds.length)}</td></tr>
    <tr><td>불량 수량</td><td class="n">${sum(pds, 'qty').toLocaleString()}</td>
      <td class="n">${sum(ds, 'qty').toLocaleString()}</td><td class="n">${dl(sum(ds, 'qty'), sum(pds, 'qty'))}</td></tr>
    <tr><td>실패비용 (원)</td><td class="n">${won(pcost)}</td><td class="n">${won(cost)}</td><td class="n">${dl(cost, pcost, won)}</td></tr>
    <tr><td>구상 회수 (원)</td><td class="n">${won(prec)}</td><td class="n">${won(rec)}</td><td class="n">${dl(rec, prec, won)}</td></tr>
    <tr><td>NCR 발행 / 종결</td><td class="n">${pnNew} / ${pnClose}</td><td class="n">${nNew} / ${nClose}</td><td class="n">-</td></tr></table></div>
  <div class="sec"><h2>3. 추이 및 파레토</h2><div class="g">
    <div><h3>월별 불량 건수 (12개월)</h3>${barChart(lbl, [{ name: '건수', values: byM.map((a) => a.length), color: '#007A78' }], { h: 200 })}</div>
    <div><h3>월별 불량 수량 (12개월)</h3>${barChart(lbl, [{ name: '수량', values: byM.map((a) => sum(a, 'qty')), color: '#5b8def' }], { h: 200 })}</div>
    <div><h3>협력사별 불량 수량</h3>${pareto(supMap, '개')}</div>
    <div><h3>불량유형별 건수</h3>${pareto(typeMap, '건')}</div></div></div>
  <div class="sec"><h2>4. 협력사별 현황 (${m})</h2>${
    st.length
      ? `<table><tr><th>협력사</th><th class="n">건수</th><th class="n">A등급</th><th class="n">불량수량</th><th class="n">입고수량</th>
        <th class="n">PPM</th><th>등급</th><th class="n">NCR(미종결)</th><th class="n">COPQ(원)</th><th class="n">회수(원)</th></tr>
    ${st
      .map(
        (x) =>
          `<tr><td>${esc(x.s.name)}</td><td class="n">${x.cnt}</td><td class="n">${x.nA || ''}</td>
            <td class="n">${x.qty.toLocaleString()}</td><td class="n">${x.rcv ? x.rcv.toLocaleString() : '-'}</td><td class="n">${
              x.ppm == null ? '-' : Math.round(x.ppm).toLocaleString()
            }</td><td>${x.grade}</td><td class="n">${x.ncr}${x.open ? ` (${x.open})` : ''}</td>
            <td class="n">${won(x.cost)}</td><td class="n">${won(x.rec)}</td></tr>`,
      )
      .join('')}</table>`
      : '<div>해당 월 불량 없음</div>'
  }</div>
  <div class="sec"><h2>5. 주요 불량 (수량 상위)</h2>${
    top.length
      ? `<table><tr><th>발생일</th><th>발생처</th><th>협력사</th><th>부품</th><th>유형</th><th class="n">수량</th><th>처리</th><th>NCR</th></tr>
    ${top
      .map(
        (d) =>
          `<tr><td>${esc(d.date)}</td><td>${esc(d.source)}</td><td>${esc(supName(d.supplierId))}</td><td>${esc(d.partNo)} ${esc(d.partName)}</td>
            <td>${esc(d.type)}</td><td class="n">${num(d.qty).toLocaleString()}</td><td>${esc(d.disposition)}</td><td>${esc(
              db.ncrs.find((n) => n.id === d.ncrId)?.no || '',
            )}</td></tr>`,
      )
      .join('')}</table>`
      : '<div>해당 월 불량 없음</div>'
  }</div>
  <div class="sec"><h2>6. 조치 필요 항목</h2>${
    acts.length
      ? `<table><tr><th>구분</th><th>대상</th><th>협력사</th><th>내용</th></tr>${acts
          .slice(0, 20)
          .map((a) => `<tr><td>${esc(a[0])}</td><td>${esc(a[1])}</td><td>${esc(a[2])}</td><td>${esc(a[3])}</td></tr>`)
          .join('')}${acts.length > 20 ? `<tr><td colspan="4">외 ${acts.length - 20}건</td></tr>` : ''}</table>`
      : '<div>지연·권고 항목 없음</div>'
  }</div>
  </body></html>`);
  reportShow(w, html, `품질현황보고_${m}.html`);
}
