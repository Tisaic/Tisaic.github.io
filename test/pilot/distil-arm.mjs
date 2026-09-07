/**
 * @file THE DISTILLED RUNG ON THE ARM, THROUGH THE LADDER — and the split that reads a refusal.
 *
 * The bench measured `②d distilled — REFUSED, 0.22x` at demo grade: the rung reached, the
 * training runs converged past the drop gate, the fit vouched for itself, and the MACHINE
 * refused it. One number, at least three causes. This harness runs the same distil-only ladder
 * the page runs (same host, same grade table) and then takes the measurement that separates
 * them (rule 9, both halves): the fitted policy is scored ON ITS OWN TRAINING PROGRAMS.
 *
 *   helps its own programs, harms the square  -> transfer: the diet or the window
 *   harms even its own programs               -> the fit, or the deploy path (units, sign)
 *
 * Not a test — an instrument. Run: GRADE=fast node test/pilot/distil-arm.mjs
 */
import { machine, settle, commissionComp } from '../flexisim/_rig.mjs';
import { makeArmHost } from '../../lib/flexisim/autohost.js';
import { sharpRect } from '../../lib/flexisim/toolpath.js';
import { HarmonicFF } from '../../lib/pilot/hff.js';
import { DistilPolicy } from '../../lib/pilot/distil.js';

const GRADE = process.env.GRADE || 'fast';
// PERIODIC=1 declares a periodic application, so the ladder also builds lap learning — the
// bench's other option, and on this arm the rung that DOES help (8.9–9.2x on the square in the
// old harness). Off by default so the distil reading stays one variable.
const PERIODIC = process.env.PERIODIC === '1';
// LOO=1: the transfer question one level down. Converge the lap-periodic correction on each of
// the six training programs ONCE (as the rung does), then for each fold fit a policy on the
// other five and score it on the held-out program AND on the square, on the machine.
//   carries polygon -> polygon, not -> square   : the square's corner class is what is missing
//   fails polygon -> polygon too                : the route over-fits its diet, whatever the diet
// The convergence loop below restates ~10 lines of the rung — an instrument's copy, noted.
const LOO = process.env.LOO === '1';
const GRADES = {
  full: { avg: 4, warmup: 2, probeLaps: { warmup: 1, avg: 2 }, passes: 24 },
  fast: { avg: 2, warmup: 1, probeLaps: { warmup: 1, avg: 1 }, passes: 8 },
  demo: { avg: 1, warmup: 1, probeLaps: { warmup: 0, avg: 1 }, passes: 4 },
};
const G = { ...GRADES[GRADE] };
// PASSES=n overrides the refinement passes alone, at the grade's scoring laps — the ladder of
// passes at fixed authority is the measurement §52.7 says has to be taken.
if (process.env.PASSES) G.passes = +process.env.PASSES;
// DIET selects what the host converges the rung on. `demo` is the host's own default — the
// designer's feed ladder at r 2.2-3.8 — which is the diet plan §49's harness measured at
// 0.22x-1.09x on this square. `poly` is that harness's 4.99x diet: the same designer at the
// programs' own scale, one feed. `polyfeed` is the scale-matched diet across a feed ladder,
// which §49.13 measured as the only one safe off the commissioning feed.
const DIET = process.env.DIET || 'poly4';
// REPLACE=1 converges and deploys the rung WITHOUT the compliance feedforward under it — the
// composition test/_distil.mjs measures — instead of on top of it (plan §52.7).
const REPLACE = process.env.REPLACE !== '0';   // the host's default; REPLACE=0 keeps the feedforward under it
// ENGINE=pilot commissions the cascade at depth 1 as the rung's TEACHER — the oracle-fed
// pilot iteration test/_distil.mjs measured at 6.40x on the square — and the distilled policy
// then REPLACES it at deploy (plan §52.8). Default: HarmonicFF, as shipped.
const ENGINE = process.env.ENGINE || 'pilot';
// OFFS=raw reproduces the window as it was first ported (raw ±512 steps with a sign block);
// the default is the host's — the harness's ±256 PILOT-SAMPLE window, converted by the rung.
const DISTIL = { ...(process.env.OFFS === 'raw'
  ? { offsets: [-512, -256, -128, -64, -32, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512],
      signOffsets: [-128, -32, -8, -2, 0, 2, 8, 32, 128] } : {}),
  // STRIDE=<n|pilot>: one row per n steps and the correction held between (default the host's, pilot).
  ...(process.env.STRIDE ? { stride: process.env.STRIDE === 'pilot' ? 'pilot' : +process.env.STRIDE } : {}),
  // FADE=<fraction of the trained speed span>: the coverage guard's ramp (measured inert here).
  ...(process.env.FADE ? { coverageFade: +process.env.FADE } : {}) };
