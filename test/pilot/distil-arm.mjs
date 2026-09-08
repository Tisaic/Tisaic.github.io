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
import { sharpRect, roundedRect, circle } from '../../lib/flexisim/toolpath.js';
import { designDemoPaths } from '../../lib/flexisim/demopath.js';
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
  // WIN=<k>: the host's pilot-sample window with every offset scaled by k (rule 37: the window must
  // reach the plant's memory, and a softer link has a longer one).
  ...(process.env.WIN ? { offsetsPerSample: [-256, -128, -64, -32, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256].map((o) => Math.round(o * +process.env.WIN)) } : {}),
  // STRIDE=<n|pilot>: one row per n steps and the correction held between (default the host's, pilot).
  ...(process.env.STRIDE ? { stride: process.env.STRIDE === 'pilot' ? 'pilot' : +process.env.STRIDE } : {}),
  // FADE=<fraction of the trained speed span>: the coverage guard's ramp (measured inert here).
  ...(process.env.FADE ? { coverageFade: +process.env.FADE } : {}),
  // RIDGE=<x>: the fit's ridge (rule 32 — a prior scaled to the rows it acts on).
  ...(process.env.RIDGE ? { ridge: +process.env.RIDGE } : {}),
  // ONLINE=0: the batch ridge fit instead of the streaming recursion (the second route, rule 15).
  ...(process.env.ONLINE === '0' ? { online: false } : {}) };
