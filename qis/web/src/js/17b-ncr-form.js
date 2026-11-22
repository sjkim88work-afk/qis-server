// ── NCR — 창 (화면) ──
function editNcr(id, preset, mode) {
  const S = db.settings;
  const n = id ? { ...db.ncrs.find((x) => x.id === id) } : { issueDate: today(), owner: S.owners[0] || '', ...(preset || {}) };
  curLinks = [...(n.defectIds || [])];
  {
    const r = farAlign(n.far, curLinks, false);
    if (r) n.far = r.far;
  } // FAR 은 FAR 화면이 원본 — NCR 창에는 읽기 전용 요약만
  if (!id && !(n.defectDesc || '').trim() && (n.basis || '불량') === '불량')
    n.defectDesc = descTplDefect(db.defects.find((x) => x.id === curLinks[0]) || null, n.lotNo || ''); // 새 NCR: 불량 내용 서술에 작성 양식을 기본으로
  curStock = (n.stock && n.stock.length ? n.stock : STOCK_DEF.map((l) => ({ loc: l }))).map((r) => ({
    loc: r.loc || '',
    stocked: r.stocked ?? r.qty ?? '',
    ng: r.ng ?? '',
  }));
  curExcl = new Set(n.photoExcl || []);
  curContain = (n.contain && n.contain.length ? n.contain : CONTAIN_DEF.map((l) => ({ loc: l }))).map((r) => ({
    loc: r.loc || '',
    target: r.target ?? '',
    sorted: r.sorted ?? '',
    ng: r.ng ?? '',
    done: r.done || '',
  }));
  vfLotsInit(n);
  curEvals = JSON.parse(JSON.stringify(n.evals || []));
  curEvIdx = Math.max(0, curEvals.length - 1);
  const has8D = !!n.replyDate || ['d4', 'd5', 'd6', 'd7', 'd8'].some((k) => String(n[k] || '').trim());
  const sevD = (n.defectIds || [])
    .map((i) => db.defects.find((d) => d.id === i))
    .filter(Boolean)
    .map(sevOf)
    .sort((a, b) => 'ABC'.indexOf(a.grade) - 'ABC'.indexOf(b.grade) || b.score - a.score)[0];
  curNcrSev = sevD || null;
  const body = `${id ? ncrTrack(n, !mode) : ''}${
    sevD
      ? `<div class="banner" style="background:${
          sevD.grade === 'A' ? 'var(--badb)' : sevD.grade === 'B' ? 'var(--warnb)' : 'var(--mut)'
        };border-color:transparent;color:#1d2433">연결 불량 심각도 <span class="bg ${SEV_CLS[sevD.grade]}" style="font-size:13px">${sevD.grade}</span> ${sevD.score}점${
          sevD.forced.length ? ' (강제 A: ' + esc(sevD.forced.join(', ')) + ')' : ''
        }${sevD.overridden ? ' (수동 조정: ' + esc(sevD.reason) + ')' : ''} → 권장 대응 <b>${sevD.resp}</b></div>`
      : ''
  }${farLine(n)}${ncrTabsBar(id, n, !!mode)}<div class="ntp" data-p="a">
<div class="fg">
    <label>NCR 번호<input name="no" value="${esc(n.no)}" placeholder="저장 시 자동 채번"></label>
    <label>발행일 *<input type="date" name="issueDate" value="${esc(n.issueDate)}" data-prev="${esc(n.issueDate)}" oninput="ncrAutoDates('issue')"></label>
    <label>협력사<select name="supplierId" onchange="refreshLinks()">${supOpts(n.supplierId)}</select></label>
    <label>담당자<input name="owner" list="dlOwners" value="${esc(n.owner)}"></label>
    <label>품번<input name="partNo" data-combo="parts" autocomplete="off" placeholder="번호·품명·협력사로 검색" value="${esc(n.partNo)}" oninput="const p=partByNo(this.value.trim());if(p){this.form.partName.value=p.name||'';if(p.supplierId){this.form.supplierId.value=p.supplierId;refreshLinks()}}bomNcr();repHint()"></label>
    <label>품명<input name="partName" value="${esc(n.partName)}"></label>
    <label class="full">제목<input name="title" value="${esc(n.title)}"></label>
    <label>재발 — 이전 NCR 번호<input name="repeatOf" list="dlNcrNos" autocomplete="off" value="${esc(n.repeatOf)}" placeholder="같은 문제가 다시 생긴 경우만" oninput="repHint()"><datalist id="dlNcrNos">${db.ncrs
      .filter((x) => x.id !== id && x.no)
      .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''))
      .map((x) => `<option value="${esc(x.no)}">${esc(supName(x.supplierId))} · ${esc(x.partNo)} · ${esc(x.issueDate)}</option>`)
      .join('')}</datalist></label>
    <div class="muted" id="repHint" style="font-size:12px;align-self:end;padding-bottom:6px"></div>
    <label>발행 근거<select name="basis" onchange="mfDirty=true;applyBasis(true);descBasisSwap()">${opts(NCR_BASIS, n.basis || '불량')}</select></label>
    <div class="full muted" id="basisHint" style="grid-column:1/-1;font-size:12px;margin-top:-4px"></div>
    <div id="auditBox" class="fg" style="grid-column:1/-1;margin:0">
      <label>감사일<input type="date" name="auditDate" value="${esc(n.auditDate)}"></label>
      <label>감사 구분<select name="auditType">${opts(AUDIT_TYPES, n.auditType || AUDIT_TYPES[0])}</select></label>
      <label class="full">감사 번호·보고서<input name="auditRef" value="${esc(n.auditRef)}" placeholder="예: PA-2026-014 / 공정감사 보고서"></label>
      <label class="full">지적 내용<textarea name="finding" style="min-height:56px" placeholder="예: 열처리 온도 기록 누락 3회, 관리계획서 검사 주기 미준수">${esc(n.finding)}</textarea></label>
    </div>
    <div id="ppmBox" class="fg" style="grid-column:1/-1;margin:0">
      <label>대상 기간 시작<input type="month" name="ppmFrom" value="${esc(n.ppmFrom)}"></label>
      <label>대상 기간 끝<input type="month" name="ppmTo" value="${esc(n.ppmTo)}"></label>
      <label>기간 PPM 실적<input type="number" name="ppmVal" min="0" value="${esc(n.ppmVal)}"></label>
      <label>목표 PPM<input type="number" name="ppmTarget" min="0" value="${esc(n.ppmTarget ?? '')}" placeholder="${num(S.ppmScar) || ''}"></label>
      <label class="full">월별 실적 <span><button type="button" class="b s" onclick="ppmFill()">입고·불량 실적에서 계산</button> <span class="muted">협력사·공동 귀책 불량수량 ÷ 입고수량</span></span><textarea name="ppmDetail" style="min-height:56px">${esc(n.ppmDetail)}</textarea></label>
    </div>
    <div id="ncrBom" style="grid-column:1/-1"></div>
  </div>
  </div>
<div class="ntp" data-p="n">
  <div class="sec">부적합 통보서 내용 <span class="muted" style="font-weight:normal;font-size:12px">협력사 송부용 Non-conformance Report (External) 양식에 출력됩니다</span></div>
  <div class="fg">
    <label>수신 담당자 (Name)<input name="supAttn" list="dlAttn" value="${esc(n.supAttn)}" placeholder="비우면 협력사 품질 담당 자동"></label>
    <label>수신 부서 (Department)<input name="supDept" value="${esc(n.supDept || 'Quality')}"></label>
    <label>Project<input name="project" value="${esc(n.project)}" placeholder="비우면 차종 자동"></label>
    <label>Incoming Date (입고일)<input type="date" name="recvDate" value="${esc(n.recvDate)}"></label>
    <label>Lot No.<input name="lotNo" value="${esc(n.lotNo)}"></label>
    <label>Lot Size<input name="lotQty" value="${esc(fmtQtyTxt(n.lotQty))}" onblur="this.value=fmtQtyTxt(this.value)" inputmode="numeric"></label>
    <label>Defect Q'ty / Sample Size<input name="defectQtyText" value="${esc(n.defectQtyText)}" placeholder="예: 12 / 200, ALL / -"></label>
    <label class="full">Specification (도면사양)<textarea name="spec" style="min-height:44px" placeholder="예: Parting line step ≤ 0.1mm, No grease leakage">${esc(n.spec)}</textarea></label>
    <label class="full">Actual (실제)<textarea name="actual" style="min-height:44px" placeholder="예: Grease leak caused by a gap from parting line mismatch">${esc(n.actual)}</textarea></label>
    <label class="full">Defect Description (불량 내용 서술) <span><button type="button" class="b s" onclick="descTemplate()">작성 양식 넣기</button> <span class="muted">새 NCR에는 작성 양식이 기본으로 들어갑니다. 통보서 ‘Defect Description’ 제목 아래, 사진 위에 출력됩니다</span></span><textarea name="defectDesc" style="min-height:90px" placeholder="예) 2026-07-18 조립 라인에서 Spindle Nut 그리스 누유 발견. 파팅라인 단차로 틈새 발생, 입고 LOT 20260507 전량 해당 의심.">${esc(n.defectDesc)}</textarea></label>
    <label class="full">Supplied part Situation (공급품 현황)<textarea name="supplySit" style="min-height:44px" placeholder="예: LOT 20260507 2,000EA × 24BOX 입고 / 라인 투입 중 발견">${esc(n.supplySit)}</textarea></label>
  </div>
  <div style="margin-top:10px;font-size:12px;color:var(--sub)">Inventory Check (재고 현황) <button type="button" class="b s" onclick="curStock.push({loc:'',stocked:'',ng:''});mfDirty=true;renderStock()">+ 행</button></div>
  <div id="stockBox"></div>
  <div class="fg" style="margin-top:10px">
    <label class="full">Remark (요구사항) <span><button type="button" class="b s" onclick="fillReq()">기본 문구 넣기</button> <span class="muted">비워두면 “1. Need 8D report : ~ 회신기한 限” 형식으로 출력됩니다</span></span><textarea name="requirements" style="min-height:56px">${esc(n.requirements)}</textarea></label>
  </div>
  <div style="margin-top:10px;font-size:12px;color:var(--sub)">통보서에 넣을 사진 <span class="muted">(연결된 불량의 사진 · 체크 해제하면 제외)</span></div>
  <div id="ncrPhotoBox" class="row" style="gap:8px;margin-top:4px"></div>
  </div>
<div class="ntp" data-p="t">
  <div class="sec">협력사 통보 <span class="muted" style="font-weight:normal;font-size:12px">통보서를 실제로 보낸 날 — 넣으면 대책 요청일 · 회신 기한이 통보일 기준으로 맞춰집니다</span></div>
  <div class="help" style="margin:0 0 8px">순서: 발행 정보 → 통보서 내용 → 창 아래 ‘저장 후 통보서 출력’으로 통보서를 보냄 → 여기에 통보일 · 방법을 기록하고 보낸 파일을 첨부</div>
  <div class="fg">
    <label>통보 여부<select name="notifyYN" onchange="ncrNotify('yn')">${opts(['미통보', '통보 완료'], ncrNotified(n) ? '통보 완료' : '미통보')}</select></label>
    <label>통보일<input type="date" name="notifyDate" value="${esc(n.notifyDate || '')}" data-prev="${esc(n.notifyDate || '')}" onchange="ncrNotify('date')"></label>
    <label>통보 방법<select name="notifyMethod">${opts(NOTIFY_METHODS, n.notifyMethod, true)}</select></label>
  </div>
  <div class="muted" style="font-size:12px;margin:8px 0 4px">발송한 통보서 파일 — 보낸 PDF · 메일(.msg) · 엑셀 등 (파일당 20MB, 끌어다 놓아도 됨)</div>
  <div id="noticeBox" class="docbox"></div>
  </div>
<div class="ntp" data-p="a">
  <div class="sec">대응 수준 · 회신 기한</div>
  <div class="fg">
    <label>요구 회신 유형 (대응 수준)<select name="reqType" onchange="mfDirty=true;applyReqType(true)">${opts(
      REQ_TYPES,
      n.reqType || REQ_TYPES[0],
    )}</select></label>
    <label>현장 감사<select name="siteAudit" onchange="mfDirty=true" title="요청으로 두면 통보서 요구사항에 현장 감사 예정 문구가 붙습니다">${opts(['없음', '요청'], n.siteAudit || '없음')}</select></label>
    <div id="rtWarn" class="full" style="grid-column:1/-1"></div>
    <label>대책 요청일<input type="date" name="requestDate" value="${esc(
      n.requestDate || (n.reqType === '단순 통보' ? '' : n.issueDate || ''),
    )}" oninput="ncrAutoDates('req')" title="기본값은 협력사 통보일(통보 전에는 NCR 발행일)입니다."></label>
    <label>회신 기한 <span id="dueHint">(요청+${typeDays(n.reqType)}일)</span><input type="date" name="dueDate" value="${esc(
      n.dueDate || (n.reqType === '단순 통보' || !(n.requestDate || n.issueDate) ? '' : addDays(n.requestDate || n.issueDate, typeDays(n.reqType))),
    )}"></label>
  </div>
  <div class="sec">연결된 불량</div><div id="linkBox"></div>
  </div>
<div class="ntp" data-p="r">
  <div class="sec">대책서 회신 · 판정</div>
  ${
    id && n.resubPending
      ? `<div class="banner" style="margin:0 0 10px;background:var(--pri2);border-color:transparent;color:var(--ink)">보완 대책서 재회신 접수 <b>${esc(n.resubPending.date)}</b> — 아래 대책서 평가에서 <b>+ 재제출 평가</b>를 눌러 다시 평가하세요. 평가를 마치고 저장하면 결과가 반영됩니다.</div>`
      : ''
  }
  ${
    id && ncrEsc(n)
      ? `<div class="banner" style="margin:0 0 10px">대책서 보완요청·반려·검증 무효가 <b>${ncrRejects(n)}회</b>입니다 (기준 ${num(S.escCount) || 2}회). 현장 감사나 상위 보고를 검토하세요.</div>`
      : ''
  }
  <div class="fg">
    <label>대책서 회신일<input type="date" name="replyDate" value="${esc(n.replyDate)}" oninput="if(this.value){const w=$('#evalWrap'),r=$('#wrap8D');if(w)w.open=true;if(r)r.open=true;renderEval()}"></label>
    <label>대책 타당성<select name="validity">${opts(['적정', '보완요청'], n.validity, true)}</select></label>
  </div>
  <div class="sec" style="margin-top:12px">협력사 대책서 파일 <span class="muted" style="font-weight:normal;font-size:12px">— 받은 8D · 간이 대책서 원본 (PDF · PPT · Excel · Word · 이미지, 파일당 20MB) · 끌어다 놓아도 됩니다</span></div>
  <div id="replyBox" class="docbox"></div>
  <details id="wrap8D" open style="margin-top:14px"><summary class="sec" style="cursor:pointer;list-style:revert"><span class="ttl">협력사 대책서 (8D) 회신 내용</span> <span class="muted" style="font-weight:normal;font-size:12px">— 대책서를 받은 뒤 요약 입력 (발행 시에는 비워둬도 됩니다)</span></summary>
  <div class="fg">${D8.map(
    ([k, l]) => `<label class="full" data-dk="${k}"><span class="dl" data-o="${l}">${l}</span><textarea name="${k}">${esc(n[k])}</textarea></label>`,
  ).join('')}</div></details>
  <details id="evalWrap" open style="margin-top:14px"><summary class="sec" style="cursor:pointer;list-style:revert">대책서 평가 (점검 기준·점수) <span class="muted" style="font-weight:normal;font-size:12px">— 항목별 미흡/부분/충족 → 총점·판정 자동</span></summary>
  <div id="evalBox"></div></details>
  </div>
<div class="ntp" data-p="b">
  <div id="d3Wrap"><div class="sec">D3 봉쇄 회신 <span class="muted" style="font-weight:normal;font-size:12px">— 대책서와 별도로, 협력사가 대책 요청 후 ${num(S.d3Days) || 1}일 안에 선별·봉쇄 결과를 먼저 회신</span></div>
  <div class="fg">
    <label>봉쇄 회신 기한 (요청+${num(S.d3Days) || 1}일)<input type="date" name="d3Due" value="${esc(
      n.d3Due || (!id && n.reqType !== '단순 통보' ? d3DefaultDue(n.requestDate || n.issueDate) : ''),
    )}"></label>
    <label>봉쇄 회신일<input type="date" name="d3Date" value="${esc(n.d3Date)}"></label>
    <label>클린 포인트 (첫 양품 LOT / 납품일)<input name="cleanPoint" value="${esc(n.cleanPoint)}" placeholder="예: LOT 20261028 · 10/29 납품분부터"></label>
    <label>양품 식별 표시<input name="cleanMark" value="${esc(n.cleanMark)}" placeholder="예: 박스 측면 녹색 ‘D3 OK’ 라벨"></label>
  </div>
  <div style="margin-top:10px;font-size:12px;color:var(--sub)">재고 위치별 선별 결과 <button type="button" class="b s" onclick="curContain.push({loc:'',target:'',sorted:'',ng:'',done:''});mfDirty=true;renderContain()">+ 행</button></div>
  <div id="containBox"></div></div>
  </div>
<div class="ntp" data-p="c">
  <div class="sec">유효성 검증</div>
  <div class="banner" id="vfInfo" style="margin:0 0 8px" hidden>단순 통보는 유효성 검증이 필요 없습니다. 협력사에 통보하면 종결합니다. 같은 불량이 재발했을 때만 검증일과 결과 ‘무효(재발)’을 입력하세요.</div>
  <div class="fg">
    ${vfFieldsHTML(n, { dueLabel: `유효성 검증 기한 (승인+${S.verifyDays}일)`, dueTitle: `비우면 대책 승인일 + ${S.verifyDays}일로 자동 설정` })}
    <label>특채 여부<select name="concession" onchange="concShow()">${opts(['없음', '특채 진행', '특채 승인'], n.concession || '없음')}</select></label>
    <div id="concWrap" style="grid-column:1/-1"><div style="font-size:12px;color:var(--sub);margin-bottom:6px">특채 신청서 · 고객 승인 문서 <span class="muted">(PDF · 이미지 · 엑셀 · 워드 등 · 끌어다 놓기 가능)</span></div>
      <div id="concBox" class="docbox"></div></div>
  </div>
  ${vfReworkHTML(n, id ? `ncrRework('${n.id}')` : '', '재대책 요청')}
  <div class="sec">유효성 검증 LOT · 종결 <span class="muted" style="font-weight:normal;font-size:12px">— 대책 적용 후 입고 LOT별 결과 · 종결 시 협력사 평가 감점</span></div>
  ${vfLotsHTML()}
  <div class="fg" style="margin-top:10px">
    <label style="max-width:320px">협력사 평가 감점 (점)<input type="number" name="penalty" min="0" step="0.5" value="${esc(n.penalty)}" placeholder="종결된 NCR만 협력사 품질 표에 합산"></label>
  </div>
  <div class="sec">실패비용 <span class="muted" style="font-weight:normal;font-size:12px">— 연결된 불량의 비용 합계 · 입력·수정은 불량 관리 › 비용·구상에서 (여기서 따로 입력하지 않아 이중 집계가 없음)</span></div>
  <div id="ncrCostBox"></div>

  </div>
<div class="ntp" data-p="d">
  <details id="tlWrap" open style="margin-top:14px"><summary class="sec" style="cursor:pointer;list-style:revert">조사 · 진행 기록 <span class="muted" style="font-weight:normal;font-size:12px">— 실제로 한 일과 결과만 남기는 증빙용 기록 · 연결 불량 기록과 NCR 진행(자동)이 함께 표시</span></summary><div id="logBox"></div></details>
  </div>
`;
  const btns = [
    { label: '취소', fn: closeModal },
    { label: '저장', cls: 'p', fn: () => saveNcr(id) },
  ];
  if (id)
    btns.unshift({
      label: n.caseId && czById('cases', n.caseId) ? 'RCA 열기' : 'RCA 요청',
      fn: async () => {
        if (
          mfDirty &&
          !(await askConfirm({ title: '저장하지 않고 이동할까요?', msg: '먼저 저장하려면 취소 후 저장을 누르세요.', ok: '이동', danger: false }))
        )
          return;
        mfDirty = false;
        closeModal(true);
        czFromNcr(id);
      },
    });
  if (id)
    btns.unshift({
      label: '8D 출력',
      fn: () => {
        const nid = mfDirty ? saveNcr(id) : id;
        if (nid) print8D(nid);
      },
    });
  btns.splice(btns.length - 1, 0, {
    label: '저장 후 통보서 출력',
    fn: () => {
      const nid = saveNcr(id);
      if (nid) printNotice(nid);
    },
  });
  openModal(id ? `NCR ${n.no || ''}` : 'NCR 발행', body, btns);
  if (id) {
    const st = ncrStatus(n);
    if (st === '종결') $('#mt').insertAdjacentHTML('beforeend', '<span class="qstamp">종결</span>');
    else if (ncrEsc(n)) $('#mt').insertAdjacentHTML('beforeend', '<span class="qstamp esc">에스컬레이션</span>');
  }
  ncrCurId = id || null;
  ncrCurNo = n.no || '';
  ncrMode(mode || ncrModeDefault(n, id));
  concInit(n.concDocs || []);
  dkInit('notice', n.noticeDocs || []);
  dkInit('reply', n.replyDocs || []);
  renderStock();
  renderContain();
  renderVLots();
  renderEval();
  applyBasis(false);
  tlInit('ncr', Object.assign({}, n, { defectIds: curLinks, logs: n.logs || [] }));
  refreshLinks();
  applyReqType(false);
  bomNcr();
  repHint();
}
let curNcrSev = null,
  ncrTabCur = 'a';
let curConc = [],
  curConcDel = [];
// NCR 첨부 파일 상자: 발송한 통보서(noticeDocs) · 받은 대책서(replyDocs) — 특채 문서와 같은 저장소(사진 · 첨부)에 보관
const RD_ACCEPT = '.pdf,.ppt,.pptx,.xls,.xlsx,.xlsm,.csv,.doc,.docx,.hwp,.hwpx,.zip,.msg,.eml,image/*';
const DOCK = {
  notice: { field: 'noticeDocs', box: 'noticeBox', add: '+ 발송한 통보서 첨부', L: [], D: [] },
  reply: { field: 'replyDocs', box: 'replyBox', add: '+ 대책서 파일 첨부', L: [], D: [] },
};
