/* ================= 모달 ================= */
let mfDirty=false;
function askConfirm({title='삭제할까요?',msg='',items=[],note='',ok='삭제',danger=true,typeWord='',alt='',cancel='취소',input=null}={}){
  return new Promise(res=>{
    const c=$('#cfm'),prevFocus=document.activeElement;
    c.innerHTML=`<div class="cbox" role="alertdialog" aria-modal="true"><div class="ch"><span class="ic ${danger?'dz':'nt'}">${danger?'!':'?'}</span>${esc(title)}</div>
      <div class="cb">${msg}${items.length?`<ul>${items.map(i=>`<li>${i}</li>`).join('')}</ul>`:''}${note?`<div class="note">${note}</div>`:''}
      ${typeWord?`<div style="margin-top:10px">계속하려면 <b>${esc(typeWord)}</b> 를 입력하세요<input id="cfmIn" autocomplete="off" style="width:100%;margin-top:4px"></div>`:''}
      ${input?`<div style="margin-top:10px">${esc(input.label||'사유')} ${input.required===false?'':'*'}<textarea id="cfmTx" style="width:100%;min-height:56px;margin-top:4px" placeholder="${esc(input.ph||'')}"></textarea></div>`:''}</div>
      <div class="cf"><button type="button" class="b" id="cfmNo">${esc(cancel)}</button>${alt?`<button type="button" class="b" id="cfmAlt">${esc(alt)}</button>`:''}<button type="button" class="b ${danger?'dz':'p'}" id="cfmOk">${esc(ok)}</button></div></div>`;
    c.classList.add('on');
    const done=v=>{c.classList.remove('on');c.innerHTML='';document.removeEventListener('keydown',kh,true);try{prevFocus&&prevFocus.focus&&prevFocus.focus()}catch(e){}res(v)};
    const okFn=()=>{if(typeWord&&$('#cfmIn').value.trim()!==typeWord){toast(`'${typeWord}'를 정확히 입력하세요`);$('#cfmIn').focus();return}
      if(input){const v=$('#cfmTx').value.trim();if(!v&&input.required!==false){toast(`${input.label||'사유'}를 입력하세요`);$('#cfmTx').focus();return}done(v||true);return}done(true)};
    const kh=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();done(false)}else if(e.key==='Enter'&&typeWord&&e.target.id==='cfmIn'){e.preventDefault();okFn()}};
    $('#cfmNo').onclick=()=>done(false);$('#cfmOk').onclick=okFn;if($('#cfmAlt'))$('#cfmAlt').onclick=()=>done('alt');
    c.onmousedown=e=>{if(e.target===c)done(false)};
    document.addEventListener('keydown',kh,true);
    setTimeout(()=>{($('#cfmIn')||$('#cfmTx')||$('#cfmNo')).focus()},0);
  });
}
const qi=s=>`<b>${esc(s)}</b>`;
let undoSnap=null,undoTimer=null,undoBusy=false;
async function takeSnap(photoIds=[]){let ph=[];try{if(photoIds.length)ph=await photoGetMany(photoIds)}catch(e){}return{db:JSON.stringify(db),ph}}
function offerUndo(snap,label){
  undoSnap=snap;$('#undoMsg').textContent=label;$('#undo').classList.add('on');
  clearTimeout(undoTimer);undoTimer=setTimeout(hideUndo,10000);
}
function hideUndo(){$('#undo').classList.remove('on');undoSnap=null;clearTimeout(undoTimer)}
async function doUndo(){
  if(!undoSnap)return;const s=undoSnap;hideUndo();undoBusy=true;
  db=migrate(JSON.parse(s.db));
  try{if(s.ph.length){await photoPut(s.ph);photoStr=null}}catch(e){toast('사진 복원 실패: '+e.message)}
  save();undoBusy=false;render();toast('되돌렸습니다');
}
function openModal(title,body,btns){
  $('#mt').textContent=title;
  $('#mbody').innerHTML=`<form id="mf" onsubmit="return false">${body}</form>`;
  const f=$('#mfoot');f.innerHTML='';
  btns.forEach(b=>{const e=document.createElement('button');e.type='button';e.className='b '+(b.cls||'');e.textContent=b.label;e.onclick=b.fn;f.appendChild(e)});
  $('#modal').classList.add('on');$('#modal').scrollTop=0;$('#mbody').scrollTop=0;
  mfDirty=false;const mf=$('#mf');mf.addEventListener('input',()=>mfDirty=true);mf.addEventListener('change',()=>mfDirty=true);
}
async function closeModal(force){
  if(force!==true&&mfDirty&&$('#modal').classList.contains('on')){
    if(!await askConfirm({title:'작성 중인 내용이 있습니다',msg:'저장하지 않고 닫으면 입력한 내용이 사라집니다.',ok:'저장 안 하고 닫기'}))return;
  }
  mfDirty=false;$('#modal').classList.remove('on');cbClose();
}
document.addEventListener('keydown',e=>{
  if($('#lb').classList.contains('on')){if(e.key==='Escape')closeLb();if(e.key==='ArrowLeft')lbMove(-1);if(e.key==='ArrowRight')lbMove(1);return}
  if($('#cfm').classList.contains('on'))return;
  if(e.key==='Escape'&&$('#modal').classList.contains('on'))closeModal();
});
window.addEventListener('storage',e=>{if(e.key===KEY&&dataStore==='ls'&&dataReady){db=load();render();toast('다른 탭에서 변경된 내용을 불러왔습니다')}});

