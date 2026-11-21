/* ================= SQLite 파일 (QIS.sqlite) =================
   지금 데이터를 SQLite DB 파일 하나로 만듦 — DB Browser for SQLite · Excel/Power BI(ODBC)에서 SQL로 조회
   · 원본은 그대로 브라우저 저장소. 이 파일은 읽기용 사본 (백업 폴더가 있으면 자동 백업 때 같이 덮어씀)
   · 표마다 원래 항목 + 앱이 계산한 값(x_ 로 시작: 협력사명 · 심각도 등급 · 진행 상태 · 비용 합계 등)
   · SQLite 엔진(sql.js)은 앱과 같은 곳의 lib/ 에서, 없으면(파일로 연 경우) 인터넷(cdnjs)에서 처음 한 번 받음 */
const SQLJS_VER = '1.10.3';
let _SQL = null;
function loadScriptOnce(src) {
  return new Promise((res, rej) => {
    if (window.initSqlJs) return res();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => res();
    s.onerror = () => {
      s.remove();
      rej(new Error('가져오기 실패: ' + src));
    };
    document.head.appendChild(s);
  });
}
async function loadSql() {
  if (_SQL) return _SQL;
  const bases = [...(/^https?:$/.test(location.protocol) ? ['lib/'] : []), `https://cdnjs.cloudflare.com/ajax/libs/sql.js/${SQLJS_VER}/`];
  let last;
  for (const b of bases) {
    try {
      await loadScriptOnce(b + 'sql-wasm.js');
      _SQL = await window.initSqlJs({ locateFile: (f) => b + f });
      return _SQL;
    } catch (e) {
      last = e;
      try {
        delete window.initSqlJs;
      } catch (_) {}
    }
  }
  throw new Error('SQLite 엔진을 불러오지 못했습니다 — 처음 한 번은 인터넷 연결이 필요합니다 (' + ((last && last.message) || '') + ')');
}
const sqlId = (k) =>
  '"' +
  String(k)
    .replace(/[^A-Za-z0-9_가-힣]/g, '_')
    .replace(/"/g, '') +
  '"';
const sqlVal = (v) =>
  v == null || v === ''
    ? null
    : typeof v === 'boolean'
      ? v
        ? 1
        : 0
      : typeof v === 'number'
        ? isFinite(v)
          ? v
          : null
        : typeof v === 'object'
          ? JSON.stringify(v)
          : String(v);
// 레코드 목록 → 표 (열 = 모든 레코드의 항목 합집합, 숫자뿐이면 REAL, 배열 · 객체는 JSON 글자)
function sqlTable(sdb, name, rows, first) {
  const cols = [...new Set([...(first || []), ...rows.flatMap((r) => Object.keys(r))])].filter((k) => !k.startsWith('_'));
  if (!cols.length) cols.push('id');
  const typ = (k) => {
    let num = 0,
      oth = 0;
    rows.forEach((r) => {
      const v = r[k];
      if (v == null || v === '') return;
      typeof v === 'number' || typeof v === 'boolean' ? num++ : oth++;
    });
    return num && !oth ? 'REAL' : 'TEXT';
  };
  sdb.run(
    `CREATE TABLE ${sqlId(name)} (${cols
      .map(
        (k) =>
          `${sqlId(k)} ${typ(k)}${
            k === 'id' && rows.every((r) => r.id) && new Set(rows.map((r) => r.id)).size === rows.length ? ' PRIMARY KEY' : ''
          }`,
      )
      .join(', ')})`,
  );
  if (!rows.length) return 0;
  const st = sdb.prepare(`INSERT INTO ${sqlId(name)} (${cols.map(sqlId).join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
  rows.forEach((r) => st.run(cols.map((k) => sqlVal(r[k]))));
  st.free();
  return rows.length;
}
async function buildSqlite() {
  const SQL = await loadSql(),
    sdb = new SQL.Database(),
    n = {};
  const omit = (o, ks) => {
    const c = { ...o };
    ks.forEach((k) => delete c[k]);
    return c;
  };
  const sup = (id) => supById(id),
    costSum = (d) => (d.costs || []).reduce((a, c) => a + num(c.amt), 0);
  sdb.run('BEGIN');
  n.suppliers = sqlTable(
    sdb,
    'suppliers',
    db.suppliers.map((s) => {
      const p = primaryOf(s);
      return {
        ...omit(s, ['contacts', 'contactLog']),
        x_contact: p ? p.name : '',
        x_phone: p ? p.mobile || p.phone : '',
        x_email: p ? p.email : '',
        x_parts: db.parts.filter((q) => q.supplierId === s.id).length,
      };
    }),
    ['id', 'code', 'name'],
  );
  n.supplier_contacts = sqlTable(
    sdb,
    'supplier_contacts',
    db.suppliers.flatMap((s) => (s.contacts || []).map((c) => ({ supplier_id: s.id, x_supplier: s.name, ...c }))),
    ['supplier_id', 'x_supplier'],
  );
  n.supplier_contact_log = sqlTable(
    sdb,
    'supplier_contact_log',
    db.suppliers.flatMap((s) => (s.contactLog || []).map((c) => ({ supplier_id: s.id, x_supplier: s.name, ...c }))),
    ['supplier_id', 'x_supplier'],
  );
  n.parts = sqlTable(
    sdb,
    'parts',
    db.parts.map((p) => ({
      ...p,
      x_supplier: sup(p.supplierId)?.name || '',
      x_supplier_code: sup(p.supplierId)?.code || '',
      x_currency: curOf(p),
      x_price_krw: p.price === '' || p.price == null ? null : partKRW(p),
      x_bom_products: bomPartUse(p).fgs.size,
      x_is_bom_product: bomPartUse(p).fg ? 1 : 0,
    })),
    ['id', 'partNo', 'name', 'model'],
  );
  n.defects = sqlTable(
    sdb,
    'defects',
    db.defects.map((d) => {
      const v = sevOf(d),
        st = defStage(d),
        nc = d.ncrId ? db.ncrs.find((x) => x.id === d.ncrId) : null;
      return {
        ...omit(d, ['costs', 'photos', 'sevLock']),
        x_month: (d.date || '').slice(0, 7),
        x_supplier: sup(d.supplierId)?.name || '',
        x_supplier_code: sup(d.supplierId)?.code || '',
        x_grade: v.grade,
        x_score: v.score,
        x_stage: st.label,
        x_done: st.done ? 1 : 0,
        x_ncr_no: nc ? nc.no : '',
        x_ncr_status: nc ? ncrStatus(nc) : '',
        x_cost_total: costSum(d),
        x_photos: (d.photos || []).length,
        x_ppm_lot: num(d.inspQty) ? (num(d.qty) / num(d.inspQty)) * 1e6 : null,
      };
    }),
    ['id', 'date', 'source', 'partNo', 'partName', 'qty', 'inspQty'],
  );
  n.defect_costs = sqlTable(
    sdb,
    'defect_costs',
    db.defects.flatMap((d) => (d.costs || []).map((c, i) => ({ defect_id: d.id, seq: i + 1, ...c }))),
    ['defect_id', 'seq'],
  );
  n.defect_photos = sqlTable(
    sdb,
    'defect_photos',
    db.defects.flatMap((d) =>
      (d.photos || []).map((p, i) => ({ defect_id: d.id, seq: i + 1, photo_id: typeof p === 'string' ? p : (p && p.id) || '' })),
    ),
    ['defect_id', 'seq', 'photo_id'],
  );
  n.ncrs = sqlTable(
    sdb,
    'ncrs',
    db.ncrs.map((x) => ({
      ...x,
      x_status: ncrStatus(x),
      x_supplier: sup(x.supplierId)?.name || '',
      x_supplier_code: sup(x.supplierId)?.code || '',
      x_month: (x.issueDate || '').slice(0, 7),
      x_defects: (x.defectIds || []).length,
      x_eval_score: x.evalScore ?? null,
    })),
    ['id', 'no', 'issueDate', 'reqType'],
  );
  n.receipts = sqlTable(
    sdb,
    'receipts',
    db.receipts.map((r) => ({ ...r, x_supplier: sup(r.supplierId)?.name || '', x_supplier_code: sup(r.supplierId)?.code || '' })),
    ['id', 'kind', 'month', 'date', 'supplierId', 'partNo', 'qty'],
  );
  n.rca_cases = sqlTable(sdb, 'rca_cases', db.cases || [], ['id', 'CaseNo', 'Title', 'Stage']);
  n.rca_actions = sqlTable(sdb, 'rca_actions', db.actions || [], ['id', 'CaseId', 'Title', 'ActionStatus']);
  n.reviews = sqlTable(sdb, 'reviews', db.reviews || []);
  n.bom_products = sqlTable(
    sdb,
    'bom_products',
    [...bomIx().byFg.keys()].map((f) => ({ fgNo: f, ...bomFg(f), x_rows: (bomIx().byFg.get(f) || []).length })),
    ['fgNo', 'name', 'model'],
  );
  n.bom_rows = sqlTable(
    sdb,
    'bom_rows',
    db.bom.rows.map((r) => ({ ...r, x_total_qty: bTot(r), x_level: bomLv(r) })),
    ['fgNo', 'seq', 'level', 'partNo', 'partName', 'parentNo', 'qty'],
  );
  // 협력사 × 월: 불량수량(협력사 · 공동 귀책) · 입고수량 · PPM — 앱의 협력사 품질 화면과 같은 규칙
  const sm = [];
  db.suppliers.forEach((s) => {
    const my = db.defects.filter((d) => d.supplierId === s.id && ppmCounts(d));
    const ms = new Set(
      [...my.map((d) => (d.date || '').slice(0, 7)), ...db.receipts.filter((r) => r.supplierId === s.id).map((r) => r.month)].filter(Boolean),
    );
    [...ms].sort().forEach((m) => {
      const dq = my.filter((d) => (d.date || '').startsWith(m)),
        q = dq.reduce((a, d) => a + ppmQty(d), 0),
        rc = rcvSum(s.id, m);
      sm.push({
        supplier_id: s.id,
        supplier: s.name,
        supplier_code: s.code || '',
        month: m,
        defect_count: dq.length,
        defect_qty: q,
        receipt_qty: rc,
        ppm: rc ? (q / rc) * 1e6 : null,
        ncr_count: db.ncrs.filter((x) => x.supplierId === s.id && (x.issueDate || '').startsWith(m)).length,
      });
    });
  });
  n.supplier_month = sqlTable(sdb, 'supplier_month', sm);
  sdb.run(`CREATE TABLE "settings" ("key" TEXT PRIMARY KEY, "value" TEXT)`);
  {
    const st = sdb.prepare('INSERT INTO settings VALUES (?,?)');
    Object.entries(db.settings).forEach(([k, v]) => {
      if (k === 'logo' || k === 'signs') return;
      st.run([k, sqlVal(v)]);
    });
    st.free();
  }
  sdb.run(`CREATE TABLE "about" ("key" TEXT PRIMARY KEY, "value" TEXT)`);
  [
    ['app', 'QIS'],
    ['app_version', APP_VER],
    ['exported_at', now()],
    ['note', 'QIS 데이터의 읽기용 사본. x_ 로 시작하는 열은 앱이 계산한 값. 수정해도 앱에는 반영되지 않음'],
  ].forEach((r) => sdb.run('INSERT INTO about VALUES (?,?)', r));
  // 자주 쓰는 조회 — 데이터에 있는 열만 써서 만듦 (없는 항목은 빈 값)
  const colsOf = (t) => new Set(sdb.exec(`PRAGMA table_info(${sqlId(t)})`)[0]?.values.map((v) => v[1]) || []);
  const mkView = (name, t, F, tail = '') => {
    const C = colsOf(t);
    sdb.run(
      `CREATE VIEW ${name} AS SELECT ${F.map(([c, a, e]) => `${C.has(c) ? e || sqlId(c) : 'NULL'} AS ${sqlId(a || c)}`).join(
        ', ',
      )} FROM ${sqlId(t)} ${tail}`,
    );
  };
  mkView('v_defects', 'defects', [
    ['date'],
    ['x_month', 'month'],
    ['source'],
    ['partNo'],
    ['partName'],
    ['model'],
    ['x_supplier', 'supplier'],
    ['type'],
    ['qty'],
    ['inspQty', 'lot_qty'],
    ['x_grade', 'grade'],
    ['resp'],
    ['disposition'],
    ['x_stage', 'stage'],
    ['x_ncr_no', 'ncr_no'],
    ['x_ncr_status', 'ncr_status'],
    ['x_cost_total', 'cost'],
    ['spec'],
    ['actual'],
    ['desc'],
  ]);
  mkView(
    'v_ncr_open',
    'ncrs',
    [
      ['no'],
      ['issueDate'],
      ['x_supplier', 'supplier'],
      ['partNo'],
      ['partName'],
      ['reqType'],
      ['x_status', 'status'],
      ['dueDate'],
      ['replyDate'],
      ['verifyDue'],
    ],
    `WHERE ${colsOf('ncrs').has('x_status') ? '"x_status"' : "''"} <> '종결'`,
  );
  {
    const C = colsOf('defects');
    if (C.has('x_month'))
      sdb.run(
        `CREATE VIEW v_monthly AS SELECT x_month AS month, COUNT(*) AS defects, ${C.has('qty') ? 'SUM(qty)' : '0'} AS qty, SUM(x_cost_total) AS cost, SUM(x_grade='A') AS grade_a FROM defects GROUP BY x_month`,
      );
  }
  sdb.run('COMMIT');
  const out = sdb.export();
  sdb.close();
  return { bytes: out, n };
}
let sqliteBusy = false;
// QIS.sqlite 내려받기 (SQL 조회용 사본)
async function exportSqlite() {
  if (RO || sqliteBusy) return;
  sqliteBusy = true;
  try {
    toast('SQLite 파일을 만드는 중…');
    const { bytes, n } = await buildSqlite(),
      blob = new Blob([bytes], { type: 'application/vnd.sqlite3' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'QIS.sqlite';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    const where = '내려받기한 QIS.sqlite';
    db.meta.lastSqlite = now();
    db.meta.lastSqliteN = n;
    save();
    toast(`${where} — 불량 ${n.defects} · NCR ${n.ncrs} · 부품 ${n.parts} · 입고 ${n.receipts} (${(bytes.length / 1048576).toFixed(1)}MB)`);
    if (state.tab === 'data') render();
  } catch (e) {
    console.error(e);
    toast('SQLite 만들기 실패: ' + e.message);
  } finally {
    sqliteBusy = false;
  }
}
/* ---- 사진 · 첨부 폴더 (이 PC에서 지정한 폴더) ----
   이 PC의 IndexedDB는 화면 표시용 사본이고, 사진 본체는 폴더의 파일로 옮겨 QMS_data.json에는 사진 정보만 남긴다.
   다른 PC에서 아직 받지 못한 사진은 고정된 회색 자리표시 이미지(PH_IMG)로 두었다가 파일이 도착하면 바꾼다. */
const PH_IMG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAkCAIAAABAJy5dAAAANElEQVR42u3OQQkAAAgEsOvf0I9Pc1hDYbAAS/WcEiEhISEhISEhISEhISEhISEhIaFPoQXCU6TAPfWPWAAAAABJRU5ErkJggg==';
const phIsPending = (p) => !p || p.data === PH_IMG || (isDocRec(p) ? !isFileURL(p.data) : !isImgURL(p.data));
/* 사진 파일 이름: <NCR번호>_<YYYYMMDD>_<연번>.jpg  (NCR 발행 전: 미발행_<품번>_…, 날짜 = 사진 첨부일)
   NCR이 발행되거나 번호가 바뀌면 다음 동기화 때 새 이름으로 바꾼다 */
const fileToURL = (f) =>
  new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(f);
  });
function photoBadge(d) {
  const n = (d.photos || []).length;
  return n
    ? `<a class="bg inf" style="cursor:pointer" onclick="viewDefectPhotos('${d.id}')" title="사진 보기"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.2"/></svg> ${n}</a>`
    : '';
}
let curPhotos = [],
  curRemoved = [];
function initPhotoBox(ids) {
  curPhotos = [];
  curRemoved = [];
  const box = $('#photoBox');
  if (!box) return;
  box.addEventListener('dragover', (e) => {
    e.preventDefault();
    box.classList.add('drag');
  });
  box.addEventListener('dragleave', () => box.classList.remove('drag'));
  box.addEventListener('drop', (e) => {
    e.preventDefault();
    box.classList.remove('drag');
    addPhotoFiles([...e.dataTransfer.files]);
  });
  renderPhotoBox();
  if (ids.length) {
    box.insertAdjacentHTML('afterbegin', '<div class="muted" id="phLoading">사진 불러오는 중…</div>');
    photoGetMany(ids)
      .then((rs) => {
        curPhotos = [...rs.map((r) => ({ ...r, isNew: false })), ...curPhotos.filter((p) => p.isNew)];
        renderPhotoBox();
      })
      .catch((e) => {
        toast('사진 가져오기 실패: ' + e.message);
        renderPhotoBox();
      });
  }
}
function renderPhotoBox() {
  const b = $('#photoBox');
  if (!b) return;
  b.innerHTML =
    curPhotos
      .map(
        (p, i) =>
          `<div class="ph"><img src="${p.thumb || p.data}" onclick="lbOpen(curPhotos,${i})" title="크게 보기"><input placeholder="설명 (예: 불량부위, 라벨)" value="${esc(p.caption)}" oninput="curPhotos[${i}].caption=this.value;curPhotos[${i}].dirty=true"><button type="button" class="b s d" onclick="removePhoto(${i})">삭제</button></div>`,
      )
      .join('') +
    `<label class="ph add">＋ 사진 추가<span class="muted">클릭 · 끌어놓기<br>Ctrl+V 붙여넣기</span><input type="file" accept="image/*" multiple style="display:none" onchange="addPhotoFiles([...this.files]);this.value=''"></label>`;
}
async function removePhoto(i) {
  const p = curPhotos[i];
  if (!p) return;
  if (
    !(await askConfirm({
      title: '사진을 삭제할까요?',
      msg: `<div style="display:flex;gap:10px;align-items:center"><img src="${p.thumb || p.data}" style="width:90px;height:64px;object-fit:cover;border-radius:4px"><span>${esc(p.caption || p.name || '')}</span></div>`,
      note: p.isNew ? '' : '불량 창에서 <b>저장</b>을 눌러야 최종 삭제됩니다. 취소하면 사진이 유지됩니다.',
    }))
  )
    return;
  if (!p.isNew) curRemoved.push(p.id);
  curPhotos.splice(i, 1);
  mfDirty = true;
  renderPhotoBox();
}
function readImg(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error(`'${file.name}'을(를) 열 수 없습니다 (HEIC 등은 JPG로 변환 후 첨부)`));
      im.src = fr.result;
    };
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
}
function shrink(im, max, q) {
  const sc = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(im.naturalWidth * sc));
  c.height = Math.max(1, Math.round(im.naturalHeight * sc));
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
async function addPhotoFiles(files) {
  const imgs = files.filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) {
    if (files.length) toast('이미지 파일만 첨부할 수 있습니다');
    return;
  }
  mfDirty = true;
  for (const f of imgs) {
    try {
      curPhotos.push(await attImgRec(f));
    } catch (e) {
      toast(e.message);
    }
  }
  renderPhotoBox();
}
async function viewDefectPhotos(id) {
  const d = db.defects.find((x) => x.id === id);
  if (!d) return;
  try {
    const rs = await photoGetMany(d.photos);
    if (!rs.length) {
      toast('저장된 사진을 찾을 수 없습니다');
      return;
    }
    lbOpen(
      rs.map((r) => ({ ...r, caption: `${d.date} ${d.partName || d.partNo} · ${r.caption || ''}` })),
      0,
    );
  } catch (e) {
    toast('사진 가져오기 실패: ' + e.message);
  }
}
let lbList = [],
  lbIdx = 0;
