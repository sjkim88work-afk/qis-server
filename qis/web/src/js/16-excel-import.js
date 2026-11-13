/* ================= 엑셀 일괄 등록 (xlsx / csv / 붙여넣기) ================= */
async function inflateRaw(u8){
  if(!window.DecompressionStream)throw new Error('이 브라우저는 xlsx 읽기를 지원하지 않습니다. CSV로 저장하거나 붙여넣기를 이용하세요.');
  const st=new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(st).arrayBuffer());
}
function unzip(buf){
  const u=new Uint8Array(buf),v=new DataView(buf),td=new TextDecoder();
  let e=u.length-22;while(e>=0&&v.getUint32(e,true)!==0x06054b50)e--;
  if(e<0)throw new Error('xlsx 형식이 아닙니다 (구버전 .xls는 엑셀에서 “다른 이름으로 저장 → .xlsx” 후 사용하세요)');
  const n=v.getUint16(e+10,true);let p=v.getUint32(e+16,true);const files={};
  for(let i=0;i<n;i++){
    const method=v.getUint16(p+10,true),csize=v.getUint32(p+20,true),nl=v.getUint16(p+28,true),xl=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),off=v.getUint32(p+42,true);
    files[td.decode(u.subarray(p+46,p+46+nl))]={method,csize,off};p+=46+nl+xl+cl;
  }
  return async name=>{const f=files[name];if(!f)return null;
    const st=f.off+30+v.getUint16(f.off+26,true)+v.getUint16(f.off+28,true),data=u.subarray(st,st+f.csize);
    return td.decode(f.method===0?data:await inflateRaw(data))};
}
const xmlDoc=t=>new DOMParser().parseFromString(t,'application/xml');
const tagsNS=(el,t)=>[...el.getElementsByTagNameNS('*',t)];
function colIdx(ref){const m=/^([A-Z]+)/.exec(ref||'');if(!m)return -1;let n=0;for(const ch of m[1])n=n*26+ch.charCodeAt(0)-64;return n-1}
async function readXlsx(buf){
  const get=unzip(buf),wb=await get('xl/workbook.xml');if(!wb)throw new Error('엑셀 통합문서를 찾을 수 없습니다');
  const rels={};const rx=await get('xl/_rels/workbook.xml.rels');
  if(rx)tagsNS(xmlDoc(rx),'Relationship').forEach(r=>{let t=r.getAttribute('Target');t=t.startsWith('/')?t.slice(1):'xl/'+t;rels[r.getAttribute('Id')]=t});
  const ssx=await get('xl/sharedStrings.xml');
  const ss=ssx?tagsNS(xmlDoc(ssx),'si').map(si=>tagsNS(si,'t').map(t=>t.textContent).join('')):[];
  const sheets={};
  for(const sh of tagsNS(xmlDoc(wb),'sheet')){
    const rid=sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||sh.getAttribute('r:id');
    const x=await get(rels[rid]||'');if(!x)continue;
    const rows=[];
    tagsNS(xmlDoc(x),'row').forEach(r=>{
      const ri=(parseInt(r.getAttribute('r'))||rows.length+1)-1,row=[];
      tagsNS(r,'c').forEach((c,k)=>{
        const ci=c.getAttribute('r')?colIdx(c.getAttribute('r')):k,t=c.getAttribute('t'),vEl=tagsNS(c,'v')[0];
        let val=vEl?vEl.textContent:'';
        if(t==='s')val=ss[+val]??'';else if(t==='inlineStr')val=tagsNS(c,'t').map(e=>e.textContent).join('');
        else if(t==='b')val=val==='1'?'TRUE':'FALSE';else if((!t||t==='n')&&val!=='')val=Number(val);
        row[ci]=val;
      });
      rows[ri]=row;
    });
    sheets[sh.getAttribute('name')]=Array.from(rows,r=>Array.from(r||[],c=>c??''));
  }
  return sheets;
}
/* 파일(xlsx · csv) 하나를 읽어 시트 선택 상자를 채우고 set(rows, fileName) 를 부름 — 협력사 성적서 · 입고 · 기준정보 · BOM 공용
   st: 시트를 담을 상태 객체(st.sheets) · selId: 시트 선택 상자 id · setName: 전역 함수 이름(onchange 문자열에 들어가므로 이름으로) · stName: st 의 전역 이름 */
