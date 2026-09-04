// THE CASCADE AND GATED ADAPTATION, WHICH HAVE NEVER BEEN RUN TOGETHER — and which attack the
// binding problem from opposite sides.
//
// WHAT THE WHOLE ARC ESTABLISHED. The actuator is provably not the ceiling: the harmonic
// feedforward reaches 242x on EMPS and 1.27e-2 on this arm's rectangle through exactly the same
// channel, the same `u`, the same cap. Authority is inert (uPk 0.600 -> 1.000, score identical to
// three figures). The solver is exhausted. Lead-0 forecast accuracy is null. What remains is
// predicting a NEVER-RUN program's error — and every failure in this section reduces to one
// statement: **the commissioning record and the programs are different distributions.** Five
// excitation designs failed for it; the validated dictionary found real physics (nonlinear
// compliance in lagged torque products, validation +23%) that the programs do not exercise.
//
// TWO THINGS ATTACK IT, AND THEY ARE NOT THE SAME THING.
//   DEPTH models what the layer below LEFT. It is the only lever measured that helps every
//   program at once — 3.03 -> 6.04 geometric mean with nothing worse — because a global knob has
//   one setting for two regimes that want opposite ones, and a second layer does not.
//   GATED ADAPTATION updates the model on the program actually being run, which is the mismatch
//   itself rather than a compensation for it. Its recorded results are the shape that predicts:
//   arm +29%, tank +18%, EMPS 14.8x -> 55.5x with the truth REMOVED at lap 4, and the
//   adapted-then-frozen bank scoring a never-run two-tone sine 6x better than static.
//
// SO THE QUESTION IS WHETHER THEY COMPOSE, AND THIS SECTION HAS MEASURED THREE NON-COMPOSITIONS
// TODAY — every trust knob against every other, and all of them against the cascade. "Each helps
// alone" has been worth nothing three times, so it is worth nothing here until measured.
//
// TRUTH AT DEPLOY IS AN INSTALLATION PROPERTY, NOT AN ASSUMPTION (the pilot reports
// `onlineAtDeploy` for exactly this reason): a tracker that stays, a sensor the truth is computed
// from, or nothing. This bench arms it, which is the permanent-truth installation.
//
// WHAT WOULD KILL IT: adaptation adds nothing on top of the cascade. Then depth has already
// removed what adaptation was correcting, they are one repair twice, and the distribution
// mismatch needs something neither of them is.
import { commissionArm, deployOn, PG } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';
import { Stack } from '/home/user/Tisaic.github.io/lib/pilot/stack.js';

const FEED = +(process.env.CD_FEED || 0.004);
const UCAP = +(process.env.CD_UCAP || 0.6);
const SHAPES = (process.env.CD_SHAPES || 'sharp,circle,rounded').split(',');
const MU = +(process.env.CD_MU || 0.03);
const gm = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}, mu ${MU}`);
let open = null;
for (const depth of [1, 2]) {
  for (const adapt of [false, true]) {
    const extra = depth > 1 ? { depth } : null;
    const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
      uCap: UCAP, Cls: depth > 1 ? Stack : undefined, extra });
    if (!pilot) { console.log(`  depth ${depth} adapt ${adapt}: never terminated`); continue; }
    if (!open) {
      open = {};
      for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
      console.log(`open loop: ${SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  ')}`);
      console.log('\n  depth  adapt' + SHAPES.map((s) => s.padStart(17)).join('') + '     geo mean   rows admitted');
    }
    const layers = pilot.layers || [pilot];
    for (const p of layers) {
      p.uWeight = MU > 0 ? new Array(p.nc).fill(MU) : null;
      // ARMED AT DEPLOY ONLY, so the commissioned model is identical in both rows and the ONLY
      // difference is whether it keeps updating on the program it is running.
      p.online = adapt ? { lambda: 0.9995, minInfo: 0.25 } : null;
    }
    const xs = [], cols = [];
    for (const s of SHAPES) {
      for (const p of layers) { p._onlineN = 0; p._infoSkipped = 0; p._infoSeen = 0; }
      const d = await deployOn(pilot, s, true, FEED);
      const x = open[s] / d.r.totalRms;
      xs.push(x); cols.push(`${x.toFixed(2)}x u${d.uPk.toFixed(3)}`.padStart(17));
    }
    const seen = layers.map((p) => (p.readouts || []).map((r) => r._onlineN || 0).join('+')).join(' | ');
    console.log(`  ${String(depth).padStart(5)}  ${String(adapt).padEnd(5)}${cols.join('')}`
      + `   ${gm(xs).toFixed(2).padStart(10)}   ${seen}`);
  }
}
console.log('EXIT 0');
