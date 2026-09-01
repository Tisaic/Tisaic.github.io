// LAW POINT 5: the extruder barrel, refused at 0.86x — force-deployed with gated adaptation.
// Predicted: null or small (the law says adaptation multiplies vouched models only).
import { Pilot } from '../../lib/pilot/pilot.js';
import { NZ, PBOX, RECIPE, PROG, SEG, makeBarrel, powerFor, tempsAt, setpointAt,
} from './rigs/thermal-rig.mjs';
const UCAP = 12;
const p0 = makeBarrel(7);
const start = powerFor(RECIPE[0]);
for (let i = 0; i < 20000; i++) p0.step(start);
const pilot = new Pilot({
  autoRefuse: false, nMeasured: NZ,
  channels: [0, 1, 2].map(() => ({ lo: PBOX.lo, hi: PBOX.hi, vMax: 3e-2, aMax: 2e-4, jMax: 2e-6 })),
  uMax: UCAP, start, guards: [0, 1, 2].map((i) => ({ index: i, max: 265 })),
  workspace: () => true, dwell: true, seed: 1,
});
while (pilot.phase !== 'done') {
  if (pilot.phase === 'fit') { pilot.work(); continue; }
  const cmd = pilot.command();
  p0.step(cmd.map((c) => c.pos + c.u));
  const y = p0.read();
  const want = tempsAt(cmd.map((c) => c.pos));
  pilot.observe(y, y.map((v, i) => v - want[i]));
}
const v = pilot.status().report.verify;
console.log(`barrel commissioned: verify ${v ? v.ratio.toFixed(2) + 'x' : '—'}`
  + `  wouldRefuse: ${pilot.status().report.wouldRefuse ? 'yes' : 'no'}`);
function run(mode) {
  const p = makeBarrel(11);
  for (let i = 0; i < 20000; i++) p.step(start);
  const S2 = pilot.sample, cache = new Map();
  const refAt = (i) => {
    const k = Math.min(Math.max(i * S2, 0), PROG);
    let r = cache.get(k);
    if (!r) { r = powerFor(setpointAt(k)); cache.set(k, r); }
    return r;
  };
  pilot._initRun();
  pilot.online = mode === 'static' || mode === 'off' ? null : {};
  let s2 = 0, n = 0;
  for (let k = 0; k < PROG; k++) {
    const set = setpointAt(k);
    const pn = powerFor(set);
    const u = mode === 'off' ? [0, 0, 0] : pilot.act((off) => refAt(Math.floor(k / S2) + off));
    p.step(pn.map((vv, i) => vv + u[i]));
    const want = tempsAt(pn);
    const y = p.read();
    pilot.observe(y, pilot.online ? y.map((vv, i) => vv - want[i]) : null);
    if (k > SEG) { for (let z = 0; z < NZ; z++) s2 += (p.T[z] - set[z]) ** 2; n += NZ; }
  }
  const ro = pilot.readouts[0];
  const stats = pilot.online ? `  updates ${ro._onlineN || 0} gated ${ro._infoSkipped || 0}/${ro._infoSeen || 0}` : '';
  return { rms: Math.sqrt(s2 / n), stats };
}
let off = null;
for (const mode of ['off', 'static', 'online']) {
  const snap = pilot.readouts.map((ro) => ro.w.map((a) => Float64Array.from(a)));
  const r = run(mode);
  if (mode === 'off') off = r;
  console.log(`  ${mode.padEnd(7)} ${r.rms.toFixed(3)} K rms`
    + `${mode !== 'off' ? ` (${(off.rms / r.rms).toFixed(2)}x)` : ''}${r.stats || ''}`);
  for (let c = 0; c < pilot.readouts.length; c++) {
    const ro = pilot.readouts[c];
    for (let i = 0; i < ro.w.length; i++) ro.w[i].set(snap[c][i]);
    delete ro._rls; ro._row0 = []; ro._infoRef = undefined;
    ro._onlineN = 0; ro._infoSkipped = 0; ro._infoSeen = 0;
  }
  pilot.online = null;
}
