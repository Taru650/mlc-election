'use strict';
/* =====================================================================
 * MLC Polling Personnel Randomisation — offline single-file tool
 * Core: constants, state, helpers, persistence, navigation, workflow.
 * ===================================================================== */

const APP_VERSION = '2.0.0';
const STORAGE_KEY = 'mlcPollingTool.v2.state';

const DUTIES = [
  { key: 'PRO', label: 'PRESIDING OFFICER',     short: 'PrO'  },
  { key: 'P1',  label: 'POLLING OFFICER-1',     short: 'P1'   },
  { key: 'P2',  label: 'POLLING OFFICER-2',     short: 'P2'   },
  { key: 'P3',  label: 'POLLING OFFICER-3',     short: 'P3'   },
  { key: 'PM',  label: 'PATROLLING MAGISTRATE', short: 'PCCP' },
  { key: 'MO',  label: 'MICRO OBSERVER',        short: 'MO'   },
];
const PARTY_ROLES = ['PRO', 'P1', 'P2', 'P3'];
const DUTY_BY_KEY = Object.fromEntries(DUTIES.map(d => [d.key, d]));
const TRAINING_COUNT = 3;

const BIHAR_DISTRICTS = [
  ['01','West Champaran','03-Saran'],['02','East Champaran','03-Saran'],['03','Sheohar','04-Tirhut'],
  ['04','Sitamarhi','04-Tirhut'],['05','Madhubani','05-Darbhanga'],['06','Supaul','06-Kosi'],
  ['07','Araria','06-Kosi'],['08','Kishanganj','06-Kosi'],['09','Purnia','06-Kosi'],['10','Katihar','06-Kosi'],
  ['11','Madhepura','06-Kosi'],['12','Saharsa','06-Kosi'],['13','Darbhanga','05-Darbhanga'],
  ['14','Muzaffarpur','04-Tirhut'],['15','Gopalganj','03-Saran'],['16','Siwan','03-Saran'],['17','Saran','03-Saran'],
  ['18','Vaishali','04-Tirhut'],['19','Samastipur','05-Darbhanga'],['20','Begusarai','05-Darbhanga'],
  ['21','Khagaria','06-Kosi'],['22','Bhagalpur','06-Kosi'],['23','Banka','06-Kosi'],['24','Munger','06-Kosi'],
  ['25','Lakhisarai','06-Kosi'],['26','Sheikhpura','06-Kosi'],['27','Nalanda','01-Patna'],['28','Patna','01-Patna'],
  ['29','Bhojpur','02-Gaya'],['30','Buxar','02-Gaya'],['31','Kaimur','02-Gaya'],['32','Rohtas','02-Gaya'],
  ['33','Arwal','02-Gaya'],['34','Jehanabad','02-Gaya'],['35','Aurangabad','02-Gaya'],['36','Gaya','02-Gaya'],
  ['37','Nawada','01-Patna'],['38','Jamui','06-Kosi'],
];
const CONSTITUENCY_SUGGESTIONS = [
  '01-Patna Teachers','02-Gaya Teachers','03-Saran Teachers','04-Tirhut Teachers','05-Darbhanga Teachers','06-Kosi Teachers',
  '01-Patna Graduates','02-Gaya Graduates','03-Saran Graduates','04-Tirhut Graduates','05-Darbhanga Graduates','06-Kosi Graduates',
];

