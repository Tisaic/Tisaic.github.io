// LAW POINT 6: Wood-Berry, where all twelve seeds refuse and every past deployment made the
// machine worse. Force-deployed with gated adaptation; predicted null-or-harm.
import { Pilot } from '../../lib/pilot/pilot.js';
import { DT, T_END, UBOX, UMAX, iaeOf, inputsFor, makeColumn, outputsFor, runBLT, runOpen,
  setpointAt } from './rigs/woodberry-rig.mjs';
const c0 = makeColumn();
for (let i = 0; i < 3000; i++) c0.step([0, 0]);
const pilot = new Pilot({
  autoRefuse: false, nMeasured: 2,
  channels: [0, 1].map(() => ({ lo: UBOX.lo, hi: UBOX.hi, vMax: 6e-3, aMax: 6e-5, jMax: 6e-7 })),
  uMax: UMAX, start: [0, 0],
  guards: [{ index: 0, max: 25 }, { index: 1, max: 25 }],
  workspace: () => true, dwell: true,
  verifyRef: (i, n) => inputsFor(...setpointAt(Math.round(i * (T_END / DT) / n))),
  seed: 1,
});
while (pilot.phase !== 'done') {
  if (pilot.phase === 'fit') { pilot.work(); continue; }
  const cmd = pilot.command();
  c0.step(cmd.map((q) => q.pos + q.u));
  const want = outputsFor(cmd.map((q) => q.pos));
  pilot.observe(c0.y.slice(), [c0.y[0] - want[0], c0.y[1] - want[1]]);
}
const v = pilot.status().report.verify;
console.log(`column commissioned: verify ${v ? v.ratio.toFixed(2) + 'x' : '—'}`
  + `  wouldRefuse: ${pilot.status().report.wouldRefuse ? 'yes' : 'no'}`);
function run(mode) {
  const c = makeColumn();
  for (let i = 0; i < 3000; i++) c.step([0, 0]);
  const S2 = pilot.sample, cache = new Map();
  const refAt = (i) => {
    const k = Math.min(Math.max(i * S2, 0), T_END);
    let r = cache.get(k);
    if (!r) { const sp = setpointAt(k); r = inputsFor(sp[0], sp[1]); cache.set(k, r); }
    return r;
  };
  pilot._initRun();
  pilot.online = mode === 'static' || mode === 'off' ? null : {};
  let iae = 0;
  for (let k = 0; k < T_END; k++) {
    const sp = setpointAt(k);
    const un = inputsFor(sp[0], sp[1]);
    const u = mode === 'off' ? [0, 0] : pilot.act((off) => refAt(Math.floor(k / S2) + off));
    c.step([un[0] + u[0], un[1] + u[1]]);
    const want = outputsFor(un);
    pilot.observe(c.y.slice(), pilot.online ? [c.y[0] - want[0], c.y[1] - want[1]] : null);
    iae += (Math.abs(sp[0] - c.y[0]) + Math.abs(sp[1] - c.y[1])) * DT;
  }
  const ro = pilot.readouts[0];
  const stats = pilot.online ? `  updates ${ro._onlineN || 0} gated ${ro._infoSkipped || 0}/${ro._infoSeen || 0}` : '';
  return { iae, stats };
}
console.log(`  published BLT IAE ${runBLT().iae ? runBLT().iae.toFixed(2) : runBLT().toFixed ? runBLT().toFixed(2) : JSON.stringify(runBLT())}`);
let off = null;
for (const mode of ['off', 'static', 'online']) {
  const snap = pilot.readouts.map((ro) => ro.w.map((a) => Float64Array.from(a)));
  const r = run(mode);
  if (mode === 'off') off = r;
  console.log(`  ${mode.padEnd(7)} IAE ${r.iae.toFixed(2)}`
    + `${mode !== 'off' ? ` (${(off.iae / r.iae).toFixed(2)}x)` : ''}${r.stats || ''}`);
  for (let c = 0; c < pilot.readouts.length; c++) {
    const ro = pilot.readouts[c];
    for (let i = 0; i < ro.w.length; i++) ro.w[i].set(snap[c][i]);
    delete ro._rls; ro._row0 = []; ro._infoRef = undefined;
    ro._onlineN = 0; ro._infoSkipped = 0; ro._infoSeen = 0;
  }
  pilot.online = null;
}
