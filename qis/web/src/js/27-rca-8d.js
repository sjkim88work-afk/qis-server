/* ================= RCA · 사내 8D (PHA QMS 통합) =================
   Case · Action · 단계 게이트(IATF) · 원인분석 워크시트
   부품·협력사·불량유형·담당자는 개인 QMS 기준정보를 그대로 씁니다.
   컬럼 내부 이름은 SharePoint 설계서와 동일 (CSV 내보내기용)        */
const has=v=>v!==undefined&&v!==null&&String(v).trim()!=='';
const CZ_STAGES=['접수','격리','처분','원인분석','대책','효과검증','표준화','종결'];
const CZ_PATH={'TIER 3':CZ_STAGES,'TIER 2':CZ_STAGES,'TIER 1':['접수','격리','처분','원인분석','대책','종결'],'TIER 0':['접수','처분','종결']};
const CZ_NEXT_HINT={'격리':'격리 수량 확인 · 식별 표시','처분':'처분 방식 결정','원인분석':'발생·유출 원인 확정','대책':'영구대책 수립 · 담당/기한 지정','효과검증':'효과검증 데이터 수집','표준화':'FMEA · 관리계획서 개정 확인','종결':'종결 완료'};
const CZ_OPT={
  Origin:['수입검사','공정','최종검사','고객사','필드','협력사요청','고객요청'],
  RequestType:['품질문제','기술지원','납기조정','도면·사양변경','샘플요청','기타'],
  Customer:['','HKMC','GM','유럽OEM','기타'],
  get DefectType(){return ['',...db.settings.defectTypes]},
  Status:['진행중','보류','종결','취소'],
  Ball:['나','협력사','고객','타부서','보류'],
  Priority:['긴급','높음','보통','낮음'],
  SevS:[['','-'],['5','5 고객 라인 정지'],['4','4 고객 불량 유출'],['3','3 사내 라인 정지'],['2','2 사내 불량 발견'],['1','1 경미 · 외관']],
  ImpI:[['','-'],['5','5 대량 (1000개↑)'],['3','3 중량 (100~1000개)'],['1','1 소량 (100개↓)']],
  Tier:['','TIER 3','TIER 2','TIER 1','TIER 0'],
  Response:['','현장조치','간이 대책서','8D','RCA'],
  ContainMethod:['','적색라벨','격리구역','시스템홀드','기타'],
  Disposition:['미정','선별','재작업','수리','특채','폐기','반품'],
  CustNotify:['','불필요','필요','완료'],
  Score:['','0','4','7','10'],
  PokaYoke:['','미적용','검토중','적용완료'],
  PokaYokeType:['','형상규제','센서검출','설비인터록','자동정지','경보','기타'],
  DocUpd:['','해당없음','필요','완료'],
  Yokoten:['','해당없음','검토중','완료'],
  Recurred:['','없음','있음'],
  VerifyResult:['미검증','합격','조건부','불합격'],
  Retention:['3년','5년','10년','부품수명+1년'],
  ActCat:['봉쇄','재작업·재검사','발생대책','유출대책','시스템대책','효과검증','문서개정','수평전개','교육','불합격조치','기타'],
  ActStatus:['대기','진행','완료','취소'],
  SafetyChar:['해당없음','안전-S','법규-R','중요-C'],
  RcaScope:[['','-'],['없음','없음 — 협력사 대책으로 충분'],['발생','발생 원인 (사내 귀책)'],['유출','유출 원인 (왜 못 걸렀나)'],['발생+유출','발생 + 유출']]
};
const czById=(l,id)=>(db[l]||[]).find(x=>x.id===id);
// RCA 이력 — 단계 진행 · 되돌림 · 다시 열기 · 상태 · 조치 완료 · 귀책 판정 · 연결을 사건에 남김 (c.Log, 지우지 않음)
function czLog(c,type,text,x){if(!c)return;(c.Log=c.Log||[]).push(Object.assign({at:now(),date:today(),by:czMe(),type,text:String(text||'')},x||{}))}
// 목표 종결일 — 직접 입력이 없으면 등록일 + TIER별 기준 일수 (설정 › NCR · 기한)
const RCA_DAYS={'TIER 3':'rcaT3','TIER 2':'rcaT2','TIER 1':'rcaT1','TIER 0':'rcaT0'},RCA_DAYS_DEF={'TIER 3':45,'TIER 2':30,'TIER 1':20,'TIER 0':10};
const czDays=c=>num(db.settings[RCA_DAYS[c.Tier]])||RCA_DAYS_DEF[c.Tier]||30;
const czTargetAuto=c=>has(c.Created)?addDays(c.Created,czDays(c)):'';
const czTarget=c=>c?(has(c.TargetClose)?c.TargetClose:czTargetAuto(c)):'';
// 단계에 들어간 날 — 이력이 있으면 이력, 없으면(도입 전 건) 접수=등록일만 앎
function czStageDate(c,s){const l=(c.Log||[]).filter(x=>x.to===s).pop();return l?l.date:(s==='접수'?c.Created||'':s==='종결'?c.CloseDate||'':'')}
const CZ_RCA_LBL={'없음':'없음 (협력사 대책으로 충분)','발생':'발생 원인','유출':'유출 원인','발생+유출':'발생 + 유출'};
const czPart=c=>c&&c.PartId?db.parts.find(p=>p.id===c.PartId):null;
const czActs=c=>db.actions.filter(a=>a.CaseId===c.id);
const czMe=()=>db.settings.owners[0]||'';
const czOpen=c=>c&&c.Status!=='종결'&&c.Status!=='취소';
const czCaseOpenId=id=>czOpen(czById('cases',id));
function czTierAuto(c){if(!has(c.SevS)||!has(c.ImpI))return '';const s=num(c.SevS)*num(c.ImpI);return s>=20?'TIER 3':s>=10?'TIER 2':s>=5?'TIER 1':'TIER 0'}
const czFull8D=c=>c.Response==='8D'&&['TIER 0','TIER 1'].includes(c.Tier);
// RCA(사내 분석 대상)가 있으면 TIER가 낮아도 원인분석 · 대책 단계는 거침
const czPath=c=>czFull8D(c)?CZ_STAGES:((c.Tier==='TIER 0'&&c.RcaScope&&c.RcaScope!=='없음')?CZ_PATH['TIER 1']:(CZ_PATH[c.Tier]||CZ_STAGES));
function czNext(c){const ci=CZ_STAGES.indexOf(c.Stage);return czPath(c).find(s=>CZ_STAGES.indexOf(s)>ci)}
function czPrev(c){const ci=CZ_STAGES.indexOf(c.Stage);return czPath(c).filter(s=>CZ_STAGES.indexOf(s)<ci).pop()}
const czFar=c=>num(c.D3Score)+num(c.D7Score)+num(c.D14Score);
const czNcr=c=>c&&c.NcrId?db.ncrs.find(x=>x.id===c.NcrId):null;
const czNcrSt=c=>{const n=czNcr(c);return n?ncrStatus(n):''};
const czNcrOk=c=>['승인(검증대기)','종결'].includes(czNcrSt(c));   // 협력사 대책서 승인
const czNcrDone=c=>czNcrSt(c)==='종결';                          // NCR 유효성 검증 '유효'
const czUseFar=c=>c.Response==='FAR'&&!c.NcrId;
const czNeedOcc=c=>c.RcaScope==='발생'||c.RcaScope==='발생+유출';
const czNeedEsc=c=>c.RcaScope==='유출'||c.RcaScope==='발생+유출';
const czTierCls=t=>({'TIER 3':'t3','TIER 2':'t2','TIER 1':'t1','TIER 0':'t0'}[t]||'t0');
const czStCls=s=>({'진행중':'st-ing','보류':'st-hold','종결':'st-done','취소':'st-cancel'}[s]||'st-ing');
const CZ_RULES=[
  {st:'접수',tab:'basic',f:'Title',t:'제목',ok:c=>has(c.Title)},
  {st:'접수',tab:'basic',f:'PartId',t:'부품',ok:c=>has(c.PartId)},
  {st:'접수',tab:'basic',f:'DefectType',t:'불량유형',ok:c=>has(c.DefectType)},
  {st:'접수',tab:'basic',f:'DefectQty',t:'불량수량',ok:c=>has(c.DefectQty)},
  {st:'접수',tab:'basic',f:'Description',t:'불량내용',ok:c=>has(c.Description)},
  {st:'접수',tab:'basic',f:'SevS',t:'심각도 S',ok:c=>has(c.SevS)},
  {st:'접수',tab:'basic',f:'ImpI',t:'영향도 I',ok:c=>has(c.ImpI)},
  {st:'접수',tab:'basic',f:'Tier',t:'확정 TIER',ok:c=>has(c.Tier)},
  {st:'접수',tab:'basic',f:'TierReason',t:'TIER 조정사유 (자동 판정과 다름)',ok:c=>!has(c.Tier)||c.Tier===czTierAuto(c)||has(c.TierReason)},
  {st:'접수',tab:'basic',f:'Response',t:'대응방향',ok:c=>has(c.Response)},
  {st:'접수',tab:'head',f:'NextAction',t:'공 · 다음 행동 · 재확인일',ok:c=>has(c.Ball)&&has(c.NextAction)&&has(c.RecheckDate)},
  {st:'격리',tab:'contain',f:'QtyStock',t:'격리 수량 4칸 (없으면 0)',ok:c=>['QtyStock','QtyWIP','QtyTransit','QtyCustomer'].every(k=>has(c[k]))},
  {st:'격리',tab:'contain',f:'ContainDate',t:'격리 완료일',ok:c=>has(c.ContainDate)},
  {st:'격리',tab:'contain',f:'ContainMethod',t:'식별 방법',ok:c=>has(c.ContainMethod)},
  {st:'처분',tab:'contain',f:'Disposition',t:'처분 방식 (미정 불가)',ok:c=>has(c.Disposition)&&c.Disposition!=='미정'},
  {st:'처분',tab:'contain',f:'DeviationNo',t:'특채번호 · 고객 승인자 · 승인일 (특채/수리, IATF 8.7.1.1·8.7.1.5)',ok:c=>!['특채','수리'].includes(c.Disposition)||(has(c.DeviationNo)&&has(c.CustApprover)&&has(c.CustApproveDate))},
  {st:'처분',tab:'actions',t:'재작업·재검사 조치 1건 이상 (재작업, IATF 8.7.1.4)',ok:c=>c.Disposition!=='재작업'||czActs(c).some(a=>a.Category==='재작업·재검사')},
  {st:'처분',tab:'contain',f:'CustNotify',t:'고객통보 판정 (IATF 8.7.1.6)',ok:c=>has(c.CustNotify)},
  {st:'처분',tab:'contain',f:'CustNotify',t:'고객사·필드 발견 건은 고객통보 필요/완료',ok:c=>!['고객사','필드'].includes(c.Origin)||['필요','완료'].includes(c.CustNotify)},
  {st:'처분',tab:'contain',f:'CustNotifyReason',t:'고객통보 불필요 사유',ok:c=>c.CustNotify!=='불필요'||has(c.CustNotifyReason)},
  {st:'원인분석',tab:'cause',f:'RcaScope',t:'사내 분석 대상 판정 (없음 / 발생 / 유출)',ok:c=>has(c.RcaScope)},
  {st:'원인분석',tab:'cause',t:'사내 RCA 워크시트 1개 이상',ok:c=>(c.Analyses||[]).length>0||(!czNeedOcc(c)&&!czNeedEsc(c)&&(czNcrOk(c)||c.RcaScope==='없음'))},
  {st:'원인분석',tab:'cause',f:'CauseOccur',t:'발생 원인',ok:c=>has(c.CauseOccur)},
  {st:'원인분석',tab:'cause',f:'CauseEscape',t:'유출 원인',ok:c=>has(c.CauseEscape)||(!czNeedEsc(c)&&czNcrOk(c))},
  {st:'원인분석',tab:'cause',f:'CauseSystem',t:'시스템 원인 (TIER 3)',ok:c=>c.Tier!=='TIER 3'||has(c.CauseSystem)},
  {st:'원인분석',tab:'far',f:'D7Reply',t:'FAR D+7 회신일 · 점수',ok:c=>!czUseFar(c)||(has(c.D7Reply)&&has(c.D7Score))},
  {st:'대책',tab:'actions',t:'발생대책 조치 1건 이상 (또는 연결 NCR 대책서 승인)',ok:c=>(!czNeedOcc(c)&&czNcrOk(c))||czActs(c).some(a=>a.Category==='발생대책')},
  {st:'대책',tab:'actions',t:'유출대책 조치 1건 이상 (또는 연결 NCR 대책서 승인)',ok:c=>(!czNeedEsc(c)&&czNcrOk(c))||czActs(c).some(a=>a.Category==='유출대책')},
  {st:'대책',tab:'actions',t:'미완료 조치 모두 담당자 · 기한 지정',ok:c=>czActs(c).filter(a=>!['완료','취소'].includes(a.ActionStatus)).every(a=>(has(a.Assignee)||has(a.ExternalOwner))&&has(a.DueDate))},
  {st:'대책',tab:'verify',f:'PokaYoke',t:'실수방지 판정 (IATF 10.2.4)',ok:c=>has(c.PokaYoke)},
  {st:'대책',tab:'verify',f:'PokaYokeReason',t:'실수방지 미적용 사유',ok:c=>c.PokaYoke!=='미적용'||has(c.PokaYokeReason)},
  {st:'효과검증',tab:'verify',f:'VerifyStart',t:'검증 기간 (또는 NCR 유효성 검증 완료)',ok:c=>czNcrDone(c)||(has(c.VerifyStart)&&has(c.VerifyEnd))},
  {st:'효과검증',tab:'verify',f:'RateBefore',t:'개선 전 · 후 불량률 (또는 NCR 유효성 검증 완료)',ok:c=>czNcrDone(c)||(has(c.RateBefore)&&has(c.RateAfter))},
  {st:'효과검증',tab:'verify',f:'Recurred',t:'동일 불량 재발 여부',ok:c=>czNcrDone(c)||has(c.Recurred)},
  {st:'효과검증',tab:'verify',f:'VerifyResult',t:'효과검증 판정 합격 또는 조건부',ok:c=>['합격','조건부'].includes(c.VerifyResult)},
  {st:'효과검증',tab:'actions',t:'FAR 총점 15점 미만 → 불합격조치 등록',ok:c=>!czUseFar(c)||czFar(c)>=15||czActs(c).some(a=>a.Category==='불합격조치')},
  {st:'표준화',close:true,tab:'close',f:'FMEAUpdate',t:'FMEA 갱신 판정 (완료/해당없음, IATF 10.2.3)',ok:c=>['완료','해당없음'].includes(c.FMEAUpdate)},
  {st:'표준화',close:true,tab:'close',f:'CPUpdate',t:'관리계획서 갱신 판정 (완료/해당없음)',ok:c=>['완료','해당없음'].includes(c.CPUpdate)},
  {st:'표준화',close:true,tab:'close',f:'DocNAReason',t:'문서 개정 해당없음 사유',ok:c=>!(c.FMEAUpdate==='해당없음'||c.CPUpdate==='해당없음')||has(c.DocNAReason)},
  {st:'표준화',tab:'close',f:'Yokoten',t:'수평전개 판정 (해당없음/완료)',ok:c=>['해당없음','완료'].includes(c.Yokoten)},
  {close:true,tab:'actions',t:'미완료 조치 0건',ok:c=>czActs(c).every(a=>['완료','취소'].includes(a.ActionStatus))},
  {close:true,tab:'close',f:'CloseApprover',t:'종결 승인자 (TIER 2·3)',ok:c=>!['TIER 2','TIER 3'].includes(c.Tier)||has(c.CloseApprover)},
  {close:true,tab:'close',f:'Retention',t:'보관기간',ok:c=>has(c.Retention)}
];
function czGate(c,target){const p=czPath(c),ti=p.indexOf(target);return CZ_RULES.filter(r=>{const si=r.st?p.indexOf(r.st):-1;return (si>=0&&si<ti)||(r.close&&target==='종결')}).filter(r=>!r.ok(c))}
const F=(key,label,type,opt,x)=>Object.assign({key,label,type,opt},x||{});
const CZ_TABS=[
  {id:'basic',label:'기본',fields:[
    F('Title','제목','text',null,{w:2}),F('Origin','발생원천','select','Origin'),F('RequestType','요청분류','select','RequestType'),
    F('PartId','부품','part'),F('SupplierId','협력사','supplier'),F('Customer','고객사','select','Customer'),F('CustomerClaimNo','고객 클레임번호','text'),
    F('DefectType','불량유형','select','DefectType'),F('DefectQty','불량수량 (EA)','number'),F('Priority','우선순위','select','Priority'),F('Owner','담당자','text',null,{list:'dlOwners'}),
    F('Description','불량내용','textarea',null,{w:4}),
    F('SevS','심각도 S','select','SevS'),F('ImpI','영향도 I','select','ImpI'),F('TierAuto','판정 TIER (자동)','calc'),F('Tier','확정 TIER','select','Tier'),
    F('TierReason','TIER 조정사유','textarea',null,{w:4,showIf:c=>has(c.Tier)&&has(czTierAuto(c))&&c.Tier!==czTierAuto(c)}),
    F('Response','대응방향','select','Response'),F('ParentCaseId','연계 RCA (재발)','case'),F('LegacyNo','기존 문서번호','text'),F('Created','등록일','date'),
    F('TargetClose','목표 종결일','date',null,{hint:c=>`비워 두면 등록일 + ${c.Tier||'TIER'} 기준 ${czDays(c)}일 = ${czTargetAuto(c)||'-'}`})]},
  {id:'contain',label:'격리·처분',note:'IATF 8.7.1 — 부적합품은 식별·격리·기록 후 처분합니다. 격리 수량은 없으면 0을 입력하십시오.',fields:[
    F('QtyStock','격리 · 사내 재고','number'),F('QtyWIP','격리 · 재공','number'),F('QtyTransit','격리 · 이송중','number'),F('QtyCustomer','격리 · 고객처','number'),
    F('ContainDate','격리 완료일','date'),F('ContainMethod','식별 방법','select','ContainMethod'),F('ContainScope','소급 범위 (로트/기간)','text',null,{w:2}),
    F('Disposition','처분','select','Disposition'),F('DispositionDate','처분 완료일','date'),F('DeviationNo','특채번호','text'),F('DeviationScope','특채 유효범위 (수량/기한)','text'),
    F('CustNotify','고객통보','select','CustNotify'),F('CustNotifyDate','고객 통보일','date'),F('CustApprover','고객 승인자','text'),F('CustApproveDate','고객 승인일','date'),
    F('CustNotifyReason','고객통보 불필요 사유','textarea',null,{w:4,showIf:c=>c.CustNotify==='불필요'})]},
  {id:'cause',label:'원인분석',fields:[
    F('RcaScope','사내 분석 대상 (RCA)','select','RcaScope',{w:2,hint:'협력사 귀책이라도 공정·출하·고객 단계에서 발견됐으면 ‘유출’ — 수입검사가 왜 못 걸렀는지 사내에서 분석합니다'}),
    F('CauseOccur','발생 원인','textarea',null,{w:2}),F('CauseEscape','유출 원인 (왜 검출되지 않았나)','textarea',null,{w:2}),
    F('CauseSystem','시스템 원인 (왜 시스템이 막지 못했나)','textarea',null,{w:4})]},
  {id:'far',label:'FAR 회신',showTab:c=>czUseFar(c),note:'점수 기준 — 10 요구 충족·근거 완비 / 7 충족하나 근거 미흡 / 4 형식적 회신 / 0 미회신. 총점 24 이상 합격, 15~23 조건부, 15 미만 불합격.',fields:[
    F('FARIssueDate','FAR 발행일','date'),F('FARDue','D+3 / D+7 / D+14 마감','calc',null,{w:2}),F('FARTotal','FAR 총점 (30점)','calc'),
    F('D3Reply','D+3 즉시조치 회신일','date'),F('D3Score','D+3 점수','select','Score'),
    F('D7Reply','D+7 근본원인 회신일','date'),F('D7Score','D+7 점수','select','Score'),
    F('D14Reply','D+14 영구대책 회신일','date'),F('D14Score','D+14 점수','select','Score')]},
  {id:'verify',label:'대책·검증',fields:[
    F('PokaYoke','실수방지 (IATF 10.2.4)','select','PokaYoke'),F('PokaYokeType','적용 방식','select','PokaYokeType'),F('PokaYokeReason','미적용 사유','text',null,{w:2}),
    F('VerifyStart','검증 시작일','date'),F('VerifyEnd','검증 종료일','date'),F('RateBefore','개선 전 불량률 (% 또는 PPM)','number'),F('RateAfter','개선 후 불량률','number'),
    F('Recurred','동일 불량 재발','select','Recurred'),F('VerifyResult','효과검증 판정','select','VerifyResult')]},
  {id:'actions',label:'조치',fields:[]},
  {id:'close',label:'표준화·종결',note:'IATF 10.2.3 — 근본원인이 확정되면 FMEA와 관리계획서 갱신 여부를 반드시 판정합니다.',fields:[
    F('FMEAUpdate','공정 FMEA 갱신','select','DocUpd'),F('FMEARev','FMEA 개정번호','text'),F('CPUpdate','관리계획서 갱신','select','DocUpd'),F('CPRev','관리계획서 개정번호','text'),
    F('DocNAReason','해당없음 사유','textarea',null,{w:4,showIf:c=>c.FMEAUpdate==='해당없음'||c.CPUpdate==='해당없음'}),
    F('Yokoten','수평전개','select','Yokoten'),F('CloseApprover','종결 승인자','text'),F('Retention','보관기간 (IATF 7.5.3.2.1)','select','Retention'),F('CloseDate','종결일','date')]},
  {id:'hist',label:'이력',fields:[]}
];

