/* ================= 사진 (IndexedDB 저장) ================= */
const PDB = 'personalQMS_photos';
let _idb = null,
  photoStr = null;
function idb() {
  if (!_idb)
    _idb = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('이 브라우저는 사진 저장소를 지원하지 않습니다'));
      const r = indexedDB.open(PDB, 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('handles')) d.createObjectStore('handles');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  return _idb;
}
async function hTx(mode, fn) {
  const d = await idb();
  return new Promise((res, rej) => {
    const tx = d.transaction('handles', mode),
      out = fn(tx.objectStore('handles'));
    tx.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
    tx.onerror = () => rej(tx.error);
  });
}
const hGet = (k) => hTx('readonly', (s) => s.get(k)),
  hPut = (k, v) =>
    hTx('readwrite', (s) => {
      s.put(v, k);
    }),
  hDel = (k) =>
    hTx('readwrite', (s) => {
      s.delete(k);
    });
async function pTx(mode, fn) {
  if (SHARE) {
    const st = {
      get: (id) => ({ result: RO_PH.get(id) }),
      getAll: () => ({ result: [...RO_PH.values()] }),
      getAllKeys: () => ({ result: [...RO_PH.keys()] }),
      put: () => {},
      delete: () => {},
      clear: () => {},
    };
    const out = fn(st);
    return out && typeof out === 'object' && 'result' in out ? out.result : out;
  }
  const d = await idb();
  return new Promise((res, rej) => {
    const tx = d.transaction('photos', mode),
      out = fn(tx.objectStore('photos'));
    tx.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('저장 공간 부족 또는 중단'));
  });
}
const photoGet = (id) => (SRV ? srvPhotoGetMany([id]).then((a) => a[0]) : pTx('readonly', (s) => s.get(id)));
const photoGetMany = (ids) => (SRV ? srvPhotoGetMany(ids) : Promise.all((ids || []).map(photoGet)).then((a) => a.filter(Boolean)));
const photoPut = (recs) => {
  if (SRV) return srvPhotoPut(recs);
  if (recs.some((r) => r && !r.file && !phIsPending(r))) phDirtySet(true);
  return pTx('readwrite', (s) => {
    recs.forEach((r) => s.put(r));
  });
};
const photoDel = async (ids) => {
  if (SRV) return srvPhotoDel(ids);
  // 사진 폴더의 파일은 이름이 바뀌므로, 삭제하기 전에 파일 이름을 삭제 대기열에 남겨 둔다
  try {
    const q = phDelQ();
    (await photoGetMany(ids)).forEach((r) => q.add(r.file || phName(r.id)));
    phDelQSet(q);
  } catch (e) {}
  return pTx('readwrite', (s) => {
    ids.forEach((i) => s.delete(i));
  });
};
const photoAll = () => (SRV ? srvPhotoAll() : pTx('readonly', (s) => s.getAll()));
const photoClear = () =>
  SRV
    ? Promise.reject(new Error('서버 모드에서는 첨부 전체 삭제를 할 수 없습니다'))
    : pTx('readwrite', (s) => {
        s.clear();
      });
async function photoList() {
  if (photoStr == null) photoStr = await photoAll();
  return photoStr;
}
/* withPhotos: true = 사진 데이터 포함 · 'meta' = 사진 정보만(사진 본체는 사진 폴더의 파일) · false = 사진 제외 */
async function photosJSON(metaOnly) {
  const a = await photoList();
  return JSON.stringify(a.map((p) => (metaOnly || phIsPending(p) ? phMeta(p) : p)));
}

// ── 첨부 공통 부품 — 사진 · 기록 증빙 · NCR 문서 · 특채 문서 · 이슈 기록 파일이 함께 씀 ──
// 이미지 파일 → 첨부 한 건: 설정의 최대 크기 · 품질로 줄이고 작은 그림(thumb)을 함께 만듦. 못 읽으면 오류를 던짐
async function attImgRec(f, fallbackName) {
  const S = db.settings,
    im = await readImg(f);
  return {
    id: uid(),
    name: f.name || fallbackName || '붙여넣은 이미지.jpg',
    caption: '',
    data: shrink(im, num(S.photoMax) || 1600, (num(S.photoQ) || 80) / 100),
    thumb: shrink(im, 320, 0.7),
    createdAt: now(),
    isNew: true,
  };
}
// 문서 파일 → 첨부 한 건 (내용 그대로). 너무 크거나 못 읽으면 안내를 띄우고 null
async function attDocRec(f, maxMB) {
  maxMB = maxMB || 20;
  if (f.size > maxMB * 1048576) {
    toast(`${f.name}: ${maxMB}MB를 넘는 파일은 첨부할 수 없습니다`);
    return null;
  }
  try {
    const data = await fileToURL(f);
    if (!isFileURL(data)) {
      toast(`${f.name}: 파일을 읽지 못했습니다`);
      return null;
    }
    return { id: uid(), kind: 'doc', name: f.name, mime: f.type || '', size: f.size, data, thumb: '', createdAt: now(), isNew: true };
  } catch (e) {
    toast(`${f.name}: 파일을 읽지 못했습니다`);
    return null;
  }
}
// 새 첨부를 저장소에 넣음 (기다리지 않음 — 실패하면 안내). 사진 폴더를 쓰면 파일도 맞춤
function attStore(recs, label) {
  if (!recs.length) return;
  photoPut(recs)
    .then(() => {
      photoStr = null;
      if (typeof photoDir !== 'undefined' && photoDir) syncPhotoFiles(false);
    })
    .catch((e) => toast(`${label} 저장 실패: ` + e.message));
}
// 첨부를 저장소에서 지우고 삭제 표시를 남김 (다른 PC 에도 삭제가 전해짐)
function attDrop(ids) {
  if (!ids || !ids.length) return;
  photoDel(ids).catch(() => {});
  ids.forEach((i) => db.deleted.push({ id: i, at: now() }));
  photoStr = null;
}
