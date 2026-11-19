/* ================= 화면 라우팅 ================= */
const NAV_GRP={dash:'업무',sup:'분석',copq:'분석',master:'관리',data:'관리'};   // 좌측 사이드바 그룹 머리글
/* 좌측 사이드바 모드(1001px 이상 · 휴대폰 화면 아님)면 머리글의 사용자 · 비밀번호 · 관리 · 로그아웃 · 저작권을 사이드바 맨 아래로 옮기고, 아니면 머리글로 되돌림 */
const NAV_FT_IDS=['srvUser','hdrPw','hdrAdm','hdrOut','copyInfo'];
function navFoot(){
  const nav=$('#nav'),hd=document.querySelector('header');if(!nav||!hd)return;
  const side=window.matchMedia('(min-width:1001px)').matches&&!document.body.classList.contains('mob');
  let ft=$('#navFt')||window.__navFt||null;   // 떼어 둔 구역(문서 밖)도 재사용 — 그 안에 옮겨 둔 항목이 들어 있음
  const find=i=>$('#'+i)||(ft&&ft.querySelector('#'+i))||null;
  if(side){
    if(!ft){ft=document.createElement('div');ft.id='navFt';ft.className='navft noprint'}
    window.__navFt=ft;nav.appendChild(ft);NAV_FT_IDS.forEach(i=>{const e=find(i);if(e)ft.appendChild(e)});
  }else{
    const bk=$('#hdrBk');NAV_FT_IDS.forEach(i=>{const e=find(i);if(e&&e.parentNode!==hd)hd.insertBefore(e,bk)});
    if(ft)ft.remove();window.__navFt=null;
  }
}
try{window.matchMedia('(min-width:1001px)').addEventListener('change',()=>{if(typeof render==='function')render()})}catch(e){}
const TABS=[['dash','대시보드'],['issue','이슈'],['defect','불량 관리'],['inv','FAR'],['ncr','NCR / 8D'],['case','RCA'],['sup','협력사 품질'],['copq','COPQ'],['master','기준정보'],['data','설정 · 백업']];
const state={setTab:'general',tab:'dash',dashMonth:today().slice(0,7),
  df:{from:today().slice(0,4)+'-01-01',to:'',sup:'',status:'',type:'',q:''},
  nf:{status:'open',q:'',sup:'',type:'',from:'',to:''},
  ivf:{status:'open',q:''},
  supFrom:today().slice(0,4)+'-01-01',supTo:today(),copqYear:today().slice(0,4)};
// 읽기 전용 공유본에서 보이는 화면 (협력사 품질 · 기준정보 · 설정 · 백업은 숨김)
const RO_TABS=SHARE?['dash','issue','defect','inv','ncr','case','copq']:SRV&&!srvCanAdmin()?['dash','issue','defect','inv','ncr','case','sup','copq','master']:TABS.map(t=>t[0]);
function go(t){if((RO||SRV)&&!RO_TABS.includes(t)&&t!=='prog')t='dash';if(t==='prog'){t='case';if(typeof czUi!=='undefined')czUi.view='prog'}state.tab=t;render();window.scrollTo(0,0)}
