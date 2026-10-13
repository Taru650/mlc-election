/* =====================================================================
 * Excel import / export (SheetJS, embedded — works offline)
 * One project workbook holds everything and can be re-opened anywhere.
 * ===================================================================== */
const SETUP_FIELDS = [
  ['electionTitle', 'Election title'], ['district', 'District'], ['distCode', 'District code'], ['place', 'Place on letters'],
  ['roCumDeo', 'Appointing authority (RO / DEO)'], ['authIssueTitle', 'Signing title (middle)'], ['authSubTitle', 'Signing authority (right)'],
  ['reservePct', 'Reserve %'], ['pollDate', 'Poll date (DD-MM-YYYY)'], ['pollFrom', 'Poll from (HH:MM)'], ['pollTo', 'Poll to (HH:MM)'],
  ['letterDate', 'Letter issue date (DD-MM-YYYY)'], ['reportVenue', 'Reporting venue (Micro Observers)'],
  ['matCollectVenue', 'Material collection venue'], ['matCollectDate', 'Material collection date (DD-MM-YYYY)'], ['matCollectTime', 'Material collection time (HH:MM)'],
  ['matDeposit', 'Material deposit centre'],
  ['ruleDistinctOffice', 'Rule: 4 party members from different offices (Yes/No)'], ['officeKeyMode', 'Rule: same office means (name / nameaddr)'],
  ['ruleDistinctPostingBlock', 'Rule: party members different posting blocks (Yes/No)'], ['ruleDistinctHomeBlock', 'Rule: party members different home blocks (Yes/No)'],
  ['outsideMarkers', 'Out-of-district block markers (codes / names, comma separated)'],
];
const DATE_FIELDS = new Set(['pollDate', 'letterDate', 'matCollectDate']);
const TIME_FIELDS = new Set(['pollFrom', 'pollTo', 'matCollectTime']);
const BOOL_FIELDS = new Set(['ruleDistinctOffice', 'ruleDistinctPostingBlock', 'ruleDistinctHomeBlock']);
const OFFICER_HEAD = ['PIN', 'Name', 'Designation', 'Office Code', 'Office Name', 'Office Address', 'Mobile', 'Duty', 'Home Block Code', 'Home Block', 'Posting Block Code', 'Posting Block', 'Account No', 'Bank', 'Branch', 'IFSC'];
const OFFICER_KEYS = ['pin', 'name', 'designation', 'officeCode', 'office', 'officeAddress', 'mobile', 'duty', 'homeBlockCode', 'homeBlock', 'postingBlockCode', 'postingBlock', 'acNo', 'bank', 'branch', 'ifsc'];
const OFFICER_WIDTHS = [12, 24, 22, 12, 28, 26, 13, 24, 12, 16, 12, 16, 16, 14, 14, 13];
const BOOTH_HEAD = ['Constituency', 'Booth No', 'Main/Aux', 'Location / Building', 'Block Code', 'Block'];

function yes(v) { const s = str(v).toLowerCase(); return s === 'yes' || s === 'y' || s === 'true' || s === '1'; }
function hk(h) { return str(h).toLowerCase().replace(/[^a-z0-9]/g, ''); }

/* ---------- workbook helpers ---------- */
function sheetFromRows(head, rows, widths) {
  const ws = XLSX.utils.aoa_to_sheet([head, ...rows.map(r => r.map(v => (v == null ? '' : v)))]);
  ws['!cols'] = (widths || head.map(h => Math.max(10, String(h).length + 2))).map(w => ({ wch: w }));
  return ws;
}
function addSheet(wb, name, head, rows, widths) { XLSX.utils.book_append_sheet(wb, sheetFromRows(head, rows, widths), name); }
function saveWb(wb, name) {
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
}
async function readWorkbookFile(file) {
  const ab = await readFileAs(file, 'buffer');
  return XLSX.read(new Uint8Array(ab), { type: 'array' });
}
function findSheet(wb, ...names) {
  const want = names.map(hk);
  const n = wb.SheetNames.find(s => want.includes(hk(s)));
  return n ? wb.Sheets[n] : null;
}
/** Returns array of objects keyed by normalised header. */
function sheetObjects(ws) {
  if (!ws) return [];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
  if (!aoa.length) return [];
  let hIdx = 0;
  while (hIdx < Math.min(aoa.length, 10) && aoa[hIdx].filter(x => str(x)).length < 2) hIdx++;
  const head = (aoa[hIdx] || []).map(hk);
  return aoa.slice(hIdx + 1).filter(r => r.some(x => str(x) !== '')).map(r => { const o = {}; head.forEach((h, i) => { if (h && !(h in o)) o[h] = r[i]; }); o.__raw = r; return o; });
}
function readme(lines) { const ws = XLSX.utils.aoa_to_sheet(lines.map(l => [l])); ws['!cols'] = [{ wch: 120 }]; return ws; }

