/* =====================================================================
 * COUNTING PERSONNEL — a separate exercise with its own data and locks.
 *  Duties   : Counting Supervisor (CS), Counting Assistant (CA).
 *  1st      : appointment letter (duty only).
 *  2nd      : counting parties of 1 CS + 2 CA, all three from different
 *             offices (blocks are NOT considered). Parties = tables + reserve %.
 *             Table: "will be informed later".
 *  Final    : tables 1..N allotted at random; the other parties are RESERVE.
 *  Outputs  : letters (office copy / 3 copies ✔), identity cards,
 *             attendance sheets (1st, 2nd, final main / reserve), Excel.
 * ===================================================================== */
const CNT_DUTIES = [
  { key: 'CS', label: 'COUNTING SUPERVISOR', short: 'CS' },
  { key: 'CA', label: 'COUNTING ASSISTANT', short: 'CA' },
];
const CNT_DUTY = Object.fromEntries(CNT_DUTIES.map(d => [d.key, d]));
const CNT_ROLES = ['CS', 'CA1', 'CA2'];
const CNT_ROLE_DUTY = { CS: 'CS', CA1: 'CA', CA2: 'CA' };
const CNT_ROLE_NAME = { CS: 'Counting Supervisor', CA1: 'Counting Assistant-1', CA2: 'Counting Assistant-2' };
const CNT_STAGE = { second: 'Counting – 2nd', final: 'Counting – Final' };

function normalizeCntDuty(v) {
  const d = str(v).toLowerCase(), c = d.replace(/[^a-z0-9]/g, '');
  if (!c) return '';
  if (d.includes('supervis') || c === 'cs') return CNT_DUTY.CS.label;
  if (d.includes('assist') || c === 'ca') return CNT_DUTY.CA.label;
  return '';
}
const C = () => S.cnt;
function cntOfDuty(key) { return C().officers.filter(o => o.duty === CNT_DUTY[key].label); }
/** Parties to form = tables + reserve %. */
function cntTarget() { const t = intOr0(C().setup.tables); return t ? Math.ceil(t * (1 + (Number(C().setup.reservePct) || 0) / 100)) : 0; }
function cntTableOf(partyNo) { return C().tables[partyNo] || 0; }
const byTable = (a, b) => cntTableOf(a.partyNo) - cntTableOf(b.partyNo);
function cntPartiesSorted() { return C().parties.slice().sort(byPartyNo); }
function cntMainParties() { return C().parties.filter(p => cntTableOf(p.partyNo)).sort(byTable); }
function cntReserveParties() { return C().parties.filter(p => !cntTableOf(p.partyNo)).sort(byPartyNo); }

/* ---------------- validation ---------------- */
function validateCntSetup() {
  const st = C().setup, errors = [], warnings = [];
  if (!intOr0(st.tables)) errors.push('Number of counting tables is required (a whole number, 1 or more).');
  const r = Number(st.reservePct);
  if (!(r >= 0 && r <= 100)) errors.push('Reserve % must be between 0 and 100.');
  if (!str(st.hall)) warnings.push('Counting hall is blank — it will be blank in the letters.');
  if (!st.countDate) warnings.push('Date of counting is blank.');
  if (!st.countTime) warnings.push('Counting start time is blank.');
  if (!str(st.reportVenue) || !st.reportDate || !st.reportTime) warnings.push('Reporting place / date / time is incomplete.');
  return { errors, warnings };
}
function validateCntOfficers() {
  const errors = [], warnings = [], rowIssues = new Map();
  const note = (i, level, msg) => { const r = rowIssues.get(i) || { level: 'warn', msgs: [] }; if (level === 'err') r.level = 'err'; r.msgs.push(msg); rowIssues.set(i, r); };
  const seen = new Map();
  C().officers.forEach((o, i) => {
    const tag = `Row ${i + 1} (${o.pin || 'no PIN'} ${o.name})`;
    if (!str(o.name)) { errors.push(`${tag}: name missing`); note(i, 'err', 'name missing'); }
    if (!normalizeCntDuty(o.duty)) { errors.push(`${tag}: duty "${o.duty}" — must be COUNTING SUPERVISOR or COUNTING ASSISTANT`); note(i, 'err', 'unknown duty'); }
    if (!officeKey(o)) { errors.push(`${tag}: office code / office name missing (needed for the different-office rule)`); note(i, 'err', 'office missing'); }
    const p = str(o.pin);
    if (p) { if (seen.has(p)) { errors.push(`${tag}: duplicate PIN ${p} (also row ${seen.get(p) + 1})`); note(i, 'err', 'duplicate PIN'); } else seen.set(p, i); }
    if (o.mobile && !/^\d{10}$/.test(str(o.mobile))) { warnings.push(`${tag}: mobile "${o.mobile}" is not 10 digits`); note(i, 'warn', 'mobile not 10 digits'); }
    if (!str(o.mobile)) { warnings.push(`${tag}: mobile missing`); note(i, 'warn', 'mobile missing'); }
  });
  const n = cntTarget();
  if (n) {
    const cs = cntOfDuty('CS').length, ca = cntOfDuty('CA').length;
    if (cs < n) warnings.push(`Counting Supervisors: ${cs} available, ${n} needed (${intOr0(C().setup.tables)} tables + reserve).`);
    if (ca < 2 * n) warnings.push(`Counting Assistants: ${ca} available, ${2 * n} needed (2 per party).`);
  }
  return { errors, warnings, rowIssues };
}

