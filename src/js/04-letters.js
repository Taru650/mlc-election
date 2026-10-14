/* =====================================================================
 * Letters, attendance sheets and registers (printable HTML)
 * ===================================================================== */
function openDoc(title, html) {
  const m = openModal({
    title, wide: true, body: html || '<div class="alert info">Nothing to show.</div>',
    headExtra: '<button class="btn sm" data-act="printDoc" title="Print, or choose “Save as PDF” as the printer">🖨 Print / PDF</button><button class="btn sm" data-act="wordDoc" title="Download as an editable Word file">⬇ Word (.docx)</button>',
  });
  m.querySelector('.modal-body').id = 'docBody';
}
ACT.printDoc = () => {
  const body = $('#docBody'); if (!body) return;
  const pa = $('#printArea');
  pa.innerHTML = body.innerHTML;
  window.print();
  setTimeout(() => { pa.innerHTML = ''; }, 500);
};

const T = () => S.setup;
const placeName = () => esc(T().place || T().district);
function sigHtml() { return T().signature ? `<img class="sigimg" src="${esc(T().signature)}" alt="">` : '<br><br>'; }
function sigBlock() {
  return `<div class="sigs"><div>Place :- ${placeName()}<br>Date :- ${esc(fmtDate(T().letterDate))}</div>
    <div><br><b>${esc(T().authIssueTitle)}</b></div>
    <div>${sigHtml()}<b>${esc(T().authSubTitle)}</b><br>${esc(T().district)}</div></div>`;
}
function annexHead(title) {
  return `<div class="c b" style="font-size:13.5px">ANNEXURE III-A</div><div class="c b" style="font-size:12px">[Para 7, Chapter III]</div>
    <div class="ttl">${esc(title)}</div><div class="ttl2">${esc(T().electionTitle)}</div>`;
}
function rpaPara(what) {
  return `<p>In pursuance of sub-section (1) and sub-section (3) of section 26 of the Representation of the People Act, 1951 (43 of 1951), I, <b>${esc(T().roCumDeo)}</b>, ${what}</p>`;
}
function officerDetails(o, withBlocks = true) {
  return `Pin No :- <b>${esc(o.pin)}</b><br>Name :- <b>${esc(o.name)}</b><br>Office Detail :- ${esc(o.office)}${o.officeAddress ? ', ' + esc(o.officeAddress) : ''}<br>Designation :- ${esc(o.designation)}<br>Contact No :- ${esc(o.mobile)}${withBlocks ? `<br>Posting Block :- ${esc(o.postingBlock)}` : ''}`;
}
function pollHours() { return `<b>${esc(fmtDate(T().pollDate))}</b> during the hours <b>${esc(T().pollFrom)} to ${esc(T().pollTo)}</b>`; }
function matCollect() { return `<b>${esc(T().matCollectVenue)}${T().matCollectDate ? ' on ' + esc(fmtDate(T().matCollectDate)) : ''}${T().matCollectTime ? ' at ' + esc(T().matCollectTime) : ''}</b>`; }
function receipt(title, cols, extra = '') {
  return `<div class="rcpt"><span class="cut">✂ Counterfoil Receipt</span>
    <div class="c b">${esc(T().electionTitle)}</div><div class="c b" style="text-decoration:underline">${esc(title)}</div>
    <div class="row3" style="margin-top:4px">${cols.map(c => `<div>${c}</div>`).join('')}</div>${extra}
    <div class="right" style="margin-top:8px">Signature of Officer: ___________________________</div></div>`;
}

/* ---------- 1st letter ---------- */
function firstLetterHtml(o) {
  const sched = S.training[o.duty] || [];
  const rows = UI.firstLetterTrainings.map(i => { const t = sched[i] || {}; return `<tr><td>${ordinal(i + 1)}</td><td>${esc(fmtDate(t.date)) || '—'}</td><td>${esc(t.venue) || '—'}</td><td>${t.start ? esc(t.start) + ' to ' + esc(t.end) : '—'}</td></tr>`; }).join('');
  return `<div class="doc">${annexHead('Order of First Appointment Letter')}
    ${rpaPara(`hereby appoint the officer specified in column 1 of the table below for the duty mentioned in the corresponding entry in column 2 for conducting the ${esc(T().electionTitle)}.`)}
    <table class="lt"><tr><th style="width:62%">Column 1 — Employee Details</th><th>Column 2 — Duty</th></tr>
    <tr><td>${officerDetails(o)}</td><td style="vertical-align:middle"><b>Duty :- ${esc(o.duty)}</b></td></tr></table>
    <div class="b" style="font-size:13px">Training Details :-</div>
    <table class="lt cen"><tr><th>Training</th><th>Date</th><th>Venue</th><th>Time</th></tr>${rows}</table>
    <div class="note"><b>IMPORTANT:</b><br>• Participation in training on all the above dates is compulsory.<br>• Verify your mobile number in this letter. In case of any discrepancy, correct it on the receipt and return it to the Personnel Cell.<br>• Failure will invite action under the relevant provisions of the Representation of the People Act, 1951.<br>• The final appointment letter (revealing the polling station) and polling materials will be given before departure.</div>
    ${sigBlock()}
    ${receipt('First Appointment Letter — Receipt', [`Name :- <b>${esc(o.name)}</b><br>Designation :- ${esc(o.designation)}`, `PIN :- <b>${esc(o.pin)}</b><br>Contact :- ${esc(o.mobile)}`, `Duty :- <b>${esc(o.duty)}</b><br>Posting Block :- ${esc(o.postingBlock)}`])}
  </div>`;
}

