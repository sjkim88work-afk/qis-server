/* ================= 사진 (IndexedDB 저장) ================= */
const PDB='personalQMS_photos';let _idb=null,photoStr=null;
function idb(){
  if(!_idb)_idb=new Promise((res,rej)=>{
    if(!window.indexedDB)return rej(new Error('이 브라우저는 사진 저장소를 지원하지 않습니다'));
    const r=indexedDB.open(PDB,2);
    r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('photos'))d.createObjectStore('photos',{keyPath:'id'});if(!d.objectStoreNames.contains('handles'))d.createObjectStore('handles')};
    r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);
  });
  return _idb;
}
async function hTx(mode,fn){const d=await idb();return new Promise((res,rej)=>{const tx=d.transaction('handles',mode),out=fn(tx.objectStore('handles'));tx.oncomplete=()=>res(out instanceof IDBRequest?out.result:out);tx.onerror=()=>rej(tx.error)})}
const hGet=k=>hTx('readonly',s=>s.get(k)),hPut=(k,v)=>hTx('readwrite',s=>{s.put(v,k)}),hDel=k=>hTx('readwrite',s=>{s.delete(k)});
async function pTx(mode,fn){
  if(SHARE){const st={get:id=>({result:RO_PH.get(id)}),getAll:()=>({result:[...RO_PH.values()]}),getAllKeys:()=>({result:[...RO_PH.keys()]}),put:()=>{},delete:()=>{},clear:()=>{}};
    const out=fn(st);return out&&typeof out==='object'&&'result' in out?out.result:out}
  const d=await idb();
  return new Promise((res,rej)=>{
    const tx=d.transaction('photos',mode),out=fn(tx.objectStore('photos'));
    tx.oncomplete=()=>res(out instanceof IDBRequest?out.result:out);
    tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||new Error('저장 공간 부족 또는 중단'));
  });
}
const photoGet=id=>SRV?srvPhotoGetMany([id]).then(a=>a[0]):pTx('readonly',s=>s.get(id));
const photoGetMany=ids=>SRV?srvPhotoGetMany(ids):Promise.all((ids||[]).map(photoGet)).then(a=>a.filter(Boolean));
const photoPut=recs=>{if(SRV)return srvPhotoPut(recs);if(recs.some(r=>r&&!r.file&&!phIsPending(r)))phDirtySet(true);return pTx('readwrite',s=>{recs.forEach(r=>s.put(r))})};
const photoDel=async ids=>{
  if(SRV)return srvPhotoDel(ids);
  // 사진 폴더의 파일은 이름이 바뀌므로, 지우기 전에 파일 이름을 삭제 대기열에 남겨 둔다
  try{const q=phDelQ();(await photoGetMany(ids)).forEach(r=>q.add(r.file||phName(r.id)));phDelQSet(q)}catch(e){}
  return pTx('readwrite',s=>{ids.forEach(i=>s.delete(i))});
};
const photoAll=()=>SRV?srvPhotoAll():pTx('readonly',s=>s.getAll());
const photoClear=()=>SRV?Promise.reject(new Error('서버 모드에서는 첨부 전체 삭제를 할 수 없습니다')):pTx('readwrite',s=>{s.clear()});
async function photoList(){if(photoStr==null)photoStr=await photoAll();return photoStr}
/* withPhotos: true = 사진 데이터 포함 · 'meta' = 사진 정보만(사진 본체는 사진 폴더의 파일) · false = 사진 제외 */
async function photosJSON(metaOnly){const a=await photoList();return JSON.stringify(a.map(p=>metaOnly||phIsPending(p)?phMeta(p):p))}
