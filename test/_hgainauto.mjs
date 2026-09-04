// CAN THE PILOT FIND THE GAIN ITSELF, WITHOUT SEEING THE PROGRAMS IT WILL BE SCORED ON?
//
// `_hgain2.mjs` found a per-channel plant gain worth 3.49x -> 5.19x at depth 1 with every program
// improving. But it CHOSE that pair by scoring sharp, circle and rounded — the programs the number
// is then quoted on. That is selection on the test set, and this project has caught itself doing
// it before: the ideal-correction map is fitted leave-one-program-out for exactly this reason, and
// `select.mjs` exists because a gate that scores the program it is judged on proves nothing.
//
// SO THE QUESTION IS NARROW AND IT DECIDES WHETHER ANY OF THIS SHIPS. Pick the gain on programs
// the block DESIGNS FOR ITSELF — random polygons through the corner rule, the same agnostic shapes
// `demopath.js` builds when the engineer supplies nothing — and then score the pick on the three
// programs, which took no part in choosing it. If the pick lands on the searched optimum, the gain
// is a plant property the pilot can measure at commissioning and it is self-tuning in the sense
// the north star means. If it lands somewhere else, the gain is not findable without the answer
// and it must not ship however large the number is.
//
// COORDINATE DESCENT, NOT A GRID, because commissioning time is the other half of the ask: one
// sweep per channel is 2k scored runs where a grid is k^2, and the surface `_hgain2` measured is
// smooth and unimodal in each channel separately.
//
// AND THE ACCEPTANCE RULE IS THE OWNER'S: a candidate is admissible only if it improves EVERY
// design program. A mean that rises while one program falls is the thing that must not ship, and
// applying that at SELECTION time is what makes it a property of the controller rather than a
// filter applied to the report afterwards.
import { commissionArm, deployOn, mkPath, randomPolygon, PG } from './pilot/rigs/arm-rig.mjs';

const FEED = 0.004, UCAP = 0.6;
const MU = process.env.HA_MU !== undefined ? +process.env.HA_MU : 0.03;
const NFRAC = +(process.env.HA_NFRAC || 0.75);
const LADDER = (process.env.HA_LADDER || '1.0,1.1,1.2,1.3,1.5,1.8').split(',').map(Number);
const TEST = ['sharp', 'circle', 'rounded'];

const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
pilot.uWeight = new Array(pilot.nc).fill(MU);
pilot.N = Math.max(2, Math.round(pilot.N * NFRAC));
const h0 = pilot.hs.map((h) => Float64Array.from(h.hGrid));
const setG = (g) => pilot.hs.forEach((h, ci) => {
  const src = h0[ci];
  for (let i = 0; i < h.hGrid.length; i++) h.hGrid[i] = src[i] * g[ci];
});

// THE DESIGN PROGRAMS: corner shapes with no part knowledge, which is the agnostic bank's own
// licence stated back as code. Seeded so the experiment is reproducible, and DIFFERENT from any
// program below.
let sd = 20250904;
const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
const design = [randomPolygon(rnd, FEED), randomPolygon(rnd, FEED, true)];
console.log(`arm K ${PG.K} / E ${PG.E}, depth 1, Nfrac ${NFRAC}, mu ${MU}`);
console.log(`  held-out forecast quality: ${(pilot.readouts || []).map((ro) => {
  const v = ro && ro.val; return typeof v === 'number' ? v.toFixed(4) : '?';
}).join(' / ')}`);

const scoreOn = async (paths, g) => {
  setG(g);
  const out = [];
  for (const p of paths) {
    const d = await deployOn(pilot, p, true, FEED);
    out.push(d.r.totalRms);
  }
  return out;
};
const openOn = async (paths) => {
  setG([1, 1]);
  const out = [];
  for (const p of paths) out.push((await deployOn(pilot, p, false, FEED)).r.totalRms);
  return out;
};

const dOpen = await openOn(design);
const dBase = await scoreOn(design, [1, 1]);
console.log(`  design programs at the identified plant: `
  + dBase.map((v, i) => `${(dOpen[i] / v).toFixed(2)}x`).join('  '));

// COORDINATE DESCENT ON THE DESIGN PROGRAMS ONLY.
const pick = [1, 1];
for (let c = 0; c < pilot.nc; c++) {
  let best = null;
  console.log(`\n  channel ${c} ladder, scored on the DESIGN programs only:`);
  for (const g of LADDER) {
    const trial = pick.slice(); trial[c] = g;
    const r = await scoreOn(design, trial);
    // ADMISSIBLE ONLY IF EVERY DESIGN PROGRAM IMPROVES on the identified plant.
    const up = r.every((v, i) => v <= dBase[i] * 1.001);
    const mean = Math.exp(r.reduce((a, v, i) => a + Math.log(dOpen[i] / v), 0) / r.length);
    console.log(`    g${c} ${g.toFixed(2)}  ${r.map((v, i) => `${(dOpen[i] / v).toFixed(2)}x`).join('  ')}`
      + `   mean ${mean.toFixed(3)}x   ${up ? 'admissible' : 'REJECTED — a design program fell'}`);
    if (up && (!best || mean > best.mean)) best = { g, mean };
  }
  pick[c] = best ? best.g : 1;
  console.log(`    -> channel ${c} takes ${pick[c].toFixed(2)}`);
}
console.log(`\n  THE PILOT'S OWN PICK: (${pick.map((g) => g.toFixed(2)).join(', ')})`);

// NOW THE TEST PROGRAMS, WHICH TOOK NO PART IN ANY OF THE ABOVE.
const tOpen = await openOn(TEST);
const tBase = await scoreOn(TEST, [1, 1]);
const tPick = await scoreOn(TEST, pick);
setG([1, 1]);
const gmOf = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);
const bx = tBase.map((v, i) => tOpen[i] / v), px = tPick.map((v, i) => tOpen[i] / v);
console.log('\n  HELD OUT — the three programs, which chose nothing:');
console.log('    program      identified      the pick     up?');
TEST.forEach((s, i) => console.log(`    ${s.padEnd(10)}${bx[i].toFixed(2).padStart(11)}x`
  + `${px[i].toFixed(2).padStart(13)}x   ${px[i] >= bx[i] * 0.999 ? 'yes' : 'NO'}`));
console.log(`    geo mean  ${gmOf(bx).toFixed(3).padStart(12)}x${gmOf(px).toFixed(3).padStart(13)}x`
  + `   ${px.every((v, i) => v >= bx[i] * 0.999) ? 'ALL UP' : 'A PROGRAM FELL'}`);
console.log(`\n  the searched-on-the-test-set optimum was (1.20, 1.50) at 5.192x, so this pick`
  + ` recovers ${(gmOf(px) / 5.192 * 100).toFixed(0)}% of a number chosen with the answer in hand`);
console.log('EXIT 0');
