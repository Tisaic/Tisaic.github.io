// IS THE EFFORT WEIGHT SELECTED AT THE WRONG AMPLITUDE? — the mechanism the signature points
// at, and the one that would convert a tuned constant into a measured property.
//
// HOW THIS WAS REACHED. Scaling only the shoulder's kernel at uCap 0.6 is worth up to +139%,
// and after three rejected hypotheses the signature said what it DOES rather than what it is:
// oscillation falls 3x on the circle (2.7e-1 -> 9.1e-2), the contour bias crosses zero from
// POSITIVE to negative (+1.5e-1 -> -3.5e-2), and the correction shrinks (u 0.146 -> 0.114). At
// scale 1.00 the pilot OVER-corrects and rings; telling the QP it gets more per unit makes it
// apply less.
//
// AND SCALING `h` UP BY g RAISES THE TRACKING TERM BY g^2 AGAINST THE EFFORT PENALTY, so it IS
// an effort-weight increase — applied lopsidedly to one channel. That reconciles with lambda
// having measured inert: it was only ever swept DOWN (lambda/10, lambda/100, both null). Nobody
// swept it up.
//
// WHY IT WOULD BE A DEFECT RATHER THAN A KNOB. `lambda` is not an arbitrary constant here — the
// verify SELECTS it on the machine from a candidate set, taking the smoothest within rule 42's
// 5% band. But it selects it while running the VERIFY REGIMES, and those run at quarter rates,
// so it is chosen at small correction amplitudes and then deployed on the full program at the
// engineer's cap. Rule 34 for the third time in this arc: a constant chosen in a configuration
// the machine does not run in.
//
// THE TEST. Sweep `lambda` UP at deploy, on the three programs, at the raised cap, from one
// commissioning. If a larger effort weight reproduces the shoulder-scaling benefit, the finding
// is that lambda is selected at the wrong amplitude — measurable on any plant, derivable, and
// shippable. If it does not, the h-scaling is doing something the effort weight cannot, and the
// "lambda in disguise" reading is dead.
import { commissionArm, deployOn, PG } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPES = (process.env.LM_SHAPES || 'sharp,circle,rounded').split(',');
const FEED = +(process.env.LM_FEED || 0.004);
const UCAP = +(process.env.LM_UCAP || 0.6);
const MULTS = (process.env.LM_MULTS || '1,2,4,8,16,32').split(',').map(Number);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const lam0 = pilot.lambda;
console.log(`the verify SELECTED lambda ${lam0.toExponential(4)} on the machine`);
const open = {};
for (const shape of SHAPES) open[shape] = (await deployOn(pilot, shape, false, FEED)).r.totalRms;

console.log('\n  lambda x   ' + SHAPES.map((s) => s.padStart(30)).join(''));
for (const m of MULTS) {
  pilot.lambda = lam0 * m;
  const cols = [];
  for (const shape of SHAPES) {
    const tr = [];
    const r = await deployOn(pilot, shape, true, FEED, { trace: tr });
    let s2 = 0;
    for (const t of tr) s2 += t.u[0] * t.u[0] + t.u[1] * t.u[1];
    const uRms = Math.sqrt(s2 / Math.max(1, tr.length));
    cols.push(`${(open[shape] / r.r.totalRms).toFixed(2).padStart(5)}x b${r.r.contourBias.toExponential(1)}`
      + ` o${r.r.contourOsc.toExponential(1)} u${uRms.toFixed(3)}`);
  }
  console.log(`  ${String(m).padStart(8)}   ${cols.join('  ')}`);
}
pilot.lambda = lam0;
console.log('EXIT 0');
