/* =====================================================================
 * Validation + randomisation engine
 *
 * Rules enforced
 *  R1  A polling party = 1 PrO + 1 P1 + 1 P2 + 1 P3, each from the duty pool.
 *  R2  All 4 members of a party are from DIFFERENT offices.
 *  R3  No member of a party may be deployed at a booth whose block equals
 *      that member's HOME block or POSTING block.
 *  R4  PCCP (Patrolling Magistrate) and Micro Observer: the tagged booth's
 *      block must differ from the officer's home block and posting block.
 *  R5  Nobody is used twice. Reserve = formed but not tagged in final round.
 *  Optional: party members must have distinct posting / home blocks.
 *
 * 2nd randomisation forms parties so that a booth-feasible assignment is
 * guaranteed to exist (each main party is built against a hidden random
 * booth, then forgotten). Final randomisation does a fresh random
 * bipartite matching of all formed parties to booths, so any party can end
 * up Main or Reserve.
 * ===================================================================== */

/* ---------------- validation ---------------- */
function validateSetup() {
  const e = [], w = [], st = S.setup;
  if (!str(st.electionTitle)) e.push('Election title is required.');
  if (!str(st.district)) e.push('District name is required.');
  if (!str(st.roCumDeo)) e.push('Appointing authority (RO / DEO) line is required.');
  const codes = new Set();
  const valid = S.constituencies.filter(c => str(c.code) || str(c.name));
  if (!valid.length) e.push('Add at least one constituency.');
  valid.forEach((c, i) => {
    const code = str(c.code).toUpperCase();
    if (!code) e.push(`Constituency row ${i + 1}: short code is required (e.g. TC / GC).`);
    else if (!/^[A-Z0-9]{1,8}$/.test(code)) e.push(`Constituency row ${i + 1}: code "${c.code}" must be 1–8 letters/digits.`);
    else if (codes.has(code)) e.push(`Constituency code "${code}" is repeated.`);
    codes.add(code);
    if (!str(c.name)) e.push(`Constituency ${code || i + 1}: full name is required.`);
  });
  const rp = Number(st.reservePct);
  if (!(rp >= 0 && rp <= 100)) e.push('Reserve % must be between 0 and 100.');
  if (!st.pollDate) w.push('Poll date is empty (letters will show a blank).');
  if (!st.letterDate) w.push('Letter issue date is empty.');
  if (!st.matCollectVenue) w.push('Material collection venue is empty.');
  if (!st.matDeposit) w.push('Material deposit centre is empty.');
  return { errors: e, warnings: w };
}

function validateTraining() {
  const e = [];
  const duties = S.officers.length ? DUTIES.filter(d => S.officers.some(o => o.duty === d.label)) : DUTIES;
  duties.forEach(d => {
    const rows = S.training[d.label] || [];
    const t1 = rows[0] || {};
    if (!(t1.date && t1.start && t1.end && str(t1.venue))) e.push(`${d.label}: 1st training must have date, start, end and venue.`);
    rows.forEach((t, i) => {
      const any = t.date || t.start || t.end || str(t.venue);
      const all = t.date && t.start && t.end && str(t.venue);
      if (i > 0 && any && !all) e.push(`${d.label}: ${ordinal(i + 1)} training is partly filled — complete it or clear it.`);
      if (all && t.start >= t.end) e.push(`${d.label}: ${ordinal(i + 1)} training end time must be after start time.`);
    });
  });
  return { errors: e, warnings: [] };
}

