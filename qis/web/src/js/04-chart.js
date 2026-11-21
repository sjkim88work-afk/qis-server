/* ================= 차트 (SVG, 외부 라이브러리 없음) ================= */
function barChart(labels, series, opts = {}) {
  return chartBox((W) => barSvg(labels, series, opts, W), opts.h || 230);
}
function barSvg(labels, series, { h = 230, fmt = (v) => v.toLocaleString() } = {}, W = 620) {
  const H = h,
    pl = 58,
    pr = 10,
    pt = 20,
    pb = series.length > 1 ? 50 : 34;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const gw = (W - pl - pr) / labels.length,
    bw = Math.min(30, (gw - 6) / series.length);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4,
      y = pt + (H - pt - pb) * (1 - i / 4);
    g += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="#e6ebef"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" font-size="11.5" fill="#5b6875">${fmtShort(v)}</text>`;
  }
  labels.forEach((lb, i) => {
    const cx = pl + gw * i + gw / 2;
    series.forEach((s, j) => {
      const v = s.values[i] || 0,
        bh = ((H - pt - pb) * v) / max,
        x = cx - (bw * series.length) / 2 + bw * j,
        y = H - pb - bh;
      g += `<rect x="${x}" y="${y}" width="${Math.max(1, bw - 2)}" height="${bh}" fill="${s.color}" rx="2"><title>${esc(lb)} ${esc(s.name)}: ${fmt(v)}</title></rect>`;
      if (series.length === 1 && v)
        g += `<text x="${x + (bw - 2) / 2}" y="${y - 4}" text-anchor="middle" font-size="11.5" fill="#16202a">${fmtShort(v)}</text>`;
    });
    g += `<text x="${cx}" y="${H - pb + 14}" text-anchor="middle" font-size="11.5" fill="#5b6875">${esc(lb)}</text>`;
  });
  if (series.length > 1) {
    let lx = pl;
    series.forEach((s) => {
      g += `<rect x="${lx}" y="${H - 16}" width="10" height="10" fill="${s.color}"/><text x="${lx + 14}" y="${H - 7}" font-size="12" fill="#16202a">${esc(s.name)}</text>`;
      lx += 14 + s.name.length * 13 + 24;
    });
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}</svg>`;
}
function pareto(map, unit = '') {
  if (!Object.values(map).some((v) => v > 0)) return '<div class="muted" style="padding:40px;text-align:center">해당 기간 데이터 없음</div>';
  return chartBox((W) => paretoSvg(map, unit, W), 250);
}
function paretoSvg(map, unit = '', W = 620) {
  const items = Object.entries(map)
    .map(([k, v]) => ({ k, v }))
    .filter((i) => i.v > 0)
    .sort((a, b) => b.v - a.v);
  if (!items.length) return '<div class="muted" style="padding:40px;text-align:center">해당 기간 데이터 없음</div>';
  const tot = items.reduce((a, i) => a + i.v, 0),
    top = items.slice(0, 8);
  const H = 250,
    pl = 48,
    pr = 40,
    pt = 18,
    pb = 52,
    max = top[0].v,
    gw = (W - pl - pr) / top.length,
    ih = H - pt - pb;
  let g = '',
    cum = 0;
  const pts = [];
  for (let i = 0; i <= 4; i++) {
    const y = pt + ih * (1 - i / 4);
    g += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="#e6ebef"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" font-size="11.5" fill="#5b6875">${fmtShort((max * i) / 4)}</text><text x="${W - pr + 6}" y="${y + 4}" font-size="11.5" fill="#c0392b">${i * 25}%</text>`;
  }
  top.forEach((it, i) => {
    const x = pl + gw * i,
      bh = (ih * it.v) / max,
      bw = Math.min(46, gw - 10);
    g += `<rect x="${x + (gw - bw) / 2}" y="${pt + ih - bh}" width="${bw}" height="${bh}" fill="#3a4252" rx="2"><title>${esc(it.k)}: ${it.v.toLocaleString()}${unit}</title></rect>`;
    g += `<text x="${x + gw / 2}" y="${pt + ih - bh - 4}" text-anchor="middle" font-size="11.5" fill="#16202a">${fmtShort(it.v)}</text>`;
    const lb = it.k.length > 7 ? it.k.slice(0, 7) + '…' : it.k;
    g += `<text x="${x + gw / 2}" y="${H - pb + 15}" text-anchor="middle" font-size="11.5" fill="#16202a">${esc(lb)}</text>`;
    cum += it.v;
    pts.push([x + gw / 2, pt + ih * (1 - cum / tot), Math.round((cum / tot) * 100)]);
  });
  g += `<polyline points="${pts.map((p) => p[0] + ',' + p[1]).join(' ')}" fill="none" stroke="#c0392b" stroke-width="2"/>`;
  pts.forEach(
    (p) =>
      (g += `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#c0392b"/><text x="${p[0] + 7}" y="${p[1] + 4}" text-anchor="start" font-size="10.5" font-weight="600" fill="#c0392b" stroke="#fff" stroke-width="3" paint-order="stroke">${p[2]}%</text>`),
  );
  if (items.length > 8)
    g += `<text x="${W - pr}" y="${H - 6}" text-anchor="end" font-size="11.5" fill="#5b6875">외 ${items.length - 8}개 항목 (누적%는 전체 기준)</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}</svg>`;
}
// 차트는 먼저 기본 너비(620)로 그리고, 화면에 붙은 뒤 실제 칸 너비로 다시 그림 — 글자·막대가 확대되지 않도록
const CHARTS = new Map();
let chartSeq = 0;
function chartBox(draw, h) {
  const id = 'ch' + ++chartSeq;
  CHARTS.set(id, draw);
  return `<div class="chart" data-ch="${id}" data-w="620">${draw(620)}</div>`;
}
function fitCharts(root) {
  const live = new Set();
  (root || document).querySelectorAll('.chart[data-ch]').forEach((el) => {
    const id = el.dataset.ch,
      draw = CHARTS.get(id);
    live.add(id);
    if (!draw) return;
    const w = Math.floor(el.clientWidth);
    if (w < 200 || String(w) === el.dataset.w) return;
    el.dataset.w = w;
    el.innerHTML = draw(w);
  });
  if (CHARTS.size > 200)
    [...CHARTS.keys()].forEach((k) => {
      if (!live.has(k) && !document.querySelector(`[data-ch="${k}"]`)) CHARTS.delete(k);
    });
}
window.addEventListener('resize', () => {
  clearTimeout(fitCharts._t);
  fitCharts._t = setTimeout(() => fitCharts(document), 150);
});
