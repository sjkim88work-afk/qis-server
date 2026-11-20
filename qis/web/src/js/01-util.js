/* ================= 기본 유틸 ================= */
const KEY = 'personalQMS_v1';
const COLLS = ['suppliers', 'parts', 'defects', 'ncrs', 'receipts', 'reviews', 'cases', 'actions', 'issues'];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nl = (s) => esc(s).replace(/\n/g, '<br>');
const deb = (fn, ms = 200) => {
  clearTimeout(deb._t);
  deb._t = setTimeout(() => {
    const own = !sevMemo;
    if (own) sevMemo = new Map();
    try {
      fn();
    } finally {
      if (own) sevMemo = null;
    }
  }, ms);
};
const isFileURL = (u) => typeof u === 'string' && /^data:[\w.+-]+\/[\w.+-]+(;[^,;]*)*;base64,[A-Za-z0-9+/=\s]+$/.test(u);
const isDocRec = (p) => !!p && p.kind === 'doc';
const isImgURL = (u) => typeof u === 'string' && /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[A-Za-z0-9+/=\s]+$/.test(u);
const jsq = (s) => esc(JSON.stringify(String(s ?? '')));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const now = () => new Date().toISOString();
const pad = (n) => String(n).padStart(2, '0');
const fmtD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => fmtD(new Date());
// ISO(UTC) 시각 → 이 PC 기준 로컬 표시
const loc = (iso, len = 16) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, len).replace('T', ' ');
  return (fmtD(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())).slice(0, len);
};
const addDays = (s, n) => {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + Number(n));
  return fmtD(d);
};
const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
const num = (v) => Number(v) || 0;
const won = (n) => Math.round(n || 0).toLocaleString('ko-KR');
/* ---- 통화: 부품 단가는 협력사 통화 그대로 저장하고, 비용(COPQ)은 설정의 환율로 원화 환산 ---- */
const CURS = ['KRW', 'USD', 'EUR', 'CNY', 'JPY', 'MXN', 'INR', 'VND'];
const CUR_L = {
  KRW: '원 (KRW)',
  USD: '미국 달러 (USD)',
  EUR: '유로 (EUR)',
  CNY: '중국 위안 (CNY)',
  JPY: '일본 엔 (JPY)',
  MXN: '멕시코 페소 (MXN)',
  INR: '인도 루피 (INR)',
  VND: '베트남 동 (VND)',
};
const curOf = (p) => (p && p.currency) || 'KRW';
const fxRate = (c) => (!c || c === 'KRW' ? 1 : num((db.settings.fx || {})[c]));
const partKRW = (p) => {
  if (!p || p.price === '' || p.price == null) return 0;
  return Math.round(num(p.price) * fxRate(curOf(p)) * 100) / 100;
};
const fmtAmt = (v, c) => {
  c = c || 'KRW';
  if (v === '' || v == null) return '';
  const n = num(v);
  return c === 'KRW' ? won(n) + '원' : n.toLocaleString('ko-KR', { maximumFractionDigits: 4 }) + ' ' + c;
};
const fmtPrice = (p) => (p && p.price !== '' && p.price != null ? fmtAmt(p.price, curOf(p)) : '');
const sum = (arr, k) => arr.reduce((a, r) => a + num(typeof k === 'function' ? k(r) : r[k]), 0);
/* ---- 비용 내역 · 구상 ---- */
const COST_CATS = ['선별', '재작업', '폐기', '물류/운송', '고객클레임', '기타'];
const LEGACY_COST = [
  ['c_sort', '선별'],
  ['c_rework', '재작업'],
  ['c_scrap', '폐기'],
  ['c_logistics', '물류/운송'],
  ['c_claim', '고객클레임'],
  ['c_other', '기타'],
];
const costTotal = (d) => (d.costs || []).reduce((a, c) => a + num(c.amt), 0);
const costsIn = (d, pre) => (d.costs || []).filter((c) => (c.date || d.date || '').startsWith(pre));
const costSumIn = (d, pre) => costsIn(d, pre).reduce((a, c) => a + num(c.amt), 0);
const costCatIn = (d, pre, cat) =>
  costsIn(d, pre)
    .filter((c) => c.cat === cat)
    .reduce((a, c) => a + num(c.amt), 0);