/** Numbered instruction lines; empty entries are skipped and numbering closes up. */
function numbered(lines) { return lines.filter(Boolean).map((l, i) => `${i + 1}) ${l}`).join('<br>'); }
/** "venue on DD-MM-YYYY at HH:MM" for a duty's reporting details ('pp' polling party, 'mo', 'pc'); '' when no venue. */
function reportAt(k) {
  const st = T(), venue = k === 'mo' ? st.reportVenue : st[k + 'ReportVenue'], d = st[k + 'ReportDate'], t = st[k + 'ReportTime'];
  if (!str(venue) && !d && !t) return '';
  return `<b>${esc(venue || '—')}</b>${d ? ` on <b>${esc(fmtDate(d))}</b>` : ''}${t ? ` at <b>${esc(t)}</b>` : ''}`;
}

/* ---------- 2nd letters (booth NOT disclosed) ---------- */
/** Tick shown before the member a printed copy belongs to (4-copy distribution sets). */
const tick = (role, forRole) => (forRole && role === forRole ? '<span class="tick">✔</span> ' : '');
const COPY_ROLES = ['PRO', 'P1', 'P2', 'P3'];
function copyLine(forRole) { return forRole ? `<div class="copyfor">Copy ${COPY_ROLES.indexOf(forRole) + 1} of 4 — for ${esc(DUTY_BY_KEY[forRole].label)} <span class="tick">✔</span></div>` : ''; }
function secondPartyLetterHtml(p, forRole) {
  const rows = PARTY_ROLES.map(r => { const o = officerByPin(p[r]) || {}; return `<tr><td><b>${esc(DUTY_BY_KEY[r].label)}</b></td><td>${tick(r, forRole)}${esc(o.name)}</td><td>${esc(o.pin)}</td><td>${esc(o.designation)}, ${esc(o.office)}</td><td>${esc(o.mobile)}</td></tr>`; }).join('');
  const pro = officerByPin(p.PRO) || {};
  return `<div class="doc">${annexHead('Order of Second Appointment Letter')}
    <div class="hdr2"><span>ELECTION URGENT</span><span>PARTY NO :- ${esc(p.partyNo)}</span></div>${copyLine(forRole)}
    ${rpaPara(`hereby appoint the following officers as a polling party for conducting the ${esc(T().electionTitle)} for <b>${esc(constName(p.const))}</b>.`)}
    <table class="lt"><tr><th>Duty</th><th>Name</th><th>PIN</th><th>Designation &amp; Office</th><th>Contact</th></tr>${rows}</table>
    <div class="note"><b>IMPORTANT:</b><br>${numbered([`The poll will be taken on ${pollHours()}.`, reportAt('pp') && `The polling party shall report at ${reportAt('pp')}.`, `Polling materials are to be collected from ${matCollect()} and, after the poll, returned at <b>${esc(T().matDeposit)}</b>.`, 'The polling station will be notified later through the Final Appointment Letter.'])}</div>
    ${sigBlock()}
  </div>`;
}
function secondSingleLetterHtml(x, kind) {
  const o = officerByPin(x.pin) || {}, isP = kind === 'pccp';
  const duty = isP ? 'PATROLLING MAGISTRATE' : 'MICRO OBSERVER';
  const instr = isP
    ? numbered([`The poll will be taken on ${pollHours()}.`, reportAt('pc') && `Report at ${reportAt('pc')}.`, `Collect material from ${matCollect()} and return it at <b>${esc(T().matDeposit)}</b>.`, 'Booth / route details will be notified later through the Final Appointment Letter.'])
    : numbered([`The poll will be taken on ${pollHours()}.`, reportAt('mo') && `Report at ${reportAt('mo')} for detailed instructions from the Observer and collection of forms.`, `After the poll, report to the Observer at <b>${esc(T().matDeposit)}</b> personally.`, 'Booth will be notified later through the Final Appointment Letter.']);
  return `<div class="doc">${annexHead('Order of Second Appointment Letter')}
    <div class="hdr2"><span>ELECTION URGENT</span><span>${isP ? 'PCCP' : 'ORDER'} NO :- ${esc(x.orderNo)}</span></div>
    ${rpaPara(`hereby appoint the following officer as <b>${isP ? 'Patrolling Magistrate' : 'Micro Observer'}</b> for conducting the ${esc(T().electionTitle)} for <b>${esc(constName(x.const))}</b>.`)}
    <table class="lt"><tr><th style="width:62%">Employee Details</th><th>Duty</th></tr>
    <tr><td>${officerDetails(o, false)}</td><td style="vertical-align:middle"><b>Duty :- ${duty}</b><br>Constituency :- ${esc(x.const)}<br><i>Booth will be notified later.</i></td></tr></table>
    <div class="note"><b>IMPORTANT:</b><br>${instr}</div>
    ${sigBlock()}
  </div>`;
}