/** Returns {errors, warnings, rowIssues: Map(index -> {level, msgs})} */
function validateOfficers() {
  const errors = [], warnings = [], rowIssues = new Map();
  const seen = new Map();
  const boothRefs = S.booths.map(boothBlockRef).filter(r => r.c || r.n);
  const add = (i, level, msg) => {
    const r = rowIssues.get(i) || { level: 'warn', msgs: [] };
    if (level === 'err') r.level = 'err';
    r.msgs.push(msg); rowIssues.set(i, r);
  };
  S.officers.forEach((o, i) => {
    const tag = `Row ${i + 1} (${o.pin || 'no PIN'} ${o.name || ''})`;
    if (!str(o.pin)) { add(i, 'err', 'PIN missing'); errors.push(`${tag}: PIN missing.`); }
    else if (seen.has(String(o.pin))) { add(i, 'err', 'Duplicate PIN'); errors.push(`${tag}: duplicate PIN (also row ${seen.get(String(o.pin)) + 1}).`); }
    else seen.set(String(o.pin), i);
    if (!str(o.name)) { add(i, 'err', 'Name missing'); errors.push(`${tag}: name missing.`); }
    if (!DUTIES.some(d => d.label === o.duty)) { add(i, 'err', 'Duty not recognised'); errors.push(`${tag}: duty "${o.duty || ''}" not recognised.`); }
    if (!str(o.postingBlock) && !str(o.postingBlockCode)) { add(i, 'err', 'Posting block missing'); errors.push(`${tag}: posting block (name or code) missing.`); }
    if (!str(o.homeBlock) && !str(o.homeBlockCode)) { add(i, 'warn', 'Home block missing'); warnings.push(`${tag}: home block (name or code) missing — only posting block will be excluded.`); }
    if (S.setup.ruleDistinctOffice && !str(o.office) && !str(o.officeCode)) { add(i, 'err', 'Office missing'); errors.push(`${tag}: office name / office code missing (needed for the different-office rule).`); }
    const mob = str(o.mobile).replace(/\D/g, '');
    if (mob && mob.length !== 10) { add(i, 'warn', 'Mobile not 10 digits'); warnings.push(`${tag}: mobile "${o.mobile}" is not 10 digits.`); }
    if (boothRefs.length) {
      [['home', o.homeBlockCode, o.homeBlock], ['posting', o.postingBlockCode, o.postingBlock]].forEach(([k, c, n]) => {
        const r = blockRef(c, n);
        if ((r.c || r.n) && !boothRefs.some(br => sameBlock(r, br))) { add(i, 'warn', `${k} block not in booth list`); warnings.push(`${tag}: ${k} block "${blockText(c, n)}" does not match any booth block — check spelling / code.`); }
      });
    }
  });
  warnings.push(...codeConsistencyWarnings());
  return { errors, warnings, rowIssues };
}

function validateBooths() {
  const errors = [], warnings = [], rowIssues = new Map();
  const codes = new Set(S.constituencies.map(c => c.code));
  const seen = new Map();
  const add = (i, level, msg) => { const r = rowIssues.get(i) || { level: 'warn', msgs: [] }; if (level === 'err') r.level = 'err'; r.msgs.push(msg); rowIssues.set(i, r); };
  S.booths.forEach((b, i) => {
    const tag = `Row ${i + 1} (booth ${b.no || '?'})`;
    if (!str(b.no)) { add(i, 'err', 'Booth no missing'); errors.push(`${tag}: booth number missing.`); }
    if (!str(b.block) && !str(b.blockCode)) { add(i, 'err', 'Block missing'); errors.push(`${tag}: block name or block code missing (needed for home/posting block exclusion).`); }
    if (!codes.has(b.const)) { add(i, 'err', 'Unknown constituency'); errors.push(`${tag}: constituency "${b.const}" is not defined in Setup.`); }
    const k = b.const + '|' + str(b.no).toUpperCase();
    if (seen.has(k)) { add(i, 'err', 'Duplicate booth'); errors.push(`${tag}: booth ${b.no} repeated in ${b.const} (row ${seen.get(k) + 1}).`); } else seen.set(k, i);
    if (!str(b.name)) { add(i, 'warn', 'Location missing'); warnings.push(`${tag}: location / building name missing.`); }
  });
  S.constituencies.forEach(c => {
    const pc = intOr0(c.pccp), mc = intOr0(c.micro), n = boothsOf(c.code).length;
    if (pc > n) errors.push(`${c.code}: PCCP required (${pc}) is more than its booths (${n}). Reduce it in Setup.`);
    if (mc > n) errors.push(`${c.code}: Micro Observers required (${mc}) is more than its booths (${n}). Reduce it in Setup.`);
  });
  return { errors, warnings, rowIssues };
}