/* ---------- 분석 도구 (워크시트) ---------- */
const TOOLS=[
  {key:'5why',name:'5 Why',lv:'기본',when:'단순·반복 불량. 원인이 한 줄기로 이어질 때',how:['문제를 한 문장으로 정의합니다 (무엇이 · 어디서 · 얼마나).','"왜?"에 추측이 아닌 확인된 사실로 답하고, 그 답을 다음 "왜?"의 대상으로 삼습니다. 질문 칸은 앞 답을 받아 자동으로 바뀝니다.','작업자 실수가 아니라 관리 가능한 원인(설비·방법·기준·시스템)에 닿으면 멈춥니다. 보통 3~5단계입니다.','발생(왜 만들어졌나)과 유출(왜 못 걸렀나)을 따로 씁니다.','거꾸로 읽기 검증: 마지막 답부터 "그래서"로 이어 읽어 문제까지 논리가 닿는지 확인합니다.']},
  {key:'isnot',name:'Is / Is Not',lv:'기본',when:'원인 범위가 불분명할 때. 정상인 것과 비교해 후보를 좁힘',how:['IS에는 불량이 나타난 대상·위치·시점·양을, IS NOT에는 나타날 수 있었는데 나타나지 않은 것을 씁니다.','두 칸의 차이점을 적습니다. 원인은 이 차이 안에 있습니다.','차이점마다 가능한 원인을 적고, 아래 원인 후보 표로 옮겨 검증 방법을 정합니다.','검증 결과가 ○인 후보만 결론에 씁니다.']},
  {key:'timeline',name:'Timeline',lv:'기본',when:'언제부터 이상이 생겼는지 시간 순서로 재현할 때',how:['정상이던 마지막 시점부터 불량 발견 시점까지 사건을 시간 순으로 적습니다.','생산·검사·설비 정비·자재 입고·인원 변경 기록을 함께 모읍니다.','정상 → 이상으로 바뀐 경계 구간을 찾고, 그 사이 변화를 아래 변화점 표에 적습니다.']},
  {key:'change',name:'변화점 (4M+1E)',lv:'기본',when:'어느 시점 이후 갑자기 불량이 생겼을 때',how:['불량 발생 전후를 기준으로 사람·설비·자재·방법·환경의 변화 전/후를 적습니다.','변화가 없는 항목은 "변화 없음"으로 명시합니다. 빈칸은 확인하지 않은 것입니다.','영향도 상 항목부터 재현 시험이나 데이터로 확인하고 결과를 ○ / ×로 남깁니다.','협력사 부품이면 4M 변경 신고 이력과 대조합니다. 신고 없이 바뀐 항목이 있으면 그 자체로 부적합입니다.']},
  {key:'fishbone',name:'특성요인도',lv:'기본',when:'원인 후보를 빠짐없이 펼쳐 볼 때 (팀 브레인스토밍)',how:['결과(특성)를 한 문장으로 씁니다.','6M 분류별로 생각나는 원인을 모두 적습니다. 이 단계에서는 거르지 않습니다.','현장·데이터로 확인해 "검증-원인" 또는 "기각"으로 표시합니다.','"검증-원인" 항목은 5 Why 워크시트를 추가해 더 파고듭니다.']},
  {key:'fta',name:'FTA 고장나무',lv:'심화',when:'여러 원인이 겹쳐야 생기는 복합 고장. AND/OR 구조 파악',how:['최상위 사건(Top event)을 정의합니다.','바로 아래 원인들을 적고, 그 원인들이 모두 있어야 생기면 AND, 하나만 있어도 생기면 OR를 고릅니다.','"+ 하위"로 더 나눌 수 없는 기본 원인까지 내려갑니다. 하위가 없는 칸이 기본 원인이 됩니다.','기본 원인에 발생 확률(%)을 모두 넣으면 최상위 확률이 계산됩니다. AND 아래 원인은 하나만 막아도 사건이 막히므로 대책 대상으로 좋습니다.']},
  {key:'logic',name:'Logic Tree',lv:'심화',when:'문제를 MECE로 분해해 검증 대상을 정할 때',how:['분해 기준(4M+1E, 공정 단계, 구성품)을 먼저 정합니다.','같은 수준의 가지끼리 겹치지 않고(ME), 합치면 빠짐없게(CE) 나눕니다.','가지마다 가능성을 판단하고, 가능성이 높은 가지만 한 단계 더 나눕니다.','끝 가지를 검증해 원인확인 / 기각을 표시합니다.']},
  {key:'cem',name:'C&E Matrix',lv:'심화',when:'원인 후보가 많아 우선순위를 점수로 정해야 할 때',how:['결과 항목(Y)과 중요도(1~10)를 정합니다.','원인 후보(X)마다 각 Y와의 관계를 9(강) · 3(중) · 1(약) · 0(없음)으로 매깁니다.','총점 = Σ(관계 × 중요도)가 자동 계산되고 순위가 매겨집니다.','상위 원인부터 검증하거나 대책을 세웁니다.']},
  {key:'eta',name:'ETA 사건나무',lv:'심화',when:'불량이 어느 검출 단계를 뚫고 유출되는지 볼 때 (유출 원인)',how:['초기 사건(예: 치수 불량 발생)과 그 발생률(%)을 적습니다.','그 뒤의 방어 단계(공정검사, 출하검사, 수입검사 등)를 순서대로 적고, 단계별로 불량을 놓칠 확률(%)을 넣습니다.','경로별 확률이 계산됩니다. 고객 유출 확률을 가장 크게 줄이는 방어 단계를 강화 대상으로 정합니다.']}
];
const toolOf=k=>TOOLS.find(t=>t.key===k)||{name:k,how:[]};
const REC={'TIER 1':['5why','isnot','timeline','change'],'TIER 2':['5why','isnot','change','fishbone','fta','cem'],'TIER 3':['fishbone','fta','logic','cem','eta','5why']};
const GUIDE=[['갑자기 생겼다','change'],['언제부터인지 모른다','timeline'],['범위가 애매하다','isnot'],['원인이 한 줄기다','5why'],['후보를 다 펼쳐야 한다','fishbone'],['여러 원인이 겹친다','fta'],['후보가 너무 많다','cem'],['왜 못 걸렀나','eta']];
let anaSeq=0;
function blankAna(key){
  const r5=()=>['','','','',''];
  const D={
    '5why':{problem:'',occ:r5(),esc:r5(),evidence:''},
    isnot:{rows:{},cands:[{cause:'',basis:'',method:'',result:''}]},
    timeline:{period:'',rows:[{t:'',ev:'',who:'',st:'정상',note:''}],changes:[{t:'',what:'',m4:'',impact:'',cause:''}]},
    change:{items:[['사람','작업자'],['사람','숙련도 · 교대'],['설비','설비 · 금형 · 치구'],['설비','공정 파라미터'],['자재','원자재 Lot'],['자재','공급업체 · 2차 협력사'],['방법','작업 방법 · 순서'],['방법','검사 기준 · 방법'],['환경','온도 · 습도']].map(([cat,item])=>({cat,item,before:'',after:'',impact:'',check:''}))},
    fishbone:{effect:'',rows:[]},
    fta:{top:'',gate:'OR',nodes:[],nid:0},
    logic:{problem:'',basis:'4M+1E',nodes:[],nid:0,mece1:false,mece2:false},
    cem:{ys:[{name:'불량률',w:'10'},{name:'고객 영향',w:'9'},{name:'재발 가능성',w:'8'}],xs:[{name:'',s:['','','']},{name:'',s:['','','']},{name:'',s:['','','']}]},
    eta:{ie:'',pie:'',sfs:[{name:'공정 내 검사',pf:''},{name:'출하검사',pf:''},{name:'고객 수입검사',pf:''}]}
  };
  return Object.assign({id:uid(),tool:key,created:today(),updatedAt:now(),concl:'',hideHow:false,collapsed:false},JSON.parse(JSON.stringify(D[key])));
}
function syncTools(c){c.AnalysisTools=[...new Set((c.Analyses||[]).map(a=>toolOf(a.tool).name))]}
function setPath(o,path,v){const ks=path.split('.');let t=o;for(let i=0;i<ks.length-1;i++){const k=ks[i];if(t[k]===undefined||t[k]===null)t[k]=/^\d+$/.test(ks[i+1])?[]:{};t=t[k]}t[ks[ks.length-1]]=v}
const fmtP=p=>{if(p===null||p===undefined||isNaN(p))return '-';const v=p*100;return (v>=1?v.toFixed(1):v>=0.01?v.toFixed(3):v===0?'0':v.toExponential(2))+'%'};
function czOptHTML(list,val){const L=list.map(o=>Array.isArray(o)?o:[o,o]);if(has(val)&&!L.some(([v])=>String(v)===String(val)))L.push([val,val]);return L.map(([v,l])=>`<option value="${esc(v)}" ${String(val??'')===String(v)?'selected':''}>${esc(l||'-')}</option>`).join('')}
const IN=(a,p,v,x='')=>`<input type="text" data-scope="ana" data-aid="${a.id}" data-path="${p}" value="${esc(v)}" ${x}>`;
const TA=(a,p,v,x='')=>`<textarea data-scope="ana" data-aid="${a.id}" data-path="${p}" ${x}>${esc(v)}</textarea>`;
const SE=(a,p,list,v,x='')=>`<select data-scope="ana" data-aid="${a.id}" data-path="${p}" ${x}>${czOptHTML(list,v)}</select>`;
const RB=(a,kind,label,x='')=>`<button class="btn sm" data-act="anaAdd" data-aid="${a.id}" data-kind="${kind}" ${x}>${label}</button>`;
const XB=(a,list,i)=>`<button class="btn sm danger" data-act="anaDel" data-aid="${a.id}" data-list="${list}" data-i="${i}" title="삭제">✕</button>`;
function ftaProb(a,id){
  const kids=a.nodes.filter(n=>String(n.parent)===String(id));
  if(!kids.length){const n=a.nodes.find(m=>String(m.id)===String(id));return n&&has(n.p)?num(n.p)/100:null}
  const ps=kids.map(k=>ftaProb(a,k.id));if(ps.some(p=>p===null))return null;
  const gate=id==='TOP'?a.gate:((a.nodes.find(m=>String(m.id)===String(id))||{}).gate||'OR');
  return gate==='AND'?ps.reduce((x,y)=>x*y,1):1-ps.reduce((x,y)=>x*(1-y),1);
}
function treeHTML(a,isFTA){
  const rec=(pid,depth)=>a.nodes.map((n,i)=>[n,i]).filter(([n])=>String(n.parent)===String(pid)).map(([n,i])=>{
    const leaf=!a.nodes.some(m=>String(m.parent)===String(n.id));
    const mid=isFTA?(leaf?`<span class="badge t0">기본원인</span>${IN(a,`nodes.${i}.p`,n.p,'style="width:78px;flex:none" placeholder="확률 %"')}`:SE(a,`nodes.${i}.gate`,[['OR','OR 게이트'],['AND','AND 게이트']],n.gate))
      :SE(a,`nodes.${i}.likely`,[['','가능성'],['상','가능성 상'],['중','가능성 중'],['하','가능성 하']],n.likely);
    const vSt=n.v==='원인확인'?'style="color:var(--red);font-weight:600"':'';
    return `<div class="tnode" style="margin-left:${depth*26}px"><span class="tl">${depth?'└':'•'}</span>
      ${IN(a,`nodes.${i}.label`,n.label,`placeholder="${isFTA?(leaf?'원인':'중간 사건'):'가지'}"`)}${mid}
      ${SE(a,`nodes.${i}.v`,[['','미검증'],['원인확인','원인확인'],['기각','기각']],n.v,vSt)}
      <button class="btn sm" data-act="anaAdd" data-aid="${a.id}" data-kind="node" data-parent="${n.id}">+ 하위</button>${XB(a,'nodes',i)}</div>`+rec(n.id,depth+1);
  }).join('');
  return rec('TOP',0);
}
const WS={
  '5why':a=>{
    const chain=(k,title,first)=>`<table class="mini"><tr><th colspan="2">${title}</th><th>답 (확인된 사실)</th></tr>${a[k].map((v,i)=>`<tr><td style="width:58px"><b>Why ${i+1}</b></td><td class="muted" style="width:38%">${i===0?esc(first):'왜 「'+esc(a[k][i-1]||'앞의 답')+'」인가?'}</td><td>${IN(a,k+'.'+i,v)}</td></tr>`).join('')}</table>`;
    return `<div class="fld" style="margin-bottom:10px"><label>문제 정의</label>${IN(a,'problem',a.problem,'placeholder="무엇이 · 어디서 · 얼마나"')}</div>
      <div class="two">${chain('occ','발생 — 왜 만들어졌나','왜 이 불량이 만들어졌는가?')}${chain('esc','유출 — 왜 못 걸렀나','왜 검출되지 않고 넘어갔는가?')}</div>
      <div class="fld"><label>근거 자료 (측정 데이터 · 사진 · 재현 시험)</label>${IN(a,'evidence',a.evidence)}</div>`;
  },
  isnot:a=>{
    const R=[['what','무엇','어떤 불량인가?'],['what2','무엇','어떤 부품·모델인가?'],['where','어디','어느 공정인가?'],['where2','어디','어느 설비·위치인가?'],['when','언제','처음 발생한 시점은?'],['when2','언제','시간대·교대·로트는?'],['much','얼마나','불량 수량은?'],['much2','얼마나','빈도·추세는?']];
    const r=a.rows||{};
    return `<table class="mini"><tr><th style="width:52px"></th><th style="width:15%">질문</th><th>IS (나타난 것)</th><th>IS NOT (나타날 수 있었는데 안 나타난 것)</th><th>차이점</th><th>가능 원인</th></tr>
      ${R.map(([k,g,q])=>`<tr><td><b>${g}</b></td><td class="muted">${q}</td>${['is','isnot','diff','cause'].map(f=>`<td>${IN(a,`rows.${k}.${f}`,(r[k]||{})[f])}</td>`).join('')}</tr>`).join('')}</table>
      <div class="sec-t" style="font-size:13px;margin-top:12px">원인 후보 검증</div>
      <table class="mini"><tr><th style="width:36px">순위</th><th>가능 원인</th><th>근거 (차이점)</th><th>검증 방법</th><th style="width:104px">결과</th><th style="width:36px"></th></tr>
      ${a.cands.map((x,i)=>`<tr><td>${i+1}</td><td>${IN(a,`cands.${i}.cause`,x.cause)}</td><td>${IN(a,`cands.${i}.basis`,x.basis)}</td><td>${IN(a,`cands.${i}.method`,x.method)}</td><td>${SE(a,`cands.${i}.result`,[['','미검증'],['○','○ 원인'],['×','× 기각']],x.result)}</td><td>${XB(a,'cands',i)}</td></tr>`).join('')}</table>${RB(a,'cand','+ 후보 추가')}`;
  },
  timeline:a=>`<div class="fld" style="margin-bottom:10px;max-width:420px"><label>분석 기간</label>${IN(a,'period',a.period,'placeholder="예: 10/01 ~ 10/15"')}</div>
    <table class="mini"><tr><th style="width:130px">일시</th><th>사건 · 작업</th><th style="width:16%">담당 · 설비</th><th style="width:90px">상태</th><th style="width:18%">비고</th><th style="width:36px"></th></tr>
    ${a.rows.map((x,i)=>`<tr><td>${IN(a,`rows.${i}.t`,x.t)}</td><td>${IN(a,`rows.${i}.ev`,x.ev)}</td><td>${IN(a,`rows.${i}.who`,x.who)}</td><td>${SE(a,`rows.${i}.st`,['정상','이상','불량'],x.st,x.st==='불량'?'style="color:var(--red)"':x.st==='이상'?'style="color:var(--amb)"':'')}</td><td>${IN(a,`rows.${i}.note`,x.note)}</td><td>${XB(a,'rows',i)}</td></tr>`).join('')}</table>${RB(a,'tl','+ 사건 추가')}
    <div class="sec-t" style="font-size:13px;margin-top:14px">정상 → 이상 경계에서 찾은 변화점</div>
    <table class="mini"><tr><th style="width:130px">변화 시점</th><th>변화 내용</th><th style="width:90px">4M+1E</th><th style="width:76px">영향도</th><th>가능 원인</th><th style="width:36px"></th></tr>
    ${a.changes.map((x,i)=>`<tr><td>${IN(a,`changes.${i}.t`,x.t)}</td><td>${IN(a,`changes.${i}.what`,x.what)}</td><td>${SE(a,`changes.${i}.m4`,['','사람','설비','자재','방법','환경'],x.m4)}</td><td>${SE(a,`changes.${i}.impact`,['','상','중','하'],x.impact)}</td><td>${IN(a,`changes.${i}.cause`,x.cause)}</td><td>${XB(a,'changes',i)}</td></tr>`).join('')}</table>${RB(a,'tlc','+ 변화점 추가')}`,
  change:a=>`<table class="mini"><tr><th style="width:56px">구분</th><th style="width:17%">항목</th><th>변화 전</th><th>변화 후</th><th style="width:76px">영향도</th><th>확인 결과</th><th style="width:36px"></th></tr>
    ${a.items.map((x,i)=>`<tr><td><b>${esc(x.cat)}</b></td><td>${IN(a,`items.${i}.item`,x.item)}</td><td>${IN(a,`items.${i}.before`,x.before)}</td><td>${IN(a,`items.${i}.after`,x.after,'placeholder="변화 없으면 \'변화 없음\'"')}</td><td>${SE(a,`items.${i}.impact`,['','상','중','하'],x.impact)}</td><td>${IN(a,`items.${i}.check`,x.check,'placeholder="○ 원인 / × 기각 + 근거"')}</td><td>${XB(a,'items',i)}</td></tr>`).join('')}</table>
    <div class="bar">${['사람','설비','자재','방법','환경'].map(k=>RB(a,'chg',`+ ${k}`,`data-cat="${k}"`)).join('')}</div>`,
  fishbone:a=>{
    const cats=['사람','설비','자재','방법','측정','환경'];
    return `<div class="fld" style="margin-bottom:12px"><label>결과 (특성)</label>${IN(a,'effect',a.effect,'placeholder="예: 래치 작동력 상한 초과"')}</div>
      <div class="fbg">${cats.map(k=>{const rows=a.rows.map((x,i)=>[x,i]).filter(([x])=>x.cat===k);
        return `<div class="fbc"><div class="fbh">${k} <span class="muted" style="font-weight:400">${rows.length}</span></div>${rows.map(([x,i])=>`<div class="tnode">${IN(a,`rows.${i}.text`,x.text,'placeholder="원인"')}${SE(a,`rows.${i}.flag`,[['','후보'],['검증-원인','검증-원인'],['기각','기각']],x.flag,x.flag==='검증-원인'?'style="color:var(--red);font-weight:600"':'')}${XB(a,'rows',i)}</div>`).join('')}${RB(a,'fb','+ 원인',`data-cat="${k}"`)}</div>`}).join('')}</div>`;
  },
  fta:a=>{const p=ftaProb(a,'TOP');
    return `<div class="grid" style="margin-bottom:12px"><div class="fld w2"><label>최상위 사건 (Top event)</label>${IN(a,'top',a.top)}</div>
      <div class="fld"><label>Top 바로 아래 결합</label>${SE(a,'gate',[['OR','OR — 하나만 있어도 발생'],['AND','AND — 모두 있어야 발생']],a.gate)}</div>
      <div class="fld"><label>최상위 발생 확률 (계산)</label><div class="calc"><span class="calcv">${fmtP(p)}</span>${p===null?' <span class="muted">기본원인 확률을 모두 넣으면 계산</span>':''}</div></div></div>
      <div>${treeHTML(a,true)||'<div class="muted" style="margin-bottom:8px">아래 버튼으로 첫 원인을 추가하십시오.</div>'}</div>${RB(a,'node','+ Top 아래 원인 추가','data-parent="TOP"')}`},
  logic:a=>`<div class="grid" style="margin-bottom:12px"><div class="fld w2"><label>문제</label>${IN(a,'problem',a.problem)}</div><div class="fld w2"><label>분해 기준</label>${SE(a,'basis',['4M+1E','공정 단계','제품 구성요소','기타'],a.basis)}</div></div>
    <div>${treeHTML(a,false)||'<div class="muted" style="margin-bottom:8px">아래 버튼으로 1차 가지를 추가하십시오.</div>'}</div>${RB(a,'node','+ 1차 가지 추가','data-parent="TOP"')}
    <div class="checks" style="margin-top:12px"><label><input type="checkbox" data-scope="ana" data-aid="${a.id}" data-path="mece1" ${a.mece1?'checked':''}>같은 수준의 가지끼리 겹치지 않는다 (ME)</label><label><input type="checkbox" data-scope="ana" data-aid="${a.id}" data-path="mece2" ${a.mece2?'checked':''}>가지를 합치면 빠짐이 없다 (CE)</label></div>`,
  cem:a=>{
    const tot=x=>a.ys.reduce((s,y,j)=>s+num(x.s[j])*num(y.w),0);
    const rank={};a.xs.map((x,i)=>[tot(x),i]).sort((p,q)=>q[0]-p[0]).forEach(([t,i],r)=>{rank[i]=t>0?r+1:''});
    return `<div class="muted" style="margin-bottom:6px">관계 강도: 9 강 · 3 중 · 1 약 · 0 없음</div>
      <div style="overflow:auto"><table class="mini"><tr><th style="min-width:180px">원인 후보 (X)</th>${a.ys.map((y,j)=>`<th style="width:124px">${IN(a,`ys.${j}.name`,y.name)}<div style="display:flex;gap:4px;margin-top:4px;align-items:center"><span class="muted" style="font-weight:400">중요도</span>${SE(a,`ys.${j}.w`,['1','2','3','4','5','6','7','8','9','10'],y.w)}${a.ys.length>1?XB(a,'ys',j):''}</div></th>`).join('')}<th style="width:60px">총점</th><th style="width:44px">순위</th><th style="width:36px"></th></tr>
      ${a.xs.map((x,i)=>`<tr><td>${IN(a,`xs.${i}.name`,x.name)}</td>${a.ys.map((y,j)=>`<td>${SE(a,`xs.${i}.s.${j}`,['','0','1','3','9'],x.s[j])}</td>`).join('')}<td class="num"><b>${tot(x)}</b></td><td class="num">${rank[i]===1?'<span class="calcv">1</span>':rank[i]}</td><td>${XB(a,'xs',i)}</td></tr>`).join('')}</table></div>
      <div class="bar">${RB(a,'x','+ 원인 후보')}${a.ys.length<5?RB(a,'y','+ 결과 항목 (Y)'):''}</div>`;
  },
  eta:a=>{
    const P0=num(a.pie)/100;let carry=P0;
    const paths=a.sfs.map((s,i)=>{const pf=num(s.pf)/100;const det=carry*(1-pf);carry=carry*pf;return {label:`${s.name||('방어 '+(i+1))}에서 검출`,p:det}});
    paths.push({label:'고객 유출',p:carry,out:true});
    const ok=has(a.pie)&&a.sfs.length&&a.sfs.every(s=>has(s.pf));
    return `<div class="grid" style="margin-bottom:12px"><div class="fld w2"><label>초기 사건</label>${IN(a,'ie',a.ie,'placeholder="예: 그리스 도포량 부족 발생"')}</div><div class="fld"><label>발생률 (%)</label>${IN(a,'pie',a.pie,'placeholder="예: 2"')}</div></div>
      <table class="mini"><tr><th style="width:44px">순서</th><th>방어 단계 (검출 기회)</th><th style="width:150px">놓칠 확률 (%)</th><th style="width:36px"></th></tr>
      ${a.sfs.map((s,i)=>`<tr><td>${i+1}</td><td>${IN(a,`sfs.${i}.name`,s.name)}</td><td>${IN(a,`sfs.${i}.pf`,s.pf,'placeholder="예: 30"')}</td><td>${XB(a,'sfs',i)}</td></tr>`).join('')}</table>${RB(a,'sf','+ 방어 단계')}
      <div class="sec-t" style="font-size:13px;margin-top:14px">경로별 결과 ${ok?'':'<span class="muted" style="font-weight:400">발생률과 놓칠 확률을 모두 넣으면 계산됩니다</span>'}</div>
      <table class="mini"><tr><th>경로</th><th style="width:150px">전체 대비 확률</th><th style="width:160px">발생 건 중 비율</th></tr>
      ${paths.map(x=>`<tr${x.out?' style="color:var(--red);font-weight:600"':''}><td>${esc(x.label)}</td><td>${ok?fmtP(x.p):'-'}</td><td>${ok&&P0>0?fmtP(x.p/P0):'-'}</td></tr>`).join('')}</table>`;
  }
};
function wsHTML(c,a){
  const t=toolOf(a.tool);
  const B=(act,label,attrs='',cls='btn sm')=>`<button class="${cls}" data-act="${act}" data-aid="${a.id}" ${attrs}>${label}</button>`;
  const body=(WS[a.tool]||(()=>''))(a);
  const concl=a.tool==='5why'
    ?`<div class="concl bar" style="margin-bottom:0">${B('anaApply','발생 줄기 마지막 답 → 발생 원인','data-src="occ" data-to="CauseOccur"')}${B('anaApply','유출 줄기 마지막 답 → 유출 원인','data-src="esc" data-to="CauseEscape"')}</div>`
    :`<div class="concl"><div class="fld"><label>이 도구로 얻은 결론</label>${TA(a,'concl',a.concl,'placeholder="검증으로 확인된 원인만 씁니다"')}</div>
       <div class="bar" style="margin:8px 0 0">${B('anaApply','→ 발생 원인에 추가','data-src="concl" data-to="CauseOccur"')}${B('anaApply','→ 유출 원인에 추가','data-src="concl" data-to="CauseEscape"')}${B('anaApply','→ 시스템 원인에 추가','data-src="concl" data-to="CauseSystem"')}</div></div>`;
  return `<div class="ws" id="ws_${a.id}">
    <div class="ws-h"><b>${esc(t.name)}</b><span class="muted">${esc(t.lv||'')} · ${esc(a.created)}</span><span style="flex:1"></span>
      ${a.collapsed?'':B('anaToggle',a.hideHow?'작성 방법 보기':'작성 방법 접기','data-k="hideHow"')}
      ${B('anaToggle',a.collapsed?'펼치기':'접기','data-k="collapsed"')}${B('anaDel','삭제','','btn sm danger')}</div>
    ${a.collapsed?'':`<div class="ws-b">${a.hideHow?'':`<div class="how"><ol>${t.how.map(h=>`<li>${esc(h)}</li>`).join('')}</ol></div>`}${body}${concl}</div>`}
  </div>`;
}
function causeHTML(c,tab,missSet){
  const rec=czNeedEsc(c)&&!czNeedOcc(c)?['eta','5why','isnot']:(REC[c.Tier]||[]),list=c.Analyses||[];
  const scopeF=tab.fields.find(f=>f.key==='RcaScope'),restF=tab.fields.filter(f=>f.key!=='RcaScope');
  const skipRca=c.RcaScope==='없음';
  const head=`<div class="grid" style="margin-bottom:12px">${czField(c,scopeF,missSet)}${czNeedEsc(c)?`<div class="fld w2"><label>유출 대책 빠른 등록</label><button class="btn" data-act="escActs">＋ 수입검사기준 개정 · 검사 강화 조치 등록</button><div class="hint">RCA 조치에 유출대책 · 문서개정 2건을 추가합니다</div></div>`:''}</div>`;
  if(skipRca)return head+`<div class="note">사내 분석 대상이 ‘없음’입니다. 원인은 협력사 대책서(NCR)로 받습니다. 사내에서 볼 부분이 생기면 위에서 대상을 바꾸십시오.</div><div class="grid">${restF.map(fd=>czField(c,fd,missSet)).join('')}</div>`;
  tab={...tab,fields:restF};
  return head+`<div class="sec-t">분석 도구 고르기 <span class="muted" style="font-weight:400">상황을 누르거나 도구 카드를 누르면 워크시트가 추가됩니다${rec.length?` · <span style="color:var(--grn)">권장</span> 표시는 ${czNeedEsc(c)&&!czNeedOcc(c)?'유출 분석':esc(c.Tier)} 기준`:''}</span></div>
    <div class="guide">${GUIDE.map(([s,k])=>`<span class="chip" data-act="addAna" data-tool="${k}">${esc(s)} → <b>${esc(toolOf(k).name)}</b></span>`).join('')}</div>
    <div class="tools">${TOOLS.map(t=>`<div class="tool" data-act="addAna" data-tool="${t.key}">${rec.includes(t.key)?'<span class="rec">권장</span>':''}<div class="nm">${esc(t.name)}<span class="lv">${t.lv}</span></div><div class="wh">${esc(t.when)}</div></div>`).join('')}</div>
    ${list.length?`<div class="sec-t">워크시트 ${list.length}개</div>`+list.map(a=>wsHTML(c,a)).join(''):(czNcrOk(c)?'':'<div class="note">아직 작성한 워크시트가 없습니다. 위에서 상황이나 도구를 고르십시오. 원인분석 단계를 넘기려면 워크시트가 1개 이상 필요합니다'+(c.NcrId?' (연결 NCR 대책서가 승인되면 불필요)':'')+'.</div>')}
    <div class="sec-t" style="margin-top:18px">원인 결론 <span class="muted" style="font-weight:400">워크시트 결론을 버튼으로 옮기거나 직접 씁니다</span></div>
    <div class="grid">${tab.fields.map(fd=>czField(c,fd,missSet)).join('')}</div>`;
}
async function anaClick(act,el){
  const c=czById('cases',czUi.caseId);if(!c)return;
  if(act==='addAna'){
    c.Analyses=c.Analyses||[];const a=blankAna(el.dataset.tool);c.Analyses.push(a);syncTools(c);touch(c);save();render();
    const w=document.getElementById('ws_'+a.id);if(w)w.scrollIntoView({behavior:'smooth',block:'start'});
    toast(`${toolOf(a.tool).name} 워크시트를 추가했습니다.`);return;
  }
  const a=(c.Analyses||[]).find(x=>String(x.id)===el.dataset.aid);if(!a)return;
  if(act==='anaToggle')a[el.dataset.k]=!a[el.dataset.k];
  else if(act==='anaDel'){
    const list=el.dataset.list,i=Number(el.dataset.i);
    if(!list){if(!await askConfirm({title:`${toolOf(a.tool).name} 워크시트를 삭제할까요?`,note:'삭제 후 10초 안에 되돌릴 수 있습니다.'}))return;
      const snap=await takeSnap();c.Analyses=c.Analyses.filter(x=>x!==a);syncTools(c);touch(c);save();render();offerUndo(snap,'워크시트를 삭제했습니다');return}
    else if(list==='nodes'){
      const kill=new Set([String(a.nodes[i].id)]);let grow=true;
      while(grow){grow=false;a.nodes.forEach(n=>{if(kill.has(String(n.parent))&&!kill.has(String(n.id))){kill.add(String(n.id));grow=true}})}
      a.nodes=a.nodes.filter(n=>!kill.has(String(n.id)));
    }
    else if(list==='ys'){a.ys.splice(i,1);a.xs.forEach(x=>x.s.splice(i,1))}
    else a[list].splice(i,1);
  }
  else if(act==='anaAdd'){
    const k=el.dataset.kind;
    if(k==='cand')a.cands.push({cause:'',basis:'',method:'',result:''});
    if(k==='tl')a.rows.push({t:'',ev:'',who:'',st:'정상',note:''});
    if(k==='tlc')a.changes.push({t:'',what:'',m4:'',impact:'',cause:''});
    if(k==='chg'){const cat=el.dataset.cat;let at=-1;a.items.forEach((x,i)=>{if(x.cat===cat)at=i});a.items.splice(at<0?a.items.length:at+1,0,{cat,item:'',before:'',after:'',impact:'',check:''})}
    if(k==='fb')a.rows.push({cat:el.dataset.cat,text:'',flag:''});
    if(k==='node'){a.nid=(a.nid||0)+1;a.nodes.push({id:a.nid,parent:el.dataset.parent,label:'',gate:'OR',p:'',likely:'',v:''})}
    if(k==='x')a.xs.push({name:'',s:a.ys.map(()=>'')});
    if(k==='y'){a.ys.push({name:'',w:'5'});a.xs.forEach(x=>x.s.push(''))}
    if(k==='sf')a.sfs.push({name:'',pf:''});
  }
  else if(act==='anaApply'){
    const src=el.dataset.src,to=el.dataset.to;
    let txt=src==='concl'?a.concl:[...(a[src]||[])].reverse().find(v=>has(v));
    if(!has(txt)){toast('옮길 내용이 없습니다. 먼저 워크시트를 작성하십시오.');return}
    txt=String(txt).trim();const cur=c[to]||'';
    if(cur.includes(txt)){toast('이미 반영된 내용입니다.');return}
    c[to]=(cur?cur+'\n':'')+`[${toolOf(a.tool).name}] `+txt;toast('원인 결론에 반영했습니다.');
  }
  a.updatedAt=now();touch(c);save();render();
}
function anaReport(c){
  const L=c.Analyses||[];if(!L.length)return '';
  return '<table>'+L.map(a=>{const v=a.tool==='5why'?`문제: ${a.problem||''}\n발생: ${a.occ.filter(has).join(' → ')}\n유출: ${a.esc.filter(has).join(' → ')}`:(a.concl||'(결론 미작성)');
    return `<tr><th>${esc(toolOf(a.tool).name)}</th><td class="pre">${esc(v)}</td></tr>`}).join('')+'</table>';
}

