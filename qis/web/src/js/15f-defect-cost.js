// ── 불량 — 실패비용 · 구상 칸 ──
function costInit(d, inForm) {
  curCosts = JSON.parse(JSON.stringify(d.costs || []));
  curClaim = JSON.parse(JSON.stringify(d.claim || {}));
  curBase = JSON.parse(JSON.stringify(d.costBase || {}));
  costCtx = inForm ? null : d;
  renderCostBox();
}
// 불량 발생수량 · 단가 (입력 안 했으면 불량 수량 · 부품 단가)
function baseQty() {
  return curBase.qty !== undefined && curBase.qty !== '' ? num(curBase.qty) : num(cv('qty'));
}
function basePrice() {
  if (curBase.price !== undefined && curBase.price !== '') return num(curBase.price);
  const pt = partByNo(String(cv('partNo') || '').trim());
  return pt ? partKRW(pt) : 0;
}
function baseOut() {
  const o = {};
  ['qty', 'price'].forEach((k) => {
    if (curBase[k] !== undefined && curBase[k] !== '') o[k] = num(curBase[k]);
  });
  return Object.keys(o).length ? o : undefined;
}
function setBase(k, v) {
  curBase[k] = v;
  mfDirty = true;
  const e = $('#cbAmt');
  if (e) e.textContent = won(baseQty() * basePrice());
}
function rowCalc(i, el) {
  const c = curCosts[i],
    q = num(c.qty),
    pr = num(c.price);
  if (q > 0 && pr > 0) {
    const amt = Math.round(q * pr),
      auto = `${q.toLocaleString()}개 × ${won(pr)}원`;
    c.amt = amt;
    if (!(c.basis || '').trim() || c._autoB) {
      c.basis = auto;
      c._autoB = true;
    }
    const tr = el.closest('tr');
    tr.querySelector('[data-c=amt]').value = amt;
    tr.querySelector('[data-c=basis]').value = c.basis;
    costTot();
  }
}
function addBaseCost() {
  const q = baseQty(),
    pr = basePrice();
  if (!q) {
    toast('불량 발생수량을 입력하세요');
    $('#cbQty').focus();
    return;
  }
  if (!pr) {
    toast('단가를 입력하세요');
    $('#cbPrice').focus();
    return;
  }
  addCost({ cat: $('#cbCat').value, qty: q, price: pr, amt: Math.round(q * pr), basis: `${q.toLocaleString()}개 × ${won(pr)}원`, _autoB: true });
}
function cv(k) {
  const f = $('#mf');
  if (!costCtx && f && f[k]) return f[k].value;
  return costCtx ? costCtx[k] : '';
}
function costOut() {
  return curCosts
    .filter((c) => num(c.amt) > 0 || (c.basis || '').trim())
    .map((c) => {
      const o = { ...c, amt: num(c.amt) };
      delete o._autoB;
      ['qty', 'price'].forEach((k) => {
        if (o[k] === '' || o[k] == null) delete o[k];
        else o[k] = num(o[k]);
      });
      return o;
    });
}
function claimOut() {
  const c = curClaim || {};
  const has =
    ['reqDate', 'reqAmt', 'agreeAmt', 'agreeDate', 'recvDate', 'recvAmt', 'memo', 'disputeReason', 'waiveReason'].some((k) =>
      String(c[k] || '').trim(),
    ) ||
    c.dispute ||
    c.waive;
  if (!has) return undefined;
  const o = { ...c };
  ['reqAmt', 'agreeAmt', 'recvAmt'].forEach((k) => (o[k] = o[k] === '' || o[k] == null ? '' : num(o[k])));
  return o;
}
function renderCostBox() {
  const b = $('#costBox');
  if (!b) return;
  const S = db.settings;
  const disp = cv('disposition'),
    qty = num(cv('qty')),
    part = partByNo(String(cv('partNo') || '').trim()),
    resp = cv('resp');
  const f0 = $('#mf'),
    shr =
      resp === '공동'
        ? Math.max(
            0,
            Math.min(
              100,
              num(
                !costCtx && f0 && f0.inv_share
                  ? f0.inv_share.value
                  : costCtx
                    ? costCtx.inv?.share
                    : (db.defects.find((x) => x.id === curSev._id) || {}).inv?.share,
              ),
            ),
          )
        : 100;
  const rows = curCosts
    .map(
      (c, i) => `<tr>
    <td><input type="date" value="${esc(c.date)}" onchange="curCosts[${i}].date=this.value;mfDirty=true" style="width:140px"></td>
    <td><select onchange="curCosts[${i}].cat=this.value;mfDirty=true">${opts(COST_CATS, c.cat)}</select></td>
    <td><input type="number" min="0" value="${esc(c.qty ?? '')}" placeholder="-" style="width:72px;text-align:right" oninput="curCosts[${i}].qty=this.value;mfDirty=true;rowCalc(${i},this)"></td>
    <td><input type="number" min="0" step="any" value="${esc(c.price ?? '')}" placeholder="-" style="width:90px;text-align:right" oninput="curCosts[${i}].price=this.value;mfDirty=true;rowCalc(${i},this)"></td>
    <td><input type="number" min="0" data-c="amt" value="${esc(c.amt)}" style="width:110px;text-align:right" oninput="curCosts[${i}].amt=this.value;mfDirty=true;costTot()"></td>
    <td><input value="${esc(c.basis)}" data-c="basis" placeholder="예: 3h × 2명 × 30,000원" style="width:100%;min-width:150px" oninput="curCosts[${i}].basis=this.value;curCosts[${i}]._autoB=false;mfDirty=true"></td>
    <td><input value="${esc(c.memo)}" placeholder="메모·증빙" style="width:100%;min-width:100px" oninput="curCosts[${i}].memo=this.value;mfDirty=true"></td>
    <td><button type="button" class="b s d" onclick="delCost(${i})">✕</button></td></tr>`,
    )
    .join('');
  const c = curClaim || {};
  const bq = baseQty(),
    bp = basePrice(),
    ptp = part ? partKRW(part) : 0,
    ptCur = curOf(part);
  const defCat =
    disp === '재작업'
      ? '재작업'
      : disp === '선별' || disp === '선별 후 사용'
        ? '선별'
        : String(cv('source') || '').includes('고객')
          ? '고객클레임'
          : '폐기';
  b.innerHTML = `<div class="cbase" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg2,rgba(0,0,0,.02));margin:4px 0 10px">
    <b style="font-size:13px">불량 발생수량</b><input id="cbQty" type="number" min="0" value="${esc(curBase.qty ?? (qty || ''))}" placeholder="수량" style="width:90px;text-align:right" oninput="setBase('qty',this.value)"><span class="muted">개 ×</span>
    <b style="font-size:13px">단가</b><input id="cbPrice" type="number" min="0" step="any" value="${esc(curBase.price ?? (ptp || ''))}" placeholder="원" style="width:110px;text-align:right" oninput="setBase('price',this.value)"><span class="muted">원 =</span>
    <b id="cbAmt">${won(bq * bp)}</b><span class="muted">원</span>
    <span style="flex:1"></span>
    <select id="cbCat" style="width:auto">${opts(COST_CATS, defCat)}</select><button type="button" class="b s p" onclick="addBaseCost()">비용 내역에 추가</button>
    <div class="muted" style="flex-basis:100%;font-size:12px">${
      ptp
        ? ptCur === 'KRW'
          ? `부품 마스터 단가 ${won(ptp)}원`
          : `부품 마스터 단가 ${fmtPrice(part)} × ${fxRate(ptCur).toLocaleString('ko-KR')}원 = ${won(ptp)}원`
        : part && part.price && ptCur !== 'KRW'
          ? `부품 단가 ${fmtPrice(part)} — ${ptCur} 환율이 설정에 없어 원화로 바꾸지 못했습니다`
          : '부품 마스터에 단가가 없습니다 — 직접 입력하세요'
    } · 불량 수량 ${qty ? qty.toLocaleString() + '개' : '미입력'} 기준 기본값이며, 바꾸면 이 불량에 따로 저장됩니다.</div>
  </div>
  <div style="font-size:12px;color:var(--sub);margin:4px 0">비용 내역 — 발생할 때마다 한 줄씩 추가합니다. COPQ는 <b>비용 발생일</b>이 속한 달로 집계됩니다.</div>
  <table class="ct"><thead><tr><th>비용 발생일</th><th>항목</th><th class="n">수량</th><th class="n">단가(원)</th>
    <th class="n">금액(원)</th><th>산출 근거</th><th>메모</th><th></th></tr></thead><tbody>${
      rows || '<tr><td colspan="8" class="muted" style="text-align:center;padding:10px">아직 입력된 비용이 없습니다.</td></tr>'
    }</tbody>
  <tfoot><tr><td colspan="4" style="text-align:right"><b>합계</b></td><td class="n"><b id="costTot">${won(
    curCosts.reduce((a, x) => a + num(x.amt), 0),
  )}</b></td><td colspan="3"></td></tr></tfoot></table>
  <div class="row" style="margin-top:8px;gap:6px">
    <button type="button" class="b s" onclick="addCost({})">+ 비용 추가</button>
    <span class="muted" style="font-size:12px;margin-left:8px">인건비 계산</span>
    <input id="lbH" type="number" step="0.5" min="0" placeholder="시간" style="width:70px"><span class="muted">h ×</span><input id="lbN" type="number" min="1" value="1" style="width:56px"><span class="muted">명 × ${won(S.laborRate)}원</span>
    <button type="button" class="b s" onclick="addLabor()">${disp === '재작업' ? '재작업비' : '선별비'}로 추가</button>
  </div>
  <div class="sec" style="margin-top:14px">협력사 구상 (회수) <span id="clmSt">${claimBadge()}</span><span class="muted" style="font-weight:normal;font-size:12px">${
    resp === '협력사'
      ? ''
      : resp === '공동'
        ? `공동 귀책 — 협력사 부담 ${shr}% 만큼 청구`
        : resp === '미정'
          ? '귀책 미정 — 판정 후 청구합니다 (비용은 지금부터 쌓아 두세요)'
          : '귀책이 협력사일 때 청구합니다'
  }</span></div>
  <div class="fg">
    <label>청구일<input type="date" value="${esc(c.reqDate)}" onchange="setClaim('reqDate',this.value)"></label>
    <label>청구액 (원) <a class="lk" style="font-size:11px" onclick="setClaim('reqAmt',Math.round(curCosts.reduce((a,x)=>a+num(x.amt),0)*${shr}/100));renderCostBox()">${
      shr < 100 ? `비용 합계 × ${shr}% 넣기` : '비용 합계 넣기'
    }</a>${
      bq && bp
        ? ` · <a class="lk" style="font-size:11px" onclick="setClaim('reqAmt',Math.round(baseQty()*basePrice()*${shr}/100));renderCostBox()">수량×단가${shr < 100 ? ` × ${shr}%` : ''} 넣기</a>`
        : ''
    }<input type="number" min="0" value="${esc(c.reqAmt)}" oninput="setClaim('reqAmt',this.value)"></label>
    <label>합의액 (원)<input type="number" min="0" value="${esc(c.agreeAmt)}" oninput="setClaim('agreeAmt',this.value)"></label>
    <label>합의일<input type="date" value="${esc(c.agreeDate)}" onchange="setClaim('agreeDate',this.value)"></label>
    <label>회수일<input type="date" value="${esc(c.recvDate)}" onchange="setClaim('recvDate',this.value)"></label>
    <label>회수액 (원)<input type="number" min="0" value="${esc(c.recvAmt)}" oninput="setClaim('recvAmt',this.value)"></label>
    <label>회수 방법<select onchange="setClaim('method',this.value)">${opts(['입금', '상계', '대체품', '기타'], c.method, true)}</select></label>
    <label>메모<input value="${esc(c.memo)}" placeholder="공문 번호 등" oninput="setClaim('memo',this.value)"></label>
    <label class="row" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" ${c.dispute ? 'checked' : ''} onchange="setClaim('dispute',this.checked);renderCostBox()"> 협력사 이의 제기</label>
    ${c.dispute ? `<label class="full">이의 사유<input value="${esc(c.disputeReason)}" oninput="setClaim('disputeReason',this.value)"></label>` : ''}
    <label class="row" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" ${c.waive ? 'checked' : ''} onchange="setClaim('waive',this.checked);renderCostBox()"> 청구 포기 (당사 부담)</label>
    ${c.waive ? `<label class="full">포기 사유<input value="${esc(c.waiveReason)}" oninput="setClaim('waiveReason',this.value)"></label>` : ''}
  </div>`;
}
function claimBadge() {
  const st = claimStatus({ claim: claimOut() }),
    o = outstanding({ claim: claimOut() });
  return st
    ? `<span class="bg ${CLAIM_CLS[st]}">${st}</span>${o ? ` <span class="bg bad">미회수 ${won(o)}원</span>` : ''}`
    : '<span class="bg mut">미청구</span>';
}
function setClaim(k, v) {
  curClaim = curClaim || {};
  curClaim[k] = v;
  mfDirty = true;
  const e = $('#clmSt');
  if (e) e.innerHTML = claimBadge();
}
function costTot() {
  const e = $('#costTot');
  if (e) e.textContent = won(curCosts.reduce((a, x) => a + num(x.amt), 0));
}
function addCost(o) {
  if (o.basis && curCosts.some((c) => c.cat === o.cat && c.basis === o.basis)) {
    toast('같은 내용의 비용이 이미 있습니다');
    return;
  }
  curCosts.push({ id: uid(), date: today(), cat: '기타', amt: '', basis: '', memo: '', ...o });
  mfDirty = true;
  renderCostBox();
}
function addLabor() {
  const h = num($('#lbH').value),
    n = num($('#lbN').value) || 1,
    r = num(db.settings.laborRate);
  if (!h) {
    toast('작업시간을 입력하세요');
    $('#lbH').focus();
    return;
  }
  addCost({ cat: cv('disposition') === '재작업' ? '재작업' : '선별', amt: Math.round(h * n * r), basis: `${h}h × ${n}명 × ${won(r)}원` });
}
async function delCost(i) {
  const c = curCosts[i];
  if (
    num(c.amt) &&
    !(await askConfirm({ title: '비용 줄을 삭제할까요?', items: [`${esc(c.date)} · ${esc(c.cat)} · ${won(c.amt)}원`], note: '저장해야 반영됩니다.' }))
  )
    return;
  curCosts.splice(i, 1);
  mfDirty = true;
  renderCostBox();
}
function openCost(id) {
  const d = db.defects.find((x) => x.id === id);
  if (!d) return;
  openModal(
    `비용 · 구상 — ${defLabel(d)} (${supName(d.supplierId) || '-'})`,
    `<div class="help">${esc(d.type)} ${num(d.qty)}개 · 처리 ${esc(d.disposition || '-')} · 귀책 ${esc(d.resp || '-')}</div><div id="costBox"></div>`,
    [
      { label: '취소', fn: closeModal },
      {
        label: '저장',
        cls: 'p',
        fn: () => {
          d.costs = costOut();
          {
            const cb = baseOut();
            if (cb) d.costBase = cb;
            else delete d.costBase;
          }
          if (d.costs.length) d.noCost = false;
          const cl = claimOut();
          if (cl) d.claim = cl;
          else delete d.claim;
          touch(d);
          save();
          closeModal(true);
          render();
          toast(`비용 ${won(costTotal(d))}원 저장`);
        },
      },
    ],
  );
  costInit(d, false);
}
