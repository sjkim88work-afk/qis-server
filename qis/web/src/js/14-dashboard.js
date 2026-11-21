/* ================= 대시보드 ================= */
const monthEnd = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return `${m}-${pad(new Date(y, mo, 0).getDate())}`;
};
// KPI 카드를 누르면 그 숫자에 해당하는 목록이 필터가 걸린 채로 열림
function dashGo(k) {
  const m = state.dashMonth,
    f0 = { from: '', to: '', sup: '', status: '', type: '', sev: '', q: '' };
  const D = (o) => {
      state.df = { ...state.df, ...f0, ...o };
      go('defect');
    },
    N = (s) => {
      state.nf = { ...state.nf, sup: '', type: '', from: '', to: '', q: '', status: s };
      go('ncr');
    };
  const A = {
    defM: () => D({ from: m + '-01', to: monthEnd(m) }),
    sevA: () => D({ from: m + '-01', to: monthEnd(m), sev: 'A' }),
    copq: () => go('copq'),
    ncrOpen: () => N('open'),
    replyLate: () => N('replyLate'),
    verifyLate: () => N('verifyLate'),
    inv: () => D({ status: 'inv' }),
    ncrRec: () => D({ status: 'ncrRec' }),
    late: () => {
      state.pf = { ...(state.pf || { kind: '', owner: '', stale: '', sup: '', sort: 'stale' }), late: '1' };
      go('prog');
    },
  };
  (A[k] || (() => {}))();
}
const kGo = (k) => `go" onclick="dashGo('${k}')" title="누르면 해당 목록으로`;
function renderDash() {
  const m = state.dashMonth,
    pm = lastMonths(m, 2)[0];
  const ds = db.defects.filter((d) => (d.date || '').startsWith(m)),
    gA = ds.filter((d) => sevOf(d).grade === 'A').length,
    gB = ds.filter((d) => sevOf(d).grade === 'B').length,
    pds = db.defects.filter((d) => (d.date || '').startsWith(pm));
  const qty = sum(ds, 'qty'),
    pqty = sum(pds, 'qty');
  const cost = allCostIn(m),
    rec = allRecvIn(m);
  const nNeedCost = db.defects.filter(needCost),
    nNeedClaim = db.defects.filter(needClaim),
    overdueClaim = db.defects.filter((d) => outstanding(d) > 0 && d.claim?.reqDate && diffDays(d.claim.reqDate, today()) > 30);
  const open = db.ncrs.filter((n) => ncrStatus(n) !== '종결');
  const fl = open.map((n) => ({ n, f: ncrFlags(n) }));
  const replyLate = fl.filter((x) => x.f.replyLate),
    verLate = fl.filter((x) => x.f.verifyLate),
    reqLate = fl.filter((x) => x.f.requestLate),
    verSoon = fl.filter((x) => x.f.verifySoon),
    d3Late = fl.filter((x) => x.f.d3Late),
    escs = open.filter(ncrEsc);
  const recs = db.defects.filter((d) => !d.ncrId && d.date && diffDays(d.date, today()) <= 90 && ncrReasons(d).length);
  const oldOpen = db.defects.filter((d) => !isDone(d) && !d.ncrId && !invOpen(d) && !icaNeed(d) && d.date && diffDays(d.date, today()) > 7);
  const invs = db.defects.filter(invOpen),
    farLate = invs.filter((d) => invInfo(d).late),
    farPre = invs.filter((d) => invInfo(d).k === 'pre'),
    ntfOver = invs.filter((d) => d.date && today() > ntfDue(d)),
    judge = invs.filter((d) => invInfo(d).k === 'judge');
  const icas = db.defects.filter((d) => icaNeed(d) && !d.ica?.doneDate),
    icaLate = icas.filter((d) => d.ica?.due && today() > d.ica.due),
    icaVLate = db.defects.filter((d) => !d.ncrId && icaVerify(d)?.k === 'late');
  const delta = (a, b) =>
    b ? `전월 ${b.toLocaleString()} → ${a > b ? '▲' : a < b ? '▼' : '－'} ${Math.abs(a - b).toLocaleString()}` : '전월 데이터 없음';
  const ms = lastMonths(m, 12);
  const byM = ms.map((x) => db.defects.filter((d) => (d.date || '').startsWith(x)));
  const supMap = {},
    typeMap = {};
  ds.forEach((d) => {
    const s = supName(d.supplierId) || '(미지정)';
    supMap[s] = (supMap[s] || 0) + num(d.qty);
    typeMap[d.type || '(미지정)'] = (typeMap[d.type || '(미지정)'] || 0) + 1;
  });
  let banner = '';
  const total = COLLS.reduce((a, c) => a + db[c].length, 0);
  // 서버형은 복원 · 가져오기가 관리자 전용(관리 화면)이라 대시보드 안내를 띄우지 않음
  if (SRV) {
  } else if (!total && /^https?:$/.test(location.protocol))
    banner = `<div class="banner">📦 <b>예전 HTML 파일로 쓰던 데이터가 있나요?</b> 데이터가 사라졌다면 <button class="b s p" onclick="restoreFromFolder()">백업 폴더에서 복원</button> — 백업 폴더에서 가장 최근 백업을 찾아 되살립니다. 예전 HTML 파일의 데이터는 그 파일에서 <b>백업</b>을 누른 뒤 <button class="b s" onclick="pickImport('replace')">백업 파일로 복원</button>. <span class="muted">처음 쓰는 경우에는 <b>기준정보</b>에서 협력사·부품을 등록하세요.</span></div>`;
  else if (!total)
    banner = `<div class="banner">데이터가 비어 있습니다. <b>기준정보</b>에서 협력사·부품을 등록하거나(엑셀 붙여넣기 지원), <b>불량 관리</b>에서 불량을 등록하세요. 기존 백업 파일이 있으면 <a class="lk" onclick="state.setTab='backup';go('data')">설정·백업</a>에서 복원할 수 있습니다.</div>`;
  const li = (arr, fn) =>
    arr.length ? arr.slice(0, 8).map(fn).join('') + (arr.length > 8 ? `<li class="muted">외 ${arr.length - 8}건</li>` : '') : '';
  const own = (x) => !czOwns(x.n, 'ncr'),
    ownD = (d) => !czOwns(d, 'defect');
  const actions =
    issDashItems() +
    czDashItems() +
    li(
      open.filter((n) => !czOwns(n, 'ncr') && ncrStatus(n) === '미통보').sort((a, b) => (a.issueDate || '').localeCompare(b.issueDate || '')),
      (n) =>
        `<li><span class="bg ${notifyLate(n) ? 'bad' : 'warn'}">${notifyLate(n) ? '통보 지연' : '미통보'}</span> <a class="lk" onclick="editNcr('${n.id}',null,'issue')">${esc(n.no)}</a> ${esc(supName(n.supplierId))} — 발행 ${esc(n.issueDate)} · 협력사 통보 전 <button class="b s noprint" onclick="ncrQuickNotify('${n.id}')">오늘 통보 완료</button></li>`,
    ) +
    li(
      open.filter((n) => !czOwns(n, 'ncr') && ncrStatus(n) === '검증 무효'),
      (n) =>
        `<li><span class="bg bad">재발 · 재대책 필요</span> <a class="lk" onclick="editNcr('${n.id}',null,'verify')">${esc(n.no)}</a> ${esc(supName(n.supplierId))} — 검증 무효(재발): 재대책 요청 또는 특채·상위 보고 검토</li>`,
    ) +
    li(
      d3Late.filter(own),
      (x) =>
        `<li><span class="bg bad">D3 봉쇄 지연</span> <a class="lk" onclick="editNcr('${x.n.id}')">${esc(x.n.no)}</a> ${esc(supName(x.n.supplierId))} — 봉쇄 회신 기한 ${esc(x.n.d3Due)}</li>`,
    ) +
    li(
      escs.filter((n) => !czOwns(n, 'ncr')),
      (n) =>
        `<li>${escB(n)} <a class="lk" onclick="editNcr('${n.id}')">${esc(n.no)}</a> ${esc(supName(n.supplierId))} — 현장 감사·상위 보고 검토</li>`,
    ) +
    li(replyLate.filter(own), (x) => {
      const nu = nudgeLogs(x.n);
      return `<li><span class="bg bad">회신지연</span> <a class="lk" onclick="editNcr('${x.n.id}')">${esc(x.n.no)}</a> ${esc(supName(x.n.supplierId))} — 기한 ${x.n.dueDate} (D+${diffDays(x.n.dueDate, today())})${
        nu.length ? ` · <span class="muted">독촉 ${nu.length}회, 최근 ${esc(nu[nu.length - 1].date)}</span>` : ''
      } <button class="b s noprint" onclick="ncrNudge('${x.n.id}')">독촉</button> <button class="b s noprint" onclick="ncrQuickReply('${x.n.id}')">회신 접수(오늘)</button></li>`;
    }) +
    li(
      verLate.filter(own),
      (x) =>
        `<li><span class="bg bad">유효성지연</span> <a class="lk" onclick="editNcr('${x.n.id}')">${esc(x.n.no)}</a> ${esc(supName(x.n.supplierId))} — 기한 ${x.n.verifyDue}</li>`,
    ) +
    li(
      verSoon.filter(own),
      (x) =>
        `<li><span class="bg warn">유효성 임박</span> <a class="lk" onclick="editNcr('${x.n.id}')">${esc(x.n.no)}</a> 기한 ${x.n.verifyDue}</li>`,
    ) +
    li(
      farLate.filter(ownD),
      (d) =>
        `<li><span class="bg bad">FAR 회신 지연</span> <a class="lk" onclick="editInv('${d.id}','','reply')">${esc(defLabel(d))}</a> ${esc(supName(d.supplierId))} — 기한 ${esc(d.inv.farDue)}</li>`,
    ) +
    li(
      farPre.filter(ownD),
      (d) =>
        `<li><span class="bg warn">FAR 미요청</span> <a class="lk" onclick="editInv('${d.id}','','req')">${esc(defLabel(d))}</a> ${esc(supName(d.supplierId))} — 귀책 미정</li>`,
    ) +
    li(
      judge.filter(ownD),
      (d) =>
        `<li><span class="bg inf">귀책 판정 대기</span> <a class="lk" onclick="editInv('${d.id}','','judge')">${esc(defLabel(d))}</a> FAR 회신 ${esc(d.inv.farRecv)}</li>`,
    ) +
    li(
      ntfOver.filter(ownD),
      (d) =>
        `<li><span class="bg warn">원인 불명 검토</span> <a class="lk" onclick="editInv('${d.id}','','judge')">${esc(defLabel(d))}</a> — 조사 기한 ${esc(ntfDue(d))} 경과 · 판정 또는 원인 불명 종결</li>`,
    ) +
    li(
      icaLate.filter(ownD),
      (d) =>
        `<li><span class="bg bad">사내 대책 지연</span> <a class="lk" onclick="editDefect('${d.id}')">${esc(defLabel(d))}</a> ${esc(icaLevel(d))} — 기한 ${esc(d.ica.due)}</li>`,
    ) +
    li(
      icaVLate.filter(ownD),
      (d) =>
        `<li><span class="bg bad">사내 유효성 지연</span> <a class="lk" onclick="editDefect('${d.id}')">${esc(defLabel(d))}</a> — 기한 ${esc(d.ica.verifyDue)}</li>`,
    ) +
    li(
      fl.filter((x) => x.f.farLate).filter(own),
      (x) =>
        `<li><span class="bg bad">FAR 지연</span> <a class="lk" onclick="editNcr('${x.n.id}')">${esc(x.n.no)}</a> ${esc(supName(x.n.supplierId))} — 분석 회신 기한 ${x.n.far.due}</li>`,
    ) +
    li(
      db.defects.filter(
        (d) =>
          !d.caseId &&
          !czOwns(d, 'defect') &&
          d.date &&
          diffDays(d.date, today()) <= 90 &&
          !d.closed &&
          routeOf(d).some((x) => x.bl === 'RCA 요청' && x.rec && !x.done),
      ),
      (d) => {
        const x = routeOf(d).find((y) => y.bl === 'RCA 요청');
        return `<li><span class="bg warn">RCA 권고</span> <a class="lk" onclick="openLog('${d.id}')">${d.date} ${esc(d.partName || d.partNo)}</a> ${esc(supName(d.supplierId))} — ${esc(x.t.split(' — ')[0])} · 심각도 ${sevOf(d).grade} <button class="b s" onclick="czFromDefect('${d.id}')">RCA 요청</button></li>`;
      },
    ) +
    li(
      ppmScarRecs(),
      (r) =>
        `<li><span class="bg warn">PPM 초과 · SCAR 권고</span> <b>${esc(r.s.name)}</b> — ${r.rows
          .map((x) => `${x.m.slice(5)}월 ${ppmTxt(x.ppm)}`)
          .join(' · ')} PPM (기준 ${num(
          db.settings.ppmScar,
        ).toLocaleString()}) <button class="b s" onclick="ppmScarIssue('${r.s.id}')">NCR(8D) 발행</button></li>`,
    ) +
    li(
      recs.filter(ownD),
      (d) =>
        `<li><span class="bg warn">NCR 권고</span> <a class="lk" onclick="editDefect('${d.id}')">${esc(defLabel(d))}</a> ${esc(supName(d.supplierId))} — ${esc(ncrReasons(d).join(', '))} <button class="b s" onclick="ncrFromDefect('${d.id}')">NCR 발행</button></li>`,
    ) +
    (db.defects.filter((d) => d.resp === '미정' && costTotal(d) > 0 && !d.closed).length
      ? `<li><span class="bg warn">정산 대기</span> 귀책 미정 불량의 실패비용 ${
          db.defects.filter((d) => d.resp === '미정' && costTotal(d) > 0 && !d.closed).length
        }건 (${won(
          sum(
            db.defects.filter((d) => d.resp === '미정' && costTotal(d) > 0 && !d.closed),
            costTotal,
          ),
        )}원) — 귀책 판정 후 구상 · 분담</li>`
      : '') +
    (nNeedCost.length
      ? `<li><span class="bg warn">비용 미입력</span> 처리 완료된 불량 ${nNeedCost.length}건 — <a class="lk" onclick="go('copq')">COPQ에서 입력</a></li>`
      : '') +
    (nNeedClaim.length
      ? `<li><span class="bg warn">구상 미청구</span> 협력사 귀책 비용 ${nNeedClaim.length}건 (${won(sum(nNeedClaim, costTotal))}원) — <a class="lk" onclick="go('copq')">COPQ에서 확인</a></li>`
      : '') +
    li(
      overdueClaim,
      (d) =>
        `<li><span class="bg bad">미회수 30일+</span> <a class="lk" onclick="openCost('${d.id}')">${esc(supName(d.supplierId))} ${esc(defLabel(d).slice(11))}</a> 청구 ${esc(d.claim.reqDate)} · 잔액 ${won(outstanding(d))}원</li>`,
    ) +
    li(oldOpen.filter(ownD), (d) => {
      const l = lastLog(d);
      return `<li><span class="bg mut">7일+ 미완료</span> <a class="lk" onclick="editDefect('${d.id}')">${esc(defLabel(d))}</a> ${esc(supName(d.supplierId))} <a class="lk muted" style="font-size:12px" onclick="openLog('${d.id}')">${
        l
          ? `· 최근 기록 ${esc(l.date)} (${diffDays(l.date, today())}일 전): ${esc(l.text.slice(0, 30))}${l.text.length > 30 ? '…' : ''}`
          : '· 진행 기록 없음 — 기록 추가'
      }</a></li>`;
    });
  if (inFrame)
    banner =
      `<div class="banner noprint">지금은 미리보기 화면 안에서 열려 있어 <b>인쇄·파일 저장이 막힐 수 있습니다.</b> 파일을 내려받아 Edge/Chrome에서 직접 여세요.</div>` +
      banner;
  return `${banner}
  <div class="row noprint" style="margin-bottom:12px"><b>기준월</b><input type="month" value="${m}" onchange="state.dashMonth=this.value||today().slice(0,7);render()"><span class="sp" style="flex:1"></span><button class="b" onclick="editDefect()">+ 불량 등록</button><button class="b" onclick="weekReport()" title="오늘까지 최근 7일 — 신규 불량 · NCR · RCA · 지연 · 다음 주 기한">주간 보고 (최근 7일)</button><button class="b p" onclick="dashReport()">월간 보고 인쇄 / PDF</button></div>
  ${progCard()}
  ${(() => {
    // 요약 수치 — 급한 순서로 세 묶음 (지연 → 진행 중 → 이번 달 발생). 값이 0 이면 약하게, 지연은 강하게
    const k = (key, cls, label, v, sub, zero) =>
      `<div class="kpi ${zero ? 'z' : cls} ${kGo(key)}"><div class="l">${label}<span class="s">${sub}</span></div><div class="v">${v}</div></div>`;
    const g = (t, note, rows) => `<div class="kg"><h4>${t} <span>${note}</span></h4>${rows.join('')}</div>`;
    return `<div class="kgs">${g('지연', '기한이 지난 것', [
      k(
        'replyLate',
        'bad',
        '대책서 회신 지연',
        replyLate.length,
        `회신 기한 (8D ${num(db.settings.reply8D) || 7}일 · 간이 ${num(db.settings.replySimple) || 5}일) 기준`,
        !replyLate.length,
      ),
      k('verifyLate', 'bad', '유효성 검증 지연', verLate.length, `승인 후 D+${db.settings.verifyDays} 기준`, !verLate.length),
    ])}${g('진행 중', '끝나지 않은 것', [
      k('ncrOpen', 'on', '미종결 NCR', open.length, `전체 ${db.ncrs.length}건`, !open.length),
      k('inv', farLate.length ? 'bad' : 'on', '귀책 조사 중', invs.length, `FAR 지연 ${farLate.length} · 사내 대책 ${icas.length}`, !invs.length),
      k('ncrRec', 'on', 'NCR 미발행 (A·B등급)', recs.length, '최근 90일', !recs.length),
    ])}${g(`${m} 발생`, '이번 달', [
      k('defM', 'on', '불량 건수', ds.length.toLocaleString(), delta(ds.length, pds.length), !ds.length),
      k('defM', 'on', '불량 수량', qty.toLocaleString(), delta(qty, pqty), !qty),
      k('copq', 'on', '실패비용 (COPQ)', fmtShort(cost), `회수 ${won(rec)}원 (${cost ? Math.round((rec / cost) * 100) : 0}%)`, !cost),
      k('sevA', 'bad', '심각도 A', gA, `B ${gB} · C ${ds.length - gA - gB}`, !gA),
    ])}</div>`;
  })()}
  ${(() => {
    const it = (dashItems = actions.match(/<li[\s\S]*?<\/li>/g) || []),
      all = !!state.dashAll,
      k = all ? it.length : 6;
    return `<div class="card"><h3>오늘 챙길 일 ${it.length ? `<span class="bg mut">${it.length}</span>` : ''}<span class="sp"></span>${
      it.length > 6
        ? `<button class="b s noprint" onclick="state.dashAll=!state.dashAll;render()">${all ? '6건만 보기' : `전체 ${it.length}건 보기`}</button>`
        : ''
    }</h3>${
      it.length
        ? `<ul class="act">${it.slice(0, k).join('')}</ul>${
            it.length > k
              ? `<div class="muted" style="font-size:12px">외 ${it.length - k}건 — <a class="lk" onclick="state.dashAll=true;render()">모두 펼치기</a></div>`
              : ''
          }`
        : '<div class="muted">지연·임박 항목이 없습니다.</div>'
    }</div>`;
  })()}
  ${reviewCard(m)}
  <div class="grid g2">
    <div class="card"><h3>월별 불량 건수 (최근 12개월)</h3>${barChart(
      ms.map((x) => x.slice(2).replace('-', '.')),
      [{ name: '건수', values: byM.map((a) => a.length), color: '#007A78' }],
    )}</div>
    <div class="card"><h3>월별 불량 수량</h3>${barChart(
      ms.map((x) => x.slice(2).replace('-', '.')),
      [{ name: '수량', values: byM.map((a) => sum(a, 'qty')), color: '#5b8def' }],
    )}</div>
    ${
      db.cases.length
        ? `<div class="card"><h3>RCA 월별 등록 · 종결 (최근 12개월)</h3>${barChart(
            ms.map((x) => x.slice(2).replace('-', '.')),
            [
              { name: '등록', values: ms.map((x) => db.cases.filter((c) => (c.Created || '').startsWith(x)).length), color: '#d9822b' },
              {
                name: '종결',
                values: ms.map((x) => db.cases.filter((c) => c.Status === '종결' && (c.CloseDate || '').startsWith(x)).length),
                color: '#1a8f5a',
              },
            ],
          )}</div>`
        : ''
    }
    <div class="card"><h3>${m} 협력사별 불량 수량 (파레토)</h3>${pareto(supMap, '개')}</div>
    <div class="card"><h3>${m} 불량유형별 건수 (파레토)</h3>${pareto(typeMap, '건')}</div>
    ${
      ds.some((d) => d.fgNo || d.fgName)
        ? (() => {
            const fm = {},
              cm = {};
            ds.forEach((d) => {
              if (d.fgNo || d.fgName) {
                const k = d.fgName || d.fgNo;
                fm[k] = (fm[k] || 0) + 1;
                const c = d.partName || d.partNo || '(조사 중)';
                cm[c] = (cm[c] || 0) + 1;
              }
            });
            return `<div class="card"><h3>${m} 발견 품목(완성품)별 건수</h3>${pareto(fm, '건')}</div>
              <div class="card"><h3>${m} 완성품 불량의 원인 부품</h3>${pareto(cm, '건')}</div>`;
          })()
        : ''
    }
  </div>`;
}
