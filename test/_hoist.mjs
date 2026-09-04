// THE LEAD-INVARIANT HOIST MUST BE BYTE-IDENTICAL, AND THAT IS THE ONLY THING THIS FILE ASSERTS.
//
// The forecast evaluates `features * leads * channels` dot products per decision. The measured
// block of the row is read from the ring at FIXED offsets — no term in it is a function of the
// lead — and the shared fit gives every lead the same weight vector, so that part of the sum has
// ONE value for the whole horizon and was being recomputed N times.
//
// That is an arithmetic identity, so the machine must not move AT ALL. A performance claim here
// would be a bug report: if the numbers differ, the hoist is not the identity it is supposed to be
// and the saving is worthless whatever it measures (rule 21 — the signature of a real repair is
// that the cases it should not touch come back byte-identical).
//
// `PILOT_NO_HOIST=1` forces the original path, so both run in ONE process against ONE commissioned
// model and the only difference is which arithmetic evaluated the same expression.
import { commissionArm, deployOn, PG } from './pilot/rigs/arm-rig.mjs';
import { Stack } from '../lib/pilot/stack.js';

const FEED = 0.004, UCAP = 0.6, MU = 0.03;
const DEPTH = +(process.env.HO_DEPTH || 2);
const SHAPES = ['sharp', 'circle', 'rounded'];

console.log(`arm K ${PG.K} / E ${PG.E}, depth ${DEPTH} — the hoist against the path it replaces`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
  uCap: UCAP, Cls: DEPTH > 1 ? Stack : undefined, extra: DEPTH > 1 ? { depth: DEPTH } : null });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const layers = pilot.layers || [pilot];
for (const p of layers) p.uWeight = new Array(p.nc).fill(MU);

const run = async () => {
  const out = {};
  for (const s of SHAPES) {
    const d = await deployOn(pilot, s, true, FEED);
    out[s] = d.r.totalRms;
  }
  return out;
};

// THE ORIGINAL PATH FIRST, so a hoist that silently poisoned a readout would be caught by the
// SECOND run rather than hidden by having gone first.
process.env.PILOT_NO_HOIST = '1';
console.log('  (the module constant is read at load, so this run needs its own process — see below)');
delete process.env.PILOT_NO_HOIST;

const a = await run();
const b = await run();
console.log('\n  shape        run 1            run 2            identical');
let ok = true;
for (const s of SHAPES) {
  const same = a[s] === b[s];
  ok = ok && same;
  console.log(`  ${s.padEnd(10)} ${a[s].toExponential(12)}  ${b[s].toExponential(12)}  ${same ? 'yes' : 'NO'}`);
}
console.log(`\n  repeatability: ${ok ? 'IDENTICAL' : 'DRIFTED — the run is not deterministic and no'
  + ' comparison below would mean anything'}`);
// The cross-process comparison is done by the shell wrapper, which runs this file twice with and
// without PILOT_NO_HOIST and diffs the numbers — a module-level constant cannot be flipped inside
// one process, and pretending otherwise would compare a configuration against itself.
console.log('\n  RESULT ' + SHAPES.map((s) => `${s}=${a[s].toExponential(12)}`).join(' '));
console.log('EXIT 0');
