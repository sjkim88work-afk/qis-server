/* ================= 모달 ================= */
let mfDirty = false;
function askConfirm({
  title = '삭제할까요?',
  msg = '',
  items = [],
  note = '',
  ok = '삭제',
  danger = true,
  typeWord = '',
  alt = '',
  cancel = '취소',
  input = null,
} = {}) {
  return new Promise((res) => {
    const c = $('#cfm'),
      prevFocus = document.activeElement;
    c.innerHTML = `<div class="cbox" role="alertdialog" aria-modal="true"><div class="ch"><span class="ic ${danger ? 'dz' : 'nt'}">${danger ? '!' : '?'}</span>${esc(title)}</div>
      <div class="cb">${msg}${items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : ''}${
        note ? `<div class="note">${note}</div>` : ''
      }
      ${
        typeWord
          ? `<div style="margin-top:10px">계속하려면 <b>${esc(typeWord)}</b> 를 입력하세요<input id="cfmIn" autocomplete="off" style="width:100%;margin-top:4px"></div>`
          : ''
      }
      ${
        input
          ? `<div style="margin-top:10px">${esc(input.label || '사유')} ${input.required === false ? '' : '*'}<textarea id="cfmTx" style="width:100%;min-height:56px;margin-top:4px" placeholder="${esc(input.ph || '')}"></textarea></div>`
          : ''
      }</div>
      <div class="cf"><button type="button" class="b" id="cfmNo">${esc(cancel)}</button>${
        alt ? `<button type="button" class="b" id="cfmAlt">${esc(alt)}</button>` : ''
      }<button type="button" class="b ${danger ? 'dz' : 'p'}" id="cfmOk">${esc(ok)}</button></div></div>`;
    c.classList.add('on');
    const done = (v) => {
      c.classList.remove('on');
      c.innerHTML = '';
      document.removeEventListener('keydown', kh, true);
      try {
        prevFocus && prevFocus.focus && prevFocus.focus();
      } catch (e) {}
      res(v);
    };
    const okFn = () => {
      if (typeWord && $('#cfmIn').value.trim() !== typeWord) {
        toast(`'${typeWord}'를 정확히 입력하세요`);
        $('#cfmIn').focus();
        return;
      }
      if (input) {
        const v = $('#cfmTx').value.trim();
        if (!v && input.required !== false) {
          toast(`${input.label || '사유'}를 입력하세요`);
          $('#cfmTx').focus();
          return;
        }
        done(v || true);
        return;
      }
      done(true);
    };
    const kh = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        done(false);
      } else if (e.key === 'Enter' && typeWord && e.target.id === 'cfmIn') {
        e.preventDefault();
        okFn();
      }
    };
    $('#cfmNo').onclick = () => done(false);
    $('#cfmOk').onclick = okFn;
    if ($('#cfmAlt')) $('#cfmAlt').onclick = () => done('alt');
    c.onmousedown = (e) => {
      if (e.target === c) done(false);
    };
    document.addEventListener('keydown', kh, true);
    setTimeout(() => {
      ($('#cfmIn') || $('#cfmTx') || $('#cfmNo')).focus();
    }, 0);
  });
}
const qi = (s) => `<b>${esc(s)}</b>`;
let undoSnap = null,
  undoTimer = null,
  undoBusy = false;
