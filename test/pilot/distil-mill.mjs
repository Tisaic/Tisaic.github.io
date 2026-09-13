/**
 * @file THE COLUMN THIS PROJECT SCORES WORST ON: DISTURBANCE REJECTION (plan §71).
 *
 * Rated against the field the deployed object scores 2/10 here, its worst aspect by far, and
 * §69 called that structural: it is a map of a window of the COMMANDED REFERENCE, and the cold
 * mill holds one setpoint for ever, so there is no input variation for it to key on. That
 * reasoning is right about the setpoint and wrong about the REFERENCE, and this file is the
 * difference.
 *
 * WHAT A MILL ACTUALLY KNOWS AHEAD. Its dominant error is not the setpoint moving — the setpoint
 * never moves — it is ROLL ECCENTRICITY: `A_ECC·sin(2π·F_ECC·k·DT)`, 30 µm entering the gap
 * through `MM/(MM+QM)` = 2/3, which is ~14 µm rms of a 15.15 µm open loop. It is periodic at the
 * BACKUP ROLL'S ROTATION, and every mill measures roll angle with an encoder: no delay, no
 * tracking error, no metrology the shop does not own. So it is known ahead exactly as the
 * commanded setpoint is known ahead.
 *
 * AND IT IS LEGAL UNDER THE RETIREMENT, which is the part that has to be argued rather than
 * assumed. "Nothing addressed by POSITION IN A LAP survives ... a component may only be addressed
 * by the machine's own STATE." Roll angle is machine state — a physical shaft position, not an
 * index into a program — so a correction keyed on it transfers to any program the mill runs,
 * which is precisely what a lap table does not do. The test of that claim is that the SETPOINT
 * never repeats anything: there is no lap here to memorise.
 *
 * SO THE REFERENCE HANDED TO THE DEPLOYED OBJECT IS NOT ONLY THE SETPOINT — IT IS EVERYTHING
 * KNOWN AHEAD ABOUT WHAT THE MACHINE IS ABOUT TO DO. Declared as two extra reference channels
 * (cos and sin of roll angle, so a linear map can synthesise any amplitude AND any phase, which
 * is what the 100-step transport delay needs), the existing window machinery carries it with NO
 * library change: `refDim` widens, `_rowFrom` reads it, and the deploy path reaches it through
 * the host's own `ctx.lookRaw`. The plant still sees `ref[0]` alone.
 *
 * THE CONTROL IS BUILT INTO THE PLANT AND IT IS A GOOD ONE. The mill's OTHER disturbance is the
 * entry gauge, which the rig declares "unmeasured" and gives periods of 2,150 and 950 steps —
 * NOT commensurate with the 408-step roll turn. So over the training lap the unmeasured
 * disturbance does not repeat with the declared phase, and a map that scored by memorising it
 * could not transfer. Whatever this wins, it wins on the disturbance it was told about.
 *
 * WINDOW: 8 roll turns is a lap of 3,267 steps, so `min(0.61·settle, lap/8)` gives ±408 — one
 * whole turn, and four times the 100-step transport delay it has to lead.
 *
 * KNOBS: TURNS (roll turns per training lap), RIDGE, STD, ONLINE, SEED, NOECC=1 (the falsifier —
 * withhold the declared phase and the object is back to a constant reference).
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { millSpec } from './rigs/specs.mjs';
import { deriveWindow, reportDistil, priceFrom, ridgeLadder, teacherReuse, teachLaps, dietN } from './rigs/distilkit.mjs';
import * as RM from './rigs/rollmill-rig.mjs';

if (process.env.SUITE !== 'full') {
  console.log('\ndistil-mill: SKIPPED (full tier only — one commissioning)\n');
  process.exit(0);
}

const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  → ${detail}`}`);
  if (!cond) failed++;
};
console.log('\ndistil-mill: the DEPLOYED object on a REGULATOR — the column we score worst on\n');

// ---------------------------------------------------------------- the declared phase
const TURNS = env('TURNS', 8);
const PER = 1 / (RM.F_ECC * RM.DT);                 // steps per backup-roll revolution
const LAP = Math.round(TURNS * PER);
const NOECC = process.env.NOECC === '1';
/** Roll angle, as an encoder reports it. `NOECC=1` withholds it — the falsifier. */
const phase = (k) => 2 * Math.PI * RM.F_ECC * k * RM.DT;
const refOf = (k) => (NOECC ? [RM.S0] : [RM.S0, Math.cos(phase(k)), Math.sin(phase(k))]);
const REFDIM = NOECC ? 1 : 3;

const SETTLE = 400;   // the capsule lag is 10 steps; what must be spanned is the 100-step delay
const { reach: REACH, offsets: OFFSETS, rule: RULE } = deriveWindow({
  settle: SETTLE, lapMin: LAP, win: process.env.WIN === undefined ? undefined : env('WIN') });
console.log(`  ${TURNS} roll turns per lap = ${LAP} steps (a turn is ${PER.toFixed(1)}), `
  + `window ±${REACH} raw steps against a ${RM.DLY}-step transport delay  [rule ${RULE}]`);
console.log(`  reference channels: ${REFDIM}${NOECC ? '  (NOECC — the phase is WITHHELD)'
  : '  (setpoint, cos and sin of roll angle)'}`);