/** Flags codes that look like clerical mistakes. Codes always win over names in the randomisation, so:
 *  - one name with two codes  → treated as two different offices/blocks (probably a wrong code);
 *  - one code with two names  → treated as one office/block (spelling variants — harmless, listed for information). */
function codeConsistencyWarnings() {
  const w = [];
  const check = (what, entries) => {
    const byName = new Map(), byCode = new Map();
    entries.forEach(([code, name]) => {
      const c = codeKey(code), n = normText(name); if (!c || !n) return;
      if (!byName.has(n)) byName.set(n, { label: str(name), codes: new Set() }); byName.get(n).codes.add(c);
      if (!byCode.has(c)) byCode.set(c, { label: str(code), names: new Set() }); byCode.get(c).names.add(str(name));
    });
    byName.forEach(v => { if (v.codes.size > 1) w.push(`${what} "${v.label}" appears with different codes (${[...v.codes].join(', ')}) — treated as DIFFERENT ${what.toLowerCase()}s. Check for a wrong code.`); });
    byCode.forEach(v => { const ns = [...new Set([...v.names].map(x => normText(x)))]; if (ns.length > 1) w.push(`${what} code ${v.label} has different spellings (${[...v.names].slice(0, 4).join(' / ')}) — treated as ONE ${what.toLowerCase()} (code wins).`); });
  };
  check('Office', S.officers.map(o => [o.officeCode, o.office]));
  check('Block', S.officers.flatMap(o => [[o.homeBlockCode, o.homeBlock], [o.postingBlockCode, o.postingBlock]]).concat(S.booths.map(b => [b.blockCode, b.block])));
  return w;
}

/* ---------------- engine helpers ---------------- */
function buildMeta() {
  const meta = new Map();
  S.officers.forEach(o => {
    const ok = officeKey(o);
    meta.set(String(o.pin), {
      o, pin: String(o.pin),
      ex: exclusionBlocks(o),
      office: ok || ('__' + o.pin),
      pb: blockId(blockRef(o.postingBlockCode, o.postingBlock)) || ('__p' + o.pin),
      hb: blockId(blockRef(o.homeBlockCode, o.homeBlock)) || ('__h' + o.pin),
    });
  });
  return meta;
}
function poolsByRole(meta) {
  const pools = {};
  DUTIES.forEach(d => { pools[d.key] = []; });
  meta.forEach(m => { const k = dutyKeyFromLabel(m.o.duty); if (k) pools[k].push(m); });
  return pools;
}
function memberFits(m, partyState) {
  if (S.setup.ruleDistinctOffice && partyState.offices.has(m.office)) return false;
  if (S.setup.ruleDistinctPostingBlock && partyState.pbs.has(m.pb)) return false;
  if (S.setup.ruleDistinctHomeBlock && partyState.hbs.has(m.hb)) return false;
  return true;
}
/** Can this officer (meta) serve at a booth with block reference bRef? (null = no booth / reserve) */
function mServe(m, bRef) { return !bRef || !m.ex.some(r => sameBlock(r, bRef)); }

function pollingPlan() {
  const plan = [];
  S.constituencies.forEach(c => {
    const n = boothsOf(c.code).length;
    if (n) plan.push({ code: c.code, booths: n, target: reserveTarget(n) });
  });
  return plan;
}
function singlePlan(kind) {
  const plan = [];
  S.constituencies.forEach(c => {
    const req = intOr0(kind === 'pccp' ? c.pccp : c.micro);
    if (req) plan.push({ code: c.code, required: req, target: reserveTarget(req), booths: boothsOf(c.code).length });
  });
  return plan;
}

