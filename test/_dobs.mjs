// ITERATION WITHOUT A MEMORY, ATTEMPT ONE: A DISTURBANCE ESTIMATE.
//
// `test/_oraclecascade.mjs` established that the pilot's whole gap to mode 10 is ITERATION —
// apply, measure what is left, invert again — and that four passes of it reach 23.96x contour
// against 10's 44x. But the prefix that carries it is indexed by position in a lap, which the
// retirement forbids. So the question is what iterates WITHOUT remembering a lap.
//
// THE CHEAPEST CANDIDATE IS THE OLDEST ONE IN THE MPC LITERATURE. The QP's free response is
// (forecast of eFree) + (model of what past corrections did). Both halves are model output.
// The machine, meanwhile, is reporting the error it ACTUALLY has, and the difference between
// those two is exactly the model error that `test/_hcheck.mjs` measured at R^2 0.94 / 0.77.
// Fold that difference back into the horizon and the loop corrects its own model every
// sample, causally, from state — which is what iterating does, without a lap index anywhere.
//
// IT COSTS NOTHING AND IT NEEDS A TRUTH AT DEPLOY. One subtraction and one filter per channel
// per decision. The truth is an INSTALLATION property on this arm — a permanent tool tracker,
// the same class of assumption as `onlineAtDeploy` — and free on plants whose error is an
// ordinary sensor reading (EMPS, the tank). Any number here is labelled as such.
//
// WHAT WOULD KILL IT. The model error being corrected has to be SLOWER than the loop can
// respond, or a one-sample-stale estimate is chasing its own tail. The pose-dependent gain
// error varies over a lap and the decision period is 72 solver steps, so the timescales are
// plausible — but plausible is not measured, and the gain ladder is what says which.
import { commissionArm, deployOn, recordOpenLoop, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPES = (process.env.DO_SHAPES || 'sharp,circle,rounded').split(',');
const FEED = +(process.env.DO_FEED || 0.004);
const GAINS = (process.env.DO_GAINS || '0.1,0.3,0.6,1').split(',').map(Number);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
console.log(`sample ${pilot.sample}, grid ${pilot.grid}, N ${pilot.N}, uMax ${pilot.uMax}`);

for (const shape of SHAPES) {
  console.log(`\n=== ${shape} ===`);
  const off = (await deployOn(pilot, shape, false, FEED)).r.totalRms;
  const base = await deployOn(pilot, shape, true, FEED);
  const rows = [['open loop', off, 0], ['shipped', base.r.totalRms, base.uPk]];
  for (const g of GAINS) {
    // the trace is the machine's own report, one sample stale — the callback runs inside the
    // tick that precedes the observe, so the newest truth available is the previous sample's
    const trace = [];
    const d = [0, 0], pred = [null, null];
    const obs = (c, leadSamp, fitted, conv) => {
      if (leadSamp === 0) {
        // WHAT THE MODEL SAID THE ERROR WOULD BE NOW, against what the machine reported. The
        // previous tick's lead-0 prediction is the one that was about this sample (rule 29:
        // a prediction is read where it is ABOUT, never where it was issued).
        if (pred[c] !== null && trace.length) {
          const meas = trace[trace.length - 1].e[c];
          d[c] += g * ((meas - pred[c]) - d[c]);
        }
        pred[c] = fitted + conv + d[c];
      }
      return fitted + d[c];
    };
    const r = await deployOn(pilot, shape, true, FEED, { oracle: obs, trace });
    rows.push([`+ disturbance estimate, gain ${g}`, r.r.totalRms, r.uPk]);
  }
  // the upper reference: a perfect forecast, which no disturbance estimate can beat
  const rec = await recordOpenLoop(pilot, shape, FEED);
  const orr = await deployOn(pilot, shape, true, FEED,
    { oracle: { e: rec.e, lap: rec.lap, off: rec.lap } });
  rows.push(['(oracle forecast, the bound)', orr.r.totalRms, orr.uPk]);
  console.log('  rung                             totalRms    x over open     uPk');
  for (const [n, v, u] of rows) {
    console.log(`  ${n.padEnd(32)} ${v.toExponential(4)} `
      + `${(off / v).toFixed(2).padStart(8)}x ${u.toFixed(4).padStart(9)}`);
  }
}
console.log('EXIT 0');