if (!['hff', 'pilot'].includes(ENGINE)) throw new Error(`ENGINE ${ENGINE}: hff or pilot`);
const F = 4e-3;
const DIETS = {
  demo: null,
  poly: { feeds: [F, F, F], rMin: 3.4, rSpan: 2.4 },
  polyfeed: { feeds: [F, 2 * F, 0.5 * F], rMin: 3.4, rSpan: 2.4 },
  poly1: { feeds: [F], rMin: 3.4, rSpan: 2.4 },   // two programs, for a quick look at the engine
  poly4: { feeds: [F, F], rMin: 3.4, rSpan: 2.4 }, // four programs (two convex, two stars) — the shipped diet
  tour2: { feeds: [F, F], rMin: 3.4, rSpan: 2.4, tour: { nShapes: 6 } },   // two long closed tours, six shapes each (plan §52.16)
  tour1: { feeds: [F], rMin: 3.4, rSpan: 2.4, tour: { nShapes: 6 } },
};
if (!(DIET in DIETS) && DIET !== 'self' && DIET !== 'selfpoly') throw new Error(`DIET ${DIET}: one of ${Object.keys(DIETS).join(', ')}, self, selfpoly`);
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
  // LAPSYNC=1: re-phase the cascade's tick at each lap start (measured 2.23x -> 2.19x; off, plan §52.15).
  ...(process.env.LAPSYNC === '1' ? { lapSync: true } : {}),
  classic: false, maxDepth: ENGINE === 'pilot' ? 1 : 0, demo: null, lapMemory: PERIODIC, distil: DISTIL,
  ...(DIETS[DIET] ? { distilDiet: DIETS[DIET] } : {}), distilReplaces: REPLACE,
  // DIET=self: the bench square ITSELF as the only training program — the in-sample ceiling of the
  // basis on the program it is scored on; DIET=selfpoly: the square plus the four polygons.
  ...(DIET === 'self' ? { distilPath: [path] } : DIET === 'selfpoly' ? { distilPath: [path, ...designDemoPaths({ centre: [12, 0], feeds: [F, F], rMin: 3.4, rSpan: 2.4 })] } : {}),
  ...(process.env.CAP ? { distilCap: +process.env.CAP } : {}),
  ...(process.env.TEACHCAP ? { distilTeachCap: +process.env.TEACHCAP } : {}),
  // Q=<steps>: a circular moving-average Q-filter on the teacher's learned increment (plan §52.16).
  ...(process.env.Q ? { distilQ: +process.env.Q } : {}),
  // TEACHITERS=<n>: the teacher solves its QP with this many iterations (deploy keeps its own).
  ...(process.env.TEACHITERS ? { distilTeachIters: +process.env.TEACHITERS } : {}),
  // SCHED=1: the pose-scheduled map (every window feature also times the pose offset).
  ...(process.env.SCHED === '1' ? { distilSchedule: 'pose' } : {}),
  // ADAPTLAG=<steps> / ADAPTRATE=<x>: the tracker-stays law's pairing lag and gain (plan §52.18).
  ...(process.env.ADAPTLAG ? { distilAdaptLag: +process.env.ADAPTLAG } : {}),
  ...(process.env.ADAPTRATE ? { distilAdaptRate: +process.env.ADAPTRATE } : {}),
  // FB=1: a feedback cascade layer identified and scored ON TOP of the distilled model (plan §52.20).
  ...(process.env.FB === '1' ? { distilFeedbackOnTop: true } : {}),
  ...(process.env.FBCAP ? { distilFeedbackCap: +process.env.FBCAP } : {}),
  ...(process.env.FBGAIN ? { distilFeedbackGain: +process.env.FBGAIN } : {}),
  ...(process.env.FBBASIS ? { distilFeedbackBasis: process.env.FBBASIS } : {}),
  ...(process.env.INSTR === '1' ? { instruments: true } : {}),
  // FBOPTS=key=value,...: any Pilot option for the feedback layer alone — e.g. FBOPTS=ditherAmp=0.005,
  // because its dither defaults to a tenth of its authority, sized for the bare machine's error and
  // not for the residual it is identified on (plan §52.25).
  ...(process.env.FBOPTS ? { distilFeedbackSched: Object.fromEntries(process.env.FBOPTS.split(',').map((kv) => { const [k, v] = kv.split('='); return [k, isNaN(+v) ? v : +v]; })) } : {}),
  // FBSCHED=order[,lags[,cmd]]: the feedback layer's scheduled block shape (plan §52.25), e.g. FBSCHED=2,1,1
  ...(process.env.FBSCHED ? (() => { const a = process.env.FBSCHED.split(','); const prev = process.env.FBOPTS ? Object.fromEntries(process.env.FBOPTS.split(',').map((kv) => { const [k, v] = kv.split('='); return [k, isNaN(+v) ? v : +v]; })) : {}; return { distilFeedbackSched: { ...prev, schedOrder: +a[0], ...(a[1] ? { schedLags: +a[1] } : {}), ...(a[2] ? { schedCmd: a[2] === '1' } : {}), ...(a[3] ? { schedFn: a[3] } : {}) } }; })() : {}),
  // STD=1: standardised rows (each feature divided by its rms over the training rows).
  ...(process.env.STD === '1' ? { distilStandardize: true } : {}),
  // SOFFS=a,b,c: the direction-of-travel block's offsets, in pilot samples (default none).
  ...(process.env.SOFFS ? { distil: { ...DISTIL, signOffsetsPerSample: process.env.SOFFS.split(',').map(Number) } } : {}),
  // REF=angles|torques|both: what the policy reads at each window offset (plan §52.16).
  ...(process.env.REF ? { distilRef: process.env.REF } : {}),
  // PARAM=1: the parametric engine — iterate the policy's parameters, not the signal (plan §52.16).
  ...(process.env.PARAM === '1' ? { distilParametric: true } : {}),
  // COMMISSIONING-TIME KNOBS (plan §52.9): TLAPS laps per teacher drive, TPASSES passes,
  // TRACE=1 re-measures the prefix between passes (the old behaviour, the control).
  ...(process.env.TLAPS ? { distilTeachLaps: +process.env.TLAPS } : {}),
  ...(process.env.TPASSES ? { distilPasses: +process.env.TPASSES } : {}),
  ...(process.env.TRACE === '1' ? { distilTeachTrace: true } : {}),
  // HOLD is gone: every drive starts with a driven APPROACH and rule 45's settle (plan §52.12).
  distilEngine: ENGINE, distilDebug: process.env.DEBUG === '1',
  distilOracle: process.env.ORACLE === '0' ? false : process.env.ORACLE === 'control' ? 'control' : true,
  avg: G.avg, warmup: G.warmup, passes: G.passes, probeLaps: G.probeLaps,
  onRung: (r) => console.log(`  [${Math.round((Date.now() - t0) / 1000)}s, ${(host.samples().samples / 60000).toFixed(1)} machine-min] ${r.name}  ${r.score.toExponential(4)}`
    + `  ${r.gain === null ? '' : r.gain.toFixed(2) + 'x'}${r.deployed ? '' : '  NOT deployed'}${r.note ? '  — ' + r.note : ''}`),
});
host.auto.pilotOpts.start = m0.arm.ik(path.at(0).x, path.at(0).y, true);
// BASIS=quad|lin|sch: force the pilot's forecast basis (every cascade layer, including the feedback layer).
if (process.env.BASIS) host.auto.pilotOpts.forceBasis = process.env.BASIS;
// LEADPROBE=1: the pilot re-fits every sampled lead ALONE beside the shared fit and records both
// held-out R² per lead (plan §52.25) — is one weight vector for every lead what the feedback
// layer's forecast is paying for?
if (process.env.LEADPROBE === '1') globalThis.__LEADPROBE = {};
const rep = await host.auto.commission({ run: host.run, drivePilot: host.drivePilot,
  recordDemo: host.recordDemo, distilRuns: host.distilRuns });
