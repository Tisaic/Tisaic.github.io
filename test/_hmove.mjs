// DOES `h` CHANGE WHILE THE MACHINE IS MOVING? — the measurement `test/_hvary.mjs` could not
// take, and the one that decides whether the pilot's plant model has any headroom left.
//
// WHERE THIS SITS. The oracle ladder put the pilot at its plant model's one-shot ceiling —
// `h` explains R^2 0.94 / 0.77 of what a correction actually does and 1/sqrt(1-R^2) is 4.1x
// and 2.1x, exactly where the ladder stopped. `_hvary.mjs` then measured `h` across the
// workspace at HELD poses and found the modelled terms flat to 4% in gain and 0.99 in shape,
// killing the pose-scheduled build. But a held probe cannot see Stribeck friction, backlash
// crossing or inertial coupling, because those exist only in motion — and mode ⑩'s operator,
// which IS measured on a moving machine, was pose-dependent enough to be worth 44x -> 51.5x.
//
// THE PLANT IS DETERMINISTIC, SO DIFFERENCING IS EXACT. Run the program twice from the same
// state, identical but for a `du` pulse starting at one phase, and subtract: what is left IS
// the response to that pulse at that phase, during motion, with no fit, no ridge and no
// design matrix. Repeat across phases and compare against the pilot's own commissioned
// `hSample`, which is what the QP inverts everywhere.
//
// THE PULSE SIZE IS THE MACHINE'S OWN. This arm has backlash and Stribeck friction, so the
// response depends on how hard it is pushed; the pulse is sized at the correction cap the
// pilot actually applies rather than at something small enough to flatter the linearity
// (rule 33: a probe is never scored as production, and a probe the production never reaches
// answers a question the machine is not asked).
import { makeArm, mkPath, homeArm, routeSignals, commissionArm, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.HM_SHAPE || 'sharp';
const FEED = +(process.env.HM_FEED || 0.004);
const NPH = +(process.env.HM_NPH || 8);
const DU = +(process.env.HM_DU || 0.15);
const WIN = +(process.env.HM_WIN || 4000);      // response window, solver steps

console.log(`arm K ${PG.K} / E ${PG.E}; ${SHAPE} at feed ${FEED}, ${NPH} phases, `
  + `pulse ${DU} rad, window ${WIN} steps`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const S = pilot.sample;
const path = mkPath(SHAPE, FEED);
const LAP = Math.round(path.lap);
console.log(`sample ${S}, lap ${LAP} steps; the pilot's own hSample is `
  + `${pilot.hs[0].hSample.length} samples long`);

// ONE RUN OF THE PROGRAM, open loop but for an optional step in `u` from `at` onwards. Two
// laps of run-in so the flex is loaded and the machine is on its steady lap before anything
// is measured (rule 13), then the pulse.
const run = async (ch, at) => {
  const { arm, servo } = await makeArm();
  homeArm(arm, servo, path);
  const total = 2 * LAP + WIN;
  const out = [];
  for (let k = 0; k < total; k++) {
    const c = path.at(k);
    const [q1, q2] = arm.ik(c.x, c.y, true);
    const rt = arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    const on = at !== null && k >= at;
    const u = [on && ch === 0 ? DU : 0, on && ch === 1 ? DU : 0];
    const tau = servo.torques([{ theta: q1 + u[0], omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2 + u[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
    arm.step(tau[0], tau[1], 1);
    if (k % S === 0 && k >= 2 * LAP - S) out.push(routeSignals(arm, [{ pos: q1 }, { pos: q2 }], tau).truth.slice());
  }
  await arm.l1.destroy(); await arm.l2.destroy();
  return out;
};

for (let ch = 0; ch < 2; ch++) {
  console.log(`\n=== correction channel ${ch}, during motion ===`);
  // THE CONTROL RUN, once: the same program with no pulse at all. Everything below is a
  // difference against it, so a drift shared by both runs cancels exactly.
  const base = await run(ch, null);
  const hRef = pilot.hs[ch].hSample;
  // the commissioned kernel's own step response, for the comparison
  const stepRef = [];
  { let s = 0; for (let i = 0; i < Math.min(hRef.length, Math.floor(WIN / S)); i++) { s += hRef[i]; stepRef.push(s); } }
  console.log('  phase   at step    dc ch0      dc ch1     rel to commissioned   shape corr vs commissioned');
  const rels = [];
  for (let p = 0; p < NPH; p++) {
    const at = 2 * LAP + Math.round((p / NPH) * LAP) - LAP;   // a phase within the steady lap
    const r = await run(ch, at);
    const i0 = Math.max(0, Math.floor((at - (2 * LAP - S)) / S));
    const n = Math.min(base.length, r.length);
    const d = [];
    for (let i = i0; i < n; i++) d.push([(r[i][0] - base[i][0]) / DU, (r[i][1] - base[i][1]) / DU]);
    if (d.length < 10) { console.log(`  ${p}: window too short`); continue; }
    const dcOf = (c) => {
      const m = Math.min(200, Math.floor(d.length / 3));
      let s = 0; for (let i = d.length - m; i < d.length; i++) s += d[i][c];
      return s / m;
    };
    const d0 = dcOf(0), d1 = dcOf(1);
    const mine = ch === 0 ? d0 : d1;
    const refDC = stepRef.length ? stepRef[stepRef.length - 1] : 1;
    // shape against the COMMISSIONED kernel's step response — the one the QP inverts
    const a = d.map((v) => v[ch]), b = stepRef;
    const nn = Math.min(a.length, b.length);
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let k = 0; k < nn; k++) { sa += a[k]; sb += b[k]; saa += a[k] * a[k]; sbb += b[k] * b[k]; sab += a[k] * b[k]; }
    const cv = sab / nn - (sa / nn) * (sb / nn);
    const sd = Math.sqrt(Math.max(0, saa / nn - (sa / nn) ** 2) * Math.max(0, sbb / nn - (sb / nn) ** 2));
    const corr = sd > 0 ? cv / sd : 0;
    rels.push(mine / refDC);
    console.log(`  ${String(p).padStart(5)} ${String(at).padStart(9)}  ${d0.toExponential(3)} `
      + `${d1.toExponential(3)}   ${(mine / refDC).toFixed(3).padStart(9)}            ${corr.toFixed(4)}`);
  }
  if (rels.length) {
    const lo = Math.min(...rels), hi = Math.max(...rels);
    console.log(`  gain against the commissioned kernel: ${lo.toFixed(3)} .. ${hi.toFixed(3)} `
      + `(${(hi / lo).toFixed(2)}x across the lap)`);
  }
}
console.log('EXIT 0');
