/* ================= 월간 검토 의견 ================= */
const getReview=m=>db.reviews.find(r=>r.month===m);
let revTimer=null;
function onReview(m,field,val){
  let r=getReview(m);
  if(!r){r={id:uid(),month:m,issues:'',opinion:'',author:db.settings.owners[0]||''};db.reviews.push(r)}
  r[field]=val;touch(r);
  clearTimeout(revTimer);revTimer=setTimeout(()=>{save();const el=$('#revSaved');if(el){const t=new Date();el.textContent=`저장됨 ${pad(t.getHours())}:${pad(t.getMinutes())}`}},500);
}
function autoSummary(m){
  const pm=lastMonths(m,2)[0],ds=db.defects.filter(d=>(d.date||'').startsWith(m)),pds=db.defects.filter(d=>(d.date||'').startsWith(pm));
  const L=[];const sg=(a,b)=>a===b?'전월 동일':`전월 대비 ${a>b?'+':''}${(a-b).toLocaleString()}`;
  L.push(`• 불량 ${ds.length}건 / ${sum(ds,'qty').toLocaleString()}개 (${sg(ds.length,pds.length)}건, ${sg(sum(ds,'qty'),sum(pds,'qty'))}개)`);
  {const g={A:0,B:0,C:0};ds.forEach(d=>g[sevOf(d).grade]++);L.push(`• 심각도: A ${g.A}건 (8D) · B ${g.B}건 (간이 대책서) · C ${g.C}건 (단순 통보)`)}
  const sm={};ds.forEach(d=>{const k=supName(d.supplierId)||'(미지정)';sm[k]=(sm[k]||0)+num(d.qty)});
  const ts=Object.entries(sm).sort((a,b)=>b[1]-a[1]),tq=sum(ds,'qty');
  if(ts.length)L.push(`• 협력사별: ${ts.slice(0,3).map(([k,v])=>`${k} ${v.toLocaleString()}개(${tq?Math.round(v/tq*100):0}%)`).join(', ')}`);
  const tm={};ds.forEach(d=>{tm[d.type||'(미지정)']=(tm[d.type||'(미지정)']||0)+1});
  const tt=Object.entries(tm).sort((a,b)=>b[1]-a[1]);
  if(tt.length)L.push(`• 주요 유형: ${tt.slice(0,3).map(([k,v])=>`${k} ${v}건`).join(', ')}`);
  const big=[...ds].sort((a,b)=>num(b.qty)-num(a.qty))[0];
  if(big&&num(big.qty)>=num(db.settings.ncrQty))L.push(`• 다량 불량: ${big.date} ${supName(big.supplierId)} ${big.partName||big.partNo} ${big.type} ${num(big.qty)}개`);
  const ext=ds.filter(isExt);if(ext.length)L.push(`• 고객 클레임 ${ext.length}건 (비용 ${won(sum(ext,costTotal))}원)`);
  const cost=allCostIn(m),rec=allRecvIn(m);{const os=db.defects.reduce((a,d)=>a+outstanding(d),0);if(os)L.push(`• 구상 미회수 잔액 ${won(os)}원`)}if(cost)L.push(`• 실패비용(당월 발생) ${won(cost)}원, 구상 회수 ${won(rec)}원 (${Math.round(rec/cost*100)}%)`);
  const open=db.ncrs.filter(n=>ncrStatus(n)!=='종결'),rl=open.filter(n=>ncrFlags(n).replyLate),vl=open.filter(n=>ncrFlags(n).verifyLate);
  L.push(`• 미종결 NCR ${open.length}건${rl.length?` — 회신 지연 ${rl.length}건(${[...new Set(rl.map(n=>supName(n.supplierId)))].join(', ')})`:''}${vl.length?`, 유효성 검증 지연 ${vl.length}건`:''}`);
  const recs=db.defects.filter(d=>!d.ncrId&&d.date&&diffDays(d.date,today())<=90&&ncrReasons(d).length);
  if(recs.length)L.push(`• NCR 발행 권고 미처리 ${recs.length}건 (최근 90일)`);
  return L.join('\n');
}
async function fillSummary(m){
  const r=getReview(m),ta=$('#revIssues');
  if(r&&(r.issues||'').trim()&&!await askConfirm({title:'자동 요약을 넣을까요?',msg:'이미 작성한 특이사항이 있습니다. 자동 요약은 <b>기존 내용 아래에 추가</b>됩니다.',ok:'아래에 추가',danger:false}))return;
  const v=((r&&r.issues||'').trim()?r.issues.trim()+'\n\n':'')+autoSummary(m);
  ta.value=v;onReview(m,'issues',v);ta.focus();toast('자동 요약 초안을 넣었습니다. 필요한 부분을 고쳐 쓰세요.');
}
function reviewCard(m){
  const r=getReview(m)||{};
  return `<div class="card noprint"><h3>월간 특이사항 · 검토 의견 (${m})<span class="sp"></span><span id="revSaved" class="muted" style="font-weight:normal;font-size:12px">${r.updatedAt?'저장됨 '+loc(r.updatedAt).slice(5):'입력하면 자동 저장'}</span>
    <button class="b s" onclick="fillSummary('${m}')">자동 요약 초안</button><button class="b s p" onclick="dashReport()">보고서로 출력</button></h3>
    <div class="grid g2" style="gap:10px">
      <label class="fgl">특이사항 (이번 달 주요 이슈·현황)<textarea id="revIssues" style="min-height:170px" placeholder="예) 대성정밀 브라켓 치수불량 124개 — 금형 마모, 10/25 수정 완료 예정&#10;‘자동 요약 초안’을 누르면 데이터 기반 요약이 들어갑니다." oninput="onReview('${m}','issues',this.value)">${esc(r.issues)}</textarea></label>
      <label class="fgl">검토 의견 · 향후 조치 계획<textarea style="min-height:170px" placeholder="예) 반복 불량 협력사 3사 11월 공정 감사 실시, 회신 지연 NCR 독촉 공문 발송" oninput="onReview('${m}','opinion',this.value)">${esc(r.opinion)}</textarea></label>
    </div>
    <div class="row" style="margin-top:8px"><label class="fgl" style="flex-direction:row;align-items:center;gap:6px">작성자<input value="${esc(r.author||db.settings.owners[0]||'')}" list="dlOwners" style="width:140px" oninput="onReview('${m}','author',this.value)"></label><span class="help">여기 쓴 내용이 ‘보고용 인쇄’ 첫 장(1. 특이사항 및 검토 의견)에 그대로 들어갑니다. 월을 바꾸면 그 달의 기록이 따로 보관됩니다.</span></div>
  </div>`;
}