/* ---------- final letters (booth disclosed) ---------- */
/** Designation and office printed under an officer's name in the final party letter. */
function desigOffice(o) {
  const parts = [o.designation, o.office].map(str).filter(Boolean);
  return parts.length ? `<div class="dsub">${esc(parts.join(', '))}</div>` : '';
}
function finalPartyLetterHtml(b, p, forRole) {
  const m = r => officerByPin(p[r]) || {};
  return `<div class="doc">${annexHead('Order of Final Appointment Letter')}
    <div class="hdr2"><span>ELECTION URGENT</span><span>PARTY NO :- ${esc(p.partyNo)}</span></div>${copyLine(forRole)}
    <p>In pursuance of sub-section (1) and sub-section (3) of section 26 of the Representation of the People Act, 1951 (43 of 1951), I hereby appoint the officers specified in columns 2 and 3 of the table below as Presiding Officer and Polling Officers respectively for the polling station specified in column 1, for <b>${esc(constName(b.const))}</b>. I also authorise the Polling Officer-1 (P1) specified in column 4 to perform the functions of the Presiding Officer during the unavoidable absence, if any, of the Presiding Officer.</p>
    <table class="lt fl"><tr><th style="width:24%">Polling station no., name &amp; location<div class="c">1</div></th><th style="width:25%">Presiding Officer<div class="c">2</div></th><th style="width:33%">Polling Officers<div class="c">3</div></th><th>P1 authorised in absence of PO<div class="c">4</div></th></tr>
    <tr><td><b>Booth No :</b> ${esc(boothLabel(b))}<br><b>Location :</b> ${esc(b.name)}<br><b>Block :</b> ${esc(b.block)}<br><small>Constituency : ${esc(b.const)}</small></td>
    <td>${tick('PRO', forRole)}<b>${esc(m('PRO').name)}</b>${desigOffice(m('PRO'))}<div class="dsub">PIN: ${esc(m('PRO').pin)} · Mob: ${esc(m('PRO').mobile)}</div></td>
    <td>${['P1', 'P2', 'P3'].map((r, i) => `<div class="po${i ? ' po-next' : ''}">${tick(r, forRole)}${i + 1}. <b>${esc(m(r).name)}</b> (${r})${desigOffice(m(r))}<div class="dsub">PIN: ${esc(m(r).pin)} · Mob: ${esc(m(r).mobile)}</div></div>`).join('')}</td>
    <td style="text-align:center;vertical-align:middle"><b>${esc(m('P1').name)}</b><br>(Polling Officer-1)${desigOffice(m('P1'))}</td></tr></table>
    <div class="note">The poll will be taken on ${pollHours()}.<br>${reportAt('pp') ? `The polling party shall report at ${reportAt('pp')}.<br>` : ''}The Presiding Officer should collect the polling materials from ${matCollect()} and, after the poll, return them at <b>${esc(T().matDeposit)}</b>.</div>
    ${sigBlock()}
  </div>`;
}
function finalSingleLetterHtml(x, b, kind) {
  const o = officerByPin(x.pin) || {}, isP = kind === 'pccp';
  const duty = isP ? 'PATROLLING MAGISTRATE' : 'MICRO OBSERVER';
  return `<div class="doc">${annexHead('Order of Final Appointment Letter')}
    <div class="hdr2"><span>ELECTION URGENT</span><span>${isP ? 'PCCP' : 'ORDER'} NO :- ${esc(x.orderNo)}</span></div>
    ${rpaPara(`hereby appoint the following officer as <b>${isP ? 'Patrolling Magistrate' : 'Micro Observer'}</b> for the polling station mentioned below, for <b>${esc(constName(x.const))}</b>.`)}
    <table class="lt"><tr><th style="width:55%">Employee Details</th><th>Polling station</th></tr>
    <tr><td>${officerDetails(o, false)}<br><b>Duty :- ${duty}</b></td><td><b>Booth No :</b> ${esc(boothLabel(b))}<br><b>Location :</b> ${esc(b.name)}<br><b>Block :</b> ${esc(b.block)}<br>Constituency : ${esc(b.const)}</td></tr></table>
    <div class="note">The poll will be taken on ${pollHours()}.${isP ? `${reportAt('pc') ? ` Report at ${reportAt('pc')}.` : ''} Collect material from ${matCollect()} and return it at <b>${esc(T().matDeposit)}</b>.` : `${reportAt('mo') ? ` Report at ${reportAt('mo')} for instructions.` : ''} After the poll, report to the Observer at <b>${esc(T().matDeposit)}</b>.`}</div>
    ${sigBlock()}
  </div>`;
}
/** "Presiding Officer", "Polling Officer 1", "Micro Observer" … from a duty label. */
function postName(duty) { return str(duty).toLowerCase().replace(/-(\d)/, ' $1').replace(/\b[a-z]/g, c => c.toUpperCase()); }
/** Reserve final appointment letter — boxed layout (polling-station column, photo box, name & address,
 *  party / order no. with signature, place-date-authority row, and a Receiving section). */
