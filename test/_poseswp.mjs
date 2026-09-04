// THE EXCITATION IS THE CONSTRAINT: A POSE-GRIDDED MULTISINE AGAINST THE SCRIBBLE.
//
// THE OWNER'S PROPOSAL: "If you held the elbow and then did a sine sweep on the shoulder and then
// move the shoulder some amount and sin sweep it again and do that at every combo of arm angle
// relationship to learn the pose dependencies and to learn the frequency domain of every pose...
// If you only look at tip position it can never learn that at certain motor frequencies the tip
// can stay almost still and the arm can be moving a lot."
//
// ONE REFINEMENT TO IT. The routed row already carries motor angles, motor SPEEDS and motor
// TORQUES beside the tip error, so "a lot of motor for almost no tip" is REPRESENTABLE — a small
// gain at that frequency. What has never been shown to the fit is DATA at those frequencies and
// poses. So this is a coverage question, not a capacity one, and the evidence says so directly:
// `_leaky` measured the elbow's lead-0 forecast at in-sample 0.93 against held-out 0.61, and
// adding 40 state columns to the SAME record moved held-out by 0.015 while adding 60 more made
// it worse. Capacity added to a record that does not cover the programs buys nothing.
//
// AND THE SHIPPED EXCITATION HAS NO POSE DESIGN AT ALL. It is one broadband scribble whose
// bandwidth is set by TRAVERSING the position box, so velocity binds and acceleration and jerk
// ride along (rule 41b, measured: the arm's sharp square uses 61537% of the declared jerk and the
// excitation covers 25% of its error energy). Pose is not a dimension it varies deliberately.
//
// THE DESIGN, AND WHY IT IS NOT THE SEQUENTIAL CHIRP AS PROPOSED. Both joints are driven at once
// with INDEPENDENT-RANDOM-PHASE multisines. Uncorrelated phases decorrelate the channels, which
// is what makes a two-input identification well-posed, and it covers "independently and
// dependently" in ONE record — where holding one joint and chirping the other, at every pose,
// is roughly ten times the machine time for the same information. Commissioning cost is already
// a north-star failure, so a design that costs ten times more has to earn it.
//
// THE AMPLITUDE RULE IS THE OTHER HALF, AND IT IS RULE 41b'S FIX. Each frequency gets
// `min(box, vMax/w, aMax/w^2, jMax/w^3)` — whatever the BINDING limit allows AT THAT FREQUENCY —
// instead of one box traverse where velocity binds and the rest ride along. A flat-amplitude
// multisine would demand impossible acceleration at the top of the band and saturate the drive,
// which is a probe against a saturation and not a probe (the harmonic rung paid for that lesson).
//
// MATCHED, SO THE COMPARISON IS ONE VARIABLE (rule 20): the same number of samples as the
// commissioning record, the same total command-deviation rms, the same fit machinery, the same
// column scale, and the same held-out programs. Only the RECORD differs.
//
// WHAT WOULD KILL IT: held-out R^2 no better than the scribble's. Then the scribble already
// covers what the programs visit, the coverage reading is wrong, and the forecast bound is where
// it is for a reason neither more data nor more capacity will move.
import { solveRidge } from '/home/user/Tisaic.github.io/lib/pilot/pilot.js';
import { peakDiffs } from '/home/user/Tisaic.github.io/lib/pilot/excite.js';
import { PG, makeArm, mkPath, homeArm, routeSignals, commissionArm, recordOpenLoop }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.PS_FEED || 0.004);
const UCAP = +(process.env.PS_UCAP || 0.6);
const SHAPES = (process.env.PS_SHAPES || 'rounded,circle,sharp').split(',');
const NPOSE = +(process.env.PS_NPOSE || 2);          // grid is NPOSE x NPOSE
// THE AMPLITUDE LADDER, AS FRACTIONS OF THE LARGEST THE DRIVE WILL PASS. A single-amplitude
// identification describes a single operating point, and the correction at deploy ranges from 0
// to uMax — so one amplitude is a calibration that does not span the range it is used over, which
// is the failure this project has now paid for five separate times. It also makes the plant's
// nonlinearity MEASURABLE rather than fatal: if every rung fits well alone and the pooled fit
// does not, the plant is amplitude-dependent and the model needs scheduling on amplitude. That is
// a finding; a single rung can only produce a number.
const AMPS = (process.env.PS_AMPS || '1,0.5,0.25,0.125').split(',').map(Number);
const NF = +(process.env.PS_NF || 24);               // multisine lines
const NYQ_MULT = +(process.env.PS_NYQ || 4);         // shortest period, in regressor strides
const LIM = { vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 };  // the rig's own declared limits
const BOX = 0.55;

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}, pose grid ${NPOSE}x${NPOSE}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
if (!pilot._fit || !pilot._fit.eFree) { console.log('record released'); process.exit(1); }
const S = pilot.sample;
const NSAMP = pilot._rec.x.length;
console.log(`sample ${S}; the commissioning record is ${NSAMP} samples = ${NSAMP * S} solver steps`);

