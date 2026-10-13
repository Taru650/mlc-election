/* =====================================================================
 * Exemptions — officers removed from the 2nd and final randomisation
 * (e.g. medical / administrative reasons after training), with reason,
 * category, order reference and date, plus an exemption register.
 * ===================================================================== */
const EXEMPT_CATEGORIES = ['Medical', 'Administrative', 'Retired / Transferred', 'Absent in training', 'Other'];
UI.exSel = new Set(); UI.exQuery = ''; UI.exPage = 1;

/** Parts (2nd randomisation) in which a PIN is currently selected. */
function partsUsingPin(pin) {
  const p = String(pin), out = [];
  if (S.second.parties.some(x => PARTY_ROLES.some(r => String(x[r]) === p))) out.push('polling');
  if (S.second.pccp.some(x => String(x.pin) === p)) out.push('pccp');
  if (S.second.micro.some(x => String(x.pin) === p)) out.push('micro');
  return out;
}
function exemptInfoFromForm() {
  const g = id => str(($('#' + id) || {}).value);
  return { category: g('exCat') || 'Other', reason: g('exReason'), orderRef: g('exOrder'), date: g('exDate') || new Date().toISOString().slice(0, 10) };
}
/** Exempts PINs. Refuses if any is in a LOCKED part; clears unlocked parts that contain them (after confirmation). */
function exemptPins(pins, info) {
  pins = [...new Set(pins.map(p => str(p)).filter(Boolean))];
  if (!pins.length) return toast('Enter or tick at least one PIN.', 'bad');
  if (!info.reason) return toast('Write the reason for exemption.', 'bad');
  const unknown = pins.filter(p => !officerByPin(p)), already = pins.filter(p => isExempt(p));
  const todo = pins.filter(p => officerByPin(p) && !isExempt(p));
  if (unknown.length && !todo.length) return showErrors('PIN not found', [`Not in the officer list: ${unknown.join(', ')}`]);
  const lockedHits = [], clear = new Set();
  todo.forEach(p => partsUsingPin(p).forEach(k => { if (S.parts.second[k]) lockedHits.push(`PIN ${p} is already selected in the LOCKED ${PART_NAME[k]} randomisation`); else clear.add(k); }));
  if (lockedHits.length) return showErrors('Cannot exempt — officer already in a locked randomisation', lockedHits.concat(['Unlock that part of the 2nd randomisation first (its result will then need a re-run), or use a reserve instead.']));
  if (clear.size && !confirmBox(`These officers are in the current (unlocked) ${[...clear].map(k => PART_NAME[k]).join(', ')} randomisation. Exempting them will DISCARD that result so it can be re-run without them. Continue?`)) return;
  clear.forEach(k => { if (k === 'polling') S.second.parties = []; else S.second[k] = []; delete S.second.ran[k]; S.final[k] = {}; delete S.final.ran[k]; });
  const at = nowStamp();
  todo.forEach(p => { S.exempt[p] = Object.assign({ at }, info); });
  addLog(`Exempted ${todo.length} officer(s) [${info.category}] ${info.reason}${info.orderRef ? ' (ref ' + info.orderRef + ')' : ''}: ${todo.join(', ')}`);
  UI.exSel.clear();
  persist(); render();
  const notes = [];
  if (already.length) notes.push(`already exempted: ${already.join(', ')}`);
  if (unknown.length) notes.push(`not found: ${unknown.join(', ')}`);
  toast(`${todo.length} officer(s) exempted.${notes.length ? '\n' + notes.join('\n') : ''}${clear.size ? '\nRe-run: ' + [...clear].map(k => PART_NAME[k]).join(', ') : ''}`, notes.length ? 'warn' : 'ok');
}
ACT.exemptByPin = () => exemptPins(str(($('#exPins') || {}).value).split(/[\s,;]+/), exemptInfoFromForm());
ACT.exemptTicked = () => exemptPins([...UI.exSel], exemptInfoFromForm());
ACT.exTick = (pin, el) => { if (el.checked) UI.exSel.add(pin); else UI.exSel.delete(pin); const c = $('#exSelCount'); if (c) c.textContent = UI.exSel.size; };
ACT.exTickPage = (a, el) => { $$('input[data-chg="exTick"]').forEach(cb => { cb.checked = el.checked; if (el.checked) UI.exSel.add(cb.dataset.arg); else UI.exSel.delete(cb.dataset.arg); }); const c = $('#exSelCount'); if (c) c.textContent = UI.exSel.size; };
ACT.exSearch = (a, el) => { UI.exQuery = el.value; UI.exPage = 1; const pos = el.selectionStart; render(); const n = $('[data-inp="exSearch"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
ACT.exPageNav = d => { UI.exPage += Number(d); render(); };
ACT.restoreExempt = pin => {
  const e = S.exempt[pin]; if (!e) return;
  const o = officerByPin(pin);
  if (!confirmBox(`Restore ${o ? o.name : ''} (PIN ${pin}) to the randomisation pool?\nExempted for: ${e.reason}`)) return;
  delete S.exempt[pin];
  addLog(`Exemption withdrawn for PIN ${pin} (was: ${e.reason})`);
  persist(); render();
  toast(`PIN ${pin} restored. Already-formed results are unchanged; re-run an unlocked part if you want this officer considered.`, 'ok');
};

VIEWS.exempt = () => {
  const ready = !prereqs('exempt').length;
  const q = UI.exQuery.toLowerCase();
  const rows = S.officers.filter(o => !isExempt(o.pin) && (!q || [o.pin, o.name, o.designation, o.office, o.officeCode, o.duty, o.mobile].some(x => str(x).toLowerCase().includes(q))));
  const ps = 50, pages = Math.max(1, Math.ceil(rows.length / ps)); UI.exPage = Math.min(Math.max(1, UI.exPage), pages);
  const slice = rows.slice((UI.exPage - 1) * ps, UI.exPage * ps);
  const ex = Object.entries(S.exempt);
  const lockedParts = PART_KINDS.filter(k => S.parts.second[k]);
  return `
  <div class="card">
    <div class="card-head"><h2>Exemptions</h2><span class="spacer"></span><span class="badge ${ex.length ? 'b-bad' : ''}">${ex.length} exempted</span></div>
    <p class="small muted">Use after training when an officer must be withdrawn (medical, administrative, etc.). An exempted officer is <b>not considered in the 2nd or final randomisation</b> — no party, PCCP / Micro Observer order or booth. The reason is recorded and printed in the Exemption Register. 1st letters and training attendance still list the officer (they were issued earlier).</p>
    ${lockedParts.length ? `<div class="alert warn">Locked in the 2nd randomisation: <b>${lockedParts.map(k => PART_NAME[k]).join(', ')}</b>. Officers already selected there cannot be exempted unless that part is unlocked (use a reserve instead).</div>` : ''}
    <fieldset><legend>Exemption details (required)</legend>
      <div class="grid g4">
        <label class="f">Category<select id="exCat">${EXEMPT_CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
        <label class="f span2">Reason *<input type="text" id="exReason" placeholder="e.g. Medical certificate from Civil Surgeon — surgery on 20-10-2026"></label>
        <label class="f">Date<input type="date" id="exDate" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label class="f span2">Order / letter reference (optional)<input type="text" id="exOrder" placeholder="e.g. Memo No. 512/Election dt. 14-10-2026"></label>
        <label class="f span2">Exempt by PIN (one or more, separated by comma / space)<div class="btn-row"><input type="text" id="exPins" placeholder="0300012, 0300045" style="flex:1"><button class="btn bad" data-act="exemptByPin" ${ready ? '' : 'disabled'}>Exempt PIN(s)</button></div></label>
      </div>
    </fieldset>
  </div>
  <div class="card">
    <div class="card-head"><h3>Select officers</h3><span class="spacer"></span><button class="btn bad" data-act="exemptTicked" ${ready ? '' : 'disabled'}>Exempt ticked officers (<span id="exSelCount">${UI.exSel.size}</span>)</button></div>
    <div class="btn-row" style="margin-bottom:8px"><input type="search" placeholder="Search PIN, name, office, duty…" value="${esc(UI.exQuery)}" data-inp="exSearch" style="max-width:360px">
      <span class="spacer"></span><span class="small muted">${rows.length} available · page ${UI.exPage} / ${pages}</span>
      <button class="btn sm" data-act="exPageNav" data-arg="-1" ${UI.exPage <= 1 ? 'disabled' : ''}>‹ Prev</button><button class="btn sm" data-act="exPageNav" data-arg="1" ${UI.exPage >= pages ? 'disabled' : ''}>Next ›</button></div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th><input type="checkbox" data-chg="exTickPage" title="Tick all on this page"></th><th>PIN</th><th>Name</th><th>Designation</th><th>Office</th><th>Duty</th><th>Mobile</th><th>In 2nd randomisation</th></tr></thead><tbody>
    ${slice.length ? slice.map(o => { const used = partsUsingPin(o.pin); return `<tr><td><input type="checkbox" data-chg="exTick" data-arg="${esc(o.pin)}" ${UI.exSel.has(String(o.pin)) ? 'checked' : ''}></td><td class="pin">${esc(o.pin)}</td><td><b>${esc(o.name)}</b></td><td>${esc(o.designation)}</td><td>${esc(o.office)}</td><td>${dutyBadge(o.duty)}</td><td>${esc(o.mobile)}</td><td>${used.map(k => `<span class="badge ${S.parts.second[k] ? 'b-ok' : 'b-warn'}">${PART_NAME[k]}${S.parts.second[k] ? ' 🔒' : ''}</span>`).join(' ') || '—'}</td></tr>`; }).join('')
      : '<tr><td colspan="8" class="center muted" style="padding:20px">No matching officers.</td></tr>'}
    </tbody></table></div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Exempted officers (${ex.length})</h3><span class="spacer"></span>
      <button class="btn sm pri" data-act="report" data-arg="exempted" ${ex.length ? '' : 'disabled'}>Exemption Register (print / PDF / Word)</button>
      <button class="btn sm" data-act="exportExempted" ${ex.length ? '' : 'disabled'}>Export Excel</button></div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>PIN</th><th>Name</th><th>Duty</th><th>Category</th><th>Reason</th><th>Order ref</th><th>Date</th><th></th></tr></thead><tbody>
    ${ex.length ? ex.map(([pin, e], i) => { const o = officerByPin(pin) || {}; return `<tr><td>${i + 1}</td><td class="pin">${esc(pin)}</td><td><b>${esc(o.name || '(PIN not in officer list)')}</b></td><td>${o.duty ? dutyBadge(o.duty) : ''}</td><td>${esc(e.category)}</td><td>${esc(e.reason)}</td><td>${esc(e.orderRef)}</td><td class="nowrap">${esc(fmtDate(e.date))}</td><td><button class="btn sm" data-act="restoreExempt" data-arg="${esc(pin)}">Restore</button></td></tr>`; }).join('')
      : '<tr><td colspan="9" class="center muted" style="padding:20px">No officer exempted.</td></tr>'}
    </tbody></table></div>
  </div>`;
};

REPORTS.exempted = ['Exemption register (exempted officers & reasons)', () => {
  const ex = Object.entries(S.exempt);
  const byCat = {}; ex.forEach(([, e]) => { byCat[e.category] = (byCat[e.category] || 0) + 1; });
  return regDoc('EXEMPTION REGISTER — officers withdrawn from 2nd / final randomisation', `
    <p class="small">Total exempted: <b>${ex.length}</b>${Object.keys(byCat).length ? ' — ' + Object.entries(byCat).map(([c, n]) => `${esc(c)}: ${n}`).join(', ') : ''}</p>
    <table class="lt"><tr><th>Sl</th><th>PIN</th><th>Name</th><th>Designation</th><th>Office</th><th>Duty</th><th>Mobile</th><th>Category</th><th>Reason</th><th>Order ref</th><th>Date</th></tr>
    ${ex.map(([pin, e], i) => { const o = officerByPin(pin) || {}; return `<tr><td>${i + 1}</td><td><b>${esc(pin)}</b></td><td>${esc(o.name)}</td><td>${esc(o.designation)}</td><td>${esc(o.office)}</td><td>${esc(o.duty)}</td><td>${esc(o.mobile)}</td><td>${esc(e.category)}</td><td>${esc(e.reason)}</td><td>${esc(e.orderRef)}</td><td>${esc(fmtDate(e.date))}</td></tr>`; }).join('')}
    </table>
    <div class="sigs" style="margin-top:30px"><div></div><div></div><div>${sigHtml()}<b>${esc(S.setup.authSubTitle)}</b><br>${esc(S.setup.district)}</div></div>`);
}];
