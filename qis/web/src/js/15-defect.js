/* ================= 불량 관리 ================= */
function filteredDefects(){
  const f=state.df,q=f.q.toLowerCase();
  return db.defects.filter(d=>(!f.from||d.date>=f.from)&&(!f.to||d.date<=f.to)&&(!f.sup||d.supplierId===f.sup)&&(!f.status||(f.status==='open'?!isDone(d):f.status==='done'?isDone(d):f.status==='vwait'?(isDone(d)&&['wait','late'].includes((d.ncrId?verifyInfo(db.ncrs.find(n=>n.id===d.ncrId)):icaVerify(d))?.k)):f.status==='inv'?invOpen(d):f.status==='ica'?(icaNeed(d)&&!d.ica?.doneDate):f.status==='ncrRec'?(!d.ncrId&&d.date&&diffDays(d.date,today())<=90&&ncrReasons(d).length>0):defStage(d).label===f.status))&&(!f.type||d.type===f.type)&&(!f.sev||sevOf(d).grade===f.sev)
    &&(!q||[d.partNo,d.partName,d.fgNo,d.fgName,d.model,d.lot,d.delivDate,d.desc,d.inv?.farResult,d.inv?.rca,...(d.logs||[]).map(l=>l.text),supName(d.supplierId),d.owner,d.source].join(' ').toLowerCase().includes(q)))
    .sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||''));
}
function ncrCell(d){
  const n=d.ncrId&&db.ncrs.find(x=>x.id===d.ncrId);
  if(n)return `<a class="bg inf" onclick="editNcr('${n.id}')" style="cursor:pointer">${esc(n.no)}</a>`;
  if(invOpen(d))return `<a class="bg inf" style="cursor:pointer" onclick="editDefect('${d.id}')" title="귀책 조사 중 — FAR·RCA 후 판정">조사 중</a>`;
  if(d.resp==='사내')return `<span class="bg mut" title="사내 귀책 — 사내 대책으로 처리">사내</span>`;
  if(d.resp==='미정'&&d.inv?.verdict==='원인 불명')return `<span class="bg mut">원인 불명</span>`;
  const r=ncrReasons(d);
  return (r.length?`<span class="bg warn" title="${esc(r.join(' / '))}">권고</span> `:'')+`<button class="b s noprint" onclick="ncrFromDefect('${d.id}')">발행</button>`;
}
// 불량 목록의 후속 조치 칸 — 귀책에 맞는 FAR · RCA · NCR 진행 상태 또는 발행 버튼
function actCell(d){
  const L=[],line=(k,h)=>L.push(`<div class="act"><span class="ak">${k}</span>${h}</div>`);
  const iv=d.inv||{},r=d.resp||'협력사',done=isDone(d),c=defCase(d),n=d.ncrId&&db.ncrs.find(x=>x.id===d.ncrId);
  {const is=d.issueId&&issById(d.issueId);if(is)line('이슈',`<a class="bg mut" onclick="issOpen('${is.id}')" title="${esc(is.title)}">${esc(is.no)}</a>`)}
  // FAR (귀책 조사)
  if(iv.farReq){const ii=invInfo(d);line('FAR',iv.verdict?`<a class="bg ok" onclick="editInv('${d.id}')">판정 ${esc(iv.verdict)}</a>`:`<a class="bg ${ii.cls}" onclick="editInv('${d.id}')">${esc(ii.label.replace('FAR ',''))}</a>`)}
  else if(r==='미정'&&!done)line('FAR',`<button class="b s noprint" onclick="editInv('${d.id}','inv_farReq')">FAR 요청</button>`);
  // RCA (사내 원인분석)
  if(c)line('RCA',`<a class="bg inf" onclick="czOpenCase('${c.id}','cause')" title="${esc(c.Title||'')}">${esc(c.CaseNo)}</a> <span class="muted" style="font-size:11.5px">${esc(c.Stage||'')}</span>`);
  else if(!done&&!(d.ica&&(icaStarted(d.ica)||d.ica.doneDate))&&(['사내','공동','미정'].includes(r)||(r==='협력사'&&stageOf(d.source)>=2&&d.escJudge!=='샘플링 한계')))
    line('RCA',`<button class="b s noprint" onclick="czFromDefect('${d.id}')" title="${r==='협력사'?'수입검사에서 왜 못 걸렀는지 사내 유출 원인 분석':'사내 원인분석 요청'}">${r==='협력사'?'유출 RCA':'RCA 요청'}</button>`);
  // 사내 대책 (RCA가 없을 때)
  if(!c&&['사내','공동'].includes(r)){const ch=icaChip(d);if(ch)line('대책',ch);else if(!done){const lv=icaLevel(d);line('대책',`<button class="b s noprint ${lv!==ICA_NONE?'p':''}" onclick="editIca('${d.id}')" title="권장 수준: ${esc(lv)}">사내 대책</button>`)}}
  // NCR (협력사 대책서)
  if(n)line('NCR',`<a class="bg inf" onclick="editNcr('${n.id}')">${esc(n.no)}</a> <span class="muted" style="font-size:11.5px">${esc(ncrStatus(n))}</span>`);
  else if(['협력사','공동'].includes(r)&&!done){const rs=ncrReasons(d);line('NCR',`<button class="b s noprint ${rs.length?'p':''}" onclick="ncrFromDefect('${d.id}')" title="${esc(rs.join(' / ')||'협력사에 대책서 요청')}">NCR 발행</button>`)}
  else if(r==='미정'&&!done)line('NCR','<span class="muted" style="font-size:11.5px">귀책 판정 후</span>');
  return L.join('')||(r==='고객'?'<span class="bg mut">고객 귀책</span>':'<span class="muted">-</span>');
}
function defectTable(){
  const ds=filteredDefects();
  const gc={A:0,B:0,C:0};ds.forEach(d=>gc[sevOf(d).grade]++);
  return `<div class="row" style="margin-bottom:8px"><span>심각도 <span class="bg svA">A ${gc.A}</span> <span class="bg svB">B ${gc.B}</span> <span class="bg svC">C ${gc.C}</span> · </span><span><b>${ds.length.toLocaleString()}</b>건 · 수량 <b>${sum(ds,'qty').toLocaleString()}</b> · 비용 <b>${won(sum(ds,costTotal))}</b>원</span></div>
  <div class="tw"><table><thead><tr><th>발생일</th><th>발생처</th><th>심각도</th><th>부품</th><th>사진</th><th>차종</th><th>협력사</th><th>유형</th><th class="n">수량</th><th>처리</th><th>귀책</th><th class="n">비용(원)</th><th>후속 조치</th><th>담당</th><th>상태</th><th class="noprint"></th></tr></thead><tbody>
  ${ds.map(d=>`<tr><td style="white-space:nowrap">${esc(d.date)}</td><td>${esc(d.source)}</td><td>${sevBadge(d)}</td><td>${d.partNo||d.partName?`<b>${esc(d.partNo)}</b><br><span class="muted">${esc(d.partName)}</span>`:invOpen(d)?'<span class="bg warn">원인 부품 조사 중</span>':'<span class="muted">원인 부품 없음</span>'}${d.fgNo||d.fgName?`<br><span class="muted" style="font-size:11px" title="발견 품목 (완성품)">▸ 발견: ${esc(d.fgNo||d.fgName)}${d.fgQty?` (${num(d.fgQty)})`:''}</span>`:''}</td><td>${photoBadge(d)}</td><td>${esc(d.model)}</td><td>${esc(supName(d.supplierId))}</td><td>${esc(d.type)}</td><td class="n">${num(d.qty).toLocaleString()}</td><td>${esc(d.disposition)}</td><td>${esc(d.resp)}${d.resp==='공동'&&d.inv&&d.inv.share!==''&&d.inv.share!=null?`<br><span class="muted" style="font-size:11px">협력사 ${num(d.inv.share)}%</span>`:''}</td><td class="n" style="white-space:nowrap">${costTotal(d)?`<a class="lk" onclick="openCost('${d.id}')">${won(costTotal(d))}</a>`:needCost(d)?`<a class="bg warn" style="cursor:pointer" onclick="openCost('${d.id}')">입력</a>`:`<a class="lk muted" onclick="openCost('${d.id}')">0</a>`}${claimStatus(d)?`<br><span class="bg ${CLAIM_CLS[claimStatus(d)]}" style="font-size:11px">${claimStatus(d)}</span>`:''}</td><td class="actc">${actCell(d)}</td><td>${esc(d.owner)}</td><td class="stc">${stageBadges(d)}<br>${(()=>{const n=(d.logs||[]).length,l=lastLog(d);return `<a class="bg ${n?'inf':'mut'}" style="cursor:pointer;font-size:10.5px" onclick="openLog('${d.id}')" title="${n?esc(l.date+' '+l.kind+': '+l.text.slice(0,80)):'진행 기록 추가'}">📝 ${n||'+'}</a>`})()}</td><td class="noprint" style="white-space:nowrap"><button class="b s" onclick="editDefect('${d.id}')">상세</button></td></tr>`).join('')||'<tr><td colspan="16" class="muted" style="text-align:center;padding:30px">조건에 맞는 불량이 없습니다.</td></tr>'}
  </tbody></table></div>`;
}
function renderDefect(){
  const f=state.df,S=db.settings;
  return `<div class="card noprint"><div class="row">
    <button class="b p" onclick="editDefect()">+ 불량 등록</button>
    <button class="b" onclick="openImport()">엑셀 일괄 등록</button>
    <span class="muted">기간</span><input type="date" value="${f.from}" onchange="state.df.from=this.value;refreshDT()"> ~ <input type="date" value="${f.to}" onchange="state.df.to=this.value;refreshDT()">
    <select onchange="state.df.sup=this.value;refreshDT()">${supOpts(f.sup,'전체 협력사')}</select>
    <select onchange="state.df.type=this.value;refreshDT()"><option value="">전체 유형</option>${opts(S.defectTypes,f.type)}</select>
    <select onchange="state.df.sev=this.value;refreshDT()"><option value="">전체 심각도</option>${['A','B','C'].map(g=>`<option value="${g}" ${f.sev===g?'selected':''}>${g} (${RESP[g]})</option>`).join('')}</select>
    <select onchange="state.df.status=this.value;refreshDT()">${[['','전체 단계'],['open','미완료 전체'],['처리 대기','처리 대기'],['inv','귀책 조사 중 (FAR·RCA)'],['NCR 발행 필요','NCR 발행 필요'],['ica','사내 대책 진행'],['ncrRec','NCR 권고 · 미발행 (90일)'],['공동 귀책 — 분담 협의','공동 귀책 — 분담 협의'],['처리 중','처리 중'],['대책서 대기','대책서 대기'],['대책서 검토','대책서 검토'],['대책서 보완','대책서 보완'],['done','완료 전체'],['vwait','완료 · 검증 대기']].map(([v,l])=>`<option value="${v}" ${v===f.status?'selected':''}>${l}</option>`).join('')}</select>
    <input placeholder="검색 (부품·납품일·내용·담당)" value="${esc(f.q)}" oninput="state.df.q=this.value;deb(refreshDT)" style="width:200px">
    <span style="flex:1"></span><button class="b" onclick="exportDefectsCSV()">엑셀 내보내기</button>
  </div></div>
  <div class="card" id="dtab">${defectTable()}</div>`;
}
function refreshDT(){const own=!sevMemo;if(own)sevMemo=new Map();try{$('#dtab').innerHTML=defectTable()}finally{if(own)sevMemo=null}}

