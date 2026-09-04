// TWO REGULARISERS ON ONE INVERSION — do truncation and a magnitude penalty compose, or are
// they the same protection twice?
//
// WHY THEY MIGHT BE THE SAME THING. `test/_hspec.mjs` measured the model the QP inverts against
// the machine, harmonic by harmonic: true below h4 (ratio 0.93-1.05, phase under 20 degrees)
// and ANTI-PHASE past h8 (-149.8 and -120.0). And the model's own magnitude collapses across
// that same range — the shoulder's |H| falls from 9.54e-1 at h1 to 2.37e-2 at h7, a factor of
// 40. So the band where the model is wrong IS the band where its gain is small, which is the
// classic ill-posed-inverse condition.
//
// BOTH KNOBS PROTECT AGAINST EXACTLY THAT, BY DIFFERENT ROUTES. `qpIters` truncates: a gradient
// method converges the LOW frequencies first, so a short solve never reaches the components it
// would get wrong — an accidental low-pass, and the reason 1 iteration beats 240 on all three
// programs. `mu` is frequency-flat Tikhonov: minimising ||f0 + Hu||^2 + mu||u||^2 gives
// u = -H'(HH' + mu)^-1 f0, which de-weights the inversion wherever |H| is small, automatically
// and without knowing which frequencies those are.
//
// SO THE QUESTION IS WHETHER THEY ADD. If `mu` at 4 iterations reaches what 1 iteration
// reaches, truncation is redundant and the principled knob replaces the accidental one. If they
// compose, they are protecting against different parts of the same defect. And if `mu` needs
// truncation to work at all, the flat penalty is not enough and the FREQUENCY-SHAPED version —
// weighting by the measured trust profile rather than uniformly — is what the table is asking
// for.
//
// THE h5+ SHARE IS CARRIED IN EVERY CELL, because the whole argument is about which band the
// correction ends up in, and reading only the score is what hid this for four rounds.
import { commissionArm, deployOn, mkPath, PG } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPES = (process.env.R2_SHAPES || 'sharp,circle,rounded').split(',');
const FEED = +(process.env.R2_FEED || 0.004);
const UCAP = +(process.env.R2_UCAP || 0.6);
const ITERS = (process.env.R2_ITERS || '1,4,16').split(',').map(Number);
const MUS = (process.env.R2_MUS || '0,0.03,0.1,0.3').split(',').map(Number);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const it0 = pilot.qpIters;
console.log(`ships qpIters ${it0}, uWeight null`);
const open = {};
for (const shape of SHAPES) open[shape] = (await deployOn(pilot, shape, false, FEED)).r.totalRms;

console.log('\n  iters   mu     ' + SHAPES.map((s) => s.padStart(26)).join(''));
for (const it of ITERS) {
  for (const m of MUS) {
    pilot.qpIters = it;
    pilot.uWeight = m > 0 ? [m, m] : null;
    const cols = [];
    for (const shape of SHAPES) {
      const tr = [];
      const r = await deployOn(pilot, shape, true, FEED, { trace: tr });
      const lap = Math.round(mkPath(shape, FEED).lap / pilot.sample);
      const seg = tr.slice(Math.max(0, tr.length - lap)).map((t) => t.u[0]);
      let lo = 0, hi = 0;
      for (let h = 1; h <= 16; h++) {
        let re = 0, im = 0;
        for (let i = 0; i < seg.length; i++) {
          const t = (2 * Math.PI * h * i) / seg.length;
          re += seg[i] * Math.cos(t); im -= seg[i] * Math.sin(t);
        }
        const e = re * re + im * im;
        if (h <= 4) lo += e; else hi += e;
      }
      cols.push(`${(open[shape] / r.r.totalRms).toFixed(2).padStart(5)}x o${r.r.contourOsc.toExponential(1)}`
        + ` h5+${(hi / Math.max(1e-30, lo + hi)).toFixed(3)}`);
    }
    console.log(`  ${String(it).padStart(5)} ${m.toFixed(2).padStart(6)}   ${cols.join('  ')}`);
  }
}
pilot.qpIters = it0; pilot.uWeight = null;
console.log('EXIT 0');
