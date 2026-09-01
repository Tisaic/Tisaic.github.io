/**
 * @file THE KINEMATICS-FREE CHAIN UNDER THE NEW ARCHITECTURE — mode ⑥ (the tracker-taught
 * inverse commands the machine, the affine observer routes the truth, nothing knows the
 * arm's geometry) with the corner banks, the command-routed blend, and gated adaptation on
 * top. Two questions, both firsts:
 *
 *   - does the composition stack on a chain whose GEOMETRY is itself learned — banks fitted
 *     from records whose commands came out of the learned inverse;
 *   - and the sharp square through the learned map, which has never been measured at all:
 *     the learned inverse was fitted on HELD points, so a corner is doubly outside its
 *     training — a regime the scribble never ran, on a map the gather never stressed.
 *
 * Run: node test/pilot/ikfreecomp.mjs
 */
import { Pilot } from '../../lib/pilot/pilot.js';
import { decompose, ContourScore } from '../../lib/flexisim/contour.js';
import { PGIK, makeArmIK, gatherHeldPoints, buildMaps } from './rigs/ikfree-rig.mjs';
import { mkPath, randomPolygon, fitCornerBanks } from './rigs/arm-rig.mjs';

// THE COMPLIANCE, SWEEPABLE — the stiff default, or the brick-44 soft corner (K 0.25,
// E 0.03) where the flex dominates and the whole story is hardest. The soft gather uses
// fewer points at a lower degree, exactly as the ikfree contract's soft block does: 45
// points carry degree 5.
const KK = +(process.env.ARM_K || 16), EE = +(process.env.ARM_E || 0.15);
const PTS = +(process.env.PTS || (KK < 1 ? 45 : 90));
const DEG = +(process.env.DEG || (KK < 1 ? 5 : 7));
console.log(`arm: K ${KK} / E ${EE}; gather ${PTS} points, degree ${DEG}`);

// ------------------------------------------------- gather, fit the maps, commission ⑥
const { arm, servo } = await makeArmIK(KK, EE);
const centre = arm.ik(12, 0, true);          // experimental setup only: parking the arm
const box = [0, 1].map((j) => ({ lo: centre[j] - 0.55, hi: centre[j] + 0.55 }));
const t0 = Date.now();
const pairs = gatherHeldPoints(arm, servo, box, { n: PTS, seed: 7 });
const M = buildMaps(pairs, { D: DEG });
console.log(`gather: ${PTS} held points in ${((Date.now() - t0) / 1000).toFixed(0)}s, `
  + `inverse holdout ${M.holdout.toExponential(2)} rad`);