/* ---------- 입력 중 재렌더 (버튼 클릭 유실 · 포커스 이동 방지) ---------- */
let czPending=false,czMouse=false;
function czFkey(el){
  if(!el||!el.dataset||!el.dataset.scope)return null;
  return ['scope','f','id','aid','path','multi'].filter(k=>el.dataset[k]!==undefined).map(k=>`[data-${k}="${CSS.escape(el.dataset[k])}"]`).join('')+(el.type==='checkbox'?`[value="${CSS.escape(el.value)}"]`:'');
}
function czSoft(){
  if(czMouse){czPending=true;return}
  setTimeout(()=>{czPending=false;if(state.tab!=='case')return;const k=czFkey(document.activeElement);const y=window.scrollY;render();window.scrollTo(0,y);if(k){const n=document.querySelector(k);if(n)n.focus()}},0);
}
document.addEventListener('mousedown',()=>{czMouse=true},true);
document.addEventListener('mouseup',()=>{czMouse=false;if(czPending)setTimeout(()=>{if(czPending){czPending=false;czSoft()}},0)},true);

/* ---------- 상태 ---------- */
const czUi={view:'today',caseId:null,tab:'basic',showGate:false,filt:{q:'',stage:'',tier:'',status:'미종결',ball:'',late:''},actFilt:'open',histOwn:false};
function czCounts(){
  const t=today(),open=db.cases.filter(c=>c.Status==='진행중'||c.Status==='보류');
  return {mine:open.filter(c=>c.Ball==='나'&&has(c.RecheckDate)&&c.RecheckDate<=t).length,
    chase:open.filter(c=>c.Ball!=='나'&&has(c.RecheckDate)&&c.RecheckDate<=t).length,
    lateActs:db.actions.filter(a=>!['완료','취소'].includes(a.ActionStatus)&&has(a.DueDate)&&a.DueDate<t&&czCaseOpenId(a.CaseId)).length,
    open:open.length,t3:open.filter(c=>c.Tier==='TIER 3').length};
}
function czBadgeN(){const k=czCounts();let p=0;try{p=progCases().filter(c=>c.kind!=='rca'&&c.next&&c.next.nextDate<today()).length}catch(e){}return k.mine+k.chase+k.lateActs+p}
function czGo(v){state.tab='case';czUi.view=v;render();window.scrollTo(0,0)}
async function czOpenCase(id,tab){
  if($('#modal').classList.contains('on')){if(mfDirty&&!await askConfirm({title:'작성 중인 내용을 저장하지 않고 이동할까요?',ok:'이동',danger:false}))return;closeModal(true)}
  state.tab='case';czUi.view='case';czUi.caseId=id;czUi.tab=tab||'basic';czUi.showGate=false;render();window.scrollTo(0,0);
}
const czBall=b=>`<span class="ball ${b==='나'?'me':''}">${esc(b||'-')}</span>`;
function czDate(d,closed){if(!has(d))return '<span class="muted">-</span>';if(closed)return esc(d);const t=today();return d<t?`<span class="late">${esc(d)}</span>`:d===t?`<span class="today">${esc(d)}</span>`:esc(d)}
function czPartLabel(c){const p=czPart(c);return p?`${esc(p.partNo)} <span class="muted">${esc(p.name)}</span>`:'<span class="muted">-</span>'}
const czSup=id=>supName(id)?esc(supName(id)):'<span class="muted">-</span>';