function reserveLetterHtml(o, ref, cons, refLabel = 'Party No.') {
  const post = postName(o.duty);
  const nameAddr = `<b>${esc(o.name)}</b> (PIN :- ${esc(o.pin)})<br>${esc(o.designation)}<br>${esc(o.office)}${o.officeCode ? ` (OFF. CODE :- ${esc(o.officeCode)})` : ''}${o.officeAddress ? `<br>${esc(o.officeAddress)}` : ''}<br>CONTACT NO. :- ${esc(o.mobile)}`;
  return `<div class="doc rsv">
    <div class="rsv-urgent">ELECTION URGENT</div>
    <div class="rsv-title">ORDER OF FINAL APPOINTMENT OF RESERVE ${esc(post.toUpperCase())}</div>
    <div class="rsv-title">${esc(T().electionTitle)}</div>
    <p class="rsv-para">In pursuance of sub-section (1) and sub-section (3) of section 26 of the Representation of the People Act, 1951, I, ${esc(T().roCumDeo)}, hereby appoint the officer specified in column 2 of the table below as <b>Reserve ${esc(post)}</b> for <b>${esc(constName(cons))}</b> for the conduct of the ${esc(T().electionTitle)}. The polling station, if required, will be intimated later.</p>
    <table class="lt rsv-t">
      <colgroup><col style="width:44%"><col style="width:56%"></colgroup>
      <tr><th class="center">Polling Station No. &amp; Name with complete particulars of its location</th><th class="center">Name &amp; Address of Reserve</th></tr>
      <tr><td class="center">1</td><td class="center">2</td></tr>
      <tr class="rsv-main"><td class="center">Polling Station<br>Details to be<br>intimated Later</td><td>${nameAddr}</td></tr>
      <tr class="rsv-sigrow"><td><b>${esc(refLabel)} : ${esc(ref)}</b></td><td class="rsv-sig">${sigHtml()}</td></tr>
      <tr class="rsv-place"><td>Place :- ${placeName()}<br>Date :- ${esc(fmtDate(T().letterDate))}</td><td class="rsv-split"><table class="rsv-inner"><tr><td class="center">${esc(T().authIssueTitle)}</td><td class="center">${esc(T().authSubTitle)}<br>${esc(T().district)}</td></tr></table></td></tr>
      <tr><th colspan="2" class="center">Receiving</th></tr>
      <tr><td colspan="2"><b>Name &amp; Address of Reserve ${esc(post)}</b></td></tr>
      <tr class="rsv-recv"><td><b>${esc(refLabel)} : ${esc(ref)}</b><br>${nameAddr}</td><td class="rsv-signbox"><i>Signature</i></td></tr>
    </table>
  </div>`;
}

/* ---------- training attendance ---------- */
function trainingAttendanceHtml(n, dutyFilter) {
  const duties = DUTIES.filter(d => dutyFilter === 'ALL' || d.label === dutyFilter).filter(d => S.officers.some(o => o.duty === d.label));
  if (!duties.length) return '<div class="alert info">No officers for the selected duty.</div>';
  return duties.map(d => {
    const t = (S.training[d.label] || [])[n - 1] || {};
    const rows = S.officers.filter(o => o.duty === d.label);
    return `<div class="doc land reg"><div class="c b" style="font-size:16px">${esc(T().electionTitle)}</div><div class="c b">TRAINING ATTENDANCE SHEET — ${esc(T().district)}</div>
      <table class="lt"><tr><th>Training</th><td><b>${ordinal(n)} Training</b></td><th>Duty</th><td><b>${esc(d.label)}</b></td></tr>
      <tr><th>Date</th><td><b>${esc(fmtDate(t.date)) || '—'}</b></td><th>Time</th><td><b>${t.start ? esc(t.start) + ' to ' + esc(t.end) : '—'}</b></td></tr>
      <tr><th>Venue</th><td colspan="3"><b>${esc(t.venue) || '—'}</b></td></tr></table>
      <table class="lt"><tr><th style="width:4%">Sl</th><th style="width:8%">PIN</th><th style="width:14%">Name</th><th style="width:12%">Designation</th><th style="width:22%">Office / Contact / Posting block</th><th style="width:22%">Account details</th><th style="width:18%">Signature</th></tr>
      ${rows.map((o, i) => `<tr><td>${i + 1}</td><td><b>${esc(o.pin)}</b></td><td>${esc(o.name)}</td><td>${esc(o.designation)}</td><td>${esc(o.office)}${o.officeAddress ? ', ' + esc(o.officeAddress) : ''}<br>${esc(o.mobile)}<br>Posting: ${esc(o.postingBlock)}</td><td>A/c: ${esc(o.acNo)}<br>Bank: ${esc(o.bank)}<br>Branch: ${esc(o.branch)}<br>IFSC: ${esc(o.ifsc)}</td><td></td></tr>`).join('')}
      </table><div class="small">Total personnel: <b>${rows.length}</b></div></div>`;
  }).join('');
}

/* ---------- reports ---------- */
function regDoc(title, inner, land = true) {
  return `<div class="doc reg ${land ? 'land' : ''}"><div class="c b" style="font-size:16px">${esc(T().electionTitle)}</div><div class="c b" style="margin-bottom:8px">${esc(title)} — ${esc(T().district)}</div>${inner}<div class="small" style="margin-top:6px">Generated: ${esc(nowStamp())}</div></div>`;
}
function nameMob(pin) { const o = officerByPin(pin); return o ? `${esc(o.name)}<br><small>${esc(o.designation)}</small><br><small>${esc(o.pin)} · ${esc(o.mobile)}</small>` : ''; }
function tagged(kind, boothId) { if (!S.parts.final[kind]) return null; const list = kind === 'pccp' ? S.second.pccp : S.second.micro; return list.find(x => x.orderNo === S.final[kind][boothId]) || null; }
function finalPartyOf(b) { return S.second.parties.find(p => p.partyNo === S.final.polling[b.id]) || null; }
function reserveParties() { const used = new Set(Object.values(S.final.polling)); return S.second.parties.filter(p => !used.has(p.partyNo)); }
function reserveSingles(kind) { const used = new Set(Object.values(S.final[kind])); return S.second[kind].filter(x => !used.has(x.orderNo)); }

