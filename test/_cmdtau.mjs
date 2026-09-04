// THE MAP'S WINNING FEATURE, PUT INSIDE THE CONTROLLER — no ILC, no table, no laps.
//
// WHAT `_idealmap.mjs` ESTABLISHED. theta*(t), the correction an ILC converges to, is 4.781x
// predictable from the COMMANDED trajectory alone, leave-one-program-out, and 2.28x of an ideal
// 2.6x on a diamond that took part in no fit and no selection. The whole of that came from ONE
// feature: the rigid gearbox torque M(q2)*qddot + C(q, qdot) - G(q), computed from the command.
// Every generic route to the same nonlinearity was a null or worse — the validated dictionary
// twice, pose scheduling negative, jerk a factor of 1.8 of damage.
//
// BUT THAT MAP IS FITTED TO ILC TABLES, and an ILC table costs twenty laps per program on the
// machine. The pilot is fitted to a SCRIBBLE in one commissioning and knows no program. If the
// torque is what the correction needs, the pilot's own forecast should want it too — and then
// the same physics is bought for nothing, with no lap ever run.
//
// WHY THE PILOT CANNOT ALREADY HAVE IT. Its command block is LINEAR in the commanded trajectory:
// position, velocity, acceleration, a fine block of differences. The inertia MULTIPLIES the
// acceleration and the Coriolis term is QUADRATIC in velocity, so no linear function of
// (q, qdot, qddot) spans the torque. The `poly` block forms products of the NEWEST lag only —
// the right family at exactly one offset, which is why it measured null.
//
// THE HYPOTHESIS, AND IT IS FALSIFIABLE. Adding the rigid command torque at offsets around the
// lead lifts the pilot on every program, because it is a plant term the basis could not
// represent rather than more capacity. WHAT WOULD KILL IT: the SHUFFLED control scoring the
// same. That row supplies the identical columns computed at a random phase of the same program —
// same count, same scale, same conditioning, no physics — so if it matches, the block is buying
// variance and this is the dictionary's failure in a new costume.
//
// THREE CONTROLS, and the first two are not optional:
//   zeros     the hook wired and returning zeros. MUST be byte-identical to `off` or the
//             plumbing itself moved the machine and no row below means anything (rule 21).
//   shuffled  the capacity control above.
//   off       the shipped basis.
import { commissionArm, deployOn, makeArm, PG } from './pilot/rigs/arm-rig.mjs';
import { Stack } from '../lib/pilot/stack.js';

const FEED = +(process.env.CT_FEED || 0.004);
const UCAP = +(process.env.CT_UCAP || 0.6);
const MU = process.env.CT_MU !== undefined ? +process.env.CT_MU : 0.03;
const DEPTH = +(process.env.CT_DEPTH || 1);
const SHAPES = (process.env.CT_SHAPES || 'sharp,circle,rounded').split(',');
const ONLY = (process.env.CT_ROWS || '').split(',').filter(Boolean);

// ONE SERVO, USED ONLY FOR ITS RIGID MODEL. `jointTorques` is the same call the machine's own
// feedforward makes, so the controller and the servo cannot disagree about the plant (rule 61);
// it touches no state and needs no arm, which is what makes this a function of the COMMAND.
const { arm: refArm, servo: refServo } = await makeArm();

// TAP SETS IN PILOT SAMPLES. The map needed reach — its window stops mattering around +140
// samples, which is where the correction applied now lands — so reach is swept rather than
// assumed, and rule 42 takes the cheapest inside 5% of the best rather than the largest.
const TAPS = {
  now: [0],
  few: [-24, 0, 24, 48, 96, 140],
  lead: [-64, -24, -12, -6, -2, 0, 2, 6, 12, 24, 48, 80, 112, 140, 168, 200, 256],
};