/* ---------- 화면 ---------- */
function czRender(){
  const k=czCounts(),v=czUi.view;
  const P=progCases(),pod=P.filter(c=>c.kind!=='rca'&&c.next&&c.next.nextDate<today()).length;
  const seg=[['today','오늘 할 일',k.mine+k.chase+pod],['prog','진행 중 전체',0],['cases','RCA 목록',0],['actions','조치',k.lateActs]];
  const bar=`<div class="cz"><div class="bar noprint"><div class="seg">${seg.map(([x,l,n])=>`<a class="${v===x||(x==='cases'&&v==='case')?'on':''}" data-act="czNav" data-v="${x}">${l}${n?` <span class="bg bad" style="font-size:10.5px">${n}</span>`:''}</a>`).join('')}</div><span class="grow"></span><button class="btn pri" data-act="newCase">+ 새 RCA</button></div>`;
  if(v==='prog')return bar+'</div>'+renderProg();
  const body=v==='case'?czViewCase():v==='cases'?czViewCases():v==='actions'?czViewActions():czViewToday();
  return bar+body+'</div>';
}
function czStartCard(){return `<div class="card start"><h2>RCA · 사내 8D</h2>
    <p class="sub" style="margin:0">사내 문제의 원인분석(RCA)과 공정 개선 · 내부 8D를 관리합니다. 공 · 다음 행동 · 재확인일과 IATF 단계 게이트로 끝까지 추적합니다.<br>
    <b>불량 관리</b>의 진행 보기나 <b>NCR / 8D</b> 목록에서 ‘RCA 요청’을 누르면 불량 정보·심각도가 그대로 채워집니다.</p>
    <div class="btns"><button class="btn pri" data-act="newCase">RCA 바로 등록</button><button class="btn" onclick="go('defect')">불량 관리로 가기</button><button class="btn" onclick="state.setTab='backup';go('data')">PHA QMS 백업 가져오기</button></div></div>`;}
