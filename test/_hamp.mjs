// IS `h` AMPLITUDE-DEPENDENT? — the last unmeasured property of the operator the QP inverts,
// and the one the machine's own behaviour points at.
//
// THE FACT THAT DEMANDS AN EXPLANATION. Given a cap of 1.20 rad and a PERFECT forecast, the QP
// stops at uPk 0.4785 of its own accord and delivery saturates at 3.65x. It declines authority
// it has. A linear model cannot want to stop — `boxQP` minimises ||f0 + T(h)u||^2 + effort, and
// with the effort weight measured inert (lambda/100 changes nothing) there is no term that
// should make more correction stop paying. Something about the machine's response at large `u`
// is not in `h`.
//
// AND `h` IS A SMALL-SIGNAL KERNEL BY CONSTRUCTION. It is identified from ONE probe at ONE
// amplitude — `probeAmp` — and then inverted at whatever the QP asks for, which at uCap 0.6 is
// four times that and at the cap-x8 rung was eight. This arm has Stribeck friction, backlash
// and a gearbox stiffness that is only nominally linear; there is no reason its response per
// unit correction should be the same at 0.05 rad and 0.60.
//
// MEASURED THE SAME WAY AS EVERYTHING ELSE HERE: difference two runs of the deterministic
// plant, identical but for a `du` step during motion, at a LADDER of amplitudes, and normalise
// each by its own `du`. If the normalised responses coincide, `h` is amplitude-free and this
// explanation is dead. If they fall away with amplitude, the QP is inverting a gain the
// machine only has for small corrections — which would explain the saturation, the authority
// it declines, and why depth pays where a bigger cap alone does not.
//
// BOTH HALVES REPORTED (rule 39 from the model's side): the DC, which a per-amplitude gain
// could carry, and the SHAPE, which would need more than a gain.
import { makeArm, mkPath, homeArm, routeSignals, commissionArm, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.HA_SHAPE || 'sharp';
const FEED = +(process.env.HA_FEED || 0.004);
const DUS = (process.env.HA_DUS || '0.05,0.15,0.30,0.60').split(',').map(Number);
const WIN = +(process.env.HA_WIN || 4000);

console.log(`arm K ${PG.K} / E ${PG.E}; ${SHAPE} at feed ${FEED}, amplitudes ${DUS.join(', ')} rad`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const S = pilot.sample;
const path = mkPath(SHAPE, FEED);
const LAP = Math.round(path.lap);
console.log(`the probe that identified h ran at amplitude ${pilot.probeAmp}; `
  + `sample ${S}, lap ${LAP}`);

const run = async (ch, at, du) => {
  const { arm, servo } = await makeArm();
  homeArm(arm, servo, path);
  const total = 3 * LAP + WIN;
  const out = [];
  for (let k = 0; k < total; k++) {
    const c = path.at(k);
    const [q1, q2] = arm.ik(c.x, c.y, true);
    const rt = arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    const on = at !== null && k >= at;
    const u = [on && ch === 0 ? du : 0, on && ch === 1 ? du : 0];
    const tau = servo.torques([{ theta: q1 + u[0], omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2 + u[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
    arm.step(tau[0], tau[1], 1);
    if (k >= 2 * LAP - S && k % S === 0) out.push(routeSignals(arm, [{ pos: q1 }, { pos: q2 }], tau).truth.slice());
  }
  await arm.l1.destroy(); await arm.l2.destroy();
  return out;
};
const AT = 2 * LAP + Math.round(0.5 * LAP);

for (let ch = 0; ch < 2; ch++) {
  console.log(`\n=== correction channel ${ch} ===`);
  const base = await run(ch, null, 0);
  const i0 = Math.max(0, Math.floor((AT - (2 * LAP - S)) / S));
  const resp = [];
  for (const du of DUS) {
    const r = await run(ch, AT, du);
    const n = Math.min(base.length, r.length);
    const d = [];
    for (let i = i0; i < n; i++) d.push((r[i][ch] - base[i][ch]) / du);
    resp.push({ du, d });
  }
  const ref = resp[0].d;
  const dcOf = (d) => { const m = Math.min(200, Math.floor(d.length / 3));
    let s = 0; for (let i = d.length - m; i < d.length; i++) s += d[i]; return s / m; };
  console.log('   du     dc per unit u    relative to the smallest    shape corr');
  for (const r of resp) {
    const a = r.d, b = ref, n = Math.min(a.length, b.length);
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let k = 0; k < n; k++) { sa += a[k]; sb += b[k]; saa += a[k] * a[k]; sbb += b[k] * b[k]; sab += a[k] * b[k]; }
    const cv = sab / n - (sa / n) * (sb / n);
    const sd = Math.sqrt(Math.max(0, saa / n - (sa / n) ** 2) * Math.max(0, sbb / n - (sb / n) ** 2));
    console.log(`  ${r.du.toFixed(2)}   ${dcOf(r.d).toExponential(4)}        `
      + `${(dcOf(r.d) / dcOf(ref)).toFixed(4).padStart(8)}            `
      + `${(sd > 0 ? cv / sd : 0).toFixed(4)}`);
  }
}
console.log('EXIT 0');
