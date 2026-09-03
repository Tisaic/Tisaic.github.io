// COMMISSION `h` ON A MOVING MACHINE INSTEAD OF A HELD ONE — the experiment the registration
// sweep points at, and rule 34 aimed at the one model this project never applied it to.
//
// THE CASE. `h` is identified from a probe taken while the machine is HELD (rule 33 wants it
// held: a probe must not be scored as production, and a dithered one cannot see what it is
// cancelling). The QP then inverts that kernel with the machine MOVING. Three measurements
// say those are not the same operator:
//
//   `_hmove`   the moving step response is 1.18x the commissioned kernel on channel 0 and
//              1.006x on channel 1 — and phase-INDEPENDENT on both, so this is not scheduling
//   `_hlag`    the measured response LEADS the model by 13 samples (117 solver steps) on
//              channel 0 and 3 on channel 1; re-registering lifts R^2 from 0.9110 to 0.9558,
//              which moves the one-shot bound 1/sqrt(1-R^2) from 3.35x to 4.75x
//   `_hcheck`  the least-squares gain over a deployed run is 0.880 where the DC step says
//              1.18 — the model over-predicts dynamically and under-predicts its own DC,
//              which no single scale or shift can be
//
// A HELD JOINT HAS TO BREAK STICTION BEFORE IT MOVES; a moving one is already sliding. That
// is a delay and a lost fraction of the correction, present in the probe and absent in
// production, and it predicts exactly the pair above. This bench does not argue it — it
// replaces the kernel with one measured on the moving machine and puts the question to the
// machine (rule 16).
//
// THE SWAP GOES THROUGH THE PILOT'S OWN `_buildH`, so the triangle registration the QP
// depends on is the shipped one and not a second copy of it (rule 61). Only `h.resp` changes.
import { commissionArm, deployOn, makeArm, mkPath, homeArm, routeSignals, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPES = (process.env.HS_SHAPES || 'sharp,circle,rounded').split(',');
const FEED = +(process.env.HS_FEED || 0.004);
const DU = +(process.env.HS_DU || 0.15);
const PROBE = process.env.HS_PROBE || 'sharp';   // the program the moving probe runs on

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}; moving probe on ${PROBE}, pulse ${DU} rad`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const S = pilot.sample;
const path = mkPath(PROBE, FEED);
const LAP = Math.round(path.lap);
const RESPLEN = pilot.hs[0].resp.length;
// the pulse lands one lap in, so the flex is loaded and the machine is on a steady lap
const AT0 = Math.round(mkPath(PROBE, FEED).lap);
console.log(`sample ${S}, lap ${LAP}; the commissioned resp is ${RESPLEN} solver steps`);

// ONE RUN OF THE PROBE PROGRAM, open loop but for an optional step in `u` from `at`. The same
// differencing `_hmove` uses: the plant is deterministic, so two runs identical but for the
// pulse subtract to exactly the response to it — no fit, no ridge, nothing to condition.
const run = async (ch, at) => {
  const { arm, servo } = await makeArm();
  homeArm(arm, servo, path);
  const total = 2 * LAP + RESPLEN + 64;
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
    if (k >= AT0) out.push(routeSignals(arm, [{ pos: q1 }, { pos: q2 }], tau).truth.slice());
  }
  await arm.l1.destroy(); await arm.l2.destroy();
  return out;
};


const moving = [];
for (let ch = 0; ch < 2; ch++) {
  const base = await run(ch, null);
  const pulsed = await run(ch, AT0);
  const n = Math.min(base.length, pulsed.length, RESPLEN);
  // THE SAME QUANTITY `_finishProbe` STORES: `h.resp` is already the truth per unit `u`
  // (it divides by the probe amplitude), so the swap hands `_buildH` the identical units and
  // only the machine's condition — held against moving — differs.
  const r = new Array(n);
  for (let i = 0; i < n; i++) r[i] = (pulsed[i][ch] - base[i][ch]) / DU;
  const tailN = Math.max(1, Math.floor(n * 0.1));
  const dc = r.slice(n - tailN).reduce((a, v) => a + v, 0) / tailN;
  moving.push({ resp: r, dc });
  console.log(`  channel ${ch}: moving response over ${n} steps, DC ${dc.toExponential(4)} `
    + `against the held probe's ${pilot.hs[ch].dc.toExponential(4)} `
    + `(${(dc / pilot.hs[ch].dc).toFixed(3)}x)`);
}

const off = {}, before = {}, after = {};
for (const shape of SHAPES) {
  off[shape] = (await deployOn(pilot, shape, false, FEED)).r.totalRms;
  before[shape] = await deployOn(pilot, shape, true, FEED);
}
// SWAP AND REBUILD THROUGH THE PILOT'S OWN PATH
const saved = pilot.hs.map((h) => ({ resp: h.resp, dc: h.dc }));
for (let ch = 0; ch < 2; ch++) { pilot.hs[ch].resp = moving[ch].resp; pilot.hs[ch].dc = moving[ch].dc; }
pilot._buildH();
for (const shape of SHAPES) after[shape] = await deployOn(pilot, shape, true, FEED);
// RESTORED AND REBUILT, so anything measured after this bench is the shipped kernel again
for (let ch = 0; ch < 2; ch++) { pilot.hs[ch].resp = saved[ch].resp; pilot.hs[ch].dc = saved[ch].dc; }
pilot._buildH();

console.log('\n  program     open        held probe (ships)     moving probe        change');
for (const shape of SHAPES) {
  const b = before[shape], a = after[shape];
  console.log(`  ${shape.padEnd(9)} ${off[shape].toExponential(3)}  `
    + `${b.r.totalRms.toExponential(4)} ${(off[shape] / b.r.totalRms).toFixed(2).padStart(6)}x   `
    + `${a.r.totalRms.toExponential(4)} ${(off[shape] / a.r.totalRms).toFixed(2).padStart(6)}x   `
    + `${(b.r.totalRms / a.r.totalRms).toFixed(3)}x   uPk ${b.uPk.toFixed(3)} -> ${a.uPk.toFixed(3)}`);
}
console.log('EXIT 0');
