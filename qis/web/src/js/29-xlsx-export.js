/* ================= 엑셀(.xlsx) 파일 만들기 =================
   외부 라이브러리 없이 xlsx(= zip 안의 SpreadsheetML)를 직접 만든다. 압축 없이(STORE) 담으므로 어떤 브라우저에서나 됨.
   · 글자는 inlineStr 로 넣어 품번 '0001' · 긴 숫자 코드가 숫자로 바뀌지 않음 (CSV 의 고질 문제)
   · 숫자(number)는 숫자 셀 · 머리글 굵게 + 고정 + 자동 필터 · 줄바꿈 있는 칸은 줄바꿈 표시 · 열 너비는 내용에 맞춤
   · 시트 여러 장: xlsxBlob([{name,rows},...])                                                                    */
const XL_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function xlCrc(u8) {
  let c = -1;
  for (let i = 0; i < u8.length; i++) c = XL_CRC[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function xlZip(files) {
  // files: [{name, data(Uint8Array)}] → Blob (STORE)
  const enc = new TextEncoder(),
    parts = [],
    cd = [];
  let off = 0;
  const u16 = (v) => [v & 255, (v >> 8) & 255],
    u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  const dosT = 0x0800,
    dosD = ((2026 - 1980) << 9) | (1 << 5) | 1; // 고정 날짜(2026-01-01 00:00) — 내용만 중요
  for (const f of files) {
    const n = enc.encode(f.name),
      d = f.data,
      crc = xlCrc(d);
    const h = new Uint8Array([
      80,
      75,
      3,
      4,
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(dosT),
      ...u16(dosD),
      ...u32(crc),
      ...u32(d.length),
      ...u32(d.length),
      ...u16(n.length),
      ...u16(0),
      ...n,
    ]);
    parts.push(h, d);
    cd.push(
      new Uint8Array([
        80,
        75,
        1,
        2,
        ...u16(20),
        ...u16(20),
        ...u16(0x0800),
        ...u16(0),
        ...u16(dosT),
        ...u16(dosD),
        ...u32(crc),
        ...u32(d.length),
        ...u32(d.length),
        ...u16(n.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(off),
        ...n,
      ]),
    );
    off += h.length + d.length;
  }
  const cdLen = cd.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array([
    80,
    75,
    5,
    6,
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(cdLen),
    ...u32(off),
    ...u16(0),
  ]);
  return new Blob([...parts, ...cd, eocd], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
const xlEsc = (s) =>
  String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
function xlCol(i) {
  let s = '';
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = (i - m - 1) / 26;
  }
  return s;
}
const xlSheetName = (s, i) =>
  String(s || `Sheet${i + 1}`)
    .replace(/[\[\]:*?\/\\]/g, ' ')
    .trim()
    .slice(0, 31) || `Sheet${i + 1}`;
const xlWidth = (s) => [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);
function xlSheetXml(rows) {
  const nCol = rows.reduce((a, r) => Math.max(a, r.length), 0),
    w = new Array(nCol).fill(4);
  const cells = rows
    .map((r, ri) => {
      const cs = [];
      for (let ci = 0; ci < r.length; ci++) {
        let v = r[ci];
        if (v == null || v === '') continue;
        const ref = xlCol(ci) + (ri + 1);
        if (typeof v === 'number' && isFinite(v)) {
          cs.push(`<c r="${ref}"${ri ? '' : ' s="1"'}><v>${v}</v></c>`);
          w[ci] = Math.max(w[ci], String(v).length);
        } else {
          if (typeof v === 'boolean') v = v ? '예' : '아니오';
          v = String(v);
          if (v.length > 32767) v = v.slice(0, 32764) + '…';
          const ml = v.includes('\n'),
            first = ml ? v.split('\n')[0] : v;
          w[ci] = Math.max(w[ci], Math.min(xlWidth(first), 60));
          cs.push(`<c r="${ref}" t="inlineStr" s="${ri ? (ml ? 2 : 0) : 1}"><is><t xml:space="preserve">${xlEsc(v)}</t></is></c>`);
        }
      }
      return `<row r="${ri + 1}">${cs.join('')}</row>`;
    })
    .join('');
  const cols = nCol
    ? `<cols>${w.map((x, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(x + 2, 62)}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const ref = nCol && rows.length > 1 ? `<autoFilter ref="A1:${xlCol(nCol - 1)}${rows.length}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${
    rows.length > 1 ? '><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView>' : '/>'
  }</sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${cells}</sheetData>${ref}</worksheet>`;
}
function xlsxBlob(sheets) {
  const enc = new TextEncoder(),
    S = sheets.filter((s) => s && s.rows),
    names = new Set();
  const named = S.map((s, i) => {
    let n = xlSheetName(s.name, i),
      b = n,
      k = 2;
    while (names.has(n.toLowerCase())) n = b.slice(0, 28) + ' ' + k++;
    names.add(n.toLowerCase());
    return { name: n, rows: s.rows };
  });
  const files = [
    {
      name: '[Content_Types].xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('')}</Types>`,
      ),
    },
    {
      name: '_rels/.rels',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named
          .map((s, i) => `<sheet name="${xlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join('')}</sheets></workbook>`,
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join(
            '',
          )}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    {
      name: 'xl/styles.xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
      ),
    },
    ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(xlSheetXml(s.rows)) })),
  ];
  return xlZip(files);
}
/* 내려받기: downloadXlsx(name, [{name,rows}]) · 한 장이면 downloadXlsx(name, rows) 도 됨 */
function downloadXlsx(name, sheets) {
  if (Array.isArray(sheets) && (!sheets.length || Array.isArray(sheets[0])))
    sheets = [
      {
        name: String(name)
          .replace(/\.(xlsx|csv)$/i, '')
          .replace(/_\d{4}-\d{2}-\d{2}.*$/, '')
          .replace(/_\d{8}$/, ''),
        rows: sheets,
      },
    ];
  let fn = String(name).replace(/\.csv$/i, '');
  if (!/\.xlsx$/i.test(fn)) fn += '.xlsx';
  download(fn, xlsxBlob(sheets));
}
/* 모든 표를 시트로 — SQLite 내보내기와 같은 표 구성(x_ 열 = 앱이 계산한 값). 엑셀에서 피벗 · VLOOKUP 용 */
async function exportAllXlsx(btn) {
  if (btn) {
    btn.disabled = true;
  }
  try {
    const SQL = await loadSql(),
      { bytes } = await buildSqlite(),
      sdb = new SQL.Database(bytes);
    const tabs =
      sdb.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('about') ORDER BY name`)[0]?.values.map((v) => v[0]) || [];
    const sheets = tabs.map((t) => {
      const r = sdb.exec(`SELECT * FROM ${sqlId(t)}`)[0];
      return { name: t, rows: r ? [r.columns, ...r.values.map((row) => row.map((v) => (v == null ? '' : v)))] : [[]] };
    });
    sdb.close();
    downloadXlsx(`QIS_전체_${today()}.xlsx`, sheets);
    toast(`엑셀 파일을 만들었습니다 — 시트 ${sheets.length}장`);
  } catch (e) {
    toast('엑셀 만들기 실패: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}
