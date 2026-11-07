/* ================= 검색형 선택 목록 ================= */
const COMBO_SRC={parts:q=>{
  const sup=id=>supName(id);
  return [...db.parts].sort((a,b)=>(a.partNo||'').localeCompare(b.partNo||'')).map(p=>({v:p.partNo,t:p.partNo,s:[p.name,p.model,sup(p.supplierId)].filter(Boolean).join(' · ')}));
},
// 완성품 품번: BOM이 있으면 BOM의 완성품 목록
fg:q=>{const ix=bomIx();if(!ix.byFg.size)return COMBO_SRC.parts(q);
  return [...ix.byFg].sort((a,b)=>kcmp(a[0],b[0])).map(([fg,rs])=>{const m=bomFg(fg);return {v:fg,t:fg,s:[m.name,m.model,`구성 ${rs.length}개`].filter(Boolean).join(' · ')}})},
// 불량 부품: 입력한 완성품의 BOM 구성품을 맨 위에
dparts:q=>{const all=COMBO_SRC.parts(q),f=$('#mf'),fg=f&&f.fgNo?f.fgNo.value.trim():'',comp=fg&&bomIx().byFg.get(fg);if(!comp)return all;
  const set=new Set(),cl=comp.filter(r=>!set.has(r.partNo)&&set.add(r.partNo));
  return [...cl.map(r=>{const p=partByNo(r.partNo);return {v:r.partNo,t:r.partNo,s:[`★ ${fg} 구성품 ×${bomQ(bTot(r))}${bomLv(r)>1?` (${r.parentNo} 하위)`:''}`,r.partName||p?.name,r.proc&&!/구매/.test(r.proc)?r.proc.replace(/^\d+:\s*/,''):'',p?supName(p.supplierId):''].filter(Boolean).join(' · ')}}),...all.filter(x=>!set.has(x.v))]}
};
let cbo={inp:null,items:[],idx:-1};
function hiTxt(t,q){t=esc(t);if(!q)return t;const i=t.toLowerCase().indexOf(esc(q).toLowerCase());return i<0?t:t.slice(0,i)+'<mark>'+t.slice(i,i+esc(q).length)+'</mark>'+t.slice(i+esc(q).length)}
function cbOpen(inp){
  cbo.inp=inp;const all=COMBO_SRC[inp.dataset.combo]();const q=inp.value.trim().toLowerCase();
  const words=q.split(/\s+/).filter(Boolean);
  const exact=all.find(x=>x.v.toLowerCase()===q);
  let L=words.length&&!exact?all.filter(x=>{const h=(x.t+' '+x.s).toLowerCase();return words.every(w=>h.includes(w))}):all;
  L=L.sort((a,b)=>(b.v.toLowerCase().startsWith(q)?1:0)-(a.v.toLowerCase().startsWith(q)?1:0));
  cbo.items=L.slice(0,300);cbo.idx=exact?cbo.items.indexOf(exact):-1;
  const qq=exact?'':words[0]||'';
  $('#cbxL').innerHTML=cbo.items.map((x,i)=>`<div class="ci${i===cbo.idx?' ac':''}" data-i="${i}"><b>${hiTxt(x.t,qq)}</b><span>${hiTxt(x.s,qq)||'&nbsp;'}</span></div>`).join('')||`<div class="ci" style="cursor:default;color:var(--sub)">${all.length?'일치하는 부품이 없습니다 — 입력한 번호로 그대로 저장됩니다':'등록된 부품이 없습니다 (기준정보에서 등록)'}</div>`;
  $('#cbxF').textContent=all.length?`${all.length}개 중 ${L.length}개${L.length>300?' (300개까지 표시 — 더 입력해서 좁히세요)':''} · ↑↓ 이동 · Enter 선택 · Esc 닫기`:'';
  cbPos();$('#cbx').classList.add('on');
  const a=$('#cbxL .ci.ac');if(a)a.scrollIntoView({block:'nearest'});
}
function cbPos(){if(!cbo.inp)return;const r=cbo.inp.getBoundingClientRect(),b=$('#cbx'),below=window.innerHeight-r.bottom;
  b.style.left=r.left+'px';b.style.width=Math.max(r.width,320)+'px';
  if(below<240&&r.top>below){b.style.top='';b.style.bottom=(window.innerHeight-r.top+2)+'px'}else{b.style.bottom='';b.style.top=(r.bottom+2)+'px'}}
function cbClose(){$('#cbx').classList.remove('on');cbo.inp=null}
function cbPick(i){const x=cbo.items[i],inp=cbo.inp;if(!x||!inp)return;inp.value=x.v;cbClose();inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}));inp.focus()}
$('#cbx').addEventListener('mousedown',e=>{e.preventDefault();const c=e.target.closest('.ci[data-i]');if(c)cbPick(+c.dataset.i)});
document.addEventListener('click',e=>{const t=e.target;if(t.dataset&&t.dataset.combo&&!$('#cbx').classList.contains('on'))cbOpen(t)});
document.addEventListener('focusin',e=>{const t=e.target;if(t.dataset&&t.dataset.combo)cbOpen(t);else if(cbo.inp&&t!==cbo.inp)cbClose()});
document.addEventListener('input',e=>{const t=e.target;if(t.dataset&&t.dataset.combo&&e.isTrusted)cbOpen(t)});
document.addEventListener('focusout',e=>{if(e.target===cbo.inp)setTimeout(()=>{if(document.activeElement!==cbo.inp)cbClose()},120)});
document.addEventListener('keydown',e=>{
  if(!cbo.inp||e.target!==cbo.inp)return;
  if(!$('#cbx').classList.contains('on')){if(e.key==='ArrowDown'){cbOpen(cbo.inp);e.preventDefault()}return}
  const n=cbo.items.length;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!n)return;cbo.idx=(cbo.idx+(e.key==='ArrowDown'?1:-1)+n)%n;[...$('#cbxL').children].forEach((c,i)=>c.classList.toggle('ac',i===cbo.idx));$('#cbxL').children[cbo.idx]?.scrollIntoView({block:'nearest'})}
  else if(e.key==='Enter'){if(cbo.idx>=0){e.preventDefault();cbPick(cbo.idx)}else cbClose()}
  else if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cbClose()}
  else if(e.key==='Tab')cbClose();
},true);
window.addEventListener('resize',cbPos);
document.addEventListener('scroll',e=>{if(cbo.inp&&!e.target.closest?.('#cbx'))cbPos()},true);
