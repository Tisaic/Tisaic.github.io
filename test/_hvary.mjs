// IS `h` POSE-DEPENDENT? — measured directly, because every attempt to answer it by FITTING
// has failed on conditioning.
//
// WHY IT IS THE QUESTION. The oracle ladder put the pilot at its plant model's one-shot
// ceiling: `h` explains R^2 0.94 / 0.77 of what a correction actually does, and 1/sqrt(1-R^2)
// is 4.1x and 2.1x, which is exactly where the ladder stopped. `h` is identified ONCE, from a
// probe taken at the commissioning CENTRE, and then inverted everywhere in the workspace.
// Mode 10 hit the same wall one level up and named it: "the small-signal H is one
// lap-invariant response and this plant's is POSE-DEPENDENT" — worth 44x -> 51.5x when fixed.
//
// WHY THIS BENCH AND NOT A REGRESSION. `test/_hpose.mjs` tried to answer it by refitting
// kernels from a deployed run and produced negative held-out R^2 on every variant, because
// the correction sits AT ITS CAP for most of a run, so lagged `u` is a badly conditioned
// design matrix and a flat ridge with no column scaling is the confound this project has
// already paid for once. That table did not refute the pose route; it failed to measure it.
//
// SO MEASURE THE THING ITSELF. Hold the machine at a pose until it is quiet, step the
// correction, record the response — the pilot's OWN probe protocol, with the pose as the only
// variable. No fit, no ridge, no design matrix, nothing to condition. If the responses agree
// across the workspace then `h` is one kernel and the pose route is dead; if they do not, the
// disagreement is the size of what a pose-scheduled `h` could recover.
//
// BOTH HALVES ARE REPORTED (rule 39 from the model's side): the DC GAIN, which a scalar per
// pose could fix, and the normalised SHAPE, which needs a kernel per pose. Those are different
// builds with different costs, and one RMS number hides which is needed.
import { makeArm, mkPath, routeSignals, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.HV_FEED || 0.004);
const SHAPE = process.env.HV_SHAPE || 'sharp';
const NPOSE = +(process.env.HV_NPOSE || 8);
const DU = +(process.env.HV_DU || 0.05);        // step size in rad, well inside the cap
const SETTLE = +(process.env.HV_SETTLE || 24000);
const RESP = +(process.env.HV_RESP || 6000);    // response window in solver steps

console.log(`arm K ${PG.K} / E ${PG.E}; ${NPOSE} poses on the ${SHAPE} path at feed ${FEED}, `
  + `step ${DU} rad, settle ${SETTLE} steps, response window ${RESP}`);

const path = mkPath(SHAPE, FEED);
const lap = Math.round(path.lap);

// ONE HELD PROBE AT ONE POSE, which is the pilot's own protocol with the pose as the variable.
// The machine is commanded to a CONSTANT pose and left until it stops moving, then the
// correction steps and the tool error is recorded against its own pre-step baseline — so what
// comes back is the response to `du` and not the pose's static droop (rule 13).
const probeAt = async (q, ch) => {
  const { arm, servo } = await makeArm();
  const hold = (u0, u1, n, sink) => {
    for (let k = 0; k < n; k++) {
      const tau = servo.torques([{ theta: q[0] + u0, omega: 0, alpha: 0 },
        { theta: q[1] + u1, omega: 0, alpha: 0 }]);
      arm.step(tau[0], tau[1], 1);
      if (sink) sink.push(routeSignals(arm, [{ pos: q[0] }, { pos: q[1] }], tau).truth.slice());
    }
  };
  hold(0, 0, SETTLE, null);
  const base = [];
  hold(0, 0, 400, base);
  const b = [0, 1].map((c) => base.reduce((s, r) => s + r[c], 0) / base.length);
  const resp = [];
  hold(ch === 0 ? DU : 0, ch === 1 ? DU : 0, RESP, resp);
  await arm.l1.destroy(); await arm.l2.destroy();
  return resp.map((r) => [(r[0] - b[0]) / DU, (r[1] - b[1]) / DU]);
};

// the poses: evenly spaced along the program, which is the set the controller actually visits
const poses = [];
for (let i = 0; i < NPOSE; i++) {
  const c = path.at(Math.round((i / NPOSE) * lap));
  const { arm } = await makeArm();
  poses.push({ q: arm.ik(c.x, c.y, true), xy: [c.x, c.y] });
  await arm.l1.destroy(); await arm.l2.destroy();
}

for (let ch = 0; ch < 2; ch++) {
  console.log(`\n=== correction channel ${ch} ===`);
  const rs = [];
  for (const p of poses) rs.push(await probeAt(p.q, ch));
  // the reference is the FIRST pose; every other is reported against it, because the pilot
  // identifies at one pose and uses that kernel everywhere
  const ref = rs[0];
  const dcOf = (r, c) => {
    let s = 0; const n = Math.min(400, r.length);
    for (let i = r.length - n; i < r.length; i++) s += r[i][c];
    return s / n;
  };
  console.log('  pose   x       y        dc ch0      dc ch1     rel dc0   rel dc1   shape corr0  corr1');
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    const d0 = dcOf(r, 0), d1 = dcOf(r, 1);
    const r0 = dcOf(ref, 0), r1 = dcOf(ref, 1);
    // SHAPE, WITH THE GAIN DIVIDED OUT: correlation of the normalised responses says whether
    // one kernel scaled per pose would do, or whether the dynamics themselves move.
    const corr = [0, 1].map((c) => {
      const a = r.map((v) => v[c]), b = ref.map((v) => v[c]);
      const n = Math.min(a.length, b.length);
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let k = 0; k < n; k++) { sa += a[k]; sb += b[k]; saa += a[k] * a[k]; sbb += b[k] * b[k]; sab += a[k] * b[k]; }
      const cv = sab / n - (sa / n) * (sb / n);
      const sd = Math.sqrt(Math.max(0, saa / n - (sa / n) ** 2) * Math.max(0, sbb / n - (sb / n) ** 2));
      return sd > 0 ? cv / sd : 0;
    });
    console.log(`  ${String(i).padStart(4)} ${poses[i].xy[0].toFixed(2).padStart(6)} `
      + `${poses[i].xy[1].toFixed(2).padStart(6)}  ${d0.toExponential(3)} ${d1.toExponential(3)}`
      + `  ${(d0 / r0).toFixed(3).padStart(8)} ${(d1 / r1).toFixed(3).padStart(9)}`
      + `   ${corr[0].toFixed(4).padStart(9)} ${corr[1].toFixed(4).padStart(7)}`);
  }
  const rel0 = rs.map((r) => dcOf(r, 0) / dcOf(ref, 0));
  const rel1 = rs.map((r) => dcOf(r, 1) / dcOf(ref, 1));
  const spread = (a) => `${Math.min(...a).toFixed(3)} .. ${Math.max(...a).toFixed(3)} `
    + `(${(Math.max(...a) / Math.min(...a)).toFixed(2)}x)`;
  console.log(`  DC gain spread across the workspace: ch0 ${spread(rel0)}   ch1 ${spread(rel1)}`);
}
console.log('EXIT 0');
