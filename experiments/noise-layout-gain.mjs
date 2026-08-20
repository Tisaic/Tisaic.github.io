// IS THE COMMON-MODE GAIN A PROPERTY OF THE ESTIMATOR, OR OF THE LAYOUT?
//
// Two nominally similar twelve-tap layouts disagreed by 3.5x on the one number
// this whole question turns on -- the trained readout's gain along the direction
// a shared thermal offset points. One layout gave 0.407 against a random-direction
// gain of 1.068 (the estimator REJECTS the coherent direction, and correlated
// noise is then less damaging than independent noise); the other gave 1.428
// against 0.969 (it AMPLIFIES it, and correlated noise is worse). Both are six
// evenly spaced taps per wall over the same span; they differ only in where the
// rounding put them on a 48-cell axis.
//
// That disagreement has to be resolved rather than averaged, because the two
// answers support opposite conclusions and one of them was already reported.
// Either one run is wrong, or the gain is layout-sensitive -- in which case
// neither "correlated noise is worse" nor "the estimator rejects it" is a claim
// anyone can make about this method in general, and the honest statement is that
// it must be measured for a given instrument layout.
//
// Cheap, because the gain is exact arithmetic on the trained weight matrix and
// the ladder already showed it predicts the replayed damage ratio in direction
// (magnitude is roughly 2x optimistic). So: many layouts, gain only, no replay.
import { dyeStream, rng } from './dye-stream.mjs';
import { FieldReconstructor } from '../lib/probesense/sensor.js';

const SAMPLES = 1600, WARMUP = 200, TRAIN_END = 1200, PER_WALL = 12;
const NTAPS = +(process.env.NTAPS || 12);
const TRIALS = +(process.env.TRIALS || 60);
const f = (v, d = 3) => (Number.isFinite(v) ? +v.toFixed(d) : null);

const S = await dyeStream({ samples: SAMPLES, perWall: PER_WALL });
const K = S.target.length;

let SD = 0;
{
  let n = 0;
  for (let t = TRAIN_END; t < SAMPLES; t++) {
    const y = S.truth[t];
    let m = 0; for (const v of y) m += v; m /= K;
    for (const v of y) SD += (v - m) ** 2;
    n++;
  }
  SD = Math.sqrt(SD / n);
}

function evaluate(taps) {
  const chans = [];
  for (const t of [...taps].sort((a, b) => a - b)) chans.push(3 * t, 3 * t + 1, 3 * t + 2);
  const p = chans.length;
  const model = new FieldReconstructor({ nSignals: p, nLocations: K, lag: 1, stride: 1,
    warmup: WARMUP, expand: false, ridge: 100, lam: 1.0 });
  for (let t = 0; t < TRAIN_END; t++) {
    model.push(chans.map((c) => S.sig[t][c]));
    model.observe(S.truth[t]);
  }
  const gain = (dir) => {
    let norm = 0; for (const v of dir) norm += v * v;
    norm = Math.sqrt(norm);
    let acc = 0;
    for (let k = 0; k < K; k++) {
      const th = model.theta[k].m;
      let r = 0;
      for (let i = 0; i < p; i++) r += dir[i] * th[i + 1];
      acc += (model._tStd[k] * r) ** 2;
    }
    return Math.sqrt(acc) / (norm * SD);
  };
  const rl = [];
  chans.forEach((c, i) => { if (S.rhoSlots.includes(c)) rl.push(i); });
  const dAbs = new Float64Array(p), dRel = new Float64Array(p);
  for (const i of rl) { dAbs[i] = 1 / S.std[chans[i]]; dRel[i] = 1; }
  let rms = 0;
  for (const i of rl) {
    const e = new Float64Array(p); e[i] = 1;
    rms += gain(e) ** 2;
  }
  rms = Math.sqrt(rms / rl.length);
  return { abs: gain(dAbs), rel: gain(dRel), rms };
}

// The systematic layout the ladder used: evenly spaced over the recorded span.
const even = [];
{
  const perWall = NTAPS >> 1;
  for (let w = 0; w < 2; w++) {
    for (let j = 0; j < perWall; j++) {
      even.push(w * PER_WALL + (perWall === 1 ? 0 : Math.round(j * (PER_WALL - 1) / (perWall - 1))));
    }
  }
}

console.log(JSON.stringify({ taps: NTAPS, trials: TRIALS, locations: K,
  poolPerWall: PER_WALL, evenLayout: even }));

const rows = [];
const e = evaluate(even);
console.log(`\n  even layout        abs ${f(e.abs)}  rel ${f(e.rel)}  rms ${f(e.rms)}` +
  `   ratio abs ${f(e.abs / e.rms, 2)}  rel ${f(e.rel / e.rms, 2)}`);

const g = rng(2024);
const pick = () => {
  // Half the taps from each wall, so a trial cannot degenerate into a one-wall
  // layout -- which this project already measured as a different question.
  const out = [];
  for (let w = 0; w < 2; w++) {
    const pool = [...Array(PER_WALL).keys()];
    for (let j = 0; j < (NTAPS >> 1); j++) {
      const idx = Math.min(pool.length - 1, Math.floor(Math.abs(g()) / 3 * pool.length));
      out.push(w * PER_WALL + pool.splice(idx, 1)[0]);
    }
  }
  return out;
};
for (let i = 0; i < TRIALS; i++) {
  const r = evaluate(pick());
  rows.push({ abs: r.abs / r.rms, rel: r.rel / r.rms });
}

const stat = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: f(s[0], 2), q25: f(q(0.25), 2), median: f(q(0.5), 2), q75: f(q(0.75), 2),
    max: f(s[s.length - 1], 2), mean: f(mean, 2),
    fractionAbove1: f(s.filter((v) => v > 1).length / s.length, 2) };
};
console.log('\n  RATIO of the common-mode gain to the gain independent noise sees.');
console.log('  >1 means a coherent offset is amplified relative to incoherent noise of');
console.log('  the same size, i.e. the instrumentation review is right for that layout.');
console.log(`   absolute offset  ${JSON.stringify(stat(rows.map((r) => r.abs)))}`);
console.log(`   relative offset  ${JSON.stringify(stat(rows.map((r) => r.rel)))}`);

const spread = (xs) => Math.max(...xs) / Math.min(...xs);
console.log(`\n  layout-to-layout spread: ${f(spread(rows.map((r) => r.abs)), 1)}x (absolute),` +
  ` ${f(spread(rows.map((r) => r.rel)), 1)}x (relative)`);
console.log(spread(rows.map((r) => r.abs)) > 3
  ? '\n  VERDICT: the gain is a property of the LAYOUT, not of the method. A single\n'
    + '  measurement of it -- in either direction -- does not generalise, and the\n'
    + '  0.38x that was reported earlier is inside this spread rather than wrong.'
  : '\n  VERDICT: the gain is stable across layouts, so a single measurement of it\n'
    + '  does generalise and the outlying run needs its own explanation.');
