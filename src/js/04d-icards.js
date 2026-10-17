/* =====================================================================
 * Identity cards — only for officers selected in the 2nd randomisation.
 * Card: QR | heading + duty + "Valid for election duty only";
 *       constituency code | mobile (+ blood group if known);
 *       photo space | party/order no., PIN-name, designation, office;
 *       signature + signatory label.
 * Printed 8 cards per A4 page (2 × 4), party-wise or duty-wise.
 * ===================================================================== */
if (typeof qrcode !== 'undefined' && qrcode.stringToBytesFuncs) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
const _qrCache = new Map();
/** QR image (data URL) for a text; cached. */
function qrDataUrl(text) {
  if (_qrCache.has(text)) return _qrCache.get(text);
  let url = '';
  try { const q = qrcode(0, 'M'); q.addData(text); q.make(); url = q.createDataURL(3, 0); } catch (e) { url = ''; }
  _qrCache.set(text, url); return url;
}
/** Compact QR payload (fewer modules = larger squares = reliable scanning from a printed card). */
function icardQrText(c) {
  const short = { 'PRESIDING OFFICER': 'PRO', 'POLLING OFFICER-1': 'P1', 'POLLING OFFICER-2': 'P2', 'POLLING OFFICER-3': 'P3', 'PATROLLING MAGISTRATE': 'PCCP', 'MICRO OBSERVER': 'MO' }[c.duty] || c.duty;
  return [`PIN:${c.o.pin}`, c.o.name, short, c.ref, c.const, S.setup.district].join('|');
}
/** Card descriptors {o, duty, ref, refLabel, const} for a selection. */
function icardList(mode, duty) {
  const sortP = (a, b) => a.partyNo.localeCompare(b.partyNo, undefined, { numeric: true });
  const sortO = (a, b) => a.orderNo.localeCompare(b.orderNo, undefined, { numeric: true });
  const partyCards = r => (S.parts.second.polling ? S.second.parties.slice().sort(sortP) : []).map(p => ({ o: officerByPin(p[r]), duty: DUTY_BY_KEY[r].label, ref: p.partyNo, refLabel: 'Party No', const: p.const }));
  const singles = kind => (S.parts.second[kind] ? S.second[kind].slice().sort(sortO) : []).map(x => ({ o: officerByPin(x.pin), duty: kind === 'pccp' ? 'PATROLLING MAGISTRATE' : 'MICRO OBSERVER', ref: x.orderNo, refLabel: 'Order No', const: x.const }));
  let list = [];
  if (mode === 'party') list = (S.parts.second.polling ? S.second.parties.slice().sort(sortP) : []).flatMap(p => PARTY_ROLES.map(r => ({ o: officerByPin(p[r]), duty: DUTY_BY_KEY[r].label, ref: p.partyNo, refLabel: 'Party No', const: p.const })));
  else {
    const keys = duty === 'ALL' ? ['PRO', 'P1', 'P2', 'P3', 'PM', 'MO'] : [duty];
    keys.forEach(k => { list = list.concat(k === 'PM' ? singles('pccp') : k === 'MO' ? singles('micro') : partyCards(k)); });
  }
  return list.filter(c => c.o);
}
function icardHtml(c) {
  const o = c.o, st = S.setup, qr = qrDataUrl(icardQrText(c));
  return `<table class="icard"><colgroup><col style="width:24%"><col style="width:76%"></colgroup>
    <tr class="ic-top"><td class="ic-qr">${qr ? `<img class="ic-qrimg" src="${qr}" alt="QR">` : ''}</td>
      <td class="ic-head"><div class="ic-headbox fitbox"><div class="ic-title">${esc(st.icardTitle || st.electionTitle)}</div><div class="ic-duty">Duty : ${esc(postName(c.duty))}</div><div class="ic-valid">(Valid For Election Duty Only)</div></div></td></tr>
    <tr class="ic-mid"><td class="ic-code">${esc(c.const)}</td><td class="ic-mob"><b>Mob. No:-</b>${esc(o.mobile)}${o.bloodGroup ? `&nbsp;&nbsp; <b>Blood Group:</b> ${esc(o.bloodGroup)}` : ''}</td></tr>
    <tr class="ic-body"><td class="ic-photo"><div class="ic-photobox"></div></td>
      <td class="ic-det"><div class="ic-detbox fitbox"><div class="ic-party">${esc(c.refLabel)}:- ${esc(c.ref)} &nbsp;(${esc(constName(c.const))})</div><div>${esc(o.pin)}-${esc(o.name)}</div><div>${esc(o.designation)}</div><div>${esc(o.office)}</div>${o.officeAddress ? `<div class="ic-addr">${esc(o.officeAddress)}</div>` : ''}</div></td></tr>
    <tr class="ic-sig"><td colspan="2"><div class="ic-sigwrap">${st.signature ? `<img class="ic-sigimg" src="${esc(st.signature)}" alt="">` : ''}<div class="ic-siglbl">${esc(st.icardSignLabel || 'Signature Of DEO')}</div></div></td></tr>
  </table>`;
}
const ICARDS_PER_PAGE = 8;
function icardsDoc(list) {
  if (!list.length) return '<div class="alert info">No identity cards — lock the relevant part of the 2nd randomisation first.</div>';
  const pages = [];
  for (let i = 0; i < list.length; i += ICARDS_PER_PAGE) {
    const chunk = list.slice(i, i + ICARDS_PER_PAGE), rows = [];
    for (let j = 0; j < chunk.length; j += 2) rows.push(`<tr><td>${icardHtml(chunk[j])}</td><td>${chunk[j + 1] ? icardHtml(chunk[j + 1]) : ''}</td></tr>`);
    pages.push(`<div class="doc icp"><table class="icgrid"><colgroup><col style="width:50%"><col style="width:50%"></colgroup>${rows.join('')}</table></div>`);
  }
  return pages.join('');
}
/** Shrinks text inside fixed-height boxes until it fits (keeps every card the same size). */
function fitIcards(root) {
  $$('.fitbox', root).forEach(box => {
    let fs = parseFloat(getComputedStyle(box).fontSize);
    while (box.scrollHeight > box.clientHeight + 1 && fs > 6) { fs -= 0.4; box.style.fontSize = fs.toFixed(1) + 'px'; }
  });
}
ACT.icards = mode => {
  const duty = mode === 'duty' ? (($('#icDuty') || {}).value || 'ALL') : '';
  const list = icardList(mode, duty);
  if (!list.length) return toast('No selected officers for this choice yet — lock that part of the 2nd randomisation first.', 'bad');
  openDoc(`Identity Cards — ${mode === 'party' ? 'party-wise (polling parties)' : 'duty-wise: ' + (duty === 'ALL' ? 'all duties' : DUTY_BY_KEY[duty].label)} (${list.length} cards)`, icardsDoc(list));
  fitIcards($('#docBody'));
};
VIEWS.icards = () => {
  const st = S.setup, sp = S.parts.second;
  const counts = { party: icardList('party').length };
  ['PRO', 'P1', 'P2', 'P3', 'PM', 'MO'].forEach(k => { counts[k] = icardList('duty', k).length; });
  const sample = icardList('party')[0] || icardList('duty', 'ALL')[0];
  return `<div class="card"><div class="card-head"><h2>Identity Cards</h2></div>
    <p class="small muted">Cards are generated <b>only for officers selected in the 2nd randomisation</b> (each part after it is locked). Printed 8 cards per A4 page; use <b>Print / PDF</b> in the preview. QR code holds PIN, name, duty, party / order no. and constituency. Photo space is left blank for pasting.</p>
    <div class="grid g2">
      <label class="f">Card heading (blank = election title)<input type="text" data-bind="setup.icardTitle" value="${esc(st.icardTitle)}" placeholder="${esc(st.electionTitle)}" data-rerender="1"></label>
      <label class="f">Signatory label under the signature<input type="text" data-bind="setup.icardSignLabel" value="${esc(st.icardSignLabel || 'Signature Of DEO')}" data-rerender="1"></label>
    </div>
    <p class="small">${st.signature ? '✔ Signature from Election Setup is printed on the cards.' : '⚠ No signature uploaded — upload it in Election Setup to print it on the cards.'}</p>
  </div>
  <div class="card"><div class="card-head"><h3>Generate</h3></div>
    <div class="flow">
      <div class="step"><h4>Party-wise</h4><div class="small muted">Polling parties in party order — PrO, P1, P2, P3 of each party together.</div>
        <div class="btn-row"><button class="btn pri" data-act="icards" data-arg="party" ${counts.party ? '' : 'disabled'}>Open ${counts.party} cards</button></div></div>
      <div class="step"><h4>Duty-wise</h4><div class="small muted">All officers of one duty together (or all duties in order).</div>
        <div class="btn-row"><select id="icDuty"><option value="ALL">All duties</option>${DUTIES.map(d => `<option value="${d.key}" ${counts[d.key] ? '' : 'disabled'}>${esc(d.label)} (${counts[d.key]})</option>`).join('')}</select>
        <button class="btn pri" data-act="icards" data-arg="duty" ${PART_KINDS.some(k => sp[k]) ? '' : 'disabled'}>Open</button></div></div>
    </div>
    ${PART_KINDS.some(k => sp[k]) ? '' : '<div class="alert warn" style="margin-top:10px">Lock at least one part of the 2nd randomisation to generate identity cards.</div>'}
  </div>
  ${sample ? `<div class="card"><div class="card-head"><h3>Sample card</h3></div><div class="doc icp" style="max-width:420px;padding:10px">${icardHtml(sample)}</div></div>` : ''}`;
};