const circle = mkPath('circle', 0.004);
const q0 = M.predict(circle.at(0).x, circle.at(0).y);
arm.setPose(q0[0], q0[1]);
for (let i = 0; i < 4000; i++) {
  const t = servo.torques([{ theta: q0[0], omega: 0, alpha: 0 }, { theta: q0[1], omega: 0, alpha: 0 }]);
  arm.step(t[0], t[1], 1);
}
const centreQ = M.predict(PGIK.centre[0], PGIK.centre[1]);
// FORCE=1 deploys past the gate, the contract's own precedent at the soft corner: its block
// runs autoRefuse false deliberately, because that is the configuration where the gate's
// verdict was disputed across three rebuilt verifies and only DELIVERED numbers settle it
// (brick 58). The refusal it would have given is printed either way.
const pilot = new Pilot({ autoRefuse: process.env.FORCE === '1' ? false : true, nMeasured: 6,
  channels: [0, 1].map((j) => ({ lo: centreQ[j] - 0.55, hi: centreQ[j] + 0.55,
    vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
  uMax: +(process.env.UCAP || 0.15), start: q0,
  guards: [{ index: 4, max: 6 }, { index: 5, max: 6 }],
  workspace: () => true, seed: 1 });
const affine = (cmdQ, tool) => {
  const t2 = M.fwd(cmdQ);
  const Gm = M.gradAt(t2[0], t2[1]);
  const dx = tool[0] - t2[0], dy = tool[1] - t2[1];
  return [Gm[0][0] * dx + Gm[0][1] * dy, Gm[1][0] * dx + Gm[1][1] * dy];
};
while (pilot.phase !== 'done') {
  if (pilot.phase === 'fit') { pilot.work(); continue; }
  const cmd = pilot.command();
  const refs = cmd.map((c) => ({ theta: c.pos + c.u, omega: c.vel, alpha: c.acc }));
  const tau = servo.torques(refs);
  arm.step(tau[0], tau[1], 1);
  const enc = arm.encoders();
  pilot.observe([enc[0].angle, enc[1].angle, enc[0].speed * 1e3, enc[1].speed * 1e3,
    tau[0] * 1e3, tau[1] * 1e3], affine([cmd[0].pos, cmd[1].pos], arm.toolXY()));
}
await arm.l1.destroy(); await arm.l2.destroy();
const st = pilot.status();
console.log(`⑥ commissioned: ${pilot.verdict.deploy ? 'deploys' : 'REFUSED'}, verify `
  + `${st.report.verify ? st.report.verify.ratio.toFixed(2) + 'x' : '—'}`
  + `${st.report.wouldRefuse ? `  (wouldRefuse: ${st.report.wouldRefuse.why || st.report.wouldRefuse})` : ''}`);
if (!pilot.verdict.deploy) {
  console.log(`  why: ${pilot.verdict.why}`);
  process.exit(0);
}

// ---------------------------------- corner-bank records, ON THE LEARNED CHAIN, open loop
async function record(path) {
  const { arm: a, servo: s } = await makeArmIK(KK, EE);
  const p0 = M.predict(path.at(0).x, path.at(0).y);
  a.setPose(p0[0], p0[1]);
  for (let i = 0; i < 4000; i++) {
    const t = s.torques([{ theta: p0[0], omega: 0, alpha: 0 }, { theta: p0[1], omega: 0, alpha: 0 }]);
    a.step(t[0], t[1], 1);
  }
  const S = pilot.sample, lap = Math.ceil(path.lap);
  const x = [], cmd = [], e = [];
  for (let k = 0; k < 2 * lap; k++) {
    const c = path.at(k % lap), cm = path.at((k - 1 + lap) % lap), cp = path.at((k + 1) % lap);
    const q = M.predict(c.x, c.y), qm = M.predict(cm.x, cm.y), qp = M.predict(cp.x, cp.y);
    const tau = s.torques([
      { theta: q[0], omega: (qp[0] - qm[0]) / 2, alpha: qp[0] - 2 * q[0] + qm[0] },
      { theta: q[1], omega: (qp[1] - qm[1]) / 2, alpha: qp[1] - 2 * q[1] + qm[1] }]);
    a.step(tau[0], tau[1], 1);
    if (k % S === 0) {
      const enc = a.encoders();
      x.push([enc[0].angle, enc[1].angle, enc[0].speed * 1e3, enc[1].speed * 1e3,
        tau[0] * 1e3, tau[1] * 1e3]);
      cmd.push(q);
      e.push(affine(q, a.toolXY()));
    }
  }
  await a.l1.destroy(); await a.l2.destroy();
  return { x, cmd, e, lap: Math.ceil(lap / S) };
}
const rnd = (s0) => { let z = s0 >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const recs = [];
for (const [seed, feed] of [[81, 0.004], [82, 0.008], [83, 0.0055]]) {
  recs.push(await record(randomPolygon(rnd(seed), feed)));
}
const fb = fitCornerBanks(pilot, recs, {});
const routerSaved = pilot.router;
console.log(`corner banks: fitted ${fb.fitted}, kept ${fb.kept}, aFull ${fb.aFull.toExponential(2)}`);

// ------------------------------------------------------------------- deploy protocols
async function deploy(shape, { router = false, online = false, cutLap = Infinity } = {}) {
  const path = mkPath(shape, 0.004);
  const { arm: a, servo: s } = await makeArmIK(KK, EE);
  const p0 = M.predict(path.at(0).x, path.at(0).y);
  a.setPose(p0[0], p0[1]);
  for (let i = 0; i < 4000; i++) {
    const t = s.torques([{ theta: p0[0], omega: 0, alpha: 0 }, { theta: p0[1], omega: 0, alpha: 0 }]);
    a.step(t[0], t[1], 1);
  }
  const S = pilot.sample, lap = Math.ceil(path.lap);
  const refs = new Array(lap + 2);
  for (let k = 0; k <= lap + 1; k++) { const c = path.at(k); refs[k] = M.predict(c.x, c.y); }
  const sampRef = (i) => refs[((i * S) % lap + lap) % lap];
  pilot.router = router ? routerSaved : null;
  pilot.online = online ? {} : null;
  pilot._initRun();
  const LAPS = 4;
  const score = new ContourScore({ joints: 2, reversalTravel: 2e-2 });
  let uPk = 0;
  for (let l = 0; l < LAPS; l++) {
    if (l >= cutLap) pilot.online = null;
    for (let k = 0; k < lap; k++) {
      const q = refs[k], qm = refs[(k - 1 + lap) % lap], qp = refs[(k + 1) % lap];
      const kAbs = l * lap + k;
      const u = pilot.act((off) => sampRef(Math.floor(kAbs / S) + off));
      uPk = Math.max(uPk, Math.abs(u[0]), Math.abs(u[1]));
      const tau = s.torques([
        { theta: q[0] + u[0], omega: (qp[0] - qm[0]) / 2, alpha: qp[0] - 2 * q[0] + qm[0] },
        { theta: q[1] + u[1], omega: (qp[1] - qm[1]) / 2, alpha: qp[1] - 2 * q[1] + qm[1] }]);
      a.step(tau[0], tau[1], 1);
      const enc = a.encoders();
      pilot.observe([enc[0].angle, enc[1].angle, enc[0].speed * 1e3, enc[1].speed * 1e3,
        tau[0] * 1e3, tau[1] * 1e3],
      pilot.online ? affine(q, a.toolXY()) : null);
      if (l >= LAPS - 2) {
        const cmd = path.at(k);
        const dec = decompose(path, a.toolXY(), cmd);
        score.step(dec.contour, dec.lag, tau, [a.j1.wM, a.j2.wM]);
      }
    }
  }
  await a.l1.destroy(); await a.l2.destroy();
  const ro = pilot.readouts[0];
  const stats = online ? `  updates ${ro._onlineN || 0} gated ${ro._infoSkipped || 0}/${ro._infoSeen || 0}` : '';
  return { r: score.report(), uPk, stats };
}

for (const shape of ['circle', 'sharp']) {
  console.log(`\n${shape} through the LEARNED inverse (scored laps 3-4 of 4):`);
  let off = null;
  for (const [name, opts] of [
    ['off', null],
    ['static', {}],
    ['router', { router: true }],
    ['router+online', { router: true, online: true }],
    ['router+takeaway', { router: true, online: true, cutLap: 2 }]]) {
    const snap = pilot.readouts.map((ro) => ro.w.map((a) => Float64Array.from(a)));
    let r;
    if (name === 'off') {
      const saved = pilot.verdict;
      pilot.verdict = { deploy: false, why: 'off' };
      r = await deploy(shape, {});
      pilot.verdict = saved;
      off = r;
    } else r = await deploy(shape, opts);
    console.log(`  ${name.padEnd(16)} contour ${r.r.contourRms.toExponential(3)}`
      + `${off && name !== 'off' ? ` (${(off.r.contourRms / r.r.contourRms).toFixed(2)}x)` : ''}`
      + `  lag ${r.r.lagRms.toExponential(2)}  u ${r.uPk.toFixed(3)}${r.stats}`);
    for (let c = 0; c < pilot.readouts.length; c++) {
      const ro = pilot.readouts[c];
      for (let i = 0; i < ro.w.length; i++) ro.w[i].set(snap[c][i]);
      delete ro._rls; ro._row0 = []; ro._infoRef = undefined;
      ro._onlineN = 0; ro._infoSkipped = 0; ro._infoSeen = 0;
    }
    pilot.online = null; pilot.router = null;
  }
}