if (globalThis.__LEADPROBE) for (const c of Object.keys(globalThis.__LEADPROBE)) {
  const rows = globalThis.__LEADPROBE[c];
  console.log(`  lead probe ch${c} (last layer fitted): ` + rows.map((r) => `L${r.L} shared ${r.shared.toFixed(2)} per-lead ${r.perLead.toFixed(2)}`).join('  '));
}
// THE FEEDBACK LAYER'S OWN FORECAST, per channel: which basis it chose and its held-out R² at
// the near, middle and far lead — so a refused layer can be read to its forecast or its inversion.
for (const stF of host.auto.built.stacks || []) for (const p of stF.layers) if (p.report && p.report.readouts) {
  console.log('  feedback layer forecast: ' + p.report.readouts.map((r, c) => `ch${c} ${r.basis} lags ${r.lags} R² lin ${(r.r2Lin ?? NaN).toFixed(3)} poly ${(r.r2Poly ?? NaN).toFixed(3)} sched ${(r.r2Sched ?? NaN).toFixed(3)} | lead0 ${(r.r2Lead0 ?? NaN).toFixed(3)} mid ${(r.r2Mid ?? NaN).toFixed(3)} far ${(r.r2Far ?? NaN).toFixed(3)}${r.gated ? ' GATED' : ''}`).join('   '));
}

console.log(`\n  shipped ${JSON.stringify(rep.deployed)}   ${rep.base.toExponential(4)} -> ${rep.best.toExponential(4)}   ${rep.gain.toFixed(2)}x`);
const _st = host.auto.built.stack; if (_st) console.log(`  pilot sample stride ${_st.sample} steps, so the ±256-sample window spans ±${256 * _st.sample} steps${process.env.WIN ? ` (WIN ${process.env.WIN}: ±${Math.round(256 * +process.env.WIN) * _st.sample})` : ''}`);
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
const heldPolicy = (p, tr, refAt = tr.refAt, speedAt = tr.speedAt) => {
  const st = p.stride || 1; let held = [0, 0];
  return { at: (k) => { if (k % st === 0) held = p.act(refAt, k, speedAt(k)); return held; } };
};
// ADAPT=<laps>: THE TRACKER STAYS ON THE MACHINE (plan §52.18). Run the bench square with the
// truth routed into `observe` — the deployed policy's own streaming recursion continuing on
// the program in front of it — and score every lap, so the composition the page offers as a
// box is a number rather than an assertion.
if (process.env.ADAPT && host.auto.deployed.distil) {
  const N = +process.env.ADAPT;
  const lapRms = (r) => r.lapE.map((le) => { let s2 = 0; for (let k = 0; k < le.length; k++) s2 += le[k] * le[k]; return Math.sqrt(s2 / le.length); });
  const frozen = await host.run(null, null, 3, false);
  const fr = lapRms(frozen);
  console.log(`\n  the tracker stays on: contour rms per lap on the square (frozen policy ${fr[fr.length - 1].toExponential(3)} on its last lap)`);
  const r = await host.run(null, null, N, true);
  const lr = lapRms(r);
  console.log('    ' + lr.map((v, i) => `lap ${i}: ${v.toExponential(3)}`).join('\n    '));
  console.log(`    adapted ${host.auto.distil.adapted().toLocaleString()} rows; frozen -> adapted last lap ${(fr[fr.length - 1] / lr[lr.length - 1]).toFixed(2)}x`);
  const after = await host.run(null, null, 3, false);
  const ar = lapRms(after);
  console.log(`    then FROZEN again (tracker off): ${ar[ar.length - 1].toExponential(3)} on its last lap (${(fr[fr.length - 1] / ar[ar.length - 1]).toFixed(2)}x over the commissioned policy)`);
}
// LEARN=<passes>: learn on the bench square itself with the tracker attached, by the ladder's own
// parametric law (plan §52.18), then score the square frozen.
// HELD-OUT PROGRAMS the model has never been shown — the rounded rectangle and the circle — and
// the commissioning diet: scored with the policy BEFORE and AFTER learning on the square, so a
// gain that is a memory of the square (worse elsewhere) reads as one.
const heldOut = await host.distilRuns({ paths: [
  roundedRect({ w: 8, h: 8, r: 1.5, centre: [12, 0], feed: F, accel: 4e-5, cornerDt: 40, closed: true }),
  circle({ r: 4, centre: [12, 0], feed: F, accel: 4e-5, cornerDt: 40 })] });