/* ---------------- state ---------------- */
function emptyTraining() {
  const t = {};
  DUTIES.forEach(d => { t[d.label] = Array.from({ length: TRAINING_COUNT }, () => ({ date: '', start: '', end: '', venue: '' })); });
  return t;
}
/** Home / posting block values meaning "outside this district" — such a block never excludes any booth. */
const DEFAULT_OUTSIDE_MARKERS = '999, 9999, 99999, 999999, OTHERS, OTHER, OUT OF DISTRICT, OUTSIDE DISTRICT, OTHER DISTRICT';
function defaultSetup() {
  return {
    electionTitle: '', district: '', distCode: '', roCumDeo: '', reservePct: 10,
    pollDate: '', pollFrom: '08:00', pollTo: '16:00', letterDate: '', place: '',
    reportVenue: '', matCollectVenue: '', matCollectDate: '', matCollectTime: '', matDeposit: '',
    authIssueTitle: '', authSubTitle: '', signature: '',
    ruleDistinctOffice: true, officeKeyMode: 'name',
    ruleDistinctPostingBlock: false, ruleDistinctHomeBlock: false,
    outsideMarkers: DEFAULT_OUTSIDE_MARKERS,
  };
}
function defaultState() {
  return {
    app: 'MLC_POLLING_TOOL', version: 2, savedAt: null,
    setup: defaultSetup(),
    constituencies: [
      { code: 'TC', name: '', pccp: 0, micro: 0 },
      { code: 'GC', name: '', pccp: 0, micro: 0 },
    ],
    training: emptyTraining(),
    officers: [],
    exempt: {}, // PIN -> { category, reason, orderRef, date, at } — kept out of 2nd and final randomisation
    booths: [],
    second: { parties: [], pccp: [], micro: [], ran: {} },
    final: { polling: {}, pccp: {}, micro: {}, ran: {} },
    locks: { setup: false, training: false, officers: false, letter1: false, booths: false, second: false, final: false },
    // 2nd and final randomisation are locked part by part, in any order
    parts: { second: { polling: false, pccp: false, micro: false }, final: { polling: false, pccp: false, micro: false } },
    log: [],
  };
}
let S = defaultState();
let UI = { view: 'home', sub: {}, officerPage: 1, officerQuery: '', officerPageSize: 50, boothQuery: '', firstLetterTrainings: [0, 1] };

/* ---------------- helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function str(v) { return v == null ? '' : String(v).trim(); }
function normText(v) { return str(v).toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ''); }
/** Block names are compared loosely: case, spaces, punctuation and the words "block"/"prakhand" are ignored. */
function blockKey(v) {
  return str(v).toLowerCase().replace(/\b(block|prakhand|blk)\b/g, ' ').replace(/[^a-z0-9ऀ-ॿ]+/g, '');
}
/** Codes (office code, census block code) are compared ignoring spaces, punctuation, case, leading zeros and Excel's ".0". */
function codeKey(v) { return str(v).replace(/\.0+$/, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/^0+(?=.)/, ''); }
/** Office identity: the Office Code when given (immune to spelling differences in the name), otherwise the office name. */
function officeKey(o) {
  const c = codeKey(o.officeCode);
  if (c) return 'c:' + c;
  const base = normText(o.office);
  if (!base) return '';
  if (S.setup.officeKeyMode === 'nameaddr') return 'n:' + base + '|' + normText(o.officeAddress);
  return 'n:' + base;
}
/** A block reference {c: code, n: name}. Two references are the same block when both codes exist and are equal;
 *  when either code is missing, the (loosely compared) names decide. */
