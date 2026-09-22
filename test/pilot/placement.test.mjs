// WHERE ①d GOES IS DECIDED BETWEEN TWO COMPLETE CONTROLLERS (plan §133).
//
// §126 proposed *place ①d before any rung that will deploy*, measured it 3 of 3, and named
// scoring the placement as the next step. §128 then REFUTED the rule on a fourth plant — the
// quadruple tank, where going first costs 1.82x and poisons a 19.91x incumbent down to 1.51x —
// and ended with the same sentence: what separates the plants is which is STRONGER, that cannot
// be known without running both, and scoring it is not built.
//
// THE OBVIOUS FORM OF IT IS WRONG, AND THIS FILE PINS THE REASON SO IT IS NOT REBUILT. Scoring
// the {①d, ①} PAIR both ways reads, on the cart-pole, ①d-first 11.791x against the declared
// pair's 5.019x and picks FIRST — while the COMPLETE declared ladder reads 11.93x, because ①d
// contributes 1.08x there and leaves ②d 2.38x still to find. The pair's own scores are wrong by
// the entire contribution of the rungs above them, which is the ④ drop-one pass's own opening
// sentence arriving one rung lower down. So the comparison is between two things a machine could
// actually receive: ①d ALONE, probed on the bare plant before the ladder ran, and the ladder as
// it finished.
//
// BOTH HALVES (rule 9), because a rule that only ever picks one way is a default with a
// measurement stapled to it: a plant where ①d alone WINS must ship ①d alone with everything else
// dropped, and a plant where the declared ladder wins must ship BYTE-IDENTICALLY to the run that
// never scored the placement at all. And a third: with the knob unset there must be no
// `rep.placement` and no extra scored run (rule 9c — assert the run PRODUCED ITS ROWS first).
//
// THE FACTORS HERE ARE NOT CONTROLLER RESULTS (rule 14). The plant is a noiseless, exactly
// invertible first-order lag — `dirinvrung.test.mjs` says why at length — so a linear map of the
// right window inverts it to machine precision. That is what makes it a good DECISION test: the
// two candidates can be made to differ by orders of magnitude on purpose, so a wiring fault
// cannot hide inside a close call. The real factors are on six plants in §133.
import { AutoStack } from '../../lib/pilot/autostack.js';
import { motionBasis } from '../../lib/pilot/classic.js';

let failed = 0;
const ck = (n, c, d) => {
  console.log(`  ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`);
  if (!c) failed++;
};

// ---------------------------------------------------------------------------- the plant
const G = 2.0, A = 0.25, N = 1200;
const inv = (y) => y / G;
const mkPlant = () => { let y = 0; return { step: (u) => { y += A * (G * u - y); return y; } }; };
const refAt = (k) => {
  const seg = Math.floor(k / 150) % 4, t = (k % 150) / 150;
  return [seg === 0 ? t : seg === 1 ? 1 : seg === 2 ? 1 - t : 0];
};
const openLoop = (cAt, n) => {
  const p = mkPlant(), C = [], U = [];
  for (let k = 0; k < n; k++) { const c = cAt(k); const y = p.step(c[0]); C.push([c[0]]); U.push([inv(y)]); }
  return { C, U, n };
};
const rnd = (s0) => { let s = s0 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); };
const dietRuns = () => {
  const out = [];
  for (let d = 0; d < 3; d++) {
    const r = rnd(7 + d); let cur = 0, hold = 0;
    out.push(openLoop((k) => { if (hold-- <= 0) { cur = r(); hold = 20 + Math.floor(60 * r()); } return [cur]; }, 1200));
  }
  return out;
};

// THE REFERENCE'S OWN v AND a, which is what the conventional rung's basis is built from.
const REFV = new Float64Array(N), REFA = new Float64Array(N);
for (let k = 0; k < N; k++) REFV[k] = refAt(k + 1)[0] - refAt(k)[0];
for (let k = 0; k < N; k++) REFA[k] = (k + 1 < N ? REFV[k + 1] : REFV[k]) - REFV[k];
const BASIS = motionBasis([{ v: REFV, a: REFA }]);