// THE POSE GRID SPANS WHAT THE PROGRAMS ACTUALLY VISIT, measured off their own inverse
// kinematics rather than off the declared box — the box is where the machine CAN go and the
// programs are where it DOES (rule 41b, and "span the range it is used over", five times over).
const { arm: probeArm } = await makeArm();
const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
for (const sh of SHAPES) {
  const p = mkPath(sh, FEED);
  for (let k = 0; k < Math.round(p.lap); k += 37) {
    const c = p.at(k); const q = probeArm.ik(c.x, c.y, true);
    for (let i = 0; i < 2; i++) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); }
  }
}
await probeArm.l1.destroy(); await probeArm.l2.destroy();
console.log(`  the programs span q1 ${lo[0].toFixed(3)}..${hi[0].toFixed(3)}, `
  + `q2 ${lo[1].toFixed(3)}..${hi[1].toFixed(3)} rad`);

const poses = [];
for (let i = 0; i < NPOSE; i++) {
  for (let j = 0; j < NPOSE; j++) {
    const f = (n) => (NPOSE === 1 ? 0.5 : n / (NPOSE - 1));
    poses.push([lo[0] + (hi[0] - lo[0]) * f(i), lo[1] + (hi[1] - lo[1]) * f(j)]);
  }
}
const PER = Math.floor(NSAMP / (poses.length * AMPS.length)) * S;   // one period per (pose, amplitude)
console.log(`  ${poses.length} poses x ${AMPS.length} amplitudes x ${PER} steps `
  + `= ${poses.length * AMPS.length * PER} total`);

// THE MULTISINE: log-spaced harmonics of the record period, each at the largest amplitude its
// OWN binding limit allows, random phase per line and per channel.
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
// THE TOP OF THE BAND IS THE MODEL'S NYQUIST, NOT THE MACHINE'S. The first unsaturated run put
// lines down to a 64-step period against a regressor stride of 112 solver steps — three and a
// half times past what the features can resolve — and read in-sample R^2 0.037 with the drive
// completely clean. Energy above the lattice the row samples on is variance the fit is
// STRUCTURALLY unable to explain, so it does not teach the model anything; it only makes the
// target harder. "Learn the frequency domain of every pose" is bounded above by the model's own
// sampling, and that bound is a property of the fit rather than of the plant.
// AND THE BAND IS BOUNDED FROM BELOW AS WELL, WHICH THE FIRST THREE ATTEMPTS ALL MISSED. A lag
// window must REACH the period of what it has to see (rule 37, measured twice on this project:
// LINEAR features with the right window beat a 544-feature map with the wrong one at a third of
// the cost). This row is 12 lags at stride 14 samples, so it spans 1232 solver steps — and the
// multisine's lowest line had a period of 8960, seven times longer than the window can span.
// Content the window cannot reach is as unusable as content the stride cannot sample: measured,
// with the amplitude regime correct and the drive clean, in-sample R^2 0.009 and a residual of
// 0.0548 against a target of 0.0586. The model explained one per cent of its own record.
//
// SO THE USABLE BAND IS PERIODS BETWEEN THE STRIDE'S NYQUIST AND THE WINDOW'S REACH — 224 to
// 1232 steps here, BARELY ONE OCTAVE — and the commissioning scribble sits inside it by
// construction, at a correlation time of 662. That is a property of the REGRESSOR GEOMETRY, not
// of the plant, and it is the ceiling on what any excitation can teach this model.
const STRIDE_STEPS = pilot.readouts[0].stride * S;
const REACH_STEPS = (pilot.readouts[0].mLag - 1) * STRIDE_STEPS;
const TOP = +(process.env.PS_TOP || 0) || Math.round(NYQ_MULT * STRIDE_STEPS);
const BOT = +(process.env.PS_BOT || 0) || REACH_STEPS;
console.log(`  the row spans ${REACH_STEPS} steps and samples on a ${STRIDE_STEPS}-step lattice, `
  + `so it can only USE periods ${Math.round(2 * STRIDE_STEPS)}..${REACH_STEPS}; `
  + `exciting outside that is energy the fit cannot represent`);
