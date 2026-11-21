/* ================= 휴대폰 화면 =================
   현장에서 쓰는 두 가지만: ① 불량 등록(사진 촬영 · 품번 자동 · 심각도 표시) ② 진행 현황(오늘 챙길 일 · 진행 중 NCR · 최근 불량, 보기 전용)
   판정 · 상태 · 기한은 PC 화면과 같은 함수를 그대로 씀 (sevOf · defStage · ncrSteps · 대시보드 '오늘 챙길 일').
   화면 폭이 좁으면 자동으로 켜지고, 'PC 화면' / '휴대폰 화면'으로 바꿀 수 있음 (이 기기에 기억). */
const MOB_KEY = 'qis_view',
  mobMQ = window.matchMedia ? matchMedia('(max-width: 760px)') : null;
let mobPref = (() => {
  try {
    return localStorage.getItem(MOB_KEY) || 'auto';
  } catch (e) {
    return 'auto';
  }
})();
const mobView = () => mobPref === 'mobile' || (mobPref !== 'pc' && !!(mobMQ && mobMQ.matches));
function mobSet(v) {
  mobPref = v;
  try {
    localStorage.setItem(MOB_KEY, v);
  } catch (e) {}
  document.body.classList.toggle('mob', mobView());
  render();
  window.scrollTo(0, 0);
}
if (mobMQ && mobMQ.addEventListener)
  mobMQ.addEventListener('change', () => {
    if (mobPref === 'auto') {
      document.body.classList.toggle('mob', mobView());
      render();
    }
  });
