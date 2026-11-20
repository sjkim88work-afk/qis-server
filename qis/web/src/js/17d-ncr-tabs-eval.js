// ── NCR — 창의 탭 · 단계 화면 · 요구 유형 · 대책서 평가 ──
// solo: 목록의 단추(발행 정보 · 회신 · 검증)로 단계를 골라 연 창 — 그 단계만 보이고, 단계 전환 줄은 넣지 않음
function ncrTabsBar(id, n, solo) {
  const fl = id ? ncrFlags(n) : {},
    dot = { reply: fl.d3Late || fl.replyLate, verify: fl.verifyLate };
  const lg = (n.logs || []).length;
  const modes =
    id && !solo
      ? `<div class="nmodes" id="ncrModes" role="tablist" aria-label="NCR 화면">${Object.entries(NCR_MODES)
          .map(
            ([k, m]) =>
              `<button type="button" data-m="${k}" onclick="ncrMode('${k}')">${m.l}${dot[k] ? '<i class="tdot" title="기한 경과"></i>' : ''}</button>`,
          )
          .join('')}</div>`
      : '';
  const dotT = { t: id && notifyLate(n), r: fl.replyLate, b: fl.d3Late, c: fl.verifyLate };
  return (
    modes +
    `<div class="dtabs" id="ncrTabs" role="tablist">${NCR_TABS.map(
      ([k, l]) =>
        `<button type="button" role="tab" data-t="${k}" onclick="ncrTab('${k}')">${l}${
          k === 'd' && lg ? ` <span class="mono" style="opacity:.7">${lg}</span>` : ''
        }${dotT[k] ? '<i class="tdot" title="기한 경과"></i>' : ''}</button>`,
    ).join('')}</div>`
  );
}
function ncrModeDefault(n, id) {
  if (!id) return 'issue';
  const st = ncrStatus(n);
  if (['대책요청', '대책서 검토', '보완요청'].includes(st)) return 'reply';
  if (n.reqType === '단순 통보' && !n.verifyDate) return 'issue';
  if (['승인(검증대기)', '검증 무효', '종결'].includes(st)) return 'verify';
  return 'issue';
}
function ncrMode(m, tab) {
  if (!NCR_MODES[m]) m = 'issue';
  const f = $('#mf');
  if (!f) return;
  if (m === 'reply' && f.reqType && f.reqType.value === '단순 통보') m = 'issue';
  ncrModeCur = m;
  const M = NCR_MODES[m],
    tabs = M.tabs.filter((k) => k !== 'd' || ncrCurId);
  document.querySelectorAll('#ncrTabs [data-t]').forEach((b) => {
    b.style.display = tabs.includes(b.dataset.t) ? '' : 'none';
  });
  document.querySelectorAll('#ncrModes [data-m]').forEach((b) => b.setAttribute('aria-selected', b.dataset.m === m ? 'true' : 'false'));
  const mt = $('#mt');
  if (mt && ncrCurId) {
    const st = mt.querySelector('.qstamp');
    mt.textContent = `NCR ${ncrCurNo} — ${M.t}`;
    if (st) mt.appendChild(st);
  }
  ncrFoot(m);
  ncrTab(tab && tabs.includes(tab) ? tab : tabs[0], true);
}
function ncrFoot(m) {
  const id = ncrCurId,
    f = $('#mfoot');
  if (!f) return;
  const n = id && db.ncrs.find((x) => x.id === id);
  const B = [];
  if (id && m === 'issue')
    B.push({
      label: '삭제',
      cls: 'd',
      left: 1,
      fn: async () => {
        await delNcr(id);
        if (!db.ncrs.find((x) => x.id === id)) closeModal(true);
      },
    });
  // 협력사 회신 단계는 입력만(취소 · 저장). 8D 출력은 검증 · 종결 단계에서, RCA 요청은 연결 불량의 진행 창에서 함
  if (id && m === 'verify')
    B.push({
      label: '8D 출력',
      fn: () => {
        const nid = mfDirty ? saveNcr(id) : id;
        if (nid) print8D(nid);
      },
    });
  if (id && m !== 'reply' && a3ReadyNcr(n)) B.push({ label: 'A3 보고서', fn: () => a3Report('ncr', id) }); // 단순 통보 종결 · 대책 승인 뒤에만
  B.push({ label: '취소', fn: closeModal });
  if (id && m === 'issue' && RO) B.push({ label: '통보서 출력', fn: () => printNotice(id) }); // 조회 권한: 저장 없이 출력만
  if (m === 'issue')
    B.push({
      label: id ? '저장 후 통보서 출력' : '발행 후 통보서 출력',
      fn: () => {
        const nid = saveNcr(id);
        if (nid) printNotice(nid);
      },
    });
  B.push({ label: id ? '저장' : '발행', cls: 'p', fn: () => saveNcr(id) });
  modalFoot(B);
}
function ncrTab(k, fromMode) {
  const f = $('#mf');
  if (!f) return;
  // 다른 화면에 있는 칸으로 이동해야 하면 화면부터 바꿈 (저장 검사에서 빠진 칸 안내 등)
  if (!fromMode && k !== 'd' && !NCR_MODES[ncrModeCur].tabs.includes(k)) {
    const m = Object.keys(NCR_MODES).find((x) => NCR_MODES[x].tabs.includes(k));
    if (m) return ncrMode(m, k);
  }
  ncrTabCur = k;
  f.querySelectorAll('.ntp').forEach((el) => {
    el.hidden = el.dataset.p !== k;
  });
  document.querySelectorAll('#ncrTabs [data-t]').forEach((b) => b.setAttribute('aria-selected', b.dataset.t === k ? 'true' : 'false'));
  const mb = $('#mbody');
  if (mb) {
    const t = $('#ncrTabs');
    if (t && mb.scrollTop > t.offsetTop) mb.scrollTop = t.offsetTop - 8;
  }
}
function applyReqType(changed) {
  const f = $('#mf');
  if (!f || !f.reqType) return;
  const t = f.reqType.value,
    info = t === '단순 통보',
    simple = t === '간이 대책서';
  $('#dueHint').textContent = info ? '(단순 통보: 없음)' : `(요청+${typeDays(t)}일)`;
  if (changed && !info && !f.requestDate.value && f.issueDate.value) f.requestDate.value = f.issueDate.value;
  if (changed && f.requestDate.value && !info) f.dueDate.value = addDays(f.requestDate.value, typeDays(t));
  if (changed && f.d3Due) {
    if (info) f.d3Due.value = '';
    else if (f.requestDate.value && !f.d3Due.value) f.d3Due.value = d3DefaultDue(f.requestDate.value);
  }
  if (info) f.dueDate.value = '';
  f.dueDate.disabled = info;
  {
    const v = $('#vfInfo');
    if (v) v.hidden = !info;
    const l = f.verifyDue && f.verifyDue.closest('label');
    if (l) l.style.display = info ? 'none' : '';
    if (info && changed && f.verifyDue) f.verifyDue.value = '';
  }
  // 단순 통보는 회신 · 평가가 없으므로 해당 칸을 숨김
  ['replyDate', 'validity'].forEach((k) => {
    const e = f[k];
    const l = e && e.closest('label');
    if (l) l.style.display = info ? 'none' : '';
  });
  {
    const ev = $('#evalWrap');
    if (ev) ev.style.display = info ? 'none' : '';
  }
  {
    const mb = document.querySelector('#ncrModes [data-m="reply"]');
    if (mb) mb.style.display = info ? 'none' : '';
    if (info && ncrModeCur === 'reply') ncrMode('issue');
  }
  {
    const w3 = $('#d3Wrap');
    if (w3) w3.style.display = info ? 'none' : '';
  }
  document.querySelectorAll('[data-dk]').forEach((el) => {
    const k = el.dataset.dk;
    el.style.display = info ? 'none' : simple && !['d4', 'd5', 'd6'].includes(k) ? 'none' : '';
    const lb = el.querySelector('.dl');
    if (lb) lb.textContent = simple ? { d4: '원인 (발생·유출)', d5: '대책 내용', d6: '적용일·효과 확인' }[k] || lb.dataset.o : lb.dataset.o;
  });
  const w8 = $('#wrap8D');
  if (w8) {
    w8.style.display = info ? 'none' : '';
    const sm = w8.querySelector('.ttl');
    if (sm) sm.textContent = simple ? '협력사 간이 대책서 회신 내용' : '협력사 대책서 (8D) 회신 내용';
  }
  const rec = curNcrSev && curNcrSev.resp;
  $('#rtWarn').innerHTML =
    rec && rec !== t
      ? `<div class="banner" style="margin:0">권장 대응은 <b>${rec}</b>인데 <b>${t}</b>로 바꿨습니다. 사유를 Remark나 비고에 남겨 두세요.</div>`
      : '';
  if (changed) {
    const r = f.requirements;
    if (
      !r.value.trim() ||
      REQ_TYPES.some(
        (x) =>
          r.value.trim() ===
          defaultReq(x, f.dueDate.value || ncrDue({ reqType: x, issueDate: f.issueDate.value, requestDate: f.requestDate.value })).trim(),
      )
    )
      r.value = '';
    renderEval();
  }
}
/* ---- 대책서(8D) 평가 기준 ---- */
const EVAL_ITEMS = [
  { k: 'd1', t: 'D1 팀 구성', w: 5, c: ['품질·생산·기술 등 다기능팀 구성', '팀 리더(책임자)와 역할 명시'] },
  { k: 'd2', t: 'D2 문제 기술', w: 10, c: ['5W2H로 현상 기술 (언제·어디서·무엇·얼마나)', '불량 수량·LOT·발생 범위 정량화', '당사 통보 내용과 일치'] },
  {
    k: 'd3',
    t: 'D3 임시조치',
    w: 15,
    c: ['의심 재고 전수 선별 (공장·창고·운송·당사)', '선별 기준과 결과 수량(OK/NG) 제시', '선별품 식별 표시, 24시간 내 착수'],
    must: 1,
  },
  {
    k: 'd4',
    t: 'D4 근본원인',
    w: 25,
    c: ['발생원인과 유출원인을 각각 규명', '5Why·특성요인도 등 분석 근거 제시', '재현시험·측정 데이터로 원인 검증'],
    must: 1,
  },
  {
    k: 'd5',
    t: 'D5 영구대책',
    w: 15,
    c: ['원인별 대책이 1:1로 대응 (발생·유출 각각)', '일시 대책(교육·주의)이 아닌 구조적 대책', '대책별 담당자·완료일 명시'],
  },
  {
    k: 'd6',
    t: 'D6 실행·효과 확인',
    w: 15,
    c: ['대책 적용일·적용 LOT 명시', '효과 검증 데이터 (전후 비교·Cpk·검사 결과)', '사진·성적서 등 증빙 첨부'],
  },
  { k: 'd7', t: 'D7 재발방지', w: 10, c: ['PFMEA·관리계획서·작업표준서 개정 증빙', '유사 품목·라인 수평전개'] },
  { k: 'd8', t: 'D8 종결·기한 준수', w: 5, c: ['회신 기한 내 제출', '작성·승인 서명 완료'] },
];
const EVAL_SIMPLE = [
  { k: 's1', t: '원인 규명', w: 35, c: ['발생원인과 유출원인 명시', '원인의 근거(데이터·확인 결과) 제시'], must: 1 },
  { k: 's2', t: '대책 내용', w: 30, c: ['원인에 대응하는 대책', '교육·주의 수준이 아닌 실질적 대책'], must: 1 },
  { k: 's3', t: '적용 일정', w: 15, c: ['대책 적용일·적용 LOT 명시', '작업표준 등 반영 여부'] },
  { k: 's4', t: '효과 확인', w: 20, c: ['적용 후 검사 결과·사진 등 증빙', '회신 기한 준수'] },
];
const evItems = (e) => (e && e.type === '간이 대책서' ? EVAL_SIMPLE : EVAL_ITEMS);
const EV_LV = [
  [0, '✕', '미흡'],
  [0.5, '△', '부분'],
  [1, '○', '충족'],
];
let curEvals = [],
  curEvIdx = 0;
