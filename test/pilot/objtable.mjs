/**
 * @file THE WINNING TABLE — WHAT EVERY PLANT SHIPS, SCRAPED FROM ITS OWN HARNESS (plan §86.7).
 *
 * The count of plants this project wins on has lived in `CLAUDE.md` prose and nowhere else, and it
 * has been wrong in both directions: §84.10 removed the cart-pole from the setpoint-tracking row
 * after four sections of quoting 9.77x that turned out to be the LOOP, and §64-§72 added four
 * plants one at a time while the summary tables were edited by hand. A count nobody can re-derive
 * is a preference, which is rule 30 aimed at the project's own headline.
 *
 * SO IT IS A SCRAPE AND NOT A RE-MEASUREMENT. Each plant's OWN harness runs in a child process and
 * this file reads that harness's own printed headline. No plant is re-scored by a metric this file
 * invented, exactly as `commtime.mjs` and `sixplant.mjs` do it — and a plant whose line cannot be
 * found reads UNKNOWN rather than being quietly dropped (rule 25).
 *
 * WHAT IT DISTINGUISHES, because these are three different claims and the record has conflated
 * them: shipping the DEPLOYED OBJECT (`distil.js`'s weight vector, which `deploy.js` reimplements
 * and `artefact.test.mjs` pins bit-identical), shipping the CONVENTIONAL RUNG (four coefficients
 * of `[a, v, sign v, 1]`, deployable and cheap but not the object the deploy boundary is drawn
 * around), and shipping the PILOT CASCADE (thousands of MAC and kilobytes of forecast bank — an
 * improvement a PLC would refuse). A plant that ships the cascade is a win for the METHOD and not
 * for the product.
 *
 * ONLY=<names>, SKIP=<names>, TIMEOUT=<seconds>.
 */
import { spawnSync } from 'node:child_process';

const PLANTS = [
  { key: 'arm', label: '2R arm (lattice, bench cell)', file: 'distil-arm.mjs' },
  // EMPS' harness ships the DEPLOYED OBJECT *and* the retired lap-periodic rung on top (§50.2's
  // 342x composition), so its `shipped` line is not the object's own column. Its own harness
  // prints that column — `home: table Ax  distilled Bx` — and B is what belongs here.
  { key: 'emps', label: 'EMPS servo axis', file: 'distil-emps.test.mjs',
    prefer: String.raw`home: table [0-9.]+x\s+distilled ([0-9.]+)x` },
  { key: 'tank', label: 'quadruple tank', file: 'distil-tank.mjs' },
  { key: 'column', label: 'Wood-Berry column', file: 'distil-column.mjs' },
  { key: 'mill', label: 'cold mill AGC', file: 'distil-mill.mjs' },
  { key: 'barrel', label: 'extruder barrel', file: 'distil-barrel.mjs' },
  { key: 'pend', label: 'cart-pole (open-loop UNSTABLE)', file: 'distil-pend.mjs' },
  { key: 'pend-tuned', label: 'cart-pole, loop tuned 3.5x better', file: 'distil-pend.mjs',
    env: { PEND_TUNED: '1' } },
  { key: 'realarm', label: 'real flexible arm (DaISy 96-009)', file: 'distil-realarm.mjs' },
  { key: 'realtanks', label: 'real cascaded tanks (overflow)', file: 'distil-realtanks.mjs' },
  { key: 'realexch', label: 'real steam heat exchanger', file: 'distil-realexch.mjs' },
];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const skip = process.env.SKIP ? process.env.SKIP.split(',') : [];
const TMO = 1000 * +(process.env.TIMEOUT || 3600);
const pick = PLANTS.filter((p) => (!only || only.includes(p.key)) && !skip.includes(p.key));

console.log('\nobjtable: WHAT EVERY PLANT SHIPS, scraped from its own harness\n');

/** The last match of a pattern, because a harness may print a ladder before its verdict. */
const last = (txt, re) => { let m = null, r; const g = new RegExp(re, 'g');
  while ((r = g.exec(txt)) !== null) m = r; return m; };

