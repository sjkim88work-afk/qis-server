/* ================= BOM (다단계: MES 'BOM 구성현황' 형식) =================
   db.bom = {updatedAt, fg:{제품품번:{name,model,type,proc,date}},
             rows:[{fgNo,fgName,model, partNo,partName,qty(U/S),level,parentNo,type,proc,unit,pmodel,seq}]}
   · fgNo = 최상위 제품(레벨 0), parentNo = 바로 위 품번, qty = 상위 1개당 소요량(U/S)
   · model = 제품의 차종(목록 묶음용), pmodel = 그 부품 자체의 차종
   · 예전 1단계 BOM 줄(level 없음)은 레벨 1 · 상위 = 제품으로 본다 */
let _bomIx=null,_bomKey='',_bomRI=new WeakMap();  // 줄별 계산값(총 소요량 · 하위 수)은 저장하지 않고 따로 둠
const bTot=r=>_bomRI.get(r)?.tot??r.qty,bKids=r=>_bomRI.get(r)?.kids||0;
const bomLv=r=>r.level==null||r.level===''?1:+r.level;
function bomIx(){
  const k=(db.bom.updatedAt||'')+'|'+db.bom.rows.length+'|'+Object.keys(db.bom.fg||{}).length;if(_bomIx&&_bomKey===k)return _bomIx;
  const byFg=new Map(),byPart=new Map(),add=(m,k,r)=>{if(!m.has(k))m.set(k,[]);m.get(k).push(r)};
  Object.keys(db.bom.fg||{}).forEach(f=>byFg.set(f,[]));
  db.bom.rows.forEach(r=>{add(byFg,r.fgNo,r);add(byPart,r.partNo,r)});
  // 제품별로 순서대로 정렬하고, 위로 거슬러 곱한 총 소요량(tot)을 계산
  _bomRI=new WeakMap();
  byFg.forEach(rs=>{rs.sort((a,b)=>(a.seq??0)-(b.seq??0));const st=[];rs.forEach(r=>{const lv=bomLv(r);st.length=lv;const up=lv>1?st[lv-1]:null,ui=up&&_bomRI.get(up);
    _bomRI.set(r,{tot:(r.qty===''||r.qty==null?1:+r.qty)*(ui?ui.tot:1),kids:0});if(ui)ui.kids++;st[lv]=r})});
  _bomKey=k;return _bomIx={byFg,byPart};
}
const bomQ=v=>v===''||v==null?'-':String(+(+v).toFixed(4));
const bomFg=fg=>{const m=(db.bom.fg||{})[fg]||{},rs=bomIx().byFg.get(fg)||[];return {name:m.name||rs.find(r=>r.fgName)?.fgName||partByNo(fg)?.name||'',model:m.model||rs.find(r=>r.model)?.model||'',type:m.type||'',proc:m.proc||'',date:m.date||''}};
// 부품 → BOM 사용 현황 (번호 표기 차이 무시): 들어가는 제품 · 자신이 제품(레벨 0)인지
let _bpIx=null,_bpKey='';
function bomPartUse(p){
  const ix=bomIx();if(_bpKey!==_bomKey||!_bpIx){const m=new Map(),g=k=>{if(!m.has(k))m.set(k,{fgs:new Set(),fg:false});return m.get(k)};
    ix.byPart.forEach((rs,pn)=>{const e=g(mkey(pn));rs.forEach(r=>{if(r.fgNo&&mkey(r.fgNo)!==mkey(pn))e.fgs.add(r.fgNo)})});
    ix.byFg.forEach((rs,fg)=>{g(mkey(fg)).fg=true});_bpIx=m;_bpKey=_bomKey}
  return _bpIx.get(mkey(p.partNo))||{fgs:new Set(),fg:false};
}
const bomUseN=p=>{const u=bomPartUse(p);return u.fgs.size+(u.fg?0.5:0)};
function bomGo(pn){msState.bq=pn;const b=$('#msBom');if(!b)return;const i=b.parentElement.querySelector('input');if(i)i.value=pn;b.innerHTML=bomTable();b.parentElement.scrollIntoView({behavior:'smooth',block:'start'})}
function bomImpactHTML(partNo,fgNo,pick){
  const pn=String(partNo||'').trim();if(!db.bom.rows.length||!pn)return '';
  const ix=bomIx(),k=mkey(pn);let used=[];ix.byPart.forEach((rs,p)=>{if(mkey(p)===k)used=used.concat(rs)});   // 번호 표기 차이(대소문자 · 공백 · 하이픈) 무시
  if(!used.length)return `<div class="bomx muted">📦 BOM에 없는 부품입니다 — 이 부품이 들어가는 제품을 알 수 없습니다.</div>`;
  const fgsU=[...new Set(used.map(r=>r.fgNo))];
  const models=[...new Set(fgsU.map(f=>bomFg(f).model).filter(Boolean))].sort(kcmp);
  const fg=String(fgNo||'').trim(),notIn=fg&&ix.byFg.has(fg)&&!used.some(r=>r.fgNo===fg);
  const L=[...used].sort((a,b)=>kcmp(bomFg(a.fgNo).model||'~',bomFg(b.fgNo).model||'~')||kcmp(a.fgNo,b.fgNo));
  // 처음엔 접어 두고(드롭다운), 누르면 제품 목록 표 — 열고 닫은 상태는 기억
  const open=!!bomImpactHTML.open;
  return `<details class="bomx bomdd" ${open?'open':''} ontoggle="bomImpactHTML.open=this.open">
    <summary><b>📦 영향 범위</b> — 이 부품이 들어가는 제품 <b>${fgsU.length}개</b>${models.length?` · 차종 <b>${models.map(esc).join(', ')}</b>`:''} <span class="muted ddh">— 눌러서 제품 목록 보기</span></summary>
    <div class="tw" style="max-height:240px;margin-top:6px"><table class="sm"><thead><tr><th>차종</th><th>제품 품번</th><th>제품명</th><th>바로 위 품번</th><th class="n">레벨</th><th class="n">제품 1개당</th></tr></thead><tbody>
    ${L.map(r=>{const m=bomFg(r.fgNo),up=r.parentNo&&r.parentNo!==r.fgNo?r.parentNo:'';return `<tr class="${r.fgNo===fg?'on':''}${pick?' bpick':''}" ${pick?`onclick="bomPickFg(${jsq(r.fgNo)})" title="눌러서 완성품 품번으로 입력"`:''}><td class="nw">${esc(m.model||'')}</td><td class="nw"><b>${esc(r.fgNo)}</b></td><td>${esc(m.name||'')}</td><td class="nw muted">${esc(up||'(제품에 바로)')}</td><td class="n">${esc(bomLv(r))}</td><td class="n">×${bomQ(bTot(r))}</td></tr>`}).join('')}
    </tbody></table></div>${pick?'<div class="muted" style="margin-top:4px">줄을 누르면 완성품 품번으로 입력됩니다.</div>':''}
    ${notIn?`<div style="color:var(--warn);margin-top:6px">⚠ 입력한 완성품(${esc(fg)})의 BOM에는 이 부품이 없습니다. 번호를 확인하세요.</div>`:''}</details>`;
}
function bomDefect(){const f=$('#mf'),b=$('#bomBox');if(f&&b&&f.partNo)b.innerHTML=bomImpactHTML(f.partNo.value,f.fgNo&&f.fgNo.value,true)}
function bomNcr(){const f=$('#mf'),b=$('#ncrBom');if(f&&b&&f.partNo)b.innerHTML=bomImpactHTML(f.partNo.value,'',false)}
function bomPickFg(fg){const f=$('#mf');if(!f||!f.fgNo)return;f.fgNo.value=fg;f.fgNo.dispatchEvent(new Event('input',{bubbles:true}));onFgNo(fg);srcLayout();mfDirty=true}

