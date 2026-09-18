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
import fs from 'node:fs';

/**
 * READ=1 (or `--read`): read the rows the harnesses EMITTED rather than spawning them (plan §87.1).
 *
 * The spawn path is right for an instrument run on demand and wrong for a CHECK: the suite already
 * runs every one of these harnesses, so spawning them again is fifteen minutes of plant time to
 * learn what the suite just measured — and a table nobody runs is not a check. With
 * `OBJTABLE_OUT` set, every harness appends its own row where it measured it and this mode reads
 * them. A plant whose row is MISSING reads as missing rather than as a shorter table (rule 25).
 */
const READ = process.env.READ === '1' || process.argv.includes('--read');
const OUT = process.env.OBJTABLE_OUT || null;


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
    if (q) {
      out.x = +q[1]; out.note = "the object's own column, not the shipped composition";
      // AND THE base -> best PAIR IS DROPPED WITH IT, because that pair belongs to the
      // COMPOSITION and printing it beside the object's own ratio would put two different
      // quantities in one row (rule 19). A dash is what "this harness does not report it for
      // this object" looks like (rule 25).
      out.base = null; out.best = null;
    }
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

if (READ) {
  const f = `${OUT || '.'}/rows.jsonl`;
  let lines = [];
  try { lines = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean); }
  catch (e) {
    console.log(`  no rows to read at ${f} — set OBJTABLE_OUT and run the plant harnesses first`);
    console.log('\nobjtable: NOTHING READ (rule 25: that is not an empty table, it is no table)\n');
    process.exit(1);
  }
  // Only the harnesses that ask the DEPLOYED object. `plants.test.mjs` drives four of the same
  // plants through the same driver and scores the TEACHER; those rows are a different claim and a
  // table that mixed them would be counting two things in one column (rule 19).
  //
  // AND THE KEY IS THE SCRIPT *PLUS THE ROW'S OWN NAME*, BECAUSE ONE SCRIPT IS TWO PLANTS
  // (plan §115). Keying on `file` alone is what the header above defends — it is what keeps
  // `plants.test.mjs`'s TEACHER rows out — but that protection is the `/^distil-/` FILTER and
  // not the key, and the two were conflated. `distil-pend.mjs` is registered TWICE in `PLANTS`,
  // once bare and once under `PEND_TUNED=1`, so it emits FOUR rows for TWO different plants and
  // the last-wins rule silently discarded the SHIPPED loop in favour of the TUNED one. The
  // stdout-scraped table printed both rows correctly and this reader printed ten where there
  // are eleven, so the project's two counting paths disagreed by exactly one plant — which is
  // the condition this table exists to REMOVE (rule 30), reappearing inside the table itself.
  //
  // Within one variant the LAST row still wins, which is right: a harness emits a row and then
  // re-emits it enriched (the cart-pole's first emit of each pair carries no `t1`).
  // THE VARIANT IS THE BRACKETED TAIL OF THE ROW'S OWN NAME AND NOTHING ELSE. Keying on the
  // WHOLE name was this repair's own first attempt and it was wrong in the other direction
  // (rule 17, the instrument failing before the model): six harnesses emit a row and then
  // re-emit it enriched with `t1`, and only the second carries a `name`, so a whole-name key
  // split every one of them into a pair — a table of seventeen rows over ten plants, reading
  // *10 of 17 ship the DEPLOYED OBJECT*. Only the bracketed tail distinguishes two PLANTS from
  // one plant emitted twice.
  const variantOf = (r) => {
    const m = /\[([^\]]+)\]\s*$/.exec(String(r.name || ''));
    return m ? m[1] : '';
  };
  const seen = new Map();
  const files = new Set();
  for (const l of lines) {
    let r; try { r = JSON.parse(l); } catch { continue; }
    if (!/^distil-/.test(r.file || '')) continue;
    files.add(r.file);
    seen.set(`${r.file}\u0000${variantOf(r)}`, r);         // the LAST row a VARIANT emitted wins
  }
  const got = [...seen.values()].sort((a, b) =>
    a.file.localeCompare(b.file) || variantOf(a).localeCompare(variantOf(b)));
  // WHICH HARNESSES DID NOT EMIT, NAMED (rule 25). The first suite run of this check read "9
  // row(s)" and said nothing about the tenth: `distil-arm.mjs` is an INSTRUMENT and is not
  // registered in `test/run.sh`, so its row is legitimately absent — but a table that prints a
  // count without naming what is missing is exactly the "not measured rendered as a shorter
  // table" this reader exists to avoid. An absence is reported and does NOT fail, because a
  // harness the suite never runs cannot be evidence about a plant either way.
  const EXPECT = PLANTS.map((q) => (q.file || '').replace(/\.mjs$/, ''))
    .filter((f, i, a) => f && a.indexOf(f) === i);
  const missing = EXPECT.filter((f) => !files.has(f));
  // AND A SCRIPT REGISTERED N TIMES MUST PRODUCE N ROWS, WHICH IS THE CHECK THAT WOULD HAVE
  // CAUGHT §115 (rule 9's other half, rule 25). `distil-pend.mjs` appears TWICE in `PLANTS` —
  // once bare and once under `PEND_TUNED=1` — and for as long as the reader keyed on `file`
  // alone it silently returned ONE row for that pair, so this table and the stdout-scraped one
  // disagreed by a plant with nothing saying so. A count that collapses is indistinguishable
  // from a harness that did not run unless something compares it against what was ASKED.
  const wantPer = new Map();
  for (const q of PLANTS) {
    const f = (q.file || '').replace(/\.mjs$/, '');
    if (f) wantPer.set(f, (wantPer.get(f) || 0) + 1);
  }
  const collapsed = [...wantPer.entries()]
    .filter(([f, n]) => files.has(f) && got.filter((r) => r.file === f).length < n)
    .map(([f, n]) => `${f} (${got.filter((r) => r.file === f).length} of ${n})`);
  console.log(`  read ${got.length} row(s) from ${lines.length} emitted`
    + (missing.length ? `  —  NOT EMITTED: ${missing.join(', ')} (not run in this pass)` : '')
    + (collapsed.length ? `\n  COLLAPSED — a script registered more than once returned fewer `
      + `rows than it was asked for: ${collapsed.join(', ')}` : '')
    + '\n');
  // AND TWO ROWS FROM ONE SCRIPT MUST NOT PRINT UNDER ONE NAME (rule 25/30). The harness's own
  // `name` ends in a bracketed variant where it has one, so the label carries it — otherwise the
  // repaired key would produce two visually identical rows and the table would look like a
  // duplicate rather than like two plants.
  const label = (r) => (variantOf(r) ? `${r.file} [${variantOf(r)}]` : r.file);
  console.log('  harness                     ships                 base -> best            '
    + '  x      MAC   kB     ②d          TARGET 1');
  let bad = 0;
  for (const r of got) {
    const kind = classify(r.deployed ? { ship: r.deployed } : null);
    const worse = r.gain !== null && r.gain < 0.995;
    if (worse) bad++;
    console.log(`  ${label(r).padEnd(27)} ${kind.padEnd(20)} `
      + `${r.base === null ? '—'.padEnd(21) : (r.base.toExponential(3) + ' -> ' + r.best.toExponential(3)).padEnd(21)} `
      + `${(r.gain === null ? 'UNKNOWN' : r.gain.toFixed(2) + 'x').padStart(8)} `
      + `${(r.mac === null ? '—' : String(r.mac)).padStart(6)} `
      + `${(r.kb === null ? '—' : r.kb.toFixed(1)).padStart(5)}  ${(r.rung || '—').padEnd(10)}`
      + `${r.t1 === undefined || r.t1 === null ? 'not asked'
        : `${r.t1.toFixed(2)} of scored${r.t1Worse ? ', MADE WORSE' : (r.t1 >= 1 / 1.3 ? ', MET' : ', under 1/1.3')}`}`
      + `${worse ? '   <- MADE WORSE' : ''}`);
  }
  const nObj = got.filter((r) => r.deployed && r.deployed.distil).length;
  console.log(`\n  ${nObj} of ${got.length} ship the DEPLOYED OBJECT; made WORSE: ${bad || 'none'}`);
  /**
   * HOW MUCH OF EACH HEADLINE IS THE INCUMBENT CLASS (plan §89.6).
   *
   * Every factor in this table is the WHOLE ladder against the bare machine, and the first rung
   * of that ladder — `classic.js`, `[a, v, sign v, 1]` fitted on the machine — IS a self-tuned
   * feedforward, which is the class `docs/scorecard.md` names as the incumbent. So a headline can
   * be mostly the incumbent with a small learned increment on top, and until this column existed
   * nothing separated the two: the split was printed in every ladder's own rows and collected
   * nowhere, which is the shape rule 30 warns about and which this table exists to fix. It is a
   * READ of `rep.rungs` rather than a second measurement, and the two columns MULTIPLY to the
   * headline by construction, so a row where they do not is an instrument fault and not a result.
   */
  const sp = got.filter((r) => Number.isFinite(r.xClassic) && Number.isFinite(r.xAdded));
  if (sp.length) {
    console.log(`\n  WHAT THE FOUR-COEFFICIENT RUNG TAKES, AND WHAT THE LEARNED MAP ADDS ON TOP`);
    console.log(`  (the first is the INCUMBENT CLASS self-tuned; the two multiply to the headline)`);
    console.log(`  harness                     classic     learned    headline   learned share of log`);
    for (const r of sp) {
      const tot = r.xClassic * r.xAdded;
      const share = tot > 1 ? Math.log(r.xAdded) / Math.log(tot) : null;
      console.log(`  ${label(r).padEnd(27)} ${(r.classicRan ? r.xClassic.toFixed(2) + 'x' : 'none')
        .padStart(8)} ${(r.xAdded.toFixed(2) + 'x').padStart(10)} `
        + `${(tot.toFixed(2) + 'x').padStart(10)}   `
        + `${share === null ? '—' : (100 * share).toFixed(0) + '%'}`);
    }
    const carried = sp.filter((r) => r.classicRan && r.xAdded < 1.05);
    console.log(`\n  ${carried.length} of ${sp.length} plants get essentially ALL of their factor `
      + `from the four-coefficient rung${carried.length ? ': ' + carried.map((r) => label(r)).join(', ') : ''}`);
  }
  // TARGET 1's COLUMN, REPORTED AND NOT ASSERTED (plan §88.1). Every harness that scores a second
  // program emits the ratio it delivers there against the one it was scored on; the target
  // forbids that ratio falling below 1/1.3. It is PRINTED rather than checked because the real
  // flexible arm is measured as failing it — a suite pinned to a bar a plant is known to fail is
  // permanently red and hides the next real failure (rule 3) — and because a plant whose harness
  // does not ask reads `not asked` rather than dropping out of the count (rule 25).
  // THE QUADRUPLE TANK IS ASKED NOW, AND IT IS ASKED THROUGH THIS COLUMN'S OWN INSTRUMENT.
  // §88.9 struck it for a good reason: the held-out recipe it had on record was scored by the
  // GAIN LADDER'S OWN candidate scoring (`driveAlt`, which drives the distilled policy ALONE),
  // and counting that beside rows produced by the driver's scored loop is two quantities in one
  // column (rule 19). It is not re-quoted — the same held-out recipe is put through the tank
  // harness's own `scoreOn`, which is its `run0` handed a different `{refAt, N}`, so the object
  // asked is whatever the block SHIPS (since §97.3 the conventional rung) rather than a rung the
  // machine refused. It reads 19.910x scored against 7.337x held out — 0.369, NOT MET, and
  // nothing made worse — which is the verdict §84.9's own `prog/rise` screen predicts for it
  // (7.9, below the ~10 split, alongside the column's 7.6 and the barrel's 5.2, all three NOT
  // MET). Asking it costs the table a verdict rather than handing it a flattering one.
  // THE COLD MILL IS ASKED AS OF §89.2, having read `not asked` since this column existed. §88.6
  // corrected the reason — a regulator has no second TRAJECTORY and plainly has a second
  // OPERATING POINT, so "not applicable" over "not measured" was rule 25 committed while citing
  // rule 25 — and §89.2 measured it: a GAUGE change is inert to three figures, a LINE SPEED
  // change is not, because it moves a transport delay DECLARED at commissioning. Its row is the
  // WORST of the four points tried, which is a NOT MET, so asking it costs the table a verdict
  // rather than handing it a flattering one.
  //
  // AND EVERY RATIO IN THIS COLUMN IS THE CHEAP COMPARATOR, which §89.1 tried to replace and
  // could not: it is the held-out factor over the SCORED program's, where the target says a
  // controller commissioned on each program INDIVIDUALLY. A second commissioning was built on the
  // cheapest plant and its own control disqualified it — the per-program object is worse on the
  // SHIPPED program too (6.055x against 12.009x), so it is a worse DRAW and not a per-program
  // one. The strong form costs a distribution per program, not a run.
  const asked = got.filter((r) => r.t1 !== undefined && r.t1 !== null);
  const met = asked.filter((r) => !r.t1Worse && r.t1 >= 1 / 1.3);
  console.log(`  TARGET 1 asked on ${asked.length} of ${got.length}: ${met.length} MET, `
    + `${asked.filter((r) => r.t1Worse).length} made WORSE on the held-out program`
    + `${asked.length === met.length ? '' : ` — ${asked.filter((r) => !met.includes(r))
      .map((r) => label(r)).join(', ')}`}`);
  // THE MANDATE, AS A CHECK. Every plant asked either improves or refuses — a refusal delivers the
  // machine unchanged, so `gain >= 1` covers both and nothing else is asserted here, because a
  // threshold on HOW MUCH each plant must win by would be a number this file invented.
  console.log(bad ? `\nobjtable: ${bad} plant(s) made WORSE — the mandate is not met\n`
    : '\nobjtable: every plant asked either improves or refuses, and none is made worse\n');
  process.exit(bad ? 1 : 0);
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