const WIDE = [-24, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 24];

// THE LEVER THAT MAKES THE TWO CANDIDATES TRADE PLACES IS THE COMMISSIONING INSTRUMENT, and it
// had to be, which is worth recording. A NARROWER WINDOW does not weaken ①d here: a first-order
// lag is invertible from `y[k]` and `y[k-1]`, so three straddling taps read 2.4e6x where thirteen
// read 1.5e6x. What does weaken it is noise on what the TEACHER-FREE ROUTE MEASURED — §50.1's own
// axis — because ①d is fitted on the achieved output while the conventional rung is commissioned
// on the machine itself and never reads this record. So the two candidates are separated by
// something a real plant varies, and the DECISION under test is untouched by the lever.
const noisy = (runs, sigma) => {
  let s = 12345 >>> 0;
  const g = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 2 ** 32 - 0.5) * 2 * sigma; };
  return runs.map((r) => ({ ...r, U: r.U.map((u) => [u[0] + g()]) }));
};

let runs = 0;
const mkHost = (auto, extra = {}) => ({
  channels: [{ max: 3 }],
  run: async (corr, cname) => {
    runs++;
    const p = mkPlant(); let s2 = 0, n = 0, pk = 0;
    // THE ERROR SERIES COMES BACK TOO, because `ClassicFF.commission` fits on it — a mock that
    // returns only a score reaches `_project` with `undefined` and throws, which is the harness
    // failing before the thing under test (rule 17).
    const err = [new Float64Array(N)];
    for (let k = 0; k < N; k++) {
      const c = refAt(k), look = (o) => refAt(k + o);
      const u = auto.act({ v: [REFV[k]], a: [REFA[k]], look, lookRaw: look });
      if (corr) { const w = auto.into(corr.at(k), cname, {}); u[0] += w[0]; }
      if (u[0]) pk = Math.max(pk, Math.abs(u[0]));
      const y = p.step(c[0] + u[0]);
      err[0][k] = inv(y) - c[0];
      if (k > N * 0.05) { s2 += (inv(y) - c[0]) ** 2; n++; }
    }
    return { score: Math.sqrt(s2 / n), err, clip: { frac: 0, over: null }, uPk: pk };
  },
  ...extra,
});
const mk = (offsets, placement) => new AutoStack({ channels: [{ max: 3 }], authority: 0.6, floor: 0,
  basis: BASIS, maxDepth: 0, dirInv: { offsets, ...(placement ? { placement } : {}) } });

console.log('\nWHERE ①d GOES, DECIDED BETWEEN TWO COMPLETE CONTROLLERS (plan §133)\n');

// ---------------------------------------------------- (0) UNSET IS UNSET, AND IT COSTS NOTHING
const a0 = mk(WIDE, null);
runs = 0; const r0 = await a0.commission(mkHost(a0, { dirInvRuns: dietRuns }));
const runs0 = runs;
ck('the control RAN and produced its rows (rule 9c)', r0.rungs.length >= 3 && Number.isFinite(r0.best),
  JSON.stringify(r0.rungs.map((r) => r.name)));
ck('with the knob unset there is NO placement record at all (rule 25)', r0.placement === undefined,
  JSON.stringify(r0.placement));

// ------------------------------------------------- (1) ①d ALONE WINS → it goes first, alone
const a1 = mk(WIDE, 'score');
runs = 0; const r1 = await a1.commission(mkHost(a1, { dirInvRuns: dietRuns }));
const runs1 = runs;
ck('scored, and it chose FIRST where ①d alone beats the whole declared ladder',
  !!(r1.placement && r1.placement.scored && r1.placement.chose === 'first'),
  JSON.stringify(r1.placement));
ck('both candidates are reported as factors, so the choice can be re-derived (rule 30)',
  !!(r1.placement && r1.placement.xFirstAlone > r1.placement.xDeclared),
  `${r1.placement && r1.placement.xFirstAlone} vs ${r1.placement && r1.placement.xDeclared}`);