function blockRef(code, name) { return { c: codeKey(code), n: blockKey(name) }; }
let _outside = { src: null, codes: new Set(), names: new Set() };
function outsideSets() {
  const src = S.setup.outsideMarkers == null ? DEFAULT_OUTSIDE_MARKERS : String(S.setup.outsideMarkers);
  if (_outside.src !== src) {
    const toks = src.split(/[,;\n]+/).map(str).filter(Boolean);
    _outside = { src, codes: new Set(toks.map(codeKey).filter(Boolean)), names: new Set(toks.map(blockKey).filter(Boolean)) };
  }
  return _outside;
}
/** True when a block reference is an out-of-district marker (e.g. code 999999 or name "Others"). */
function isOutside(r) { const o = outsideSets(); return (!!r.c && o.codes.has(r.c)) || (!!r.n && o.names.has(r.n)); }
function sameBlock(a, b) { if (a.c && b.c) return a.c === b.c; return !!a.n && a.n === b.n; }
function blockId(r) { return r.c ? 'c:' + r.c : (r.n ? 'n:' + r.n : ''); }
function boothBlockRef(b) { return blockRef(b.blockCode, b.block); }
function blockText(code, name) { return str(name) + (str(code) ? ` [${str(code)}]` : ''); }
function pad(n, w = 2) { return String(n).padStart(w, '0'); }
function ordinal(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }
function intOr0(v) { const n = parseInt(v, 10); return isFinite(n) && n > 0 ? n : 0; }
function nowStamp() { const d = new Date(); return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function fileStamp() { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`; }
function safeName(s) { return str(s).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'MLC'; }

/** Accepts ISO (YYYY-MM-DD), DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, Excel serials and Date objects. Returns ISO or ''. */
function parseDateAny(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number' && isFinite(v) && v > 20000 && v < 80000) {
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = str(v);
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) return `20${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return '';
}
/** Accepts HH:MM, H:MM AM/PM and Excel day fractions. Returns HH:MM or ''. */
function parseTimeAny(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v)) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  if (typeof v === 'number' && isFinite(v)) {
    const frac = v % 1; const mins = Math.round(frac * 1440);
    return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
  }
  const s = str(v).toUpperCase();
  const m = s.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(AM|PM)?$/);
  if (!m) return '';
  let h = parseInt(m[1], 10); const mi = parseInt(m[2], 10);
  if (m[3] === 'PM' && h < 12) h += 12;
  if (m[3] === 'AM' && h === 12) h = 0;
  return `${pad(h)}:${pad(mi)}`;
}
function fmtDate(iso) {
  const m = str(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : str(iso);
}

/* ---------------- cryptographic randomness ---------------- */
function randInt(n) {
  if (n <= 1) return 0;
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n;
  let x;
  do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
  return x % n;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pickRandom(arr) { return arr.length ? arr[randInt(arr.length)] : null; }

/* ---------------- lookups ---------------- */
let _officerIndex = null;
function officerByPin(pin) {
  if (!_officerIndex) { _officerIndex = new Map(); S.officers.forEach(o => _officerIndex.set(String(o.pin), o)); }
  return _officerIndex.get(String(pin)) || null;
}
function invalidateIndexes() { _officerIndex = null; }
function boothById(id) { return S.booths.find(b => b.id === id) || null; }
function constByCode(code) { return S.constituencies.find(c => c.code === code) || null; }
function constName(code) { const c = constByCode(code); return c ? (c.name || c.code) : code; }
function dutyKeyFromLabel(label) { const d = DUTIES.find(x => x.label === label); return d ? d.key : ''; }
function officersOfDuty(key) { const lbl = DUTY_BY_KEY[key].label; return S.officers.filter(o => o.duty === lbl); }
function isExempt(pin) { return !!(S.exempt && S.exempt[String(pin)]); }
/** Officers of a duty who are available for randomisation (not exempted). */
function availableOfDuty(key) { return officersOfDuty(key).filter(o => !isExempt(o.pin)); }
function boothsOf(code) { return S.booths.filter(b => b.const === code); }
function reserveTarget(required) { return Math.ceil(required * (1 + (Number(S.setup.reservePct) || 0) / 100)); }
/** Home block and posting block of an officer as block references (used for exclusion). */
function exclusionBlocks(o) { return [blockRef(o.homeBlockCode, o.homeBlock), blockRef(o.postingBlockCode, o.postingBlock)].filter(r => (r.c || r.n) && !isOutside(r)); }
function canServeAt(o, booth) { if (!o || !booth) return false; const br = boothBlockRef(booth); return !exclusionBlocks(o).some(r => sameBlock(r, br)); }
function boothLabel(b) { return b ? `${b.no}${b.ext && b.ext !== 'Main' ? ' (' + b.ext + ')' : ''}` : ''; }

/** Normalises a free-text duty to one of the six duty labels; returns '' when unknown. */
function normalizeDuty(v) {
  const d = str(v).toLowerCase();
  if (!d) return '';
  const c = d.replace(/[^a-z0-9]/g, '');
  if (c === 'pro' || d.includes('presiding')) return 'PRESIDING OFFICER';
  if (d.includes('micro') || c === 'mo') return 'MICRO OBSERVER';
  if (d.includes('patrol') || d.includes('petrol') || c.includes('pccp') || c === 'pm' || d.includes('magistrate')) return 'PATROLLING MAGISTRATE';
  const m = c.match(/^(?:p|po|pollingofficer|polling)(1|2|3|iii|ii|i)$/) || c.match(/^(1|2|3)(?:st|nd|rd)?pollingofficer$/) || c.match(/^(first|second|third)pollingofficer$/);
  if (m) {
    const n = { '1': 1, '2': 2, '3': 3, i: 1, ii: 2, iii: 3, first: 1, second: 2, third: 3 }[m[1]];
    if (n) return 'POLLING OFFICER-' + n;
  }
  return '';
}

/* ---------------- per-part locks (2nd and final randomisation) ---------------- */
const PART_KINDS = ['polling', 'pccp', 'micro'];
const PART_NAME = { polling: 'Polling parties', pccp: 'PCCP', micro: 'Micro Observers' };
const PART_STAGE_TAG = { polling: 'Polling', pccp: 'PCCP', micro: 'Micro' };
/** A part is applicable when something has to be formed for it (booths for parties, required count > 0 for PCCP / MO). */
function partApplicable(kind) { return kind === 'polling' ? S.booths.length > 0 : singlePlan(kind).length > 0; }
function partDone(stage, kind) { return !partApplicable(kind) || !!S.parts[stage][kind]; }
function partsLockedCount(stage) { return PART_KINDS.filter(k => partApplicable(k) && S.parts[stage][k]).length; }
function partsApplicableCount() { return PART_KINDS.filter(partApplicable).length; }
/** Whole-stage lock = every applicable part locked. Derived, never set directly. */
function syncStageLocks() {
  ['second', 'final'].forEach(stg => { S.locks[stg] = partsApplicableCount() > 0 && PART_KINDS.every(k => partDone(stg, k)); });
}
function resetParts(stage) { PART_KINDS.forEach(k => { S.parts[stage][k] = false; }); }

/* ---------------- persistence (browser autosave) ---------------- */
let _saveTimer = null;
function persist() {
  invalidateIndexes();
  syncStageLocks();
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    S.savedAt = new Date().toISOString();
    const el = $('#saveState');
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
      if (el) el.textContent = 'Autosaved in this browser ' + nowStamp().slice(11, 16);
    } catch (e) {
      if (el) el.textContent = 'Browser autosave unavailable — use Save Project (.xlsx)';
    }
  }, 250);
}
function loadAutosave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const st = JSON.parse(raw);
    return st && st.app === 'MLC_POLLING_TOOL' ? st : null;
  } catch (e) { return null; }
}
function hydrate(st) {
  const d = defaultState();
  const out = Object.assign(d, st || {});
  out.setup = Object.assign(defaultSetup(), (st && st.setup) || {});
  out.locks = Object.assign(defaultState().locks, (st && st.locks) || {});
  out.parts = defaultState().parts;
  ['second', 'final'].forEach(stg => PART_KINDS.forEach(k => {
    const saved = st && st.parts && st.parts[stg];
    out.parts[stg][k] = saved ? !!saved[k] : !!out.locks[stg]; // older files: whole-stage lock = all parts locked
  }));
  out.second = Object.assign({ parties: [], pccp: [], micro: [], ran: {} }, (st && st.second) || {});
  out.final = Object.assign({ polling: {}, pccp: {}, micro: {}, ran: {} }, (st && st.final) || {});
  const tr = emptyTraining();
  if (st && st.training) DUTIES.forEach(dd => { if (Array.isArray(st.training[dd.label])) tr[dd.label] = tr[dd.label].map((x, i) => Object.assign(x, st.training[dd.label][i] || {})); });
  out.training = tr;
  out.officers = (out.officers || []).map(o => Object.assign(blankOfficer(), o));
  out.booths = (out.booths || []).map(b => Object.assign(blankBooth(), b));
  out.log = out.log || [];
  out.exempt = (st && st.exempt && typeof st.exempt === 'object') ? st.exempt : {};
  return out;
}
function addLog(action) { S.log.push({ time: nowStamp(), action }); if (S.log.length > 2000) S.log.shift(); }

