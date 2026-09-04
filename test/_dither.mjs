// AN LTI QP CANNOT DISCOVER THE OWNER'S MECHANISM, AND THAT MAY BE THE WHOLE GAP.
//
// THE OWNER'S CLAIM: "the motors have to preemptively create high frequency oscillation in the
// arm to get the tip to move in a way that the soft arm does not want to move it and then dampen
// the energy after that point with anti frequency motion", and the high band matters because it
// is "how the controller can manipulate the flexible links preemptively without the tip moving
// preemptively".
//
// TAKE THAT LITERALLY AND IT IS NOT A LINEAR STATEMENT. In an LTI plant a sinusoid in at omega
// is a sinusoid out at omega: energy cannot be put in at high frequency and collected at low
// frequency. "Invisible at the tip AND changes what the tip does" is a contradiction for a
// linear model — and the pilot's `h` is exactly a linear model, so a QP that inverts it will
// NEVER choose fast motion in a band where |h| is small. It costs effort and buys nothing there
// BY CONSTRUCTION, whatever the kernel's length or registration.
//
// THE MECHANISM THAT MAKES THE CLAIM TRUE IS NONLINEAR, AND THIS PLANT HAS IT. Dither keeps a
// joint sliding so stiction never re-forms and keeps it loaded on one side of its lost motion so
// backlash is not re-crossed. That is a real, classical effect, it is invisible at the tip
// wherever |H| is small, and it changes the plant's LOW-frequency behaviour — which is precisely
// "manipulate the links without the tip moving". Mode ⑩ simulates the nonlinear twin, backlash
// and friction included, and its correction is 32% high-band; the pilot inverts a linear kernel
// and its correction is 0.2% high-band. That difference is not a tuning gap.
//
// THE MEASUREMENT. Add a pure dither to the applied correction — a signal the QP did not choose
// and its model says is pure cost — and score. Sweep amplitude and period. Run it on the OPEN
// loop as well as on the deployed pilot, because that is the half that says WHICH mechanism:
//   - helps open AND closed  -> a plant property (friction/backlash linearisation), and the
//     pilot is missing a term its objective can never select;
//   - helps closed only      -> it is interacting with the correction, not with the plant;
//   - helps neither          -> the mechanism is not dither, and the high-band content in ⑩ is
//     doing something else.
//
// WHAT WOULD KILL IT: every cell at or below the A=0 control. Then fast motion really is pure
// cost on this machine and the LTI objective is right to refuse it.
import { commissionArm, deployOn, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.DT_FEED || 0.004);
const UCAP = +(process.env.DT_UCAP || 0.6);
const AMPS = (process.env.DT_AMPS || '0,0.01,0.03,0.1').split(',').map(Number);
const PERS = (process.env.DT_PERS || '8,16,32,64').split(',').map(Number);
const SHAPES = (process.env.DT_SHAPES || 'sharp,circle').split(',');

// THE DITHER IS THE SAME ON BOTH CHANNELS AND IN QUADRATURE BETWEEN THEM, so it is not a pose
// offset dressed as a dither: over one period each channel's mean is exactly zero and the pair
// traces a circle rather than a line, which is what keeps BOTH joints sliding rather than one.
const mkDither = (A, P) => {
  const a = new Float64Array(P), b = new Float64Array(P);
  for (let i = 0; i < P; i++) {
    a[i] = A * Math.sin((2 * Math.PI * i) / P);
    b[i] = A * Math.cos((2 * Math.PI * i) / P);
  }
  return [a, b];
};

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
console.log(`sample ${pilot.sample} solver steps; a period of P steps is harmonic ~${Math.round(8206 / 32)} of the lap at P=32`);

for (const active of [false, true]) {
  console.log(`\n=== ${active ? 'DEPLOYED PILOT' : 'OPEN LOOP'} — total rms, and x against this block's own A=0 ===`);
  for (const shape of SHAPES) {
    const base = (await deployOn(pilot, shape, active, FEED)).r.totalRms;
    console.log(`  ${shape}: A=0 ${base.toExponential(4)}`);
    console.log('       A' + PERS.map((p) => `P=${p}`.padStart(16)).join(''));
    for (const A of AMPS) {
      if (A === 0) continue;
      const cols = [];
      for (const P of PERS) {
        const r = await deployOn(pilot, shape, active, FEED, { pre: mkDither(A, P) });
        cols.push(`${r.r.totalRms.toExponential(3)} ${(base / r.r.totalRms).toFixed(2)}x`.padStart(16));
      }
      console.log(`  ${A.toFixed(3).padStart(6)}${cols.join('')}`);
    }
  }
}
console.log('EXIT 0');
