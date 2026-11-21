// ── NCR — 발행 시작 · 목록 (통보 · 독촉 · 회신 접수 · 표) ──
/* ================= NCR / 8D ================= */
let curLinks = [];
async function ncrFromDefect(id, extra = []) {
  const d = db.defects.find((x) => x.id === id);
  if (!d) return;
  const grp = [d, ...extra.map((i) => db.defects.find((x) => x.id === i)).filter((x) => x && x.id !== id && !x.ncrId)],
    worst = grp.map((x) => sevOf(x).grade).sort()[0];
  // 같은 이슈에서 나온 다른 불량에 진행 중인 NCR 이 있으면 — 그 NCR 에 이 불량을 묶을지, 새 NCR 을 발행할지 물음 (같은 건으로 NCR 이 여러 장 생기는 것을 막음)
  {
    const is = !d.ncrId && d.issueId && typeof issById === 'function' ? issById(d.issueId) : null;
    const ns = is
      ? issLinks(is)
          .ns.filter((n) => ncrStatus(n) !== '종결' && (!d.supplierId || !n.supplierId || n.supplierId === d.supplierId))
          .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''))
      : [];
    if (ns.length) {
      const r = await askConfirm({
        title: `같은 이슈(${is.no})에 진행 중인 NCR이 있습니다`,
        msg: '같은 건이면 기존 NCR에 이 불량을 연결하세요. 다른 건이면 새 NCR을 발행하세요.',
        items: ns.map(
          (n) =>
            `<a class="lk" onclick="ncrAddDefect('${n.id}','${d.id}')"><b>${esc(n.no)}</b></a> — ${esc(ncrStatus(n))}${
              n.supplierId ? ' · ' + esc(supName(n.supplierId)) : ''
            }${n.partNo ? ' · ' + esc(n.partNo) : ''} · 연결 불량 ${(n.defectIds || []).length}건`,
        ),
        note: (ns.length > 1 ? 'NCR 번호를 누르면 그 NCR에 연결합니다. ' : '') + '연결하면 기존 NCR 창이 열립니다. 내용을 확인하고 저장하세요.',
        ok: `${ns[0].no}에 연결`,
        alt: '새 NCR 발행',
        danger: false,
      });
      if (!r) return;
      if (r !== 'alt') {
        ncrAddDefect(ns[0].id, d.id);
        return;
      }
    }
  }
  if (
    invOpen(d) &&
    !(await askConfirm({
      title: '귀책 조사 중인 건입니다',
      msg: 'FAR · 사내 RCA로 귀책을 판정하기 전입니다. 그래도 NCR을 발행할까요?<br>(판정 후 발행하려면 취소하고 불량 기록의 ‘귀책 판정’을 먼저 입력하세요)',
      ok: 'NCR 발행',
      danger: false,
    }))
  )
    return;
  if (
    !d.partNo &&
    !(await askConfirm({
      title: '원인 부품이 비어 있습니다',
      msg: 'NCR은 원인 부품 기준으로 협력사에 통보합니다. 원인 품번 없이 발행할까요?',
      ok: '그대로 발행',
      danger: false,
    }))
  )
    return;
  const fg =
    d.fgNo || d.fgName
      ? `완성품 ${[d.fgNo, d.fgName].filter(Boolean).join(' ')} 에서 발견${d.fgQty ? ` (${num(d.fgQty).toLocaleString()}대)` : ''}`
      : '';
  const iv = d.inv || {},
    invTxt = [iv.farResult && '[FAR] ' + iv.farResult, iv.rca && '[사내 RCA] ' + iv.rca].filter(Boolean).join('\n');
  editNcr(null, {
    supplierId: d.supplierId,
    partNo: d.partNo,
    partName: d.partName,
    title: `${d.type || ''} - ${d.partName || d.partNo || ''}`,
    d2: `[${d.date} / ${d.source}]${fg ? ' ' + fg + ' —' : ''} ${d.desc || ''}\n불량수량 ${num(d.qty)}개${
      d.inspQty ? ' / 로트 ' + d.inspQty + '개' : ''
    }${d.spec || d.actual ? `\n규격: ${d.spec || '-'} / 실측: ${d.actual || '-'}` : ''}${lotOf(d) ? ' / LOT ' + lotOf(d) : ''}`,
    d3: d.containment || '',
    ...(invTxt ? { d4: invTxt } : {}),
    defectIds: grp.map((x) => x.id),
    ...(iv.farReq ? { far: farFromInv(d) } : {}),
    issueDate: today(),
    owner: d.owner,
    reqType: RESP[worst] || sevOf(d).resp,
    lotNo: lotOf(d),
    lotQty: d.inspQty || '',
    foundAt: d.source || '',
    recvDate: d.delivDate || ((d.source || '').includes('수입') ? d.date : ''),
    spec: d.spec || '',
    actual: d.actual || '',
    defectDesc: descTplDefect(d, lotOf(d)),
    defectQtyText: `${num(d.qty).toLocaleString()} EA / ${d.inspQty ? num(d.inspQty).toLocaleString() + ' EA' : '-'}`,
  });
}
// 기존 NCR 에 불량을 추가로 연결 — NCR 창(발행 정보)을 열고 연결 목록에 넣어 둠. 저장해야 반영됨
function ncrAddDefect(nid, did) {
  const c = $('#cfmNo');
  if (c) c.click();
  setTimeout(() => {
    editNcr(nid, null, 'issue');
    if (!curLinks.includes(did)) {
      curLinks.push(did);
      refreshLinks();
      mfDirty = true;
    }
    const b = $('#linkBox');
    if (b) b.scrollIntoView({ block: 'center' });
    toast('불량을 이 NCR의 연결 목록에 추가했습니다. 확인하고 저장하세요');
  }, 0);
}
// NCR 목록 정렬 기준 (열 제목 클릭) — 상태는 진행 순서대로
const NCR_ST_ORD = ['미통보', '발행', '대책요청', '대책서 검토', '보완요청', '승인(검증대기)', '검증 무효', '종결'];
const NCR_G = {
  no: (n) => n.no || '',
  issue: (n) => n.issueDate || '',
  sup: (n) => supName(n.supplierId),
  part: (n) => n.partNo || '',
  title: (n) => n.title || '',
  type: (n) => n.reqType || '8D 보고서',
  status: (n) => NCR_ST_ORD.indexOf(ncrStatus(n)),
  notify: (n) => n.notifyDate || '',
  due: (n) => n.dueDate || '',
  reply: (n) => n.replyDate || '',
  verify: (n) => n.verifyDue || '',
  links: (n) => (n.defectIds || []).length,
  owner: (n) => n.owner || '',
  files: (n) => (n.replyDocs || []).length,
};
function filteredNcrs() {
  const f = state.nf,
    q = f.q.toLowerCase();
  const L = db.ncrs
    .filter((n) => {
      const st = ncrStatus(n),
        fl = ncrFlags(n);
      if (f.sup && n.supplierId !== f.sup) return false;
      if (f.type && (n.reqType || '8D 보고서') !== f.type) return false;
      if (f.from && (n.issueDate || '') < f.from) return false;
      if (f.to && (n.issueDate || '') > f.to) return false;
      if (f.status === 'open' && st === '종결') return false;
      if (f.status === 'late' && !(fl.replyLate || fl.verifyLate || fl.requestLate || fl.d3Late)) return false;
      if (f.status === 'replyLate' && !fl.replyLate) return false;
      if (f.status === 'verifyLate' && !fl.verifyLate) return false;
      if (f.status && !['open', 'late', 'replyLate', 'verifyLate'].includes(f.status) && st !== f.status) return false;
      return !q || [n.no, n.title, n.partNo, n.partName, supName(n.supplierId), n.owner].join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || (b.no || '').localeCompare(a.no || ''));
  return msState.ncr && msState.ncr.k ? msSort(L, msState.ncr, NCR_G) : L;
}
function ncrNotifyCell(n) {
  if (n.notifyDate)
    return `<span class="nwi" title="협력사 통보일">${esc(n.notifyDate)}</span>${
      (n.noticeDocs || []).length
        ? ` <span class="bg inf" title="발송한 통보서 파일 ${(n.noticeDocs || []).length}개">${LG_ICO.clip} ${(n.noticeDocs || []).length}</span>`
        : ''
    }${n.notifyMethod ? `<br><span class="muted" style="font-size:12px">${esc(n.notifyMethod)}</span>` : ''}${
      n.requestDate && n.requestDate !== n.notifyDate && n.reqType !== '단순 통보'
        ? `<br><span class="muted" style="font-size:12px">대책 요청 ${esc(n.requestDate)}</span>`
        : ''
    }`;
  if (ncrNotified(n)) return `<span class="bg ok">통보</span> <span class="muted">(일자 미기록)</span>`;
  return `<span class="bg ${notifyLate(n) ? 'bad' : 'warn'}">${notifyLate(n) ? '통보 지연' : '미통보'}</span><br><button class="b s p noprint" style="margin-top:3px" onclick="ncrQuickNotify('${n.id}')" title="오늘 날짜로 통보 완료 처리">통보 완료</button>`;
}
// 목록에서 바로 통보 처리 — 대책 요청일 · 회신 기한 · D3 기한을 통보일 기준으로 다시 잡음
function ncrNotifyApply(n, date) {
  const old = n.requestDate || '';
  n.notifyDate = date;
  if (n.reqType !== '단순 통보' && !n.replyDate && (!old || old === n.issueDate || old < date)) {
    const oldD3 = old ? d3DefaultDue(old) : '';
    n.requestDate = date;
    n.dueDate = addDays(date, typeDays(n.reqType));
    if (!n.d3Date && (!n.d3Due || n.d3Due === oldD3)) n.d3Due = d3DefaultDue(date);
  }
}
function ncrQuickNotify(id) {
  const n = db.ncrs.find((x) => x.id === id);
  if (!n) return;
  ncrNotifyApply(n, today());
  touch(n);
  save();
  render();
  toast(
    `${n.no} 통보 완료 (${n.notifyDate})${n.reqType !== '단순 통보' ? ` — 대책서 회신 기한 ${n.dueDate || '-'}` : ''} · 통보 방법은 발행 정보의 ‘③ 협력사 통보’ 탭에서 기록`,
  );
}
// 독촉 기록 — 진행 기록(logs)에 ‘협력사 연락’으로 남김 (nudge 표시)
const nudgeLogs = (n) => (n.logs || []).filter((l) => l.nudge && !l.void).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
function ncrContact(n) {
  const sp = supById(n.supplierId);
  if (!sp) return null;
  ensureContacts(sp);
  const a = sp.contacts.filter((c) => c.active !== false);
  return a.find((c) => c.role === '품질 담당' && c.primary) || a.find((c) => c.role === '품질 담당') || primaryOf(sp);
}
function ncrNudge(id) {
  const n = db.ncrs.find((x) => x.id === id);
  if (!n) return;
  const ct = ncrContact(n),
    em = (ct && ct.email) || '',
    k = n.dueDate ? diffDays(n.dueDate, today()) : 0,
    cnt = nudgeLogs(n).length;
  const txt = `대책서 회신 독촉${cnt ? ` (${cnt + 1}차)` : ''} — 회신 기한 ${n.dueDate || '-'}${k > 0 ? ` · ${k}일 경과` : ''}`;
  openModal(
    `${n.no} 회신 독촉`,
    `<div class="fg">
    <label>방법<select name="method">${opts(LOG_METHODS, em ? '메일' : '전화')}</select></label>
    <label>상대 (협력사 담당)<input name="party" value="${esc(n.supAttn || (ct && ct.name) || '')}"></label>
    <label class="full">내용<textarea name="text" style="min-height:60px">${esc(txt)}</textarea></label>
    ${
      em
        ? `<label class="full" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" name="mail" checked> 저장 후 메일 초안 열기 <span class="muted">(${esc(em)})</span></label>`
        : '<div class="help full">협력사 기준정보에 담당자 메일이 없어 메일 초안은 열지 않습니다.</div>'
    }
  </div><div class="help">진행 기록에 ‘협력사 연락’으로 남고, 대시보드에 독촉 횟수가 표시됩니다.</div>`,
    [
      { label: '취소', fn: () => closeModal(true) },
      {
        label: '독촉 기록',
        cls: 'p',
        fn: () => {
          const f = $('#mf'),
            t = f.text.value.trim();
          if (!t) {
            toast('내용을 입력하세요');
            return;
          }
          n.logs = n.logs || [];
          n.logs.push({
            id: uid(),
            date: today(),
            kind: '협력사 연락',
            party: f.party.value.trim(),
            method: f.method.value,
            text: t,
            result: '',
            photos: [],
            by: db.settings.owners[0] || '',
            at: now(),
            nudge: true,
          });
          touch(n);
          save();
          const mail = f.mail && f.mail.checked;
          closeModal(true);
          render();
          toast(`${n.no} 독촉을 기록했습니다.`);
          if (mail && em) {
            const S = db.settings,
              sub = `[${S.company || '품질'}] ${n.no} 대책서 회신 요청`,
              body = `${(ct && ct.name) || ''} 님\n\n${n.no} (${n.partNo || ''} ${n.partName || ''}) 부적합 건의 대책서 회신 기한(${n.dueDate || '-'})이 지났습니다.\n빠른 회신 부탁드립니다.\n\n${S.company || ''} ${S.dept || ''} ${n.owner || ''}`;
            const a = document.createElement('a');
            a.href = `mailto:${encodeURIComponent(em)}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
          }
        },
      },
    ],
  );
}
// 대책서 회신일만 오늘로 기록 — 평가 · 파일 첨부는 NCR 회신 화면에서
async function ncrQuickReply(id) {
  const n = db.ncrs.find((x) => x.id === id);
  if (!n) return;
  if (n.replyDate) {
    if (ncrStatus(n) === '보완요청') await ncrResubReceive(id);
    return;
  }
  const r = await askConfirm({
    title: `${n.no} 대책서 회신을 오늘(${today()}) 접수할까요?`,
    msg: '회신일만 기록합니다. 대책서 파일 첨부와 평가는 NCR의 ‘협력사 회신’ 화면에서 이어서 합니다.',
    ok: '회신 접수',
    danger: false,
    alt: '회신 화면 열기',
  });
  if (r === 'alt') {
    editNcr(id, null, 'reply');
    return;
  }
  if (!r) return;
  n.replyDate = today();
  touch(n);
  save();
  render();
  offerAction(
    `${n.no} 회신 접수 (${n.replyDate}) — 대책서 승인 기한 ${addDays(n.replyDate, num(db.settings.approveDays) || 3)}`,
    '지금 평가하기',
    () => editNcr(id, null, 'reply'),
  );
}
// 보완요청 · 반려 뒤에 협력사가 다시 낸 대책서의 접수일 기록 — 상태가 ‘대책서 검토’로 돌아가고, 다음 평가(재제출 평가)를 마치면 그 결과로 바뀜
async function ncrResubReceive(id) {
  const n = db.ncrs.find((x) => x.id === id);
  if (!n || ncrStatus(n) !== '보완요청') return;
  const r = await askConfirm({
    title: `${n.no} 보완 대책서를 오늘(${today()}) 다시 접수할까요?`,
    msg: '재회신 접수일만 기록합니다. 상태가 ‘대책서 검토’로 바뀝니다. 대책서 파일 첨부와 재제출 평가는 NCR의 ‘협력사 회신’ 화면에서 이어서 합니다.',
    ok: '재회신 접수',
    danger: false,
    alt: '회신 화면 열기',
  });
  if (r === 'alt') {
    editNcr(id, null, 'reply');
    return;
  }
  if (!r) return;
  const le = latestEval(n);
  n.resubs = [...(n.resubs || []), { date: today(), at: now() }];
  if (le) n.resubPending = { date: today(), evalId: le.id || '' };
  else {
    n.validity = '';
    delete n.resubPending;
  } // 평가표를 쓰지 않는 건은 타당성을 비워 검토 단계로
  touch(n);
  save();
  render();
  offerAction(`${n.no} 보완 대책서 재회신 접수 (${today()})`, '지금 평가하기', () => editNcr(id, null, 'reply'));
}
function ncrTable() {
  const ns = filteredNcrs();
  return `<div class="muted" style="font-size:12px;margin-bottom:6px">${ns.length}/${db.ncrs.length}건${
    msState.ncr && msState.ncr.k
      ? ` · <a class="lk" onclick="msState.ncr={k:'',d:1};msSave();$('#ntab').innerHTML=ncrTable()">기본 정렬(최근 발행 순)로</a>`
      : ''
  }</div><div class="tw"><table><thead><tr>${sth('ncr', 'no', 'NCR 번호')}${sth('ncr', 'issue', '발행일')}${sth('ncr', 'sup', '협력사')}${sth('ncr', 'part', '부품')}${sth('ncr', 'title', '제목')}${sth('ncr', 'status', '상태')}${sth('ncr', 'notify', '통보')}${sth('ncr', 'due', '회신 기한')}${sth('ncr', 'reply', '회신일')}${sth('ncr', 'verify', '유효성 기한')}${sth('ncr', 'links', '연결 불량', 'n')}${sth('ncr', 'owner', '담당')}<th class="noprint"></th></tr></thead><tbody>
  ${
    ns
      .map((n) => {
        const st = ncrStatus(n),
          fl = ncrFlags(n);
        return `<tr class="${lateInfo('ncr', n).length ? 'late' : ''}"><td><a class="lk" onclick="editNcr('${n.id}',null,'${ncrModeDefault(n, n.id)}')"><b>${esc(n.no)}</b></a></td>
          <td>${esc(n.issueDate)}</td><td>${esc(supName(n.supplierId))}</td>
            <td>${esc(n.partNo)}<br><span class="muted">${esc(n.partName)}</span></td><td>${esc(n.title)}<br><span class="bg ${
              (n.reqType || '8D 보고서') === '8D 보고서' ? 'inf' : 'mut'
            }">${esc(n.reqType || '8D 보고서')}</span>${n.basis ? ` <span class="bg inf">${esc(n.basis)}</span>` : ''}${
              n.repeatOf ? ` <span class="bg bad" title="이전 NCR ${esc(n.repeatOf)}">재발</span>` : ''
            }${
              n.siteAudit === '요청' ? ' <span class="bg inf">현장 감사</span>' : ''
            }</td><td>${stB(st)}${ncrMini(n)}${farOn(n) ? farBadge(n) : ''}${ncrEsc(n) ? '<br>' + escB(n) : ''}</td>
  <td>${ncrNotifyCell(n)}</td>
  <td style="white-space:nowrap">${dday(n.dueDate, !!n.replyDate)}${
    fl.d3Late ? `<br><span class="bg bad" title="봉쇄 회신 기한 ${esc(n.d3Due)}">D3 봉쇄 지연</span>` : ''
  }</td><td>${
    esc(n.replyDate) ||
    (st === '대책요청' && n.reqType !== '단순 통보'
      ? `<button class="b s noprint" onclick="ncrQuickReply('${n.id}')" title="오늘 날짜로 회신일 기록">회신 접수</button>`
      : '<span class="muted">-</span>')
  }${
    (n.resubs || []).length
      ? `<br><span class="muted" style="font-size:12px" title="보완 대책서를 다시 받은 날">재회신 ${esc(
          n.resubs[n.resubs.length - 1].date.slice(5),
        )}${n.resubs.length > 1 ? ` (${n.resubs.length}회)` : ''}</span>`
      : ''
  }${
    st === '보완요청'
      ? `<br><button class="b s noprint" style="margin-top:3px" onclick="ncrQuickReply('${n.id}')" title="협력사가 보완해서 다시 낸 대책서의 접수일을 오늘로 기록">재회신 접수</button>`
      : ''
  }${!n.replyDate && nudgeLogs(n).length ? `<br><span class="muted" style="font-size:12px">독촉 ${nudgeLogs(n).length}회</span>` : ''}${
    (n.replyDocs || []).length
      ? ` <span class="bg inf" title="협력사 대책서 파일 ${(n.replyDocs || []).length}개">${LG_ICO.clip} ${(n.replyDocs || []).length}</span>`
      : ''
  }${n.replyDate && n.dueDate && n.replyDate > n.dueDate ? ' <span class="bg warn">지연접수</span>' : ''}${
    n.evalVerdict
      ? `<br><span class="bg ${VD_CLS[n.evalVerdict]}" title="대책서 평가 ${(n.evals || []).length}회차">${n.evalScore}점 ${n.evalVerdict}</span>`
      : ''
  }</td>
  <td style="white-space:nowrap">${dday(n.verifyDue, st === '종결')}</td><td class="n">${(n.defectIds || []).length}</td><td>${esc(n.owner)}</td>
  <td class="noprint" style="white-space:nowrap">${(() => {
    const nx = ncrModeDefault(n, n.id),
      b = (m, l) => `<button class="b s ${nx === m ? 'p' : ''}" onclick="editNcr('${n.id}',null,'${m}')">${l}</button>`;
    return b('issue', '발행 정보') + ' ' + (n.reqType === '단순 통보' ? '' : b('reply', '회신') + ' ') + b('verify', '검증');
  })()}</td></tr>`;
      })
      .join('') || '<tr><td colspan="13" class="muted" style="text-align:center;padding:30px">조건에 맞는 NCR이 없습니다.</td></tr>'
  }
  </tbody></table></div>`;
}
function renderNcr() {
  const f = state.nf,
    S = db.settings;
  const sel = [
    ['open', '미종결'],
    ['late', '지연 항목'],
    ['replyLate', '대책서 회신 지연'],
    ['verifyLate', '유효성 검증 지연'],
    ['', '전체'],
    ['미통보', '미통보'],
    ['발행', '발행'],
    ['대책요청', '대책요청'],
    ['대책서 검토', '대책서 검토'],
    ['보완요청', '보완요청'],
    ['승인(검증대기)', '승인 · 검증 대기'],
    ['검증 무효', '검증 무효'],
    ['종결', '종결'],
  ];
  return `<div class="pl"><div class="card noprint pltool"><div class="row">
    <button class="b p" onclick="editNcr()">+ NCR 발행</button>
    <select onchange="state.nf.status=this.value;$('#ntab').innerHTML=ncrTable()">${sel
      .map(([v, l]) => `<option value="${v}" ${v === f.status ? 'selected' : ''}>${l}</option>`)
      .join('')}</select>
    <select onchange="state.nf.sup=this.value;$('#ntab').innerHTML=ncrTable()">${supOpts(f.sup, '전체 협력사')}</select>
    <select onchange="state.nf.type=this.value;$('#ntab').innerHTML=ncrTable()"><option value="">전체 유형</option>${REQ_TYPES.map(
      (t) => `<option ${t === f.type ? 'selected' : ''}>${t}</option>`,
    ).join('')}</select>
    <span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap"><span class="muted">발행일</span><input type="date" value="${esc(f.from)}" onchange="state.nf.from=this.value;$('#ntab').innerHTML=ncrTable()"> ~ <input type="date" value="${esc(f.to)}" onchange="state.nf.to=this.value;$('#ntab').innerHTML=ncrTable()"></span>
    <input placeholder="검색 (번호·협력사·부품·제목·담당)" value="${esc(f.q)}" oninput="state.nf.q=this.value;deb(()=>{$('#ntab').innerHTML=ncrTable()})" style="width:220px">
    ${
      f.sup || f.type || f.from || f.to || f.q
        ? `<button class="b s" onclick="Object.assign(state.nf,{sup:'',type:'',from:'',to:'',q:''});render()">필터 해제</button>`
        : ''
    }
    <span style="flex:1"></span><details class="tbm tbh"><summary>기준</summary><div class="mn help">기준: 협력사 통보일 = 대책 요청일 (통보 전에는 회신 지연을 따지지 않고, 발행 후 ${NOTIFY_GRACE}일 넘게 미통보면 ‘통보 지연’) · 요청 후 D3 봉쇄 ${num(S.d3Days) || 1}일 · 8D ${num(S.reply8D) || 7}일 / 간이 ${num(S.replySimple) || 5}일 내 대책서 회신 · 발행 후 D+${S.verifyDays} 내 유효성 검증. 상태는 입력한 날짜·판정으로 자동 결정됩니다 (회신일 입력 → 대책서 검토, 타당성 ‘적정’ → 승인(검증대기), 검증일+결과 ‘유효’ → 종결).</div></details><button class="b" onclick="exportNcrCSV()">엑셀 내보내기</button>
  </div></div>
  <div class="card" id="ntab">${ncrTable()}</div></div>`;
}