async function sheetFile(f,st,selId,setName,stName){
  if(!f)return;
  const set=window[setName];
  try{const buf=await f.arrayBuffer();
    if(/\.xlsx$/i.test(f.name)){const sh=await readXlsx(buf),names=Object.keys(sh);if(!names.length)throw new Error('읽을 수 있는 시트가 없습니다');st.sheets=sh;const cur=names.find(n=>sh[n].length>1)||names[0];
      $(selId).innerHTML=names.length>1?`시트 <select onchange="${setName}(${stName}.sheets[this.value],${jsq(f.name)})">${names.map(n=>`<option ${n===cur?'selected':''}>${esc(n)}</option>`).join('')}</select>`:'';set(sh[cur],f.name)}
    else if(/\.xls$/i.test(f.name))throw new Error('구버전 .xls는 엑셀에서 .xlsx로 저장 후 선택하세요');
    else set(parseCSV(decodeText(buf)),f.name);
  }catch(e){toast('파일 읽기 실패: '+e.message)}
}

function parseCSV(t){
  const rows=[];let row=[],cur='',q=false;
  const sep=(t.split(/\r?\n/)[0]||'').includes('\t')?'\t':',';
  for(let i=0;i<t.length;i++){const ch=t[i];
    if(q){if(ch==='"'){if(t[i+1]==='"'){cur+='"';i++}else q=false}else cur+=ch}
    else if(ch==='"')q=true;else if(ch===sep){row.push(cur);cur=''}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;row.push(cur);rows.push(row);row=[];cur=''}
    else cur+=ch}
  if(cur!==''||row.length){row.push(cur);rows.push(row)}
  return rows.filter(r=>r.some(c=>String(c).trim()!==''));
}
function decodeText(buf){try{return new TextDecoder('utf-8',{fatal:true}).decode(buf).replace(/^﻿/,'')}catch(e){return new TextDecoder('euc-kr').decode(buf)}}
const IMP_FIELDS=[
  ['date','발생일',['발생일','발생일자','일자','날짜','작업일','date']],
  ['source','발생처',['발생처','발생구분','구분','발생공정']],
  ['fgNo','완성품 품번',['완성품품번','완성품번호','완성품코드','assy품번','assy','발견품번','상위품번','모품번']],
  ['fgName','완성품명',['완성품명','완성품품명','assy명','assy품명','발견품명','상위품명']],
  ['fgQty','완성품 수량',['완성품수량','assy수량','영향수량']],
  ['partNo','원인 품번',['부품번호','품번','원인부품','원인부품번호','partno','p/no','pno','품목코드','자재코드']],
  ['partName','품명',['부품명','품명','품목명','자재명']],
  ['model','차종',['차종','차종코드','차형']],
  ['supplier','협력사',['협력사','협력사명','업체','업체명','공급사','납품업체']],
  ['type','불량유형',['불량유형','유형','불량명','불량구분','불량항목']],
  ['qty','불량수량',['불량수량','불량수','수량','불량qty']],
  ['inspQty','입고(로트) · 생산수량',['입고수량','로트수량','검사수량','생산수량','투입수량','작업수량']],
  ['delivDate','납품일자',['납품일자','납품일','입고일자','입고일','lot','lotno','로트','로트번호']],
  ['spec','도면 규격',['도면규격','규격','도면사양','사양','spec','specification','기준']],
  ['actual','실측',['실측','실측값','측정값','실제','actual','결과값']],
  ['desc','불량내용',['불량내용','내용','현상','상세내용','비고']],
  ['containment','임시조치',['임시조치','조치','조치내용','조치사항']],
  ['disposition','처리',['처리','처리방법','처분','판정']],
  ['resp','귀책',['귀책','귀책구분','귀책처']],
  ['owner','담당자',['담당자','담당','등록자']],
  ['hours','작업시간(h)',['작업시간','선별시간','재작업시간','시간']],
  ['status','상태',['상태','진행상태','완료여부']]];
