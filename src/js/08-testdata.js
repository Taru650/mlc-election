/* =====================================================================
 * Synthetic test data (fictitious names / numbers) + Save/Load page
 * ===================================================================== */
const TEST_PROFILES = {
  small: {
    title: 'Small — Sheohar style (5 blocks, 6 TC + 6 GC booths)',
    district: 'Sheohar', distCode: '03',
    electionTitle: 'Biennial Election to Bihar Legislative Council, 2026 for Tirhut Teachers/Graduates Constituency',
    roCumDeo: 'District Election Officer cum District Magistrate, Sheohar (TEST DATA)',
    blocks: ['Sheohar', 'Piprahi', 'Purnahiya', 'Dumri Katsari', 'Tariyani'],
    cons: [{ code: 'TC', name: '04-Tirhut Teachers', booths: 6, pccp: 6, micro: 6 }, { code: 'GC', name: '04-Tirhut Graduates', booths: 6, pccp: 6, micro: 6 }],
    surplus: 1.35, venue1: 'AV Hall, MIT Muzaffarpur', venue2: 'Khel Bhawan, Sheohar',
  },
  large: {
    title: 'Large — 16 blocks, 60 TC + 80 GC booths',
    district: 'Muzaffarpur', distCode: '14',
    electionTitle: 'Biennial Election to Bihar Legislative Council, 2026 for Tirhut Teachers/Graduates Constituency',
    roCumDeo: 'District Election Officer cum District Magistrate, Muzaffarpur (TEST DATA)',
    blocks: ['Aurai', 'Bandra', 'Bochaha', 'Gaighat', 'Kanti', 'Katra', 'Kurhani', 'Marwan', 'Minapur', 'Motipur', 'Musahari', 'Paroo', 'Sahebganj', 'Sakra', 'Saraiya', 'Muraul'],
    cons: [{ code: 'TC', name: '04-Tirhut Teachers', booths: 60, pccp: 15, micro: 60 }, { code: 'GC', name: '04-Tirhut Graduates', booths: 80, pccp: 20, micro: 80 }],
    surplus: 1.25, venue1: 'Auditorium, Collectorate Muzaffarpur', venue2: 'Town Hall, Muzaffarpur',
  },
};
const FIRST = ['RAMESH', 'SURESH', 'MAHESH', 'ANIL', 'SUNIL', 'RAJESH', 'MANOJ', 'SANJAY', 'VINOD', 'ARVIND', 'PANKAJ', 'RAKESH', 'DINESH', 'AJAY', 'VIJAY', 'NITISH', 'RAVI', 'ALOK', 'AMIT', 'SANTOSH', 'PRAMOD', 'UMESH', 'SHAILESH', 'MUKESH', 'DEEPAK', 'RANJIT', 'SUNITA', 'ANITA', 'REKHA', 'POONAM', 'KIRAN', 'NEHA', 'PRIYANKA', 'SAVITA', 'MAMTA', 'RINKU', 'ASHA', 'USHA', 'NIRMALA', 'KUMARI ANJALI', 'MD. SHAHID', 'MD. IRFAN', 'ABDUL KALAM', 'NASREEN', 'FARHAT'];
const LAST = ['KUMAR', 'SINGH', 'PRASAD', 'YADAV', 'JHA', 'MISHRA', 'PANDEY', 'SAH', 'RAM', 'PASWAN', 'MAHTO', 'THAKUR', 'CHAUDHARY', 'SHARMA', 'GUPTA', 'RAI', 'DEVI', 'KHATUN', 'ALAM', 'ANSARI', 'SINHA', 'VERMA', 'TIWARI', 'OJHA'];
const OFFICE_TYPES = {
  party: ['Middle School', 'High School', 'Primary School', 'Kanya Middle School', 'Project Girls High School', 'Block Office', 'Circle Office', 'PHC', 'CDPO Office', 'Block Agriculture Office', 'Block Education Office', 'Panchayat Bhawan'],
  hq: ['Collectorate', 'District Education Office', 'Civil Surgeon Office', 'District Treasury', 'RWD Division', 'PHED Division', 'District Agriculture Office', 'District Welfare Office'],
  pm: ['Circle Office', 'Block Office', 'RWD Sub-Division', 'Minor Irrigation Office', 'Block Agriculture Office'],
  mo: ['State Bank of India', 'Punjab National Bank', 'Bank of India', 'Central Bank of India', 'UCO Bank', 'Head Post Office', 'LIC Branch Office', 'BSNL Exchange'],
};
const DESIG = {
  PRO: ['Headmaster', 'Lecturer', 'Assistant Engineer', 'Block Agriculture Officer', 'Section Officer', 'Senior Teacher'],
  P1: ['Assistant Teacher', 'Senior Clerk', 'Panchayat Secretary', 'Head Clerk'],
  P2: ['Teacher', 'Clerk', 'Accountant', 'Revenue Karmachari'],
  P3: ['Teacher', 'Data Entry Operator', 'Clerk', 'Office Assistant'],
  PM: ['Revenue Officer', 'Assistant Engineer', 'Junior Engineer', 'Block Panchayat Raj Officer', 'Labour Enforcement Officer'],
  MO: ['Branch Manager', 'Assistant Manager', 'Postmaster', 'Administrative Officer', 'Sub Divisional Engineer'],
};

