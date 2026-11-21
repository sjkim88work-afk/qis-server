/* ================= 설정 · 백업 ================= */
const SET_NAV = [
  [
    '옵션',
    [
      ['general', '일반', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'],
      ['brand', '로고 · 서명', 'M4 16l4-4 3 3 5-6 4 5M4 5h16v14H4z'],
      ['defect', '불량 관리', 'M12 3l9 16H3zM12 10v4M12 17h.01'],
      ['sev', '심각도 평가', 'M5 20V10M12 20V4M19 20v-7'],
      ['ncr', 'NCR · 통보서', 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6'],
      ['docno', '문서번호', 'M9 4L7 20M17 4l-2 16M4 9h16M3 15h16'],
      ['eval', '대책서 평가', 'M9 11l3 3 8-8M20 12v7H4V5h11'],
      ['sup', '협력사 등급', 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],
    ],
  ],
  ['데이터', [['backup', '데이터 · 백업', 'M12 3v12M7 10l5 5 5-5M4 19h16']]],
];
const sv = (t, d, c, blk) =>
  `<div class="srow${blk ? ' blk' : ''}"><div class="si"><div class="st">${t}</div>${d ? `<div class="sd">${d}</div>` : ''}</div>
    <div class="sc">${c}</div></div>`;
const sg = (h, rows) => `${h ? `<div class="sgh">${h}</div>` : ''}<div class="sgrp">${rows}</div>`;
const sNum = (k, unit, min, max) =>
  `<input type="number" class="snum" value="${esc(db.settings[k])}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''} onchange="setS('${k}',this.value,'num',this)">${
    unit ? `<span class="muted">${unit}</span>` : ''
  }`;
const sTxt = (k, ph) => `<input class="stxt" value="${esc(db.settings[k])}" placeholder="${esc(ph || '')}" onchange="setS('${k}',this.value,'str')">`;
const sList = (k, ph) =>
  `<textarea class="slist" placeholder="${esc(ph || '')}" onchange="setS('${k}',this.value,'list')">${esc((db.settings[k] || []).join('\n'))}</textarea>`;
function setFx(c, v) {
  const S = db.settings;
  S.fx = { ...(S.fx || {}) };
  if (String(v).trim() === '') {
    delete S.fx[c];
  } else {
    if (!isFinite(+v) || +v < 0) {
      toast('숫자를 입력하세요');
      setTimeout(render, 0);
      return;
    }
    S.fx[c] = +v;
  }
  if (!S.fxDate) S.fxDate = today();
  save();
  const e = $('#setSaved');
  if (e) {
    e.textContent = '저장됨';
    e.style.opacity = 1;
    setTimeout(() => (e.style.opacity = 0), 1600);
  }
}
function setS(k, v, type, el) {
  const S = db.settings;
  lockSev();
  if (type === 'num') {
    if (String(v).trim() === '' || !isFinite(Number(v))) {
      toast('숫자를 입력하세요 — 이전 값으로 되돌립니다');
      setTimeout(render, 0);
      return;
    }
    let x = Number(v);
    const mn = el && el.min !== '' ? Number(el.min) : null,
      mx = el && el.max !== '' ? Number(el.max) : null;
    if (mn != null && x < mn) {
      x = mn;
      toast(`최소값 ${mn}(으)로 맞췄습니다`);
    }
    if (mx != null && x > mx) {
      x = mx;
      toast(`최대값 ${mx}(으)로 맞췄습니다`);
    }
    S[k] = x;
    if (el) el.value = x;
  } else if (type === 'list') {
    const a = String(v)
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!a.length && k !== 'owners') {
      toast('최소 1개 항목이 필요합니다');
      setTimeout(render, 0);
      return;
    }
    S[k] = [...new Set(a)];
  } else {
    S[k] = String(v).trim();
    const dn = Object.values(DOCNO).find((d) => d.key === k);
    if (dn && !S[k]) S[k] = dn.def;
  }
  const warn = [];
  if (num(S.sevB) >= num(S.sevA)) warn.push('심각도 B 기준은 A 기준보다 작아야 합니다');
  if (!(num(S.gradeA) < num(S.gradeB) && num(S.gradeB) < num(S.gradeC))) warn.push('PPM 등급은 A < B < C 순이어야 합니다');
  if (num(S.evalCond) >= num(S.evalPass)) warn.push('보완요청 기준은 승인 기준보다 작아야 합니다');
  save();
  clearTimeout(setS._t);
  setS._t = setTimeout(() => {
    if (state.tab !== 'data') return;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    const el = $('#setSaved');
    if (el) {
      el.textContent = '✓ 저장됨';
      el.style.opacity = 1;
      setTimeout(() => {
        if (el) el.style.opacity = 0;
      }, 1600);
    }
  }, 0);
  if (warn.length) toast('확인 필요: ' + warn.join(' / '));
}
function setImpact(t, v) {
  db.settings.impactMap = { ...(db.settings.impactMap || {}), [t]: +v };
  save();
  const el = $('#setSaved');
  if (el) {
    el.textContent = '✓ 저장됨';
    el.style.opacity = 1;
    setTimeout(() => {
      if (el) el.style.opacity = 0;
    }, 1600);
  }
}
function renderData() {
  const S = db.settings,
    fsOK = !!window.showSaveFilePicker,
    tab0 = state.setTab === 'storage' ? 'backup' : state.setTab || 'general', // 예전 ‘저장 공간’ 탭은 ‘데이터 · 백업’으로 합침
    tab = tab0 === 'tg' ? 'general' : tab0; // 알림은 관리 화면에 있음
  const cnt = COLLS.map((c) => db[c].length),
    nPh = db.defects.reduce((a, d) => a + (d.photos || []).length, 0);
  const ico = (d) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  const nav = SET_NAV.map(
    ([g, items]) =>
      `<div class="gh">${g}</div>${items
        .map(
          ([k, l, d]) =>
            `<button class="${tab === k ? 'on' : ''}" onclick="state.setTab='${k}';render();window.scrollTo(0,0)">${ico(d)}<span>${l}</span></button>`,
        )
        .join('')}`,
  ).join('');
  const title = SET_NAV.flatMap((x) => x[1]).find((x) => x[0] === tab)?.[1] || '';
  const btn = (lbl, fn, cls = '') => `<button class="b ${cls}" onclick="${fn}">${lbl}</button>`;
  const P = {};
  P.general = () =>
    sg(
      '회사 정보',
      sv('회사명', '상단 바, 보고서, 부적합 통보서(Company)에 표시됩니다.', sTxt('company', '예: 한빛오토')) +
        sv('부서명', '보고서 머리글과 통보서 Department에 표시됩니다.', sTxt('dept', '예: Quality')) +
        sv('발행자 전화', '부적합 통보서 하단 연락처에 표시됩니다.', sTxt('issuerPhone', '예: 031-000-0000')) +
        sv('발행자 이메일', '부적합 통보서 하단 연락처에 표시됩니다.', sTxt('issuerEmail', '예: qa@company.com')),
    ) +
    sg(
      '담당자',
      sv(
        '담당자 목록',
        '불량·NCR 담당자 선택 목록과 서명 등록 대상입니다. 한 줄에 한 명씩 입력합니다. 첫 번째 사람이 기본 담당자가 됩니다.',
        sList('owners', '홍길동'),
        1,
      ),
    );
  P.brand = () =>
    sg(
      '로고',
      sv(
        '회사 로고',
        'PNG(투명 배경)·SVG 권장. 상단 바, 대시보드 보고서, 부적합 통보서, 8D 보고서에 표시됩니다.',
        `<div class="logoprev" style="width:200px;height:70px">${
          S.logo ? `<img src="${S.logo}" alt="로고" style="max-width:180px;max-height:60px">` : '<span class="muted">로고 없음</span>'
        }</div>
      <div style="display:flex;flex-direction:column;gap:6px"><label class="b p" style="cursor:pointer;text-align:center">파일 선택<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/gif,image/webp" style="display:none" onchange="setLogo(this.files[0]);this.value=''"></label>${
        S.logo ? btn('삭제', 'clearLogo()', 'd') : ''
      }</div>`,
      ),
    ) +
    sg(
      '통보서 결재',
      sv('승인자 이름', '부적합 통보서 Name 칸의 ‘승인’에 표시됩니다. 작성자는 NCR 담당자입니다.', sTxt('approver', '예: 홍길동')) +
        ([...new Set([...S.owners, S.approver].filter(Boolean))]
          .map((nm) =>
            sv(
              `${esc(nm)} ${nm === S.approver ? '<span class="bg inf">승인자</span>' : '<span class="bg mut">작성자</span>'}`,
              '흰 종이에 서명 → 사진·스캔 → 올리기. 흰 배경은 자동으로 투명 처리됩니다.',
              `<span class="sigbox">${
                (S.signs || {})[nm] ? `<img src="${S.signs[nm]}">` : '<span class="muted" style="font-size:11px">서명 없음</span>'
              }</span><label class="b" style="cursor:pointer">서명 선택<input type="file" accept="image/*" style="display:none" onchange="setSign(${jsq(nm)},this.files[0]);this.value=''"></label>${
                (S.signs || {})[nm] ? `<button class="b d" onclick="clearSign(${jsq(nm)})">삭제</button>` : ''
              }`,
            ),
          )
          .join('') || sv('서명 대상 없음', '‘일반’에서 담당자 목록이나 위 승인자 이름을 먼저 입력하세요.', '')),
    );
  P.defect = () =>
    sg(
      '분류 항목',
      sv(
        '불량유형',
        '불량 등록 시 선택 목록입니다. 한 줄에 하나씩 입력합니다. 새 유형의 기본 영향도는 ‘심각도 평가’에서 정하세요.',
        sList('defectTypes'),
        1,
      ) +
        sv(
          '발생처',
          '이름에 ‘고객’이 들어가면 외부실패·심각도 A(고객 클레임)로, ‘공정’은 유출 단계 2점, ‘출하’는 3점으로 분류됩니다.',
          sList('sources'),
          1,
        ) +
        sv('처리 방법', '반품·선별·재작업·특채·폐기 등. ‘폐기’는 비용 자동계산에서 수량×단가로 계산됩니다.', sList('dispositions'), 1),
    ) +
    sg(
      '비용 · 사진',
      sv('시간당 인건비', '작업시간 × 인건비로 선별비·재작업비를 자동 계산합니다.', sNum('laborRate', '원', 0)) +
        sv('사진 최대 크기', '첨부 사진의 긴 변을 이 크기로 줄여서 저장합니다.', sNum('photoMax', 'px', 400, 4000)) +
        sv('사진 압축 품질', '낮을수록 용량이 작아집니다. 70~85 권장.', sNum('photoQ', '%', 30, 95)),
    ) +
    sg(
      '환율 (부품 단가 → 원화)',
      sv(
        '사용 방법',
        `해외 부품은 단가를 <b>협력사 통화 그대로</b> 저장하고, 비용 · 구상 · COPQ에서는 아래 환율로 <b>원화로 바꿔</b> 계산합니다. 이미 입력한 비용은 그때 금액 그대로이고, 새로 넣는 비용부터 바뀐 환율이 쓰입니다.${
          db.settings.fxDate
            ? `<br>환율 기준일: <b>${esc(db.settings.fxDate)}</b>`
            : '<br><b style="color:var(--warn)">기본값은 예시입니다 — 회사 기준 환율로 바꾸세요.</b>'
        }`,
        '',
        1,
      ) +
        CURS.filter((c) => c !== 'KRW')
          .map((c) =>
            sv(
              `1 ${c}`,
              CUR_L[c],
              `<input type="number" class="snum" min="0" step="any" value="${esc((db.settings.fx || {})[c] ?? '')}" onchange="setFx('${c}',this.value)"><span class="muted">원</span>`,
            ),
          )
          .join('') +
        sv(
          '환율 기준일',
          '회사 기준 환율을 적용한 날짜 (기록용)',
          `<input type="date" class="stxt" value="${esc(db.settings.fxDate || '')}" onchange="setS('fxDate',this.value,'str')">`,
        ),
    );
  P.sev = () =>
    sg(
      '판정 기준',
      sv('A등급 기준 → 8D 보고서', '영향도·유출 단계·발생 범위·반복성 합계(4~16점)가 이 점수 이상이면 A입니다.', sNum('sevA', '점 이상', 4, 16)) +
        sv('B등급 기준 → 간이 대책서', '이 점수 이상이고 A 기준 미만이면 B, 그 미만은 C(단순 통보)입니다.', sNum('sevB', '점 이상', 4, 16)) +
        sv(
          '강제 A 조건',
          '특별특성(CC/SC), 고객 클레임, 대책 후 재발, 영향도 4(안전·법규)는 점수와 관계없이 A입니다.',
          '<span class="bg bad">고정 규칙</span>',
        ),
    ) +
    sg(
      '자동 산정 기준',
      sv('반복 판정 기간', '같은 협력사·같은 유형 불량을 이 기간 안에서 셉니다.', sNum('repeatWindow', '일', 7, 365)) +
        sv('반복성 3점 기준', '기간 내 이 횟수 이상이면 반복성 3점(3회 이상)입니다.', sNum('ncrRepeat', '회', 2, 10)) +
        sv('발생 범위 ‘LOT 전체’ 기준', '불량 수량이 이 값 이상이거나 입고(로트)수량의 10% 이상이면 발생 범위 3점입니다.', sNum('ncrQty', '개', 1)),
    ) +
    sg(
      '불량유형별 기본 영향도',
      S.defectTypes
        .map((t) =>
          sv(
            esc(t),
            '',
            `<select onchange="setImpact(${jsq(t)},this.value)">${SEV_F.impact[1]
              .map((l, i) => `<option value="${i + 1}" ${impactAuto(t) === i + 1 ? 'selected' : ''}>${i + 1} · ${l}</option>`)
              .join('')}</select>`,
          ),
        )
        .join(''),
    );
  P.docno = () => {
    const row = (k) => {
      const d = DOCNO[k],
        r = db.settings[d.rk] || (k === 'ncr' || k === 'iss' ? 'auto' : 'none');
      return sv(
        `${d.label} 번호`,
        `다음 발행 번호: <b>${esc(genDocNo(k, today()).no)}</b>`,
        `${sTxt(d.key, d.def)} <select title="일련번호 초기화" onchange="setS('${d.rk}',this.value,'str')">${DOC_RESETS.map(
          ([v, l]) => `<option value="${v}" ${r === v ? 'selected' : ''}>${l}</option>`,
        ).join('')}</select>`,
      );
    };
    return (
      sg(
        '형식 기호',
        sv(
          '사용할 수 있는 기호',
          `<code>{YYYY}</code>=2026 · <code>{YYY}</code>=026 · <code>{YY}</code>=26 · <code>{MM}</code>=월 · <code>{DD}</code>=일 · <code>{SEQ3}</code>=일련번호 3자리(001), <code>{SEQ4}</code>=4자리(0001)<br>오른쪽 선택은 <b>일련번호를 1부터 다시 시작하는 기준</b>입니다. ‘형식에 따름’은 형식에 든 가장 작은 날짜 단위(일 › 월 › 연)가 바뀔 때 다시 시작합니다.<br>형식을 바꿔도 <b>이미 발행된 번호는 그대로</b>이고, 새로 만드는 문서부터 적용됩니다.`,
          '',
          1,
        ),
      ) + sg('문서별 번호', row('ncr') + row('rca') + row('i8d') + row('iss'))
    );
  };
  P.ncr = () =>
    sg(
      '기한',
      sv('8D 보고서 회신 기한', '대책 요청일(= NCR 발행일) + 일수가 회신 기한으로 자동 설정됩니다.', sNum('reply8D', '일', 1, 60)) +
        sv('간이 대책서 회신 기한', '대책 요청일 + 일수. 단순 통보는 회신 기한이 없습니다.', sNum('replySimple', '일', 1, 60)) +
        sv(
          'D3 봉쇄 회신 기한',
          '대책 요청일 + 일수. 협력사가 대책서보다 먼저 선별·봉쇄 결과를 회신하는 기한입니다 (1일 = 24시간).',
          sNum('d3Days', '일', 1, 7),
        ) +
        sv(
          '대책서 승인 기한',
          '대책서 회신일 + 일수 안에 평가해 승인 또는 보완요청합니다. NCR 진행 막대에 기한으로 표시됩니다.',
          sNum('approveDays', '일', 1, 30),
        ) +
        sv(
          '유효성 검증 기한',
          '대책 승인일(사내 대책은 대책 완료일) + 일수 안에 대책 효과를 검증합니다. 단순 통보 NCR은 검증 없이 통보하면 종결합니다. 직접 고친 기한은 그대로 둡니다.',
          sNum('verifyDays', '일', 1, 180),
        ) +
        sv(
          '검증 합격 LOT 수',
          '유효성 검증 결과를 ‘유효’로 하려면 검증 LOT 표에 합격 LOT가 이 수 이상이고 불합격이 없어야 합니다. 0이면 확인하지 않습니다.',
          sNum('verifyLots', 'LOT', 0, 10),
        ),
    ) +
    sg(
      'RCA 목표 종결일',
      sv(
        '기준 일수 (TIER별)',
        'RCA 등록일 + 일수가 목표 종결일이 됩니다. RCA마다 기본 탭에서 직접 바꿀 수 있고, 지나면 ‘지연’으로 셉니다.',
        ['T3', 'T2', 'T1', 'T0'].map((t) => `<span class="muted">TIER ${t[1]}</span> ${sNum('rca' + t, '일', 1, 365)}`).join(' &nbsp;'),
      ),
    ) +
    sg(
      '귀책 조사 (FAR · RCA)',
      sv(
        'FAR 회신 기한',
        'FAR 요청일 + 영업일(토·일 제외)이 회신 기한으로 자동 설정됩니다. 불량의 귀책 조사와 NCR의 FAR에 함께 적용됩니다.',
        sNum('farDays', '영업일', 1, 30),
      ) +
        sv(
          '원인 불명 종결 검토 기한',
          '불량 등록일 + 일수가 지나도 귀책을 판정하지 못하면 대시보드에 ‘원인 불명 검토’로 표시됩니다.',
          sNum('ntfDays', '일', 7, 180),
        ),
    );
  P.eval = () =>
    sg(
      '판정 기준',
      sv('승인 기준', '총점이 이 점수 이상이면 승인(대책 타당성 ‘적정’)입니다.', sNum('evalPass', '점 이상', 0, 100)) +
        sv(
          '보완요청 기준',
          '이 점수 이상이고 승인 기준 미만이면 보완요청, 그 미만은 반려입니다. 필수 항목이 미흡이면 점수와 관계없이 반려입니다.',
          sNum('evalCond', '점 이상', 0, 100),
        ) +
        sv(
          '에스컬레이션 기준',
          '대책서 보완요청·반려와 유효성 검증 무효를 합친 횟수가 이 값 이상이면 대시보드와 NCR 목록에 에스컬레이션으로 표시됩니다.',
          sNum('escCount', '회 이상', 1, 10),
        ),
    ) +
    [
      ['8D 보고서 평가표', EVAL_ITEMS],
      ['간이 대책서 평가표', EVAL_SIMPLE],
    ]
      .map(([h, items]) =>
        sg(
          h,
          items
            .map((it) =>
              sv(
                `${it.t} ${it.must ? '<span class="bg bad">필수</span>' : ''}`,
                it.c.map(esc).join(' · '),
                `<b>${it.w}</b><span class="muted">점</span>`,
              ),
            )
            .join(''),
        ),
      )
      .join('');
  P.sup = () =>
    sg(
      'PPM 초과 SCAR 권고',
      sv(
        '권고 기준 PPM',
        '협력사·공동 귀책 불량 기준 월 PPM이 이 값을 넘으면 초과로 봅니다. 0이면 권고하지 않습니다.',
        sNum('ppmScar', 'PPM 초과', 0),
      ) +
        sv(
          '연속 개월',
          '최근 완료된 달부터 이 개월 수만큼 연속으로 초과하면 대시보드에 NCR(8D) 발행을 권고합니다.',
          sNum('ppmScarMonths', '개월', 1, 12),
        ),
    ) +
    sg(
      'PPM 등급 기준',
      sv('A등급', '협력사 귀책 불량수량 ÷ 입고수량 × 1,000,000 이 값 이하', sNum('gradeA', 'PPM 이하', 0)) +
        sv('B등급', '', sNum('gradeB', 'PPM 이하', 0)) +
        sv('C등급', '이 값을 넘으면 D등급입니다.', sNum('gradeC', 'PPM 이하', 0)),
    );
  P.backup = srvPanel;
  return `<div class="set"><aside class="snav">${nav}</aside><section class="spane"><div class="row" style="margin-bottom:6px"><h2>${title}</h2><span style="flex:1"></span><span id="setSaved" class="muted" style="opacity:0;transition:opacity .4s;font-size:12px"></span></div>${(P[tab] || P.general)()}<div class="help" style="margin:-8px 4px 20px">설정은 값을 바꾸면 바로 저장됩니다.</div></section></div>`;
}
// 읽기 전용 공유 파일: 이 앱 + 지금 데이터(사진 포함)를 HTML 파일 하나로
// 공유본에서 기준정보 빼기: 기록(불량 · NCR · 입고)에 쓰인 협력사 · 부품의 이름만 남기고
// 연락처 · 주소 · 담당자 이력 · 단가 · 주요 품목 · BOM · 기록에 안 쓰인 협력사 · 부품은 넣지 않음
function shareStrip(src) {
  const d = JSON.parse(JSON.stringify(src));
  const recs = [...d.defects, ...d.ncrs, ...d.receipts, ...(d.cases || [])];
  const supIds = new Set(recs.map((r) => r.supplierId || r.SupplierId).filter(Boolean));
  const pIds = new Set(recs.map((r) => r.partId || r.PartId).filter(Boolean)),
    pNos = new Set(
      recs
        .map((r) => r.partNo)
        .filter(Boolean)
        .map(mkey),
    );
  d.parts = d.parts
    .filter((p) => pIds.has(p.id) || pNos.has(mkey(p.partNo)))
    .map((p) => ({ id: p.id, partNo: p.partNo, name: p.name, model: p.model, supplierId: p.supplierId, safety: p.safety }));
  d.parts.forEach((p) => {
    if (p.supplierId) supIds.add(p.supplierId);
  });
  d.suppliers = d.suppliers
    .filter((x) => supIds.has(x.id))
    .map((x) => ({ id: x.id, code: x.code, name: x.name, short: x.short, country: x.country, region: x.region, contacts: [], contactLog: [] }));
  d.bom = { updatedAt: '', fg: {}, rows: [] };
  return d;
}
async function makeShareFile() {
  if (!APP_SRC || !APP_SRC.includes('<head>')) {
    toast('이 화면에서는 공유 파일을 만들 수 없습니다');
    return;
  }
  toast('읽기 전용 공유 파일을 만드는 중… (사진이 많으면 시간이 걸립니다)');
  let photos = [];
  try {
    photoStr = null; // 서버에서 지금 사진을 다시 받음
    photos = (await photoList()).filter((p) => p && !phIsPending(p));
  } catch (e) {
    toast('사진을 읽지 못해 공유 파일을 만들지 못했습니다: ' + e.message);
    return;
  }
  const S = db.settings,
    noMaster = num(S.shareNoMaster) !== 0,
    meta = {
      created: now(),
      by: (S.owners || [])[0] || '',
      company: S.company || '',
      ver: typeof APP_VER !== 'undefined' ? APP_VER : '',
      photos: photos.length,
      noMaster,
    };
  const data = JSON.stringify({ meta, db: noMaster ? shareStrip(db) : db, photos }).replace(/</g, '\\u003c');
  const html = APP_SRC.replace('<head>', '<head>\n<script id="qmsShare" type="application/json">' + data + '<\/script>');
  download(`QIS_읽기전용_${today()}.html`, html, 'text/html;charset=utf-8');
  toast(
    `읽기 전용 공유 파일 ${(html.length / 1048576).toFixed(1)}MB를 만들었습니다 (사진 · 첨부 ${photos.length}개 포함)${noMaster ? ' (기준정보 제외)' : ''} — 메일 · Teams · 공유 폴더로 보내세요`,
  );
}
// 전체 백업 내려받기 (관리자) — 서버가 만든 백업 파일
function exportJSON() {
  if (!srvCanAdmin()) return srvAdminOnly();
  location.href = '/api/admin/export?photos=1';
}