const normH=h=>String(h??'').toLowerCase().replace(/[\s()\[\]._\-:#*]/g,'');
function autoMap(header){
  const map=header.map(()=>''),used=new Set();
  header.forEach((h,i)=>{const n=normH(h);if(!n)return;const f=IMP_FIELDS.find(([k,,al])=>!used.has(k)&&al.some(a=>normH(a)===n));if(f){map[i]=f[0];used.add(f[0])}});
  header.forEach((h,i)=>{if(map[i])return;const n=normH(h);if(!n)return;const f=IMP_FIELDS.find(([k,,al])=>!used.has(k)&&al.some(a=>normH(a).length>1&&n.includes(normH(a))));if(f){map[i]=f[0];used.add(f[0])}});
  return map;
}
function findHeader(rows){
  let best=0,bi=0;rows.slice(0,15).forEach((r,i)=>{const c=autoMap(r).filter(Boolean).length;if(c>best){best=c;bi=i}});
  return best>=2?bi:0;
}
function parseDateAny(v){const r=parseDateRaw(v);if(!r)return r;const [y,m,dd]=r.split('-').map(Number),t=new Date(y,m-1,dd);return t.getFullYear()===y&&t.getMonth()===m-1&&t.getDate()===dd?r:null}
function parseDateRaw(v){
  if(v===''||v==null)return '';
  if(typeof v==='number'||/^\d{5}(\.\d+)?$/.test(String(v).trim())){const n=Number(v);if(n>20000&&n<80000){const d=new Date(Math.round((n-25569)*864e5));return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`}}
  const s=String(v).trim();let m;
  if((m=/^(\d{4})[.\-\/년\s]+(\d{1,2})[.\-\/월\s]+(\d{1,2})/.exec(s)))return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  if((m=/^(\d{2})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/.exec(s)))return `20${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  if((m=/^(\d{4})(\d{2})(\d{2})$/.exec(s)))return `${m[1]}-${m[2]}-${m[3]}`;
  if((m=/^(\d{1,2})[.\-\/](\d{1,2})$/.exec(s)))return `${today().slice(0,4)}-${pad(+m[1])}-${pad(+m[2])}`;
  return null;
}
const numC=v=>typeof v==='number'?v:Number(String(v??'').replace(/[,\s개EAea]/g,''))||0;
let imp=null;
function openImport(){
  imp={sheets:null,sheet:'',rows:[],hdr:0,map:[]};
  const S=db.settings,defSrc=S.sources.find(x=>x.includes('공정'))||S.sources[0];
  openModal('불량 엑셀 일괄 등록',`<div class="help">엑셀(.xlsx) 또는 CSV 파일을 선택하거나, 엑셀에서 범위를 복사해 붙여넣으세요. 첫 줄(제목행)의 열 이름을 자동으로 인식합니다 — <b>발생일, 품번(또는 품명), 불량수량</b>은 필수입니다. 품번이 기준정보에 있으면 품명·차종·협력사가 자동으로 채워집니다.</div>
  <div class="fg" style="margin-top:10px">
    <label>기본 발생처 (파일에 없을 때)<select name="defSource">${opts(S.sources,defSrc)}</select></label>
    <label>기본 귀책<select name="defResp">${opts(RESP_OPTS,'협력사')}</select></label>
    <label>기본 담당자<input name="defOwner" list="dlOwners" value="${esc(S.owners[0]||'')}"></label>

  </div>
  <div class="row" style="margin-top:10px">
    <label class="b p" style="cursor:pointer">파일 선택 (.xlsx / .csv)<input type="file" accept=".xlsx,.csv,.txt" style="display:none" onchange="impFile(this.files[0]);this.value=''"></label>
    <button type="button" class="b" onclick="impTemplate()">등록 양식 내려받기</button>
    <span id="impSheet"></span><span id="impName" class="muted"></span>
  </div>
  <details style="margin-top:8px"><summary class="muted" style="cursor:pointer">또는 엑셀에서 복사해 붙여넣기</summary>
    <textarea id="impPaste" style="min-height:120px;font-family:Consolas,monospace;font-size:12px;margin-top:6px" placeholder="제목행 포함해서 Ctrl+V"></textarea>
    <button type="button" class="b s" onclick="impSetRows(parseCSV($('#impPaste').value),'붙여넣기')">붙여넣은 내용 읽기</button></details>
  <div class="row" style="margin-top:10px"><label class="row" style="gap:4px"><input type="checkbox" name="skipDup" checked onchange="impPreview()"> 이미 등록된 중복 건 제외 (발생일+품번+LOT+유형+수량 동일)</label>
    <label class="row" style="gap:4px"><input type="checkbox" name="autoCost" checked> 작업시간·폐기 비용 자동계산</label></div>
  <div id="impMap"></div><div id="impPrev" style="margin-top:10px"></div>`,
  [{label:'취소',fn:closeModal},{label:'등록',cls:'p',fn:impCommit}]);
  $('#mfoot .p').disabled=true;
}
function impTemplate(){
  downloadCSV('불량_일괄등록_양식.csv',[IMP_FIELDS.map(f=>f[1].replace('/생산','')==='검사수량'?'검사수량':f[1]),
    [today(),'공정','82450-ME100','레귤레이터 브라켓','ME1','대성정밀','치수','12','2400','2026-10-20','홀 위치 편심 (공정 조립 중 발견)','라인 재고 전수 선별','선별','협력사','홍길동','2','진행']]);
}
async function impFile(f){
  if(!f)return;
  try{
    const buf=await f.arrayBuffer();
    if(/\.xlsx$/i.test(f.name)){
      imp.sheets=await readXlsx(buf);const names=Object.keys(imp.sheets);if(!names.length)throw new Error('읽을 수 있는 시트가 없습니다');
      imp.sheet=names.find(n=>imp.sheets[n].length>1)||names[0];
      $('#impSheet').innerHTML=names.length>1?`시트 <select onchange="imp.sheet=this.value;impSetRows(imp.sheets[this.value],${jsq(f.name)})">${names.map(n=>`<option ${n===imp.sheet?'selected':''}>${esc(n)}</option>`).join('')}</select>`:'';
      impSetRows(imp.sheets[imp.sheet],f.name);
    }else if(/\.xls$/i.test(f.name)){throw new Error('구버전 .xls는 지원하지 않습니다. 엑셀에서 “다른 이름으로 저장 → Excel 통합 문서(.xlsx)” 후 선택하세요.')}
    else impSetRows(parseCSV(decodeText(buf)),f.name);
  }catch(e){toast('파일 읽기 실패: '+e.message)}
}
function impSetRows(rows,name){
  rows=(rows||[]).map(r=>r||[]);
  if(rows.filter(r=>r.some(c=>String(c).trim()!=='')).length<2){toast('제목행과 데이터가 있는 범위를 넣으세요');return}
  imp.hdr=findHeader(rows);imp.rows=rows;imp.map=autoMap(rows[imp.hdr]);
  $('#impName').textContent=`${name} · 데이터 ${rows.slice(imp.hdr+1).filter(r=>r.some(c=>String(c).trim()!=='')).length}행`;
  impRenderMap();impPreview();
}
function impRenderMap(){
  const h=imp.rows[imp.hdr];
  $('#impMap').innerHTML=`<div class="sec">열 연결 확인 <span class="muted" style="font-weight:normal;font-size:12px">자동 인식 결과입니다. 틀린 열만 바꾸세요. ‘무시’는 등록하지 않습니다.</span></div>
  <div class="row">${h.map((c,i)=>String(c).trim()===''&&!imp.map[i]?'':`<label style="display:flex;flex-direction:column;font-size:11px;color:var(--sub);gap:2px">${esc(c)||'(빈 제목)'}<select onchange="imp.map[${i}]=this.value;impPreview()" style="font-size:12px;${imp.map[i]?'':'color:#999'}"><option value="">무시</option>${IMP_FIELDS.map(([k,l])=>`<option value="${k}" ${imp.map[i]===k?'selected':''}>${l}</option>`).join('')}</select></label>`).join('')}</div>`;
}
function impBuild(){
  const f=$('#mf'),S=db.settings,defs={source:f.defSource.value,resp:f.defResp.value,owner:f.defOwner.value.trim()};
  const dupKey=d=>[d.date,d.partNo,lotOf(d),d.type,num(d.qty)].join('|');
  const exist=new Set(db.defects.map(dupKey)),seen=new Set();
  return imp.rows.slice(imp.hdr+1).map((raw,ri)=>{
    const o={};imp.map.forEach((k,ci)=>{if(k)o[k]=raw[ci]??''});
    const err=[],warn=[];
    const date=parseDateAny(o.date);if(!date)err.push(date===null?`날짜 형식 오류(${o.date})`:'발생일 없음');
    const partNo=String(o.partNo??'').trim(),part=partNo?partByNo(partNo):null;
    if(partNo&&!part)warn.push('기준정보에 없는 부품');
    const partName=String(o.partName??'').trim()||part?.name||'';
    const fgNo=String(o.fgNo??'').trim(),fgName=String(o.fgName??'').trim();
    if(!partNo&&!partName&&!fgNo&&!fgName)err.push('품번/품명 없음');else if(!partNo&&!partName)warn.push('원인 부품 미지정 (조사 중)');
    const qty=numC(o.qty);if(!(qty>0))err.push('불량수량 없음');
    const sn=String(o.supplier??'').trim();let sup=sn?db.suppliers.find(s=>s.name===sn)||db.suppliers.find(s=>s.name.replace(/\s|\(주\)|㈜|주식회사/g,'')===sn.replace(/\s|\(주\)|㈜|주식회사/g,'')):null;
    let newSup='';if(sn&&!sup)newSup=sn;if(!sup&&part&&part.supplierId)sup=supById(part.supplierId);
    const type=String(o.type??'').trim();if(type&&!S.defectTypes.includes(type))warn.push(`새 불량유형 '${type}'`);
    const disp=String(o.disposition??'').trim();
    const st=String(o.status??'').trim();
    const d={date:date||'',source:String(o.source??'').trim()||defs.source,partNo,partName,...(fgNo||fgName?{fgNo,fgName,fgQty:String(o.fgQty??'').trim()!==''?numC(o.fgQty):''}:{}),model:String(o.model??'').trim()||part?.model||'',supplierId:sup?.id||'',
      type:type||'기타',qty,inspQty:o.inspQty!==undefined&&String(o.inspQty).trim()!==''?numC(o.inspQty):'',...(()=>{const raw=String(o.delivDate??'').trim(),pd=raw?parseDateAny(typeof o.delivDate==='number'?o.delivDate:raw):'';return pd?{delivDate:pd}:{lot:raw}})(),desc:String(o.desc??'').trim(),spec:String(o.spec??'').trim(),actual:String(o.actual??'').trim(),containment:String(o.containment??'').trim(),
      disposition:disp,resp:String(o.resp??'').trim()||defs.resp,owner:String(o.owner??'').trim()||defs.owner,
      ...(/^(완료|종결|closed?|y|yes|o|done)$/i.test(String(st||'').trim())?{doneDate:date||''}:{}),hours:o.hours!==undefined&&String(o.hours).trim()!==''?numC(o.hours):''};
    const k=dupKey(d);let dup=false;if(!err.length&&(exist.has(k)||seen.has(k))){dup=true;warn.push(exist.has(k)?'이미 등록됨':'파일 내 중복')}seen.add(k);
    return {line:imp.hdr+ri+2,d,err,warn,newSup,dup};
  }).filter(r=>imp.map.some((k,ci)=>k&&String(imp.rows[r.line-1]?.[ci]??'').trim()!==''));
}
function impPreview(){
  if(!imp||!imp.rows.length)return;
  const rs=impBuild(),skip=$('#mf').skipDup.checked;
  const ok=rs.filter(r=>!r.err.length&&!(skip&&r.dup));
  const nErr=rs.filter(r=>r.err.length).length,nDup=rs.filter(r=>r.dup).length,newSups=[...new Set(rs.filter(r=>!r.err.length&&r.newSup).map(r=>r.newSup))];
  if(!imp.map.includes('date')||!imp.map.includes('qty')||!(imp.map.includes('partNo')||imp.map.includes('partName')))
    $('#impPrev').innerHTML='<div class="banner">필수 열(발생일, 불량수량, 품번 또는 품명)이 연결되지 않았습니다. 위에서 열을 지정하세요.</div>';
  else $('#impPrev').innerHTML=`<div class="row" style="margin-bottom:6px"><span class="bg ok">등록 ${ok.length}건</span>${nErr?`<span class="bg bad">오류 ${nErr}건 (제외)</span>`:''}${nDup?`<span class="bg warn">중복 ${nDup}건${skip?' (제외)':''}</span>`:''}${newSups.length?`<span class="bg inf">새 협력사 ${newSups.length}곳 자동 추가: ${esc(newSups.join(', '))}</span>`:''}</div>
  <div class="tw" style="max-height:42vh"><table><thead><tr><th>행</th><th>판정</th><th>발생일</th><th>발생처</th><th>품번</th><th>품명</th><th>협력사</th><th>유형</th><th class="n">수량</th><th>처리</th><th>납품일자</th><th>귀책</th></tr></thead><tbody>
  ${rs.slice(0,300).map(r=>`<tr style="${r.err.length||(skip&&r.dup)?'opacity:.55':''}"><td>${r.line}</td><td>${r.err.length?`<span class="bg bad" title="${esc(r.err.join(', '))}">${esc(r.err[0])}</span>`:r.dup?`<span class="bg warn">${esc(r.warn[r.warn.length-1])}</span>`:r.warn.length?`<span class="bg warn" title="${esc(r.warn.join(', '))}">확인</span>`:'<span class="bg ok">OK</span>'}</td>
  <td>${esc(r.d.date)}</td><td>${esc(r.d.source)}</td><td>${esc(r.d.partNo)}</td><td>${esc(r.d.partName)}</td><td>${r.newSup?`${esc(r.newSup)} <span class="bg inf">신규</span>`:esc(supName(r.d.supplierId))||'<span class="muted">-</span>'}</td><td>${esc(r.d.type)}</td><td class="n">${r.d.qty||''}</td><td>${esc(r.d.disposition)}</td><td>${esc(r.d.delivDate||r.d.lot)}</td><td>${esc(r.d.resp)}</td></tr>`).join('')}
  ${rs.length>300?`<tr><td colspan="12" class="muted">… 외 ${rs.length-300}행 (미리보기 생략, 등록은 전체 처리)</td></tr>`:''}</tbody></table></div>`;
  const b=$('#mfoot .p');b.disabled=!ok.length;b.textContent=ok.length?`${ok.length}건 등록`:'등록';
}
function impCommit(){
  const f=$('#mf'),S=db.settings,skip=f.skipDup.checked,auto=f.autoCost.checked;
  const rs=impBuild().filter(r=>!r.err.length&&!(skip&&r.dup));if(!rs.length)return;
  const supMap={};let nNew=0,nRec=0;const ids=[];const snap={db:JSON.stringify(db),ph:[]};
  rs.forEach(r=>{
    const d={id:uid(),...r.d,ncrId:'',photos:[],costs:[]};
    if(r.newSup){let s=supMap[r.newSup]||db.suppliers.find(x=>x.name===r.newSup);if(!s){s=touch({id:uid(),code:'',name:r.newSup,items:'',contact:'',phone:'',email:'',note:'엑셀 등록 시 자동 추가'});db.suppliers.push(s);nNew++}supMap[r.newSup]=s;d.supplierId=s.id}
    if(d.type&&!S.defectTypes.includes(d.type))S.defectTypes.push(d.type);
    if(d.disposition&&!S.dispositions.includes(d.disposition))S.dispositions.push(d.disposition);
    if(d.source&&!S.sources.includes(d.source))S.sources.push(d.source);
    if(d.owner&&!S.owners.includes(d.owner))S.owners.push(d.owner);
    if(auto){const p=partByNo(d.partNo);if(d.hours)d.costs.push({id:uid(),date:d.date,cat:d.disposition==='재작업'?'재작업':'선별',amt:Math.round(d.hours*S.laborRate),basis:`${d.hours}h × ${won(S.laborRate)}원`,memo:'엑셀 등록'});if(d.disposition==='폐기'&&p&&partKRW(p))d.costs.push({id:uid(),date:d.date,cat:'폐기',amt:Math.round(d.qty*partKRW(p)),basis:`${d.qty}개 × ${won(partKRW(p))}원${curOf(p)!=='KRW'?` (${fmtPrice(p)})`:''}`,memo:'엑셀 등록'})}
    db.defects.push(touch(d));ids.push(d.id);
  });
  ids.forEach(i=>{const d=db.defects.find(x=>x.id===i);if(ncrReasons(d).length)nRec++});
  const dates=rs.map(r=>r.d.date).sort();
  save();closeModal(true);
  state.tab='defect';state.df={...state.df,from:dates[0],to:'',sup:'',status:'',type:'',q:''};render();
  toast(`${rs.length}건 등록 완료${nNew?` · 새 협력사 ${nNew}곳`:''}${nRec?` · NCR 권고 ${nRec}건 (대시보드 확인)`:''}`);
  offerUndo(snap,`엑셀로 불량 ${rs.length}건을 등록했습니다`);
}

