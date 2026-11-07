/* ================= 기준정보 ================= */
/* ---- 기준정보: 정렬·검색 ---- */
const MS_KEY='personalQMS_ui';
const msState=(()=>{let v={};try{v=JSON.parse(localStorage.getItem(MS_KEY)||'{}')}catch(e){}return Object.assign({sup:{k:'name',d:1},part:{k:'partNo',d:1},supq:{k:'',d:1},rcvq:{k:'',d:1},ncr:{k:'',d:1},sq:'',pq:'',psup:'',pmodel:''},v)})();
function msSave(){try{localStorage.setItem(MS_KEY,JSON.stringify({sup:msState.sup,part:msState.part,supq:msState.supq,rcvq:msState.rcvq,ncr:msState.ncr}))}catch(e){}}
const kcmp=(a,b)=>String(a).localeCompare(String(b),'ko',{numeric:true,sensitivity:'base'});
function msSort(list,st,getters){
  const g=getters[st.k]||(()=>'');
  return list.sort((x,y)=>{const a=g(x),b=g(y),ea=a===''||a==null,eb=b===''||b==null;
    if(ea||eb)return ea&&eb?0:ea?1:-1;
    return (typeof a==='number'&&typeof b==='number'?a-b:kcmp(a,b))*st.d});
}
function msClick(t,k){const st=msState[t];if(st.k===k)st.d=-st.d;else{st.k=k;st.d=(t==='supq'||t==='rcvq')&&!['name','items','grade'].includes(k)?-1:t==='ncr'&&['issue','notify','reply','links','files'].includes(k)?-1:1}msSave();t==='sup'?msRefreshSup():t==='part'?msRefreshPart():t==='ncr'&&$('#ntab')?($('#ntab').innerHTML=ncrTable()):render()}
const sth=(t,k,label,cls='',tip='')=>{const st=msState[t],on=st.k===k;return `<th class="srt ${cls}${on?' on':''}" onclick="msClick('${t}','${k}')" title="${tip?esc(tip)+' · ':''}클릭해서 정렬">${label}<span class="ar">${on?(st.d>0?'▲':'▼'):'↕'}</span></th>`};
const SQ_G={name:x=>x.s.name||'',items:x=>x.s.items||'',cnt:x=>x.cnt,nA:x=>x.nA,qty:x=>x.qty,rcv:x=>x.rcv||'',ppm:x=>x.ppm==null?'':x.ppm,grade:x=>x.grade==='-'?'':x.grade,ncr:x=>x.ncr,open:x=>x.open,late:x=>x.late,avgReply:x=>x.avgReply==null?'':x.avgReply,avgEval:x=>x.avgEval==null?'':x.avgEval,firstPass:x=>x.firstPass==null?'':x.firstPass,escN:x=>x.escN,pen:x=>x.pen,cost:x=>x.cost,rec:x=>x.rec,os:x=>x.os};
const SUP_G={code:s=>s.code||'',name:s=>s.name||'',items:s=>s.items||'',nParts:s=>db.parts.filter(p=>p.supplierId===s.id).length,contact:s=>primaryOf(s)?.name||''};
const PART_G={partNo:p=>p.partNo||'',name:p=>p.name||'',model:p=>p.model||'',sup:p=>supName(p.supplierId),supCode:p=>supById(p.supplierId)?.code||'',price:p=>p.price===''||p.price==null?'':partKRW(p),bom:p=>bomUseN(p)};
function msSupTable(){
  const q=msState.sq.trim().toLowerCase();
  let L=db.suppliers.filter(s=>!q||[s.code,s.name,s.short,s.country,COUNTRY[s.country]||'',s.region,s.items,...ensureContacts(s).contacts.map(c=>c.name+' '+c.email+' '+c.phone+' '+c.mobile)].join(' ').toLowerCase().includes(q));
  L=msSort(L,msState.sup,SUP_G);
  return `<div class="muted" style="font-size:12px;margin-bottom:6px">${L.length}/${db.suppliers.length}개</div><div class="tw"><table class="mst"><colgroup><col style="width:76px"><col style="width:220px"><col><col style="width:60px"><col style="width:200px"><col style="width:150px"><col style="width:190px"><col style="width:106px"></colgroup><thead><tr>${sth('sup','code','코드')}${sth('sup','name','협력사명')}${sth('sup','items','주요 품목')}${sth('sup','nParts','부품 수','n')}${sth('sup','contact','주담당')}<th>전화</th><th>이메일</th><th></th></tr></thead><tbody>
  ${L.map(s=>{const p=primaryOf(s),n=s.contacts.filter(c=>c.active!==false).length,np=SUP_G.nParts(s);return `<tr><td style="white-space:nowrap">${esc(s.code)}</td><td><b>${esc(s.name)}</b>${s.short&&s.short!==s.name?` <span class="muted">${esc(s.short)}</span>`:''}${s.region==='국외'?` <span class="bg inf" title="${esc(supCountry(s))}">${esc(s.country||'국외')}</span>`:''}</td><td>${esc(s.items)}</td><td class="n">${np?`<a class="lk" onclick="msState.psup='${s.id}';msState.pq='';msRefreshPart(true)" title="이 협력사 부품만 보기">${np}</a>`:'<span class="muted">0</span>'}</td><td>${p?`<b>${esc(p.name)}</b> <span class="muted">${esc(p.role)}${p.dept?' · '+esc(p.dept):''}</span>`:'<span class="muted">-</span>'}${n>1?` <a class="bg inf" style="cursor:pointer" onclick="contactCard('${s.id}')">외 ${n-1}명</a>`:''}</td><td class="nw">${p?telLink(p.mobile||p.phone):''}</td><td class="nw">${p?mailLink(p.email):''}</td><td style="white-space:nowrap"><button class="b s" onclick="editSup('${s.id}')">수정</button> <button class="b s d" onclick="delSup('${s.id}')">삭제</button></td></tr>`}).join('')||`<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">${db.suppliers.length?'검색 결과가 없습니다.':'등록된 협력사가 없습니다.'}</td></tr>`}
  </tbody></table></div>`;
}
function msPartTable(){
  const q=msState.pq.trim().toLowerCase(),words=q.split(/\s+/).filter(Boolean);
  const hasBom=!!db.bom.rows.length;
  let L=db.parts.filter(p=>(!msState.psup||p.supplierId===msState.psup)&&(!msState.pmodel||p.model===msState.pmodel)&&(!hasBom||!msState.pbom||(msState.pbom==='y')===(bomUseN(p)>0))&&(!words.length||words.every(w=>[p.partNo,p.name,p.model,supName(p.supplierId),supById(p.supplierId)?.code||'',supById(p.supplierId)?.short||''].join(' ').toLowerCase().includes(w))));
  L=msSort(L,msState.part,PART_G);
  return `<div class="muted" style="font-size:12px;margin-bottom:6px">${L.length}/${db.parts.length}개</div><div class="tw"><table class="mst"><colgroup><col style="width:150px"><col><col style="width:120px"><col style="width:96px"><col style="width:220px"><col style="width:120px">${hasBom?'<col style="width:104px">':''}<col style="width:106px"></colgroup><thead><tr>${sth('part','partNo','부품번호')}${sth('part','name','부품명')}${sth('part','model','차종')}${sth('part','supCode','협력사 코드')}${sth('part','sup','협력사명')}${sth('part','price','단가','n','원화 환산 기준으로 정렬')}${hasBom?sth('part','bom','BOM','','BOM에 들어가는 제품 수 — 누르면 BOM 구성현황에서 그 제품들을 보여줌'):''}<th></th></tr></thead><tbody>
  ${L.map(p=>`<tr><td style="white-space:nowrap"><b>${esc(p.partNo)}</b></td><td>${esc(p.name)}${p.safety&&p.safety!=='해당없음'?` <span class="bg bad">${esc(p.safety)}</span>`:''}</td><td>${esc(p.model)}</td><td class="nw">${esc(supById(p.supplierId)?.code||'')}</td><td>${esc(supName(p.supplierId))}${supById(p.supplierId)?.short&&supById(p.supplierId).short!==supName(p.supplierId)?` <span class="muted">${esc(supById(p.supplierId).short)}</span>`:''}</td><td class="n">${fmtPrice(p)}${p.price&&curOf(p)!=='KRW'?`<br><span class="muted" style="font-size:11.5px">${fxRate(curOf(p))?'≈ '+won(partKRW(p))+'원':'환율 미설정'}</span>`:''}</td>${hasBom?`<td class="nw">${bomCell(p)}</td>`:''}<td style="white-space:nowrap"><button class="b s" onclick="editPart('${p.id}')">수정</button> <button class="b s d" onclick="delPart('${p.id}')">삭제</button></td></tr>`).join('')||`<tr><td colspan="${hasBom?8:7}" class="muted" style="text-align:center;padding:24px">${db.parts.length?'조건에 맞는 부품이 없습니다.':'등록된 부품이 없습니다.'}</td></tr>`}
  </tbody></table></div>`;
}
function bomCell(p){const u=bomPartUse(p),n=u.fgs.size,pn=jsq(p.partNo);
  if(!n&&!u.fg)return '<span class="muted" title="BOM 어디에도 없음">없음</span>';
  return (u.fg?`<a class="bg inf" style="cursor:pointer" onclick="bomGo(${pn})" title="BOM의 최상위 제품">제품</a> `:'')+(n?`<a class="bg ok" style="cursor:pointer" onclick="bomGo(${pn})" title="${esc([...u.fgs].slice(0,12).join(', '))}${n>12?' …':''}">${n}개 제품</a>`:'')}
function msRefreshSup(){const b=$('#msSup');if(b)b.innerHTML=msSupTable()}
function msRefreshPart(full){if(full){const y=window.scrollY;render();window.scrollTo(0,y);return}const b=$('#msPart');if(b)b.innerHTML=msPartTable()}
function renderMaster(){
  const models=[...new Set(db.parts.map(p=>p.model).filter(Boolean))].sort(kcmp);
  if(msState.psup&&!supById(msState.psup))msState.psup='';
  return `<div>
  <div class="card"><h3>협력사 (${db.suppliers.length})<span class="sp"></span><button class="b s" onclick="exportContactsCSV()">연락망 CSV</button><button class="b s" onclick="openMasterImport('sup')">엑셀 업로드</button><button class="b s p" onclick="editSup()">+ 추가</button></h3>
  <div class="row" style="margin-bottom:8px"><input placeholder="검색 (코드·협력사명·약어·국가·품목·담당자)" value="${esc(msState.sq)}" oninput="msState.sq=this.value;msRefreshSup()" style="flex:1;min-width:180px"></div>
  <div id="msSup">${msSupTable()}</div></div>
  <div class="card"><h3>부품 (${db.parts.length})<span class="sp"></span><button class="b s" onclick="openMasterImport('part')">엑셀 업로드</button><button class="b s p" onclick="editPart()">+ 추가</button></h3>
  <div class="row" style="margin-bottom:8px"><input placeholder="검색 (번호·품명·차종·협력사)" value="${esc(msState.pq)}" oninput="msState.pq=this.value;msRefreshPart()" style="flex:1;min-width:160px">
    <select onchange="msState.psup=this.value;msRefreshPart()">${supOpts(msState.psup,'전체 협력사')}</select>
    <select onchange="msState.pmodel=this.value;msRefreshPart()"><option value="">전체 차종</option>${models.map(m=>`<option ${m===msState.pmodel?'selected':''}>${esc(m)}</option>`).join('')}</select>
    ${db.bom.rows.length?`<select onchange="msState.pbom=this.value;msRefreshPart()"><option value="">BOM 전체</option><option value="y" ${msState.pbom==='y'?'selected':''}>BOM에 있음</option><option value="n" ${msState.pbom==='n'?'selected':''}>BOM에 없음</option></select>`:''}
    ${msState.psup||msState.pmodel||msState.pq||msState.pbom?`<button class="b s" onclick="msState.psup='';msState.pmodel='';msState.pq='';msState.pbom='';msRefreshPart(true)">필터 해제</button>`:''}</div>
  <div id="msPart">${msPartTable()}</div></div></div>
  <div class="card"><h3>BOM 구성현황 <span class="muted" style="font-weight:normal;font-size:12px">왼쪽 제품을 고르면 오른쪽에 구성 트리 (레벨 · U/S)</span><span class="sp"></span>${bomIx().byFg.size?`<button class="b s" onclick="exportBomCSV()">CSV</button><button class="b s" onclick="bomClear()">전체 삭제</button>`:''}<button class="b s p" onclick="openBomImport()">BOM 업로드</button></h3>
  ${bomIx().byFg.size?`<div class="row" style="margin-bottom:8px"><input placeholder="검색 (제품 · 구성 품번 · 품명 · 차종) — 구성 품번으로 찾으면 그 품번이 들어간 제품만 남고 트리에 표시" value="${esc(msState.bq||'')}" oninput="msState.bq=this.value;deb(()=>{$('#msBom').innerHTML=bomTable()})" style="flex:1;min-width:200px"></div>`:''}
  <div id="msBom">${bomTable()}</div></div>`;
}
let curContacts=[],origContacts=[],curEvents=[],showInactive=false;
function editSup(id){
  const s=id?ensureContacts(supById(id)):{contacts:[],contactLog:[]};
  origContacts=JSON.parse(JSON.stringify(s.contacts||[]));curContacts=JSON.parse(JSON.stringify(s.contacts||[]));curEvents=[];showInactive=false;
  const log=[...(s.contactLog||[])].sort((a,b)=>(b.ts||b.at||'').localeCompare(a.ts||a.at||''));
  openModal(id?`협력사 수정 — ${s.name}`:'협력사 추가',`<div class="fg">
    <label>코드<input name="code" value="${esc(s.code)}"></label><label>협력사명 *<input name="name" value="${esc(s.name)}"></label>
    <label>약어<input name="short" value="${esc(s.short)}" placeholder="예: EMK"></label>
    <label>국가<input name="country" list="dlCountry" value="${esc(s.country)}" placeholder="예: KR, CN, DE" style="text-transform:uppercase" oninput="const r=this.form.region;if(r&&!r.dataset.touched)r.value=countryRegion(this.value)"></label>
    <label>국내 · 국외<select name="region" onchange="this.dataset.touched=1">${opts(['','국내','국외'],s.region||countryRegion(s.country))}</select></label>
    <label class="full">주소<input name="address" value="${esc(s.address)}"></label>
    <datalist id="dlCountry">${Object.entries(COUNTRY).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</datalist>
    <label class="full">주요 품목<input name="items" value="${esc(s.items)}"></label>
    <label class="full">메모<textarea name="note">${esc(s.note)}</textarea></label></div>
  <div class="sec">연락처 <span class="muted" style="font-weight:normal;font-size:12px">★ = 주담당 (목록·출력물에 대표로 표시)</span>
    <span style="flex:1"></span><button type="button" class="b s" onclick="addContact()">+ 연락처 추가</button><button type="button" class="b s" onclick="openReplace()">담당자 교체</button></div>
  <div id="ctBox"></div><div id="rpBox"></div>
  <div class="fg" style="margin-top:10px"><label class="full">변경 사유 / 메모 (이력에 함께 기록)<input name="chgReason" placeholder="예: 품질팀 인사이동, 전화번호 변경 통보(10/24)"></label></div>
  ${id?`<div class="sec">연락처 변경 이력 (${log.length})</div>${log.length?`<div class="tw" style="max-height:220px"><table><thead><tr><th>적용일</th><th>내용</th><th>사유</th><th>기록 시각</th></tr></thead><tbody>${log.map(l=>`<tr><td style="white-space:nowrap">${esc(l.at)}</td><td>${nl(l.text)}</td><td>${esc(l.reason)}</td><td class="muted" style="white-space:nowrap">${esc(loc(l.ts))}</td></tr>`).join('')}</tbody></table></div>`:'<div class="muted">아직 이력이 없습니다. 연락처를 추가·수정·교체하면 자동으로 기록됩니다.</div>'}`:''}`,
  [{label:'취소',fn:closeModal},{label:'저장',cls:'p',fn:()=>saveSup(id)}]);
  if(!id&&!curContacts.length)addContact(true);
  renderContacts();
}
function renderContacts(){
  const box=$('#ctBox');if(!box)return;
  const act=curContacts.map((c,i)=>[c,i]).filter(([c])=>c.active!==false),ina=curContacts.map((c,i)=>[c,i]).filter(([c])=>c.active===false);
  const inp=(i,k,ph,w)=>`<input value="${esc(curContacts[i][k])}" placeholder="${ph}" oninput="curContacts[${i}].${k}=this.value;mfDirty=true" style="width:${w}">`;
  const row=([c,i])=>`<tr style="${c.active===false?'opacity:.6':''}">
    <td style="text-align:center">${c.active===false?'':`<input type="radio" name="ctPrim" ${c.primary?'checked':''} onchange="setPrimary(${i})" title="주담당">`}</td>
    <td><select style="width:96px" onchange="curContacts[${i}].role=this.value;mfDirty=true">${opts(ROLES,c.role)}</select></td>
    <td>${inp(i,'name','이름 *','76px')}</td><td>${inp(i,'dept','부서/직급','86px')}</td>
    <td>${inp(i,'phone','전화','104px')}</td><td>${inp(i,'mobile','휴대폰','108px')}</td><td>${inp(i,'email','이메일','140px')}</td><td>${inp(i,'note','비고','80px')}</td>
    <td style="white-space:nowrap">${c.active===false?`<span class="bg mut">${esc(c.until||'')} 종료</span> <button type="button" class="b s" onclick="reactivate(${i})">복귀</button>`:`<button type="button" class="b s" onclick="deactivate(${i})" title="퇴사·담당 해제 (이력 보존)">해제</button>`}
      <button type="button" class="b s d" onclick="removeContact(${i})" title="잘못 입력한 경우에만 삭제">삭제</button></td></tr>`;
  box.innerHTML=`<div class="tw" style="max-height:none"><table class="ct"><thead><tr><th>★</th><th>역할</th><th>이름</th><th>부서/직급</th><th>전화</th><th>휴대폰</th><th>이메일</th><th>비고</th><th></th></tr></thead><tbody>
    ${act.map(row).join('')||'<tr><td colspan="9" class="muted" style="text-align:center">등록된 연락처가 없습니다.</td></tr>'}
    ${ina.length?`<tr><td colspan="9" style="background:#f7f8fa"><a class="lk" onclick="showInactive=!showInactive;renderContacts()">${showInactive?'▾':'▸'} 이전 담당자 ${ina.length}명 ${showInactive?'숨기기':'보기'}</a></td></tr>${showInactive?ina.map(row).join(''):''}`:''}
  </tbody></table></div>`;
}
function newContact(o){return{id:uid(),role:'품질 담당',name:'',dept:'',phone:'',mobile:'',email:'',primary:false,active:true,since:today(),until:'',note:'',...o}}
function addContact(silent){const first=!curContacts.some(c=>c.active!==false);curContacts.push(newContact({primary:first}));if(!silent)mfDirty=true;renderContacts();setTimeout(()=>{const ins=$('#ctBox').querySelectorAll('input[placeholder="이름 *"]');ins[ins.length-1]?.focus()},0)}
function setPrimary(i){curContacts.forEach((c,k)=>c.primary=k===i);mfDirty=true;renderContacts()}
async function deactivate(i){
  const c=curContacts[i];
  if(!await askConfirm({title:`${c.name||'이 담당자'}를 담당 해제할까요?`,msg:'퇴사·업무 변경 등으로 더 이상 담당하지 않을 때 사용합니다. 연락처는 <b>‘이전 담당자’로 보존</b>되고 이력에 기록됩니다.',ok:'담당 해제',danger:false}))return;
  c.active=false;c.until=today();
  if(c.primary){c.primary=false;const n=curContacts.find(x=>x.active!==false);if(n)n.primary=true}
  mfDirty=true;renderContacts();
}
function reactivate(i){const c=curContacts[i];c.active=true;c.until='';if(!curContacts.some(x=>x.active!==false&&x.primary))c.primary=true;mfDirty=true;renderContacts()}
async function removeContact(i){
  const c=curContacts[i];
  if(c.name&&!await askConfirm({title:`연락처 '${c.name}'을(를) 삭제할까요?`,msg:'잘못 입력한 경우에만 삭제하세요. 퇴사·교체는 <b>‘해제’ 또는 ‘담당자 교체’</b>를 쓰면 이전 연락처가 보존됩니다.',note:'삭제 기록은 변경 이력에 남습니다. 저장해야 반영됩니다.'}))return;
  const wasP=c.primary;curContacts.splice(i,1);if(wasP){const n=curContacts.find(x=>x.active!==false);if(n)n.primary=true}
  mfDirty=true;renderContacts();
}
function openReplace(){
  const act=curContacts.map((c,i)=>[c,i]).filter(([c])=>c.active!==false&&c.name);
  if(!act.length){toast('교체할 기존 담당자가 없습니다. ‘+ 연락처 추가’를 사용하세요');return}
  const pi=act.find(([c])=>c.primary)?.[1]??act[0][1];
  $('#rpBox').innerHTML=`<div class="card" style="margin-top:10px;background:var(--pri2);border-color:#c9d8f2"><h3>담당자 교체<span class="sp"></span><button type="button" class="b s" onclick="$('#rpBox').innerHTML=''">닫기</button></h3>
  <div class="fg">
    <label>기존 담당자<select id="rpOld">${act.map(([c,i])=>`<option value="${i}" ${i===pi?'selected':''}>${esc(cLabel(c))}${c.primary?' ★':''}</option>`).join('')}</select></label>
    <label>적용일<input type="date" id="rpDate" value="${today()}"></label>
    <label>새 담당자 이름 *<input id="rpName"></label><label>부서/직급<input id="rpDept"></label>
    <label>전화<input id="rpPhone"></label><label>휴대폰<input id="rpMobile"></label><label>이메일<input id="rpEmail"></label>
    <label class="row" style="flex-direction:row;align-items:center;gap:6px;margin-top:16px"><input type="checkbox" id="rpKeep"> 기존 담당자를 다른 역할로 유지</label>
  </div>
  <div class="row" style="justify-content:flex-end;margin-top:8px"><button type="button" class="b p" onclick="applyReplace()">교체 적용</button></div></div>`;
  $('#rpName').focus();
}
function applyReplace(){
  const oi=+$('#rpOld').value,old=curContacts[oi],name=$('#rpName').value.trim(),date=$('#rpDate').value||today();
  if(!name){toast('새 담당자 이름을 입력하세요');$('#rpName').focus();return}
  const keep=$('#rpKeep').checked;
  const nc=newContact({role:old.role,name,dept:$('#rpDept').value.trim(),phone:$('#rpPhone').value.trim(),mobile:$('#rpMobile').value.trim(),email:$('#rpEmail').value.trim(),primary:old.primary,since:date});
  if(!keep){old.active=false;old.until=date}else old.role='기타';
  old.primary=false;curContacts.push(nc);
  curEvents.push({at:date,text:`[교체] ${old.role&&!keep?old.role:nc.role}: ${old.name} → ${name}${nc.primary?' (주담당)':''}${keep?` / ${old.name}는 연락처 유지`:''}`,ids:[old.id,nc.id]});
  $('#rpBox').innerHTML='';mfDirty=true;renderContacts();toast(`${old.name} → ${name} 교체 적용 (저장해야 반영)`);
}
const C_FIELDS=[['role','역할'],['name','이름'],['dept','부서/직급'],['phone','전화'],['mobile','휴대폰'],['email','이메일'],['note','비고']];
function diffContacts(oldL,newL,events){
  const out=[...events.map(e=>({at:e.at,text:e.text}))],skip=new Set(events.flatMap(e=>e.ids)),om=new Map(oldL.map(c=>[c.id,c])),nm=new Map(newL.map(c=>[c.id,c]));
  newL.forEach(c=>{
    if(skip.has(c.id))return;const o=om.get(c.id);
    if(!o){out.push({at:c.since||today(),text:`[추가] ${cLabel(c)}${c.primary?' — 주담당':''}${c.phone||c.mobile?` · ${c.mobile||c.phone}`:''}${c.email?` · ${c.email}`:''}`});return}
    const ch=C_FIELDS.filter(([k])=>(o[k]||'')!==(c[k]||'')).map(([k,l])=>`${l} ${o[k]||'(없음)'} → ${c[k]||'(없음)'}`);
    if(ch.length)out.push({at:today(),text:`[수정] ${o.name}: ${ch.join(', ')}`});
    if(o.active!==false&&c.active===false)out.push({at:c.until||today(),text:`[담당 해제] ${cLabel(c)}`});
    if(o.active===false&&c.active!==false)out.push({at:today(),text:`[복귀] ${cLabel(c)}`});
  });
  oldL.forEach(o=>{if(!nm.has(o.id)&&!skip.has(o.id))out.push({at:today(),text:`[삭제] ${cLabel(o)}${o.mobile||o.phone?` · ${o.mobile||o.phone}`:''}`})});
  const op=oldL.find(c=>c.primary&&c.active!==false),np=newL.find(c=>c.primary&&c.active!==false);
  if((op?.id||'')!==(np?.id||'')&&!(np&&!om.has(np.id))&&!events.some(e=>e.ids.includes(np?.id)))out.push({at:today(),text:`[주담당 변경] ${op?op.name:'(없음)'} → ${np?np.name:'(없음)'}`});
  return out;
}
function saveSup(id){
  const o=gather();if(!o.name){toast('협력사명을 입력하세요');return}
  o.country=String(o.country||'').trim().toUpperCase();if(!o.region)o.region=countryRegion(o.country);
  if(db.suppliers.some(x=>x.name===o.name&&x.id!==id)){toast('같은 이름의 협력사가 이미 있습니다');return}
  const empty=curContacts.filter(c=>!c.name.trim()&&(c.phone||c.mobile||c.email));
  if(empty.length){toast('이름이 없는 연락처가 있습니다');return}
  const list=curContacts.filter(c=>c.name.trim()).map(c=>({...c,name:c.name.trim()}));
  if(list.some(c=>c.active!==false)&&!list.some(c=>c.active!==false&&c.primary))list.find(c=>c.active!==false).primary=true;
  const reason=(o.chgReason||'').trim();delete o.chgReason;
  let sp;if(id){sp=supById(id);Object.assign(sp,o)}else{sp={id:uid(),...o,contactLog:[]};db.suppliers.push(sp)}
  const entries=diffContacts(id?origContacts:[],list,curEvents);
  sp.contacts=list;ensureContacts(sp);
  entries.forEach(e=>sp.contactLog.push({id:uid(),at:e.at,ts:now(),text:e.text,reason}));
  syncLegacy(sp);touch(sp);save();closeModal(true);render();
  if(entries.length)toast(`저장됨 · 연락처 이력 ${entries.length}건 기록`);
}
async function delSup(id){
  const s=supById(id);if(!s)return;
  const nd=db.defects.filter(d=>d.supplierId===id).length,np=db.parts.filter(p=>p.supplierId===id).length,nn=db.ncrs.filter(n=>n.supplierId===id).length,nr=db.receipts.filter(r=>r.supplierId===id).length;
  const used=nd+np+nn+nr;
  if(!await askConfirm({title:`협력사 '${s.name}'을(를) 삭제할까요?`,msg:used?'이 협력사를 참조하는 기록이 있습니다. 삭제하면 아래 기록의 협력사 칸이 비워집니다.':'',
    items:used?[nd&&`불량 기록 ${nd}건`,np&&`부품 ${np}개`,nn&&`NCR ${nn}건`,nr&&`월별 입고수량 ${nr}건 (함께 삭제)`].filter(Boolean):[`${qi(s.name)} ${esc(s.code)} · ${esc(s.items)}`],note:'삭제 후 10초 안에 되돌릴 수 있습니다.'}))return;
  const snap=await takeSnap();
  db.receipts.filter(r=>r.supplierId===id).forEach(r=>removeRec('receipts',r.id));
  ['defects','parts','ncrs'].forEach(c=>db[c].forEach(r=>{if(r.supplierId===id){r.supplierId='';touch(r)}}));
  removeRec('suppliers',id);save();render();offerUndo(snap,`협력사 '${s.name}'을(를) 삭제했습니다`);
}
function partFxHint(){const f=$('#mf'),e=$('#partFx');if(!f||!e)return;const c=f.currency.value,v=f.price.value;
  e.textContent=c==='KRW'||v===''?'':fxRate(c)?`≈ ${won(num(v)*fxRate(c))}원 (1 ${c} = ${fxRate(c).toLocaleString('ko-KR')}원)`:`${c} 환율 미설정 — 설정에서 입력`}
function editPart(id){
  const p=id?db.parts.find(x=>x.id===id):{};
  openModal(id?'부품 수정':'부품 추가',`<div class="fg">
    <label>부품번호 *<input name="partNo" value="${esc(p.partNo)}"></label><label>부품명<input name="name" value="${esc(p.name)}"></label>
    <label>차종<input name="model" value="${esc(p.model)}"></label><label>협력사<select name="supplierId">${supOpts(p.supplierId)}</select></label>
    <label>단가<span style="display:flex;gap:6px"><input type="number" min="0" step="any" name="price" value="${esc(p.price)}" style="flex:1" oninput="partFxHint()"><select name="currency" style="width:auto" onchange="partFxHint()">${CURS.map(c=>`<option value="${c}" ${curOf(p)===c?'selected':''}>${c}</option>`).join('')}</select></span><span id="partFx" class="muted" style="font-size:11.5px;font-weight:normal"></span></label>
    <label>안전특성 (RCA 화면에 표시)<select name="safety">${czOptHTML(CZ_OPT.SafetyChar,p.safety||'해당없음')}</select></label></div>`,
  [{label:'취소',fn:closeModal},{label:'저장',cls:'p',fn:()=>{const o=gather();if(!o.partNo){toast('부품번호를 입력하세요');return}
    if(o.currency!=='KRW'&&o.price!==''&&!fxRate(o.currency))setTimeout(()=>toast(`${o.currency} 환율이 설정에 없습니다 — 설정 → 불량 관리 → 환율에서 넣으면 비용이 원화로 계산됩니다`),900);
    if(db.parts.some(x=>x.partNo===o.partNo&&x.id!==id)){toast('같은 부품번호가 이미 있습니다');return}
    o.price=o.price===''?'':num(o.price);if(o.currency==='KRW')delete o.currency;let r;if(id){r=db.parts.find(x=>x.id===id);delete r.currency;Object.assign(r,o)}else{r={id:uid(),...o};db.parts.push(r)}touch(r);save();closeModal(true);render()}}]);
  partFxHint();
}
async function delPart(id){
  const p=db.parts.find(x=>x.id===id);if(!p)return;
  const nd=db.defects.filter(d=>d.partNo===p.partNo).length;
  if(!await askConfirm({title:'부품을 삭제할까요?',items:[`${qi(p.partNo)} ${esc(p.name)}`,`${esc(p.model)} · ${esc(supName(p.supplierId))}${p.price?` · ${fmtPrice(p)}`:''}`],note:nd?`이 부품번호의 불량 기록 ${nd}건은 그대로 유지됩니다. 삭제 후 10초 안에 되돌릴 수 있습니다.`:'삭제 후 10초 안에 되돌릴 수 있습니다.'}))return;
  const snap=await takeSnap();removeRec('parts',id);save();render();offerUndo(snap,`부품 ${p.partNo}을(를) 삭제했습니다`);
}
function importContact(s,name,phone,email,dept){
  const isMob=v=>/^(\+?82[\s-]*)?0?1[016789][\s-]?\d{3,4}[\s-]?\d{4}$/.test(String(v||'').trim());
  const p=primaryOf(s),log=t=>s.contactLog.push({id:uid(),at:today(),ts:now(),text:t,reason:'엑셀 일괄 등록'});
  const act=s.contacts.filter(c=>c.active!==false);
  const same=act.find(c=>c.name===name);
  if(same){const ch=[];if(phone&&phone!==(same.mobile||same.phone)){ch.push(`전화 ${same.mobile||same.phone||'(없음)'} → ${phone}`);if(isMob(phone))same.mobile=phone;else same.phone=phone}
    if(dept&&dept!==same.dept){ch.push(`부서 ${same.dept||'(없음)'} → ${dept}`);same.dept=dept}
    if(email&&email!==same.email){ch.push(`이메일 ${same.email||'(없음)'} → ${email}`);same.email=email}
    if(ch.length)log(`[수정] ${name}: ${ch.join(', ')}`);
    if(!same.primary){s.contacts.forEach(c=>c.primary=c===same);log(`[주담당 변경] ${p?p.name:'(없음)'} → ${name}`)}
    return}
  const role=roleOfDept(dept),tgt=act.find(c=>c.role===role&&c.primary)||act.find(c=>c.role===role);
  const nc=newContact({role,name,dept:dept||'',...(isMob(phone)?{mobile:phone}:{phone}),email,primary:true});
  if(tgt){tgt.active=false;tgt.until=today();log(`[교체] ${role}: ${tgt.name} → ${name} (주담당)`)}
  else log(`[추가] ${cLabel(nc)} — 주담당${p?` (기존 주담당 ${p.name}은 연락처 유지)`:''}`);
  s.contacts.forEach(c=>c.primary=false);s.contacts.push(nc);
}
function parseRows(t){return parseCSV(String(t||'')).map(r=>r.map(c=>String(c??'').trim())).filter(r=>r.some(c=>c))}
/* ---- 협력사 · 부품 업로드 (BOM 업로드와 같은 방식: xlsx · csv · 붙여넣기 → 열 자동 연결 → 미리보기 → 등록) ---- */
const MIMP={
  sup:{title:'협력사 업로드',key:'name',F:[['code','협력사 코드'],['name','협력사명 (거래처명)',1],['short','약어'],['country','국가'],['region','국내 · 국외'],['address','주소'],['items','주요 품목'],['dept','담당자 부서'],['contact','담당자'],['phone','담당자 전화'],['email','이메일']],
    tests:[['email',c=>/메일|mail/.test(c)],['phone',c=>/연락처|전화|휴대|핸드폰|phone|tel|mobile/.test(c)],
      ['country',c=>/국가|country|nation/.test(c)],['region',c=>/국내외|내외자|domestic|overseas|^국내$|^구분$/.test(c)],['short',c=>/약어|약칭|abbr|short|alias/.test(c)],
      ['address',c=>/주소|address|소재지/.test(c)],['dept',c=>/부서|dept|department|소속/.test(c)],
      ['code',c=>/코드|code|업체번호|거래처번호|vendorno|사업자/.test(c)],['contact',c=>/담당|성명|이름|contact|^name$/.test(c)],
      ['name',c=>/협력사|업체|거래처|공급사|vendor|supplier|회사|상호/.test(c)],['items',c=>/품목|item|취급|주요/.test(c)]],
    help:'필수 열: <b>협력사명(거래처명)</b> / 선택 열: 코드 · 약어 · 국가 · 국내외 · 주소 · 주요 품목 · 담당자 부서 · 담당자 · 전화 · 이메일. ERP 거래처 목록을 그대로 올리면 됩니다. <b>같은 코드</b>(코드가 없으면 같은 이름)가 있으면 그 협력사를 갱신하고, 담당자가 바뀌면 연락처 이력에 남깁니다.'},
  part:{title:'부품 업로드',key:'partNo',F:[['partNo','부품번호',1],['name','부품명'],['model','차종'],['supCode','협력사 코드'],['sup','협력사명'],['price','단가'],['cur','통화 (KRW · USD · EUR …)'],['safety','안전특성 (S · R · C)'],['proc','조달구분 (구매 · 생산)']],
    tests:[['proc',c=>/조달|구매구분|procure|makebuy|자작/.test(c)],['cur',c=>/통화|화폐|currency|^curr?$|^cur\.?$/.test(c)],['price',c=>/단가|price|cost|가격/.test(c)],['safety',c=>/특별특성|안전특성|특성|safety|cc\/sc|중요/.test(c)],
      ['model',c=>/차종|model|vehicle|car|프로젝트|project/.test(c)],['supCode',c=>/(협력사|업체|거래처|공급사|vendor|supplier|maker).*(코드|code|번호|no)/.test(c)],['sup',c=>/협력사|업체|거래처|공급사|vendor|supplier|maker|제조사/.test(c)],
      ['name',c=>/품명|부품명|품목명|자재명|description|partname|itemname|^name$/.test(c)],['partNo',c=>/품번|부품번호|품목코드|자재코드|partno|itemcode|^code$|^part$/.test(c)]],
    help:'필수 열: <b>부품번호</b> / 선택 열: 부품명 · 차종 · 협력사 코드 · 협력사명 · 단가 · 통화 · 안전특성 · 조달구분. 통화 열이 없어도 단가에 <b>USD 12.5</b> · <b>$12.5</b> · <b>€8</b> · <b>35元</b>처럼 적혀 있으면 통화를 알아봅니다 (없으면 원화). 같은 부품번호가 있으면 갱신합니다. 협력사가 기준정보에 없으면 새로 만듭니다. MES · ERP의 품목 목록이나 BOM 엑셀을 그대로 올려도 됩니다.'}};
let mi={kind:'sup',rows:[],hdr:0,map:{},name:'',buyOnly:true};
function miAutoMap(kind,h){
  const m={},used=new Set(),cell=i=>String(h[i]||'').replace(/\s+/g,'').toLowerCase();
  MIMP[kind].tests.forEach(([k,t])=>{for(let i=0;i<h.length;i++){if(used.has(i))continue;if(t(cell(i))){m[k]=i;used.add(i);break}}});
  return m;
}
function openMasterImport(kind){
  const C=MIMP[kind];mi={kind,rows:[],hdr:0,map:{},name:'',buyOnly:true,off:new Set(),filt:''};
  openModal(C.title,`<div class="help">엑셀(.xlsx) · CSV 파일을 올리거나, 엑셀에서 범위를 복사해 붙여넣으세요. 제목행과 열은 자동으로 찾고, 틀린 열만 바꾸면 됩니다.<br>${C.help}</div>
  <div class="row" style="margin-top:10px"><label class="b p" style="cursor:pointer">파일 선택 (.xlsx / .csv)<input type="file" accept=".xlsx,.csv,.txt" style="display:none" onchange="miFile(this.files[0]);this.value=''"></label><span id="miSheet"></span><span id="miName" class="muted"></span>
    <span style="flex:1"></span><a class="lk" style="font-size:12px" onclick="miTemplate()">빈 양식 받기 (CSV)</a></div>
  <textarea id="miPaste" placeholder="또는 엑셀에서 복사한 범위를 여기에 붙여넣기 (Ctrl+V) — 제목행 포함" style="min-height:80px;margin-top:8px;font-family:Consolas,monospace;font-size:12px" oninput="miSet(parseRows(this.value),'붙여넣기')"></textarea>
  <div id="miMap" style="margin-top:10px"></div>`,
  [{label:'취소',fn:closeModal},{label:'등록',cls:'p',fn:miApply}]);
}
function miTemplate(){const C=MIMP[mi.kind];downloadCSV(`${mi.kind==='sup'?'협력사':'부품'}_업로드양식.csv`,[C.F.map(f=>f[1].replace(/ \(.*\)/,''))])}
function miFile(f){return sheetFile(f,mi,'#miSheet','miSet','mi')}
function miSet(rows,name){
  rows=(rows||[]).map(r=>(r||[]).map(c=>String(c??'').trim()));
  if(rows.filter(r=>r.some(c=>c)).length<2){$('#miMap').innerHTML='<div class="muted">제목행과 데이터가 있는 범위를 넣어주세요.</div>';return}
  let best=-1,bh=0;rows.slice(0,15).forEach((r,i)=>{const c=Object.keys(miAutoMap(mi.kind,r)).length;if(c>best){best=c;bh=i}});
  mi.rows=rows;mi.hdr=bh;mi.map=miAutoMap(mi.kind,rows[bh]);mi.name=name;miRender();
}
const miSafety=v=>{v=String(v||'').trim();if(!v)return '';if(CZ_OPT.SafetyChar.includes(v))return v;const u=v.toUpperCase();
  if(/안전|^S$|^SC$|^S\W/.test(u))return '안전-S';if(/법규|^R$|^R\W/.test(u))return '법규-R';if(/중요|^C$|^CC$|^C\W/.test(u))return '중요-C';if(/없음|^-$|^N/.test(u))return '해당없음';return ''};
// 단가 · 통화 읽기: 통화 열 > 단가에 붙은 기호 · 코드 > 원화
function miCur(t){t=String(t||'').toUpperCase();
  if(/USD|US\$|\$|달러|DOLLAR/.test(t))return 'USD';if(/EUR|€|유로/.test(t))return 'EUR';if(/CNY|RMB|元|위안|人民币/.test(t))return 'CNY';
  if(/JPY|円|엔/.test(t))return 'JPY';if(/MXN|페소|PESO/.test(t))return 'MXN';if(/INR|₹|루피/.test(t))return 'INR';if(/VND|₫|동$/.test(t))return 'VND';
  if(/KRW|₩|원/.test(t))return 'KRW';return ''}
function miPrice(v,curCol){const raw=String(v||'').trim(),cc=String(curCol||'').trim(),c=cc?miCur(cc):(miCur(raw)||'KRW');
  const n=raw.replace(/[^0-9.\-]/g,'');return {v:n!==''&&isFinite(+n)?+n:'',c:c||'?',bad:cc&&!c?cc:''}}  // bad: 알 수 없는 통화
const supSplit=v=>{const m=String(v||'').trim().match(/^\[?([A-Za-z0-9-]{2,})\]?\s*[:：\-]\s*(.+)$/);return m?{code:m[1],name:m[2].trim()}:null};
const supFind=v=>{v=String(v||'').trim();if(!v)return null;const sp=supSplit(v);if(sp){const x=db.suppliers.find(s=>s.code&&String(s.code)===sp.code);if(x)return x;v=sp.name}const l=v.toLowerCase();return db.suppliers.find(s=>s.code&&String(s.code).toLowerCase()===l)||db.suppliers.find(s=>(s.name||'').toLowerCase()===l)||db.suppliers.find(s=>s.short&&s.short.toLowerCase()===l)||null};
// 'KR: 한국' · 'KR' · '한국' → KR / 'IN: 국내' · 'OUT: 국외' → 국내 · 국외
const miCountry=v=>{v=String(v||'').trim();if(!v)return '';const m=v.match(/^([A-Za-z]{2})\b/);if(m)return m[1].toUpperCase();const k=Object.keys(COUNTRY).find(k=>v.includes(COUNTRY[k]));return k||''};
const miRegion=v=>{v=String(v||'').trim().toUpperCase();if(!v)return '';if(/국외|해외|OUT|OVERSEA|FOREIGN|IMPORT/.test(v))return '국외';if(/국내|^IN\b|DOMESTIC|LOCAL/.test(v))return '국내';return ''};
// 읽은 줄 → 등록 대상 (상태: 신규 · 갱신 · 건너뜀)
// 같은 번호 판단: 대소문자 · 공백 · 하이픈 · 밑줄 · 점 차이는 같은 것으로 봄 (81842-BE110 = 81842 be110)
const mkey=v=>String(v??'').normalize('NFKC').toUpperCase().replace(/[\s\-_.·‐-―]/g,'');
const mname=v=>String(v??'').normalize('NFKC').toUpperCase().replace(/\s+/g,' ').trim();
// 부품번호가 비슷한지: 길이가 같고 앞 5자리가 같으며 다른 글자가 2개 이하 (BE100 ↔ BE110)
const mnear=(a,b)=>{a=mkey(a);b=mkey(b);if(!a||!b||a===b||a.length!==b.length||a.slice(0,5)!==b.slice(0,5))return false;let d=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i]&&++d>2)return false;return true};
const MI_LBL={sup:{code:'코드',name:'협력사명',short:'약어',country:'국가',region:'국내 · 국외',address:'주소',items:'주요 품목',contact:'담당자',phone:'전화',email:'이메일'},
  part:{name:'부품명',model:'차종',sup:'협력사',price:'단가',safety:'안전특성'}};
function miDiff(kind,o,ex){
  // 올린 값이 있고 기존 값과 다른 칸만 (빈 칸은 기존 값 유지라 변경 아님)
  const D=[],add=(f,ov,nv)=>{if(nv!==''&&nv!=null&&String(ov??'').trim()!==String(nv).trim())D.push({f,o:ov??'',n:nv})};
  if(kind==='sup'){
    const pc=primaryOf(ex);
    add('code',ex.code,o.code);if(o.name&&mname(o.name)!==mname(ex.name))add('name',ex.name,o.name);add('short',ex.short,o.short);
    const cc=miCountry(o.country);add('country',ex.country,cc);add('region',ex.region,miRegion(o.region)||(cc&&!ex.region?countryRegion(cc):''));
    add('address',ex.address,o.address);add('items',ex.items,o.items);
    if(o.contact){add('contact',pc?pc.name:'',o.contact);const ph=pc?(pc.mobile||pc.phone):'';if(o.phone&&!(String(ph).replace(/\D/g,'')===o.phone.replace(/\D/g,'')||String(pc&&pc.phone||'').replace(/\D/g,'')===o.phone.replace(/\D/g,'')))D.push({f:'phone',o:ph,n:o.phone});add('email',pc?pc.email:'',o.email)}
  }else{
    if(o.name&&mname(o.name)!==mname(ex.name))add('name',ex.name,o.name);add('model',ex.model,o.model);
    const sk=o.supCode||o.sup;if(sk){const sp=(o.supCode&&supFind(o.supCode))||(o.sup&&supFind(o.sup));if(!sp||sp.id!==ex.supplierId)D.push({f:'sup',o:supName(ex.supplierId),n:sp?sp.name:'(새 협력사) '+(o.sup||o.supCode)})}
    const pc=miPrice(o.price,o.cur);if(!pc.bad&&pc.v!==''&&(+ex.price!==pc.v||curOf(ex)!==pc.c))D.push({f:'price',o:ex.price!==''&&ex.price!=null?fmtAmt(ex.price,curOf(ex)):'',n:fmtAmt(pc.v,pc.c)});
    add('safety',ex.safety==='해당없음'?'':ex.safety,miSafety(o.safety));
  }
  return D;
}
function miData(){
  const m=mi.map,k=mi.kind,g=(r,f)=>m[f]!=null&&m[f]>=0?String(r[m[f]]??'').trim():'';
  const out=new Map(),skip={nokey:0,make:0,dup:0};
  if(k==='part'){const ix=new Map();db.parts.forEach(p=>{const q=mkey(p.partNo);if(q&&!ix.has(q))ix.set(q,p)});mi._pix=ix}
  mi.rows.slice(mi.hdr+1).forEach(r=>{
    if(!r.some(c=>c))return;
    const o={};MIMP[k].F.forEach(([f])=>o[f]=g(r,f));
    if(k==='sup'){
      if(!o.name){skip.nokey++;return}
      const nk=mname(o.name);
      const ex=(o.code&&db.suppliers.find(s=>s.code&&mkey(s.code)===mkey(o.code)))||db.suppliers.find(s=>mname(s.name)===nk)||(o.short&&db.suppliers.find(s=>s.short&&mname(s.short)===mname(o.short)))||null;
      const key=o.code?'c:'+mkey(o.code):'n:'+nk;if(out.has(key)){skip.dup++;return}
      out.set(key,{...o,key,ex});
    }else{
      if(!o.partNo){skip.nokey++;return}
      if(mi.buyOnly&&m.proc!=null&&o.proc&&!/구매|외주|buy|purchase|^p$/i.test(o.proc)){skip.make++;return}
      const key=mkey(o.partNo),ex=mi._pix.get(key)||null,prev=out.get(key);
      // BOM처럼 같은 부품번호가 여러 줄이면 빈 칸을 다른 줄 값으로 채움
      if(prev){MIMP.part.F.forEach(([f])=>{if(!prev[f]&&o[f])prev[f]=o[f]});return}
      out.set(key,{...o,key,ex});
    }
  });
  const L=[...out.values()];
  L.forEach(x=>{
    if(x.ex){x.diff=miDiff(k,x,x.ex);x.st=x.diff.length?'갱신':'같음';x.sim=[]}
    else{x.st='신규';x.diff=[];
      // 비슷한 기존 항목 (번호만 조금 다르거나, 이름 · 차종이 같은 것) — 같은 것을 다른 번호로 또 만드는지 확인용
      if(k==='part'){const nn=mname(x.name);x.sim=db.parts.filter(p=>!out.has(mkey(p.partNo))&&((nn&&mname(p.name)===nn&&(!x.model||!p.model||mname(p.model)===mname(x.model)))||(mnear(p.partNo,x.partNo)&&(!nn||!p.name||mname(p.name)===nn)))).slice(0,3)}
      else{const nk=mname(x.name).replace(/\s|\(.*?\)|주식회사|㈜|CO\.?,?|LTD\.?|INC\.?/g,'');x.sim=nk.length>=2?db.suppliers.filter(s=>{const sk=mname(s.name).replace(/\s|\(.*?\)|주식회사|㈜|CO\.?,?|LTD\.?|INC\.?/g,'');return sk&&(sk.includes(nk)||nk.includes(sk))}).slice(0,3):[]}
      if(x.sim.length)x.st='비슷함'}
  });
  return {L,skip};
}
function miRender(){
  const C=MIMP[mi.kind],h=mi.rows[mi.hdr]||[],{L,skip}=miData(),cnt=st=>L.filter(x=>x.st===st).length,n=cnt('신규')+cnt('비슷함'),u=cnt('갱신'),same=cnt('같음'),sim=cnt('비슷함');
  if(!mi.off)mi.off=new Set();if(!mi.filt)mi.filt='';
  const okMap=mi.map[C.key]!=null;
  const newSup=mi.kind==='part'?[...new Set(L.filter(x=>(x.supCode||x.sup)&&!((x.supCode&&supFind(x.supCode))||(x.sup&&supFind(x.sup)))).map(x=>x.sup||x.supCode))]:[];
  const cols=C.F.filter(([f])=>mi.map[f]!=null);
  const noFx=mi.kind==='part'?[...new Set(L.map(x=>miPrice(x.price,x.cur)).filter(x=>!x.bad&&x.v!==''&&x.c!=='KRW'&&!fxRate(x.c)).map(x=>x.c))]:[];
  const badCur=mi.kind==='part'?[...new Set(L.map(x=>miPrice(x.price,x.cur).bad).filter(Boolean))]:[];
  $('#miMap').innerHTML=`<div class="sec">열 연결 확인 <span class="muted" style="font-weight:normal;font-size:12px">${esc(mi.name)} · 제목행 ${mi.hdr+1}번째 줄 · 틀린 열만 바꿔주세요</span></div>
  <div class="fg">${C.F.map(([f,l,req])=>`<label>${l}${req?' *':''}<select onchange="if(this.value==='')delete mi.map.${f};else mi.map.${f}=+this.value;miRender()"><option value="">(없음)</option>${h.map((c,i)=>`<option value="${i}" ${mi.map[f]===i?'selected':''}>${esc(c||('열 '+(i+1)))}</option>`).join('')}</select></label>`).join('')}
   ${mi.kind==='part'&&mi.map.proc!=null?`<label class="full row" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" ${mi.buyOnly?'checked':''} onchange="mi.buyOnly=this.checked;miRender()"> 조달구분이 <b>구매</b>인 품목만 등록 (생산 · 반제품 · 완제품은 건너뜀)</label>`:''}</div>
  <div class="${okMap&&L.length?'help':'banner'}" style="margin-top:8px">${!okMap?`<b>${C.F.find(f=>f[0]===C.key)[1]}</b> 열을 골라주세요.`:L.length?`<b>${L.length}</b>건을 읽었습니다 — 신규 <b>${n}</b> · 갱신(바뀌는 칸 있음) <b>${u}</b> · 같음(바뀌는 것 없음) <b>${same}</b>${sim?` · <b style="color:var(--warn)">⚠ 비슷한 항목이 이미 있는 신규 ${sim}건 — 아래에서 확인 후 필요 없으면 체크를 빼세요</b>`:''}${skip.dup?` · 같은 ${C.key==='partNo'?'부품번호':'협력사'} 중복 ${skip.dup}줄 합침`:''}${skip.make?` · 생산품 ${skip.make}줄 건너뜀`:''}${skip.nokey?` · ${C.F.find(f=>f[0]===C.key)[1]} 없는 ${skip.nokey}줄 건너뜀`:''}. 빈 칸은 기존 값을 그대로 둡니다.${newSup.length?`<br>기준정보에 없는 협력사 ${newSup.length}곳(${newSup.slice(0,5).map(esc).join(', ')}${newSup.length>5?' …':''})은 새로 등록합니다.`:''}${badCur.length?`<br>⚠ 쓸 수 없는 통화 ${badCur.map(esc).join(', ')} — 이 줄들은 단가를 넣지 않습니다 (쓸 수 있는 통화: ${CURS.join(' · ')}).`:''}${noFx.length?`<br>⚠ ${noFx.join(', ')} 환율이 설정에 없습니다 — 단가는 그대로 저장되고, 설정 → 불량 관리 → 환율을 넣으면 비용이 원화로 계산됩니다.`:''}`:'읽은 줄이 없습니다. 열 연결을 확인하세요.'}</div>
  ${L.length?miTable(L,cols,{n:cnt('신규'),u,same,sim}):''}`;
}
function miCell(f,x){return esc(f==='country'?(miCountry(x[f])||x[f]):f==='region'?(miRegion(x[f])||x[f]):f==='safety'?(miSafety(x[f])||x[f]):f==='price'?(x.price?(miPrice(x.price,x.cur).bad?x.price+' (통화 확인)':fmtAmt(miPrice(x.price,x.cur).v,miPrice(x.price,x.cur).c)):''):f==='cur'?(miCur(x.cur)||x.cur):x[f])}
const MI_ST={'신규':'ok','갱신':'inf','같음':'mut','비슷함':'warn'};
function miTable(L,cols,c){
  const F=mi.filt,V=F?L.filter(x=>x.st===F):L,LB=MI_LBL[mi.kind],show=V.slice(0,400),off=mi.off;
  const chip=(k,l,nn)=>nn||!k?`<button type="button" class="b s ${F===k?'p':''}" onclick="mi.filt='${k}';miRender()">${l} ${nn}</button>`:'';
  const dcell=(x,f)=>{const d=x.diff.find(z=>z.f===f||(f==='supCode'&&z.f==='sup')||(f==='cur'&&z.f==='price'));
    if(d&&!(f==='supCode'||f==='cur'))return `<td class="mich" title="기존: ${esc(d.o||'(빈칸)')}"><span class="muted"><s>${esc(d.o||'빈칸')}</s> →</span> <b>${esc(d.n)}</b></td>`;
    return `<td${x.ex&&!d?' class="muted"':''}>${miCell(f,x)}</td>`};
  const extraD=x=>{const shown=new Set(cols.map(([f])=>f==='supCode'?'sup':f==='cur'?'price':f));const o=x.diff.filter(d=>!shown.has(d.f));return o.length?`<div class="mich" style="font-size:11.5px">${o.map(d=>`${esc(LB[d.f]||d.f)}: <s class="muted">${esc(d.o||'빈칸')}</s> → <b>${esc(d.n)}</b>`).join(' · ')}</div>`:''};
  const simH=x=>x.sim&&x.sim.length?`<div style="font-size:11.5px;color:var(--warn)">⚠ 비슷한 기존 ${mi.kind==='part'?'부품':'협력사'}: ${x.sim.map(p=>mi.kind==='part'?`<b>${esc(p.partNo)}</b> ${esc(p.name||'')}${p.model?' · '+esc(p.model):''}${p.supplierId?' · '+esc(supName(p.supplierId)):''}`:`<b>${esc(p.name)}</b>${p.code?' ('+esc(p.code)+')':''}`).join(' / ')}</div>`:'';
  return `<div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">${chip('','전체',L.length)}${chip('신규','신규',c.n)}${chip('갱신','갱신',c.u)}${chip('같음','같음',c.same)}${chip('비슷함','⚠ 비슷함',c.sim)}<span style="flex:1"></span><span class="muted" style="font-size:12px">체크를 뺀 줄은 등록하지 않습니다${off.size?` · 제외 <b>${off.size}</b>건`:''}</span></div>
  <div class="tw" style="max-height:340px;margin-top:6px"><table class="sm mip"><thead><tr><th style="width:26px"><input type="checkbox" title="보이는 줄 모두" ${V.every(x=>!off.has(x.key))?'checked':''} onchange="miOffAll(this.checked)"></th><th>상태</th>${cols.map(([,l])=>`<th>${esc(l.replace(/ \(.*\)/,''))}</th>`).join('')}</tr></thead><tbody>${show.map(x=>`<tr${off.has(x.key)?' style="opacity:.45"':''}><td><input type="checkbox" ${off.has(x.key)?'':'checked'} onchange="miOff(${jsq(x.key)},!this.checked)"></td><td class="nw"><span class="bg ${MI_ST[x.st]}">${x.st==='갱신'?'갱신 '+x.diff.length:x.st}</span></td>${cols.map(([f],i)=>i===0?`<td>${miCell(f,x)}${simH(x)}${extraD(x)}</td>`:dcell(x,f)).join('')}</tr>`).join('')}</tbody></table></div>${V.length>show.length?`<div class="muted" style="font-size:12px;margin-top:4px">${V.length}건 중 ${show.length}건 표시 — 위 버튼으로 골라 보세요</div>`:''}<div class="muted" style="font-size:12px;margin-top:4px"><b>갱신</b>: <s>기존</s> → <b>새 값</b>으로 바뀌는 칸 · <b>같음</b>: 이미 같은 내용(그대로 둠) · 같은 번호 판단은 대소문자 · 공백 · 하이픈 차이를 무시합니다.</div>`;
}
function miOff(k,v){if(!mi.off)mi.off=new Set();v?mi.off.add(k):mi.off.delete(k);miRender()}
function miOffAll(on){const {L}=miData(),V=mi.filt?L.filter(x=>x.st===mi.filt):L;V.forEach(x=>on?mi.off.delete(x.key):mi.off.add(x.key));miRender()}
function miApply(){
  const C=MIMP[mi.kind],{L}=miData();
  if(mi.map[C.key]==null||!L.length){toast('등록할 내용이 없습니다 — 파일을 고르거나 붙여넣고 열 연결을 확인하세요');return}
  const snap={db:JSON.stringify(db),ph:[]};let a=0,u=0,ns=0,same=0,off=0;
  L.forEach(o=>{
    if(mi.off&&mi.off.has(o.key)){off++;return}
    if(o.st==='같음'){same++;return}
    if(mi.kind==='sup'){
      let s=o.ex;if(s)u++;else{s={id:uid(),name:o.name,contacts:[],contactLog:[]};db.suppliers.push(s);a++}ensureContacts(s);
      if(o.name&&s.name!==o.name&&!db.suppliers.some(x=>x!==s&&x.name===o.name))s.name=o.name;
      if(o.code)s.code=o.code;if(o.items)s.items=o.items;if(!s.code)s.code=s.code||'';if(!s.items)s.items=s.items||'';
      if(o.short)s.short=o.short;if(o.address)s.address=o.address;
      const cc=miCountry(o.country);if(cc)s.country=cc;const rg=miRegion(o.region)||(cc?countryRegion(cc):'');if(rg)s.region=rg;
      if(o.contact)importContact(s,o.contact,o.phone||'',o.email||'',o.dept||'');
      syncLegacy(s);touch(s);
    }else{
      let sid='';const sKey=o.supCode||o.sup;if(sKey){let s=(o.supCode&&supFind(o.supCode))||(o.sup&&supFind(o.sup));if(!s){const sp=supSplit(o.sup);s=touch({id:uid(),code:o.supCode||(sp?sp.code:''),name:sp?sp.name:(o.sup||o.supCode),items:'',contact:'',phone:'',email:''});db.suppliers.push(s);ns++}sid=s.id}
      let p=o.ex;if(p)u++;else{p={id:uid(),partNo:o.partNo};db.parts.push(p);a++}
      if(o.name)p.name=o.name;else if(p.name==null)p.name='';
      if(o.model)p.model=o.model;else if(p.model==null)p.model='';
      if(sid)p.supplierId=sid;else if(p.supplierId==null)p.supplierId='';
      const pc=miPrice(o.price,o.cur);if(pc.bad){if(p.price==null)p.price=''}else if(pc.v!==''){p.price=pc.v;if(pc.c==='KRW')delete p.currency;else p.currency=pc.c}else if(p.price==null)p.price='';
      if(!pc.bad&&pc.v===''&&o.cur){if(pc.c==='KRW')delete p.currency;else p.currency=pc.c}
      const sf=miSafety(o.safety);if(sf)p.safety=sf;
      touch(p);
    }
  });
  save();closeModal(true);render();
  toast(`${mi.kind==='sup'?'협력사':'부품'} 신규 ${a}건 · 갱신 ${u}건${same?` · 같음 ${same}건(그대로)`:''}${off?` · 제외 ${off}건`:''}${ns?` · 협력사 ${ns}곳 추가`:''}`);
  if(a||u)offerUndo(snap,`${C.title}: 신규 ${a}건 · 갱신 ${u}건`);
}

