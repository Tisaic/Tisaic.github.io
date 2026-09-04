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
import { PG, makeArm, mkPath, homeArm, routeSignals, commissionArm, recordOpenLoop }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.PS_FEED || 0.004);
const UCAP = +(process.env.PS_UCAP || 0.6);
const SHAPES = (process.env.PS_SHAPES || 'rounded,circle,sharp').split(',');
const NPOSE = +(process.env.PS_NPOSE || 2);          // grid is NPOSE x NPOSE
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
const PER = Math.floor(NSAMP / poses.length) * S;    // one multisine period per pose
console.log(`  ${poses.length} poses x ${PER} solver steps each = ${poses.length * PER} total`);

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
const STRIDE_STEPS = pilot.readouts[0].stride * S;
const TOP = +(process.env.PS_TOP || 0) || Math.round(NYQ_MULT * STRIDE_STEPS);
const lines = [];
for (let i = 0; i < NF; i++) {
  const h = Math.round(Math.exp((Math.log(PER / TOP) * i) / Math.max(1, NF - 1)));
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

// THE GAIN IS MEASURED ON THE MACHINE, NOT MATCHED TO THE SCRIBBLE'S RMS. The first version
// scaled the multisine to the commissioning record's command-deviation rms and SATURATED the
// shoulder drive 8% of the time (peak demand 0.0070 against a tauMax of 0.0032) — and the fit
// then read in-sample R^2 0.185, unable to fit its own record, because a clipped record is not
// linear. The error was in the matching rule: the scribble's rms is mostly its slow traverse of
// the position box, so a multisine carrying the same rms puts vastly more of it at the top of
// the band, where torque goes as amplitude times frequency squared.
//
// A probe against a saturation is a probe against the saturation (the harmonic rung paid for
// that lesson twice). So the gain is chosen the way every other constant here is: by asking the
// machine. Halve until the drive passes it, and report what was used.
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
  const before = servo.limitStats().map((s) => s.saturated);
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
let GAIN = 1;
for (let tryN = 0; tryN < 12; tryN++) {
  const f = await satAt(GAIN, poses[0]);
  console.log(`  gain ${GAIN.toExponential(2)}: drive saturated ${(100 * f).toFixed(2)}% of steps`);
  if (f < 0.005) break;
  GAIN /= 2;
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
  const x = [], cmd = [], e = [];
  for (const pose of poses) {
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
          q[c] += GAIN * d.A * Math.sin(th);
          v[c] += GAIN * d.A * d.w * Math.cos(th);
          a[c] -= GAIN * d.A * d.w * d.w * Math.sin(th);
        }
      }
      const tau = servo.torques([{ theta: q[0], omega: v[0], alpha: a[0] },
        { theta: q[1], omega: v[1], alpha: a[1] }]);
      arm.step(tau[0], tau[1], 1);
      if (k % S === 0) {
        const r = routeSignals(arm, [{ pos: q[0] }, { pos: q[1] }], tau);
        x.push(r.measured); cmd.push([q[0], q[1]]); e.push(r.truth);
      }
    }
  }
  const st = servo.limitStats ? servo.limitStats() : null;
  await arm.l1.destroy(); await arm.l2.destroy();
  return { x, cmd, u: [], e, lap: 0, sat: st };
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
