// THE MODEL IS 13 SAMPLES LATE, AND THAT IS ONE NUMBER RATHER THAN A BAND OF ERROR.
//
// WHAT `_hspec` MEASURED. The commissioned kernel's phase error against the moving machine is a
// STRAIGHT LINE in harmonic number — 5.1, 10.1, 14.8, 19.2, 23.7, 29.5 degrees at h1-h6 on the
// shoulder, about 4.9 per harmonic. Phase error linear in frequency IS a pure time delay: at an
// 8206-step lap, 4.9 degrees per harmonic is 112 solver steps. Advancing the kernel by 117 steps
// removes it — the residual reads -0.4, -0.8, -1.1, -1.2, -0.7, +2.1 — and the low-band relative
// model error falls 0.203 -> 0.068. The elbow, advanced by only 27, keeps a residual ramp whose
// slope asks for another ~77, so BOTH channels want about the same 104-117 steps.
//
// WHICH IS NOT A PLANT PROPERTY, BECAUSE THE TWO CHANNELS SHARE IT. What they do share is the
// commissioning CONFIGURATION: `h` is identified from a probe taken while the machine is HELD,
// and inverted while it is MOVING. From rest the step must first cross stiction and the gearbox's
// lost motion before the tip sees anything; in motion the joint is already sliding and already
// loaded on one side, so the same `du` transmits at once. That is rule 34 with a number on it.
//
// WHY IT MATTERS MORE THAN ITS SIZE SUGGESTS. A fixed delay is 4.9 degrees at h1 and 90 by h18,
// so the correction the QP plans in the HIGH band arrives anti-phase — it ADDS where it means to
// subtract. Every measurement that reads the high band as harmful (`qpIters` monotone the wrong
// way, `mu` paying) is consistent with a band that is misregistered rather than unusable. If the
// owner's mechanism is right — motor motion at frequencies the tip barely follows is how the
// structure is pre-loaded — then the band has to be RE-REGISTERED before it can be used, and
// suppressing it is treating the symptom.
//
// THE MEASUREMENT. Advance `h.resp` by L steps per channel, rebuild through the pilot's OWN
// `_buildH` so the triangle registration is the shipped one (rule 61), deploy, score. L = 0 is
// the control and must reproduce the shipped row exactly.
//
// MEASURED, AND IT KILLED THE HYPOTHESIS: L = 0 is the best row and the score falls MONOTONICALLY
// as the kernel is advanced — 3.49x / 2.76x / 2.87x at L=0, 3.24 / 2.46 / 2.50 at 52, 2.71 / 2.17
// / 2.11 at 104, 2.20 / 1.92 / 1.68 at 156. The phase error is real and removing it makes the
// machine worse, so the receding horizon does not care about it — the same shape `leadTrust`
// found for the far leads, and for the same reason: only the FIRST move is ever applied.
//
// WHAT WOULD KILL IT: the score is flat in L, or best at L = 0. Then the phase table is
// describing something the receding horizon does not care about — which is what `leadTrust`
// found for the far leads — and the delay is real but inert.
import { mkPath, commissionArm, deployOn, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.HL_FEED || 0.004);
const UCAP = +(process.env.HL_UCAP || 0.6);
const DEPTH = +(process.env.HL_DEPTH || 1);
const SHIFTS = (process.env.HL_SHIFTS || '0,52,104,156,208').split(',').map(Number);
const SHAPES = (process.env.HL_SHAPES || 'sharp,circle,rounded').split(',');

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}, depth ${DEPTH}`);
let mk = { seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP };
if (DEPTH > 1) {
  const { Stack } = await import('/home/user/Tisaic.github.io/lib/pilot/stack.js');
  mk = { ...mk, Cls: Stack, extra: { depth: DEPTH } };
}
const pilot = await commissionArm(mk);
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }

// A Stack presents a Pilot's surface; the kernels live one level down, on each layer.
const layers = pilot.layers ? pilot.layers.slice() : [pilot];
const S = layers[0].sample;
console.log(`sample ${S}, lap ${Math.round(mkPath('sharp', FEED).lap)}; `
  + `resp ${layers[0].hs[0].resp.length} steps; ${layers.length} layer(s)`);

const saved = layers.map((p) => p.hs.map((h) => Array.from(h.resp)));
const setShift = (L) => {
  layers.forEach((p, li) => {
    p.hs.forEach((h, ch) => {
      const raw = saved[li][ch];
      const r = new Array(raw.length);
      // A NEGATIVE L DELAYS the kernel, and its first samples must be held at the response's
      // own start rather than read off the end of the array: `raw[-1]` is undefined and would
      // render as NaN through the whole QP, which passes every bounds check (rule 55).
      for (let i = 0; i < raw.length; i++) {
        r[i] = raw[Math.max(0, Math.min(raw.length - 1, i + L))];
      }
      h.resp = r;
    });
    p._buildH();
  });
};

const open = {};
for (const shape of SHAPES) open[shape] = (await deployOn(pilot, shape, false, FEED)).r.totalRms;
console.log(`  open loop: ${SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  ')}`);

console.log(`\n  kernel advance L (a POSITIVE L reads the kernel further in, i.e. the model fires sooner)`);
console.log('       L   samples' + SHAPES.map((s) => s.padStart(17)).join(''));
for (const L of SHIFTS) {
  setShift(L);
  const cols = [];
  for (const shape of SHAPES) {
    const r = await deployOn(pilot, shape, true, FEED);
    cols.push(`${(open[shape] / r.r.totalRms).toFixed(2)}x u${r.uPk.toFixed(3)}`.padStart(17));
  }
  console.log(`  ${String(L).padStart(6)}  ${(L / S).toFixed(1).padStart(8)}${cols.join('')}`);
}
setShift(0);
console.log('EXIT 0');