/* ---------- column mapping (tolerant of many header spellings) ---------- */
const OFFICER_MAP = [
  ['officeCode', ['officecode', 'officeid', 'officecodeno', 'officeno', 'officecodenumber']],
  ['homeBlockCode', ['homeblockcode', 'homeblockcensuscode', 'nativeblockcode', 'homecode']],
  ['postingBlockCode', ['postingblockcode', 'postingblockcensuscode', 'workingblockcode', 'officeblockcode', 'blockcode', 'blockcensuscode']],
  ['pin', ['pin', 'pinno', 'pinnumber', 'employeeid', 'empid', 'empcode', 'employeecode', 'hrmsid', 'hrmsno']],
  ['name', ['name', 'officername', 'employeename', 'nameofofficer', 'nameofemployee', 'fullname', 'staffname', 'nameofthestaff']],
  ['designation', ['designation', 'desig', 'post']],
  ['office', ['officename', 'office', 'officedetail', 'officedetails', 'nameofoffice', 'department', 'institution']],
  ['officeAddress', ['officeaddress', 'address', 'officeaddr']],
  ['mobile', ['mobile', 'mobileno', 'mobilenumber', 'contact', 'contactno', 'contactnumber', 'phone', 'phoneno']],
  ['duty', ['duty', 'dutyrole', 'role', 'dutytype', 'category']],
  ['homeBlock', ['homeblock', 'nativeblock', 'residenceblock', 'homeblockname', 'permanentblock', 'hometownblock']],
  ['postingBlock', ['postingblock', 'workingblock', 'officeblock', 'postingblockname', 'block', 'blockname']],
  ['acNo', ['accountno', 'accountnumber', 'acno', 'bankaccount', 'bankaccountno', 'bankacno', 'accno']],
  ['bank', ['bank', 'bankname']],
  ['branch', ['branch', 'branchname', 'bankbranch']],
  ['ifsc', ['ifsc', 'ifsccode']],
  ['accountdetails', ['accountdetails', 'bankdetails']],
];
function mapHeaderKey(h, map) {
  for (const [k, list] of map) if (list.includes(h)) return k;
  return null;
}
function officerFromObj(r) {
  const o = blankOfficer(); let acct = '';
  Object.keys(r).forEach(h => {
    if (h === '__raw') return;
    let k = mapHeaderKey(h, OFFICER_MAP);
    if (!k && h.includes('code')) {
      if (h.includes('home') && h.includes('block')) k = 'homeBlockCode';
      else if (h.includes('block')) k = 'postingBlockCode';
      else if (h.includes('office')) k = 'officeCode';
    }
    if (!k) {
      if (h.includes('home') && h.includes('block')) k = 'homeBlock';
      else if (h.includes('posting') || (h.includes('work') && h.includes('block'))) k = 'postingBlock';
      else if (h.includes('mobile') || h.includes('phone')) k = 'mobile';
      else if (h.includes('ifsc')) k = 'ifsc';
      else if (h.includes('designation')) k = 'designation';
      else if (h.includes('address')) k = 'officeAddress';
    }
    if (!k) return;
    if (k === 'accountdetails') { acct = str(r[h]); return; }
    if (!o[k]) o[k] = str(r[h]);
  });
  if (acct) {
    const g = re => (acct.match(re) || [])[1] || '';
    if (!o.acNo) o.acNo = str(g(/(?:A\/?c\s*No|Account(?:\s*Number|\s*No))\s*[:\-]?\s*([^|,;]+)/i));
    if (!o.bank) o.bank = str(g(/Bank(?:\s*Name)?\s*[:\-]?\s*([^|,;]+)/i));
    if (!o.branch) o.branch = str(g(/Branch\s*[:\-]?\s*([^|,;]+)/i));
    if (!o.ifsc) o.ifsc = str(g(/IFSC\s*[:\-]?\s*([^|,;]+)/i));
  }
  o.duty = normalizeDuty(o.duty) || o.duty;
  o.mobile = o.mobile.replace(/\.0$/, '');
  ['officeCode', 'homeBlockCode', 'postingBlockCode'].forEach(k => { o[k] = o[k].replace(/\.0$/, ''); });
  return o;
}
const BOOTH_MAP = [
  ['no', ['boothno', 'booth', 'boothnumber', 'psno', 'pollingstationno', 'pollingstationnumber', 'no', 'boothnum', 'sno']],
  ['name', ['location', 'boothlocation', 'boothloacation', 'boothname', 'pollingstationname', 'pollingstation', 'building', 'buildingname', 'locationbuilding', 'locationbuildingname', 'name', 'psname']],
  ['ext', ['ext', 'mainaux', 'boothtype', 'mainauxiliary', 'auxiliary']],
  ['blockCode', ['blockcode', 'boothblockcode', 'blockcensuscode', 'censusblockcode', 'censuscode']],
  ['block', ['block', 'boothblock', 'blockname', 'prakhand']],
  ['const', ['constituency', 'const', 'constcode', 'constituencycode', 'constituencytype', 'constituencyname']],
  ['type', ['type']],
];
function resolveConst(v) {
  const s = str(v); if (!s) return '';
  const up = s.toUpperCase();
  let c = S.constituencies.find(x => x.code === up) || S.constituencies.find(x => str(x.name).toUpperCase() === up);
  if (c) return c.code;
  if (/TEACH/.test(up)) c = S.constituencies.find(x => /TEACH/i.test(x.name)) || S.constituencies.find(x => x.code === 'TC');
  else if (/GRAD/.test(up)) c = S.constituencies.find(x => /GRAD/i.test(x.name)) || S.constituencies.find(x => x.code === 'GC');
  return c ? c.code : up;
}
function boothFromObj(r) {
  const b = blankBooth(); b.id = newBoothId(); b.ext = ''; // filled from the sheet; defaults to Main below
  let typeVal = '';
  Object.keys(r).forEach(h => {
    if (h === '__raw') return;
    const k = mapHeaderKey(h, BOOTH_MAP);
    if (!k) return;
    if (k === 'type') { typeVal = str(r[h]); return; }
    if (!b[k]) b[k] = str(r[h]);
  });
  if (typeVal) { if (/^(main|aux)/i.test(typeVal)) { if (!b.ext) b.ext = typeVal; } else if (!b.const) b.const = typeVal; }
  b.no = b.no.replace(/\.0$/, '');
  b.blockCode = b.blockCode.replace(/\.0$/, '');
  b.ext = /aux/i.test(b.ext) ? 'Aux' : 'Main';
  b.const = resolveConst(b.const);
  return b;
}