const lines = [];
for (let i = 0; i < NF; i++) {
  const per = Math.exp(Math.log(BOT) + (Math.log(TOP / BOT) * i) / Math.max(1, NF - 1));
  const h = Math.max(1, Math.round(PER / per));
  if (!lines.length || h > lines[lines.length - 1]) lines.push(h);
}
const design = lines.map((h) => {
  const w = (2 * Math.PI * h) / PER;
  const A = Math.min(BOX, LIM.vMax / w, LIM.aMax / (w * w), LIM.jMax / (w * w * w));
  return { h, w, A, ph: [rnd() * 2 * Math.PI, rnd() * 2 * Math.PI] };
});
console.log(`  ${design.length} lines, periods ${Math.round(PER / design[0].h)} down to `
  + `${Math.round(PER / design[design.length - 1].h)} steps; amplitudes `
  + `${design[0].A.toExponential(2)} down to ${design[design.length - 1].A.toExponential(2)} rad`);

// THE GAIN IS SIZED TO THE PROGRAM'S OWN MOTION, WHICH IS THE THIRD RULE TRIED AND THE FIRST
// THAT IS NOT ARBITRARY. Two failed first:
//
//   MATCHED TO THE SCRIBBLE'S COMMAND RMS — saturated the shoulder drive 8% of the time (peak
//   demand 0.0070 against a tauMax of 0.0032) and read in-sample R^2 0.185, unable to fit its own
//   record, because a clipped record is not linear. The scribble's rms is mostly its slow
//   traverse of the position box, so a multisine carrying the same rms puts vastly more of it at
//   the top of the band, where torque goes as amplitude times frequency squared.
//
//   AS LARGE AS THE DRIVE WILL PASS — clean of saturation, and WORSE: in-sample R^2 0.026 with a
//   target rms of 1.63 against the scribble's 0.122. Thirteen times the error, essentially none
//   of it explained. Not saturated and not aliased: 0.33 rad rms of command deviation, on
//   programs that span 0.93 rad in total, throws the arm far outside the small-signal regime and
//   the record is dominated by nonlinearity — backlash crossed repeatedly, large deflections,
//   friction reversing. "As much as the drive allows" is not a linear identification experiment.
//
// THE PROGRAM IS THE SPECIFICATION (rule 34: commission in the configuration it will RUN in, and
// rule 41b, whose stated fix is exactly this — "an excitation that SPANS the box and also carries
// the program's own acceleration and jerk"). `peakDiffs` is the instrument that finding was made
// with, and it is used here as intended: measure the programs' own peak per-sample velocity and
// acceleration, and scale the multisine so ITS peaks match. The drive check is kept as a guard
// rather than as the rule, because a sizing that saturates is wrong whatever produced it.
const progPk = { v: 0, a: 0 };
{
  const { arm: pa } = await makeArm();
  for (const sh of SHAPES) {
    const pth = mkPath(sh, FEED);
    for (let c = 0; c < 2; c++) {
      const q = [];
      for (let k = 0; k < Math.round(pth.lap); k++) {
        const pt = pth.at(k); q.push(pa.ik(pt.x, pt.y, true)[c]);
      }
      const d = peakDiffs(q);
      progPk.v = Math.max(progPk.v, d.v); progPk.a = Math.max(progPk.a, d.a);
    }
  }
  await pa.l1.destroy(); await pa.l2.destroy();
}
// ONE GLOBAL GAIN CANNOT HIT TWO LIMITS, AND SCALING TO THE TIGHTER ONE REPRODUCES THE VERY
// TRAP THIS DESIGN EXISTS TO AVOID. Measured on the first attempt at this rule: the programs peak
// at v 5.063e-4 and a 1.557e-4 per step, the raw multisine at v 7.074e-3 and a 2.738e-5, so
// VELOCITY binds at 0.0716 while acceleration would have allowed 5.7x — the excitation ends up
// carrying about a eightieth of the program's acceleration. That is rule 41b verbatim ("the box
// TRAVERSE binds through velocity, so a and j ride along"), reappearing inside the fix for it.
//
// THE SHAPE IS THE FREE PARAMETER, NOT THE SCALE. With A_k = alpha/w_k + beta/w_k^2 the peak
// velocity sum is alpha*n + beta*sum(1/w) and the peak acceleration sum is alpha*sum(w) + beta*n,
// which is two linear equations in two unknowns: solve them and BOTH limits are met exactly.
// Physically, alpha buys the low band (where velocity binds) and beta the high band (where
// acceleration does), and the solve decides the trade instead of a global scale conceding it.
let GAIN = 1;
{
  const n = design.length;
  let sw = 0, si = 0;
  for (const d of design) { sw += d.w; si += 1 / d.w; }
  // [n, si; sw, n] [alpha, beta] = [v, a]
  const det = n * n - si * sw;
  let alpha = 0, beta = 0;
  if (Math.abs(det) > 1e-30) {
    alpha = (progPk.v * n - si * progPk.a) / det;
    beta = (n * progPk.a - sw * progPk.v) / det;
  }
  if (alpha > 0 && beta > 0) {
    for (const d of design) d.A = Math.min(d.A, alpha / d.w + beta / (d.w * d.w));
    console.log(`  two-term shape: alpha ${alpha.toExponential(3)} beta ${beta.toExponential(3)}`);
  } else {
    // A NEGATIVE COEFFICIENT MEANS THE PROGRAM'S OWN v AND a ARE NOT SIMULTANEOUSLY REACHABLE
    // WITH THIS LINE SET, and inventing a shape that ignores that would be a fabrication. Fall
    // back to the tighter limit and SAY so, rather than reporting a match that was not made.
    console.log(`  two-term shape UNREACHABLE with these lines (alpha ${alpha.toExponential(2)},`
      + ` beta ${beta.toExponential(2)}); falling back to the binding limit alone`);
  }
  let sweepV = 0, sweepA = 0;
  for (const d of design) { sweepV += d.A * d.w; sweepA += d.A * d.w * d.w; }
  GAIN = Math.min(progPk.v / Math.max(1e-30, sweepV), progPk.a / Math.max(1e-30, sweepA));
  console.log(`  the programs peak at v ${progPk.v.toExponential(3)} a ${progPk.a.toExponential(3)}`
    + ` rad/step; the shaped multisine at v ${sweepV.toExponential(3)} a ${sweepA.toExponential(3)}`
    + ` -> gain ${GAIN.toExponential(3)}`);
}

