/* =====================================================================
 * Word (.docx) export — built in the browser, no internet needed.
 * Converts the rendered letters / reports (what you see in the preview)
 * into WordprocessingML: paragraphs, bordered tables, bold / italic /
 * underline, font sizes, alignment, the signature image and one page
 * per letter. The zip container is written with SheetJS' CFB module.
 * ===================================================================== */
const DOCX_PX_TWIP = 15;           // 1 CSS px = 0.75 pt = 15 twips
const DOCX_PAGE = { portrait: { w: 11906, h: 16838, m: 567 }, landscape: { w: 16838, h: 11906, m: 454 } }; // A4, 10 mm / 8 mm margins

function xmlEsc(s) { return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const BLOCK_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'TABLE', 'UL', 'OL', 'LI', 'CENTER', 'SECTION', 'DETAILS', 'SUMMARY']);
function cssColorHex(c) { const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/); if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return ''; const h = [m[1], m[2], m[3]].map(x => Number(x).toString(16).padStart(2, '0')).join('').toUpperCase(); return h === 'FFFFFF' ? '' : h; }
function isFlexRow(el) { const cs = getComputedStyle(el); return (cs.display === 'flex' || cs.display === 'inline-flex') && cs.flexDirection.startsWith('row'); }
function isBlockEl(el) {
  if (el.nodeType !== 1) return false;
  if (BLOCK_TAGS.has(el.tagName)) return true;
  const d = getComputedStyle(el).display;
  return d === 'block' || d === 'flex' || d === 'table' || d === 'list-item';
}
/** Paragraph top border (e.g. the dashed cut line above a receipt). */
function topBorderXml(cs) {
  const bt = parseFloat(cs.borderTopWidth) || 0;
  // only intentional separators (dashed cut line, dotted divider); solid borders belong to cells / page frames
  if (!(bt > 0) || (cs.borderTopStyle !== 'dashed' && cs.borderTopStyle !== 'dotted')) return '';
  const st = cs.borderTopStyle;
  return `<w:pBdr><w:top w:val="${st}" w:sz="${Math.max(4, Math.round(bt * 6))}" w:space="4" w:color="${cssColorHex(cs.borderTopColor) || '444444'}"/></w:pBdr>`;
}
function hasBlockChild(el) { return Array.from(el.children).some(isBlockEl); }