const CLAIM_CLS = { 청구: 'inf', 합의: 'inf', 이의: 'warn', 일부회수: 'warn', 회수완료: 'ok', 포기: 'mut' };
function claimStatus(d) {
  const c = d.claim;
  if (!c) return '';
  if (c.waive) return '포기';
  const rq = num(c.reqAmt),
    ag = num(c.agreeAmt),
    rv = num(c.recvAmt),
    tgt = ag || rq;
  if (rv > 0 && (!tgt || rv >= tgt)) return '회수완료';
  if (rv > 0) return '일부회수';
  if (c.dispute) return '이의';
  if (ag) return '합의';
  if (rq) return '청구';
  return '';
}
const recvOf = (d) => num(d.claim?.recvAmt);
const recvDateOf = (d) => d.claim?.recvDate || d.claim?.agreeDate || d.claim?.reqDate || d.date || '';
const recvIn = (d, pre) => (recvDateOf(d).startsWith(pre) ? recvOf(d) : 0);
function outstanding(d) {
  const st = claimStatus(d);
  if (!['청구', '합의', '이의', '일부회수'].includes(st)) return 0;
  const c = d.claim;
  return Math.max(0, (num(c.agreeAmt) || num(c.reqAmt)) - num(c.recvAmt));
}
const allCostIn = (pre) => db.defects.reduce((a, d) => a + costSumIn(d, pre), 0);
const allRecvIn = (pre) => db.defects.reduce((a, d) => a + recvIn(d, pre), 0);
const costRange = (d, f, t) =>
  (d.costs || [])
    .filter((c) => {
      const x = c.date || d.date || '';
      return x >= f && x <= t;
    })
    .reduce((a, c) => a + num(c.amt), 0);
const recvRange = (d, f, t) => {
  const x = recvDateOf(d);
  return x >= f && x <= t ? recvOf(d) : 0;
};
const needCost = (d) => isDone(d) && !(d.costs || []).length && !d.noCost;
const shareOf = (d) => (d.resp === '공동' ? Math.max(0, Math.min(100, num(d.inv?.share))) / 100 : 1);
const needClaim = (d) => (d.resp === '협력사' || (d.resp === '공동' && shareOf(d) > 0)) && costTotal(d) > 0 && !claimStatus(d);
function migrateCosts(x) {
  if (!Array.isArray(x.costs)) {
    x.costs = [];
    LEGACY_COST.forEach(([k, cat]) => {
      const v = num(x[k]);
      if (v > 0)
        x.costs.push({
          id: uid(),
          date: x.date || '',
          cat,
          amt: v,
          basis: (k === 'c_sort' || k === 'c_rework') && num(x.hours) ? `${x.hours}h × 인건비` : '',
          memo: '이전 입력분',
        });
    });
  }
  LEGACY_COST.forEach(([k]) => delete x[k]);
  if (!x.claim && num(x.recovered) > 0)
    x.claim = {
      reqDate: x.date || '',
      reqAmt: num(x.recovered),
      recvDate: x.date || '',
      recvAmt: num(x.recovered),
      method: '입금',
      memo: '이전 입력분',
    };
  delete x.recovered;
}
const isExt = (d) => stageOf(d.source) === 4;
const D8 = [
  ['d1', 'D1 팀 구성'],
  ['d2', 'D2 문제 기술 (5W2H)'],
  ['d3', 'D3 임시조치 (봉쇄)'],
  ['d4', 'D4 근본원인 (발생원인 / 유출원인)'],
  ['d5', 'D5 영구대책 선정'],
  ['d6', 'D6 영구대책 실행 및 효과 확인'],
  ['d7', 'D7 재발방지 (표준화 · FMEA/CP 반영)'],
  ['d8', 'D8 종결 및 팀 치하'],
];

