/* =====================================================================
 * Attendance sheets of SELECTED personnel only
 *  After 2nd randomisation : polling parties (party-wise, duty-wise),
 *                            Micro Observers (order-wise)
 *  After final randomisation: main parties, reserve parties (party-wise)
 * Each: printable (PDF / Word) and Excel.
 * ===================================================================== */
const byPartyNo = (a, b) => a.partyNo.localeCompare(b.partyNo, undefined, { numeric: true });
const byOrderNo = (a, b) => a.orderNo.localeCompare(b.orderNo, undefined, { numeric: true });

/** Returns { title, groups: [{ head, sub, rows: [{ ref, post, o }] }], refCol, needs } for an attendance kind. */
function attendanceData(kind) {
  if (kind.startsWith('cnt')) return cntAttendanceData(kind);
  const party = p => PARTY_ROLES.map(r => ({ ref: p.partyNo, post: DUTY_BY_KEY[r].label, o: officerByPin(p[r]) || {} }));
  const boothOfParty = pno => { const bid = Object.keys(S.final.polling).find(k => S.final.polling[k] === pno); return bid ? boothById(bid) : null; };
  if (kind === 'pp2party') return {
    title: 'ATTENDANCE — POLLING PARTIES (after 2nd randomisation) — PARTY-WISE', needs: S.parts.second.polling ? '' : 'Lock Polling parties in the 2nd randomisation first.',
    groups: S.second.parties.slice().sort(byPartyNo).map(p => ({ head: `Party No. ${p.partyNo}`, sub: `Constituency: ${constName(p.const)}`, rows: party(p) })),
  };
  if (kind === 'pp2duty') return {
    title: 'ATTENDANCE — POLLING PARTIES (after 2nd randomisation) — DUTY-WISE', needs: S.parts.second.polling ? '' : 'Lock Polling parties in the 2nd randomisation first.', refCol: 'Party No.',
    groups: PARTY_ROLES.map(r => ({ head: DUTY_BY_KEY[r].label, sub: `${S.second.parties.length} officers`, rows: S.second.parties.slice().sort(byPartyNo).map(p => ({ ref: p.partyNo, post: DUTY_BY_KEY[r].label, o: officerByPin(p[r]) || {} })) })),
  };
  if (kind === 'mo2') return {
    title: 'ATTENDANCE — MICRO OBSERVERS (after 2nd randomisation)', needs: S.parts.second.micro ? '' : 'Lock Micro Observers in the 2nd randomisation first.', refCol: 'Order No.',
    groups: S.constituencies.filter(c => S.second.micro.some(x => x.const === c.code)).map(c => {
      const list = S.second.micro.filter(x => x.const === c.code).sort(byOrderNo);
      return { head: `MICRO OBSERVER — ${constName(c.code)}`, sub: `${list.length} officers`, rows: list.map(x => ({ ref: x.orderNo, post: 'MICRO OBSERVER', o: officerByPin(x.pin) || {} })) };
    }),
  };
  if (kind === 'ppMain' || kind === 'ppReserve') {
    const used = new Set(Object.values(S.final.polling));
    const list = S.second.parties.filter(p => (kind === 'ppMain') === used.has(p.partyNo)).sort(byPartyNo);
    return {
      title: `ATTENDANCE — ${kind === 'ppMain' ? 'MAIN' : 'RESERVE'} POLLING PARTIES (after final randomisation) — PARTY-WISE`,
      needs: S.parts.final.polling ? '' : 'Lock Polling parties in the final randomisation first.',
      groups: list.map(p => { const b = boothOfParty(p.partyNo); return { head: `Party No. ${p.partyNo}`, sub: b ? `Booth No. ${boothLabel(b)} — ${b.name} · Block: ${b.block} · ${constName(b.const)}` : `RESERVE · ${constName(p.const)}`, rows: party(p) }; }),
    };
  }
  return null;
}
const ATTENDANCE_KINDS = {
  pp2party: 'Polling parties — party-wise (2nd)', pp2duty: 'Polling parties — duty-wise (2nd)', mo2: 'Micro Observers (2nd)',
  ppMain: 'Main parties — party-wise (final)', ppReserve: 'Reserve parties — party-wise (final)',
  cnt1: 'Counting personnel — duty-wise (1st)', cnt2: 'Counting parties — party-wise (2nd)',
  cntMain: 'Counting parties — table-wise (final)', cntReserve: 'Counting reserve parties (final)',
};
function attendanceHtml(kind) {
  const d = attendanceData(kind);
  if (d.needs) return `<div class="alert info">${esc(d.needs)}</div>`;
  const n = d.groups.reduce((a, g) => a + g.rows.length, 0);
  return `<div class="doc att"><div class="c b" style="font-size:15px">${esc(T().electionTitle)}</div><div class="c b" style="margin-bottom:8px">${esc(d.title)} — ${esc(T().district)}</div>
    ${d.groups.map(g => `<div class="cp-booth${g.rows.length > 12 ? ' long' : ''}"><div class="cp-head">${esc(g.head)}</div>${g.sub ? `<div class="cp-sub">${esc(g.sub)}</div>` : ''}
      <table class="lt"><thead><tr><th style="width:4%">Sl</th><th style="width:${d.refCol ? 12 : 18}%">${d.refCol ? esc(d.refCol) : 'Post'}</th><th style="width:8%">PIN</th><th style="width:16%">Name</th><th style="width:14%">Designation</th><th style="width:${d.refCol ? 19 : 13}%">Office</th><th style="width:11%">Mobile</th><th>Signature</th></tr></thead><tbody>
      ${g.rows.map((r, i) => `<tr><td>${i + 1}</td><td class="nowrap">${esc(d.refCol ? r.ref : r.post)}</td><td><b>${esc(r.o.pin)}</b></td><td>${esc(r.o.name)}</td><td>${esc(r.o.designation)}</td><td>${esc(r.o.office)}</td><td class="nowrap">${esc(r.o.mobile)}</td><td></td></tr>`).join('')}
      </tbody></table></div>`).join('')}
    <div class="small" style="margin-top:6px">Total: <b>${n}</b> · Generated: ${esc(nowStamp())}</div></div>`;
}
/** Flat rows for Excel (and tests). */
function attendanceRows(kind) {
  const d = attendanceData(kind); if (d.needs) return [];
  return d.groups.flatMap(g => g.rows.map((r, i) => [g.head, g.sub || '', i + 1, r.ref, r.post, r.o.pin, r.o.name, r.o.designation, r.o.office, r.o.mobile, '']));
}
const ATTENDANCE_HEAD = ['Group', 'Details', 'Sl', 'Party / Order No', 'Post', 'PIN', 'Name', 'Designation', 'Office', 'Mobile', 'Signature'];
ACT.attendance = kind => openDoc(`Attendance — ${ATTENDANCE_KINDS[kind]}`, attendanceHtml(kind));
ACT.attendanceExcel = kind => {
  const d = attendanceData(kind); if (d.needs) return toast(d.needs, 'bad');
  const wb = XLSX.utils.book_new();
  addSheet(wb, 'Attendance', ATTENDANCE_HEAD, attendanceRows(kind), [26, 44, 5, 15, 22, 11, 26, 26, 32, 13, 18]);
  saveWb(wb, `Attendance_${safeName(ATTENDANCE_KINDS[kind])}_${safeName(S.setup.district)}.xlsx`);
};
