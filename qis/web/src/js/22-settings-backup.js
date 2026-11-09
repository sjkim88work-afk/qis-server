/* ================= 설정 · 백업 ================= */
function showUsage(){if(navigator.storage&&navigator.storage.estimate)navigator.storage.estimate().then(e=>{const el=$('#usage');if(el)el.textContent=`브라우저 저장공간 사용 ${(e.usage/1048576).toFixed(1)}MB / 가용 약 ${(e.quota/1073741824).toFixed(1)}GB`}).catch(()=>{})}
const SET_NAV=[['옵션',[['general','일반','M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'],['brand','로고 · 서명','M4 16l4-4 3 3 5-6 4 5M4 5h16v14H4z'],['defect','불량 관리','M12 3l9 16H3zM12 10v4M12 17h.01'],['sev','심각도 평가','M5 20V10M12 20V4M19 20v-7'],['ncr','NCR · 통보서','M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6'],['docno','문서번호','M9 4L7 20M17 4l-2 16M4 9h16M3 15h16'],['eval','대책서 평가','M9 11l3 3 8-8M20 12v7H4V5h11'],['sup','협력사 등급','M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],['tg','알림 (텔레그램)','M6 9a6 6 0 0 1 12 0c0 6 3 8 3 8H3s3-2 3-8M10 21h4']]],
  ['데이터',[['backup','데이터 · 백업','M12 3v12M7 10l5 5 5-5M4 19h16']]]];
const sv=(t,d,c,blk)=>`<div class="srow${blk?' blk':''}"><div class="si"><div class="st">${t}</div>${d?`<div class="sd">${d}</div>`:''}</div><div class="sc">${c}</div></div>`;
const sg=(h,rows)=>`${h?`<div class="sgh">${h}</div>`:''}<div class="sgrp">${rows}</div>`;
const sNum=(k,unit,min,max)=>`<input type="number" class="snum" value="${esc(db.settings[k])}" ${min!=null?`min="${min}"`:''} ${max!=null?`max="${max}"`:''} onchange="setS('${k}',this.value,'num',this)">${unit?`<span class="muted">${unit}</span>`:''}`;
const sTxt=(k,ph)=>`<input class="stxt" value="${esc(db.settings[k])}" placeholder="${esc(ph||'')}" onchange="setS('${k}',this.value,'str')">`;
const sList=(k,ph)=>`<textarea class="slist" placeholder="${esc(ph||'')}" onchange="setS('${k}',this.value,'list')">${esc((db.settings[k]||[]).join('\n'))}</textarea>`;
function setFx(c,v){const S=db.settings;S.fx={...(S.fx||{})};if(String(v).trim()===''){delete S.fx[c]}else{if(!isFinite(+v)||+v<0){toast('숫자를 입력하세요');setTimeout(render,0);return}S.fx[c]=+v}
  if(!S.fxDate)S.fxDate=today();save();const e=$('#setSaved');if(e){e.textContent='저장됨';e.style.opacity=1;setTimeout(()=>e.style.opacity=0,1600)}}
function setS(k,v,type,el){
  const S=db.settings;lockSev();
  if(type==='num'){
    if(String(v).trim()===''||!isFinite(Number(v))){toast('숫자를 입력하세요 — 이전 값으로 되돌립니다');setTimeout(render,0);return}
    let x=Number(v);const mn=el&&el.min!==''?Number(el.min):null,mx=el&&el.max!==''?Number(el.max):null;
    if(mn!=null&&x<mn){x=mn;toast(`최소값 ${mn}(으)로 맞췄습니다`)}if(mx!=null&&x>mx){x=mx;toast(`최대값 ${mx}(으)로 맞췄습니다`)}
    S[k]=x;if(el)el.value=x}
  else if(type==='list'){const a=String(v).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!a.length&&k!=='owners'){toast('최소 1개 항목이 필요합니다');setTimeout(render,0);return}S[k]=[...new Set(a)]}
  else{S[k]=String(v).trim();const dn=Object.values(DOCNO).find(d=>d.key===k);if(dn&&!S[k])S[k]=dn.def}
  const warn=[];
  if(num(S.sevB)>=num(S.sevA))warn.push('심각도 B 기준은 A 기준보다 작아야 합니다');
  if(!(num(S.gradeA)<num(S.gradeB)&&num(S.gradeB)<num(S.gradeC)))warn.push('PPM 등급은 A < B < C 순이어야 합니다');
  if(num(S.evalCond)>=num(S.evalPass))warn.push('보완요청 기준은 승인 기준보다 작아야 합니다');
  save();
  clearTimeout(setS._t);setS._t=setTimeout(()=>{if(state.tab!=='data')return;const y=window.scrollY;render();window.scrollTo(0,y);
    const el=$('#setSaved');if(el){el.textContent='✓ 저장됨';el.style.opacity=1;setTimeout(()=>{if(el)el.style.opacity=0},1600)}},0);
  if(warn.length)toast('확인 필요: '+warn.join(' / '));
}
function setImpact(t,v){db.settings.impactMap={...(db.settings.impactMap||{}),[t]:+v};save();const el=$('#setSaved');if(el){el.textContent='✓ 저장됨';el.style.opacity=1;setTimeout(()=>{if(el)el.style.opacity=0},1600)}}
function renderData(){
  const S=db.settings,fsOK=!!window.showSaveFilePicker,tab=state.setTab==='storage'?'backup':(state.setTab||'general');  // 예전 ‘저장 공간’ 탭은 ‘데이터 · 백업’으로 합침
  const cnt=COLLS.map(c=>db[c].length),nPh=db.defects.reduce((a,d)=>a+(d.photos||[]).length,0);
  const ico=d=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  const nav=SET_NAV.map(([g,items])=>`<div class="gh">${g}</div>${items.map(([k,l,d])=>`<button class="${tab===k?'on':''}" onclick="state.setTab='${k}';render();window.scrollTo(0,0)">${ico(d)}<span>${l}</span></button>`).join('')}`).join('');
  const title=SET_NAV.flatMap(x=>x[1]).find(x=>x[0]===tab)?.[1]||'';
  const btn=(lbl,fn,cls='')=>`<button class="b ${cls}" onclick="${fn}">${lbl}</button>`;
  const P={};
  P.general=()=>sg('회사 정보',
    sv('회사명','상단 바, 보고서, 부적합 통보서(Company)에 표시됩니다.',sTxt('company','예: 한빛오토'))+
    sv('부서명','보고서 머리글과 통보서 Department에 표시됩니다.',sTxt('dept','예: Quality'))+
    sv('발행자 전화','부적합 통보서 하단 연락처에 표시됩니다.',sTxt('issuerPhone','예: 031-000-0000'))+
    sv('발행자 이메일','부적합 통보서 하단 연락처에 표시됩니다.',sTxt('issuerEmail','예: qa@company.com')))+
    sg('담당자',sv('담당자 목록','불량·NCR 담당자 선택 목록과 서명 등록 대상입니다. 한 줄에 한 명씩 입력합니다. 첫 번째 사람이 기본 담당자가 됩니다.',sList('owners','홍길동'),1));
  P.brand=()=>sg('로고',
    sv('회사 로고','PNG(투명 배경)·SVG 권장. 상단 바, 대시보드 보고서, 부적합 통보서, 8D 보고서에 표시됩니다.',`<div class="logoprev" style="width:200px;height:70px">${S.logo?`<img src="${S.logo}" alt="로고" style="max-width:180px;max-height:60px">`:'<span class="muted">로고 없음</span>'}</div>
      <div style="display:flex;flex-direction:column;gap:6px"><label class="b p" style="cursor:pointer;text-align:center">파일 선택<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/gif,image/webp" style="display:none" onchange="setLogo(this.files[0]);this.value=''"></label>${S.logo?btn('삭제','clearLogo()','d'):''}</div>`))+
    sg('통보서 결재',sv('승인자 이름','부적합 통보서 Name 칸의 ‘승인’에 표시됩니다. 작성자는 NCR 담당자입니다.',sTxt('approver','예: 홍길동'))+
      ([...new Set([...S.owners,S.approver].filter(Boolean))].map(nm=>sv(`${esc(nm)} ${nm===S.approver?'<span class="bg inf">승인자</span>':'<span class="bg mut">작성자</span>'}`,'흰 종이에 서명 → 사진·스캔 → 올리기. 흰 배경은 자동으로 투명 처리됩니다.',
        `<span class="sigbox">${(S.signs||{})[nm]?`<img src="${S.signs[nm]}">`:'<span class="muted" style="font-size:11px">서명 없음</span>'}</span><label class="b" style="cursor:pointer">서명 선택<input type="file" accept="image/*" style="display:none" onchange="setSign(${jsq(nm)},this.files[0]);this.value=''"></label>${(S.signs||{})[nm]?`<button class="b d" onclick="clearSign(${jsq(nm)})">삭제</button>`:''}`)).join('')||sv('서명 대상 없음','‘일반’에서 담당자 목록이나 위 승인자 이름을 먼저 입력하세요.','')));
  P.defect=()=>sg('분류 항목',
    sv('불량유형','불량 등록 시 선택 목록입니다. 한 줄에 하나씩 입력합니다. 새 유형의 기본 영향도는 ‘심각도 평가’에서 정하세요.',sList('defectTypes'),1)+
    sv('발생처','이름에 ‘고객’이 들어가면 외부실패·심각도 A(고객 클레임)로, ‘공정’은 유출 단계 2점, ‘출하’는 3점으로 분류됩니다.',sList('sources'),1)+
    sv('처리 방법','반품·선별·재작업·특채·폐기 등. ‘폐기’는 비용 자동계산에서 수량×단가로 계산됩니다.',sList('dispositions'),1))+
    sg('비용 · 사진',sv('시간당 인건비','작업시간 × 인건비로 선별비·재작업비를 자동 계산합니다.',sNum('laborRate','원',0))+
      sv('사진 최대 크기','첨부 사진의 긴 변을 이 크기로 줄여서 저장합니다.',sNum('photoMax','px',400,4000))+
      sv('사진 압축 품질','낮을수록 용량이 작아집니다. 70~85 권장.',sNum('photoQ','%',30,95)))+
    sg('환율 (부품 단가 → 원화)',sv('사용 방법',`해외 부품은 단가를 <b>협력사 통화 그대로</b> 저장하고, 비용 · 구상 · COPQ에서는 아래 환율로 <b>원화로 바꿔</b> 계산합니다. 이미 입력한 비용은 그때 금액 그대로이고, 새로 넣는 비용부터 바뀐 환율이 쓰입니다.${db.settings.fxDate?`<br>환율 기준일: <b>${esc(db.settings.fxDate)}</b>`:'<br><b style="color:var(--warn)">기본값은 예시입니다 — 회사 기준 환율로 바꿔 주세요.</b>'}`,'',1)+
      CURS.filter(c=>c!=='KRW').map(c=>sv(`1 ${c}`,CUR_L[c],`<input type="number" class="snum" min="0" step="any" value="${esc((db.settings.fx||{})[c]??'')}" onchange="setFx('${c}',this.value)"><span class="muted">원</span>`)).join('')+
      sv('환율 기준일','회사 기준 환율을 적용한 날짜 (기록용)',`<input type="date" class="stxt" value="${esc(db.settings.fxDate||'')}" onchange="setS('fxDate',this.value,'str')">`));
  P.sev=()=>sg('판정 기준',
    sv('A등급 기준 → 8D 보고서','영향도·유출 단계·발생 범위·반복성 합계(4~16점)가 이 점수 이상이면 A입니다.',sNum('sevA','점 이상',4,16))+
    sv('B등급 기준 → 간이 대책서','이 점수 이상이고 A 기준 미만이면 B, 그 미만은 C(단순 통보)입니다.',sNum('sevB','점 이상',4,16))+
    sv('강제 A 조건','특별특성(CC/SC), 고객 클레임, 대책 후 재발, 영향도 4(안전·법규)는 점수와 관계없이 A입니다.','<span class="bg bad">고정 규칙</span>'))+
    sg('자동 산정 기준',sv('반복 판정 기간','같은 협력사·같은 유형 불량을 이 기간 안에서 셉니다.',sNum('repeatWindow','일',7,365))+
      sv('반복성 3점 기준','기간 내 이 횟수 이상이면 반복성 3점(3회 이상)입니다.',sNum('ncrRepeat','회',2,10))+
      sv('발생 범위 ‘LOT 전체’ 기준','불량 수량이 이 값 이상이거나 입고(로트)수량의 10% 이상이면 발생 범위 3점입니다.',sNum('ncrQty','개',1)))+
    sg('불량유형별 기본 영향도',S.defectTypes.map(t=>sv(esc(t),'',`<select onchange="setImpact(${jsq(t)},this.value)">${SEV_F.impact[1].map((l,i)=>`<option value="${i+1}" ${impactAuto(t)===i+1?'selected':''}>${i+1} · ${l}</option>`).join('')}</select>`)).join(''));
  P.docno=()=>{
    const row=k=>{const d=DOCNO[k],r=db.settings[d.rk]||(k==='ncr'||k==='iss'?'auto':'none');
      return sv(`${d.label} 번호`,`다음 발행 번호: <b>${esc(genDocNo(k,today()).no)}</b>`,
        `${sTxt(d.key,d.def)} <select title="일련번호 초기화" onchange="setS('${d.rk}',this.value,'str')">${DOC_RESETS.map(([v,l])=>`<option value="${v}" ${r===v?'selected':''}>${l}</option>`).join('')}</select>`)};
    return sg('형식 기호',sv('사용할 수 있는 기호',`<code>{YYYY}</code>=2026 · <code>{YYY}</code>=026 · <code>{YY}</code>=26 · <code>{MM}</code>=월 · <code>{DD}</code>=일 · <code>{SEQ3}</code>=일련번호 3자리(001), <code>{SEQ4}</code>=4자리(0001)<br>오른쪽 선택은 <b>일련번호를 1부터 다시 시작하는 기준</b>입니다. ‘형식에 따름’은 형식에 든 가장 작은 날짜 단위(일 › 월 › 연)가 바뀔 때 다시 시작합니다.<br>형식을 바꿔도 <b>이미 발행된 번호는 그대로</b>이고, 새로 만드는 문서부터 적용됩니다.`,'',1))+
      sg('문서별 번호',row('ncr')+row('rca')+row('i8d')+row('iss'));
  };
  P.tg=()=>{const c=tgCfg(),inp=(k,v,ph,t)=>`<input type="${t||'text'}" value="${esc(v)}" placeholder="${esc(ph||'')}" autocomplete="off" style="width:260px" onchange="tgSet('${k}',this.value.trim());render()">`,
    ck=(k,v)=>`<input type="checkbox" ${v?'checked':''} onchange="tgSet('${k}',this.checked);render()">`,ok=c.token&&c.chat;
    return `<div class="help" style="margin:0 4px 12px">매일 아침 <b>지연 건 · 오늘 기한 · 이슈 분류 대기</b>를 텔레그램 그룹으로 보냅니다. HTML판이라 <b>정한 시각 이후 이 PC에서 QIS를 처음 열 때(열려 있으면 그 시각에)</b> 하루 한 번 보냅니다. 같은 날 다른 창 · PC에서 다시 보내지 않습니다.<br>
      설정 순서: ① 텔레그램에서 <b>@BotFather</b> → <code>/newbot</code> → 받은 토큰을 아래에 입력 ② 받을 그룹에 봇을 초대하고 그 그룹에 아무 메시지나 한 번 보내기 ③ ‘받을 곳 찾기’ → 그룹 선택 ④ 시험 전송</div>`+
    sg('연결',sv('봇 토큰','이 PC 브라우저에만 저장 — 데이터 · 백업 · 공유본에 들어가지 않습니다 (PC를 바꾸면 다시 입력)',inp('token',c.token,'123456789:AA…','password'))+
      sv('받을 곳 (chat ID)','그룹은 -로 시작하는 숫자',`${inp('chat',c.chat,'예: -1001234567890')} <button class="b s" onclick="tgFindChats()" ${c.token?'':'disabled'}>받을 곳 찾기</button><div id="tgChats" style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"></div>`)+
      sv('시험 전송','',`<button class="b s" onclick="tgTest()" ${ok?'':'disabled'}>시험 메시지 보내기</button>`))+
    sg('아침 요약',sv('자동 전송','',`<label class="row" style="gap:6px">${ck('on',c.on)} 켜기</label>`)+
      sv('보낼 시각','이 시각 이후 처음 열 때 보냄',inp('time',c.time,'08:00','time'))+
      sv('주말 제외','토 · 일요일에는 보내지 않음',ck('noWeekend',c.noWeekend))+
      sv('세부 내용 포함','끄면 번호 · 구분 · 기한만 (조치 제목 · 이슈 제목 · 다음 행동 문구 제외) — 회사 정보 반출 규정에 맞춰 고르세요',ck('detail',c.detail))+
      sv('마지막 전송',db.meta.tgSent?`${esc(db.meta.tgSent)}`:'아직 없음',`<button class="b s" onclick="state.tgPrev=!state.tgPrev;render()">${state.tgPrev?'미리 보기 닫기':'미리 보기'}</button> <button class="b s p" onclick="tgSendSummary(true).then(()=>{},()=>{})" ${ok?'':'disabled'}>지금 요약 보내기</button>`))+
    (state.tgPrev?`<pre class="card" style="white-space:pre-wrap;font-size:13px;line-height:1.6;margin:0 4px 16px">${esc(tgSummary())}</pre>`:'')};
  P.ncr=()=>sg('기한',sv('8D 보고서 회신 기한','대책 요청일(= NCR 발행일) + 일수가 회신 기한으로 자동 설정됩니다.',sNum('reply8D','일',1,60))+
      sv('간이 대책서 회신 기한','대책 요청일 + 일수. 단순 통보는 회신 기한이 없습니다.',sNum('replySimple','일',1,60))+
      sv('D3 봉쇄 회신 기한','대책 요청일 + 일수. 협력사가 대책서보다 먼저 선별·봉쇄 결과를 회신하는 기한입니다 (1일 = 24시간).',sNum('d3Days','일',1,7))+
      sv('대책서 승인 기한','대책서 회신일 + 일수 안에 평가해 승인 또는 보완요청합니다. NCR 진행 막대에 기한으로 표시됩니다.',sNum('approveDays','일',1,30))+
      sv('유효성 검증 기한','대책 승인일(단순 통보는 통보일 · 사내 대책은 대책 완료일) + 일수 안에 대책 효과를 검증합니다. 직접 고친 기한은 그대로 둡니다.',sNum('verifyDays','일',1,180))+
      sv('검증 합격 LOT 수','유효성 검증 결과를 ‘유효’로 하려면 검증 LOT 표에 합격 LOT가 이 수 이상이고 불합격이 없어야 합니다. 0이면 확인하지 않습니다.',sNum('verifyLots','LOT',0,10)))+
    sg('RCA 목표 종결일',sv('기준 일수 (TIER별)','RCA 등록일 + 일수가 목표 종결일이 됩니다. RCA마다 기본 탭에서 직접 바꿀 수 있고, 지나면 ‘지연’으로 셉니다.',
      ['T3','T2','T1','T0'].map(t=>`<span class="muted">TIER ${t[1]}</span> ${sNum('rca'+t,'일',1,365)}`).join(' &nbsp;')))+
    sg('귀책 조사 (FAR · RCA)',sv('FAR 회신 기한','FAR 요청일 + 영업일(토·일 제외)이 회신 기한으로 자동 설정됩니다. 불량의 귀책 조사와 NCR의 FAR에 함께 적용됩니다.',sNum('farDays','영업일',1,30))+
      sv('원인 불명 종결 검토 기한','불량 등록일 + 일수가 지나도 귀책을 판정하지 못하면 대시보드에 ‘원인 불명 검토’로 표시됩니다.',sNum('ntfDays','일',7,180)));
  P.eval=()=>sg('판정 기준',
    sv('승인 기준','총점이 이 점수 이상이면 승인(대책 타당성 ‘적정’)입니다.',sNum('evalPass','점 이상',0,100))+
    sv('보완요청 기준','이 점수 이상이고 승인 기준 미만이면 보완요청, 그 미만은 반려입니다. 필수 항목이 미흡이면 점수와 관계없이 반려입니다.',sNum('evalCond','점 이상',0,100))+
    sv('에스컬레이션 기준','대책서 보완요청·반려와 유효성 검증 무효를 합친 횟수가 이 값 이상이면 대시보드와 NCR 목록에 에스컬레이션으로 표시됩니다.',sNum('escCount','회 이상',1,10)))+
    [['8D 보고서 평가표',EVAL_ITEMS],['간이 대책서 평가표',EVAL_SIMPLE]].map(([h,items])=>sg(h,items.map(it=>sv(`${it.t} ${it.must?'<span class="bg bad">필수</span>':''}`,it.c.map(esc).join(' · '),`<b>${it.w}</b><span class="muted">점</span>`)).join(''))).join('');
  P.sup=()=>sg('PPM 초과 SCAR 권고',sv('권고 기준 PPM','협력사·공동 귀책 불량 기준 월 PPM이 이 값을 넘으면 초과로 봅니다. 0이면 권고하지 않습니다.',sNum('ppmScar','PPM 초과',0))+sv('연속 개월','최근 완료된 달부터 이 개월 수만큼 연속으로 초과하면 대시보드에 NCR(8D) 발행을 권고합니다.',sNum('ppmScarMonths','개월',1,12)))+sg('PPM 등급 기준',
    sv('A등급','협력사 귀책 불량수량 ÷ 입고수량 × 1,000,000 이 값 이하',sNum('gradeA','PPM 이하',0))+
    sv('B등급','',sNum('gradeB','PPM 이하',0))+sv('C등급','이 값을 넘으면 D등급입니다.',sNum('gradeC','PPM 이하',0)));
  function dirSt(k){const h=k==='photoDir'?photoDir:backupDir,lz=lazyH[k];return h?`<span class="bg ok">사용 중</span> <b>${esc(h.name)}</b>`:lz?`<span class="bg warn">허용 대기</span> <b>${esc(lz.name)}</b> <span class="muted">— ${k==='photoDir'?'사진을 저장할 때':'백업할 때'} 허용 창이 뜹니다</span>`:'<span class="bg mut">지정 안 됨</span>'}
  function dirBtns(k,extra){const on=!!((k==='photoDir'?photoDir:backupDir)||lazyH[k]);return `<span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${on?extra:''}<button class="b s ${on?'':'p'}" onclick="pickDir('${k}')">${on?'다른 폴더':'폴더 지정'}</button>${on?`<button class="b s" onclick="unlinkDir('${k}')">해제</button>`:''}</span>`}
  setTimeout(()=>{const e=$('#persistSt');if(!e)return;if(!(navigator.storage&&navigator.storage.persisted)){e.textContent='브라우저가 지원하지 않음';return}navigator.storage.persisted().then(v=>{e.innerHTML=v?'<span class="bg ok">삭제 방지 적용</span>':'<span class="bg warn">미적용</span> <span class="muted">— 백업을 더 자주 받으세요</span>'}).catch(()=>{e.textContent='-'})},0);
  // 데이터 · 백업: 평소에 쓰는 것(저장 폴더 · 백업 · 복원 · 공유)만 보이고, 나머지는 ‘고급 설정’에 접어 둠
  const tip=(t,x)=>`<span title="${esc(x)}" style="cursor:help">${t} <span class="muted" style="font-size:11px">ⓘ</span></span>`;
  const chip=(on,wait,l)=>`<span class="bg ${on?'ok':wait?'warn':'mut'}">${on?'✓':wait?'허용 대기':'—'} ${l}</span>`;
  const anyDir=!!(rootDir||lazyH.rootDir||photoDir||backupDir||lazyH.photoDir||lazyH.backupDir),rootH=rootDir||lazyH.rootDir;
  const folderTxt=rootH?`<b>${esc(rootH.name)}</b>${rootDir?'':' <span class="bg warn">허용 대기 — 사진 저장 · 백업할 때 허용 창이 한 번 뜹니다</span>'}`:anyDir?`<span class="muted">폴더를 따로 지정해 쓰는 중</span>`:'<span class="bg warn">지정 안 됨</span> <span class="muted">— 지정하지 않으면 자동 백업이 쌓이지 않습니다</span>';
  const times=[latestBkAt&&`최신 백업 ${loc(latestBkAt).slice(11)}`,db.meta.lastBackup&&`날짜별 백업 ${loc(db.meta.lastBackup).slice(5,10)}`,db.meta.lastSqlite&&`QIS.sqlite ${loc(db.meta.lastSqlite).slice(5,16)}`].filter(Boolean).join(' · ');
  const advOpen=!!state.setAdv;
  P.backup=()=>sg('저장 폴더',
      sv(tip('QIS 폴더','폴더 하나만 고르면 그 안에 ‘사진·첨부’와 ‘백업’ 폴더를 만들어 각각 저장합니다. 고친 뒤 1분 안에 최신 백업, 하루 한 번 날짜별 백업(사진 포함), QIS.sqlite가 ‘백업’에 쌓입니다. OneDrive 동기화 폴더나 회사 네트워크 드라이브 안에 두면 노트북이 고장 나도 남습니다.'),
        `${folderTxt}<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${chip(!!photoDir,!!lazyH.photoDir&&!photoDir,'사진·첨부')}${chip(!!backupDir,!!lazyH.backupDir&&!backupDir,'백업')}</div>${times?`<div class="muted" style="font-size:12px;margin-top:6px">${times}</div>`:''}${!anyDir?'<div class="muted" style="font-size:12px;margin-top:4px">권장: OneDrive 안에 <b>QIS</b> 폴더를 만들어 지정</div>':''}`,
        `<span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="b s ${rootH?'':'p'}" onclick="pickRoot()">${rootH?'변경':'폴더 지정'}</button>${rootH?'<button class="b s" onclick="unlinkRoot()">해제</button>':''}</span>`))+
    sg('백업 · 복원',
      sv(tip('백업','화면 위 ‘백업’ 버튼과 같습니다. 폴더가 있으면 폴더에, 없으면 다운로드로 받습니다.'),`마지막 백업 <b>${db.meta.lastBackup?loc(db.meta.lastBackup):'없음'}</b>${backupDue()?' <span class="bg warn">백업 필요</span>':''}`,
        `<span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${btn('지금 백업','exportJSON(true)','p')}${btn('백업 폴더에서 복원','restoreFromFolder()')}</span>`))+
    sg('공유 · 내보내기',
      sv(tip('읽기 전용 공유','지금 데이터를 HTML 파일 하나로 만듭니다. 받은 사람은 보기 · 검색 · 출력만 되고 수정 · 저장은 안 됩니다. 파일 안에 데이터가 그대로 들어 있으니 받을 사람을 가려서 보내세요.'),'',
        `<span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center"><label class="row" style="gap:5px;font-size:12.5px" title="협력사 연락처 · 주소 · 단가 · BOM · 기록에 안 쓰인 협력사 · 부품을 빼고, 기록에 쓰인 협력사 · 부품 이름만 남깁니다. 기준정보 탭도 숨깁니다."><input type="checkbox" ${num(db.settings.shareNoMaster)!==0?'checked':''} onchange="db.settings.shareNoMaster=this.checked?1:0;save()"> 기준정보 빼기</label>${btn('사진 포함','makeShareFile(true)')}${btn('사진 제외','makeShareFile(false)')}</span>`)+
      sv(tip('엑셀 통합 파일 (모든 표)','모든 데이터를 엑셀 파일 하나에 시트별로 담습니다 — 불량 · 비용 · NCR · 협력사 · 부품 · 입고 · BOM · RCA · 협력사별 월 PPM 등. 열 이름은 저장 항목 이름 그대로이고 x_ 로 시작하는 열은 앱이 계산한 값입니다. 피벗 · VLOOKUP 등 엑셀 분석용. 각 화면의 ‘엑셀 내보내기’는 그 화면 표(한글 머리글)만 담습니다.'),'',
        `<button class="b s" onclick="exportAllXlsx(this)">만들기 (다운로드)</button>`)+
      sv(tip('SQL로 조회 (QIS.sqlite)','SQLite DB 파일로 만듭니다 — DB Browser for SQLite로 열거나 Excel · Power BI에서 SQLite ODBC로 연결합니다. 표: suppliers · parts · defects · defect_costs · ncrs · receipts · bom_rows · supplier_month(월 PPM) 등, 조회: v_defects · v_ncr_open · v_monthly, x_ 열은 앱이 계산한 값. 읽기용 사본입니다.'),'',
        btn(backupDir||lazyH.backupDir?'만들기 (폴더에 저장)':'만들기 (다운로드)','exportSqlite()')))+
    `<details class="sadv" ${advOpen?'open':''} ontoggle="if(state.setAdv!==this.open){state.setAdv=this.open;if(this.open){const y=window.scrollY;render();window.scrollTo(0,y)}}"><summary>고급 설정</summary>`+
    sg('폴더 따로 지정',
      sv('사진 · 첨부 폴더',dirSt('photoDir'),dirBtns('photoDir',`<button class="b s" onclick="photoDirNow()">지금 저장</button>`))+
      sv('백업 폴더',dirSt('backupDir'),dirBtns('backupDir',''))+
      sv('허용 창','<span class="muted">앱을 다시 열면 폴더 쓰기 허용이 풀릴 수 있어, 사진 저장 · 백업할 때만 허용 창이 뜹니다. ‘방문할 때마다 허용’을 고르면 다음부터 묻지 않습니다.</span>',''))+
    sg('자동 백업',
      ((backupDir||lazyH.backupDir)?sv('보관 개수','폴더에 남길 날짜별 백업 수 (0 = 모두)',sNum('backupKeep','개',0,365)):'')+
      sv('백업 알림','마지막 백업 후 이 일수가 지나면 화면 위 버튼이 ‘백업 필요’',sNum('backupDays','일마다',1,60))+
      sv('QIS.sqlite 자동','자동 백업 때 같은 폴더에 덮어씀',`<label class="row" style="gap:6px"><input type="checkbox" ${num(db.settings.sqliteAuto)?'checked':''} onchange="db.settings.sqliteAuto=this.checked?1:0;save()"> 함께 만들기</label>`))+
    sg('백업 파일로',
      sv('백업으로 교체','파일 하나를 골라 현재 데이터를 모두 교체',btn('파일 선택','pickImport(\'replace\')','d'))+
      sv('백업 합치기','현재 데이터는 두고 백업에만 있는 기록을 더함 (같은 기록은 최근 것)',btn('파일 선택','pickImport(\'merge\')')))+
    sg('저장 공간',
      sv('원본 데이터',dataStore==='idb'?'이 PC 브라우저의 대용량 저장소 — 입력하면 바로 저장':'이 PC 브라우저의 기본 저장소 (약 5MB)',`<span class="muted">협력사 ${cnt[0]} · 부품 ${cnt[1]} · 불량 ${cnt[2]} · NCR ${cnt[3]} · 사진 ${nPh} · 기록 ${(n=>n<1048576?Math.max(1,Math.round(n/1024))+'KB':(n/1048576).toFixed(1)+'MB')(JSON.stringify(db).length)}</span>`)+
      sv('삭제 방지','‘인터넷 사용 기록 삭제’에서 사이트 데이터를 지우면 사라질 수 있습니다 — 백업 폴더가 대비책','<span id="persistSt" class="muted">확인 중…</span>')+
      sv('브라우저 사용량','사진 포함','<span id="usage" class="muted">계산 중…</span>'))+
    sg('초기화',sv('전체 초기화','모든 데이터와 사진을 영구 삭제 — 먼저 백업하세요',btn('초기화','resetAll()','dz')))+
    `</details>`;
  if(SRV)P.backup=srvPanel;
  if(SRV)P.tg=()=>`<div class="help" style="margin:0 4px">서버판에서는 <b>서버가</b> 매일 정한 시각에 텔레그램 요약을 보냅니다 — 아무도 접속하지 않아도 보내고, 사용자가 여럿이어도 한 번만 갑니다. 설정은 <b>관리 › 알림 (텔레그램)</b>에서 (관리자).</div>`;
  if(tab==='backup'&&state.setAdv&&!SRV)setTimeout(showUsage,0);
  return `<div class="set"><aside class="snav">${nav}</aside><section class="spane"><div class="row" style="margin-bottom:6px"><h2>${title}</h2><span style="flex:1"></span><span id="setSaved" class="muted" style="opacity:0;transition:opacity .4s;font-size:12px"></span></div>${(P[tab]||P.general)()}<div class="help" style="margin:-8px 4px 20px">설정은 값을 바꾸면 바로 저장됩니다.</div></section></div>`;
}
// 읽기 전용 공유 파일: 이 앱 + 지금 데이터(사진 포함)를 HTML 파일 하나로
// 공유본에서 기준정보 빼기: 기록(불량 · NCR · 입고)에 쓰인 협력사 · 부품의 이름만 남기고
// 연락처 · 주소 · 담당자 이력 · 단가 · 주요 품목 · BOM · 기록에 안 쓰인 협력사 · 부품은 넣지 않음
function shareStrip(src){
  const d=JSON.parse(JSON.stringify(src));
  const recs=[...d.defects,...d.ncrs,...d.receipts,...(d.cases||[])];
  const supIds=new Set(recs.map(r=>r.supplierId||r.SupplierId).filter(Boolean));
  const pIds=new Set(recs.map(r=>r.partId||r.PartId).filter(Boolean)),pNos=new Set(recs.map(r=>r.partNo).filter(Boolean).map(mkey));
  d.parts=d.parts.filter(p=>pIds.has(p.id)||pNos.has(mkey(p.partNo))).map(p=>({id:p.id,partNo:p.partNo,name:p.name,model:p.model,supplierId:p.supplierId,safety:p.safety}));
  d.parts.forEach(p=>{if(p.supplierId)supIds.add(p.supplierId)});
  d.suppliers=d.suppliers.filter(x=>supIds.has(x.id)).map(x=>({id:x.id,code:x.code,name:x.name,short:x.short,country:x.country,region:x.region,contacts:[],contactLog:[]}));
  d.bom={updatedAt:'',fg:{},rows:[]};
  return d;
}
async function makeShareFile(withPhotos){
  if(!APP_SRC||!APP_SRC.includes('<head>')){toast('이 화면에서는 공유 파일을 만들 수 없습니다');return}
  let photos=[];if(withPhotos){try{photos=(await photoList()).filter(p=>p&&!phIsPending(p))}catch(e){toast('사진을 읽지 못해 사진 없이 만듭니다')}}
  const S=db.settings,noMaster=num(S.shareNoMaster)!==0,meta={created:now(),by:(S.owners||[])[0]||'',company:S.company||'',ver:typeof APP_VER!=='undefined'?APP_VER:'',photos:photos.length,noMaster};
  const data=JSON.stringify({meta,db:noMaster?shareStrip(db):db,photos}).replace(/</g,'\\u003c');
  const html=APP_SRC.replace('<head>','<head>\n<script id="qmsShare" type="application/json">'+data+'<\/script>');
  download(`QIS_읽기전용_${today()}${withPhotos?'':'_사진제외'}.html`,html,'text/html;charset=utf-8');
  toast(`읽기 전용 공유 파일 ${(html.length/1048576).toFixed(1)}MB를 만들었습니다${noMaster?' (기준정보 제외)':''} — 메일 · Teams · 공유 폴더로 보내세요`);
}
async function exportJSON(withPhotos=true){
  if(withPhotos===true&&(backupDir||lazyH.backupDir)){
    if(await ensureDir('backupDir')){const t=new Date();await autoBackup(true,`${pad(t.getHours())}${pad(t.getMinutes())}`);return}
    toast('백업 폴더 사용이 허용되지 않아 다운로드로 받습니다');
  }
  db.meta.lastBackup=now();save();
  const txt=await fullJSON(withPhotos);
  download(`QMS_백업_${today()}${withPhotos?'':'_사진제외'}.json`,txt);
  toast(`백업 파일 ${(txt.length/1048576).toFixed(1)}MB 다운로드`);
  if(state.tab==='dash'||state.tab==='data')render();
}
async function applyPhotos(photos,replace){
  if(!Array.isArray(photos))return 0;
  photos=photos.filter(p=>p&&p.id);
  // 사진 정보만 온 경우: 이 PC에 이미 있는 사진은 그대로 쓰고, 없으면 자리표시로 두었다가 사진 폴더에서 불러온다
  const have={},metaIds=photos.filter(phIsPending).map(p=>p.id);
  if(metaIds.length){try{(await photoGetMany(metaIds)).forEach(r=>{if(!phIsPending(r))have[r.id]=r})}catch(e){}}
  photos=photos.map(p=>{
    if(!phIsPending(p))return isDocRec(p)?{...p,thumb:''}:{...p,thumb:isImgURL(p.thumb)?p.thumb:p.data};
    const h=have[p.id];
    return h?{...p,data:h.data,thumb:h.thumb}:{...p,data:PH_IMG,thumb:PH_IMG,pending:true};
  });
  if(replace)await photoClear();
  if(photos.length)await photoPut(photos);
  phPendAdd(photos.filter(p=>p.pending).map(p=>p.id));
  photoStr=null;
  if(photoDir)setTimeout(()=>syncPhotoFiles(true),0);
  return photos.length;
}
let importMode='replace';
function pickImport(mode){importMode=mode;const f=$('#fileIn');f.value='';f.click()}
$('#fileIn').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{const inc=JSON.parse(await file.text());if(!inc||!inc.settings||!Array.isArray(inc.defects))throw new Error('QMS 백업 형식이 아닙니다');
    if(importMode==='replace'){if(!await askConfirm({title:'백업으로 교체할까요?',msg:`현재 데이터를 ${qi(file.name)} 내용으로 <b>모두 교체</b>합니다. 현재 데이터는 사라집니다.`,items:[`현재: 불량 ${db.defects.length}건 · NCR ${db.ncrs.length}건`,`백업: 불량 ${inc.defects.length}건 · NCR ${(inc.ncrs||[]).length}건${Array.isArray(inc.photos)?` · 사진 ${inc.photos.length}장`:''}`],note:'교체 전 현재 데이터 백업을 권장합니다.',ok:'교체'}))return;
      await restoreReplace(inc)}
    else await mergeIn(inc,file.name);
  }catch(err){toast('가져오기 실패: '+err.message)}
});
// 같은 기록을 양쪽에서 고친 경우: 최신 기록을 기준으로 하되 진행기록·비용·평가·연락처 같은 목록은 항목(id)별로 합침
const MERGE_ARR=['logs','costs','evals','contacts','contactLog','Analyses'];
const itemTime=x=>String(x&&(x.updatedAt||x.edited||x.at||x.ts||x.date)||'');
function mergeRec(base,oth){
  const rec={...base};let changed=false;
  MERGE_ARR.forEach(k=>{const A=Array.isArray(base[k])?base[k]:null,B=Array.isArray(oth[k])?oth[k]:null;if(!B||!B.length)return;
    const out=(A||[]).map(x=>{if(!x||!x.id)return x;const y=B.find(z=>z&&z.id===x.id);return y&&itemTime(y)>itemTime(x)?(changed=true,y):x});
    B.forEach(y=>{if(y&&y.id&&!out.some(x=>x&&x.id===y.id)){out.push(y);changed=true}});
    rec[k]=out});
  if(!rec.claim&&oth.claim){rec.claim=oth.claim;changed=true}
  if(Array.isArray(oth.photos)&&oth.photos.some(i=>!(rec.photos||[]).includes(i))){rec.photos=[...new Set([...(rec.photos||[]),...oth.photos])];changed=true}
  return {rec,changed};
}
function relinkNcr(){
  const nById=new Map(db.ncrs.map(n=>[n.id,n])),dById=new Map(db.defects.map(d=>[d.id,d]));
  db.defects.forEach(d=>{if(d.ncrId&&!nById.has(d.ncrId))d.ncrId=''});
  db.ncrs.forEach(n=>{n.defectIds=(n.defectIds||[]).filter(i=>{const d=dById.get(i);if(!d)return false;if(!d.ncrId){d.ncrId=n.id;return true}return d.ncrId===n.id})});
  db.defects.forEach(d=>{if(d.ncrId){const n=nById.get(d.ncrId);if(n&&!n.defectIds.includes(d.id))n.defectIds.push(d.id)}});
}
async function mergeIn(inc,name){
  const photos=inc.photos;delete inc.photos;
  inc=migrate(inc);
  const tomb=new Map();[...db.deleted,...inc.deleted].forEach(t=>{if(!tomb.has(t.id)||tomb.get(t.id)<t.at)tomb.set(t.id,t.at)});
  let a=0,u=0,del=0;
  // 같은 대상(이름·부품번호·월)이 다른 id로 만들어진 경우 로컬 id로 맞춤
  const norm=x=>String(x||'').replace(/\s+/g,'').replace(/\(주\)|㈜|주식회사/g,'').toLowerCase();
  const supRemap={};
  inc.suppliers.forEach(r=>{if(db.suppliers.some(x=>x.id===r.id))return;const m=db.suppliers.find(x=>norm(x.name)&&norm(x.name)===norm(r.name));if(m){supRemap[r.id]=m.id;r.id=m.id}});
  if(Object.keys(supRemap).length)['defects','ncrs','parts','receipts'].forEach(c=>inc[c].forEach(r=>{if(supRemap[r.supplierId])r.supplierId=supRemap[r.supplierId]}));
  inc.parts.forEach(r=>{if(db.parts.some(x=>x.id===r.id))return;const m=db.parts.find(x=>x.partNo&&x.partNo===r.partNo);if(m)r.id=m.id});
  inc.receipts.forEach(r=>{if(db.receipts.some(x=>x.id===r.id))return;const m=isLine(r)?db.receipts.find(x=>isLine(x)&&rcvKey(x)===rcvKey(r)):db.receipts.find(x=>!isLine(x)&&x.supplierId===r.supplierId&&x.month===r.month);if(m)r.id=m.id});
  inc.reviews.forEach(r=>{if(db.reviews.some(x=>x.id===r.id))return;const m=db.reviews.find(x=>x.month===r.month);if(m)r.id=m.id});
  COLLS.forEach(c=>{
    const map=new Map(db[c].map(r=>[r.id,r]));
    inc[c].forEach(r=>{const cur=map.get(r.id);if(!cur){map.set(r.id,r);a++;return}
      const rn=(r.updatedAt||'')>(cur.updatedAt||''),base=rn?r:cur,oth=rn?cur:r,m=mergeRec(base,oth);
      if(rn||m.changed){map.set(r.id,m.rec);u++}});
    const before=map.size;
    db[c]=[...map.values()].filter(r=>!(tomb.has(r.id)&&tomb.get(r.id)>=(r.updatedAt||'')));
    del+=before-db[c].length;
  });
  db.deleted=[...tomb].map(([id,at])=>({id,at}));
  if(inc.bom&&(inc.bom.updatedAt||'')>(db.bom.updatedAt||''))db.bom=inc.bom;  // BOM은 통째로: 더 최근 업로드가 이김
  relinkNcr();
  db.defects.forEach(d=>{if(Array.isArray(d.photos))d.photos=d.photos.filter(i=>!tomb.has(i))});
  let pn=0;
  try{
    if(Array.isArray(photos))pn=await applyPhotos(photos.filter(p=>!tomb.has(p.id)),false);
    const keep=new Set(db.defects.flatMap(d=>d.photos||[]));
    const dead=[...tomb.keys()].filter(i=>!keep.has(i));
    if(dead.length){await photoDel(dead);photoStr=null}
  }catch(e){toast('사진 병합 실패: '+e.message)}
  save();render();toast(`${name} 병합: 추가 ${a} · 갱신 ${u} · 삭제반영 ${del} · 사진 ${pn}장`);
}
// 폴더 쓰기 허용이 풀리면: 사진 · 백업 폴더는 다음 클릭(저장 · 백업) 때 다시 허용을 받는다
function permLost(k,h){lazyH[k]=h;if(k==='photoDir')photoDir=null;else backupDir=null;updateSaveInfo()}
/* ---- 이 PC 저장 폴더: 사진·첨부 폴더 · 백업 폴더 ----
   브라우저는 페이지를 다시 열면 폴더 쓰기 허용을 초기화하므로, 열 때는 묻지 않고
   새 사진을 저장하거나 백업할 때(클릭 순간)에만 허용 창을 띄운다. */