if (!['hff', 'pilot'].includes(ENGINE)) throw new Error(`ENGINE ${ENGINE}: hff or pilot`);
const F = 4e-3;
const DIETS = {
  demo: null,
  poly: { feeds: [F, F, F], rMin: 3.4, rSpan: 2.4 },
  polyfeed: { feeds: [F, 2 * F, 0.5 * F], rMin: 3.4, rSpan: 2.4 },
  poly1: { feeds: [F], rMin: 3.4, rSpan: 2.4 },   // two programs, for a quick look at the engine
  poly4: { feeds: [F, F], rMin: 3.4, rSpan: 2.4 }, // four programs (two convex, two stars) — the shipped diet
};
if (!(DIET in DIETS)) throw new Error(`DIET ${DIET}: one of ${Object.keys(DIETS).join(', ')}`);
const K = +(process.env.ARM_K || 0.25), E = +(process.env.ARM_E || 0.03);
const path = sharpRect({ w: 8, h: 8, centre: [12, 0], feed: 4e-3, accel: 4e-5, cornerDt: 40 });
const LAP = Math.ceil(path.lap);
console.log(`\ndistil on the arm through the ladder — K ${K} / E ${E}, sharp square, grade ${GRADE}${PERIODIC ? ', PERIODIC (lap learning built)' : ''}`
  + ` (avg ${G.avg}, warmup ${G.warmup}, passes ${G.passes}, diet ${DIET}, ${ENGINE} teacher${process.env.OFFS === 'raw' ? ', raw window' : ''}${process.env.STRIDE ? `, stride ${process.env.STRIDE}` : ''}${process.env.TEACHCAP ? `, teach cap ${process.env.TEACHCAP}` : ''}${process.env.TLAPS ? `, teach laps ${process.env.TLAPS}` : ''}${process.env.TPASSES ? `, teach passes ${process.env.TPASSES}` : ''}${process.env.TRACE === '1' ? ', re-measured' : ''}${REPLACE ? ', REPLACES the compliance feedforward' : ', under the feedforward'})`);

const t0 = Date.now();
const m0 = await machine({ K, E });
const centre = m0.arm.ik(12, 0, true);
const host = makeArmHost({
  makeMachine: async () => {
    const m = await machine({ K, E });
    const rc = commissionComp(m.arm, m.servo);
    const c0 = path.at(0); const [q1, q2] = m.arm.ik(c0.x, c0.y, true);
    settle(m.arm, m.servo, q1, q2);
    return { arm: m.arm, l1: m.l1, l2: m.l2, servo: m.servo, rc };
  },
  path, lap: LAP, K, centre,
  classic: false, maxDepth: ENGINE === 'pilot' ? 1 : 0, demo: null, lapMemory: PERIODIC, distil: DISTIL,
  ...(DIETS[DIET] ? { distilDiet: DIETS[DIET] } : {}), distilReplaces: REPLACE,
  ...(process.env.CAP ? { distilCap: +process.env.CAP } : {}),
  ...(process.env.TEACHCAP ? { distilTeachCap: +process.env.TEACHCAP } : {}),
  // COMMISSIONING-TIME KNOBS (plan §52.9): TLAPS laps per teacher drive, TPASSES passes,
  // TRACE=1 re-measures the prefix between passes (the old behaviour, the control).
  ...(process.env.TLAPS ? { distilTeachLaps: +process.env.TLAPS } : {}),
  ...(process.env.TPASSES ? { distilPasses: +process.env.TPASSES } : {}),
  ...(process.env.TRACE === '1' ? { distilTeachTrace: true } : {}),
  ...(process.env.HOLD ? { distilTeachHold: +process.env.HOLD } : {}),
  distilEngine: ENGINE, distilDebug: process.env.DEBUG === '1',
  distilOracle: process.env.ORACLE === '0' ? false : process.env.ORACLE === 'control' ? 'control' : true,
  avg: G.avg, warmup: G.warmup, passes: G.passes, probeLaps: G.probeLaps,
  onRung: (r) => console.log(`  [${Math.round((Date.now() - t0) / 1000)}s, ${(host.samples().samples / 60000).toFixed(1)} machine-min] ${r.name}  ${r.score.toExponential(4)}`
    + `  ${r.gain === null ? '' : r.gain.toFixed(2) + 'x'}${r.deployed ? '' : '  NOT deployed'}${r.note ? '  — ' + r.note : ''}`),
});
host.auto.pilotOpts.start = m0.arm.ik(path.at(0).x, path.at(0).y, true);
const rep = await host.auto.commission({ run: host.run, drivePilot: host.drivePilot,
  recordDemo: host.recordDemo, distilRuns: host.distilRuns });

console.log(`\n  shipped ${JSON.stringify(rep.deployed)}   ${rep.base.toExponential(4)} -> ${rep.best.toExponential(4)}   ${rep.gain.toFixed(2)}x`);
console.log(`  machine samples ${host.samples().samples.toLocaleString()} over ${host.samples().runs} runs`
  + `  (${(host.samples().samples / 1000 / 60).toFixed(1)} min at 1 ms)  wall ${Math.round((Date.now() - t0) / 1000)} s`);