function editDefect(id,copy,preset){
  const S=db.settings;if(!preset)issPend=null;
  let d=id?{...db.defects.find(x=>x.id===id)}:{date:today(),source:S.sources[0],resp:/수입/.test(S.sources[0])?'협력사':'미정',owner:S.owners[0]||''};
  if(!id&&preset)d={...d,...preset};
  if(copy){d={...d,date:today(),status:'',doneDate:'',closed:undefined,ncrId:'',qty:'',lot:'',delivDate:'',costs:[],claim:undefined,photos:[],inv:undefined,ica:undefined,logs:[],sevLock:undefined,sev:d.sev?{impact:d.sev.impact,special:d.sev.special}:undefined};id=null}
  const iss=d.issueId&&issById(d.issueId);
  const body=`${iss?`<div class="banner" style="background:var(--pri2);border-color:#c9d8f2;color:#1d2433;margin-bottom:10px">이슈 <b>${esc(iss.no)}</b> ${esc(iss.title)}${id?'':' — 이슈 내용 · 사진을 채웠습니다. 불량 유형 · 처리를 확인하고 저장하세요'}</div>`:''}<div class="fgrp"><div class="gh">발생 정보</div><div class="fg fg4">
    <label>발생일 *<input type="date" name="date" value="${esc(d.date)}"></label>
    <label>발생처<select name="source" onchange="srcLayout();rcvHint();setTimeout(escShow)">${opts(S.sources,d.source)}</select></label>
    <label>차종<input name="model" value="${esc(d.model)}"></label>
    <label>담당자<input name="owner" list="dlOwners" value="${esc(d.owner)}"></label>
  </div></div>
  <div class="fgrp fgfound" id="grpFg"><div class="gh">발견 품목 (완성품 · ASSY) <span class="muted">공정 · 출하검사 · 고객에서 완성품으로 발견된 경우</span></div><div class="fg fg4">
    <label>완성품 품번<input name="fgNo" data-combo="fg" value="${esc(d.fgNo)}" oninput="onFgNo(this.value)" autocomplete="off" placeholder="완성품에서 발견된 경우 (선택)"></label>
    <label>완성품 품명<input name="fgName" value="${esc(d.fgName)}" placeholder="예: FRT DOOR MODULE LH"></label>
    <label>영향 완성품 수량<input type="number" min="0" name="fgQty" value="${esc(d.fgQty)}" placeholder="영향받은 완성품 수"></label>
  </div></div>
  <div class="fgrp fgpart"><div class="gh"><span id="grpPartH">원인 · 의심 부품</span> <span class="muted" id="grpPartS"></span></div><div class="fg fg4">
    <label><span class="lt" id="lbPn">원인·의심 품번</span><input name="partNo" data-combo="dparts" value="${esc(d.partNo)}" oninput="onPartNo(this.value)" autocomplete="off" placeholder="번호·품명·협력사로 검색"></label>
    <label><span class="lt" id="lbPm">원인·의심 품명</span><input name="partName" value="${esc(d.partName)}"></label>
    <label>협력사<span class="row" style="flex-wrap:nowrap"><select name="supplierId" style="flex:1">${supOpts(d.supplierId)}</select><button type="button" class="b s" onclick="quickSup()" title="협력사 빠른 추가">+</button></span></label>
    <label><span class="lt" id="lbDv">납품일자</span><input type="date" name="delivDate" value="${esc(d.delivDate)}">${d.lot&&!d.delivDate?`<input type="hidden" name="lot" value="${esc(d.lot)}"><span style="font-size:11px">기존 LOT: ${esc(d.lot)}</span>`:''}</label>
  </div></div>
  <div id="bomBox"></div><div id="rcvBox"></div>
  <div class="fgrp"><div class="gh">불량</div><div class="fg fg4">
    <label>불량유형<select name="type">${opts(S.defectTypes,d.type)}</select></label>
    <label><span class="lt" id="lbQty">불량수량</span><input type="number" min="0" name="qty" value="${esc(d.qty)}"></label>
    <label><span class="lt" id="lbInsp">입고수량 (로트)</span><input type="number" min="0" name="inspQty" value="${esc(d.inspQty)}"></label>
    <label>진행 단계 (자동)<span style="padding:4px 0">${id?stageBadges(db.defects.find(x=>x.id===id)).replace('<br>',' '):'<span class="bg warn">처리 대기</span>'}</span></label>
  </div></div>
  <div class="fg">
    <label style="grid-column:span 2" title="NCR 통보서의 Specification(도면사양) 칸으로 들어갑니다">도면 규격 (Specification)<textarea name="spec" style="min-height:44px" placeholder="예: Ø12.0 ±0.05 / 작동력 3 ~ 5 N / 스크래치 없을 것">${esc(d.spec)}</textarea></label>
    <label style="grid-column:span 2" title="NCR 통보서의 Actual(실제) 칸으로 들어갑니다">실측 · 실제 (Actual)<textarea name="actual" style="min-height:44px" placeholder="예: Ø12.12 (n=5 중 최대) / 작동력 8.2 N / 길이 3mm 스크래치">${esc(d.actual)}</textarea></label>
    <label class="full">불량 내용 (현상)<textarea name="desc">${esc(d.desc)}</textarea></label>
    <label class="full">임시조치 (봉쇄 · 재고 처리)<textarea name="containment">${esc(d.containment)}</textarea></label>
    <label>처리<select name="disposition">${opts(S.dispositions,d.disposition,true)}</select></label>
    <label>귀책<select name="resp" onchange="respChanged()">${opts(RESP_OPTS,d.resp)}</select></label>
    <label id="escRow" title="공정 · 출하 · 고객에서 발견된 협력사 귀책 불량 — 샘플링 한계면 사내 RCA 없이 협력사 8D에 유출 원인 · 출하검사 대책 요구">수입검사 검출 판정<select name="escJudge"><option value="">판정 전</option>${ESC_JUDGE.map((x,i)=>`<option value="${x}" ${d.escJudge===x?'selected':''}>${'①②③'[i]} ${x}</option>`).join('')}</select></label>
    <label>처리 완료일 <span style="font-size:11px">(NCR 없는 건)</span><input type="date" name="doneDate" value="${esc(d.doneDate)}"></label>
    <label class="row" style="flex-direction:row;align-items:center;gap:6px;margin-top:16px"><input type="checkbox" name="closedChk" ${d.closed?'checked':''} onchange="$('#closeRsn').style.display=this.checked?'':'none'"> 수동 종결 (예외)</label>
    <label class="full" id="closeRsn" style="${d.closed?'':'display:none'}">수동 종결 사유 (필수 · 진행 기록에 남습니다)<input name="closedReason" value="${esc(d.closed?.reason)}" placeholder="예: 중복 등록, 고객 특채 확정, 오판정 확인 등"></label>
  </div>
  <div class="help" style="margin-top:6px">진행 단계는 자동으로 정해집니다 — 귀책 <b>미정</b>이면 FAR·RCA 조사 후 판정, <b>협력사</b>(A·B)는 NCR → 대책서 승인 시 완료, <b>사내</b>는 사내 대책(A: 8D · B: 간이) 완료 시 완료, <b>공동</b>은 분담 비율 입력 후 처리 완료일로 완료, 그 밖(C등급·고객 귀책)은 <b>처리 완료일</b> 입력 시 완료. 유효성 검증은 완료와 별도로 표시됩니다.</div>
  ${invSummary(d,id)}
  ${id?(()=>{const n=(d.logs||[]).length,l=lastLog(d),nx=[];return `<div class="banner" style="background:var(--pri2);border-color:#c9d8f2;color:#1d2433;margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">📝 <b>조사 · 진행 기록 ${n}건</b>${l?` <span class="muted">최근 ${esc(l.date)} ${esc(l.kind)}: ${esc(l.text.slice(0,40))}${l.text.length>40?'…':''}</span>`:' <span class="muted">아직 없음</span>'}${nx.length?` <span class="bg warn">다음 행동: ${esc(nx[0].text)}</span>`:''}<span style="flex:1"></span><button type="button" class="b s p" onclick="gotoProgress('${d.id}')">진행 보기 · 기록 추가</button></div>`})():''}
  ${id?'<div id="routeBox"></div>':''}
  <details id="sevWrap" ${(()=>{try{return localStorage.getItem('qms_sevOpen')==='0'?'':'open'}catch(e){return 'open'}})()} ontoggle="try{localStorage.setItem('qms_sevOpen',this.open?'1':'0')}catch(e){}" style="margin-top:14px"><summary class="sec" style="cursor:pointer;list-style:revert">심각도 평가 <span id="sevSum"></span> <span class="muted" style="font-weight:normal;font-size:12px">유출 단계·반복성은 자동, 영향도·범위는 유형·수량으로 초기값 → 필요 시 조정</span></summary>
  <div id="sevBox"></div></details>
  <details id="costWrap" ${(d.costs||[]).length||d.claim?'open':''} style="margin-top:14px"><summary class="sec" style="cursor:pointer;list-style:revert">비용 · 구상 <span class="muted" style="font-weight:normal;font-size:12px">— 처리가 끝난 뒤 입력해도 됩니다 (불량 목록의 비용 칸·COPQ 탭에서도 입력 가능)</span></summary><div id="costBox"></div></details>
  <div class="sec">사진 <span class="muted" style="font-weight:normal;font-size:12px">클릭해서 선택 · 파일을 끌어다 놓기 · 캡처 후 Ctrl+V 붙여넣기 (자동으로 축소·압축 저장)</span></div>
  <div id="photoBox"></div>
`;
  const btns=[{label:'취소',fn:closeModal},{label:'저장',cls:'p',fn:()=>saveDefect(id)}];
  // NCR 발행은 불량 등록과 별도 — ‘다음 단계’의 NCR 발행 · 불량 목록의 발행 단추 · NCR 탭에서 함
  if(id){btns.unshift({label:'복사해서 새로 등록',fn:async()=>{if(mfDirty&&!await askConfirm({title:'수정한 내용을 저장하지 않고 복사할까요?',msg:'먼저 저장하려면 취소 후 저장을 누르세요.',ok:'복사',danger:false}))return;closeModal(true);editDefect(id,true)}});
    btns.unshift({label:'삭제',cls:'d',fn:()=>delDefect(id)})}
  openModal(id?'불량 상세':'불량 등록',body,btns);
  initPhotoBox(copy?[]:(d.photos||[]));
  srcLayout();{const f=$('#mf');['fgNo','fgName'].forEach(k=>f[k]&&f[k].addEventListener('input',srcLayout))}curRcvId=copy?'':(d.rcvId||'');bomDefect();rcvHint();
  // 새 불량: 발생처가 수입검사면 귀책 기본 '협력사', 공정·출하·고객이면 '미정' (귀책을 직접 고르기 전까지)
  if(!id){const f=$('#mf');let touched=false;f.resp.addEventListener('change',()=>{touched=true});f.source.addEventListener('change',()=>{if(!touched){f.resp.value=/수입/.test(f.source.value)?'협력사':'미정';if(typeof respChanged==='function')respChanged();renderSev()}})}
  costInit(d,true);
  curSev={...(d.sev||{}),_id:id||null,_touched:{impact:!!d.sev?.impact,scope:!!d.sev?.scope}};
  renderSev();
  ['date','source','partNo','supplierId','type','qty','inspQty'].forEach(k=>{const el=$('#mf')[k];if(el){el.addEventListener('input',renderSev);el.addEventListener('change',renderSev)}});
  {const el=$('#mf').resp;if(el)el.addEventListener('change',renderSev)}
  ['disposition','qty','partNo','resp'].forEach(k=>{const el=$('#mf')[k];if(el)el.addEventListener('change',()=>{const ae=document.activeElement;if(!$('#costBox')?.contains(ae))renderCostBox()})});
  respChanged(true);
}
function invSummary(d,id){
  const iv=d.inv||{},r=d.resp||'협력사',cs=defCase(d);
  if(r!=='미정'&&!d.inv)return '';
  const st=iv.verdict?`<span class="bg ok">판정: ${esc(iv.verdict)}${iv.verdictDate?' · '+esc(iv.verdictDate):''}</span>${VERDICT_RESP[iv.verdict]!==r?` <span class="bg warn">귀책을 ‘${esc(r)}’(으)로 직접 변경함</span>`:''}`:(()=>{const ii=invInfo(d);return `<span class="bg ${ii.cls}">${esc(ii.label)}</span>`})();
  const facts=[iv.farReq&&`FAR 요청 ${iv.farReq}`,iv.farRecv&&`FAR 회신 ${iv.farRecv}`,cs?`RCA ${cs.CaseNo} · ${cs.Stage}`:(iv.rca||'').trim()&&'사내 분석 메모 있음',iv.share!==''&&iv.share!=null&&iv.verdict==='공동'&&`협력사 부담 ${iv.share}%`].filter(Boolean);
  return `<div class="sec">귀책 조사 <span class="muted" style="font-weight:normal;font-size:12px">FAR · 사내 분석 · 판정은 ‘FAR’ 탭에서 따로 진행합니다</span></div>
  <div class="route" style="margin-top:0"><div class="ri"><div class="tx">${st}${facts.length?` <span class="muted">${esc(facts.join(' · '))}</span>`:''}${!iv.verdict&&d.date?`<br><span class="muted" style="font-size:12px">원인 불명 검토 기한 ${esc(ntfDue(d))}</span>`:''}</div>
  ${id?`<button type="button" class="b s p" onclick="routeGo(&quot;editInv('${id}')&quot;)">귀책 조사 열기</button>`:'<span class="muted" style="font-size:12px">저장하면 귀책 조사를 시작할 수 있습니다</span>'}</div></div>`;
}
const FAR_PH_MAX=6;
function invPhotoIds(d){return [...new Set([...(d.photos||[]),...(d.logs||[]).filter(l=>!l.void).flatMap(l=>l.photos||[])])]}
let curInvExcl=new Set();
async function renderInvPhotos(){
  const b=$('#invPhBox');if(!b)return;const d=db.defects.find(x=>x.id===invCurId);if(!d)return;
  const ids=invPhotoIds(d);
  if(!ids.length){b.innerHTML=`<span class="muted" style="font-size:12px">이 불량에 등록된 사진이 없습니다. 불량 화면의 사진 칸이나 진행 기록에 사진을 첨부하면 여기에 나타나고 FAR 요청서에 들어갑니다.</span>`;return}
  let rs=[];try{rs=await photoGetMany(ids)}catch(e){}
  if(!$('#invPhBox'))return;
  if(!rs.length){b.innerHTML='<span class="muted" style="font-size:12px">사진을 불러오지 못했습니다. 사진이 든 백업 파일로 복원하면 다시 나타납니다.</span>';return}
  const on=rs.filter(p=>!curInvExcl.has(p.id)).length;
  b.innerHTML=rs.map(p=>{const x=curInvExcl.has(p.id);return `<label style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;cursor:pointer"><img src="${p.thumb||p.data}" style="width:110px;height:80px;object-fit:cover;border-radius:4px;border:2px solid ${x?'var(--line)':'var(--pri)'};opacity:${x?.4:1}"><span><input type="checkbox" ${x?'':'checked'} onchange="this.checked?curInvExcl.delete('${p.id}'):curInvExcl.add('${p.id}');mfDirty=true;renderInvPhotos()"> ${esc((p.caption||'').slice(0,12))}</span></label>`}).join('')
    +`<div class="muted" style="font-size:12px;align-self:center">선택 ${on}장${on>FAR_PH_MAX?` — 앞의 ${FAR_PH_MAX}장만 출력됩니다`:''}</div>`;
}
async function offerNcrAfterVerdict(ids,v){
  if(!['협력사','공동'].includes(v))return;
  const ds=ids.map(i=>db.defects.find(d=>d.id===i)).filter(d=>d&&!d.ncrId);if(!ds.length)return;
  const sid=ds[0].supplierId,same=ds.filter(d=>d.supplierId===sid),rest=ds.length-same.length;
  const g=same.map(d=>sevOf(d).grade).sort()[0],rt=RESP[g];
  const far=same.some(d=>d.inv&&d.inv.farReq);
  const ok=await askConfirm({title:'이어서 NCR을 발행할까요?',danger:false,ok:'이어서 NCR 발행',cancel:'나중에',
    msg:`${v==='공동'?'공동 귀책 — 협력사 몫의 ':'협력사 귀책 — '}원인과 재발 방지 대책은 NCR로 요구합니다.`,
    items:[`${esc(supName(sid)||'협력사 미지정')} · 불량 ${same.length}건${same.length>1?' (한 NCR로 묶음)':''}`,
      `심각도 ${g}등급 → 회신 유형 <b>${rt}</b>${g==='C'?' (대책서 없이 통보 · 반복되면 등급 상승)':''}`]
      .concat(far?['귀책 조사의 FAR 내용이 NCR ‘불량 분석 요청’으로 넘어갑니다']:[])
      .concat(rest?[`다른 협력사 불량 ${rest}건은 각 불량 화면에서 따로 발행하세요`]:[]),
    note:'나중에 발행하려면 불량 목록의 ‘NCR 발행 필요’ 또는 대시보드의 NCR 권고에서 할 수 있습니다.'});
  if(ok)ncrFromDefect(same[0].id,same.slice(1).map(d=>d.id));
}
function invLateN(){return db.defects.filter(d=>invOpen(d)&&(invInfo(d).late||(d.date&&today()>ntfDue(d)))).length}
function invRows(){
  const f=state.ivf,q=(f.q||'').toLowerCase();
  return db.defects.filter(d=>{
    const all=d.resp==='미정'||!!d.inv;if(!all)return false;
    if(f.status==='open'&&!invOpen(d))return false;
    if(f.status==='late'&&!(invOpen(d)&&(invInfo(d).late||(d.date&&today()>ntfDue(d)))))return false;
    if(f.status==='done'&&!(d.inv&&d.inv.verdict))return false;
    return !q||[d.partNo,d.partName,d.fgNo,d.fgName,d.type,d.desc,supName(d.supplierId),(d.inv||{}).verdict].join(' ').toLowerCase().includes(q);
  }).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
}
function renderInv(){
  const all=db.defects.filter(d=>d.resp==='미정'||!!d.inv),open=all.filter(invOpen);
  const pre=open.filter(d=>invInfo(d).k==='pre'),late=open.filter(d=>invInfo(d).late),judge=open.filter(d=>invInfo(d).k==='judge'),ntf=open.filter(d=>d.date&&today()>ntfDue(d));
  const m=today().slice(0,7),doneM=all.filter(d=>d.inv&&d.inv.verdict&&(d.inv.verdictDate||'').startsWith(m));
  const rows=invRows(),f=state.ivf;
  const chip=(k,l,n)=>`<button class="b s ${f.status===k?'p':''}" onclick="state.ivf.status='${k}';render()">${l} <span class="mono" style="opacity:.75">${n}</span></button>`;
  return `<div class="kpis">
    <div class="kpi ${open.length?'warn':''}"><div class="l">조사 중</div><div class="v">${open.length}</div><div class="s">귀책 미정 · 판정 전</div></div>
    <div class="kpi ${pre.length?'warn':''}"><div class="l">FAR 요청 전</div><div class="v">${pre.length}</div><div class="s">협력사 분석 요청 필요</div></div>
    <div class="kpi ${late.length?'bad':''}"><div class="l">FAR 회신 지연</div><div class="v">${late.length}</div><div class="s">요청 + ${num(db.settings.farDays)||5}영업일 기준</div></div>
    <div class="kpi"><div class="l">판정 대기</div><div class="v">${judge.length}</div><div class="s">FAR 회신 접수됨</div></div>
    <div class="kpi ${ntf.length?'bad':''}"><div class="l">원인 불명 검토 기한 경과</div><div class="v">${ntf.length}</div><div class="s">등록 + ${num(db.settings.ntfDays)||30}일</div></div>
    <div class="kpi"><div class="l">이번 달 판정</div><div class="v">${doneM.length}</div><div class="s">${m}</div></div></div>
  <div class="card noprint"><div class="row">${chip('open','조사 중',open.length)}${chip('late','기한 경과',all.filter(d=>invOpen(d)&&(invInfo(d).late||(d.date&&today()>ntfDue(d)))).length)}${chip('done','판정 완료',all.filter(d=>d.inv&&d.inv.verdict).length)}${chip('all','전체',all.length)}
    <input type="search" placeholder="검색 (부품·품명·유형·협력사·판정)" value="${esc(f.q)}" oninput="state.ivf.q=this.value;$('#ivtab').innerHTML=invTable()" style="flex:1;min-width:200px;max-width:360px"></div>
    <div class="help" style="margin-top:8px">귀책이 ‘미정’인 불량이 여기 모입니다. 격리·선별 후 협력사에 FAR(원인 분석)을 요청하고, 사내 분석(간단하면 메모, 큰 건은 RCA)을 함께 진행한 뒤 판정합니다. 판정하면 불량의 귀책이 바뀌고 협력사는 NCR, 사내는 사내 대책·RCA로 넘어갑니다.</div></div>
  <div class="card" id="ivtab">${invTable()}</div>`;
}
function invTable(){
  const rows=invRows();
  return `<div class="tw"><table><thead><tr><th>등록일</th><th>불량</th><th>협력사</th><th class="n">수량</th><th>상태</th><th>FAR 요청</th><th>FAR 회신</th><th>사내 분석</th><th>판정</th><th>검토 기한</th><th class="noprint"></th></tr></thead><tbody>
  ${rows.map(d=>{const iv=d.inv||{},cs=defCase(d),ii=invInfo(d),opn=invOpen(d);return `<tr>
    <td class="mono">${esc(d.date)}</td>
    <td><a class="lk" onclick="editInv('${d.id}')"><b>${esc(d.partNo||d.fgNo||'-')}</b></a> ${esc(d.partName||d.fgName||'')}<br><span class="muted">${esc(d.type||'')}${d.source?' · '+esc(d.source):''}</span> ${sevBadge(d,true)}</td>
    <td>${esc(supName(d.supplierId))||'<span class="muted">미지정</span>'}</td>
    <td class="n">${num(d.qty).toLocaleString()}</td>
    <td>${iv.verdict?`<span class="bg ok">판정 완료</span>`:opn?`<span class="bg ${ii.cls}">${esc(ii.label)}</span>`:'<span class="bg mut">조사 종료</span>'}</td>
    <td style="white-space:nowrap">${iv.farReq?esc(iv.farReq):'<span class="muted">-</span>'}${iv.farReq&&!iv.farRecv&&iv.farDue?'<br>'+dday(iv.farDue,false):''}</td>
    <td style="white-space:nowrap">${iv.farRecv?esc(iv.farRecv):'<span class="muted">-</span>'}</td>
    <td>${cs?`<a class="lk" onclick="czOpenCase('${cs.id}','cause')">RCA ${esc(cs.CaseNo)}</a><br><span class="muted">${esc(cs.Stage||'')}</span>`:(iv.rca||'').trim()?'<span class="bg inf">메모</span>':'<span class="muted">-</span>'}</td>
    <td>${iv.verdict?`<b>${esc(iv.verdict)}</b>${iv.verdict==='공동'&&iv.share!==''&&iv.share!=null?` <span class="muted">${esc(iv.share)}%</span>`:''}<br><span class="muted mono">${esc(iv.verdictDate||'')}</span>`:'<span class="muted">-</span>'}</td>
    <td style="white-space:nowrap">${opn&&d.date?dday(ntfDue(d),false):'<span class="muted">-</span>'}</td>
    <td class="noprint" style="white-space:nowrap"><button class="b s" onclick="editInv('${d.id}')">조사</button> <button class="b s" onclick="editDefect('${d.id}')">불량</button></td></tr>`}).join('')||`<tr><td colspan="11" class="muted" style="text-align:center;padding:30px">${state.ivf.status==='open'?'진행 중인 귀책 조사가 없습니다. 불량 등록에서 귀책을 ‘미정’으로 두면 여기에 나타납니다.':'조건에 맞는 건이 없습니다.'}</td></tr>`}
  </tbody></table></div>`;
}
function invSteps(d){
  const iv=d.inv||{},cs=defCase(d),t=today();
  const S=[{l:'불량 등록',d:d.date,done:true},{l:'FAR 요청',d:iv.farReq,done:!!iv.farReq},
    {l:'FAR 회신',d:iv.farRecv||iv.farDue,done:!!iv.farRecv,due:!iv.farRecv&&iv.farDue},
    {l:'사내 분석',d:cs?cs.CaseNo:'',done:!!cs||!!(iv.rca||'').trim(),txt:true},
    {l:'귀책 판정',d:iv.verdictDate||(iv.verdict?'':ntfDue(d)),done:!!iv.verdict,due:!iv.verdict&&d.date&&ntfDue(d)}];
  let cur=S.findIndex(x=>!x.done);if(cur<0)cur=S.length;
  return `<div class="qtrack${iv.verdict?' closed':''}" style="grid-template-columns:repeat(5,minmax(0,1fr))">${S.map((x,i)=>{const late=!x.done&&x.due&&t>x.due;return `<div class="${x.done||i<cur?'past':i===cur?'cur':''}${late?' late':''}">${x.l}<b>${x.d?(x.due&&!x.done?'기한 ':'')+esc(x.txt?String(x.d):String(x.d).slice(5)):'–'}${late?' 초과':''}</b></div>`}).join('')}</div>`;
}
let invCurId='';
function editInv(id,focus){
  const d=db.defects.find(x=>x.id===id);if(!d)return;invCurId=id;
  const iv=d.inv||{},S=db.settings,cs=defCase(d);
  const body=`${invSteps(d)}
  <div class="route" style="margin-top:0;margin-bottom:6px"><div class="ri"><div class="tx"><b>${esc(d.partNo||d.fgNo||'')} ${esc(d.partName||d.fgName||'')}</b> ${sevBadge(d)}<br>
    <span class="muted">${esc(d.date)} · ${esc(d.source||'')} · ${esc(d.type||'')} · ${num(d.qty).toLocaleString()}EA · ${esc(supName(d.supplierId))||'협력사 미지정'}</span>${d.desc?`<br><span style="font-size:12.5px">${esc(d.desc)}</span>`:''}</div>
    <button type="button" class="b s" onclick="routeGo(&quot;editDefect('${id}')&quot;)">불량 열기</button></div></div>
  ${d.resp!=='미정'&&!iv.verdict?`<div class="banner" style="margin:8px 0 0">이 불량의 귀책은 현재 <b>${esc(d.resp||'협력사')}</b>입니다. 판정을 입력하면 판정 결과로 바뀝니다.</div>`:''}
  <div class="sec">협력사 FAR (원인 분석 요청) <span class="muted" style="font-weight:normal;font-size:12px">귀책 인정 요구가 아니라 분석 요청입니다</span></div>
  <div class="fg">
    <label>FAR 요청일<input type="date" name="inv_farReq" value="${esc(iv.farReq)}" oninput="invAuto()"></label>
    <label>FAR 회신 기한 <span style="font-size:11px">(요청 + ${num(S.farDays)||5}영업일)</span><input type="date" name="inv_farDue" value="${esc(iv.farDue)}"></label>
    <label>FAR 회신일<input type="date" name="inv_farRecv" value="${esc(iv.farRecv)}"></label>
    <label>불량 샘플 송부<input name="inv_sample" value="${esc(iv.sample)}" placeholder="예: 3EA 택배 송부"></label>
    <label class="full row" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" name="inv_costNotice" ${iv.costNotice?'checked':''}> 비용 청구 가능성 통보 <span class="muted" style="font-size:11px">— FAR 요청서에 ‘귀사 부품 원인으로 확인되면 비용을 청구할 수 있다’는 문구를 넣습니다</span></label>
    <label class="full">FAR 회신 요약 (협력사 분석 결과)<textarea name="inv_farResult">${esc(iv.farResult)}</textarea></label>
  </div>
  <div style="margin-top:12px;font-size:12px;color:var(--sub)">FAR 요청서에 넣을 사진 <span class="muted">(불량 사진 · 진행 기록 사진 · 체크 해제하면 제외 · 최대 ${FAR_PH_MAX}장)</span></div>
  <div id="invPhBox" class="row" style="gap:8px;margin-top:6px"></div>
  <div class="sec">사내 분석 <span class="muted" style="font-weight:normal;font-size:12px">재현시험 · 측정 · 분해 분석</span></div>
  ${cs?`<div class="route" style="margin-top:0"><div class="ri dn"><span class="ck">✓</span><div class="tx"><b>RCA ${esc(cs.CaseNo)}</b> · ${esc(cs.Stage||'')} · ${esc(cs.Status||'')}<br><span class="muted">${czCauseSum(cs)?'RCA 결론 — '+esc(czCauseSum(cs).slice(0,140)):'사내 분석은 RCA 원인분석에서 관리합니다. RCA의 ‘귀책 판정 반영’으로 판정할 수 있습니다.'}</span></div><button type="button" class="b s" onclick="routeGo(&quot;czOpenCase('${cs.id}','cause')&quot;)">RCA 열기</button></div></div>
    ${(iv.rca||'').trim()?`<div class="help" style="margin-top:6px">RCA 연결 전 메모: ${esc(iv.rca)}</div>`:''}<input type="hidden" name="inv_rca" value="${esc(iv.rca)}">`
  :`<div class="fg"><label class="full">사내 분석 메모 <span><button type="button" class="b s" onclick="routeGo(&quot;czFromDefect('${id}')&quot;)">RCA 요청</button> <span class="muted">큰 건은 RCA로 관리 (A등급 · 고객 유출 권장)</span></span><textarea name="inv_rca" placeholder="예: 동일 LOT 재현시험 3/3 재현, 조립 토크 정상 범위 확인">${esc(iv.rca)}</textarea></label></div>`}
  <div class="sec">귀책 판정 <span class="muted" style="font-weight:normal;font-size:12px">원인 불명 검토 기한 ${esc(d.date?ntfDue(d):'-')}</span></div>
  <div class="fg">
    <label>귀책 판정<select name="inv_verdict" onchange="invVerdictI()">${opts(VERDICTS,iv.verdict,true)}</select></label>
    <label>판정일<input type="date" name="inv_verdictDate" value="${esc(iv.verdictDate)}"></label>
    <label id="shareL" style="${iv.verdict==='공동'?'':'display:none'}">협력사 부담 비율 (%)<input type="number" min="0" max="100" name="inv_share" value="${esc(iv.share)}" placeholder="합의 비율"></label>
    <label class="full">판정 근거 · 비용 처리 <span style="font-size:11px">(FAR·RCA 결론 요약, 원인 불명: 사내 부담 / 협의 비율 등)</span><input name="inv_basis" value="${esc(iv.basis)}"></label>
  </div>
  <div class="help" style="margin-top:6px" id="invNext">판정하면 불량의 귀책이 바뀝니다 — <b>협력사</b>: 원인 부품 지정 후 NCR 발행 · <b>사내</b>: 사내 대책·RCA · <b>공동</b>: 분담 비율로 구상 · <b>원인 불명</b>: 완료 처리 (재발 시 재조사).</div>`;
  const btns=[{label:'취소',fn:closeModal},{label:'저장',cls:'p',fn:()=>saveInv(id)}];
  btns.unshift({label:'저장 후 FAR 요청서 출력',fn:()=>{const w=reportWin();if(saveInv(id,true))printFar(id,w);else if(w)w.close()}});
  curInvExcl=new Set(iv.photoExcl||[]);
  openModal(`귀책 조사 — ${defLabel(d)}`,body,btns);renderInvPhotos();
  if(iv.verdict)$('#mt').insertAdjacentHTML('beforeend','<span class="qstamp">판정 완료</span>');
  if(focus)setTimeout(()=>{const e=document.querySelector(`#mf [name=${focus}]`);if(e){e.scrollIntoView({block:'center'});e.focus()}},120);
}
function invVerdictI(){
  const f=$('#mf'),v=f.inv_verdict.value;
  if(v&&!f.inv_verdictDate.value)f.inv_verdictDate.value=today();
  const sl=$('#shareL');if(sl)sl.style.display=v==='공동'?'':'none';
  const d=db.defects.find(x=>x.id===invCurId);
  if(v==='협력사'&&d&&!d.partNo)toast('협력사 귀책 — 불량에 원인 품번을 지정해야 NCR을 발행할 수 있습니다');
}
function saveInv(id,keep){
  const d=db.defects.find(x=>x.id===id);if(!d)return false;
  const o=gather(),iv=Object.assign({},d.inv||{});
  Object.keys(o).forEach(k=>{if(k.startsWith('inv_'))iv[k.slice(4)]=o[k]});
  iv.costNotice=!!o.inv_costNotice;
  if(invCurId===id)iv.photoExcl=[...curInvExcl];
  if(iv.share!==''&&iv.share!=null)iv.share=Math.max(0,Math.min(100,num(iv.share)));
  if(iv.farReq&&!iv.farDue)iv.farDue=addBiz(iv.farReq,num(db.settings.farDays)||5);
  if(iv.verdict==='공동'&&(iv.share===''||iv.share==null)){toast('공동 귀책은 협력사 부담 비율을 입력하세요');return false}
  const prev=(d.inv||{}).verdict||'';
  if(iv.verdict){if(!iv.verdictDate)iv.verdictDate=today();d.resp=VERDICT_RESP[iv.verdict]||d.resp}
  else{iv.verdictDate='';if(prev&&d.resp!=='미정')d.resp='미정'}
  d.inv=iv;touch(d);try{farSyncAll()}catch(e){console.error(e)}save();   // 연결된 NCR 의 FAR 도 같은 값으로
  if(!keep)closeModal(true);render();
  if(!keep&&iv.verdict&&iv.verdict!==prev)setTimeout(()=>offerNcrAfterVerdict([id],iv.verdict),350);
  toast(iv.verdict?`귀책 판정: ${iv.verdict} → ${iv.verdict==='협력사'?'NCR 발행 단계':iv.verdict==='사내'?'사내 대책 단계':iv.verdict==='공동'?'분담·NCR 단계':'완료 처리'}`:'귀책 조사를 저장했습니다');
  return true;
}
function invSection(d,id){
  const iv=d.inv||{},S=db.settings;
  const filled=[iv.farReq&&'FAR 요청',iv.farRecv&&'FAR 회신',(iv.rca||'').trim()&&'RCA 기록',iv.verdict&&'판정: '+iv.verdict].filter(Boolean);
  return `<details id="invWrap" ${d.resp==='미정'||filled.length?'open':''} style="margin-top:14px">
  <summary class="sec" style="cursor:pointer;list-style:revert">귀책 조사 — 협력사 FAR · 사내 RCA ${filled.length?`<span class="bg inf" style="font-weight:normal">${esc(filled.join(' · '))}</span>`:''} <span class="muted" style="font-weight:normal;font-size:12px">원인·귀책이 불분명할 때: 격리·선별 후 FAR 요청과 사내 RCA를 동시에 진행하고 판정 (귀책 ‘미정’이면 자동으로 펼쳐짐)</span></summary>
  <div class="fg">
    <label class="row" style="flex-direction:row;align-items:center;gap:6px;margin-top:16px"><input type="checkbox" name="inv_costNotice" ${iv.costNotice?'checked':''}><span title="체크하면 FAR 요청서에 ‘원인이 귀사 부품으로 확인되면 비용을 청구할 수 있다’는 문구가 들어갑니다" style="white-space:nowrap">비용 청구 가능성 통보 <span class="muted" style="font-size:11px">(FAR 요청서)</span></span></label>
    <label>FAR 요청일<input type="date" name="inv_farReq" value="${esc(iv.farReq)}" oninput="invAuto()"></label>
    <label>FAR 회신 기한 <span style="font-size:11px">(요청 + ${num(S.farDays)||5}영업일)</span><input type="date" name="inv_farDue" value="${esc(iv.farDue)}"></label>
    <label>FAR 회신일<input type="date" name="inv_farRecv" value="${esc(iv.farRecv)}"></label>
    <label>불량 샘플 송부<input name="inv_sample" value="${esc(iv.sample)}" placeholder="예: 3EA 택배 송부"></label>
    <label>원인 불명 종결 검토 기한<input type="date" disabled value="${esc(d.date?ntfDue(d):'')}" title="등록일 + ${num(S.ntfDays)||30}일 (설정에서 변경)"></label>
    <label class="full">FAR 회신 요약 (협력사 분석 결과)<textarea name="inv_farResult">${esc(iv.farResult)}</textarea></label>
    <label class="full">사내 RCA 결과 (재현시험 · 측정 · 분해 분석 등)<textarea name="inv_rca">${esc(iv.rca)}</textarea></label>
    <label>귀책 판정<select name="inv_verdict" onchange="invVerdict()">${opts(VERDICTS,iv.verdict,true)}</select></label>
    <label>판정일<input type="date" name="inv_verdictDate" value="${esc(iv.verdictDate)}"></label>
    <label id="shareL" style="${iv.verdict==='공동'||d.resp==='공동'?'':'display:none'}">협력사 부담 비율 (%)<input type="number" min="0" max="100" name="inv_share" value="${esc(iv.share)}" placeholder="합의 비율"></label>
    <label class="full">판정 근거 · 비용 처리 <span style="font-size:11px">(원인 불명: 사내 부담 / 협의 비율 등)</span><input name="inv_basis" value="${esc(iv.basis)}"></label>
  </div>
  <div class="help" style="margin-top:6px">판정하면 귀책이 바뀝니다 — <b>협력사</b>: 원인 부품 지정 후 NCR 발행 · <b>사내</b>: 사내 대책 · <b>공동</b>: 분담 비율로 구상 · <b>원인 불명</b>: 완료 처리 (재발 시 재조사).
  ${id?` <button type="button" class="b s" onclick="farPrint('${id}')">FAR 요청서 출력</button>`:' 저장 후 FAR 요청서를 출력할 수 있습니다.'}</div></details>`;
}
let icaCurId=null;
function editIca(id){
  const d=db.defects.find(x=>x.id===id);if(!d)return;icaCurId=id;
  const cs=defCase(d),lv=icaLevel(d);
  const body=`<div class="route" style="margin-top:0;margin-bottom:6px"><div class="ri"><div class="tx"><b>${esc(d.partNo||d.fgNo||'')} ${esc(d.partName||d.fgName||'')}</b> ${sevBadge(d)} <span class="bg mut">귀책 ${esc(d.resp||'-')}</span><br>
    <span class="muted">${esc(d.date)} · ${esc(d.source||'')} · ${esc(d.type||'')} · ${num(d.qty).toLocaleString()}EA</span>${d.desc?`<br><span style="font-size:12.5px">${esc(d.desc)}</span>`:''}</div>
    <button type="button" class="b s" onclick="routeGo(&quot;editDefect('${id}')&quot;)">불량 열기</button></div></div>
  ${cs?'':`<div class="help" style="margin:8px 0 0">간단한 건은 여기서 사내 대책을 기록하고, 원인분석·조치·단계 관리가 필요한 큰 건(A등급 · 고객 유출)은 <a class="lk" onclick="routeGo(&quot;czFromDefect('${id}')&quot;)">RCA로 관리</a>하세요.</div>`}
  ${icaSection(d,true)}`;
  const btns=cs?[{label:'닫기',fn:closeModal}]:[{label:'취소',fn:closeModal},{label:'저장',cls:'p',fn:()=>saveIca(id)}];
  openModal(`사내 대책 — ${defLabel(d)}`,body,btns);
  if(d.ica&&d.ica.doneDate)$('#mt').insertAdjacentHTML('beforeend','<span class="qstamp">완료</span>');
  icaShow();
}
function saveIca(id,keep){
  const d=db.defects.find(x=>x.id===id);if(!d)return false;
  const o=gather(),c={std:{}};
  Object.keys(o).forEach(k=>{if(k.startsWith('ica_std_'))c.std[k.slice(8)]=true;else if(k.startsWith('ica_'))c[k.slice(4)]=o[k]});
  if(c.doneDate&&!c.verifyDue)c.verifyDue=addDays(c.doneDate,num(db.settings.verifyDays)||21);
  const lvEff=c.level||ICA_NONE;
  if(!c.due&&lvEff!==ICA_NONE)c.due=addDays((d.inv&&d.inv.verdictDate)||d.date,typeDays(lvEff==='8D'?'8D 보고서':'간이 대책서'));
  const sel=$('#mf').ica_level;if(!(sel&&sel.dataset.touched))delete c.level;
  d.ica=c;touch(d);save();if(!keep)closeModal(true);render();
  toast(c.doneDate?`사내 대책 완료 — 유효성 검증 기한 ${c.verifyDue}`:'사내 대책을 저장했습니다');
  return true;
}
// 불량 목록 후속 조치 칸의 사내 대책 상태
function icaChip(d){
  const c=d.ica||{},vi=icaVerify(d);
  if(c.doneDate)return `<a class="bg ${vi&&vi.k==='ng'?'bad':'ok'}" onclick="editIca('${d.id}')">${vi?esc(vi.label):'완료'}</a>`;
  if(icaStarted(c)){const late=c.due&&today()>c.due;return `<a class="bg ${late?'bad':'inf'}" onclick="editIca('${d.id}')">${esc(icaLevel(d))} 작성 중${late?' · 기한 초과':''}</a>`}
  return '';
}
function icaSection(d,force){
  const c=d.ica||{},lv=icaLevel(d),auto=icaLevelAuto(d);
  const lbl8={d1:'D1 팀 구성',d2:'D2 문제 기술',d3:'D3 임시조치 (봉쇄)',d4:'D4 근본원인 (발생 / 유출)',d5:'D5 영구대책 선정',d6:'D6 대책 실행 및 효과 확인',d7:'D7 재발방지 (표준화)',d8:'D8 팀 격려 · 종결'};
  const cs=defCase(d);if(cs)return `<div id="icaWrap" style="${force||d.resp==='사내'?'':'display:none'}"><div class="banner" style="margin-top:14px;background:var(--pri2);border-color:#c9d8f2;color:#1d2433">사내 대책은 <a class="lk" onclick="czOpenCase('${cs.id}','cause')">RCA ${esc(cs.CaseNo)}</a>에서 관리합니다 (현재 ${esc(cs.Stage)}). 원인분석 워크시트 · 조치 · 단계 게이트를 거쳐 종결하면 이 불량도 완료됩니다.${icaStarted(d.ica)?' 이 칸에 먼저 적어 둔 사내 대책 내용은 그대로 보관됩니다.':''}</div></div>`;
  return `<div id="icaWrap" style="${force||d.resp==='사내'?'':'display:none'}">
  <div class="sec">사내 대책 (RCA → 대책) <span class="muted" style="font-weight:normal;font-size:12px">심각도 기준 권장: <b id="icaAuto">${auto}</b> — A: 8D · B: 간이 대책 · C: 기록만</span></div>
  <div class="fg">
    <label>대책 수준<select name="ica_level" ${c.level?'data-touched="1"':''} onchange="this.dataset.touched=1;icaShow()">${opts(ICA_LV,lv)}</select></label>
    <label>대책 기한<input type="date" name="ica_due" value="${esc(c.due)}"></label>
    <label>대책 완료일 (승인)<input type="date" name="ica_doneDate" value="${esc(c.doneDate)}"></label>
    <label>유효성 검증 기한<input type="date" name="ica_verifyDue" value="${esc(c.verifyDue)}" placeholder="완료일 + ${db.settings.verifyDays}일"></label>
    <label>검증일<input type="date" name="ica_verifyDate" value="${esc(c.verifyDate)}"></label>
    <label>검증 결과<select name="ica_verifyResult">${opts(['유효','무효(재발)'],c.verifyResult,true)}</select></label>
  </div>
  <div id="icaD">${ICA_KEYS.map(k=>`<label class="full" data-ik="${k}" style="display:block;margin-top:6px"><span class="il" data-o="${lbl8[k]}">${lbl8[k]}</span><textarea name="ica_${k}" style="min-height:44px">${esc(c[k])}</textarea></label>`).join('')}</div>
  <div class="row" id="icaStd" style="margin-top:8px;gap:12px;font-size:13px"><b>표준화 반영 확인</b>${ICA_STD.map(([k,l])=>`<label class="row" style="gap:4px"><input type="checkbox" name="ica_std_${k}" ${c.std&&c.std[k]?'checked':''}> ${l}</label>`).join('')}
    ${d.id?`<span style="flex:1"></span><button type="button" class="b s" onclick="icaPrint('${d.id}')">사내 대책서 출력</button>`:''}</div>
  </div>`;
}
function icaPrint(id){const w=reportWin();if(mfDirty&&$('#mf')&&!$('#mf').date){if(saveIca(id,true))printIca(id,w);else if(w)w.close();return}if(mfDirty){saveDefect(id).then(nid=>{if(nid)printIca(nid,w);else if(w)w.close()});return}printIca(id,w)}
async function printIca(id,w0){
  const d=db.defects.find(x=>x.id===id);if(!d)return;
  const w=w0||reportWin(),c=d.ica||{},iv=d.inv||{},lv=icaLevel(d),simple=lv==='간이 대책';
  const SL={d4:'원인 (발생 · 유출)',d5:'대책 내용',d6:'적용일 · 효과 확인'};
  const keys=simple?['d4','d5','d6']:ICA_KEYS;
  let phs=[];try{phs=(await photoGetMany(d.photos||[])).slice(0,4)}catch(e){}
  const vi=icaVerify(d);
  const html=reportFrame(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>사내 대책서 — ${esc(defLabel(d))}</title><style>body{font-family:'Malgun Gothic',sans-serif;font-size:12px;margin:24px;color:#111}table{width:100%;border-collapse:collapse;margin-bottom:12px}td,th{border:1px solid #555;padding:6px;vertical-align:top;text-align:left}th{background:#eef1f6;width:20%}h1{font-size:18px;margin:6px 0 10px}.pg{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pg img{width:100%;max-height:60mm;object-fit:contain}figure{margin:0}</style></head><body>
  ${logoHead()}<h1>사내 대책서 (${esc(lv==='8D'?'8D':'간이 대책')})</h1>
  <table><tr><th>발생일 / 발생처</th><td>${esc(d.date)} / ${esc(d.source)}</td><th>담당</th><td>${esc(d.owner)}</td></tr>
  ${d.fgNo||d.fgName?`<tr><th>발견 품목 (완성품)</th><td colspan="3">${esc(d.fgNo)} ${esc(d.fgName)}${d.fgQty?` · ${num(d.fgQty)} EA`:''}</td></tr>`:''}
  <tr><th>원인 부품</th><td>${esc(d.partNo)} ${esc(d.partName)}</td><th>불량유형 / 수량</th><td>${esc(d.type)} / ${num(d.qty).toLocaleString()} EA</td></tr>
  <tr><th>불량 현상</th><td colspan="3">${nl(d.desc)}</td></tr>
  ${iv.verdict?`<tr><th>귀책 판정</th><td colspan="3">${esc(iv.verdict)} (${esc(iv.verdictDate)})${iv.basis?' — '+esc(iv.basis):''}</td></tr>`:''}
  ${iv.rca?`<tr><th>사내 RCA</th><td colspan="3">${nl(iv.rca)}</td></tr>`:''}
  <tr><th>대책 기한 / 완료일</th><td>${esc(c.due)} / ${esc(c.doneDate)}</td><th>유효성 검증</th><td>${esc(c.verifyDue)} / ${esc(c.verifyDate)} ${esc(c.verifyResult)}${vi?` (${esc(vi.label)})`:''}</td></tr></table>
  <table>${keys.map(k=>`<tr><th>${simple?SL[k]:(D8.find(x=>x[0]===k)||[k,k])[1]}</th><td style="height:46px">${nl(c[k])}</td></tr>`).join('')}
  <tr><th>표준화 반영</th><td>${ICA_STD.map(([k,l])=>`${c.std&&c.std[k]?'☑':'☐'} ${l}`).join(' &nbsp; ')}</td></tr></table>
  ${phs.length?`<div class="pg">${phs.map(p=>`<figure><img src="${p.data}"></figure>`).join('')}</div>`:''}
  </body></html>`);
  reportShow(w,html,`사내대책서_${d.date}.html`);
}
function farPrint(id){
  const w=reportWin();
  if(mfDirty){saveDefect(id).then(nid=>{if(nid)printFar(nid,w);else if(w)w.close()});return}
  printFar(id,w);
}
async function printFar(id,w0){
  const d=db.defects.find(x=>x.id===id);if(!d)return;
  const w=w0||reportWin(),S=db.settings,iv=d.inv||{},sp=supById(d.supplierId),att=sp?primaryOf(sp):null;
  const exP=new Set(iv.photoExcl||[]);let phs=[];try{phs=(await photoGetMany(invPhotoIds(d).filter(i=>!exP.has(i)))).slice(0,FAR_PH_MAX)}catch(e){}
  const due=iv.farDue||addBiz(iv.farReq||today(),num(S.farDays)||5);
  const row=(k,v)=>`<tr><th>${k}</th><td>${v||'-'}</td></tr>`;
  const html=reportFrame(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>FAR 요청 — ${esc(defLabel(d))}</title><style>
  body{font-family:'Malgun Gothic',sans-serif;font-size:12px;margin:24px;color:#111}h1{font-size:19px;margin:6px 0 2px;text-align:center;letter-spacing:2px}
  .sub{text-align:center;color:#555;margin-bottom:14px}table{width:100%;border-collapse:collapse;margin-bottom:12px}th,td{border:1px solid #555;padding:6px 8px;vertical-align:top;text-align:left}
  th{background:#eef1f6;width:22%;font-weight:600}.two td{width:28%}.req li{margin:4px 0;line-height:1.5}.ntc{border:1.5px solid #b42318;color:#7a1414;padding:8px 10px;margin:10px 0;line-height:1.5}
  .pg{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pg figure{margin:0;border:1px solid #ccc;padding:4px;break-inside:avoid}.pg img{width:100%;max-height:62mm;object-fit:contain}.pg figcaption{font-size:10.5px;color:#444;text-align:center}
  .sig{margin-top:18px;display:flex;justify-content:space-between;color:#333}</style></head><body>
  ${logoHead()}<h1>불량 원인 분석 요청서</h1><div class="sub">Failure Analysis Report (FAR) Request</div>
  <table class="two"><tr><th>수신</th><td>${esc(sp?.name||'-')}${att?` · ${esc(att.name)}`:''}</td><th>발신</th><td>${esc(S.company)} ${esc(S.dept)} · ${esc(d.owner||'')}</td></tr>
  <tr><th>요청일</th><td>${esc(iv.farReq||today())}</td><th>회신 기한</th><td><b style="color:#b42318">${esc(due)}</b></td></tr></table>
  <table>${row('발생일 / 발생처',`${esc(d.date)} / ${esc(d.source)}`)}
  ${d.fgNo||d.fgName?row('발견 품목 (완성품)',`${esc(d.fgNo)} ${esc(d.fgName)}${d.fgQty!==''&&d.fgQty!=null?` · ${num(d.fgQty).toLocaleString()} EA`:''}`):''}
  ${row('대상 부품 (추정)',d.partNo||d.partName?`${esc(d.partNo)} ${esc(d.partName)}`:'조사 중')}
  ${row('불량 유형 / 수량',`${esc(d.type)} / ${num(d.qty).toLocaleString()} EA${d.inspQty?` (로트 ${num(d.inspQty).toLocaleString()} EA 중)`:''}`)}
  ${row('LOT / 납품일자',esc(lotOf(d)))}
  ${row('불량 현상',nl(d.desc))}
  ${row('당사 임시조치',nl(d.containment))}
  ${iv.sample?row('불량 샘플',esc(iv.sample)):''}</table>
  <b>요청 사항</b><ol class="req">
    <li>불량 원인 분석 보고서(FAR)를 <b>${esc(due)}</b>까지 회신 바랍니다 — 발생 원인 · 유출 원인, 분석 근거(측정 데이터 · 시험 결과 · 사진) 포함.</li>
    <li>동일 LOT 및 의심 LOT의 재고(사내 · 운송 중)를 즉시 확인 · 격리하고 결과를 함께 회신 바랍니다.</li>
    <li>분석 결과 귀사 부품의 문제로 확인될 경우, 별도 부적합 통보(NCR)에 따라 대책서를 요청드립니다.</li></ol>
  ${iv.costNotice?`<div class="ntc">※ 본 건의 원인이 귀사 부품으로 확인될 경우, 선별 · 재작업 · 폐기 · 물류 등 당사에 발생한 비용을 청구할 수 있음을 알려드립니다. 비용 내역은 원인 확정 후 별도 통보드립니다.</div>`:''}
  ${phs.length?`<b>불량 사진</b><div class="pg">${phs.map(p=>`<figure><img src="${p.data}">${p.caption?`<figcaption>${esc(p.caption)}</figcaption>`:''}</figure>`).join('')}</div>`:''}
  <div class="sig"><span>${esc(S.issuerPhone?'Tel. '+S.issuerPhone:'')} ${esc(S.issuerEmail?'E-mail. '+S.issuerEmail:'')}</span><span>${esc(S.company)} 품질 담당 ${esc(d.owner||'')}</span></div>
  </body></html>`);
  reportShow(w,html,`FAR요청_${d.date}_${(d.partNo||d.fgNo||'').replace(/[^\w가-힣-]/g,'')}.html`);
}
function respChanged(init){
  const f=$('#mf');if(!f||!f.resp)return;const r=f.resp.value;
  const iw=$('#invWrap');if(iw&&r==='미정')iw.open=true;
  const cw=$('#icaWrap');if(cw)cw.style.display=r==='사내'?'':'none';
  const sl=$('#shareL');if(sl)sl.style.display=r==='공동'||(f.inv_verdict&&f.inv_verdict.value==='공동')?'':'none';
  icaShow();escShow();
}
// 수입검사 검출 판정 칸은 공정 · 출하 · 고객 발견 + 협력사/공동 귀책일 때만
function escShow(){const f=$('#mf'),w=$('#escRow');if(!f||!w||!f.source||!f.resp)return;w.style.display=escAsk({source:f.source.value,resp:f.resp.value})?'':'none'}
function icaSync(){
  const f=$('#mf');if(!f||!f.ica_level||typeof sevDraft!=='function')return;
  const a=icaLevelAuto(sevDraft());const e=$('#icaAuto');if(e)e.textContent=a;
  if(!f.ica_level.dataset.touched&&f.ica_level.value!==a){f.ica_level.value=a;icaShow()}
}
function icaShow(){
  const f=$('#mf');if(!f||!f.ica_level)return;const lv=f.ica_level.value,simple=lv==='간이 대책',none=lv===ICA_NONE;
  const SL={d4:'원인 (발생 · 유출)',d5:'대책 내용',d6:'적용일 · 효과 확인'};
  document.querySelectorAll('#icaD [data-ik]').forEach(el=>{const k=el.dataset.ik;el.style.display=none?'none':simple&&!SL[k]?'none':'block';const lb=el.querySelector('.il');lb.textContent=simple&&SL[k]?SL[k]:lb.dataset.o});
  $('#icaStd').style.display=none?'none':'';
}
function invAuto(){const f=$('#mf');if(f.inv_farReq.value)f.inv_farDue.value=addBiz(f.inv_farReq.value,num(db.settings.farDays)||5)}
function invVerdict(){
  const f=$('#mf'),v=f.inv_verdict.value;
  if(v){f.resp.value=VERDICT_RESP[v];if(!f.inv_verdictDate.value)f.inv_verdictDate.value=today()}
  if(v==='협력사'&&!f.partNo.value.trim())toast('협력사 귀책 — 원인 품번을 지정해야 NCR을 발행할 수 있습니다');
  respChanged();renderSev();
}
let curSev={};
/* ---- 조사 · 진행 기록 (통합 타임라인) ---- */
const LOG_KINDS=['협력사 연락','현장 확인','측정·시험','회의·보고','조치 실시','조사','기타'];
const LOG_CLS={'조사':'inf','협력사 연락':'warn','현장 확인':'inf','측정·시험':'inf','시험·분석':'inf','회의·보고':'mut','조치 실시':'ok','조치':'ok','기타':'mut','자동':'mut'};
const lastLog=d=>(d.logs||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.at||'').localeCompare(a.at||''))[0];
const defLabel=d=>`${d.date} ${d.partName||d.partNo||(d.fgName||d.fgNo?'[완성품] '+(d.fgName||d.fgNo):'')}`;
const ncrOfDefect=d=>d.ncrId?db.ncrs.find(n=>n.id===d.ncrId):null;
function autoEvents(d,n,lbl){
  const E=[],add=(date,text,src)=>{if(date)E.push({date,kind:'자동',text,auto:true,src})};
  if(d){const sl=lbl||'',iv=d.inv||{},ic=d.ica||{};
    if(iv.farReq)add(iv.farReq,`FAR 요청 — 회신 기한 ${iv.farDue||'-'}${iv.costNotice?' · 비용 청구 가능성 통보':''}`,sl);
    if(iv.farRecv)add(iv.farRecv,`FAR 회신 접수${iv.farDue&&iv.farRecv>iv.farDue?' (기한 초과)':''}`,sl);
    if(iv.verdict)add(iv.verdictDate,`귀책 판정 — ${iv.verdict}${iv.verdict==='공동'&&iv.share!==''&&iv.share!=null?` (협력사 ${iv.share}%)`:''}${iv.basis?' · '+iv.basis:''}`,sl);
    if(ic.doneDate)add(ic.doneDate,`사내 대책 완료 (${icaLevel(d)}) — 유효성 검증 기한 ${ic.verifyDue||'-'}`,sl);
    if(ic.verifyDate)add(ic.verifyDate,`사내 대책 유효성 검증 — ${ic.verifyResult||'결과 미입력'}`,sl);
    if(d.closed)add(d.closed.date,`수동 종결 — ${d.closed.reason||''}`,sl);if(d.doneDate&&!d.ncrId)add(d.doneDate,'처리 완료',sl);add(d.date,`불량 등록 — ${d.source||''} ${d.type||''} ${num(d.qty).toLocaleString()}개 · 심각도 ${sevOf(d).grade}`,sl);
    const c=d.claim;if(c){if(c.reqDate)add(c.reqDate,`구상 청구 ${won(c.reqAmt)}원`,sl);if(c.agreeDate)add(c.agreeDate,`구상 합의 ${won(c.agreeAmt)}원`,sl);if(c.recvDate)add(c.recvDate,`구상 회수 ${won(c.recvAmt)}원${c.method?' ('+c.method+')':''}`,sl)}}
  if(n){add(n.issueDate,`${n.no} 발행 — ${n.reqType||'8D 보고서'}${n.basis?' · 근거: '+n.basis:''}`,'NCR');add(n.notifyDate,`협력사 통보${n.notifyMethod?' ('+n.notifyMethod+')':''}`,'NCR');if(n.reqType!=='단순 통보'){add(n.requestDate,`대책 요청 — 회신 기한 ${n.dueDate||'-'}`,'NCR');add(n.d3Date,`D3 봉쇄 회신 접수${n.d3Due&&n.d3Date>n.d3Due?' (기한 초과)':''}${n.cleanPoint?' — 클린 포인트 '+n.cleanPoint:''}`,'NCR');add(n.replyDate,`대책서 회신 접수${n.dueDate&&n.replyDate&&n.replyDate>n.dueDate?' (기한 초과)':''}`,'NCR')}
    (n.evals||[]).filter(evalDone).forEach((e,i)=>add(e.date,`대책서 평가 ${i+1}차 — ${evalScore(e)}점 ${evalVerdict(e)}`,'NCR'));
    if(n.approvedDate)add(n.approvedDate,`대책서 승인 — 연결 불량 완료 처리 · 유효성 검증 기한 ${n.verifyDue||'-'}`,'NCR');
    if(n.verifyDate)add(n.verifyDate,`유효성 검증 — ${n.verifyResult||'결과 미입력'}`,'NCR');
    if(farOn(n)){const f=n.far;add(f.reqDate,`FAR 요청 — ${f.purpose||'불량 분석'}${f.sampleQty?' · 시료 '+f.sampleQty:''} · 회신 기한 ${f.due||'-'}`,'NCR');
      add(f.shipDate,`FAR 시료 발송${f.shipRef?' — '+f.shipRef:''}`,'NCR');add(f.replyDate,`FAR 분석 결과 회신 — ${f.verdict||'판정 미입력'}${f.due&&f.replyDate>f.due?' (기한 초과)':''}`,'NCR')}}
  return E;
}
function caseReadonly(kind,obj){
  if(kind==='defect'){const n=ncrOfDefect(obj);return [...autoEvents(obj,null),...(n?autoEvents(null,n):[]),...(n?(n.logs||[]).map(l=>({...l,src:'NCR',ro:true})):[])]}
  const ds=(obj.defectIds||[]).map(i=>db.defects.find(d=>d.id===i)).filter(Boolean);
  return [...autoEvents(null,obj),...ds.flatMap(d=>[...autoEvents(d,null,defLabel(d)),...(d.logs||[]).map(l=>({...l,src:defLabel(d),ro:true,_did:d.id}))])];
}
function caseEntries(kind,obj){return [...(obj.logs||[]),...caseReadonly(kind,obj)]}
const caseLast=(kind,obj)=>caseEntries(kind,obj).reduce((a,e)=>e.date>a?e.date:a,'');
const caseLastManual=(kind,obj)=>caseEntries(kind,obj).filter(e=>!e.auto).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.at||'').localeCompare(a.at||''))[0];
let curLogs=[];
let tl={own:[],kind:'',obj:null,edit:null,voiding:null,hist:new Set(),hideAuto:false,next:null,newPh:{},draftPh:[],editPh:null};
const LOG_METHODS=['전화','메일','방문','회의','메신저','공문','기타'];
const phCache={};
function tlInit(kind,obj){
  tl={own:JSON.parse(JSON.stringify(obj.logs||[])),kind,obj,edit:null,voiding:null,hist:new Set(),hideAuto:tl.hideAuto,
    newPh:{},draftPh:[],editPh:null};
  curLogs=tl.own;renderLogs();tlLoadThumbs();
}
async function tlLoadThumbs(){
  const ids=[...tl.own,...caseReadonly(tl.kind,tl.obj)].flatMap(l=>l.photos||[]).filter(i=>!phCache[i]&&!tl.newPh[i]);
  if(!ids.length)return;
  try{(await photoGetMany(ids)).forEach(r=>{phCache[r.id]=r});renderLogs()}catch(e){}
}
const phRec=id=>tl.newPh[id]||phCache[id];
const LOG_DRAFT=['lgDate','lgKind','lgParty','lgMethod','lgText','lgResult','leDate','leKind','leParty','leMethod','leText','leResult','leReason','lvReason'];
function renderLogs(keepDraft=true){
  const b=$('#logBox');if(!b)return;
  const draft={};if(keepDraft)LOG_DRAFT.forEach(k=>{const e=document.getElementById(k);if(e)draft[k]=e.value});
  renderLogsInner(b);
  LOG_DRAFT.forEach(k=>{const e=document.getElementById(k);if(e&&draft[k]!==undefined)e.value=draft[k]});
}
const lgLate=x=>x.at&&x.date&&diffDays(x.date,loc(x.at,10))>=2;
function lgThumbs(ids,editable){
  return (ids||[]).length?`<div class="lgph">${ids.map((id,k)=>{const r=phRec(id);return `<span class="t">${r?`<img src="${r.thumb||r.data}" onclick="lgViewPh('${id}')" title="${esc(r.caption||r.name||'')}">`:'<span class="ld">📎</span>'}${editable?`<a onclick="${editable}(${k})" title="빼기">✕</a>`:''}</span>`}).join('')}</div>`:'';
}
function lgViewPh(id){const all=[...new Set([...tl.own,...caseReadonly(tl.kind,tl.obj)].flatMap(l=>l.photos||[]).concat(tl.draftPh,tl.editPh||[]))].map(phRec).filter(Boolean);const i=all.findIndex(r=>r.id===id);if(i>=0)lbOpen(all,i)}
async function lgAddFiles(files,target){
  const imgs=files.filter(f=>f.type.startsWith('image/'));if(!imgs.length){if(files.length)toast('이미지 파일만 첨부할 수 있습니다 (메일·문서는 화면 캡처로 첨부)');return}
  const S=db.settings;
  for(const f of imgs){try{const im=await readImg(f);const r={id:uid(),name:f.name||'붙여넣은 이미지.jpg',caption:'',data:shrink(im,num(S.photoMax)||1600,(num(S.photoQ)||80)/100),thumb:shrink(im,320,.7),createdAt:now(),isNew:true};
    tl.newPh[r.id]=r;(target==='edit'?tl.editPh:tl.draftPh).push(r.id)}catch(e){toast(e.message)}}
  mfDirty=true;renderLogs();
}
function lgPartyList(){
  const sid=tl.obj&&tl.obj.supplierId,s=sid&&db.suppliers.find(x=>x.id===sid);
  const names=s?(s.contacts||[]).filter(c=>c.active!==false&&c.name).map(c=>`${s.name} ${c.name}${c.role?' ('+c.role+')':''}`):[];
  return names.map(n=>`<option value="${esc(n)}">`).join('');
}
function renderLogsInner(b){
  const ownL=tl.own.map((x,i)=>({...x,_i:i}));
  let L=[...ownL,...caseReadonly(tl.kind,tl.obj)];if(tl.hideAuto)L=L.filter(e=>!e.auto);
  L.sort((a,c)=>(c.date||'').localeCompare(a.date||'')||((a.auto?1:0)-(c.auto?1:0))||(c.at||'').localeCompare(a.at||''));
  const nOwn=L.filter(x=>!x.auto).length,nAuto=L.filter(x=>x.auto).length,pend=tl.own.filter(x=>x._new).length,pendEd=tl.own.filter(x=>x._dirty&&!x._new).length;
  const ownCase=typeof czOwns==='function'&&czOwns(tl.obj,tl.kind)?(()=>{const id=tl.obj.caseId||(db.ncrs.find(n=>n.id===tl.obj.ncrId)||{}).caseId;return czById('cases',id)})():null;
  const dd=dt=>{if(!dt)return '';const x=diffDays(today(),dt);return `<span class="bg ${x<0?'bad':x<=2?'warn':'mut'}">${dt} ${x<0?'D+'+(-x):x===0?'오늘':'D-'+x}</span>`};
  const plan=ownCase?`<div class="lgplan" style="background:#f5f9ff;border-color:#cfdcef">이 건은 <a class="lk" onclick="czOpenCase('${ownCase.id}')">RCA ${esc(ownCase.CaseNo)}</a>(으)로 관리 중입니다 · 현재 단계 ${esc(ownCase.Stage)}</div>`:'';
  // ② 실행 기록 쓰기
  const comp=`<div class="lgc"><div class="ch">✎ 실행 기록 남기기 <span class="muted" style="font-weight:normal">— 실제로 한 일과 결과만 적습니다. 저장 후에는 지울 수 없고 수정 이력이 남습니다.</span></div>
    <div class="cg"><label>실행일<input type="date" id="lgDate" value="${today()}" max="${today()}"></label>
      <label>구분<select id="lgKind">${opts(LOG_KINDS,LOG_KINDS[0])}</select></label>
      <label>상대방<input id="lgParty" list="lgParties" placeholder="예: 대성정밀 박OO 과장"></label>
      <label>방법<select id="lgMethod">${opts(LOG_METHODS,'',true)}</select></label></div>
    <datalist id="lgParties">${lgPartyList()}</datalist>
    <div class="cg2"><label>실행 내용 *<textarea id="lgText" placeholder="무엇을 했는가 — 예: 출하 대기 재고 300개 전수 선별, 협력사에 불량 시료 5개 전달"></textarea></label>
      <label>결과 · 합의 사항<textarea id="lgResult" placeholder="예: 불량 4개 추가 검출 / 협력사 귀책 인정, 선별비 부담 합의"></textarea></label></div>
    <div class="cf"><label class="b s" style="cursor:pointer">📎 증빙 첨부<input type="file" accept="image/*" multiple style="display:none" onchange="lgAddFiles([...this.files]);this.value=''"></label>
      <span>메일 · 성적서 · 현장 사진 (캡처 후 Ctrl+V 가능)</span>${lgThumbs(tl.draftPh,'lgRmDraft')}
      <span style="flex:1"></span><button type="button" class="b p" onclick="addLog()">＋ 기록 추가</button></div></div>`;
  const warn=pend||pendEd?`<div class="lgpend">${pend?`새 기록 ${pend}건`:''}${pend&&pendEd?' · ':''}${pendEd?`수정 ${pendEd}건`:''}이 아직 저장되지 않았습니다. 창 아래 <b>저장</b>을 누르세요.</div>`:'';
  const head=`<div class="lgh">실행 기록 <span class="bg mut" style="font-weight:normal">직접 기록 ${nOwn}${nAuto?` · 자동 ${nAuto}`:''}</span><span style="flex:1"></span>
    <label><input type="checkbox" ${tl.hideAuto?'checked':''} onchange="tl.hideAuto=this.checked;renderLogs()"> 자동 기록 숨기기</label><button type="button" class="b s" onclick="lgPrint()">기록 출력</button></div>`;
  const item=x=>{
    const own=x._i!=null,ed=own&&tl.edit===x._i,vo=own&&tl.voiding===x._i,saved=own&&!x._new,hist=x.hist||[];
    const tags=[x._new?'<span class="bg warn">저장 전</span>':'',x.void?'<span class="bg bad">취소됨</span>':'',hist.length?`<a class="bg mut" style="cursor:pointer" onclick="lgTogHist('${x.id}')">수정 ${hist.length}회 · 이력</a>`:'',
      lgLate(x)?`<span class="bg warn" title="실행일보다 늦게 작성">사후 기록 · 작성 ${loc(x.at,10).slice(5)}</span>`:''].join(' ');
    const who=[x.party,x.method].filter(Boolean).join(' · ');
    const del=`<a class="lk" style="font-size:11px;color:var(--bad)" onclick="delLog(${x._i})">삭제</a>`;
    const acts=own&&!ed&&!vo&&x.void?del:own&&!ed&&!vo?`<a class="lk" style="font-size:11px" onclick="lgEdit(${x._i})">수정</a> ${x._new?'':`<a class="lk" style="font-size:11px;color:var(--bad)" onclick="tl.voiding=${x._i};renderLogs()">취소 처리</a> `}${del}`:x.ro&&!x.auto?'<span class="muted" style="font-size:11px">원본에서 수정</span>':'';
    if(ed)return `<li class="ed"><div class="lh"><b>기록 수정</b>${saved?' <span class="muted" style="font-size:11.5px">— 원문은 이력으로 보존됩니다</span>':''}</div>
      <div class="cg" style="margin-top:6px"><label>실행일<input type="date" id="leDate" value="${esc(x.date)}" max="${today()}"></label><label>구분<select id="leKind">${opts(LOG_KINDS.includes(x.kind)?LOG_KINDS:[x.kind,...LOG_KINDS],x.kind)}</select></label>
        <label>상대방<input id="leParty" list="lgParties" value="${esc(x.party)}"></label><label>방법<select id="leMethod">${opts(LOG_METHODS,x.method||'',true)}</select></label></div>
      <div class="cg2"><label>실행 내용<textarea id="leText">${esc(x.text)}</textarea></label><label>결과 · 합의 사항<textarea id="leResult">${esc(x.result)}</textarea></label></div>
      <div class="cf"><label class="b s" style="cursor:pointer">📎 증빙 추가<input type="file" accept="image/*" multiple style="display:none" onchange="lgAddFiles([...this.files],'edit');this.value=''"></label>${lgThumbs(tl.editPh,'lgRmEdit')}</div>
      ${saved?`<label class="lgreason">수정 사유 *<input id="leReason" placeholder="예: 협력사 회신 메일 확인 후 수량 정정"></label>`:''}
      <div class="row" style="margin-top:6px;justify-content:flex-end"><button type="button" class="b s" onclick="tl.edit=null;tl.editPh=null;renderLogs(false)">취소</button><button type="button" class="b s p" onclick="saveLog(${x._i})">확인</button></div></li>`;
    return `<li class="${x.auto?'au':''} ${x._new?'nw':''} ${x.void?'vd':''}"><div class="lh"><b>${esc(x.date)}</b> <span class="bg ${LOG_CLS[x.kind]||'mut'}">${esc(x.kind)}</span>${x.src?` <span class="bg mut" style="font-weight:normal">${esc(x.src)}</span>`:''}${who?` <span style="font-size:12px">${esc(who)}</span>`:''} <span class="muted" style="font-size:11px">${esc(x.by||'')}</span> ${tags}<span style="flex:1"></span>${acts}</div>
      <div class="lt">${nl(x.text)}</div>${x.result?`<div class="lr"><b>결과</b> ${nl(x.result)}</div>`:''}${lgThumbs(x.photos)}
      ${x.void?`<div class="lv">취소 ${esc(loc(x.void.at))} ${esc(x.void.by||'')} — 사유: ${esc(x.void.reason)}</div>`:''}
      ${vo?`<div class="lgreason" style="margin-top:6px">취소 사유 *<div class="row" style="gap:6px"><input id="lvReason" placeholder="예: 다른 건 기록을 잘못 입력" style="flex:1"><button type="button" class="b s" onclick="tl.voiding=null;renderLogs(false)">그만두기</button><button type="button" class="b s" style="color:var(--bad);border-color:#f0c4bf" onclick="lgVoid(${x._i})">취소 처리</button></div><span class="muted">취소 처리한 기록은 취소선과 사유가 남습니다. 아예 없애려면 '삭제'를 누르세요.</span></div>`:''}
      ${hist.length&&tl.hist.has(x.id)?`<div class="lhist">${hist.map((h,k)=>`<div><b>${k+1}차 원문</b> <span class="muted">${esc(loc(h.at))} 수정 · ${esc(h.by||'')} · 사유: ${esc(h.reason||'-')}</span><br>${esc(h.date)} · ${esc(h.kind)}${h.party?' · '+esc(h.party):''}${h.method?' · '+esc(h.method):''}<br>${nl(h.text)}${h.result?`<br>결과: ${nl(h.result)}`:''}</div>`).join('')}</div>`:''}</li>`;
  };
  b.innerHTML=plan+comp+warn+head+(L.length?`<ul class="logs">${L.map(item).join('')}</ul>`:'<div class="muted" style="font-size:12px;padding:6px 2px">아직 기록이 없습니다.</div>');
}
const lgRmDraft=k=>{tl.draftPh.splice(k,1);renderLogs()};
const lgRmEdit=k=>{tl.editPh.splice(k,1);renderLogs()};
const lgTogHist=id=>{tl.hist.has(id)?tl.hist.delete(id):tl.hist.add(id);renderLogs()};
function addLog(){
  const t=$('#lgText').value.trim();if(!t){toast('실행 내용을 입력하세요');$('#lgText').focus();return}
  const d=$('#lgDate').value||today();if(d>today()){toast('실행일은 오늘 이후일 수 없습니다. 실제로 한 일만 기록합니다.');return}
  tl.own.push({id:uid(),date:d,kind:$('#lgKind').value,party:$('#lgParty').value.trim(),method:$('#lgMethod').value,text:t,result:$('#lgResult').value.trim(),photos:[...tl.draftPh],by:db.settings.owners[0]||'',at:now(),_new:true});
  tl.draftPh=[];mfDirty=true;renderLogs(false);
}
function lgEdit(i){tl.edit=i;tl.voiding=null;tl.editPh=[...(tl.own[i].photos||[])];renderLogs(false)}
function saveLog(i){
  const x=tl.own[i],t=$('#leText').value.trim();if(!t){toast('실행 내용을 입력하세요');return}
  const d=$('#leDate').value||x.date;if(d>today()){toast('실행일은 오늘 이후일 수 없습니다');return}
  const nv={date:d,kind:$('#leKind').value,party:$('#leParty').value.trim(),method:$('#leMethod').value,text:t,result:$('#leResult').value.trim(),photos:[...tl.editPh]};
  const same=['date','kind','party','method','text','result'].every(k=>String(x[k]||'')===String(nv[k]||''))&&JSON.stringify(x.photos||[])===JSON.stringify(nv.photos);
  if(same){tl.edit=null;tl.editPh=null;renderLogs(false);return}
  if(!x._new){const r=($('#leReason')?.value||'').trim();if(!r){toast('수정 사유를 입력하세요');$('#leReason')?.focus();return}
    x.hist=[...(x.hist||[]),{at:now(),by:db.settings.owners[0]||'',reason:r,date:x.date,kind:x.kind,party:x.party||'',method:x.method||'',text:x.text,result:x.result||'',photos:[...(x.photos||[])]}];x.editedAt=now();x._dirty=true}
  Object.assign(x,nv);delete x.next;delete x.nextDate;delete x.done;
  tl.edit=null;tl.editPh=null;mfDirty=true;renderLogs(false);
}
function lgVoid(i){const r=($('#lvReason')?.value||'').trim();if(!r){toast('취소 사유를 입력하세요');$('#lvReason')?.focus();return}
  tl.own[i].void={at:now(),by:db.settings.owners[0]||'',reason:r};tl.own[i]._dirty=true;tl.voiding=null;mfDirty=true;renderLogs(false)}