function evalScore(e) {
  return Math.round(evItems(e).reduce((a, it) => a + (e.sc && e.sc[it.k] != null ? e.sc[it.k] * it.w : 0), 0));
}
function evalDone(e) {
  return evItems(e).every((it) => e.sc && e.sc[it.k] != null);
}
function evalVerdict(e) {
  if (!evalDone(e)) return '';
  const S = db.settings,
    t = evalScore(e);
  if (evItems(e).some((it) => it.must && e.sc[it.k] === 0)) return '반려';
  return t >= num(S.evalPass) ? '승인' : t >= num(S.evalCond) ? '보완요청' : '반려';
}
const VD_CLS = { 승인: 'ok', 보완요청: 'warn', 반려: 'bad' };
const latestEval = (n) => (n.evals || []).filter((e) => evalDone(e)).slice(-1)[0];
function renderEval() {
  const b = $('#evalBox');
  if (!b) return;
  const S = db.settings;
  if ($('#mf')?.reqType?.value === '단순 통보' && !curEvals.length) {
    b.innerHTML = '<div class="muted">단순 통보 건은 대책서 회신·평가 대상이 아닙니다.</div>';
    return;
  }
  if (!curEvals.length) {
    b.innerHTML = `<div class="row"><span class="muted">아직 평가하지 않았습니다. 대책서를 받으면 평가를 시작하세요.</span><button type="button" class="b s p" onclick="addEval()">대책서 평가 시작</button></div>`;
    return;
  }
  const e = curEvals[curEvIdx],
    t = evalScore(e),
    vd = evalVerdict(e),
    done = evalDone(e);
  b.innerHTML = `<div class="row" style="margin-bottom:6px">${curEvals
    .map(
      (x, i) =>
        `<button type="button" class="b s ${i === curEvIdx ? 'p' : ''}" onclick="curEvIdx=${i};renderEval()">${i + 1}차${x.type === '간이 대책서' ? '(간이)' : ''}${
          evalDone(x) ? ` · ${evalScore(x)}점 ${evalVerdict(x)}` : ' · 작성중'
        }</button>`,
    )
    .join('')}
    <button type="button" class="b s" onclick="addEval()" title="협력사가 보완해서 다시 제출한 대책서 평가">+ 재제출 평가</button><span style="flex:1"></span>
    <label class="fgl" style="flex-direction:row;align-items:center;gap:4px">평가일<input type="date" value="${esc(e.date)}" onchange="curEvals[${curEvIdx}].date=this.value;mfDirty=true"></label>
    <label class="fgl" style="flex-direction:row;align-items:center;gap:4px">평가자<input value="${esc(e.by)}" list="dlOwners" style="width:90px" oninput="curEvals[${curEvIdx}].by=this.value;mfDirty=true"></label>
    ${curEvals.length > 1 || !done ? `<button type="button" class="b s d" onclick="delEval()">이 회차 삭제</button>` : ''}</div>
  <table class="ct evt"><thead><tr><th>항목</th><th class="n">배점</th><th>점검 기준</th>
    <th>평가</th><th class="n">점수</th><th>의견 (보완 요청 사항)</th></tr></thead><tbody>
  ${evItems(e)
    .map((it) => {
      const v = e.sc?.[it.k];
      return `<tr><td style="white-space:nowrap"><b>${it.t}</b>${
        it.must ? '<br><span class="bg bad" title="미흡이면 총점과 관계없이 반려">필수</span>' : ''
      }</td><td class="n">${it.w}</td>
    <td style="font-size:11.5px;color:#3d4659;line-height:1.5">${it.c.map((x) => '· ' + esc(x)).join('<br>')}</td>
    <td style="white-space:nowrap">${EV_LV.map(
      ([val, sym, lb]) =>
        `<button type="button" class="b s evb ${
          v === val ? 'on' + String(val).replace('.', '') : ''
        }" onclick="setEv('${it.k}',${val})" title="${lb}">${sym} ${lb}</button>`,
    ).join(' ')}</td>
    <td class="n"><b>${v == null ? '-' : Math.round(v * it.w)}</b></td>
    <td><input value="${esc(e.cm?.[it.k])}" style="width:100%;min-width:150px" placeholder="${v === 1 || v == null ? '' : '보완 요청 내용'}" oninput="(curEvals[${curEvIdx}].cm=curEvals[${curEvIdx}].cm||{})['${it.k}']=this.value;mfDirty=true"></td></tr>`;
    })
    .join('')}
  </tbody><tfoot><tr><td colspan="4" style="text-align:right"><b>총점</b> <span class="muted" style="font-size:12px">(승인 ≥ ${S.evalPass} · 보완요청 ≥ ${S.evalCond} · 그 미만 또는 필수항목 미흡은 반려)</span></td>
    <td class="n" style="font-size:16px"><b>${t}</b></td><td>${
      done
        ? `<span class="bg ${VD_CLS[vd]}" style="font-size:13px;padding:3px 12px">${vd}</span> <span class="muted" style="font-size:12px">→ 저장 시 대책 타당성 ‘${vd === '승인' ? '적정' : '보완요청'}’ 반영</span>`
        : `<span class="muted">${evItems(e).filter((it) => e.sc?.[it.k] == null).length}개 항목 미평가</span>`
    }</td></tr>
  <tr><td colspan="6"><input value="${esc(e.note)}" style="width:100%" placeholder="종합 의견 (예: D4 유출원인 미규명 — 검사 공정 누락 원인 보완 후 10/30까지 재제출)" oninput="curEvals[${curEvIdx}].note=this.value;mfDirty=true"></td></tr></tfoot></table>`;
}
function setEv(k, v) {
  const e = curEvals[curEvIdx];
  e.sc = e.sc || {};
  e.sc[k] = e.sc[k] === v ? null : v;
  if (e.sc[k] == null) delete e.sc[k];
  mfDirty = true;
  renderEval();
}
function addEval() {
  const f = $('#mf'),
    sc = {};
  const type = f.reqType.value === '간이 대책서' ? '간이 대책서' : '8D 보고서';
  if (!curEvals.length && type === '8D 보고서') {
    const rd = f.replyDate.value,
      due = f.dueDate.value;
    if (rd && due) sc.d8 = rd <= due ? 1 : 0.5;
  }
  curEvals.push({ id: uid(), type, date: today(), by: db.settings.owners[0] || '', sc, cm: {}, note: '' });
  curEvIdx = curEvals.length - 1;
  mfDirty = true;
  renderEval();
  const d = $('#evalWrap');
  if (d && !d.open) d.open = true;
}
async function delEval() {
  if (!(await askConfirm({ title: `${curEvIdx + 1}차 평가를 삭제할까요?`, note: 'NCR 창에서 저장해야 반영됩니다.' }))) return;
  curEvals.splice(curEvIdx, 1);
  curEvIdx = Math.max(0, curEvals.length - 1);
  mfDirty = true;
  renderEval();
}
const STOCK_DEF = ['Customer', 'W/H'];
const REQ_TYPES = ['8D 보고서', '간이 대책서', '단순 통보'];
/* ---- FAR (불량 분석 요청 · 선택) : 반품 시료의 고장 분석을 협력사에 요청하고 결과를 받음 ---- */
const FAR_PURPOSE = ['귀책 판정', '고장 원인 규명', '재현 시험', '재질·성분 확인', '기타'];
const FAR_ITEMS = ['외관 관찰', '치수 측정', '파단면·단면 분석', '재질·성분 분석', '기능·재현 시험', '공정·이력 추적'];
const FAR_VERDICT = ['협력사 귀책 인정', '귀책 불인정', '원인 불명·재현 안 됨', '추가 분석 필요'];
const FAR_REVIEW = ['수용', '재분석 요청', '반박 자료 준비'];
const farOn = (n) => !!(n && n.far && n.far.reqDate);
