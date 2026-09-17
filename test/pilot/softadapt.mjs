/**
 * @file FEED A SOFT-SENSED ERROR TO ADAPTATION — the falsifier for the one open route on this
 *       project's largest commercial gap (task #73).
 *
 * NOT A TEST — an instrument. Run: `node test/pilot/softadapt.mjs`
 *
 * THE CLAIM UNDER TEST. Online adaptation is the largest measured lever on the retirement's
 * replacement list (9 of 9 cells improve, geometric 1.79x, and the two programs it never ran gain
 * more than the one it did), and it ships as a COMMISSIONING-ONLY phase for exactly one reason:
 * `pilot.observe(measured, truth)` wants a laser tracker at every sample, and the tracker is only
 * legal at commissioning. §52.23 measured every hidden state of this arm as observable from the
 * motor side and the CHAIN — instruments at commissioning only — delivering the second channel at
 * 0.85-0.95 and the first at 0.2-0.6. Nobody has ever fed that estimate to ADAPTATION. §52.26 fed
 * a soft sensor to the pilot's FEEDBACK layer and it failed because this gearbox answers ~951
 * steps later; that is the wrong consumer, not the wrong sensor — adaptation updates a model
 * between laps and a 951-step lag is nothing to it.
 *
 * THE FOUR THINGS THAT WOULD KILL IT, WRITTEN DOWN BEFORE THE RUN (rule 59). Each is reported
 * against explicitly, because a negative whose cause is unknown is worth much less than one whose
 * cause is named.
 *
 *   (1) THE ESTIMATE IS TOO POOR. §52.23 reads channel 1 at 0.2-0.6, and §50.1 prices degraded
 *       truth at ~2x of the delivered result at every level tried. Read here as the estimator's
 *       own IN-SITU R² on the program adaptation runs on, beside what it delivers.
 *   (2) RULE 35. A soft sensor inside an adapting loop is positive feedback unless it was trained
 *       over the operating points that loop will occupy — and an ADAPTING loop occupies points the
 *       commissioning did not see. Read as the guide-lap LADDER: if this fires, more guided laps
 *       is worse, not better.
 *   (3) THE FAILURE SHAPE IS THE WORST KIND — excellent immediately, bad slowly, invisible to a
 *       short test. Read the same way, and by scoring the FIRST unseen lap and a converged lap in
 *       separate columns, because §52.18's own lesson is that the two rank configurations
 *       differently.
 *   (4) AND THE ONE THIS HARNESS ADDS, WHICH IS STRUCTURAL AND WAS PREDICTED BEFORE ANY RUN.
 *       `_onlineStep` regresses the truth on `ro._row0` — the pilot's OWN regressor, a window of
 *       the measured signals and the command. A soft sensor is a function of those same signals.
 *       So adaptation against an estimate can only learn the part of the ESTIMATOR'S MAP that the
 *       pilot's own basis does not already contain: it teaches the pilot to predict the SOFT
 *       SENSOR, not the machine, and any error in the sensor is fitted as though it were truth.
 *       The prediction is therefore that the estimate-fed adaptation lands at or below the static
 *       controller and well below the tracker-fed one, whatever the estimate's R².
 *       ITS OWN FALSIFIER: if soft-fed adaptation reaches a useful fraction of tracker-fed
 *       adaptation, this account is wrong.
 *
 * WHAT IS DEGRADED AND WHAT IS NOT (rule 15). Only what the LEARNER sees. Every score below is
 * taken by `deployOn` from `a2.toolXY()`, which no knob here can reach, so what is measured is the
 * cost of a cheap instrument for the learner and never a cheap scoreboard — the direction
 * `ARM_TOOL_NOISE` and `distilTruth` already establish.
 *
 * THE PROTOCOL, and the cheating versions it rules out:
 *   - the sensor is FITTED on programs adaptation never runs on and used on one it never saw.
 *     Fitted and used on the same program it would read 0.9-1.0 for anything (rule 36).
 *   - it is fitted with the pilot's correction ARMED, which is the configuration it will RUN in
 *     (rule 34 — §52.20 lost half a result by identifying under the feedforward and deploying bare).
 *   - `IDENT=1` is the port's own control: a `softTruth` closure that returns the tracker's own
 *     value must reproduce the tracker protocol BIT-EXACTLY, which is what says the substitution
 *     mechanism changes nothing by itself (rule 21).
 *   - `MODE=direct` is the second control: the same features and no instrument anywhere, so what
 *     the chain BUYS is a measurement (rule 9, both halves).
 *
 * THE SCORE IS THE UNSEEN PATH. Every headline column is the FIRST SCORED LAP (lap 1 — lap 0
 * carries a start-up transient) of a program the controller has never run, with a converged lap
 * printed beside it and never instead of it.
 */
