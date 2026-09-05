// DOES THE ENSEMBLE STILL CONVERT THE TANK'S REFUSAL? — target 7, on the one plant whose refusal
// is a 2% miss rather than a structural inability.
//
// THE TANK REFUSES BY 2%. Its verify reads 1.08x against a 1.1x deploy bar, and across eight
// commissioning seeds it refuses five and delivers 1.045x, 1.392x and 1.590x on the other three.
// So the plant is controllable and five draws in eight produce a model too weak to vouch for:
// COMMISSIONING VARIANCE, not an inability. That is the one refusal on the board with a repair
// already written and already measured.
//
// AND THE MEASUREMENT IS STALE, WHICH IS WHY THIS RUNS RATHER THAN QUOTES. `ensemble.js` records
// "all eight draws REFUSED, best single draw 1.000x, the average of five vouched for itself and
// delivered 1.344x" — but that was taken before `verifyRef` gave this plant a representative
// regime, and the gate it reports against is not the gate it has now. Today three draws deploy
// where all eight used to refuse, so the number the ensemble has to beat has moved. Quoting a
// figure whose gate no longer exists is how the 3.27x ceiling got carried through five tables
// here (rule 30).
//
// WHAT WOULD KILL IT: the average refusing too, or deploying and delivering below the draws that
// already deploy. The claim is not "averaging is better on average" — it is that the average
// VOUCHES FOR ITSELF where the individual draws could not, which is a statement about the gate and
// only the machine can settle it.
//
// EVERY DRAW IS REPORTED BESIDE THE AVERAGE, because an average that merely lands between its
// inputs is a different and much weaker result than one that beats all of them, and a table
// showing only the mean cannot tell those apart.
import { ensemble, freezeConfig } from '../lib/pilot/ensemble.js';
import { Pilot } from '../lib/pilot/pilot.js';
import { UCAP, makeTanks, levelsAt, voltsFor, SEG, RECIPE, refAtStep, PROG }
  from './pilot/rigs/tanks-rig.mjs';

const K = +(process.env.TE_K || 5);
// THE MINIMUM-PHASE VALVE SPLIT, which is `tanks.test.mjs`'s own GMP. The first version of this
// file passed the rig's exported `G` — which is GRAVITY, 981 cm/s^2 — as the valve split, and the
// plant duly went non-finite in the OPEN LOOP, before the pilot was involved at all. An open-loop
// NaN cannot be a controller fault, which is what made it obvious (rule 17).
const g = [0.70, 0.60];

async function commission(seed, freeze = null) {
  const p = makeTanks(g);
  const start = voltsFor(g, RECIPE[0][0], RECIPE[0][1]);
  for (let i = 0; i < 30000; i++) p.step(start[0], start[1]);
  const pilot = new Pilot({
    autoRefuse: true, nMeasured: 4,
    channels: [0, 1].map(() => ({ lo: 2.0, hi: 3.6, vMax: 4e-3, aMax: 2e-5, jMax: 2e-7 })),
    uMax: UCAP, start,
    guards: [{ index: 0, max: 19 }, { index: 1, max: 19 }],
    workspace: () => true,
    verifyRef: (i, n) => { const h = refAtStep(Math.round(i * PROG / n)); return voltsFor(g, h[0], h[1]); },
    dwell: true, seed,
  });
  // THE CONFIGURATION IS FROZEN ONTO EVERY DRAW AFTER THE FIRST, which is what makes them
  // averageable BY CONSTRUCTION rather than by luck: draws that choose different windows or bases
  // have different row layouts and cannot be averaged at all. Without it only 5 of 8 tank draws
  // shared a layout and the rest were excluded.
  if (freeze) freezeConfig(freeze, pilot);
  while (pilot.phase !== 'done') {
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    p.step(cmd[0].pos + cmd[0].u, cmd[1].pos + cmd[1].u);
    const want = levelsAt(g, cmd[0].pos, cmd[1].pos);
    pilot.observe([p.h[0], p.h[1], p.h[2], p.h[3]], [p.h[0] - want[0], p.h[1] - want[1]]);
  }
  return pilot;
}

function runRecipe(pilot, active) {
  const p = makeTanks(g);
  const start = voltsFor(g, RECIPE[0][0], RECIPE[0][1]);
  for (let i = 0; i < 30000; i++) p.step(start[0], start[1]);
  const S = pilot.sample, cache = new Map();
  const refAt = (i) => {
    const k = Math.min(Math.max(i * S, 0), PROG);
    let r = cache.get(k);
    if (!r) { const h = refAtStep(k); r = voltsFor(g, h[0], h[1]); cache.set(k, r); }
    return r;
  };
  if (active) pilot._initRun();
  let s2 = 0, n = 0, uPk = 0;
  for (let k = 0; k < PROG; k++) {
    const href = refAtStep(k);
    const vn = voltsFor(g, href[0], href[1]);
    const u = active ? pilot.act((off) => refAt(Math.floor(k / S) + off)) : [0, 0];
    uPk = Math.max(uPk, Math.abs(u[0]), Math.abs(u[1]));
    p.step(vn[0] + u[0], vn[1] + u[1]);
    pilot.observe([p.h[0], p.h[1], p.h[2], p.h[3]], null);
    if (k > SEG) { s2 += (p.h[0] - href[0]) ** 2 + (p.h[1] - href[1]) ** 2; n += 2; }
  }
  return { rms: Math.sqrt(s2 / n), uPk };
}

console.log(`quadruple tank — ${K} commissioning draws against their ensemble`);
const draws = [];
let first = null;
for (let k = 0; k < K; k++) {
  const pk = await commission(100 + k, first);
  if (!first) first = pk;
  draws.push(pk);
}
const off = runRecipe(draws[0], false);
console.log(`  recipe open loop: ${off.rms.toFixed(4)} cm rms\n`);
console.log('  draw   verify    verdict     delivered');
for (let k = 0; k < draws.length; k++) {
  const d = draws[k], st = d.status();
  const v = st.report.verify ? st.report.verify.ratio : null;
  const dep = d.verdict && d.verdict.deploy;
  const on = runRecipe(d, true);
  console.log(`  ${String(100 + k).padEnd(6)} ${(v === null ? '—' : v.toFixed(2) + 'x').padStart(7)}`
    + `   ${(dep ? 'DEPLOY' : 'refused').padEnd(9)}   ${(off.rms / on.rms).toFixed(3)}x`);
}
const r = ensemble(draws);
// THE RETURN SHAPE IS THE MODULE'S, read rather than guessed: { pilot, used, of, shapes, why }.
console.log(`\n  ensemble of ${K}: averaged ${r.used} of ${r.of} draws across ${r.shapes} layout(s)`
  + (r.why ? ` — ${r.why}` : ''));
if (r.pilot) {
  const st = r.pilot.status();
  const v = st.report && st.report.verify ? st.report.verify.ratio : null;
  const dep = r.pilot.verdict && r.pilot.verdict.deploy;
  const on = runRecipe(r.pilot, true);
  console.log(`  average       ${(v === null ? '—' : v.toFixed(2) + 'x').padStart(7)}`
    + `   ${(dep ? 'DEPLOY' : 'refused').padEnd(9)}   ${(off.rms / on.rms).toFixed(3)}x`);
}
console.log('EXIT 0');