async function satAt(gain, pose) {
  const { arm, servo } = await makeArm();
  homeArm(arm, servo, mkPath('rounded', FEED));
  const from = [arm.encoders()[0].angle, arm.encoders()[1].angle];
  const EASE = 3000;
  for (let k = 0; k < EASE; k++) {
    const t = Math.min(1, k / EASE);
    const q = [0, 1].map((i) => from[i] + (pose[i] - from[i]) * 0.5 * (1 - Math.cos(Math.PI * t)));
    const tau = servo.torques([{ theta: q[0], omega: 0, alpha: 0 }, { theta: q[1], omega: 0, alpha: 0 }]);
    arm.step(tau[0], tau[1], 1);
  }
  const before = servo.limitStats().map((st) => st.saturated);
  const n = Math.min(PER, 12000);
  for (let k = 0; k < n; k++) {
    const q = [pose[0], pose[1]], v = [0, 0], a = [0, 0];
    for (const d of design) {
      for (let c = 0; c < 2; c++) {
        const th = d.w * k + d.ph[c];
        q[c] += gain * d.A * Math.sin(th);
        v[c] += gain * d.A * d.w * Math.cos(th);
        a[c] -= gain * d.A * d.w * d.w * Math.sin(th);
      }
    }
    const tau = servo.torques([{ theta: q[0], omega: v[0], alpha: a[0] },
      { theta: q[1], omega: v[1], alpha: a[1] }]);
    arm.step(tau[0], tau[1], 1);
  }
  const st = servo.limitStats();
  await arm.l1.destroy(); await arm.l2.destroy();
  let worst = 0;
  for (let i = 0; i < st.length; i++) worst = Math.max(worst, (st[i].saturated - before[i]) / n);
  return worst;
}
// MAXIMISE THE TORQUE WITHOUT EVER VIOLATING THE LIMIT — bisected, not halved. Halving down from
// an arbitrary start lands wherever the powers of two happen to fall and gave a drive running at
// 30% of tauMax with the excitation matched to the PROGRAM's velocity, so most of the machine's
// authority was going unused. Bisection finds the edge itself: the largest gain with no
// saturation at all, to within a few per cent, measured on the machine like every other constant
// here.
{
  let lo = 0, hi = GAIN;
  // first make sure `hi` actually violates, so the bracket is a bracket rather than an assumption
  for (let k = 0; k < 8 && (await satAt(hi, poses[0])) < 0.005; k++) { lo = hi; hi *= 2; }
  for (let k = 0; k < 7; k++) {
    const mid = 0.5 * (lo + hi);
    if ((await satAt(mid, poses[0])) < 0.005) lo = mid; else hi = mid;
  }
  console.log(`  bisected to the saturation edge: ${lo.toExponential(3)} clean, `
    + `${hi.toExponential(3)} violates`);
  GAIN = lo;
}
let rawRms = 0;
for (const d of design) rawRms += d.A * d.A / 2;
rawRms = Math.sqrt(rawRms) * GAIN;
const targetRms = (() => {
  const cmd = pilot._rec.cmd; const mean = [0, 0];
  for (const r of cmd) { mean[0] += r[0]; mean[1] += r[1]; }
  mean[0] /= cmd.length; mean[1] /= cmd.length;
  let s2 = 0;
  for (const r of cmd) s2 += (r[0] - mean[0]) ** 2 + (r[1] - mean[1]) ** 2;
  return Math.sqrt(s2 / (2 * cmd.length));
})();
console.log(`  chosen gain ${GAIN.toExponential(3)}; command rms ${rawRms.toExponential(3)} rad `
  + `against the scribble's ${targetRms.toExponential(3)} — REPORTED, not matched, because the `
  + `drive is the binding constraint and the two records excite different bands.`);

