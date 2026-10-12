/* =====================================================================
 * Views
 * ===================================================================== */
function render() {
  renderNav();
  const v = $('#view');
  const fn = VIEWS[UI.view] || VIEWS.home;
  const miss = prereqs(UI.view);
  v.innerHTML = (miss.length ? `<div class="alert warn"><b>Prerequisite pending:</b> lock ${miss.map(esc).join(', ')} first. You can still look at this page.</div>` : '') + fn();
  const st = S.setup;
  $('#hdrTitle').textContent = st.electionTitle ? st.electionTitle : 'MLC Election — Polling Personnel Randomisation';
  $('#hdrSub').textContent = (st.district ? `District: ${st.district}${st.distCode ? ' (' + st.distCode + ')' : ''} · ` : '') + 'Offline, browser-only tool · no server · no internet needed';
}
function renderNav() {
  let html = '', grp = '';
  MODULES.forEach(m => {
    if (m.grp !== grp) { grp = m.grp; html += `<div class="grp">${esc(grp)}</div>`; }
    const locked = m.lock && S.locks[m.lock];
    const miss = prereqs(m.id);
    const cls = ['nav-item', UI.view === m.id ? 'active' : '', locked ? 'done' : '', miss.length ? 'blocked' : ''].join(' ');
    const tag = locked ? '<span class="tag b-ok">Locked</span>' : (m.lock ? (miss.length ? '<span class="tag">Waiting</span>' : '<span class="tag b-warn">Open</span>') : '');
    html += `<button class="${cls}" data-act="go" data-arg="${m.id}"><span class="num">${locked ? '✓' : (m.lock ? MODULES.filter(x => x.lock).indexOf(m) + 1 : '•')}</span>${esc(m.label)}${tag}</button>`;
  });
  $('#sideNav').innerHTML = html;
}
ACT.go = id => { UI.view = id; render(); window.scrollTo(0, 0); };

/* ---------------- small builders ---------------- */
function inp(label, bind, value, o = {}) {
  const type = o.type || 'text';
  const dis = o.disabled ? 'disabled' : '';
  const extra = (o.dtype ? ` data-type="${o.dtype}"` : '') + (o.list ? ` list="${o.list}"` : '') + (o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : '') + (o.min != null ? ` min="${o.min}"` : '') + (o.max != null ? ` max="${o.max}"` : '') + (o.rerender ? ' data-rerender="1"' : '');
  return `<label class="f ${o.cls || ''}">${esc(label)}<input type="${type}" data-bind="${bind}" value="${esc(value)}" ${dis}${extra}></label>`;
}
function lockBar(mod, extraLeft = '') {
  const locked = S.locks[mod];
  return `<div class="btn-row">${extraLeft}<span class="spacer"></span>${locked
    ? `<span class="badge b-ok">🔒 Locked</span><button class="btn sm" data-act="unlock" data-arg="${mod}">Unlock</button>`
    : `<span class="badge b-warn">Editable</span><button class="btn ok" data-act="lock" data-arg="${mod}">Save &amp; Lock</button>`}</div>`;
}
function dutyBadge(label) { const k = dutyKeyFromLabel(label); return `<span class="badge d-${k}">${esc(DUTY_BY_KEY[k] ? DUTY_BY_KEY[k].short : label)}</span>`; }
function issuesBox(v, title) {
  if (!v.errors.length && !v.warnings.length) return `<div class="alert ok">✔ ${esc(title)}: no problems found.</div>`;
  const list = (arr, n) => `<ul>${arr.slice(0, n).map(x => `<li>${esc(x)}</li>`).join('')}${arr.length > n ? `<li>… and ${arr.length - n} more</li>` : ''}</ul>`;
  return (v.errors.length ? `<div class="alert bad"><b>${v.errors.length} error(s) — must be fixed before locking</b>${list(v.errors, 12)}</div>` : '') +
    (v.warnings.length ? `<details class="alert warn"><summary><b>${v.warnings.length} warning(s)</b> — can be locked, but please review</summary>${list(v.warnings, 40)}</details>` : '');
}
function kpi(label, value, cls = '') { return `<div class="kpi ${cls}"><div class="l">${esc(label)}</div><div class="v">${esc(value)}</div></div>`; }

/* =====================================================================
 * HOME
 * ===================================================================== */
const VIEWS = {};
VIEWS.home = () => {
  const L = S.locks;
  const step = (title, lockKey, view, req, desc) => {
    const miss = prereqs(view);
    const st = L[lockKey] ? '<span class="badge b-ok">Locked</span>' : miss.length ? `<span class="badge">Needs ${esc(miss.join(', '))}</span>` : '<span class="badge b-warn">Ready to do</span>';
    return `<div class="step"><div class="btn-row"><h4>${esc(title)}</h4><span class="spacer"></span>${st}</div><div class="req">${esc(req)}</div><div class="small">${esc(desc)}</div><button class="btn sm pri" data-act="go" data-arg="${view}">Open</button></div>`;
  };
  const cnt = k => officersOfDuty(k).length;
  return `
  <div class="card">
    <div class="card-head"><h2>Dashboard</h2><span class="spacer"></span><span class="small muted">Tool v${APP_VERSION}</span></div>
    <div class="alert info">Everything runs inside this browser. Nothing is sent anywhere. Work is autosaved in <b>this browser only</b> — to move to another computer or keep a backup, use <b>Save Project (.xlsx)</b> and later <b>Open Project (.xlsx)</b>.</div>
    <div class="kpis">
      ${kpi('Officers', S.officers.length)}${DUTIES.map(d => kpi(d.short, cnt(d.key))).join('')}
      ${kpi('Booths', S.booths.length)}${kpi('Parties formed', S.second.parties.length)}${kpi('Booths tagged', Object.keys(S.final.polling).length)}
    </div>
    <div class="btn-row">
      <button class="btn pri" data-act="openProject">Open Project (.xlsx)</button>
      <button class="btn" data-act="saveProject">Save Project (.xlsx)</button>
      <button class="btn" data-act="go" data-arg="data">Test data &amp; templates</button>
      <span class="spacer"></span>
      <button class="btn ghost-bad" data-act="resetAll">Start a new, empty project</button>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Workflow</h3></div>
    <p class="small muted">Configuration and data-entry steps are independent of each other. <b>Booth Entry does not depend on Officers, Training or the 1st letter</b> — it only needs the constituency list from Setup. The 2nd randomisation needs Officers and Booths locked; the final randomisation needs the 2nd randomisation locked.</p>
    <div class="flow">
      ${step('1 · Election Setup', 'setup', 'setup', 'Manual entry or import', 'District, constituencies, reserve %, poll & material details, randomisation rules, signature.')}
      ${step('2 · Training Schedule', 'training', 'training', 'Manual entry or import', 'Duty-wise 1st / 2nd / 3rd training date, time and venue.')}
      ${step('3 · Officers Database', 'officers', 'officers', 'Needs Setup', 'Upload Excel or add manually. Home block, posting block and office are required for the rules.')}
      ${step('4 · Booth Entry', 'booths', 'booths', 'Needs Setup only — independent', 'Polling stations with block and constituency. Can be done at any time before the 2nd randomisation.')}
      ${step('5 · 1st Appointment Letter', 'letter1', 'letter1', 'Needs Officers + Training', 'Duty and training letters. No party / booth disclosed.')}
      ${step('6 · 2nd Randomisation', 'second', 'second', 'Needs Officers + Booths', 'Forms polling parties (4 different offices), PCCP and Micro Observer pools. Booth not disclosed.')}
      ${step('7 · Final Randomisation', 'final', 'final', 'Needs 2nd randomisation locked', 'Tags parties / PCCP / MO to booths. Home & posting block of every member is excluded. Untagged = Reserve.')}
    </div>
  </div>
  <div class="card"><div class="card-head"><h3>Rule check (live)</h3></div>${auditHtml(runAudit())}</div>`;
};
ACT.resetAll = () => {
  if (!confirmBox('This clears ALL data in this browser (setup, officers, booths, randomisation). Save a project file first if you need it. Continue?')) return;
  S = defaultState(); addLog('New empty project started'); persist(); UI.view = 'setup'; render();
};

