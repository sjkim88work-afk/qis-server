// ── FAR(귀책 조사) — 목록 · 요청/회신/판정 창 · 저장 ──
function invPhotoIds(d) {
  return [...new Set([...(d.photos || []), ...(d.logs || []).filter((l) => !l.void).flatMap((l) => l.photos || [])])];
}
let curInvExcl = new Set();
async function renderInvPhotos() {
  const b = $('#invPhBox');
  if (!b) return;
  const d = db.defects.find((x) => x.id === invCurId);
  if (!d) return;
  const ids = invPhotoIds(d);
  if (!ids.length) {
    b.innerHTML = `<span class="muted" style="font-size:12px">이 불량에 등록된 사진이 없습니다. 불량 화면의 사진 칸이나 진행 기록에 사진을 첨부하면 여기에 나타나고 FAR 요청서에 들어갑니다.</span>`;
    return;
  }
  let rs = [];
  try {
    rs = await photoGetMany(ids);
  } catch (e) {}
  if (!$('#invPhBox')) return;
  if (!rs.length) {
    b.innerHTML = '<span class="muted" style="font-size:12px">사진을 불러오지 못했습니다. 사진이 든 백업 파일로 복원하면 다시 나타납니다.</span>';
    return;
  }
  const on = rs.filter((p) => !curInvExcl.has(p.id)).length;
  b.innerHTML =
    rs
      .map((p) => {
        const x = curInvExcl.has(p.id);
        return `<label style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;cursor:pointer"><img src="${p.thumb || p.data}" style="width:110px;height:80px;object-fit:cover;border-radius:4px;border:2px solid ${x ? 'var(--line)' : 'var(--pri)'};opacity:${x ? 0.4 : 1}"><span><input type="checkbox" ${x ? '' : 'checked'} onchange="this.checked?curInvExcl.delete('${p.id}'):curInvExcl.add('${p.id}');mfDirty=true;renderInvPhotos()"> ${esc((p.caption || '').slice(0, 12))}</span></label>`;
      })
      .join('') +
    `<div class="muted" style="font-size:12px;align-self:center">선택 ${on}장${on > FAR_PH_MAX ? ` — 앞의 ${FAR_PH_MAX}장만 출력됩니다` : ''}</div>`;
}
async function offerNcrAfterVerdict(ids, v) {
  if (!['협력사', '공동'].includes(v)) return;
  const ds = ids.map((i) => db.defects.find((d) => d.id === i)).filter((d) => d && !d.ncrId);
  if (!ds.length) return;
  const sid = ds[0].supplierId,
    same = ds.filter((d) => d.supplierId === sid),
    rest = ds.length - same.length;
  const g = same.map((d) => sevOf(d).grade).sort()[0],
    rt = RESP[g];
  const far = same.some((d) => d.inv && d.inv.farReq);
  const ok = await askConfirm({
    title: '이어서 NCR을 발행할까요?',
    danger: false,
    ok: '이어서 NCR 발행',
    cancel: '나중에',
    msg: `${v === '공동' ? '공동 귀책 — 협력사 몫의 ' : '협력사 귀책 — '}원인과 재발 방지 대책은 NCR로 요구합니다.`,
    items: [
      `${esc(supName(sid) || '협력사 미지정')} · 불량 ${same.length}건${same.length > 1 ? ' (한 NCR로 묶음)' : ''}`,
      `심각도 ${g}등급 → 회신 유형 <b>${rt}</b>${g === 'C' ? ' (대책서 없이 통보 · 반복되면 등급 상승)' : ''}`,
    ]
      .concat(far ? ['FAR 결과는 NCR 창 위쪽에 요약으로 표시됩니다'] : [])
      .concat(rest ? [`다른 협력사 불량 ${rest}건은 각 불량 화면에서 따로 발행하세요`] : []),
    note: '나중에 발행하려면 불량 목록의 ‘NCR 발행 필요’ 또는 대시보드의 NCR 권고에서 할 수 있습니다.',
  });
  if (ok)
    ncrFromDefect(
      same[0].id,
      same.slice(1).map((d) => d.id),
    );
}
function invLateN() {
  return db.defects.filter((d) => invOpen(d) && (invInfo(d).late || (d.date && today() > ntfDue(d)))).length;
}
function invRows() {
  const f = state.ivf,
    q = (f.q || '').toLowerCase();
  return db.defects
    .filter((d) => {
      const all = d.resp === '미정' || !!d.inv;
      if (!all) return false;
      if (f.status === 'open' && !invOpen(d)) return false;
      if (f.status === 'late' && !(invOpen(d) && (invInfo(d).late || (d.date && today() > ntfDue(d))))) return false;
      if (f.status === 'done' && !(d.inv && d.inv.verdict)) return false;
      return (
        !q ||
        [d.partNo, d.partName, d.fgNo, d.fgName, d.type, d.desc, supName(d.supplierId), (d.inv || {}).verdict].join(' ').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
function renderInv() {
  const all = db.defects.filter((d) => d.resp === '미정' || !!d.inv),
    open = all.filter(invOpen);
  const pre = open.filter((d) => invInfo(d).k === 'pre'),
    late = open.filter((d) => invInfo(d).late),
    judge = open.filter((d) => invInfo(d).k === 'judge'),
    ntf = open.filter((d) => d.date && today() > ntfDue(d));
  const m = today().slice(0, 7),
    doneM = all.filter((d) => d.inv && d.inv.verdict && (d.inv.verdictDate || '').startsWith(m));
  const rows = invRows(),
    f = state.ivf;
  const chip = (k, l, n) =>
    `<button class="b s ${f.status === k ? 'p' : ''}" onclick="state.ivf.status='${k}';render()">${l} <span class="mono" style="opacity:.75">${n}</span></button>`;
  return `<div class="kpis">
    <div class="kpi ${open.length ? 'warn' : ''}"><div class="l">조사 중</div><div class="v">${open.length}</div><div class="s">귀책 미정 · 판정 전</div></div>
    <div class="kpi ${pre.length ? 'warn' : ''}"><div class="l">FAR 요청 전</div>
      <div class="v">${pre.length}</div><div class="s">협력사 분석 요청 필요</div></div>
    <div class="kpi ${late.length ? 'bad' : ''}"><div class="l">FAR 회신 지연</div>
      <div class="v">${late.length}</div><div class="s">요청 + ${num(db.settings.farDays) || 5}영업일 기준</div></div>
    <div class="kpi"><div class="l">판정 대기</div><div class="v">${judge.length}</div><div class="s">FAR 회신 접수됨</div></div>
    <div class="kpi ${ntf.length ? 'bad' : ''}"><div class="l">원인 불명 검토 기한 경과</div>
      <div class="v">${ntf.length}</div><div class="s">등록 + ${num(db.settings.ntfDays) || 30}일</div></div>
    <div class="kpi"><div class="l">이번 달 판정</div><div class="v">${doneM.length}</div><div class="s">${m}</div></div></div>
  <div class="pl"><div class="card noprint pltool"><div class="row">${chip('open', '조사 중', open.length)}${chip(
    'late',
    '기한 경과',
    all.filter((d) => invOpen(d) && (invInfo(d).late || (d.date && today() > ntfDue(d)))).length,
  )}${chip('done', '판정 완료', all.filter((d) => d.inv && d.inv.verdict).length)}${chip('all', '전체', all.length)}
    <input type="search" placeholder="검색 (부품·품명·유형·협력사·판정)" value="${esc(f.q)}" oninput="state.ivf.q=this.value;$('#ivtab').innerHTML=invTable()" style="flex:1;min-width:200px;max-width:360px"></div>
    <div class="help" style="margin-top:8px">귀책이 ‘미정’인 불량이 여기 모입니다. 격리·선별 후 협력사에 FAR(원인 분석)을 요청하고, 사내 분석(간단하면 메모, 큰 건은 RCA)을 함께 진행한 뒤 판정합니다. 판정하면 불량의 귀책이 바뀌고 협력사는 NCR, 사내는 사내 대책·RCA로 넘어갑니다.</div></div>
  <div class="card" id="ivtab">${invTable()}</div></div>`;
}
function invTable() {
  const rows = invRows();
  return `<div class="tw"><table><thead><tr><th>등록일</th><th>불량</th><th>협력사</th><th class="n">수량</th><th>상태</th>
    <th>FAR 요청</th><th>FAR 회신</th><th>사내 분석</th><th>판정</th><th>검토 기한</th><th class="noprint"></th></tr></thead><tbody>
  ${
    rows
      .map((d) => {
        const iv = d.inv || {},
          cs = defCase(d),
          ii = invInfo(d),
          opn = invOpen(d);
        return `<tr>
    <td class="mono">${esc(d.date)}</td>
    <td><a class="lk" onclick="editInv('${d.id}')"><b>${esc(d.partNo || d.fgNo || '-')}</b></a> ${esc(d.partName || d.fgName || '')}<br><span class="muted">${esc(d.type || '')}${d.source ? ' · ' + esc(d.source) : ''}</span> ${sevBadge(d, true)}</td>
    <td>${esc(supName(d.supplierId)) || '<span class="muted">미지정</span>'}</td>
    <td class="n">${num(d.qty).toLocaleString()}</td>
    <td>${
      iv.verdict
        ? `<span class="bg ok">판정 완료</span>`
        : opn
          ? `<span class="bg ${ii.cls}">${esc(ii.label)}</span>`
          : '<span class="bg mut">조사 종료</span>'
    }</td>
    <td style="white-space:nowrap">${iv.farReq ? esc(iv.farReq) : '<span class="muted">-</span>'}${
      iv.farReq && !iv.farRecv && iv.farDue ? '<br>' + dday(iv.farDue, false) : ''
    }</td>
    <td style="white-space:nowrap">${iv.farRecv ? esc(iv.farRecv) : '<span class="muted">-</span>'}</td>
    <td>${
      cs
        ? `<a class="lk" onclick="czOpenCase('${cs.id}','cause')">RCA ${esc(cs.CaseNo)}</a><br><span class="muted">${esc(cs.Stage || '')}</span>`
        : (iv.rca || '').trim()
          ? '<span class="bg inf">메모</span>'
          : '<span class="muted">-</span>'
    }</td>
    <td>${
      iv.verdict
        ? `<b>${esc(iv.verdict)}</b>${
            iv.verdict === '공동' && iv.share !== '' && iv.share != null ? ` <span class="muted">${esc(iv.share)}%</span>` : ''
          }<br><span class="muted mono">${esc(iv.verdictDate || '')}</span>`
        : '<span class="muted">-</span>'
    }</td>
    <td style="white-space:nowrap">${opn && d.date ? dday(ntfDue(d), false) : '<span class="muted">-</span>'}</td>
    <td class="noprint" style="white-space:nowrap">${(() => {
      const nx = invStageDefault(d),
        b = (k, l) => `<button class="b s ${nx === k && opn ? 'p' : ''}" onclick="editInv('${d.id}','','${k}')">${l}</button>`;
      return b('req', '요청') + ' ' + b('reply', '회신') + ' ' + b('judge', '판정');
    })()} <button class="b s" onclick="editDefect('${d.id}')">불량</button></td></tr>`;
      })
      .join('') ||
    `<tr><td colspan="11" class="muted" style="text-align:center;padding:30px">${
      state.ivf.status === 'open'
        ? '진행 중인 귀책 조사가 없습니다. 불량 등록에서 귀책을 ‘미정’으로 두면 여기에 나타납니다.'
        : '조건에 맞는 건이 없습니다.'
    }</td></tr>`
  }
  </tbody></table></div>`;
}
function invSteps(d) {
  const iv = d.inv || {},
    cs = defCase(d),
    t = today();
  const S = [
    { l: '불량 등록', d: d.date, done: true },
    { l: 'FAR 요청', d: iv.farReq, done: !!iv.farReq },
    { l: 'FAR 회신', d: iv.farRecv || iv.farDue, done: !!iv.farRecv, due: !iv.farRecv && iv.farDue },
    { l: '사내 분석', d: cs ? cs.CaseNo : '', done: !!cs || !!(iv.rca || '').trim(), txt: true },
    { l: '귀책 판정', d: iv.verdictDate || (iv.verdict ? '' : ntfDue(d)), done: !!iv.verdict, due: !iv.verdict && d.date && ntfDue(d) },
  ];
  let cur = S.findIndex((x) => !x.done);
  if (cur < 0) cur = S.length;
  return `<div class="qtrack${iv.verdict ? ' closed' : ''}" style="grid-template-columns:repeat(5,minmax(0,1fr))">${S.map((x, i) => {
    const late = !x.done && x.due && t > x.due;
    return `<div class="${x.done || i < cur ? 'past' : i === cur ? 'cur' : ''}${late ? ' late' : ''}">${x.l}<b>${
      x.d ? (x.due && !x.done ? '기한 ' : '') + esc(x.txt ? String(x.d) : String(x.d).slice(5)) : '–'
    }${late ? ' 초과' : ''}</b></div>`;
  }).join('')}</div>`;
}
let invCurId = '';
// FAR 화면의 창은 단계별로 따로 엶 — 요청(req) · 회신(reply) · 판정(judge: 사내 분석 + 귀책 판정).
// 입력 칸은 모두 창 안에 있고(저장은 한 번에), 고른 단계의 구역만 보임
const INV_STG = { req: 'FAR 요청', reply: 'FAR 회신', judge: '귀책 판정' };
function invStageDefault(d, focus) {
  if (focus === 'inv_farReq') return 'req';
  if (focus === 'inv_verdict') return 'judge';
  const iv = d.inv || {};
  if (iv.verdict) return 'judge';
  const k = invInfo(d).k;
  return k === 'pre' ? 'req' : k === 'far' ? 'reply' : 'judge';
}
function editInv(id, focus, stage) {
  const d = db.defects.find((x) => x.id === id);
  if (!d) return;
  invCurId = id;
  const iv = d.inv || {},
    S = db.settings,
    cs = defCase(d),
    stg = INV_STG[stage] ? stage : invStageDefault(d, focus),
    sh = (k) => (stg === k ? '' : 'style="display:none"');
  const reqSum = iv.farReq
    ? `FAR 요청 ${esc(iv.farReq)}${iv.farDue ? ` · 회신 기한 ${esc(iv.farDue)}` : ''}${iv.farPurpose ? ` · ${esc(iv.farPurpose)}` : ''}${
        iv.sample ? ` · 시료 ${esc(iv.sample)}` : ''
      }`
    : '';
  const repSum = iv.farRecv
    ? `FAR 회신 ${esc(iv.farRecv)}${iv.farVerdict ? ` · 협력사 분석 판정: ${esc(iv.farVerdict)}` : ''}${iv.farReview ? ` · 당사 검토: ${esc(iv.farReview)}` : ''}`
    : '';
  const body = `${invSteps(d)}
  ${defHeadBox(d, '', ` · ${esc(supName(d.supplierId)) || '협력사 미지정'}`)}
  <div class="ivs" data-s="req" ${sh('req')}>
  <div class="sec">FAR 요청 <span class="muted" style="font-weight:normal;font-size:12px">협력사에 원인 분석을 요청합니다. 귀책 인정 요구가 아닙니다</span></div>
  <div class="fg">
    <label>FAR 요청일<input type="date" name="inv_farReq" value="${esc(iv.farReq)}" oninput="invAuto()"></label>
    <label>FAR 회신 기한 <span style="font-size:11px">(요청 + ${num(S.farDays) || 5}영업일)</span><input type="date" name="inv_farDue" value="${esc(iv.farDue)}"></label>
    <label>요청 목적<select name="inv_farPurpose">${opts(FAR_PURPOSE, iv.farPurpose || '', true)}</select></label>
    <label class="full">요청 분석 항목<span class="checks" style="display:flex;flex-wrap:wrap;gap:4px 14px;padding-top:3px">${FAR_ITEMS.map(
      (x) =>
        `<label style="flex-direction:row;align-items:center;gap:4px;color:var(--ink)"><input type="checkbox" name="inv_farItem" value="${esc(x)}" ${
          (iv.farItems || []).includes(x) ? 'checked' : ''
        }>${esc(x)}</label>`,
    ).join('')}</span></label>
    <label>시료 (수량 · 송부 방법)<input name="inv_sample" value="${esc(iv.sample)}" placeholder="예: 3EA 택배 송부"></label>
    <label>시료 발송일<input type="date" name="inv_farShipDate" value="${esc(iv.farShipDate)}"></label>
    <label>송장 · 반출증 번호<input name="inv_farShipRef" value="${esc(iv.farShipRef)}"></label>
    <label class="full row" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" name="inv_costNotice" ${iv.costNotice ? 'checked' : ''}> 비용 청구 가능성 통보 <span class="muted" style="font-size:11px">— FAR 요청서에 ‘귀사 부품 원인으로 확인되면 비용을 청구할 수 있다’는 문구를 넣습니다</span></label>
  </div>
  <div style="margin-top:12px;font-size:12px;color:var(--sub)">FAR 요청서에 넣을 사진 <span class="muted">(불량 사진 · 진행 기록 사진 · 체크 해제하면 제외 · 최대 ${FAR_PH_MAX}장)</span></div>
  <div id="invPhBox" class="row" style="gap:8px;margin-top:6px"></div>
  </div>
  <div class="ivs" data-s="reply" ${sh('reply')}>
  ${
    reqSum
      ? `<div class="banner" style="margin:8px 0 0;background:var(--pri2);border-color:transparent;color:var(--ink)">${reqSum}</div>`
      : '<div class="banner" style="margin:8px 0 0">FAR 요청일이 없습니다. 목록의 ‘요청’에서 FAR 요청을 먼저 입력하세요.</div>'
  }
  <div class="sec">FAR 회신 <span class="muted" style="font-weight:normal;font-size:12px">협력사 분석 결과와 당사 검토</span></div>
  <div class="fg">
    <label>FAR 회신일<input type="date" name="inv_farRecv" value="${esc(iv.farRecv)}"></label>
    <label>협력사 분석 판정<select name="inv_farVerdict">${opts(FAR_VERDICT, iv.farVerdict || '', true)}</select></label>
    <label>당사 검토<select name="inv_farReview">${opts(FAR_REVIEW, iv.farReview || '', true)}</select></label>
    <label class="full">FAR 회신 요약 (협력사 분석 결과)<textarea name="inv_farResult" placeholder="예: 파단면 관찰 결과 피로 파괴, 열처리 경도 HRC 38 (규격 42~48) 미달">${esc(iv.farResult)}</textarea></label>
    <label class="full">검토 의견 · 비고<input name="inv_farNote" value="${esc(iv.farNote)}" placeholder="예: 경도 측정 성적서 원본 추가 요청"></label>
  </div>
  </div>
  <div class="ivs" data-s="judge" ${sh('judge')}>
  ${
    d.resp !== '미정' && !iv.verdict
      ? `<div class="banner" style="margin:8px 0 0">이 불량의 귀책은 현재 <b>${esc(d.resp || '협력사')}</b>입니다. 판정을 입력하면 판정 결과로 바뀝니다.</div>`
      : ''
  }
  ${
    reqSum || repSum
      ? `<div class="banner" style="margin:8px 0 0;background:var(--pri2);border-color:transparent;color:var(--ink)">${[reqSum, repSum]
          .filter(Boolean)
          .join('<br>')}${iv.farResult ? `<div style="margin-top:3px;font-size:12.5px;white-space:pre-wrap">${esc(iv.farResult)}</div>` : ''}</div>`
      : ''
  }
  <div class="sec">사내 분석 <span class="muted" style="font-weight:normal;font-size:12px">재현시험 · 측정 · 분해 분석</span></div>
  ${
    cs
      ? `<div class="route" style="margin-top:0"><div class="ri dn"><span class="ck">✓</span><div class="tx"><b>RCA ${esc(cs.CaseNo)}</b> · ${esc(cs.Stage || '')} · ${esc(cs.Status || '')}<br><span class="muted">${
          czCauseSum(cs)
            ? 'RCA 결론 — ' + esc(czCauseSum(cs).slice(0, 140))
            : '사내 분석은 RCA 원인분석에서 관리합니다. RCA의 ‘귀책 판정 반영’으로 판정할 수 있습니다.'
        }</span></div><button type="button" class="b s" onclick="routeGo(&quot;czOpenCase('${cs.id}','cause')&quot;)">RCA 열기</button></div></div>
    ${
      (iv.rca || '').trim() ? `<div class="help" style="margin-top:6px">RCA 연결 전 메모: ${esc(iv.rca)}</div>` : ''
    }<input type="hidden" name="inv_rca" value="${esc(iv.rca)}">`
      : `<div class="fg"><label class="full">사내 분석 메모 <span><button type="button" class="b s" onclick="routeGo(&quot;czFromDefect('${id}')&quot;)">RCA 요청</button> <span class="muted">큰 건은 RCA로 관리 (A등급 · 고객 유출 권장)</span></span><textarea name="inv_rca" placeholder="예: 동일 LOT 재현시험 3/3 재현, 조립 토크 정상 범위 확인">${esc(iv.rca)}</textarea></label></div>`
  }
  <div class="sec">귀책 판정 <span class="muted" style="font-weight:normal;font-size:12px">원인 불명 검토 기한 ${esc(d.date ? ntfDue(d) : '-')}</span></div>
  <div class="fg">
    <label>귀책 판정<select name="inv_verdict" onchange="invVerdictI()">${opts(VERDICTS, iv.verdict, true)}</select></label>
    <label>판정일<input type="date" name="inv_verdictDate" value="${esc(iv.verdictDate)}"></label>
    <label id="shareL" style="${
      iv.verdict === '공동' ? '' : 'display:none'
    }">협력사 부담 비율 (%)<input type="number" min="0" max="100" name="inv_share" value="${esc(iv.share)}" placeholder="합의 비율"></label>
    <label class="full">판정 근거 · 비용 처리 <span style="font-size:11px">(FAR·RCA 결론 요약, 원인 불명: 사내 부담 / 협의 비율 등)</span><input name="inv_basis" value="${esc(iv.basis)}"></label>
  </div>
  <div class="help" style="margin-top:6px" id="invNext">판정하면 불량의 귀책이 바뀝니다 — <b>협력사</b>: 원인 부품 지정 후 NCR 발행 · <b>사내</b>: 사내 대책·RCA · <b>공동</b>: 분담 비율로 구상 · <b>원인 불명</b>: 완료 처리 (재발 시 재조사).</div>
  </div>`;
  const btns = [
    { label: '취소', fn: closeModal },
    { label: '저장', cls: 'p', fn: () => saveInv(id) },
  ];
  if (stg === 'req')
    btns.unshift({
      label: '저장 후 FAR 요청서 출력',
      fn: () => {
        const w = reportWin();
        if (saveInv(id, true)) printFar(id, w);
        else if (w) w.close();
      },
    });
  curInvExcl = new Set(iv.photoExcl || []);
  openModal(`${INV_STG[stg]} — ${defLabel(d)}`, body, btns);
  renderInvPhotos();
  $('#modal').dataset.inv = stg;
  if (iv.verdict) $('#mt').insertAdjacentHTML('beforeend', '<span class="qstamp">판정 완료</span>');
  if (focus)
    setTimeout(() => {
      const e = document.querySelector(`#mf [name=${focus}]`);
      if (e) {
        e.scrollIntoView({ block: 'center' });
        e.focus();
      }
    }, 120);
}
function invVerdictI() {
  const f = $('#mf'),
    v = f.inv_verdict.value;
  if (v && !f.inv_verdictDate.value) f.inv_verdictDate.value = today();
  const sl = $('#shareL');
  if (sl) sl.style.display = v === '공동' ? '' : 'none';
  const d = db.defects.find((x) => x.id === invCurId);
  if (v === '협력사' && d && !d.partNo) toast('협력사 귀책 — 불량에 원인 품번을 지정해야 NCR을 발행할 수 있습니다');
}
function saveInv(id, keep) {
  const d = db.defects.find((x) => x.id === id);
  if (!d) return false;
  const o = gather(),
    iv = Object.assign({}, d.inv || {});
  Object.keys(o).forEach((k) => {
    if (k.startsWith('inv_')) iv[k.slice(4)] = o[k];
  });
  iv.costNotice = !!o.inv_costNotice;
  delete iv.farItem;
  iv.farItems = [...$('#mf').querySelectorAll('input[name=inv_farItem]:checked')].map((x) => x.value);
  if (invCurId === id) iv.photoExcl = [...curInvExcl];
  if (iv.share !== '' && iv.share != null) iv.share = Math.max(0, Math.min(100, num(iv.share)));
  if (iv.farReq && !iv.farDue) iv.farDue = addBiz(iv.farReq, num(db.settings.farDays) || 5);
  if (iv.verdict === '공동' && (iv.share === '' || iv.share == null)) {
    toast('공동 귀책은 협력사 부담 비율을 입력하세요');
    return false;
  }
  const prev = (d.inv || {}).verdict || '';
  if (iv.verdict) {
    if (!iv.verdictDate) iv.verdictDate = today();
    d.resp = VERDICT_RESP[iv.verdict] || d.resp;
  } else {
    iv.verdictDate = '';
    if (prev && d.resp !== '미정') d.resp = '미정';
  }
  d.inv = iv;
  touch(d);
  try {
    farSyncAll();
  } catch (e) {
    console.error(e);
  }
  save(); // 연결된 NCR 의 FAR 도 같은 값으로
  if (!keep) closeModal(true);
  render();
  if (!keep && iv.verdict && iv.verdict !== prev) setTimeout(() => offerNcrAfterVerdict([id], iv.verdict), 350);
  toast(
    iv.verdict
      ? `귀책 판정: ${iv.verdict} → ${
          iv.verdict === '협력사' ? 'NCR 발행 단계' : iv.verdict === '사내' ? '사내 대책 단계' : iv.verdict === '공동' ? '분담·NCR 단계' : '완료 처리'
        }`
      : '귀책 조사를 저장했습니다',
  );
  return true;
}
let icaCurId = null;