/* ---------- builders for each data block ---------- */
function setupRows() {
  return SETUP_FIELDS.map(([k, l]) => {
    let v = S.setup[k];
    if (DATE_FIELDS.has(k)) v = fmtDate(v);
    if (BOOL_FIELDS.has(k)) v = v ? 'Yes' : 'No';
    return [k, l, v == null ? '' : v];
  });
}
function applySetupRows(objs) {
  const st = Object.assign({}, S.setup);
  objs.forEach(r => {
    const key = str(r.key), label = hk(r.field);
    const f = SETUP_FIELDS.find(([k, l]) => k === key || hk(l) === label);
    if (!f) return;
    const k = f[0]; let v = r.value;
    if (DATE_FIELDS.has(k)) v = parseDateAny(v);
    else if (TIME_FIELDS.has(k)) v = parseTimeAny(v);
    else if (BOOL_FIELDS.has(k)) v = yes(v);
    else if (k === 'reservePct') v = Math.max(0, Number(v) || 0);
    else if (k === 'officeKeyMode') v = /addr/i.test(str(v)) ? 'nameaddr' : 'name';
    else v = str(v);
    st[k] = v;
  });
  return st;
}
function constRows() { return S.constituencies.map(c => [c.code, c.name, intOr0(c.pccp), intOr0(c.micro)]); }
function parseConstRows(objs) {
  return objs.map(r => ({ code: str(r.code).toUpperCase(), name: str(r.name), pccp: intOr0(r.pccprequired ?? r.pccp), micro: intOr0(r.microobserversrequired ?? r.microrequired ?? r.micro) })).filter(c => c.code || c.name);
}
function trainingRows() {
  const rows = [];
  DUTIES.forEach(d => (S.training[d.label] || []).forEach((t, i) => rows.push([d.label, i + 1, fmtDate(t.date), t.start, t.end, t.venue])));
  return rows;
}
function parseTrainingRows(objs) {
  const tr = emptyTraining();
  objs.forEach(r => {
    const duty = normalizeDuty(r.duty) || str(r.duty).toUpperCase();
    const n = parseInt(str(r.training || r.trainingno).replace(/\D/g, ''), 10);
    if (!tr[duty] || !(n >= 1 && n <= TRAINING_COUNT)) return;
    tr[duty][n - 1] = { date: parseDateAny(r.date || r.dateddmmyyyy), start: parseTimeAny(r.start || r.starthhmm), end: parseTimeAny(r.end || r.endhhmm), venue: str(r.venue) };
  });
  return tr;
}
function officerRows(list = S.officers) { return list.map(o => OFFICER_KEYS.map(k => o[k])); }
function boothRows() { return S.booths.map(b => [b.const, b.no, b.ext, b.name, b.blockCode, b.block]); }

const README_LINES = [
  'MLC Polling Personnel Randomisation — project workbook',
  'This file can be re-opened in the tool with "Open Project (.xlsx)" on any computer. No internet or server is needed.',
  '',
  'Sheets you may edit in Excel before opening: Setup, Constituencies, Training, Officers, Booths.',
  'Do NOT hand-edit Second_* / Final_* sheets: they are re-verified on opening and rejected if any rule is broken.',
  '',
  'Officers — Duty must be one of: PRESIDING OFFICER, POLLING OFFICER-1, POLLING OFFICER-2, POLLING OFFICER-3, PATROLLING MAGISTRATE, MICRO OBSERVER',
  '          (short forms PrO, P1, P2, P3, PCCP, MO are also accepted).',
  'Officers — Home Block (Code) and Posting Block (Code) are used for exclusion: nobody is tagged to a booth in his/her home or posting block. When both officer and booth have a block code (e.g. census code), the code decides.',
  'Officers — Office Code (or Office Name if no code) is used for the rule that the 4 members of a party must be from different offices. Codes protect against spelling mistakes in names.',
  'Booths   — Constituency must be one of the codes in the Constituencies sheet (e.g. TC, GC). Block name or Block Code is mandatory (Block Code recommended).',
  'Dates    — DD-MM-YYYY.  Times — HH:MM (24 hour).',
];

/* ---------- exemptions ---------- */
const EXEMPT_HEAD = ['PIN', 'Name', 'Duty', 'Category', 'Reason', 'Order Ref', 'Date', 'Recorded At'];
function exemptRows() { return Object.entries(S.exempt).map(([pin, e]) => { const o = officerByPin(pin) || {}; return [pin, o.name || '', o.duty || '', e.category, e.reason, e.orderRef || '', fmtDate(e.date), e.at || '']; }); }
ACT.exportExempted = () => {
  const wb = XLSX.utils.book_new();
  const rows = Object.entries(S.exempt).map(([pin, e]) => { const o = officerByPin(pin) || {}; return [pin, o.name, o.designation, o.office, o.duty, o.mobile, e.category, e.reason, e.orderRef || '', fmtDate(e.date), e.at || '']; });
  addSheet(wb, 'Exempted_Officers', ['PIN', 'Name', 'Designation', 'Office', 'Duty', 'Mobile', 'Category', 'Reason', 'Order Ref', 'Date', 'Recorded At'], rows, [12, 24, 22, 28, 22, 13, 16, 50, 26, 12, 20]);
  saveWb(wb, `Exempted_Officers_${safeName(S.setup.district)}.xlsx`);
};