function generateTestState(profileKey) {
  const P = TEST_PROFILES[profileKey];
  const st = defaultState();
  Object.assign(st.setup, {
    electionTitle: P.electionTitle, district: P.district, distCode: P.distCode, place: P.district, roCumDeo: P.roCumDeo,
    reservePct: 10, pollDate: '2026-10-23', pollFrom: '08:00', pollTo: '16:00', letterDate: '2026-10-03',
    ppReportVenue: `Dispatch Centre, ${P.venue2}`, ppReportDate: '2026-10-22', ppReportTime: '08:00',
    reportVenue: P.venue2, moReportDate: '2026-10-22', moReportTime: '09:00',
    pcReportVenue: `Control Room, Collectorate ${P.district}`, pcReportDate: '2026-10-22', pcReportTime: '07:30',
    matCollectVenue: P.venue2, matCollectDate: '2026-10-22', matCollectTime: '10:00', matDeposit: 'MIT, Muzaffarpur',
    authIssueTitle: 'Authorised to Issue Officer I/c', authSubTitle: `District Election Officer, ${P.district}`,
  });
  st.constituencies = P.cons.map(c => ({ code: c.code, name: c.name, pccp: c.pccp, micro: c.micro }));
  DUTIES.forEach(d => {
    const big = ['PRO', 'P1'].includes(d.key) ? P.venue1 : P.venue2;
    st.training[d.label] = [
      { date: '2026-10-08', start: '11:00', end: '13:00', venue: big },
      { date: '2026-10-12', start: '11:00', end: '13:00', venue: big },
      { date: '2026-10-22', start: '11:00', end: '13:00', venue: 'At Briefing Place' },
    ];
  });
  // fictitious block codes (stand-in for census block codes) and office codes
  const bCode = {}; P.blocks.forEach((bl, i) => { bCode[bl] = P.distCode + pad(i + 1, 2); });
  const oCode = {}; let oSeq = 1;
  const officeCodeOf = name => (oCode[name] = oCode[name] || P.distCode + pad(oSeq++, 3));
  // booths: spread across blocks
  P.cons.forEach(c => {
    for (let i = 1; i <= c.booths; i++) {
      const block = P.blocks[(i - 1 + (c.code === 'GC' ? 2 : 0)) % P.blocks.length];
      const aux = i % 7 === 0;
      st.booths.push({ id: newBoothId(), const: c.code, blockCode: bCode[block], no: aux ? `${i - 1}A` : String(i), ext: aux ? 'Aux' : 'Main', name: `${pickRandom(['Middle School', 'High School', 'Block Office Hall', 'Panchayat Bhawan', 'Kanya Middle School'])} ${block}, Room ${1 + (i % 3)}`, block });
    }
  });
  // officers
  const partyNeed = P.cons.reduce((a, c) => a + Math.ceil(c.booths * 1.1), 0);
  const pmNeed = P.cons.reduce((a, c) => a + Math.ceil(c.pccp * 1.1), 0);
  const moNeed = P.cons.reduce((a, c) => a + Math.ceil(c.micro * 1.1), 0);
  const counts = { PRO: partyNeed, P1: partyNeed, P2: partyNeed, P3: partyNeed, PM: pmNeed, MO: moNeed };
  let serial = 1;
  const usedNames = new Set();
  const hq = P.blocks[0];
  DUTIES.forEach(d => {
    const n = Math.ceil(counts[d.key] * P.surplus) + 2;
    for (let i = 0; i < n; i++) {
      let name; do { name = `${pickRandom(FIRST)} ${pickRandom(LAST)}`; if (usedNames.has(name)) name += ' ' + String.fromCharCode(65 + randInt(26)); } while (usedNames.has(name)); usedNames.add(name);
      let office, posting;
      if (d.key === 'MO') { posting = pickRandom(P.blocks); office = `${pickRandom(OFFICE_TYPES.mo)}, ${posting}`; }
      else if (d.key === 'PM') { posting = pickRandom(P.blocks); office = `${pickRandom(OFFICE_TYPES.pm)} ${posting}`; }
      else if (randInt(100) < 15) { posting = hq; office = pickRandom(OFFICE_TYPES.hq) + ' ' + P.district; }
      else { posting = pickRandom(P.blocks); office = `${pickRandom(OFFICE_TYPES.party)} ${posting}${randInt(3) === 0 ? '' : ' No.' + (1 + randInt(4))}`; }
      const home = randInt(100) < 40 ? posting : pickRandom(P.blocks);
      // ~8% live outside the district, ~3% are posted outside (deputed) — marked with code 999999
      const homeOut = randInt(100) < 8, postOut = !homeOut && d.key !== 'MO' && randInt(100) < 3;
      if (postOut) { posting = 'Other District'; office = `${pickRandom(OFFICE_TYPES.hq)} (deputed from other district)`; }
      st.officers.push({
        pin: P.distCode + pad(serial, 5), name, designation: pickRandom(DESIG[d.key]), officeCode: officeCodeOf(office), office, officeAddress: `${posting}, ${P.district}`,
        mobile: '90' + P.distCode + pad(serial, 6), duty: d.label, homeBlockCode: homeOut ? '999999' : bCode[home], homeBlock: homeOut ? 'Others' : home, postingBlockCode: postOut ? '999999' : bCode[posting], postingBlock: posting,
        bloodGroup: randInt(100) < 70 ? pickRandom(['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']) : '', acNo: String(30000000000 + serial * 7919), bank: 'State Bank of India', branch: P.district, ifsc: 'SBIN000' + pad(1000 + randInt(8999), 4),
      });
      serial++;
    }
  });
  st.officers = shuffle(st.officers);
  st.log = [{ time: nowStamp(), action: `Test data generated (${P.title})` }];
  return st;
}
function generateErrorState() {
  const st = generateTestState('small');
  const o = st.officers;
  o[0].pin = o[1].pin; // duplicate PIN
  o[2].postingBlock = ''; o[2].postingBlockCode = ''; // missing posting block
  o[3].duty = 'DRIVER'; // unknown duty
  o[4].office = ''; o[4].officeCode = ''; // missing office
  o[5].mobile = '98765'; // short mobile
  o[6].homeBlock = 'Piprahee'; o[6].homeBlockCode = ''; // misspelt block, no code to rescue it
  o[8].officeCode = o[9].officeCode = '99999'; o[9].office = 'Some Other Office'; // one code, two names
  const inDist = o.findIndex((x, i) => i > 9 && x.postingBlockCode !== '999999');
  o[inDist].postingBlockCode = '7777'; // in-district block name with a wrong code
  o[7].homeBlock = '';
  st.booths[0].block = ''; st.booths[0].blockCode = '';
  st.booths[1].const = 'XC';
  st.booths[3].no = st.booths[2].no; st.booths[3].const = st.booths[2].const;
  st.log = [{ time: nowStamp(), action: 'Test data WITH DELIBERATE ERRORS generated (for testing validation)' }];
  return st;
}
ACT.loadTestData = key => {
  const hasData = S.officers.length || S.booths.length || str(S.setup.electionTitle);
  if (hasData && !confirmBox('Replace everything in this browser with fictitious TEST data? (Save your project first if needed.)')) return;
  S = hydrate(key === 'errors' ? generateErrorState() : generateTestState(key)); invalidateIndexes();
  addLog('Test data loaded into the tool');
  persist(); UI.view = 'home'; render();
  toast(`Test data loaded: ${S.officers.length} officers, ${S.booths.length} booths. Now lock Setup → Training → Officers → Booths, then run the randomisations.`, 'ok');
};
ACT.downloadTestData = key => {
  const prev = S;
  S = hydrate(key === 'errors' ? generateErrorState() : generateTestState(key)); invalidateIndexes();
  try { saveWb(buildProjectWorkbook(), `TEST_${key === 'errors' ? 'With_Errors' : TEST_PROFILES[key].district}_Project.xlsx`); }
  finally { S = prev; invalidateIndexes(); }
};

