// ADAPT WITH A TRUTH SOURCE, THEN TAKE IT AWAY. Three protocols, one commissioning, the
// sharp square at 0.004, scored on laps 6-8 in every case so the windows match (rule 20):
//   static     — online never armed (the no-tracker installation)
//   adapted    — truth present all eight laps (the permanent-tracker installation)
//   take-away  — truth present for laps 1-4 only (tracker mounted for commissioning, removed)
import { commissionArm, deployOn, recordOpenLoop, randomPolygon,
  fitCornerBanks } from './rigs/arm-rig.mjs';
const pilot = await commissionArm({ seed: 1 });
if (!pilot || !pilot.verdict.deploy) { console.log('commissioning failed'); process.exit(1); }
const opts = { laps: 8, scoreFromLap: 5 };
// GUIDE-THEN-TRANSFER: the memory test applied to adaptation (the retirement's rule). A bank
// adapted during a guided phase on ONE program, frozen, then scored on ANOTHER: transfer says
// the adaptation learned the machine, its absence says it learned the program — which is
// still a legitimate installation (guide on the representative program, run that program),
// but must wear the label.
// THE FULL COMPOSITION: the polygon corner banks (fitted from truth-bearing records — which
// is exactly what the guided phase provides) plus guided adaptation, everything frozen before
// the truth source leaves. The router is armed only for the protocols that name it, and the
// banks are fitted once — they are frozen by construction.
const polyRnd = (s0) => { let z = s0 >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const polyRecs = [];
for (const [seed, feed] of [[81, 0.004], [82, 0.008], [83, 0.0055]]) {
  polyRecs.push(await recordOpenLoop(pilot, randomPolygon(polyRnd(seed), feed), feed));
}
fitCornerBanks(pilot, polyRecs, {});
const routerSaved = pilot.router;
for (const [name, online, cut, guide, router] of [['static', false, Infinity, null, false],
  ['adapted', true, Infinity, null, false], ['take-away', true, 4, null, false],
  ['guide=diamond', true, 4, 'diamond', false], ['guide=rounded', true, 4, 'rounded', false],
  ['router', false, Infinity, null, true],
  ['router+guide=diamond', true, 4, 'diamond', true],
  ['router+adapted', true, Infinity, null, true]]) {
  const snap = pilot.readouts.map((ro) => ro.w.map((a) => Float64Array.from(a)));
  pilot.router = router ? routerSaved : null;
  pilot.online = online ? {} : null;
  if (guide) {
    await deployOn(pilot, guide, true, 0.004, { laps: 4, scoreFromLap: 3, truthUntilLap: cut });
    pilot.online = null;      // frozen: the guided phase is over and the tracker is unbolted
  }
  const r = await deployOn(pilot, 'sharp', true, 0.004,
    { ...opts, truthUntilLap: guide ? 0 : cut });
  const off = await deployOn(pilot, 'sharp', false, 0.004, opts);
  const st = pilot.status().onlineAtDeploy;
  console.log(`  ${name.padEnd(10)} contour ${r.r.contourRms.toExponential(3)}`
    + ` (${(off.r.contourRms / r.r.contourRms).toFixed(2)}x)  lag ${r.r.lagRms.toExponential(2)}`
    + `  u ${r.uPk.toFixed(3)}${st.armed ? `  updates ${st.updates} gated ${st.gated}` : ''}`);
  for (let c = 0; c < pilot.readouts.length; c++) {
    const ro = pilot.readouts[c];
    for (let i = 0; i < ro.w.length; i++) ro.w[i].set(snap[c][i]);
    delete ro._rls; ro._row0 = []; ro._infoRef = undefined;
    ro._onlineN = 0; ro._infoSkipped = 0; ro._infoSeen = 0;
  }
  pilot.online = null;
}
pilot.router = null;