// THE RAW TORQUE, UNSCALED, because the library now derives the block's scale from the
// commissioning record itself. THE FIRST VERSION OF THIS FILE DID NOT AND IT COST A TABLE:
// `jointTorques` has rms 1.5e-2 here against an applied torque of 2.3e-4, so the x1e3 that
// matches the row's torque channels put this column at rms 15 in a row whose largest column is
// 2.06. `solveRidge` takes its penalty from the LARGEST diagonal of X'X and applies it to every
// column, so TWO columns re-penalised all 176 and the machine went 3.35x -> 2.74x — with the
// SHUFFLED control losing exactly as much, which is what said it was the instrument and not the
// physics (rules 15, 17, 32).
const TS = 1;
const hook = (taps, mode, rnd) => ({
  taps, n: 2,
  f: (p0, p1, p2, off, sample) => {
    if (mode === 'zeros') return [0, 0];
    let a0 = p0, a1 = p1, a2 = p2;
    if (mode === 'shuffled') {
      // THE SAME COLUMNS AT A RANDOM PHASE: the map is destroyed, the distribution is not.
      const j = rnd();
      a0 = [p0[0] + j, p0[1] - j]; a1 = [p1[0] + j, p1[1] - j]; a2 = [p2[0] + j, p2[1] - j];
    }
    const inv = 1 / sample, inv2 = inv * inv;
    const t = refServo.jointTorques([
      { theta: a0[0], omega: (a0[0] - a1[0]) * inv, alpha: (a0[0] - 2 * a1[0] + a2[0]) * inv2 },
      { theta: a0[1], omega: (a0[1] - a1[1]) * inv, alpha: (a0[1] - 2 * a1[1] + a2[1]) * inv2 },
    ]);
    return [t[0] * TS, t[1] * TS];
  },
});

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff - 0.5) * 2; };

const ROWS = [
  { name: 'off (shipped)   ', cf: null },
  { name: 'zeros [control] ', cf: () => hook(TAPS.few, 'zeros') },
  { name: 'shuffled [ctrl] ', cf: () => hook(TAPS.few, 'shuffled', rnd) },
  { name: 'tau @ now       ', cf: () => hook(TAPS.now, 'tau') },
  { name: 'tau @ few       ', cf: () => hook(TAPS.few, 'tau') },
  { name: 'tau @ lead      ', cf: () => hook(TAPS.lead, 'tau') },
];

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}, mu ${MU}, depth ${DEPTH}`);
const gm = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);
let open = null;

console.log('\n  configuration      cols' + SHAPES.map((s) => s.padStart(17)).join('')
  + '     geo mean       MAC/cycle');
for (const r of ROWS) {
  if (ONLY.length && !ONLY.some((o) => r.name.trim().startsWith(o))) continue;
  const cf = r.cf ? r.cf() : null;
  const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
    uCap: UCAP, Cls: DEPTH > 1 ? Stack : undefined, extra: DEPTH > 1 ? { depth: DEPTH } : null,
    before: (p) => {
      const set = (q) => { q.cmdFeat = cf; };
      set(p);
      if (p.opts) p.opts.cmdFeat = cf;      // a Stack builds its layers lazily
      (p.layers || []).forEach(set);
    } });
  if (!pilot) { console.log(`  ${r.name}: commissioning never terminated`); continue; }
  const layers = pilot.layers || [pilot];
  for (const p of layers) p.uWeight = MU > 0 ? new Array(p.nc).fill(MU) : null;
  if (!open) {
    open = {};
    for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
    console.log('  open loop:  ' + SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  '));
  }
  const xs = [], cols = [];
  for (const s of SHAPES) {
    const d = await deployOn(pilot, s, true, FEED);
    const x = open[s] / d.r.totalRms;
    xs.push(x); cols.push(`${x.toFixed(2)}x u${d.uPk.toFixed(3)}`.padStart(17));
  }
  // THE COLUMN COUNT AND THE ARITHMETIC, because a block that helps and cannot fit a scan is a
  // different product (north star 6). `cost()` reads the fitted row length, so the block is
  // counted rather than assumed.
  const ro = layers[0].readouts && layers[0].readouts[0];
  const nf = ro && ro.w && ro.w[0] ? ro.w[0].length : 0;
  let mac = 0;
  for (const p of layers) { const c = p.cost && p.cost(); if (c) mac += c.peakMacPerCycle || 0; }
  console.log(`  ${r.name}${String(nf).padStart(5)}${cols.join('')}`
    + `${gm(xs).toFixed(3).padStart(12)}x${String(Math.round(mac)).padStart(16)}`);
}
await refArm.l1.destroy(); await refArm.l2.destroy();
console.log('EXIT 0');