ck('EVERYTHING ELSE COMES OFF — the candidate was scored with nothing else armed',
  r1.deployed.distil === true && r1.deployed.classic === false && !r1.deployed.stack && !r1.deployed.hff,
  JSON.stringify(r1.deployed));
ck('the shipped score IS the probe\'s own scored run, not a number nobody measured',
  Math.abs(r1.best - r0.base / r1.placement.xFirstAlone) < 1e-12 * Math.max(1, r1.best),
  `${r1.best} vs ${r0.base / r1.placement.xFirstAlone}`);
ck('and it is BETTER than the declared ladder it replaced', r1.best < r0.best,
  `${r1.best.toExponential(4)} against ${r0.best.toExponential(4)}`);
ck('it cost exactly ONE extra scored run — the probe, and no second commission',
  runs1 === runs0 + 1, `${runs1} against ${runs0}`);
console.log(`    ①d alone ${r1.placement.xFirstAlone.toFixed(3)}x  ·  declared ladder `
  + `${r1.placement.xDeclared.toFixed(3)}x  ·  kept ${r1.placement.chose.toUpperCase()}`);

// --------------------------------- (2) THE DECLARED LADDER WINS → byte-identical to not scoring
const DIRTY = () => noisy(dietRuns(), 0.02);
const a2 = mk(WIDE, null);
runs = 0; const r2 = await a2.commission(mkHost(a2, { dirInvRuns: DIRTY }));
const runs2 = runs;
const a3 = mk(WIDE, 'score');
runs = 0; const r3 = await a3.commission(mkHost(a3, { dirInvRuns: DIRTY }));
const runs3 = runs;
ck('the other half FIRES: on a noisier commissioning record the declared ladder wins',
  !!(r3.placement && r3.placement.chose === 'declared'), JSON.stringify(r3.placement));
ck('and the machine is BYTE-IDENTICAL to the run that never scored the placement (rule 21)',
  r3.best === r2.best && JSON.stringify(r3.deployed) === JSON.stringify(r2.deployed),
  `${r3.best} vs ${r2.best}; ${JSON.stringify(r3.deployed)} vs ${JSON.stringify(r2.deployed)}`);
ck('the losing candidate leaves NO row in the ladder it was never scored against',
  r3.rungs.length === r2.rungs.length
  && r3.rungs.every((r, i) => r.name === r2.rungs[i].name),
  `${JSON.stringify(r3.rungs.map((r) => r.name))} vs ${JSON.stringify(r2.rungs.map((r) => r.name))}`);
ck('it still cost exactly one extra scored run, and says what it bought (rule 25)',
  runs3 === runs2 + 1 && !!r3.placement.why, `${runs3} against ${runs2}`);

// ------------------------------------------- (3) NOTHING TO ORDER IS STATED, NOT SILENTLY SKIPPED
const a4 = new AutoStack({ channels: [{ max: 3 }], authority: 0.6, floor: 0,
  classic: false, maxDepth: 0, dirInv: { offsets: WIDE, placement: 'score' } });
const r4 = await a4.commission(mkHost(a4, { dirInvRuns: dietRuns }));
ck('with no conventional rung there is no second position, and the report SAYS so (rule 25)',
  !!(r4.placement && r4.placement.scored === false && /no conventional rung/.test(r4.placement.why)),
  JSON.stringify(r4.placement));

// ------------------------------------------------ (4) A DECLARED `first` IS NOT RE-SCORED
const a5 = new AutoStack({ channels: [{ max: 3 }], authority: 0.6, floor: 0,
  basis: BASIS, maxDepth: 0, dirInv: { offsets: WIDE, first: true, placement: 'score' } });
runs = 0; const r5 = await a5.commission(mkHost(a5, { dirInvRuns: dietRuns }));
ck('a caller that DECLARED `first` is not charged a probe to re-decide it',
  !!(r5.placement && r5.placement.scored === false && r5.placement.chose === 'first')
  && runs === runs0, `${JSON.stringify(r5.placement)}; ${runs} runs against ${runs0}`);

console.log(`\n${failed ? `FAIL — ${failed} check(s) failed` : 'PASS — 0 check(s) failed'}\n`);
process.exit(failed ? 1 : 0);
