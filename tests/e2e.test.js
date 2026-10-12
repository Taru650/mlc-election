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
  await page.evaluate(() => __MLC.ACT.runFinal('all'));
  await page.waitForTimeout(1500);
  const fin = await page.evaluate(() => ({ p: Object.keys(__MLC.S.final.polling).length, c: Object.keys(__MLC.S.final.pccp).length, m: Object.keys(__MLC.S.final.micro).length }));
  ok(fin.p === 12 && fin.c === 12 && fin.m === 12, `final tagging 12/12/12 (got ${JSON.stringify(fin)})`);
  await page.evaluate(() => __MLC.ACT.lock('final'));
  ok(await page.evaluate(() => __MLC.S.locks.final), 'locked final randomisation');
  const audit = await page.evaluate(() => __MLC.runAudit().map(c => [c.stage, c.rule, c.ok, c.bad.slice(0, 2)]));
  ok(audit.length >= 12 && audit.every(c => c[2]), `all ${audit.length} audit checks pass`);

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
    ['commPlan', 'boothWise', 'partyWise', 'dispatch', 'reserve', 'remaining', 'blockCheck', 'audit', 'log'].forEach(k => { __MLC.ACT.report(k); out['r_' + k] = count(); close(); });
    document.querySelector('#attDuty') ;
    return out;
  });
  ok(docs.second === 14 && docs.finalMain === 12 && docs.finalPccp === 12, `letters rendered ${JSON.stringify(docs)}`);
  ok(docs.reserve === 2 * 4 + 2 + 2, `reserve letters = 2 parties×4 + 2 PCCP + 2 MO (got ${docs.reserve})`);
  const blockProof = await page.evaluate(() => { __MLC.ACT.report('blockCheck'); const t = document.querySelector('#docBody').innerText; document.querySelectorAll('#modalRoot .overlay').forEach(o => o.remove()); return { bad: (t.match(/✖/g) || []).length, good: (t.match(/✔/g) || []).length }; });
  ok(blockProof.bad === 0 && blockProof.good === 12 * 6, `block exclusion proof: ${blockProof.good} ✔, ${blockProof.bad} ✖`);
  ok(errors.length === 0, 'no errors while rendering: ' + errors.join(' | '));

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
    S.officers.filter(o => o.duty === 'PRESIDING OFFICER').forEach(o => { o.homeBlock = 'Piprahi'; });
    try { __MLC.formPollingParties(); return 'formed'; } catch (e) { return e.message; }
  });
  ok(/Piprahi/.test(inf) && /PRESIDING OFFICER/.test(inf), 'refuses and names block + duty: ' + inf.split('\n')[1]);
  const inf2 = await page.evaluate(() => {
    __MLC.S = __MLC.generateTestState('small');
    __MLC.S.officers.filter(o => ['PRESIDING OFFICER', 'POLLING OFFICER-1'].includes(o.duty)).forEach(o => { o.office = 'Same Office'; });
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
    S.officers.filter(o => /PATROLLING|MICRO/.test(o.duty)).forEach((o, i) => { o.homeBlock = blocks[i % blocks.length]; o.postingBlock = blocks[(i + 1) % blocks.length]; });
    for (let i = 0; i < 150; i++) { const [a, c] = run(S); n += a; bad += c; }
    __MLC.S = __MLC.generateTestState('small'); const X = __MLC.S.booths[0].block;
    __MLC.S.officers.filter(o => o.duty === 'MICRO OBSERVER').forEach(o => { o.homeBlock = X; });
    let msg = 'placed'; try { __MLC.formSingles('micro'); } catch (e) { msg = e.message; }
    return { n, bad, msg, X };
  });
  ok(pm.n === 150 * 24 && pm.bad === 0, `${pm.n} PCCP/MO tags on tight data, ${pm.bad} in own home/posting block`);
  ok(pm.msg.includes(pm.X) && /MICRO OBSERVER/.test(pm.msg), 'impossible MO data refused, naming the block: ' + pm.msg.split('\n')[1]);

  console.log('8. Validation catches bad data');
  const v = await page.evaluate(() => { __MLC.S = __MLC.generateErrorState(); return { o: __MLC.validateOfficers().errors, ow: __MLC.validateOfficers().warnings, b: __MLC.validateBooths().errors }; });
  ok(v.o.some(e => /duplicate PIN/.test(e)), 'duplicate PIN'); ok(v.o.some(e => /posting block missing/.test(e)), 'missing posting block');
  ok(v.o.some(e => /DRIVER/.test(e)), 'unknown duty'); ok(v.o.some(e => /office name missing/.test(e)), 'missing office');
  ok(v.ow.some(e => /Piprahee/.test(e)), 'misspelt block warning'); ok(v.ow.some(e => /98765/.test(e)), 'short mobile warning');
  ok(v.b.some(e => /block missing/.test(e)) && v.b.some(e => /XC/.test(e)) && v.b.some(e => /repeated/.test(e)), 'booth errors (no block, unknown constituency, duplicate)');

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