/** Drive the pose grid and record in exactly `_rec`'s shape. u = 0 throughout, so e IS eFree. */
async function recordSweep() {
  const { arm, servo } = await makeArm();
  homeArm(arm, servo, mkPath('rounded', FEED));
  const x = [], cmd = [], e = [], amp = [];
  for (const pose of poses) {
   for (const frac of AMPS) {
    // EASE INTO THE POSE AND LET IT SETTLE, because a record taken across the approach describes
    // the approach (rule 13). The settle is in periods of the plant's own measured Ts.
    const from = [arm.encoders()[0].angle, arm.encoders()[1].angle];
    const EASE = 4000, HOLD = Math.max(2000, Math.round(1.5 * pilot.Ts));
    for (let k = 0; k < EASE + HOLD; k++) {
      const t = Math.min(1, k / EASE);
      const q = [0, 1].map((i) => from[i] + (pose[i] - from[i]) * 0.5 * (1 - Math.cos(Math.PI * t)));
      const tau = servo.torques([{ theta: q[0], omega: 0, alpha: 0 }, { theta: q[1], omega: 0, alpha: 0 }]);
      arm.step(tau[0], tau[1], 1);
    }
    for (let k = 0; k < PER; k++) {
      const q = [pose[0], pose[1]], v = [0, 0], a = [0, 0];
      for (const d of design) {
        for (let c = 0; c < 2; c++) {
          const th = d.w * k + d.ph[c];
          q[c] += frac * GAIN * d.A * Math.sin(th);
          v[c] += frac * GAIN * d.A * d.w * Math.cos(th);
          a[c] -= frac * GAIN * d.A * d.w * d.w * Math.sin(th);
        }
      }
      const tau = servo.torques([{ theta: q[0], omega: v[0], alpha: a[0] },
        { theta: q[1], omega: v[1], alpha: a[1] }]);
      arm.step(tau[0], tau[1], 1);
      if (k % S === 0) {
        const r = routeSignals(arm, [{ pos: q[0] }, { pos: q[1] }], tau);
        x.push(r.measured); cmd.push([q[0], q[1]]); e.push(r.truth); amp.push(frac);
      }
    }
   }
  }
  const st = servo.limitStats ? servo.limitStats() : null;
  await arm.l1.destroy(); await arm.l2.destroy();
  return { x, cmd, u: [], e, amp, lap: 0, sat: st };
}

