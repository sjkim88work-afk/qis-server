// ── 불량 — 등록 · 수정 창 (화면) ──
function editDefect(id, copy, preset) {
  const S = db.settings;
  if (!preset) issPend = null;
  let d = id
    ? { ...db.defects.find((x) => x.id === id) }
    : { date: today(), source: S.sources[0], resp: /수입/.test(S.sources[0]) ? '협력사' : '미정', owner: S.owners[0] || '' };
  if (!id && preset) d = { ...d, ...preset };
  if (copy) {
    d = {
      ...d,
      date: today(),
      status: '',
      doneDate: '',
      closed: undefined,
      ncrId: '',
      qty: '',
      lot: '',
      delivDate: '',
      costs: [],
      claim: undefined,
      photos: [],
      inv: undefined,
      ica: undefined,
      logs: [],
      sevLock: undefined,
      sev: d.sev ? { impact: d.sev.impact, special: d.sev.special } : undefined,
    };
    id = null;
  }
  const iss = d.issueId && issById(d.issueId);
  const body = `${
    iss
      ? `<div class="banner" style="background:var(--pri2);border-color:#c9d8f2;color:#1d2433;margin-bottom:10px">이슈 <b>${esc(iss.no)}</b> ${esc(iss.title)}${
          id ? '' : ' — 이슈 내용 · 사진을 채웠습니다. 불량 유형 · 처리를 확인하고 저장하세요'
        }</div>`
      : ''
  }<div class="fgrp"><div class="gh">발생 정보</div><div class="fg fg4">
    <label>발생일 *<input type="date" name="date" value="${esc(d.date)}"></label>
    <label>발생처<select name="source" onchange="srcLayout();rcvHint();setTimeout(escShow)">${opts(S.sources, d.source)}</select></label>
    <label>차종<input name="model" value="${esc(d.model)}"></label>
    <label>담당자<input name="owner" list="dlOwners" value="${esc(d.owner)}"></label>
  </div></div>
  <div class="fgrp fgfound" id="grpFg"><div class="gh">발견 품목 (완성품 · ASSY) <span class="muted">공정 · 출하검사 · 고객에서 완성품으로 발견된 경우</span></div><div class="fg fg4">
    <label>완성품 품번<input name="fgNo" data-combo="fg" value="${esc(d.fgNo)}" oninput="onFgNo(this.value)" autocomplete="off" placeholder="완성품에서 발견된 경우 (선택)"></label>
    <label>완성품 품명<input name="fgName" value="${esc(d.fgName)}" placeholder="예: FRT DOOR MODULE LH"></label>
    <label>영향 완성품 수량<input type="number" min="0" name="fgQty" value="${esc(d.fgQty)}" placeholder="영향받은 완성품 수"></label>
  </div></div>
  <div class="fgrp fgpart"><div class="gh"><span id="grpPartH">원인 · 의심 부품</span> <span class="muted" id="grpPartS"></span></div><div class="fg fg4">
    <label><span class="lt" id="lbPn">원인·의심 품번</span><input name="partNo" data-combo="dparts" value="${esc(d.partNo)}" oninput="onPartNo(this.value)" autocomplete="off" placeholder="번호·품명·협력사로 검색"></label>
    <label><span class="lt" id="lbPm">원인·의심 품명</span><input name="partName" value="${esc(d.partName)}"></label>
    <label>협력사<span class="row" style="flex-wrap:nowrap"><select name="supplierId" style="flex:1">${supOpts(d.supplierId)}</select><button type="button" class="b s" onclick="quickSup()" title="협력사 빠른 추가">+</button></span></label>
    <label><span class="lt" id="lbDv">납품일자</span><input type="date" name="delivDate" value="${esc(d.delivDate)}">${
      d.lot && !d.delivDate ? `<input type="hidden" name="lot" value="${esc(d.lot)}"><span style="font-size:11px">기존 LOT: ${esc(d.lot)}</span>` : ''
    }</label>
  </div></div>
  <div id="bomBox"></div><div id="rcvBox"></div>
  <div class="fgrp"><div class="gh">불량</div><div class="fg fg4">
    <label>불량유형<select name="type">${opts(S.defectTypes, d.type)}</select></label>
    <label><span class="lt" id="lbQty">불량수량</span><input type="number" min="0" name="qty" value="${esc(d.qty)}"></label>
    <label><span class="lt" id="lbInsp">입고수량 (로트)</span><input type="number" min="0" name="inspQty" value="${esc(d.inspQty)}"></label>
    <label>진행 단계 (자동)<span style="padding:4px 0">${
      id ? stageBadges(db.defects.find((x) => x.id === id)).replace('<br>', ' ') : '<span class="bg warn">처리 대기</span>'
    }</span></label>
  </div></div>
  <div class="fg">
    <label style="grid-column:span 2" title="NCR 통보서의 Specification(도면사양) 칸으로 들어갑니다">도면 규격 (Specification)<textarea name="spec" style="min-height:44px" placeholder="예: Ø12.0 ±0.05 / 작동력 3 ~ 5 N / 스크래치 없을 것">${esc(d.spec)}</textarea></label>
    <label style="grid-column:span 2" title="NCR 통보서의 Actual(실제) 칸으로 들어갑니다">실측 · 실제 (Actual)<textarea name="actual" style="min-height:44px" placeholder="예: Ø12.12 (n=5 중 최대) / 작동력 8.2 N / 길이 3mm 스크래치">${esc(d.actual)}</textarea></label>
    <label class="full">불량 내용 (현상)<textarea name="desc">${esc(d.desc)}</textarea></label>
    <label class="full">임시조치 (봉쇄 · 재고 처리)<textarea name="containment">${esc(d.containment)}</textarea></label>
    <label>처리<select name="disposition">${opts(S.dispositions, d.disposition, true)}</select></label>
    <label>귀책<select name="resp" onchange="respChanged()">${opts(RESP_OPTS, d.resp)}</select></label>
    <label id="escRow" title="공정 · 출하 · 고객에서 발견된 협력사 귀책 불량 — 샘플링 한계면 사내 RCA 없이 협력사 8D에 유출 원인 · 출하검사 대책 요구">수입검사 검출 판정<select name="escJudge"><option value="">판정 전</option>${ESC_JUDGE.map(
      (x, i) => `<option value="${x}" ${d.escJudge === x ? 'selected' : ''}>${'①②③'[i]} ${x}</option>`,
    ).join('')}</select></label>
    <label>처리 완료일 <span style="font-size:11px">(NCR 없는 건)</span><input type="date" name="doneDate" value="${esc(d.doneDate)}"></label>
    <label class="row" style="flex-direction:row;align-items:center;gap:6px;margin-top:16px"><input type="checkbox" name="closedChk" ${d.closed ? 'checked' : ''} onchange="$('#closeRsn').style.display=this.checked?'':'none'"> 수동 종결 (예외)</label>
    <label class="full" id="closeRsn" style="${d.closed ? '' : 'display:none'}">수동 종결 사유 (필수 · 진행 기록에 남습니다)<input name="closedReason" value="${esc(d.closed?.reason)}" placeholder="예: 중복 등록, 고객 특채 확정, 오판정 확인 등"></label>
  </div>
  <div class="help" style="margin-top:6px">진행 단계는 자동으로 정해집니다 — 귀책 <b>미정</b>이면 FAR 화면에서 판정, <b>협력사</b>(A·B)는 NCR → 대책서 승인 시 완료, <b>사내</b>는 사내 대책(A: 8D · B: 간이) 완료 시 완료, <b>공동</b>은 분담 비율 입력 후 처리 완료일로 완료, 그 밖(C등급·고객 귀책)은 <b>처리 완료일</b> 입력 시 완료. 유효성 검증은 완료와 별도로 표시됩니다.</div>
  ${
    id
      ? (() => {
          const n = (d.logs || []).length,
            l = lastLog(d),
            nx = [];
          return `<div class="banner" style="background:var(--pri2);border-color:#c9d8f2;color:#1d2433;margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">📝 <b>조사 · 진행 기록 ${n}건</b>${
            l
              ? ` <span class="muted">최근 ${esc(l.date)} ${esc(l.kind)}: ${esc(l.text.slice(0, 40))}${l.text.length > 40 ? '…' : ''}</span>`
              : ' <span class="muted">아직 없음</span>'
          }${
            nx.length ? ` <span class="bg warn">다음 행동: ${esc(nx[0].text)}</span>` : ''
          }<span style="flex:1"></span><button type="button" class="b s p" onclick="gotoProgress('${d.id}')">진행 보기 · 기록 추가</button></div>`;
        })()
      : ''
  }
  ${id ? '<div id="routeBox"></div>' : ''}
  <details id="sevWrap" ${(() => {
    try {
      return localStorage.getItem('qms_sevOpen') === '0' ? '' : 'open';
    } catch (e) {
      return 'open';
    }
  })()} ontoggle="try{localStorage.setItem('qms_sevOpen',this.open?'1':'0')}catch(e){}" style="margin-top:14px"><summary class="sec" style="cursor:pointer;list-style:revert">심각도 평가 <span id="sevSum"></span> <span class="muted" style="font-weight:normal;font-size:12px">유출 단계·반복성은 자동, 영향도·범위는 유형·수량으로 초기값 → 필요 시 조정</span></summary>
  <div id="sevBox"></div></details>
  <details id="costWrap" ${
    (d.costs || []).length || d.claim ? 'open' : ''
  } style="margin-top:14px"><summary class="sec" style="cursor:pointer;list-style:revert">비용 · 구상 <span class="muted" style="font-weight:normal;font-size:12px">— 처리가 끝난 뒤 입력해도 됩니다 (불량 목록의 비용 칸·COPQ 탭에서도 입력 가능)</span></summary><div id="costBox"></div></details>
  <div class="sec">사진 <span class="muted" style="font-weight:normal;font-size:12px">클릭해서 선택 · 파일을 끌어다 놓기 · 캡처 후 Ctrl+V 붙여넣기 (자동으로 축소·압축 저장)</span></div>
  <div id="photoBox"></div>
`;
  const btns = [
    { label: '취소', fn: closeModal },
    { label: '저장', cls: 'p', fn: () => saveDefect(id) },
  ];
  // NCR 발행은 불량 등록과 별도 — ‘다음 단계’의 NCR 발행 · 불량 목록의 발행 단추 · NCR 탭에서 함
  if (id) btns.unshift({ label: '삭제', cls: 'd', fn: () => delDefect(id) });
  openModal(id ? '불량 상세' : '불량 등록', body, btns);
  initPhotoBox(copy ? [] : d.photos || []);
  srcLayout();
  {
    const f = $('#mf');
    ['fgNo', 'fgName'].forEach((k) => f[k] && f[k].addEventListener('input', srcLayout));
  }
  curRcvId = copy ? '' : d.rcvId || '';
  bomDefect();
  rcvHint();
  // 새 불량: 발생처가 수입검사면 귀책 기본 '협력사', 공정·출하·고객이면 '미정' (귀책을 직접 고르기 전까지)
  if (!id) {
    const f = $('#mf');
    let touched = false;
    f.resp.addEventListener('change', () => {
      touched = true;
    });
    f.source.addEventListener('change', () => {
      if (!touched) {
        f.resp.value = /수입/.test(f.source.value) ? '협력사' : '미정';
        if (typeof respChanged === 'function') respChanged();
        renderSev();
      }
    });
  }
  costInit(d, true);
  curSev = { ...(d.sev || {}), _id: id || null, _touched: { impact: !!d.sev?.impact, scope: !!d.sev?.scope } };
  renderSev();
  ['date', 'source', 'partNo', 'supplierId', 'type', 'qty', 'inspQty'].forEach((k) => {
    const el = $('#mf')[k];
    if (el) {
      el.addEventListener('input', renderSev);
      el.addEventListener('change', renderSev);
    }
  });
  {
    const el = $('#mf').resp;
    if (el) el.addEventListener('change', renderSev);
  }
  ['disposition', 'qty', 'partNo', 'resp'].forEach((k) => {
    const el = $('#mf')[k];
    if (el)
      el.addEventListener('change', () => {
        const ae = document.activeElement;
        if (!$('#costBox')?.contains(ae)) renderCostBox();
      });
  });
  respChanged(true);
}
const FAR_PH_MAX = 6;
