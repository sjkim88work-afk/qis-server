// ── RCA — 원인분석 도구 (5Why · FTA · 워크시트) ──
function blankAna(key) {
  const r5 = () => ['', '', '', '', ''];
  const D = {
    '5why': { problem: '', occ: r5(), esc: r5(), evidence: '' },
    isnot: { rows: {}, cands: [{ cause: '', basis: '', method: '', result: '' }] },
    timeline: { period: '', rows: [{ t: '', ev: '', who: '', st: '정상', note: '' }], changes: [{ t: '', what: '', m4: '', impact: '', cause: '' }] },
    change: {
      items: [
        ['사람', '작업자'],
        ['사람', '숙련도 · 교대'],
        ['설비', '설비 · 금형 · 치구'],
        ['설비', '공정 파라미터'],
        ['자재', '원자재 Lot'],
        ['자재', '원자재 협력사 · 2차 협력사'],
        ['방법', '작업 방법 · 순서'],
        ['방법', '검사 기준 · 방법'],
        ['환경', '온도 · 습도'],
      ].map(([cat, item]) => ({ cat, item, before: '', after: '', impact: '', check: '' })),
    },
    fishbone: { effect: '', rows: [] },
    fta: { top: '', gate: 'OR', nodes: [], nid: 0 },
    logic: { problem: '', basis: '4M+1E', nodes: [], nid: 0, mece1: false, mece2: false },
    cem: {
      ys: [
        { name: '불량률', w: '10' },
        { name: '고객 영향', w: '9' },
        { name: '재발 가능성', w: '8' },
      ],
      xs: [
        { name: '', s: ['', '', ''] },
        { name: '', s: ['', '', ''] },
        { name: '', s: ['', '', ''] },
      ],
    },
    eta: {
      ie: '',
      pie: '',
      sfs: [
        { name: '공정 내 검사', pf: '' },
        { name: '출하검사', pf: '' },
        { name: '고객 수입검사', pf: '' },
      ],
    },
  };
  return Object.assign(
    { id: uid(), tool: key, created: today(), updatedAt: now(), concl: '', hideHow: false, collapsed: false },
    JSON.parse(JSON.stringify(D[key])),
  );
}
function syncTools(c) {
  c.AnalysisTools = [...new Set((c.Analyses || []).map((a) => toolOf(a.tool).name))];
}
function setPath(o, path, v) {
  const ks = path.split('.');
  let t = o;
  for (let i = 0; i < ks.length - 1; i++) {
    const k = ks[i];
    if (t[k] === undefined || t[k] === null) t[k] = /^\d+$/.test(ks[i + 1]) ? [] : {};
    t = t[k];
  }
  t[ks[ks.length - 1]] = v;
}
const fmtP = (p) => {
  if (p === null || p === undefined || isNaN(p)) return '-';
  const v = p * 100;
  return (v >= 1 ? v.toFixed(1) : v >= 0.01 ? v.toFixed(3) : v === 0 ? '0' : v.toExponential(2)) + '%';
};
function czOptHTML(list, val) {
  const L = list.map((o) => (Array.isArray(o) ? o : [o, o]));
  if (has(val) && !L.some(([v]) => String(v) === String(val))) L.push([val, val]);
  return L.map(([v, l]) => `<option value="${esc(v)}" ${String(val ?? '') === String(v) ? 'selected' : ''}>${esc(l || '-')}</option>`).join('');
}
const IN = (a, p, v, x = '') => `<input type="text" data-scope="ana" data-aid="${a.id}" data-path="${p}" value="${esc(v)}" ${x}>`;
const TA = (a, p, v, x = '') => `<textarea data-scope="ana" data-aid="${a.id}" data-path="${p}" ${x}>${esc(v)}</textarea>`;
const SE = (a, p, list, v, x = '') => `<select data-scope="ana" data-aid="${a.id}" data-path="${p}" ${x}>${czOptHTML(list, v)}</select>`;
const RB = (a, kind, label, x = '') => `<button class="btn sm" data-act="anaAdd" data-aid="${a.id}" data-kind="${kind}" ${x}>${label}</button>`;
const XB = (a, list, i) =>
  `<button class="btn sm danger" data-act="anaDel" data-aid="${a.id}" data-list="${list}" data-i="${i}" title="삭제">✕</button>`;