/* ---------- full project ---------- */
function buildProjectWorkbook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, readme(README_LINES), 'README');
  addSheet(wb, 'Setup', ['Key', 'Field', 'Value'], setupRows(), [24, 52, 70]);
  addSheet(wb, 'Constituencies', ['Code', 'Name', 'PCCP Required', 'Micro Observers Required'], constRows(), [10, 34, 16, 24]);
  addSheet(wb, 'Training', ['Duty', 'Training', 'Date', 'Start', 'End', 'Venue'], trainingRows(), [24, 10, 13, 8, 8, 40]);
  addSheet(wb, 'Officers', OFFICER_HEAD, officerRows(), OFFICER_WIDTHS);
  addSheet(wb, 'Booths', BOOTH_HEAD, boothRows(), [13, 10, 10, 44, 12, 18]);
  const nm = pin => (officerByPin(pin) || {}).name || '';
  addSheet(wb, 'Second_Parties', ['Party No', 'Constituency', 'PrO PIN', 'PrO Name', 'P1 PIN', 'P1 Name', 'P2 PIN', 'P2 Name', 'P3 PIN', 'P3 Name'],
    S.second.parties.map(p => [p.partyNo, p.const, p.PRO, nm(p.PRO), p.P1, nm(p.P1), p.P2, nm(p.P2), p.P3, nm(p.P3)]));
  addSheet(wb, 'Second_PCCP', ['Order No', 'Constituency', 'PIN', 'Name'], S.second.pccp.map(x => [x.orderNo, x.const, x.pin, nm(x.pin)]));
  addSheet(wb, 'Second_Micro', ['Order No', 'Constituency', 'PIN', 'Name'], S.second.micro.map(x => [x.orderNo, x.const, x.pin, nm(x.pin)]));
  const fRows = kind => Object.entries(S.final[kind]).map(([bid, ref]) => { const b = boothById(bid); return b ? [b.const, b.no, b.block, ref] : null; }).filter(Boolean);
  addSheet(wb, 'Final_Polling', ['Constituency', 'Booth No', 'Block', 'Party No'], fRows('polling'));
  addSheet(wb, 'Final_PCCP', ['Constituency', 'Booth No', 'Block', 'Order No'], fRows('pccp'));
  addSheet(wb, 'Final_Micro', ['Constituency', 'Booth No', 'Block', 'Order No'], fRows('micro'));
  const status = [['App', 'MLC_POLLING_TOOL'], ['Tool version', APP_VERSION], ['Saved at', nowStamp()]];
  Object.entries(S.locks).forEach(([k, v]) => status.push(['lock.' + k, v ? 'Yes' : 'No']));
  ['second', 'final'].forEach(stg => PART_KINDS.forEach(k => status.push([`part.${stg}.${k}`, S.parts[stg][k] ? 'Yes' : 'No'])));
  ['second', 'final'].forEach(s => Object.entries(S[s].ran || {}).forEach(([k, v]) => status.push([`ran.${s}.${k}`, v])));
  addSheet(wb, 'Status', ['Key', 'Value'], status, [24, 30]);
  if (S.setup.signature) {
    const chunks = S.setup.signature.match(/.{1,30000}/g) || [];
    addSheet(wb, 'Signature', ['Part', 'Data'], chunks.map((c, i) => [i + 1, c]), [6, 80]);
  }
  addSheet(wb, 'Exemptions', EXEMPT_HEAD, exemptRows(), [12, 24, 22, 16, 50, 26, 12, 20]);
  addSheet(wb, 'Constituency_Fixed', ['PIN', 'Constituency'], Object.entries(S.constFix), [12, 14]);
  addSheet(wb, 'Audit_Log', ['Time', 'Action'], S.log.map(l => [l.time, l.action]), [20, 100]);
  return wb;
}
ACT.saveProject = () => {
  addLog('Project saved to Excel');
  persist();
  saveWb(buildProjectWorkbook(), `MLC_Project_${safeName(S.setup.district)}_${fileStamp()}.xlsx`);
  toast('Project saved as Excel. Keep this file safe — it can be opened on any computer.', 'ok');
};