/** Necessary-condition checks before polling party formation. Returns array of problem strings. */
function pollingFeasibility() {
  const meta = buildMeta(), pools = poolsByRole(meta), plan = pollingPlan(), probs = [];
  const need = plan.reduce((a, p) => a + p.target, 0);
  if (!plan.length) probs.push('No booths found. Complete Booth Entry first.');
  PARTY_ROLES.forEach(r => { if (pools[r].length < need) probs.push(`${DUTY_BY_KEY[r].label}: need ${need} (booths + ${S.setup.reservePct}% reserve), available ${pools[r].length}.`); });
  const byBlock = new Map();
  S.booths.forEach(b => { const ref = boothBlockRef(b), k = blockId(ref); if (!byBlock.has(k)) byBlock.set(k, { name: blockText(b.blockCode, b.block), ref, n: 0 }); byBlock.get(k).n++; });
  byBlock.forEach(v => {
    PARTY_ROLES.forEach(r => {
      const elig = pools[r].filter(m => mServe(m, v.ref)).length;
      if (elig < v.n) probs.push(`Block "${v.name}" has ${v.n} booth(s) but only ${elig} ${DUTY_BY_KEY[r].label}(s) whose home & posting block are outside it.`);
    });
  });
  if (S.setup.ruleDistinctOffice) {
    const offices = new Set(); PARTY_ROLES.forEach(r => pools[r].forEach(m => offices.add(m.office)));
    if (offices.size < 4) probs.push('Fewer than 4 distinct offices among PrO/P1/P2/P3 — the different-office rule cannot be met.');
  }
  return probs;
}

function pickParty(pools, used, bKey) {
  for (let t = 0; t < 60; t++) {
    const ps = { offices: new Set(), pbs: new Set(), hbs: new Set() };
    const chosen = {};
    let ok = true;
    for (const r of PARTY_ROLES) {
      const cands = pools[r].filter(m => !used.has(m.pin) && mServe(m, bKey) && memberFits(m, ps));
      if (!cands.length) { ok = false; break; }
      const m = pickRandom(cands);
      chosen[r] = m; ps.offices.add(m.office); ps.pbs.add(m.pb); ps.hbs.add(m.hb);
    }
    if (ok) return chosen;
  }
  return null;
}