const REPORTS = {
  commMatrix: ['Communication matrix (one line per booth, incl. MO / PCCP)', () => regDoc('COMMUNICATION MATRIX', `<table class="lt"><tr><th>Const.</th><th>Booth</th><th>Block / location</th><th>Party</th><th>PrO</th><th>P1</th><th>P2</th><th>P3</th><th>Micro Observer</th><th>PCCP</th></tr>
    ${S.booths.map(b => { const p = finalPartyOf(b), mo = tagged('micro', b.id), pc = tagged('pccp', b.id); return `<tr><td>${esc(b.const)}</td><td><b>${esc(boothLabel(b))}</b></td><td>${esc(b.block)}<br><small>${esc(b.name)}</small></td><td>${p ? esc(p.partyNo) : ''}</td>${p ? PARTY_ROLES.map(r => `<td>${nameMob(p[r])}</td>`).join('') : '<td colspan="4"></td>'}<td>${mo ? nameMob(mo.pin) : '—'}</td><td>${pc ? nameMob(pc.pin) : '—'}</td></tr>`; }).join('')}</table>`)],
  boothWise: ['Booth-wise party list', () => regDoc('BOOTH-WISE PARTY LIST', `<table class="lt"><tr><th>Const.</th><th>Booth</th><th>Location</th><th>Block</th><th>Party</th><th>Presiding Officer</th><th>PrO contact</th></tr>
    ${S.booths.map(b => { const p = finalPartyOf(b), o = p ? officerByPin(p.PRO) : null; return `<tr><td>${esc(b.const)}</td><td><b>${esc(boothLabel(b))}</b></td><td>${esc(b.name)}</td><td>${esc(b.block)}</td><td><b>${p ? esc(p.partyNo) : ''}</b></td><td>${o ? esc(o.name) + ' (' + esc(o.pin) + ')' : ''}</td><td>${o ? esc(o.mobile) : ''}</td></tr>`; }).join('')}</table>`, false)],
  partyWise: ['Party-wise booth list', () => regDoc('PARTY-WISE BOOTH LIST', `<table class="lt"><tr><th>Party</th><th>Const.</th><th>Status</th><th>Booth</th><th>Block</th><th>PrO</th><th>P1</th><th>P2</th><th>P3</th></tr>
    ${S.second.parties.slice().sort((a, b) => a.partyNo.localeCompare(b.partyNo, undefined, { numeric: true })).map(p => { const bid = Object.keys(S.final.polling).find(k => S.final.polling[k] === p.partyNo); const b = bid ? boothById(bid) : null; return `<tr><td><b>${esc(p.partyNo)}</b></td><td>${esc(p.const)}</td><td>${b ? 'MAIN' : 'RESERVE'}</td><td>${b ? esc(boothLabel(b)) : '—'}</td><td>${b ? esc(b.block) : ''}</td>${PARTY_ROLES.map(r => `<td>${nameMob(p[r])}</td>`).join('')}</tr>`; }).join('')}</table>`)],
  dispatch: ['Dispatch attendance register', () => regDoc('DISPATCH ATTENDANCE REGISTER', `<table class="lt"><tr><th>Booth</th><th>Party</th><th>Duty</th><th>PIN</th><th>Name</th><th>Mobile</th><th style="width:20%">Signature</th></tr>
    ${S.booths.map(b => { const p = finalPartyOf(b); if (!p) return ''; return PARTY_ROLES.map(r => { const o = officerByPin(p[r]) || {}; return `<tr><td>${esc(b.const)} ${esc(boothLabel(b))}</td><td>${esc(p.partyNo)}</td><td>${esc(DUTY_BY_KEY[r].short)}</td><td>${esc(o.pin)}</td><td>${esc(o.name)}</td><td>${esc(o.mobile)}</td><td></td></tr>`; }).join(''); }).join('')}</table>`, false)],
  reserve: ['Reserve register', () => regDoc('RESERVE REGISTER', `<h4>Reserve polling parties</h4><table class="lt"><tr><th>Party</th><th>Const.</th><th>PrO</th><th>P1</th><th>P2</th><th>P3</th></tr>${reserveParties().map(p => `<tr><td><b>${esc(p.partyNo)}</b></td><td>${esc(p.const)}</td>${PARTY_ROLES.map(r => `<td>${nameMob(p[r])}</td>`).join('')}</tr>`).join('')}</table>
    <h4>Reserve PCCP</h4><table class="lt"><tr><th>Order</th><th>Const.</th><th>Officer</th></tr>${(S.parts.final.pccp ? reserveSingles('pccp') : []).map(x => `<tr><td>${esc(x.orderNo)}</td><td>${esc(x.const)}</td><td>${nameMob(x.pin)}</td></tr>`).join('')}</table>
    <h4>Reserve Micro Observers</h4><table class="lt"><tr><th>Order</th><th>Const.</th><th>Officer</th></tr>${(S.parts.final.micro ? reserveSingles('micro') : []).map(x => `<tr><td>${esc(x.orderNo)}</td><td>${esc(x.const)}</td><td>${nameMob(x.pin)}</td></tr>`).join('')}</table>`)],
  remaining: ['Officers not selected in 2nd randomisation', () => {
    const used = new Set(); S.second.parties.forEach(p => PARTY_ROLES.forEach(r => used.add(String(p[r])))); S.second.pccp.forEach(x => used.add(String(x.pin))); S.second.micro.forEach(x => used.add(String(x.pin)));
    const rows = S.officers.filter(o => !used.has(String(o.pin)) && !isExempt(o.pin));
    return regDoc('OFFICERS NOT SELECTED IN 2ND RANDOMISATION (exempted officers listed separately)', `<table class="lt"><tr><th>Sl</th><th>PIN</th><th>Name</th><th>Designation</th><th>Office</th><th>Duty</th><th>Home block</th><th>Posting block</th><th>Mobile</th></tr>${rows.map((o, i) => `<tr><td>${i + 1}</td><td>${esc(o.pin)}</td><td>${esc(o.name)}</td><td>${esc(o.designation)}</td><td>${esc(o.office)}</td><td>${esc(o.duty)}</td><td>${esc(o.homeBlock)}</td><td>${esc(o.postingBlock)}</td><td>${esc(o.mobile)}</td></tr>`).join('')}</table>`);
  }],
  blockCheck: ['Block exclusion proof (booth vs. member blocks)', () => regDoc('BLOCK EXCLUSION PROOF — every tagged officer vs. booth block', `<table class="lt"><tr><th>Booth</th><th>Booth block</th><th>Role</th><th>Officer</th><th>Office</th><th>Home block</th><th>Posting block</th><th>OK?</th></tr>
    ${S.booths.map(b => { const p = finalPartyOf(b); const rows = []; if (p) PARTY_ROLES.forEach(r => rows.push([DUTY_BY_KEY[r].short, p[r]])); const pc = tagged('pccp', b.id), mo = tagged('micro', b.id); if (pc) rows.push(['PCCP', pc.pin]); if (mo) rows.push(['MO', mo.pin]);
      return rows.map(([r, pin]) => { const o = officerByPin(pin) || {}; const ok = canServeAt(o, b); return `<tr><td>${esc(b.const)} ${esc(boothLabel(b))}</td><td><b>${esc(blockText(b.blockCode, b.block))}</b></td><td>${esc(r)}</td><td>${esc(o.name)} (${esc(o.pin)})</td><td>${esc(blockText(o.officeCode, o.office))}</td><td>${esc(blockText(o.homeBlockCode, o.homeBlock))}</td><td>${esc(blockText(o.postingBlockCode, o.postingBlock))}</td><td>${ok ? '✔' : '<b>✖</b>'}</td></tr>`; }).join(''); }).join('')}</table>`)],
  audit: ['Rule verification report', () => regDoc('RULE VERIFICATION REPORT', auditHtml(runAudit()).replace(/class="t"/g, 'class="lt"'), false)],
  log: ['Audit log (all actions)', () => regDoc('AUDIT LOG', `<table class="lt"><tr><th>Time</th><th>Action</th></tr>${S.log.slice().reverse().map(l => `<tr><td class="nowrap">${esc(l.time)}</td><td>${esc(l.action)}</td></tr>`).join('')}</table>`, false)],
};