function czViewToday(){
  const t=today(),k=czCounts(),open=db.cases.filter(c=>c.Status==='진행중'||c.Status==='보류');
  const mine=open.filter(c=>c.Ball==='나'&&has(c.RecheckDate)&&c.RecheckDate<=t).sort((a,b)=>a.RecheckDate.localeCompare(b.RecheckDate));
  const chase=open.filter(c=>c.Ball!=='나'&&has(c.RecheckDate)&&c.RecheckDate<=t).sort((a,b)=>a.RecheckDate.localeCompare(b.RecheckDate));
  const due=db.actions.filter(a=>!['완료','취소'].includes(a.ActionStatus)&&has(a.DueDate)&&a.DueDate<=addDays(t,3)&&czCaseOpenId(a.CaseId)).sort((a,b)=>a.DueDate.localeCompare(b.DueDate));
  const pd=progCases().filter(c=>c.kind!=='rca'&&c.next&&diffDays(t,c.next.nextDate)<=3).sort((a,b)=>a.next.nextDate.localeCompare(b.next.nextDate));
  const jd=db.defects.filter(d=>invOpen(d)&&!czOwns(d,'defect')&&invInfo(d).k==='judge');
  const pItem=c=>`<div class="list-item"><span class="bg ${c.kind==='ncr'?'inf':'mut'}">${c.kind==='ncr'?'NCR':'불량'}</span><div class="grow"><div class="t" onclick="openCase('${c.kind}','${c.id}')">${esc(c.title)}</div><div class="d">${esc(c.next.next)} · ${esc(c.sup)}</div></div><span style="min-width:84px;text-align:right">${czDate(c.next.nextDate)}</span></div>`;
  const caseItem=c=>`<div class="list-item"><span class="badge ${czTierCls(c.Tier)}">${esc(c.Tier||'-')}</span>
    <div class="grow"><div class="t" data-act="open" data-id="${c.id}">${esc(c.CaseNo)} · ${esc(c.Title||'(제목 없음)')}</div><div class="d">${esc(c.Stage)} · ${esc(c.NextAction||'다음 행동 미입력')}</div></div>
    ${czBall(c.Ball)} <span style="min-width:84px;text-align:right">${czDate(c.RecheckDate)}</span><button class="btn sm" data-act="bump" data-id="${c.id}" title="재확인일을 오늘+2일로">+2일</button></div>`;
  const actItem=a=>{const c=czById('cases',a.CaseId);return `<div class="list-item"><div class="grow"><div class="t" data-act="open" data-id="${a.CaseId}" data-tab="actions">${esc(a.Title||'(내용 없음)')}</div>
    <div class="d">${esc(a.Category)} · ${c?esc(c.CaseNo):''} · ${esc(a.Assignee||a.ExternalOwner||'담당 미지정')}</div></div>
    <span style="min-width:84px;text-align:right">${czDate(a.DueDate)}</span><button class="btn sm" data-act="actDone" data-id="${a.id}">완료</button></div>`};
  return `<h1>오늘 할 일</h1><p class="sub">${t} · RCA · NCR · 불량의 오늘 챙길 일을 한 곳에 모았습니다. 기한이 지난 건부터 처리하십시오.</p>
    <div class="kpis">
      <div class="kpi" data-act="czNav" data-v="cases"><div class="l">진행 중 RCA</div><div class="v">${k.open}</div></div>
      <div class="kpi ${k.mine?'bad':'ok'}"><div class="l">오늘 내가 볼 RCA</div><div class="v">${k.mine}</div></div>
      <div class="kpi ${k.lateActs?'bad':'ok'}" data-act="czNav" data-v="actions"><div class="l">기한 지난 조치</div><div class="v">${k.lateActs}</div></div>
      <div class="kpi ${pd.filter(c=>c.next.nextDate<t).length?'bad':'ok'}" data-act="czNav" data-v="prog"><div class="l">협력사 · 불량 기한 초과</div><div class="v">${pd.filter(c=>c.next.nextDate<t).length}</div></div></div>
    <div class="two"><div>
      <div class="card"><h3>공이 나에게 있음 <span class="muted">${mine.length}건</span></h3>${mine.length?mine.map(caseItem).join(''):'<div class="empty">오늘 확인할 RCA가 없습니다.</div>'}</div>
      <div class="card"><h3>회신 독촉 필요 <span class="muted">공이 밖에 있고 재확인일 도래 · ${chase.length}건</span></h3>${chase.length?chase.map(caseItem).join(''):'<div class="empty">독촉할 RCA가 없습니다.</div>'}</div></div>
      <div><div class="card"><h3>협력사 · 불량 기한 <span class="muted">NCR 회신 · 유효성 · FAR · 사내 대책 · 3일 이내 ${pd.length}건</span></h3>${pd.length?pd.map(pItem).join(''):'<div class="empty">임박한 기한이 없습니다.</div>'}</div>
      <div class="card"><h3>기한 임박 · 초과 조치 <span class="muted">RCA 조치 · 3일 이내 ${due.length}건</span></h3>${due.length?due.map(actItem).join(''):'<div class="empty">임박한 조치가 없습니다.</div>'}</div>
      ${jd.length?`<div class="card"><h3>귀책 판정 대기 <span class="muted">FAR 회신 · RCA 결과가 나온 귀책 미정 건 · ${jd.length}건</span></h3>${jd.map(d=>`<div class="list-item"><div class="grow"><div class="t" onclick="editDefect('${d.id}')">${esc(defLabel(d))}</div><div class="d">${esc(supName(d.supplierId))} · FAR 회신 ${esc(d.inv.farRecv||'-')}</div></div></div>`).join('')}</div>`:''}</div></div>
    ${db.cases.length?'':czStartCard()}`;
}
function czViewCases(){
  const f=czUi.filt,t=today();let rows=db.cases.slice();
  if(f.status)rows=rows.filter(c=>f.status==='미종결'?!['종결','취소'].includes(c.Status):c.Status===f.status);
  if(f.late)rows=rows.filter(c=>lateInfo('rca',c).length);
  if(f.stage)rows=rows.filter(c=>c.Stage===f.stage);if(f.tier)rows=rows.filter(c=>c.Tier===f.tier);if(f.ball)rows=rows.filter(c=>c.Ball===f.ball);
  if(f.q){const q=f.q.toLowerCase();rows=rows.filter(c=>{const p=czPart(c);return [c.CaseNo,c.Title,c.LegacyNo,c.Description,p&&p.partNo,p&&p.name,supName(c.SupplierId)].some(v=>String(v||'').toLowerCase().includes(q))})}
  rows.sort((a,b)=>(b.Created||'').localeCompare(a.Created||'')||(b.CaseNo||'').localeCompare(a.CaseNo||''));
  const sel=(key,list,label)=>`<select data-act="filt" data-k="${key}" style="width:auto">${[['',label]].concat(list.map(x=>[x,x])).map(([v,l])=>`<option value="${esc(v)}" ${f[key]===v?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  return `<h1>RCA · 사내 8D</h1><p class="sub">사내 원인분석(RCA)과 내부 8D 목록입니다. 불량·NCR과 연결해 두면 비용·협력사 대책서 진행이 함께 보입니다.</p>
    <div class="bar"><input type="text" placeholder="번호 · 제목 · 부품 · 협력사 검색" value="${esc(f.q)}" data-act="filtq" style="max-width:280px">
      ${sel('status',['미종결','진행중','보류','종결','취소'],'상태 전체')}${sel('stage',CZ_STAGES,'단계 전체')}${sel('tier',['TIER 3','TIER 2','TIER 1','TIER 0'],'TIER 전체')}${sel('ball',CZ_OPT.Ball,'공 전체')}<select data-act="filt" data-k="late" style="width:auto"><option value="">지연 전체</option><option value="1" ${f.late?'selected':''}>지연만</option></select>
      <span class="grow"></span><span class="muted" style="font-size:12px">SharePoint 이전용 CSV</span>${['cases','actions','parts','suppliers'].map(l=>`<button class="btn sm" data-act="csv" data-list="${l}">${l[0].toUpperCase()+l.slice(1)}</button>`).join('')}</div>
    <div class="tw"><table class="t"><thead><tr><th>RCA 번호</th><th>제목</th><th>부품</th><th>협력사</th><th>연결</th><th>TIER</th><th>단계</th><th>상태</th><th>공</th><th>다음 행동</th><th>재확인일</th><th>목표 종결</th><th class="num">경과일</th></tr></thead>
    <tbody>${rows.length?rows.map(c=>{const closed=['종결','취소'].includes(c.Status),n=c.NcrId&&db.ncrs.find(x=>x.id===c.NcrId),nd=(c.DefectIds||[]).length,lt=lateInfo('rca',c);return `<tr class="click${lt.length?' late':''}" data-act="open" data-id="${c.id}">
      <td class="mono">${esc(c.CaseNo)}</td><td>${esc(c.Title)}</td><td>${czPartLabel(c)}</td><td>${czSup(c.SupplierId)}</td>
      <td style="white-space:nowrap">${n?`<span class="bg inf">${esc(n.no)}</span> `:''}${nd?`<span class="bg mut">불량 ${nd}</span>`:''}</td>
      <td><span class="badge ${czTierCls(c.Tier)}">${esc(c.Tier||'-')}</span></td><td>${esc(c.Stage)}</td><td><span class="badge ${czStCls(c.Status)}">${esc(c.Status)}</span></td><td>${czBall(c.Ball)}</td>
      <td style="max-width:240px">${esc(c.NextAction)}</td><td>${czDate(c.RecheckDate,closed)}</td><td style="white-space:nowrap">${closed?`<span class="muted">${esc(c.CloseDate||'')}</span>`:czDate(czTarget(c))}${lateBadge(lt)?'<br>'+lateBadge(lt):''}</td><td class="num">${has(c.Created)?diffDays(c.Created,closed&&has(c.CloseDate)?c.CloseDate:t):''}</td></tr>`}).join(''):'<tr><td colspan="13" class="empty">조건에 맞는 RCA가 없습니다.</td></tr>'}</tbody></table></div>`;
}
function czField(c,fd,missSet){
  if(fd.showIf&&!fd.showIf(c))return '';
  const ds=(c.DefectIds||[]).map(i=>db.defects.find(d=>d.id===i)).filter(Boolean);
  if(ds.length&&fd.key==='DefectQty')return `<div class="fld"><label>${esc(fd.label)}</label><div class="calc"><b>${num(c.DefectQty).toLocaleString()}</b> <span class="muted">연결 불량 ${ds.length}건 합계</span></div><div class="hint">불량 관리에서 수정하면 자동 반영</div></div>`;
  if(ds.length&&fd.key==='Disposition'){const dp=ds.map(d=>d.disposition||'미정'),u=[...new Set(dp)];
    if(u.length===1&&CZ_OPT.Disposition.includes(u[0])&&u[0]!=='미정')return `<div class="fld ${missSet.has(fd.key)?'miss':''}"><label>${esc(fd.label)}</label><div class="calc"><b>${esc(u[0])}</b></div><div class="hint">연결 불량의 ‘처리’ — 불량 관리에서 수정</div></div>`;
    fd=Object.assign({},fd,{hint:'연결 불량 처리: '+u.map(x=>`${x} ${dp.filter(y=>y===x).length}`).join(' · ')+(u.includes('미정')?' — 불량의 처리를 입력하면 자동 반영':' — 처리가 섞여 있어 RCA 처분은 직접 고릅니다')})}
  const v=c[fd.key],id=`czf_${fd.key}`,attr=`id="${id}" data-scope="case" data-f="${fd.key}"`;let inp='';
  switch(fd.type){
    case 'text':inp=`<input type="text" ${attr} value="${esc(v)}"${fd.list?` list="${fd.list}"`:''}>`;break;
    case 'number':inp=`<input type="number" ${attr} value="${esc(v)}">`;break;
    case 'date':inp=`<input type="date" ${attr} value="${esc(v)}">`;break;
    case 'textarea':inp=`<textarea ${attr}>${esc(v)}</textarea>`;break;
    case 'select':inp=`<select ${attr}>${czOptHTML(CZ_OPT[fd.opt],v)}</select>`;break;
    case 'part':{const p=czPart(c);inp=`<input type="text" ${attr} data-combo="parts" autocomplete="off" value="${p?esc(p.partNo):''}" placeholder="번호·품명·협력사로 검색">`;
      if(p)inp+=`<div class="hint">${esc(p.name)}${p.model?' · '+esc(p.model):''}${p.safety&&p.safety!=='해당없음'?` · <b style="color:var(--red)">${esc(p.safety)}</b>`:''}</div>`;break}
    case 'supplier':inp=`<select ${attr}>${supOpts(v)}</select>`;break;
    case 'case':inp=`<select ${attr}>${czOptHTML([['','-']].concat(db.cases.filter(x=>x.id!==c.id).sort((a,b)=>(b.CaseNo||'').localeCompare(a.CaseNo||'')).map(x=>[x.id,`${x.CaseNo} ${x.Title||''}`])),v)}</select>`;break;
    case 'calc':{let t='';
      if(fd.key==='TierAuto'){const a=czTierAuto(c);t=a?`<span class="badge ${czTierCls(a)}">${a}</span> <span class="muted">S×I = ${num(c.SevS)*num(c.ImpI)}</span>`:'<span class="muted">S·I 선택 시 계산</span>';if(czFull8D(c))t+=`<div class="hint" style="color:var(--amb)">대응방향 8D — 효과검증·표준화까지 전체 단계 적용</div>`}
      if(fd.key==='FARDue')t=has(c.FARIssueDate)?`${addDays(c.FARIssueDate,3)} / ${addDays(c.FARIssueDate,7)} / ${addDays(c.FARIssueDate,14)}`:'<span class="muted">발행일 입력 시 계산</span>';
      if(fd.key==='FARTotal'){const s=czFar(c);t=`<b>${s}</b> / 30 · ${s>=24?'<span style="color:var(--grn)">합격</span>':s>=15?'<span style="color:var(--amb)">조건부</span>':'<span style="color:var(--red)">불합격</span>'}`}
      inp=`<div class="calc">${t}</div>`;break}
  }
  return `<div class="fld ${fd.w===2?'w2':fd.w===4?'w4':''} ${missSet.has(fd.key)?'miss':''}"><label for="${id}">${esc(fd.label)}</label>${inp}${fd.hint?`<div class="hint">${esc(typeof fd.hint==='function'?fd.hint(c):fd.hint)}</div>`:''}</div>`;
}
/* 연결된 불량 · NCR */
function czLinkHTML(c){
  const ds=(c.DefectIds||[]).map(i=>db.defects.find(d=>d.id===i)).filter(Boolean);
  const n=c.NcrId?db.ncrs.find(x=>x.id===c.NcrId):null;
  const cost=ds.reduce((a,d)=>a+costTotal(d),0),os=ds.reduce((a,d)=>a+outstanding(d),0);
  const candD=db.defects.filter(d=>!d.caseId&&(!c.SupplierId||d.supplierId===c.SupplierId)).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,80);
  const candN=db.ncrs.filter(x=>!x.caseId&&(!c.SupplierId||x.supplierId===c.SupplierId)).sort((a,b)=>(b.issueDate||'').localeCompare(a.issueDate||'')).slice(0,80);
  return `<div class="lkbox"><div class="sec-t" style="margin-bottom:6px">연결된 불량 · NCR <span class="muted" style="font-weight:400">비용·구상은 불량 기록에서, 대책서 회신·평가는 NCR에서 관리합니다</span></div>
    <div class="row" style="gap:8px;margin-bottom:6px"><b style="font-size:12.5px">NCR</b>${n?`<a class="bg inf" style="cursor:pointer" onclick="editNcr('${n.id}')">${esc(n.no)}</a> ${stB(ncrStatus(n))} <span class="muted" style="font-size:12px">${esc(n.reqType||'')} · 회신 기한 ${esc(n.dueDate||'-')}${n.replyDate?' · 회신 '+esc(n.replyDate):''}${n.evalVerdict?` · 평가 ${n.evalScore}점 ${esc(n.evalVerdict)}`:''}</span> ${farBadge(n)}${farOn(n)&&n.far.verdict?` <span class="muted" style="font-size:12px">FAR 판정: ${esc(n.far.verdict)}</span>`:''} <button class="btn sm" data-act="unlinkNcr">연결 해제</button>`
      :`<span class="muted" style="font-size:12px">없음</span>${candN.length?`<select id="czLinkN"><option value="">— 기존 NCR 연결 —</option>${candN.map(x=>`<option value="${x.id}">${esc(x.no)} · ${esc(x.issueDate)} · ${esc(x.title)}</option>`).join('')}</select><button class="btn sm" data-act="linkNcr">연결</button>`:''}${ds.length?`<button class="btn sm pri" data-act="issueNcr">연결 불량으로 NCR 발행</button>`:''}`}</div>
    ${ds.length?`<table><tbody>${ds.map(d=>`<tr><td style="white-space:nowrap">${esc(d.date)}</td><td>${esc(d.partNo)} ${esc(d.partName)}</td><td>${esc(d.type)}</td><td class="num" style="text-align:right">${num(d.qty).toLocaleString()}개</td><td>${sevBadge(d)}</td><td>${stageBadges(d).replace('<br>',' ')}</td><td style="text-align:right;white-space:nowrap">${costTotal(d)?won(costTotal(d))+'원':''}</td><td style="white-space:nowrap"><button class="btn sm" onclick="openLog('${d.id}')">진행 보기</button> <button class="btn sm" data-act="unlinkDef" data-did="${d.id}">해제</button></td></tr>`).join('')}</tbody></table>
      <div class="muted" style="font-size:12px;margin-top:4px">불량 ${ds.length}건 · 수량 ${sum(ds,'qty').toLocaleString()}개${cost?` · 실패비용 ${won(cost)}원`:''}${os?` · <span style="color:var(--red)">구상 미회수 ${won(os)}원</span>`:''}</div>`:'<div class="muted" style="font-size:12px">연결된 불량 없음</div>'}
    ${candD.length?`<div class="row" style="margin-top:6px;gap:6px"><select id="czLinkD"><option value="">— 불량 추가 연결${c.SupplierId?' (같은 협력사)':''} —</option>${candD.map(d=>`<option value="${d.id}">${esc(d.date)} · ${esc(d.partNo)} ${esc(d.partName)} · ${esc(d.type)} · ${num(d.qty)}개</option>`).join('')}</select><button class="btn sm" data-act="linkDef">추가</button></div>`:''}</div>`;
}
function czViewCase(){
  const c=czById('cases',czUi.caseId);if(!c){czUi.view='cases';return czViewCases()}
  const p=czPath(c),ns=czNext(c),ps=czPrev(c),closed=c.Status==='종결'||c.Status==='취소';
  const missing=ns?czGate(c,ns):[];
  const missSet=new Set(czUi.showGate?missing.map(r=>r.f).filter(Boolean):[]),missTabs=new Set(czUi.showGate?missing.map(r=>r.tab):[]);
  const ci=CZ_STAGES.indexOf(c.Stage);
  const pi=p.indexOf(c.Stage);
  const stages=CZ_STAGES.map((s,i)=>{const inP=p.includes(s),cls=!inP?'skip':i<ci?'done':i===ci?'cur':'',isN=!closed&&s===ns,far=inP&&Math.abs(p.indexOf(s)-pi)>1?' far':'';
    const d=inP&&i<=ci?czStageDate(c,s):'',stay=i===ci&&!closed&&d?Math.max(0,diffDays(d,today())):null;
    const sub=stay!=null?`${d.slice(5)} · ${stay}일째`:d?d.slice(5):isN&&missing.length?'남은 조건':'';
    return `<div class="stg ${cls}${isN?' nx':''}${far}" ${isN?`data-act="showGate" title="누르면 ${esc(s)} 단계로 가기 위해 남은 조건을 봅니다"`:`title="${inP?(d?`${esc(s)} 시작 ${d}`:''):'이 TIER에서는 건너뜀'}"`}>${i<ci&&inP?'✓ ':''}${s}${isN&&missing.length?`<span class="gc">${missing.length}</span>`:''}${sub?`<small>${sub}</small>`:''}</div>`}).join('');
  const tabs=CZ_TABS.filter(t=>!t.showTab||t.showTab(c)),tab=tabs.find(t=>t.id===czUi.tab)||tabs[0];
  let body='';
  if(tab.id==='actions')body=czNcrNote(c,'actions')+czCaseActions(c);
  else if(tab.id==='hist')body=czHistHTML(c);
  else if(tab.id==='cause')body=czNcrNote(c,'cause')+czVerdictBox(c)+causeHTML(c,tab,missSet);
  else body=(tab.id==='basic'?czLinkHTML(c):'')+(tab.id==='verify'?czNcrNote(c,'verify'):'')+(tab.note?`<div class="note">${esc(tab.note)}</div>`:'')+`<div class="grid">${tab.fields.map(fd=>czField(c,fd,missSet)).join('')}</div>`;
  const nOpen=czActs(c).filter(a=>!['완료','취소'].includes(a.ActionStatus)).length;
  const n=c.NcrId?db.ncrs.find(x=>x.id===c.NcrId):null,ds=(c.DefectIds||[]).map(i=>db.defects.find(d=>d.id===i)).filter(Boolean),cost=ds.reduce((a,d)=>a+costTotal(d),0);
  return `<div class="bar noprint"><button class="btn sm" data-act="czNav" data-v="cases">← RCA 목록</button></div>
    <div class="chead"><div class="r1"><span class="mono">${esc(c.CaseNo)}</span><span class="badge ${czTierCls(c.Tier)}">${esc(c.Tier||'TIER 미정')}</span><span class="badge ${czStCls(c.Status)}">${esc(c.Status)}</span>${!closed&&czTarget(c)?(()=>{const t=czTarget(c),k=diffDays(today(),t);return `<span class="bg ${k<0?'bad':k<=7?'warn':'mut'}" title="${has(c.TargetClose)?'직접 입력한 목표 종결일':`등록일 + ${esc(c.Tier||'TIER')} 기준 ${czDays(c)}일 (기본 탭에서 바꿀 수 있음)`}">목표 종결 ${t} ${k<0?'D+'+(-k):k===0?'오늘':'D-'+k}</span>`})():''}
      <h2>${esc(c.Title||'(제목 없음)')}</h2><select data-scope="case" data-f="Status">${czOptHTML(CZ_OPT.Status,c.Status)}</select>
      <button class="btn" data-act="a3">A3 보고서</button><button class="btn" data-act="report">8D 보고서</button>
      ${ps&&!closed?`<button class="btn" data-act="stagePrev">← ${esc(ps)}</button>`:''}
      ${closed?`<button class="btn" data-act="reopen">다시 열기</button>`:ns?`<button class="btn pri" data-act="stageNext">${ns==='종결'?'종결 처리':esc(ns)+'(으)로 →'}</button>`:''}</div>
      ${n||ds.length?`<div class="lnk">${n?`<a class="bg inf" style="cursor:pointer" onclick="editNcr('${n.id}')">${esc(n.no)} · ${esc(ncrStatus(n))}</a>`:''}${ds.length?`<span class="bg mut">불량 ${ds.length}건 · ${sum(ds,'qty').toLocaleString()}개</span>`:''}${ds.length?(()=>{const g=ds.map(d=>sevOf(d).grade).sort()[0];return `<span class="bg ${SEV_CLS[g]}">불량 심각도 ${g}</span>`})():''}${cost?`<span class="bg mut">비용 ${won(cost)}원</span>`:''}${c.RcaScope?`<span class="bg ${c.RcaScope==='없음'?'mut':'warn'}">사내 분석: ${esc(CZ_RCA_LBL[c.RcaScope])}</span>`:''}</div>`:c.RcaScope?`<div class="lnk"><span class="bg ${c.RcaScope==='없음'?'mut':'warn'}">사내 분석: ${esc(CZ_RCA_LBL[c.RcaScope])}</span></div>`:''}
      <div class="stages">${stages}</div>
      <div class="flow"><div><label>공</label><select data-scope="case" data-f="Ball" class="${missSet.has('NextAction')?'miss':''}">${czOptHTML(CZ_OPT.Ball,c.Ball)}</select></div>
        <div><label>다음 행동</label><input type="text" data-scope="case" data-f="NextAction" value="${esc(c.NextAction)}"></div>
        <div><label>재확인일</label><input type="date" data-scope="case" data-f="RecheckDate" value="${esc(c.RecheckDate)}"></div>
        <div><button class="btn" data-act="bump" data-id="${c.id}">+2일</button></div></div>
      ${czUi.showGate&&missing.length?`<div class="gate"><b>${esc(ns)} 단계로 넘어가려면 ${missing.length}개 항목이 필요합니다.</b><ul>${missing.map(r=>`<li><a data-act="gotoTab" data-tab="${r.tab}" data-f="${r.f||''}">${esc(r.t)}</a></li>`).join('')}</ul></div>`:''}</div>
    <div class="tabs">${tabs.map(t=>`<div class="tab ${t.id===tab.id?'on':''}" data-act="tab" data-tab="${t.id}">${t.label}${t.id==='actions'?` (${nOpen}/${czActs(c).length})`:''}${t.id==='cause'&&(c.Analyses||[]).length?` (${c.Analyses.length})`:''}${t.id==='hist'&&(c.Log||[]).length?` (${c.Log.length})`:''}${missTabs.has(t.id)?'<span class="dot"></span>':''}</div>`).join('')}</div>
    <div class="card">${body}</div>
    <div class="bar"><span class="grow"></span><button class="btn sm danger" data-act="delCase">RCA 삭제</button></div>`;
}
// RCA 원인분석 결론 → 연결 불량의 귀책 판정 (귀책 조사와 연결)
const czCauseSum=c=>[c.CauseOccur&&'발생: '+String(c.CauseOccur).trim(),c.CauseEscape&&'유출: '+String(c.CauseEscape).trim()].filter(Boolean).join(' / ');
function czVerdictBox(c){
  const ds=(c.DefectIds||[]).map(i=>db.defects.find(d=>d.id===i)).filter(Boolean);if(!ds.length)return '';
  const pend=d=>!(d.inv&&d.inv.verdict)&&(d.resp==='미정'||!!d.inv);
  if(!ds.some(d=>pend(d)||(d.inv&&d.inv.verdict)))return '';
  const sum=czCauseSum(c),noCause=!String(c.CauseOccur||'').trim();
  const rows=ds.filter(d=>d.resp==='미정'||d.inv).map(d=>{const iv=d.inv||{},p=pend(d);
    return `<label class="vrow"><input type="checkbox" value="${d.id}" ${p?'checked':''}><span><b>${esc(defLabel(d))}</b> <span class="muted">${esc(supName(d.supplierId)||'협력사 미지정')}</span></span>
      <span class="badge ${iv.verdict?'st-done':'st-hold'}">${iv.verdict?`판정: ${esc(iv.verdict)}`:esc(invInfo(d).label)}</span></label>`}).join('');
  const allDone=!ds.some(pend);
  return `<details class="vbox" id="czVerdict" ${allDone?'':'open'}><summary><b>귀책 판정 반영</b> <span class="muted">— 원인분석 결론으로 연결된 불량의 귀책을 판정합니다 (귀책 조사 종료)</span>${allDone?' <span class="badge st-done">판정 완료</span>':''}</summary>
    <div class="vlist">${rows}</div>
    <div class="vsum">${sum?`<b>판정 근거</b> RCA ${esc(c.CaseNo)} — ${esc(sum.length>160?sum.slice(0,160)+'…':sum)}`:'<span style="color:var(--amb)">아래 <b>발생 원인</b>을 먼저 입력하세요. 원인이 판정 근거로 기록됩니다.</span>'}</div>
    <div class="vbtn"><button class="btn" onclick="czApplyVerdict('${c.id}','사내')" ${noCause?'disabled':''}>사내 귀책</button><button class="btn" onclick="czApplyVerdict('${c.id}','협력사')" ${noCause?'disabled':''}>협력사 귀책</button>
      <span class="vshare"><button class="btn" onclick="czApplyVerdict('${c.id}','공동')" ${noCause?'disabled':''}>공동 귀책</button> 협력사 부담 <input type="number" id="czShare" min="0" max="100" style="width:70px" placeholder="%"> %</span>
      <button class="btn" onclick="czApplyVerdict('${c.id}','원인 불명')">원인 불명</button></div></details>`;
}
async function czApplyVerdict(cid,v){
  const c=czById('cases',cid);if(!c)return;
  const ids=[...document.querySelectorAll('#czVerdict .vlist input:checked')].map(x=>x.value);
  if(!ids.length){toast('판정할 불량을 선택하세요');return}
  let share='';if(v==='공동'){const e=$('#czShare');share=e&&e.value!==''?Math.max(0,Math.min(100,num(e.value))):'';if(share===''){toast('공동 귀책은 협력사 부담 비율(%)을 입력하세요');e&&e.focus();return}}
  const ds=ids.map(i=>db.defects.find(d=>d.id===i)).filter(Boolean),sum=czCauseSum(c);
  const basis=`RCA ${c.CaseNo} 원인분석 결론${sum?' — '+sum:''}`.slice(0,300);
  const next={'협력사':'원인 부품 기준으로 NCR을 발행합니다','사내':'이 RCA로 사내 대책을 진행합니다','공동':`협력사 ${share}% 분담 · NCR 발행과 사내 대책을 함께 진행합니다`,'원인 불명':'불량은 완료 처리되고, 재발하면 다시 조사합니다'}[v];
  if(!await askConfirm({title:`귀책을 ‘${v}’(으)로 판정할까요?`,items:ds.map(d=>`${esc(defLabel(d))}${d.inv&&d.inv.verdict?` <span class="muted">(기존 판정 ${esc(d.inv.verdict)} → ${esc(v)})</span>`:''}`),msg:`판정 근거: ${esc(basis)}`,note:`다음 단계 — ${next}`,ok:'판정',danger:false}))return;
  ds.forEach(d=>{d.inv={...(d.inv||{}),verdict:v,verdictDate:today(),basis,...(v==='공동'?{share}:{})};d.resp=VERDICT_RESP[v]||d.resp;touch(d)});
  czLog(c,'귀책 판정',`${v}${v==='공동'?` (협력사 ${share}%)`:''} — 불량 ${ds.length}건`);touch(c);
  save();render();
  const noPart=v!=='사내'&&v!=='원인 불명'&&ds.some(d=>!d.partNo);
  toast(`불량 ${ds.length}건 귀책 판정: ${v}${noPart?' — 원인 부품번호가 없는 불량은 지정 후 NCR을 발행하세요':''}`);
  setTimeout(()=>offerNcrAfterVerdict(ds.map(d=>d.id),v),350);
}
function czNcrNote(c,where){
  const n=czNcr(c);if(!n)return '';const st=ncrStatus(n),ok=czNcrOk(c),open=`<a class="lk" style="cursor:pointer" onclick="editNcr('${n.id}')">${esc(n.no)}</a>`;
  const M={cause:(ok?`협력사 대책서가 승인되어 ${open}의 D4 원인을 발생 원인에 옮겼습니다.`:`협력사 원인분석은 ${open}에서 받습니다 (현재: ${esc(st)}).`)+(czNeedEsc(c)?' <b>유출 원인(왜 못 걸렀나)은 협력사 대책서와 별개로 사내에서 분석해야 합니다.</b>':ok?' 사내 분석 대상이 없으면 워크시트 없이 넘어갑니다.':' 사내 분석 대상이 ‘없음’이면 대책서 승인 후 원인분석 단계가 충족됩니다.'),
    actions:ok?`협력사 대책은 ${open} 대책서(D5·D6)로 승인되었습니다. 여기에는 사내에서 할 일(수입검사 강화, 기준서 개정, 수평전개 등)만 등록하십시오.${czNeedEsc(c)?' 유출 분석 대상이므로 유출대책 조치는 꼭 1건 이상 필요합니다.':''}`:`협력사 대책은 ${open}에서 회신·평가합니다. 대책서가 승인되면 발생·유출대책 조치 요건이 충족됩니다. 여기에는 사내 할 일만 등록하십시오.`,
    verify:czNcrDone(c)?`${open} 유효성 검증이 ‘유효’로 끝나 효과검증 판정을 합격으로 반영했습니다.`:`효과검증은 ${open}의 유효성 검증(기한 ${esc(n.verifyDue||'-')})이 ‘유효’로 끝나면 자동으로 충족됩니다.`};
  return `<div class="note">${M[where]}</div>`;
}
function czCaseActions(c){
  const list=czActs(c).sort((a,b)=>(a.DueDate||'9').localeCompare(b.DueDate||'9'));
  return `<div class="bar"><span class="muted">봉쇄 · 대책 · 문서개정 · 수평전개 · 교육 등 담당자와 기한이 있는 모든 일을 한 줄씩 등록합니다.</span><span class="grow"></span><button class="btn pri sm" data-act="addAct">+ 조치 추가</button></div>
    <div class="tw"><table class="t"><thead><tr><th style="min-width:220px">조치 내용</th><th>구분</th><th>담당자</th><th>외부 담당</th><th>기한</th><th>완료일</th><th>상태</th><th></th></tr></thead>
    <tbody>${list.map(a=>czActRow(a,false)).join('')}${czGhostRows(c)}</tbody></table></div>`;
}
// 기본 항목: 발생대책 · 유출대책이 없으면 빈 줄을 미리 보여 줌 (내용을 입력하면 조치로 등록)
function czGhostRows(c){
  const have=new Set(czActs(c).map(a=>a.Category));
  const g=['발생대책','유출대책'].filter(k=>!have.has(k));
  if(czPath(c).includes('효과검증')&&CZ_STAGES.indexOf(c.Stage)>=CZ_STAGES.indexOf('효과검증')&&c.Stage!=='종결'&&!have.has('효과검증'))g.push('효과검증');
  if(!g.length)return czActs(c).length?'':'<tr><td colspan="8" class="empty">등록된 조치가 없습니다.</td></tr>';
  return g.map(k=>`<tr class="ghost"><td><input type="text" data-scope="ghost" data-cat="${k}" placeholder="${k==='발생대책'?'왜 만들어졌나 → 재발 방지 대책 (예: 금형 수정, 공정 조건 변경)':k==='유출대책'?'왜 못 걸렀나 → 검출 대책 (예: 검사 항목 추가, 전수검사)':'대책 적용 후 효과 확인 (예: 3 LOT 연속 무결점 · 불량률 비교)'}"></td>
    <td><span class="badge ${k==='발생대책'?'t1':k==='유출대책'?'t2':'t0'}">${k}</span></td><td class="muted">${esc(czMe()||'-')}</td><td></td><td><input type="date" data-scope="ghostdue" data-cat="${k}" value="${k==='효과검증'&&has(c.VerifyEnd)?c.VerifyEnd:addDays(today(),k==='효과검증'?30:7)}"></td><td></td><td class="muted">기본 항목</td><td></td></tr>`).join('');
}
function czActRow(a,showCase){
  const c=czById('cases',a.CaseId),late=!['완료','취소'].includes(a.ActionStatus)&&has(a.DueDate)&&a.DueDate<today();
  const at=k=>`data-scope="act" data-id="${a.id}" data-f="${k}"`;
  return `<tr>${showCase?`<td class="mono"><a style="cursor:pointer;color:var(--acc)" data-act="open" data-id="${a.CaseId}" data-tab="actions">${c?esc(c.CaseNo):'-'}</a></td>`:''}
    <td><input type="text" ${at('Title')} value="${esc(a.Title)}"></td><td><select ${at('Category')}>${czOptHTML(CZ_OPT.ActCat,a.Category)}</select></td>
    <td><input type="text" ${at('Assignee')} list="dlOwners" value="${esc(a.Assignee)}" style="width:96px"></td><td><input type="text" ${at('ExternalOwner')} value="${esc(a.ExternalOwner)}" style="width:96px"></td>
    <td><input type="date" ${at('DueDate')} value="${esc(a.DueDate)}" style="${late?'border-color:var(--red);color:var(--red)':''}"></td><td><input type="date" ${at('DoneDate')} value="${esc(a.DoneDate)}"></td>
    <td><select ${at('ActionStatus')}>${czOptHTML(CZ_OPT.ActStatus,a.ActionStatus)}</select></td><td><button class="btn sm danger" data-act="delAct" data-id="${a.id}" title="삭제">✕</button></td></tr>`;
}
// 이력 탭 — RCA에 남긴 기록 + 연결 NCR · 불량의 자동 이벤트 (기록 도입 전 건은 날짜로 추정해 표시)
function czHistHTML(c){
  const own=c.Log||[],L=own.map(x=>({date:x.date||String(x.at||'').slice(0,10),at:x.at||'',type:x.type,text:x.text,by:x.by,src:'RCA'}));
  if(!own.some(x=>x.type==='생성')&&has(c.Created))L.push({date:c.Created,at:'',type:'생성',text:`${c.CaseNo} 등록`,src:'RCA',est:true});
  if(c.Status==='종결'&&has(c.CloseDate)&&!own.some(x=>x.type==='종결'))L.push({date:c.CloseDate,at:'',type:'종결',text:'종결',src:'RCA',est:true});
  czActs(c).forEach(a=>{if(a.ActionStatus==='완료'&&has(a.DoneDate)&&!own.some(x=>x.actId===a.id&&x.type==='조치 완료'))L.push({date:a.DoneDate,at:'',type:'조치 완료',text:`${a.Category} — ${a.Title||''}`,src:'RCA',est:true})});
  if(!czUi.histOwn){const n=czNcr(c);if(n)autoEvents(null,n).forEach(e=>L.push({date:e.date,at:'',type:'NCR',text:e.text,src:n.no}));
    (c.DefectIds||[]).map(i=>db.defects.find(d=>d.id===i)).filter(Boolean).forEach(d=>autoEvents(d,null).forEach(e=>L.push({date:e.date,at:'',type:'불량',text:e.text,src:defLabel(d)})))}
  L.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||String(b.at).localeCompare(String(a.at)));
  const cls={'생성':'t0','단계':'t1','종결':'st-done','되돌림':'t3','다시 열기':'t3','상태':'t2','조치 완료':'st-done','조치':'t0','귀책 판정':'t2','연결':'t0','NCR':'t1','불량':'t0'};
  return `<div class="bar"><span class="muted">단계 진행 · 되돌림 · 다시 열기 · 조치 완료 · 귀책 판정이 자동으로 남습니다. 지우거나 고칠 수 없습니다.</span><span class="grow"></span><button class="btn sm" data-act="histAll">${czUi.histOwn?'연결 NCR · 불량 기록도 보기':'RCA 기록만 보기'}</button></div>
    <div class="tw"><table class="t"><thead><tr><th style="width:96px">일자</th><th style="width:90px">구분</th><th>내용</th><th style="width:140px">출처 · 기록자</th></tr></thead><tbody>
    ${L.length?L.map(x=>`<tr${x.est?' class="muted"':''}><td class="mono">${esc(x.date)}${x.at?`<br><span class="muted" style="font-size:11px">${esc(loc(x.at).slice(11,16))}</span>`:''}</td><td><span class="badge ${cls[x.type]||'t0'}">${esc(x.type)}</span></td><td>${esc(x.text)}${x.est?' <span class="muted" style="font-size:11px">(이력 기록 도입 전 — 날짜로 추정)</span>':''}</td><td style="font-size:12px">${esc(x.src)}${x.by?` · ${esc(x.by)}`:''}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">기록이 없습니다.</td></tr>'}</tbody></table></div>`;
}
function czViewActions(){
  const t=today(),me=czMe(),f=czUi.actFilt;let rows=db.actions.filter(a=>czById('cases',a.CaseId));
  if(f==='open')rows=rows.filter(a=>!['완료','취소'].includes(a.ActionStatus));
  if(f==='late')rows=rows.filter(a=>!['완료','취소'].includes(a.ActionStatus)&&has(a.DueDate)&&a.DueDate<t);
  if(f==='mine')rows=rows.filter(a=>!['완료','취소'].includes(a.ActionStatus)&&me&&(a.Assignee||'').includes(me));
  rows.sort((a,b)=>(a.DueDate||'9').localeCompare(b.DueDate||'9'));
  const seg=[['open','미완료'],['late','기한 초과'],['mine','내 조치'],['all','전체']];
  return `<h1>조치</h1><p class="sub">모든 RCA의 조치를 기한 순으로 봅니다. 여기서 바로 수정할 수 있습니다.</p>
    <div class="bar"><div class="seg">${seg.map(([v,l])=>`<a class="${f===v?'on':''}" data-act="actFilt" data-v="${v}">${l}</a>`).join('')}</div>
      ${f==='mine'&&!me?'<span class="muted">설정 › 일반의 담당자 목록 첫 줄이 ‘나’로 쓰입니다.</span>':f==='mine'?`<span class="muted">담당자 ‘${esc(me)}’ 기준</span>`:''}
      <span class="grow"></span><button class="btn" data-act="csv" data-list="actions">CSV</button></div>
    <div class="tw"><table class="t"><thead><tr><th>RCA</th><th style="min-width:220px">조치 내용</th><th>구분</th><th>담당자</th><th>외부 담당</th><th>기한</th><th>완료일</th><th>상태</th><th></th></tr></thead>
    <tbody>${rows.length?rows.map(a=>czActRow(a,true)).join(''):'<tr><td colspan="9" class="empty">해당하는 조치가 없습니다.</td></tr>'}</tbody></table></div>`;
}