function DocxBuilder(landscape) {
  this.pg = landscape ? DOCX_PAGE.landscape : DOCX_PAGE.portrait;
  this.media = []; this.mediaBySrc = new Map(); this.pendingBreak = false; this.drawingSeq = 0;
}
DocxBuilder.prototype.runXml = function (text, cs, brk) {
  const rp = [];
  // element order follows the WordprocessingML schema (Word rejects out-of-order properties)
  if (Number(cs.fontWeight) >= 600 || cs.fontWeight === 'bold') rp.push('<w:b/>');
  if (cs.fontStyle === 'italic') rp.push('<w:i/>');
  const col = cssColorHex(cs.color); if (col && col !== '000000') rp.push(`<w:color w:val="${col}"/>`);
  const hp = Math.max(12, Math.round(parseFloat(cs.fontSize) * 1.5)); // px → half-points
  rp.push(`<w:sz w:val="${hp}"/><w:szCs w:val="${hp}"/>`);
  if (String(cs.textDecorationLine || cs.textDecoration).includes('underline')) rp.push('<w:u w:val="single"/>');
  if (cs.textTransform === 'uppercase') text = text.toUpperCase();
  return `<w:r><w:rPr>${rp.join('')}</w:rPr>${brk ? '<w:br/>' : `<w:t xml:space="preserve">${xmlEsc(text)}</w:t>`}</w:r>`;
};
DocxBuilder.prototype.imageXml = function (img) {
  const src = img.getAttribute('src') || '';
  const m = src.match(/^data:image\/(png|jpe?g|gif);base64,(.+)$/i);
  if (!m) return '';
  let item = this.mediaBySrc.get(src);
  if (!item) {
    const ext = m[1].toLowerCase().replace('jpg', 'jpeg');
    item = { id: 'rIdImg' + (this.media.length + 1), name: `image${this.media.length + 1}.${ext === 'jpeg' ? 'jpg' : ext}`, ext, b64: m[2] };
    this.media.push(item); this.mediaBySrc.set(src, item);
  }
  const w = Math.max(1, Math.round((img.offsetWidth || 120) * 9525)), h = Math.max(1, Math.round((img.offsetHeight || 40) * 9525));
  const n = ++this.drawingSeq;
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${w}" cy="${h}"/><wp:docPr id="${n}" name="Picture ${n}"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="${n}" name="${item.name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${item.id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
};
/** Collects inline content (text, b, span, br, img …) into runs. */
DocxBuilder.prototype.inlineRuns = function (nodes) {
  const out = [];
  const walk = node => {
    if (node.nodeType === 3) {
      const t = node.nodeValue.replace(/\s+/g, ' ');
      if (t) out.push({ text: t, cs: getComputedStyle(node.parentElement) });
      return;
    }
    if (node.nodeType !== 1) return;
    const cs = getComputedStyle(node);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (node.tagName === 'BR') { out.push({ br: true, cs }); return; }
    if (node.tagName === 'IMG') { out.push({ img: node }); return; }
    node.childNodes.forEach(walk);
  };
  nodes.forEach(walk);
  // trim leading / trailing spaces of the paragraph and around line breaks
  for (let i = 0; i < out.length; i++) {
    if (out[i].text == null) continue;
    const prev = out[i - 1], next = out[i + 1];
    if (!prev || prev.br) out[i].text = out[i].text.replace(/^ /, '');
    if (!next || next.br) out[i].text = out[i].text.replace(/ $/, '');
  }
  return out.filter(r => r.br || r.img || r.text);
};
DocxBuilder.prototype.paragraph = function (runs, el, alignOverride) {
  if (!runs.length) return '';
  const cs = getComputedStyle(el);
  const align = alignOverride || ({ center: 'center', right: 'right', end: 'right', justify: 'both' }[cs.textAlign] || 'left');
  const before = Math.round((parseFloat(cs.marginTop) || 0) * DOCX_PX_TWIP), after = Math.round((parseFloat(cs.marginBottom) || 0) * DOCX_PX_TWIP);
  const fs = parseFloat(cs.fontSize) || 14, lh = parseFloat(cs.lineHeight);
  const line = isFinite(lh) && lh > 0 ? Math.round(lh * DOCX_PX_TWIP) : Math.round(fs * 1.2 * DOCX_PX_TWIP);
  let ppr = (this.pendingBreak ? '<w:pageBreakBefore/>' : '') + topBorderXml(cs) + `<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="atLeast"/><w:jc w:val="${align}"/>`;
  this.pendingBreak = false;
  return `<w:p><w:pPr>${ppr}</w:pPr>${runs.map(r => r.img ? this.imageXml(r.img) : this.runXml(r.text || '', r.cs, r.br)).join('')}</w:p>`;
};
/** Converts an element's content to block-level XML (paragraphs / tables). */
DocxBuilder.prototype.blocks = function (el, alignOverride) {
  const out = [];
  if (el.nodeType === 1) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || el.classList.contains('chooser')) return out;
  }
  if (el.tagName === 'IMG') { const p = this.paragraph([{ img: el }], el.parentElement || el, alignOverride); if (p) out.push(p); return out; }
  if (el.tagName === 'TABLE') { out.push(this.table(el)); return out; }
  if (el.nodeType === 1 && isFlexRow(el) && el.children.length > 1) { out.push(this.flexTable(el)); return out; }
  if (!hasBlockChild(el)) { const p = this.paragraph(this.inlineRuns(Array.from(el.childNodes)), el, alignOverride); if (p) out.push(p); return out; }
  let inline = [];
  const flush = () => { const p = this.paragraph(this.inlineRuns(inline), el, alignOverride); if (p) out.push(p); inline = []; };
  el.childNodes.forEach(n => {
    if (n.nodeType === 1 && isBlockEl(n)) { flush(); out.push(...this.blocks(n, null)); }
    else inline.push(n);
  });
  flush();
  const bdr = el.nodeType === 1 ? topBorderXml(getComputedStyle(el)) : '';
  if (bdr && out[0] && out[0].startsWith('<w:p><w:pPr>') && !out[0].includes('<w:pBdr>')) {
    out[0] = out[0].replace(/^<w:p><w:pPr>(<w:pageBreakBefore\/>)?/, (m0, pb) => `<w:p><w:pPr>${pb || ''}${bdr}`);
    const gap = Math.round((parseFloat(getComputedStyle(el).marginTop) || 0) * DOCX_PX_TWIP);
    out[0] = out[0].replace(/w:before="(\d+)"/, (m0, v) => `w:before="${Math.max(Number(v), gap)}"`);
  }
  return out;
};
DocxBuilder.prototype.contentWidth = function () { return this.pg.w - 2 * this.pg.m; };
DocxBuilder.prototype.cellXml = function (cell, width, extra = '', align) {
  let inner = this.blocks(cell, align).join('');
  if (!inner.includes('<w:p>') && !inner.includes('<w:p ')) inner += '<w:p/>';
  else if (inner.endsWith('</w:tbl>')) inner += '<w:p/>';
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${extra}</w:tcPr>${inner}</w:tc>`;
};
DocxBuilder.prototype.table = function (tbl) {
  const rows = Array.from(tbl.rows); if (!rows.length) return '';
  const total = this.contentWidth(), tw = tbl.offsetWidth || 1;
  const first = rows.reduce((a, r) => (r.cells.length > a.cells.length ? r : a), rows[0]);
  const cols = Array.from(first.cells).map(c => Math.max(300, Math.round((c.offsetWidth / tw) * total)));
  const sumC = cols.reduce((a, b) => a + b, 0); const scale = total / sumC; for (let i = 0; i < cols.length; i++) cols[i] = Math.round(cols[i] * scale);
  const c0 = first.cells[0] ? getComputedStyle(first.cells[0]) : null;
  const bordered = c0 && parseFloat(c0.borderTopWidth) > 0 && c0.borderTopStyle !== 'none';
  const bd = bordered ? ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="6" w:space="0" w:color="000000"/>`).join('') : '';
  let xml = `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${bordered ? `<w:tblBorders>${bd}</w:tblBorders>` : ''}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>`;
  xml += `<w:tblGrid>${cols.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  rows.forEach(r => {
    xml += `<w:tr><w:trPr><w:cantSplit/>${r.parentElement.tagName === 'THEAD' ? '<w:tblHeader/>' : ''}</w:trPr>`;
    let ci = 0;
    Array.from(r.cells).forEach(c => {
      const span = Math.max(1, c.colSpan || 1);
      const w = cols.slice(ci, ci + span).reduce((a, b) => a + b, 0) || Math.round(total / cols.length);
      ci += span;
      const cs = getComputedStyle(c);
      let extra = span > 1 ? `<w:gridSpan w:val="${span}"/>` : '';
      const bg = cssColorHex(cs.backgroundColor); if (bg) extra += `<w:shd w:val="clear" w:color="auto" w:fill="${bg}"/>`;
      if (cs.verticalAlign === 'middle') extra += '<w:vAlign w:val="center"/>';
      xml += this.cellXml(c, w, extra);
    });
    xml += '</w:tr>';
  });
  return xml + '</w:tbl>';
};
/** Flex rows (signature block, receipt columns, header line) become a borderless table. */
DocxBuilder.prototype.flexTable = function (el) {
  const kids = Array.from(el.childNodes).filter(n => (n.nodeType === 1 && getComputedStyle(n).display !== 'none') || (n.nodeType === 3 && n.nodeValue.trim()));
  const total = this.contentWidth(), ew = el.offsetWidth || 1;
  const cs = getComputedStyle(el), spread = cs.justifyContent === 'space-between';
  const widths = kids.map(k => (k.nodeType === 1 && k.offsetWidth ? k.offsetWidth / ew : 1 / kids.length));
  const sum = widths.reduce((a, b) => a + b, 0);
  const cols = widths.map(w => Math.round((w / sum) * total));
  let xml = `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="nil"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${cols.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>`;
  kids.forEach((k, i) => {
    let align = null;
    const kAlign = k.nodeType === 1 ? getComputedStyle(k).textAlign : 'start';
    if (kAlign === 'center' || kAlign === 'right' || kAlign === 'end') align = kAlign === 'center' ? 'center' : 'right';
    else if (spread && kids.length > 1) align = i === 0 ? 'left' : i === kids.length - 1 ? 'right' : 'center';
    const vb = cs.alignItems === 'flex-end' ? '<w:vAlign w:val="bottom"/>' : '';
    if (k.nodeType === 3) { const span = document.createElement('span'); span.textContent = k.nodeValue; el.insertBefore(span, k); el.removeChild(k); k = span; }
    xml += this.cellXml(k, cols[i], vb, align);
  });
  return xml + '</w:tr></w:tbl>';
};
DocxBuilder.prototype.documentXml = function (docs) {
  const body = [];
  docs.forEach((d, i) => {
    if (i > 0) this.pendingBreak = true;
    const parts = this.blocks(d, null);
    if (this.pendingBreak) { parts.unshift('<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>'); this.pendingBreak = false; }
    body.push(...parts);
  });
  const p = this.pg, land = p === DOCX_PAGE.landscape;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="${p.w}" w:h="${p.h}"${land ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${p.m}" w:right="${p.m}" w:bottom="${p.m}" w:left="${p.m}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
};
function docxStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-IN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
}
/** Builds a .docx (Uint8Array) from the rendered .doc elements inside container. */
function buildDocx(container, title) {
  const docs = Array.from(container.querySelectorAll('.doc'));
  if (!docs.length) throw new Error('Nothing to export.');
  const b = new DocxBuilder(docs.some(d => d.classList.contains('land')));
  const docXml = b.documentXml(docs);
  const enc = s => new TextEncoder().encode(s);
  const cfb = XLSX.CFB.utils.cfb_new();
  const add = (path, data) => XLSX.CFB.utils.cfb_add(cfb, path, data);
  const exts = new Set(b.media.map(m => m.ext));
  add('[Content_Types].xml', enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...exts].map(e => `<Default Extension="${e === 'jpeg' ? 'jpg' : e}" ContentType="image/${e}"/>`).join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`));
  add('_rels/.rels', enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`));
  add('docProps/core.xml', enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(title)}</dc:title><dc:creator>MLC Polling Personnel Tool</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`));
  add('word/document.xml', enc(docXml));
  add('word/styles.xml', enc(docxStylesXml()));
  add('word/_rels/document.xml.rels', enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${b.media.map(m => `<Relationship Id="${m.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('')}</Relationships>`));
  b.media.forEach(m => { const bin = atob(m.b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); add('word/media/' + m.name, u); });
  return XLSX.CFB.write(cfb, { type: 'array', fileType: 'zip', compression: true });
}
ACT.wordDoc = () => {
  const body = $('#docBody'); if (!body) return;
  const title = ($('#modalRoot .overlay:last-child .modal-head .t') || {}).textContent || 'Letters';
  toast('Preparing Word file…');
  setTimeout(() => {
    try {
      const data = buildDocx(body, title);
      downloadBlob(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), `${safeName(title)}_${safeName(S.setup.district)}.docx`);
      addLog(`Word file exported: ${title}`); persist();
    } catch (e) { console.error(e); toast('Word export failed: ' + (e.message || e), 'bad'); }
  }, 30);
};