/* ---------------- 2nd randomisation: party formation ---------------- */
/** Problems that make forming the counting parties impossible (empty = can run). */
function cntFeasibility() {
  const n = cntTarget(), probs = [];
  if (!n) return ['Enter the number of counting tables in Counting Setup.'];
  const cs = cntOfDuty('CS'), ca = cntOfDuty('CA');
  if (cs.length < n) probs.push(`Counting Supervisors: ${cs.length} available, ${n} needed.`);
  if (ca.length < 2 * n) probs.push(`Counting Assistants: ${ca.length} available, ${2 * n} needed.`);
  // one office can give at most one member to each party
  const cap = list => { const m = new Map(); list.forEach(o => m.set(officeKey(o), (m.get(officeKey(o)) || 0) + 1)); return [...m.values()].reduce((a, v) => a + Math.min(v, n), 0); };
  if (!probs.length && cap(ca) < 2 * n) probs.push(`Counting Assistants are concentrated in too few offices: no office may give more than ${n} assistants (one per party), which leaves fewer than ${2 * n}.`);
  if (!probs.length && cap(cs.concat(ca)) < 3 * n) probs.push(`Officers are concentrated in too few offices to form ${n} parties of three from different offices.`);
  return probs;
}
/** Maximum bipartite matching (Kuhn) with randomised candidate order. Returns slot → candidate index, or null if incomplete. */
function cntMatch(nSlots, cands, compat) {
  const owner = new Array(cands.length).fill(-1), got = new Array(nSlots).fill(-1);
  const tryS = (s, seen) => {
    for (let c = 0; c < cands.length; c++) {
      if (seen[c] || !compat(s, cands[c])) continue;
      seen[c] = 1;
      if (owner[c] < 0 || tryS(owner[c], seen)) { owner[c] = s; got[s] = c; return true; }
    }
    return false;
  };
  for (const s of shuffle([...Array(nSlots).keys()])) if (!tryS(s, new Uint8Array(cands.length))) return null;
  return got;
}
function formCountingParties() {
  const probs = cntFeasibility();
  if (probs.length) throw new Error(probs.join('\n'));
  const n = cntTarget(), csAll = cntOfDuty('CS'), caAll = cntOfDuty('CA');
  for (let attempt = 1; attempt <= 300; attempt++) {
    const cs = shuffle(csAll).slice(0, n), ca = shuffle(caAll);
    const a = cntMatch(n, ca, (s, o) => officeKey(o) !== officeKey(cs[s]));
    if (!a) continue;
    const usedA = new Set(a), rest = ca.filter((_, i) => !usedA.has(i));
    const b = cntMatch(n, rest, (s, o) => officeKey(o) !== officeKey(cs[s]) && officeKey(o) !== officeKey(ca[a[s]]));
    if (!b) continue;
    const w = String(n).length < 2 ? 2 : String(n).length;
    const parties = shuffle([...Array(n).keys()]).map((s, i) => ({ partyNo: 'CP-' + pad(i + 1, w), CS: cs[s].pin, CA1: ca[a[s]].pin, CA2: rest[b[s]].pin }));
    return { parties, attempts: attempt };
  }
  throw new Error('Could not form counting parties with three different offices in 300 attempts. Add officers from more offices.');
}
/** Final randomisation: tables 1..T to randomly chosen parties; the rest are reserve. */
function allotCountingTables() {
  const t = intOr0(C().setup.tables), out = {};
  shuffle(C().parties).slice(0, t).forEach((p, i) => { out[p.partyNo] = i + 1; });
  return out;
}
/** Independent verification of the counting randomisation. */
function cntAudit() {
  _cntIndex = null;
  const checks = [], add = (stage, rule, bad, total) => checks.push({ stage, rule, ok: bad.length === 0, bad, total });
  const P = C().parties, n = cntTarget(), T = intOr0(C().setup.tables);
  if (P.length) {
    add(CNT_STAGE.second, 'Party count = tables + reserve %', P.length === n ? [] : [`${P.length} parties formed, expected ${n}`], 1);
    const b1 = [], b2 = [], b3 = [], seen = new Map();
    P.forEach(p => {
      CNT_ROLES.forEach(r => {
        const o = cntOfficerByPin(p[r]);
        if (!o) b1.push(`${p.partyNo}: ${r} PIN ${p[r]} not in counting officer list`);
        else if (o.duty !== CNT_DUTY[CNT_ROLE_DUTY[r]].label) b1.push(`${p.partyNo}: ${o.pin} is ${o.duty}, placed as ${CNT_ROLE_NAME[r]}`);
        if (seen.has(String(p[r]))) b2.push(`PIN ${p[r]} in ${seen.get(String(p[r]))} and ${p.partyNo}`); else seen.set(String(p[r]), p.partyNo);
      });
      const ks = CNT_ROLES.map(r => cntOfficerByPin(p[r])).filter(Boolean).map(officeKey);
      if (new Set(ks).size !== ks.length) b3.push(`${p.partyNo}: two or more members from the same office`);
    });
    add(CNT_STAGE.second, 'Each party has 1 Counting Supervisor + 2 Counting Assistants of the correct duty', b1, P.length);
    add(CNT_STAGE.second, 'No officer in two parties', b2, P.length);
    add(CNT_STAGE.second, 'All three members from different offices', b3, P.length);
  }
  const tags = Object.entries(C().tables);
  if (tags.length) {
    const bad = [], used = new Map(), names = new Set(P.map(p => p.partyNo));
    tags.forEach(([pno, t]) => {
      if (!names.has(pno)) bad.push(`Table ${t} → unknown party ${pno}`);
      if (!(Number.isInteger(t) && t >= 1 && t <= T)) bad.push(`${pno}: table "${t}" outside 1–${T}`);
      if (used.has(t)) bad.push(`Table ${t} given to ${used.get(t)} and ${pno}`); else used.set(t, pno);
    });
    for (let i = 1; i <= T; i++) if (!used.has(i)) bad.push(`Table ${i} not allotted`);
    add(CNT_STAGE.final, `Every table 1–${T} allotted to exactly one party; the rest are reserve`, bad, T);
  }
  return checks;
}
const cntBad = stage => cntAudit().filter(c => c.stage === CNT_STAGE[stage] && !c.ok);

/* ---------------- views ---------------- */
function cntLockBar(mod, extraLeft = '') {
  const locked = C().locks[mod];
  return `<div class="btn-row">${extraLeft}<span class="spacer"></span>${locked
    ? `<span class="badge b-ok">🔒 Locked</span><button class="btn sm" data-act="cntUnlock" data-arg="${mod}">Unlock</button>`
    : `<span class="badge b-warn">Editable</span><button class="btn ok" data-act="cntLock" data-arg="${mod}">${mod === 'second' || mod === 'final' ? 'Verify &amp; Lock' : 'Save &amp; Lock'}</button>`}</div>`;
}
function cntDutyBadge(label) { const d = CNT_DUTIES.find(x => x.label === label); return d ? `<span class="badge d-${d.key === 'CS' ? 'PRO' : 'P1'}">${d.short}</span>` : '<span class="badge b-bad">?</span>'; }

VIEWS.cntSetup = () => {
  const st = C().setup, dis = C().locks.setup, o = { disabled: dis };
  const t = intOr0(st.tables), n = cntTarget();
  return `
  <div class="card"><div class="card-head"><h2>Counting Setup</h2></div>
    <p class="small muted">Counting personnel are a separate exercise with their own officer list. Election title, appointing authority, signing titles, letter date and signature are taken from <b>Election Setup</b>.</p>
    ${cntLockBar('setup')}</div>
  <div class="card"><h3>Tables and reserve</h3>
    <div class="grid g4">
      ${inp('Number of counting tables *', 'cnt.setup.tables', st.tables, { ...o, type: 'number', min: 0, dtype: 'int', rerender: 1 })}
      ${inp('Reserve %', 'cnt.setup.reservePct', st.reservePct, { ...o, type: 'number', min: 0, max: 100, dtype: 'num', rerender: 1 })}
      <div class="span2">${kpi('Counting parties to form', n ? `${n} (${t} tables + ${n - t} reserve)` : '—')}</div>
    </div>
    <p class="small muted">Each party = 1 Counting Supervisor + 2 Counting Assistants → needs ${n || 0} supervisors and ${2 * n || 0} assistants.</p></div>
  <div class="card"><h3>Counting and reporting (printed in the letters)</h3>
    <div class="grid g4">
      ${inp('Counting hall', 'cnt.setup.hall', st.hall, { ...o, cls: 'span2', placeholder: 'e.g. Counting Hall, Collectorate' })}
      ${inp('Date of counting', 'cnt.setup.countDate', st.countDate, { ...o, type: 'date' })}
      ${inp('Counting start time', 'cnt.setup.countTime', st.countTime, { ...o, type: 'time' })}
      ${inp('Reporting place', 'cnt.setup.reportVenue', st.reportVenue, { ...o, cls: 'span2' })}
      ${inp('Reporting date', 'cnt.setup.reportDate', st.reportDate, { ...o, type: 'date' })}
      ${inp('Reporting time', 'cnt.setup.reportTime', st.reportTime, { ...o, type: 'time' })}
    </div></div>
  <div class="card"><h3>Training (optional — printed in the 1st letter only when filled)</h3>
    <div class="grid g4">
      ${inp('Training venue', 'cnt.setup.trainVenue', st.trainVenue, { ...o, cls: 'span2' })}
      ${inp('Training date', 'cnt.setup.trainDate', st.trainDate, { ...o, type: 'date' })}
      ${inp('Training time', 'cnt.setup.trainTime', st.trainTime, { ...o, type: 'time' })}
    </div></div>
  <div class="card">${issuesBox(validateCntSetup(), 'Counting Setup')}</div>`;
};

