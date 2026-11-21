/* ================= 사내 서버 모드 (QIS 서버에서 열었을 때) =================
   서버가 화면을 보낼 때 qisServer 스크립트 태그에 로그인 사용자 정보를 넣어 줌 → SRV
   · 데이터 원본은 서버 DB. 화면은 기록을 한 건씩 비교해 바뀐 것만 서버로 보냄 (rev = 서버 버전)
   · 15초마다 · 창으로 돌아올 때 다른 사용자의 변경을 받아옴
   · 같은 기록을 동시에 고치면 서버가 항목별로 합치고, 같은 항목이면 지금 저장한 값 + 이력에 '동시 수정'
   · 첨부(사진 · 문서)는 서버 파일 저장소. 브라우저 저장소 · PC 폴더 · 백업 파일은 쓰지 않음 (백업은 서버가) */
let srvSeq = 0,
  srvFirst = true,
  srvShadow = new Map(),
  srvBusy = null,
  srvAgain = false,
  srvTimer = null,
  srvState = { ok: null, at: null, err: '', expired: false, pend: 0 },
  srvViewDirty = false;
const SRV_SEP = '\u0001',
  srvKey = (c, id) => c + SRV_SEP + id;
// 서버 내용을 화면에 넣은 뒤(형식 정리 포함)의 모습을 기준으로 삼아, 받은 내용을 되돌려 보내지 않게 함
const srvMark = (coll, id, rev) => {
  const o = srvLocal(coll, id);
  srvShadow.set(srvKey(coll, id), { rev, json: o == null ? 'null' : JSON.stringify(o) });
};
const srvCanAdmin = () => !!SRV && SRV.role === 'admin';
async function srvApi(path, body) {
  let r;
  try {
    r = await fetch(path, {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json', 'X-QIS': '1' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error('서버에 연결할 수 없습니다');
  }
  let j = null;
  try {
    j = await r.json();
  } catch (e) {}
  if (r.status === 401) {
    srvState.expired = true;
    renderAlert();
    throw new Error('로그인이 만료되었습니다');
  }
  if (!r.ok) throw Object.assign(new Error((j && j.message) || '서버 오류 ' + r.status), { status: r.status });
  return j;
}
function srvLocal(coll, id) {
  return coll === 'doc' ? db[id] : (db[coll] || []).find((r) => r.id === id);
}
function srvSetLocal(coll, id, data) {
  if (coll === 'doc') {
    if (id === 'settings') {
      const s = db.settings;
      Object.keys(s).forEach((k) => delete s[k]);
      Object.assign(s, migrate({ settings: data }).settings);
    } else if (id === 'bom') {
      db.bom = migrate({ bom: data }).bom;
      _bomIx = null;
    }
    return;
  }
  if (coll === 'suppliers') ensureContacts(data);
  if (coll === 'defects' && !Array.isArray(data.photos)) data.photos = [];
  if (coll === 'issues') issNorm(data); // 예전 판이 보낸 이슈 기록도 공통 구조로 읽음
  const o = (db[coll] || []).find((r) => r.id === id);
  if (o) {
    Object.keys(o).forEach((k) => delete o[k]);
    Object.assign(o, data);
  } else db[coll].push(data);
}
function srvDelLocal(coll, id) {
  if (coll !== 'doc' && db[coll]) db[coll] = db[coll].filter((r) => r.id !== id);
}
async function srvBoot() {
  const j = await srvApi('/api/boot');
  const d = { meta: {}, settings: {}, bom: { updatedAt: '', rows: [] } };
  COLLS.forEach((c) => (d[c] = []));
  srvShadow = new Map();
  j.records.forEach((r) => {
    if (r.coll === 'doc') {
      if (r.id === 'settings' || r.id === 'bom') d[r.id] = r.data;
    } else if (d[r.coll]) d[r.coll].push(r.data);
    srvShadow.set(srvKey(r.coll, r.id), { rev: r.rev, json: JSON.stringify(r.data) });
  });
  db = migrate(d);
  srvSeq = j.seq;
  srvState.ok = true;
  srvState.at = new Date();
  setInterval(() => {
    if (!document.hidden) srvSync();
  }, 15000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) srvSync();
  });
  window.addEventListener('focus', () => srvSync());
  if (!RO) setTimeout(srvSync, 800); // 화면 쪽 형식 정리(migrate) 결과를 한 번 반영
}
// 마지막으로 서버와 맞춘 내용(shadow)과 지금 화면 데이터를 비교 → 바뀐 기록만
function srvCollect() {
  const out = [],
    seen = new Set();
  const add = (coll, id, obj) => {
    const k = srvKey(coll, id);
    seen.add(k);
    let j;
    try {
      j = JSON.stringify(obj);
    } catch (e) {
      return;
    }
    const sh = srvShadow.get(k);
    if (sh && sh.json === j) return;
    out.push({ coll, id, rev: sh ? sh.rev : 0, base: sh && id !== 'bom' ? JSON.parse(sh.json) : null, data: obj, _j: j });
  };
  COLLS.forEach((c) =>
    (db[c] || []).forEach((r) => {
      if (r && r.id) add(c, r.id, r);
    }),
  );
  add('doc', 'settings', db.settings);
  add('doc', 'bom', db.bom);
  srvShadow.forEach((v, k) => {
    if (seen.has(k)) return;
    const [coll, id] = k.split(SRV_SEP);
    if (coll === 'doc') return;
    out.push({ coll, id, rev: v.rev, base: JSON.parse(v.json), data: null, _j: null });
  });
  return out;
}
const srvModalOpen = () => {
  const m = $('#modal');
  return !!(m && m.classList.contains('on'));
};
function srvRefresh() {
  if (srvModalOpen()) {
    srvViewDirty = true;
    return;
  }
  srvViewDirty = false;
  photoStr = null;
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}
function srvSync() {
  if (!SRV || !dataReady || loadFailed) return Promise.resolve();
  if (srvBusy) {
    srvAgain = true;
    return srvBusy;
  }
  clearTimeout(srvTimer);
  srvTimer = null;
  srvBusy = (async () => {
    const ch = RO ? [] : srvCollect();
    srvState.pend = ch.length;
    let j;
    try {
      j = await srvApi('/api/sync', { since: srvSeq, changes: ch.map(({ _j, ...c }) => c) });
    } catch (e) {
      srvState.ok = false;
      srvState.err = e.message;
      updateSaveInfo();
      renderAlert();
      if (!srvState.expired) srvTimer = setTimeout(srvSync, ch.length ? 5000 : 15000);
      return;
    }
    const wasDown = srvState.ok === false;
    srvState.ok = true;
    srvState.err = '';
    srvState.at = new Date();
    srvState.expired = false;
    srvState.pend = 0;
    if (j.reload) {
      toast('변경이 많아 화면을 새로 불러옵니다');
      setTimeout(() => location.reload(), 800);
      return;
    }
    let touched = false;
    const msg = [],
      first = srvFirst;
    srvFirst = false;
    j.results.forEach((r, i) => {
      const c = ch[i],
        k = srvKey(r.coll, r.id);
      if (r.ok) {
        if (c.data === null) srvShadow.delete(k);
        else if (r.data) {
          srvSetLocal(r.coll, r.id, r.data);
          srvMark(r.coll, r.id, r.rev);
          touched = true;
          if (r.conflicts && r.conflicts.length)
            msg.push(`다른 사용자가 같은 항목을 먼저 고쳤습니다 (${r.conflicts.join(', ')}) — 지금 저장한 값으로 반영, 변경 이력에 남김`);
        } else srvShadow.set(k, { rev: r.rev, json: c._j });
      } else {
        if (r.data) {
          srvSetLocal(r.coll, r.id, r.data);
          srvMark(r.coll, r.id, r.rev);
        } else if (r.coll === 'doc') srvShadow.set(k, { rev: r.rev || 0, json: c._j });
        else {
          srvDelLocal(r.coll, r.id);
          srvShadow.delete(k);
        }
        touched = true;
        if (!first) msg.push(r.message || '저장하지 못한 변경이 있습니다');
      }
    });
    let n = 0;
    const who = new Set();
    (j.pulled || []).forEach((p) => {
      const k = srvKey(p.coll, p.id),
        sh = srvShadow.get(k);
      if (sh && sh.rev >= p.rev) return;
      const loc = srvLocal(p.coll, p.id);
      let lj = null;
      try {
        lj = loc ? JSON.stringify(loc) : null;
      } catch (e) {}
      if (sh ? lj !== sh.json : loc != null) return; // 이 화면에서 고치는 중 → 다음 저장 때 서버가 합침
      if (p.data === null) {
        srvDelLocal(p.coll, p.id);
        srvShadow.delete(k);
      } else {
        srvSetLocal(p.coll, p.id, p.data);
        srvMark(p.coll, p.id, p.rev);
      }
      n++;
      if (p.by) who.add(p.by);
      touched = true;
    });
    srvSeq = j.seq;
    if (touched) srvRefresh();
    [...new Set(msg)].slice(0, 2).forEach((m, i) => setTimeout(() => toast(m), i * 3400));
    (j.warnings || []).forEach((m, i) => setTimeout(() => toast(m), (msg.length + i) * 3400));
    if (n && !msg.length && !(j.warnings || []).length) toast(`${[...who].join(', ') || '다른 사용자'}의 변경 ${n}건을 받았습니다`);
    if (wasDown) toast('서버에 다시 연결되었습니다');
    updateSaveInfo();
    renderAlert();
  })().finally(() => {
    srvBusy = null;
    if (srvAgain) {
      srvAgain = false;
      srvSync();
    }
  });
  return srvBusy;
}
function srvPersist() {
  clearTimeout(srvTimer);
  srvState.pend = Math.max(srvState.pend, 1);
  srvTimer = setTimeout(srvSync, 400);
  updateSaveInfo();
  return Promise.resolve();
}
const srvUnsaved = () => !RO && (srvState.pend > 0 || (srvState.expired && srvCollect().length > 0));
// ---- 첨부 (사진 · 문서) ----
const srvPhCache = new Map();
async function srvPhotoGetMany(ids) {
  ids = (ids || []).filter((i) => typeof i === 'string' && i);
  const miss = [...new Set(ids.filter((i) => !srvPhCache.has(i)))];
  for (let i = 0; i < miss.length; i += 100) {
    const j = await srvApi('/api/files/get', { ids: miss.slice(i, i + 100) });
    (j.files || []).forEach((f) => srvPhCache.set(f.id, f));
  }
  return ids.map((i) => srvPhCache.get(i)).filter(Boolean);
}
async function srvPhotoPut(recs) {
  if (RO) throw new Error('조회 권한은 첨부할 수 없습니다');
  recs = (recs || []).filter((r) => r && r.id);
  let batch = [],
    size = 0;
  const flush = async () => {
    if (!batch.length) return;
    await srvApi('/api/files/put', { files: batch });
    batch.forEach((r) => srvPhCache.set(r.id, r));
    batch = [];
    size = 0;
  };
  for (const r of recs) {
    const s = (r.data || '').length + (r.thumb || '').length;
    if (size + s > 8e6) await flush();
    batch.push(r);
    size += s;
  }
  await flush();
}
async function srvPhotoDel(ids) {
  ids = (ids || []).filter(Boolean);
  if (!ids.length) return;
  await srvApi('/api/files/delete', { ids });
  ids.forEach((i) => srvPhCache.delete(i));
}
async function srvPhotoAll() {
  const j = await srvApi('/api/files/ids');
  return srvPhotoGetMany(j.ids || []);
}
// ---- 화면 ----
async function srvLogout() {
  try {
    await srvSync();
  } catch (e) {}
  try {
    await srvApi('/api/logout', {});
  } catch (e) {}
  location.href = '/login';
}
function srvAdminOnly() {
  toast('관리자만 할 수 있습니다');
}
function srvPanel() {
  const st = srvState,
    R = { viewer: '조회', editor: '작성', admin: '관리자' };
  const btn = (lbl, fn, cls = '') => `<button class="b ${cls}" onclick="${fn}">${lbl}</button>`;
  return (
    sg(
      '사내 서버',
      sv(
        '연결',
        '데이터는 사내 서버에 저장됩니다. 이 PC에는 남지 않습니다.',
        `<span class="${st.ok === false ? 'bg bad' : 'bg ok'}">${st.ok === false ? '연결 끊김' : '연결됨'}</span> <span class="muted">${
          st.at ? '마지막 동기화 ' + loc(st.at.toISOString()) : ''
        }</span>`,
      ) +
        sv(
          '로그인 사용자',
          `${esc(SRV.name)} (${esc(SRV.user)}) · ${R[SRV.role] || SRV.role} 권한`,
          `<span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${btn(
            '비밀번호 변경',
            "location.href='/account'",
          )}${btn('로그아웃', 'srvLogout()')}</span>`,
        ),
    ) +
    sg(
      '백업 · 변경 이력',
      sv('서버 자동 백업', '매일 새벽 서버가 DB · 첨부를 백업 폴더에 저장합니다. 복원은 관리자가 서버에서 합니다.', '') +
        sv(
          '변경 이력',
          '누가 · 언제 · 무엇을 바꿨는지 모든 저장 · 삭제가 기록됩니다.',
          srvCanAdmin() ? btn('관리 화면 열기', "window.open('/admin','qisAdmin')", 'p') : '<span class="muted">관리자 화면에서 조회</span>',
        ),
    ) +
    sg(
      '공유 · 내보내기',
      sv(
        '읽기 전용 공유',
        '지금 데이터와 사진 · 첨부를 HTML 파일 하나로 만듭니다. 서버 밖으로 나가는 사본이니 받을 사람을 가려서 보내세요. 기준정보는 빼고 만듭니다. 사진이 많으면 파일이 큽니다.',
        btn('만들기 (사진 포함)', 'makeShareFile()'),
      ) +
        sv(
          'SQL로 조회 (QIS.sqlite)',
          'SQLite DB 파일로 내려받습니다 — DB Browser · Excel · Power BI(ODBC)에서 조회',
          btn('만들기 (내려받기)', 'exportSqlite()'),
        ),
    )
  );
}