function blankOfficer() {
  return { pin: '', name: '', designation: '', officeCode: '', office: '', officeAddress: '', mobile: '', duty: '', homeBlockCode: '', homeBlock: '', postingBlockCode: '', postingBlock: '', acNo: '', bank: '', branch: '', ifsc: '' };
}
let _boothSeq = 0;
function newBoothId() { _boothSeq++; return 'B' + Date.now().toString(36) + _boothSeq.toString(36) + randInt(1e6).toString(36); }
function blankBooth() { return { id: '', no: '', name: '', ext: 'Main', block: '', blockCode: '', const: '' }; }

/* ---------------- toast / modal ---------------- */
function toast(msg, kind = '') {
  const box = $('#toast'); const el = document.createElement('div');
  el.className = 'msg ' + kind; el.textContent = msg; box.appendChild(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 9000 : 4500);
}
function openModal({ title, body, foot = '', wide = false, plain = false, onClose = null, headExtra = '' }) {
  const root = $('#modalRoot');
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><div class="t">${esc(title)}</div>${headExtra}<button class="btn sm" data-close>Close ✕</button></div>
    <div class="modal-body ${plain ? 'plain' : ''}">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  root.appendChild(wrap);
  const close = () => { wrap.remove(); if (onClose) onClose(); };
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  wrap._close = close;
  return wrap;
}
function closeTopModal() { const all = $$('#modalRoot .overlay'); if (all.length) all[all.length - 1]._close(); }
function confirmBox(msg) { return window.confirm(msg); }