VIEWS.data = () => `
  <div class="card"><div class="card-head"><h2>Save / Load</h2></div>
    <div class="flow">
      <div class="step"><h4>Project file (.xlsx)</h4><div class="small muted">Everything — setup, training, officers, booths, randomisation results, locks, signature and audit log — in one Excel workbook. Open it on any computer with this HTML file.</div>
        <div class="btn-row"><button class="btn pri sm" data-act="saveProject">Save Project</button><button class="btn sm" data-act="openProject">Open Project</button></div></div>
      <div class="step"><h4>Configuration only</h4><div class="small muted">Setup + constituencies + training schedule as Excel. Useful to prepare in Excel or share between districts.</div>
        <div class="btn-row"><button class="btn sm" data-act="exportConfigExcel">Download</button><button class="btn sm" data-act="importConfigExcel">Import</button></div></div>
      <div class="step"><h4>Blank templates</h4><div class="small muted">Column formats for officers and booths.</div>
        <div class="btn-row"><button class="btn sm" data-act="officerTemplate">Officers template</button><button class="btn sm" data-act="boothTemplate">Booths template</button></div></div>
      <div class="step"><h4>Files from the earlier tool</h4><div class="small muted">Import the old Setup JSON (also imports its training schedule) or Training JSON.</div>
        <div class="btn-row"><button class="btn sm" data-act="importLegacySetup" ${S.locks.setup ? 'disabled' : ''}>Setup JSON</button><button class="btn sm" data-act="importLegacyTraining" ${S.locks.training ? 'disabled' : ''}>Training JSON</button></div></div>
    </div></div>
  <div class="card"><div class="card-head"><h3>Test data (fictitious)</h3></div>
    <div class="alert warn">Test data uses made-up names and numbers. Load it to rehearse the whole workflow, then start a new project for live data (Dashboard → “Start a new, empty project”) or open your live project file.</div>
    <div class="tbl-wrap" style="max-height:none"><table class="t"><thead><tr><th>Dataset</th><th>Contents</th><th></th></tr></thead><tbody>
    ${Object.entries(TEST_PROFILES).map(([k, p]) => `<tr><td><b>${esc(p.title)}</b></td><td class="small">${p.blocks.length} blocks · ${p.cons.map(c => `${c.code}: ${c.booths} booths, ${c.pccp} PCCP, ${c.micro} MO`).join(' · ')} · officers ≈ ${Math.round((p.surplus) * 100)}% of need · 3 trainings</td>
      <td class="nowrap"><button class="btn sm pri" data-act="loadTestData" data-arg="${k}">Load into tool</button> <button class="btn sm" data-act="downloadTestData" data-arg="${k}">Download .xlsx</button></td></tr>`).join('')}
    <tr><td><b>With deliberate errors</b></td><td class="small">Small dataset with duplicate PIN, missing posting block, unknown duty, missing office, short mobile, misspelt block, booth without block, unknown constituency, duplicate booth — to test validation.</td>
      <td class="nowrap"><button class="btn sm pri" data-act="loadTestData" data-arg="errors">Load into tool</button> <button class="btn sm" data-act="downloadTestData" data-arg="errors">Download .xlsx</button></td></tr>
    </tbody></table></div></div>
  <div class="card"><div class="card-head"><h3>This browser</h3></div>
    <p class="small">Autosave keeps your work in this browser's local storage (${S.savedAt ? 'last saved ' + esc(new Date(S.savedAt).toLocaleString()) : 'nothing saved yet'}). It is not shared with other browsers or computers, and is lost if browser data is cleared — always keep a saved project file.</p>
    <div class="btn-row"><button class="btn sm" data-act="report" data-arg="log">View audit log</button><button class="btn sm ghost-bad" data-act="resetAll">Clear everything in this browser</button></div></div>`;

/* ---------------- startup ---------------- */
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTopModal(); });
function init() {
  const saved = loadAutosave();
  if (saved) { S = hydrate(saved); }
  render();
  persist();
  if (saved) toast(`Restored your work from this browser's autosave (${S.officers.length} officers, ${S.booths.length} booths).`);
}
window.__MLC = {
  get S() { return S; }, set S(v) { S = hydrate(v); invalidateIndexes(); },
  formPollingParties, formSingles, finalPolling, finalSingles, runAudit, generateTestState, generateErrorState,
  buildProjectWorkbook, parseProjectWorkbook, validateOfficers, validateBooths, validateSetup, validateTraining, ACT, render,
};
init();
