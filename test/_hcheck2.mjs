// IS THE IDENTIFIED PLANT ACTUALLY WRONG BY THE GAIN? — measuring the cause instead of trimming
// the symptom.
//
// The per-channel gain is worth 1.45x on a single layer and its shipping form is a scalar the
// pilot finds by searching the machine. That works, and it is a SYMPTOM-LEVEL fix: rule 43 says a
// better optimiser on a wrong model buys nothing, and the converse is that if the model is wrong
// by a scale, finding out WHY should beat scaling it — and would transfer to the other five
// plants, where a scalar found on this arm cannot.
//
// THE CLAIM TO TEST. `hGrid` is what the QP convolves: its prediction of what a move does. If the
// gain of 1.20 on the shoulder is correcting a real identification error, then the machine's
// ACTUAL response to the applied correction is about 1.2x what `hGrid` predicts, and the elbow's
// 1.00 says its `hGrid` is right. If instead the machine responds exactly as `hGrid` says, the
// gain is not a plant-model repair at all — it is trading tracking against effort, the same job
// `mu` and `lambda` do, and it should be understood and reported as that.
//
// HOW, WITHOUT A SECOND MODEL OF THE PLANT. Deploy twice on the same program: once with the
// correction ON and once OFF, recording both traces. `e_off - e_on` is what the correction
// actually did to the machine, measured. `hGrid * u` is what the model said it would do, computed
// from the same applied `u`. The ratio of those two, per channel, IS the gain the plant is asking
// for — derived from the machine's own response rather than searched.
//
// TWO WAYS THIS CAN MISLEAD AND BOTH ARE GUARDED. The open-loop run must be the SAME program at
// the same phase, or the difference is program variation rather than the correction's effect —
// `deployOn` re-homes and re-runs deterministically, and the repeatability floor measured earlier
// (0.08%) bounds what is left. And the regression is done on the SETTLED laps only, because a
// ratio taken across the start-up transient describes the transient (rule 13).
import { commissionArm, deployOn, PG } from './pilot/rigs/arm-rig.mjs';

const FEED = 0.004, UCAP = 0.6, MU = 0.03;
const NFRAC = +(process.env.HC_NFRAC || 0.55);
const SHAPES = (process.env.HC_SHAPES || 'sharp,circle,rounded').split(',');

const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
pilot.uWeight = new Array(pilot.nc).fill(MU);
pilot.N = Math.max(2, Math.round(pilot.N * NFRAC));
pilot.qpBlocks = 6;
console.log(`arm K ${PG.K} / E ${PG.E}, depth 1, Nfrac ${NFRAC}, blocks 6, mu ${MU}`);
console.log('  what the machine did to what the model said it would do, per channel:\n');
console.log('  program     ch   predicted rms   measured rms    ratio   <- the gain the plant asks for');

const tot = [[], []];
for (const s of SHAPES) {
  const trOff = [], trOn = [];
  await deployOn(pilot, s, false, FEED, { trace: trOff });
  await deployOn(pilot, s, true, FEED, { trace: trOn });
  const n = Math.min(trOff.length, trOn.length);
  // SETTLED LAPS ONLY — the last two thirds, so the start-up transient is not in the ratio.
  const from = Math.floor(n / 3);
  for (let c = 0; c < pilot.nc; c++) {
    const h = pilot.hs[c].hGrid;
    let sp = 0, sm = 0, sx = 0, k = 0;
    for (let i = from; i < n; i++) {
      // what the model says the applied history did at this sample: h convolved with u
      let pred = 0;
      for (let m = 0; m < h.length && i - m >= from; m++) pred += h[m] * trOn[i - m].u[c];
      const meas = trOn[i].e[c] - trOff[i].e[c];
      sp += pred * pred; sm += meas * meas; sx += pred * meas; k++;
    }
    if (!k || sp <= 0) continue;
    // THE RATIO IS A REGRESSION, not a ratio of rms values: rms/rms is blind to SIGN and to phase,
    // so a correction that did the opposite of what was predicted would read as a perfect match.
    // The least-squares slope of measured on predicted answers "by what factor is the model out",
    // and a negative slope would say the model has the sign wrong, which no rms could show.
    const slope = sx / sp;
    tot[c].push(slope);
    console.log(`  ${s.padEnd(10)} ${c}   ${Math.sqrt(sp / k).toExponential(3)}`
      + `   ${Math.sqrt(sm / k).toExponential(3)}   ${slope.toFixed(4).padStart(8)}`);
  }
}
console.log('');
for (let c = 0; c < pilot.nc; c++) {
  if (!tot[c].length) continue;
  const m = tot[c].reduce((a, b) => a + b, 0) / tot[c].length;
  console.log(`  channel ${c}: mean slope ${m.toFixed(4)}  ->  the plant responds `
    + `${m > 1 ? `${m.toFixed(2)}x MORE` : `${(1 / m).toFixed(2)}x LESS`} than hGrid predicts`);
}
console.log('\n  the searched gain was (1.20, 1.00). If these slopes are near 1/1.20 and 1/1.00 the');
console.log('  gain is a real identification error and the fix belongs in the probe, not the QP.');
console.log('  If they are near 1.00 the model is right and the gain is an effort trade wearing a');
console.log('  plant-model costume, which is a different thing and must be reported as one.');
console.log('EXIT 0');
