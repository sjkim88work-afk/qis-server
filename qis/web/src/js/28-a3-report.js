/* ================= A3 보고서 (경영진 보고용 한 장) =================
   불량 · NCR · RCA 중 어디서 열어도 연결된 기록을 모아 한 장으로 정리합니다.
   1 배경 · 2 현상 · 3 목표 · 4 원인 | 5 대책 · 6 효과 · 7 표준화·후속 · 비용 · 경과      */
function a3Ctx(kind,id){
  let ds=[],n=null,c=null;
  if(kind==='case'){c=czById('cases',id);ds=(c&&c.DefectIds||[]).map(i=>db.defects.find(d=>d.id===i)).filter(Boolean);n=c&&c.NcrId?db.ncrs.find(x=>x.id===c.NcrId):null}
  else if(kind==='ncr'){n=db.ncrs.find(x=>x.id===id);ds=(n&&n.defectIds||[]).map(i=>db.defects.find(d=>d.id===i)).filter(Boolean)}
  else{const d=db.defects.find(x=>x.id===id);if(d)ds=[d];n=d&&d.ncrId?db.ncrs.find(x=>x.id===d.ncrId):null}
  if(!c){const cid=(n&&n.caseId)||ds.map(d=>d.caseId).find(Boolean);c=cid&&typeof czById==='function'?czById('cases',cid):null}
  if(!n&&c&&c.NcrId)n=db.ncrs.find(x=>x.id===c.NcrId)||null;
  if(c){(c.DefectIds||[]).forEach(i=>{if(!ds.some(d=>d.id===i)){const d=db.defects.find(x=>x.id===i);if(d)ds.push(d)}})}
  ds.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  return {ds,n,c,d:ds[0]||null};
}
async function a3Report(kind,id){
  const w=reportWin(),X=a3Ctx(kind,id),{ds,n,c,d}=X,S=db.settings;
  if(!d&&!c){if(w)w.close();toast('보고서로 만들 불량 기록이 없습니다');return}
  const T=(...a)=>a.map(x=>String(x||'').trim()).filter(Boolean).join('\n');
  const qty=sum(ds,'qty'),fgq=ds.reduce((a,x)=>a+num(x.fgQty),0),cost=ds.reduce((a,x)=>a+costTotal(x),0),os=ds.reduce((a,x)=>a+outstanding(x),0);
  const recv=ds.reduce((a,x)=>a+num(x.claim&&x.claim.recvAmt),0),req=ds.reduce((a,x)=>a+num(x.claim&&x.claim.reqAmt),0);
  const sev=ds.map(sevOf).sort((a,b)=>'ABC'.indexOf(a.grade)-'ABC'.indexOf(b.grade)||b.score-a.score)[0];
  const sup=supName((d&&d.supplierId)||(n&&n.supplierId)||(c&&c.SupplierId))||'';
  const iv=(d&&d.inv)||{},ic=(d&&d.ica)||{},le=n?latestEval(n):null;
  const resp=d?(d.resp||'미정'):'';
  // 진행 상태 한 줄
  const st=c?`RCA ${c.CaseNo} · ${c.Stage} · ${c.Status}`:n?`${n.no} · ${ncrStatus(n)}`:d?defStage(d).label:'';
  const titleTxt=(c&&c.Title)||(n&&n.title)||(d?`${d.type||''} — ${d.fgName||d.partName||d.partNo||''}`:'');
  // 1 배경 (왜 문제인가)
  const bg=T(d&&`${d.date} ${d.source||''}에서 발견${d.fgNo||d.fgName?` — 완성품 ${[d.fgNo,d.fgName].filter(Boolean).join(' ')}${fgq?` ${fgq.toLocaleString()}대 영향`:''}`:''}`,
    c&&c.Customer?`고객사 ${c.Customer}${c.CustomerClaimNo?' · 클레임 '+c.CustomerClaimNo:''}`:'',
    sev?`심각도 ${sev.grade} (${sev.score}점${sev.forced&&sev.forced.length?' · '+sev.forced.join(', '):''})${c&&c.Tier?` · ${c.Tier}`:''}`:'',
    ds.length>1?`동일 문제 ${ds.length}건 (${ds[0].date} ~ ${ds[ds.length-1].date})`:'',
    cost?`실패비용 ${won(cost)}원${os?` · 구상 미회수 ${won(os)}원`:''}`:'');
  // 2 현상 (무엇이 · 어디서 · 얼마나)
  const cur=T(d&&`불량: ${d.type||''} ${qty.toLocaleString()}개${d.inspQty?` / 로트 ${num(d.inspQty).toLocaleString()}개 (${(qty/num(d.inspQty)*100).toFixed(2)}%)`:''}`,
    d&&`부품: ${d.partNo||'(조사 중)'} ${d.partName||''}${sup?' · '+sup:''}${lotOf(d)?' · LOT '+lotOf(d):''}`,
    ds.map(x=>x.desc).filter(Boolean).slice(0,2).join(' / ')||(c&&c.Description)||'',
    T(d&&d.containment&&`임시조치: ${d.containment}`,c&&(c.QtyStock||c.QtyCustomer)?`격리: 재고 ${c.QtyStock||0} · 재공 ${c.QtyWIP||0} · 이송 ${c.QtyTransit||0} · 고객처 ${c.QtyCustomer||0}`:'',d&&d.disposition?`처리: ${d.disposition}`:''));
  // 3 목표
  const vdue=(c&&c.VerifyEnd)||(n&&n.verifyDue)||(ic&&ic.verifyDue)||'';
  const goal=T(`동일 불량 재발 0건${vdue?` (검증 기한 ${vdue})`:''}`,c&&has(c.RateBefore)?`불량률 ${c.RateBefore} → ${has(c.RateAfter)?c.RateAfter:'목표 0'}`:'',`고객 유출 0건 · 재고 전량 선별 완료`);
  // 4 원인
  const occ=(c&&c.CauseOccur)||(n&&n.d4)||ic.d4||iv.rca||'',esc2=(c&&c.CauseEscape)||'',sys=(c&&c.CauseSystem)||'';
  const why=c&&(c.Analyses||[]).find(a=>a.tool==='5why');
  const whyTxt=why?['발생: '+why.occ.filter(has).join(' → '),why.esc.some(has)?'유출: '+why.esc.filter(has).join(' → '):''].filter(x=>x.length>4).join('\n'):'';
  const respTxt=T(`귀책: ${resp}${iv.verdict?` (판정 ${iv.verdictDate||''}${iv.basis?' — '+iv.basis:''})`:''}${resp==='공동'&&has(iv.share)?` · 협력사 ${iv.share}%`:''}`,
    iv.farReq?`FAR: 요청 ${iv.farReq}${iv.farRecv?` · 회신 ${iv.farRecv}`:' · 회신 대기'}${iv.farResult?' — '+iv.farResult:''}`:(n&&n.far&&n.far.reqDate?`FAR: 요청 ${n.far.reqDate}${n.far.replyDate?' · 회신 '+n.far.replyDate:''}${n.far.summary?' — '+n.far.summary:''}`:''),
    c&&(c.AnalysisTools||[]).length?`분석 도구: ${c.AnalysisTools.join(', ')}`:'');
  // 5 대책 (조치 표)
  let acts=c?czActs(c).filter(a=>a.ActionStatus!=='취소').map(a=>({t:a.Title,k:a.Category,o:a.Assignee||a.ExternalOwner,due:a.DueDate,done:a.DoneDate,st:a.ActionStatus})):[];
  if(n&&(n.d5||n.d6))acts.push({t:T(n.d5,n.d6).replace(/\n/g,' / '),k:'협력사 대책',o:sup,due:n.dueDate,done:n.approvedDate||'',st:n.validity==='적정'?'승인':ncrStatus(n)});
  if(!c&&(ic.d5||ic.d6))acts.push({t:T(ic.d5,ic.d6).replace(/\n/g,' / '),k:`사내 대책 (${icaLevel(d)})`,o:d.owner,due:ic.due,done:ic.doneDate,st:ic.doneDate?'완료':'진행'});
  if(c&&c.PokaYoke)acts.push({t:`실수방지: ${c.PokaYoke}${c.PokaYokeType?' · '+c.PokaYokeType:''}${c.PokaYokeReason?' — '+c.PokaYokeReason:''}`,k:'실수방지',o:'',due:'',done:'',st:c.PokaYoke});
  // 6 효과 확인
  const vi=n?verifyInfo(n):d?icaVerify(d):null;
  const eff=T(c&&(c.VerifyStart||c.VerifyEnd)?`검증 기간 ${c.VerifyStart||''} ~ ${c.VerifyEnd||''}`:'',c&&has(c.RateBefore)?`불량률 개선 전 ${c.RateBefore} → 후 ${has(c.RateAfter)?c.RateAfter:'-'}`:'',
    c&&c.Recurred?`재발: ${c.Recurred}`:'',c&&c.VerifyResult&&c.VerifyResult!=='미검증'?`판정: ${c.VerifyResult}`:'',
    n&&n.verifyDate?`NCR 유효성 검증 ${n.verifyDate} — ${n.verifyResult||''}`:n&&n.reqType==='단순 통보'?(ncrNotified(n)?`NCR 단순 통보 ${n.notifyDate||''} — 유효성 검증 대상 아님`:''):n?`NCR 유효성 검증 기한 ${n.verifyDue||'-'}${vi?' · '+vi.label:''}`:'',
    !c&&ic.verifyDate?`사내 대책 검증 ${ic.verifyDate} — ${ic.verifyResult||''}`:(!c&&ic.verifyDue?`사내 대책 검증 기한 ${ic.verifyDue}`:''),
    le?`협력사 대책서 평가 ${le.score??evalScore(le)}점 ${le.verdict||evalVerdict(le)}`:'')||'검증 전';
  // 7 표준화 · 후속
  const stdIca=ic.std?ICA_STD.filter(([k])=>ic.std[k]).map(([,l])=>l):[];
  const fol=T(c?`공정 FMEA: ${c.FMEAUpdate||'미판정'}${c.FMEARev?' ('+c.FMEARev+')':''} · 관리계획서: ${c.CPUpdate||'미판정'}${c.CPRev?' ('+c.CPRev+')':''}`:'',
    c&&c.Yokoten?`수평전개: ${c.Yokoten}`:'',c&&c.DocNAReason?`해당없음 사유: ${c.DocNAReason}`:'',stdIca.length?`표준화 반영: ${stdIca.join(', ')}`:'',
    n&&n.d7?`협력사 재발방지: ${n.d7}`:'',c&&c.CloseDate?`종결 ${c.CloseDate}${c.CloseApprover?' · 승인 '+c.CloseApprover:''}`:'')||'미정';
  // 비용
  const cats={};ds.forEach(x=>(x.costs||[]).forEach(k=>{cats[k.cat||'기타']=(cats[k.cat||'기타']||0)+num(k.amt)}));
  const costTxt=cost?`${Object.entries(cats).map(([k,v])=>`${k} ${won(v)}`).join(' · ')} = <b>${won(cost)}원</b>${req?`<br>구상 청구 ${won(req)}원 · 회수 ${won(recv)}원${os?` · <span style="color:#b42318">미회수 ${won(os)}원</span>`:''}`:resp==='미정'?'<br>귀책 미정 — 정산 대기':''}`:'비용 미입력';
  // 경과 (주요 이벤트)
  const ev=[...ds.flatMap(x=>caseEntries('defect',x)),...(n?(n.logs||[]):[])].filter(e=>e.date&&!e.void).sort((a,b)=>a.date.localeCompare(b.date));
  const seen=new Set(),evs=ev.filter(e=>{const k=e.date+e.text;if(seen.has(k))return false;seen.add(k);return true});
  const tl=(evs.length>9?[...evs.slice(0,3),...evs.slice(-6)]:evs).map(e=>`<tr><td>${esc(e.date.slice(5))}</td><td>${esc(e.text.slice(0,70))}${e.text.length>70?'…':''}${e.result?' → '+esc(e.result.slice(0,40)):''}</td></tr>`).join('');
  // 추세 (같은 부품 · 최근 6개월)
  const pn=d&&d.partNo,ms=lastMonths(today().slice(0,7),6),tr=ms.map(m=>db.defects.filter(x=>pn&&x.partNo===pn&&(x.date||'').startsWith(m)).reduce((a,x)=>a+num(x.qty),0)),mx=Math.max(1,...tr);
  const spark=pn?`<svg viewBox="0 0 240 70" style="width:100%;height:70px">${tr.map((v,i)=>`<rect x="${i*40+8}" y="${56-v/mx*46}" width="24" height="${v/mx*46}" fill="${i===5?'#c0392b':'#9bb3d4'}"/><text x="${i*40+20}" y="68" font-size="8" text-anchor="middle" fill="#555">${ms[i].slice(5)}월</text><text x="${i*40+20}" y="${52-v/mx*46}" font-size="8" text-anchor="middle">${v||''}</text>`).join('')}</svg>`:'';
  let phs=[];try{phs=(await photoGetMany(ds.flatMap(x=>x.photos||[]))).slice(0,3)}catch(e){}
  const sec=(no,t,body,cls='')=>`<div class="sx ${cls}"><div class="sh"><span>${no}</span>${t}</div><div class="sb" contenteditable="true">${body}</div></div>`;
  const pre=t=>nl(esc(t));
  const sg=S.signs||{},sign=(r,nm)=>`<td><div class="r">${r}</div><div class="nm" contenteditable="true">${nm&&sg[nm]?`<img src="${sg[nm]}">`:esc(nm||'')}</div></td>`;
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>A3_${esc((c&&c.CaseNo)||(n&&n.no)||(d&&d.date)||'')}</title><style>
  @page{size:A3 landscape;margin:9mm}*{box-sizing:border-box}
  body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:11.5px;color:#111;margin:0;background:#e9edf2}
  .bar{position:sticky;top:0;z-index:5;background:#14213d;color:#fff;padding:8px 14px;display:flex;gap:10px;align-items:center;font-size:13px}.bar button{font:inherit;padding:5px 14px;border:0;border-radius:5px;cursor:pointer}.bar .pp{background:#fff;color:#14213d;font-weight:bold}
  .pg{width:400mm;min-height:277mm;margin:12px auto;background:#fff;padding:9mm 10mm;box-shadow:0 2px 12px rgba(0,0,0,.15)}
  .hd{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;border-bottom:3px solid #14213d;padding-bottom:6px}
  .hd img.lg{max-height:40px;max-width:160px}.hd h1{font-size:21px;margin:0}.hd .meta{color:#444;font-size:11.5px;margin-top:3px}
  .sgn{border-collapse:collapse}.sgn td{border:1px solid #444;width:24mm;text-align:center;padding:0}.sgn .r{background:#eef1f5;font-size:9.5px;border-bottom:1px solid #444;padding:2px 3px;white-space:nowrap;font-weight:600}.sgn .nm{height:13mm;display:flex;align-items:center;justify-content:center}.sgn img{max-height:11mm;max-width:18mm}
  .kp{display:flex;gap:8px;margin:7px 0 8px;flex-wrap:wrap}.kp div{border:1px solid #cfd6df;border-radius:5px;padding:4px 10px;background:#f7f9fb}.kp b{font-size:14px;margin-left:4px}.kp .bad b{color:#b42318}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}.col{display:flex;flex-direction:column;gap:8px}
  .sx{border:1.5px solid #14213d;border-radius:4px;break-inside:avoid}.sh{background:#14213d;color:#fff;font-weight:bold;padding:4px 8px;font-size:12.5px;display:flex;gap:7px;align-items:center}
  .sh span{background:#fff;color:#14213d;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:11px}
  .sb{padding:6px 9px;line-height:1.55;min-height:16mm;outline:none}.sb:focus{background:#fffbe6}
  .two{display:grid;grid-template-columns:1.25fr 1fr;gap:8px}.ph{display:flex;gap:5px;margin-top:5px}.ph img{height:34mm;max-width:33%;object-fit:cover;border:1px solid #ccc}
  table.at{width:100%;border-collapse:collapse;font-size:11px}table.at th,table.at td{border:1px solid #9aa4b1;padding:3px 5px;text-align:left;vertical-align:top}table.at th{background:#eef1f5;white-space:nowrap}
  .ok{color:#1a7f4b;font-weight:bold}.ng{color:#b42318;font-weight:bold}
  table.tl{width:100%;border-collapse:collapse;font-size:10.5px}table.tl td{border-bottom:1px dotted #bbb;padding:2px 4px;vertical-align:top}table.tl td:first-child{width:38px;color:#555;white-space:nowrap}
  .ft{margin-top:6px;color:#666;font-size:10px;display:flex;justify-content:space-between}
  @media print{body{background:#fff}.bar{display:none}.pg{margin:0;box-shadow:none;width:auto;min-height:0;padding:0}.sb:focus{background:none}}
  </style></head><body>
  <div class="bar"><span style="flex:1">A3 보고서 — 글자를 눌러 바로 고친 뒤 인쇄하세요 (A3 가로 · 고친 내용은 앱에 저장되지 않음)</span><button class="pp" onclick="window.print()">인쇄 / PDF 저장</button><button onclick="${REPORT_CLOSE}">닫기</button></div>
  <div class="pg">
  <div class="hd">${S.logo?`<img class="lg" src="${S.logo}">`:`<b>${esc(S.company||'')}</b>`}
    <div><h1 contenteditable="true">${esc(titleTxt)}</h1><div class="meta">${esc([(c&&c.CaseNo)||'',n?n.no:'',d?`${d.fgNo||''} ${d.partNo||''}`.trim():'',sup,d&&d.model].filter(Boolean).join(' · '))} · 작성 ${today()} · ${esc((c&&c.Owner)||(d&&d.owner)||S.owners[0]||'')}</div></div>
    <table class="sgn"><tr>${sign('Prepared by',(c&&c.Owner)||(d&&d.owner)||S.owners[0])}${sign('Quality Manager',S.approver||'')}${sign('CFO','')}${sign('CEO','')}</tr></table></div>
  <div class="kp"><div>상태<b>${esc(st)}</b></div><div class="${sev&&sev.grade==='A'?'bad':''}">심각도<b>${sev?sev.grade:'-'}</b></div><div>불량<b>${qty.toLocaleString()}개</b>${fgq?` · 완성품 ${fgq.toLocaleString()}대`:''}</div><div>귀책<b>${esc(resp||'-')}</b></div><div class="${os?'bad':''}">실패비용<b>${cost?won(cost)+'원':'-'}</b></div>${vdue?`<div>검증 기한<b>${esc(vdue)}</b></div>`:''}</div>
  <div class="cols"><div class="col">
    ${sec(1,'배경 · 문제 (Background)',pre(bg))}
    ${sec(2,'현상 파악 (Current condition)',`<div class="two"><div>${pre(cur)}</div><div>${spark?`<div style="font-size:10px;color:#555">같은 부품 월별 불량 수량 (최근 6개월)</div>${spark}`:''}</div></div>${phs.length?`<div class="ph">${phs.map(p=>`<img src="${p.thumb||p.data}" title="${esc(p.caption||'')}">`).join('')}</div>`:''}`)}
    ${sec(3,'목표 (Target)',pre(goal))}
    ${sec(4,'원인 분석 (Root cause)',`${occ?`<b>발생 원인</b> ${pre(occ)}<br>`:''}${esc2?`<b>유출 원인</b> ${pre(esc2)}<br>`:''}${sys?`<b>시스템 원인</b> ${pre(sys)}<br>`:''}${whyTxt?`<div style="margin-top:4px;color:#333">${pre(whyTxt)}</div>`:''}${!occ&&!esc2?'<span class="ng">원인 분석 중</span><br>':''}<div style="margin-top:4px;color:#444">${pre(respTxt)}</div>`)}
  </div><div class="col">
    ${sec(5,'대책 (Countermeasures)',acts.length?`<table class="at"><tr><th>구분</th><th>대책</th><th>담당</th><th>기한</th><th>완료</th><th>상태</th></tr>${acts.map(a=>`<tr><td>${esc(a.k)}</td><td>${esc(a.t)}</td><td>${esc(a.o||'')}</td><td>${esc(a.due||'')}</td><td>${esc(a.done||'')}</td><td class="${['완료','승인','적용완료'].includes(a.st)?'ok':a.due&&!a.done&&a.due<today()?'ng':''}">${esc(a.st||'')}</td></tr>`).join('')}</table>`:'<span class="ng">대책 수립 전</span>')}
    ${sec(6,'효과 확인 (Effect check)',pre(eff))}
    ${sec(7,'표준화 · 후속 (Follow-up)',pre(fol))}
    <div class="two">${sec('₩','실패비용 · 구상',costTxt)}${sec('⏱','주요 경과',tl?`<table class="tl">${tl}</table>`:'기록 없음')}</div>
  </div></div>
  <div class="ft"><span>${esc(S.company||'')} ${esc(S.dept||'')} · QIS 자동 작성</span><span>불량 ${ds.length}건 기준${n?' · '+esc(n.no):''}${c?' · '+esc(c.CaseNo):''}</span></div>
  </div></body></html>`;
  reportShow(w,html,`A3보고서_${(c&&c.CaseNo)||(n&&n.no)||(d&&d.date)||today()}.html`);
}

/* ---- 읽기 전용 사본 모드 ---- */
const RO_FN=['saveDefect','saveNcr','saveInv','saveIca','saveSup','delDefect','delIssue','delSup','delPart','delCost','openMasterImport','openBomImport','openRcvImport','openRcvLineImport','editReceipts',
  'bomClear','resetAll','pickImport','exportJSON','exportSqlite','restoreFromFolder','pickRoot','unlinkRoot','dkAdd','dkRemove','pickDir','unlinkDir','photoDirNow','setS','setFx','ncrQuickNotify','rcvDefect','czNewCaseModal','czFromDefect','czFromNcr','czApplyVerdict',
  'ncrFromDefect','quickSup','pwaInstall','openImport','chooseQmsDir','makeShareFile','offerNcrAfterVerdict','addCost','addLabor','addBaseCost','addContact','unlinkDefect','miApply','bomApply','rlApply','riCommit','routeGo'].filter(n=>typeof window[n]==='function');
const RO_RE=new RegExp('\\b('+RO_FN.join('|')+')\\(|\\b(edit(Defect|Ncr|Sup|Part))\\(\\)');
const RO_ACT=new Set(['czNav','open','filtq','csv','tab','report','gotoTab','filt','actFilt']);
function roSweep(root){
  if(!RO||!root)return;
  root.querySelectorAll('input,select,textarea,button,a[onclick],label.b,[data-act]').forEach(el=>{
    if(el.dataset.roDone)return;el.dataset.roDone='1';
    const h=['onclick','oninput','onchange'].map(a=>el.getAttribute(a)||'').join(' '),act=el.dataset.act;
    if(el.closest('#mfoot'))return;
    if(act&&!RO_ACT.has(act)&&!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)){el.style.display='none';return}
    if(el.matches('label.b')&&el.querySelector('input[type=file]')){el.style.display='none';return}
    if(el.tagName==='BUTTON'||el.tagName==='A'){if(RO_RE.test(h))el.style.display='none';return}
    if(el.type==='file'){el.disabled=true;return}
    const filt=/state\.|msState\.|czUi\.|deb\(|ncrTab|ncrMode|bomSelect|bomToggle|bomFold|\bgo\(|render\(/.test(h)||(act&&RO_ACT.has(act));
    if(!filt||el.closest('#mf'))el.disabled=true;
  });
}
if(RO){
  RO_FN.forEach(n=>{window[n]=function(){toast(SRV?'조회 권한은 수정 · 저장할 수 없습니다':'읽기 전용 사본입니다 — 수정 · 저장할 수 없습니다')}});
  ['editDefect','editNcr','editSup','editPart','editInv','editIca'].forEach(n=>{const f=window[n];if(typeof f!=='function')return;window[n]=function(id,...a){if(!id){toast('읽기 전용 사본입니다 — 새로 등록할 수 없습니다');return}return f.call(this,id,...a)}});
  const _om=openModal;
  window.openModal=function(t,b,btns){
    const keep=(btns||[]).filter(x=>/닫기|취소|출력|인쇄|PDF|CSV|보고|통보서|8D|A3|요청서/.test(x.label||'')&&!/저장|등록|발행|삭제/.test(x.label||'')).map(x=>/^취소$/.test(x.label)?{...x,label:'닫기',fn:()=>closeModal(true)}:x);
    if(!keep.some(x=>/닫기/.test(x.label)))keep.push({label:'닫기',cls:'p',fn:()=>closeModal(true)});
    _om(t,b,keep);$('#mt').insertAdjacentHTML('beforeend',' <span class="bg mut" style="font-size:11px;vertical-align:middle">읽기 전용</span>');
    setTimeout(()=>roSweep($('#modal')),0);
  };
  new MutationObserver(()=>roSweep($('#modal'))).observe($('#modal'),{childList:true,subtree:true});
  // 창 아래 버튼은 화면마다 다시 그려지므로 그때마다 정리 (출력 · 닫기만)
  const roFoot=()=>{$('#mfoot').querySelectorAll('button').forEach(b=>{const t=b.textContent;if(!/닫기|취소|출력|인쇄|PDF|CSV|보고|통보서|8D|A3/.test(t)||/저장|등록|발행|삭제|요청|복사|교체|반영/.test(t))b.style.display='none'})};
  new MutationObserver(roFoot).observe($('#mfoot'),{childList:true});
  document.documentElement.classList.add('ro');
  const m=SHARE?SHARE.meta||{}:{};
  if(SRV)document.querySelector('nav').insertAdjacentHTML('afterend',`<div class="roBar noprint">📖 <b>조회 권한</b> — ${esc(SRV.name)} · 보기 · 검색 · 출력만 됩니다. 작성 권한이 필요하면 관리자에게 요청하세요.</div>`);
  else document.querySelector('nav').insertAdjacentHTML('afterend',`<div class="roBar noprint">📖 <b>읽기 전용 사본</b> — ${esc(m.company||'')} ${esc(m.by||'')} · 기준 <b>${esc(loc(m.created)||'-')}</b> · ver ${esc(m.ver||'')}${m.photos!=null?` · 사진 ${m.photos}장`:''}${m.noMaster?' · 기준정보 제외':''} <span class="muted">— 보기 · 검색 · 출력만 됩니다. 고친 내용은 저장되지 않습니다.</span></div>`);
  ['hdrBk','hdrInstall'].forEach(i=>{const e=$('#'+i);if(e)e.style.display='none'});
}
/* ---- 사내 서버 모드: 사용자 표시 · 관리자 전용 기능 ---- */
if(SRV){
  ['hdrBk','hdrInstall'].forEach(i=>{const e=$('#'+i);if(e)e.style.display='none'});
  const R={viewer:'조회',editor:'작성',admin:'관리자'};
  $('#hdrBk').insertAdjacentHTML('beforebegin',`<span class="noprint" id="srvUser" title="${esc(SRV.user)} · ${R[SRV.role]||''} 권한" style="font-size:12px;opacity:.9">👤 ${esc(SRV.name)} <span style="opacity:.7">· ${R[SRV.role]||SRV.role}</span></span>`+
    `<button class="b s noprint" id="hdrPw" onclick="location.href='/account'" title="내 비밀번호 바꾸기">비밀번호</button>`+
    (srvCanAdmin()?`<button class="b s noprint" id="hdrAdm" onclick="window.open('/admin','qisAdmin')" title="사용자 · 변경 이력 · 백업">관리</button>`:'')+
    `<button class="b s noprint" id="hdrOut" onclick="srvLogout()">로그아웃</button>`);
  // 서버가 맡는 기능 (브라우저 저장소 · PC 폴더 · 파일 백업/복원)
  ['resetAll','pickImport','restoreFromFolder','pickRoot','unlinkRoot','pickDir','unlinkDir','photoDirNow','chooseQmsDir','openImport']
    .forEach(n=>{if(typeof window[n]==='function')window[n]=function(){toast('사내 서버 모드에서는 서버가 백업 · 복원합니다 — 관리자 화면을 쓰세요')}});
  window.exportJSON=function(){if(!srvCanAdmin())return srvAdminOnly();location.href='/api/admin/export?photos=1'};
  // 관리자 전용: 기준정보 삭제 · BOM 교체 · 설정
  if(!srvCanAdmin())['delSup','delPart','openBomImport','bomApply','bomClear','setS','setFx','setImpact','setLogo','clearLogo','setSign','clearSign']
    .forEach(n=>{if(typeof window[n]==='function')window[n]=srvAdminOnly});
  // 창이 닫혀 있다가 열리면 변경 받아오기, 작성 창을 닫으면 미뤄 둔 화면 갱신
  const _cm=window.closeModal;window.closeModal=async function(...a){const r=await _cm.apply(this,a);if(srvViewDirty&&!srvModalOpen())setTimeout(srvRefresh,50);return r};
}
bootReady.then(()=>{
  if(!loadFailed&&!RO)lockSev();
  render();renderAlert();updateSaveInfo();
  if(dataMigrated)setTimeout(()=>toast(dataMigrated==='newer'?'예전 버전 창에서 저장된 최신 내용을 가져왔습니다':dataMigrated==='legacyKept'?'기본 저장소에 남아 있던 다른 사본은 덮어쓰지 않고 따로 보관했습니다 — 지금 데이터를 그대로 씁니다':'데이터를 대용량 저장소로 옮겼습니다 — 이제 용량 걱정 없이 쓸 수 있습니다'),400);
});
// 데이터 원본은 브라우저. 사진·첨부 폴더와 백업 폴더만 이 PC 폴더에 사본으로 저장 (예전 OneDrive 연결 정보는 정리)
(async()=>{if(RO||SRV)return;await bootReady;try{
  for(const k of ['qmsDir','dataFile'])await hDel(k).catch(()=>{});
  const root=await hGet('rootDir');
  if(root&&await permOK(root,false))await attachRoot(root,true);
  else{if(root)lazyH.rootDir=root;
    for(const k of ['photoDir','backupDir']){const h=await hGet(k);if(!h)continue;
      if(await permOK(h,false))dirAttach(k,h,true);else lazyH[k]=h}}
  updateSaveInfo();if(state.tab==='data')render();
}catch(e){}})();
/* ---- 설치형 앱 (PWA) ---- */
const isWebApp=/^https?:$/.test(location.protocol);
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
let pwaPrompt=null;
if(!RO&&!SRV&&isWebApp&&'serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(e=>console.warn('서비스 워커 등록 실패',e));
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();pwaPrompt=e;const b=$('#hdrInstall');if(b&&!isStandalone())b.style.display=''});
window.addEventListener('appinstalled',()=>{pwaPrompt=null;const b=$('#hdrInstall');if(b)b.style.display='none';toast('앱으로 설치했습니다 — 바탕화면 · 시작 메뉴의 ‘QIS’로 여세요')});
async function pwaInstall(){
  if(!pwaPrompt){toast('브라우저 메뉴(⋯) → 앱 → ‘이 사이트를 앱으로 설치’를 누르세요');return}
  pwaPrompt.prompt();try{await pwaPrompt.userChoice}catch(e){}pwaPrompt=null;$('#hdrInstall').style.display='none';
}
// 앱 아이콘 바로가기 (불량 등록 · NCR)
bootReady.then(()=>{const g=new URLSearchParams(location.search).get('go');if(!g)return;
  history.replaceState(null,'',location.pathname);
  if(g==='defect-new'){go('defect');setTimeout(()=>editDefect(),50)}else if(TABS.some(t=>t[0]===g))go(g)});
if(isStandalone())document.documentElement.classList.add('standalone');