/** Parses a project workbook into a fresh state object. Throws if the file is not usable. */
function parseProjectWorkbook(wb) {
  const st = defaultState();
  const has = n => !!findSheet(wb, n);
  if (!has('Setup') && !has('Officers') && !has('Booths')) throw new Error('This is not a project workbook (no Setup / Officers / Booths sheet).');
  const prevS = S; S = st; // helpers below read from S
  try {
    if (has('Setup')) st.setup = applySetupRows(sheetObjects(findSheet(wb, 'Setup')));
    if (has('Constituencies')) st.constituencies = parseConstRows(sheetObjects(findSheet(wb, 'Constituencies')));
    if (has('Training')) st.training = parseTrainingRows(sheetObjects(findSheet(wb, 'Training')));
    if (has('Officers')) st.officers = sheetObjects(findSheet(wb, 'Officers')).map(officerFromObj);
    if (has('Booths')) st.booths = sheetObjects(findSheet(wb, 'Booths')).map(boothFromObj);
    invalidateIndexes();
    const sp = sheetObjects(findSheet(wb, 'Second_Parties'));
    st.second.parties = sp.map(r => ({ partyNo: str(r.partyno), const: str(r.constituency).toUpperCase(), PRO: str(r.propin), P1: str(r.p1pin), P2: str(r.p2pin), P3: str(r.p3pin) })).filter(p => p.partyNo);
    st.second.pccp = sheetObjects(findSheet(wb, 'Second_PCCP')).map(r => ({ orderNo: str(r.orderno), const: str(r.constituency).toUpperCase(), pin: str(r.pin) })).filter(x => x.orderNo);
    st.second.micro = sheetObjects(findSheet(wb, 'Second_Micro')).map(r => ({ orderNo: str(r.orderno), const: str(r.constituency).toUpperCase(), pin: str(r.pin) })).filter(x => x.orderNo);
    const bKey = new Map(st.booths.map(b => [b.const + '|' + str(b.no).toUpperCase(), b.id]));
    [['polling', 'Final_Polling', 'partyno'], ['pccp', 'Final_PCCP', 'orderno'], ['micro', 'Final_Micro', 'orderno']].forEach(([k, sh, col]) => {
      sheetObjects(findSheet(wb, sh)).forEach(r => { const id = bKey.get(str(r.constituency).toUpperCase() + '|' + str(r.boothno).replace(/\.0$/, '').toUpperCase()); if (id && str(r[col])) st.final[k][id] = str(r[col]); });
    });
    let sawParts = false;
    sheetObjects(findSheet(wb, 'Status')).forEach(r => {
      const k = str(r.key), v = r.value;
      if (k.startsWith('lock.') && k.slice(5) in st.locks) st.locks[k.slice(5)] = yes(v);
      const m = k.match(/^ran\.(second|final)\.(\w+)$/); if (m) st[m[1]].ran[m[2]] = str(v);
      const pm = k.match(/^part\.(second|final)\.(polling|pccp|micro)$/); if (pm) { sawParts = true; st.parts[pm[1]][pm[2]] = yes(v); }
    });
    if (!sawParts) st.parts = null; // older file: hydrate() derives part locks from the whole-stage locks
    const sig = sheetObjects(findSheet(wb, 'Signature')).sort((a, b) => Number(a.part) - Number(b.part)).map(r => str(r.data)).join('');
    if (sig.startsWith('data:image/')) st.setup.signature = sig;
    sheetObjects(findSheet(wb, 'Constituency_Fixed')).forEach(r => { const pin = str(r.pin).replace(/\.0$/, ''); if (pin && str(r.constituency)) st.constFix[pin] = str(r.constituency).toUpperCase(); });
    sheetObjects(findSheet(wb, 'Exemptions')).forEach(r => { const pin = str(r.pin).replace(/\.0$/, ''); if (pin && str(r.reason)) st.exempt[pin] = { category: str(r.category) || 'Other', reason: str(r.reason), orderRef: str(r.orderref), date: parseDateAny(r.date), at: str(r.recordedat) }; });
    st.log = sheetObjects(findSheet(wb, 'Audit_Log')).map(r => ({ time: str(r.time), action: str(r.action) })).filter(l => l.action);
  } finally { S = prevS; }
  return st;
}
ACT.openProject = async () => {
  const f = await pickFile('.xlsx,.xls'); if (!f) return;
  let st;
  try { st = parseProjectWorkbook(await readWorkbookFile(f)); } catch (e) { return showErrors('Cannot open project', [e.message || String(e)]); }
  const hasData = S.officers.length || S.booths.length || str(S.setup.electionTitle);
  if (hasData && !confirmBox(`Replace the data currently in this browser with "${f.name}"?`)) return;
  S = hydrate(st); invalidateIndexes();
  const msgs = [];
  const bad = runAudit().filter(c => !c.ok);
  if (bad.length) {
    // discard only the parts whose results fail verification; the other parts stay as saved
    const kindOf = stage => PART_KINDS.find(k => stage.endsWith(PART_STAGE_TAG[k]));
    const dropped = new Set();
    bad.forEach(c => {
      const kinds = c.stage === '2nd – All' ? PART_KINDS : [kindOf(c.stage)].filter(Boolean);
      kinds.forEach(k => {
        if (c.stage.startsWith('2nd')) { if (k === 'polling') S.second.parties = []; else S.second[k] = []; S.parts.second[k] = false; }
        S.final[k] = {}; S.parts.final[k] = false; dropped.add(PART_NAME[k]);
      });
    });
    if (dropped.size) msgs.push(`Randomisation results for ${[...dropped].join(', ')} failed rule verification (${bad.map(c => c.rule).join('; ')}) and were discarded. Please re-run those parts.`);
  }
  if (S.locks.officers && validateOfficers().errors.length) { S.locks.officers = false; msgs.push('Officers sheet has errors — Officers unlocked for correction.'); }
  if (S.locks.booths && validateBooths().errors.length) { S.locks.booths = false; msgs.push('Booths sheet has errors — Booths unlocked for correction.'); }
  if (S.locks.setup && validateSetup().errors.length) { S.locks.setup = false; msgs.push('Setup has errors — Setup unlocked for correction.'); }
  addLog(`Project opened from file ${f.name}`);
  persist(); UI.view = 'home'; render();
  if (msgs.length) showErrors('Project opened with corrections', msgs); else toast(`Opened ${f.name}: ${S.officers.length} officers, ${S.booths.length} booths.`, 'ok');
};

