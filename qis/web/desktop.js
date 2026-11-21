/* QIS 데스크톱 프로그램 창 보조 — 서버가 데스크톱 모드로 화면을 보낼 때만 붙임 (index.html 은 그대로).
   · 관리 화면 → 저장 후 같은 창에서 이동, 다시 로그인 → 프로그램 새 창
   · 보고서 · 인쇄 미리보기(window.open('') 후 document.write) → 프로그램 새 창으로
   · 첨부 열기(새 탭) → 이 PC의 기본 프로그램으로, 파일 내려받기 → 저장 위치를 묻는 창으로
   · 백업 내려받기 → 프로그램의 저장 창, 설정 › 데이터 · 백업 문구를 프로그램에 맞춤 */
(function(){
  'use strict';
  var info={};try{info=JSON.parse(document.getElementById('qisServer').textContent)||{}}catch(e){}
  function api(){return window.pywebview&&window.pywebview.api}
  function withApi(fn){var a=api();if(a&&a.open_page)return fn(a);
    window.addEventListener('pywebviewready',function(){fn(api())},{once:true})}
  function say(m){if(typeof window.toast==='function')window.toast(m);else alert(m)}

  // ---- 새 창 ----
  var nativeOpen=window.open;
  window.open=function(url){
    var u=url==null?'':String(url);
    if(u===''||u==='about:blank'){
      var buf='',w={closed:false,focus:function(){},print:function(){},close:function(){w.closed=true},
        document:{open:function(){buf=''},write:function(h){buf+=h},writeln:function(h){buf+=h+'\n'},
          close:function(){var h=buf;if(!w.closed)withApi(function(a){a.open_report(h)})}}};
      return w;
    }
    if(/^\/(?!\/)/.test(u)){
      if(/^\/login/.test(u)){withApi(function(a){a.open_page(u)});return null}   // 다시 로그인: 이 창의 미저장 내용을 지키려고 새 창
      // 관리 화면 등: 보내지 않은 변경을 먼저 저장한 뒤 이 창에서 이동 ('QIS로 돌아가기'로 복귀)
      Promise.resolve(typeof window.srvSync==='function'?window.srvSync():0).catch(function(){}).then(function(){location.href=u});
      return null;
    }
    return nativeOpen.apply(window,arguments);
  };

  // ---- 첨부 열기 · 파일 내려받기 ----
  function asDataURL(href){
    return fetch(href).then(function(r){return r.blob()}).then(function(b){return new Promise(function(res,rej){
      var fr=new FileReader();fr.onload=function(){res(fr.result)};fr.onerror=function(){rej(fr.error)};fr.readAsDataURL(b)})});
  }
  function handleAnchor(a){
    var h=a.getAttribute('href')||'';
    if(/^mailto:/i.test(h)){withApi(function(x){x.open_url(h)});return true}
    if(!/^(blob:|data:)/.test(h))return false;
    var name=a.getAttribute('download');
    if(name===null&&a.target!=='_blank')return false;
    asDataURL(a.href).then(function(d){withApi(function(x){
      (name!==null?x.save_file(name||'QIS_파일',d):x.open_file(a.title||'첨부',d)).then(function(r){if(r)say(r)})})})
      .catch(function(err){say('파일을 처리하지 못했습니다: '+(err&&err.message||err))});
    return true;
  }
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;
    if(a&&handleAnchor(a)){e.preventDefault();e.stopPropagation()}
  },true);
  // 화면에 붙이지 않은 링크의 .click() (예: SQL 내보내기)도 같은 방식으로
  var aClick=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){if(!this.isConnected&&handleAnchor(this))return;return aClick.call(this)};

  // ---- 서버가 맡는 기능 → 프로그램 메뉴 ----
  document.addEventListener('DOMContentLoaded',function(){
    if(typeof window.exportJSON==='function')window.exportJSON=function(){
      if(info.role!=='admin'){say('관리자만 할 수 있습니다');return}
      withApi(function(a){a.export_backup().then(function(r){if(r)say(r)})});
    };
    if(typeof window.srvPanel==='function'){
      var orig=window.srvPanel;
      window.srvPanel=function(){var h=orig.apply(this,arguments);
        h=h.replace('매일 새벽 서버가 DB · 첨부를 백업 폴더에 저장합니다. 복원은 관리자가 서버에서 합니다.',
          '하루 한 번(새벽 2시 이후 처음 켜져 있을 때) 프로그램이 DB · 첨부를 백업 폴더에 저장합니다. 지금 백업 · 복원 · 가져오기는 프로그램 메뉴 ‘파일’에서 합니다.');
        h=h.replace('사내 서버','이 PC (QIS 프로그램)').replace('데이터는 사내 서버에 저장됩니다. 이 PC에는 남지 않습니다.',
          '데이터는 이 PC의 QIS 데이터 폴더에 저장됩니다 (메뉴 ‘파일 › 데이터 폴더 열기’).');
        return h};
    }
  });
})();