const heldNames = ['rounded rectangle', 'circle'];
const scoreSet = async (label, p2, set, names) => {
  const out = [];
  for (let i = 0; i < set.length; i++) {
    const tr = set[i];
    const b = await tr.run(null), w = await tr.run(heldPolicy(p2, tr));
    out.push(b.score / w.score);
    console.log(`    ${label}: ${names[i]} (lap ${tr.lap})  ${b.score.toExponential(4)} -> ${w.score.toExponential(4)}   ${(b.score / w.score).toFixed(2)}x`);
  }
  return out;
};
if (process.env.LEARN && host.auto.deployed.distil) {
  const before = await host.run(null, null);
  const live = await host.liveRuns();
  const dietRuns = await host.distilRuns();
  console.log(`\n  BEFORE learning on the square (${process.env.LEARNMODE || 'diet'} mode):`);
  await scoreSet('held-out', host.auto.distil, heldOut, heldNames);
  await scoreSet('diet', host.auto.distil, dietRuns, dietRuns.map((t, i) => `polygon ${i}`));
  const lr = await host.auto.learnLive(live, { passes: +process.env.LEARN, mode: process.env.LEARNMODE || 'diet',
    onPass: (p2) => console.log(`    pass ${p2.pass}: ${p2.score.toExponential(4)} on the live program${p2.accepted ? '' : ' — not kept'}`) });
  const after = await host.run(null, null);
  console.log(`\n  learned on the live program (${lr.passes} passes, ${lr.changed ? 'policy replaced' : 'policy unchanged'}): square ${before.score.toExponential(4)} -> ${after.score.toExponential(4)}   ${(rep.base / after.score).toFixed(2)}x over the conventional machine (was ${(rep.base / before.score).toFixed(2)}x)`);
  console.log(`  machine samples now ${host.samples().samples.toLocaleString()} (${(host.samples().samples / 60000).toFixed(1)} machine-min)`);
  console.log(`\n  AFTER learning on the square:`);
  await scoreSet('held-out', host.auto.distil, heldOut, heldNames);
  await scoreSet('diet', host.auto.distil, dietRuns, dietRuns.map((t, i) => `polygon ${i}`));
}
const pol = host.auto.built.distil;
if (pol && pol.W) {
  console.log('\n  the policy on its OWN training programs (BARE machine -> with the policy; the square above is over the CONVENTIONAL machine):');
  const runs = await host.distilRuns();
  for (let i = 0; i < runs.length; i++) {
    const tr = runs[i];
    const base = await tr.run(null);
    // EVALUATED AS IT DEPLOYS: once per decision and HELD between, never at every step. The
    // deployed object holds (AutoStack's distil.stride); reading the policy at every step
    // evaluates the fit at phases it never saw and scores an object that does not ship.
    const withP = await tr.run(heldPolicy(pol, tr));
    // THE SIZE OF THE CONTROL AGAINST THE SIZE OF THE ERROR IT CANCELS, in the same units
    // (joint rad, rms over the lap): a correction much smaller than the error it removes is
    // a scale fault somewhere, not a clever controller.
    { const hp = heldPolicy(pol, tr); let s2 = 0; for (let k = 0; k < tr.lap; k++) { const u = hp.at(k); s2 += u[0] * u[0] + u[1] * u[1]; }
      console.log(`      control rms ${Math.sqrt(s2 / tr.lap).toExponential(3)} rad against bare error rms ${base.score.toExponential(3)} rad (ratio ${(Math.sqrt(s2 / tr.lap) / base.score).toFixed(2)})`); }
    console.log(`    program ${i} (lap ${tr.lap}): ${base.score.toExponential(4)} -> ${withP.score.toExponential(4)}`
      + `   ${(base.score / withP.score).toFixed(2)}x` + (withP.sat != null ? `   drive saturated ${(100 * withP.sat).toFixed(1)}% of steps (bare ${(100 * base.sat).toFixed(1)}%)` : ''));
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
    // THE LADDER'S OWN ENGINE where the host supplies it, so the folds measure the route that
    // ships and not a second one (the first version converged with HarmonicFF at stride 1).
    let r, at;
    if (tr.converge) { r = await tr.converge(); at = r.at; }
    else { const h = new HarmonicFF({ lap: tr.lap, channels: 2, uMax, ...a.hffOpts }); r = await h.commission(async (corr) => tr.run(corr)); at = (k) => h.at(k); }
    const pre = new Array(tr.lap); for (let k = 0; k < tr.lap; k++) pre[k] = at(k);
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
    const shipped = host.auto.built.distil;
    const S0 = host.auto.built.stack ? host.auto.built.stack.sample : 1;
    const pol = new DistilPolicy({ channels: 2, refDim: shipped ? shipped.refDim : 2,
      offsets: shipped ? shipped.offsets : opts.offsets, signOffsets: shipped ? shipped.signOffsets : opts.signOffsets,
      ridge: opts.ridge, uMax, online: opts.online !== false, adaptSign: opts.adaptSign });
    pol.stride = shipped ? shipped.stride : S0;
    for (let j = 0; j < runs.length; j++) {
      if (j === i || prefixes[j].gain <= 1.5) continue;
      pol.addProgram({ refAt: runs[j].refAt, n: runs[j].lap, prefix: prefixes[j].pre, speedAt: runs[j].speedAt, stride: pol.stride, closed: !!runs[j].closed });
    }
    const fit = pol.fit();
    if (!fit.deploy) { console.log(`    fold ${i}: fit refused — ${fit.reason}`); continue; }
    const tr = runs[i];
    const b = await tr.run(null);
    const w = await tr.run(heldPolicy(pol, tr));
    const sqB = await host.run(null, null);
    const sqW = await host.run(heldPolicy(pol, null, sqRef, sqSpeed), 'distil');
    rows.push({ i, held: b.score / w.score, square: sqB.score / sqW.score, r2: fit.heldOutR2.map((v) => +v.toFixed(3)) });
    console.log(`    fold ${i}: held-out program ${(b.score / w.score).toFixed(2)}x   square ${(sqB.score / sqW.score).toFixed(2)}x   R² ${JSON.stringify(rows[rows.length - 1].r2)}`);
  }
  if (rows.length) {
    const geo = (xs) => Math.exp(xs.reduce((s2, x) => s2 + Math.log(x), 0) / xs.length);
    console.log(`\n  geometric mean: held-out polygon ${geo(rows.map((r) => r.held)).toFixed(2)}x   square ${geo(rows.map((r) => r.square)).toFixed(2)}x`);
  }
}
await host.dispose(); await m0.l1.destroy(); await m0.l2.destroy();