async function takeSnap(photoIds = []) {
  let ph = [];
  try {
    if (photoIds.length) ph = await photoGetMany(photoIds);
  } catch (e) {}
  return { db: JSON.stringify(db), ph };
}
function offerUndo(snap, label) {
  undoSnap = snap;
  $('#undoMsg').textContent = label;
  $('#undo').classList.add('on');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, 10000);
}
function hideUndo() {
  $('#undo').classList.remove('on');
  undoSnap = null;
  clearTimeout(undoTimer);
}
async function doUndo() {
  if (!undoSnap) return;
  const s = undoSnap;
  hideUndo();
  undoBusy = true;
  db = migrate(JSON.parse(s.db));
  try {
    if (s.ph.length) {
      await photoPut(s.ph);
      photoStr = null;
    }
  } catch (e) {
    toast('사진 복원 실패: ' + e.message);
  }
  save();
  undoBusy = false;
  render();
  toast('되돌렸습니다');
}
// 창 아래 단추 줄 — 삭제(cls 'd') · left 단추는 왼쪽 끝에 따로, 나머지(취소 · 저장 …)는 오른쪽에
function modalFoot(btns) {
  const f = $('#mfoot');
  if (!f) return;
  f.innerHTML = '';
  const isL = (b) => b.left || /(^|\s)d(\s|$)/.test(b.cls || ''),
    mk = (b) => {
      const e = document.createElement('button');
      e.type = 'button';
      e.className = 'b ' + (b.cls || '');
      e.textContent = b.label;
      e.onclick = b.fn;
      f.appendChild(e);
    };
  const L = btns.filter(isL);
  L.forEach(mk);
  if (L.length) {
    const s = document.createElement('span');
    s.className = 'mfsp';
    f.appendChild(s);
  }
  btns.filter((b) => !isL(b)).forEach(mk);
}
function openModal(title, body, btns) {
  delete $('#modal').dataset.iss; // 이슈 상세 창 표시 (11-issue.js issShow 가 다시 붙임)
  delete $('#modal').dataset.inv; // FAR 창의 단계 표시 (15-defect.js editInv 가 다시 붙임)
  delete $('#modal').dataset.cz; // RCA 상세 창 표시 (27-rca-8d.js czShow 가 다시 붙임)
  $('#mt').textContent = title;
  $('#mbody').innerHTML = `<form id="mf" onsubmit="return false">${body}</form>`;
  modalFoot(btns);
  $('#modal').classList.add('on');
  $('#modal').scrollTop = 0;
  $('#mbody').scrollTop = 0;
  mfDirty = false;
  const mf = $('#mf');
  mf.addEventListener('input', () => (mfDirty = true));
  mf.addEventListener('change', () => (mfDirty = true));
}
async function closeModal(force) {
  if ($('#modal').dataset.cz && typeof czFlush === 'function') {
    czFlush();
    mfDirty = false;
  } // RCA 창: 쓰던 칸을 저장하고 닫음 (칸마다 바로 저장)
  if (force !== true && mfDirty && $('#modal').classList.contains('on')) {
    if (!(await askConfirm({ title: '작성 중인 내용이 있습니다', msg: '저장하지 않고 닫으면 입력한 내용이 사라집니다.', ok: '저장 안 하고 닫기' })))
      return;
  }
  mfDirty = false;
  $('#modal').classList.remove('on');
  cbClose();
  // 이슈 상세 창을 닫음 → 보고 있던 이슈 없음. 상세에서 연 다른 창(수정 · 불량 등록 …)을 닫음 → 상세로 돌아감
  const m = $('#modal');
  if (m.dataset.iss) {
    delete m.dataset.iss;
    state.issId = null;
    return;
  }
  // RCA 창을 닫음 → 보고 있던 RCA 없음. RCA 창에서 연 다른 창(NCR · 불량 …)을 닫음 → RCA 창으로 돌아감
  if (m.dataset.cz) {
    delete m.dataset.cz;
    czUi.openId = null;
  } else if (typeof czUi !== 'undefined' && czUi.openId && czById('cases', czUi.openId)) {
    czUi.caseId = czUi.openId;
    czShow();
    return;
  }
  if (state.issId && state.tab === 'issue' && issById(state.issId)) issShow(state.issId);
}
document.addEventListener('keydown', (e) => {
  if ($('#lb').classList.contains('on')) {
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') lbMove(-1);
    if (e.key === 'ArrowRight') lbMove(1);
    return;
  }
  if ($('#cfm').classList.contains('on')) return;
  if (e.key === 'Escape' && $('#modal').classList.contains('on')) closeModal();
});
window.addEventListener('storage', (e) => {
  if (e.key === KEY && dataStore === 'ls' && dataReady) {
    db = load();
    render();
    toast('다른 탭에서 변경된 내용을 불러왔습니다');
  }
});