async function bootData() {
  if (SHARE) {
    dataReady = true;
    return;
  }
  try {
    await srvBoot();
  } catch (e) {
    console.error(e);
    loadFailed = '서버에서 데이터를 받지 못했습니다 — ' + e.message;
  }
  dataReady = true;
}
const persist = () => (SHARE ? Promise.resolve() : srvPersist());
// 화면을 닫기 직전에 서버로 보내지 못한 내용이 있으면 확인
window.addEventListener('beforeunload', (e) => {
  if (SRV && srvUnsaved()) {
    e.preventDefault();
    e.returnValue = '';
  }
});
const bootReady = bootData().catch((e) => {
  console.error(e);
  dataReady = true;
});
function save() {
  if (RO) return; // 공유본 · 조회 권한은 저장하지 않음
  if (!dataReady) {
    console.warn('데이터를 가져오기 전 저장 요청 — 무시');
    return;
  }
  if (!undoBusy && undoSnap && !save._keep) hideUndo();
  if (loadFailed) {
    renderAlert();
    toast('데이터를 읽지 못해 저장을 멈췄습니다 — 위 빨간 안내를 확인하세요');
    return;
  }
  lockSev();
  db.meta.saved = now();
  db.meta.appVer = APP_VER;
  try {
    czSyncAll();
  } catch (e) {}
  persist();
  updateSaveInfo();
}
function renderAlert() {
  const b = $('#alertBar');
  if (!b) return;
  if (SHARE) {
    b.style.display = 'none';
    return;
  }
  if (loadFailed) {
    b.style.display = 'flex';
    b.innerHTML = `<span><b>${esc(loadFailed)}</b> 덮어쓰지 않도록 저장을 멈췄습니다. 서버가 켜져 있는지 확인한 뒤 다시 여세요.</span><span style="flex:1"></span><button class="b s p" onclick="location.reload()">다시 열기</button>`;
    return;
  }
  {
    if (srvState.expired) {
      b.style.display = 'flex';
      b.innerHTML = `<span><b>로그인이 만료되었습니다.</b> 아직 서버에 보내지 못한 변경은 이 창에 남아 있습니다 — 창을 닫지 말고 다시 로그인하세요. 로그인하면 자동으로 저장됩니다.</span><span style="flex:1"></span><button class="b s p" onclick="window.open('/login','qisLogin')">다시 로그인</button><button class="b s" onclick="srvState.expired=false;srvSync()">저장 다시 시도</button>`;
      return;
    }
    if (srvState.ok === false) {
      b.style.display = 'flex';
      b.innerHTML = `<span>⚠ <b>서버에 연결할 수 없습니다</b> (${esc(srvState.err)}). ${
        srvState.pend
          ? `저장하지 못한 변경 ${srvState.pend}건은 이 창에 남아 있고, 연결되면 자동으로 저장합니다 — <b>창을 닫지 마세요.</b>`
          : '연결되면 자동으로 다시 받아옵니다.'
      }</span><span style="flex:1"></span><button class="b s p" onclick="srvSync()">다시 시도</button>`;
      return;
    }
  }
  b.style.display = 'none';
}
function updateSaveInfo() {
  if (SHARE) {
    const e = $('#saveInfo');
    if (e) e.textContent = '읽기 전용 사본';
    return;
  }
  {
    const e = $('#saveInfo'),
      st = srvState,
      t = st.at;
    if (e)
      e.textContent = loadFailed
        ? '⚠ 서버 연결 실패'
        : st.expired
          ? '⚠ 로그인 만료'
          : st.ok === false
            ? '⚠ 서버 연결 끊김'
            : RO
              ? '조회 권한 · 읽기 전용'
              : (srvTimer || srvBusy) && st.pend
                ? '서버에 저장 중…'
                : t
                  ? `서버 저장 ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
                  : '';
    const l = $('#linkInfo');
    if (l) l.textContent = '';
  }
}
let actTimer = null;
// 알림 + 바로 하기 버튼 (예: 불량 저장 직후 NCR 발행)
function offerAction(msg, label, fn, ms = 12000) {
  const b = $('#actbar');
  if (!b) return;
  $('#actMsg').textContent = msg;
  const k = $('#actBtn');
  k.textContent = label;
  k.onclick = () => {
    hideAct();
    fn();
  };
  b.classList.add('on');
  clearTimeout(actTimer);
  actTimer = setTimeout(hideAct, ms);
}
function hideAct() {
  const b = $('#actbar');
  if (b) b.classList.remove('on');
  clearTimeout(actTimer);
}
function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('on'), 3200);
}
function touch(r) {
  r.updatedAt = now();
  if (!r.createdAt) r.createdAt = r.updatedAt;
  return r;
}
function removeRec(coll, id) {
  db[coll] = db[coll].filter((r) => r.id !== id);
  db.deleted.push({ id, at: now() });
}
const supById = (id) => db.suppliers.find((s) => s.id === id);
const supName = (id) => supById(id)?.name || '';
const COUNTRY = {
  KR: '한국',
  CN: '중국',
  JP: '일본',
  US: '미국',
  DE: '독일',
  MX: '멕시코',
  IN: '인도',
  VN: '베트남',
  CZ: '체코',
  SK: '슬로바키아',
  PL: '폴란드',
  HU: '헝가리',
  TR: '튀르키예',
  TH: '태국',
  BR: '브라질',
  FR: '프랑스',
  IT: '이탈리아',
  ES: '스페인',
  GB: '영국',
};
const countryRegion = (c) => {
  c = String(c || '')
    .trim()
    .toUpperCase();
  return !c ? '' : c === 'KR' ? '국내' : '국외';
};
const supCountry = (s) => (s && s.country ? `${s.country}${COUNTRY[s.country] ? ' ' + COUNTRY[s.country] : ''}` : '');
const partByNo = (no) => db.parts.find((p) => p.partNo === no);
function opts(arr, v, blank) {
  let a = [...arr];
  if (v && !a.includes(v)) a.push(v);
  return (blank ? '<option value=""></option>' : '') + a.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
}
function supOpts(v, blankLabel = '-') {
  return (
    `<option value="">${blankLabel}</option>` +
    [...db.suppliers]
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .map((s) => `<option value="${s.id}" ${s.id === v ? 'selected' : ''}>${esc(s.name)}${s.code ? ` (${esc(s.code)})` : ''}</option>`)
      .join('')
  );
}
function fmtShort(v) {
  if (v >= 1e8) return (v / 1e8).toFixed(1) + '억';
  if (v >= 1e4) return Math.round(v / 1e4).toLocaleString() + '만';
  if (v < 10 && v % 1) return v.toFixed(1);
  return Math.round(v).toLocaleString();
}
function lastMonths(m, n) {
  const [y, mo] = m.split('-').map(Number);
  const r = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, mo - 1 - i, 1);
    r.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return r;
}
function download(name, text, type = 'application/json') {
  const b = text instanceof Blob ? text : new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}
function csvCell(v) {
  v = String(v ?? '');
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
// 표 내려받기 — 이제 엑셀(.xlsx)로 만든다 (29-xlsx-export.js). 이름이 .csv 로 끝나도 .xlsx 로 바뀜. 진짜 CSV 가 필요하면 downloadCSVText
function downloadCSV(name, rows) {
  downloadXlsx(name, rows);
}
function downloadCSVText(name, rows) {
  download(name, '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
