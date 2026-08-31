/**
 * @file THE PREDICTION THAT WOULD KILL AVERAGING: does it survive a HELD-OUT program?
 *
 * Averaging the commissioning draws measures 1.344x on the tank, from eight draws that every one
 * refused, and the average vouched for itself on the machine. The obvious objection is the one
 * this project's whole north star is about: if the advantage is the k models agreeing on the
 * program they were all commissioned against, it is a MEMORY by a new route and the retirement
 * rules it out.
 *
 * The tank cannot answer that — it has one program. The arm has two. So: commission k times, take
 * the gate's own regime on the ROUNDED rectangle, average the weights, and read the CIRCLE, which
 * no draw was scored on and the average was not selected on.
 *
 * WHAT EACH OUTCOME MEANS, stated before the run so neither can be read as a success:
 *   - the average beats the median draw on the CIRCLE  → it is a better plant model, and the
 *     mechanism is variance reduction as theorised;
 *   - it beats on the rounded rectangle and NOT the circle → it is fitting the shared program, and
 *     averaging is a memory the same way a lap table is;
 *   - it beats neither → the tank result was one plant, and the account is wrong.
 *
 * Run: node test/pilot/armens.mjs   [K=6]
 */
import { Pilot } from '../../lib/pilot/pilot.js';
import { ensemble } from '../../lib/pilot/ensemble.js';
import { ContourScore } from '../../lib/flexisim/contour.js';
import { PG, makeArm, mkPath, homeArm, routeSignals } from './rigs/arm-rig.mjs';

const K = +(process.env.K || 6);

