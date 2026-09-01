// TRANSFER: gated online adaptation on EMPS — the plant whose truth is an ordinary sensor,
// whose ILC-vs-model gap (125x vs 12.7x) is distribution-match territory, and whose record
// says UNGATED online hurt it (14.68x -> 9.96x). Same pilot setup as emps.test.mjs.
import { Pilot } from '../../lib/pilot/pilot.js';
import { program, makeMachine, DT } from './emps-rig.mjs';
const PR = program();
const P = PR.q.length;
const pilot = new Pilot({
  autoRefuse: true, nMeasured: 1,
  channels: [{ lo: -0.02, hi: 0.27, vMax: 1.25e-4, aMax: 8.3e-7, jMax: 5e-8 }],
  uMax: 2e-3, start: [PR.q[0]], guards: [{ index: 0, max: 0.4 }],
  workspace: () => true, seed: 1, exciteSteps: 40000,
});
{
  const m = makeMachine(PR.q[0], 0);
  let prevRef = PR.q[0];
  while (pilot.phase !== 'done') {
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    m.step(prevRef);
    prevRef = cmd[0].pos + cmd[0].u;
    pilot.observe([m.q], [m.q - cmd[0].pos]);
  }
}
console.log(`commissioned: ${pilot.verdict.deploy ? 'deploy' : 'REFUSED'}`);
function runPilot(mode) {
  // mode: 'static' | 'online' | 'takeaway' (truth for laps 1-4 of 10, frozen after)
  const m = makeMachine(PR.q[0], 0), S = pilot.sample;
  pilot._initRun();
  pilot.online = mode === 'static' ? null : {};
  let s = 0, mx = 0, n = 0, uPk = 0, pref = PR.q[0];
  const LAPS = 10;
  for (let k = 0; k < LAPS * P; k++) {
    m.step(pref);
    const u = pilot.act((off) => [PR.q[(((Math.floor(k / S) + off) * S) % P + P) % P]]);
    uPk = Math.max(uPk, Math.abs(u[0]));
    pref = PR.q[k % P] + u[0];
    const truthOk = mode === 'online' || (mode === 'takeaway' && k < 4 * P);
    if (mode === 'takeaway' && k === 4 * P) pilot.online = null;   // tracker unbolted
    pilot.observe([m.q], truthOk ? [m.q - PR.q[k % P]] : null);
    if (k >= (LAPS - 4) * P) { const e = m.q - PR.q[k % P]; s += e * e; mx = Math.max(mx, Math.abs(e)); n++; }
  }
  const ro = pilot.readouts[0];
  const stats = `updates ${ro._onlineN || 0} gated ${ro._infoSkipped || 0}/${ro._infoSeen || 0}`;
  return { rms: 1000 * Math.sqrt(s / n), uPk: 1000 * uPk, stats };
}
// THE MEMORY TEST: the two-tone sine from stack.test.mjs — inside the envelope, never run.
const SIN = new Float64Array(P);
{
  const A1 = 0.012, w1 = 2 * Math.PI * 6 / (P * DT), A2 = 0.002, w2 = 2 * Math.PI * 13 / (P * DT);
  for (let k = 0; k < P; k++) SIN[k] = 0.13 + A1 * Math.sin(w1 * k * DT) + A2 * Math.sin(w2 * k * DT);
}
function runSine() {
  const m = makeMachine(SIN[0], 0), S2 = pilot.sample;
  pilot._initRun();
  pilot.online = null;                       // frozen: whatever the weights are now
  let s = 0, n = 0, pref = SIN[0];
  const LAPS = 10;
  for (let k = 0; k < LAPS * P; k++) {
    m.step(pref);
    const u = pilot.act((off) => [SIN[(((Math.floor(k / S2) + off) * S2) % P + P) % P]]);
    pref = SIN[k % P] + u[0];
    pilot.observe([m.q], null);
    if (k >= (LAPS - 4) * P) { const e = m.q - SIN[k % P]; s += e * e; n++; }
  }
  return 1000 * Math.sqrt(s / n);
}
const SHIPPED = 0.5814;
for (const mode of ['static', 'online', 'takeaway']) {
  const snap = pilot.readouts.map((ro) => ro.w.map((a) => Float64Array.from(a)));
  const r = runPilot(mode);
  // The sine is scored with the weights EXACTLY as the protocol leaves them (adapted modes
  // score it frozen post-adaptation; static scores the commissioned bank).
  const sine = runSine();
  console.log(`  ${mode.padEnd(9)} ${r.rms.toFixed(4)} mm rms  (${(SHIPPED / r.rms).toFixed(1)}x)`
    + `  sine ${sine.toFixed(4)} mm  u ${r.uPk.toFixed(3)}  ${mode === 'static' ? '' : r.stats}`);
  for (let c = 0; c < pilot.readouts.length; c++) {
    const ro = pilot.readouts[c];
    for (let i = 0; i < ro.w.length; i++) ro.w[i].set(snap[c][i]);
    delete ro._rls; ro._row0 = []; ro._infoRef = undefined;
    ro._onlineN = 0; ro._infoSkipped = 0; ro._infoSeen = 0;
  }
  pilot.online = null;
}