/* ---- 화면: 왼쪽 제품 목록(차종별) · 오른쪽 선택 제품의 구성 트리 ---- */
const bomCol=new Set();   // 접은 줄 (제품|seq)
function bomHit(fg,w){const m=bomFg(fg);if(!w.length)return true;const rs=bomIx().byFg.get(fg)||[];
  const h=[fg,m.name,m.model,...rs.flatMap(r=>[r.partNo,r.partName,r.pmodel])].join(' ').toLowerCase();return w.every(x=>h.includes(x))}
function bomTable(){
  const ix=bomIx();
  if(!ix.byFg.size)return `<div class="muted" style="padding:6px 2px">아직 BOM이 없습니다. <b>BOM 업로드</b>로 MES · ERP의 BOM 구성현황(레벨 · 품번 · 품명 · U/S)을 올리면 제품별 구성 트리가 보이고, 불량 등록 때 완성품의 구성 부품을 고르거나 부품이 들어가는 제품 · 차종(영향 범위)을 볼 수 있습니다.</div>`;
  const w=String(msState.bq||'').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const fgs=[...ix.byFg.keys()].filter(f=>bomHit(f,w)).map(f=>({f,...bomFg(f),n:ix.byFg.get(f).length}))
    .sort((a,b)=>kcmp(a.model||'~',b.model||'~')||kcmp(a.f,b.f));
  if(!fgs.some(x=>x.f===msState.bomSel))msState.bomSel=fgs[0]?.f||'';
  const groups=[];fgs.forEach(x=>{const g=groups[groups.length-1];if(g&&g.m===(x.model||'-'))g.L.push(x);else groups.push({m:x.model||'-',L:[x]})});
  const miss=[...ix.byPart.keys()].filter(pn=>!partByNo(pn)).length;
  const left=`<div class="tw bomL"><table class="mst"><colgroup><col style="width:82px"><col style="width:120px"><col><col style="width:84px"><col style="width:46px"></colgroup>
    <thead><tr><th>차종</th><th>품번</th><th>품명</th><th>적용일자</th><th class="n">건수</th></tr></thead><tbody>
    ${groups.map(g=>g.L.map((x,i)=>`<tr class="bsel${x.f===msState.bomSel?' on':''}" data-fg="${esc(x.f)}" onclick="bomSelect(this.dataset.fg)">${i?'':`<td rowspan="${g.L.length}" class="bgrp">${esc(g.m)}</td>`}<td class="nw">${esc(x.f)}</td><td class="nw" title="${esc(x.name)}">${esc(x.name)}</td><td class="nw">${esc(x.date)}</td><td class="n">${x.n}</td></tr>`).join('')).join('')||'<tr><td colspan="5" class="muted" style="text-align:center;padding:16px">검색 결과가 없습니다.</td></tr>'}
    </tbody></table></div>`;
  return `<div class="help" style="margin-bottom:6px">제품 <b>${ix.byFg.size}</b>개 · 구성 <b>${db.bom.rows.length}</b>줄 · 부품 <b>${ix.byPart.size}</b>종${miss?` · <span style="color:var(--warn)">기준정보에 없는 품번 ${miss}종</span> (생산품 · 반제품은 정상)`:''} · 업로드 ${esc(loc(db.bom.updatedAt)||'-')}</div>
  <div class="bomw">${left}<div id="bomR">${bomTreeHTML(msState.bomSel,w)}</div></div>`;
}
function bomSelect(fg){msState.bomSel=fg;document.querySelectorAll('.bomL tr.bsel').forEach(tr=>tr.classList.toggle('on',tr.dataset.fg===fg));
  const w=String(msState.bq||'').trim().toLowerCase().split(/\s+/).filter(Boolean);const r=$('#bomR');if(r)r.innerHTML=bomTreeHTML(fg,w)}
