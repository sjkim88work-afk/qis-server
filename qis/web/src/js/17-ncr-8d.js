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
            `<a class="lk" onclick="ncrAddDefect('${n.id}','${d.id}')"><b>${esc(n.no)}</b></a> — ${esc(ncrStatus(n))}${n.supplierId ? ' · ' + esc(supName(n.supplierId)) : ''}${n.partNo ? ' · ' + esc(n.partNo) : ''} · 연결 불량 ${(n.defectIds || []).length}건`,
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
    d2: `[${d.date} / ${d.source}]${fg ? ' ' + fg + ' —' : ''} ${d.desc || ''}\n불량수량 ${num(d.qty)}개${d.inspQty ? ' / 로트 ' + d.inspQty + '개' : ''}${d.spec || d.actual ? `\n규격: ${d.spec || '-'} / 실측: ${d.actual || '-'}` : ''}${lotOf(d) ? ' / LOT ' + lotOf(d) : ''}`,
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
    return `<span class="nwi" title="협력사 통보일">${esc(n.notifyDate)}</span>${(n.noticeDocs || []).length ? ` <span class="bg inf" title="발송한 통보서 파일 ${(n.noticeDocs || []).length}개">📎 ${(n.noticeDocs || []).length}</span>` : ''}${n.notifyMethod ? `<br><span class="muted" style="font-size:11.5px">${esc(n.notifyMethod)}</span>` : ''}${n.requestDate && n.requestDate !== n.notifyDate && n.reqType !== '단순 통보' ? `<br><span class="muted" style="font-size:11.5px">대책 요청 ${esc(n.requestDate)}</span>` : ''}`;
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
    ${em ? `<label class="full" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" name="mail" checked> 저장 후 메일 초안 열기 <span class="muted">(${esc(em)})</span></label>` : '<div class="help full">협력사 기준정보에 담당자 메일이 없어 메일 초안은 열지 않습니다.</div>'}
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
  return `<div class="muted" style="font-size:12px;margin-bottom:6px">${ns.length}/${db.ncrs.length}건${msState.ncr && msState.ncr.k ? ` · <a class="lk" onclick="msState.ncr={k:'',d:1};msSave();$('#ntab').innerHTML=ncrTable()">기본 정렬(최근 발행 순)로</a>` : ''}</div><div class="tw"><table><thead><tr>${sth('ncr', 'no', 'NCR 번호')}${sth('ncr', 'issue', '발행일')}${sth('ncr', 'sup', '협력사')}${sth('ncr', 'part', '부품')}${sth('ncr', 'title', '제목')}${sth('ncr', 'status', '상태')}${sth('ncr', 'notify', '통보')}${sth('ncr', 'due', '회신 기한')}${sth('ncr', 'reply', '회신일')}${sth('ncr', 'verify', '유효성 기한')}${sth('ncr', 'links', '연결 불량', 'n')}${sth('ncr', 'owner', '담당')}<th class="noprint"></th></tr></thead><tbody>
  ${
    ns
      .map((n) => {
        const st = ncrStatus(n),
          fl = ncrFlags(n);
        return `<tr class="${lateInfo('ncr', n).length ? 'late' : ''}"><td><a class="lk" onclick="editNcr('${n.id}',null,'${ncrModeDefault(n, n.id)}')"><b>${esc(n.no)}</b></a></td><td>${esc(n.issueDate)}</td><td>${esc(supName(n.supplierId))}</td><td>${esc(n.partNo)}<br><span class="muted">${esc(n.partName)}</span></td><td>${esc(n.title)}<br><span class="bg ${(n.reqType || '8D 보고서') === '8D 보고서' ? 'inf' : 'mut'}">${esc(n.reqType || '8D 보고서')}</span>${n.basis ? ` <span class="bg inf">${esc(n.basis)}</span>` : ''}${n.repeatOf ? ` <span class="bg bad" title="이전 NCR ${esc(n.repeatOf)}">재발</span>` : ''}${n.siteAudit === '요청' ? ' <span class="bg inf">현장 감사</span>' : ''}</td><td>${stB(st)}${ncrMini(n)}${farOn(n) ? farBadge(n) : ''}${ncrEsc(n) ? '<br>' + escB(n) : ''}</td>
  <td>${ncrNotifyCell(n)}</td>
  <td style="white-space:nowrap">${dday(n.dueDate, !!n.replyDate)}${fl.d3Late ? `<br><span class="bg bad" title="봉쇄 회신 기한 ${esc(n.d3Due)}">D3 봉쇄 지연</span>` : ''}</td><td>${esc(n.replyDate) || (st === '대책요청' && n.reqType !== '단순 통보' ? `<button class="b s noprint" onclick="ncrQuickReply('${n.id}')" title="오늘 날짜로 회신일 기록">회신 접수</button>` : '<span class="muted">-</span>')}${(n.resubs || []).length ? `<br><span class="muted" style="font-size:11.5px" title="보완 대책서를 다시 받은 날">재회신 ${esc(n.resubs[n.resubs.length - 1].date.slice(5))}${n.resubs.length > 1 ? ` (${n.resubs.length}회)` : ''}</span>` : ''}${st === '보완요청' ? `<br><button class="b s noprint" style="margin-top:3px" onclick="ncrQuickReply('${n.id}')" title="협력사가 보완해서 다시 낸 대책서의 접수일을 오늘로 기록">재회신 접수</button>` : ''}${!n.replyDate && nudgeLogs(n).length ? `<br><span class="muted" style="font-size:11.5px">독촉 ${nudgeLogs(n).length}회</span>` : ''}${(n.replyDocs || []).length ? ` <span class="bg inf" title="협력사 대책서 파일 ${(n.replyDocs || []).length}개">📎 ${(n.replyDocs || []).length}</span>` : ''}${n.replyDate && n.dueDate && n.replyDate > n.dueDate ? ' <span class="bg warn">지연접수</span>' : ''}${n.evalVerdict ? `<br><span class="bg ${VD_CLS[n.evalVerdict]}" title="대책서 평가 ${(n.evals || []).length}회차">${n.evalScore}점 ${n.evalVerdict}</span>` : ''}</td>
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
  return `<div class="card noprint"><div class="row">
    <button class="b p" onclick="editNcr()">+ NCR 발행</button>
    <select onchange="state.nf.status=this.value;$('#ntab').innerHTML=ncrTable()">${sel.map(([v, l]) => `<option value="${v}" ${v === f.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <select onchange="state.nf.sup=this.value;$('#ntab').innerHTML=ncrTable()">${supOpts(f.sup, '전체 협력사')}</select>
    <select onchange="state.nf.type=this.value;$('#ntab').innerHTML=ncrTable()"><option value="">전체 유형</option>${REQ_TYPES.map((t) => `<option ${t === f.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap"><span class="muted">발행일</span><input type="date" value="${esc(f.from)}" onchange="state.nf.from=this.value;$('#ntab').innerHTML=ncrTable()"> ~ <input type="date" value="${esc(f.to)}" onchange="state.nf.to=this.value;$('#ntab').innerHTML=ncrTable()"></span>
    <input placeholder="검색 (번호·협력사·부품·제목·담당)" value="${esc(f.q)}" oninput="state.nf.q=this.value;deb(()=>{$('#ntab').innerHTML=ncrTable()})" style="width:220px">
    ${f.sup || f.type || f.from || f.to || f.q ? `<button class="b s" onclick="Object.assign(state.nf,{sup:'',type:'',from:'',to:'',q:''});render()">필터 해제</button>` : ''}
    <span style="flex:1"></span><button class="b" onclick="exportNcrCSV()">엑셀 내보내기</button>
  </div>
  <div class="help" style="margin-top:8px">기준: 협력사 통보일 = 대책 요청일 (통보 전에는 회신 지연을 따지지 않고, 발행 후 ${NOTIFY_GRACE}일 넘게 미통보면 ‘통보 지연’) · 요청 후 D3 봉쇄 ${num(S.d3Days) || 1}일 · 8D ${num(S.reply8D) || 7}일 / 간이 ${num(S.replySimple) || 5}일 내 대책서 회신 · 발행 후 D+${S.verifyDays} 내 유효성 검증. 상태는 입력한 날짜·판정으로 자동 결정됩니다 (회신일 입력 → 대책서 검토, 타당성 ‘적정’ → 승인(검증대기), 검증일+결과 ‘유효’ → 종결).</div></div>
  <div class="card" id="ntab">${ncrTable()}</div>`;
}
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
  curVLots = (n.vlots && n.vlots.length ? n.vlots : [{}, {}, {}]).map((r) => ({
    lot: r.lot || '',
    date: r.date || '',
    insp: r.insp ?? '',
    ng: r.ng ?? '',
  }));
  curEvals = JSON.parse(JSON.stringify(n.evals || []));
  curEvIdx = Math.max(0, curEvals.length - 1);
  const has8D = !!n.replyDate || ['d4', 'd5', 'd6', 'd7', 'd8'].some((k) => String(n[k] || '').trim());
  const sevD = (n.defectIds || [])
    .map((i) => db.defects.find((d) => d.id === i))
    .filter(Boolean)
    .map(sevOf)
    .sort((a, b) => 'ABC'.indexOf(a.grade) - 'ABC'.indexOf(b.grade) || b.score - a.score)[0];
  curNcrSev = sevD || null;
  const body = `${id ? ncrTrack(n) : ''}${sevD ? `<div class="banner" style="background:${sevD.grade === 'A' ? 'var(--badb)' : sevD.grade === 'B' ? 'var(--warnb)' : 'var(--mut)'};border-color:transparent;color:#1d2433">연결 불량 심각도 <span class="bg ${SEV_CLS[sevD.grade]}" style="font-size:13px">${sevD.grade}</span> ${sevD.score}점${sevD.forced.length ? ' (강제 A: ' + esc(sevD.forced.join(', ')) + ')' : ''}${sevD.overridden ? ' (수동 조정: ' + esc(sevD.reason) + ')' : ''} → 권장 대응 <b>${sevD.resp}</b></div>` : ''}${farLine(n)}${ncrTabsBar(id, n, !!mode)}<div class="ntp" data-p="a">
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
  <div class="help" style="margin:0 0 8px">순서: ① 발행 정보 → ② 통보서 내용 → 창 아래 ‘저장 후 통보서 출력’으로 통보서를 보냄 → 여기에 통보일 · 방법을 기록하고 보낸 파일을 첨부</div>
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
    <label>요구 회신 유형 (대응 수준)<select name="reqType" onchange="mfDirty=true;applyReqType(true)">${opts(REQ_TYPES, n.reqType || REQ_TYPES[0])}</select></label>
    <label>현장 감사<select name="siteAudit" onchange="mfDirty=true" title="요청으로 두면 통보서 요구사항에 현장 감사 예정 문구가 붙습니다">${opts(['없음', '요청'], n.siteAudit || '없음')}</select></label>
    <div id="rtWarn" class="full" style="grid-column:1/-1"></div>
    <label>대책 요청일<input type="date" name="requestDate" value="${esc(n.requestDate || (n.reqType === '단순 통보' ? '' : n.issueDate || ''))}" oninput="ncrAutoDates('req')" title="기본값은 협력사 통보일(통보 전에는 NCR 발행일)입니다."></label>
    <label>회신 기한 <span id="dueHint">(요청+${typeDays(n.reqType)}일)</span><input type="date" name="dueDate" value="${esc(n.dueDate || (n.reqType === '단순 통보' || !(n.requestDate || n.issueDate) ? '' : addDays(n.requestDate || n.issueDate, typeDays(n.reqType))))}"></label>
  </div>
  <div class="sec">연결된 불량</div><div id="linkBox"></div>
  </div>
<div class="ntp" data-p="r">
  <div class="sec">대책서 회신 · 판정</div>
  ${id && n.resubPending ? `<div class="banner" style="margin:0 0 10px;background:var(--pri2);border-color:transparent;color:var(--ink)">보완 대책서 재회신 접수 <b>${esc(n.resubPending.date)}</b> — 아래 대책서 평가에서 <b>+ 재제출 평가</b>를 눌러 다시 평가하세요. 평가를 마치고 저장하면 결과가 반영됩니다.</div>` : ''}
  ${id && ncrEsc(n) ? `<div class="banner" style="margin:0 0 10px">대책서 보완요청·반려·검증 무효가 <b>${ncrRejects(n)}회</b>입니다 (기준 ${num(S.escCount) || 2}회). 현장 감사나 상위 보고를 검토하세요.</div>` : ''}
  <div class="fg">
    <label>대책서 회신일<input type="date" name="replyDate" value="${esc(n.replyDate)}" oninput="if(this.value){const w=$('#evalWrap'),r=$('#wrap8D');if(w)w.open=true;if(r)r.open=true;renderEval()}"></label>
    <label>대책 타당성<select name="validity">${opts(['적정', '보완요청'], n.validity, true)}</select></label>
  </div>
  <div class="sec" style="margin-top:12px">협력사 대책서 파일 <span class="muted" style="font-weight:normal;font-size:12px">— 받은 8D · 간이 대책서 원본 (PDF · PPT · Excel · Word · 이미지, 파일당 20MB) · 끌어다 놓아도 됩니다</span></div>
  <div id="replyBox" class="docbox"></div>
  <details id="wrap8D" open style="margin-top:14px"><summary class="sec" style="cursor:pointer;list-style:revert"><span class="ttl">협력사 대책서 (8D) 회신 내용</span> <span class="muted" style="font-weight:normal;font-size:12px">— 대책서를 받은 뒤 요약 입력 (발행 시에는 비워둬도 됩니다)</span></summary>
  <div class="fg">${D8.map(([k, l]) => `<label class="full" data-dk="${k}"><span class="dl" data-o="${l}">${l}</span><textarea name="${k}">${esc(n[k])}</textarea></label>`).join('')}</div></details>
  <details id="evalWrap" open style="margin-top:14px"><summary class="sec" style="cursor:pointer;list-style:revert">대책서 평가 (점검 기준·점수) <span class="muted" style="font-weight:normal;font-size:12px">— 항목별 미흡/부분/충족 → 총점·판정 자동</span></summary>
  <div id="evalBox"></div></details>
  </div>
<div class="ntp" data-p="b">
  <div id="d3Wrap"><div class="sec">D3 봉쇄 회신 <span class="muted" style="font-weight:normal;font-size:12px">— 대책서와 별도로, 협력사가 대책 요청 후 ${num(S.d3Days) || 1}일 안에 선별·봉쇄 결과를 먼저 회신</span></div>
  <div class="fg">
    <label>봉쇄 회신 기한 (요청+${num(S.d3Days) || 1}일)<input type="date" name="d3Due" value="${esc(n.d3Due || (!id && n.reqType !== '단순 통보' ? d3DefaultDue(n.requestDate || n.issueDate) : ''))}"></label>
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
    <label title="비우면 대책 승인일 + ${S.verifyDays}일로 자동 설정">유효성 검증 기한 (승인+${S.verifyDays}일)<input type="date" name="verifyDue" value="${esc(n.verifyDue)}"></label>
    <label>유효성 검증일<input type="date" name="verifyDate" value="${esc(n.verifyDate)}"></label>
    <label>검증 결과<select name="verifyResult">${opts(['유효', '무효(재발)'], n.verifyResult, true)}</select></label>
    <label>특채 여부<select name="concession" onchange="concShow()">${opts(['없음', '특채 진행', '특채 승인'], n.concession || '없음')}</select></label>
    <div id="concWrap" style="grid-column:1/-1"><div style="font-size:12px;color:var(--sub);margin-bottom:6px">특채 신청서 · 고객 승인 문서 <span class="muted">(PDF · 이미지 · 엑셀 · 워드 등 · 끌어다 놓기 가능)</span></div>
      <div id="concBox" class="docbox"></div></div>
  </div>
  ${id && String(n.verifyResult || '').startsWith('무효') ? `<div class="banner" style="background:var(--badb);border-color:transparent;margin-top:10px">검증 결과 <b>무효(재발)</b> — 대책이 효과가 없었습니다. <button type="button" class="b s p" onclick="ncrRework('${n.id}')">재대책 요청</button> <span class="muted">이번 검증 기록은 이력으로 남고 대책서를 다시 요청합니다</span></div>` : ''}
  ${(n.verifyHist || []).length ? `<div class="muted" style="font-size:12px;margin-top:8px">이전 검증 이력: ${n.verifyHist.map((h, i) => `${i + 1}차 ${esc(h.date)} ${esc(h.result)}`).join(' · ')}</div>` : ''}
  <div class="sec">유효성 검증 LOT · 종결 <span class="muted" style="font-weight:normal;font-size:12px">— 대책 적용 후 입고 LOT별 결과 · 종결 시 협력사 평가 감점</span></div>
  <div style="font-size:12px;color:var(--sub)">검증 LOT <button type="button" class="b s" onclick="curVLots.push({lot:'',date:'',insp:'',ng:''});mfDirty=true;renderVLots()">+ 행</button></div>
  <div id="vlotBox"></div>
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
function dkInit(k, ids) {
  const K = DOCK[k];
  K.L = [];
  K.D = [];
  dkRender(k);
  if ((ids || []).length)
    photoGetMany(ids)
      .then((rs) => {
        K.L = [...rs.map((r) => ({ ...r, isNew: false })), ...K.L.filter((x) => x.isNew)];
        dkRender(k);
      })
      .catch(() => {});
  const b = $('#' + K.box);
  if (!b) return;
  b.addEventListener('dragover', (e) => {
    e.preventDefault();
    b.classList.add('drag');
  });
  b.addEventListener('dragleave', () => b.classList.remove('drag'));
  b.addEventListener('drop', (e) => {
    e.preventDefault();
    b.classList.remove('drag');
    dkAdd(k, [...e.dataTransfer.files]);
  });
}
function dkRender(k) {
  const K = DOCK[k],
    b = $('#' + K.box);
  if (!b) return;
  b.innerHTML =
    K.L.map(
      (
        r,
        i,
      ) => `<div class="doc"><span class="dk">${docIcon(r)}</span><div class="dn"><b title="${esc(r.name)}">${esc(r.name)}</b><span class="muted">${r.size ? fmtBytes(r.size) + ' · ' : ''}${esc((r.createdAt || '').slice(0, 10))}${r.isNew ? ' · 저장 전' : ''}${r.pending ? ' · 다른 PC에서 아직 받지 못함' : ''}</span></div>
    <button type="button" class="b s" onclick="dkOpen('${k}',${i})" ${r.pending ? 'disabled' : ''}>열기</button><button type="button" class="b s d" onclick="dkRemove('${k}',${i})">빼기</button></div>`,
    ).join('') +
    `<label class="doc add"><input type="file" multiple accept="${RD_ACCEPT}" style="display:none" onchange="dkAdd('${k}',[...this.files]);this.value=''">${K.add}</label>`;
}
async function dkAdd(k, files) {
  const K = DOCK[k];
  for (const f of files) {
    if (f.size > 20 * 1048576) {
      toast(`${f.name}: 20MB를 넘는 파일은 첨부할 수 없습니다`);
      continue;
    }
    try {
      const data = await fileToURL(f);
      if (!isFileURL(data)) {
        toast(`${f.name}: 파일을 읽지 못했습니다`);
        continue;
      }
      K.L.push({ id: uid(), kind: 'doc', name: f.name, mime: f.type || '', size: f.size, data, thumb: '', createdAt: now(), isNew: true });
    } catch (e) {
      toast(`${f.name}: 파일을 읽지 못했습니다`);
    }
  }
  mfDirty = true;
  dkRender(k);
  const fm = $('#mf');
  if (!fm || !K.L.some((r) => r.isNew)) return;
  // 날짜가 비어 있으면 오늘로 (고칠 수 있음): 통보서 → 통보일(통보 완료), 대책서 → 회신일
  if (k === 'notice' && fm.notifyDate && !fm.notifyDate.value) {
    fm.notifyDate.value = today();
    ncrNotify('date');
    toast('통보일을 오늘로 넣었습니다 (통보 완료) — 실제 보낸 날짜로 고칠 수 있습니다');
  }
  if (k === 'reply' && fm.replyDate && !fm.replyDate.value) {
    fm.replyDate.value = today();
    toast('대책서 회신일을 오늘로 넣었습니다 — 실제 받은 날짜로 고칠 수 있습니다');
  }
}
function dkRemove(k, i) {
  const K = DOCK[k],
    r = K.L[i];
  if (!r) return;
  if (!r.isNew) K.D.push(r.id);
  K.L.splice(i, 1);
  mfDirty = true;
  dkRender(k);
}
function dkOpen(k, i) {
  return docOpenRec(DOCK[k].L[i]);
}
function dkCommit(k, n) {
  const K = DOCK[k],
    add = K.L.filter((r) => r.isNew).map(({ isNew, ...r }) => r);
  if (add.length)
    photoPut(add)
      .then(() => {
        photoStr = null;
        if (photoDir) syncPhotoFiles(false);
      })
      .catch((e) => toast('첨부 파일 저장 실패: ' + e.message));
  if (K.D.length) {
    photoDel(K.D).catch(() => {});
    K.D.forEach((i) => db.deleted.push({ id: i, at: now() }));
    photoStr = null;
  }
  n[K.field] = K.L.map((r) => r.id);
  if (!n[K.field].length) delete n[K.field];
  K.L.forEach((r) => (r.isNew = false));
  K.D = [];
}
const ncrDocIds = (n) => [...(n.concDocs || []), ...(n.noticeDocs || []), ...(n.replyDocs || [])];
const fmtBytes = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
const docIcon = (r) =>
  /pdf/i.test(r.mime || r.name)
    ? 'PDF'
    : /sheet|excel|\.xls/i.test((r.mime || '') + r.name)
      ? 'XLS'
      : /word|\.doc/i.test((r.mime || '') + r.name)
        ? 'DOC'
        : /presentation|powerpoint|\.ppt/i.test((r.mime || '') + r.name)
          ? 'PPT'
          : /image/i.test(r.mime || '')
            ? 'IMG'
            : /hwp/i.test(r.name)
              ? 'HWP'
              : 'FILE';
function concInit(ids) {
  curConc = [];
  curConcDel = [];
  renderConc();
  if ((ids || []).length)
    photoGetMany(ids)
      .then((rs) => {
        curConc = [...rs.map((r) => ({ ...r, isNew: false })), ...curConc.filter((x) => x.isNew)];
        renderConc();
      })
      .catch(() => {});
  const b = $('#concBox');
  if (!b) return;
  b.addEventListener('dragover', (e) => {
    e.preventDefault();
    b.classList.add('drag');
  });
  b.addEventListener('dragleave', () => b.classList.remove('drag'));
  b.addEventListener('drop', (e) => {
    e.preventDefault();
    b.classList.remove('drag');
    concAdd([...e.dataTransfer.files]);
  });
  concShow();
}
function concShow() {
  const f = $('#mf'),
    w = $('#concWrap');
  if (!f || !w) return;
  const v = f.concession.value;
  w.style.display = v === '없음' ? 'none' : '';
  renderConc();
}
function renderConc() {
  const b = $('#concBox');
  if (!b) return;
  const f = $('#mf'),
    appr = f && f.concession && f.concession.value === '특채 승인';
  b.innerHTML =
    curConc
      .map(
        (
          r,
          i,
        ) => `<div class="doc"><span class="dk">${docIcon(r)}</span><div class="dn"><b title="${esc(r.name)}">${esc(r.name)}</b><span class="muted">${r.size ? fmtBytes(r.size) + ' · ' : ''}${esc((r.createdAt || '').slice(0, 10))}${r.isNew ? ' · 저장 전' : ''}${r.pending ? ' · 다른 PC에서 아직 받지 못함' : ''}</span></div>
    <button type="button" class="b s" onclick="concOpen(${i})" ${r.pending ? 'disabled' : ''}>열기</button><button type="button" class="b s d" onclick="concRemove(${i})">빼기</button></div>`,
      )
      .join('') +
    `<label class="doc add"><input type="file" multiple style="display:none" onchange="concAdd([...this.files]);this.value=''">+ 문서 첨부</label>` +
    (appr && !curConc.length
      ? '<div class="docwarn">특채 승인으로 표시했지만 승인 문서가 없습니다. 특채 신청서나 고객 승인 문서를 첨부하세요.</div>'
      : '');
}
async function concAdd(files) {
  for (const f of files) {
    if (f.size > 15 * 1048576) {
      toast(`${f.name}: 15MB를 넘는 파일은 첨부할 수 없습니다`);
      continue;
    }
    try {
      const data = await fileToURL(f);
      if (!isFileURL(data)) {
        toast(`${f.name}: 파일을 읽지 못했습니다`);
        continue;
      }
      curConc.push({ id: uid(), kind: 'doc', name: f.name, mime: f.type || '', size: f.size, data, thumb: '', createdAt: now(), isNew: true });
    } catch (e) {
      toast(`${f.name}: 파일을 읽지 못했습니다`);
    }
  }
  mfDirty = true;
  renderConc();
}
function concRemove(i) {
  const r = curConc[i];
  if (!r) return;
  if (!r.isNew) curConcDel.push(r.id);
  curConc.splice(i, 1);
  mfDirty = true;
  renderConc();
}
function concOpen(i) {
  return docOpenRec(curConc[i]);
}
async function docOpenRec(r) {
  if (!r) return;
  let data = r.data;
  if (!data || !isFileURL(data)) {
    const g = await photoGet(r.id);
    data = g && g.data;
  }
  if (!data || !isFileURL(data)) {
    toast('문서를 불러오지 못했습니다');
    return;
  }
  let blob = await (await fetch(data)).blob();
  if (r.mime && (!blob.type || /octet-stream/.test(blob.type))) blob = new Blob([blob], { type: r.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  if (/pdf|image|text/i.test(blob.type)) {
    a.target = '_blank';
    a.rel = 'noopener';
  } else a.download = r.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function concCommit(n) {
  const add = curConc.filter((r) => r.isNew).map(({ isNew, ...r }) => r);
  if (add.length)
    photoPut(add)
      .then(() => {
        photoStr = null;
        if (photoDir) syncPhotoFiles(false);
      })
      .catch((e) => toast('문서 저장 실패: ' + e.message));
  if (curConcDel.length) {
    photoDel(curConcDel).catch(() => {});
    curConcDel.forEach((i) => db.deleted.push({ id: i, at: now() }));
    photoStr = null;
  }
  n.concDocs = curConc.map((r) => r.id);
  if (!n.concDocs.length) delete n.concDocs;
  curConc.forEach((r) => (r.isNew = false));
  curConcDel = [];
}
const NCR_TABS = [
  ['a', '① 발행 정보'],
  ['n', '② 통보서 내용'],
  ['t', '③ 협력사 통보'],
  ['r', '대책서 회신'],
  ['b', 'D3 봉쇄'],
  ['c', '유효성 검증 · 종결'],
  ['d', '진행 기록'],
];
const NCR_MODES = {
  issue: { l: '발행 · 통보', tabs: ['a', 'n', 't', 'd'], t: '발행 정보' },
  reply: { l: '협력사 회신', tabs: ['r', 'b', 'd'], t: '협력사 회신' },
  verify: { l: '검증 · 종결', tabs: ['c', 'd'], t: '검증 · 종결' },
};
let ncrModeCur = 'issue',
  ncrCurId = null,
  ncrCurNo = '';
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
    `<div class="dtabs" id="ncrTabs" role="tablist">${NCR_TABS.map(([k, l]) => `<button type="button" role="tab" data-t="${k}" onclick="ncrTab('${k}')">${l}${k === 'd' && lg ? ` <span class="mono" style="opacity:.7">${lg}</span>` : ''}${dotT[k] ? '<i class="tdot" title="기한 경과"></i>' : ''}</button>`).join('')}</div>`
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
function ncrTabDefault(n, id) {
  if (!id) return 'a';
  const st = ncrStatus(n);
  if (['대책요청', '대책서 검토', '보완요청'].includes(st)) return 'b';
  if (n.reqType === '단순 통보' && !n.verifyDate) return 'a';
  if (['승인(검증대기)', '검증 무효', '종결'].includes(st)) return 'c';
  return 'a';
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
  b.innerHTML = `<div class="row" style="margin-bottom:6px">${curEvals.map((x, i) => `<button type="button" class="b s ${i === curEvIdx ? 'p' : ''}" onclick="curEvIdx=${i};renderEval()">${i + 1}차${x.type === '간이 대책서' ? '(간이)' : ''}${evalDone(x) ? ` · ${evalScore(x)}점 ${evalVerdict(x)}` : ' · 작성중'}</button>`).join('')}
    <button type="button" class="b s" onclick="addEval()" title="협력사가 보완해서 다시 제출한 대책서 평가">+ 재제출 평가</button><span style="flex:1"></span>
    <label class="fgl" style="flex-direction:row;align-items:center;gap:4px">평가일<input type="date" value="${esc(e.date)}" onchange="curEvals[${curEvIdx}].date=this.value;mfDirty=true"></label>
    <label class="fgl" style="flex-direction:row;align-items:center;gap:4px">평가자<input value="${esc(e.by)}" list="dlOwners" style="width:90px" oninput="curEvals[${curEvIdx}].by=this.value;mfDirty=true"></label>
    ${curEvals.length > 1 || !done ? `<button type="button" class="b s d" onclick="delEval()">이 회차 삭제</button>` : ''}</div>
  <table class="ct evt"><thead><tr><th>항목</th><th class="n">배점</th><th>점검 기준</th><th>평가</th><th class="n">점수</th><th>의견 (보완 요청 사항)</th></tr></thead><tbody>
  ${evItems(e)
    .map((it) => {
      const v = e.sc?.[it.k];
      return `<tr><td style="white-space:nowrap"><b>${it.t}</b>${it.must ? '<br><span class="bg bad" title="미흡이면 총점과 관계없이 반려">필수</span>' : ''}</td><td class="n">${it.w}</td>
    <td style="font-size:11.5px;color:#3d4659;line-height:1.5">${it.c.map((x) => '· ' + esc(x)).join('<br>')}</td>
    <td style="white-space:nowrap">${EV_LV.map(([val, sym, lb]) => `<button type="button" class="b s evb ${v === val ? 'on' + String(val).replace('.', '') : ''}" onclick="setEv('${it.k}',${val})" title="${lb}">${sym} ${lb}</button>`).join(' ')}</td>
    <td class="n"><b>${v == null ? '-' : Math.round(v * it.w)}</b></td>
    <td><input value="${esc(e.cm?.[it.k])}" style="width:100%;min-width:150px" placeholder="${v === 1 || v == null ? '' : '보완 요청 내용'}" oninput="(curEvals[${curEvIdx}].cm=curEvals[${curEvIdx}].cm||{})['${it.k}']=this.value;mfDirty=true"></td></tr>`;
    })
    .join('')}
  </tbody><tfoot><tr><td colspan="4" style="text-align:right"><b>총점</b> <span class="muted" style="font-size:12px">(승인 ≥ ${S.evalPass} · 보완요청 ≥ ${S.evalCond} · 그 미만 또는 필수항목 미흡은 반려)</span></td><td class="n" style="font-size:16px"><b>${t}</b></td><td>${done ? `<span class="bg ${VD_CLS[vd]}" style="font-size:13px;padding:3px 12px">${vd}</span> <span class="muted" style="font-size:12px">→ 저장 시 대책 타당성 ‘${vd === '승인' ? '적정' : '보완요청'}’ 반영</span>` : `<span class="muted">${evItems(e).filter((it) => e.sc?.[it.k] == null).length}개 항목 미평가</span>`}</td></tr>
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
function farState(n) {
  if (!farOn(n)) return '';
  const f = n.far;
  if (f.replyDate) return f.review === '재분석 요청' ? '재분석 요청' : '회신';
  return f.due && today() > f.due ? '지연' : '요청';
}
const FAR_CLS = { 요청: 'inf', 지연: 'bad', 회신: 'ok', '재분석 요청': 'warn' };
const farBadge = (n) => {
  const st = farState(n);
  return st ? `<span class="bg ${FAR_CLS[st]}" title="불량 분석 요청 (FAR)">FAR ${st}</span>` : '';
};
// NCR 창 위쪽의 FAR 요약 (읽기 전용) — 입력 · 요청서 출력은 FAR 화면에서 함
function farLine(n) {
  const f = n && n.far;
  if (!f || !f.reqDate) return '';
  const bits = [
    `요청 ${esc(f.reqDate)}`,
    f.replyDate ? `회신 ${esc(f.replyDate)}` : f.due ? `회신 기한 ${esc(f.due)}` : '',
    f.verdict ? `협력사 분석 판정: ${esc(f.verdict)}` : '',
    f.review ? `당사 검토: ${esc(f.review)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return `<div class="banner" id="farLine" style="background:var(--pri2);border-color:transparent;color:var(--ink)">${farBadge(n) || '<b>FAR</b>'} ${bits}${f.src && db.defects.find((d) => d.id === f.src) ? ` <a class="lk" onclick="farGoInv('${f.src}')">FAR 열기</a>` : ' <span class="muted">(연결 불량이 없는 NCR — 읽기만 됩니다)</span>'}${f.summary ? `<div style="margin-top:3px;font-size:12.5px;white-space:pre-wrap">${esc(f.summary)}</div>` : ''}</div>`;
}
// FAR 은 FAR 화면(연결 불량의 귀책 조사)이 원본 — NCR 창에서는 입력하지 않음.
// n.far 는 연결 불량의 FAR 를 그대로 비춘 값(목록 배지 · 통보서 문구 · 지연 알림용)이고, src 에 원본 불량 id 를 둠.
const FAR_SHARED = [
  ['reqDate', 'farReq'],
  ['due', 'farDue'],
  ['replyDate', 'farRecv'],
  ['sampleQty', 'sample'],
  ['summary', 'farResult'],
  ['purpose', 'farPurpose'],
  ['items', 'farItems'],
  ['shipDate', 'farShipDate'],
  ['shipRef', 'farShipRef'],
  ['verdict', 'farVerdict'],
  ['review', 'farReview'],
  ['note', 'farNote'],
];
const farEmpty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
const farSame = (a, b) => JSON.stringify(farEmpty(a) ? '' : a) === JSON.stringify(farEmpty(b) ? '' : b);
function farFromInv(d) {
  const iv = d.inv || {},
    f = { src: d.id };
  FAR_SHARED.forEach(([nk, ik]) => {
    const v = iv[ik];
    f[nk] = nk === 'items' ? (Array.isArray(v) ? [...v] : []) : String(v ?? '');
  });
  return f;
}
function invFarSrc(ids) {
  return (
    (ids || [])
      .map((i) => db.defects.find((d) => d.id === i))
      .filter((d) => d && d.inv && d.inv.farReq)
      .sort((a, b) => (b.inv.farReq || '').localeCompare(a.inv.farReq || ''))[0] || null
  );
}
// NCR 의 far 를 연결 불량의 FAR 에 맞춤. 돌려줌: {far, src, chFar, chInv} — 할 일이 없으면 null
//  · 예전에 NCR 창에서 입력한 값(요청 목적 · 분석 항목 · 발송 · 판정 · 검토 등)은 FAR 화면이 비어 있을 때만 FAR 화면으로 옮김
//  · 연결 불량에 FAR 가 없고 NCR 에만 있으면(옛 기록) 첫 연결 불량의 FAR 로 옮김. 연결 불량이 없는 NCR 은 그대로 둠
function farAlign(far, ids, write = true) {
  const ds = (ids || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean),
    has = !!(far && far.reqDate);
  let src = invFarSrc(ids),
    chInv = false;
  if (!src) {
    if (!has) return null;
    if (far.src) return { far: null, src: null, chFar: true, chInv: false }; // FAR 화면에서 지웠거나 그 불량의 연결을 해제함
    if (!ds.length || !write) return null; // 연결 불량이 없는 옛 NCR — 그대로 둠
    src = ds[0];
    src.inv = src.inv || {};
  }
  const iv = src.inv;
  // 예전에 FAR 화면 값에서 자동으로 만들었던 항목은 옮기지 않음
  const der =
    has && /^불량 귀책 조사에서 이어받음/.test(far.note || '')
      ? {
          note: far.note,
          purpose: '귀책 판정',
          review: iv.verdict ? '수용' : '',
          verdict: { 협력사: '협력사 귀책 인정', 공동: '추가 분석 필요', 사내: '귀책 불인정', '원인 불명': '원인 불명·재현 안 됨' }[iv.verdict] || '',
        }
      : {};
  if (has && write)
    FAR_SHARED.forEach(([nk, ik]) => {
      const b = far[nk];
      if (farEmpty(iv[ik]) && !farEmpty(b) && !(nk in der && der[nk] === b)) {
        iv[ik] = Array.isArray(b) ? [...b] : b;
        chInv = true;
      }
    });
  const f = farFromInv(src);
  return { far: f, src, chFar: !has || far.src !== f.src || FAR_SHARED.some(([nk]) => !farSame(far[nk], f[nk])), chInv };
}
// 저장된 모든 NCR 을 FAR 화면에 맞춤 (화면을 그릴 때 · 저장할 때 호출 — 바뀐 것만 고침)
function farSyncAll() {
  if (typeof RO !== 'undefined' && RO) return 0;
  let n = 0;
  (db.ncrs || []).forEach((x) => {
    const r = farAlign(x.far, x.defectIds);
    if (!r) return;
    if (r.chFar) {
      x.far = r.far;
      touch(x);
      n++;
    }
    if (r.chInv && r.src) {
      touch(r.src);
      n++;
    }
  });
  return n;
}
// NCR 창에서 FAR 화면으로 — 쓰던 내용이 있으면 물어봄
async function farGoInv(did) {
  if (
    mfDirty &&
    !(await askConfirm({
      title: '저장하지 않은 내용이 있습니다',
      msg: 'NCR 창을 닫고 FAR 화면을 엽니다. 쓰던 내용은 사라집니다.',
      ok: 'FAR 열기',
      danger: false,
    }))
  )
    return;
  closeModal(true);
  state.tab = 'inv';
  render();
  editInv(did);
}

function typeDays(t, S) {
  S = S || db.settings;
  return t === '간이 대책서' ? num(S.replySimple) || 5 : num(S.reply8D) || num(S.replyDays) || 7;
}
let curStock = [],
  curExcl = new Set(),
  curContain = [],
  curVLots = [];
function renderContain() {
  const b = $('#containBox');
  if (!b) return;
  b.innerHTML = `<table class="ct" style="margin-top:4px"><thead><tr><th>재고 위치</th><th>대상 (EA)</th><th>선별 (EA)</th><th>불량 (EA)</th><th>완료일</th><th></th></tr></thead><tbody>${curContain
    .map(
      (r, i) => `<tr>
    <td><input value="${esc(r.loc)}" style="width:140px" placeholder="예: 협력사 창고" oninput="curContain[${i}].loc=this.value;mfDirty=true"></td>
    ${['target', 'sorted', 'ng'].map((k) => `<td><input value="${esc(r[k])}" style="width:100px" inputmode="numeric" oninput="curContain[${i}].${k}=this.value;mfDirty=true;containFoot()"></td>`).join('')}
    <td><input type="date" value="${esc(r.done)}" oninput="curContain[${i}].done=this.value;mfDirty=true"></td>
    <td><button type="button" class="b s d" onclick="curContain.splice(${i},1);mfDirty=true;renderContain()">✕</button></td></tr>`,
    )
    .join('')}</tbody>
    <tfoot id="containFoot"></tfoot></table>`;
  containFoot();
}
function containFoot() {
  const e = $('#containFoot');
  if (!e) return;
  const tot = (k) => curContain.reduce((a, r) => a + numC(r[k]), 0),
    T = tot('target'),
    So = tot('sorted');
  e.innerHTML = `<tr><td><b>합계</b></td><td style="padding-left:12px">${T.toLocaleString()}</td><td style="padding-left:12px">${So.toLocaleString()}</td><td style="padding-left:12px">${tot('ng').toLocaleString()}</td><td colspan="2" class="muted" style="font-size:12px">${T && So < T ? `미선별 ${(T - So).toLocaleString()} EA` : ''}</td></tr>`;
}
function vlotVerdict(r) {
  const i = numC(r.insp),
    g = numC(r.ng);
  if (!i && !String(r.ng || '').trim()) return '';
  return g > 0 ? '불합격' : i > 0 ? '합격' : '';
}
function renderVLots() {
  const b = $('#vlotBox');
  if (!b) return;
  b.innerHTML = `<table class="ct" style="margin-top:4px"><thead><tr><th>LOT No.</th><th>입고일</th><th>검사 (EA)</th><th>불량 (EA)</th><th>판정</th><th></th></tr></thead><tbody>${curVLots
    .map(
      (r, i) => `<tr>
    <td><input value="${esc(r.lot)}" style="width:150px" oninput="curVLots[${i}].lot=this.value;mfDirty=true"></td>
    <td><input type="date" value="${esc(r.date)}" oninput="curVLots[${i}].date=this.value;mfDirty=true"></td>
    <td><input value="${esc(r.insp)}" style="width:90px" inputmode="numeric" oninput="curVLots[${i}].insp=this.value;mfDirty=true;vlotRefresh()"></td>
    <td><input value="${esc(r.ng)}" style="width:90px" inputmode="numeric" oninput="curVLots[${i}].ng=this.value;mfDirty=true;vlotRefresh()"></td>
    <td data-vv="${i}"></td>
    <td><button type="button" class="b s d" onclick="curVLots.splice(${i},1);mfDirty=true;renderVLots()">✕</button></td></tr>`,
    )
    .join('')}</tbody></table>
    <div class="muted" id="vlotNote" style="font-size:12px;margin-top:4px"></div>`;
  vlotRefresh();
}
function vlotRefresh() {
  const vs = curVLots.map(vlotVerdict),
    ok = vs.filter((v) => v === '합격').length,
    ng = vs.filter((v) => v === '불합격').length;
  document.querySelectorAll('#vlotBox [data-vv]').forEach((td) => {
    const v = vs[td.dataset.vv];
    td.innerHTML = v ? `<span class="bg ${v === '합격' ? 'ok' : 'bad'}">${v}</span>` : '<span class="muted">-</span>';
  });
  const e = $('#vlotNote');
  if (e)
    e.innerHTML = `합격 ${ok} LOT${ng ? ` · <span style="color:var(--bad)">불합격 ${ng} LOT — 검증 결과 ‘무효(재발)’ 검토</span>` : ''}${ok >= 3 && !ng ? ' · 3 LOT 무불량 충족 — 검증일·결과 ‘유효’를 입력하면 종결됩니다' : ''}`;
}
function renderStock() {
  const b = $('#stockBox');
  if (!b) return;
  b.innerHTML = `<table class="ct" style="margin-top:4px"><thead><tr><th>구분</th><th>Quantity Stocked (재고보유수량)</th><th>Check Quality (확인된 불량수량)</th><th></th></tr></thead><tbody>${curStock
    .map(
      (r, i) => `<tr>
    <td><input value="${esc(r.loc)}" style="width:150px" placeholder="예: Customer, W/H" oninput="curStock[${i}].loc=this.value;mfDirty=true"></td>
    <td><input value="${esc(r.stocked)}" style="width:170px" placeholder="예: 76,000EA 또는 -" oninput="curStock[${i}].stocked=this.value;mfDirty=true"></td>
    <td><input value="${esc(r.ng)}" style="width:170px" placeholder="예: 24,000EA 또는 -" oninput="curStock[${i}].ng=this.value;mfDirty=true"></td>
    <td><button type="button" class="b s d" onclick="curStock.splice(${i},1);mfDirty=true;renderStock()">✕</button></td></tr>`,
    )
    .join('')}</tbody></table>`;
}
// 불량 내용 서술의 작성 양식 (발행 근거 ‘불량’) — 연결 불량의 내용으로 채움. 새 NCR 에는 기본으로 들어감
function descTplDefect(d, lot) {
  const fg =
    d && (d.fgNo || d.fgName)
      ? ` (완성품 ${[d.fgNo, d.fgName].filter(Boolean).join(' ')} 에서 발견${d.fgQty ? ` · ${num(d.fgQty).toLocaleString()}대` : ''})`
      : '';
  return [
    `1. 발견 일시/장소 (When/Where) : ${d ? (d.date || '') + ' / ' + (d.source || '') + fg : ''}`,
    `2. 불량 현상 (What) : ${d ? [d.type, d.desc].filter(Boolean).join(' — ') : ''}`,
    `3. 발생 수량/범위 (How many) : ${d ? num(d.qty).toLocaleString() + ' EA' + (d.inspQty ? ' / ' + num(d.inspQty).toLocaleString() + ' EA 중' : '') : ''}${lot ? ' (LOT ' + lot + ')' : ''}`,
    `4. 영향 (Impact) : `,
    `5. 당사 조치 (Containment) : ${d?.containment || ''}`,
  ].join('\n');
}
// 발행 근거를 바꿀 때 — 손대지 않은 빈 불량 양식은 지우고(감사 · PPM 은 양식이 다름), 새 NCR 에서 ‘불량’으로 돌아오면 다시 넣음
function descBasisSwap() {
  const f = $('#mf'),
    ta = f && f.defectDesc;
  if (!ta) return;
  const blank = descTplDefect(null, '').trim(),
    b = f.basis.value;
  if (b !== '불량' && ta.value.trim() === blank) ta.value = '';
  else if (b === '불량' && !ncrCurId && !ta.value.trim())
    ta.value = descTplDefect(db.defects.find((x) => x.id === curLinks[0]) || null, f.lotNo.value);
}
async function descTemplate() {
  const f = $('#mf'),
    ta = f.defectDesc,
    d = db.defects.find((x) => x.id === curLinks[0]);
  const t = basisTpl(f) || descTplDefect(d || null, f.lotNo.value);
  if (
    ta.value.trim() &&
    !(await askConfirm({
      title: '작성 양식을 추가할까요?',
      msg: '이미 작성한 내용 <b>아래에</b> 양식이 추가됩니다.',
      ok: '아래에 추가',
      danger: false,
    }))
  )
    return;
  ta.value = (ta.value.trim() ? ta.value.trim() + '\n\n' : '') + t;
  mfDirty = true;
  ta.focus();
}
function defaultReq(type, due, far, site, esc) {
  let b = defaultReq0(type, due);
  const k = () => (b.match(/^\d+\./gm) || []).length + 1;
  if (esc && type !== '단순 통보')
    b += `\n${k()}. Outflow cause — why not detected at your outgoing inspection, and detection countermeasure${esc >= 2 ? ' (100% inspection or error-proofing before shipment)' : ''} (유출 원인 · 출하검사 대책${esc >= 2 ? ' — 출하 전 전수 또는 자동 검출' : ''})`;
  if (far && far.reqDate && !far.replyDate) {
    const fd = far.due ? `${+far.due.slice(5, 7)}/${+far.due.slice(8, 10)}` : '';
    b += `\n${k()}. Failure analysis report (FAR) for returned samples${far.sampleQty ? ' (' + far.sampleQty + ')' : ''} : ~ ${fd} 限`;
  }
  if (site) b += `\n${k()}. On-site audit at your plant will be conducted (현장 감사 예정)`;
  return b;
}
function defaultReq0(type, due) {
  const md = due ? `${+due.slice(5, 7)}/${+due.slice(8, 10)}` : '';
  if (type === '단순 통보')
    return '1. For your information — please strengthen quality control (No reply required)\n2. 다음 입고 LOT에서 재발 여부 확인 예정';
  return type === '간이 대책서'
    ? `1. Need corrective action report (cause / countermeasure / effective date) : ~ ${md} 限`
    : `1. Need 8D report : ~ ${md} 限\n2. Containment action (D3) reply within 24 hours`;
}
function ncrVerifyDueAuto(n) {
  if (n.reqType === '단순 통보') return '';
  const S = db.settings,
    b = n.validity === '적정' && n.approvedDate ? n.approvedDate : n.issueDate;
  return b ? addDays(b, S.verifyDays) : '';
}
function ncrDue(n) {
  return n.reqType === '단순 통보' ? '' : n.dueDate || addDays(n.requestDate || n.issueDate || today(), typeDays(n.reqType));
}
// 지금 열린 NCR 창의 FAR (연결 불량 기준)
function ncrFarCur() {
  const pf = ((ncrCurId && db.ncrs.find((x) => x.id === ncrCurId)) || {}).far || null,
    r = farAlign(pf, curLinks, false);
  return r ? r.far : pf;
}
function fillReq() {
  const f = $('#mf');
  const due = f.dueDate.value || addDays(f.requestDate.value || f.issueDate.value || today(), typeDays(f.reqType.value));
  f.requirements.value = defaultReq(
    f.reqType.value,
    due,
    ncrFarCur(),
    !!(f.siteAudit && f.siteAudit.value === '요청'),
    escLevel((curLinks || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean)),
  );
  mfDirty = true;
}
async function renderNcrPhotos() {
  const b = $('#ncrPhotoBox');
  if (!b) return;
  const ids = curLinks.flatMap((i) => db.defects.find((d) => d.id === i)?.photos || []);
  if (!ids.length) {
    b.innerHTML = '<span class="muted" style="font-size:12px">연결된 불량에 사진이 없습니다. 불량 기록에 사진을 첨부하면 여기에 나타납니다.</span>';
    return;
  }
  let rs = [];
  try {
    rs = await photoGetMany(ids);
  } catch (e) {}
  if (!$('#ncrPhotoBox')) return;
  b.innerHTML = rs
    .map(
      (p) =>
        `<label style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;cursor:pointer"><img src="${p.thumb || p.data}" style="width:110px;height:80px;object-fit:cover;border-radius:4px;border:2px solid ${curExcl.has(p.id) ? '#ddd' : '#007A78'};opacity:${curExcl.has(p.id) ? 0.4 : 1}"><span><input type="checkbox" ${curExcl.has(p.id) ? '' : 'checked'} onchange="this.checked?curExcl.delete('${p.id}'):curExcl.add('${p.id}');mfDirty=true;renderNcrPhotos()"> ${esc((p.caption || '').slice(0, 12))}</span></label>`,
    )
    .join('');
}
function ncrNotify(src) {
  const f = $('#mf');
  mfDirty = true;
  if (src === 'yn') {
    if (f.notifyYN.value === '통보 완료' && !f.notifyDate.value) f.notifyDate.value = today();
    if (f.notifyYN.value === '미통보') f.notifyDate.value = '';
  } else f.notifyYN.value = f.notifyDate.value ? '통보 완료' : '미통보';
  const d = f.notifyDate.value,
    prev = f.notifyDate.dataset.prev || '';
  if (d && f.reqType.value !== '단순 통보' && !(f.replyDate && f.replyDate.value)) {
    const r = f.requestDate.value;
    if (!r || r === prev || r === f.issueDate.value || r < d) {
      f.requestDate.value = d;
      ncrAutoDates('req');
    }
  }
  f.notifyDate.dataset.prev = d;
}
function ncrAutoDates(which) {
  const f = $('#mf'),
    S = db.settings;
  if (which === 'req' && f.requestDate.value) f.dueDate.value = addDays(f.requestDate.value, typeDays(f.reqType.value));
  if (which === 'issue' && f.issueDate.value) {
    const prev = f.issueDate.dataset.prev || '';
    if (f.reqType.value !== '단순 통보' && !f.notifyDate.value && (!f.requestDate.value || f.requestDate.value === prev)) {
      f.requestDate.value = f.issueDate.value;
      f.dueDate.value = addDays(f.issueDate.value, typeDays(f.reqType.value));
    }
    f.issueDate.dataset.prev = f.issueDate.value;
  }
  if (f.d3Due && f.reqType.value !== '단순 통보' && f.requestDate.value && (which === 'req' || which === 'issue'))
    f.d3Due.value = d3DefaultDue(f.requestDate.value);
}
async function unlinkDefect(id) {
  const d = db.defects.find((x) => x.id === id);
  if (
    !(await askConfirm({
      title: '불량 연결을 해제할까요?',
      items: [`${esc(d?.date)} · ${esc(d?.partNo)} ${esc(d?.partName)} · ${num(d?.qty)}개`],
      note: '불량 기록 자체는 삭제되지 않습니다. NCR 창에서 저장해야 반영됩니다.',
      ok: '연결 해제',
      danger: false,
    }))
  )
    return;
  curLinks = curLinks.filter((x) => x !== id);
  mfDirty = true;
  refreshLinks();
}
function repHint() {
  const f = $('#mf'),
    el = $('#repHint');
  if (!f || !el || !f.repeatOf) return;
  const v = f.repeatOf.value.trim(),
    me = ncrCurId;
  if (v) {
    const p = db.ncrs.find((x) => x.no === v && x.id !== me);
    el.innerHTML = p
      ? `이전 NCR ${esc(p.issueDate)} 발행 · ${esc(ncrStatus(p))}${p.verifyResult ? ' · 검증 ' + esc(p.verifyResult) : ''}`
      : '<span style="color:var(--warn)">등록되지 않은 번호입니다 (그대로 저장은 됩니다)</span>';
    return;
  }
  const sid = f.supplierId.value,
    pn = f.partNo.value.trim();
  const c = pn
    ? db.ncrs
        .filter((x) => x.id !== me && x.no && x.partNo === pn && (!sid || x.supplierId === sid))
        .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''))[0]
    : null;
  el.innerHTML = c
    ? `같은 품번의 이전 NCR <b>${esc(c.no)}</b> (${esc(c.issueDate)} · ${esc(ncrStatus(c))}) <button type="button" class="b s" onclick="const f=$('#mf');f.repeatOf.value=${jsq(c.no)};mfDirty=true;repHint()">재발로 연결</button>`
    : '';
}
function renderNcrCost() {
  const box = $('#ncrCostBox');
  if (!box) return;
  const ds = curLinks.map((i) => db.defects.find((d) => d.id === i)).filter(Boolean);
  if (!ds.length) {
    box.innerHTML = '<div class="muted" style="font-size:12.5px">연결된 불량이 없습니다.</div>';
    return;
  }
  const cat = {};
  let tot = 0,
    req = 0,
    recv = 0;
  ds.forEach((d) => {
    (d.costs || []).forEach((c) => {
      cat[c.cat || '기타'] = (cat[c.cat || '기타'] || 0) + num(c.amt);
      tot += num(c.amt);
    });
    if (d.claim) {
      req += num(d.claim.agreeAmt || d.claim.reqAmt);
      recv += num(d.claim.recvAmt);
    }
  });
  const rows = COST_CATS.filter((k) => cat[k])
    .map((k) => `<tr><td>${esc(k)}</td><td class="n">${won(cat[k])} 원</td></tr>`)
    .join('');
  box.innerHTML =
    tot || req
      ? `<div class="tw" style="max-width:420px"><table><tbody>${rows}<tr><th>합계</th><th class="n">${won(tot)} 원</th></tr>${req ? `<tr><td>구상 청구(합의)</td><td class="n">${won(req)} 원</td></tr><tr><td>회수</td><td class="n">${won(recv)} 원${req > recv ? ` <span class="bg warn">미회수 ${won(req - recv)}</span>` : ''}</td></tr>` : ''}</tbody></table></div>`
      : `<div class="muted" style="font-size:12.5px">연결된 불량 ${ds.length}건에 입력된 비용이 없습니다.</div>`;
}
function refreshLinks() {
  const box = $('#linkBox');
  if (!box) return;
  setTimeout(() => {
    renderNcrCost();
    repHint();
  }, 0);
  setTimeout(renderNcrPhotos, 0);
  setTimeout(() => {
    if (tl.kind === 'ncr') {
      tl.obj.defectIds = curLinks;
      renderLogs();
    }
  }, 0);
  {
    const sp = supById($('#mf').supplierId.value);
    $('#dlAttn').innerHTML = sp
      ? ensureContacts(sp)
          .contacts.filter((c) => c.active !== false)
          .map((c) => `<option value="${esc(c.name)}">${esc(c.role)}</option>`)
          .join('')
      : '';
  }
  const sid = $('#mf').supplierId.value;
  const linked = curLinks.map((i) => db.defects.find((d) => d.id === i)).filter(Boolean);
  const cand = db.defects
    .filter((d) => !curLinks.includes(d.id) && !d.ncrId && (!sid || d.supplierId === sid))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 100);
  box.innerHTML =
    (linked.length
      ? `<table><tbody>${linked.map((d) => `<tr><td>${esc(d.date)}</td><td>${esc(d.partNo)} ${esc(d.partName)}</td><td>${esc(d.type)}</td><td class="n">${num(d.qty)}개</td><td>${photoBadge(d)}</td><td><button type="button" class="b s d" onclick="unlinkDefect('${d.id}')">해제</button></td></tr>`).join('')}</tbody></table>`
      : '<div class="muted">연결된 불량 없음</div>') +
    `<div class="row" style="margin-top:8px"><select id="linkSel" style="max-width:520px"><option value="">— 불량 추가 연결 (같은 협력사, NCR 미연결) —</option>${cand.map((d) => `<option value="${d.id}">${esc(d.date)} · ${esc(d.partNo)} ${esc(d.partName)} · ${esc(d.type)} · ${num(d.qty)}개</option>`).join('')}</select><button type="button" class="b s" onclick="const v=$('#linkSel').value;if(v){curLinks.push(v);refreshLinks()}">추가</button></div>`;
}
function saveNcr(id) {
  const o = gather(),
    S = db.settings;
  if (tl.kind === 'ncr' && ((document.getElementById('lgText') || {}).value || '').trim()) {
    if (!tlPushDraft()) {
      ncrTab('d');
      return null;
    }
    renderLogs(false);
  } // 진행 기록에 쓰던 내용도 함께 저장
  {
    const pf = ((id && db.ncrs.find((x) => x.id === id)) || {}).far || null,
      r = farAlign(pf, curLinks);
    o.far = r ? r.far : pf;
    if (r && r.chInv && r.src) touch(r.src);
  } // FAR 은 FAR 화면이 원본 — NCR 은 비춘 값만 가짐
  if (!o.issueDate) {
    ncrTab('a');
    toast('발행일을 입력하세요');
    return null;
  }
  if (o.notifyYN === '통보 완료' && !o.notifyDate) o.notifyDate = today();
  delete o.notifyYN;
  if (o.notifyDate && o.notifyDate < o.issueDate) {
    ncrTab('t');
    toast('통보일이 발행일보다 빠릅니다');
    return null;
  }
  if (o.no && db.ncrs.some((x) => x.id !== id && x.no === o.no.trim())) {
    ncrTab('a');
    toast(`NCR 번호 ${o.no} 은(는) 이미 사용 중입니다`);
    return null;
  }
  if (o.reqType !== '단순 통보' && !o.requestDate) o.requestDate = o.issueDate;
  if (o.reqType === '단순 통보') {
    o.dueDate = '';
  } else if (o.requestDate && !o.dueDate) o.dueDate = addDays(o.requestDate, typeDays(o.reqType));
  if (o.reqType === '단순 통보') {
    o.d3Due = '';
    o.d3Date = '';
  }
  if (o.basis !== '공정 감사') ['auditDate', 'auditType', 'auditRef', 'finding'].forEach((k) => (o[k] = ''));
  if (o.basis !== 'PPM 초과') ['ppmFrom', 'ppmTo', 'ppmVal', 'ppmTarget', 'ppmDetail'].forEach((k) => (o[k] = ''));
  if (o.basis === '불량') delete o.basis;
  const prevN = id ? db.ncrs.find((x) => x.id === id) : null;
  if (
    o.validity === '적정' &&
    !(prevN && prevN.validity === '적정') &&
    o.reqType !== '단순 통보' &&
    !o.replyDate &&
    !curEvals.some((e) => evalDone(e) && evalVerdict(e) === '승인')
  ) {
    ncrTab('r');
    toast('대책서 회신일을 먼저 입력하세요 — 회신 없이 ‘적정’으로 승인할 수 없습니다');
    return null;
  }
  if (o.verifyResult === '유효' && !(prevN && prevN.verifyResult === '유효')) {
    const le0 = curEvals.filter((e) => evalDone(e)).slice(-1)[0],
      valid = le0 ? evalVerdict(le0) === '승인' : o.validity === '적정';
    if (o.reqType !== '단순 통보' && !valid) {
      ncrTab('c');
      toast('대책서가 승인(적정)되지 않아 ‘유효’로 종결할 수 없습니다 — 먼저 대책서를 평가·승인하세요');
      return null;
    }
    const vs = curVLots.map(vlotVerdict),
      okN = vs.filter((v) => v === '합격').length,
      ngN = vs.filter((v) => v === '불합격').length,
      need = o.reqType === '단순 통보' ? 0 : num(S.verifyLots);
    if (ngN) {
      ncrTab('c');
      toast(`검증 LOT에 불합격 ${ngN}건이 있어 ‘유효’로 할 수 없습니다 — ‘무효(재발)’을 검토하세요`);
      return null;
    }
    if (need && okN < need) {
      ncrTab('c');
      toast(`검증 LOT 합격이 ${okN}개입니다 — ${need}개 이상이어야 ‘유효’로 종결합니다 (설정에서 변경)`);
      return null;
    }
    if (!o.verifyDate) o.verifyDate = today();
  }
  if (o.repeatOf && o.no && o.repeatOf === o.no.trim()) {
    ncrTab('a');
    toast('재발 이전 NCR 번호에 자기 번호를 넣을 수 없습니다');
    return null;
  }
  if (o.concession === '특채 승인' && !curConc.length)
    setTimeout(() => toast('특채 승인 문서가 첨부되지 않았습니다 — ④ 검증·종결 탭에서 첨부할 수 있습니다'), 900);
  if (isSysBasis(o) && !o.supplierId) {
    ncrTab('a');
    toast('감사·PPM 근거 NCR은 협력사를 선택하세요');
    return null;
  }
  let n;
  if (id) {
    n = db.ncrs.find((x) => x.id === id);
    Object.assign(n, o);
  } else {
    n = { id: uid(), ...o };
    db.ncrs.push(n);
  }
  if (!n.no) n.no = genNcrNo(n.issueDate);
  const old = n.defectIds || [];
  old
    .filter((i) => !curLinks.includes(i))
    .forEach((i) => {
      const d = db.defects.find((x) => x.id === i);
      if (d && d.ncrId === n.id) {
        d.ncrId = '';
        touch(d);
      }
    });
  curLinks.forEach((i) => {
    const d = db.defects.find((x) => x.id === i);
    if (d && d.ncrId !== n.id) {
      d.ncrId = n.id;
      touch(d);
    }
  });
  if (tl.kind === 'ncr') {
    const r = tlCommit();
    n.logs = r.logs;
  }
  n.defectIds = [...curLinks];
  n.stock = curStock.filter((r) => r.loc || r.stocked || r.ng);
  concCommit(n);
  dkCommit('notice', n);
  dkCommit('reply', n);
  n.contain = curContain.filter((r) => r.target || r.sorted || r.ng || r.done);
  n.vlots = curVLots.filter((r) => r.lot || r.date || r.insp || r.ng);
  n.photoExcl = [...curExcl];
  n.evals = curEvals.map((e) => ({ ...e, score: evalScore(e), verdict: evalVerdict(e) }));
  const le = latestEval(n);
  if (le) {
    const pv = o.validity,
      nv = le.verdict === '승인' ? '적정' : '보완요청';
    if (pv && pv !== nv) setTimeout(() => toast(`대책서 평가 결과(${le.verdict})에 따라 타당성을 ‘${nv}’(으)로 맞췄습니다`), 400);
    n.validity = nv;
    n.evalScore = le.score;
    n.evalVerdict = le.verdict;
  } else {
    delete n.evalScore;
    delete n.evalVerdict;
  }
  if (n.resubPending && (n.validity === '적정' || (le && (le.id || '') !== (n.resubPending.evalId || '')))) delete n.resubPending; // 재제출분 평가를 마침
  if (n.validity === '적정') {
    if (!n.approvedDate) n.approvedDate = (le && le.verdict === '승인' && le.date) || n.replyDate || today();
  } else delete n.approvedDate;
  {
    const auto = ncrVerifyDueAuto(n),
      prevAuto = n._vdAuto || addDays(n.issueDate, S.verifyDays);
    if (n.reqType === '단순 통보' && !n.verifyDate) n.verifyDue = '';
    else if (!n.verifyDue || n.verifyDue === prevAuto) n.verifyDue = auto;
    n._vdAuto = auto;
  }
  czSyncNcr(n);
  touch(n);
  save();
  closeModal(true);
  if (state.tab !== 'ncr' && state.tab !== 'case' && !id) {
    state.tab = 'ncr';
  }
  render();
  toast(`${n.no} 저장됨 (상태: ${ncrStatus(n)})`);
  return n.id;
}
async function delNcr(id) {
  const n = db.ncrs.find((x) => x.id === id);
  if (!n) return;
  const filled = D8.filter(([k]) => String(n[k] || '').trim()).length;
  if (
    !(await askConfirm({
      title: `${n.no}을(를) 삭제할까요?`,
      items: [
        `${esc(supName(n.supplierId))} · ${esc(n.partNo)} ${esc(n.partName)}`,
        `${esc(n.title)}`,
        `상태: ${ncrStatus(n)}${filled ? ` · 8D 작성 항목 ${filled}개 함께 삭제` : ''}`,
        `연결된 불량 ${(n.defectIds || []).length}건은 유지 (연결만 해제)`,
      ],
      note: '삭제 후 10초 안에 되돌릴 수 있습니다.',
    }))
  )
    return;
  const snap = await takeSnap(ncrDocIds(n));
  db.defects.forEach((d) => {
    if (d.ncrId === id) {
      d.ncrId = '';
      touch(d);
    }
  });
  if (state.tab !== 'ncr') closeModal(true);
  {
    const docs = ncrDocIds(n);
    if (docs.length) {
      photoDel(docs).catch(() => {});
      docs.forEach((i) => db.deleted.push({ id: i, at: now() }));
      photoStr = null;
    }
  }
  czUnlinkNcrAll(id);
  removeRec('ncrs', id);
  save();
  render();
  offerUndo(snap, `${n.no}을(를) 삭제했습니다`);
}
async function print8D(id) {
  const n = db.ncrs.find((x) => x.id === id);
  if (!n) return;
  const ds = (n.defectIds || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean);
  const w = reportWin();
  let phs = [];
  try {
    phs = await photoGetMany(ds.flatMap((d) => d.photos || []));
  } catch (e) {}
  let rds = [],
    nds = [];
  try {
    rds = await photoGetMany(n.replyDocs || []);
    nds = await photoGetMany(n.noticeDocs || []);
  } catch (e) {}
  const html =
    reportFrame(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(n.no)} 8D</title><style>body{font-family:'Malgun Gothic',sans-serif;font-size:12px;margin:24px;color:#111}table{width:100%;border-collapse:collapse;margin-bottom:12px}td,th{border:1px solid #555;padding:6px;vertical-align:top}th{background:#eef1f5;width:17%;text-align:left}h1{font-size:18px;margin:0 0 12px}.sm td,.sm th{font-size:11px;width:auto}.pg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.pg figure{margin:0;border:1px solid #999;padding:4px;break-inside:avoid}.pg img{width:100%;max-height:220px;object-fit:contain}.pg figcaption{font-size:11px;text-align:center;margin-top:3px}</style></head><body>
  ${logoHead()}<h1>8D Report — ${esc(n.no)}</h1>
  <table><tr><th>협력사</th><td>${esc(supName(n.supplierId))}</td><th>발행일</th><td>${esc(n.issueDate)}</td></tr>
  <tr><th>품번</th><td>${esc(n.partNo)}</td><th>품명</th><td>${esc(n.partName)}</td></tr>
  <tr><th>제목</th><td colspan="3">${esc(n.title)}</td></tr>${n.basis === '공정 감사' ? `<tr><th>발행 근거</th><td colspan="3">공정 감사 — ${esc(n.auditDate)} ${esc(n.auditType)} ${esc(n.auditRef)}${n.finding ? '<br>' + esc(n.finding) : ''}</td></tr>` : ''}${n.basis === 'PPM 초과' ? `<tr><th>발행 근거</th><td colspan="3">PPM 초과 — ${esc(n.ppmFrom)}~${esc(n.ppmTo)} 실적 ${esc(n.ppmVal)} PPM / 목표 ${esc(n.ppmTarget)} PPM</td></tr>` : ''}${n.basis === '기타' ? `<tr><th>발행 근거</th><td colspan="3">기타</td></tr>` : ''}
  <tr><th>대책 요청일</th><td>${esc(n.requestDate)}</td><th>회신 기한 / 회신일</th><td>${esc(n.dueDate)} / ${esc(n.replyDate)}</td></tr>
  <tr><th>유효성 기한</th><td>${esc(n.verifyDue)}</td><th>검증일 / 결과</th><td>${esc(n.verifyDate)} / ${esc(n.verifyResult)}</td></tr>
  <tr><th>상태</th><td>${ncrStatus(n)}${ncrRejects(n) ? ` · 보완요청·반려 ${ncrRejects(n)}회` : ''}</td><th>담당</th><td>${esc(n.owner)}</td></tr>${nds.length ? `<tr><th>발송한 통보서 파일</th><td colspan="3">${nds.map((r) => esc(r.name)).join(' · ')}</td></tr>` : ''}${rds.length ? `<tr><th>협력사 대책서 파일</th><td colspan="3">${rds.map((r) => esc(r.name)).join(' · ')}</td></tr>` : ''}${n.reqType !== '단순 통보' ? `<tr><th>D3 봉쇄 기한 / 회신일</th><td>${esc(n.d3Due)} / ${esc(n.d3Date)}</td><th>클린 포인트</th><td>${esc(n.cleanPoint)}${n.cleanMark ? '<br>' + esc(n.cleanMark) : ''}</td></tr>` : ''}${n.concession && n.concession !== '없음' ? `<tr><th>특채</th><td colspan="3">${esc(n.concession)}${(n.concDocs || []).length ? ` · 첨부 문서 ${n.concDocs.length}건` : ''}</td></tr>` : ''}${n.penalty !== undefined && n.penalty !== '' ? `<tr><th>협력사 평가 감점</th><td colspan="3">${esc(n.penalty)}점</td></tr>` : ''}</table>${(n.contain || []).length ? `<table class="sm"><tr><th>재고 위치</th><th>대상 (EA)</th><th>선별 (EA)</th><th>불량 (EA)</th><th>완료일</th></tr>${n.contain.map((r) => `<tr><td>${esc(r.loc)}</td><td>${esc(r.target)}</td><td>${esc(r.sorted)}</td><td>${esc(r.ng)}</td><td>${esc(r.done)}</td></tr>`).join('')}</table>` : ''}${(n.vlots || []).length ? `<table class="sm"><tr><th>검증 LOT</th><th>입고일</th><th>검사 (EA)</th><th>불량 (EA)</th><th>판정</th></tr>${n.vlots.map((r) => `<tr><td>${esc(r.lot)}</td><td>${esc(r.date)}</td><td>${esc(r.insp)}</td><td>${esc(r.ng)}</td><td>${vlotVerdict(r)}</td></tr>`).join('')}</table>` : ''}
  <table>${D8.map(([k, l]) => `<tr><th>${l}</th><td style="height:48px">${nl(n[k])}</td></tr>`).join('')}</table>
  ${(n.evals || [])
    .filter(evalDone)
    .map(
      (
        e,
        ri,
        arr,
      ) => `<table class="sm" style="break-inside:avoid"><tr><th colspan="5" style="background:#dde4ef">대책서 평가 ${(n.evals || []).indexOf(e) + 1}차 — ${esc(e.date)} · 평가자 ${esc(e.by)} · <b>${evalScore(e)}점 / ${evalVerdict(e)}</b></th></tr>
    <tr><th>항목</th><th>배점</th><th>평가</th><th>점수</th><th>의견</th></tr>
    ${evItems(e)
      .map((it) => {
        const v = e.sc[it.k];
        return `<tr><td>${it.t}</td><td>${it.w}</td><td>${(EV_LV.find((l) => l[0] === v) || ['', '', ''])[2]}</td><td>${Math.round(v * it.w)}</td><td>${esc(e.cm?.[it.k])}</td></tr>`;
      })
      .join('')}
    ${e.note ? `<tr><th>종합 의견</th><td colspan="4">${esc(e.note)}</td></tr>` : ''}</table>`,
    )
    .join('')}
  ${ds.length ? `<table class="sm"><tr><th>발생일</th><th>발생처</th><th>부품</th><th>유형</th><th>수량</th><th>납품일자</th><th>내용</th></tr>${ds.map((d) => `<tr><td>${esc(d.date)}</td><td>${esc(d.source)}</td><td>${esc(d.partNo)} ${esc(d.partName)}</td><td>${esc(d.type)}</td><td>${num(d.qty)}</td><td>${esc(d.delivDate || d.lot)}</td><td>${nl(d.desc)}</td></tr>`).join('')}</table>` : ''}
  ${(() => {
    const lg = [...(n.logs || []), ...ds.flatMap((d) => (d.logs || []).map((l) => ({ ...l, dd: d })))].sort((a, b) =>
      (a.date || '').localeCompare(b.date || ''),
    );
    return lg.length
      ? `<table class="sm"><tr><th colspan="3" style="background:#dde4ef">조사 · 진행 경과</th></tr><tr><th>일자</th><th>구분</th><th>내용</th></tr>${lg.map((l) => `<tr><td style="white-space:nowrap">${esc(l.date)}</td><td style="white-space:nowrap">${esc(l.kind)}</td><td>${nl(l.text)}</td></tr>`).join('')}</table>`
      : '';
  })()}
  ${
    phs.length
      ? `<h3 style="font-size:14px">불량 사진</h3><div class="pg">${phs
          .map((p) => {
            const d = ds.find((x) => x.id === p.defectId) || {};
            return `<figure><img src="${p.data}"><figcaption>${esc(d.date || '')} ${esc(d.partName || d.partNo || '')}${p.caption ? ' · ' + esc(p.caption) : ''}</figcaption></figure>`;
          })
          .join('')}</div>`
      : ''
  }
  </body></html>`);
  reportShow(w, html, `8D_${n.no}.html`);
}
function exportNcrCSV() {
  const ns = filteredNcrs();
  downloadCSV(`NCR목록_${today()}.csv`, [
    [
      'NCR번호',
      '발행일',
      '협력사',
      '품번',
      '품명',
      '제목',
      '상태',
      '통보일',
      '통보방법',
      '통보서파일',
      '대책요청일',
      '회신기한',
      '회신일',
      '대책서파일',
      '타당성',
      '유효성기한',
      '검증일',
      '검증결과',
      '특채',
      '담당',
      ...D8.map((x) => x[1]),
    ],
    ...ns.map((n) => [
      n.no,
      n.issueDate,
      supName(n.supplierId),
      n.partNo,
      n.partName,
      n.title,
      ncrStatus(n),
      n.notifyDate || '',
      n.notifyMethod || '',
      (n.noticeDocs || []).length || '',
      n.requestDate,
      n.dueDate,
      n.replyDate,
      (n.replyDocs || []).length || '',
      n.validity,
      n.verifyDue,
      n.verifyDate,
      n.verifyResult,
      n.concession,
      n.owner,
      ...D8.map(([k]) => n[k]),
    ]),
  ]);
}