/* ---------- configuration only (setup + constituencies + training) ---------- */
ACT.exportConfigExcel = () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, readme(['MLC tool — configuration file (Setup, Constituencies, Training).', 'Edit in Excel if needed and import back with "Import Configuration Excel".', 'Dates DD-MM-YYYY, times HH:MM.']), 'README');
  addSheet(wb, 'Setup', ['Key', 'Field', 'Value'], setupRows(), [24, 52, 70]);
  addSheet(wb, 'Constituencies', ['Code', 'Name', 'PCCP Required', 'Micro Observers Required'], constRows(), [10, 34, 16, 24]);
  addSheet(wb, 'Training', ['Duty', 'Training', 'Date', 'Start', 'End', 'Venue'], trainingRows(), [24, 10, 13, 8, 8, 40]);
  saveWb(wb, `MLC_Configuration_${safeName(S.setup.district)}.xlsx`);
};
ACT.importConfigExcel = async () => {
  const f = await pickFile('.xlsx,.xls'); if (!f) return;
  const wb = await readWorkbookFile(f);
  const done = [], skipped = [];
  if (findSheet(wb, 'Setup') || findSheet(wb, 'Constituencies')) {
    if (S.locks.setup) skipped.push('Setup (locked)');
    else {
      if (findSheet(wb, 'Setup')) { const sig = S.setup.signature; S.setup = applySetupRows(sheetObjects(findSheet(wb, 'Setup'))); if (!S.setup.signature) S.setup.signature = sig; done.push('Setup'); }
      if (findSheet(wb, 'Constituencies')) { const c = parseConstRows(sheetObjects(findSheet(wb, 'Constituencies'))); if (c.length) { S.constituencies = c; done.push('Constituencies'); } }
    }
  }
  if (findSheet(wb, 'Training')) { if (S.locks.training) skipped.push('Training (locked)'); else { S.training = parseTrainingRows(sheetObjects(findSheet(wb, 'Training'))); done.push('Training'); } }
  if (!done.length && !skipped.length) return toast('No Setup / Constituencies / Training sheet found in this file.', 'bad');
  addLog(`Configuration imported from ${f.name}: ${done.join(', ')}`);
  persist(); render();
  toast(`Imported: ${done.join(', ') || 'nothing'}${skipped.length ? '\nSkipped: ' + skipped.join(', ') + ' — unlock first' : ''}`, done.length ? 'ok' : 'warn');
};

/* ---------- legacy JSON (from the earlier tool) ---------- */
function applyLegacyTraining(schedules) {
  let n = 0;
  DUTIES.forEach(d => {
    const arr = schedules && schedules[d.label];
    if (Array.isArray(arr)) { S.training[d.label] = Array.from({ length: TRAINING_COUNT }, (_, i) => ({ date: parseDateAny(arr[i]?.date), start: parseTimeAny(arr[i]?.start), end: parseTimeAny(arr[i]?.end), venue: str(arr[i]?.venue) })); n++; }
  });
  return n;
}
ACT.importLegacySetup = async () => {
  const f = await pickFile('.json'); if (!f) return;
  let j; try { j = JSON.parse(await readFileAs(f, 'text')); } catch (e) { return toast('Not a valid JSON file.', 'bad'); }
  if (!j || (!j.district && !j.electionTitle && !j.distCode)) return toast('This does not look like a Setup JSON.', 'bad');
  const st = S.setup;
  ['electionTitle', 'district', 'distCode', 'roCumDeo', 'reportVenue', 'matCollectVenue', 'matCollectTime', 'matDeposit', 'authIssueTitle', 'authSubTitle', 'pollFrom', 'pollTo'].forEach(k => { if (j[k] != null) st[k] = str(j[k]); });
  ['pollDate', 'letterDate', 'matCollectDate'].forEach(k => { if (j[k]) st[k] = parseDateAny(j[k]); });
  if (j.reservePct != null) st.reservePct = Number(j.reservePct) || 0;
  const cons = [];
  [['TC', j.tc], ['GC', j.gc]].forEach(([code, c]) => { if (c && (c.name || c.booths)) cons.push({ code, name: str(c.name), pccp: intOr0(c.pccp), micro: intOr0(c.micro) }); });
  if (cons.length) S.constituencies = cons;
  let tmsg = '';
  if (j.trainingSchedules && !S.locks.training) { const n = applyLegacyTraining(j.trainingSchedules); if (n) tmsg = ` and training for ${n} duties`; }
  addLog(`Legacy Setup JSON imported from ${f.name}`);
  persist(); render();
  const bc = [j.tc, j.gc].filter(Boolean).map(c => intOr0(c.booths)).reduce((a, b) => a + b, 0);
  toast(`Setup imported${tmsg}. Review and Save & Lock.${bc ? `\nNote: booth counts (${bc}) are not taken from setup — enter booths in Booth Entry.` : ''}`, 'ok');
};
ACT.importLegacyTraining = async () => {
  const f = await pickFile('.json'); if (!f) return;
  let j; try { j = JSON.parse(await readFileAs(f, 'text')); } catch (e) { return toast('Not a valid JSON file.', 'bad'); }
  const n = applyLegacyTraining((j && j.trainingSchedules) || j);
  if (!n) return toast('No duty-wise training schedules found in this file.', 'bad');
  addLog(`Legacy Training JSON imported from ${f.name}`);
  persist(); render(); toast(`Training imported for ${n} duties. Review and Save & Lock.`, 'ok');
};

