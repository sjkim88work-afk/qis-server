/* ================= COPQ ================= */
function renderCopq(){
  const y=state.copqYear,basis=state.copqBasis||'cost';
  const yrs=new Set([today().slice(0,4)]);db.defects.forEach(d=>{if(d.date)yrs.add(d.date.slice(0,4));(d.costs||[]).forEach(c=>c.date&&yrs.add(c.date.slice(0,4)));if(d.claim?.recvDate)yrs.add(d.claim.recvDate.slice(0,4))});
  const years=[...yrs].sort().reverse();
  const ms=Array.from({length:12},(_,i)=>`${y}-${pad(i+1)}`);
  const catIn=(d,m,cat)=>basis==='cost'?costCatIn(d,m,cat):((d.date||'').startsWith(m)?(d.costs||[]).filter(c=>c.cat===cat).reduce((a,c)=>a+num(c.amt),0):0);
  const totIn=(d,m)=>basis==='cost'?costSumIn(d,m):((d.date||'').startsWith(m)?costTotal(d):0);
  const recIn=(d,m)=>basis==='cost'?recvIn(d,m):((d.date||'').startsWith(m)?recvOf(d):0);
  const linesIn=(d,m)=>basis==='cost'?costsIn(d,m):((d.date||'').startsWith(m)?(d.costs||[]):[]);
  const isExtC=(d,c)=>isExt(d)||c.cat==='고객클레임';
  const rows=ms.map(m=>{const r={m};COST_CATS.forEach(c=>r[c]=db.defects.reduce((a,d)=>a+catIn(d,m,c),0));
    r.int=0;r.ext=0;db.defects.forEach(d=>linesIn(d,m).forEach(c=>{if(isExtC(d,c))r.ext+=num(c.amt);else r.int+=num(c.amt)}));r.tot=r.int+r.ext;r.rec=db.defects.reduce((a,d)=>a+recIn(d,m),0);r.net=r.tot-r.rec;return r});
  const T={};['int','ext','tot','rec','net',...COST_CATS].forEach(k=>T[k]=rows.reduce((a,r)=>a+r[k],0));
  const bySup={},byType={};db.defects.forEach(d=>{const v=totIn(d,y);if(!v)return;const sn=supName(d.supplierId)||'(미지정)';bySup[sn]=(bySup[sn]||0)+v;byType[d.type||'(미지정)']=(byType[d.type||'(미지정)']||0)+v});
  const nc=db.defects.filter(needCost).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const ncl=db.defects.filter(needClaim).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const oc=db.defects.filter(d=>outstanding(d)>0||claimStatus(d)==='이의').sort((a,b)=>(a.claim.reqDate||'').localeCompare(b.claim.reqDate||''));
  const osSup={};oc.forEach(d=>{const k=supName(d.supplierId)||'(미지정)';osSup[k]=(osSup[k]||0)+outstanding(d)});
  const osTot=oc.reduce((a,d)=>a+outstanding(d),0);
  const dl=d=>`<a class="lk" onclick="openCost('${d.id}')">${esc(defLabel(d))}</a>`;
  return `<div class="card noprint"><div class="row"><b>연도</b><select onchange="state.copqYear=this.value;render()">${years.map(x=>`<option ${x===y?'selected':''}>${x}</option>`).join('')}</select>
    <b style="margin-left:10px">집계 기준</b><select onchange="state.copqBasis=this.value;render()"><option value="cost" ${basis==='cost'?'selected':''}>비용 발생월 (회계 기준)</option><option value="defect" ${basis==='defect'?'selected':''}>불량 발생월</option></select>
    <span style="flex:1"></span><button class="b" onclick="exportCopqCSV()">비용 내역 엑셀</button><button class="b" onclick="exportClaimCSV()">구상 엑셀</button></div>
    <div class="help" style="margin-top:6px">${basis==='cost'?'비용은 <b>비용 발생일</b>, 회수는 <b>회수일</b>이 속한 달에 집계합니다. 9월 불량의 클레임 비용이 11월에 확정되면 11월 비용입니다.':'불량 발생일이 속한 달에 그 불량의 모든 비용·회수를 묶어서 봅니다(불량 건별 손실 파악용).'} 내부실패 = 수입검사·공정·출하 발생 비용 / 외부실패 = 고객 발생 불량의 비용 + ‘고객클레임’ 항목 비용.</div></div>
  <div class="kpis">
    <div class="kpi"><div class="l">${y} 실패비용 합계</div><div class="v">${fmtShort(T.tot)}</div><div class="s">${won(T.tot)}원</div></div>
    <div class="kpi"><div class="l">내부실패</div><div class="v">${fmtShort(T.int)}</div><div class="s">${T.tot?Math.round(T.int/T.tot*100):0}%</div></div>
    <div class="kpi ${T.ext?'bad':''}"><div class="l">외부실패</div><div class="v">${fmtShort(T.ext)}</div><div class="s">${T.tot?Math.round(T.ext/T.tot*100):0}%</div></div>
    <div class="kpi ok"><div class="l">구상 회수</div><div class="v">${fmtShort(T.rec)}</div><div class="s">회수율 ${T.tot?Math.round(T.rec/T.tot*100):0}%</div></div>
    <div class="kpi"><div class="l">순손실</div><div class="v">${fmtShort(T.net)}</div><div class="s">${won(T.net)}원</div></div>
    <div class="kpi ${osTot?'bad':'ok'}"><div class="l">구상 미회수 잔액 (전체)</div><div class="v">${fmtShort(osTot)}</div><div class="s">${oc.length}건</div></div>
    ${(()=>{const iv=db.defects.filter(invOpen),t=iv.reduce((a,d)=>a+costTotal(d),0);return `<div class="kpi ${t?'warn':''}" title="귀책 판정 전까지 쌓아 둔 비용 — 판정 후 협력사·공동이면 구상, 사내·원인 불명이면 사내 부담"><div class="l">귀책 미정 비용 (조사 중)</div><div class="v">${fmtShort(t)}</div><div class="s">${iv.length}건 · <a class="lk" onclick="state.df={...state.df,status:'inv',from:''};go('defect')">목록</a></div></div>`})()}
  </div>
  ${nc.length||ncl.length?`<div class="grid g2">
    <div class="card"><h3>비용 미입력 <span class="bg warn">${nc.length}</span><span class="sp"></span><span class="muted" style="font-weight:normal;font-size:12px">처리 완료됐는데 비용이 없는 불량</span></h3>${nc.length?`<div class="tw" style="max-height:300px"><table><tbody>${nc.slice(0,100).map(d=>`<tr><td>${dl(d)}</td><td>${esc(supName(d.supplierId))}</td><td>${esc(d.disposition)}</td><td class="n">${num(d.qty)}개</td><td style="white-space:nowrap"><button class="b s p" onclick="openCost('${d.id}')">입력</button> <button class="b s" onclick="markNoCost('${d.id}')" title="비용이 발생하지 않은 건">비용 없음</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="muted">없음</div>'}</div>
    <div class="card"><h3>구상 미청구 <span class="bg warn">${ncl.length}</span><span class="sp"></span><span class="muted" style="font-weight:normal;font-size:12px">협력사 귀책인데 청구 기록이 없는 비용</span></h3>${ncl.length?`<div class="tw" style="max-height:300px"><table><tbody>${ncl.slice(0,100).map(d=>`<tr><td>${dl(d)}</td><td>${esc(supName(d.supplierId))}</td><td class="n">${won(costTotal(d))}원</td><td><button class="b s p" onclick="openCost('${d.id}')">청구 입력</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="muted">없음</div>'}</div></div>`:''}
  <div class="card"><h3>구상 미회수 · 이의 관리 <span class="bg ${osTot?'bad':'mut'}">${won(osTot)}원</span><span class="sp"></span>${Object.entries(osSup).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`<span class="bg inf" style="font-weight:normal">${esc(k)} ${won(v)}</span>`).join(' ')}</h3>
    ${oc.length?`<div class="tw" style="max-height:360px"><table><thead><tr><th>협력사</th><th>불량</th><th>청구일</th><th class="n">경과</th><th class="n">청구액</th><th class="n">합의액</th><th class="n">회수액</th><th class="n">미회수</th><th>상태</th><th></th></tr></thead><tbody>
    ${oc.map(d=>{const c=d.claim,el=c.reqDate?diffDays(c.reqDate,today()):null;return `<tr><td>${esc(supName(d.supplierId))}</td><td>${dl(d)}</td><td>${esc(c.reqDate)}</td><td class="n">${el==null?'-':`<span class="bg ${el>60?'bad':el>30?'warn':'mut'}">${el}일</span>`}</td><td class="n">${won(c.reqAmt)}</td><td class="n">${c.agreeAmt?won(c.agreeAmt):''}</td><td class="n">${c.recvAmt?won(c.recvAmt):''}</td><td class="n"><b>${won(outstanding(d))}</b></td><td><span class="bg ${CLAIM_CLS[claimStatus(d)]}">${claimStatus(d)}</span>${c.dispute&&c.disputeReason?`<br><span class="muted" style="font-size:11px">${esc(c.disputeReason)}</span>`:''}</td><td><button class="b s" onclick="openCost('${d.id}')">관리</button></td></tr>`}).join('')}</tbody></table></div>`:'<div class="muted">미회수 건이 없습니다.</div>'}</div>
  <div class="card"><h3>월별 실패비용</h3>${barChart(ms.map(m=>m.slice(5)+'월'),[{name:'내부실패',values:rows.map(r=>r.int),color:'#1f5fbf'},{name:'외부실패',values:rows.map(r=>r.ext),color:'#c0392b'},{name:'회수',values:rows.map(r=>r.rec),color:'#1a8f5a'}],{fmt:won})}</div>
  <div class="card"><h3>월별 상세 (원)</h3><div class="tw"><table><thead><tr><th>월</th>${COST_CATS.map(c=>`<th class="n">${c}</th>`).join('')}<th class="n">내부실패</th><th class="n">외부실패</th><th class="n">합계</th><th class="n">회수</th><th class="n">순손실</th></tr></thead><tbody>
  ${rows.map(r=>`<tr><td>${r.m}</td>${COST_CATS.map(c=>`<td class="n">${r[c]?won(r[c]):''}</td>`).join('')}<td class="n">${won(r.int)}</td><td class="n">${won(r.ext)}</td><td class="n"><b>${won(r.tot)}</b></td><td class="n">${won(r.rec)}</td><td class="n">${won(r.net)}</td></tr>`).join('')}
  <tr style="background:#f7f8fa;font-weight:bold"><td>합계</td>${COST_CATS.map(c=>`<td class="n">${won(T[c])}</td>`).join('')}<td class="n">${won(T.int)}</td><td class="n">${won(T.ext)}</td><td class="n">${won(T.tot)}</td><td class="n">${won(T.rec)}</td><td class="n">${won(T.net)}</td></tr>
  </tbody></table></div></div>
  <div class="grid g2"><div class="card"><h3>협력사별 실패비용 (파레토)</h3>${pareto(bySup,'원')}</div><div class="card"><h3>불량유형별 실패비용 (파레토)</h3>${pareto(byType,'원')}</div></div>`;
}
function markNoCost(id){const d=db.defects.find(x=>x.id===id);if(!d)return;d.noCost=true;touch(d);save();render();toast('비용 없음으로 표시했습니다 (불량 비용 칸에서 다시 입력 가능)')}
function exportCopqCSV(){
  const y=state.copqYear,rows=[];
  db.defects.forEach(d=>(d.costs||[]).forEach(c=>{if((c.date||d.date||'').startsWith(y))rows.push([c.date||d.date,isExt(d)||c.cat==='고객클레임'?'외부실패':'내부실패',c.cat,c.qty??'',c.price??'',num(c.amt),c.basis||'',c.memo||'',d.date,d.source,supName(d.supplierId),d.partNo,d.partName,d.type,d.qty,d.resp])}));
  rows.sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  downloadCSV(`COPQ_비용내역_${y}.csv`,[['비용발생일','구분','항목','수량','단가','금액','산출근거','메모','불량발생일','발생처','협력사','품번','품명','불량유형','수량','귀책'],...rows]);
}
function exportClaimCSV(){
  const L=db.defects.filter(d=>claimStatus(d)).sort((a,b)=>(a.claim.reqDate||'').localeCompare(b.claim.reqDate||''));
  downloadCSV(`구상관리_${today()}.csv`,[['협력사','불량발생일','품번','품명','불량유형','비용합계','청구일','청구액','합의일','합의액','회수일','회수액','회수방법','미회수','상태','이의사유','포기사유','메모'],
    ...L.map(d=>{const c=d.claim;return [supName(d.supplierId),d.date,d.partNo,d.partName,d.type,costTotal(d),c.reqDate,c.reqAmt,c.agreeDate,c.agreeAmt,c.recvDate,c.recvAmt,c.method,outstanding(d),claimStatus(d),c.disputeReason,c.waiveReason,c.memo]})]);
}