/* ---------- 생성 · 수정 ---------- */
function czCreateCase(d){
  const c=Object.assign({Title:'',Origin:'수입검사',RequestType:'품질문제',PartId:'',SupplierId:'',Customer:'',CustomerClaimNo:'',DefectType:'',DefectQty:'',Description:'',Priority:'보통',Owner:czMe(),
    SevS:'',ImpI:'',Tier:'',TierReason:'',Response:'',ParentCaseId:'',LegacyNo:'',Stage:'접수',Status:'진행중',Ball:'나',NextAction:'임시조치 확인 · 격리',RecheckDate:addDays(today(),2),
    Disposition:'미정',VerifyResult:'미검증',Retention:'5년',AnalysisTools:[],Analyses:[],DefectIds:[],NcrId:'',Created:today()},d);
  c.id=uid();
  if(has(c.PartId)&&!has(c.SupplierId)){const p=db.parts.find(x=>x.id===c.PartId);if(p)c.SupplierId=p.supplierId||''}
  if(!has(c.Tier))c.Tier=czTierAuto(c);
  const g=genDocNo(c.Response==='8D'?'i8d':'rca',c.Created||today());c.CaseNo=g.no;db.meta.caseSeq=Math.max(num(db.meta.caseSeq),g.seq);
  czLog(c,'생성',`${c.CaseNo} 등록${c.Origin?' — '+c.Origin:''}`,{to:'접수'});
  touch(c);db.cases.push(c);return c;
}
function czCreateAction(d){const a=Object.assign({Title:'',CaseId:null,Category:'발생대책',Assignee:czMe(),ExternalOwner:'',DueDate:addDays(today(),7),DoneDate:'',ActionStatus:'대기'},d);a.id=uid();touch(a);db.actions.push(a);return a}
function czSetField(c,k,v){
  if(k==='PartId'){
    if(!String(v).trim()){c.PartId='';return}
    const p=db.parts.find(x=>x.partNo===String(v).trim());
    if(!p){toast('기준정보에 없는 부품번호입니다. 기준정보 탭에서 먼저 등록하십시오.');c.PartId='';return}
    c.PartId=p.id;if(p.supplierId)c.SupplierId=p.supplierId;return;
  }
  if(k==='Status'&&c.Status==='종결'&&v!=='종결'){setTimeout(()=>czReopen(c,v),0);return false}   // 다시 열기는 사유를 받음
  if(k==='Status'&&v==='종결'&&c.Stage!=='종결'){
    const miss=czGate(c,'종결');
    if(miss.length){czUi.showGate=true;toast(`종결 조건 ${miss.length}개가 남아 있습니다 — 단계 진행 버튼으로 하나씩 채운 뒤 종결하세요`);return false}
    czLog(c,'종결',`${c.Stage} → 종결 (상태 변경)`,{from:c.Stage,to:'종결'});c.Stage='종결';c.Ball='나';c.NextAction='종결 완료';
  }
  else if(k==='Status'&&v!==c.Status)czLog(c,'상태',`${c.Status||'-'} → ${v}`);
  const before=czTierAuto(c);c[k]=v;
  if((k==='SevS'||k==='ImpI')&&(!has(c.Tier)||c.Tier===before))c.Tier=czTierAuto(c);
  if(k==='Status'){if(v==='종결'&&!has(c.CloseDate))c.CloseDate=today();if(v==='진행중'&&c.Stage==='종결'){const ps=czPrev(c);if(ps)c.Stage=ps}}
}
function czStageNext(){
  const c=czById('cases',czUi.caseId),ns=czNext(c);if(!ns)return;
  const miss=czGate(c,ns);
  if(miss.length){czUi.showGate=true;const first=miss[0];if(first.tab!=='head')czUi.tab=first.tab;render();return}
  const from=c.Stage;c.Stage=ns;czUi.showGate=false;czLog(c,ns==='종결'?'종결':'단계',`${from} → ${ns}${czStageDate(c,from)?` (${from} ${Math.max(0,diffDays(czStageDate(c,from),today()))}일)`:''}`,{from,to:ns});
  if(ns==='종결'){c.Status='종결';c.CloseDate=today();c.Ball='나';c.NextAction='종결 완료'}else{c.NextAction=CZ_NEXT_HINT[ns];c.RecheckDate=addDays(today(),3)}
  czUi.tab=({'격리':'contain','처분':'contain','원인분석':'cause','대책':'actions','효과검증':'verify','표준화':'close','종결':'close'})[ns]||czUi.tab;
  touch(c);save();render();toast(ns==='종결'?'RCA를 종결했습니다.':`${ns} 단계로 넘어갔습니다. 다음 행동을 확인하십시오.`);
}
async function czReopen(c,toStatus){
  if(!c)return;const ps=czPrev(c)||c.Stage;
  const r=await askConfirm({title:`${c.CaseNo} 종결을 취소하고 다시 열까요?`,msg:`단계는 <b>${esc(ps)}</b>(으)로 돌아가고 종결일이 지워집니다. 사유와 함께 이력에 남습니다.`,ok:'다시 열기',danger:false,input:{label:'다시 여는 사유',ph:'예: 동일 불량 재발 · 고객 추가 요청 · 종결 판단 오류'}});
  if(!r){render();return}
  const old=c.CloseDate;c.Status=toStatus&&toStatus!=='종결'?toStatus:'진행중';if(c.Stage==='종결'){const p=czPrev(c);if(p)c.Stage=p}c.CloseDate='';
  czLog(c,'다시 열기',`${r} (종결일 ${old||'-'} 취소 · ${c.Stage} 단계로)`,{from:'종결',to:c.Stage,reason:r});
  touch(c);save();render();toast('다시 열었습니다. 사유가 이력에 남았습니다.');
}
function czNewCaseModal(){
  const S=db.settings;
  openModal('새 RCA',`<div class="fg">
    <label class="full">제목 *<input name="Title" placeholder="예: 도어래치 스프링 파단"></label>
    <label>발생원천<select name="Origin">${czOptHTML(CZ_OPT.Origin,'수입검사')}</select></label>
    <label>부품번호<input name="part" data-combo="parts" autocomplete="off" placeholder="번호·품명·협력사로 검색"></label>
    <label>불량유형<select name="DefectType">${czOptHTML(CZ_OPT.DefectType,'')}</select></label>
    <label>불량수량 (EA)<input type="number" name="DefectQty"></label>
    <label class="full">불량내용<textarea name="Description"></textarea></label>
    <label>심각도 S<select name="SevS">${czOptHTML(CZ_OPT.SevS,'')}</select></label>
    <label>영향도 I<select name="ImpI">${czOptHTML(CZ_OPT.ImpI,'')}</select></label>
    <label>대응방향<select name="Response">${czOptHTML(CZ_OPT.Response,'')}</select></label></div>
    <div class="help" style="margin-top:8px">TIER는 S×I로 자동 판정되며 상세 화면에서 바꿀 수 있습니다. 대응방향에 따라 번호 접두어(NCR/FAR/8D)가 정해집니다.<br>불량 관리에 이미 등록된 건이면 그 불량의 ‘진행 보기’에서 <b>RCA 요청</b>를 쓰는 편이 빠릅니다.</div>`,
  [{label:'취소',fn:closeModal},{label:'등록',cls:'p',fn:async()=>{
    const o=gather();if(!o.Title){toast('제목을 입력하십시오.');return}
    let pid='';if(o.part){const p=partByNo(o.part);if(!p){if(!await askConfirm({title:'기준정보에 없는 부품번호입니다',msg:'부품 없이 등록할까요? 나중에 기본 탭에서 부품을 고를 수 있습니다.',ok:'부품 없이 등록',danger:false}))return}else pid=p.id}
    const c=czCreateCase({Title:o.Title,Origin:o.Origin,PartId:pid,DefectType:o.DefectType,DefectQty:o.DefectQty,Description:o.Description,SevS:o.SevS,ImpI:o.ImpI,Response:o.Response});
    if(['고객사','필드'].includes(c.Origin))c.CustNotify='필요';
    save();closeModal(true);czOpenCase(c.id);toast(`${c.CaseNo} 등록했습니다.${c.Response?'':' 대응방향을 정하십시오.'}`);
  }}]);
}