VIEWS.reports = () => {
  const sp = S.parts.second, fp = S.parts.final, fin = fp.polling;
  const card = (t, d, btns) => `<div class="step"><h4>${esc(t)}</h4><div class="small muted">${esc(d)}</div><div class="btn-row">${btns}</div></div>`;
  const b = (act, arg, label, en) => `<button class="btn sm ${en ? 'pri' : ''}" data-act="${act}" data-arg="${arg}" ${en ? '' : 'disabled'}>${esc(label)}</button>`;
  return `<div class="card"><div class="card-head"><h2>Reports &amp; Letters</h2></div>
    <p class="small muted">Each letter set opens as soon as its own part is locked: 2nd letters after that part of the 2nd randomisation is locked, final letters after that part of the final randomisation is locked. Booth registers need the polling-party final tagging locked; PCCP / MO columns fill in once those parts are locked.</p>
    <div class="flow">
      ${card('1st appointment letters', 'Duty + training. Choose training rows on the 1st letter page.', b('go', 'letter1', 'Open 1st letter page', true))}
      ${card('Training attendance', 'Duty-wise, A4 landscape.', b('go', 'training', 'Open training page', true))}
      ${card('2nd letters — polling parties', 'Booth not disclosed. Office copy (1 per party) or distribution set (4 per party, ✔ before PrO / P1 / P2 / P3).', b('previewSecond', 'polling', 'Office copy', sp.polling) + b('previewSecond', 'polling4', '4 copies ✔', sp.polling))}
      ${card('Power vesting list', 'Party-wise Presiding Officer and Polling Officer-1 — PIN, name, designation, office, mobile — for approval of magisterial powers.', b('report', 'powerVesting', 'Open', sp.polling) + b('exportPowerVesting', '', 'Excel', sp.polling))}
      ${card('2nd letters — PCCP', 'Booth not disclosed.', b('previewSecond', 'pccp', 'Open', sp.pccp && S.second.pccp.length))}
      ${card('2nd letters — Micro Observers', 'Booth not disclosed.', b('previewSecond', 'micro', 'Open', sp.micro && S.second.micro.length))}
      ${card('Communication plan', 'After final booth tagging: for every booth — booth no. & full name, then PrO, P1, P2, P3 and Micro Observer with PIN, name, designation and mobile.', b('report', 'commPlan', 'Open (PDF / Word)', fp.polling) + b('exportCommPlan', '', 'Excel', fp.polling))}
      ${card('Final letters — main parties', 'Booth disclosed. Office copy (1 per booth) or distribution set (4 per booth, ✔ before PrO / P1 / P2 / P3).', b('finalLetters', 'polling', 'Office copy', fp.polling) + b('finalLetters', 'polling4', '4 copies ✔', fp.polling))}
      ${card('Final letters — PCCP / MO', 'Booth disclosed.', b('finalLetters', 'pccp', 'PCCP', fp.pccp && S.second.pccp.length) + b('finalLetters', 'micro', 'Micro Obs.', fp.micro && S.second.micro.length))}
      ${card('Final letters — reserve', 'One letter per reserve officer of each locked part.', b('finalLetters', 'reserve', 'Open', PART_KINDS.some(k => fp[k])))}
      ${Object.entries(REPORTS).filter(([k]) => k !== 'powerVesting' && k !== 'commPlan').map(([k, [t]]) => card(t, k === 'remaining' ? 'After 2nd randomisation.' : k === 'audit' || k === 'log' ? 'Any time.' : k === 'exempted' ? 'Officers withdrawn, with reasons.' : 'After final randomisation.', b('report', k, 'Open', k === 'audit' || k === 'log' || (k === 'exempted' && Object.keys(S.exempt).length > 0) || (k !== 'exempted' && (k === 'remaining' ? S.second.parties.length > 0 : fin))))).join('')}
    </div></div>
    <div class="card"><div class="card-head"><h3>Excel exports</h3></div><div class="btn-row">
      <button class="btn" data-act="exportSecond" ${S.second.parties.length ? '' : 'disabled'}>2nd randomisation (Excel)</button>
      <button class="btn" data-act="exportFinal" ${Object.keys(S.final.polling).length ? '' : 'disabled'}>Final deployment (Excel)</button>
      <button class="btn pri" data-act="saveProject">Full project (Excel)</button></div></div>`;
};
ACT.report = k => { const r = REPORTS[k]; if (r) openDoc(r[0], r[1]()); };
ACT.finalLetters = kind => {
  if (kind !== 'reserve' && kind !== 'polling4' && !S.parts.final[kind]) return toast(`Lock ${PART_NAME[kind]} in the final randomisation first.`, 'bad');
  if (kind === 'polling') {
    const html = S.booths.map(b => { const p = finalPartyOf(b); return p ? finalPartyLetterHtml(b, p) : ''; }).join('');
    return openDoc(`Final Appointment Letters — Main, office copy (${Object.keys(S.final.polling).length})`, html);
  }
  if (kind === 'polling4') {
    if (!S.parts.final.polling) return toast('Lock Polling parties in the final randomisation first.', 'bad');
    const html = S.booths.map(b => { const p = finalPartyOf(b); return p ? COPY_ROLES.map(r => finalPartyLetterHtml(b, p, r)).join('') : ''; }).join('');
    return openDoc(`Final Appointment Letters — 4 copies per party, ✔ PrO / P1 / P2 / P3 (${Object.keys(S.final.polling).length * 4})`, html);
  }
  if (kind === 'pccp' || kind === 'micro') {
    const html = S.booths.map(b => { const x = tagged(kind, b.id); return x ? finalSingleLetterHtml(x, b, kind) : ''; }).join('');
    return openDoc(`Final Appointment Letters — ${kind === 'pccp' ? 'PCCP' : 'Micro Observer'}`, html);
  }
  const parts = [];
  if (S.parts.final.polling) reserveParties().forEach(p => PARTY_ROLES.forEach(r => { const o = officerByPin(p[r]); if (o) parts.push(reserveLetterHtml(o, p.partyNo, p.const)); }));
  ['pccp', 'micro'].filter(k => S.parts.final[k]).forEach(k => reserveSingles(k).forEach(x => { const o = officerByPin(x.pin); if (o) parts.push(reserveLetterHtml(o, x.orderNo, x.const, 'Order No.')); }));
  openDoc(`Final Appointment Letters — Reserve (${parts.length})`, parts.join(''));
};

