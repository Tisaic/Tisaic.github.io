// THE DISTILLED RUNG'S TEACHER RUNS ON THE MACHINE THE RUNG DEPLOYS ON (plan §138).
//
// The rung is deployed ABOVE whatever rung ① left armed, and its training runs are closures the
// HOST writes — so until §138 every one of them applied the teacher's correction to the BARE
// plant, and on every plant where the conventional rung ships the teacher converged a correction
// for a machine that is not the one it is applied to (rule 34). The policy then double-corrected:
// the real steam exchanger's rung read 0.02x and was filed as *nothing left*, the cart-pole's and
// the real tanks' gain ladders walked down to 0.27 and 0.31 to shrink a correction sized for the
// bare plant. Composed, the exchanger DEPLOYS and both gain picks come off the floor.
//
// WHAT IS PINNED is the PATH through `commission()`, not the helper (rule 9b): what the host's
// training run is actually handed. Four states, because each is a different thing to report
// (rule 25): composed; the control `composeBelow: false`; composition NEEDED but impossible
// because the run states no units for the rung below; and nothing armed below, where the run
// must be untouched and nothing printed, so a plant with no conventional rung is byte-identical.
import { AutoStack } from '../../lib/pilot/autostack.js';
import { motionBasis } from '../../lib/pilot/classic.js';

let failed = 0;
const ck = (n, c, d) => {
  console.log(`  ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`);
  if (!c) failed++;
};

console.log('\nTHE TEACHER ON THE MACHINE IT DEPLOYS ON (plan §138)\n');

const N = 64;
const ref = { q: new Float64Array(N), v: new Float64Array(N), a: new Float64Array(N) };
for (let k = 0; k < N; k++) {
  ref.q[k] = Math.sin(2 * Math.PI * k / N);
  ref.v[k] = Math.cos(2 * Math.PI * k / N);
  ref.a[k] = -Math.sin(2 * Math.PI * k / N);
}
const basis = motionBasis([ref], { bias: true });

// A plant the conventional rung CAN improve (its error is a velocity lag), so rung ① deploys and
// there is something below ②d to compose — rule 9c: a composition test on a plant where ① refuses
// would pass vacuously.
const plantRun = (u) => {
  const err = [new Float64Array(N)];
  for (let k = 0; k < N; k++) err[0][k] = ref.v[k] * 0.5 + 0.05 * ref.a[k] * ref.a[k] - 0.4 * u(k);
  let s2 = 0; for (let k = 0; k < N; k++) s2 += err[0][k] ** 2;
  return { score: Math.sqrt(s2 / N), err };
};


// The training run records what it is HANDED on its first call — the teacher's baseline, where
// the teacher itself applies nothing, so whatever arrives is what the library composed under it.
const mkRuns = (withMotion) => {
  const seen = [];
  const runs = () => [{
    lap: N, closed: true,
    refAt: (k) => [ref.q[((k % N) + N) % N]],
    ...(withMotion ? { motion: (k) => { const i = ((k % N) + N) % N; return { v: [ref.v[i]], a: [ref.a[i]] }; } } : {}),
    run: async (corr) => {
      if (!seen.length) for (let k = 0; k < N; k++) seen.push(corr && corr.at ? (corr.at(k)[0] || 0) : 0);
      return plantRun((k) => (corr && corr.at ? (corr.at(k)[0] || 0) : 0));
    },
  }];
  return { runs, seen };
};

const commission = async ({ withBasis = true, withMotion = true, compose }) => {
  const { runs, seen } = mkRuns(withMotion);
  const a = new AutoStack({ channels: [{ max: 3 }], authority: 1, floor: 0, maxDepth: 0,
    ...(withBasis ? { basis } : {}),
    distil: { refDim: 1, offsets: [-4, -2, -1, 0, 1, 2, 4], ...(compose === undefined ? {} : { composeBelow: compose }) } });
  // The host's SCORED run applies whatever is deployed through `act()`, as every real host does —
  // without it rung ① could never win its own verify and there would be nothing below to compose.
  const look = (k) => (o) => [ref.q[(((k + o) % N) + N) % N]];
  const run = async (corr) => { a.beginRun(); return plantRun((k) => (a.act({ v: [ref.v[k]], a: [ref.a[k]], look: look(k), lookRaw: look(k) })[0] || 0)
    + (corr && corr.at ? (a.into(corr.at(k))[0] || 0) : 0)); };
  const rep = await a.commission({ run, lap: N, refAt: (k) => [ref.q[((k % N) + N) % N]],
    look: (o) => [ref.q[((o % N) + N) % N]], distilRuns: runs });
  return { a, rep, seen };
};

// ------------------------------------------------------------- (1) composed, by default
{
  const { a, rep, seen } = await commission({});
  ck('the conventional rung DEPLOYED, so there is a machine below ②d to compose (rule 9c)',
    !!rep.deployed.classic, JSON.stringify(rep.deployed));
  const want = Array.from({ length: N }, (_, k) => a.capTotal(a.classic.live([ref.v[k]], [ref.a[k]]))[0]);
  const maxDiff = Math.max(...want.map((w, k) => Math.abs(w - seen[k])));
  const peak = Math.max(...want.map(Math.abs));
  ck('by DEFAULT the training run is handed the armed conventional rung\'s own correction under the teacher\'s',
    seen.length === N && peak > 0 && maxDiff < 1e-12, `max |diff| ${maxDiff} against a peak of ${peak}`);
  ck('...and the report says so', /composed under every training run/.test(rep.distil && rep.distil.composedBelow),
    rep.distil && rep.distil.composedBelow);
}

// ------------------------------------------------------------- (2) the control
{
  const { rep, seen } = await commission({ compose: false });
  ck('`composeBelow: false` hands the run the BARE machine — the pre-§138 configuration',
    seen.length === N && seen.every((u) => u === 0), `peak |u| ${Math.max(...seen.map(Math.abs))}`);
  ck('...and the report names the control rather than staying silent (rule 25)',
    /composeBelow: false/.test(rep.distil && rep.distil.composedBelow), rep.distil && rep.distil.composedBelow);
}

// ------------------------------------------------------------- (3) needed, and impossible
// A run that does not state the rung's own series is NOT composed by guessing units from
// `refAt`: the quadruple tank builds its basis on LEVELS while its runs speak VOLTS, and EMPS in
// m/s, so a guess is wrong by a plant gain or a 1/DT with nothing thrown (rule 17).
{
  const { rep, seen } = await commission({ withMotion: false });
  ck('a run with no `motion(k)` is NOT composed — the units are the host\'s to state',
    seen.length === N && seen.every((u) => u === 0), `peak |u| ${Math.max(...seen.map(Math.abs))}`);
  ck('...and the report says composition was NEEDED and not done', /NOT done/.test(rep.distil && rep.distil.composedBelow),
    rep.distil && rep.distil.composedBelow);
}

// ------------------------------------------------------------- (4) nothing below
{
  const { rep, seen } = await commission({ withBasis: false });
  ck('with nothing armed below ②d the run is untouched',
    seen.length === N && seen.every((u) => u === 0), `peak |u| ${Math.max(...seen.map(Math.abs))}`);
  ck('...and NOTHING is reported, so a plant with no conventional rung prints byte-identically',
    !(rep.distil && 'composedBelow' in rep.distil), rep.distil && rep.distil.composedBelow);
}

console.log(failed ? `\ncomposebelow: ${failed} check(s) FAILED` : '\ncomposebelow: all checks passed');
process.exit(failed ? 1 : 0);
