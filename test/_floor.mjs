// WHAT IS THE BEST ANY CONTROLLER COULD DO THROUGH THIS ACTUATOR? — the bound the whole arc has
// been missing, and the reason so many things measured null.
//
// THE PATTERN THAT DEMANDS IT. Solver knobs null. Authority null and monotonically harmful.
// Capacity on the same data null. And — the strange one — FORECAST QUALITY AT LEAD 0 null: log
// spacing lifted the sharp square's elbow from held-out R^2 0.4664 to 0.5545 at the one lead a
// receding horizon applies, and delivered 3.49x -> 3.51x. Better prediction not converting into
// better control is not what a model-limited system looks like.
//
// AND THE CHANNEL WAS MEASURED THIS SESSION WITHOUT THE CONCLUSION BEING DRAWN. `|H|` at the lap's
// harmonics runs 0.884, 0.796, 0.664, 0.510, 0.355, 0.218, 0.111, 0.039, 0.0085 across h1-h9: past
// the eighth harmonic the correction moves the tip by under one per cent of its DC gain. If a
// meaningful share of the remaining error lives up there, NO controller through this channel can
// remove it, and every model improvement will keep measuring null exactly as they have.
//
// THE MEASUREMENT, AND IT IS AN ORACLE RATHER THAN A CONTROLLER. Take a lap of OPEN-LOOP error,
// and solve for the best correction over the WHOLE lap at once: non-causal, full preview, the
// identified model, box-constrained. No controller of this family can beat that plan, because it
// is given everything a controller cannot have — the entire future, and no re-solving.
//
// IT PRODUCES TWO NUMBERS THAT HAVE NEVER BEEN SEPARATED:
//   PREDICTED  the residual the plan expects. This is the FLOOR imposed by the actuator's
//              bandwidth and the box. Nothing beats it.
//   DELIVERED  the same plan applied to the real machine and measured. The gap between them is
//              MODEL ERROR and nothing else — no solver, no horizon, no causality, no trust knob.
//
// HOW TO READ IT. A floor near 40x says the actuator is fine and every remaining pound is in the
// model, with the delivered-vs-predicted gap saying exactly how much. A floor near 6x says this
// actuation path is at its physical limit and the honest answer is a different injection point,
// not a better fit — and it would retire, in one table, every model experiment this file
// contains.
//
// A number computed from the model cannot check the model (rule 16), which is why the plan is
// APPLIED rather than only costed.
import { boxQPm } from '/home/user/Tisaic.github.io/lib/blackbox/qp.js';
import { PG, mkPath, commissionArm, deployOn, recordOpenLoop }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.FL_FEED || 0.004);
const UCAP = +(process.env.FL_UCAP || 0.6);
const SHAPES = (process.env.FL_SHAPES || 'sharp,circle,rounded').split(',');
const ITERS = +(process.env.FL_ITERS || 4000);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
  uCap: UCAP, before: (p) => { p.mimo = true; } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const S = pilot.sample, G = pilot.grid;
const H = pilot._mimoH;
console.log(`sample ${S}, grid ${G} samples = ${S * G} solver steps per decision; `
  + `${H ? '2x2 cross model armed' : 'diagonal only'}`);

console.log('\n  program      open       PREDICTED (the floor)        DELIVERED (floor + model error)');
for (const shape of SHAPES) {
  const path = mkPath(shape, FEED);
  const lapSteps = Math.round(path.lap), lapSamp = Math.round(lapSteps / S);
  const rec = await recordOpenLoop(pilot, shape, FEED);
  // ONE LAP FROM PAST THE APPROACH TRANSIENT, because a record taken across a transient describes
  // the transient (rule 13). The machine repeats lap to lap to 0.03% here, so one lap tiled is
  // the same object the compiled twin's own tail refinement works on.
  const from = lapSamp, nDec = Math.floor(lapSamp / G);
  const f0 = [], u = [];
  for (let c = 0; c < pilot.nc; c++) {
    const v = new Float64Array(nDec);
    for (let i = 0; i < nDec; i++) v[i] = rec.e[Math.min(from + i * G, rec.e.length - 1)][c];
    f0.push(v); u.push(new Float64Array(nDec));
  }
  const Hm = H || pilot.hs.map((h, j) => pilot.hs.map((_, c) => (j === c ? pilot.hs[c].hGrid : null)));
  // the grids are N long and the horizon here is a whole lap, so they are padded flat at their DC
  const pad = Hm.map((row, j) => row.map((g, c) => {
    if (!g) return null;
    if (g.length >= nDec) return g;
    const out = new Float64Array(nDec);
    out.set(g); out.fill(g[g.length - 1], g.length);
    return out;
  }));
  boxQPm(pad, f0, u, { U: UCAP, lambda: 0, uPrev: new Array(pilot.nc).fill(0), iters: ITERS, mu: 0 });
  // the residual the plan expects, on the same samples the score is taken on
  let pre2 = 0, open2 = 0;
  for (let c = 0; c < pilot.nc; c++) {
    for (let i = 0; i < nDec; i++) {
      let r = f0[c][i];
      for (let cc = 0; cc < pilot.nc; cc++) {
        const g = pad[c][cc]; if (!g) continue;
        for (let m = 1; m <= i; m++) r += g[m] * u[cc][i - m];
      }
      pre2 += r * r; open2 += f0[c][i] * f0[c][i];
    }
  }
  // APPLY IT. The plan is one lap of decisions, interpolated to solver steps exactly as the
  // runtime interpolates, and tiled — so what reaches the machine is the shape `act()` would send.
  const pre = [new Float64Array(lapSteps), new Float64Array(lapSteps)];
  for (let c = 0; c < pilot.nc; c++) {
    for (let k = 0; k < lapSteps; k++) {
      const d = k / (S * G), i0 = Math.floor(d), fr = d - i0;
      const a = u[c][Math.min(i0, nDec - 1)], b = u[c][Math.min(i0 + 1, nDec - 1)];
      pre[c][k] = a + fr * (b - a);
    }
  }
  const off = (await deployOn(pilot, shape, false, FEED)).r.totalRms;
  const on = await deployOn(pilot, shape, false, FEED, { pre });
  console.log(`  ${shape.padEnd(9)}  ${off.toExponential(3)}`
    + `   ${Math.sqrt(pre2 / open2).toExponential(3)} rel -> ${(Math.sqrt(open2 / pre2)).toFixed(1).padStart(6)}x`
    + `        ${on.r.totalRms.toExponential(3)} -> ${(off / on.r.totalRms).toFixed(2).padStart(6)}x`
    + `   uPk ${on.uPk.toFixed(3)}`);
}
console.log('EXIT 0');
