/* ================= 텔레그램 아침 요약 =================
   매일 정한 시각 이후 QIS를 처음 열 때(또는 열려 있을 때) 하루 한 번, 지연 · 오늘 기한 · 이슈 분류 대기를 텔레그램으로 보냄.
   봇 토큰 · 받을 곳은 이 PC 브라우저(localStorage)에만 저장 — 데이터 · 백업 · 공유본에 들어가지 않음.
   보낸 날짜는 데이터(db.meta.tgSent)에 남겨 다른 창 · PC에서 같은 날 두 번 보내지 않음. */
const TG_KEY = 'qis_tg';
const tgCfg = () => {
  let c = {};
  try {
    c = JSON.parse(localStorage.getItem(TG_KEY) || '{}') || {};
  } catch (e) {}
  return { token: '', chat: '', time: '08:00', on: false, noWeekend: true, detail: false, ...c };
};
function tgSet(k, v) {
  const c = tgCfg();
  c[k] = v;
  try {
    localStorage.setItem(TG_KEY, JSON.stringify(c));
  } catch (e) {
    toast('이 브라우저에 저장하지 못했습니다');
    return;
  }
  const el = $('#setSaved');
  if (el) {
    el.textContent = '저장됨';
    el.style.opacity = 1;
    setTimeout(() => {
      el.style.opacity = 0;
    }, 1200);
  }
}
const tgShort = (s) => String(s || '').split(/ · | — /)[0];
function tgSummary() {
  const t = today(),
    cfg = tgCfg(),
    P = progCases();
  const late = P.filter((c) => c.late.length).sort((a, b) => b.late[0].n - a.late[0].n);
  const due = P.filter((c) => c.next && c.next.nextDate === t && !c.late.length);
  const kind = (c) => (c.kind === 'ncr' ? 'NCR' : c.kind === 'rca' ? 'RCA' : '불량'),
    lbl = (s) => (cfg.detail ? s : tgShort(s));
  const L = [`[QIS] ${t.slice(5).replace('-', '/')}(${'일월화수목금토'[new Date(t + 'T00:00').getDay()]}) 아침 품질 요약`];
  L.push('', `■ 지연 ${late.length}건`);
  late
    .slice(0, 10)
    .forEach((c) => L.push(`· ${kind(c)} ${c.title} — ${lbl(c.late[0].l)} D+${c.late[0].n}${c.late.length > 1 ? ` (외 ${c.late.length - 1})` : ''}`));
  if (late.length > 10) L.push(`· 외 ${late.length - 10}건`);
  L.push('', `■ 오늘 기한 ${due.length}건`);
  due.slice(0, 10).forEach((c) => L.push(`· ${kind(c)} ${c.title} — ${lbl(c.next.next)}`));
  if (due.length > 10) L.push(`· 외 ${due.length - 10}건`);
  const is = db.issues || [],
    wait = is.filter(issWait),
    hot = is.filter((i) => issHot(i) && !i.contain);
  if (wait.length || hot.length) {
    L.push('', `■ 이슈 분류 대기 ${wait.length}건${hot.length ? ` · 격리 기록 없음 ${hot.length}건` : ''}`);
    [...new Set([...hot, ...wait])]
      .slice(0, 5)
      .forEach((i) => L.push(`· ${i.no}${cfg.detail ? ' ' + i.title : ''}${i.urg === '긴급' ? ' (긴급)' : ''}`));
  }
  L.push(
    '',
    `미종결 NCR ${db.ncrs.filter((n) => ncrStatus(n) !== '종결').length} · 진행 중 RCA ${db.cases.filter(czOpen).length} · 열린 이슈 ${is.filter((i) => !i.closedAt).length}`,
  );
  return L.join('\n');
}
async function tgCall(method, params, cfg) {
  cfg = cfg || tgCfg();
  if (!cfg.token) throw new Error('봇 토큰이 없습니다');
  let r;
  try {
    r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(cfg.token).replace(/%3A/gi, ':')}/${method}`, {
      method: 'POST',
      body: new URLSearchParams(params || {}),
    });
  } catch (e) {
    throw new Error('텔레그램에 연결하지 못했습니다 — 인터넷 · 회사망 차단(api.telegram.org)을 확인하세요');
  }
  let j = null;
  try {
    j = await r.json();
  } catch (e) {}
  if (!j || !j.ok) throw new Error((j && j.description) || `텔레그램 응답 오류 (${r.status})`);
  return j.result;
}
const tgSend = (text, cfg) => {
  cfg = cfg || tgCfg();
  if (!cfg.chat) return Promise.reject(new Error('받을 곳(chat ID)이 없습니다'));
  return tgCall('sendMessage', { chat_id: cfg.chat, text, disable_web_page_preview: 'true' }, cfg);
};
let tgBusy = false;
async function tgSendSummary(manual) {
  if (tgBusy) return;
  tgBusy = true;
  try {
    await tgSend(tgSummary());
    db.meta.tgSent = today();
    save();
    if (manual) toast('텔레그램으로 요약을 보냈습니다');
    if (state.tab === 'data' && state.setTab === 'tg') render();
  } catch (e) {
    if (manual) toast('전송 실패: ' + e.message);
    else console.warn('텔레그램 아침 요약 실패', e);
    throw e;
  } finally {
    tgBusy = false;
  }
}
// 자동 전송 조건: 켜짐 · 토큰/받을 곳 있음 · 오늘 아직 안 보냄 · 정한 시각 지남 · (주말 제외) · 편집 가능한 창 · 데이터 정상
function tgDue(now) {
  const c = tgCfg(),
    d = now || new Date(),
    t = today(),
    hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (typeof SRV !== 'undefined' && SRV) return false; // 서버판은 서버가 보냄 (관리 › 알림)
  if (!c.on || !c.token || !c.chat) return false;
  if (RO || tabLocked || loadFailed || !dataReady || (typeof folderWait !== 'undefined' && folderWait)) return false;
  if (db.meta.tgSent === t || hm < (c.time || '08:00')) return false;
  if (c.noWeekend && [0, 6].includes(d.getDay())) return false;
  return true;
}
function tgAuto() {
  if (tgDue()) tgSendSummary(false).catch(() => {});
}
bootReady.then(() => {
  setTimeout(tgAuto, 4000);
  setInterval(tgAuto, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(tgAuto, 1500);
  });
});
async function tgTest() {
  try {
    await tgSend('[QIS] 텔레그램 알림 시험 전송입니다.');
    toast('시험 메시지를 보냈습니다 — 텔레그램에서 확인하세요');
  } catch (e) {
    toast('전송 실패: ' + e.message);
  }
}
// 봇을 그룹에 초대한 뒤 그룹에서 메시지를 한 번 보내면, 최근 대화에서 받을 곳(chat ID)을 찾음
async function tgFindChats() {
  const b = $('#tgChats');
  if (b) b.innerHTML = '<span class="muted">찾는 중…</span>';
  try {
    const ups = await tgCall('getUpdates', { limit: '50' }),
      m = new Map();
    ups.forEach((u) => {
      const ch = (u.message || u.channel_post || u.my_chat_member || u.edited_message || {}).chat;
      if (ch && ch.id != null) m.set(String(ch.id), ch);
    });
    if (!b) return;
    b.innerHTML = m.size
      ? [...m.values()]
          .map(
            (ch) =>
              `<button class="b s" onclick="tgSet('chat',${jsq(String(ch.id))});render()">${esc(ch.title || [ch.first_name, ch.last_name].filter(Boolean).join(' ') || ch.username || ch.id)} <span class="muted">(${esc(ch.type)} · ${esc(String(ch.id))})</span></button>`,
          )
          .join(' ')
      : '<span class="muted">찾은 대화가 없습니다 — 봇을 그룹에 초대한 뒤 그 그룹에 아무 메시지나 한 번 보내고 다시 누르세요</span>';
  } catch (e) {
    if (b) b.innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`;
  }
}