console.log(`  the UNMEASURED entry wander runs at 2150 and 950 steps, NOT commensurate with the `
  + `${PER.toFixed(0)}-step turn — so it cannot be memorised against the declared phase\n`);

/** Four training runs: the same declared phase, four different unmeasured-disturbance draws. */
// LAPS PER TEACHER CALL (plan §73.2). One lap settles under the correction just handed over, the
// rest are scored and the last is the record the teacher inverts. With the plant carried the
// first is the only settle there is, so `TLAPS=2` asks whether the second scored lap is buying
// noise reduction worth a third of the commissioning. Unset is 3 and byte-identical.
const TLAPS = teachLaps();
const distilRuns = () => dietN([0, 1, 2, 3]).map((i) => {
  // Each run starts a whole number of TURNS in, so the declared phase is aligned to the lap,
  // and a different number of them, so the UNMEASURED entry wander sits at a different phase.
  const W = Math.round((37 + 11 * i) * PER);
  return {
    lap: LAP,
    closed: true,
    refAt: (k) => refOf(W + ((k % LAP) + LAP) % LAP),
    // THIS PLANT IS DELIBERATELY NOT CARRIED ACROSS THE TEACHER'S CALLS, and it is the only one
    // (plan §72.15). Everywhere else the per-call warm-up is a SETTLE and rebuilding it wastes the
    // plant's time; here `W` is a PHASE ALIGNMENT — a whole number of roll turns, so the declared
    // cos/sin reference matches the shaft the correction will meet (plan §71.2). A carried plant
    // would advance by `3*LAP` = 3267 steps against a 408.4-step turn, which is 8.0 turns and not
    // exactly 8, so the phase would drift a fifth of a step per call while `refAt` stayed put.
    // That is §71.2's own defect — the object handed a shaft angle that is not the shaft's — and
    // a blanket "carry the plant" would have reintroduced it silently.
    run: async (corr) => {
      const m = RM.makeMill(1 + i);
      for (let j = 0; j < W; j++) m.step(RM.S0);
      const want = [];
      let s2 = 0, n = 0;
      const err = [new Float64Array(LAP)];
      for (let j = 0; j < TLAPS * LAP; j++) {
        const kk = ((j % LAP) + LAP) % LAP;
        const u = corr ? corr.at(kk) : [0];
        m.step(RM.S0 + (u[0] || 0));
        want.push((RM.MM * RM.S0 + RM.QM * RM.H0) / (RM.MM + RM.QM));
        if (want.length > RM.DLY + 2) want.shift();
        const w = want.length > RM.DLY ? want[want.length - 1 - RM.DLY] : RM.HREF;
        const g = m.gauge();
        if (j >= (TLAPS - 1) * LAP) err[0][kk] = g - w;
        if (j >= (TLAPS - 1) * LAP) { s2 += (g - w) ** 2; n++; }
      }
      return { score: Math.sqrt(s2 / n), err };
    },
  };
});

// THE PHASE MUST BE THE SHAFT'S, NOT THE PROGRAM'S. `millSpec.fresh()` warms the mill 4,000
// steps before the scored run begins, and 4,000/408.4 is 9.79 TURNS — so at scored step 0 the
// backup roll is 0.79 of a revolution from where `phase(0)` says it is, and the map is handed a
// shaft angle that is not the shaft's. The training runs hid it because each of them warms a
// WHOLE number of turns by construction. An encoder reads the actual angle, so the reference the
// object is given must too: this is the same frame error as the unclosed lap and the decimated
// look-ahead, in a third costume, and it is worth the four lines it takes to say so.
const WARM = 4000;
const spec = { ...millSpec,
  // NO CASCADE: this rung's teacher is `hff`, so the cascade would be commissioned,
  // scored and then REPLACED by the rung that wins (plan §73.1). `DEPTH=2` is the control.
  depth: 0,
  refAt: (k) => refOf(WARM + k),
  distil: { refDim: REFDIM, ridge: env('RIDGE', 1e-6), offsets: OFFSETS,
    ...(ridgeLadder() ? { ridges: ridgeLadder() } : {}),
    ...(teacherReuse() ? {} : { teacherReuse: false }),
    ...(process.env.STD === '0' ? {} : { standardize: true }),
    ...(process.env.ONLINE === '0' ? { online: false } : {}) },
  distilRuns };

announce();
const price = priceFrom();
const { rep, auto } = await ladder(spec);
price.close({ dt: RM.DT, rep });
const { inSample } = await reportDistil({ rep, runs: distilRuns(),
  nFeat: OFFSETS.length * REFDIM + 1, auto });

check('the mill is not made worse by anything the ladder ships',
  rep.best <= rep.base, `${rep.base.toExponential(3)} → ${rep.best.toExponential(3)}`);
check('the distilled rung reached a REGULATOR at all — a plant whose setpoint never moves, which '
  + 'is the column this object scores worst on and the one §69 called structural',
  !!(rep.distil && (rep.distil.policy || rep.distil.note)),
  JSON.stringify(rep.distil || null));
console.log(failed ? `\n  ${failed} check(s) failed\n` : '\n  all checks passed\n');
process.exit(failed ? 1 : 0);
