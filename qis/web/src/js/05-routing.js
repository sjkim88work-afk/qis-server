/* ================= 화면 라우팅 ================= */
const TABS=[['dash','대시보드'],['issue','이슈'],['defect','불량 관리'],['inv','귀책 조사'],['ncr','NCR / 8D'],['case','RCA'],['sup','협력사 품질'],['copq','COPQ'],['master','기준정보'],['data','설정 · 백업']];
const state={setTab:'general',tab:'dash',dashMonth:today().slice(0,7),
  df:{from:today().slice(0,4)+'-01-01',to:'',sup:'',status:'',type:'',q:''},
  nf:{status:'open',q:'',sup:'',type:'',from:'',to:''},
  ivf:{status:'open',q:''},
  supFrom:today().slice(0,4)+'-01-01',supTo:today(),copqYear:today().slice(0,4)};
// 읽기 전용 공유본에서 보이는 화면 (협력사 품질 · 기준정보 · 설정 · 백업은 숨김)
const RO_TABS=SHARE?['dash','issue','defect','inv','ncr','case','copq']:SRV&&!srvCanAdmin()?['dash','issue','defect','inv','ncr','case','sup','copq','master']:TABS.map(t=>t[0]);
function go(t){if((RO||SRV)&&!RO_TABS.includes(t)&&t!=='prog')t='dash';if(t==='prog'){t='case';if(typeof czUi!=='undefined')czUi.view='prog'}state.tab=t;render();window.scrollTo(0,0)}
