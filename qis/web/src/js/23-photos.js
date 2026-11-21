/* ================= 사진 (IndexedDB 저장) ================= */
let photoStr = null;
// 사진 · 첨부: 서버판은 서버에 있음. 공유본은 파일 안에 든 것 (RO_PH) 만 읽음
const photoGetMany = (ids) => (SHARE ? Promise.resolve((ids || []).map((i) => RO_PH.get(i)).filter(Boolean)) : srvPhotoGetMany(ids));
const photoGet = (id) => photoGetMany([id]).then((a) => a[0]);
const photoPut = (recs) => (SHARE ? Promise.resolve() : srvPhotoPut(recs));
const photoDel = (ids) => (SHARE ? Promise.resolve() : srvPhotoDel(ids));
const photoAll = () => (SHARE ? Promise.resolve([...RO_PH.values()]) : srvPhotoAll());
async function photoList() {
  if (photoStr == null) photoStr = await photoAll();
  return photoStr;
}
/* withPhotos: true = 사진 데이터 포함 · 'meta' = 사진 정보만(사진 본체는 사진 폴더의 파일) · false = 사진 제외 */

// ── 첨부 공통 부품 — 사진 · 기록 증빙 · NCR 문서 · 특채 문서 · 이슈 기록 파일이 함께 씀 ──
// 이미지 파일 → 첨부 한 건: 설정의 최대 크기 · 품질로 줄이고 작은 그림(thumb)을 함께 만듦. 못 읽으면 오류를 던짐
// 사진 파일 → 첨부 한 건.
// 설정 ‘사진 저장 방식’ 이 ‘원본 그대로’ 면 파일을 바꾸지 않고 저장 (JPG · PNG · WEBP · GIF · BMP). 아니면 크기 · 품질을 줄임.
// 원본이 서버 한도에 가까우면 (약 20MB 초과) 줄여서 저장하고 알림.
const PHOTO_ORIG_MAX = 27e6; // data URL 글자 수 — 서버의 첨부 1개 한도 (30MB) 아래
async function attImgRec(f, fallbackName) {
  const S = db.settings,
    im = await readImg(f);
  let data = '';
  if (num(S.photoOrig) && isImgURL(im.src)) {
    if (im.src.length <= PHOTO_ORIG_MAX) data = im.src;
    else toast(`'${f.name || '사진'}' 은(는) 원본이 너무 커서 (20MB 초과) 줄여서 저장합니다`);
  }
  return {
    id: uid(),
    name: f.name || fallbackName || '붙여넣은 이미지.jpg',
    caption: '',
    data: data || shrink(im, num(S.photoMax) || 1600, (num(S.photoQ) || 80) / 100),
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
// 새 첨부를 저장소에 넣음 (기다리지 않음 — 실패하면 안내)
function attStore(recs, label) {
  if (!recs.length) return;
  photoPut(recs)
    .then(() => {
      photoStr = null;
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
