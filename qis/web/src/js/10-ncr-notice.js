/* ================= 부적합 통보서 ================= */
async function printNotice(id) {
  const n = db.ncrs.find((x) => x.id === id);
  if (!n) return;
  const w = reportWin(),
    S = db.settings,
    sp = supById(n.supplierId),
    part = partByNo(n.partNo);
  const ds = (n.defectIds || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean);
  const excl = new Set(n.photoExcl || []);
  let phs = [];
  try {
    phs = (await photoGetMany(ds.flatMap((d) => d.photos || []))).filter((p) => !excl.has(p.id)).slice(0, 9);
  } catch (e) {}
  let att = null;
  if (sp) {
    ensureContacts(sp);
    const a = sp.contacts.filter((c) => c.active !== false);
    att = a.find((c) => c.role === '품질 담당' && c.primary) || a.find((c) => c.role === '품질 담당') || primaryOf(sp);
  }
  const due = ncrDue(n),
    remark = (n.requirements || '').trim() || defaultReq(n.reqType || REQ_TYPES[0], due, n.far, n.siteAudit === '요청', escLevel(ds));
  const project = n.project || n.model || part?.model || ds[0]?.model || '';
  const inv = (n.stock && n.stock.length ? n.stock : STOCK_DEF.map((l) => ({ loc: l })))
    .map((r) => ({ loc: r.loc || '', st: r.stocked ?? r.qty ?? '', ng: r.ng ?? '' }))
    .filter((r) => r.loc || r.st || r.ng);
  const sg = S.signs || {},
    signer = (role, name) => (name ? `${role} ${esc(name)}${sg[name] ? `<img class="sg" src="${sg[name]}">` : ''}` : '');
  const v = (x) => `: ${x || ''}`;
  const L = [
    ['Company', esc(sp?.name)],
    ['Department', esc(n.supDept || 'Quality')],
    ['Name', esc(n.supAttn || att?.name || '')],
    ['Date Issued', esc(n.issueDate)],
    ['Incoming Date', esc(n.recvDate)],
    ['Lot. No.', esc(n.lotNo)],
    ['Lot. Size.', esc(fmtQtyTxt(n.lotQty))],
  ];
  const R = [
    ['Company', esc(S.company)],
    ['Department', esc(S.dept || 'Quality')],
    ['Name', `${signer('작성', n.owner)}&nbsp;&nbsp;${signer('승인', S.approver)}`],
    ['Project', esc(project)],
    ['Part Name', esc(n.partName)],
    ['Part No.', esc(n.partNo)],
    ['', ''],
  ];
  const cols = phs.length <= 1 ? 1 : phs.length === 2 ? 2 : 3;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(n.no)} Non-conformance Report</title><style>
  @page{size:A4;margin:8mm}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{margin:0;font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:10pt;color:#000}
  @media screen{body{margin:24px;background:#e9ebef}.pg{background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.2)}}
  .pg{width:194mm;height:280mm;margin:0 auto;border:2px solid #000;display:flex;flex-direction:column;overflow:hidden}
  table{border-collapse:collapse;width:100%;table-layout:fixed}td{padding:0 6px;vertical-align:middle}
  .hd td{border-bottom:1.5px solid #000;height:20mm}.hd .lg{width:31%;border-right:1px solid #000;text-align:center}.hd .lg img{max-width:100%;max-height:17mm;object-fit:contain}
  .hd .tt{text-align:center;padding:0 2px}.hd .en{color:#e8141b;font-size:12.5pt;font-weight:bold;white-space:nowrap}.hd .ko{font-size:13pt;font-weight:bold;letter-spacing:6px;margin-top:6px}
  .hd .dt{width:21%;border-left:1px solid #000;white-space:nowrap;font-size:9.5pt}.hd .dt span{margin-left:10px}
  .inf td{height:7mm;border-bottom:1px solid #9a9a9a;font-size:10pt;white-space:nowrap;overflow:hidden}.inf .k{width:17%}.inf .v{width:33%}.inf .k2{width:14%}.inf .v2{width:36%}.inf .mid{border-right:1px solid #000}.inf .nm{font-size:9pt;overflow:visible}
  .inf tr:last-child td{border-bottom:1px solid #000}
  .sg{height:6mm;vertical-align:middle;margin:0 1mm 0 1px;max-width:12mm;object-fit:contain}
  .mn th{background:#bfbfbf;font-weight:normal;height:11mm;border:1px solid #fff;border-top:0;border-left:0;font-size:10pt;line-height:1.25}
  .mn td{height:14mm;text-align:center;border-right:1px solid #ccc;border-bottom:1.5px solid #000;font-size:10.5pt;line-height:1.3}
  .mn .cl{max-height:22mm;overflow:hidden}.mn .cl.sm{font-size:8.5pt;line-height:1.25}
  .mn .no{color:#e8141b;text-decoration:underline}.mn .q,.mn .ac{color:#e8141b}.mn .sp{color:#1f2fe0}
  .dd{flex:1;min-height:0;display:flex;flex-direction:column;padding:2mm 1.5mm 2mm;border-bottom:1.5px solid #000}
  .dd .t{font-weight:bold;text-decoration:underline;font-size:10.5pt;margin-bottom:1.5mm}
  .dd .ds{font-size:9.5pt;line-height:1.5;margin:0 0 2mm;padding:0 1mm;white-space:normal;max-height:40mm;overflow:hidden}
  .ph{flex:1;min-height:0;display:grid;grid-template-columns:repeat(${cols},1fr);grid-auto-rows:minmax(0,1fr);gap:2mm}
  .ph figure{margin:0;min-height:0;display:flex;flex-direction:column}.ph img{flex:1;min-height:0;width:100%;object-fit:contain;object-position:center top}
  .ph figcaption{font-size:8pt;text-align:center;color:#333}
  .nop{flex:1;display:flex;align-items:center;justify-content:center;color:#888;border:1px dashed #bbb}
  .iv td{border:1px solid #000;height:9mm;text-align:center}.iv tr:first-child td{border-top:0}.iv td:first-child{border-left:0}.iv td:last-child{border-right:0}
  .iv .sit{text-align:left;width:31%;vertical-align:middle;line-height:1.35}.iv .dg{position:relative;padding:0}.iv .dg svg{position:absolute;inset:0;width:100%;height:100%}
  .iv .blu{color:#1f2fe0}.iv .red{color:#e8141b}
  .rm td{border-top:1.5px solid #000;height:17mm}.rm .k{width:11%;font-size:10pt;line-height:1.25;padding:0 6px;border-right:1px solid #000;white-space:nowrap;text-align:center}.rm .v{color:#e8141b;font-size:11pt;line-height:1.55;padding:2mm 6px}
  .cq td{border-top:1px solid #000;height:20mm}.cq .k{width:42%;border-right:1px solid #000;line-height:1.4;font-size:9.5pt;white-space:normal;word-break:keep-all;overflow-wrap:anywhere;padding:1.5mm 6px}.cq .v{font-size:9pt;color:#333;line-height:1.5}
  </style></head><body><div class="pg">
  <table class="hd"><tr><td class="lg">${S.logo ? `<img src="${S.logo}">` : `<b style="font-size:15pt">${esc(S.company)}</b>`}</td>
    <td class="tt"><div class="en">Non-conformance Report (External)</div><div class="ko">부적합 통보서</div></td>
    <td class="dt">발행일:<span>${esc(n.issueDate)}</span></td></tr></table>
  <table class="inf"><colgroup><col style="width:17%"><col style="width:33%"><col style="width:14%"><col style="width:36%"></colgroup>${L.map((l, k) => `<tr><td class="k">${l[0]}</td><td class="v mid">${l[0] ? v(l[1]) : ''}</td><td class="k k2">${R[k][0]}</td><td class="v v2${R[k][0] === 'Name' ? ' nm' : ''}">${R[k][0] ? v(R[k][1]) : ''}</td></tr>`).join('')}</table>
  <table class="mn"><tr><th>NCR No.<br>(부적합 통지 번호)</th><th>Defect Q'ty / Sample Size</th><th>Specification<br>(도면사양)</th><th>Actual<br>(실 제)</th></tr>
    <tr><td class="no">${esc(n.no)}</td><td class="q">${esc(n.defectQtyText || '')}</td><td class="sp"><div class="cl${String(n.spec || '').length > 40 ? ' sm' : ''}">${nl(n.spec) || 'Specification<br>(도면사양)'}</div></td><td class="ac"><div class="cl${String(n.actual || n.title || '').length > 40 ? ' sm' : ''}">${nl(n.actual || n.title)}</div></td></tr></table>
  <div class="dd"><div class="t">Defect Description${n.basis === '공정 감사' ? ' — Process Audit Finding (공정 감사 지적)' : n.basis === 'PPM 초과' ? ' — PPM Target Exceeded (PPM 목표 초과)' : ''}</div>${(n.defectDesc || '').trim() ? `<div class="ds">${nl(n.defectDesc.trim())}</div>` : ''}
    ${phs.length ? `<div class="ph">${phs.map((p) => `<figure><img src="${p.data}">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`).join('')}</div>` : `${(n.defectDesc || '').trim() || isSysBasis(n) ? '' : '<div class="nop">(사진 없음 — 불량 기록에 사진을 첨부하면 이 영역에 들어갑니다)</div>'}`}</div>
  <table class="iv"><tr><td class="sit" rowspan="${inv.length + 2}">Supplied part Situation<br>(공급품 현황) :${n.supplySit ? `<div style="margin-top:2mm;font-size:9pt">${nl(n.supplySit)}</div>` : ''}</td><td colspan="3">Inventory Check<br>재 고 현 황</td></tr>
    <tr><td class="dg"><svg preserveAspectRatio="none" viewBox="0 0 100 100"><line x1="0" y1="0" x2="100" y2="100" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/></svg></td><td>Quantity Stocked<br>(재고보유수량)</td><td>Check Quality<br>(확인된 불량수량)</td></tr>
    ${inv.map((r) => `<tr><td>${esc(r.loc)}</td><td class="blu">${esc(r.st) || '-'}</td><td class="red">${esc(r.ng) || '-'}</td></tr>`).join('')}</table>
  <table class="rm"><tr><td class="k">Remark</td><td class="v">${nl(remark)}</td></tr></table>
  <table class="cq"><tr><td class="k">Contact SQE ( ${esc(n.owner || '')} )<br>${n.reqType === '간이 대책서' ? 'Corrective action report must be filed<br>(간이 대책서 작성)' : n.reqType === '단순 통보' ? 'For information only<br>(단순 통보 · 회신 불요)' : '8-D report must be filed<br>(8-D 보고서와 병력 작성)'}</td><td class="v">${[S.issuerPhone && 'Tel. ' + esc(S.issuerPhone), S.issuerEmail && 'E-mail. ' + esc(S.issuerEmail)].filter(Boolean).join('<br>')}</td></tr></table>
  </div></body></html>`
    .replace('</head>', REPORT_HEAD.replace(/@page\{[^}]*\}/, ''))
    .replace('<body>', '<body>' + REPORT_BAR);
  reportShow(w, html, `NCR_${n.no}.html`);
}