function defaultDB() {
  return {
    meta: { version: 1, created: now(), saved: null, lastBackup: null },
    settings: {
      defectTypes: [
        '치수',
        '외관(스크래치)',
        '외관(찍힘/변형)',
        '이물',
        '녹/부식',
        '기능불량',
        '소음/NVH',
        '오삽/혼입',
        '누락/결품',
        '포장불량',
        '기타',
      ],
      sources: ['수입검사', '공정', '출하검사', '고객(클레임)'],
      dispositions: ['반품', '선별', '재작업', '특채', '폐기'],
      owners: [],
      ncrRepeat: 3,
      ncrQty: 50,
      repeatWindow: 90,
      requestDays: 2,
      replyDays: 7,
      verifyDays: 21,
      approveDays: 3,
      rcaT3: 45,
      rcaT2: 30,
      rcaT1: 20,
      rcaT0: 10,
      verifyLots: 3,
      backupDays: 7,
      sqliteAuto: 1,
      shareNoMaster: 1,
      farDays: 5,
      ntfDays: 30,
      laborRate: 30000,
      fx: { USD: 1400, EUR: 1610, CNY: 195, JPY: 9.3, MXN: 75, INR: 16.5, VND: 0.055 },
      fxDate: '',
      gradeA: 100,
      gradeB: 500,
      gradeC: 1000,
      photoMax: 1600,
      photoQ: 80,
      backupKeep: 30,
      backupPhotos: 1,
      company: '',
      dept: '',
      logo: '',
      ncrFormat: 'NCR-{YY}{MM}-{SEQ3}',
      issuerPhone: '',
      issuerEmail: '',
      approver: '',
      signs: {},
      evalPass: 80,
      evalCond: 60,
      sevA: 12,
      sevB: 8,
      reply8D: 7,
      replySimple: 5,
      d3Days: 1,
      escCount: 2,
      ppmScar: 1000,
      ppmScarMonths: 3,
      impactMap: {
        치수: 3,
        '외관(스크래치)': 1,
        '외관(찍힘/변형)': 2,
        이물: 2,
        '녹/부식': 2,
        기능불량: 3,
        '소음/NVH': 3,
        '오삽/혼입': 3,
        '누락/결품': 3,
        포장불량: 1,
        기타: 2,
      },
    },
    suppliers: [],
    parts: [],
    defects: [],
    ncrs: [],
    receipts: [],
    reviews: [],
    cases: [],
    actions: [],
    issues: [],
    deleted: [],
    bom: { updatedAt: '', rows: [] },
  };
}
function migrate(d) {
  const def = defaultDB();
  d = d || {};
  d.meta = { ...def.meta, ...(d.meta || {}) };
  if (!d.bom || !Array.isArray(d.bom.rows)) d.bom = { updatedAt: '', rows: [] };
  if (!d.bom.fg || typeof d.bom.fg !== 'object' || Array.isArray(d.bom.fg)) d.bom.fg = {};
  d.settings = { ...def.settings, ...(d.settings && typeof d.settings === 'object' ? d.settings : {}) };
  Object.keys(def.settings).forEach((k) => {
    const dv = def.settings[k],
      v = d.settings[k];
    if (Array.isArray(dv)) {
      if (!Array.isArray(v)) d.settings[k] = dv;
      else d.settings[k] = v.filter((x) => x != null && x !== '').map(String);
    } else if (dv && typeof dv === 'object') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) d.settings[k] = dv;
    } else if (typeof dv === 'number' && (v === '' || v == null || !isFinite(Number(v)))) d.settings[k] = dv;
  });
  COLLS.forEach((c) => {
    d[c] = Array.isArray(d[c]) ? d[c].filter((r) => r && typeof r === 'object' && !Array.isArray(r)) : [];
    d[c].forEach((r) => {
      if (!r.id) r.id = uid();
    });
  });
  d.deleted = Array.isArray(d.deleted) ? d.deleted.filter((t) => t && t.id) : [];
  if (d.settings.logo && !isImgURL(d.settings.logo)) d.settings.logo = '';
  Object.keys(d.settings.signs).forEach((k) => {
    if (!isImgURL(d.settings.signs[k])) delete d.settings.signs[k];
  });
  d.suppliers.forEach(ensureContacts);
  // 이름이 '코드: 이름'으로 잘못 들어간 협력사 → 같은 코드 협력사로 합치거나, 코드와 이름으로 나눔
  {
    const rx = /^\[?([A-Za-z0-9-]{2,})\]?\s*[:：]\s*(.+)$/,
      drop = new Map();
    d.suppliers.forEach((s) => {
      const m =
        !s.code &&
        String(s.name || '')
          .trim()
          .match(rx);
      if (!m) return;
      const real = d.suppliers.find((x) => x !== s && x.code && String(x.code) === m[1]);
      if (real) drop.set(s.id, real.id);
      else {
        s.code = m[1];
        s.name = m[2].trim();
      }
    });
    if (drop.size) {
      const fix = (o) => {
        ['supplierId', 'SupplierId', 'causeSupplierId'].forEach((k) => {
          if (o && drop.has(o[k])) o[k] = drop.get(o[k]);
        });
      };
      COLLS.forEach((c) => (d[c] || []).forEach(fix));
      d.suppliers = d.suppliers.filter((s) => !drop.has(s.id));
      drop.forEach((_, id) => d.deleted.push({ id, at: new Date().toISOString() }));
    }
  }
  d.ncrs.forEach((n) => {
    if (n.reqType === '통보만 (회신 불요)') n.reqType = '단순 통보';
    if (!('notifyDate' in n)) n.notifyDate = n.requestDate || n.issueDate || '';
    if (n.reqType !== '단순 통보' && !n.requestDate && n.issueDate && !n.replyDate && !n.verifyDate) {
      n.requestDate = n.issueDate;
      if (!n.dueDate) n.dueDate = addDays(n.issueDate, typeDays(n.reqType, d.settings));
    }
  });
  d.defects.forEach((x) => {
    if (!x.delivDate && x.lot && /^(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}|20\d{6})$/.test(String(x.lot).trim())) {
      const p = parseDateAny(String(x.lot).trim());
      if (p) x.delivDate = p;
    }
    if (!Array.isArray(x.photos)) x.photos = [];
    migrateCosts(x);
  });
  // 이전 통합본(원인 부품 칸 · 불량 FAR · 귀책 확정 기록) → 발견 품목 + 원인 품번 · 귀책 조사 구조로
  d.defects.forEach((x) => {
    if (x.causePartNo) {
      if (!x.fgNo && !x.fgName) {
        x.fgNo = x.partNo || '';
        x.fgName = x.partName || '';
      }
      x.partNo = x.causePartNo;
      x.partName = x.causePartName || '';
      x.supplierId = x.causeSupplierId || x.supplierId || '';
    }
    delete x.causePartNo;
    delete x.causePartName;
    delete x.causeSupplierId;
    if (x.far && x.far.reqDate) {
      const f = x.far,
        iv = (x.inv = x.inv || {});
      iv.farReq = iv.farReq || f.reqDate;
      iv.farDue = iv.farDue || f.due || '';
      iv.farRecv = iv.farRecv || f.replyDate || '';
      iv.sample = iv.sample || [f.sampleQty, f.shipRef].filter(Boolean).join(' · ');
      iv.farResult = iv.farResult || [f.verdict, f.summary].filter(Boolean).join(' — ');
    }
    delete x.far;
    const h = (x.respHist || []).slice(-1)[0];
    if (h && !(x.inv && x.inv.verdict)) {
      const iv = (x.inv = x.inv || {});
      iv.verdict = { 협력사: '협력사', 사내: '사내', 공동: '공동' }[h.to] || '';
      if (iv.verdict) {
        iv.verdictDate = h.date;
        iv.basis = h.basis;
      }
    }
  });
  return d;
}
/* ---- 협력사 연락처 ---- */
const ROLES = ['품질 담당', '품질 팀장', '영업 담당', 'SCM · 물류', '생산/공장장', '개발 담당', '대표', '기타'];
// 부서명으로 역할 추정 (가져오기용)
const roleOfDept = (d) => {
  d = String(d || '').toLowerCase();
  if (!d) return '품질 담당';
  if (/품질|quality|^qa|^qc|sqe/.test(d)) return /팀장|manager|head/.test(d) ? '품질 팀장' : '품질 담당';
  if (/영업|sales|account/.test(d)) return '영업 담당';
  if (/scm|구매|purchas|logistic|물류|supply|planner/.test(d)) return 'SCM · 물류';
  if (/개발|r&d|engineer|설계/.test(d)) return '개발 담당';
  if (/생산|공장|plant|production/.test(d)) return '생산/공장장';
  if (/대표|ceo|사장/.test(d)) return '대표';
  return '기타';
};
function ensureContacts(s) {
  if (!Array.isArray(s.contacts)) {
    s.contacts = [];
    if ((s.contact || '').trim() || (s.phone || '').trim() || (s.email || '').trim())
      s.contacts.push({
        id: uid(),
        role: '품질 담당',
        name: (s.contact || '').trim() || '(이름 미입력)',
        dept: '',
        phone: s.phone || '',
        mobile: '',
        email: s.email || '',
        primary: true,
        active: true,
        since: '',
        until: '',
        note: '',
      });
  }
  if (!Array.isArray(s.contactLog)) s.contactLog = [];
  return s;
}
function primaryOf(s) {
  ensureContacts(s);
  const a = s.contacts.filter((c) => c.active !== false);
  return a.find((c) => c.primary) || a[0] || null;
}
function syncLegacy(s) {
  const p = primaryOf(s);
  s.contact = p ? p.name : '';
  s.phone = p ? p.mobile || p.phone : '';
  s.email = p ? p.email : '';
}
function telLink(v) {
  return v ? `<a class="lk" href="tel:${esc(String(v).replace(/[^0-9+]/g, ''))}">${esc(v)}</a>` : '';
}
function mailLink(v) {
  return v ? `<a class="lk" href="mailto:${esc(v)}">${esc(v)}</a>` : '';
}
function cLabel(c) {
  return `${c.name}${c.role ? ` (${c.role})` : ''}`;
}
let loadFailed = null,
  saveFailed = null;