/* ---------------- workflow / prerequisites ----------------
 * Booth entry is deliberately independent: it needs nothing except the
 * constituency list, and can be done before or after officers / training.
 * Only the 2nd randomisation needs both Officers and Booths locked.
 */
const MODULES = [
  { id: 'home',     label: 'Dashboard',            grp: 'Start' },
  { id: 'setup',    label: 'Election Setup',       grp: 'Configuration', lock: 'setup' },
  { id: 'training', label: 'Training Schedule',    grp: 'Configuration', lock: 'training' },
  { id: 'officers', label: 'Officers Database',    grp: 'Data entry', lock: 'officers' },
  { id: 'booths',   label: 'Booth Entry',          grp: 'Data entry', lock: 'booths' },
  { id: 'letter1',  label: '1st Appointment Letter', grp: 'Letters & Randomisation', lock: 'letter1' },
  { id: 'exempt',   label: 'Exemptions',           grp: 'Letters & Randomisation' },
  { id: 'second',   label: '2nd Randomisation',    grp: 'Letters & Randomisation', lock: 'second' },
  { id: 'final',    label: 'Final Randomisation',  grp: 'Letters & Randomisation', lock: 'final' },
  { id: 'reports',  label: 'Reports & Letters',    grp: 'Output' },
  { id: 'data',     label: 'Save / Load / Test Data', grp: 'Output' },
];
function prereqs(id) {
  const L = S.locks, miss = [];
  if (id === 'officers' && !L.setup) miss.push('Election Setup');
  if (id === 'booths' && !L.setup) miss.push('Election Setup');
  if (id === 'letter1') { if (!L.officers) miss.push('Officers Database'); if (!L.training) miss.push('Training Schedule'); if (!L.setup) miss.push('Election Setup'); }
  if (id === 'exempt' && !L.officers) miss.push('Officers Database');
  if (id === 'second') { if (!L.setup) miss.push('Election Setup'); if (!L.officers) miss.push('Officers Database'); if (!L.booths) miss.push('Booth Entry'); }
  if (id === 'final') { if (!PART_KINDS.some(k => partApplicable(k) && S.parts.second[k])) miss.push('at least one part of the 2nd Randomisation'); }
  return miss;
}

/* ---------------- event delegation ---------------- */
const ACT = {};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  try { fn(el.dataset.arg, el, e); } catch (err) { console.error(err); toast('Error: ' + (err.message || err), 'bad'); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset && el.dataset.bind) { bindChange(el); return; }
  if (el.dataset && el.dataset.chg && ACT[el.dataset.chg]) {
    try { ACT[el.dataset.chg](el.dataset.arg, el, e); } catch (err) { console.error(err); toast('Error: ' + (err.message || err), 'bad'); }
  }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset && el.dataset.inp && ACT[el.dataset.inp]) ACT[el.dataset.inp](el.dataset.arg, el, e);
});
function bindChange(el) {
  const path = el.dataset.bind.split('.');
  let obj = S;
  for (let i = 0; i < path.length - 1; i++) obj = obj[isFinite(path[i]) ? Number(path[i]) : path[i]];
  const k = path[path.length - 1];
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.type === 'int') v = intOr0(v);
  if (el.dataset.type === 'num') v = Math.max(0, Number(v) || 0);
  obj[k] = v;
  persist();
  if (el.dataset.rerender) render();
}

/** Opens a file picker and resolves with the selected File (or null). */
function pickFile(accept) {
  return new Promise(resolve => {
    const inp = $('#hiddenFile');
    inp.value = ''; inp.accept = accept || '';
    inp.onchange = () => resolve(inp.files && inp.files[0] ? inp.files[0] : null);
    inp.click();
  });
}
function readFileAs(file, how) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = () => rej(r.error);
    if (how === 'text') r.readAsText(file); else if (how === 'dataurl') r.readAsDataURL(file); else r.readAsArrayBuffer(file);
  });
}
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