const mob = { tab: null, form: null, photos: [], last: null, busy: false };
const mobNew = () => {
  const S = db.settings;
  return {
    date: today(),
    source: S.sources[0] || '',
    partNo: '',
    partName: '',
    supplierId: '',
    model: '',
    type: S.defectTypes[0] || '',
    qty: '',
    desc: '',
    owner: (typeof SRV !== 'undefined' && SRV && SRV.name) || S.owners[0] || '',
  };
};
function renderMobile() {
  document.body.classList.add('mob');
  if (!mob.tab) mob.tab = RO ? 'prog' : 'reg';
  if (RO && (mob.tab === 'reg' || mob.tab === 'iss')) mob.tab = 'prog';
  $('#nav').innerHTML = `<div class="mtabs">${
    RO
      ? ''
      : `<button class="${mob.tab === 'reg' ? 'on' : ''}" onclick="mobTab('reg')">＋ 불량</button><button class="${mob.tab === 'iss' ? 'on' : ''}" onclick="mobTab('iss')">＋ 이슈</button>`
  }<button class="${mob.tab === 'prog' ? 'on' : ''}" onclick="mobTab('prog')">진행 현황</button></div>`;
  // 등록 중인 입력은 다른 사용자 변경으로 화면이 다시 그려져도 지우지 않음
  if (mob.tab === 'reg' && $('#mobForm')) {
    const sel = $('#mobForm').supplierId;
    if (sel && sel.options.length !== db.suppliers.length + 1) {
      sel.innerHTML = supOpts(mob.form.supplierId, '선택');
    }
    mobSev();
    return;
  }
  if (mob.tab === 'iss' && $('#mobIss')) return;
  $('#view').innerHTML = mob.tab === 'reg' ? mobRegHTML() : mob.tab === 'iss' ? mobIssHTML() : mobProgHTML();
  if (mob.tab === 'reg') {
    mobPhotos();
    mobSev();
  }
  if (mob.tab === 'iss') mobPhotos();
}
function mobTab(t) {
  mob.tab = t;
  $('#view').innerHTML = '';
  render();
  window.scrollTo(0, 0);
}
/* ---- ① 불량 등록 ---- */
function mobRegHTML() {
  const S = db.settings,
    f = mob.form || (mob.form = mobNew());
  const done = mob.last
    ? (() => {
        const d = db.defects.find((x) => x.id === mob.last);
        if (!d) return '';
        const v = sevOf(d),
          st = defStage(d);
        return `<div class="mdone"><b>등록했습니다</b> · ${esc(d.partNo || '-')} ${esc(d.type || '')} ${num(d.qty).toLocaleString()}개<br>심각도 <span class="bg ${SEV_CLS[v.grade]}">${v.grade}</span> ${v.score}점 → <b>${esc(v.resp)}</b> · <span class="bg ${st.cls}">${esc(st.label)}</span><div class="muted" style="margin-top:4px">귀책 판정 · NCR 발행은 PC 화면에서 합니다</div></div>`;
      })()
    : '';
  return `${done}<form id="mobForm" class="mform" onsubmit="event.preventDefault();mobSave()" oninput="mobInput(event)" onchange="mobInput(event)">
  <div class="mph" id="mobPh"></div>
  <div class="mphb"><label class="b">📷 촬영<input type="file" accept="image/*" capture="environment" hidden onchange="mobAddPhotos(this)"></label><label class="b">🖼 앨범<input type="file" accept="image/*" multiple hidden onchange="mobAddPhotos(this)"></label></div>
  <label>품번 *<input name="partNo" data-combo="parts" autocomplete="off" autocapitalize="characters" value="${esc(f.partNo)}" placeholder="품번 또는 품명 입력"></label>
  <div class="mhint" id="mobPart">${f.partName ? `${esc(f.partName)} · ${esc(supName(f.supplierId) || '협력사 미지정')}` : ''}</div>
  <label>협력사<select name="supplierId">${supOpts(f.supplierId, '선택')}</select></label>
  <div class="m2"><label>불량 유형 *<select name="type">${opts(S.defectTypes, f.type)}</select></label>
  <label>수량 *<input name="qty" type="number" inputmode="numeric" min="1" value="${esc(f.qty)}"></label></div>
  <div class="m2"><label>발생처<select name="source">${opts(S.sources, f.source)}</select></label>
  <label>발생일<input name="date" type="date" value="${esc(f.date)}"></label></div>
  <label>불량 내용<textarea name="desc" rows="3" placeholder="예: 파팅라인 단차로 그리스 누유, LOT 1028 전량 의심">${esc(f.desc)}</textarea></label>
  <div class="msev" id="mobSev"></div>
  <button class="b p mbig" type="submit" id="mobSaveBtn">등록</button>
  </form>`;
}
function mobInput(e) {
  const el = e.target;
  if (!el.name || !mob.form) return;
  mob.form[el.name] = el.value;
  if (el.name === 'partNo') {
    const p = partByNo(el.value.trim());
    if (p) {
      mob.form.partName = p.name || '';
      mob.form.model = p.model || '';
      if (p.supplierId) {
        mob.form.supplierId = p.supplierId;
        const s = $('#mobForm').supplierId;
        if (s) s.value = p.supplierId;
      }
    } else {
      mob.form.partName = '';
    }
    const h = $('#mobPart');
    if (h)
      h.innerHTML = mob.form.partName
        ? `${esc(mob.form.partName)} · ${esc(supName(mob.form.supplierId) || '협력사 미지정')}`
        : el.value.trim()
          ? '<span style="color:var(--warn)">기준정보에 없는 품번 — 그대로 등록할 수 있습니다</span>'
          : '';
  }
  mobSev();
}
const mobRec = () => {
  const f = mob.form || mobNew();
  return {
    id: '_mob',
    date: f.date,
    source: f.source,
    partNo: f.partNo.trim(),
    partName: f.partName,
    supplierId: f.supplierId,
    model: f.model,
    type: f.type,
    qty: num(f.qty),
    desc: f.desc,
    resp: /수입/.test(f.source) ? '협력사' : '미정',
  };
};
function mobSev() {
  const b = $('#mobSev');
  if (!b || !mob.form) return;
  if (!mob.form.qty) {
    b.innerHTML = '<span class="muted">수량을 넣으면 심각도를 미리 보여 줍니다</span>';
    return;
  }
  const v = sevOf(mobRec());
  b.innerHTML = `예상 심각도 <span class="bg ${SEV_CLS[v.grade]}">${v.grade}</span> ${v.score}점 → ${esc(v.resp)}${
    v.forced.length ? ` <span class="muted">(${esc(v.forced.join(', '))})</span>` : ''
  }`;
}
async function mobAddPhotos(inp) {
  const fs = [...inp.files].filter((f) => f.type.startsWith('image/'));
  inp.value = '';
  for (const f of fs) {
    try {
      const { isNew, ...r } = await attImgRec(f, '사진.jpg');
      mob.photos.push(r);
    } catch (e) {
      toast(e.message);
    }
  }
  mobPhotos();
}
function mobPhotos() {
  const b = $('#mobPh');
  if (!b) return;
  b.innerHTML = mob.photos.length
    ? mob.photos
        .map(
          (p, i) =>
            `<div class="mpi"><img src="${p.thumb}" onclick="lbOpen(mob.photos,${i})" alt=""><button type="button" onclick="mob.photos.splice(${i},1);mobPhotos()" aria-label="사진 빼기">×</button></div>`,
        )
        .join('')
    : '<div class="muted mph0">불량 부위 · 라벨 사진을 찍어 두세요 (선택)</div>';
}
async function mobSave() {
  if (mob.busy || RO) return;
  const f = mob.form;
  if (!f.partNo.trim()) {
    toast('품번을 입력하세요');
    return;
  }
  if (!num(f.qty)) {
    toast('수량을 입력하세요');
    return;
  }
  if (!f.date) {
    toast('발생일을 입력하세요');
    return;
  }
  mob.busy = true;
  const btn = $('#mobSaveBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '저장 중…';
  }
  const r = mobRec();
  delete r.id;
  const d = {
    id: uid(),
    ...r,
    owner: f.owner,
    ncrId: '',
    photos: [],
    costs: [],
    sev: { special: false },
    ...(r.resp === '미정' ? { inv: { costNotice: false, verdictDate: '' } } : {}),
  };
  try {
    if (mob.photos.length) {
      await photoPut(
        mob.photos.map((p) => ({
          id: p.id,
          defectId: d.id,
          name: p.name,
          caption: '',
          data: p.data,
          thumb: p.thumb,
          createdAt: p.createdAt,
          updatedAt: now(),
        })),
      );
      d.photos = mob.photos.map((p) => p.id);
      photoStr = null;
    }
  } catch (e) {
    toast('사진 저장 실패: ' + e.message + ' — 불량은 사진 없이 등록합니다');
  }
  db.defects.push(d);
  touch(d);
  if (f.owner && !db.settings.owners.includes(f.owner)) db.settings.owners.push(f.owner);
  save();
  mob.last = d.id;
  mob.photos = [];
  const keep = { source: f.source, date: f.date };
  mob.form = { ...mobNew(), ...keep };
  mob.busy = false;
  $('#view').innerHTML = '';
  render();
  window.scrollTo(0, 0);
}
/* ---- ③ 이슈 빠른 등록 (현장) — 사진 · 무엇이 · 어디서 · 긴급도 · 특별특성 · 격리. 나머지는 PC 이슈 화면에서 ---- */
function mobIssHTML() {
  const S = db.settings,
    last = mob.lastIss && issById(mob.lastIss);
  return `${
    last
      ? `<div class="mdone"><b>이슈를 등록했습니다</b> · ${esc(last.no)} ${esc(last.title)}<div class="muted" style="margin-top:4px">기록 · 처리 방향(불량 · FAR · NCR · RCA)은 PC의 ‘이슈’ 화면에서 이어서 합니다.</div></div>`
      : ''
  }
  <form id="mobIss" class="mform" onsubmit="event.preventDefault();mobIssSave()">
  <div class="mph" id="mobPh"></div>
  <div class="mphb"><label class="b">📷 촬영<input type="file" accept="image/*" capture="environment" hidden onchange="mobAddPhotos(this)"></label><label class="b">🖼 앨범<input type="file" accept="image/*" multiple hidden onchange="mobAddPhotos(this)"></label></div>
  <label>무엇이 *<input name="title" placeholder="예: 래치 스프링 미조립 의심"></label>
  <div class="m2"><label>어디서 *<select name="source">${opts(S.sources, S.sources.find((x) => /공정/.test(x)) || S.sources[0])}</select></label>
  <label>세부 위치<input name="loc" placeholder="예: 조립 2라인"></label></div>
  <fieldset class="murg"><legend>긴급도 *</legend>${ISS_URG.map(
    (u) => `<label><input type="radio" name="urg" value="${u}" ${u === '높음' ? 'checked' : ''}><span>${u}</span></label>`,
  ).join('')}</fieldset>
  <div class="mchk"><label><input type="checkbox" name="special"> 특별특성 (CC/SC) 관련</label><label><input type="checkbox" name="contain"> 격리 · 보류 했음</label></div>
  <label>메모<textarea name="memo" rows="3" placeholder="수량 · 즉시 조치 · 공유한 사람"></textarea></label>
  <button class="b p mbig" type="submit" id="mobIssBtn">이슈 등록 — 나머지는 PC에서</button>
  </form>`;
}
async function mobIssSave() {
  if (mob.busy || RO) return;
  const f = $('#mobIss');
  if (!f) return;
  const title = f.title.value.trim(),
    memo = f.memo.value.trim(),
    urg = (f.querySelector('input[name=urg]:checked') || {}).value || '보통';
  if (!title) {
    toast('무엇이를 입력하세요');
    f.title.focus();
    return;
  }
  const special = f.special.checked,
    contain = f.contain.checked;
  if (
    (special || urg === '긴급') &&
    !contain &&
    !(await askConfirm({
      title: '격리 없이 등록할까요?',
      msg: '긴급 · 특별특성 건입니다. 재고 · 재공을 막았는지 확인하세요.',
      ok: '그래도 등록',
      danger: false,
    }))
  )
    return;
  mob.busy = true;
  const btn = $('#mobIssBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '저장 중…';
  }
  const at = nowMin(),
    g = genDocNo('iss', at.slice(0, 10));
  const i = {
    id: uid(),
    no: g.no,
    title,
    source: f.source.value,
    loc: f.loc.value.trim(),
    at,
    owner: (typeof SRV !== 'undefined' && SRV && SRV.name) || czMe(),
    desc: memo,
    partNo: '',
    qty: '',
    urg,
    special,
    contain,
    containText: contain ? memo : '',
    photos: [],
    logs: [],
    defectIds: [],
    caseIds: [],
    createdAt: now(),
  };
  issLog(i, '발견', memo || title, { at });
  if (contain) issLog(i, '격리', memo || '격리 · 보류함', { at });
  try {
    if (mob.photos.length) {
      await photoPut(
        mob.photos.map((p) => ({
          id: p.id,
          defectId: i.id,
          name: p.name,
          caption: '',
          data: p.data,
          thumb: p.thumb,
          createdAt: p.createdAt,
          updatedAt: now(),
        })),
      );
      i.photos = mob.photos.map((p) => p.id);
      photoStr = null;
    }
  } catch (e) {
    toast('사진 저장 실패: ' + e.message + ' — 이슈는 사진 없이 등록합니다');
  }
  db.issues.push(i);
  touch(i);
  save();
  mob.lastIss = i.id;
  mob.photos = [];
  mob.busy = false;
  $('#view').innerHTML = '';
  render();
  window.scrollTo(0, 0);
}
/* ---- ② 진행 현황 (보기 전용) ---- */
let dashItems = [];
function mobProgHTML() {
  try {
    renderDash();
  } catch (e) {
    console.error(e);
  } // 대시보드와 같은 '오늘 챙길 일'
  const box = document.createElement('div');
  box.innerHTML = `<ul>${dashItems.join('')}</ul>`;
  box.querySelectorAll('[onclick]').forEach((el) => {
    const m = /^(editNcr|editDefect|editInv|czOpenCase)\('([^']+)'/.exec(el.getAttribute('onclick') || '');
    if (m) el.setAttribute('onclick', `mobCard('${m[1] === 'editNcr' ? 'ncr' : m[1] === 'czOpenCase' ? 'case' : 'defect'}','${m[2]}')`);
    else if (el.tagName === 'BUTTON') el.remove();
    else el.removeAttribute('onclick');
  });
  const open = db.ncrs
    .filter((n) => ncrStatus(n) !== '종결')
    .map((n) => {
      const r = ncrSteps(n),
        cur = r.S[r.cur] || {};
      return { n, cur, due: cur.due || '', late: !!cur.late };
    })
    .sort((a, b) => b.late - a.late || (a.due || '9').localeCompare(b.due || '9'));
  const recent = db.defects
    .filter((d) => d.date && diffDays(d.date, today()) <= 14)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 30);
  const dd = (x) => {
    if (!x) return '';
    const k = diffDays(today(), x);
    return k < 0
      ? `<span class="bg bad">D+${-k}</span>`
      : k === 0
        ? '<span class="bg warn">오늘</span>'
        : `<span class="bg ${k <= 3 ? 'warn' : 'mut'}">D-${k}</span>`;
  };
  return `<section class="msec"><h3>오늘 챙길 일 <span class="bg mut">${dashItems.length}</span></h3>${
    dashItems.length ? `<ul class="act macts">${box.querySelector('ul').innerHTML}</ul>` : '<div class="muted">지연 · 임박 항목이 없습니다.</div>'
  }</section>
  <section class="msec"><h3>진행 중 NCR <span class="bg mut">${open.length}</span></h3>${
    open.length
      ? open
          .map(
            (x) =>
              `<button class="mrow" onclick="mobCard('ncr','${x.n.id}')"><span class="mr1"><b>${esc(x.n.no)}</b> ${esc(supName(x.n.supplierId))}</span><span class="mr2">${esc(x.n.partNo || '')} ${esc(x.n.title || '')}</span><span class="mr3">${stB(ncrStatus(x.n))} ${
                x.cur.l ? `<span class="muted">${esc(x.cur.l)}</span>` : ''
              } ${dd(x.due)}</span></button>`,
          )
          .join('')
      : '<div class="muted">진행 중인 NCR이 없습니다.</div>'
  }</section>
  <section class="msec"><h3>최근 2주 불량 <span class="bg mut">${recent.length}</span></h3>${
    recent.length
      ? recent
          .map((d) => {
            const st = defStage(d),
              v = sevOf(d);
            return `<button class="mrow" onclick="mobCard('defect','${d.id}')"><span class="mr1"><span class="bg ${SEV_CLS[v.grade]}">${v.grade}</span> <b>${esc(d.partNo || d.fgNo || '-')}</b> ${esc(d.type || '')} ${num(d.qty).toLocaleString()}개${(d.photos || []).length ? ' 📷' : ''}</span><span class="mr2">${esc(d.date)} · ${esc(
              supName(d.supplierId) || d.source || '',
            )}</span><span class="mr3"><span class="bg ${st.cls}">${esc(st.label)}</span></span></button>`;
          })
          .join('')
      : '<div class="muted">최근 2주 동안 등록된 불량이 없습니다.</div>'
  }</section>`;
}
function mobCard(kind, id) {
  let h = '';
  if (kind === 'ncr') {
    const n = db.ncrs.find((x) => x.id === id);
    if (!n) return;
    const ds = (n.defectIds || []).map((i) => db.defects.find((d) => d.id === i)).filter(Boolean);
    h = `<h3>${esc(n.no)} ${stB(ncrStatus(n))}</h3>
      <div class="mkv"><span>협력사</span><b>${esc(supName(n.supplierId))}</b><span>부품</span><b>${esc(n.partNo || '')} ${esc(n.partName || '')}</b><span>제목</span><b>${esc(n.title || '-')}</b><span>요구 회신</span><b>${esc(n.reqType || '8D 보고서')}${
        n.repeatOf ? ` · <span class="bg bad">재발</span> ${esc(n.repeatOf)}` : ''
      }</b><span>회신 기한</span><b>${esc(n.dueDate || '-')}${
        n.replyDate ? ` · 회신 ${esc(n.replyDate)}` : ''
      }</b><span>검증 기한</span><b>${esc(n.verifyDue || '-')}</b><span>연결 불량</span><b>${ds.length}건</b></div>${ncrTrack(n)}`;
  } else if (kind === 'defect') {
    const d = db.defects.find((x) => x.id === id);
    if (!d) return;
    const v = sevOf(d);
    h = `<h3><span class="bg ${SEV_CLS[v.grade]}">${v.grade}</span> ${esc(d.partNo || d.fgNo || '-')} ${esc(d.partName || d.fgName || '')}</h3>
      <div class="mkv"><span>발생</span><b>${esc(d.date)} · ${esc(d.source || '')}</b><span>협력사</span><b>${esc(supName(d.supplierId) || '-')}</b><span>불량</span><b>${esc(d.type || '')} ${num(d.qty).toLocaleString()}개</b><span>귀책</span><b>${esc(d.resp || '-')}</b><span>진행</span><b>${stageBadges(d)}</b><span>내용</span><b>${esc(d.desc || '-')}</b></div>${
        (d.photos || []).length ? `<button class="b" onclick="viewDefectPhotos('${d.id}')">📷 사진 ${d.photos.length}장 보기</button>` : ''
      }`;
  } else if (kind === 'case') {
    const c = czById('cases', id);
    if (!c) return;
    h = `<h3>${esc(c.CaseNo || '')} ${esc(c.Title || '')}</h3>
      <div class="mkv"><span>단계</span><b>${esc(c.Stage || '')}</b><span>상태</span><b>${esc(c.Status || '')}</b><span>다음 할 일</span><b>${esc(c.NextAction || '-')}</b><span>재확인</span><b>${esc(c.RecheckDate || '-')}</b></div>`;
  }
  const s = $('#mcard');
  s.innerHTML = `<div class="mcard-in" onclick="event.stopPropagation()">${h}<div class="muted" style="margin-top:10px;font-size:12px">수정 · 처리는 PC 화면에서 합니다</div><button class="b mbig" onclick="mobCardClose()">닫기</button></div>`;
  s.classList.add('on');
}
function mobCardClose() {
  $('#mcard').classList.remove('on');
}
function render() {
  const own = !sevMemo;
  if (own) {
    sevMemo = new Map();
    pcMemo = {};
  }
  try {
    renderInner();
    if (typeof czModalSync === 'function') czModalSync();
  } finally {
    if (own) {
      sevMemo = null;
      pcMemo = null;
    }
  }
}
function renderInner() {
  if (!RO_TABS.includes(state.tab)) state.tab = 'dash'; // 권한에 없는 화면
  try {
    czSyncAll();
  } catch (e) {}
  if (mobView()) {
    $('#dlParts').innerHTML = db.parts
      .map((p) => `<option value="${esc(p.partNo)}">${esc(p.name)} · ${esc(supName(p.supplierId))}</option>`)
      .join('');
    navFoot(); // 사이드바 아래 칸에 있던 사용자 · 로그아웃을 머리글로 되돌린 뒤에 메뉴를 바꿈
    renderMobile();
    renderBrand();
    updateSaveInfo();
    return;
  }
  document.body.classList.remove('mob');
  document.body.classList.toggle('pcnarrow', mobPref === 'pc' && !!(mobMQ && mobMQ.matches));
  const navFt0 = $('#navFt'),
    navTop = $('#nav').scrollTop;
  if (navFt0) {
    navFt0.remove();
    window.__navFt = navFt0;
  } // 사이드바 하단(사용자 · 관리 · 저작권)은 innerHTML 교체 전에 떼어 두고 기억함
  let navG = '';
  $('#nav').innerHTML = TABS.filter(([k]) => RO_TABS.includes(k))
    .map(([k, l]) => {
      const n = k === 'case' ? czBadgeN() : k === 'prog' ? progBadgeN() : k === 'inv' ? invLateN() : k === 'issue' ? issWaitN() : 0;
      const g = NAV_GRP[k] || navG,
        gh = g !== navG ? `<div class="gh">${g}</div>` : '';
      navG = g;
      return (
        gh +
        `<button class="${state.tab === k ? 'on' : ''}" onclick="go('${k}')">${l}${
          n ? ` <span class="bg bad" style="font-size:10.5px">${n}</span>` : ''
        }</button>`
      );
    })
    .join('');
  navFoot();
  $('#nav').scrollTop = navTop; // 낮은 창에서 메뉴를 내려 둔 위치 유지
  $('#dlParts').innerHTML = db.parts.map((p) => `<option value="${esc(p.partNo)}">${esc(p.name)} · ${esc(supName(p.supplierId))}</option>`).join('');
  $('#dlOwners').innerHTML = db.settings.owners.map((o) => `<option value="${esc(o)}">`).join('');
  $('#dlSources').innerHTML = db.settings.sources.map((o) => `<option value="${esc(o)}">`).join('');
  const f =
    {
      issue: renderIssue,
      case: czRender,
      dash: renderDash,
      prog: renderProg,
      defect: renderDefect,
      inv: renderInv,
      ncr: renderNcr,
      sup: renderSup,
      copq: renderCopq,
      master: renderMaster,
      data: renderData,
    }[state.tab] || ((state.tab = 'dash'), renderDash);
  $('#view').innerHTML = f();
  renderBrand();
  updateSaveInfo();
}
// 표 칸 정리: 공백 없는 짧은 값(14자 이하)만 든 칸은 줄바꿈하지 않음 — 날짜·번호·품번·분류·담당자
function fitCells(root) {
  (root || document).querySelectorAll('td').forEach((td) => {
    if (td.dataset.fit || td.querySelector('input,select,textarea')) return;
    td.dataset.fit = '1';
    // 여러 줄 칸의 첫 줄이 품번·번호 같은 공백 없는 값이면 그 줄만 한 줄로
    const f = td.firstChild;
    if (f && f.nodeType === 3) {
      const t = f.textContent.trim();
      if (t && t.length <= 24 && !/\s/.test(t)) {
        const sp = document.createElement('span');
        sp.className = 'nwi';
        sp.textContent = f.textContent;
        td.replaceChild(sp, f);
      }
    }
    const lines = td.innerHTML
      .split(/<br\s*\/?>|<div[\s>]/i)
      .map((x) =>
        x
          .replace(/<[^>]*>/g, '')
          .replace(/&[a-z]+;/g, 'x')
          .trim(),
      )
      .filter(Boolean);
    if (lines.length && lines.every((l) => l.length <= 14 && !/\s.*\s.*\s/.test(l))) td.classList.add('nw');
  });
}
(() => {
  let q = null;
  const run = () => {
    q = null;
    try {
      fitCells($('#view'));
    } catch (e) {}
    try {
      roSweep($('#view'));
    } catch (e) {}
    try {
      fitCharts(document);
    } catch (e) {}
  };
  const start = () => {
    const v = $('#view');
    if (!v) return setTimeout(start, 50);
    new MutationObserver(() => {
      if (!q) q = requestAnimationFrame(run);
    }).observe(v, { childList: true, subtree: true });
    run();
  };
  start();
})();
const APP_VER_FILE = '0.6.2'; // 화면 파일 자체의 마지막 단독(HTML판) 버전 — 더 이상 올리지 않음
// 머리글 · 백업 메타 · SQLite 내보내기에 적는 버전: 서버(데스크톱 프로그램)가 알려 준 버전이 있으면 그것(1.3.x), 없으면(단독 파일) 화면 파일 버전
const APP_VER = SRV && SRV.server ? String(SRV.server) : APP_VER_FILE;
function renderBrand() {
  const S = db.settings,
    tab = (TABS.find((t) => t[0] === state.tab) || [])[1] || '';
  $('#brand').innerHTML = S.logo ? `<img class="brandlogo" src="${S.logo}" alt="로고">` : '';
  $('#appTitle').innerHTML = `${esc(
    S.company ? S.company + ' 품질관리' : 'QIS',
  )} <span style="font:600 11px/1 var(--f-mono,monospace);color:var(--sub);vertical-align:middle">ver ${APP_VER}</span>`;
  document.title = (RO ? '[읽기 전용] ' : '') + (S.company ? S.company + ' 품질관리' : 'QIS'); // 설치 앱 창 제목: ‘QIS - 회사 품질관리’
  $('#printHead').innerHTML = `${S.logo ? `<img src="${S.logo}" alt="">` : ''}<div class="t"><b>${esc(S.company || '품질관리')} — ${esc(tab)}${
    state.tab === 'dash' ? ' (' + esc(state.dashMonth) + ')' : ''
  }</b><span>${esc(S.dept)}</span></div><div class="d">출력일 ${today()}</div>`;
}
function logoHead() {
  const S = db.settings;
  return S.logo || S.company
    ? `<div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid #0B4F4D;padding-bottom:8px;margin-bottom:12px">${
        S.logo ? `<img src="${S.logo}" style="max-height:44px;max-width:180px;object-fit:contain">` : ''
      }<div style="flex:1"><b style="font-size:15px">${esc(S.company)}</b><br><span style="font-size:11px;color:#555">${esc(S.dept)}</span></div>
        <div style="font-size:11px;color:#555">출력일 ${today()}</div></div>`
    : '';
}
async function setLogo(f) {
  if (!f) return;
  try {
    let url;
    if (f.type === 'image/svg+xml' || /\.svg$/i.test(f.name)) {
      if (f.size > 300000) throw new Error('SVG 파일이 너무 큽니다 (300KB 이하)');
      const t = await f.text();
      url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(t)));
    } else {
      if (!f.type.startsWith('image/')) throw new Error('이미지 파일(PNG, JPG, SVG)을 선택하세요');
      const im = await readImg(f),
        sc = Math.min(1, 600 / im.naturalWidth, 200 / im.naturalHeight);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.naturalWidth * sc));
      c.height = Math.max(1, Math.round(im.naturalHeight * sc));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      url = c.toDataURL('image/png');
    }
    db.settings.logo = url;
    save();
    render();
    toast('로고가 적용되었습니다');
  } catch (e) {
    toast('로고 적용 실패: ' + e.message);
  }
}
async function setSign(nm, f) {
  if (!f) return;
  try {
    const im = await readImg(f);
    const sc = Math.min(1, 360 / im.naturalWidth, 120 / im.naturalHeight),
      c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(im.naturalWidth * sc));
    c.height = Math.max(1, Math.round(im.naturalHeight * sc));
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height),
      a = d.data;
    for (let k = 0; k < a.length; k += 4) {
      const l = (a[k] + a[k + 1] + a[k + 2]) / 3;
      if (l > 200) a[k + 3] = 0;
      else if (l > 150) a[k + 3] = Math.round((200 - l) * 5);
    }
    x.putImageData(d, 0, 0);
    db.settings.signs = { ...(db.settings.signs || {}), [nm]: c.toDataURL('image/png') };
    save();
    render();
    toast(`${nm} 서명이 등록되었습니다 (흰 배경 자동 제거)`);
  } catch (e) {
    toast('서명 등록 실패: ' + e.message);
  }
}
async function clearSign(nm) {
  if (!(await askConfirm({ title: `${nm} 서명을 삭제할까요?` }))) return;
  const g = { ...(db.settings.signs || {}) };
  delete g[nm];
  db.settings.signs = g;
  save();
  render();
}
async function clearLogo() {
  if (!(await askConfirm({ title: '로고를 삭제할까요?', msg: '상단 바와 출력물에서 로고가 빠집니다.' }))) return;
  const snap = await takeSnap();
  db.settings.logo = '';
  save();
  render();
  offerUndo(snap, '로고를 삭제했습니다');
}