/* ---------- 불량 · NCR → 사건 ---------- */
const CZ_TR={'TIER 0':0,'TIER 1':1,'TIER 2':2,'TIER 3':3};
const CZ_FLOOR={A:'TIER 2',B:'TIER 1',C:'TIER 0'};
function czOrigin(src){const s=stageOf(src);return s===4?'고객사':s===3?'최종검사':s===2?'공정':'수입검사'}
function czRespOfNcr(n){return n.reqType==='간이 대책서'?'간이 대책서':n.reqType==='단순 통보'?'현장조치':'8D'}
// 개인 QMS 심각도(A/B/C) → 사건 S·I·TIER 제안. 자동 판정보다 낮지 않게 등급 하한을 적용하고 사유를 남김
function czSuggest(ds){
  const vs=ds.map(sevOf),g=vs.map(v=>v.grade).sort()[0]||'C';
  const stage=Math.max(...vs.map(v=>v.f.stage)),impact=Math.max(...vs.map(v=>v.f.impact)),qty=sum(ds,'qty');
  const SevS=String(stage===4?4:impact===4?3:impact===1?1:2),ImpI=String(qty>=1000?5:qty>=100?3:1);
  const auto=czTierAuto({SevS,ImpI});let Tier=auto,TierReason='';
  if(CZ_TR[CZ_FLOOR[g]]>CZ_TR[auto]){Tier=CZ_FLOOR[g];const v=vs.find(x=>x.grade===g);TierReason=`불량 심각도 ${g}등급(${v.score}점${v.forced.length?' · '+v.forced.join(', '):''}) 반영 — 자동 판정 ${auto} 대신 ${Tier} 적용`}
  return {g,SevS,ImpI,Tier,TierReason,Response:{A:'8D',B:'간이 대책서',C:'현장조치'}[g]};
}
function czBuildFrom(ds,n){
  const d=ds[0]||{},sg=czSuggest(ds.length?ds:[d]),p=d.partNo?partByNo(d.partNo):null,qty=sum(ds,'qty');
  const desc=[n&&(n.defectDesc||n.d2)||ds.map(x=>`[${x.date} ${x.source||''}] ${x.desc||''}`).join('\n'),...ds.filter(x=>x.containment).map(x=>`[임시조치] ${x.containment}`)].filter(Boolean).join('\n');
  const o={Title:(n&&n.title)||`${d.type||''} — ${d.partName||d.partNo||''}`,Origin:czOrigin(d.source),PartId:p?p.id:'',SupplierId:(n&&n.supplierId)||d.supplierId||'',DefectType:d.type||'',DefectQty:String(qty||''),
    Description:desc,Owner:(n&&n.owner)||d.owner||czMe(),SevS:sg.SevS,ImpI:sg.ImpI,Tier:sg.Tier,TierReason:sg.TierReason,Response:n?czRespOfNcr(n):sg.Response,
    ContainScope:ds.map(lotOf).filter(Boolean).length?'LOT/납품일 '+[...new Set(ds.map(lotOf).filter(Boolean))].join(', '):'',
    Disposition:CZ_OPT.Disposition.includes(d.disposition)?d.disposition:'미정',DefectIds:ds.map(x=>x.id),NcrId:n?n.id:''};
  if(o.Origin==='고객사')o.CustNotify='필요';
  const rs=[...new Set(ds.map(x=>x.resp||'미정'))],st=Math.max(...(ds.length?ds:[d]).map(x=>stageOf(x.source)));
  if(!o.CauseOccur){const r=ds.map(x=>(x.ica&&x.ica.d4)||(x.inv&&x.inv.rca)).filter(Boolean)[0];if(r)o.CauseOccur='[불량 기록] '+r}
  o.RcaScope=rs.includes('미정')||rs.includes('공동')||rs.length>1?'발생+유출':rs[0]==='사내'?(st>=4?'발생+유출':'발생'):rs[0]==='협력사'?(st>=2&&(ds.length?ds:[d]).some(escRca)?'유출':'없음'):'';
  return {o,g:sg.g};
}
function czAttach(c,ds,n){ds.forEach(d=>{d.caseId=c.id;touch(d)});if(n){n.caseId=c.id;touch(n)}czSyncCase(c)}
async function czFromDefect(id){
  const d=db.defects.find(x=>x.id===id);if(!d)return;
  if(d.caseId&&czById('cases',d.caseId))return czOpenCase(d.caseId);
  const n=d.ncrId?db.ncrs.find(x=>x.id===d.ncrId):null;
  if(n&&n.caseId&&czById('cases',n.caseId)){const c=czById('cases',n.caseId);c.DefectIds=[...new Set([...(c.DefectIds||[]),d.id])];czAttach(c,[d],null);touch(c);save();return czOpenCase(c.id)}
  const ds=n?(n.defectIds||[]).map(i=>db.defects.find(x=>x.id===i)).filter(x=>x&&!x.caseId):[d];
  const {o,g}=czBuildFrom(ds.length?ds:[d],n);
  if(!await askConfirm({title:'RCA를 요청할까요?',msg:'불량 정보로 새 RCA를 만들고 연결합니다. 심각도는 아래처럼 제안했고, 상세 화면에서 바꿀 수 있습니다.',
    items:[`불량 ${ds.length||1}건${n?` · ${esc(n.no)} 함께 연결`:''}`,`심각도 ${g}등급 → S ${o.SevS} × I ${o.ImpI} · <b>${o.Tier}</b> · 대응 ${o.Response}`].concat(o.TierReason?[esc(o.TierReason)]:[]),ok:'RCA 요청',danger:false}))return;
  const c=czCreateCase(o);czAttach(c,ds.length?ds:[d],n);save();czOpenCase(c.id);toast(`${c.CaseNo} RCA를 요청했습니다.`);
}
async function czFromNcr(id){
  const n=db.ncrs.find(x=>x.id===id);if(!n)return;
  if(n.caseId&&czById('cases',n.caseId))return czOpenCase(n.caseId);
  const ds=(n.defectIds||[]).map(i=>db.defects.find(x=>x.id===i)).filter(Boolean);
  const exist=ds.map(d=>d.caseId&&czById('cases',d.caseId)).find(Boolean);
  if(exist){exist.NcrId=n.id;n.caseId=exist.id;touch(n);touch(exist);save();return czOpenCase(exist.id)}
  if(!ds.length){toast('연결된 불량이 없는 NCR입니다. NCR에 불량을 먼저 연결하거나 RCA를 직접 등록하십시오.');return}
  const {o,g}=czBuildFrom(ds,n);
  if(!await askConfirm({title:`${n.no}을(를) RCA를 요청할까요?`,msg:'NCR과 연결 불량으로 새 RCA를 만듭니다.',items:[`불량 ${ds.length}건 · ${sum(ds,'qty').toLocaleString()}개`,`심각도 ${g}등급 → S ${o.SevS} × I ${o.ImpI} · <b>${o.Tier}</b> · 대응 ${o.Response} (요구 회신: ${esc(n.reqType||'8D 보고서')})`].concat(o.TierReason?[esc(o.TierReason)]:[]),ok:'RCA 요청',danger:false}))return;
  const c=czCreateCase(o);czAttach(c,ds,n);save();czOpenCase(c.id);toast(`${c.CaseNo} RCA를 요청했습니다.`);
}
// NCR 상태가 바뀔 때마다 사건의 공 · 다음 행동 · 재확인일을 맞춤 (수동 수정은 다음 상태 변화까지 유지)
const CZ_NCR_FLOW={
  '미통보':n=>['나','협력사에 NCR 통보 (NCR '+n.no+')',today()],
  '발행':n=>['나','협력사에 대책 요청 발송 (NCR '+n.no+')',today()],
  '대책요청':n=>['협력사','협력사 대책서 회신 확인',n.dueDate||addDays(today(),2)],
  '대책서 검토':n=>['나','협력사 대책서 평가 (NCR '+n.no+')',today()],
  '보완요청':n=>['협력사','대책서 보완 회신 확인',addDays(today(),5)],
  '통보 완료(검증대기)':n=>['나','재발 여부 확인 · 유효성 검증 (NCR '+n.no+')',n.verifyDue||addDays(today(),14)],
  '승인(검증대기)':n=>['나','대책 효과(유효성) 검증 — NCR '+n.no,n.verifyDue||addDays(today(),14)],
  '종결':n=>['나','NCR 유효성 검증 완료 — RCA 단계 마무리',today()],
  '검증 무효':n=>['나','유효성 검증 무효 — 재대책 요구 여부 결정',today()]
};
function czSyncCase(c){
  let ch=false;const set=(k,v)=>{if(String(c[k]??'')!==String(v??'')){c[k]=v;ch=true}};
  // 2) 연결 불량에서 수량 · 처분을 읽어옴 (사건에서 따로 입력하지 않음)
  const ds=(c.DefectIds||[]).map(i=>db.defects.find(d=>d.id===i)).filter(Boolean);
  if(ds.length){
    set('DefectQty',String(sum(ds,'qty')));
    const dp=[...new Set(ds.map(d=>d.disposition).filter(Boolean))];
    if(dp.length===1&&ds.every(d=>d.disposition)&&CZ_OPT.Disposition.includes(dp[0]))set('Disposition',dp[0]);
  }
  if(!has(c.RcaScope)&&CZ_STAGES.indexOf(c.Stage)>3)set('RcaScope',c.NcrId?'없음':'발생');
  // 1) 연결 NCR 상태를 사건 흐름에 반영
  const n=czNcr(c);
  if(n&&czOpen(c)){
    const st=ncrStatus(n);
    if(c._ncrSt!==st){c._ncrSt=st;ch=true;
      const f=CZ_NCR_FLOW[st];if(f&&c.Stage!=='종결'){const [b,na,rd]=f(n);c.Ball=b;c.NextAction=na;c.RecheckDate=rd}
      if(st==='대책요청'&&c.Response==='FAR'&&!has(c.FARIssueDate))c.FARIssueDate=n.requestDate||'';}
    const d4=String(n.d4||'').trim();
    if(d4&&['승인(검증대기)','종결','대책서 검토','보완요청'].includes(st)){const tag='[NCR 대책서] ';
      if(!has(c.CauseOccur))set('CauseOccur',tag+d4);else if(String(c.CauseOccur).startsWith(tag)&&c.CauseOccur!==tag+d4)set('CauseOccur',tag+d4)}
    if(farOn(n)&&n.far.replyDate&&n.far.summary&&!has(c.CauseOccur))set('CauseOccur','[FAR 분석] '+n.far.summary);
    if(st==='종결'){if(!has(c.VerifyResult)||c.VerifyResult==='미검증')set('VerifyResult','합격');if(!has(c.VerifyEnd)&&n.verifyDate)set('VerifyEnd',n.verifyDate);if(!has(c.Recurred))set('Recurred','없음')}
    if(st==='검증 무효'&&c.VerifyResult!=='불합격')set('VerifyResult','불합격');
  }
  if(ch)touch(c);return ch;
}
function czSyncAll(){let n=0;try{(db.cases||[]).forEach(c=>{if(czSyncCase(c))n++})}catch(e){console.error(e)}return n}
// RCA로 관리 중인 불량 · NCR (대시보드 · 진행 현황에서 중복 표시하지 않음)
function czOwns(o,kind){
  if(!o||!db.cases)return false;
  if(o.caseId&&czCaseOpenId(o.caseId))return true;
  if(kind==='defect'&&o.ncrId){const n=db.ncrs.find(x=>x.id===o.ncrId);if(n&&n.caseId&&czCaseOpenId(n.caseId))return true}
  return false;
}
// NCR 저장 시: 연결 불량이 사건에 묶여 있으면 사건에도 NCR을 연결
function czSyncNcr(n){
  if(n.caseId&&czById('cases',n.caseId))return;
  const c=(n.defectIds||[]).map(i=>db.defects.find(d=>d.id===i)).map(d=>d&&d.caseId&&czById('cases',d.caseId)).find(Boolean);
  if(c&&!c.NcrId){c.NcrId=n.id;n.caseId=c.id;delete c._ncrSt;touch(c)}
}
function czUnlinkDefectAll(id){db.cases.forEach(c=>{if((c.DefectIds||[]).includes(id)){c.DefectIds=c.DefectIds.filter(x=>x!==id);touch(c)}})}
function czUnlinkNcrAll(id){db.cases.forEach(c=>{if(c.NcrId===id){c.NcrId='';delete c._ncrSt;touch(c)}})}
const czCaseBadge=o=>{const c=o.caseId&&czById('cases',o.caseId);return c?`<a class="bg ${czOpen(c)?'inf':'ok'}" style="cursor:pointer;font-size:10.5px" onclick="czOpenCase('${c.id}')" title="${esc(c.Title)} · ${esc(c.Stage)}">RCA ${esc(c.CaseNo)}</a>`:''};
function czDashItems(){
  const t=today(),open=db.cases.filter(c=>c.Status==='진행중'||c.Status==='보류'),L=[];
  open.filter(c=>has(c.RecheckDate)&&c.RecheckDate<=t).sort((a,b)=>a.RecheckDate.localeCompare(b.RecheckDate)).slice(0,8).forEach(c=>L.push(`<li><span class="bg ${c.Ball==='나'?'inf':'warn'}">${c.Ball==='나'?'RCA 재확인':'RCA 독촉'}</span> <a class="lk" onclick="czOpenCase('${c.id}')">${esc(c.CaseNo)} ${esc(c.Title)}</a> — ${esc(c.Stage)} · ${esc(c.NextAction||'')} (${esc(c.RecheckDate)})</li>`));
  db.actions.filter(a=>!['완료','취소'].includes(a.ActionStatus)&&has(a.DueDate)&&a.DueDate<t&&czCaseOpenId(a.CaseId)).sort((a,b)=>a.DueDate.localeCompare(b.DueDate)).slice(0,8).forEach(a=>{const c=czById('cases',a.CaseId);L.push(`<li><span class="bg bad">조치 지연</span> <a class="lk" onclick="czOpenCase('${a.CaseId}','actions')">${esc(a.Title||'(내용 없음)')}</a> ${esc(c.CaseNo)} — 기한 ${esc(a.DueDate)}</li>`)});
  return L.join('');
}