function bomToggle(fg,seq){const k=fg+'|'+seq;bomCol.has(k)?bomCol.delete(k):bomCol.add(k);bomSelect(fg)}
function bomTreeHTML(fg,w){
  if(!fg)return '<div class="muted" style="padding:16px">왼쪽에서 제품을 고르세요.</div>';
  const m=bomFg(fg),rs=bomIx().byFg.get(fg)||[],hit=r=>w&&w.length&&w.some(x=>[r.partNo,r.partName].join(' ').toLowerCase().includes(x));
  let hide=99;const out=[];
  rs.forEach(r=>{const lv=bomLv(r);if(lv>hide)return;hide=99;if(bomCol.has(fg+'|'+r.seq))hide=lv;out.push(r)});
  const tr=(lv,r,isRoot)=>{const p=isRoot?partByNo(fg):partByNo(r.partNo),kids=isRoot?rs.length:bKids(r),col=!isRoot&&bomCol.has(fg+'|'+r.seq);
    return `<tr class="${isRoot?'broot':''}${!isRoot&&hit(r)?' bhit':''}"><td class="nw" style="padding-left:${8+lv*16}px">${kids&&!isRoot?`<a class="btg" onclick="bomToggle(${jsq(fg)},${r.seq})">${col?'⊞':'⊟'}</a>`:isRoot?'<span class="btg">⊟</span>':'<span class="btg"></span>'}${lv}</td>
      <td class="nw">${esc(isRoot?m.type:r.type||'')}</td><td class="nw">${esc(isRoot?m.proc:r.proc||'')}</td><td class="nw">${esc(isRoot?m.model:r.pmodel||'')}</td>
      <td class="nw"><b>${esc(isRoot?fg:r.partNo)}</b></td><td>${esc(isRoot?m.name:(r.partName||p?.name||''))}</td>
      <td class="nw">${p&&p.supplierId?esc(supName(p.supplierId)):'<span class="muted">-</span>'}</td><td class="nw">${esc(isRoot?'EA':r.unit||'')}</td>
      <td class="n" title="${isRoot?'':`제품 1개당 총 ${bomQ(bTot(r))}`}">${isRoot?'1':bomQ(r.qty)}</td></tr>`};
  return `<div class="row" style="margin:0 0 6px;gap:8px;align-items:baseline"><b style="font-size:14px">${esc(fg)}</b><span>${esc(m.name)}</span>${m.model?`<span class="bg inf">${esc(m.model)}</span>`:''}${m.type?`<span class="bg mut">${esc(m.type)}</span>`:''}<span class="sp" style="flex:1"></span><span class="muted" style="font-size:12px">구성 ${rs.length}줄${rs.some(r=>bKids(r))?` · <a class="lk" onclick="bomFold(${jsq(fg)},1)">모두 접기</a> · <a class="lk" onclick="bomFold(${jsq(fg)},0)">모두 펼치기</a>`:''}</span></div>
  <div class="tw bomT"><table class="mst"><colgroup><col style="width:86px"><col style="width:70px"><col style="width:84px"><col style="width:70px"><col style="width:118px"><col><col style="width:130px"><col style="width:62px"><col style="width:52px"></colgroup>
  <thead><tr><th>레벨</th><th>품목유형</th><th>조달구분</th><th>차종</th><th>품번</th><th>품명</th><th>협력사</th><th>소요단위</th><th class="n">U/S</th></tr></thead><tbody>
  ${tr(0,null,true)}${out.map(r=>tr(bomLv(r),r,false)).join('')}</tbody></table></div>`;
}
function bomFold(fg,close){(bomIx().byFg.get(fg)||[]).forEach(r=>{const k=fg+'|'+r.seq;if(close&&bKids(r))bomCol.add(k);else bomCol.delete(k)});bomSelect(fg)}
function exportBomCSV(){
  const ix=bomIx(),out=[['제품 품번','제품명','제품 차종','레벨','상위 품번','품번','품명','품목유형','조달구분','차종','소요단위','U/S','제품 1개당 소요량']];
  [...ix.byFg.keys()].sort(kcmp).forEach(f=>{const m=bomFg(f);out.push([f,m.name,m.model,0,'',f,m.name,m.type,m.proc,m.model,'EA',1,1]);
    ix.byFg.get(f).forEach(r=>out.push([f,m.name,m.model,bomLv(r),r.parentNo||f,r.partNo,r.partName,r.type||'',r.proc||'',r.pmodel||'',r.unit||'',r.qty,bomQ(bTot(r))]))});
  downloadCSV(`BOM_${today()}.csv`,out);
}
async function bomClear(){
  if(!await askConfirm({title:'BOM을 모두 지울까요?',msg:`제품 ${bomIx().byFg.size}개 · ${db.bom.rows.length}줄이 삭제됩니다. 불량·NCR 기록은 그대로입니다.`,ok:'전체 삭제'}))return;
  const snap={db:JSON.stringify(db),ph:[]};db.bom={updatedAt:now(),rows:[],fg:{}};save();render();offerUndo(snap,'BOM 전체 삭제');
}
/* ---- BOM 업로드 (xlsx · csv · 붙여넣기) — 레벨 열이 있으면 다단계, 없으면 1단계(모품번 – 자품번) ---- */
const BOM_F=[['level','레벨'],['fgNo','제품(모품) 품번'],['fgName','제품명'],['partNo','품번 (투입품번)',1],['partName','품명'],['type','품목유형'],['proc','조달구분'],['model','차종'],['unit','소요단위'],['qty','U/S (소요량)'],['date','적용일자']];
let bi={rows:[],hdr:0,map:{},name:'',mode:'fg'};
const BOM_HEAD='레벨\t선택\t품목유형\t조달구분\t차종\t품번\t\t품명\t\t소요단위\tU/S';  // MES 'BOM 구성현황' 복사 형식
function bomAutoMap(h){
  const m={},used=new Set(),cell=i=>String(h[i]||'').replace(/\s+/g,'').toLowerCase();
  const tests=[ // 단위 · 조달 · 유형 · 제품명을 먼저 판정해야 ‘소요단위’가 소요량으로, ‘모품명’이 품번으로 잡히지 않음
    ['date',c=>/적용일|effective|validfrom|^date$|^일자$/.test(c)],
    ['unit',c=>/단위|unit|uom/.test(c)],
    ['level',c=>/레벨|level|^lv|단계|depth/.test(c)],
    ['proc',c=>/조달|구매구분|procure|makebuy|자작/.test(c)],
    ['type',c=>/품목유형|유형|itemtype|^type$/.test(c)],
    ['fgName',c=>/(모품|상위|완성품|부모|assy|parent|fg|^제품).*(명|name)/.test(c)],
    ['partName',c=>/(자품|하위|구성품|부품|자재|투입|component|child|part|item).*(명|name)|^품명$|description|규격/.test(c)],
    ['fgNo',c=>/(모품|상위|완성품|부모|assy|parent|^fg|^제품)/.test(c)],
    ['partNo',c=>/(자품|하위|구성품|부품|자재|투입|component|child|partno|part|item|^품번$|^품목코드$)/.test(c)],
    ['model',c=>/차종|model|vehicle|car|프로젝트|project/.test(c)],
    ['qty',c=>/u\/s|^us$|소요|수량|qty|usage|quantity|qpa|원단위/.test(c)]];
  tests.forEach(([k,t])=>{for(let i=0;i<h.length;i++){if(used.has(i))continue;if(t(cell(i))){m[k]=i;used.add(i);break}}});
  return m;
}
function openBomImport(){
  bi={rows:[],hdr:0,map:{},name:'',mode:'fg'};
  openModal('BOM 업로드',`<div class="help">MES · ERP의 BOM을 엑셀(.xlsx) · CSV로 올리거나, 화면의 표를 복사해 붙여넣으세요. 제목행과 열은 자동으로 찾습니다.<br>
   <b>다단계 (MES ‘BOM 구성현황’)</b>: 레벨 · 품번 · 품명 · 품목유형 · 조달구분 · 차종 · 소요단위 · U/S — <b>레벨 0 줄이 제품</b>이고, 그 아래 레벨 1 · 2 …를 상위 품번에 붙입니다. 여러 제품을 이어 붙여도 레벨 0마다 새 제품으로 나눕니다.<br>
   <b>1단계 (ERP 정전개)</b>: 모품번(제품) · 자품번 · 소요량 열이 있으면 그대로 읽습니다.</div>
  <div class="row" style="margin-top:10px"><label class="b p" style="cursor:pointer">파일 선택 (.xlsx / .csv)<input type="file" accept=".xlsx,.csv,.txt" style="display:none" onchange="bomFile(this.files[0]);this.value=''"></label><span id="bomSheet"></span><span id="bomName" class="muted"></span></div>
  <div class="muted" style="font-size:12px;margin-top:8px">또는 MES 화면의 표를 복사해 아래 <b>제목행 다음 줄</b>에 붙여넣기 (Ctrl+V) — 레벨 0(제품) 줄부터 복사하세요</div>
  <textarea id="bomPaste" style="min-height:120px;margin-top:4px;font-family:Consolas,monospace;font-size:12px;white-space:pre;tab-size:10" oninput="bomSet(parseRows(this.value),'붙여넣기')">${esc(BOM_HEAD)}
</textarea>
  <div id="bomMap" style="margin-top:10px"></div>`,
  [{label:'취소',fn:closeModal},{label:'등록',cls:'p',fn:bomApply}]);
  setTimeout(()=>{const t=$('#bomPaste');if(t){t.focus();t.setSelectionRange(t.value.length,t.value.length)}},50);
}
function bomFile(f){return sheetFile(f,bi,'#bomSheet','bomSet','bi')}
function bomSet(rows,name){
  rows=(rows||[]).map(r=>(r||[]).map(c=>String(c??'').trim()));
  if(rows.filter(r=>r.some(c=>c)).length<2){$('#bomMap').innerHTML='<div class="muted">제목행과 데이터가 있는 범위를 넣어주세요.</div>';return}
  let best=-1,bh=0;rows.slice(0,15).forEach((r,i)=>{const c=Object.keys(bomAutoMap(r)).length;if(c>best){best=c;bh=i}});
  bi.rows=rows;bi.hdr=bh;bi.map=bomAutoMap(rows[bh]);bi.name=name;bomRenderMap();
}
// 읽은 줄 → {rows, fg(제품 정보), noRoot(레벨 0 없이 시작한 줄 수)}
function bomData(){
  const m=bi.map,g=(r,k)=>m[k]!=null&&m[k]>=0?String(r[m[k]]??'').trim():'';
  const num4=v=>{const q=String(v||'').replace(/,/g,'');return q===''||!isFinite(+q)?'':+q};
  const rows=[],fg={};let noRoot=0,seq=0;
  if(m.level==null&&m.fgNo==null){  // MES 왼쪽 'BOM 구성품목' 목록 (차종 · 품번 · 품명 · 적용일자) → 제품 정보만
    let lastM='';bi.rows.slice(bi.hdr+1).forEach(r=>{if(!r.some(c=>c))return;const pn=g(r,'partNo');const md=g(r,'model');if(md)lastM=md;if(!pn)return;
      fg[pn]={name:g(r,'partName'),model:md||lastM,date:g(r,'date'),type:g(r,'type'),proc:g(r,'proc')}});
    return {rows,fg,noRoot,metaOnly:true};
  }
  if(m.level!=null){
    let cur=null,st=[];
    bi.rows.slice(bi.hdr+1).forEach(r=>{
      if(!r.some(c=>c))return;const lm=g(r,'level').match(/\d+/),pn=g(r,'partNo');if(!lm||!pn)return;const lv=+lm[0];
      if(lv===0){cur=g(r,'fgNo')||pn;fg[cur]={name:g(r,'partName')||g(r,'fgName'),model:g(r,'model'),type:g(r,'type'),proc:g(r,'proc'),date:g(r,'date')};st=[cur];return}
      const fcol=g(r,'fgNo');if(fcol&&fcol!==cur){cur=fcol;fg[cur]=fg[cur]||{name:g(r,'fgName'),model:'',type:'',proc:'',date:''};st=[cur]}
      if(!cur){noRoot++;return}
      const parent=st[lv-1]||cur;st[lv]=pn;st.length=lv+1;
      rows.push({fgNo:cur,fgName:fg[cur].name,model:fg[cur].model,partNo:pn,partName:g(r,'partName'),qty:num4(g(r,'qty')),level:lv,parentNo:parent,type:g(r,'type'),proc:g(r,'proc'),unit:g(r,'unit'),pmodel:g(r,'model'),seq:seq++});
    });
  }else{
    const out=new Map();let last={fgNo:'',fgName:'',model:''};
    bi.rows.slice(bi.hdr+1).forEach(r=>{
      if(!r.some(c=>c))return;
      let fgNo=g(r,'fgNo');const partNo=g(r,'partNo');
      if(fgNo)last={fgNo,fgName:g(r,'fgName'),model:g(r,'model')};else if(partNo&&last.fgNo)fgNo=last.fgNo;
      if(!fgNo||!partNo||fgNo===partNo)return;
      const qty=num4(g(r,'qty')),key=fgNo+'\u0001'+partNo,x=out.get(key);
      if(x){if(qty!=='')x.qty=(x.qty===''?0:x.qty)+qty;return}  // 같은 제품에 같은 부품이 여러 줄이면 소요량 합산
      const fgName=g(r,'fgName')||(fgNo===last.fgNo?last.fgName:''),model=g(r,'model')||(fgNo===last.fgNo?last.model:'');
      if(!fg[fgNo])fg[fgNo]={name:fgName,model,type:'',proc:'',date:g(r,'date')};
      out.set(key,{fgNo,fgName,model,partNo,partName:g(r,'partName'),qty,level:1,parentNo:fgNo,type:g(r,'type'),proc:g(r,'proc'),unit:g(r,'unit'),pmodel:'',seq:seq++});
    });
    rows.push(...out.values());
  }
  return {rows,fg,noRoot};
}
function bomRenderMap(){
  const h=bi.rows[bi.hdr]||[],D=bomData(),fgs=Object.keys(D.fg),tree=bi.map.level!=null;
  const okMap=bi.map.partNo!=null;
  $('#bomMap').innerHTML=`<div class="sec">열 연결 확인 <span class="muted" style="font-weight:normal;font-size:12px">${esc(bi.name)} · 제목행 ${bi.hdr+1}번째 줄 · ${D.metaOnly?'<b>제품 목록</b> (차종 · 품번 · 품명 · 적용일자 — 구성은 그대로)':tree?'<b>다단계</b> (레벨 열 기준)':'1단계 (모품번 – 자품번)'} · 틀린 열만 바꿔주세요</span></div>
  <div class="fg">${BOM_F.map(([k,l,req])=>`<label>${l}${req?' *':''}<select onchange="if(this.value==='')delete bi.map.${k};else bi.map.${k}=+this.value;bomRenderMap()"><option value="">(없음)</option>${h.map((c,i)=>`<option value="${i}" ${bi.map[k]===i?'selected':''}>${esc(c||('열 '+(i+1)))}</option>`).join('')}</select></label>`).join('')}
   <label class="full">등록 방식<select onchange="bi.mode=this.value"><option value="fg" ${bi.mode==='fg'?'selected':''}>올린 제품만 새 내용으로 교체 — 나머지 제품의 BOM은 그대로 (권장)</option><option value="all" ${bi.mode==='all'?'selected':''}>전체 교체 — 기존 BOM을 모두 지우고 이 파일로 바꿈</option></select></label></div>
  <div class="${okMap&&fgs.length?'help':'banner'}" style="margin-top:8px">${!okMap?'<b>품번</b> 열과 <b>레벨</b>(또는 제품 품번) 열을 골라주세요.':fgs.length?D.metaOnly?`제품 <b>${fgs.length}</b>개의 차종 · 품명 · 적용일자를 등록합니다. 구성(트리)은 바뀌지 않습니다 — 구성은 레벨이 있는 BOM 구성현황 표로 올리세요.`:`제품 <b>${fgs.length}</b>개 (${fgs.slice(0,4).map(esc).join(', ')}${fgs.length>4?' …':''}) · 구성 <b>${D.rows.length}</b>줄을 읽었습니다.${D.noRoot?`<br>⚠ 레벨 0(제품) 줄 없이 시작한 ${D.noRoot}줄은 어느 제품인지 몰라 건너뜁니다 — 표를 복사할 때 레벨 0 줄까지 포함하세요.`:''}`:'읽은 제품이 없습니다. 레벨 0(제품) 줄이 포함됐는지, 열 연결이 맞는지 확인하세요.'}</div>
  ${D.rows.length?`<div class="tw" style="max-height:220px;margin-top:6px"><table class="sm mip"><thead><tr><th>제품</th><th>레벨</th><th>상위 품번</th><th>품번</th><th>품명</th><th>유형</th><th>조달</th><th class="n">U/S</th></tr></thead><tbody>${D.rows.slice(0,10).map(r=>`<tr><td>${esc(r.fgNo)}</td><td style="padding-left:${6+r.level*10}px">${r.level}</td><td>${esc(r.parentNo)}</td><td>${esc(r.partNo)}</td><td>${esc(r.partName)}</td><td>${esc(r.type)}</td><td>${esc(r.proc)}</td><td class="n">${bomQ(r.qty)}</td></tr>`).join('')}</tbody></table></div>${D.rows.length>10?`<div class="muted" style="font-size:12px;margin-top:4px">${D.rows.length}줄 중 10줄 미리보기</div>`:''}`:''}`;
}
function bomApply(){
  const D=bomData(),fgs=new Set(Object.keys(D.fg));
  if(!fgs.size){toast('등록할 BOM이 없습니다 — 파일을 고르거나 붙여넣고 열 연결을 확인하세요');return}
  const snap={db:JSON.stringify(db),ph:[]};
  if(D.metaOnly){const F={...(db.bom.fg||{})};Object.entries(D.fg).forEach(([k,v])=>{const o={...(F[k]||{})};Object.entries(v).forEach(([kk,vv])=>{if(vv)o[kk]=vv});F[k]=o});
    db.bom={...db.bom,updatedAt:now(),fg:F};save();closeModal(true);render();toast(`제품 정보 ${fgs.size}개 등록`);offerUndo(snap,`BOM 제품 목록: ${fgs.size}개`);return}
  const keep=bi.mode==='all'?[]:db.bom.rows.filter(r=>!fgs.has(r.fgNo));
  const fgKeep=bi.mode==='all'?{}:Object.fromEntries(Object.entries(db.bom.fg||{}).filter(([k])=>!fgs.has(k)));
  const base=keep.reduce((a,r)=>Math.max(a,(r.seq??0)+1),0);
  const oldFg=db.bom.fg||{},newFg={};Object.entries(D.fg).forEach(([k,v])=>{const o={...(bi.mode==='all'?{}:oldFg[k]||{})};Object.entries(v).forEach(([kk,vv])=>{if(vv)o[kk]=vv});newFg[k]=o});  // 제품 목록으로 넣은 적용일자 등은 유지
  db.bom={updatedAt:now(),rows:[...keep,...D.rows.map(r=>({...r,seq:r.seq+base}))],fg:{...fgKeep,...newFg}};
  msState.bomSel=[...fgs][0];
  save();closeModal(true);render();
  toast(`BOM 등록: 제품 ${fgs.size}개 · ${D.rows.length}줄${keep.length?` (기존 제품 ${new Set(keep.map(r=>r.fgNo)).size}개 유지)`:''}`);
  offerUndo(snap,`BOM 업로드: 제품 ${fgs.size}개`);
}