const sweep = await recordSweep();
console.log(`  swept record: ${sweep.x.length} samples`
  + (sweep.sat ? `, drive saturations ${JSON.stringify(sweep.sat)}` : ''));

const recs = {};
for (const s of SHAPES) recs[s] = await recordOpenLoop(pilot, s, FEED);

function build(rec, c, L, ro, target) {
  const saved = pilot._rec;
  pilot._rec = { x: rec.x, cmd: rec.cmd, u: [], e: rec.e };
  const stride = ro.stride, mL = ro.mLag, fL = ro.fLag;
  const back = Math.max((mL - 1) * stride, (fL - 1) * stride - L);
  const from = Math.max(back, rec.lap || back);
  const to = target.length - L - 1;
  const X = [], y = [];
  try {
    for (let k = from; k < to; k++) {
      X.push(pilot._row(c, k, L, stride, ro.poly, mL, fL, ro.sched, ro.longR || null));
      y.push(target[k + L]);
    }
  } finally { pilot._rec = saved; }
  return { X, y };
}
const r2 = (X, y, w) => {
  let sse = 0, sy = 0, sy2 = 0;
  for (let i = 0; i < X.length; i++) {
    let p = 0; const r = X[i];
    for (let j = 0; j < w.length; j++) p += w[j] * r[j];
    const d = y[i] - p; sse += d * d; sy += y[i]; sy2 += y[i] * y[i];
  }
  return 1 - sse / Math.max(sy2 - (sy * sy) / X.length, 1e-300);
};
const scale = (row0) => pilot._colScale(row0);

for (let c = 0; c < pilot.nc; c++) {
  const ro = pilot.readouts[c];
  const LEADS = [0, ro.leads[Math.floor(ro.leads.length / 2)], ro.leads[ro.leads.length - 1]];
  console.log(`\n=== channel ${c} — held-out R^2, same row, same ridge, only the RECORD differs ===`);
  console.log('  lead   fitted on      rows   in-sample' + SHAPES.map((s) => s.padStart(11)).join(''));
  for (const L of LEADS) {
    for (const src of ['scribble', 'poseswp']) {
      const rec = src === 'scribble' ? pilot._rec : sweep;
      const tgt = src === 'scribble' ? pilot._fit.eFree[c] : sweep.e.map((v) => v[c]);
      const tr = build(rec, c, L, ro, tgt);
      const w = solveRidge(tr.X, tr.y, ro.ridge, scale(tr.X[0]));
      const cols = SHAPES.map((sh) => {
        const h = build(recs[sh], c, L, ro, recs[sh].e.map((v) => v[c]));
        return r2(h.X, h.y, w).toFixed(4).padStart(11);
      }).join('');
      // THE TARGET'S OWN SCALE, because an R^2 near zero has two explanations that look
      // identical in the ratio — the features explain nothing, or the target is mostly energy
      // the features cannot represent — and only the residual against the target's rms tells
      // them apart (rule 17).
      let sy2 = 0, sse = 0;
      for (let i = 0; i < tr.X.length; i++) {
        let pr = 0; for (let j = 0; j < w.length; j++) pr += w[j] * tr.X[i][j];
        sy2 += tr.y[i] * tr.y[i]; sse += (tr.y[i] - pr) ** 2;
      }
      console.log(`  ${String(L).padStart(4)}   ${src.padEnd(9)}  ${String(tr.X.length).padStart(5)}`
        + `   ${r2(tr.X, tr.y, w).toFixed(4).padStart(9)}${cols}`
        + `   | target rms ${Math.sqrt(sy2 / tr.X.length).toExponential(2)}`
        + `  residual ${Math.sqrt(sse / tr.X.length).toExponential(2)}`);
    }
  }
}
console.log('EXIT 0');
