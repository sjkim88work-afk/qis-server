/* ================= 주간 보고 (최근 7일) ================= */
function weekReport(){
  const w=reportWin(),S=db.settings,to=today(),from=addDays(to,-6),nx7=addDays(to,7),inR=d=>!!d&&d>=from&&d<=to;
  const ds=db.defects.filter(d=>inR(d.date)).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const nNew=db.ncrs.filter(n=>inR(n.issueDate)),nRep=db.ncrs.filter(n=>inR(n.replyDate)),nOk=db.ncrs.filter(n=>inR(n.approvedDate)),nClose=db.ncrs.filter(n=>ncrStatus(n)==='종결'&&inR(n.verifyDate));
  const cNew=db.cases.filter(c=>inR(c.Created)),cClose=db.cases.filter(c=>c.Status==='종결'&&inR(c.CloseDate));
  const P=progCases(),late=P.filter(c=>c.late.length).sort((a,b)=>b.late[0].n-a.late[0].n),next=P.filter(c=>c.next&&c.next.nextDate>to&&c.next.nextDate<=nx7).sort((a,b)=>a.next.nextDate.localeCompare(b.next.nextDate));
  const nudges=db.ncrs.flatMap(n=>nudgeLogs(n).filter(l=>inR(l.date)).map(l=>({n,l})));
  const g={A:0,B:0,C:0};ds.forEach(d=>g[sevOf(d).grade]++);
  const kind=c=>c.kind==='ncr'?'NCR':c.kind==='rca'?'RCA':'불량';
  const tb=(h,rows,empty)=>rows.length?`<table><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr>${rows.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</table>`:`<div class="em">${empty}</div>`;
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>주간품질보고_${from}_${to}</title><style>
  body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:11px;color:#111;margin:24px}
  .hd{display:flex;align-items:center;gap:14px;border-bottom:2.5px solid #14213d;padding-bottom:8px}.hd img{max-height:46px;max-width:170px;object-fit:contain}.hd .t{flex:1}.hd h1{font-size:19px;margin:0}.hd .s{color:#555;margin-top:3px}
  table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef1f5;white-space:nowrap}
  .sign{width:auto}.sign th{text-align:center;width:62px;font-weight:normal}.sign td{height:42px}
  h2{font-size:13px;margin:16px 0 6px;padding-left:7px;border-left:4px solid #1f5fbf}.sec{break-inside:avoid}.em{color:#666;padding:4px 0}
  .kp{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px}.kp div{border:1px solid #bbb;border-radius:5px;padding:7px}.kp b{display:block;font-size:17px;margin-top:2px}.kp span{color:#555;font-size:10px}.kp .r b{color:#c0392b}
  .memo td{height:60px;line-height:1.6}@media print{.scr{display:none}}@media screen{.ed{outline:1px dashed #9db4dc;background:#fbfdff}.ed:focus{outline:2px solid #1f5fbf;background:#fff}}
  </style></head><body>
  <div class="hd">${S.logo?`<img src="${S.logo}">`:''}<div class="t"><h1>주간 품질 현황 보고</h1><div class="s">${from} ~ ${to} (최근 7일) · ${esc(S.company||'')}${S.dept?' · '+esc(S.dept):''} · 출력일 ${today()}</div></div>
  <table class="sign"><tr><th>작성</th><th>검토</th><th>승인</th></tr><tr><td></td><td></td><td></td></tr></table></div>
  <div class="kp">
    <div><span>신규 불량</span><b>${ds.length}건</b><span>${sum(ds,'qty').toLocaleString()}개 · A ${g.A} / B ${g.B} / C ${g.C}</span></div>
    <div><span>NCR 발행 / 회신 / 승인 / 종결</span><b>${nNew.length} / ${nRep.length} / ${nOk.length} / ${nClose.length}</b><span>독촉 ${nudges.length}회</span></div>
    <div><span>RCA 등록 / 종결</span><b>${cNew.length} / ${cClose.length}</b><span>진행 중 ${db.cases.filter(czOpen).length}건</span></div>
    <div class="${late.length?'r':''}"><span>지연 중인 건 (${to})</span><b>${late.length}</b><span>다음 7일 기한 ${next.length}건</span></div></div>
  <div class="sec"><h2>1. 이번 주 특이사항</h2><div class="scr" style="color:#1f5fbf;margin-bottom:4px">✎ 점선 칸은 인쇄 직전에 바로 쓸 수 있습니다 (저장되지 않음)</div><table class="memo"><tr><th style="width:17%">특이사항</th><td class="ed" contenteditable></td></tr><tr><th>다음 주 계획</th><td class="ed" contenteditable></td></tr></table></div>
  <div class="sec"><h2>2. 신규 불량 (${ds.length}건)</h2>${tb(['발생일','발생처','심각도','협력사','부품','유형','수량','진행'],ds.map(d=>[esc(d.date),esc(d.source),sevOf(d).grade,esc(supName(d.supplierId)),`${esc(d.partNo)} ${esc(d.partName)}`,esc(d.type),num(d.qty).toLocaleString(),esc(defStage(d).label)]),'이번 주 등록된 불량 없음')}</div>
  <div class="sec"><h2>3. NCR 진행</h2>${tb(['구분','NCR','협력사','부품','일자','상태'],[...nNew.map(n=>['발행',n,n.issueDate]),...nRep.map(n=>['대책서 회신',n,n.replyDate]),...nOk.map(n=>['대책서 승인',n,n.approvedDate]),...nClose.map(n=>['종결',n,n.verifyDate]),...nudges.map(x=>['독촉',x.n,x.l.date])].map(([k,n,d])=>[k,esc(n.no),esc(supName(n.supplierId)),`${esc(n.partNo||'')} ${esc(n.partName||'')}`,esc(d),esc(ncrStatus(n))]),'이번 주 NCR 변동 없음')}</div>
  <div class="sec"><h2>4. RCA 진행</h2>${tb(['구분','RCA','제목','TIER','일자','단계'],[...cNew.map(c=>['등록',c,c.Created]),...cClose.map(c=>['종결',c,c.CloseDate])].map(([k,c,d])=>[k,esc(c.CaseNo),esc(c.Title),esc(c.Tier||''),esc(d),esc(c.Stage)]),'이번 주 RCA 등록 · 종결 없음')}</div>
  <div class="sec"><h2>5. 지연 중인 건 (${late.length}건)</h2>${tb(['구분','건','협력사','지연 내용','담당'],late.map(c=>[kind(c),esc(c.title),esc(c.sup),esc(lateTxt(c.late)),esc(c.owner)]),'지연 건 없음')}</div>
  <div class="sec"><h2>6. 다음 7일 기한 (${next.length}건)</h2>${tb(['기한','구분','건','협력사','내용'],next.map(c=>[esc(c.next.nextDate),kind(c),esc(c.title),esc(c.sup),esc(c.next.next)]),'다음 7일 안에 돌아오는 기한 없음')}</div>
  </body></html>`.replace('</head>',REPORT_HEAD).replace('<body>','<body>'+REPORT_BAR);
  reportShow(w,html,`주간품질보고_${to}.html`);
}
