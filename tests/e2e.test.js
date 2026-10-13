// End-to-end tests in headless Chromium. Run: NODE_PATH=$(npm root -g) node tests/e2e.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const FILE = 'file://' + path.resolve(__dirname, '..', 'MLC_Polling_Personnel_Tool.html');
let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✔ ' + msg); else { failures++; console.log('  ✖ ' + msg); } };

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.type() === 'prompt' ? d.accept('UNLOCK') : d.accept());
  await page.goto(FILE);
  await page.waitForFunction(() => window.__MLC && window.XLSX);

  console.log('1. Page loads offline with no errors');
  ok(errors.length === 0, 'no console/page errors on load: ' + errors.join(' | '));
  const external = await page.evaluate(() => [...document.querySelectorAll('script[src],link[href]')].map(e => e.src || e.href));
  ok(external.length === 0, 'no external script/stylesheet references');

  console.log('2. Small dataset — full workflow through the UI actions');
  await page.evaluate(() => { __MLC.ACT.loadTestData('small'); });
  for (const m of ['setup', 'training', 'officers', 'booths', 'letter1']) {
    await page.evaluate(m => __MLC.ACT.lock(m), m);
    ok(await page.evaluate(m => __MLC.S.locks[m], m), `locked ${m}`);
  }
  for (const k of ['polling', 'pccp', 'micro']) {
    await page.evaluate(k => __MLC.ACT.runSecond(k), k);
    await page.waitForTimeout(1500);
  }
  const sec = await page.evaluate(() => ({ p: __MLC.S.second.parties.length, c: __MLC.S.second.pccp.length, m: __MLC.S.second.micro.length }));
  ok(sec.p === 14 && sec.c === 14 && sec.m === 14, `2nd randomisation formed 14 parties / 14 PCCP / 14 MO (got ${JSON.stringify(sec)})`);
  await page.evaluate(() => __MLC.ACT.lock('second'));
  ok(await page.evaluate(() => __MLC.S.locks.second), 'locked 2nd randomisation');
  for (const k of ['polling', 'pccp', 'micro']) {
    await page.evaluate(k => __MLC.ACT.runFinal(k), k);
    await page.waitForTimeout(1400);
  }
  const fin = await page.evaluate(() => ({ p: Object.keys(__MLC.S.final.polling).length, c: Object.keys(__MLC.S.final.pccp).length, m: Object.keys(__MLC.S.final.micro).length }));
  ok(fin.p === 12 && fin.c === 12 && fin.m === 12, `final tagging 12/12/12 (got ${JSON.stringify(fin)})`);
  await page.evaluate(() => __MLC.ACT.lock('final'));
  ok(await page.evaluate(() => __MLC.S.locks.final), 'locked final randomisation');
  const audit = await page.evaluate(() => __MLC.runAudit().map(c => [c.stage, c.rule, c.ok, c.bad.slice(0, 2)]));
  ok(audit.length >= 12 && audit.every(c => c[2]), `all ${audit.length} audit checks pass`);

  console.log('2b. 2nd / final parts are independent — any order, re-run freely, lock separately');
  await page.evaluate(() => { __MLC.ACT.loadTestData('small'); ['setup', 'training', 'officers', 'booths'].forEach(m => __MLC.ACT.lock(m)); });
  const run2 = async k => { await page.evaluate(k => __MLC.ACT.runSecond(k), k); await page.waitForTimeout(1400); };
  const runF = async k => { await page.evaluate(k => __MLC.ACT.runFinal(k), k); await page.waitForTimeout(1400); };
  const parts = () => page.evaluate(() => JSON.parse(JSON.stringify(__MLC.S.parts)));
  // Micro Observers first, re-run 3 times — must change each time, other parts untouched
  const moSets = new Set();
  for (let i = 0; i < 3; i++) { await run2('micro'); moSets.add(await page.evaluate(() => __MLC.S.second.micro.map(x => x.pin).join())); }
  ok(moSets.size === 3, 'Micro Observers re-run 3× → 3 different selections');
  await page.evaluate(() => __MLC.ACT.lockPart('second:micro'));
  let pt = await parts();
  ok(pt.second.micro && !pt.second.polling && !pt.second.pccp, 'locking Micro Observers locks only Micro Observers');
  ok(await page.evaluate(() => __MLC.S.second.parties.length === 0 && __MLC.S.second.pccp.length === 0), 'polling parties and PCCP not formed by locking MO');
  const moLocked = await page.evaluate(() => __MLC.S.second.micro.map(x => x.pin).join());
  // final for MO can start before polling / PCCP are even formed
  await runF('micro');
  await page.evaluate(() => __MLC.ACT.lockPart('final:micro'));
  ok((await parts()).final.micro, 'MO final tagging done and locked while polling & PCCP not yet formed');
  // PCCP next, then polling, re-running polling several times
  await run2('pccp'); await run2('pccp');
  await page.evaluate(() => __MLC.ACT.lockPart('second:pccp'));
  const pSets = new Set();
  for (let i = 0; i < 3; i++) { await run2('polling'); pSets.add(await page.evaluate(() => __MLC.S.second.parties.map(p => p.PRO + p.P1).join())); }
  ok(pSets.size === 3, 'polling parties re-run 3× → 3 different sets');
  ok(await page.evaluate(m => __MLC.S.second.micro.map(x => x.pin).join() === m && Object.keys(__MLC.S.final.micro).length === 12, moLocked), 're-running polling did not touch locked MO selection or MO booth tagging');
  ok(await page.evaluate(() => !__MLC.S.locks.second), '2nd stage counts as complete only when all parts locked (2/3 now)');
  // a locked part cannot be re-run
  const before = await page.evaluate(() => __MLC.S.second.pccp.map(x => x.pin).join());
  await page.evaluate(() => __MLC.ACT.runSecond('pccp')); await page.waitForTimeout(300);
  ok(await page.evaluate(b => __MLC.S.second.pccp.map(x => x.pin).join() === b, before), 'locked PCCP refuses re-run');
  await page.evaluate(() => __MLC.ACT.lockPart('second:polling'));
  ok(await page.evaluate(() => __MLC.S.locks.second), 'all three parts locked → 2nd stage complete');
  // unlock one part: only that part opens
  await page.evaluate(() => __MLC.ACT.unlockPart('second:pccp'));
  pt = await parts();
  ok(!pt.second.pccp && pt.second.polling && pt.second.micro && pt.final.micro, 'unlocking PCCP leaves polling and MO (2nd + final) locked');
  // MO 2nd cannot be unlocked while its final part is locked
  await page.evaluate(() => __MLC.ACT.unlockPart('second:micro'));
  ok((await parts()).second.micro, 'MO 2nd stays locked while MO final is locked');
  // Excel round-trip keeps part locks; old files (whole-stage lock only) map to all parts locked
  const rtp = await page.evaluate(() => {
    const buf = XLSX.write(__MLC.buildProjectWorkbook(), { bookType: 'xlsx', type: 'array' });
    const st = __MLC.parseProjectWorkbook(XLSX.read(new Uint8Array(buf), { type: 'array' }));
    const cur = __MLC.S;
    __MLC.S = st; const back = JSON.stringify(__MLC.S.parts);
    __MLC.S = cur;
    const old = { app: 'MLC_POLLING_TOOL', locks: { second: true, final: false } };
    __MLC.S = old; const oldParts = JSON.parse(JSON.stringify(__MLC.S.parts));
    __MLC.S = cur;
    return { same: back === JSON.stringify(cur.parts), oldParts };
  });
  ok(rtp.same, 'project Excel round-trip keeps per-part locks');
  ok(rtp.oldParts.second.polling && rtp.oldParts.second.micro && !rtp.oldParts.final.polling, 'older project files: whole-stage lock → all parts locked');
  // finish in a different order: PCCP again, then final polling, then final PCCP
  await run2('pccp'); await page.evaluate(() => __MLC.ACT.lockPart('second:pccp'));
  await runF('polling'); await page.evaluate(() => __MLC.ACT.lockPart('final:polling'));
  await runF('pccp'); await page.evaluate(() => __MLC.ACT.lockPart('final:pccp'));
  ok(await page.evaluate(() => __MLC.S.locks.second && __MLC.S.locks.final && __MLC.runAudit().every(c => c.ok)), 'completed in order MO → PCCP → polling: both stages complete, all rule checks pass');
  ok(errors.length === 0, 'no errors during part-wise workflow: ' + errors.join(' | '));

  console.log('3. Every view, letter and report renders');
  for (const v of ['home', 'setup', 'training', 'officers', 'booths', 'letter1', 'second', 'final', 'reports', 'data']) {
    await page.evaluate(v => __MLC.ACT.go(v), v);
  }
  const docs = await page.evaluate(() => {
    const out = {};
    const count = () => document.querySelectorAll('#docBody .doc').length;
    const close = () => document.querySelectorAll('#modalRoot .overlay').forEach(o => o.remove());
    __MLC.ACT.previewSecond('polling'); out.second = count(); close();
    __MLC.ACT.previewSecond('micro'); out.secondMo = count(); close();
    __MLC.ACT.finalLetters('polling'); out.finalMain = count(); close();
    __MLC.ACT.finalLetters('pccp'); out.finalPccp = count(); close();
    __MLC.ACT.finalLetters('reserve'); out.reserve = count(); close();
    ['commPlan', 'commMatrix', 'boothWise', 'partyWise', 'dispatch', 'reserve', 'remaining', 'blockCheck', 'audit', 'log'].forEach(k => { __MLC.ACT.report(k); out['r_' + k] = count(); close(); });
    document.querySelector('#attDuty') ;
    return out;
  });
  ok(docs.second === 14 && docs.finalMain === 12 && docs.finalPccp === 12, `letters rendered ${JSON.stringify(docs)}`);
  ok(docs.reserve === 2 * 4 + 2 + 2, `reserve letters = 2 parties×4 + 2 PCCP + 2 MO (got ${docs.reserve})`);
  const blockProof = await page.evaluate(() => { __MLC.ACT.report('blockCheck'); const t = document.querySelector('#docBody').innerText; document.querySelectorAll('#modalRoot .overlay').forEach(o => o.remove()); return { bad: (t.match(/✖/g) || []).length, good: (t.match(/✔/g) || []).length }; });
  ok(blockProof.bad === 0 && blockProof.good === 12 * 6, `block exclusion proof: ${blockProof.good} ✔, ${blockProof.bad} ✖`);
  ok(errors.length === 0, 'no errors while rendering: ' + errors.join(' | '));

  console.log('3a. Counterfoil receipt only on the 1st letter; column 4 = "P1 authorised in absence of PO"');
  const rc = await page.evaluate(() => {
    const txt = fn => { fn(); const t = document.querySelector('#docBody').innerText; document.querySelectorAll('#modalRoot .overlay').forEach(o => o.remove()); return t; };
    const first = txt(() => { __MLC.ACT.go('letter1'); __MLC.ACT.previewLetter1(); });
    const others = { second: txt(() => __MLC.ACT.previewSecond('polling')), secondMo: txt(() => __MLC.ACT.previewSecond('micro')), finalMain: txt(() => __MLC.ACT.finalLetters('polling')), finalPccp: txt(() => __MLC.ACT.finalLetters('pccp')), reserve: txt(() => __MLC.ACT.finalLetters('reserve')) };
    return { first: /Counterfoil Receipt/.test(first), withReceipt: Object.entries(others).filter(([, t]) => /Counterfoil Receipt|Signature of Officer/.test(t)).map(([k]) => k), col4: /P1 authorised in absence of PO/i.test(others.finalMain), oldCol4: /PO authorised in absence of PrO/i.test(others.finalMain) };
  });
  ok(rc.first, '1st letter keeps the counterfoil receipt');
  ok(rc.withReceipt.length === 0, '2nd and final letters have no counterfoil receipt ' + rc.withReceipt.join(','));
  ok(rc.col4 && !rc.oldCol4, 'final party letter column 4 reads "P1 authorised in absence of PO"');

  console.log('3c. 4-copy distribution sets with ✔ before PrO / P1 / P2 / P3; power vesting list');
  const four = await page.evaluate(() => {
    const S = __MLC.S, roles = ['PRO', 'P1', 'P2', 'P3'], r = {};
    const check = (open, partyOf) => {
      open(); const docs = [...document.querySelectorAll('#docBody .doc')]; let bad = 0;
      docs.forEach((d, i) => {
        const role = roles[i % 4], p = partyOf(Math.floor(i / 4)), o = S.officers.find(x => x.pin === p[role]);
        const ticks = d.querySelectorAll('.tick:not(.copyfor .tick)');
        if (ticks.length !== 1) { bad++; return; }
        const holder = ticks[0].closest('td,div.po'); if (!holder || !holder.innerText.includes(o.name)) bad++;
        if (!d.querySelector('.copyfor').innerText.includes(`Copy ${i % 4 + 1} of 4`)) bad++;
      });
      document.querySelectorAll('#modalRoot .overlay').forEach(x => x.remove());
      return { n: docs.length, bad };
    };
    r.second = check(() => __MLC.ACT.previewSecond('polling4'), i => S.second.parties[i]);
    const tagged = S.booths.filter(b => S.final.polling[b.id]).map(b => S.second.parties.find(p => p.partyNo === S.final.polling[b.id]));
    r.final = check(() => __MLC.ACT.finalLetters('polling4'), i => tagged[i]);
    __MLC.ACT.previewSecond('polling'); r.officeTicks = document.querySelectorAll('#docBody .tick').length; r.officeN = document.querySelectorAll('#docBody .doc').length;
    document.querySelectorAll('#modalRoot .overlay').forEach(x => x.remove());
    __MLC.ACT.report('powerVesting'); const t = document.querySelector('#docBody').innerText; document.querySelectorAll('#modalRoot .overlay').forEach(x => x.remove());
    r.pv = S.second.parties.every(p => [p.PRO, p.P1].every(pin => t.includes(pin)) && ![p.P2, p.P3].some(pin => t.includes(pin)));
    r.parties = S.second.parties.length; r.booths = tagged.length;
    return r;
  });
  ok(four.second.n === four.parties * 4 && four.second.bad === 0, `2nd letters: ${four.second.n} copies (4 × ${four.parties}), exactly one ✔ on the right member each`);
  ok(four.final.n === four.booths * 4 && four.final.bad === 0, `final letters: ${four.final.n} copies (4 × ${four.booths}), exactly one ✔ on the right member each`);
  ok(four.officeTicks === 0 && four.officeN === four.parties, 'office copy: one letter per party, no tick');
  ok(four.pv, 'power vesting list has PrO and P1 of every party and no P2 / P3');
  await page.evaluate(() => { __MLC.ACT.finalLetters('polling4'); document.querySelector('#printArea').innerHTML = document.querySelector('#docBody').innerHTML; document.querySelectorAll('#modalRoot .overlay').forEach(x => x.remove()); });
  await page.emulateMedia({ media: 'print' });
  const pdf4 = await page.pdf({ preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => { document.querySelector('#printArea').innerHTML = ''; });
  const p4 = (pdf4.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok(p4 === four.booths * 4, `4-copy final letters print as ${p4} A4 pages (expected ${four.booths * 4})`);

  console.log('3d. Communication plan — every booth heading + PrO/P1/P2/P3 verified against the allotment (report and Excel)');
  for (const ds of ['current', 'large']) {
    const cp = await page.evaluate(ds => {
      if (ds === 'large') {
        window.__savedState = JSON.parse(JSON.stringify(__MLC.S));
        __MLC.S = __MLC.generateTestState('large'); const S = __MLC.S;
        S.second.parties = __MLC.formPollingParties().parties; S.parts.second.polling = true;
        S.final.polling = __MLC.finalPolling(); S.parts.final.polling = true;
      }
      const S = __MLC.S, roles = ['PRO', 'P1', 'P2', 'P3'], labels = ['PRESIDING OFFICER', 'POLLING OFFICER-1', 'POLLING OFFICER-2', 'POLLING OFFICER-3'];
      // ground truth computed directly from state, independent of report code
      const truth = S.booths.map(b => { const p = S.second.parties.find(x => x.partyNo === S.final.polling[b.id]); return { b, p, offs: roles.map(r => S.officers.find(o => o.pin === p[r])) }; });
      const errs = [];
      __MLC.ACT.report('commPlan');
      const blocks = [...document.querySelectorAll('#docBody .cp-booth')];
      if (blocks.length !== truth.length) errs.push(`blocks ${blocks.length} vs booths ${truth.length}`);
      blocks.forEach((blk, i) => {
        const t = truth[i]; if (!t) return;
        const head = blk.querySelector('.cp-head').innerText, sub = blk.querySelector('.cp-sub').innerText;
        if (!head.includes('Booth No. ' + t.b.no) || !head.includes(t.b.name)) errs.push(`booth ${i}: heading "${head}"`);
        if (!sub.includes(t.p.partyNo)) errs.push(`booth ${t.b.no}: party ${t.p.partyNo} missing`);
        const rows = [...blk.querySelectorAll('tr')].slice(1).map(tr => [...tr.cells].map(c => c.innerText.trim()));
        if (rows.length !== 4) errs.push(`booth ${t.b.no}: ${rows.length} rows`);
        rows.forEach((r, k) => { const o = t.offs[k]; const want = [labels[k], o.pin, o.name, o.designation, o.mobile]; if (JSON.stringify(r) !== JSON.stringify(want)) errs.push(`booth ${t.b.no} row ${k}: ${r.join('|')} ≠ ${want.join('|')}`); });
      });
      document.querySelectorAll('#modalRoot .overlay').forEach(o => o.remove());
      // Excel export content (same rows the download contains)
      const wb = XLSX.utils.book_new(); addSheet(wb, 'x', COMMPLAN_HEAD, commPlanRows());
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const xr = XLSX.utils.sheet_to_json(XLSX.read(new Uint8Array(buf), { type: 'array' }).Sheets.x, { defval: '', raw: false });
      if (xr.length !== truth.length * 4) errs.push(`excel rows ${xr.length}`);
      truth.forEach((t, i) => t.offs.forEach((o, k) => { const r = xr[i * 4 + k] || {};
        if (String(r['Booth No']) !== String(t.b.no) || r['Party No'] !== t.p.partyNo || r.Post !== labels[k] || String(r.PIN) !== String(o.pin) || r.Name !== o.name || r.Designation !== o.designation || String(r.Mobile) !== String(o.mobile)) errs.push(`excel booth ${t.b.no} row ${k}`); }));
      // every officer appears exactly once and only for the booth his party is tagged to
      const seen = new Set(); truth.forEach(t => t.offs.forEach(o => { if (seen.has(o.pin)) errs.push('dup ' + o.pin); seen.add(o.pin); }));
      return { booths: truth.length, errs: errs.slice(0, 5), n: errs.length };
    }, ds);
    ok(cp.n === 0, `${ds} dataset: ${cp.booths} booths × 4 officers match the allotment in report and Excel ${cp.errs.join(' | ')}`);
  }
  await page.evaluate(() => { __MLC.S = window.__savedState; });
  const cpLocked = await page.evaluate(() => { __MLC.S.parts.final.polling = false; __MLC.ACT.report('commPlan'); const t = document.querySelector('#docBody').innerText; document.querySelectorAll('#modalRoot .overlay').forEach(o => o.remove()); __MLC.S.parts.final.polling = true; return /Lock Polling parties in the final randomisation first/.test(t); });
  ok(cpLocked, 'communication plan is not produced before the final polling tagging is locked');
  const dlc = page.waitForEvent('download'); await page.evaluate(() => __MLC.ACT.exportCommPlan()); const dcp = await dlc;
  ok(/Communication_Plan_.*\.xlsx$/.test(dcp.suggestedFilename()), 'Excel download works: ' + dcp.suggestedFilename());

  console.log('3b. Final party letter shows designation & office and prints one letter per A4 page');
  const fl = await page.evaluate(() => { __MLC.ACT.finalLetters('polling'); const h = document.querySelector('#docBody').innerHTML; document.querySelector('#printArea').innerHTML = h; document.querySelectorAll('#modalRoot .overlay').forEach(o => o.remove());
    const S = __MLC.S, p = S.second.parties.find(x => x.partyNo === S.final.polling[S.booths[0].id]);
    return ['PRO', 'P1', 'P2', 'P3'].every(r => { const o = S.officers.find(x => x.pin === p[r]); return h.includes(o.designation) && h.includes(o.office.replace(/&/g, '&amp;')); }); });
  ok(fl, 'designation and office of PrO, P1, P2, P3 appear in the final letter');
  await page.emulateMedia({ media: 'print' });
  const pdfBuf = await page.pdf({ preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => { document.querySelector('#printArea').innerHTML = ''; });
  const pages = (pdfBuf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok(pages === 12, `12 final letters print as ${pages} A4 pages`);

  console.log('4. Project Excel round-trip');
  const rt = await page.evaluate(() => {
    const wb = __MLC.buildProjectWorkbook();
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const st = __MLC.parseProjectWorkbook(XLSX.read(new Uint8Array(buf), { type: 'array' }));
    const a = __MLC.S;
    const strip = o => JSON.stringify(o);
    const boothKey = (s, id) => { const b = s.booths.find(x => x.id === id); return b.const + '|' + b.no; };
    const fin = s => Object.fromEntries(Object.entries(s.final.polling).map(([k, v]) => [boothKey(s, k), v]));
    return {
      setup: strip(Object.assign({}, a.setup, { signature: '' })) === strip(Object.assign({}, st.setup, { signature: '' })),
      cons: strip(a.constituencies) === strip(st.constituencies),
      training: strip(a.training) === strip(st.training),
      officers: strip(a.officers) === strip(st.officers),
      booths: strip(a.booths.map(b => [b.const, b.no, b.ext, b.name, b.block])) === strip(st.booths.map(b => [b.const, b.no, b.ext, b.name, b.block])),
      parties: strip(a.second.parties) === strip(st.second.parties),
      pccp: strip(a.second.pccp) === strip(st.second.pccp),
      final: strip(fin(a)) === strip(fin(st)),
      locks: strip(a.locks) === strip(st.locks),
      size: buf.byteLength,
    };
  });
  Object.entries(rt).forEach(([k, v]) => { if (k !== 'size') ok(v === true, `round-trip preserves ${k}`); });

  console.log('5. Repeated randomisation — rules hold every time');
  const rep = await page.evaluate(() => {
    const res = { small: 0, large: 0, fail: [], ms: 0 };
    for (const [key, n] of [['small', 200], ['large', 15]]) {
      __MLC.S = __MLC.generateTestState(key);
      const S = __MLC.S;
      for (let i = 0; i < n; i++) {
        const t = performance.now();
        S.second.parties = __MLC.formPollingParties().parties;
        S.second.pccp = __MLC.formSingles('pccp').items;
        S.second.micro = __MLC.formSingles('micro').items;
        S.final.polling = __MLC.finalPolling();
        S.final.pccp = __MLC.finalSingles('pccp');
        S.final.micro = __MLC.finalSingles('micro');
        res.ms = Math.max(res.ms, performance.now() - t);
        const bad = __MLC.runAudit().filter(c => !c.ok);
        if (bad.length) res.fail.push(key + ': ' + bad.map(c => c.rule + ' ' + c.bad[0]).join('; ')); else res[key]++;
      }
    }
    return res;
  });
  ok(rep.small === 200 && rep.large === 15 && !rep.fail.length, `small 200/200, large 15/15 runs passed all rules (slowest full run ${rep.ms.toFixed(0)} ms) ${rep.fail.slice(0, 2).join(' | ')}`);

  console.log('5b. Main / Aux booth type survives Excel save & open (large dataset has Aux booths)');
  const aux = await page.evaluate(() => {
    __MLC.S = __MLC.generateTestState('large');
    const before = __MLC.S.booths.filter(b => b.ext === 'Aux').length;
    const buf = XLSX.write(__MLC.buildProjectWorkbook(), { bookType: 'xlsx', type: 'array' });
    const st = __MLC.parseProjectWorkbook(XLSX.read(new Uint8Array(buf), { type: 'array' }));
    return { before, after: st.booths.filter(b => b.ext === 'Aux').length };
  });
  ok(aux.before > 0 && aux.after === aux.before, `Aux booths: ${aux.before} saved → ${aux.after} reopened`);

  console.log('6. Randomness — party composition and booth tagging vary between runs');
  const vary = await page.evaluate(() => {
    __MLC.S = __MLC.generateTestState('small');
    const S = __MLC.S, sigs = new Set(), tags = new Set();
    for (let i = 0; i < 30; i++) {
      S.second.parties = __MLC.formPollingParties().parties;
      sigs.add(S.second.parties.map(p => p.PRO + p.P1 + p.P2 + p.P3).sort().join());
      S.final.polling = __MLC.finalPolling();
      tags.add(JSON.stringify(S.final.polling));
    }
    return [sigs.size, tags.size];
  });
  ok(vary[0] === 30 && vary[1] === 30, `30 runs → ${vary[0]} distinct party sets, ${vary[1]} distinct taggings`);

  console.log('7. Constraint is really binding — infeasible data is refused with a reason');
  const inf = await page.evaluate(() => {
    __MLC.S = __MLC.generateTestState('small');
    const S = __MLC.S;
    // every Presiding Officer either lives or works in Piprahi → no PrO for Piprahi booths
    const pc = S.booths.find(b => b.block === 'Piprahi').blockCode;
    S.officers.filter(o => o.duty === 'PRESIDING OFFICER').forEach(o => { o.homeBlock = 'Piprahi'; o.homeBlockCode = pc; });
    try { __MLC.formPollingParties(); return 'formed'; } catch (e) { return e.message; }
  });
  ok(/Piprahi/.test(inf) && /PRESIDING OFFICER/.test(inf), 'refuses and names block + duty: ' + inf.split('\n')[1]);
  const inf2 = await page.evaluate(() => {
    __MLC.S = __MLC.generateTestState('small');
    __MLC.S.officers.filter(o => ['PRESIDING OFFICER', 'POLLING OFFICER-1'].includes(o.duty)).forEach(o => { o.office = 'Same Office'; o.officeCode = ''; });
    try { __MLC.formPollingParties(); return 'formed'; } catch (e) { return e.message; }
  });
  ok(/different|tight|offices/i.test(inf2), 'different-office rule enforced when PrO and P1 all share one office: ' + inf2.slice(0, 90));
  const relax = await page.evaluate(() => { __MLC.S.setup.ruleDistinctOffice = false; try { return __MLC.formPollingParties().parties.length; } catch (e) { return e.message; } });
  ok(relax === 14, 'same data forms parties once the office rule is switched off');

  console.log('7b. PCCP & Micro Observer never tagged in their home or posting block (independent check)');
  const pm = await page.evaluate(() => {
    const norm = s => String(s || '').toLowerCase().replace(/\b(block|prakhand|blk)\b/g, ' ').replace(/[^a-z0-9]+/g, '');
    const check = S => { let n = 0, bad = 0; for (const kind of ['pccp', 'micro']) for (const [bid, ord] of Object.entries(S.final[kind])) {
      const b = S.booths.find(x => x.id === bid), it = S.second[kind].find(x => x.orderNo === ord), o = S.officers.find(x => x.pin === it.pin);
      n++; if ([o.homeBlock, o.postingBlock].map(norm).includes(norm(b.block))) bad++; } return [n, bad]; };
    const run = S => { S.second.pccp = __MLC.formSingles('pccp').items; S.second.micro = __MLC.formSingles('micro').items; S.final.pccp = __MLC.finalSingles('pccp'); S.final.micro = __MLC.finalSingles('micro'); return check(S); };
    let n = 0, bad = 0;
    __MLC.S = __MLC.generateTestState('small');
    const S = __MLC.S, blocks = [...new Set(S.booths.map(b => b.block))];
    // tight: every PCCP/MO has home and posting block inside booth blocks
    const codeOf = n => S.booths.find(b => b.block === n).blockCode;
    S.officers.filter(o => /PATROLLING|MICRO/.test(o.duty)).forEach((o, i) => { o.homeBlock = blocks[i % blocks.length]; o.postingBlock = blocks[(i + 1) % blocks.length]; o.homeBlockCode = codeOf(o.homeBlock); o.postingBlockCode = codeOf(o.postingBlock); });
    for (let i = 0; i < 150; i++) { const [a, c] = run(S); n += a; bad += c; }
    __MLC.S = __MLC.generateTestState('small'); const X = __MLC.S.booths[0].block, XC = __MLC.S.booths[0].blockCode;
    __MLC.S.officers.filter(o => o.duty === 'MICRO OBSERVER').forEach(o => { o.homeBlock = X; o.homeBlockCode = XC; });
    let msg = 'placed'; try { __MLC.formSingles('micro'); } catch (e) { msg = e.message; }
    return { n, bad, msg, X };
  });
  ok(pm.n === 150 * 24 && pm.bad === 0, `${pm.n} PCCP/MO tags on tight data, ${pm.bad} in own home/posting block`);
  ok(pm.msg.includes(pm.X) && /MICRO OBSERVER/.test(pm.msg), 'impossible MO data refused, naming the block: ' + pm.msg.split('\n')[1]);

  console.log('7c. Codes decide "same office" and "same block" — spelling mistakes do not matter');
  const codes = await page.evaluate(() => {
    const res = {};
    // (a) all PrO and P1 share one OFFICE CODE but every office NAME is spelt differently → must still count as one office
    __MLC.S = __MLC.generateTestState('small');
    __MLC.S.officers.filter(o => ['PRESIDING OFFICER', 'POLLING OFFICER-1'].includes(o.duty)).forEach((o, i) => { o.officeCode = '55555'; o.office = 'Office spelling ' + i; });
    try { __MLC.formPollingParties(); res.sameCode = 'formed'; } catch (e) { res.sameCode = 'refused'; }
    // (b) identical office NAME for everybody but distinct OFFICE CODES → treated as different offices → parties form
    __MLC.S = __MLC.generateTestState('small');
    __MLC.S.officers.forEach((o, i) => { o.office = 'Middle School'; o.officeCode = 'X' + i; });
    try { res.diffCode = __MLC.formPollingParties().parties.length; } catch (e) { res.diffCode = e.message; }
    // (c) block NAMES misspelt for every officer, codes correct → exclusion still applied by code
    __MLC.S = __MLC.generateTestState('small');
    const S = __MLC.S;
    S.officers.forEach(o => { o.homeBlock = o.homeBlock + ' xx'; o.postingBlock = 'P-' + o.postingBlock.toUpperCase() + 'aa'; });
    let viol = 0, tags = 0;
    for (let i = 0; i < 60; i++) {
      S.second.parties = __MLC.formPollingParties().parties; S.second.pccp = __MLC.formSingles('pccp').items; S.second.micro = __MLC.formSingles('micro').items;
      S.final.polling = __MLC.finalPolling(); S.final.pccp = __MLC.finalSingles('pccp'); S.final.micro = __MLC.finalSingles('micro');
      const byCode = pin => { const o = S.officers.find(x => x.pin === pin); return [o.homeBlockCode, o.postingBlockCode]; };
      Object.entries(S.final.polling).forEach(([bid, pno]) => { const b = S.booths.find(x => x.id === bid), p = S.second.parties.find(x => x.partyNo === pno);
        ['PRO', 'P1', 'P2', 'P3'].forEach(r => { tags++; if (byCode(p[r]).includes(b.blockCode)) viol++; }); });
      ['pccp', 'micro'].forEach(k => Object.entries(S.final[k]).forEach(([bid, ord]) => { const b = S.booths.find(x => x.id === bid), it = S.second[k].find(x => x.orderNo === ord); tags++; if (byCode(it.pin).includes(b.blockCode)) viol++; }));
    }
    res.viol = viol; res.tags = tags;
    // (d) without codes, the same misspelling WOULD defeat the name match — proves codes are what protects
    S.officers.forEach(o => { o.homeBlockCode = ''; o.postingBlockCode = ''; });
    S.booths.forEach(b => { b.blockCode = ''; });
    S.final.polling = __MLC.finalPolling();
    res.namesOnlyBlind = Object.entries(S.final.polling).some(([bid, pno]) => { const b = S.booths.find(x => x.id === bid), p = S.second.parties.find(x => x.partyNo === pno); return ['PRO', 'P1', 'P2', 'P3'].some(r => S.officers.find(x => x.pin === p[r]).postingBlock.toLowerCase().includes(b.block.toLowerCase())); });
    return res;
  });
  ok(codes.sameCode === 'refused', 'same office code + different spellings → treated as ONE office (different-office rule binds)');
  ok(codes.diffCode === 14, 'same office name + different codes → treated as different offices');
  ok(codes.viol === 0 && codes.tags > 3000, `misspelt block names, correct codes: ${codes.tags} tags, ${codes.viol} in own home/posting block`);
  ok(codes.namesOnlyBlind === true, 'control: with codes removed, misspelt names alone would not have been caught');

  console.log('7e. Out-of-district home / posting block (999999, "Others") excludes nothing');
  const od = await page.evaluate(() => {
    __MLC.S = __MLC.generateTestState('small'); const S = __MLC.S;
    const blocks = [...new Set(S.booths.map(b => b.block))];
    // 6 officers of each party duty fully outside the district; 6 with only home outside
    const full = [], half = [];
    ['PRESIDING OFFICER', 'POLLING OFFICER-1', 'POLLING OFFICER-2', 'POLLING OFFICER-3', 'PATROLLING MAGISTRATE', 'MICRO OBSERVER'].forEach(d => {
      const list = S.officers.filter(o => o.duty === d);
      list.slice(0, 6).forEach(o => { o.homeBlock = 'Others'; o.homeBlockCode = '999999'; o.postingBlock = 'Other District'; o.postingBlockCode = '999999'; full.push(o.pin); });
      list.slice(6, 12).forEach(o => { o.homeBlock = 'Others'; o.homeBlockCode = '999999'; half.push(o.pin); });
    });
    const v = __MLC.validateOfficers();
    const fullBlocks = new Set(); let halfViol = 0, otherViol = 0;
    for (let i = 0; i < 120; i++) {
      S.second.parties = __MLC.formPollingParties().parties; S.second.pccp = __MLC.formSingles('pccp').items; S.second.micro = __MLC.formSingles('micro').items;
      S.final.polling = __MLC.finalPolling(); S.final.pccp = __MLC.finalSingles('pccp'); S.final.micro = __MLC.finalSingles('micro');
      const visit = (pin, b) => { const o = S.officers.find(x => x.pin === pin);
        if (full.includes(pin)) fullBlocks.add(b.block);
        else if (half.includes(pin)) { if (o.postingBlockCode === b.blockCode) halfViol++; }
        else if ([o.homeBlockCode, o.postingBlockCode].includes(b.blockCode)) otherViol++; };
      Object.entries(S.final.polling).forEach(([bid, pno]) => { const b = S.booths.find(x => x.id === bid), p = S.second.parties.find(x => x.partyNo === pno); ['PRO', 'P1', 'P2', 'P3'].forEach(r => visit(p[r], b)); });
      ['pccp', 'micro'].forEach(k => Object.entries(S.final[k]).forEach(([bid, ord]) => visit(S.second[k].find(x => x.orderNo === ord).pin, S.booths.find(x => x.id === bid))));
    }
    const warnOut = v.warnings.filter(w => /999999|Others|Other District/.test(w));
    S.booths[0].blockCode = '999999';
    const boothErr = __MLC.validateBooths().errors.some(e => /out-of-district/.test(e));
    return { allBlocks: blocks.length, fullBlocks: fullBlocks.size, halfViol, otherViol, warnOut: warnOut.length, boothErr, errs: v.errors.length };
  });
  ok(od.fullBlocks === od.allBlocks, `officers with home & posting 999999 were tagged in all ${od.allBlocks} blocks (${od.fullBlocks})`);
  ok(od.halfViol === 0, 'home 999999 but posting in-district → still never tagged in posting block');
  ok(od.otherViol === 0, 'all other officers still never tagged in home / posting block');
  ok(od.errs === 0 && od.warnOut === 0, 'no errors / warnings raised for 999999 / "Others" blocks');
  ok(od.boothErr, 'a booth cannot use the out-of-district code');

  console.log('7f. Word (.docx) export of letters');
  const wd = await page.evaluate(() => {
    __MLC.S = __MLC.generateTestState('small'); const S = __MLC.S;
    S.second.parties = __MLC.formPollingParties().parties; S.parts.second.polling = true;
    S.final.polling = __MLC.finalPolling(); S.parts.final.polling = true;
    __MLC.ACT.finalLetters('polling');
    const data = buildDocx(document.querySelector('#docBody'), 'Final letters');
    document.querySelectorAll('#modalRoot .overlay').forEach(o => o.remove());
    const z = XLSX.CFB.read(data, { type: 'array' });
    const doc = z.FileIndex.find(f => f.name === 'document.xml');
    const xml = new TextDecoder().decode(doc.content);
    const p = S.second.parties.find(x => x.partyNo === S.final.polling[S.booths[0].id]), pro = S.officers.find(o => o.pin === p.PRO);
    return { zipOk: !!doc, pageBreaks: (xml.match(/<w:pageBreakBefore\/>/g) || []).length, hasName: xml.includes(pro.name), hasDesig: xml.includes(pro.designation), wellFormed: !new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror') };
  });
  ok(wd.zipOk && wd.wellFormed, 'docx is a valid zip with well-formed document.xml');
  ok(wd.pageBreaks === 11, `12 letters → 11 page breaks (got ${wd.pageBreaks})`);
  ok(wd.hasName && wd.hasDesig, 'Word file contains officer name and designation');

  console.log('7g. Exemptions — removed from 2nd & final randomisation, with reason and register');
  const exr = await page.evaluate(async () => {
    const r = {};
    __MLC.S = __MLC.generateTestState('small'); const S = __MLC.S;
    ['setup', 'training', 'officers', 'booths'].forEach(m => { S.locks[m] = true; });
    __MLC.ACT.go('exempt');
    const pick = d => S.officers.filter(o => o.duty === d).slice(0, 2).map(o => o.pin);
    const byPin = [...pick('PRESIDING OFFICER'), ...pick('MICRO OBSERVER')];
    // reason is mandatory
    document.querySelector('#exPins').value = byPin.join(', ');
    __MLC.ACT.exemptByPin(); r.noReason = Object.keys(S.exempt).length;
    document.querySelector('#exReason').value = 'Medical certificate'; document.querySelector('#exCat').value = 'Medical'; document.querySelector('#exOrder').value = 'Memo 12';
    document.querySelector('#exPins').value = byPin.join(', ');
    __MLC.ACT.exemptByPin(); r.afterPin = Object.keys(S.exempt).length;
    // tick two P3 and one PCCP
    const ticks = [...pick('POLLING OFFICER-3'), pick('PATROLLING MAGISTRATE')[0]];
    ticks.forEach(pin => { const cb = document.querySelector(`input[data-chg="exTick"][data-arg="${pin}"]`) || (() => { __MLC.ACT.exSearch(null, { value: pin, selectionStart: 0 }); return document.querySelector(`input[data-chg="exTick"][data-arg="${pin}"]`); })(); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
    document.querySelector('#exReason').value = 'Transferred out of district'; document.querySelector('#exCat').value = 'Administrative';
    __MLC.ACT.exemptTicked(); r.afterTick = Object.keys(S.exempt).length;
    r.cats = Object.values(S.exempt).map(e => e.category).sort().join();
    const exempted = new Set(Object.keys(S.exempt));
    // randomise many times: exempted never selected / tagged
    let hit = 0;
    for (let i = 0; i < 80; i++) {
      S.second.parties = __MLC.formPollingParties().parties; S.second.pccp = __MLC.formSingles('pccp').items; S.second.micro = __MLC.formSingles('micro').items;
      S.final.polling = __MLC.finalPolling(); S.final.pccp = __MLC.finalSingles('pccp'); S.final.micro = __MLC.finalSingles('micro');
      S.second.parties.forEach(p => ['PRO', 'P1', 'P2', 'P3'].forEach(k => { if (exempted.has(p[k])) hit++; }));
      ['pccp', 'micro'].forEach(k => S.second[k].forEach(x => { if (exempted.has(x.pin)) hit++; }));
    }
    r.hit = hit;
    r.auditOk = __MLC.runAudit().every(c => c.ok);
    // exempting an officer in an UNLOCKED part clears that part; in a LOCKED part is refused
    const inMo = S.second.micro[0].pin, inParty = S.second.parties[0].PRO;
    S.parts.second.polling = true;
    __MLC.ACT.go('exempt');
    document.querySelector('#exReason').value = 'test'; document.querySelector('#exPins').value = inParty;
    __MLC.ACT.exemptByPin(); r.lockedRefused = !S.exempt[inParty] && S.second.parties.length > 0;
    document.querySelectorAll('#modalRoot .overlay').forEach(o => o.remove());
    document.querySelector('#exReason').value = 'test'; document.querySelector('#exPins').value = inMo;
    __MLC.ACT.exemptByPin(); r.unlockedCleared = !!S.exempt[inMo] && S.second.micro.length === 0 && Object.keys(S.final.micro).length === 0 && S.second.parties.length > 0;
    // restore
    __MLC.ACT.restoreExempt(inMo); r.restored = !S.exempt[inMo];
    // a forced violation is caught by the audit
    S.parts.second.polling = false; S.second.parties[0].PRO = [...exempted][0];
    r.auditCatches = __MLC.runAudit().some(c => c.rule === 'No exempted officer is selected' && !c.ok);
    // Excel round-trip
    const buf = XLSX.write(__MLC.buildProjectWorkbook(), { bookType: 'xlsx', type: 'array' });
    const st = __MLC.parseProjectWorkbook(XLSX.read(new Uint8Array(buf), { type: 'array' }));
    r.roundTrip = JSON.stringify(Object.keys(st.exempt).sort()) === JSON.stringify(Object.keys(S.exempt).sort()) && st.exempt[byPin[0]].reason === 'Medical certificate' && st.exempt[byPin[0]].orderRef === 'Memo 12';
    // register report
    __MLC.ACT.report('exempted'); const t = document.querySelector('#docBody').innerText; document.querySelectorAll('#modalRoot .overlay').forEach(o => o.remove());
    const o0 = S.officers.find(o => o.pin === byPin[0]);
    r.report = t.includes(o0.name) && t.includes('Medical certificate') && t.includes('Transferred out of district');
    return r;
  });
  ok(exr.noReason === 0, 'exemption without a reason is refused');
  ok(exr.afterPin === 4 && exr.afterTick === 7, `exempt by PIN (4) and by tick-box (+3) → ${exr.afterTick}`);
  ok(exr.hit === 0, 'in 80 full randomisations no exempted officer was selected or tagged');
  ok(exr.auditOk, 'all rule checks pass with exemptions');
  ok(exr.lockedRefused, 'officer in a LOCKED part cannot be exempted');
  ok(exr.unlockedCleared, 'exempting an officer in an unlocked part discards only that part');
  ok(exr.restored, 'exemption can be withdrawn (Restore)');
  ok(exr.auditCatches, 'rule check flags an exempted officer if one is ever selected');
  ok(exr.roundTrip, 'exemptions with reason / order ref survive project Excel save & open');
  ok(exr.report, 'Exemption Register lists name and reasons');
  ok(errors.length === 0, 'no errors in exemption flow: ' + errors.join(' | '));

  console.log('7d. Secrecy — randomisation screens show PINs only');
  const secrecy = await page.evaluate(async () => {
    __MLC.S = __MLC.generateTestState('small'); const S = __MLC.S;
    ['setup', 'training', 'officers', 'booths'].forEach(m => { S.locks[m] = true; });
    S.second.parties = __MLC.formPollingParties().parties; S.second.pccp = __MLC.formSingles('pccp').items; S.second.micro = __MLC.formSingles('micro').items;
    ['polling', 'pccp', 'micro'].forEach(k => { S.parts.second[k] = true; });
    S.final.polling = __MLC.finalPolling(); S.final.pccp = __MLC.finalSingles('pccp'); S.final.micro = __MLC.finalSingles('micro');
    const leaks = [];
    for (const [view, subs] of [['second', ['polling', 'pccp', 'micro']], ['final', ['polling', 'pccp', 'micro']]]) {
      for (const sub of subs) {
        __MLC.ACT.go(view); __MLC.ACT.sub(view + ':' + sub);
        const text = document.querySelector('#view').innerText;
        const parties = view === 'final' ? S.second.parties.filter(p => Object.values(S.final.polling).includes(p.partyNo)) : S.second.parties;
        const singles = sub === 'polling' ? [] : view === 'final' ? S.second[sub].filter(x => Object.values(S.final[sub]).includes(x.orderNo)) : S.second[sub];
        const list = sub === 'polling' ? parties.flatMap(p => [p.PRO, p.P1, p.P2, p.P3]) : singles.map(x => x.pin);
        const offs = list.map(pin => S.officers.find(o => o.pin === pin));
        // booth locations may legitimately contain office-like words, so offices are checked on the 2nd screen only
        offs.forEach(o => { [o.name, o.mobile, view === 'second' ? o.office : ''].forEach(v => { if (v && text.includes(v)) leaks.push(`${view}/${sub}: ${v}`); }); });
        if (!offs.every(o => text.includes(o.pin))) leaks.push(`${view}/${sub}: PINs missing`);
      }
    }
    // letters still carry full details
    S.parts.final.polling = true; __MLC.ACT.finalLetters('polling');
    const letter = document.querySelector('#docBody').innerText; document.querySelectorAll('#modalRoot .overlay').forEach(o => o.remove());
    const p = S.second.parties.find(x => x.partyNo === S.final.polling[S.booths[0].id]); const pro = S.officers.find(o => o.pin === p.PRO);
    return { leaks: leaks.slice(0, 5), n: leaks.length, letterHasName: letter.includes(pro.name) && letter.includes(pro.designation) };
  });
  ok(secrecy.n === 0, 'no name / office / designation / mobile on 2nd or final randomisation screens ' + secrecy.leaks.join(' | '));
  ok(secrecy.letterHasName, 'final letters still show full name and designation');

  console.log('8. Validation catches bad data');
  const v = await page.evaluate(() => { __MLC.S = __MLC.generateErrorState(); return { o: __MLC.validateOfficers().errors, ow: __MLC.validateOfficers().warnings, b: __MLC.validateBooths().errors }; });
  ok(v.o.some(e => /duplicate PIN/.test(e)), 'duplicate PIN'); ok(v.o.some(e => /posting block \(name or code\) missing/.test(e)), 'missing posting block');
  ok(v.o.some(e => /DRIVER/.test(e)), 'unknown duty'); ok(v.o.some(e => /office name \/ office code missing/.test(e)), 'missing office');
  ok(v.ow.some(e => /Piprahee/.test(e)), 'misspelt block warning'); ok(v.ow.some(e => /98765/.test(e)), 'short mobile warning');
  ok(v.ow.some(e => /code 99999 has different spellings/.test(e)), 'warns: one office code used with two names');
  ok(v.ow.some(e => /different codes/.test(e) && /7777/.test(e)), 'warns: block name appearing with a different code');
  ok(v.b.some(e => /block name or block code missing/.test(e)) && v.b.some(e => /XC/.test(e)) && v.b.some(e => /repeated/.test(e)), 'booth errors (no block, unknown constituency, duplicate)');

  console.log('9. Booth entry is independent of officers / training / 1st letter');
  const indep = await page.evaluate(() => {
    __MLC.S = __MLC.generateTestState('small');
    const S = __MLC.S;
    __MLC.ACT.lock('setup');
    __MLC.ACT.lock('booths');
    return { booths: S.locks.booths, officers: S.locks.officers, training: S.locks.training };
  });
  ok(indep.booths && !indep.officers && !indep.training, 'booths locked with only Setup locked');

  console.log('10. Legacy JSON + Excel templates');
  const legacy = await page.evaluate(() => {
    __MLC.S = { app: 'MLC_POLLING_TOOL' };
    return true;
  });
  const setupJson = path.resolve(__dirname, 'fixtures', 'Setup_ConfigJson_Sheohar.json');
  if (fs.existsSync(setupJson)) {
    const fc = page.waitForEvent('filechooser');
    await page.evaluate(() => { __MLC.ACT.importLegacySetup(); });
    (await fc).setFiles(setupJson);
    await page.waitForTimeout(500);
    const imp = await page.evaluate(() => ({ d: __MLC.S.setup.district, c: __MLC.S.constituencies, t: __MLC.S.training['MICRO OBSERVER'][1] }));
    ok(imp.d === 'Sheohar' && imp.c.length === 2 && imp.c[0].name === '04-Tirhut Teachers' && imp.c[1].micro === 6, 'legacy Setup JSON imported');
    ok(imp.t.date === '2026-10-12' && imp.t.venue === 'Khel Bhawan, Sheohar', 'training inside legacy Setup JSON imported');
  }

  // Produce the shipped test-data workbooks through the real download path
  if (process.env.WRITE_TEST_DATA) {
    const outDir = path.resolve(__dirname, '..', 'test-data');
    for (const k of ['small', 'large', 'errors']) {
      const dl = page.waitForEvent('download');
      await page.evaluate(k => __MLC.ACT.downloadTestData(k), k);
      const d = await dl; await d.saveAs(path.join(outDir, d.suggestedFilename()));
      console.log('  wrote test-data/' + d.suggestedFilename());
    }
    for (const a of ['officerTemplate', 'boothTemplate']) {
      const dl = page.waitForEvent('download');
      await page.evaluate(a => __MLC.ACT[a](), a);
      const d = await dl; await d.saveAs(path.join(outDir, d.suggestedFilename()));
      console.log('  wrote test-data/' + d.suggestedFilename());
    }
  }

  console.log('11. Opening a downloaded test project through the UI');
  const small = path.resolve(__dirname, '..', 'test-data', 'TEST_Sheohar_Project.xlsx');
  if (fs.existsSync(small)) {
    const fc = page.waitForEvent('filechooser');
    await page.evaluate(() => { __MLC.ACT.openProject(); });
    (await fc).setFiles(small);
    await page.waitForFunction(() => __MLC.S.officers.length > 0);
    const o = await page.evaluate(() => ({ off: __MLC.S.officers.length, b: __MLC.S.booths.length, t: __MLC.S.training['PRESIDING OFFICER'][0].venue }));
    ok(o.off > 50 && o.b === 12 && o.t, `opened test project: ${o.off} officers, ${o.b} booths`);
  }

  ok(errors.length === 0, 'no console/page errors overall: ' + errors.join(' | '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL TESTS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