let storageBlocked = false;
function load() {
  if (SHARE) {
    const d = { ...SHARE.db };
    delete d.photos;
    return migrate(d);
  }
  if (SRV) return defaultDB();
  try {
    localStorage.getItem('__t');
  } catch (e) {
    storageBlocked = true;
    return defaultDB();
  }
  let r = null;
  try {
    r = localStorage.getItem(KEY);
    if (r) return migrate(JSON.parse(r));
  } catch (e) {
    console.error(e);
    loadFailed = String((e && e.message) || e);
    try {
      if (r) localStorage.setItem(KEY + '_broken', r);
    } catch (_) {}
  }
  return defaultDB();
}
let db = load();
/* ---- 데이터 원본 저장소 ----
   브라우저 대용량 저장소(IndexedDB, 수백 MB)에 저장. 기본 저장소(localStorage)는 사이트당 약 5MB라
   BOM · 입고 라인이 쌓이면 가득 차므로 옮김. 처음 열 때 기존 데이터를 자동으로 옮기고 확인 후 정리.
   IndexedDB를 쓸 수 없는 환경에서만 예전 방식(localStorage)으로 동작. */
const DDB = 'personalQMS_data';
let _ddb = null,
  dataStore = 'ls',
  dataReady = !!SHARE,
  brokenRaw = null,
  dataMigrated = false,
  dataBytes = 0;