let lazyH={},lazyNo={};
const PH_DIRTY='personalQMS_phDirty';
const phDirty=()=>{try{return localStorage.getItem(PH_DIRTY)==='1'}catch(e){return false}};
const phDirtySet=v=>{try{v?localStorage.setItem(PH_DIRTY,'1'):localStorage.removeItem(PH_DIRTY)}catch(e){}};
const phNeedWrite=()=>phDirty()||phDelQ().size>0;
const DIR_L={photoDir:'사진 · 첨부 폴더',backupDir:'백업 폴더'};
function dirAttach(k,h,quiet){
  delete lazyH[k];delete lazyNo[k];
  if(k==='photoDir'){photoDir=h;phFiles=null;setTimeout(async()=>{const r=await syncPhotoFiles(true);if(r&&!quiet&&(r.wrote||r.renamed))toast(`‘${h.name}’ 폴더에 사진 · 첨부 ${r.wrote+r.renamed}개 저장`)},0)}
  else{backupDir=h;setTimeout(()=>autoBackup(false),1500)}
  updateSaveInfo();
}
// 기본 저장 폴더: 하나만 고르면 그 안에 ‘사진·첨부’ · ‘백업’ 폴더를 만들어 각각 씀 (허용도 이 폴더 한 번)
const ROOT_SUB={photoDir:'사진·첨부',backupDir:'백업'};let rootDir=null;
async function pickRoot(){
  if(!window.showDirectoryPicker){toast('이 브라우저는 폴더 지정을 지원하지 않습니다 — Edge 또는 Chrome에서 여세요');return}
  let h;try{h=await window.showDirectoryPicker({id:'qms-root',mode:'readwrite'})}catch(e){if(e.name!=='AbortError')toast('폴더 지정 실패: '+e.message);return}
  try{await attachRoot(h,false)}catch(e){toast('폴더 만들기 실패: '+e.message);return}
  toast(`기본 저장 폴더 ‘${h.name}’ — 사진 · 첨부는 ‘${ROOT_SUB.photoDir}’, 백업은 ‘${ROOT_SUB.backupDir}’ 폴더에 저장합니다`);render();
}
async function attachRoot(h,quiet){
  const ph=await h.getDirectoryHandle(ROOT_SUB.photoDir,{create:true}),bk=await h.getDirectoryHandle(ROOT_SUB.backupDir,{create:true});
  rootDir=h;delete lazyH.rootDir;
  try{await hPut('rootDir',h);await hPut('photoDir',ph);await hPut('backupDir',bk)}catch(e){}
  if(!quiet)phDirtySet(true);
  dirAttach('photoDir',ph,quiet);dirAttach('backupDir',bk,quiet);if(!quiet)setTimeout(()=>autoBackup(true),300);
}
async function unlinkRoot(){
  if(!await askConfirm({title:'기본 저장 폴더 지정을 해제할까요?',msg:'사진 · 첨부 폴더와 백업 폴더 지정도 함께 해제합니다. 폴더에 이미 저장된 파일은 지워지지 않고, 앱 안의 데이터 · 사진도 그대로입니다.',ok:'해제',danger:false}))return;
  rootDir=null;photoDir=null;backupDir=null;['rootDir','photoDir','backupDir'].forEach(k=>{delete lazyH[k];delete lazyNo[k]});
  for(const k of ['rootDir','photoDir','backupDir'])try{await hDel(k)}catch(e){}
  updateSaveInfo();render();
}
async function ensureDir(k){
  const cur=k==='photoDir'?photoDir:backupDir;if(cur)return true;
  // 기본 폴더로 지정한 경우: 기본 폴더에 한 번 허용 → 사진 · 백업 폴더 둘 다 사용
  if(lazyH.rootDir&&!lazyNo.rootDir){try{if(await permOK(lazyH.rootDir,true)){await attachRoot(lazyH.rootDir,true);return !!(k==='photoDir'?photoDir:backupDir)}lazyNo.rootDir=true}catch(e){}}
  const h=lazyH[k];if(!h)return false;
  try{if(await permOK(h,true)){dirAttach(k,h,true);return true}lazyNo[k]=true}catch(e){}
  updateSaveInfo();return false;
}
async function pickDir(k){
  if(!window.showDirectoryPicker){toast('이 브라우저는 폴더 지정을 지원하지 않습니다 — Edge 또는 Chrome에서 여세요');return}
  let h;try{h=await window.showDirectoryPicker({id:'qms-'+k,mode:'readwrite'})}catch(e){if(e.name!=='AbortError')toast('폴더 지정 실패: '+e.message);return}
  try{await hPut(k,h)}catch(e){}
  if(rootDir||lazyH.rootDir){rootDir=null;delete lazyH.rootDir;try{await hDel('rootDir')}catch(e){}}  // 따로 고르면 기본 폴더 묶음은 풂
  if(k==='photoDir')phDirtySet(true);
  dirAttach(k,h,false);if(k==='backupDir')setTimeout(()=>autoBackup(true),300);
  toast(`${DIR_L[k]}: ‘${h.name}’ 지정`);render();
}
async function unlinkDir(k){
  if(!await askConfirm({title:`${DIR_L[k]} 지정을 해제할까요?`,msg:'폴더에 이미 저장된 파일은 지워지지 않습니다. 앱 안의 데이터 · 사진도 그대로입니다.',ok:'해제',danger:false}))return;
  if(k==='photoDir')photoDir=null;else backupDir=null;delete lazyH[k];delete lazyNo[k];
  if(rootDir||lazyH.rootDir){rootDir=null;delete lazyH.rootDir;try{await hDel('rootDir')}catch(e){}}
  try{await hDel(k)}catch(e){}updateSaveInfo();render();
}
async function photoDirNow(){if(!await ensureDir('photoDir'))return;phFiles=null;const r=await syncPhotoFiles(true);if(r)toast(r.wrote||r.renamed||r.removed?`사진 · 첨부 파일 저장 ${r.wrote} · 이름 변경 ${r.renamed} · 삭제 ${r.removed}`:'사진 · 첨부 폴더가 최신 상태입니다')}
// 사진을 새로 넣은 뒤 첫 클릭 때 사진 폴더 허용을 묻는다 (한 번 거절하면 이번 실행 동안은 다시 묻지 않음)
document.addEventListener('click',()=>{if(lazyH.photoDir&&!lazyNo.photoDir&&!photoDir&&phNeedWrite())ensureDir('photoDir')},true);
async function permOK(h,ask){
  if(!h||!h.queryPermission)return !!h;
  let p=await h.queryPermission({mode:'readwrite'});if(p==='granted')return true;
  if(ask){p=await h.requestPermission({mode:'readwrite'});return p==='granted'}
  return false;
}
function renderRecon(){const b=$('#recon');if(b)b.style.display='none'}
const BK_RE=/^QMS_(자동)?백업_\d{4}-\d{2}-\d{2}(_[0-9A-Za-z가-힣]+)?\.json$/;
const recCount=o=>COLLS.reduce((a,c)=>a+(Array.isArray(o&&o[c])?o[c].length:0),0);
const LATEST_BK='QIS_최신백업.json';  // 고칠 때마다(1분 안에) 덮어쓰는 최신 백업 — 데이터만 (사진은 날짜별 백업 · 사진 폴더)
let latestBkAt='';
async function restoreReplace(inc){
  const ph=inc.photos;delete inc.photos;db=migrate(inc);loadFailed=null;renderAlert();const n=await applyPhotos(ph,true);save();render();
  toast(`복원 완료${ph?` (사진 ${n}장)`:' (사진 없는 백업 — 기존 사진 유지)'}`);return n;
}
// 변경 후 1분 안에 최신 백업 (백업 폴더가 있고 허용된 경우만, 조용히)
function scheduleLatestBackup(){if(RO||!backupDir||loadFailed)return;clearTimeout(scheduleLatestBackup._t);scheduleLatestBackup._t=setTimeout(latestBackup,60000)}
async function latestBackup(){
  clearTimeout(scheduleLatestBackup._t);scheduleLatestBackup._t=null;
  if(!backupDir||latestBackup._busy)return;latestBackup._busy=true;
  try{if(!COLLS.some(c=>(db[c]||[]).length))return;  // 비어 있는 데이터로 최신 백업을 덮어쓰지 않음 (초기화 · 데이터 삭제 사고 대비)
    if(!await permOK(backupDir,false))return;
    const fh=await backupDir.getFileHandle(LATEST_BK,{create:true}),w=await fh.createWritable();await w.write(await fullJSON(false));await w.close();latestBkAt=now();
    if(num(db.settings.sqliteAuto))exportSqlite(true);
    updateSaveInfo();if(state.tab==='data'&&state.setTab==='backup'){const e=$('#latestBk');if(e)e.textContent=loc(latestBkAt)}
  }catch(e){console.warn('최신 백업 실패',e)}finally{latestBackup._busy=false}
}
// 창을 숨기거나 닫을 때 기다리던 최신 백업을 바로 저장
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&scheduleLatestBackup._t)latestBackup()});
// 백업 폴더에서 가장 최근 백업을 찾아 교체 — 브라우저 데이터가 지워졌을 때 한 번에 되살리기
async function restoreFromFolder(){
  let dir=backupDir;
  if(!dir&&lazyH.backupDir&&await ensureDir('backupDir'))dir=backupDir;
  if(!dir){if(!window.showDirectoryPicker){toast('이 브라우저는 폴더 열기를 지원하지 않습니다 — ‘백업으로 교체’에서 파일을 직접 고르세요');return}
    try{dir=await window.showDirectoryPicker({id:'qms-backupDir',mode:'readwrite'})}catch(e){if(e.name!=='AbortError')toast('폴더 열기 실패: '+e.message);return}}
  const scan=async d=>{const L=[];for await(const [n,h] of d.entries()){if(h.kind==='file'&&(BK_RE.test(n)||n===LATEST_BK)){const f=await h.getFile();L.push({n,f,t:f.lastModified})}}return L};
  let L=await scan(dir),pickedRoot=null;
  // 기본 저장 폴더(QIS)를 고른 경우: 그 안의 ‘백업’ 폴더에서 찾음
  if(!L.length){try{const sub=await dir.getDirectoryHandle(ROOT_SUB.backupDir);const L2=await scan(sub);if(L2.length){pickedRoot=dir;dir=sub;L=L2}}catch(e){}}
  if(!L.length){toast(`‘${dir.name}’ 폴더에 QIS 백업 파일이 없습니다`);return}
  L.sort((a,b)=>b.t-a.t);const top=L[0];let inc;
  try{inc=JSON.parse(await top.f.text());if(!inc||!inc.settings||!Array.isArray(inc.defects))throw new Error('백업 형식이 아닙니다')}catch(e){toast(`${top.n} 읽기 실패: ${e.message}`);return}
  const cnt=COLLS.reduce((a,c)=>a+(db[c]||[]).length,0);
  if(!await askConfirm({title:'백업 폴더에서 복원할까요?',msg:`‘${esc(dir.name)}’ 폴더에서 <b>가장 최근 백업</b>을 찾았습니다. 현재 데이터를 이 내용으로 <b>모두 교체</b>합니다.`,
    items:[`백업: ${top.n} — ${loc(new Date(top.t).toISOString())}`,`백업 내용: 불량 ${inc.defects.length}건 · NCR ${(inc.ncrs||[]).length}건 · 협력사 ${(inc.suppliers||[]).length} · 부품 ${(inc.parts||[]).length}`,`현재: ${cnt?`불량 ${db.defects.length}건 · NCR ${db.ncrs.length}건`:'비어 있음'}`],ok:'복원',danger:!!cnt}))return;
  if(cnt&&backupDir){try{await autoBackup(true,'복원전')}catch(e){}}
  await restoreReplace(inc);
  // 데이터만 든 최신 백업이면, 없는 사진은 사진이 든 날짜별 백업에서 채움
  if(!inc.photos){const full=L.filter(x=>BK_RE.test(x.n)&&!/사진제외/.test(x.n));let added=0;
    for(const x of full){try{const need=new Set([...(db.issues||[]).flatMap(i=>i.photos||[]),...db.defects.flatMap(d=>[...(d.photos||[]),...logPhotoIds(d.logs)]),...db.ncrs.flatMap(n=>[...ncrDocIds(n),...logPhotoIds(n.logs)])]);if(!need.size)break;const have=new Set((await photoGetMany([...need])).filter(r=>!phIsPending(r)).map(r=>r.id));
      const miss=[...need].filter(i=>!have.has(i));if(!miss.length)break;const j=JSON.parse(await x.f.text());const ph=(j.photos||[]).filter(p=>p&&miss.includes(p.id));
      if(ph.length){added+=await applyPhotos(ph,false)}}catch(e){console.warn(e)}}
    if(added)toast(`복원 완료 — 사진 ${added}장은 ${full[0]?.n||'날짜별 백업'} 등에서 채웠습니다`)}
  if(pickedRoot&&!rootDir){try{await attachRoot(pickedRoot,true)}catch(e){}}
  else if(!backupDir&&dir){try{await hPut('backupDir',dir)}catch(e){}dirAttach('backupDir',dir,true);updateSaveInfo()}
  render();
}
async function autoBackup(force,tag){
  if(!backupDir||autoBackup._busy||loadFailed)return;
  if(!force&&db.meta.lastAutoBackup===today())return;
  autoBackup._busy=true;
  try{
    if(!await permOK(backupDir,false)){permLost('backupDir',backupDir);return}
    let name=`QMS_백업_${today()}${tag?'_'+tag:''}.json`;
    if(!tag){try{const ex=await (await (await backupDir.getFileHandle(name)).getFile()).text();const t=new Date();
      if(recCount(JSON.parse(ex))>recCount(db))name=`QMS_자동백업_${today()}_${pad(t.getHours())}${pad(t.getMinutes())}.json`}catch(e){}}
    const fh=await backupDir.getFileHandle(name,{create:true}),w=await fh.createWritable();
    await w.write(await fullJSON(true));await w.close();
    const keep=num(db.settings.backupKeep);let removed=0;
    if(keep>0){const names=[];for await(const [n,h] of backupDir.entries()){if(h.kind==='file'&&BK_RE.test(n))names.push(n)}
      names.sort().reverse();for(const n of names.slice(keep)){try{await backupDir.removeEntry(n);removed++}catch(e){}}}
    db.meta.lastAutoBackup=today();db.meta.lastBackup=now();db.meta.lastAutoBackupAt=now();
    if(dataStore==='idb')persist();else try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}
    if(num(db.settings.sqliteAuto))setTimeout(()=>exportSqlite(true),200);  // SQL 조회용 사본도 함께 (QIS.sqlite 덮어씀)
    if(force)toast(`‘${backupDir.name}’ 폴더에 ${name} 저장${removed?` · 오래된 백업 ${removed}개 정리`:''}`);
    if(state.tab==='data'||state.tab==='dash')render();
  }catch(e){toast('자동 백업 실패: '+e.message)}
  finally{autoBackup._busy=false}
}
async function resetAll(){
  if(!await askConfirm({title:'모든 데이터를 초기화할까요?',msg:'아래 데이터가 <b>모두 영구 삭제</b>되며 되돌릴 수 없습니다. 먼저 백업 다운로드를 권장합니다.',
    items:[`협력사 ${db.suppliers.length} · 부품 ${db.parts.length}`,`불량 ${db.defects.length}건 · NCR ${db.ncrs.length}건 · 입고 ${db.receipts.length}건`,`사진 ${db.defects.reduce((a,d)=>a+(d.photos||[]).length,0)}장`],typeWord:'초기화',ok:'전체 삭제'}))return;
  if(backupDir){try{await autoBackup(true,'초기화전')}catch(e){}}
  db=defaultDB();photoClear().catch(()=>{});photoStr=null;phPendSet(new Set());save();render();toast('초기화되었습니다');
}