const d = rep.distil;
if (d && d.runs) {
  console.log('\n  training runs (gain of the converged lap-periodic correction on each):');
  d.runs.forEach((c, i) => console.log(`    run ${i}: lap ${c.lap}  gain ${c.gain.toFixed(2)}x  ${c.dropped ? 'DROPPED' : `used ${c.used} rows`}${c.engine ? `  [${c.engine}${c.passes != null ? ` ${c.passes} passes` : ''}]` : ''}`));
}
if (d && d.fit) {
  console.log(`\n  fit: deploy ${d.fit.deploy}  rows ${d.fit.rows}  features ${d.fit.features}`
    + `  held-out R² ${JSON.stringify((d.fit.heldOutR2 || []).map((v) => +v.toFixed(4)))}`
    + `  speed span ${JSON.stringify(d.fit.speedSpan)}${d.fit.reason ? '  reason: ' + d.fit.reason : ''}`);
}
if (d && d.note) console.log(`  note: ${d.note}`);

// ---- THE SPLIT. Score the fitted policy on the programs it was fitted on, on the machine.
const pol = host.auto.built.distil;
if (pol && pol.W) {
  console.log('\n  the policy on its OWN training programs (baseline -> with the policy):');
  const runs = await host.distilRuns();
  for (let i = 0; i < runs.length; i++) {
    const tr = runs[i];
    const base = await tr.run(null);
    const corr = { at: (k) => pol.act(tr.refAt, k, tr.speedAt(k)) };
    const withP = await tr.run(corr);
    console.log(`    program ${i} (lap ${tr.lap}): ${base.score.toExponential(4)} -> ${withP.score.toExponential(4)}`
      + `   ${(base.score / withP.score).toFixed(2)}x`);
  }
  console.log('\n  reading: helps its own programs and harms the square -> transfer (diet/window);'
    + '\n           harms even its own programs -> the fit or the deploy path (units, sign).');
} else console.log('\n  no policy was fitted, so the split cannot be taken.');
if (LOO) {
  console.log('\n  LEAVE-ONE-OUT over the six training programs (fresh prefixes, converged once each):');
  const runs = await host.distilRuns();
  const a = host.auto;
  const uMax = a.authority('distil');
  const prefixes = [];
  for (let i = 0; i < runs.length; i++) {
    const tr = runs[i];
    const h = new HarmonicFF({ lap: tr.lap, channels: 2, uMax, ...a.hffOpts });
    const r = await h.commission(async (corr) => tr.run(corr));
    const pre = new Array(tr.lap); for (let k = 0; k < tr.lap; k++) pre[k] = h.at(k);
    prefixes.push({ pre, gain: r.best > 0 ? r.base / r.best : 0 });
    console.log(`    converged run ${i}: ${prefixes[i].gain.toFixed(2)}x`);
  }
  // The square's own references and speeds, for scoring a fold-policy off its diet.
  const R = host.refsFor(m0.arm), L = LAP;
  const sqRef = (k) => R[((k % L) + L) % L];
  const sqSpeed = (k) => { const c = path.at(k); return Math.hypot(c.vx, c.vy); };
  const opts = a.distilOpts;
  const rows = [];
  for (let i = 0; i < runs.length; i++) {
    const pol = new DistilPolicy({ channels: 2, refDim: 2, offsets: opts.offsets, signOffsets: opts.signOffsets,
      ridge: opts.ridge, uMax, online: opts.online !== false, adaptSign: opts.adaptSign });
    for (let j = 0; j < runs.length; j++) {
      if (j === i || prefixes[j].gain <= 1.5) continue;
      pol.addProgram({ refAt: runs[j].refAt, n: runs[j].lap, prefix: prefixes[j].pre, speedAt: runs[j].speedAt });
    }
    const fit = pol.fit();
    if (!fit.deploy) { console.log(`    fold ${i}: fit refused — ${fit.reason}`); continue; }
    const tr = runs[i];
    const b = await tr.run(null);
    const w = await tr.run({ at: (k) => pol.act(tr.refAt, k, tr.speedAt(k)) });
    const sqB = await host.run(null, null);
    const sqW = await host.run({ at: (k) => pol.act(sqRef, k, sqSpeed(k)) }, 'distil');
    rows.push({ i, held: b.score / w.score, square: sqB.score / sqW.score, r2: fit.heldOutR2.map((v) => +v.toFixed(3)) });
    console.log(`    fold ${i}: held-out program ${(b.score / w.score).toFixed(2)}x   square ${(sqB.score / sqW.score).toFixed(2)}x   R² ${JSON.stringify(rows[rows.length - 1].r2)}`);
  }
  if (rows.length) {
    const geo = (xs) => Math.exp(xs.reduce((s2, x) => s2 + Math.log(x), 0) / xs.length);
    console.log(`\n  geometric mean: held-out polygon ${geo(rows.map((r) => r.held)).toFixed(2)}x   square ${geo(rows.map((r) => r.square)).toFixed(2)}x`);
  }
}
await host.dispose(); await m0.l1.destroy(); await m0.l2.destroy();