/* ---------- power vesting list (PrO + P1 of every formed party) ---------- */
function powerVestingRows() {
  return S.second.parties.slice().sort((a, b) => a.partyNo.localeCompare(b.partyNo, undefined, { numeric: true }))
    .flatMap(p => ['PRO', 'P1'].map(r => ({ p, r, o: officerByPin(p[r]) || {} })));
}
REPORTS.powerVesting = ['Power vesting list — Presiding Officer & Polling Officer-1', () => {
  if (!S.parts.second.polling) return '<div class="alert info">Lock Polling parties in the 2nd randomisation first.</div>';
  const rows = powerVestingRows();
  return regDoc('LIST OF PRESIDING OFFICERS AND POLLING OFFICERS-1 FOR VESTING OF MAGISTERIAL POWERS', `
    <p class="small">Party-wise list of Presiding Officers and Polling Officers-1 of all formed polling parties (${S.second.parties.length} parties, ${rows.length} officers), submitted for approval.</p>
    <table class="lt"><tr><th>Sl</th><th>Party No</th><th>Const.</th><th>Post</th><th>PIN</th><th>Name</th><th>Designation</th><th>Office</th><th>Mobile</th></tr>
    ${rows.map(({ p, r, o }, i) => `<tr><td>${i + 1}</td>${r === 'PRO' ? `<td rowspan="2"><b>${esc(p.partyNo)}</b></td><td rowspan="2">${esc(p.const)}</td>` : ''}<td>${r === 'PRO' ? 'Presiding Officer' : 'Polling Officer-1'}</td><td><b>${esc(o.pin)}</b></td><td>${esc(o.name)}</td><td>${esc(o.designation)}</td><td>${esc(o.office)}</td><td>${esc(o.mobile)}</td></tr>`).join('')}
    </table>
    <div class="sigs" style="margin-top:30px"><div>Place :- ${placeName()}<br>Date :- ${esc(fmtDate(T().letterDate))}</div><div></div><div>${sigHtml()}<b>${esc(T().authSubTitle)}</b><br>${esc(T().district)}</div></div>`);
}];
ACT.exportPowerVesting = () => {
  if (!S.parts.second.polling) return toast('Lock Polling parties in the 2nd randomisation first.', 'bad');
  const wb = XLSX.utils.book_new();
  addSheet(wb, 'Power_Vesting', ['Sl', 'Party No', 'Constituency', 'Post', 'PIN', 'Name', 'Designation', 'Office', 'Mobile'],
    powerVestingRows().map(({ p, r, o }, i) => [i + 1, p.partyNo, p.const, r === 'PRO' ? 'Presiding Officer' : 'Polling Officer-1', o.pin, o.name, o.designation, o.office, o.mobile]), [5, 14, 12, 18, 12, 26, 24, 34, 13]);
  saveWb(wb, `Power_Vesting_List_${safeName(S.setup.district)}.xlsx`);
};