/* =====================================================================
 * SETUP
 * ===================================================================== */
VIEWS.setup = () => {
  const st = S.setup, dis = S.locks.setup;
  const o = { disabled: dis };
  const v = validateSetup();
  return `
  <div class="card">
    <div class="card-head"><h2>Election Setup</h2><span class="spacer"></span></div>
    ${lockBar('setup', `<button class="btn sm" data-act="importLegacySetup" ${dis ? 'disabled' : ''}>Import old Setup JSON</button><button class="btn sm" data-act="importConfigExcel" ${dis ? 'disabled' : ''}>Import Configuration Excel</button><button class="btn sm" data-act="exportConfigExcel">Download Configuration Excel</button>`)}
  </div>
  <datalist id="dlDistricts">${BIHAR_DISTRICTS.map(d => `<option value="${esc(d[1])}">${esc(d[0])}</option>`).join('')}</datalist>
  <datalist id="dlConst">${CONSTITUENCY_SUGGESTIONS.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
  <div class="card">
    <h3>Election &amp; authority</h3>
    <div class="grid g4">
      ${inp('Election title', 'setup.electionTitle', st.electionTitle, { ...o, cls: 'span4', placeholder: 'Biennial Election to Bihar Legislative Council, 2026 for … Constituency' })}
      <label class="f span2">District (type any district)<input type="text" data-bind="setup.district" data-chg="districtChanged" value="${esc(st.district)}" list="dlDistricts" ${dis ? 'disabled' : ''} placeholder="e.g. Sheohar"></label>
      ${inp('District code (used for auto PIN)', 'setup.distCode', st.distCode, { ...o, placeholder: 'e.g. 03' })}
      ${inp('Place (printed on letters)', 'setup.place', st.place, { ...o, placeholder: 'defaults to district' })}
      ${inp('Appointing authority line (RO / DEO)', 'setup.roCumDeo', st.roCumDeo, { ...o, cls: 'span4', placeholder: 'Name, District Election Officer cum District Magistrate, …' })}
      ${inp('Signing title (middle)', 'setup.authIssueTitle', st.authIssueTitle, { ...o, cls: 'span2', placeholder: 'Authorised to Issue Officer I/c' })}
      ${inp('Signing authority (right)', 'setup.authSubTitle', st.authSubTitle, { ...o, cls: 'span2', placeholder: 'District Election Officer, …' })}
      <div class="span4"><label class="f">Signature image (JPG/PNG, optional — printed on letters)</label>
        <div class="btn-row">${st.signature ? `<img src="${esc(st.signature)}" style="max-height:48px;border:1px solid #ccd;padding:2px;border-radius:4px;background:#fff">` : '<span class="small muted">No signature uploaded</span>'}
        <button class="btn sm" data-act="uploadSignature" ${dis ? 'disabled' : ''}>Upload</button>${st.signature ? `<button class="btn sm" data-act="removeSignature" ${dis ? 'disabled' : ''}>Remove</button>` : ''}</div></div>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Constituencies</h3><span class="spacer"></span><button class="btn sm" data-act="addConst" ${dis ? 'disabled' : ''}>+ Add constituency</button></div>
    <p class="small muted">Polling parties needed = booths entered for that constituency + reserve %. PCCP and Micro Observer required counts are entered here (cannot exceed booths).</p>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>Code</th><th>Full name (printed on letters)</th><th>PCCP required</th><th>Micro Observers required</th><th>Booths entered</th><th></th></tr></thead><tbody>
    ${S.constituencies.map((c, i) => `<tr>
      <td style="width:90px"><input type="text" data-bind="constituencies.${i}.code" value="${esc(c.code)}" ${dis ? 'disabled' : ''} placeholder="TC"></td>
      <td><input type="text" data-bind="constituencies.${i}.name" value="${esc(c.name)}" list="dlConst" ${dis ? 'disabled' : ''} placeholder="04-Tirhut Teachers"></td>
      <td style="width:130px"><input type="number" min="0" data-type="int" data-bind="constituencies.${i}.pccp" value="${esc(c.pccp)}" ${dis ? 'disabled' : ''}></td>
      <td style="width:150px"><input type="number" min="0" data-type="int" data-bind="constituencies.${i}.micro" value="${esc(c.micro)}" ${dis ? 'disabled' : ''}></td>
      <td class="center">${boothsOf(c.code).length}</td>
      <td><button class="btn sm ghost-bad" data-act="delConst" data-arg="${i}" ${dis ? 'disabled' : ''}>Remove</button></td></tr>`).join('')}
    </tbody></table></div>
  </div>
  <div class="card">
    <h3>Poll, reserve &amp; material</h3>
    <div class="grid g4">
      ${inp('Reserve % (parties, PCCP, MO)', 'setup.reservePct', st.reservePct, { ...o, type: 'number', dtype: 'num', min: 0, max: 100 })}
      ${inp('Poll date', 'setup.pollDate', st.pollDate, { ...o, type: 'date' })}
      ${inp('Poll from', 'setup.pollFrom', st.pollFrom, { ...o, type: 'time' })}
      ${inp('Poll to', 'setup.pollTo', st.pollTo, { ...o, type: 'time' })}
      ${inp('Letter issue date', 'setup.letterDate', st.letterDate, { ...o, type: 'date' })}
      ${inp('Reporting venue (Micro Observers)', 'setup.reportVenue', st.reportVenue, { ...o, cls: 'span3' })}
      ${inp('Material collection venue', 'setup.matCollectVenue', st.matCollectVenue, { ...o, cls: 'span2' })}
      ${inp('Collection date', 'setup.matCollectDate', st.matCollectDate, { ...o, type: 'date' })}
      ${inp('Collection time', 'setup.matCollectTime', st.matCollectTime, { ...o, type: 'time' })}
      ${inp('Material deposit centre / strong room', 'setup.matDeposit', st.matDeposit, { ...o, cls: 'span4' })}
    </div>
  </div>
  <div class="card">
    <h3>Randomisation rules</h3>
    <div class="grid g2">
      <div class="alert info span2" style="margin:0"><b>Always applied:</b> no officer (PrO, P1, P2, P3, PCCP, Micro Observer) is tagged to a booth located in his/her <b>home block</b> or <b>posting block</b>.</div>
      <label class="check"><input type="checkbox" data-bind="setup.ruleDistinctOffice" ${st.ruleDistinctOffice ? 'checked' : ''} ${dis ? 'disabled' : ''}> <span><b>All 4 members of a polling party must be from different offices</b> (recommended)</span></label>
      <label class="f">Two officers are “same office” when they have the same…
        <select data-bind="setup.officeKeyMode" ${dis ? 'disabled' : ''}><option value="name" ${st.officeKeyMode === 'name' ? 'selected' : ''}>Office name (stricter)</option><option value="nameaddr" ${st.officeKeyMode === 'nameaddr' ? 'selected' : ''}>Office name + office address</option></select></label>
      <label class="check"><input type="checkbox" data-bind="setup.ruleDistinctPostingBlock" ${st.ruleDistinctPostingBlock ? 'checked' : ''} ${dis ? 'disabled' : ''}> <span>Also: party members must have different <b>posting</b> blocks (optional, stricter)</span></label>
      <label class="check"><input type="checkbox" data-bind="setup.ruleDistinctHomeBlock" ${st.ruleDistinctHomeBlock ? 'checked' : ''} ${dis ? 'disabled' : ''}> <span>Also: party members must have different <b>home</b> blocks (optional, stricter)</span></label>
    </div>
  </div>
  <div class="card">${issuesBox(v, 'Setup')}${lockBar('setup')}</div>`;
};
ACT.districtChanged = (a, el) => {
  const d = BIHAR_DISTRICTS.find(x => x[1].toLowerCase() === str(el.value).toLowerCase());
  if (d) {
    if (!S.setup.distCode) S.setup.distCode = d[0];
    const pre = d[2];
    S.constituencies.forEach(c => {
      if (!c.name && c.code === 'TC') c.name = `${pre} Teachers`;
      if (!c.name && c.code === 'GC') c.name = `${pre} Graduates`;
    });
    if (!S.setup.place) S.setup.place = d[1];
  }
  persist(); render();
};
ACT.addConst = () => { S.constituencies.push({ code: '', name: '', pccp: 0, micro: 0 }); persist(); render(); };
ACT.delConst = i => {
  const c = S.constituencies[i];
  if (c && boothsOf(c.code).length && !confirmBox(`${boothsOf(c.code).length} booths use "${c.code}". Remove anyway?`)) return;
  S.constituencies.splice(Number(i), 1); persist(); render();
};
ACT.uploadSignature = async () => {
  const f = await pickFile('.jpg,.jpeg,.png'); if (!f) return;
  if (f.size > 400 * 1024) return toast('Signature image should be under 400 KB.', 'bad');
  S.setup.signature = await readFileAs(f, 'dataurl'); persist(); render();
};
ACT.removeSignature = () => { S.setup.signature = ''; persist(); render(); };

