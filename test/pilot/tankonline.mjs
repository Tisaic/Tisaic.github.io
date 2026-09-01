// GATED ADAPTATION ON THE TANK — the plant the mill-null's selector says it SHOULD pay on:
// the static verify vouches (1.32x deployed), the truth is a level sensor (switch simply ON),
// and the residual is distribution mismatch between a scribble and a recipe. Same protocols
// as EMPS: static / online / take-away (truth for the first 40% of the recipe, then frozen).
import { Pilot } from '../../lib/pilot/pilot.js';
import { UCAP, makeTanks, levelsAt, voltsFor, SEG, RECIPE, refAtStep, PROG,
} from './rigs/tanks-rig.mjs';
const GMP = [0.70, 0.60];
async function commission(g, seed = 1) {
  const p = makeTanks(g);
  const start = voltsFor(g, RECIPE[0][0], RECIPE[0][1]);
  for (let i = 0; i < 30000; i++) p.step(start[0], start[1]);
  const pilot = new Pilot({
    autoRefuse: true, nMeasured: 4,
    channels: [0, 1].map(() => ({ lo: 2.0, hi: 3.6, vMax: 4e-3, aMax: 2e-5, jMax: 2e-7 })),
    uMax: UCAP, start,
    guards: [{ index: 0, max: 19 }, { index: 1, max: 19 }],
    workspace: () => true,
    verifyRef: (i, n) => {
      const h = refAtStep(Math.round(i * PROG / n));
      return voltsFor(g, h[0], h[1]);
    },
    dwell: false, seed,
  });
  while (pilot.phase !== 'done') {
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    p.step(cmd[0].pos + cmd[0].u, cmd[1].pos + cmd[1].u);
    const want = levelsAt(g, cmd[0].pos, cmd[1].pos);
    pilot.observe([p.h[0], p.h[1], p.h[2], p.h[3]],
      [p.h[0] - want[0], p.h[1] - want[1]]);
  }
  return pilot;
}
// THE GATE IS SEED-DEPENDENT ON THIS PLANT (3 of 8 deploy, per tankspread) — walk seeds
// until one deploys, and say which. A refused draw has nothing to adapt: act() is zeros.
let pilot = null;
for (let seed = 1; seed <= 8; seed++) {
  pilot = await commission(GMP, seed);
  const v = pilot.status().report.verify.ratio;
  console.log(`  seed ${seed}: ${pilot.verdict.deploy ? 'DEPLOY' : 'refused'} (verify ${v.toFixed(2)}x)`);
  if (pilot.verdict.deploy) break;
}
if (!pilot.verdict.deploy) { console.log('no seed deployed'); process.exit(0); }
function run(mode) {
  const p = makeTanks(GMP);
  const start = voltsFor(GMP, RECIPE[0][0], RECIPE[0][1]);
  for (let i = 0; i < 30000; i++) p.step(start[0], start[1]);
  const S2 = pilot.sample, cache = new Map();
  const refAt = (i) => {
    const k = Math.min(Math.max(i * S2, 0), PROG);
    let r = cache.get(k);
    if (!r) { const h = refAtStep(k); r = voltsFor(GMP, h[0], h[1]); cache.set(k, r); }
    return r;
  };
  pilot._initRun();
  pilot.online = mode === 'static' ? null : {};
  const cut = mode === 'takeaway' ? Math.floor(0.4 * PROG) : Infinity;
  let s2 = 0, n = 0, uPk = 0, worst = 0;
  for (let k = 0; k < PROG; k++) {
    const href = refAtStep(k);
    const vn = voltsFor(GMP, href[0], href[1]);
    const u = pilot.act((off) => refAt(Math.floor(k / S2) + off));
    uPk = Math.max(uPk, Math.abs(u[0]), Math.abs(u[1]));
    p.step(vn[0] + u[0], vn[1] + u[1]);
    if (k === cut) pilot.online = null;
    const want = levelsAt(GMP, vn[0], vn[1]);
    pilot.observe([p.h[0], p.h[1], p.h[2], p.h[3]],
      pilot.online ? [p.h[0] - want[0], p.h[1] - want[1]] : null);
    if (k > SEG) {
      s2 += (p.h[0] - href[0]) ** 2 + (p.h[1] - href[1]) ** 2; n += 2;
      worst = Math.max(worst, Math.abs(p.h[0] - href[0]), Math.abs(p.h[1] - href[1]));
    }
  }
  const ro = pilot.readouts[0];
  const stats = mode === 'static' ? '' :
    `  updates ${ro._onlineN || 0} gated ${ro._infoSkipped || 0}/${ro._infoSeen || 0}`;
  return { rms: Math.sqrt(s2 / n), worst, uPk, stats };
}
let off = null;
for (const mode of ['off', 'static', 'online', 'takeaway']) {
  const snap = pilot.readouts.map((ro) => ro.w.map((a) => Float64Array.from(a)));
  let r;
  if (mode === 'off') {
    const saved = pilot.verdict;
    pilot.verdict = { deploy: false, why: 'off run' };
    r = run('static');
    pilot.verdict = saved;
    off = r;
  } else r = run(mode);
  console.log(`  ${mode.padEnd(9)} ${r.rms.toFixed(3)} cm rms`
    + `${off && mode !== 'off' ? ` (${(off.rms / r.rms).toFixed(2)}x)` : ''}`
    + `  worst ${r.worst.toFixed(2)}  u ${r.uPk.toFixed(3)} V${r.stats || ''}`);
  for (let c = 0; c < pilot.readouts.length; c++) {
    const ro = pilot.readouts[c];
    for (let i = 0; i < ro.w.length; i++) ro.w[i].set(snap[c][i]);
    delete ro._rls; ro._row0 = []; ro._infoRef = undefined;
    ro._onlineN = 0; ro._infoSkipped = 0; ro._infoSeen = 0;
  }
  pilot.online = null;
}