function ftaProb(a, id) {
  const kids = a.nodes.filter((n) => String(n.parent) === String(id));
  if (!kids.length) {
    const n = a.nodes.find((m) => String(m.id) === String(id));
    return n && has(n.p) ? num(n.p) / 100 : null;
  }
  const ps = kids.map((k) => ftaProb(a, k.id));
  if (ps.some((p) => p === null)) return null;
  const gate = id === 'TOP' ? a.gate : (a.nodes.find((m) => String(m.id) === String(id)) || {}).gate || 'OR';
  return gate === 'AND' ? ps.reduce((x, y) => x * y, 1) : 1 - ps.reduce((x, y) => x * (1 - y), 1);
}
function treeHTML(a, isFTA) {
  const rec = (pid, depth) =>
    a.nodes
      .map((n, i) => [n, i])
      .filter(([n]) => String(n.parent) === String(pid))
      .map(([n, i]) => {
        const leaf = !a.nodes.some((m) => String(m.parent) === String(n.id));
        const mid = isFTA
          ? leaf
            ? `<span class="badge t0">기본원인</span>${IN(a, `nodes.${i}.p`, n.p, 'style="width:78px;flex:none" placeholder="확률 %"')}`
            : SE(
                a,
                `nodes.${i}.gate`,
                [
                  ['OR', 'OR 게이트'],
                  ['AND', 'AND 게이트'],
                ],
                n.gate,
              )
          : SE(
              a,
              `nodes.${i}.likely`,
              [
                ['', '가능성'],
                ['상', '가능성 상'],
                ['중', '가능성 중'],
                ['하', '가능성 하'],
              ],
              n.likely,
            );
        const vSt = n.v === '원인확인' ? 'style="color:var(--red);font-weight:600"' : '';
        return (
          `<div class="tnode" style="margin-left:${depth * 26}px"><span class="tl">${depth ? '└' : '•'}</span>
      ${IN(a, `nodes.${i}.label`, n.label, `placeholder="${isFTA ? (leaf ? '원인' : '중간 사건') : '가지'}"`)}${mid}
      ${SE(
        a,
        `nodes.${i}.v`,
        [
          ['', '미검증'],
          ['원인확인', '원인확인'],
          ['기각', '기각'],
        ],
        n.v,
        vSt,
      )}
      <button class="btn sm" data-act="anaAdd" data-aid="${a.id}" data-kind="node" data-parent="${n.id}">+ 하위</button>${XB(a, 'nodes', i)}</div>` +
          rec(n.id, depth + 1)
        );
      })
      .join('');
  return rec('TOP', 0);
}
const WS = {
  '5why': (a) => {
    const chain = (k, title, first) =>
      `<table class="mini"><tr><th colspan="2">${title}</th><th>답 (확인된 사실)</th></tr>${a[k]
        .map(
          (v, i) =>
            `<tr><td style="width:58px"><b>Why ${i + 1}</b></td><td class="muted" style="width:38%">${
              i === 0 ? esc(first) : '왜 「' + esc(a[k][i - 1] || '앞의 답') + '」인가?'
            }</td><td>${IN(a, k + '.' + i, v)}</td></tr>`,
        )
        .join('')}</table>`;
    return `<div class="fld" style="margin-bottom:10px"><label>문제 정의</label>${IN(a, 'problem', a.problem, 'placeholder="무엇이 · 어디서 · 얼마나"')}</div>
      <div class="two">${chain('occ', '발생 — 왜 만들어졌나', '왜 이 불량이 만들어졌는가?')}${chain('esc', '유출 — 왜 못 걸렀나', '왜 검출되지 않고 넘어갔는가?')}</div>
      <div class="fld"><label>근거 자료 (측정 데이터 · 사진 · 재현 시험)</label>${IN(a, 'evidence', a.evidence)}</div>`;
  },
  isnot: (a) => {
    const R = [
      ['what', '무엇', '어떤 불량인가?'],
      ['what2', '무엇', '어떤 부품·모델인가?'],
      ['where', '어디', '어느 공정인가?'],
      ['where2', '어디', '어느 설비·위치인가?'],
      ['when', '언제', '처음 발생한 시점은?'],
      ['when2', '언제', '시간대·교대·로트는?'],
      ['much', '얼마나', '불량 수량은?'],
      ['much2', '얼마나', '빈도·추세는?'],
    ];
    const r = a.rows || {};
    return `<table class="mini"><tr><th style="width:52px"></th><th style="width:15%">질문</th>
      <th>IS (나타난 것)</th><th>IS NOT (나타날 수 있었는데 안 나타난 것)</th><th>차이점</th><th>가능 원인</th></tr>
      ${R.map(
        ([k, g, q]) =>
          `<tr><td><b>${g}</b></td><td class="muted">${q}</td>${['is', 'isnot', 'diff', 'cause']
            .map((f) => `<td>${IN(a, `rows.${k}.${f}`, (r[k] || {})[f])}</td>`)
            .join('')}</tr>`,
      ).join('')}</table>
      <div class="sec-t" style="font-size:13px;margin-top:12px">원인 후보 검증</div>
      <table class="mini"><tr><th style="width:36px">순위</th><th>가능 원인</th><th>근거 (차이점)</th>
        <th>검증 방법</th><th style="width:104px">결과</th><th style="width:36px"></th></tr>
      ${a.cands
        .map(
          (x, i) =>
            `<tr><td>${i + 1}</td><td>${IN(a, `cands.${i}.cause`, x.cause)}</td>
              <td>${IN(a, `cands.${i}.basis`, x.basis)}</td><td>${IN(a, `cands.${i}.method`, x.method)}</td><td>${SE(
                a,
                `cands.${i}.result`,
                [
                  ['', '미검증'],
                  ['○', '○ 원인'],
                  ['×', '× 기각'],
                ],
                x.result,
              )}</td><td>${XB(a, 'cands', i)}</td></tr>`,
        )
        .join('')}</table>${RB(a, 'cand', '+ 후보 추가')}`;
  },
  timeline: (a) => `<div class="fld" style="margin-bottom:10px;max-width:420px"><label>분석 기간</label>${IN(
    a,
    'period',
    a.period,
    'placeholder="예: 10/01 ~ 10/15"',
  )}</div>
    <table class="mini"><tr><th style="width:130px">일시</th><th>사건 · 작업</th><th style="width:16%">담당 · 설비</th>
      <th style="width:90px">상태</th><th style="width:18%">비고</th><th style="width:36px"></th></tr>
    ${a.rows
      .map(
        (x, i) =>
          `<tr><td>${IN(a, `rows.${i}.t`, x.t)}</td><td>${IN(a, `rows.${i}.ev`, x.ev)}</td><td>${IN(a, `rows.${i}.who`, x.who)}</td><td>${SE(
            a,
            `rows.${i}.st`,
            ['정상', '이상', '불량'],
            x.st,
            x.st === '불량' ? 'style="color:var(--red)"' : x.st === '이상' ? 'style="color:var(--amb)"' : '',
          )}</td><td>${IN(a, `rows.${i}.note`, x.note)}</td><td>${XB(a, 'rows', i)}</td></tr>`,
      )
      .join('')}</table>${RB(a, 'tl', '+ 사건 추가')}
    <div class="sec-t" style="font-size:13px;margin-top:14px">정상 → 이상 경계에서 찾은 변화점</div>
    <table class="mini"><tr><th style="width:130px">변화 시점</th><th>변화 내용</th><th style="width:90px">4M+1E</th>
      <th style="width:76px">영향도</th><th>가능 원인</th><th style="width:36px"></th></tr>
    ${a.changes
      .map(
        (x, i) =>
          `<tr><td>${IN(a, `changes.${i}.t`, x.t)}</td><td>${IN(a, `changes.${i}.what`, x.what)}</td><td>${SE(
            a,
            `changes.${i}.m4`,
            ['', '사람', '설비', '자재', '방법', '환경'],
            x.m4,
          )}</td><td>${SE(
            a,
            `changes.${i}.impact`,
            ['', '상', '중', '하'],
            x.impact,
          )}</td><td>${IN(a, `changes.${i}.cause`, x.cause)}</td><td>${XB(a, 'changes', i)}</td></tr>`,
      )
      .join('')}</table>${RB(a, 'tlc', '+ 변화점 추가')}`,
  change: (a) => `<table class="mini"><tr><th style="width:56px">구분</th><th style="width:17%">항목</th>
    <th>변화 전</th><th>변화 후</th><th style="width:76px">영향도</th><th>확인 결과</th><th style="width:36px"></th></tr>
    ${a.items
      .map(
        (x, i) =>
          `<tr><td><b>${esc(x.cat)}</b></td><td>${IN(a, `items.${i}.item`, x.item)}</td><td>${IN(a, `items.${i}.before`, x.before)}</td><td>${IN(
            a,
            `items.${i}.after`,
            x.after,
            'placeholder="변화 없으면 \'변화 없음\'"',
          )}</td><td>${SE(a, `items.${i}.impact`, ['', '상', '중', '하'], x.impact)}</td><td>${IN(
            a,
            `items.${i}.check`,
            x.check,
            'placeholder="○ 원인 / × 기각 + 근거"',
          )}</td><td>${XB(a, 'items', i)}</td></tr>`,
      )
      .join('')}</table>
    <div class="bar">${['사람', '설비', '자재', '방법', '환경'].map((k) => RB(a, 'chg', `+ ${k}`, `data-cat="${k}"`)).join('')}</div>`,
  fishbone: (a) => {
    const cats = ['사람', '설비', '자재', '방법', '측정', '환경'];
    return `<div class="fld" style="margin-bottom:12px"><label>결과 (특성)</label>${IN(a, 'effect', a.effect, 'placeholder="예: 래치 작동력 상한 초과"')}</div>
      <div class="fbg">${cats
        .map((k) => {
          const rows = a.rows.map((x, i) => [x, i]).filter(([x]) => x.cat === k);
          return `<div class="fbc"><div class="fbh">${k} <span class="muted" style="font-weight:400">${rows.length}</span></div>${rows
            .map(
              ([x, i]) =>
                `<div class="tnode">${IN(a, `rows.${i}.text`, x.text, 'placeholder="원인"')}${SE(
                  a,
                  `rows.${i}.flag`,
                  [
                    ['', '후보'],
                    ['검증-원인', '검증-원인'],
                    ['기각', '기각'],
                  ],
                  x.flag,
                  x.flag === '검증-원인' ? 'style="color:var(--red);font-weight:600"' : '',
                )}${XB(a, 'rows', i)}</div>`,
            )
            .join('')}${RB(a, 'fb', '+ 원인', `data-cat="${k}"`)}</div>`;
        })
        .join('')}</div>`;
  },
  fta: (a) => {
    const p = ftaProb(a, 'TOP');
    return `<div class="grid" style="margin-bottom:12px"><div class="fld w2"><label>최상위 사건 (Top event)</label>${IN(a, 'top', a.top)}</div>
      <div class="fld"><label>Top 바로 아래 결합</label>${SE(
        a,
        'gate',
        [
          ['OR', 'OR — 하나만 있어도 발생'],
          ['AND', 'AND — 모두 있어야 발생'],
        ],
        a.gate,
      )}</div>
      <div class="fld"><label>최상위 발생 확률 (계산)</label><div class="calc"><span class="calcv">${fmtP(p)}</span>${
        p === null ? ' <span class="muted">기본원인 확률을 모두 넣으면 계산</span>' : ''
      }</div></div></div>
      <div>${treeHTML(a, true) || '<div class="muted" style="margin-bottom:8px">아래 버튼으로 첫 원인을 추가하세요.</div>'}</div>${RB(
        a,
        'node',
        '+ Top 아래 원인 추가',
        'data-parent="TOP"',
      )}`;
  },
  logic: (a) => `<div class="grid" style="margin-bottom:12px"><div class="fld w2"><label>문제</label>${IN(a, 'problem', a.problem)}</div>
    <div class="fld w2"><label>분해 기준</label>${SE(a, 'basis', ['4M+1E', '공정 단계', '제품 구성요소', '기타'], a.basis)}</div></div>
    <div>${treeHTML(a, false) || '<div class="muted" style="margin-bottom:8px">아래 버튼으로 1차 가지를 추가하세요.</div>'}</div>${RB(
      a,
      'node',
      '+ 1차 가지 추가',
      'data-parent="TOP"',
    )}
    <div class="checks" style="margin-top:12px"><label><input type="checkbox" data-scope="ana" data-aid="${a.id}" data-path="mece1" ${a.mece1 ? 'checked' : ''}>같은 수준의 가지끼리 겹치지 않는다 (ME)</label><label><input type="checkbox" data-scope="ana" data-aid="${a.id}" data-path="mece2" ${a.mece2 ? 'checked' : ''}>가지를 합치면 빠짐이 없다 (CE)</label></div>`,
  cem: (a) => {
    const tot = (x) => a.ys.reduce((s, y, j) => s + num(x.s[j]) * num(y.w), 0);
    const rank = {};
    a.xs
      .map((x, i) => [tot(x), i])
      .sort((p, q) => q[0] - p[0])
      .forEach(([t, i], r) => {
        rank[i] = t > 0 ? r + 1 : '';
      });
    return `<div class="muted" style="margin-bottom:6px">관계 강도: 9 강 · 3 중 · 1 약 · 0 없음</div>
      <div style="overflow:auto"><table class="mini"><tr><th style="min-width:180px">원인 후보 (X)</th>${a.ys
        .map(
          (y, j) =>
            `<th style="width:124px">${IN(a, `ys.${j}.name`, y.name)}<div style="display:flex;gap:4px;margin-top:4px;align-items:center"><span class="muted" style="font-weight:400">중요도</span>${SE(
              a,
              `ys.${j}.w`,
              ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
              y.w,
            )}${a.ys.length > 1 ? XB(a, 'ys', j) : ''}</div></th>`,
        )
        .join('')}<th style="width:60px">총점</th><th style="width:44px">순위</th><th style="width:36px"></th></tr>
      ${a.xs
        .map(
          (x, i) =>
            `<tr><td>${IN(a, `xs.${i}.name`, x.name)}</td>${a.ys
              .map((y, j) => `<td>${SE(a, `xs.${i}.s.${j}`, ['', '0', '1', '3', '9'], x.s[j])}</td>`)
              .join('')}<td class="num"><b>${tot(x)}</b></td><td class="num">${
              rank[i] === 1 ? '<span class="calcv">1</span>' : rank[i]
            }</td><td>${XB(a, 'xs', i)}</td></tr>`,
        )
        .join('')}</table></div>
      <div class="bar">${RB(a, 'x', '+ 원인 후보')}${a.ys.length < 5 ? RB(a, 'y', '+ 결과 항목 (Y)') : ''}</div>`;
  },
  eta: (a) => {
    const P0 = num(a.pie) / 100;
    let carry = P0;
    const paths = a.sfs.map((s, i) => {
      const pf = num(s.pf) / 100;
      const det = carry * (1 - pf);
      carry = carry * pf;
      return { label: `${s.name || '방어 ' + (i + 1)}에서 검출`, p: det };
    });
    paths.push({ label: '고객 유출', p: carry, out: true });
    const ok = has(a.pie) && a.sfs.length && a.sfs.every((s) => has(s.pf));
    return `<div class="grid" style="margin-bottom:12px"><div class="fld w2"><label>초기 사건</label>${IN(
      a,
      'ie',
      a.ie,
      'placeholder="예: 그리스 도포량 부족 발생"',
    )}</div><div class="fld"><label>발생률 (%)</label>${IN(a, 'pie', a.pie, 'placeholder="예: 2"')}</div></div>
      <table class="mini"><tr><th style="width:44px">순서</th><th>방어 단계 (검출 기회)</th>
        <th style="width:150px">놓칠 확률 (%)</th><th style="width:36px"></th></tr>
      ${a.sfs
        .map(
          (s, i) =>
            `<tr><td>${i + 1}</td><td>${IN(a, `sfs.${i}.name`, s.name)}</td><td>${IN(
              a,
              `sfs.${i}.pf`,
              s.pf,
              'placeholder="예: 30"',
            )}</td><td>${XB(a, 'sfs', i)}</td></tr>`,
        )
        .join('')}</table>${RB(a, 'sf', '+ 방어 단계')}
      <div class="sec-t" style="font-size:13px;margin-top:14px">경로별 결과 ${
        ok ? '' : '<span class="muted" style="font-weight:400">발생률과 놓칠 확률을 모두 넣으면 계산됩니다</span>'
      }</div>
      <table class="mini"><tr><th>경로</th><th style="width:150px">전체 대비 확률</th><th style="width:160px">발생 건 중 비율</th></tr>
      ${paths
        .map(
          (x) =>
            `<tr${
              x.out ? ' style="color:var(--red);font-weight:600"' : ''
            }><td>${esc(x.label)}</td><td>${ok ? fmtP(x.p) : '-'}</td><td>${ok && P0 > 0 ? fmtP(x.p / P0) : '-'}</td></tr>`,
        )
        .join('')}</table>`;
  },
};
function wsHTML(c, a) {
  const t = toolOf(a.tool);
  const B = (act, label, attrs = '', cls = 'btn sm') => `<button class="${cls}" data-act="${act}" data-aid="${a.id}" ${attrs}>${label}</button>`;
  const body = (WS[a.tool] || (() => ''))(a);
  const concl =
    a.tool === '5why'
      ? `<div class="concl bar" style="margin-bottom:0">${B('anaApply', '발생 줄기 마지막 답 → 발생 원인', 'data-src="occ" data-to="CauseOccur"')}${B(
          'anaApply',
          '유출 줄기 마지막 답 → 유출 원인',
          'data-src="esc" data-to="CauseEscape"',
        )}</div>`
      : `<div class="concl"><div class="fld"><label>이 도구로 얻은 결론</label>${TA(a, 'concl', a.concl, 'placeholder="검증으로 확인된 원인만 씁니다"')}</div>
       <div class="bar" style="margin:8px 0 0">${B('anaApply', '→ 발생 원인에 추가', 'data-src="concl" data-to="CauseOccur"')}${B(
         'anaApply',
         '→ 유출 원인에 추가',
         'data-src="concl" data-to="CauseEscape"',
       )}${B('anaApply', '→ 시스템 원인에 추가', 'data-src="concl" data-to="CauseSystem"')}</div></div>`;
  return `<div class="ws" id="ws_${a.id}">
    <div class="ws-h"><b>${esc(t.name)}</b><span class="muted">${esc(t.lv || '')} · ${esc(a.created)}</span><span style="flex:1"></span>
      ${a.collapsed ? '' : B('anaToggle', a.hideHow ? '작성 방법 보기' : '작성 방법 접기', 'data-k="hideHow"')}
      ${B('anaToggle', a.collapsed ? '펼치기' : '접기', 'data-k="collapsed"')}${B('anaDel', '삭제', '', 'btn sm danger')}</div>
    ${
      a.collapsed
        ? ''
        : `<div class="ws-b">${
            a.hideHow ? '' : `<div class="how"><ol>${t.how.map((h) => `<li>${esc(h)}</li>`).join('')}</ol></div>`
          }${body}${concl}</div>`
    }
  </div>`;
}
function causeHTML(c, tab, missSet) {
  const rec = czNeedEsc(c) && !czNeedOcc(c) ? ['eta', '5why', 'isnot'] : REC[c.Tier] || [],
    list = c.Analyses || [];
  const scopeF = tab.fields.find((f) => f.key === 'RcaScope'),
    restF = tab.fields.filter((f) => f.key !== 'RcaScope');
  const skipRca = c.RcaScope === '없음';
  const head = `<div class="grid" style="margin-bottom:12px">${czField(c, scopeF, missSet)}${
    czNeedEsc(c)
      ? `<div class="fld w2"><label>유출 대책 빠른 등록</label><button class="btn" data-act="escActs">＋ 수입검사기준 개정 · 검사 강화 조치 등록</button><div class="hint">RCA 조치에 유출대책 · 문서개정 2건을 추가합니다</div></div>`
      : ''
  }</div>`;
  if (skipRca)
    return (
      head +
      `<div class="note">사내 분석 대상이 ‘없음’입니다. 원인은 협력사 대책서(NCR)로 받습니다. 사내에서 볼 부분이 생기면 위에서 대상을 바꾸십시오.</div><div class="grid">${restF
        .map((fd) => czField(c, fd, missSet))
        .join('')}</div>`
    );
  tab = { ...tab, fields: restF };
  return (
    head +
    `<div class="sec-t">분석 도구 고르기 <span class="muted" style="font-weight:400">상황을 누르거나 도구 카드를 누르면 워크시트가 추가됩니다${
      rec.length ? ` · <span style="color:var(--grn)">권장</span> 표시는 ${czNeedEsc(c) && !czNeedOcc(c) ? '유출 분석' : esc(c.Tier)} 기준` : ''
    }</span></div>
    <div class="guide">${GUIDE.map(
      ([s, k]) => `<span class="chip" data-act="addAna" data-tool="${k}">${esc(s)} → <b>${esc(toolOf(k).name)}</b></span>`,
    ).join('')}</div>
    <div class="tools">${TOOLS.map(
      (t) =>
        `<div class="tool" data-act="addAna" data-tool="${t.key}">${
          rec.includes(t.key) ? '<span class="rec">권장</span>' : ''
        }<div class="nm">${esc(t.name)}<span class="lv">${t.lv}</span></div><div class="wh">${esc(t.when)}</div></div>`,
    ).join('')}</div>
    ${
      list.length
        ? `<div class="sec-t">워크시트 ${list.length}개</div>` + list.map((a) => wsHTML(c, a)).join('')
        : czNcrOk(c)
          ? ''
          : '<div class="note">아직 작성한 워크시트가 없습니다. 위에서 상황이나 도구를 고르십시오. 원인분석 단계를 넘기려면 워크시트가 1개 이상 필요합니다' +
            (c.NcrId ? ' (연결 NCR 대책서가 승인되면 불필요)' : '') +
            '.</div>'
    }
    <div class="sec-t" style="margin-top:18px">원인 결론 <span class="muted" style="font-weight:400">워크시트 결론을 버튼으로 옮기거나 직접 씁니다</span></div>
    <div class="grid">${tab.fields.map((fd) => czField(c, fd, missSet)).join('')}</div>`
  );
}
async function anaClick(act, el) {
  const c = czById('cases', czUi.caseId);
  if (!c) return;
  if (act === 'addAna') {
    c.Analyses = c.Analyses || [];
    const a = blankAna(el.dataset.tool);
    c.Analyses.push(a);
    syncTools(c);
    touch(c);
    save();
    render();
    const w = document.getElementById('ws_' + a.id);
    if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(`${toolOf(a.tool).name} 워크시트를 추가했습니다.`);
    return;
  }
  const a = (c.Analyses || []).find((x) => String(x.id) === el.dataset.aid);
  if (!a) return;
  if (act === 'anaToggle') a[el.dataset.k] = !a[el.dataset.k];
  else if (act === 'anaDel') {
    const list = el.dataset.list,
      i = Number(el.dataset.i);
    if (!list) {
      if (!(await askConfirm({ title: `${toolOf(a.tool).name} 워크시트를 삭제할까요?`, note: '삭제 후 10초 안에 되돌릴 수 있습니다.' }))) return;
      const snap = await takeSnap();
      c.Analyses = c.Analyses.filter((x) => x !== a);
      syncTools(c);
      touch(c);
      save();
      render();
      offerUndo(snap, '워크시트를 삭제했습니다');
      return;
    } else if (list === 'nodes') {
      const kill = new Set([String(a.nodes[i].id)]);
      let grow = true;
      while (grow) {
        grow = false;
        a.nodes.forEach((n) => {
          if (kill.has(String(n.parent)) && !kill.has(String(n.id))) {
            kill.add(String(n.id));
            grow = true;
          }
        });
      }
      a.nodes = a.nodes.filter((n) => !kill.has(String(n.id)));
    } else if (list === 'ys') {
      a.ys.splice(i, 1);
      a.xs.forEach((x) => x.s.splice(i, 1));
    } else a[list].splice(i, 1);
  } else if (act === 'anaAdd') {
    const k = el.dataset.kind;
    if (k === 'cand') a.cands.push({ cause: '', basis: '', method: '', result: '' });
    if (k === 'tl') a.rows.push({ t: '', ev: '', who: '', st: '정상', note: '' });
    if (k === 'tlc') a.changes.push({ t: '', what: '', m4: '', impact: '', cause: '' });
    if (k === 'chg') {
      const cat = el.dataset.cat;
      let at = -1;
      a.items.forEach((x, i) => {
        if (x.cat === cat) at = i;
      });
      a.items.splice(at < 0 ? a.items.length : at + 1, 0, { cat, item: '', before: '', after: '', impact: '', check: '' });
    }
    if (k === 'fb') a.rows.push({ cat: el.dataset.cat, text: '', flag: '' });
    if (k === 'node') {
      a.nid = (a.nid || 0) + 1;
      a.nodes.push({ id: a.nid, parent: el.dataset.parent, label: '', gate: 'OR', p: '', likely: '', v: '' });
    }
    if (k === 'x') a.xs.push({ name: '', s: a.ys.map(() => '') });
    if (k === 'y') {
      a.ys.push({ name: '', w: '5' });
      a.xs.forEach((x) => x.s.push(''));
    }
    if (k === 'sf') a.sfs.push({ name: '', pf: '' });
  } else if (act === 'anaApply') {
    const src = el.dataset.src,
      to = el.dataset.to;
    let txt = src === 'concl' ? a.concl : [...(a[src] || [])].reverse().find((v) => has(v));
    if (!has(txt)) {
      toast('옮길 내용이 없습니다. 먼저 워크시트를 작성하세요.');
      return;
    }
    txt = String(txt).trim();
    const cur = c[to] || '';
    if (cur.includes(txt)) {
      toast('이미 반영된 내용입니다.');
      return;
    }
    c[to] = (cur ? cur + '\n' : '') + `[${toolOf(a.tool).name}] ` + txt;
    toast('원인 결론에 반영했습니다.');
  }
  a.updatedAt = now();
  touch(c);
  save();
  render();
}
function anaReport(c) {
  const L = c.Analyses || [];
  if (!L.length) return '';
  return (
    '<table>' +
    L.map((a) => {
      const v =
        a.tool === '5why'
          ? `문제: ${a.problem || ''}\n발생: ${a.occ.filter(has).join(' → ')}\n유출: ${a.esc.filter(has).join(' → ')}`
          : a.concl || '(결론 미작성)';
      return `<tr><th>${esc(toolOf(a.tool).name)}</th><td class="pre">${esc(v)}</td></tr>`;
    }).join('') +
    '</table>'
  );
}

/* ---------- 입력 중 재렌더 (버튼 클릭 유실 · 포커스 이동 방지) ---------- */
let czPending = false,
  czMouse = false;
function czFkey(el) {
  if (!el || !el.dataset || !el.dataset.scope) return null;
  return (
    ['scope', 'f', 'id', 'aid', 'path', 'multi']
      .filter((k) => el.dataset[k] !== undefined)
      .map((k) => `[data-${k}="${CSS.escape(el.dataset[k])}"]`)
      .join('') + (el.type === 'checkbox' ? `[value="${CSS.escape(el.value)}"]` : '')
  );
}