import { commissionArm, deployOn, randomPolygon, PG } from './rigs/arm-rig.mjs';
import { fitSoftSensor, liveReader, r2Meter } from './rigs/softsense.mjs';

const FEED = +(process.env.FEED || 0.004);
const SEEDS = (process.env.SEEDS || '1,2,3').split(',').map(Number);
const MODE = process.env.MODE || 'chain';          // chain | direct
const IDENT = process.env.IDENT === '1';           // the port's own inertness control
// RIDGE unset means CHOSEN leave-one-program-out; a number forces it (the control).
const RIDGE = process.env.RIDGE ? +process.env.RIDGE : null;
const FITLAPS = +(process.env.FITLAPS || 3);
// The program adaptation is GUIDED on, and the programs it never runs. `sharp` is the bench
// program of the owner's standing rule; the guide is a different shape so the guided phase is
// never scored on what it adapted on unless it is asked for explicitly.
// THE GUIDE IS THE DIAMOND, AND THAT IS A MEASUREMENT RATHER THAN A CHOICE. `trackaway.mjs` at
// this cell reads the tracker-guided phase transferring to the bench square from the DIAMOND
// (1.71x -> 1.93x) and NOT from the rounded rectangle (1.71x -> 1.66x, slightly worse than
// static). Guiding on a program whose adaptation does not transfer would measure nothing about
// the sensor, because there would be no lever for a degraded truth to fail to reproduce
// (rule 20 — the comparison has to be made where the thing being compared exists).
const GUIDE = process.env.GUIDE || 'diamond';
const HELD = (process.env.HELD || 'sharp,rounded,circle').split(',').filter(Boolean);
// The programs the SENSOR is fitted on. Neither the guide nor anything in HELD (rule 36).
const FITON = (process.env.FITON || '').split(',').filter(Boolean);
// ...plus random POLYGONS from the block's own designer, which is what every other diet here is
// made of. They cost commissioning laps and nothing else, and they are what keeps the fit from
// being under-determined at 191 features — a sensor starved of rows would fail for a reason that
// has nothing to do with the question (rule 20).
const FITPOLY = +(process.env.FITPOLY || 4);
// THE GUIDE-LAP LADDER, which is how killers (2) and (3) are read. A route that is excellent at
// 2 laps and bad at 30 has the failure shape this project warns about, and a single short run
// cannot tell it from a route that works.
const LADDER = (process.env.LADDER || '2,6,16').split(',').map(Number);
const NAMES = { sharp: 'sharp square', rounded: 'rounded rect', circle: 'circle', diamond: 'diamond' };

// RULE 36, ASSERTED RATHER THAN INTENDED. A sensor fitted on the program adaptation runs on, or
// on one of the programs the result is read off, reads 0.9-1.0 for anything (§52.23's own memory
// control) and the whole experiment would be vacuous with nothing in the output to say so.
for (const sh of FITON) {
  if (sh === GUIDE || HELD.includes(sh)) {
    throw new Error(`softadapt: the sensor may not be fitted on ${sh} — it is the guide or a scored program`);
  }
}

const t0 = Date.now();
const el = () => `${Math.round((Date.now() - t0) / 1000)}s`;
console.log(`\nSOFT-SENSED TRUTH FOR ONLINE ADAPTATION — arm K ${PG.K} / E ${PG.E}, feed ${FEED}`);
console.log(`  sensor ${MODE}${IDENT ? ' (IDENTITY control — must reproduce the tracker exactly)' : ''}`
  + `, fitted on [${FITON.join(', ')}], guided on ${GUIDE}, scored on ${[GUIDE, ...HELD].join(', ')}`);
console.log(`  guide-lap ladder ${LADDER.join(', ')}; seeds ${SEEDS.join(', ')}`);

/** Lap 1 alone — the FIRST scored lap — and a converged lap, in separate columns. */
const FIRST = { laps: 2, scoreFromLap: 1 };
const CONV = { laps: +(process.env.CONVLAP || 5), scoreFromLap: +(process.env.CONVLAP || 5) - 1 };