/* ---------- officers ---------- */
ACT.officerTemplate = () => {
  const wb = XLSX.utils.book_new();
  addSheet(wb, 'Officers', OFFICER_HEAD, [
    ['', 'RAMESH KUMAR', 'Headmaster', '10231', 'Middle School Piprahi', 'Piprahi', '9000000001', 'PRESIDING OFFICER', '0101', 'Sheohar', '0102', 'Piprahi', '1234567890', 'SBI', 'Sheohar', 'SBIN0000001'],
    ['', 'SUNITA DEVI', 'Teacher', '10458', 'High School Tariyani', 'Tariyani', '9000000002', 'POLLING OFFICER-1', '0105', 'Tariyani', '0105', 'Tariyani', '', '', '', ''],
    ['', 'MANOJ SINGH', 'Branch Manager', '20017', 'State Bank of India, Sheohar', 'Sheohar', '9000000003', 'MICRO OBSERVER', '999999', 'Others', '0101', 'Sheohar', '', '', '', ''],
  ], OFFICER_WIDTHS);
  XLSX.utils.book_append_sheet(wb, readme([
    'OFFICERS — one row per officer. Delete the three example rows before use.',
    '',
    'PIN                 — unique. Leave blank to auto-generate (district code + serial).',
    'Name, Designation   — as printed on letters.',
    'Office Code         — recommended. Same code = same office (spelling of Office Name then does not matter). Used for: 4 party members from 4 different offices.',
    'Office Name / Address, Mobile — printed on letters and registers. Mobile 10 digits.',
    'Duty                — PRESIDING OFFICER, POLLING OFFICER-1, POLLING OFFICER-2, POLLING OFFICER-3, PATROLLING MAGISTRATE, MICRO OBSERVER',
    '                      (short forms PrO, P1, P2, P3, PCCP, MO also accepted).',
    'Home Block Code / Home Block       — block where the officer lives.',
    'Posting Block Code / Posting Block — block where the officer works.',
    '                      Nobody is tagged to a booth in his/her home or posting block. When the officer and the booth both have a block code (e.g. 2011 census code), the code decides.',
    '                      Name or code is enough; both are better. Leading zeros may be lost in Excel (0101 → 101) — this does not matter.',
    'OUT OF DISTRICT     — if the home or posting block is outside the district, write code 999999 (or name "Others").',
    '                      Such a block excludes no booth (the officer can go to any block except an in-district one he/she belongs to).',
    'Account No, Bank, Branch, IFSC — optional; printed on training attendance sheets.',
  ]), 'Instructions');
  saveWb(wb, 'Officers_Template.xlsx');
};
ACT.importOfficers = async mode => {
  const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return;
  const wb = await readWorkbookFile(f);
  const ws = findSheet(wb, 'Officers') || wb.Sheets[wb.SheetNames[0]];
  const list = sheetObjects(ws).map(officerFromObj).filter(o => o.name || o.pin);
  if (!list.length) return toast('No officer rows found. Use the template headers.', 'bad');
  if (mode === 'replace' && S.officers.length && !confirmBox(`Replace ${S.officers.length} existing officers with ${list.length} from the file?`)) return;
  if (mode === 'replace') S.officers = [];
  invalidateIndexes();
  list.forEach(o => { if (!o.pin) o.pin = nextPin(); S.officers.push(o); });
  addLog(`${list.length} officers imported (${mode}) from ${f.name}`);
  persist(); UI.officerPage = 1; render();
  const v = validateOfficers();
  toast(`${list.length} officers imported. ${v.errors.length} error(s), ${v.warnings.length} warning(s).`, v.errors.length ? 'warn' : 'ok');
};
ACT.exportOfficers = () => { const wb = XLSX.utils.book_new(); addSheet(wb, 'Officers', OFFICER_HEAD, officerRows(), OFFICER_WIDTHS); saveWb(wb, `Officers_${safeName(S.setup.district)}.xlsx`); };

