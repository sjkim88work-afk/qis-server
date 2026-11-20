// ── NCR — 첨부 문서 (통보서 · 대책서 · 특채 문서) ──
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