/* =====================================================================
 * TRAINING
 * ===================================================================== */
VIEWS.training = () => {
  const dis = S.locks.training;
  const v = validateTraining();
  return `
  <div class="card">
    <div class="card-head"><h2>Training Schedule</h2></div>
    <p class="small muted">Enter duty-wise training. The 1st training is mandatory; 2nd and 3rd are optional (fill completely or leave blank). This schedule is printed in the 1st appointment letter and on attendance sheets.</p>
    ${lockBar('training', `<button class="btn sm" data-act="copyTraining" ${dis ? 'disabled' : ''}>Copy Presiding Officer schedule to all duties</button><button class="btn sm" data-act="importLegacyTraining" ${dis ? 'disabled' : ''}>Import old Training JSON</button><button class="btn sm" data-act="importConfigExcel" ${dis ? 'disabled' : ''}>Import Configuration Excel</button><button class="btn sm" data-act="exportConfigExcel">Download Configuration Excel</button>`)}
  </div>
  ${DUTIES.map(d => `<div class="card"><div class="card-head">${dutyBadge(d.label)}<h3>${esc(d.label)}</h3><span class="spacer"></span><span class="small muted">${officersOfDuty(d.key).length} officers</span></div>
    <div class="tbl-wrap" style="max-height:none"><table class="t"><thead><tr><th style="width:110px">Training</th><th style="width:160px">Date</th><th style="width:120px">Start</th><th style="width:120px">End</th><th>Venue</th></tr></thead><tbody>
    ${S.training[d.label].map((t, i) => {
      const b = `training.${d.label}.${i}`;
      return `<tr><td><b>${ordinal(i + 1)}</b>${i === 0 ? ' <span class="badge b-bad">required</span>' : ''}</td>
      <td><input type="date" data-bind="${b}.date" value="${esc(t.date)}" ${dis ? 'disabled' : ''}></td>
      <td><input type="time" data-bind="${b}.start" value="${esc(t.start)}" ${dis ? 'disabled' : ''}></td>
      <td><input type="time" data-bind="${b}.end" value="${esc(t.end)}" ${dis ? 'disabled' : ''}></td>
      <td><input type="text" data-bind="${b}.venue" value="${esc(t.venue)}" ${dis ? 'disabled' : ''} placeholder="Training hall / venue"></td></tr>`;
    }).join('')}</tbody></table></div></div>`).join('')}
  <div class="card">${issuesBox(v, 'Training schedule')}${lockBar('training')}</div>
  <div class="card"><div class="card-head"><h3>Training attendance sheet</h3></div>
    <div class="btn-row"><label class="f">Training<select id="attTraining">${[1, 2, 3].map(n => `<option value="${n}">${ordinal(n)} Training</option>`).join('')}</select></label>
    <label class="f">Duty<select id="attDuty"><option value="ALL">All duties</option>${DUTIES.map(d => `<option value="${esc(d.label)}">${esc(d.label)}</option>`).join('')}</select></label>
    <button class="btn pri" data-act="openAttendance" ${S.officers.length ? '' : 'disabled'}>Open / Print attendance (A4 landscape)</button></div>
    ${S.officers.length ? '' : '<p class="small muted">Load officers to print attendance sheets.</p>'}</div>`;
};
ACT.copyTraining = () => {
  const src = S.training['PRESIDING OFFICER'];
  if (!confirmBox('Overwrite the schedule of all other duties with the Presiding Officer schedule?')) return;
  DUTIES.forEach(d => { if (d.label !== 'PRESIDING OFFICER') S.training[d.label] = JSON.parse(JSON.stringify(src)); });
  persist(); render();
};
ACT.openAttendance = () => {
  const n = Number($('#attTraining').value), duty = $('#attDuty').value;
  openDoc(`${ordinal(n)} Training Attendance — ${duty === 'ALL' ? 'All duties' : duty}`, trainingAttendanceHtml(n, duty));
};

/* =====================================================================
 * OFFICERS
 * ===================================================================== */