/* ---------- communication plan: one block per booth (after final polling tagging is locked) ---------- */
/** Micro Observer row for a booth: the tagged MO, or a note when none is allotted / tagging not yet locked. */
function commPlanMoRow(b) {
  if (!partApplicable('micro')) return null;
  if (!S.parts.final.micro) return { r: 'MO', o: {}, note: 'Pending — Micro Observer final tagging not locked' };
  const x = tagged('micro', b.id);
  return x ? { r: 'MO', o: officerByPin(x.pin) || {}, order: x.orderNo } : { r: 'MO', o: {}, note: 'No Micro Observer allotted to this booth' };
}
function commPlanData() {
  return S.booths.map(b => {
    const p = finalPartyOf(b); if (!p) return null;
    const rows = PARTY_ROLES.map(r => ({ r, o: officerByPin(p[r]) || {} }));
    const mo = commPlanMoRow(b); if (mo) rows.push(mo);
    return { b, p, rows };
  }).filter(Boolean);
}
REPORTS.commPlan = ['Communication plan (booth-wise: PrO, P1, P2, P3, Micro Observer)', () => {
  if (!S.parts.final.polling) return '<div class="alert info">Lock Polling parties in the final randomisation first — the communication plan is generated after booth tagging.</div>';
  const data = commPlanData();
  return `<div class="doc commplan"><div class="c b" style="font-size:16px">${esc(T().electionTitle)}</div><div class="c b" style="margin-bottom:10px">COMMUNICATION PLAN — ${esc(T().district)} (${data.length} booths)</div>
    ${data.map(({ b, p, rows }) => `<div class="cp-booth">
      <div class="cp-head">Booth No. ${esc(boothLabel(b))} — ${esc(b.name)}</div>
      <div class="cp-sub">Block: ${esc(b.block)} · Constituency: ${esc(constName(b.const))} · Party No: <b>${esc(p.partyNo)}</b></div>
      <table class="lt"><tr><th style="width:24%">Post</th><th style="width:11%">PIN</th><th style="width:26%">Name</th><th style="width:26%">Designation</th><th>Mobile</th></tr>
      ${rows.map(({ r, o, note }) => note ? `<tr><td class="nowrap">${esc(DUTY_BY_KEY[r].label)}</td><td colspan="4"><i>${esc(note)}</i></td></tr>` : `<tr><td class="nowrap">${esc(DUTY_BY_KEY[r].label)}</td><td><b>${esc(o.pin)}</b></td><td>${esc(o.name)}</td><td>${esc(o.designation)}</td><td><b>${esc(o.mobile)}</b></td></tr>`).join('')}
      </table></div>`).join('')}
    <div class="small" style="margin-top:6px">Generated: ${esc(nowStamp())}</div></div>`;
}];
function commPlanRows() {
  return commPlanData().flatMap(({ b, p, rows }) => rows.map(({ r, o, note }) => [b.const, b.no, b.ext, b.name, b.block, p.partyNo, DUTY_BY_KEY[r].label, note ? '' : o.pin, note || o.name, note ? '' : o.designation, note ? '' : o.mobile]));
}
const COMMPLAN_HEAD = ['Constituency', 'Booth No', 'Main/Aux', 'Booth Name', 'Block', 'Party No', 'Post', 'PIN', 'Name', 'Designation', 'Mobile'];
ACT.exportCommPlan = () => {
  if (!S.parts.final.polling) return toast('Lock Polling parties in the final randomisation first.', 'bad');
  const wb = XLSX.utils.book_new();
  addSheet(wb, 'Communication_Plan', COMMPLAN_HEAD, commPlanRows(), [12, 9, 9, 40, 16, 14, 22, 12, 26, 26, 13]);
  saveWb(wb, `Communication_Plan_${safeName(S.setup.district)}.xlsx`);
};