function scrape(txt, p) {
  const out = { ship: null, base: null, best: null, x: null, mac: null, kb: null,
    rung: null, note: '' };
  // The shared ladder's own summary: `shipped {...}   B → E   Xx   Ns`
  // The unit between the second number and the ratio is the plant's own (`mm`, `cm rms`, `°C rms`),
  // so it is skipped rather than assumed absent — the tank and EMPS rows read UNKNOWN until it was.
  const sh = last(txt, String.raw`shipped (\{[^}]*\})\s+([0-9.eE+-]+)\s*(?:→|->)\s*([0-9.eE+-]+)[^0-9\n]*?([0-9.]+)x`);
  if (sh) {
    out.ship = JSON.parse(sh[1]); out.base = +sh[2]; out.best = +sh[3]; out.x = +sh[4];
  }
  const co = last(txt, String.raw`cost:\s*(\d+)\s*MAC/cycle sliced,\s*([0-9.]+)\s*kB`);
  if (co) { out.mac = +co[1]; out.kb = +co[2]; }
  const dr = last(txt, String.raw`distilled rung:\s*(DEPLOYED|REFUSED) at ([0-9.]+)x`);
  if (dr) { out.rung = dr[1]; out.rungX = +dr[2]; }
  else if (/distilled rung: not reported/.test(txt)) { out.rung = 'NO TEACHER'; }
  if (p && p.prefer) {
    const q = last(txt, p.prefer);
    if (q) { out.x = +q[1]; out.note = "the object's own column, not the shipped composition"; }
  }
  // The tank harness prints its own shape.
  if (!out.x) {
    const tk = last(txt, String.raw`worst delivered ratio across \d+ seed\(s\):\s*([0-9.]+)x`);
    if (tk) out.x = +tk[1];
  }
  if (!out.x) {
    const em = last(txt, String.raw`home: table [0-9.]+x\s+distilled ([0-9.]+)x`);
    if (em) { out.x = +em[1]; out.note = 'home column of the distil/table pair'; }
  }
  return out;
}

/** What the ship set means for the product claim. */
function classify(s) {
  if (!s || !s.ship) return 'UNKNOWN';
  if (s.ship.distil && s.ship.hff) return 'object + MEMORY';
  if (s.ship.distil) return 'DEPLOYED OBJECT';
  if (s.ship.stack) return 'pilot cascade';
  if (s.ship.hff) return 'lap-periodic MEMORY';
  if (s.ship.classic) return 'conventional rung';
  return 'nothing';
}

const rows = [];
for (const p of pick) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [`test/pilot/${p.file}`], {
    encoding: 'utf8', timeout: TMO, maxBuffer: 1 << 28,
    env: { ...process.env, SUITE: 'full', ...(p.env || {}) },
  });
  const txt = (r.stdout || '') + (r.stderr || '');
  const s = scrape(txt, p);
  rows.push({ ...p, ...s, code: r.status, secs: (Date.now() - t0) / 1000, kind: classify(s) });
  const l = rows[rows.length - 1];
  console.log(`  ${p.key.padEnd(11)} ${l.code === 0 ? 'ok  ' : 'FAIL'} `
    + `${l.x === null ? 'UNKNOWN' : l.x.toFixed(2) + 'x'}   ${l.kind}   ${l.secs.toFixed(0)}s`);
}

console.log('\n  plant                              ships                 base -> best          '
  + '  x      MAC   kB     ②d');
for (const r of rows) {
  console.log(`  ${r.label.padEnd(34)} ${r.kind.padEnd(20)} `
    + `${r.base === null ? '—'.padEnd(21) : (r.base.toExponential(3) + ' -> ' + r.best.toExponential(3)).padEnd(21)} `
    + `${(r.x === null ? 'UNKNOWN' : r.x.toFixed(2) + 'x').padStart(8)} `
    + `${(r.mac === null ? '—' : String(r.mac)).padStart(6)} ${(r.kb === null ? '—' : r.kb.toFixed(1)).padStart(5)}  `
    + `${r.rung || '—'}${r.rung && r.rungX !== undefined ? ' ' + r.rungX.toFixed(2) + 'x' : ''}`
    + `${r.code === 0 ? '' : '   <- HARNESS FAILED'}`);
}

// ---- THE COUNT, WHICH IS THE ONLY THING THIS FILE IS FOR ------------------------------------
const nObj = rows.filter((r) => r.kind === 'DEPLOYED OBJECT' || r.kind === 'object + MEMORY').length;
const nConv = rows.filter((r) => r.kind === 'conventional rung').length;
const nCasc = rows.filter((r) => r.kind === 'pilot cascade').length;
const nUnk = rows.filter((r) => r.kind === 'UNKNOWN').length;
const worse = rows.filter((r) => r.x !== null && r.x < 0.995);
console.log(`\n  of ${rows.length} plants asked: ${nObj} ship the DEPLOYED OBJECT, ${nConv} the `
  + `conventional rung, ${nCasc} the pilot cascade, ${nUnk} UNKNOWN`);
console.log(`  made WORSE: ${worse.length ? worse.map((r) => `${r.key} ${r.x.toFixed(2)}x`).join(', ') : 'none'}`);
const failed = rows.filter((r) => r.code !== 0);
if (failed.length) console.log(`  HARNESSES THAT FAILED: ${failed.map((r) => r.key).join(', ')}`);

// Rule 27: the unflattering line last as the verdict, and it is the mandate's own question.
const bad = worse.length + failed.length + nUnk;
console.log(bad ? `\nobjtable: ${bad} row(s) are not clean — see above\n`
  : '\nobjtable: every plant asked either improves or refuses, and none is made worse\n');
process.exit(bad ? 1 : 0);