VIEWS.officers = () => {
  const dis = S.locks.officers;
  const v = validateOfficers();
  const q = UI.officerQuery.toLowerCase();
  const rows = S.officers.map((o, i) => ({ o, i })).filter(({ o }) => !q || [o.pin, o.name, o.designation, o.office, o.duty, o.homeBlock, o.postingBlock, o.mobile].some(x => str(x).toLowerCase().includes(q)));
  const ps = UI.officerPageSize, pages = Math.max(1, Math.ceil(rows.length / ps));
  UI.officerPage = Math.min(Math.max(1, UI.officerPage), pages);
  const slice = rows.slice((UI.officerPage - 1) * ps, UI.officerPage * ps);
  const need = pollingPlan().reduce((a, p) => a + p.target, 0);
  const needS = k => singlePlan(k).reduce((a, p) => a + p.target, 0);
  const req = { PRO: need, P1: need, P2: need, P3: need, PM: needS('pccp'), MO: needS('micro') };
  return `
  <div class="card">
    <div class="card-head"><h2>Officers Database</h2></div>
    <p class="small muted">Required columns: PIN, Name, Designation, Office Name, Office Address, Mobile, Duty, <b>Home Block</b>, <b>Posting Block</b>. Bank columns are optional (printed on attendance sheets). Blank PIN is auto-generated as District code + serial.</p>
    <div class="kpis">${DUTIES.map(d => { const a = officersOfDuty(d.key).length, r = req[d.key]; return kpi(`${d.short} available${r ? ' / needed' : ''}`, r ? `${a} / ${r}` : a, r ? (a >= r ? 'ok' : 'bad') : ''); }).join('')}${kpi('Total', S.officers.length)}</div>
    ${S.booths.length ? '' : '<p class="small muted">“Needed” figures appear once booths are entered (booths + reserve %).</p>'}
    ${lockBar('officers', `
      <button class="btn sm" data-act="officerTemplate">Download blank template</button>
      <button class="btn sm pri" data-act="importOfficers" data-arg="replace" ${dis ? 'disabled' : ''}>Import Excel (replace)</button>
      <button class="btn sm" data-act="importOfficers" data-arg="append" ${dis ? 'disabled' : ''}>Import Excel (add to list)</button>
      <button class="btn sm" data-act="editOfficer" data-arg="-1" ${dis ? 'disabled' : ''}>+ Add officer manually</button>
      <button class="btn sm" data-act="exportOfficers" ${S.officers.length ? '' : 'disabled'}>Export Excel</button>
      <button class="btn sm ghost-bad" data-act="clearOfficers" ${dis || !S.officers.length ? 'disabled' : ''}>Clear all</button>`)}
  </div>
  <div class="card">${issuesBox(v, 'Officers')}
    <div class="btn-row" style="margin-bottom:8px"><input type="search" placeholder="Search PIN, name, office, duty, block…" value="${esc(UI.officerQuery)}" data-inp="officerSearch" style="max-width:360px">
      <span class="spacer"></span><span class="small muted">${rows.length} shown · page ${UI.officerPage} / ${pages}</span>
      <button class="btn sm" data-act="officerPage" data-arg="-1" ${UI.officerPage <= 1 ? 'disabled' : ''}>‹ Prev</button>
      <button class="btn sm" data-act="officerPage" data-arg="1" ${UI.officerPage >= pages ? 'disabled' : ''}>Next ›</button></div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>PIN</th><th>Name</th><th>Designation</th><th>Office</th><th>Mobile</th><th>Duty</th><th>Home block</th><th>Posting block</th><th>Issues</th><th></th></tr></thead><tbody>
    ${slice.length ? slice.map(({ o, i }) => { const iss = v.rowIssues.get(i); return `<tr class="${iss ? (iss.level === 'err' ? 'err' : 'warnrow') : ''}">
      <td>${i + 1}</td><td class="pin">${esc(o.pin)}</td><td><b>${esc(o.name)}</b></td><td>${esc(o.designation)}</td><td>${esc(o.office)}<div class="small muted">${esc(o.officeAddress)}</div></td><td>${esc(o.mobile)}</td>
      <td>${o.duty ? dutyBadge(o.duty) : '<span class="badge b-bad">?</span>'}</td><td>${esc(o.homeBlock)}</td><td>${esc(o.postingBlock)}</td>
      <td class="small">${iss ? esc(iss.msgs.join('; ')) : ''}</td>
      <td class="nowrap"><button class="btn sm" data-act="editOfficer" data-arg="${i}" ${dis ? 'disabled' : ''}>Edit</button> <button class="btn sm ghost-bad" data-act="delOfficer" data-arg="${i}" ${dis ? 'disabled' : ''}>✕</button></td></tr>`; }).join('')
      : '<tr><td colspan="11" class="center muted" style="padding:24px">No officers yet. Import an Excel file or add manually.</td></tr>'}
    </tbody></table></div></div>`;
};
ACT.officerSearch = (a, el) => { UI.officerQuery = el.value; UI.officerPage = 1; const pos = el.selectionStart; render(); const n = $('[data-inp="officerSearch"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
ACT.officerPage = d => { UI.officerPage += Number(d); render(); };
ACT.delOfficer = i => { const o = S.officers[i]; if (!confirmBox(`Delete ${o.name} (${o.pin})?`)) return; S.officers.splice(Number(i), 1); persist(); render(); };
ACT.clearOfficers = () => { if (!confirmBox('Delete ALL officers?')) return; S.officers = []; addLog('All officers cleared'); persist(); render(); };
ACT.editOfficer = idx => {
  const i = Number(idx), o = i >= 0 ? S.officers[i] : blankOfficer();
  const f = (k, l, t = 'text', extra = '') => `<label class="f">${esc(l)}<input type="${t}" name="${k}" value="${esc(o[k])}" ${extra}></label>`;
  const blocks = [...new Set(S.booths.map(b => b.block).concat(S.officers.flatMap(x => [x.homeBlock, x.postingBlock])).filter(Boolean))].sort();
  const m = openModal({
    title: i >= 0 ? `Edit officer ${o.pin}` : 'Add officer', plain: true,
    body: `<form id="offForm" class="grid g3">
      ${f('pin', 'PIN (blank = auto)')}${f('name', 'Name *')}${f('designation', 'Designation')}
      ${f('office', 'Office name *')}${f('officeAddress', 'Office address')}${f('mobile', 'Mobile')}
      <label class="f">Duty *<select name="duty"><option value="">— select —</option>${DUTIES.map(d => `<option ${o.duty === d.label ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></label>
      ${f('homeBlock', 'Home block *', 'text', 'list="dlBlocks"')}${f('postingBlock', 'Posting block *', 'text', 'list="dlBlocks"')}
      ${f('acNo', 'Account no')}${f('bank', 'Bank')}${f('branch', 'Branch')}${f('ifsc', 'IFSC')}
      <datalist id="dlBlocks">${blocks.map(b => `<option value="${esc(b)}">`).join('')}</datalist></form>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn ok" data-act="saveOfficer" data-arg="${i}">Save</button>`,
  });
  m.querySelector('input[name=name]').focus();
};
ACT.saveOfficer = idx => {
  const i = Number(idx), form = $('#offForm'), o = blankOfficer();
  Object.keys(o).forEach(k => { const el = form.elements[k]; if (el) o[k] = str(el.value); });
  if (!o.name) return toast('Name is required.', 'bad');
  if (!o.duty) return toast('Duty is required.', 'bad');
  if (!o.pin) o.pin = nextPin();
  if (S.officers.some((x, j) => j !== i && String(x.pin) === o.pin)) return toast(`PIN ${o.pin} already exists.`, 'bad');
  if (i >= 0) S.officers[i] = o; else S.officers.push(o);
  persist(); closeTopModal(); render();
};
function nextPin() {
  const code = str(S.setup.distCode) || '00';
  let n = S.officers.length + 1, pin;
  const used = new Set(S.officers.map(o => String(o.pin)));
  do { pin = code + pad(n++, 5); } while (used.has(pin));
  return pin;
}

/* =====================================================================
 * BOOTHS (independent exercise)
 * ===================================================================== */
VIEWS.booths = () => {
  const dis = S.locks.booths;
  const v = validateBooths();
  const q = UI.boothQuery.toLowerCase();
  const blocks = {};
  S.booths.forEach(b => { const k = blockKey(b.block); blocks[k] = blocks[k] || { name: b.block, n: 0 }; blocks[k].n++; });
  const rows = S.booths.map((b, i) => ({ b, i })).filter(({ b }) => !q || [b.no, b.name, b.block, b.const].some(x => str(x).toLowerCase().includes(q)));
  return `
  <div class="card">
    <div class="card-head"><h2>Booth Entry</h2><span class="spacer"></span><span class="badge b-info">Independent step</span></div>
    <div class="alert info">Booth entry is independent of Officers, Training and the 1st letter — do it whenever the booth list is ready. It must be locked before the 2nd randomisation. The <b>block</b> of every booth is mandatory: officers whose home block or posting block equals it will never be tagged to that booth.</div>
    <div class="kpis">${S.constituencies.map(c => kpi(`${c.code} booths`, boothsOf(c.code).length)).join('')}${kpi('Total booths', S.booths.length)}${kpi('Blocks', Object.keys(blocks).length)}</div>
    ${Object.keys(blocks).length ? `<p class="small">${Object.values(blocks).map(b => `<span class="badge b-pri">${esc(b.name)}: ${b.n}</span>`).join(' ')}</p>` : ''}
    ${lockBar('booths', `
      <button class="btn sm" data-act="boothTemplate">Download blank template</button>
      <button class="btn sm pri" data-act="importBooths" data-arg="replace" ${dis ? 'disabled' : ''}>Import Excel (replace)</button>
      <button class="btn sm" data-act="importBooths" data-arg="append" ${dis ? 'disabled' : ''}>Import Excel (add to list)</button>
      <button class="btn sm" data-act="editBooth" data-arg="-1" ${dis ? 'disabled' : ''}>+ Add booth manually</button>
      <button class="btn sm" data-act="exportBooths" ${S.booths.length ? '' : 'disabled'}>Export Excel</button>
      <button class="btn sm ghost-bad" data-act="clearBooths" ${dis || !S.booths.length ? 'disabled' : ''}>Clear all</button>`)}
  </div>
  <div class="card">${issuesBox(v, 'Booths')}
    <div class="btn-row" style="margin-bottom:8px"><input type="search" placeholder="Search booth no, location, block…" value="${esc(UI.boothQuery)}" data-inp="boothSearch" style="max-width:360px"></div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>Constituency</th><th>Booth no</th><th>Main / Aux</th><th>Location / building</th><th>Block</th><th>Issues</th><th></th></tr></thead><tbody>
    ${rows.length ? rows.map(({ b, i }) => { const iss = v.rowIssues.get(i); return `<tr class="${iss ? (iss.level === 'err' ? 'err' : 'warnrow') : ''}">
      <td>${i + 1}</td><td><span class="badge b-pri">${esc(b.const)}</span></td><td class="pin">${esc(b.no)}</td><td>${esc(b.ext)}</td><td>${esc(b.name)}</td><td>${esc(b.block)}</td>
      <td class="small">${iss ? esc(iss.msgs.join('; ')) : ''}</td>
      <td class="nowrap"><button class="btn sm" data-act="editBooth" data-arg="${i}" ${dis ? 'disabled' : ''}>Edit</button> <button class="btn sm ghost-bad" data-act="delBooth" data-arg="${i}" ${dis ? 'disabled' : ''}>✕</button></td></tr>`; }).join('')
      : '<tr><td colspan="8" class="center muted" style="padding:24px">No booths yet. Import an Excel file or add manually.</td></tr>'}
    </tbody></table></div></div>`;
};
ACT.boothSearch = (a, el) => { UI.boothQuery = el.value; const pos = el.selectionStart; render(); const n = $('[data-inp="boothSearch"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
ACT.delBooth = i => { const b = S.booths[i]; if (!confirmBox(`Delete booth ${b.const} ${b.no}?`)) return; S.booths.splice(Number(i), 1); persist(); render(); };
ACT.clearBooths = () => { if (!confirmBox('Delete ALL booths?')) return; S.booths = []; addLog('All booths cleared'); persist(); render(); };
ACT.editBooth = idx => {
  const i = Number(idx), b = i >= 0 ? S.booths[i] : Object.assign(blankBooth(), { const: (S.constituencies[0] || {}).code || '' });
  const blocks = [...new Set(S.booths.map(x => x.block).concat(S.officers.flatMap(x => [x.homeBlock, x.postingBlock])).filter(Boolean))].sort();
  openModal({
    title: i >= 0 ? `Edit booth ${b.no}` : 'Add booth', plain: true,
    body: `<form id="boothForm" class="grid g3">
      <label class="f">Constituency *<select name="const">${S.constituencies.map(c => `<option value="${esc(c.code)}" ${b.const === c.code ? 'selected' : ''}>${esc(c.code)} — ${esc(c.name)}</option>`).join('')}</select></label>
      <label class="f">Booth no *<input name="no" value="${esc(b.no)}" placeholder="e.g. 12 or 12A"></label>
      <label class="f">Main / Aux<select name="ext"><option ${b.ext !== 'Aux' ? 'selected' : ''}>Main</option><option ${b.ext === 'Aux' ? 'selected' : ''}>Aux</option></select></label>
      <label class="f span2">Location / building name<input name="name" value="${esc(b.name)}"></label>
      <label class="f">Block *<input name="block" value="${esc(b.block)}" list="dlBlocks2"></label>
      <datalist id="dlBlocks2">${blocks.map(x => `<option value="${esc(x)}">`).join('')}</datalist></form>`,
    foot: `<button class="btn" data-close>Cancel</button><button class="btn ok" data-act="saveBooth" data-arg="${i}">Save</button>`,
  });
};
ACT.saveBooth = idx => {
  const i = Number(idx), form = $('#boothForm');
  const b = Object.assign(blankBooth(), { id: i >= 0 ? S.booths[i].id : newBoothId() });
  ['const', 'no', 'ext', 'name', 'block'].forEach(k => { b[k] = str(form.elements[k].value); });
  if (!b.no || !b.block) return toast('Booth no and block are required.', 'bad');
  if (S.booths.some((x, j) => j !== i && x.const === b.const && str(x.no).toUpperCase() === b.no.toUpperCase())) return toast('This booth number already exists in that constituency.', 'bad');
  if (i >= 0) S.booths[i] = b; else S.booths.push(b);
  persist(); closeTopModal(); render();
};

/* =====================================================================
 * 1ST LETTER
 * ===================================================================== */
VIEWS.letter1 = () => {
  const ready = !prereqs('letter1').length;
  return `
  <div class="card">
    <div class="card-head"><h2>1st Appointment Letter</h2></div>
    <p class="small muted">Discloses only duty and training. No party number or booth.</p>
    <div class="btn-row"><b class="small">Training rows to print:</b>${[0, 1, 2].map(i => `<label class="check"><input type="checkbox" data-chg="l1Training" data-arg="${i}" ${UI.firstLetterTrainings.includes(i) ? 'checked' : ''}> ${ordinal(i + 1)}</label>`).join('')}</div>
    <div class="btn-row" style="margin-top:8px">
      <label class="f">Duty<select id="l1Duty"><option value="ALL">All duties</option>${DUTIES.map(d => `<option value="${esc(d.label)}">${esc(d.label)}</option>`).join('')}</select></label>
      <button class="btn pri" data-act="previewLetter1" ${ready ? '' : 'disabled'}>Preview / Print letters</button>
      <button class="btn" data-act="exportLetter1" ${ready ? '' : 'disabled'}>Export 1st letter Excel</button>
      <span class="spacer"></span>
      ${S.locks.letter1 ? '<span class="badge b-ok">🔒 Marked as issued</span><button class="btn sm" data-act="unlock" data-arg="letter1">Unlock</button>' : `<button class="btn ok" data-act="lock" data-arg="letter1" ${ready ? '' : 'disabled'}>Mark as issued &amp; Lock</button>`}
    </div>
  </div>
  <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>PIN</th><th>Name</th><th>Designation</th><th>Office</th><th>Duty</th><th>Posting block</th><th></th></tr></thead><tbody>
  ${S.officers.slice(0, 500).map((o, i) => `<tr><td>${i + 1}</td><td class="pin">${esc(o.pin)}</td><td><b>${esc(o.name)}</b></td><td>${esc(o.designation)}</td><td>${esc(o.office)}</td><td>${dutyBadge(o.duty)}</td><td>${esc(o.postingBlock)}</td><td><button class="btn sm" data-act="previewLetter1One" data-arg="${esc(o.pin)}" ${ready ? '' : 'disabled'}>View</button></td></tr>`).join('')}
  ${S.officers.length > 500 ? `<tr><td colspan="8" class="center muted">Showing first 500 of ${S.officers.length}. Use “Preview / Print letters” for all.</td></tr>` : ''}
  </tbody></table></div></div>`;
};
ACT.l1Training = (i, el) => {
  const n = Number(i);
  UI.firstLetterTrainings = UI.firstLetterTrainings.filter(x => x !== n);
  if (el.checked) UI.firstLetterTrainings.push(n);
  UI.firstLetterTrainings.sort();
};
ACT.previewLetter1 = () => {
  if (!UI.firstLetterTrainings.length) return toast('Select at least one training row.', 'bad');
  const duty = $('#l1Duty').value;
  const list = S.officers.filter(o => duty === 'ALL' || o.duty === duty);
  openDoc(`1st Appointment Letters (${list.length})`, list.map(firstLetterHtml).join(''));
};
ACT.previewLetter1One = pin => {
  if (!UI.firstLetterTrainings.length) return toast('Select at least one training row.', 'bad');
  const o = officerByPin(pin); if (o) openDoc(`1st Appointment Letter — ${o.name}`, firstLetterHtml(o));
};

/* =====================================================================
 * 2ND RANDOMISATION
 * ===================================================================== */
VIEWS.second = () => {
  const ready = !prereqs('second').length, locked = S.locks.second;
  const sub = UI.sub.second || 'polling';
  const plan = pollingPlan(), pp = singlePlan('pccp'), mp = singlePlan('micro');
  const probs = ready ? pollingFeasibility() : [];
  const sp = ready ? singleFeasibility('pccp') : [], sm = ready ? singleFeasibility('micro') : [];
  const ran = S.second.ran || {};
  const canRun = ready && !locked;
  let body = '';
  if (sub === 'polling') {
    body = `<div class="btn-row" style="margin-bottom:10px">
      <button class="btn warn" data-act="runSecond" data-arg="polling" ${canRun ? '' : 'disabled'}>${S.second.parties.length ? 'Re-run' : 'Run'} polling party randomisation</button>
      <button class="btn" data-act="previewSecond" data-arg="polling" ${S.second.parties.length && locked ? '' : 'disabled'}>2nd letters (parties)</button>
      <button class="btn" data-act="exportSecond" ${S.second.parties.length ? '' : 'disabled'}>Export Excel</button>
      ${ran.polling ? `<span class="small muted">Last run: ${esc(ran.polling)}</span>` : ''}</div>
      ${probs.length ? `<div class="alert bad"><b>Cannot form parties yet:</b><ul>${probs.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
      <div class="tbl-wrap"><table class="t"><thead><tr><th>Party no</th><th>Const.</th><th>Presiding Officer</th><th>Polling Officer-1</th><th>Polling Officer-2</th><th>Polling Officer-3</th></tr></thead><tbody>
      ${S.second.parties.length ? S.second.parties.map(p => `<tr><td><b>${esc(p.partyNo)}</b></td><td>${esc(p.const)}</td>${PARTY_ROLES.map(r => memberCell(p[r])).join('')}</tr>`).join('') : '<tr><td colspan="6" class="center muted" style="padding:20px">Not run yet.</td></tr>'}
      </tbody></table></div>`;
  } else {
    const kind = sub, list = kind === 'pccp' ? S.second.pccp : S.second.micro, plan2 = kind === 'pccp' ? pp : mp, pr = kind === 'pccp' ? sp : sm;
    const nm = kind === 'pccp' ? 'PCCP (Patrolling Magistrate)' : 'Micro Observer';
    body = !plan2.length ? `<div class="alert info">${nm}: required count is 0 for every constituency (see Setup) — nothing to randomise.</div>` : `
      <div class="btn-row" style="margin-bottom:10px">
      <button class="btn warn" data-act="runSecond" data-arg="${kind}" ${canRun ? '' : 'disabled'}>${list.length ? 'Re-run' : 'Run'} ${nm} randomisation</button>
      <button class="btn" data-act="previewSecond" data-arg="${kind}" ${list.length && locked ? '' : 'disabled'}>2nd letters</button>
      <button class="btn" data-act="exportSecond" ${list.length ? '' : 'disabled'}>Export Excel</button>
      ${ran[kind] ? `<span class="small muted">Last run: ${esc(ran[kind])}</span>` : ''}</div>
      ${pr.length ? `<div class="alert bad"><ul>${pr.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
      <div class="tbl-wrap"><table class="t"><thead><tr><th>Order no</th><th>Const.</th><th>PIN</th><th>Name</th><th>Designation / office</th><th>Home block</th><th>Posting block</th></tr></thead><tbody>
      ${list.length ? list.map(x => { const o = officerByPin(x.pin) || {}; return `<tr><td><b>${esc(x.orderNo)}</b></td><td>${esc(x.const)}</td><td class="pin">${esc(x.pin)}</td><td>${esc(o.name)}</td><td>${esc(o.designation)}, ${esc(o.office)}</td><td>${esc(o.homeBlock)}</td><td>${esc(o.postingBlock)}</td></tr>`; }).join('') : '<tr><td colspan="7" class="center muted" style="padding:20px">Not run yet.</td></tr>'}
      </tbody></table></div>`;
  }
  return `
  <div class="card">
    <div class="card-head"><h2>2nd Randomisation — party formation</h2><span class="spacer"></span>
      ${locked ? '<span class="badge b-ok">🔒 Locked</span><button class="btn sm" data-act="unlock" data-arg="second">Unlock</button>' : `<button class="btn ok" data-act="lock" data-arg="second" ${ready ? '' : 'disabled'}>Verify &amp; Lock 2nd randomisation</button>`}</div>
    <p class="small muted">Forms polling parties of 4 (PrO, P1, P2, P3) from <b>4 different offices</b>, and selects PCCP and Micro Observers. Every main party is formed so that at least one booth exists where none of its members has a home or posting block — so the final randomisation is always possible. Booths are <b>not</b> disclosed in the 2nd letter. Re-running is allowed until locked.</p>
    <div class="tbl-wrap" style="max-height:none"><table class="t"><thead><tr><th>Constituency</th><th>Booths</th><th>Parties to form</th><th>PCCP required → with reserve</th><th>MO required → with reserve</th></tr></thead><tbody>
    ${S.constituencies.map(c => { const n = boothsOf(c.code).length; return `<tr><td><b>${esc(c.code)}</b> ${esc(c.name)}</td><td>${n}</td><td>${n ? reserveTarget(n) : 0}</td><td>${intOr0(c.pccp)} → ${reserveTarget(intOr0(c.pccp))}</td><td>${intOr0(c.micro)} → ${reserveTarget(intOr0(c.micro))}</td></tr>`; }).join('')}
    <tr><td><b>Total</b></td><td>${S.booths.length}</td><td>${plan.reduce((a, p) => a + p.target, 0)}</td><td>${pp.reduce((a, p) => a + p.target, 0)}</td><td>${mp.reduce((a, p) => a + p.target, 0)}</td></tr>
    </tbody></table></div>
  </div>
  <div class="card">
    <div class="subtabs">${[['polling', `Polling parties (${S.second.parties.length})`], ['pccp', `PCCP (${S.second.pccp.length})`], ['micro', `Micro Observers (${S.second.micro.length})`], ['audit', 'Rule verification']].map(([k, l]) => `<button class="${sub === k ? 'active' : ''}" data-act="sub" data-arg="second:${k}">${esc(l)}</button>`).join('')}</div>
    ${sub === 'audit' ? auditHtml(runAudit(), ['2nd']) : body}
  </div>`;
};
function memberCell(pin) {
  const o = officerByPin(pin);
  if (!o) return `<td class="pin">${esc(pin)}</td>`;
  return `<td><span class="pin">${esc(o.pin)}</span> ${esc(o.name)}<div class="small muted">${esc(o.office)} · H: ${esc(o.homeBlock)} · P: ${esc(o.postingBlock)}</div></td>`;
}
ACT.sub = arg => { const [v, s] = arg.split(':'); UI.sub[v] = s; render(); };
ACT.runSecond = kind => {
  if (S.locks.second) return;
  const label = kind === 'polling' ? 'polling parties' : kind === 'pccp' ? 'PCCP' : 'Micro Observers';
  const existing = kind === 'polling' ? S.second.parties.length : S.second[kind].length;
  if (existing && !confirmBox(`Re-run will discard the current ${label} and form a new random set. Continue?`)) return;
  const pool = kind === 'polling' ? S.officers.filter(o => PARTY_ROLES.some(r => o.duty === DUTY_BY_KEY[r].label)) : officersOfDuty(kind === 'pccp' ? 'PM' : 'MO');
  shuffleAnimation(`Forming ${label}`, pool, () => {
    if (kind === 'polling') { const r = formPollingParties(); S.second.parties = r.parties; addLog(`2nd randomisation: ${r.parties.length} polling parties formed (attempt ${r.attempts})`); }
    else { const r = formSingles(kind); S.second[kind] = r.items; addLog(`2nd randomisation: ${r.items.length} ${label} selected`); }
    S.second.ran[kind] = nowStamp();
    S.final = { polling: {}, pccp: {}, micro: {}, ran: {} };
    persist(); render();
    const bad = runAudit().filter(c => c.stage.startsWith('2nd') && !c.ok);
    toast(bad.length ? `Formed, but ${bad.length} rule check(s) failed — see Rule verification.` : `${label} formed. All rule checks passed.`, bad.length ? 'bad' : 'ok');
  });
};
ACT.previewSecond = kind => {
  if (kind === 'polling') openDoc(`2nd Appointment Letters — Polling Parties (${S.second.parties.length})`, S.second.parties.map(secondPartyLetterHtml).join(''));
  else { const list = S.second[kind]; openDoc(`2nd Appointment Letters — ${kind === 'pccp' ? 'PCCP' : 'Micro Observer'} (${list.length})`, list.map(x => secondSingleLetterHtml(x, kind)).join('')); }
};

/* =====================================================================
 * FINAL RANDOMISATION
 * ===================================================================== */
VIEWS.final = () => {
  const ready = !prereqs('final').length, locked = S.locks.final;
  const sub = UI.sub.final || 'polling';
  const F = S.final, ran = F.ran || {};
  const canRun = ready && !locked;
  const hasP = Object.keys(F.polling).length, hasC = Object.keys(F.pccp).length, hasM = Object.keys(F.micro).length;
  let body = '';
  if (sub === 'polling') {
    const reserve = S.second.parties.filter(p => !Object.values(F.polling).includes(p.partyNo));
    body = `<div class="btn-row" style="margin-bottom:10px"><button class="btn bad" data-act="runFinal" data-arg="polling" ${canRun ? '' : 'disabled'}>${hasP ? 'Re-run' : 'Run'} polling party → booth tagging</button>${ran.polling ? `<span class="small muted">Last run: ${esc(ran.polling)}</span>` : ''}</div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>Const.</th><th>Booth</th><th>Block</th><th>Location</th><th>Party</th><th>PrO</th><th>P1</th><th>P2</th><th>P3</th></tr></thead><tbody>
    ${S.booths.map(b => { const p = S.second.parties.find(x => x.partyNo === F.polling[b.id]); return `<tr><td>${esc(b.const)}</td><td class="pin">${esc(boothLabel(b))}</td><td><b>${esc(b.block)}</b></td><td>${esc(b.name)}</td><td><b>${p ? esc(p.partyNo) : '—'}</b></td>${p ? PARTY_ROLES.map(r => memberCell(p[r])).join('') : '<td colspan="4" class="muted">not tagged</td>'}</tr>`; }).join('')}
    </tbody></table></div>
    ${hasP ? `<h4 style="margin-top:14px">Reserve polling parties (${reserve.length})</h4><p class="small">${reserve.map(p => `<span class="badge b-warn">${esc(p.partyNo)}</span>`).join(' ') || '—'}</p>` : ''}`;
  } else if (sub === 'pccp' || sub === 'micro') {
    const kind = sub, tags = F[kind], list = S.second[kind], plan = singlePlan(kind), has = Object.keys(tags).length;
    const nm = kind === 'pccp' ? 'PCCP' : 'Micro Observer';
    const reserve = list.filter(x => !Object.values(tags).includes(x.orderNo));
    body = !plan.length ? `<div class="alert info">${nm} not required (0 in Setup).</div>` : `<div class="btn-row" style="margin-bottom:10px"><button class="btn bad" data-act="runFinal" data-arg="${kind}" ${canRun ? '' : 'disabled'}>${has ? 'Re-run' : 'Run'} ${nm} → booth tagging</button>${ran[kind] ? `<span class="small muted">Last run: ${esc(ran[kind])}</span>` : ''}</div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>Const.</th><th>Booth</th><th>Block</th><th>Location</th><th>Order no</th><th>Officer</th></tr></thead><tbody>
    ${S.booths.filter(b => plan.some(p => p.code === b.const)).map(b => { const x = list.find(i => i.orderNo === tags[b.id]); return `<tr><td>${esc(b.const)}</td><td class="pin">${esc(boothLabel(b))}</td><td><b>${esc(b.block)}</b></td><td>${esc(b.name)}</td><td>${x ? `<b>${esc(x.orderNo)}</b>` : '—'}</td>${x ? memberCell(x.pin) : '<td class="muted">not tagged</td>'}</tr>`; }).join('')}
    </tbody></table></div>
    ${has ? `<h4 style="margin-top:14px">Reserve ${nm} (${reserve.length})</h4><p class="small">${reserve.map(x => `<span class="badge b-warn">${esc(x.orderNo)}</span>`).join(' ') || '—'}</p>` : ''}`;
  } else body = auditHtml(runAudit(), ['Final']);
  return `
  <div class="card">
    <div class="card-head"><h2>Final Randomisation — booth tagging</h2><span class="spacer"></span>
    ${locked ? '<span class="badge b-ok">🔒 Locked</span><button class="btn sm" data-act="unlock" data-arg="final">Unlock</button>' : `<button class="btn ok" data-act="lock" data-arg="final" ${ready ? '' : 'disabled'}>Verify &amp; Lock final randomisation</button>`}</div>
    <p class="small muted">Randomly tags formed parties / PCCP / Micro Observers to booths of their constituency. A party is tagged to a booth only if <b>none of its 4 members</b> has that booth's block as home block or posting block (same for PCCP and MO). Untagged = Reserve. Re-running is allowed until locked.</p>
    <div class="btn-row"><button class="btn bad" data-act="runFinal" data-arg="all" ${canRun ? '' : 'disabled'}>Run all three taggings</button>
      <button class="btn" data-act="go" data-arg="reports">Final letters &amp; reports →</button></div>
  </div>
  <div class="card">
    <div class="subtabs">${[['polling', `Polling parties (${hasP}/${S.booths.length})`], ['pccp', `PCCP (${hasC})`], ['micro', `Micro Observers (${hasM})`], ['audit', 'Rule verification']].map(([k, l]) => `<button class="${sub === k ? 'active' : ''}" data-act="sub" data-arg="final:${k}">${esc(l)}</button>`).join('')}</div>
    ${body}
  </div>`;
};
ACT.runFinal = kind => {
  if (S.locks.final) return;
  const kinds = kind === 'all' ? ['polling', 'pccp', 'micro'] : [kind];
  const any = kinds.some(k => Object.keys(S.final[k]).length);
  if (any && !confirmBox('Re-run will replace the current booth tagging with a new random tagging. Continue?')) return;
  const pool = S.second.parties.map(p => officerByPin(p.PRO)).filter(Boolean);
  shuffleAnimation('Tagging to booths', pool, () => {
    kinds.forEach(k => {
      if (k === 'polling') { if (S.second.parties.length) S.final.polling = finalPolling(); }
      else if (singlePlan(k).length) S.final[k] = finalSingles(k);
      else S.final[k] = {};
      S.final.ran[k] = nowStamp();
    });
    addLog(`Final randomisation run: ${kinds.join(', ')}`);
    persist(); render();
    const bad = runAudit().filter(c => c.stage.startsWith('Final') && !c.ok);
    toast(bad.length ? `Tagged, but ${bad.length} rule check(s) failed.` : 'Booth tagging done. All rule checks passed.', bad.length ? 'bad' : 'ok');
  });
};

/* ---------------- shuffle animation ---------------- */
function shuffleAnimation(title, pool, done) {
  const m = openModal({ title, body: `<div class="shuffle-box"><div id="shText">Loading pool of ${pool.length}…</div><div class="bar"><div id="shBar"></div></div><div id="shRows"></div></div>` });
  let step = 0;
  const tick = () => {
    step += 10;
    const bar = $('#shBar'); if (bar) bar.style.width = step + '%';
    const t = $('#shText'); if (t) t.textContent = step < 40 ? `Shuffling ${pool.length} records…` : step < 80 ? 'Applying home-block / posting-block / office rules…' : 'Finalising…';
    const rows = $('#shRows'); if (rows) rows.innerHTML = shuffle(pool).slice(0, 6).map(o => `${esc(o.pin)}  ${esc(o.name)}  [${esc(o.postingBlock)}]`).join('<br>');
    if (step < 100) return setTimeout(tick, 90);
    m._close();
    try { done(); } catch (err) { console.error(err); showErrors('Randomisation could not be completed', String(err.message || err).split('\n')); }
  };
  setTimeout(tick, 60);
}
function showErrors(title, lines) {
  openModal({ title, plain: true, body: `<div class="alert bad"><ul>${lines.filter(Boolean).map(l => `<li>${esc(l.replace(/^•\s*/, ''))}</li>`).join('')}</ul></div>` });
}

/* =====================================================================
 * LOCK / UNLOCK
 * ===================================================================== */
ACT.lock = mod => {
  if (prereqs(mod).length) return toast('Prerequisite pending: ' + prereqs(mod).join(', '), 'bad');
  let v = { errors: [], warnings: [] };
  if (mod === 'setup') {
    S.constituencies = S.constituencies.filter(c => str(c.code) || str(c.name)).map(c => Object.assign(c, { code: str(c.code).toUpperCase(), name: str(c.name), pccp: intOr0(c.pccp), micro: intOr0(c.micro) }));
    v = validateSetup();
    const codes = new Set(S.constituencies.map(c => c.code));
    const orphan = S.booths.filter(b => !codes.has(b.const));
    if (orphan.length) v.errors.push(`${orphan.length} booth(s) refer to a constituency code that no longer exists (e.g. "${orphan[0].const}").`);
  }
  if (mod === 'training') v = validateTraining();
  if (mod === 'officers') v = validateOfficers();
  if (mod === 'booths') v = validateBooths();
  if (mod === 'second') {
    const e = [];
    if (!S.second.parties.length) e.push('Run the polling party randomisation.');
    if (singlePlan('pccp').length && !S.second.pccp.length) e.push('Run the PCCP randomisation.');
    if (singlePlan('micro').length && !S.second.micro.length) e.push('Run the Micro Observer randomisation.');
    runAudit().filter(c => c.stage.startsWith('2nd') && !c.ok).forEach(c => e.push(`Rule check failed: ${c.stage} — ${c.rule}`));
    v = { errors: e, warnings: [] };
  }
  if (mod === 'final') {
    const e = [];
    if (Object.keys(S.final.polling).length !== S.booths.length) e.push('Tag polling parties to all booths.');
    if (singlePlan('pccp').length && !Object.keys(S.final.pccp).length) e.push('Run PCCP booth tagging.');
    if (singlePlan('micro').length && !Object.keys(S.final.micro).length) e.push('Run Micro Observer booth tagging.');
    runAudit().filter(c => !c.ok).forEach(c => e.push(`Rule check failed: ${c.stage} — ${c.rule}`));
    v = { errors: e, warnings: [] };
  }
  if (v.errors.length) return showErrors(`Cannot lock — ${v.errors.length} problem(s)`, v.errors);
  if (v.warnings.length && !confirmBox(`${v.warnings.length} warning(s) found (e.g. ${v.warnings[0]}). Lock anyway?`)) return;
  if (mod === 'officers') S.officers.forEach(o => { if (!str(o.pin)) o.pin = nextPin(); });
  if (mod === 'setup' && (S.second.parties.length || S.locks.second)) {
    const bad = runAudit().filter(c => !c.ok);
    if (bad.length) {
      S.locks.second = false; S.locks.final = false;
      toast('Setup change makes the existing randomisation inconsistent (e.g. reserve % or required counts). 2nd and final randomisation were unlocked — please re-run them.', 'warn');
    }
  }
  S.locks[mod] = true;
  addLog(`Locked: ${mod}`);
  persist(); render();
  toast(`${MODULES.find(m => m.lock === mod).label} locked.`, 'ok');
};
ACT.unlock = mod => {
  const hasSecond = S.second.parties.length || S.second.pccp.length || S.second.micro.length;
  const hasFinal = Object.keys(S.final.polling).length || Object.keys(S.final.pccp).length || Object.keys(S.final.micro).length;
  if (mod === 'final') {
    const t = window.prompt('Final randomisation may already have been used for final letters.\nType UNLOCK to unlock it (the action is recorded in the audit log).');
    if (t !== 'UNLOCK') return;
  } else if ((mod === 'officers' || mod === 'booths') && (hasSecond || hasFinal)) {
    if (!confirmBox(`Unlocking ${mod} will DELETE the 2nd and final randomisation results (they depend on this data). Continue?`)) return;
    S.second = { parties: [], pccp: [], micro: [], ran: {} };
    S.final = { polling: {}, pccp: {}, micro: {}, ran: {} };
    S.locks.second = false; S.locks.final = false;
  } else if (mod === 'second') {
    if (S.locks.final) return toast('Unlock the final randomisation first.', 'bad');
    if (hasFinal && !confirmBox('Unlocking the 2nd randomisation will DELETE the final booth tagging. Continue?')) return;
    S.final = { polling: {}, pccp: {}, micro: {}, ran: {} };
  } else if (mod === 'training') {
    S.locks.letter1 = false;
  } else if (mod === 'setup' && hasSecond) {
    if (!confirmBox('Randomisation already exists. Text changes are fine, but changing constituencies, required counts or reserve % will make it inconsistent and force a re-run. Continue?')) return;
  }
  S.locks[mod] = false;
  addLog(`Unlocked: ${mod}`);
  persist(); render();
};
