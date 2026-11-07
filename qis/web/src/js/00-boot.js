'use strict';
/* ---- 공유용 읽기 전용 사본: 파일 안에 데이터(#qmsShare)가 있으면 그 데이터로만 보여 주고 저장하지 않음 ---- */
const APP_SRC=(()=>{try{return '<!doctype html>\n'+document.documentElement.outerHTML.replace(new RegExp('<script id="qis'+'Server"[^>]*>[\\s\\S]*?<\\/script>\\s*'),'')}catch(e){return ''}})();
const SHARE=(()=>{try{const e=document.getElementById('qmsShare');return e?JSON.parse(e.textContent):null}catch(e){return null}})();
// 사내 서버에서 열었을 때: 서버가 넣어 준 로그인 사용자 정보 (조회 권한이면 읽기 전용)
const SRV=(()=>{if(SHARE)return null;try{const e=document.getElementById('qisServer');return e?JSON.parse(e.textContent):null}catch(e){return null}})();
const RO=!!SHARE||!!(SRV&&SRV.role==='viewer');
const RO_PH=new Map(SHARE&&Array.isArray(SHARE.photos)?SHARE.photos.filter(p=>p&&p.id).map(p=>[p.id,p]):[]);