function ddb() {
  if (!_ddb)
    _ddb = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('IndexedDB 미지원'));
      let r;
      try {
        r = indexedDB.open(DDB, 1);
      } catch (e) {
        return rej(e);
      }
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv');
      };
      r.onsuccess = () => {
        const d = r.result;
        d.onversionchange = () => d.close();
        res(d);
      };
      r.onerror = () => rej(r.error || new Error('저장소를 열 수 없습니다'));
      r.onblocked = () => rej(new Error('저장소가 다른 창에서 사용 중입니다'));
    });
  return _ddb;
}
function dTx(mode, fn) {
  return ddb().then(
    (d) =>
      new Promise((res, rej) => {
        let tx;
        try {
          tx = d.transaction('kv', mode);
        } catch (e) {
          return rej(e);
        }
        const out = fn(tx.objectStore('kv'));
        tx.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
        tx.onerror = () => rej(tx.error || new Error('저장 실패'));
        tx.onabort = () => rej(tx.error || new Error('저장 공간 부족 또는 중단'));
      }),
  );
}
const dGet = (k) => dTx('readonly', (s) => s.get(k)),
  dPut = (k, v) =>
    dTx('readwrite', (s) => {
      s.put(v, k);
    });
const savedMs = (d) => {
  const t = new Date((d && d.meta && d.meta.saved) || 0).getTime();
  return isFinite(t) ? t : 0;
};