// 기록 삭제 — 저장 전 기록은 바로, 저장된 기록(취소된 것 포함)은 확인 뒤 목록에서 없앰. 창을 저장해야 반영됨
async function delLog(i){const x=tl.own[i];if(!x)return;
  if(!await askConfirm({title:x._new?'저장 전 기록을 삭제할까요?':'이 기록을 삭제할까요?',items:[`${esc(x.date)} · ${esc(x.kind)}${x.void?' · 취소됨':''}`,esc(x.text.slice(0,60))+(x.text.length>60?'…':'')],
    note:x._new?'':'삭제하면 실행 기록과 기록 출력에서 사라집니다. 창 아래 [저장]을 눌러야 반영됩니다.',ok:'삭제',danger:true}))return;
  tl.own.splice(i,1);tl.edit=null;tl.voiding=null;if(!x._new)mfDirty=true;renderLogs(false)}
// 모달 저장 시 호출: 정리된 기록 · 다음 행동을 돌려주고 새 증빙 사진을 저장소에 넣음
function tlCommit(){
  const logs=tl.own.map(({_new,_dirty,...x})=>x);
  const used=new Set(logs.flatMap(l=>[...(l.photos||[]),...(l.hist||[]).flatMap(h=>h.photos||[])]));
  const recs=Object.values(tl.newPh).filter(r=>used.has(r.id)).map(({isNew,...r})=>r);
  if(recs.length){photoPut(recs).then(()=>{recs.forEach(r=>{phCache[r.id]=r});photoStr=null}).catch(e=>toast('증빙 사진 저장 실패: '+e.message))}
  tl.newPh={};tl.draftPh=[];
  return {logs};
}
// 기록 출력 (클레임 협의 · 감사 제출용)
async function lgPrint(){
  const w=reportWin(),o=tl.obj,isN=tl.kind==='ncr';
  const L=[...tl.own.filter(x=>!x._new),...caseReadonly(tl.kind,o)].sort((a,c)=>(a.date||'').localeCompare(c.date||'')||(a.at||'').localeCompare(c.at||''));
  const ids=[...new Set(L.flatMap(l=>l.photos||[]))];let P={};try{(await photoGetMany(ids)).forEach(r=>{P[r.id]=r})}catch(e){}
  const pn={};let k=0;L.forEach(l=>(l.photos||[]).forEach(id=>{if(!pn[id])pn[id]=++k}));
  const title=isN?`${o.no} · ${supName(o.supplierId)||''}`:`${defLabel(o)} · ${supName(o.supplierId)||''}`;
  const unsaved=tl.own.filter(x=>x._new||x._dirty).length;
  const html=reportFrame(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>실행기록_${esc(isN?o.no:o.date)}</title><style>
  body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:11px;color:#111;margin:24px}h1{font-size:17px;margin:6px 0 2px}.s{color:#555}
  table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef1f5;white-space:nowrap}
  tr.au td{color:#555;background:#fafafa}tr.vd td{color:#888;text-decoration:line-through}tr.vd td.nt{text-decoration:none}.pre{white-space:pre-wrap}
  .ph{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}.ph div{border:1px solid #ccc;padding:4px;break-inside:avoid}.ph img{width:100%;max-height:220px;object-fit:contain}
  h3{font-size:13px;margin:16px 0 4px}</style></head><body>${logoHead()}
  <h1>조사 · 진행 실행 기록</h1><div class="s">${esc(title)} · 출력 ${loc(now())} · 출력자 ${esc(db.settings.owners[0]||'')}${unsaved?` · <b>저장 전 기록 ${unsaved}건 제외</b>`:''}</div>
  <table><tr><th>실행일</th><th>구분</th><th>상대방 · 방법</th><th>실행 내용</th><th>결과 · 합의</th><th>증빙</th><th>작성</th><th>비고</th></tr>
  ${L.map(l=>`<tr class="${l.auto?'au':''} ${l.void?'vd':''}"><td>${esc(l.date)}</td><td>${esc(l.auto?'시스템':l.kind)}${l.src&&!l.auto?'<br>'+esc(l.src):''}</td><td>${esc([l.party,l.method].filter(Boolean).join(' · '))}</td>
    <td class="pre">${esc(l.text)}</td><td class="pre">${esc(l.result||'')}</td><td>${(l.photos||[]).map(id=>'#'+pn[id]).join(' ')}</td>
    <td>${l.auto?'자동':`${esc(l.by||'')}<br>${esc(loc(l.at||''))}`}</td>
    <td class="nt">${[lgLate(l)?'사후 기록':'',(l.hist||[]).length?`수정 ${l.hist.length}회`:'',l.void?`취소 (${esc(l.void.reason)})`:''].filter(Boolean).join('<br>')}</td></tr>`).join('')}</table>
  ${L.some(l=>(l.hist||[]).length)?`<h3>수정 이력 (원문)</h3><table><tr><th>기록</th><th>수정 시각 · 수정자</th><th>사유</th><th>수정 전 내용</th></tr>${L.filter(l=>(l.hist||[]).length).flatMap(l=>l.hist.map(h=>`<tr><td>${esc(l.date)} ${esc(l.kind)}</td><td>${esc(loc(h.at))} ${esc(h.by||'')}</td><td>${esc(h.reason||'')}</td><td class="pre">${esc(h.date)} · ${esc(h.kind)}${h.party?' · '+esc(h.party):''}\n${esc(h.text)}${h.result?'\n결과: '+esc(h.result):''}</td></tr>`)).join('')}</table>`:''}
  ${ids.length?`<h3>증빙 자료</h3><div class="ph">${ids.map(id=>P[id]?`<div><img src="${P[id].data}"><br><b>#${pn[id]}</b> ${esc(P[id].caption||P[id].name||'')}</div>`:'').join('')}</div>`:''}
  <p class="s" style="margin-top:12px">‘작성’은 기록을 입력한 시각이며 실행일과 2일 이상 차이 나면 ‘사후 기록’으로 표시됩니다. 수정된 기록은 원문과 사유가 위 이력에 남고, 취소된 기록은 지우지 않고 취소선으로 표시합니다.</p>
  </body></html>`);
  reportShow(w,html,`실행기록_${isN?o.no:o.date}.html`);
}
function openLog(id){
  const d=db.defects.find(x=>x.id===id);if(!d)return;const n=ncrOfDefect(d),v=sevOf(d);
  openModal(`불량 진행 — ${defLabel(d)} (${supName(d.supplierId)||'-'})`,`<div class="psum">
    <div><span class="muted">현상</span> ${nl(d.desc||'-')}</div><div><span class="muted">임시조치</span> ${nl(d.containment||'-')}</div>
    <div class="row" style="gap:6px;margin-top:4px">${sevBadge(d)} <span class="bg mut">${esc(d.type||'')} ${num(d.qty).toLocaleString()}개</span> <span class="bg mut">처리 ${esc(d.disposition||'-')}</span> <span class="bg mut">귀책 ${esc(d.resp||'-')}</span> ${stageBadges(d).replace('<br>',' ')}
      ${n?`<a class="bg inf" style="cursor:pointer" onclick="gotoNcr('${n.id}')">${esc(n.no)} · ${ncrStatus(n)}</a>`:`<span class="bg mut">NCR 없음 (${v.resp})</span>`} ${costTotal(d)?`<span class="bg mut">비용 ${won(costTotal(d))}원</span>`:''}${claimStatus(d)?` <span class="bg ${CLAIM_CLS[claimStatus(d)]}">구상 ${claimStatus(d)}</span>`:''}</div></div>
    ${routeHTML(d)}
    <div class="sec">조사 · 진행 기록 <span class="muted" style="font-weight:normal;font-size:12px">— 실제로 한 일과 결과만 남기는 증빙용 기록 · NCR·대책서·구상 진행(자동)이 함께 표시</span></div><div id="logBox"></div>`,
    [{label:'A3 보고서',fn:()=>a3Report('defect',id)},{label:'불량 정보 수정',fn:async()=>{if(mfDirty&&!await askConfirm({title:'기록을 저장하지 않고 이동할까요?',ok:'이동',danger:false}))return;closeModal(true);editDefect(id)}},{label:'닫기',fn:closeModal},{label:'저장',cls:'p',fn:()=>{const r=tlCommit();d.logs=r.logs;touch(d);save();closeModal(true);render();toast('진행 기록 저장')}}]);
  tlInit('defect',d);setTimeout(()=>$('#lgText')?.focus(),0);
}
async function gotoProgress(id){if(mfDirty&&!await askConfirm({title:'수정 중인 불량 정보를 저장하지 않고 이동할까요?',msg:'먼저 저장하려면 취소 후 저장을 누르세요.',ok:'이동',danger:false}))return;closeModal(true);openLog(id)}
async function gotoNcr(nid){if(mfDirty&&!await askConfirm({title:'기록을 저장하지 않고 이동할까요?',ok:'이동',danger:false}))return;closeModal(true);editNcr(nid)}
/* ---- 비용 · 구상 패널 ---- */
let curCosts=[],curClaim={},costCtx=null,curBase={};
function costInit(d,inForm){curCosts=JSON.parse(JSON.stringify(d.costs||[]));curClaim=JSON.parse(JSON.stringify(d.claim||{}));curBase=JSON.parse(JSON.stringify(d.costBase||{}));costCtx=inForm?null:d;renderCostBox()}
// 불량 발생수량 · 단가 (입력 안 했으면 불량 수량 · 부품 단가)
function baseQty(){return curBase.qty!==undefined&&curBase.qty!==''?num(curBase.qty):num(cv('qty'))}
function basePrice(){if(curBase.price!==undefined&&curBase.price!=='')return num(curBase.price);const pt=partByNo(String(cv('partNo')||'').trim());return pt?partKRW(pt):0}
function baseOut(){const o={};['qty','price'].forEach(k=>{if(curBase[k]!==undefined&&curBase[k]!=='')o[k]=num(curBase[k])});return Object.keys(o).length?o:undefined}
function setBase(k,v){curBase[k]=v;mfDirty=true;const e=$('#cbAmt');if(e)e.textContent=won(baseQty()*basePrice())}
function rowCalc(i,el){const c=curCosts[i],q=num(c.qty),pr=num(c.price);if(q>0&&pr>0){const amt=Math.round(q*pr),auto=`${q.toLocaleString()}개 × ${won(pr)}원`;c.amt=amt;if(!(c.basis||'').trim()||c._autoB){c.basis=auto;c._autoB=true}const tr=el.closest('tr');tr.querySelector('[data-c=amt]').value=amt;tr.querySelector('[data-c=basis]').value=c.basis;costTot()}}
function addBaseCost(){const q=baseQty(),pr=basePrice();if(!q){toast('불량 발생수량을 입력하세요');$('#cbQty').focus();return}if(!pr){toast('단가를 입력하세요');$('#cbPrice').focus();return}
  addCost({cat:$('#cbCat').value,qty:q,price:pr,amt:Math.round(q*pr),basis:`${q.toLocaleString()}개 × ${won(pr)}원`,_autoB:true})}
function cv(k){const f=$('#mf');if(!costCtx&&f&&f[k])return f[k].value;return costCtx?costCtx[k]:''}
function costOut(){return curCosts.filter(c=>num(c.amt)>0||(c.basis||'').trim()).map(c=>{const o={...c,amt:num(c.amt)};delete o._autoB;['qty','price'].forEach(k=>{if(o[k]===''||o[k]==null)delete o[k];else o[k]=num(o[k])});return o})}
function claimOut(){const c=curClaim||{};const has=['reqDate','reqAmt','agreeAmt','agreeDate','recvDate','recvAmt','memo','disputeReason','waiveReason'].some(k=>String(c[k]||'').trim())||c.dispute||c.waive;if(!has)return undefined;
  const o={...c};['reqAmt','agreeAmt','recvAmt'].forEach(k=>o[k]=o[k]===''||o[k]==null?'':num(o[k]));return o}
function renderCostBox(){
  const b=$('#costBox');if(!b)return;const S=db.settings;
  const disp=cv('disposition'),qty=num(cv('qty')),part=partByNo(String(cv('partNo')||'').trim()),resp=cv('resp');
  const f0=$('#mf'),shr=resp==='공동'?Math.max(0,Math.min(100,num(!costCtx&&f0&&f0.inv_share?f0.inv_share.value:costCtx?costCtx.inv?.share:(db.defects.find(x=>x.id===curSev._id)||{}).inv?.share))):100;
  const rows=curCosts.map((c,i)=>`<tr>
    <td><input type="date" value="${esc(c.date)}" onchange="curCosts[${i}].date=this.value;mfDirty=true" style="width:140px"></td>
    <td><select onchange="curCosts[${i}].cat=this.value;mfDirty=true">${opts(COST_CATS,c.cat)}</select></td>
    <td><input type="number" min="0" value="${esc(c.qty??'')}" placeholder="-" style="width:72px;text-align:right" oninput="curCosts[${i}].qty=this.value;mfDirty=true;rowCalc(${i},this)"></td>
    <td><input type="number" min="0" step="any" value="${esc(c.price??'')}" placeholder="-" style="width:90px;text-align:right" oninput="curCosts[${i}].price=this.value;mfDirty=true;rowCalc(${i},this)"></td>
    <td><input type="number" min="0" data-c="amt" value="${esc(c.amt)}" style="width:110px;text-align:right" oninput="curCosts[${i}].amt=this.value;mfDirty=true;costTot()"></td>
    <td><input value="${esc(c.basis)}" data-c="basis" placeholder="예: 3h × 2명 × 30,000원" style="width:100%;min-width:150px" oninput="curCosts[${i}].basis=this.value;curCosts[${i}]._autoB=false;mfDirty=true"></td>
    <td><input value="${esc(c.memo)}" placeholder="메모·증빙" style="width:100%;min-width:100px" oninput="curCosts[${i}].memo=this.value;mfDirty=true"></td>
    <td><button type="button" class="b s d" onclick="delCost(${i})">✕</button></td></tr>`).join('');
  const c=curClaim||{};
  const bq=baseQty(),bp=basePrice(),ptp=part?partKRW(part):0,ptCur=curOf(part);
  const defCat=disp==='재작업'?'재작업':disp==='선별'||disp==='선별 후 사용'?'선별':String(cv('source')||'').includes('고객')?'고객클레임':'폐기';
  b.innerHTML=`<div class="cbase" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg2,rgba(0,0,0,.02));margin:4px 0 10px">
    <b style="font-size:13px">불량 발생수량</b><input id="cbQty" type="number" min="0" value="${esc(curBase.qty??(qty||''))}" placeholder="수량" style="width:90px;text-align:right" oninput="setBase('qty',this.value)"><span class="muted">개 ×</span>
    <b style="font-size:13px">단가</b><input id="cbPrice" type="number" min="0" step="any" value="${esc(curBase.price??(ptp||''))}" placeholder="원" style="width:110px;text-align:right" oninput="setBase('price',this.value)"><span class="muted">원 =</span>
    <b id="cbAmt">${won(bq*bp)}</b><span class="muted">원</span>
    <span style="flex:1"></span>
    <select id="cbCat" style="width:auto">${opts(COST_CATS,defCat)}</select><button type="button" class="b s p" onclick="addBaseCost()">비용 내역에 추가</button>
    <div class="muted" style="flex-basis:100%;font-size:11.5px">${ptp?(ptCur==='KRW'?`부품 마스터 단가 ${won(ptp)}원`:`부품 마스터 단가 ${fmtPrice(part)} × ${fxRate(ptCur).toLocaleString('ko-KR')}원 = ${won(ptp)}원`):part&&part.price&&ptCur!=='KRW'?`부품 단가 ${fmtPrice(part)} — ${ptCur} 환율이 설정에 없어 원화로 바꾸지 못했습니다`:'부품 마스터에 단가가 없습니다 — 직접 입력하세요'} · 불량 수량 ${qty?qty.toLocaleString()+'개':'미입력'} 기준 기본값이며, 바꾸면 이 불량에 따로 저장됩니다.</div>
  </div>
  <div style="font-size:12px;color:var(--sub);margin:4px 0">비용 내역 — 발생할 때마다 한 줄씩 추가합니다. COPQ는 <b>비용 발생일</b>이 속한 달로 집계됩니다.</div>
  <table class="ct"><thead><tr><th>비용 발생일</th><th>항목</th><th class="n">수량</th><th class="n">단가(원)</th><th class="n">금액(원)</th><th>산출 근거</th><th>메모</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="8" class="muted" style="text-align:center;padding:10px">아직 입력된 비용이 없습니다.</td></tr>'}</tbody>
  <tfoot><tr><td colspan="4" style="text-align:right"><b>합계</b></td><td class="n"><b id="costTot">${won(curCosts.reduce((a,x)=>a+num(x.amt),0))}</b></td><td colspan="3"></td></tr></tfoot></table>
  <div class="row" style="margin-top:8px;gap:6px">
    <button type="button" class="b s" onclick="addCost({})">+ 비용 추가</button>
    <span class="muted" style="font-size:12px;margin-left:8px">인건비 계산</span>
    <input id="lbH" type="number" step="0.5" min="0" placeholder="시간" style="width:70px"><span class="muted">h ×</span><input id="lbN" type="number" min="1" value="1" style="width:56px"><span class="muted">명 × ${won(S.laborRate)}원</span>
    <button type="button" class="b s" onclick="addLabor()">${disp==='재작업'?'재작업비':'선별비'}로 추가</button>
  </div>
  <div class="sec" style="margin-top:14px">협력사 구상 (회수) <span id="clmSt">${claimBadge()}</span><span class="muted" style="font-weight:normal;font-size:12px">${resp==='협력사'?'':resp==='공동'?`공동 귀책 — 협력사 부담 ${shr}% 만큼 청구`:resp==='미정'?'귀책 미정 — 판정 후 청구합니다 (비용은 지금부터 쌓아 두세요)':'귀책이 협력사일 때 청구합니다'}</span></div>
  <div class="fg">
    <label>청구일<input type="date" value="${esc(c.reqDate)}" onchange="setClaim('reqDate',this.value)"></label>
    <label>청구액 (원) <a class="lk" style="font-size:11px" onclick="setClaim('reqAmt',Math.round(curCosts.reduce((a,x)=>a+num(x.amt),0)*${shr}/100));renderCostBox()">${shr<100?`비용 합계 × ${shr}% 넣기`:'비용 합계 넣기'}</a>${bq&&bp?` · <a class="lk" style="font-size:11px" onclick="setClaim('reqAmt',Math.round(baseQty()*basePrice()*${shr}/100));renderCostBox()">수량×단가${shr<100?` × ${shr}%`:''} 넣기</a>`:''}<input type="number" min="0" value="${esc(c.reqAmt)}" oninput="setClaim('reqAmt',this.value)"></label>
    <label>합의액 (원)<input type="number" min="0" value="${esc(c.agreeAmt)}" oninput="setClaim('agreeAmt',this.value)"></label>
    <label>합의일<input type="date" value="${esc(c.agreeDate)}" onchange="setClaim('agreeDate',this.value)"></label>
    <label>회수일<input type="date" value="${esc(c.recvDate)}" onchange="setClaim('recvDate',this.value)"></label>
    <label>회수액 (원)<input type="number" min="0" value="${esc(c.recvAmt)}" oninput="setClaim('recvAmt',this.value)"></label>
    <label>회수 방법<select onchange="setClaim('method',this.value)">${opts(['입금','상계','대체품','기타'],c.method,true)}</select></label>
    <label>메모<input value="${esc(c.memo)}" placeholder="공문 번호 등" oninput="setClaim('memo',this.value)"></label>
    <label class="row" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" ${c.dispute?'checked':''} onchange="setClaim('dispute',this.checked);renderCostBox()"> 협력사 이의 제기</label>
    ${c.dispute?`<label class="full">이의 사유<input value="${esc(c.disputeReason)}" oninput="setClaim('disputeReason',this.value)"></label>`:''}
    <label class="row" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" ${c.waive?'checked':''} onchange="setClaim('waive',this.checked);renderCostBox()"> 청구 포기 (당사 부담)</label>
    ${c.waive?`<label class="full">포기 사유<input value="${esc(c.waiveReason)}" oninput="setClaim('waiveReason',this.value)"></label>`:''}
  </div>`;
}
function claimBadge(){const st=claimStatus({claim:claimOut()}),o=outstanding({claim:claimOut()});return st?`<span class="bg ${CLAIM_CLS[st]}">${st}</span>${o?` <span class="bg bad">미회수 ${won(o)}원</span>`:''}`:'<span class="bg mut">미청구</span>'}
function setClaim(k,v){curClaim=curClaim||{};curClaim[k]=v;mfDirty=true;const e=$('#clmSt');if(e)e.innerHTML=claimBadge()}
function costTot(){const e=$('#costTot');if(e)e.textContent=won(curCosts.reduce((a,x)=>a+num(x.amt),0))}
function addCost(o){if(o.basis&&curCosts.some(c=>c.cat===o.cat&&c.basis===o.basis)){toast('같은 내용의 비용이 이미 있습니다');return}curCosts.push({id:uid(),date:today(),cat:'기타',amt:'',basis:'',memo:'',...o});mfDirty=true;renderCostBox()}
function addLabor(){const h=num($('#lbH').value),n=num($('#lbN').value)||1,r=num(db.settings.laborRate);if(!h){toast('작업시간을 입력하세요');$('#lbH').focus();return}
  addCost({cat:cv('disposition')==='재작업'?'재작업':'선별',amt:Math.round(h*n*r),basis:`${h}h × ${n}명 × ${won(r)}원`})}
async function delCost(i){const c=curCosts[i];if(num(c.amt)&&!await askConfirm({title:'비용 줄을 삭제할까요?',items:[`${esc(c.date)} · ${esc(c.cat)} · ${won(c.amt)}원`],note:'저장해야 반영됩니다.'}))return;curCosts.splice(i,1);mfDirty=true;renderCostBox()}
function openCost(id){
  const d=db.defects.find(x=>x.id===id);if(!d)return;
  openModal(`비용 · 구상 — ${defLabel(d)} (${supName(d.supplierId)||'-'})`,`<div class="help">${esc(d.type)} ${num(d.qty)}개 · 처리 ${esc(d.disposition||'-')} · 귀책 ${esc(d.resp||'-')}</div><div id="costBox"></div>`,
    [{label:'취소',fn:closeModal},{label:'저장',cls:'p',fn:()=>{d.costs=costOut();{const cb=baseOut();if(cb)d.costBase=cb;else delete d.costBase}if(d.costs.length)d.noCost=false;const cl=claimOut();if(cl)d.claim=cl;else delete d.claim;touch(d);save();closeModal(true);render();toast(`비용 ${won(costTotal(d))}원 저장`)}}]);
  costInit(d,false);
}
function sevDraft(){
  const f=$('#mf');const o={id:curSev._id,date:f.date.value,source:f.source.value,partNo:f.partNo.value.trim(),supplierId:f.supplierId.value,type:f.type.value,qty:f.qty.value,inspQty:f.inspQty.value};
  const sv={special:!!curSev.special,override:curSev.override||'',reason:curSev.reason||''};
  if(curSev._touched.impact)sv.impact=curSev.impact;if(curSev._touched.scope)sv.scope=curSev.scope;
  o.sev=sv;return o;
}
function setSevF(k,v){curSev[k]=v;curSev._touched[k]=true;mfDirty=true;renderSev()}
function renderSev(){
  const b=$('#sevBox');if(!b)return;setTimeout(icaSync,0);
  const d=sevDraft(),v=sevOf(d),S=db.settings;
  const rb=$('#routeBox');if(rb&&curSev._id){const o=db.defects.find(x=>x.id===curSev._id);if(o)rb.innerHTML=routeHTML({...o,...d,resp:$('#mf').resp.value,id:o.id,ncrId:o.ncrId,caseId:o.caseId})}
  const lv=(k,cur,auto)=>`<div class="row" style="gap:4px">${SEV_F[k][1].map((l,i)=>auto?`<span class="bg ${cur===i+1?'inf':'mut'}" style="${cur===i+1?'font-weight:bold':'opacity:.55'}">${i+1} ${l}</span>`:`<button type="button" class="b s ${cur===i+1?'p':''}" onclick="setSevF('${k}',${i+1})">${i+1} ${l}</button>`).join('')}</div>`;
  const note={impact:curSev._touched.impact?'직접 선택':`유형 ‘${esc(d.type)}’ 기본값`,stage:`발생처 ‘${esc(d.source)}’ 기준 (자동)`,scope:curSev._touched.scope?'직접 선택':'수량·비율 기준 자동',repeat:`동일 협력사·유형 ${S.repeatWindow}일 내 ${v.rp.n}회${v.rp.re?' · 대책 종결 후 재발':''} (자동)`};
  b.innerHTML=`<table class="ct"><tbody>${['impact','stage','scope','repeat'].map(k=>`<tr><td style="width:84px"><b>${SEV_F[k][0]}</b></td><td>${lv(k,v.f[k],k==='stage'||k==='repeat')}</td><td class="muted" style="font-size:11.5px">${note[k]}</td><td class="n" style="width:40px"><b>${v.f[k]}</b></td></tr>`).join('')}
    <tr><td><b>특별특성</b></td><td colspan="2"><label class="row" style="gap:6px;font-size:12.5px"><input type="checkbox" ${curSev.special?'checked':''} onchange="curSev.special=this.checked;mfDirty=true;renderSev()"> CC/SC(특별특성) 항목의 불량 — 점수와 관계없이 A</label></td><td></td></tr></tbody>
    <tfoot><tr><td colspan="4" style="background:#f7f8fa;padding:8px">
      <div class="row" style="gap:10px"><span>합계 <b style="font-size:16px">${v.score}</b>점</span>
      <span>자동 판정 <span class="bg ${SEV_CLS[v.auto]}" style="font-size:13px;padding:2px 10px">${v.auto}</span>${v.forced.length?` <span class="muted" style="font-size:12px">강제 A: ${esc(v.forced.join(', '))}</span>`:` <span class="muted" style="font-size:12px">(A ≥ ${S.sevA} · B ≥ ${S.sevB} · C 그 미만)</span>`}</span>
      <span style="flex:1"></span>
      <label class="fgl" style="flex-direction:row;align-items:center;gap:4px">수동 조정<select onchange="curSev.override=this.value;mfDirty=true;renderSev()"><option value="">자동 판정 사용</option>${['A','B','C'].map(g=>`<option ${curSev.override===g?'selected':''}>${g}</option>`).join('')}</select></label>
      ${curSev.override?`<input value="${esc(curSev.reason)}" placeholder="조정 사유 (필수)" style="width:220px;${curSev.reason?'':'border-color:#e7a29a'}" oninput="curSev.reason=this.value;mfDirty=true">`:''}</div>
      <div style="margin-top:6px">최종 등급 <span class="bg ${SEV_CLS[v.grade]}" style="font-size:14px;padding:3px 14px">${v.grade}</span> → 대응 수준 <b>${v.resp}</b>${v.grade==='C'?' <span class="muted" style="font-size:12px">(NCR 발행 시 회신 불요 통보)</span>':''}</div>
    </td></tr></tfoot></table>`;
  const ss=$('#sevSum');if(ss)ss.innerHTML=`<span class="bg ${SEV_CLS[v.grade]}" style="font-size:12px">${v.grade} · ${v.score}점</span> <span style="font-weight:normal;font-size:12px;color:var(--ink)">→ ${v.resp}${v.overridden?' (수동 조정)':''}</span>`;
}
// 발견 품목(완성품) 품번 → 품명 · 차종 자동 입력 (차종은 비어 있을 때만)
function onFgNo(v){v=String(v||'').trim();const f=$('#mf');if(!f||!f.fgName)return;const p=partByNo(v),br=bomIx().byFg.get(v)||[],bf=bomIx().byFg.has(v)?bomFg(v):null;
  if(p||bf){f.fgName.value=bf?.name||p?.name||'';const bm=bf?.model,m=bm||p?.model;if(f.model&&m&&(bm||!f.model.value.trim()))f.model.value=m;mfDirty=true}
  bomDefect()}
function srcLayout(){
  const f=$('#mf');if(!f||!f.source||!$('#grpFg'))return;
  const inc=/수입/.test(f.source.value),hasFg=!!(f.fgNo.value.trim()||f.fgName.value.trim()),set=(id,t)=>{const e=document.getElementById(id);if(e){e.textContent=t;e.title=t}};
  $('#grpFg').style.display=inc&&!hasFg?'none':'';
  set('grpPartH',inc?'입고 부품 (불량 부품)':'원인 · 의심 부품');
  $('#grpPartS').textContent=inc?'수입검사 — 검사한 부품이 곧 불량 부품입니다':'확인 전이면 의심 부품을 넣거나 비워 두면 ‘조사 중’';
  set('lbPn',inc?'품번':'원인·의심 품번');set('lbPm',inc?'품명':'원인·의심 품명');
  set('lbDv',inc?'입고(납품)일자':'원인 부품 납품일자');set('lbQty',inc?'불량수량':'불량수량 (원인 부품 기준)');lbInsp();
  f.partNo.placeholder=inc?'번호·품명·협력사로 검색':'번호·품명·협력사로 검색 (모르면 비움 → 조사 중)';
}
// 불량률 · PPM의 모수: 원인 부품의 입고(로트) 수량 — 입고 건을 연결했거나 수입검사면 ‘입고수량’, 아니면 생산 · 투입수량도 허용
function lbInsp(){const f=$('#mf'),e=$('#lbInsp');if(!f||!e)return;const inc=f.source&&/수입/.test(f.source.value),t=inc||curRcvId?'입고수량 (로트)':'입고(로트) · 생산수량';e.textContent=t;e.title='불량률 · PPM 계산의 모수 — 불량이 나온 원인 부품의 입고(로트) 수량. 입고 건을 연결하면 자동으로 채워집니다'}
function onPartNo(v){
  const p=partByNo(v.trim());
  if(p){const f=$('#mf'),fgM=f.fgNo&&bomIx().byFg.has(f.fgNo.value.trim())&&bomFg(f.fgNo.value.trim()).model;f.partName.value=p.name||'';if(p.model&&!fgM)f.model.value=p.model;if(p.supplierId)f.supplierId.value=p.supplierId}  // 완성품의 BOM 차종이 있으면 그것을 유지
  bomDefect();rcvHint();
}
function quickSup(){
  const n=prompt('추가할 협력사명');if(!n||!n.trim())return;
  let s=db.suppliers.find(x=>x.name===n.trim());
  if(!s){s=touch({id:uid(),code:'',name:n.trim(),items:'',contact:'',phone:'',email:'',note:'',contacts:[],contactLog:[]});db.suppliers.push(s);save()}
  const sel=$('#mf').supplierId;sel.innerHTML=supOpts(s.id);sel.value=s.id;
}
const NUMF=['qty','inspQty','fgQty'];
function gather(){const o={};new FormData($('#mf')).forEach((v,k)=>o[k]=typeof v==='string'?v.trim():v);return o}
let savingDefect=false;
async function saveDefect(id){
  if(savingDefect)return null;
  const o=gather();
  if(!o.date){toast('발생일을 입력하세요');return null}
  NUMF.forEach(k=>o[k]=o[k]===''||o[k]==null?'':num(o[k]));
  {const inForm=!!$('#mf').inv_verdict,exInv=id?(db.defects.find(x=>x.id===id)||{}).inv:null;
   const iv=!inForm&&exInv?JSON.parse(JSON.stringify(exInv)):{},c={std:{}};
    Object.keys(o).forEach(k=>{if(k.startsWith('inv_')){iv[k.slice(4)]=o[k];delete o[k]}else if(k.startsWith('ica_std_')){c.std[k.slice(8)]=true;delete o[k]}else if(k.startsWith('ica_')){c[k.slice(4)]=o[k];delete o[k]}});
    iv.costNotice=!!iv.costNotice;if(iv.share!==''&&iv.share!=null)iv.share=Math.max(0,Math.min(100,num(iv.share)));
    if(iv.verdict){if(inForm)o.resp=VERDICT_RESP[iv.verdict]||o.resp;if(!iv.verdictDate)iv.verdictDate=today()}else iv.verdictDate='';
    if(inForm&&iv.verdict==='협력사'&&!o.partNo)toast('협력사 귀책으로 판정했지만 원인 품번이 비어 있습니다');
    const hasInv=['farReq','farDue','farRecv','farResult','rca','verdict','sample','basis','share'].some(k=>iv[k]!==''&&iv[k]!=null)||iv.costNotice;
    if(hasInv||o.resp==='미정')o.inv=iv;else o.inv=undefined;
    if(o.resp==='공동'&&!hasInv)o.inv=iv;
    if(!$('#mf').ica_level){
      const ex=id?(db.defects.find(x=>x.id===id)||{}).ica:null;
      if(ex)o.ica=ex;
      else if(o.resp==='사내'){const lv=icaLevelAuto({...(id?db.defects.find(x=>x.id===id):{}),...o});o.ica=lv!==ICA_NONE?{std:{},due:addDays(iv.verdictDate||o.date,typeDays(lv==='8D'?'8D 보고서':'간이 대책서'))}:undefined}
      else o.ica=undefined;
    }else{
    const hasIca=ICA_KEYS.some(k=>(c[k]||'').trim())||c.doneDate||c.due||Object.keys(c.std).length;
    if(o.resp==='사내'||hasIca){
      const lvEff=($('#mf').ica_level||{}).value||ICA_NONE;
      if(c.doneDate&&lvEff==='8D'){const miss=['d4','d5','d6','d7'].filter(k=>!String(c[k]||'').trim());if(miss.length){toast(`사내 8D 완료 전에 ${miss.map(k=>k.toUpperCase()).join(' · ')}을(를) 작성하세요 (원인 · 대책 · 효과 · 재발방지)`);return null}}
      if(c.doneDate&&!c.verifyDue)c.verifyDue=addDays(c.doneDate,num(db.settings.verifyDays)||21);
      if(!c.due&&o.resp==='사내'&&lvEff!==ICA_NONE)c.due=addDays(iv.verdictDate||o.date,typeDays(lvEff==='8D'?'8D 보고서':'간이 대책서'));
      const sel=$('#mf').ica_level;if(!(sel&&sel.dataset.touched))delete c.level;
      o.ica=c}else o.ica=undefined;
    }
    if(id&&defCase(db.defects.find(x=>x.id===id)))delete o.ica;
  }
  if(curSev.override&&!(curSev.reason||'').trim()){toast('심각도를 수동 조정한 사유를 입력하세요');return null}
  {const sv={special:!!curSev.special};if(curSev._touched.impact)sv.impact=curSev.impact;if(curSev._touched.scope)sv.scope=curSev.scope;if(curSev.override){sv.override=curSev.override;sv.reason=curSev.reason.trim()}o.sev=sv}
  savingDefect=true;
  if(o.closedChk){if(!(o.closedReason||'').trim()){toast('수동 종결 사유를 입력하세요');savingDefect=false;return null}}
  o.closed=o.closedChk?{date:(id&&db.defects.find(x=>x.id===id)?.closed?.date)||today(),reason:o.closedReason.trim()}:undefined;delete o.closedChk;delete o.closedReason;
  if(o.status===undefined&&id){const ex=db.defects.find(x=>x.id===id);if(ex&&ex.status==='완료'&&!o.closed&&!o.doneDate)o.doneDate=ex.doneDate||ex.date}
  o.costs=costOut();o.claim=claimOut();o.costBase=baseOut();if(o.costs.length)o.noCost=false;
  let d;
  if(id){d=db.defects.find(x=>x.id===id);if(!d){savingDefect=false;toast('이 불량 기록을 찾을 수 없습니다 (다른 창에서 삭제됨)');return null}Object.assign(d,o);delete d.sevLock}else{d={id:uid(),...o,ncrId:'',photos:[]};db.defects.push(d)}
  try{
    const put=curPhotos.filter(p=>p.isNew||p.dirty).map(p=>({id:p.id,defectId:d.id,name:p.name,caption:p.caption||'',data:p.data,thumb:p.thumb,createdAt:p.createdAt,updatedAt:now()}));
    if(put.length)await photoPut(put);
    if(curRemoved.length){await photoDel(curRemoved);curRemoved.forEach(i=>db.deleted.push({id:i,at:now()}))}
    d.photos=curPhotos.map(p=>p.id);
    if(put.length||curRemoved.length)photoStr=null;
  }catch(e){toast('사진 저장 실패: '+e.message);d.photos=curPhotos.filter(p=>!p.isNew).map(p=>p.id)}
  savingDefect=false;
  touch(d);
  if(o.owner&&!db.settings.owners.includes(o.owner))db.settings.owners.push(o.owner);
  save();closeModal(true);render();
  if(!d.ncrId){const v=sevOf(d),st=defStage(d);toast(`심각도 ${v.grade} (${v.score}점) → ${st.label}`);
    const rs=ncrReasons(d);if(rs.length&&['협력사','공동'].includes(d.resp||'협력사')&&!invOpen(d))offerAction(`${rs[0]} — NCR 발행 권고`,'NCR 발행',()=>ncrFromDefect(d.id))}
  if(!id)issAfterDefect(d);
  return d.id;
}
const logPhotoIds=logs=>(logs||[]).flatMap(l=>[...(l.photos||[]),...(l.hist||[]).flatMap(h=>h.photos||[])]);
// 불량에 연결된 문서 · 함께 지워지는 기록 정리
function defLinks(d){
  const n=d.ncrId?db.ncrs.find(x=>x.id===d.ncrId):db.ncrs.find(x=>(x.defectIds||[]).includes(d.id));
  const cs=db.cases.filter(c=>c.id===d.caseId||(c.DefectIds||[]).includes(d.id));
  const others=(ids)=>(ids||[]).filter(x=>x!==d.id&&db.defects.some(y=>y.id===x)).length;
  return{
    ncr:n?{n,others:others(n.defectIds),photos:logPhotoIds(n.logs).length,logs:(n.logs||[]).length}:null,
    cases:cs.map(c=>({c,others:others(c.DefectIds)+(c.NcrId&&(!n||c.NcrId!==n.id)?1:0),acts:czActs(c).length})),
    photos:(d.photos||[]).length,logs:(d.logs||[]).length,logPh:logPhotoIds(d.logs).length,
    costs:(d.costs||[]).length,cost:costTotal(d),claim:!!d.claim,inv:!!d.inv,ica:!!d.ica};
}
function delDefectDialog(d,L){
  return new Promise(res=>{
    const c=$('#cfm'),prevFocus=document.activeElement;
    const own=[`불량 기록 — ${qi(d.date)} ${esc(d.source||'')} · ${qi(d.partNo||d.fgNo||'-')} ${esc(d.partName||d.fgName||'')} · ${esc(d.type||'')} ${num(d.qty).toLocaleString()}개`]
      .concat(L.photos?[`사진 ${qi(L.photos+'장')} (사진 파일 삭제)`]:[])
      .concat(L.logs?[`조사 · 진행 기록 ${qi(L.logs+'건')}${L.logPh?` · 첨부 사진 ${L.logPh}장`:''}`]:[])
      .concat(L.costs||L.claim?[`비용 ${L.costs}건${L.cost?` (${won(L.cost)}원)`:''}${L.claim?' · 구상(청구·회수) 기록':''}`]:[])
      .concat(L.inv?[`귀책 조사 기록 (FAR 요청·회신 · 판정)`]:[]).concat(L.ica?['사내 대책 기록']:[]);
    const opt=(key,label,delLabel,blocked,why)=>`<div class="dl-o"><div class="dl-h">${label}</div>
      <label><input type="radio" name="dl_${key}" value="keep" checked> 연결만 해제 <span class="muted">— 문서는 그대로 남깁니다</span></label>
      <label class="${blocked?'off':''}"><input type="radio" name="dl_${key}" value="del" ${blocked?'disabled':''}> ${delLabel}</label>
      ${blocked?`<div class="dl-why">${why}</div>`:''}</div>`;
    const docs=[];
    if(L.ncr){const n=L.ncr.n;docs.push(opt('ncr',`NCR ${qi(n.no)} · ${esc(ncrStatus(n))} · ${esc(n.reqType||'8D 보고서')}`,
      `NCR도 삭제 <span class="muted">— 통보·대책서·평가 기록${L.ncr.logs?` · 진행 기록 ${L.ncr.logs}건`:''}${L.ncr.photos?` · 사진 ${L.ncr.photos}장`:''}${(n.concDocs||[]).length?` · 특채 문서 ${n.concDocs.length}건`:''}</span>`,
      L.ncr.others>0,`다른 불량 ${L.ncr.others}건도 이 NCR에 연결되어 있어 삭제할 수 없습니다. 연결만 해제됩니다.`))}
    L.cases.forEach((x,k)=>docs.push(opt('case'+k,`RCA ${qi(x.c.CaseNo)} · ${esc(x.c.Stage||'')} · ${esc(x.c.Title||'')}`,
      `RCA도 삭제 <span class="muted">— 원인분석 워크시트${x.acts?` · 조치 ${x.acts}건`:''}</span>`,
      x.others>0,`다른 불량·NCR ${x.others}건도 이 RCA에 연결되어 있어 삭제할 수 없습니다. 연결만 해제됩니다.`)));
    c.innerHTML=`<div class="cbox wide" role="alertdialog" aria-modal="true"><div class="ch"><span class="ic dz">!</span>불량 기록을 삭제할까요?</div>
      <div class="cb"><div class="dl-s">이 불량과 함께 삭제되는 기록</div><ul>${own.map(t=>`<li>${t}</li>`).join('')}</ul>
      <div class="dl-s" style="margin-top:12px">연결된 문서 — 처리 방법을 고르세요</div>
      ${docs.length?docs.join(''):'<div class="muted" style="font-size:12.5px">연결된 NCR · RCA가 없습니다.</div>'}
      <label class="dl-ck"><input type="checkbox" id="dlChk"> 연결된 문서와 함께 삭제되는 내용을 확인했습니다</label>
      <div class="note">삭제 후 10초 안에 되돌릴 수 있습니다.</div></div>
      <div class="cf"><button type="button" class="b" id="cfmNo">취소</button><button type="button" class="b dz" id="cfmOk" disabled>삭제</button></div></div>`;
    c.classList.add('on');
    const done=v=>{c.classList.remove('on');c.innerHTML='';document.removeEventListener('keydown',kh,true);try{prevFocus&&prevFocus.focus&&prevFocus.focus()}catch(e){}res(v)};
    const kh=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();done(null)}};
    $('#dlChk').onchange=e=>{$('#cfmOk').disabled=!e.target.checked};
    $('#cfmNo').onclick=()=>done(null);
    $('#cfmOk').onclick=()=>{const v=k=>(c.querySelector(`input[name="dl_${k}"]:checked`)||{}).value==='del';done({ncr:!!L.ncr&&v('ncr'),cases:L.cases.map((x,k)=>v('case'+k))})};
    c.onmousedown=e=>{if(e.target===c)done(null)};
    document.addEventListener('keydown',kh,true);
    setTimeout(()=>$('#dlChk').focus(),0);
  });
}
async function delDefect(id){
  const d0=db.defects.find(x=>x.id===id);if(!d0)return;
  const L=defLinks(d0),ch=await delDefectDialog(d0,L);if(!ch)return;
  const delN=ch.ncr&&L.ncr&&L.ncr.others===0?L.ncr.n:null;
  const delC=L.cases.filter((x,k)=>ch.cases[k]&&x.others===0).map(x=>x.c);
  const ph=[...(d0.photos||[]),...logPhotoIds(d0.logs),...(delN?[...logPhotoIds(delN.logs),...ncrDocIds(delN)]:[])];
  const snap=await takeSnap(ph);
  // NCR: 삭제 또는 연결 해제
  if(delN){czUnlinkNcrAll(delN.id);db.defects.forEach(x=>{if(x.ncrId===delN.id&&x.id!==id){x.ncrId='';touch(x)}});removeRec('ncrs',delN.id)}
  db.ncrs.forEach(n=>{if((n.defectIds||[]).includes(id)){n.defectIds=n.defectIds.filter(x=>x!==id);touch(n)}});
  // RCA: 삭제 또는 연결 해제
  delC.forEach(c=>{db.defects.forEach(x=>{if(x.caseId===c.id){x.caseId='';touch(x)}});db.ncrs.forEach(n=>{if(n.caseId===c.id){n.caseId='';touch(n)}});czActs(c).forEach(a=>removeRec('actions',a.id));removeRec('cases',c.id)});
  czUnlinkDefectAll(id);
  // 사진 파일
  if(ph.length){photoDel(ph).catch(()=>{});ph.forEach(i=>db.deleted.push({id:i,at:now()}));photoStr=null}
  removeRec('defects',id);
  if($('#modal').classList.contains('on'))closeModal(true);
  save();render();
  const extra=[delN&&`${delN.no}`,...delC.map(c=>c.CaseNo)].filter(Boolean);
  offerUndo(snap,`불량 기록 1건을 삭제했습니다${extra.length?` (${extra.join(', ')} 포함)`:''}${ph.length?` · 사진 ${ph.length}장`:''}`);
}
function exportDefectsCSV(){
  const ds=filteredDefects();
  const head=['발생일','발생처','심각도','심각도점수','대응수준','완성품 품번','완성품명','완성품 수량','원인 품번','원인 품명','차종','협력사','불량유형','불량수량','입고(로트)수량','납품일자','도면 규격','실측','불량내용','임시조치','처리','귀책',...COST_CATS.map(c=>c+'비'),'비용합계','구상상태','청구액','회수액','미회수','NCR번호','담당자','진행단계','유효성검증','처리완료일','수동종결사유','FAR요청일','FAR회신기한','FAR회신일','FAR결과','사내RCA','귀책판정','판정일','협력사부담%','사내대책수준','사내대책완료일','표준화반영','진행기록'];
  downloadCSV(`불량목록_${today()}.csv`,[head,...ds.map(d=>{const v=sevOf(d);return [d.date,d.source,v.grade,v.score,v.resp,d.fgNo||'',d.fgName||'',d.fgQty??'',d.partNo,d.partName,d.model,supName(d.supplierId),d.type,d.qty,d.inspQty,d.delivDate||d.lot,d.spec||'',d.actual||'',d.desc,d.containment,d.disposition,d.resp,...COST_CATS.map(c=>(d.costs||[]).filter(x=>x.cat===c).reduce((a,x)=>a+num(x.amt),0)),costTotal(d),claimStatus(d),d.claim?.reqAmt??'',d.claim?.recvAmt??'',outstanding(d),db.ncrs.find(n=>n.id===d.ncrId)?.no||'',d.owner,defStage(d).label,(()=>{const n=d.ncrId&&db.ncrs.find(x=>x.id===d.ncrId);return n&&isDone(d)?verifyInfo(n).label:(icaVerify(d)?.label||'')})(),d.doneDate||'',d.closed?.reason||'',
      d.inv?.farReq||'',d.inv?.farDue||'',d.inv?.farRecv||'',d.inv?.farResult||'',d.inv?.rca||'',d.inv?.verdict||'',d.inv?.verdictDate||'',d.inv?.share??'',d.resp==='사내'?icaLevel(d):'',d.ica?.doneDate||'',ICA_STD.filter(([k])=>d.ica?.std?.[k]).map(x=>x[1]).join(', '),(d.logs||[]).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(l=>`[${l.date} ${l.kind}] ${l.text}`).join('\n')]})]);
}