const rows = [];
for (const seed of SEEDS) {
  console.log(`\n── seed ${seed} [${el()}]`);
  const pilot = await commissionArm({ seed });
  if (!pilot || !pilot.verdict.deploy) { console.log('  commissioning refused; skipped'); continue; }
  const S = pilot.sample;

  // ---- THE DENOMINATOR: this machine with no correction at all, on every scored program, on the
  // same laps the candidates are scored on (rule 20).
  const bare = {};
  for (const sh of [GUIDE, ...HELD]) {
    const b1 = await deployOn(pilot, sh, false, FEED, FIRST);
    const b8 = await deployOn(pilot, sh, false, FEED, CONV);
    bare[sh] = [b1.r.contourRms, b8.r.contourRms];
  }

  // ---- THE FITTING TRACES, taken with the correction ARMED and adaptation OFF (rule 34).
  const traces = [];
  const mkRnd = (s0) => { let z = s0 >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
  const fitProgs = [...FITON,
    ...Array.from({ length: FITPOLY }, (_, i) => randomPolygon(mkRnd(9001 + 17 * i + 101 * seed), FEED, i % 2 === 1))];
  for (const sh of fitProgs) {
    const tr = [];
    await deployOn(pilot, sh, true, FEED, { laps: FITLAPS, scoreFromLap: Math.max(0, FITLAPS - 1), trace: tr });
    traces.push(tr);
  }
  const sensor = fitSoftSensor(traces, { mode: MODE, ridge: RIDGE, skip: 64, verbose: true });
  // THE SENSOR'S OWN QUALITY, PRINTED BEFORE ANYTHING IS DELIVERED (rule 27). A negative measured
  // through a sensor nobody characterised is not a finding about the route; the LOPO column is the
  // one directly comparable to §52.23's chain (0.2-0.6 first channel, 0.85-0.95 second).
  console.log(`  sensor: ${sensor.nFeat} features, ${sensor.nRows.toLocaleString()} rows from `
    + `${sensor.nProgs} fitting programs; ridge ${sensor.ridge.toExponential(0)}`
    + (sensor.agree === null ? '' : ` (solveRidge agreement ${sensor.agree.toExponential(1)})`));
  console.log(`          IN-SAMPLE R² ${sensor.inSample.map((v) => v.toFixed(3)).join(' / ')}`
    + (sensor.lopo ? `   LEAVE-ONE-PROGRAM-OUT R² ${sensor.lopo.best.map((v) => v.toFixed(3)).join(' / ')}` : ''));
  if (sensor.lopo) {
    console.log('          ridge ladder (LOPO, per channel): '
      + sensor.lopo.table.map((r) => `${r.lam.toExponential(0)}:${r.mean.map((v) => v.toFixed(2)).join('/')}`).join('  '));
  }

  // ---- THE WEIGHT SNAPSHOT/RESTORE, `trackaway.mjs`'s own idiom so every protocol starts from
  // the identical commissioned model rather than from whatever the last one left.
  const snap = () => pilot.readouts.map((ro) => ro.w.map((a) => Float64Array.from(a)));
  const restore = (s) => {
    for (let c = 0; c < pilot.readouts.length; c++) {
      const ro = pilot.readouts[c];
      for (let i = 0; i < ro.w.length; i++) ro.w[i].set(s[c][i]);
      delete ro._rls; ro._row0 = []; ro._infoRef = undefined;
      ro._onlineN = 0; ro._infoSkipped = 0; ro._infoSeen = 0;
    }
    pilot.online = null;
  };
  const W0 = snap();

  const score = async (label, guideLaps, truthKind) => {
    restore(W0);
    let r2 = null, scale = null, updates = null;
    if (guideLaps > 0) {
      pilot.online = {};
      const meter = r2Meter();
      let soft = null;
      if (truthKind !== 'tracker') {
        const rd = liveReader(sensor);
        soft = IDENT
          // THE PORT'S OWN CONTROL: hand back the tracker's value. The run must reproduce the
          // tracker protocol to the last digit, or the substitution mechanism is itself the
          // finding rather than the sensor (rule 21).
          ? ((m, k, refAt, truth) => { rd(m, k, refAt); return truth; })
          : ((m, k, refAt) => rd(m, k, refAt));
      }
      await deployOn(pilot, GUIDE, true, FEED, { laps: guideLaps, scoreFromLap: Math.max(0, guideLaps - 1),
        truthUntilLap: guideLaps, softTruth: soft,
        truthTap: soft ? (e, t) => meter.push(e, t) : null });
      if (soft && !IDENT) { r2 = meter.report(); scale = meter.scale(); }
      // FROZEN. The tracker is unbolted and every number after this line is taken with no truth
      // of any kind reaching the controller — which is what makes the comparison legal.
      pilot.online = null;
      updates = pilot.readouts.map((r) => r._onlineN || 0);
    }
    const out = { label, guideLaps, truthKind, r2, scale, updates, seed, prog: {} };
    for (const sh of [GUIDE, ...HELD]) {
      const a1 = await deployOn(pilot, sh, true, FEED, { ...FIRST, truthUntilLap: 0 });
      const a8 = await deployOn(pilot, sh, true, FEED, { ...CONV, truthUntilLap: 0 });
      out.prog[sh] = { first: a1.r.contourRms, conv: a8.r.contourRms, uPk: a1.uPk,
        xFirst: bare[sh][0] / a1.r.contourRms, xConv: bare[sh][1] / a8.r.contourRms };
    }
    rows.push(out);
    const cell = (sh) => `${out.prog[sh].first.toExponential(3)} (${out.prog[sh].xFirst.toFixed(2)}x)`;
    console.log(`  ${label.padEnd(22)} ${[GUIDE, ...HELD].map(cell).join('   ')}`
      + (r2 ? `   est R² ${r2.map((v) => v.toFixed(3)).join('/')}` : '')
      + (updates ? `   upd ${updates.join('/')}` : ''));
    return out;
  };

  await score('static (no adapt)', 0, null);
  for (const g of LADDER) await score(`tracker, ${g} laps`, g, 'tracker');
  for (const g of LADDER) await score(`SOFT, ${g} laps`, g, 'soft');
  restore(W0);
}

// ---- THE TABLE, across seeds. A point estimate on one commissioning draw is a coin (§87.3).
const progs = [GUIDE, ...HELD];
const geo = (xs) => Math.exp(xs.reduce((a, b) => a + Math.log(b), 0) / xs.length);
console.log(`\n${'='.repeat(100)}\nDELIVERED, FIRST SCORED LAP (lap 1) of each program, x over the bare machine`);
console.log(`(a converged lap in the second column; the guide program ${GUIDE} is the one adaptation ran on)\n`);
const labels = [...new Set(rows.map((r) => r.label))];
const hdr = progs.map((p) => (NAMES[p] || p).padEnd(21)).join(' ');
console.log(`  ${'protocol'.padEnd(22)} ${hdr}  seeds`);
for (const lab of labels) {
  const rs = rows.filter((r) => r.label === lab);
  if (!rs.length) continue;
  const cells = progs.map((p) => {
    const f = geo(rs.map((r) => r.prog[p].xFirst)), c = geo(rs.map((r) => r.prog[p].xConv));
    const lo = Math.min(...rs.map((r) => r.prog[p].xFirst)), hi = Math.max(...rs.map((r) => r.prog[p].xFirst));
    return `${f.toFixed(2)}x /${c.toFixed(2)}x [${lo.toFixed(2)}-${hi.toFixed(2)}]`.padEnd(21);
  });
  console.log(`  ${lab.padEnd(22)} ${cells.join(' ')}  n=${rs.length}`);
}
const held = HELD.filter((h) => progs.includes(h));
console.log(`\n  geometric over the programs adaptation NEVER RAN (${held.join(', ')}), first scored lap:`);
for (const lab of labels) {
  const rs = rows.filter((r) => r.label === lab);
  if (!rs.length) continue;
  const g = geo(rs.flatMap((r) => held.map((h) => r.prog[h].xFirst)));
  const r2s = rs.map((r) => r.r2).filter(Boolean);
  console.log(`    ${lab.padEnd(22)} ${g.toFixed(3)}x`
    + (r2s.length ? `    in-situ estimate R² ${[0, 1].map((c) => (r2s.reduce((a, b) => a + b[c], 0) / r2s.length).toFixed(3)).join(' / ')}` : ''));
}
console.log(`\n[${el()}]`);