function lbOpen(list, i) {
  lbList = list;
  lbIdx = i;
  lbShow();
  $('#lb').classList.add('on');
}
function lbShow() {
  const p = lbList[lbIdx];
  if (!p) return;
  $('#lbimg').src = p.data || p.thumb;
  $('#lbcap').textContent = `${lbIdx + 1} / ${lbList.length}  ${p.caption || ''}`;
  const a = $('#lbdl');
  a.href = p.data || p.thumb;
  // 저장 이름의 확장자는 내용의 형식에 맞춤 (줄인 그림은 JPG · 예전 사진은 PNG 일 수 있음)
  const m = /^data:image\/([a-z0-9.+-]+)/i.exec(a.href),
    ext = { jpeg: 'jpg', 'svg+xml': 'svg' }[m ? m[1].toLowerCase() : 'jpeg'] || (m ? m[1].toLowerCase() : 'jpg');
  a.download = (p.name || 'photo').replace(/\.[^.]+$/, '') + '.' + ext;
}
function lbMove(k) {
  if (!lbList.length) return;
  lbIdx = (lbIdx + k + lbList.length) % lbList.length;
  lbShow();
}
function closeLb() {
  $('#lb').classList.remove('on');
  $('#lbimg').src = '';
}
document.addEventListener('paste', (e) => {
  const lb = $('#logBox');
  if (lb && $('#modal').classList.contains('on') && lb.contains(document.activeElement)) {
    const fs = [...(e.clipboardData?.files || [])];
    if (fs.length) {
      e.preventDefault();
      lgAddFiles(fs, tl.edit != null ? 'edit' : undefined).then((n) => {
        if (n) toast(`증빙 ${n}개 첨부`);
      });
    }
    return;
  }
  if (!$('#photoBox') || !$('#modal').classList.contains('on')) return;
  const fs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (fs.length) {
    e.preventDefault();
    addPhotoFiles(fs);
    toast(`사진 ${fs.length}장 붙여넣음`);
  }
});
function oneLineLabels(root) {
  (root || document).querySelectorAll('.fg>label:not(.full):not(.row)').forEach((l) => {
    if (l.querySelector(':scope>.lt')) return;
    const lead = [];
    for (const n of [...l.childNodes]) {
      if (n.nodeType === 1 && (n.matches('input,select,textarea,button,div') || n.querySelector('input,select,textarea,button'))) break;
      lead.push(n);
    }
    if (!lead.some((n) => n.nodeType === 1 || n.textContent.trim())) return;
    const w = document.createElement('span');
    w.className = 'lt';
    l.insertBefore(w, lead[0]);
    lead.forEach((n) => w.appendChild(n));
    const t = w.textContent.replace(/\s+/g, ' ').trim();
    if (t) w.title = t;
  });
}
{
  let q = 0;
  new MutationObserver(() => {
    if (q) return;
    q = requestAnimationFrame(() => {
      q = 0;
      oneLineLabels();
    });
  }).observe(document.body, { childList: true, subtree: true });
}