/** Forms polling parties. Returns array of parties; throws Error with diagnostics on failure. */
function formPollingParties() {
  const probs = pollingFeasibility();
  if (probs.length) throw new Error('Polling party formation is not possible with the current data:\n• ' + probs.join('\n• '));
  const meta = buildMeta(), pools = poolsByRole(meta), plan = pollingPlan();
  const mainSlots = [], reserveSlots = [];
  plan.forEach(p => {
    boothsOf(p.code).forEach(b => mainSlots.push({ code: p.code, bKey: boothBlockRef(b) }));
    for (let i = 0; i < p.target - p.booths; i++) reserveSlots.push({ code: p.code, bKey: null });
  });
  const difficulty = s => PARTY_ROLES.reduce((a, r) => a + pools[r].filter(m => mServe(m, s.bKey)).length, 0);
  const MAX = 400;
  for (let attempt = 0; attempt < MAX; attempt++) {
    let order = shuffle(mainSlots);
    if (attempt >= 40) order = order.map(s => [s, difficulty(s) + randInt(1000) / 1000]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
    order = order.concat(shuffle(reserveSlots));
    const used = new Set(), out = [];
    let ok = true;
    for (const slot of order) {
      const p = pickParty(pools, used, slot.bKey);
      if (!p) { ok = false; break; }
      PARTY_ROLES.forEach(r => used.add(p[r].pin));
      out.push({ code: slot.code, p });
    }
    if (!ok) continue;
    const parties = [];
    plan.forEach(pl => {
      shuffle(out.filter(x => x.code === pl.code)).forEach((x, i) => {
        const no = `${pl.code}-PARTY-${pad(i + 1, String(pl.target).length > 2 ? 3 : 2)}`;
        parties.push({ partyNo: no, const: pl.code, PRO: x.p.PRO.pin, P1: x.p.P1.pin, P2: x.p.P2.pin, P3: x.p.P3.pin });
      });
    });
    return { parties, attempts: attempt + 1 };
  }
  throw new Error(`Could not form parties satisfying all rules after ${MAX} randomised attempts. The data is too tight: add officers (especially from offices/blocks that are under-represented) or relax an optional rule in Setup.`);
}

function singleFeasibility(kind) {
  const meta = buildMeta(), pools = poolsByRole(meta), plan = singlePlan(kind), probs = [];
  const role = kind === 'pccp' ? 'PM' : 'MO';
  const need = plan.reduce((a, p) => a + p.target, 0);
  if (pools[role].length < need) probs.push(`${DUTY_BY_KEY[role].label}: need ${need} (required + ${S.setup.reservePct}% reserve), available ${pools[role].length}.`);
  plan.forEach(p => { if (p.required > p.booths) probs.push(`${p.code}: required ${p.required} but only ${p.booths} booths.`); });
  probs.push(...singleBlockShortages(kind, pools[role], true));
  return probs;
}
/** Blocks where too few PCCP / MO have BOTH home and posting block outside the block.
 *  strict=true reports only blocks where every booth must be covered (required = booths). */
function singleBlockShortages(kind, pool, strict) {
  const role = kind === 'pccp' ? 'PM' : 'MO', out = [], byBlock = new Map();
  singlePlan(kind).filter(p => !strict || p.required >= p.booths).forEach(p => boothsOf(p.code).forEach(b => {
    const ref = boothBlockRef(b), k = blockId(ref); if (!byBlock.has(k)) byBlock.set(k, { name: blockText(b.blockCode, b.block), ref, n: 0 }); byBlock.get(k).n++;
  }));
  byBlock.forEach(v => {
    const elig = pool.filter(m => mServe(m, v.ref)).length;
    if (elig < v.n) out.push(`Block "${v.name}" has ${v.n} booth(s) needing a ${DUTY_BY_KEY[role].label} but only ${elig} whose home & posting block are outside it.`);
  });
  return out;
}

/** Forms PCCP / Micro Observer pool. Main picks are made against hidden random booths so final tagging is feasible. */
function formSingles(kind) {
  const plan = singlePlan(kind);
  if (!plan.length) return { items: [], attempts: 0 };
  const probs = singleFeasibility(kind);
  if (probs.length) throw new Error(`${kind === 'pccp' ? 'PCCP' : 'Micro Observer'} formation is not possible:\n• ` + probs.join('\n• '));
  const meta = buildMeta(), pools = poolsByRole(meta), role = kind === 'pccp' ? 'PM' : 'MO';
  const tag = kind === 'pccp' ? 'PCCP' : 'MO';
  for (let attempt = 0; attempt < 300; attempt++) {
    const used = new Set(), out = [];
    let ok = true;
    for (const p of plan) {
      const booths = shuffle(boothsOf(p.code)).slice(0, p.required);
      for (const b of booths) {
        const bk = boothBlockRef(b);
        const m = pickRandom(pools[role].filter(x => !used.has(x.pin) && mServe(x, bk)));
        if (!m) { ok = false; break; }
        used.add(m.pin); out.push({ code: p.code, pin: m.pin });
      }
      if (!ok) break;
      for (let i = 0; i < p.target - p.required; i++) {
        const m = pickRandom(pools[role].filter(x => !used.has(x.pin)));
        if (!m) { ok = false; break; }
        used.add(m.pin); out.push({ code: p.code, pin: m.pin });
      }
      if (!ok) break;
    }
    if (!ok) continue;
    const items = [];
    plan.forEach(pl => shuffle(out.filter(x => x.code === pl.code)).forEach((x, i) => items.push({ orderNo: `${pl.code}-${tag}-${pad(i + 1, String(pl.target).length > 2 ? 3 : 2)}`, const: pl.code, pin: x.pin })));
    return { items, attempts: attempt + 1 };
  }
  const hint = singleBlockShortages(kind, pools[role], false);
  throw new Error(`Could not select ${tag} satisfying the home/posting block rule after 300 attempts. Add more ${DUTY_BY_KEY[role].label}s from other blocks.` + (hint.length ? '\n• ' + hint.join('\n• ') : ''));
}

/* ---------------- final randomisation (bipartite matching) ---------------- */
/** Random maximum matching between booths and items. Returns Map boothId -> item. */
function randomMatching(booths, items, compatible, keyOf) {
  const adj = new Map();
  booths.forEach(b => adj.set(b.id, shuffle(items.filter(it => compatible(it, b)))));
  const owner = new Map(); // itemKey -> booth
  function augment(b, seen) {
    for (const it of adj.get(b.id)) {
      const k = keyOf(it);
      if (seen.has(k)) continue;
      seen.add(k);
      const prev = owner.get(k);
      if (!prev || augment(prev, seen)) { owner.set(k, b); return true; }
    }
    return false;
  }
  shuffle(booths).forEach(b => augment(b, new Set()));
  const byKey = new Map(items.map(it => [keyOf(it), it]));
  const res = new Map();
  owner.forEach((b, k) => res.set(b.id, byKey.get(k)));
  return res;
}
function partyCanServe(p, booth) {
  return p.const === booth.const && PARTY_ROLES.every(r => canServeAt(officerByPin(p[r]), booth));
}
function finalPolling() {
  const result = {};
  for (const c of S.constituencies) {
    const booths = boothsOf(c.code); if (!booths.length) continue;
    const parties = S.second.parties.filter(p => p.const === c.code);
    const m = randomMatching(booths, parties, partyCanServe, p => p.partyNo);
    if (m.size < booths.length) {
      const miss = booths.filter(b => !m.has(b.id)).map(b => `${b.no} (${b.block})`);
      throw new Error(`${c.code}: no compatible party left for booth(s) ${miss.join(', ')}. Re-run 2nd randomisation.`);
    }
    m.forEach((p, bid) => { result[bid] = p.partyNo; });
  }
  return result;
}
function finalSingles(kind) {
  const list = kind === 'pccp' ? S.second.pccp : S.second.micro;
  const result = {};
  for (const p of singlePlan(kind)) {
    const booths = boothsOf(p.code);
    const items = list.filter(x => x.const === p.code);
    const m = randomMatching(booths, items, (it, b) => canServeAt(officerByPin(it.pin), b), it => it.orderNo);
    if (m.size < p.required) throw new Error(`${p.code}: only ${m.size} of ${p.required} ${kind === 'pccp' ? 'PCCP' : 'Micro Observer'} could be tagged without violating the block rule. Re-run 2nd randomisation.`);
    shuffle([...m.keys()]).slice(0, p.required).forEach(bid => { result[bid] = m.get(bid).orderNo; });
  }
  return result;
}

/* ---------------- audit ---------------- */
function runAudit() {
  invalidateIndexes();
  const checks = [];
  const add = (stage, rule, bad, total) => checks.push({ stage, rule, ok: bad.length === 0, bad, total });
  const sec = S.second, fin = S.final;
  const offOf = pin => officerByPin(pin);

  if (sec.parties.length) {
    const plan = pollingPlan(); const bad = [];
    plan.forEach(p => { const n = sec.parties.filter(x => x.const === p.code).length; if (n !== p.target) bad.push(`${p.code}: ${n} parties formed, expected ${p.target}`); });
    add('2nd – Polling', 'Party count = booths + reserve %', bad, plan.length);
    const b2 = [];
    sec.parties.forEach(p => PARTY_ROLES.forEach(r => { const o = offOf(p[r]); if (!o) b2.push(`${p.partyNo}: ${r} PIN ${p[r]} not in officer list`); else if (o.duty !== DUTY_BY_KEY[r].label) b2.push(`${p.partyNo}: ${o.pin} is ${o.duty}, placed as ${DUTY_BY_KEY[r].label}`); }));
    add('2nd – Polling', 'Each party has PrO, P1, P2, P3 of the correct duty', b2, sec.parties.length);
    if (S.setup.ruleDistinctOffice) {
      const b3 = [];
      sec.parties.forEach(p => { const ks = PARTY_ROLES.map(r => offOf(p[r])).filter(Boolean).map(officeKey); if (new Set(ks).size !== ks.length) b3.push(`${p.partyNo}: two or more members from the same office`); });
      add('2nd – Polling', 'All 4 members are from different offices', b3, sec.parties.length);
    }
    if (S.setup.ruleDistinctPostingBlock) {
      const b4 = [];
      sec.parties.forEach(p => { const ks = PARTY_ROLES.map(r => { const o = offOf(p[r]) || {}; return blockId(blockRef(o.postingBlockCode, o.postingBlock)); }); if (new Set(ks).size !== ks.length) b4.push(`${p.partyNo}: repeated posting block`); });
      add('2nd – Polling', 'All 4 members have different posting blocks', b4, sec.parties.length);
    }
    if (S.setup.ruleDistinctHomeBlock) {
      const b5 = [];
      sec.parties.forEach(p => { const ks = PARTY_ROLES.map(r => { const o = offOf(p[r]) || {}; return blockId(blockRef(o.homeBlockCode, o.homeBlock)); }); if (new Set(ks).size !== ks.length) b5.push(`${p.partyNo}: repeated home block`); });
      add('2nd – Polling', 'All 4 members have different home blocks', b5, sec.parties.length);
    }
  }
  [['pccp', 'PM', sec.pccp], ['micro', 'MO', sec.micro]].forEach(([kind, role, list]) => {
    if (!list.length) return;
    const nm = kind === 'pccp' ? '2nd – PCCP' : '2nd – Micro';
    const bad = [];
    singlePlan(kind).forEach(p => { const n = list.filter(x => x.const === p.code).length; if (n !== p.target) bad.push(`${p.code}: ${n} selected, expected ${p.target}`); });
    add(nm, 'Count = required + reserve %', bad, singlePlan(kind).length);
    const b2 = [];
    list.forEach(x => { const o = offOf(x.pin); if (!o) b2.push(`${x.orderNo}: PIN ${x.pin} not in officer list`); else if (o.duty !== DUTY_BY_KEY[role].label) b2.push(`${x.orderNo}: ${o.pin} is ${o.duty}`); });
    add(nm, `Officer duty is ${DUTY_BY_KEY[role].label}`, b2, list.length);
  });
  const all = [];
  sec.parties.forEach(p => PARTY_ROLES.forEach(r => all.push([p[r], p.partyNo])));
  sec.pccp.forEach(x => all.push([x.pin, x.orderNo])); sec.micro.forEach(x => all.push([x.pin, x.orderNo]));
  if (all.length) {
    const seen = new Map(), bad = [];
    all.forEach(([pin, where]) => { if (seen.has(pin)) bad.push(`PIN ${pin} used in ${seen.get(pin)} and ${where}`); else seen.set(pin, where); });
    add('2nd – All', 'No officer is used more than once', bad, all.length);
  }

  const fp = Object.keys(fin.polling || {});
  if (fp.length) {
    const bad1 = [], bad2 = [], bad3 = [], used = new Map();
    S.booths.forEach(b => { if (!fin.polling[b.id]) bad1.push(`Booth ${b.const} ${b.no} has no party`); });
    fp.forEach(bid => {
      const b = boothById(bid), pno = fin.polling[bid], p = sec.parties.find(x => x.partyNo === pno);
      if (!b || !p) { bad1.push(`Tag ${bid} → ${pno} refers to missing booth/party`); return; }
      if (p.const !== b.const) bad1.push(`${pno} (${p.const}) tagged to ${b.const} booth ${b.no}`);
      if (used.has(pno)) bad3.push(`${pno} tagged to two booths`); used.set(pno, bid);
      PARTY_ROLES.forEach(r => { const o = offOf(p[r]); if (o && !canServeAt(o, b)) bad2.push(`${pno} at booth ${b.const}-${b.no} (${b.block}): ${DUTY_BY_KEY[r].short} ${o.name} has home "${blockText(o.homeBlockCode, o.homeBlock)}" / posting "${blockText(o.postingBlockCode, o.postingBlock)}"`); });
    });
    add('Final – Polling', 'Every booth gets exactly one party of its constituency', bad1, S.booths.length);
    add('Final – Polling', 'No member\'s home block or posting block = booth block', bad2, fp.length * 4);
    add('Final – Polling', 'No party tagged to more than one booth', bad3, fp.length);
  }
  [['pccp', 'Final – PCCP', sec.pccp], ['micro', 'Final – Micro', sec.micro]].forEach(([kind, nm, list]) => {
    const tags = fin[kind] || {}; const ids = Object.keys(tags);
    if (!ids.length) return;
    const bad1 = [], bad2 = [], used = new Set();
    singlePlan(kind).forEach(p => { const n = ids.filter(id => boothById(id)?.const === p.code).length; if (n !== p.required) bad1.push(`${p.code}: ${n} tagged, required ${p.required}`); });
    ids.forEach(bid => {
      const b = boothById(bid), x = list.find(i => i.orderNo === tags[bid]);
      if (!b || !x) { bad1.push(`Tag ${bid} → ${tags[bid]} refers to missing booth/officer`); return; }
      if (x.const !== b.const) bad1.push(`${x.orderNo} (${x.const}) tagged to ${b.const} booth ${b.no}`);
      if (used.has(x.orderNo)) bad1.push(`${x.orderNo} tagged twice`); used.add(x.orderNo);
      const o = offOf(x.pin); if (o && !canServeAt(o, b)) bad2.push(`${x.orderNo} ${o.name} at booth ${b.const}-${b.no} (${b.block}): home "${blockText(o.homeBlockCode, o.homeBlock)}" / posting "${blockText(o.postingBlockCode, o.postingBlock)}"`);
    });
    add(nm, 'Tagged count and constituency correct', bad1, ids.length);
    add(nm, 'Home block / posting block ≠ booth block', bad2, ids.length);
  });
  return checks;
}
function auditHtml(checks, stages) {
  const list = stages ? checks.filter(c => stages.some(s => c.stage.startsWith(s))) : checks;
  if (!list.length) return '<div class="alert info">Nothing to verify yet.</div>';
  const allOk = list.every(c => c.ok);
  return `<div class="alert ${allOk ? 'ok' : 'bad'}"><b>${allOk ? '✔ All rule checks passed' : '✖ Rule violations found'}</b> — verified independently after randomisation.</div>
  <div class="tbl-wrap" style="max-height:none"><table class="t"><thead><tr><th>Stage</th><th>Rule</th><th>Result</th><th>Details</th></tr></thead><tbody>
  ${list.map(c => `<tr class="${c.ok ? '' : 'err'}"><td class="nowrap">${esc(c.stage)}</td><td>${esc(c.rule)}</td><td>${c.ok ? '<span class="badge b-ok">PASS</span>' : `<span class="badge b-bad">FAIL (${c.bad.length})</span>`}</td><td class="small">${c.ok ? `${c.total} checked` : esc(c.bad.slice(0, 15).join(' · ')) + (c.bad.length > 15 ? ` … +${c.bad.length - 15} more` : '')}</td></tr>`).join('')}
  </tbody></table></div>`;
}
