"""화면 시험 — 협력사 품질
   실행: python tests/e2e_browser.py tests/sample_backup.json --only supplier"""
import json      # noqa: F401
import os      # noqa: F401
import signal      # noqa: F401
import time      # noqa: F401

from e2e_lib import ROOT, URL, ok, settle, start      # noqa: F401


def run(c):
    A, B, C, tmp, env, b = c.A, c.B, c.C, c.tmp, c.env, c.b
    # 협력사 품질: 협력사 목록도 접었다 폈다 (월별 입고수량 현황과 같은 방식)
    r = A.evaluate("""async () => {const wait=ms=>window.__settle(ms),o={};mfDirty=false;closeModal(true);delete state.sqOpen;go('sup');await wait(200);
      const D=()=>[...document.querySelectorAll('#view details.card')],d0=D();o.n=d0.length;o.title=d0[0].querySelector('summary').textContent;o.open0=d0[0].open;o.rows=d0[0].querySelectorAll('tbody tr').length;
      d0[0].querySelector('summary').click();await wait(150);o.st=state.sqOpen;render();await wait(150);o.open1=D()[0].open;
      D()[0].querySelector('summary').click();await wait(150);render();await wait(150);o.open2=D()[0].open;return o}""")
    ok(r["n"] >= 2 and r["title"].startswith("협력사별 품질 현황") and r["open0"] and r["rows"] >= 1, f"협력사 품질: 협력사 목록이 접는 칸 · 처음에는 펴져 있음 ({r['title'][:20]})")
    ok(r["st"] is False and not r["open1"] and r["open2"], "접으면 다시 그려도 접힌 상태 유지 · 누르면 다시 펴짐")