async function commission(seed) {
  const { arm, servo } = await makeArm();
  const startPath = mkPath('rounded', 0.004);
  homeArm(arm, servo, startPath);
  const centre = arm.ik(12, 0, true);
  const pilot = new Pilot({
    autoRefuse: true, nMeasured: 6,
    channels: [0, 1].map((j) => ({ lo: centre[j] - 0.55, hi: centre[j] + 0.55,
      vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
    uMax: 0.15,
    start: arm.ik(startPath.at(0).x, startPath.at(0).y, true),
    guards: [{ index: 4, max: 6 }, { index: 5, max: 6 }],
    workspace: (q) => {
      const r = Math.hypot(arm.L1 * Math.cos(q[0]) + arm.L2 * Math.cos(q[0] + q[1]),
        arm.L1 * Math.sin(q[0]) + arm.L2 * Math.sin(q[0] + q[1]));
      return r > Math.abs(arm.L1 - arm.L2) + 0.5 && r < arm.L1 + arm.L2 - 0.5;
    },
    seed,
    verifyRef: (i) => {
      const c = startPath.at(i % Math.max(1, Math.round(startPath.lap)));
      return arm.ik(c.x, c.y, true);
    },
  });
  // A STEP CAP, BECAUSE A PHASE THAT NEVER COMPLETES IS INDISTINGUISHABLE FROM A SLOW ONE.
  // The first run of this file sat for 38 minutes with no output on work that should take about
  // 16, and nothing could say whether a commissioning was stuck or merely slow: the loop had no
  // bound and the file printed nothing until all six draws finished. Rule 44 in a new costume —
  // a sub-task with no termination condition can be waited on but never diagnosed.
  let nStep = 0;
  while (pilot.phase !== 'done') {
    if (++nStep > 6e6) {
      console.log(`  draw ${seed}: ABANDONED after ${nStep} steps, still in phase '${pilot.phase}'`);
      return null;
    }
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    const refs = cmd.map((c) => ({ theta: c.pos + c.u, omega: c.vel, alpha: c.acc }));
    const tau = servo.torques(refs);
    arm.step(tau[0], tau[1], 1);
    // THE RIG'S OWN ROUTING, not a second copy of it. The first version of this file routed raw
    // joint angles and the ENCODER error — and the servo closes on the encoder, so that truth is
    // near zero while the tool droops, which is the whole error this controller exists to remove.
    // The commissioning never terminated and the symptom read as "the plant is slow".
    const r = routeSignals(arm, cmd, tau);
    pilot.observe(r.measured, r.truth);
  }
  return pilot;
}

/** Score a commissioned pilot on one shape, correction on and off. */
async function deployOn(pilot, shape, active) {
  const { arm: a2, servo: s2 } = await makeArm();
  const path = mkPath(shape, 0.004);
  homeArm(a2, s2, path);
  const S = pilot.sample, cache = new Map();
  const refAt = (i) => {
    let r = cache.get(i);
    if (!r) { const c = path.at(i * S); r = a2.ik(c.x, c.y, true); cache.set(i, r); }
    return r;
  };
  pilot._initRun();
  const total = Math.ceil(path.lap * 3), scoreFrom = Math.ceil(path.lap * 2);
  const score = new ContourScore({ joints: 2, reversalTravel: 2e-2 });
  let kSamp = 0;
  for (let k = 0; k < total; k++) {
    const cmd = path.at(k);
    const [q1, q2] = a2.ik(cmd.x, cmd.y, true);
    const rt = a2.ikRates(q1, q2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
    const u = active ? pilot.act((off) => refAt(kSamp + off)) : [0, 0];
    const refs = [{ theta: q1 + u[0], omega: rt.dq1, alpha: rt.ddq1 },
      { theta: q2 + u[1], omega: rt.dq2, alpha: rt.ddq2 }];
    const tau = s2.torques(refs);
    a2.step(tau[0], tau[1], 1);
    if (active) pilot.observe(routeSignals(a2, [{ pos: q1 }, { pos: q2 }], tau).measured, null);
    if ((k + 1) % S === 0) kSamp++;
    if (k >= scoreFrom) {
      const t = a2.toolXY();
      score.add({ path, x: t.x, y: t.y, cmdX: cmd.x, cmdY: cmd.y, tau, q: [a2.q1, a2.q2] });
    }
  }
  return score.report();
}

console.log(`\npilot: does the ENSEMBLE survive a program no draw was scored on?`);
console.log('  the gate scores the ROUNDED rectangle; the CIRCLE is never part of it.\n');
const pilots = [];
for (let s = 1; s <= K; s++) {
  const t0 = Date.now();
  const p = await commission(s);
  // PROGRESS AS IT HAPPENS rather than a silent block that either finishes or does not — and the
  // verdict with it, because every draw on this plant is expected to DEPLOY, so a refusal is
  // itself the news and would otherwise stay invisible until the table at the end.
  console.log(`  commissioned draw ${s} in ${((Date.now() - t0) / 1000).toFixed(0)}s`
    + `${p ? ` — ${p.verdict && p.verdict.deploy ? 'deploy' : 'REFUSED'}` : ''}`);
  if (p) pilots.push(p);
}
if (pilots.length < 2) { console.log('\n  too few draws survived to average'); process.exit(0); }

const rows = [];
for (let i = 0; i < pilots.length; i++) {
  const offR = await deployOn(pilots[i], 'rounded', false);
  const onR = await deployOn(pilots[i], 'rounded', true);
  const offC = await deployOn(pilots[i], 'circle', false);
  const onC = await deployOn(pilots[i], 'circle', true);
  rows.push({ s: i + 1, r: offR.contourRms / onR.contourRms, c: offC.contourRms / onC.contourRms });
  console.log(`  draw ${i + 1}  rounded ${rows[i].r.toFixed(2)}x   circle ${rows[i].c.toFixed(2)}x`);
}

const e = ensemble(pilots);
if (!e.pilot) { console.log(`\n  ${e.why}`); process.exit(0); }
e.pilot.verdict = { deploy: true, why: 'ensemble' };
const offR = await deployOn(e.pilot, 'rounded', false), onR = await deployOn(e.pilot, 'rounded', true);
const offC = await deployOn(e.pilot, 'circle', false), onC = await deployOn(e.pilot, 'circle', true);
const med = (a) => { const b = [...a].sort((p, q) => p - q); const h = b.length >> 1;
  return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2; };
const eR = offR.contourRms / onR.contourRms, eC = offC.contourRms / onC.contourRms;
console.log(`\n  ENSEMBLE of ${e.used}/${e.of}:  rounded ${eR.toFixed(2)}x   CIRCLE ${eC.toFixed(2)}x`);
console.log(`  median draw:              rounded ${med(rows.map(r => r.r)).toFixed(2)}x   `
  + `circle ${med(rows.map(r => r.c)).toFixed(2)}x`);
console.log(`  best draw:                rounded ${Math.max(...rows.map(r => r.r)).toFixed(2)}x   `
  + `circle ${Math.max(...rows.map(r => r.c)).toFixed(2)}x`);
console.log(`\n  the CIRCLE column is the one that decides: a gain there is a better plant model, `
  + 'a gain only on the rounded rectangle is a memory by a new route.');