/* ---------- 이벤트 ---------- */
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-act]');if(!el||!el.closest('.cz'))return;
  if(el.tagName==='SELECT'||el.tagName==='INPUT')return;
  const act=el.dataset.act,id=el.dataset.id;
  switch(act){
    case 'czNav':czGo(el.dataset.v);break;
    case 'open':czOpenCase(id,el.dataset.tab);break;
    case 'tab':czUi.tab=el.dataset.tab;render();break;
    case 'gotoTab':if(el.dataset.tab!=='head')czUi.tab=el.dataset.tab;render();{const f=el.dataset.f,t=f&&document.getElementById('czf_'+f);if(t)t.focus()}break;
    case 'bump':{const c=czById('cases',id);c.RecheckDate=addDays(today(),2);touch(c);save();render();toast('재확인일을 '+c.RecheckDate+'로 옮겼습니다.');break}
    case 'stageNext':czStageNext();break;
    case 'stagePrev':{const c=czById('cases',czUi.caseId),ps=czPrev(c);if(!ps)break;const r=await askConfirm({title:`${ps} 단계로 되돌릴까요?`,msg:'되돌린 사유가 이력에 남습니다.',ok:'되돌리기',danger:false,input:{label:'되돌리는 사유',ph:'예: 원인 재분석 필요 · 대책 효과 미흡'}});
      if(r){const from=c.Stage;c.Stage=ps;czUi.showGate=false;czLog(c,'되돌림',`${from} → ${ps} — ${r}`,{from,to:ps,reason:r});touch(c);save();render()}break}
    case 'reopen':czReopen(czById('cases',czUi.caseId));break;
    case 'showGate':czUi.showGate=true;render();break;
    case 'histAll':czUi.histOwn=!czUi.histOwn;render();break;
    case 'delCase':{const c=czById('cases',czUi.caseId);
      if(!await askConfirm({title:`${c.CaseNo} RCA를 삭제할까요?`,items:[esc(c.Title),`조치 ${czActs(c).length}건 함께 삭제`,`연결된 불량 ${(c.DefectIds||[]).length}건 · NCR은 유지 (연결만 해제)`],note:'기록을 남기려면 상태를 ‘취소’로 바꾸는 편이 낫습니다. 삭제 후 10초 안에 되돌릴 수 있습니다.'}))break;
      const snap=await takeSnap();
      db.defects.forEach(d=>{if(d.caseId===c.id){d.caseId='';touch(d)}});db.ncrs.forEach(n=>{if(n.caseId===c.id){n.caseId='';touch(n)}});
      czActs(c).forEach(a=>removeRec('actions',a.id));removeRec('cases',c.id);save();czUi.view='cases';render();offerUndo(snap,`${c.CaseNo} RCA를 삭제했습니다`);break}
    case 'addAct':{czCreateAction({CaseId:czUi.caseId});save();render();const last=[...document.querySelectorAll('[data-scope="act"][data-f="Title"]')].find(x=>!x.value);if(last)last.focus();break}
    case 'delAct':{const a=czById('actions',id);if(a&&(!a.Title||await askConfirm({title:'이 조치를 삭제할까요?',items:[esc(a.Title)]}))){if(a.Title){const c=czById('cases',a.CaseId);czLog(c,'조치',`조치 삭제 — ${a.Category}: ${a.Title}`,{actId:a.id});c&&touch(c)}removeRec('actions',id);save();render()}break}
    case 'actDone':{const a=czById('actions',id);a.ActionStatus='완료';a.DoneDate=today();{const c=czById('cases',a.CaseId);czLog(c,'조치 완료',`${a.Category} — ${a.Title||''}`,{actId:a.id});c&&touch(c)}touch(a);save();render();toast('완료 처리했습니다.');break}
    case 'actFilt':czUi.actFilt=el.dataset.v;render();break;
    case 'newCase':czNewCaseModal();break;
    case 'report':czReport();break;
    case 'a3':a3Report('case',czUi.caseId);break;
    case 'csv':czCSV(el.dataset.list);break;
    case 'linkDef':{const c=czById('cases',czUi.caseId),v=$('#czLinkD').value,d=db.defects.find(x=>x.id===v);if(!d)break;c.DefectIds=[...new Set([...(c.DefectIds||[]),d.id])];czAttach(c,[d],null);czLog(c,'연결',`불량 연결 — ${defLabel(d)}`);
      if(!c.NcrId&&d.ncrId){const n=db.ncrs.find(x=>x.id===d.ncrId);if(n&&!n.caseId){c.NcrId=n.id;czAttach(c,[],n)}}touch(c);save();render();break}
    case 'unlinkDef':{const c=czById('cases',czUi.caseId),did=el.dataset.did,d=db.defects.find(x=>x.id===did);c.DefectIds=(c.DefectIds||[]).filter(x=>x!==did);if(d&&d.caseId===c.id){d.caseId='';touch(d)}czLog(c,'연결',`불량 연결 해제 — ${d?defLabel(d):did}`);touch(c);save();render();break}
    case 'linkNcr':{const c=czById('cases',czUi.caseId),n=db.ncrs.find(x=>x.id===$('#czLinkN').value);if(!n)break;c.NcrId=n.id;delete c._ncrSt;czAttach(c,[],n);czLog(c,'연결',`NCR 연결 — ${n.no}`);
      (n.defectIds||[]).forEach(i=>{const d=db.defects.find(x=>x.id===i);if(d&&!d.caseId){c.DefectIds=[...new Set([...(c.DefectIds||[]),d.id])];czAttach(c,[d],null)}});touch(c);save();render();break}
    case 'unlinkNcr':{const c=czById('cases',czUi.caseId),n=db.ncrs.find(x=>x.id===c.NcrId);if(n&&n.caseId===c.id){n.caseId='';touch(n)}if(n)czLog(c,'연결',`NCR 연결 해제 — ${n.no}`);c.NcrId='';delete c._ncrSt;touch(c);save();render();break}
    case 'issueNcr':{const c=czById('cases',czUi.caseId),d=(c.DefectIds||[]).map(i=>db.defects.find(x=>x.id===i)).find(x=>x&&!x.ncrId);if(!d){toast('NCR이 없는 연결 불량이 없습니다.');break}ncrFromDefect(d.id);break}
    case 'escActs':{const c=czById('cases',czUi.caseId),p=czPart(c),pn=p?p.partNo:'';
      czCreateAction({CaseId:c.id,Category:'유출대책',Title:`수입검사기준서 개정 — ${pn} 검사 항목 · 샘플링 · 측정 방법 재검토`,DueDate:addDays(today(),14)});
      czCreateAction({CaseId:c.id,Category:'문서개정',Title:`한도견본 · 검사원 교육 · 유사 부품 수평전개 — ${pn}`,DueDate:addDays(today(),21)});
      touch(c);save();czUi.tab='actions';render();toast('유출 대책 2건을 조치에 추가했습니다.');break}
    case 'addAna':case 'anaToggle':case 'anaDel':case 'anaAdd':case 'anaApply':anaClick(act,el);break;
  }
});
document.addEventListener('change',e=>{
  const el=e.target;if(!el.closest||!el.closest('.cz'))return;
  if(el.dataset.act==='filt'){czUi.filt[el.dataset.k]=el.value;render();return}
  const scope=el.dataset.scope;if(!scope)return;
  if(scope==='case'){const c=czById('cases',czUi.caseId);if(!c)return;
    if(el.dataset.multi){const k=el.dataset.multi,set=new Set(c[k]||[]);el.checked?set.add(el.value):set.delete(el.value);c[k]=[...set]}else if(czSetField(c,el.dataset.f,el.value)===false){el.value=c[el.dataset.f]||'';render();return}
    touch(c);save();czSoft();}
  else if(scope==='ghost'){const c=czById('cases',czUi.caseId),t=el.value.trim();if(!c||!t||el.dataset.done)return;el.dataset.done='1';if(czActs(c).some(a=>a.Category===el.dataset.cat&&a.Title===t))return;const du=document.querySelector(`.cz [data-scope="ghostdue"][data-cat="${el.dataset.cat}"]`);
    const na=czCreateAction({CaseId:c.id,Category:el.dataset.cat,Title:t,DueDate:(du&&du.value)||addDays(today(),7)});czLog(c,'조치',`조치 등록 — ${na.Category}: ${t}`,{actId:na.id});touch(c);save();czSoft();toast(`${el.dataset.cat} 조치를 등록했습니다.`)}
  else if(scope==='ghostdue'){}
  else if(scope==='act'){const a=czById('actions',el.dataset.id);if(!a)return;const f=el.dataset.f,old=a[f],wasDone=a.ActionStatus==='완료';a[f]=el.value;
    if(f==='ActionStatus'){if(el.value==='완료'&&!has(a.DoneDate))a.DoneDate=today();if(el.value!=='완료'&&wasDone)a.DoneDate=''}   // 완료 해제 → 완료일도 비움
    if(f==='DoneDate'){if(has(el.value)&&a.ActionStatus!=='취소')a.ActionStatus='완료';else if(!has(el.value)&&wasDone)a.ActionStatus='진행'}
    const c=czById('cases',a.CaseId),isDone=a.ActionStatus==='완료';
    if(c){const n0=(c.Log||[]).length;if(!wasDone&&isDone)czLog(c,'조치 완료',`${a.Category} — ${a.Title||''}`,{actId:a.id});
      else if(wasDone&&!isDone)czLog(c,'조치',`완료 해제 — ${a.Category}: ${a.Title||''} (${a.ActionStatus})`,{actId:a.id});
      else if(f==='Title'&&!has(old)&&has(el.value))czLog(c,'조치',`조치 등록 — ${a.Category}: ${el.value}`,{actId:a.id});
      if((c.Log||[]).length>n0)touch(c)}
    touch(a);save();czSoft();}
  else if(scope==='ana'){const c=czById('cases',czUi.caseId);if(!c)return;const a=(c.Analyses||[]).find(x=>String(x.id)===el.dataset.aid);if(!a)return;
    setPath(a,el.dataset.path,el.type==='checkbox'?el.checked:el.value);a.updatedAt=now();touch(c);save();czSoft();}
});
document.addEventListener('input',e=>{
  if(e.target.dataset&&e.target.dataset.act==='filtq'&&e.target.closest('.cz')){czUi.filt.q=e.target.value;const pos=e.target.selectionStart;render();const n=document.querySelector('.cz [data-act="filtq"]');if(n){n.focus();n.setSelectionRange(pos,pos)}}
});

/* ---------- 보고서 (8D 형식 요약) ---------- */
function czReport(){
  const c=czById('cases',czUi.caseId);if(!c)return;const w=reportWin(),p=czPart(c),A=czActs(c);
  const ds=(c.DefectIds||[]).map(i=>db.defects.find(d=>d.id===i)).filter(Boolean),n=c.NcrId?db.ncrs.find(x=>x.id===c.NcrId):null;
  const row=(k,v)=>`<tr><th>${esc(k)}</th><td class="pre">${esc(v||'')}</td></tr>`;
  const actTable=cats=>{const l=A.filter(a=>cats.includes(a.Category));return l.length?`<table><tr><th style="width:auto">조치</th><th style="width:14%">구분</th><th style="width:14%">담당</th><th style="width:13%">기한</th><th style="width:13%">완료일</th><th style="width:10%">상태</th></tr>${l.map(a=>`<tr><td>${esc(a.Title)}</td><td>${esc(a.Category)}</td><td>${esc(a.Assignee||a.ExternalOwner)}</td><td>${esc(a.DueDate)}</td><td>${esc(a.DoneDate)}</td><td>${esc(a.ActionStatus)}</td></tr>`).join('')}</table>`:'<p class="muted">등록된 조치 없음</p>'};
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(c.CaseNo)} 문제해결 보고서</title><style>
  body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:12px;color:#111;margin:24px}h1{font-size:18px;margin:0 0 4px}
  h3{font-size:13px;margin:16px 0 6px;padding:4px 8px;background:#eef2f7;border-radius:4px;break-after:avoid}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px}td,th{border:1px solid #bbb;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f5f7f9;width:22%;font-weight:600}
  .pre{white-space:pre-wrap}.muted{color:#777}</style></head><body>${logoHead()}
  <h1>문제해결 보고서 (8D) — ${esc(c.CaseNo)}</h1><div class="muted">출력일 ${today()} · 상태 ${esc(c.Status)} · 단계 ${esc(c.Stage)}</div>
  <h3>D0 · D1 개요와 팀</h3><table>${row('제목',c.Title)}${row('부품',p?`${p.partNo} ${p.name}`:'')}${row('협력사 / 고객사',`${supName(c.SupplierId)||'-'} / ${c.Customer||'-'}`)}
    ${row('발생원천 / 등록일',`${c.Origin} / ${c.Created}`)}${row('TIER / 대응방향',`${c.Tier} (S${c.SevS} × I${c.ImpI}) / ${c.Response}`)}${c.TierReason?row('TIER 조정사유',c.TierReason):''}${row('담당자',c.Owner)}${row('연결 NCR',n?`${n.no} (${ncrStatus(n)})`:'')}${row('기존 문서번호',c.LegacyNo)}</table>
  <h3>D2 문제 정의</h3><table>${row('불량유형 / 수량',`${c.DefectType} / ${c.DefectQty} EA`)}${row('불량내용',c.Description)}</table>
  ${ds.length?`<table><tr><th style="width:auto">발생일</th><th style="width:auto">발생처</th><th style="width:auto">부품</th><th style="width:auto">유형</th><th style="width:auto">수량</th><th style="width:auto">심각도</th><th style="width:auto">비용(원)</th></tr>${ds.map(d=>`<tr><td>${esc(d.date)}</td><td>${esc(d.source)}</td><td>${esc(d.partNo)} ${esc(d.partName)}</td><td>${esc(d.type)}</td><td>${num(d.qty).toLocaleString()}</td><td>${sevOf(d).grade}</td><td>${costTotal(d)?won(costTotal(d)):''}</td></tr>`).join('')}</table>`:''}
  <h3>D3 임시 봉쇄 · 처분</h3><table>${row('격리 수량',`재고 ${c.QtyStock||0} · 재공 ${c.QtyWIP||0} · 이송중 ${c.QtyTransit||0} · 고객처 ${c.QtyCustomer||0} EA`)}
    ${row('격리 완료일 / 식별',`${c.ContainDate||''} / ${c.ContainMethod||''}`)}${row('소급 범위',c.ContainScope)}
    ${row('처분',`${c.Disposition}${c.DeviationNo?' · 특채번호 '+c.DeviationNo:''}${c.CustApprover?' · 고객승인 '+c.CustApprover+' '+(c.CustApproveDate||''):''}`)}${row('고객통보',`${c.CustNotify||''} ${c.CustNotifyDate||''} ${c.CustNotifyReason||''}`)}</table>${actTable(['봉쇄','재작업·재검사'])}
  <h3>D4 근본 원인</h3><table>${row('분석도구',(c.AnalysisTools||[]).join(', '))}${row('발생 원인',c.CauseOccur)}${row('유출 원인',c.CauseEscape)}${row('시스템 원인',c.CauseSystem)}</table>${anaReport(c)}
  <h3>D5 영구 대책</h3>${actTable(['발생대책','유출대책','시스템대책'])}<table>${row('실수방지',`${c.PokaYoke||''} ${c.PokaYokeType||''} ${c.PokaYokeReason||''}`)}</table>
  <h3>D6 효과 검증</h3><table>${row('검증 기간',`${c.VerifyStart||''} ~ ${c.VerifyEnd||''}`)}${row('불량률',`개선 전 ${c.RateBefore||''} → 개선 후 ${c.RateAfter||''}`)}${row('재발 / 판정',`${c.Recurred||''} / ${c.VerifyResult||''}`)}</table>
  <h3>D7 재발 방지 · 표준화</h3><table>${row('공정 FMEA',`${c.FMEAUpdate||''} ${c.FMEARev||''}`)}${row('관리계획서',`${c.CPUpdate||''} ${c.CPRev||''}`)}${row('해당없음 사유',c.DocNAReason)}${row('수평전개',c.Yokoten)}</table>${actTable(['문서개정','수평전개','교육'])}
  <h3>D8 종결</h3><table>${row('종결일',c.CloseDate)}${row('종결 승인자',c.CloseApprover)}${row('보관기간',c.Retention)}</table>
  </body></html>`.replace('</head>',REPORT_HEAD).replace('<body>','<body>'+REPORT_BAR);
  reportShow(w,html,`8D_${c.CaseNo}.html`);
}

/* ---------- CSV (SharePoint 이전용 · 설계서 내부 이름) ---------- */
function czCSV(list){
  const pNo=id=>(db.parts.find(p=>p.id===id)||{}).partNo||'',cNo=id=>(czById('cases',id)||{}).CaseNo||'';
  let cols=[],rows=[];
  if(list==='cases'){
    cols=['CaseNo','Title','Origin','RequestType','Part','Supplier','Customer','CustomerClaimNo','DefectType','DefectQty','Description','ParentCase','LegacyNo','LinkedNCR','LinkedDefects',
      'Stage','Status','Ball','NextAction','RecheckDate','TargetClose','Owner','Priority','Created','SevS','ImpI','Score','TierAuto','Tier','TierReason','Response',
      'QtyStock','QtyWIP','QtyTransit','QtyCustomer','ContainDate','ContainMethod','ContainScope','Disposition','DeviationNo','DeviationScope','CustApprover','CustApproveDate','DispositionDate',
      'CustNotify','CustNotifyDate','CustNotifyReason','RcaScope','AnalysisTools','CauseOccur','CauseEscape','CauseSystem','FARIssueDate','D3Reply','D3Score','D7Reply','D7Score','D14Reply','D14Score','FARTotal',
      'PokaYoke','PokaYokeType','PokaYokeReason','FMEAUpdate','FMEARev','CPUpdate','CPRev','DocNAReason','Yokoten','VerifyStart','VerifyEnd','RateBefore','RateAfter','Recurred','VerifyResult','CloseDate','CloseApprover','Retention'];
    rows=db.cases.map(c=>Object.assign({},c,{Part:pNo(c.PartId),Supplier:supName(c.SupplierId),ParentCase:cNo(c.ParentCaseId),LinkedNCR:(db.ncrs.find(n=>n.id===c.NcrId)||{}).no||'',
      LinkedDefects:(c.DefectIds||[]).map(i=>db.defects.find(d=>d.id===i)).filter(Boolean).map(d=>`${d.date} ${d.partNo} ${d.qty}`).join('; '),
      TargetClose:czTarget(c),Score:has(c.SevS)&&has(c.ImpI)?num(c.SevS)*num(c.ImpI):'',TierAuto:czTierAuto(c),FARTotal:c.Response==='FAR'?czFar(c):'',AnalysisTools:(c.AnalysisTools||[]).join(';')}));
  }else if(list==='actions'){cols=['Title','Case','Category','Assignee','ExternalOwner','DueDate','DoneDate','ActionStatus'];rows=db.actions.map(a=>Object.assign({},a,{Case:cNo(a.CaseId)}))}
  else if(list==='parts'){cols=['Title','PartName','Supplier','VehicleCodes','SafetyChar','UnitPrice'];rows=db.parts.map(p=>({Title:p.partNo,PartName:p.name,Supplier:supName(p.supplierId),VehicleCodes:p.model,SafetyChar:p.safety||'해당없음',UnitPrice:p.price}))}
  else if(list==='suppliers'){cols=['Title','SupplierCode','ContactName','ContactEmail','Items'];rows=db.suppliers.map(s=>{const pc=primaryOf(s);return {Title:s.name,SupplierCode:s.code,ContactName:pc?pc.name:'',ContactEmail:pc?pc.email:'',Items:s.items}})}
  downloadCSV(`QMS_${list}_${today().replace(/-/g,'')}.csv`,[cols,...rows.map(r=>cols.map(k=>Array.isArray(r[k])?r[k].join(';'):r[k]??''))]);
}

