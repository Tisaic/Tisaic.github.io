// THE PROBE INSTRUMENT REACHES THE TEACHER THE HARNESS BUILT, NOT ONLY THE ONE IT PUBLISHED
// (plan §125).
//
// §121 put §74's laser-tracker substitute into the shared kit as `probeRuns(runs, K)` — each
// training run's RECORD replaced by K evenly spaced touches interpolated around the closed lap,
// its SCORE by the rms at those touches — and wrapped the descriptor's `run` and `teach`. The
// ORACLE route's teacher is not either of those: `oracleConverge` is built BY THE HARNESS, closed
// over the harness's own drive loop, so `ORACLE=1 PROBEPTS=K` degraded nothing the teacher read.
// Three rows were launched on that configuration before anyone checked and §121 recorded them as
// a vacuous control (rule 9c).
//
// WHAT THAT FAILURE ACTUALLY IS, and why a test of `probeRuns` in isolation cannot see it: the
// wrap is applied to a SPREAD COPY of the descriptor, and the teacher's closure was built before
// the copy existed, so it keeps reading the original. Both objects are correct on their own; what
// is wrong is which one the already-built closure sees. That is rule 9b's shape — the function is
// fine and the path to it is not — so what is pinned here is the CLOSURE TIMING and nothing else:
// a teacher built BEFORE the degradation must still be degraded BY it.
//
// BOTH HALVES (rule 9), because an instrument that always degrades is as useless as one that
// never does: K = 0 leaves the descriptor untouched, K at or above the lap is identity on the
// record, a descriptor that publishes no drive says so rather than reading as degraded (rule 25),
// and a published drive that the teacher never calls is distinguishable from one it called.
import { probeRuns } from './rigs/distilkit.mjs';

let failed = 0;
const ck = (n, c, d) => {
  console.log(`  ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`);
  if (!c) failed++;
};

const LAP = 64;
// A record with structure BETWEEN the touches, so interpolating at K < LAP is detectable: a tone
// at harmonic 8 is exactly reproduced by 64 touches and destroyed by 4 (which carry 2 harmonics).
const truth = (k) => Math.sin(2 * Math.PI * 8 * k / LAP);
const freshRec = () => Array.from({ length: LAP }, (_, k) => [truth(k)]);

/** A descriptor of the shape `distil-column.mjs` and `distil-barrel.mjs` build. */
const mkRun = ({ publish = true } = {}) => {
  let drives = 0;
  const DRIVE = async () => { drives++; return { score: 1, rec: freshRec() }; };
  const t = {
    lap: LAP,
    run: async () => ({ score: 1, err: [Float64Array.from({ length: LAP }, (_, k) => truth(k))] }),
    ...(publish ? { drive: DRIVE } : {}),
  };
  // THE HARNESS'S OWN SHAPE: the teacher is built HERE, before any driver has seen the descriptor,
  // and reads the drive at CALL time. `converge` is the object `probeRuns` could not reach.
  const via = (a) => (publish ? t.drive(a) : DRIVE(a));
  t.converge = async () => via({ trace: true });
  t.rawDrives = () => drives;
  return t;
};

console.log('\nTHE PROBE INSTRUMENT, AND THE TEACHER THE HARNESS ALREADY BUILT (plan §125)\n');

// ------------------------------------------------------------------ (1) K = 0 is untouched
{
  const t = mkRun();
  const [w] = probeRuns([t], 0);
  ck('K = 0 returns the descriptor itself — the instrument is not in the route at all (rule 21)',
    w === t && w.probePts === undefined && w.probeDrives === undefined);
}

// ------------------------------------------- (2) THE FAILURE §121 SHIPPED: a teacher built first
{
  const t = mkRun();
  const [w] = probeRuns([t], 4);
  const r = await t.converge();          // the closure the HARNESS built, not the wrapped copy
  const carried = r.rec.map((x) => x[0]);
  const exact = freshRec().map((x) => x[0]);
  const same = carried.every((v, k) => v === exact[k]);
  ck('a teacher built BEFORE the degradation still reads a DEGRADED record — the seam is the '
    + 'descriptor and not the spread copy', !same);
  ck('...and the run/teach wrap is on the copy as before', typeof w.run === 'function' && w.probePts === 4);
  ck('...and the instrument COUNTS what it degraded, so wired-and-never-called is visible (rule 25)',
    w.probeDrives() === 1, `${w.probeDrives()} drive(s) for ${t.rawDrives()} call(s)`);
}

// ----------------------------------------------------- (3) K at the lap is identity ON THE RECORD
{
  const t = mkRun();
  const [w] = probeRuns([t], LAP);
  const r = await t.converge();
  const exact = freshRec().map((x) => x[0]);
  ck('K = lap is EXACT on the record — the degradation is a projection and not a filter',
    r.rec.every((x, k) => Math.abs(x[0] - exact[k]) < 1e-12));
  ck('...and it still ran through the instrument rather than bypassing it', w.probeDrives() === 1);
}

// --------------------------------------------- (4) a descriptor with NO drive says so (rule 25)
{
  const t = mkRun({ publish: false });
  const [w] = probeRuns([t], 4);
  ck('a run that publishes no drive gets NO drive counter — a route the instrument cannot reach '
    + 'must not read as one it degraded', w.probeDrives === undefined && w.probePts === 4);
  const r = await t.converge();
  const exact = freshRec().map((x) => x[0]);
  ck('...and its teacher is demonstrably NOT degraded, which is the state §121 was in',
    r.rec.every((x, k) => x[0] === exact[k]));
}

// ------------------------------------------------- (5) the degradation is real on `run` as well
{
  const t = mkRun();
  const [w] = probeRuns([t], 4);
  const a = await w.run(), b = await mkRun().run();
  const ea = Array.from(a.err[0]), eb = Array.from(b.err[0]);
  ck('the record `run` returns is degraded too (§121, unchanged)', !ea.every((v, k) => v === eb[k]));
  // AND THE SCORE MOVES WITH IT, which is the half that matters: the teacher's monotone gate reads
  // this number, and on the column at 64 touches it reads 4.2x BETTER than the machine delivers.
  ck('...and so is the SCORE the teacher gates on', a.score !== b.score, `${a.score} vs ${b.score}`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} check(s) failed\n`);
process.exit(failed === 0 ? 0 : 1);