VIEWS.cntOfficers = () => {
  const dis = C().locks.officers, v = validateCntOfficers(), n = cntTarget();
  const q = (UI.cntQuery || '').toLowerCase();
  const rows = C().officers.map((o, i) => ({ o, i })).filter(({ o }) => !q || [o.pin, o.name, o.designation, o.officeCode, o.office, o.duty, o.mobile].some(x => str(x).toLowerCase().includes(q)));
  const ps = 50, pages = Math.max(1, Math.ceil(rows.length / ps));
  UI.cntPage = Math.min(Math.max(1, UI.cntPage || 1), pages);
  const slice = rows.slice((UI.cntPage - 1) * ps, UI.cntPage * ps);
  const cs = cntOfDuty('CS').length, ca = cntOfDuty('CA').length;
  return `
  <div class="card"><div class="card-head"><h2>Counting Officers</h2></div>
    <p class="small muted">Columns: PIN, Name, Designation, <b>Office Code</b>, <b>Office Name</b>, Office Address, Mobile, <b>Duty</b> (COUNTING SUPERVISOR / COUNTING ASSISTANT, or CS / CA), Home Block (Code), Posting Block (Code), Blood Group. Blocks are optional here — they are not used for counting parties. The three members of a party are always from different offices (Office Code decides when given). Blank PIN is auto-generated.</p>
    <div class="kpis">${kpi(n ? 'Supervisors available / needed' : 'Supervisors', n ? `${cs} / ${n}` : cs, n ? (cs >= n ? 'ok' : 'bad') : '')}${kpi(n ? 'Assistants available / needed' : 'Assistants', n ? `${ca} / ${2 * n}` : ca, n ? (ca >= 2 * n ? 'ok' : 'bad') : '')}${kpi('Total', C().officers.length)}</div>
    ${cntLockBar('officers', `
      <button class="btn sm" data-act="cntTemplate">Download sample / template</button>
      <button class="btn sm pri" data-act="cntImport" data-arg="replace" ${dis ? 'disabled' : ''}>Import Excel (replace)</button>
      <button class="btn sm" data-act="cntImport" data-arg="append" ${dis ? 'disabled' : ''}>Import Excel (add to list)</button>
      <button class="btn sm" data-act="cntEdit" data-arg="-1" ${dis ? 'disabled' : ''}>+ Add manually</button>
      <button class="btn sm" data-act="cntExport" ${C().officers.length ? '' : 'disabled'}>Export Excel</button>
      <button class="btn sm ghost-bad" data-act="cntClear" ${dis || !C().officers.length ? 'disabled' : ''}>Clear all</button>`)}</div>
  <div class="card">${issuesBox(v, 'Counting officers')}
    <div class="btn-row" style="margin-bottom:8px"><input type="search" placeholder="Search PIN, name, office, duty…" value="${esc(UI.cntQuery || '')}" data-inp="cntSearch" style="max-width:360px">
      <span class="spacer"></span><span class="small muted">${rows.length} shown · page ${UI.cntPage} / ${pages}</span>
      <button class="btn sm" data-act="cntPage" data-arg="-1" ${UI.cntPage <= 1 ? 'disabled' : ''}>‹ Prev</button>
      <button class="btn sm" data-act="cntPage" data-arg="1" ${UI.cntPage >= pages ? 'disabled' : ''}>Next ›</button></div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>PIN</th><th>Name</th><th>Designation</th><th>Office</th><th>Mobile</th><th>Duty</th><th>Issues</th><th></th></tr></thead><tbody>
    ${slice.length ? slice.map(({ o, i }) => { const iss = v.rowIssues.get(i); return `<tr class="${iss ? (iss.level === 'err' ? 'err' : 'warnrow') : ''}">
      <td>${i + 1}</td><td class="pin">${esc(o.pin)}</td><td><b>${esc(o.name)}</b></td><td>${esc(o.designation)}</td><td>${o.officeCode ? `<span class="badge b-info">${esc(o.officeCode)}</span> ` : ''}${esc(o.office)}<div class="small muted">${esc(o.officeAddress)}</div></td><td>${esc(o.mobile)}</td>
      <td>${cntDutyBadge(o.duty)}</td><td class="small">${iss ? esc(iss.msgs.join('; ')) : ''}</td>
      <td class="nowrap"><button class="btn sm" data-act="cntEdit" data-arg="${i}" ${dis ? 'disabled' : ''}>Edit</button> <button class="btn sm ghost-bad" data-act="cntDel" data-arg="${i}" ${dis ? 'disabled' : ''}>✕</button></td></tr>`; }).join('')
      : '<tr><td colspan="9" class="center muted" style="padding:24px">No counting officers yet. Import an Excel file or add manually.</td></tr>'}
    </tbody></table></div></div>`;
};
ACT.cntSearch = (a, el) => { UI.cntQuery = el.value; UI.cntPage = 1; const pos = el.selectionStart; render(); const n = $('[data-inp="cntSearch"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
ACT.cntPage = d => { UI.cntPage = (UI.cntPage || 1) + Number(d); render(); };
ACT.cntDel = i => { const o = C().officers[i]; if (!confirmBox(`Delete ${o.name} (${o.pin})?`)) return; C().officers.splice(Number(i), 1); persist(); render(); };
ACT.cntClear = () => { if (!confirmBox('Delete ALL counting officers?')) return; C().officers = []; addLog('Counting: all officers cleared'); persist(); render(); };
ACT.cntEdit = idx => {
  const i = Number(idx), o = i >= 0 ? C().officers[i] : blankCntOfficer();
  const f = (k, l) => `<label class="f">${esc(l)}<input type="text" name="${k}" value="${esc(o[k])}"></label>`;
  const m = openModal({
    title: i >= 0 ? `Edit counting officer ${o.pin}` : 'Add counting officer', plain: true,
    body: `<form id="cntForm" class="grid g3">
      ${f('pin', 'PIN (blank = auto)')}${f('name', 'Name *')}${f('designation', 'Designation')}
      ${f('officeCode', 'Office code (recommended)')}${f('office', 'Office name *')}${f('officeAddress', 'Office address')}${f('mobile', 'Mobile')}
      <label class="f">Duty *<select name="duty"><option value="">— select —</option>${CNT_DUTIES.map(d => `<option ${o.duty === d.label ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></label>
      ${f('bloodGroup', 'Blood group (optional)')}
      ${f('homeBlockCode', 'Home block code (optional)')}${f('homeBlock', 'Home block (optional)')}
      ${f('postingBlockCode', 'Posting block code (optional)')}${f('postingBlock', 'Posting block (optional)')}</form>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn ok" data-act="cntSave" data-arg="${i}">Save</button>`,
  });
  m.querySelector('input[name=name]').focus();
};
ACT.cntSave = idx => {
  const i = Number(idx), form = $('#cntForm'), o = blankCntOfficer();
  Object.keys(o).forEach(k => { const el = form.elements[k]; if (el) o[k] = str(el.value); });
  if (!o.name) return toast('Name is required.', 'bad');
  if (!o.duty) return toast('Duty is required.', 'bad');
  if (!o.office && !o.officeCode) return toast('Office name or code is required.', 'bad');
  if (!o.pin) o.pin = cntNextPin();
  if (C().officers.some((x, j) => j !== i && String(x.pin) === o.pin)) return toast(`PIN ${o.pin} already exists.`, 'bad');
  if (i >= 0) C().officers[i] = o; else C().officers.push(o);
  persist(); closeTopModal(); render();
};
function cntNextPin() {
  const code = str(S.setup.distCode) || '00', used = new Set(C().officers.map(o => String(o.pin)));
  let n = C().officers.length + 1, pin;
  do { pin = code + 'C' + pad(n++, 4); } while (used.has(pin));
  return pin;
}

VIEWS.cntLetter1 = () => {
  const ready = !prereqs('cntLetter1').length, L = C().locks;
  return `
  <div class="card"><div class="card-head"><h2>Counting — 1st Appointment Letter</h2></div>
    <p class="small muted">One letter per counting officer: duty (Counting Supervisor / Counting Assistant)${C().setup.trainDate || C().setup.trainVenue ? ' and training' : ''}. Party and table are not disclosed. Lock after issue; the attendance sheet of all appointed counting officers opens after locking.</p>
    <div class="kpis">${CNT_DUTIES.map(d => kpi(d.label, cntOfDuty(d.key).length)).join('')}</div>
    ${cntLockBar('letter1', `
      <button class="btn pri" data-act="cntLetters" data-arg="first" ${ready ? '' : 'disabled'}>Open all 1st letters (${C().officers.length})</button>
      ${CNT_DUTIES.map(d => `<button class="btn sm" data-act="cntLetters" data-arg="first:${d.key}" ${ready ? '' : 'disabled'}>${d.short} only</button>`).join('')}
      <button class="btn sm" data-act="attendance" data-arg="cnt1" ${L.letter1 ? '' : 'disabled'}>Attendance (PDF / Word)</button>
      <button class="btn sm" data-act="attendanceExcel" data-arg="cnt1" ${L.letter1 ? '' : 'disabled'}>Attendance Excel</button>`)}</div>`;
};

VIEWS.cntSecond = () => {
  const ready = !prereqs('cntSecond').length, L = C().locks, P = C().parties, n = cntTarget();
  const probs = ready && !L.second ? cntFeasibility() : [];
  const bad = cntBad('second');
  return `
  <div class="card"><div class="card-head"><h2>Counting — 2nd Randomisation (party formation)</h2></div>
    <p class="small muted">Forms <b>${n || '—'}</b> counting parties (${intOr0(C().setup.tables)} tables + ${C().setup.reservePct}% reserve). Each party = 1 Counting Supervisor + 2 Counting Assistants, <b>all three from different offices</b> (they may be from the same block). Home / posting block is not considered. Table numbers are <b>not</b> disclosed — the 2nd letter says “Will be informed later”.</p>
    ${SECRECY_NOTE}
    ${cntLockBar('second', `
      <button class="btn warn" data-act="cntRunSecond" ${ready && !L.second ? '' : 'disabled'}>${P.length ? 'Re-run' : 'Run'} counting party randomisation</button>
      <button class="btn" data-act="cntLetters" data-arg="second" ${L.second ? '' : 'disabled'}>2nd letters (office copy)</button>
      <button class="btn" data-act="cntLetters" data-arg="second3" ${L.second ? '' : 'disabled'} title="3 copies per party with ✔ before CS / CA-1 / CA-2">2nd letters — 3 copies ✔</button>
      <button class="btn" data-act="cntExportParties" ${P.length ? '' : 'disabled'}>Export Excel</button>
      ${C().ran.second ? `<span class="small muted">Last run: ${esc(C().ran.second)}</span>` : ''}`)}
    ${P.length && !L.second ? `<div class="alert ${bad.length ? 'bad' : 'info'}" style="margin-top:8px">${bad.length ? `<b>${bad.length} rule check(s) failed</b> — re-run before locking.` : 'Not locked yet — re-run as often as needed, then <b>Verify &amp; Lock</b>.'}</div>` : ''}
    ${probs.length ? `<div class="alert bad" style="margin-top:8px"><b>Cannot run yet:</b><ul>${probs.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}</div>
  <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>Party no</th><th>Counting Supervisor PIN</th><th>Counting Assistant-1 PIN</th><th>Counting Assistant-2 PIN</th><th>Table</th></tr></thead><tbody>
    ${P.length ? cntPartiesSorted().map(p => `<tr><td><b>${esc(p.partyNo)}</b></td>${CNT_ROLES.map(r => memberCell(p[r])).join('')}<td class="small muted">Will be informed later</td></tr>`).join('') : '<tr><td colspan="5" class="center muted" style="padding:20px">Not run yet.</td></tr>'}
    </tbody></table></div></div>
  <div class="card"><div class="card-head"><h3>Rule verification</h3></div>${auditHtml(cntAudit(), [CNT_STAGE.second])}</div>`;
};
VIEWS.cntFinal = () => {
  const ready = !prereqs('cntFinal').length, L = C().locks, T = intOr0(C().setup.tables), done = Object.keys(C().tables).length;
  const bad = cntBad('final');
  return `
  <div class="card"><div class="card-head"><h2>Counting — Final Randomisation (table allotment)</h2></div>
    <p class="small muted">Allots tables 1–${T || '—'} at random to ${T || '—'} of the ${C().parties.length} counting parties. The other ${Math.max(0, C().parties.length - T)} parties are <b>Reserve</b> — “RESERVE” is printed in place of the table number.</p>
    ${SECRECY_NOTE}
    ${cntLockBar('final', `
      <button class="btn warn" data-act="cntRunFinal" ${ready && !L.final ? '' : 'disabled'}>${done ? 'Re-run' : 'Run'} table randomisation</button>
      <button class="btn" data-act="cntLetters" data-arg="final" ${L.final ? '' : 'disabled'}>Final letters (office copy)</button>
      <button class="btn" data-act="cntLetters" data-arg="final3" ${L.final ? '' : 'disabled'}>Final letters — 3 copies ✔</button>
      <button class="btn" data-act="cntExportParties" ${done ? '' : 'disabled'}>Export Excel</button>
      ${C().ran.final ? `<span class="small muted">Last run: ${esc(C().ran.final)}</span>` : ''}`)}
    ${done && !L.final ? `<div class="alert ${bad.length ? 'bad' : 'info'}" style="margin-top:8px">${bad.length ? `<b>${bad.length} rule check(s) failed</b> — re-run before locking.` : 'Not locked yet — re-run as often as needed, then <b>Verify &amp; Lock</b>.'}</div>` : ''}</div>
  <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>Table no</th><th>Party no</th><th>CS PIN</th><th>CA-1 PIN</th><th>CA-2 PIN</th></tr></thead><tbody>
    ${done ? cntMainParties().concat(cntReserveParties()).map(p => `<tr><td><b>${cntTableOf(p.partyNo) || '<span class="badge b-warn">RESERVE</span>'}</b></td><td>${esc(p.partyNo)}</td>${CNT_ROLES.map(r => memberCell(p[r])).join('')}</tr>`).join('') : '<tr><td colspan="5" class="center muted" style="padding:20px">Not run yet.</td></tr>'}
    </tbody></table></div></div>
  <div class="card"><div class="card-head"><h3>Rule verification</h3></div>${auditHtml(cntAudit(), [CNT_STAGE.final])}</div>`;
};
VIEWS.cntOutputs = () => {
  const L = C().locks;
  const b = (act, arg, label, on, cls = '') => `<button class="btn sm ${cls}" data-act="${act}" data-arg="${arg}" ${on ? '' : 'disabled'}>${label}</button>`;
  const row = (title, when, btns) => `<tr><td><b>${title}</b><div class="small muted">${when}</div></td><td class="btn-row">${btns}</td></tr>`;
  return `<div class="card"><div class="card-head"><h2>Counting — Letters, Identity Cards &amp; Attendance</h2></div>
    <p class="small muted">Each item opens as soon as its stage is locked. Letters and attendance sheets: Print / PDF / Word; attendance also in Excel.</p>
    <div class="tbl-wrap" style="max-height:none"><table class="t"><tbody>
    ${row('1st appointment letters', 'after Counting Officers', b('cntLetters', 'first', 'All', !prereqs('cntLetter1').length, 'pri') + CNT_DUTIES.map(d => b('cntLetters', 'first:' + d.key, d.short + ' only', !prereqs('cntLetter1').length)).join(''))}
    ${row('Attendance — all appointed counting officers (1st)', 'after the 1st letter is locked', b('attendance', 'cnt1', 'PDF / Word', L.letter1) + b('attendanceExcel', 'cnt1', 'Excel', L.letter1))}
    ${row('2nd appointment letters', 'table: “Will be informed later”', b('cntLetters', 'second', 'Office copy', L.second, 'pri') + b('cntLetters', 'second3', '3 copies ✔', L.second))}
    ${row('Identity cards', 'after the 2nd randomisation is locked', b('cntIcards', 'party', 'Party-wise', L.second, 'pri') + b('cntIcards', 'CS', 'Counting Supervisors', L.second) + b('cntIcards', 'CA', 'Counting Assistants', L.second) + b('cntIcards', 'ALL', 'Duty-wise (all)', L.second))}
    ${row('Attendance — counting parties (2nd)', 'party-wise', b('attendance', 'cnt2', 'PDF / Word', L.second) + b('attendanceExcel', 'cnt2', 'Excel', L.second))}
    ${row('Final appointment letters', 'table number, or RESERVE', b('cntLetters', 'final', 'Office copy', L.final, 'pri') + b('cntLetters', 'final3', '3 copies ✔', L.final))}
    ${row('Attendance — table-wise (final)', 'main parties in table order', b('attendance', 'cntMain', 'PDF / Word', L.final) + b('attendanceExcel', 'cntMain', 'Excel', L.final))}
    ${row('Attendance — reserve parties (final)', 'party-wise', b('attendance', 'cntReserve', 'PDF / Word', L.final) + b('attendanceExcel', 'cntReserve', 'Excel', L.final))}
    ${row('Counting parties with tables (Excel)', 'names, offices, mobiles', b('cntExportParties', '', 'Excel', C().parties.length))}
    </tbody></table></div></div>`;
};

/* ---------------- actions: run / lock ---------------- */
ACT.cntRunSecond = () => {
  if (C().locks.second) return toast('Unlock the counting 2nd randomisation to re-run.', 'bad');
  if (prereqs('cntSecond').length) return toast('Prerequisite pending: ' + prereqs('cntSecond').join(', '), 'bad');
  const probs = cntFeasibility(); if (probs.length) return showErrors('Cannot form counting parties', probs);
  if (C().parties.length && !confirmBox('Re-run will discard the current counting parties (and any unlocked table allotment). Continue?')) return;
  shuffleAnimation('Forming counting parties', C().officers, () => {
    const r = formCountingParties();
    C().parties = r.parties; C().tables = {}; C().ran.second = nowStamp(); delete C().ran.final;
    addLog(`Counting 2nd randomisation: ${r.parties.length} parties formed (attempt ${r.attempts})`);
    persist(); render();
    const bad = cntBad('second');
    toast(bad.length ? `Formed, but ${bad.length} rule check(s) failed.` : `${r.parties.length} counting parties formed. All rule checks passed. Re-run or lock.`, bad.length ? 'bad' : 'ok');
  });
};
ACT.cntRunFinal = () => {
  if (C().locks.final) return toast('Unlock the counting final randomisation to re-run.', 'bad');
  if (!C().locks.second) return toast('Lock the counting 2nd randomisation first.', 'bad');
  if (Object.keys(C().tables).length && !confirmBox('Re-run will discard the current table allotment. Continue?')) return;
  shuffleAnimation('Allotting counting tables', C().officers, () => {
    C().tables = allotCountingTables(); C().ran.final = nowStamp();
    addLog(`Counting final randomisation: ${Object.keys(C().tables).length} tables allotted`);
    persist(); render();
    const bad = cntBad('final');
    toast(bad.length ? 'Allotted, but a rule check failed.' : 'Tables allotted. All rule checks passed. Re-run or lock.', bad.length ? 'bad' : 'ok');
  });
};
ACT.cntLock = mod => {
  const id = { setup: 'cntSetup', officers: 'cntOfficers', letter1: 'cntLetter1', second: 'cntSecond', final: 'cntFinal' }[mod];
  if (prereqs(id).length) return toast('Prerequisite pending: ' + prereqs(id).join(', '), 'bad');
  let v = { errors: [], warnings: [] };
  if (mod === 'setup') { C().setup.tables = intOr0(C().setup.tables); v = validateCntSetup(); }
  if (mod === 'officers') v = validateCntOfficers();
  if (mod === 'second') { if (!C().parties.length) v.errors.push('Run the counting party randomisation first.'); cntBad('second').forEach(c => v.errors.push('Rule check failed: ' + c.rule)); }
  if (mod === 'final') {
    if (Object.keys(C().tables).length !== intOr0(C().setup.tables)) v.errors.push('Run the table randomisation first.');
    cntBad('final').forEach(c => v.errors.push('Rule check failed: ' + c.rule));
  }
  if (v.errors.length) return showErrors(`Cannot lock — ${v.errors.length} problem(s)`, v.errors);
  if (v.warnings.length && !confirmBox(`${v.warnings.length} warning(s) found (e.g. ${v.warnings[0]}). Lock anyway?`)) return;
  if (mod === 'officers') C().officers.forEach(o => { if (!str(o.pin)) o.pin = cntNextPin(); o.duty = normalizeCntDuty(o.duty) || o.duty; });
  if (mod === 'setup' && C().parties.length && cntBad('second').length + cntBad('final').length) {
    C().parties = []; C().tables = {}; C().locks.second = C().locks.final = false;
    toast('Tables / reserve % changed — the counting randomisation no longer fits and was cleared. Please re-run it.', 'warn');
  }
  C().locks[mod] = true;
  addLog(`Counting: locked ${mod}`);
  persist(); render();
  toast(`Counting ${mod === 'letter1' ? '1st letter' : mod} locked.`, 'ok');
};
ACT.cntUnlock = mod => {
  const L = C().locks;
  if (mod === 'officers' && C().parties.length) {
    if (!confirmBox('Unlocking counting officers will DELETE the counting parties and table allotment (they depend on this list). Continue?')) return;
    C().parties = []; C().tables = {}; L.second = L.final = false;
  }
  if (mod === 'officers') L.letter1 = false;
  if (mod === 'setup' && C().parties.length && !confirmBox('Counting randomisation exists. Text changes are fine; changing tables or reserve % will clear it when you lock again. Continue?')) return;
  if (mod === 'second') {
    if (L.final) return toast('Unlock the counting final randomisation first.', 'bad');
    if (Object.keys(C().tables).length) { if (!confirmBox('Unlocking will DELETE the table allotment. Continue?')) return; C().tables = {}; delete C().ran.final; }
  }
  if (mod === 'final' && window.prompt('Table allotment may already have been used for final letters.\nType UNLOCK to unlock it (recorded in the audit log).') !== 'UNLOCK') return;
  L[mod] = false;
  addLog(`Counting: unlocked ${mod}`);
  persist(); render();
};

/* ---------------- letters ---------------- */
function cntHead(title) { return `<div class="ttl">${esc(title)}</div><div class="ttl2">${esc(T().electionTitle)}</div><div class="c b" style="font-size:12.5px;margin-bottom:6px">COUNTING OF VOTES</div>`; }
/** "06:00" → "06:00 AM", "14:30" → "02:30 PM" (counting letters print 12-hour times). */
function fmtTime12(t) {
  const m = str(t).match(/^(\d{1,2}):(\d{2})/); if (!m) return str(t);
  const h = Number(m[1]); return `${pad(h % 12 || 12)}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}
const cntAt = (d, t) => [d ? esc(fmtDate(d)) : '', t ? 'at ' + esc(fmtTime12(t)) : ''].filter(Boolean).join(' ');
/** Counting hall / table / date / time / reporting box. */
function cntDetails(tableHtml) {
  const st = C().setup;
  const rows = [['Counting hall', esc(st.hall)], ['Table No.', tableHtml], ['Date of counting', esc(fmtDate(st.countDate))], ['Counting starts at', esc(st.countTime && fmtTime12(st.countTime))],
    ['Reporting place', esc(st.reportVenue)], ['Reporting date &amp; time', cntAt(st.reportDate, st.reportTime)]].filter(([k, v]) => v || k === 'Table No.');
  return `<table class="lt"><colgroup><col style="width:30%"><col></colgroup>${rows.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${k === 'Table No.' ? v : `<b>${v}</b>`}</td></tr>`).join('')}</table>`;
}
function cntCopyLine(forRole) { return forRole ? `<div class="copyfor">Copy ${CNT_ROLES.indexOf(forRole) + 1} of 3 — for ${esc(CNT_ROLE_NAME[forRole])} <span class="tick">✔</span></div>` : ''; }
function cntFirstLetterHtml(o) {
  const st = C().setup, train = st.trainDate || st.trainVenue || st.trainTime;
  return `<div class="doc">${cntHead('Order of First Appointment Letter — Counting Personnel')}
    ${rpaParaCnt('hereby appoint the following officer specified in the column 1 of the table below as duty mentioned in the corresponding entry in column 2 of the table below')}
    <table class="lt"><tr><th style="width:62%">Column 1 — Employee Details</th><th>Column 2 — Duty</th></tr>
    <tr><td>${officerDetails(o, false)}</td><td style="vertical-align:middle"><b>Duty :- ${esc(o.duty)}</b></td></tr></table>
    ${train ? `<div class="b" style="font-size:13px">Training Details :-</div><table class="lt cen"><tr><th>Date</th><th>Venue</th><th>Time</th></tr><tr><td>${esc(fmtDate(st.trainDate)) || '—'}</td><td>${esc(st.trainVenue) || '—'}</td><td>${esc(st.trainTime && fmtTime12(st.trainTime)) || '—'}</td></tr></table>` : ''}
    <div class="note"><b>IMPORTANT:</b><br>${train ? '• Participation in the training is compulsory.<br>' : ''}• Verify your mobile number in this letter. In case of any discrepancy, correct it on the receipt and return it to the Personnel Cell.<br>• Your counting party and table will be notified later through the 2nd and final appointment letters.<br>• Failure will invite action under the relevant provisions of the Representation of the People Act, 1951.</div>
    ${sigBlock()}
    ${receipt('First Appointment Letter (Counting) — Receipt', [`Name :- <b>${esc(o.name)}</b><br>Designation :- ${esc(o.designation)}`, `PIN :- <b>${esc(o.pin)}</b><br>Contact :- ${esc(o.mobile)}`, `Duty :- <b>${esc(o.duty)}</b>`])}
  </div>`;
}
/** Appointment paragraph of every counting letter (format supplied by the district). */
function rpaParaCnt(what) {
  return `<p>In pursuance of sub-section (1) and sub-section (3) of section 26 of the Representation of the People Act, 1951 (43 of 1951) I, <b>${esc(T().roCumDeo)}</b>, ${what} for conducting of the ${esc(T().electionTitle)}, to assist me in counting of Votes.</p>`;
}
function cntPartyLetterHtml(p, stage, forRole) {
  const t = cntTableOf(p.partyNo);
  const tableHtml = stage === 'second' ? '<i>Will be informed later</i>' : t ? `<b style="font-size:15px">${t}</b>` : '<b style="font-size:15px">RESERVE</b>';
  const rows = CNT_ROLES.map(r => { const o = cntOfficerByPin(p[r]) || {}; return `<tr><td class="nowrap"><b>${esc(CNT_ROLE_NAME[r])}</b></td><td>${tick(r, forRole)}${esc(o.name)}</td><td>${esc(o.pin)}</td><td>${esc([o.designation, o.office].map(str).filter(Boolean).join(', '))}</td><td>${esc(o.mobile)}</td></tr>`; }).join('');
  return `<div class="doc">${cntHead(`Order of ${stage === 'second' ? 'Second' : 'Final'} Appointment Letter — Counting Party`)}
    <div class="hdr2"><span>ELECTION URGENT</span><span>COUNTING PARTY NO :- ${esc(p.partyNo)}</span></div>${cntCopyLine(forRole)}
    ${rpaParaCnt('hereby appoint the following officers specified in the table below as duty mentioned in the corresponding entry in column “Duty” of the table below')}
    <table class="lt"><tr><th>Duty</th><th>Name</th><th>PIN</th><th>Designation &amp; Office</th><th>Contact</th></tr>${rows}</table>
    ${cntDetails(tableHtml)}
    <div class="note"><b>IMPORTANT:</b><br>${numbered([C().setup.reportVenue && `The counting party shall report at <b>${esc(C().setup.reportVenue)}</b>${C().setup.reportDate || C().setup.reportTime ? ' on ' + `<b>${cntAt(C().setup.reportDate, C().setup.reportTime)}</b>` : ''}.`, stage === 'second' ? 'The counting table will be informed later through the Final Appointment Letter.' : '', 'Carry this letter and your identity card to the counting hall.'])}</div>
    ${sigBlock()}
  </div>`;
}
ACT.cntLetters = arg => {
  const [what, duty] = String(arg).split(':');
  if (what === 'first') {
    if (prereqs('cntLetter1').length) return toast('Prerequisite pending: ' + prereqs('cntLetter1').join(', '), 'bad');
    const list = C().officers.filter(o => !duty || o.duty === CNT_DUTY[duty].label);
    return openDoc(`Counting — 1st Appointment Letters${duty ? ' — ' + CNT_DUTY[duty].label : ''} (${list.length})`, list.map(cntFirstLetterHtml).join(''));
  }
  const stage = what.startsWith('second') ? 'second' : 'final', three = what.endsWith('3');
  if (!C().locks[stage]) return toast(`Lock the counting ${stage === 'second' ? '2nd' : 'final'} randomisation first.`, 'bad');
  const list = stage === 'final' ? cntMainParties().concat(cntReserveParties()) : cntPartiesSorted();
  const html = list.map(p => three ? CNT_ROLES.map(r => cntPartyLetterHtml(p, stage, r)).join('') : cntPartyLetterHtml(p, stage)).join('');
  openDoc(`Counting — ${stage === 'second' ? '2nd' : 'Final'} Appointment Letters${three ? ' — 3 copies ✔ CS / CA-1 / CA-2' : ' (office copy)'} (${list.length * (three ? 3 : 1)})`, html);
};

/* ---------------- identity cards ---------------- */
function cntIcardList(mode) {
  if (!C().locks.second) return [];
  const sorted = cntPartiesSorted(), hall = str(C().setup.hall) || 'Counting';
  const card = (p, r) => ({ o: cntOfficerByPin(p[r]), duty: CNT_DUTY[CNT_ROLE_DUTY[r]].label, ref: p.partyNo, refLabel: 'Counting Party No', const: '', code: 'Counting', sub: hall });
  let list;
  if (mode === 'party') list = sorted.flatMap(p => CNT_ROLES.map(r => card(p, r)));
  else if (mode === 'CS') list = sorted.map(p => card(p, 'CS'));
  else if (mode === 'CA') list = sorted.flatMap(p => [card(p, 'CA1'), card(p, 'CA2')]);
  else list = sorted.map(p => card(p, 'CS')).concat(sorted.flatMap(p => [card(p, 'CA1'), card(p, 'CA2')]));
  return list.filter(c => c.o);
}
ACT.cntIcards = mode => {
  const list = cntIcardList(mode);
  if (!list.length) return toast('Lock the counting 2nd randomisation first.', 'bad');
  const nm = { party: 'party-wise', CS: 'Counting Supervisors', CA: 'Counting Assistants', ALL: 'duty-wise (all)' }[mode];
  openDoc(`Identity Cards — Counting personnel, ${nm} (${list.length} cards)`, icardsDoc(list));
  fitIcards($('#docBody'));
};

/* ---------------- attendance ---------------- */
function cntAttendanceData(kind) {
  const party = p => CNT_ROLES.map(r => ({ ref: p.partyNo, post: CNT_ROLE_NAME[r].toUpperCase(), o: cntOfficerByPin(p[r]) || {} }));
  const hall = str(C().setup.hall);
  if (kind === 'cnt1') return {
    title: 'ATTENDANCE — COUNTING PERSONNEL (1st appointment) — DUTY-WISE', needs: C().locks.letter1 ? '' : 'Lock the counting 1st appointment letter first.',
    groups: CNT_DUTIES.map(d => { const list = cntOfDuty(d.key); return { head: d.label, sub: `${list.length} officers`, rows: list.map(o => ({ ref: '', post: d.label, o })) }; }).filter(g => g.rows.length),
  };
  if (kind === 'cnt2') return {
    title: 'ATTENDANCE — COUNTING PARTIES (after 2nd randomisation) — PARTY-WISE', needs: C().locks.second ? '' : 'Lock the counting 2nd randomisation first.',
    groups: cntPartiesSorted().map(p => ({ head: `Counting Party No. ${p.partyNo}`, sub: 'Table No.: will be informed later', rows: party(p) })),
  };
  if (kind === 'cntMain' || kind === 'cntReserve') return {
    title: `ATTENDANCE — ${kind === 'cntMain' ? 'COUNTING PARTIES WITH TABLES' : 'RESERVE COUNTING PARTIES'} (after final randomisation)`, needs: C().locks.final ? '' : 'Lock the counting final randomisation first.',
    groups: (kind === 'cntMain' ? cntMainParties() : cntReserveParties()).map(p => ({ head: kind === 'cntMain' ? `Table No. ${cntTableOf(p.partyNo)} — Counting Party No. ${p.partyNo}` : `Counting Party No. ${p.partyNo} — RESERVE`, sub: hall ? `Counting hall: ${hall}` : '', rows: party(p) })),
  };
  return null;
}

/* ---------------- Excel ---------------- */
const CNT_HEAD = ['PIN', 'Name', 'Designation', 'Office Code', 'Office Name', 'Office Address', 'Mobile', 'Duty', 'Home Block Code', 'Home Block', 'Posting Block Code', 'Posting Block', 'Blood Group'];
const CNT_KEYS = ['pin', 'name', 'designation', 'officeCode', 'office', 'officeAddress', 'mobile', 'duty', 'homeBlockCode', 'homeBlock', 'postingBlockCode', 'postingBlock', 'bloodGroup'];
const CNT_WIDTHS = [12, 24, 22, 12, 30, 26, 13, 24, 12, 16, 12, 16, 11];
const CNT_SETUP_FIELDS = [
  ['tables', 'Number of counting tables'], ['reservePct', 'Reserve %'], ['hall', 'Counting hall'],
  ['countDate', 'Date of counting (DD-MM-YYYY)'], ['countTime', 'Counting start time (HH:MM)'],
  ['reportVenue', 'Reporting place'], ['reportDate', 'Reporting date (DD-MM-YYYY)'], ['reportTime', 'Reporting time (HH:MM)'],
  ['trainVenue', 'Training venue (optional)'], ['trainDate', 'Training date (DD-MM-YYYY)'], ['trainTime', 'Training time (HH:MM)'],
];
function cntOfficerFromObj(r) {
  const x = officerFromObj(r), o = blankCntOfficer();
  Object.keys(o).forEach(k => { o[k] = str(x[k]); });
  o.duty = normalizeCntDuty(o.duty) || o.duty;
  return o;
}
ACT.cntTemplate = () => {
  const wb = XLSX.utils.book_new();
  addSheet(wb, 'Counting_Officers', CNT_HEAD, [
    ['', 'RAKESH KUMAR', 'Assistant Engineer', '30112', 'Road Construction Department, Division-1', 'Collectorate Campus', '9100000001', 'COUNTING SUPERVISOR', '', '', '', '', 'O+'],
    ['', 'PRIYA KUMARI', 'Clerk', '30245', 'District Education Office', 'Station Road', '9100000002', 'COUNTING ASSISTANT', '', '', '', '', ''],
    ['', 'AJAY PASWAN', 'Office Assistant', '30318', 'Block Office Sadar', 'Sadar', '9100000003', 'CA', '', '', '', '', 'B+'],
  ], CNT_WIDTHS);
  XLSX.utils.book_append_sheet(wb, readme([
    'COUNTING OFFICERS — one row per officer. Delete the three example rows before use.',
    '',
    'PIN            — unique. Leave blank to auto-generate.',
    'Name, Designation, Office Name, Office Address, Mobile — printed on letters, identity cards and attendance sheets.',
    'Office Code    — recommended. Same code = same office. The three members of a counting party are always from different offices.',
    'Duty           — COUNTING SUPERVISOR or COUNTING ASSISTANT (short forms CS / CA accepted).',
    'Home / Posting Block (Code) — optional; NOT used for forming counting parties (members may be from the same block).',
    'Blood Group    — optional; printed on the identity card when filled.',
    '',
    'Parties formed = number of tables + reserve % (Counting Setup). Each party = 1 Counting Supervisor + 2 Counting Assistants.',
  ]), 'Instructions');
  saveWb(wb, 'Counting_Officers_Template.xlsx');
};
ACT.cntImport = async mode => {
  const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return;
  const wb = await readWorkbookFile(f);
  const ws = findSheet(wb, 'Counting_Officers', 'Counting Officers', 'Officers') || wb.Sheets[wb.SheetNames[0]];
  const list = sheetObjects(ws).map(cntOfficerFromObj).filter(o => o.name || o.pin);
  if (!list.length) return toast('No officer rows found. Use the template headers.', 'bad');
  if (mode === 'replace' && C().officers.length && !confirmBox(`Replace ${C().officers.length} existing counting officers with ${list.length} from the file?`)) return;
  if (mode === 'replace') C().officers = [];
  invalidateIndexes();
  list.forEach(o => { if (!o.pin) o.pin = cntNextPin(); C().officers.push(o); });
  addLog(`Counting: ${list.length} officers imported (${mode}) from ${f.name}`);
  persist(); UI.cntPage = 1; render();
  const v = validateCntOfficers();
  toast(`${list.length} counting officers imported. ${v.errors.length} error(s), ${v.warnings.length} warning(s).`, v.errors.length ? 'warn' : 'ok');
};
const cntOfficerRows = () => C().officers.map(o => CNT_KEYS.map(k => o[k]));
ACT.cntExport = () => { const wb = XLSX.utils.book_new(); addSheet(wb, 'Counting_Officers', CNT_HEAD, cntOfficerRows(), CNT_WIDTHS); saveWb(wb, `Counting_Officers_${safeName(S.setup.district)}.xlsx`); };
ACT.cntExportParties = () => {
  const wb = XLSX.utils.book_new(), fin = C().locks.final || Object.keys(C().tables).length;
  const rows = (fin ? cntMainParties().concat(cntReserveParties()) : cntPartiesSorted()).flatMap(p => CNT_ROLES.map(r => { const o = cntOfficerByPin(p[r]) || {}; return [p.partyNo, fin ? (cntTableOf(p.partyNo) || 'RESERVE') : 'Will be informed later', CNT_ROLE_NAME[r], o.pin, o.name, o.designation, o.office, o.mobile]; }));
  addSheet(wb, 'Counting_Parties', ['Party No', 'Table No', 'Post', 'PIN', 'Name', 'Designation', 'Office', 'Mobile'], rows, [10, 22, 22, 12, 26, 24, 34, 13]);
  saveWb(wb, `Counting_Parties_${safeName(S.setup.district)}.xlsx`);
};
/** Sheets added to the project workbook. */
function addCountingSheets(wb) {
  const st = C().setup;
  addSheet(wb, 'Counting_Setup', ['Key', 'Field', 'Value'], CNT_SETUP_FIELDS.map(([k, l]) => [k, l, /Date$/.test(k) ? fmtDate(st[k]) : st[k]]), [16, 40, 60]);
  addSheet(wb, 'Counting_Officers', CNT_HEAD, cntOfficerRows(), CNT_WIDTHS);
  const nm = pin => (cntOfficerByPin(pin) || {}).name || '';
  addSheet(wb, 'Counting_Parties', ['Party No', 'CS PIN', 'CS Name', 'CA1 PIN', 'CA1 Name', 'CA2 PIN', 'CA2 Name', 'Table No'],
    cntPartiesSorted().map(p => [p.partyNo, p.CS, nm(p.CS), p.CA1, nm(p.CA1), p.CA2, nm(p.CA2), cntTableOf(p.partyNo) || '']));
  const status = Object.entries(C().locks).map(([k, v]) => ['lock.' + k, v ? 'Yes' : 'No']).concat(Object.entries(C().ran).map(([k, v]) => ['ran.' + k, v]));
  addSheet(wb, 'Counting_Status', ['Key', 'Value'], status, [16, 24]);
}
/** Reads the counting sheets of a project workbook into st.cnt (S is st while this runs). */
function parseCountingSheets(wb, st) {
  const c = st.cnt;
  sheetObjects(findSheet(wb, 'Counting_Setup')).forEach(r => {
    const k = str(r.key); if (!(k in c.setup)) return;
    c.setup[k] = /Date$/.test(k) ? parseDateAny(r.value) : /Time$/.test(k) ? parseTimeAny(r.value) : k === 'tables' ? intOr0(r.value) : k === 'reservePct' ? (Number(r.value) || 0) : str(r.value);
  });
  c.officers = sheetObjects(findSheet(wb, 'Counting_Officers')).map(cntOfficerFromObj).filter(o => o.name || o.pin);
  sheetObjects(findSheet(wb, 'Counting_Parties')).forEach(r => {
    const p = { partyNo: str(r.partyno), CS: str(r.cspin).replace(/\.0$/, ''), CA1: str(r.ca1pin).replace(/\.0$/, ''), CA2: str(r.ca2pin).replace(/\.0$/, '') };
    if (!p.partyNo) return;
    c.parties.push(p);
    const t = intOr0(r.tableno); if (t) c.tables[p.partyNo] = t;
  });
  sheetObjects(findSheet(wb, 'Counting_Status')).forEach(r => {
    const k = str(r.key);
    if (k.startsWith('lock.') && k.slice(5) in c.locks) c.locks[k.slice(5)] = yes(r.value);
    if (k.startsWith('ran.')) c.ran[k.slice(4)] = str(r.value);
  });
}
/** After opening a project: discard counting results that fail verification. Returns a message or ''. */
function verifyCountingOnOpen() {
  const c = C(), msgs = [];
  if (cntBad('second').length) { c.parties = []; c.tables = {}; c.locks.second = c.locks.final = false; msgs.push('Counting parties failed rule verification and were discarded — please re-run the counting 2nd randomisation.'); }
  else if (cntBad('final').length) { c.tables = {}; c.locks.final = false; msgs.push('Counting table allotment failed rule verification and was discarded — please re-run it.'); }
  if (c.locks.officers && validateCntOfficers().errors.length) { c.locks.officers = false; msgs.push('Counting officers have errors — unlocked for correction.'); }
  return msgs.join(' ');
}