/* ---------- booths ---------- */
ACT.boothTemplate = () => {
  const wb = XLSX.utils.book_new();
  const c1 = (S.constituencies[0] || {}).code || 'TC', c2 = (S.constituencies[1] || {}).code || 'GC';
  addSheet(wb, 'Booths', BOOTH_HEAD, [[c1, '1', 'Main', 'Upgraded High School, Room 1', '0102', 'Piprahi'], [c1, '1A', 'Aux', 'Upgraded High School, Room 2', '0102', 'Piprahi'], [c2, '1', 'Main', 'Block Office Hall', '0105', 'Tariyani']], [13, 10, 10, 44, 12, 18]);
  XLSX.utils.book_append_sheet(wb, readme([
    'BOOTHS — one row per polling station. Delete the example rows before use.',
    '',
    'Constituency        — a code from Setup (' + S.constituencies.map(c => c.code).join(', ') + '), or a name containing "Teachers" / "Graduates".',
    'Booth No            — e.g. 12 or 12A; unique within the constituency.',
    'Main/Aux            — Main or Aux.',
    'Location / Building — printed on the final letter.',
    'Block Code / Block  — mandatory (name or code). Officers whose home or posting block is this block are never tagged to this booth.',
    '                      Block Code (e.g. 2011 census code) is recommended — it must be the same code used in the Officers sheet.',
    '                      A booth must never use the out-of-district code 999999 / "Others".',
  ]), 'Instructions');
  saveWb(wb, 'Booths_Template.xlsx');
};
ACT.importBooths = async mode => {
  const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return;
  const wb = await readWorkbookFile(f);
  const ws = findSheet(wb, 'Booths') || wb.Sheets[wb.SheetNames[0]];
  const list = sheetObjects(ws).map(boothFromObj).filter(b => b.no || b.name);
  if (!list.length) return toast('No booth rows found. Use the template headers.', 'bad');
  if (mode === 'replace' && S.booths.length && !confirmBox(`Replace ${S.booths.length} existing booths with ${list.length} from the file?`)) return;
  if (mode === 'replace') S.booths = [];
  S.booths.push(...list);
  addLog(`${list.length} booths imported (${mode}) from ${f.name}`);
  persist(); render();
  const v = validateBooths();
  toast(`${list.length} booths imported. ${v.errors.length} error(s), ${v.warnings.length} warning(s).`, v.errors.length ? 'warn' : 'ok');
};
ACT.exportBooths = () => { const wb = XLSX.utils.book_new(); addSheet(wb, 'Booths', BOOTH_HEAD, boothRows(), [13, 10, 10, 44, 12, 18]); saveWb(wb, `Booths_${safeName(S.setup.district)}.xlsx`); };

/* ---------- letters / results ---------- */
ACT.exportLetter1 = () => {
  const head = OFFICER_HEAD.slice(0, 9);
  for (let i = 1; i <= TRAINING_COUNT; i++) head.push(`${ordinal(i)} Training Date`, `${ordinal(i)} Training Time`, `${ordinal(i)} Training Venue`);
  const rows = S.officers.map(o => { const r = OFFICER_KEYS.slice(0, 9).map(k => o[k]); (S.training[o.duty] || []).forEach(t => r.push(fmtDate(t.date), t.start ? `${t.start}-${t.end}` : '', t.venue)); return r; });
  const wb = XLSX.utils.book_new(); addSheet(wb, 'First_Letter', head, rows); saveWb(wb, `First_Letter_${safeName(S.setup.district)}.xlsx`);
};
function memberCols(pin) { const o = officerByPin(pin) || {}; return [o.pin, o.name, o.designation, o.office, o.mobile, o.homeBlock, o.postingBlock]; }
const MEMBER_HEAD = r => [`${r} PIN`, `${r} Name`, `${r} Designation`, `${r} Office`, `${r} Mobile`, `${r} Home Block`, `${r} Posting Block`];
ACT.exportSecond = () => {
  const wb = XLSX.utils.book_new();
  addSheet(wb, 'Polling_Parties', ['Party No', 'Constituency', ...PARTY_ROLES.flatMap(r => MEMBER_HEAD(DUTY_BY_KEY[r].short))], S.second.parties.map(p => [p.partyNo, p.const, ...PARTY_ROLES.flatMap(r => memberCols(p[r]))]));
  addSheet(wb, 'PCCP', ['Order No', 'Constituency', ...MEMBER_HEAD('Officer')], S.second.pccp.map(x => [x.orderNo, x.const, ...memberCols(x.pin)]));
  addSheet(wb, 'Micro_Observers', ['Order No', 'Constituency', ...MEMBER_HEAD('Officer')], S.second.micro.map(x => [x.orderNo, x.const, ...memberCols(x.pin)]));
  saveWb(wb, `Second_Randomisation_${safeName(S.setup.district)}.xlsx`);
};
ACT.exportFinal = () => {
  const wb = XLSX.utils.book_new();
  const used = new Set(Object.values(S.final.polling));
  const rows = S.booths.map(b => { const p = finalPartyOf(b); return [b.const, b.no, b.ext, b.name, b.block, p ? p.partyNo : '', 'MAIN', ...(p ? PARTY_ROLES.flatMap(r => memberCols(p[r])) : [])]; });
  S.second.parties.filter(p => !used.has(p.partyNo)).forEach(p => rows.push([p.const, '', '', '', '', p.partyNo, 'RESERVE', ...PARTY_ROLES.flatMap(r => memberCols(p[r]))]));
  addSheet(wb, 'Polling_Deployment', ['Constituency', 'Booth No', 'Main/Aux', 'Location', 'Booth Block', 'Party No', 'Status', ...PARTY_ROLES.flatMap(r => MEMBER_HEAD(DUTY_BY_KEY[r].short))], rows);
  ['pccp', 'micro'].forEach(k => {
    const list = S.second[k], tags = S.final[k];
    const r2 = S.booths.filter(b => tags[b.id]).map(b => { const x = list.find(i => i.orderNo === tags[b.id]); return [b.const, b.no, b.name, b.block, x.orderNo, 'MAIN', ...memberCols(x.pin)]; });
    reserveSingles(k).forEach(x => r2.push([x.const, '', '', '', x.orderNo, 'RESERVE', ...memberCols(x.pin)]));
    addSheet(wb, k === 'pccp' ? 'PCCP_Deployment' : 'Micro_Deployment', ['Constituency', 'Booth No', 'Location', 'Booth Block', 'Order No', 'Status', ...MEMBER_HEAD('Officer')], r2);
  });
  saveWb(wb, `Final_Deployment_${safeName(S.setup.district)}.xlsx`);
};
