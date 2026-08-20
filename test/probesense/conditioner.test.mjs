// Input conditioning: the filters must do what they are NAMED for.
//
// These were written as PREDICTIONS before the measurement that motivated the
// module, and all of them held there. Pinning them turns "it measured better" into
// "it works by the mechanism claimed", which is what would catch a later edit that
// improves a score by accident while breaking the reason.
//
//   1. a boxcar of length L cuts white noise by ~sqrt(L)
//   2. a boxcar does NOTHING to a constant offset -- drift is DC
//   3. common-mode rejection removes a coherent shift EXACTLY
//   4. common-mode rejection makes INDEPENDENT noise WORSE, because subtracting
//      the mean of uncorrelated noise injects a shared component -- which is why
//      the two filters are needed together rather than either alone
//
// TWO OF THOSE SIX ARE SHARPENED HERE, because writing them as tests exposed that
// they were right about the outcome and wrong about the mechanism. (3) is exact
// only for a shift proportional to each channel's calibrated spread; a shared
// temperature coefficient makes an ABSOLUTE shift, which the rejection attenuates
// strongly but cannot cancel unless the channels are alike. And (4) is not about
// magnitude at all -- subtracting the cross-channel mean of P uncorrelated
// channels leaves variance sigma^2 (1 - 1/P), very slightly SMALLER -- it is that
// the residual becomes CORRELATED at -1/(P-1), and correlated inputs are what an
// expanded basis handles badly. The reconstruction cost measured earlier
// (6.87e-4 -> 1.98e-3) is real; this is why.
//   5. the noise estimator recovers an injected magnitude
//   6. a stress sweep makes the selector reach for conditioning where a plain fit
//      would not
//
// TWO THINGS THE MEASUREMENT HAD TO GET RIGHT, and the first version of this file
// got both wrong and failed five checks against correct code:
//
//   THE METRIC MUST ISOLATE NOISE FROM DELAY. Scoring the conditioned signal
//   against the clean one at the same instant charges the filter for its GROUP
//   DELAY -- a causal boxcar of 16 lags by 7.5 samples, which on this signal is a
//   larger error than the noise it removes, so `lp 64` looked worse than `lp 8` at
//   rejecting a constant. Every check below therefore differences the conditioned
//   NOISY stream against the conditioned CLEAN one, so the filter's effect on the
//   signal cancels exactly and only its effect on the noise is left.
//
//   DRIFT HAS TO ARRIVE AFTER CALIBRATION. The conditioner freezes its own
//   per-channel mean, so an offset present while it calibrates is subtracted out
//   and is invisible to it -- which is correct, and is the same thing the model's
//   standardisation does. Injecting drift from t=0 tests nothing.
import { InputConditioner, estimateChannelNoise, selectConditioning }
  from '../../lib/probesense/conditioner.js';
import { FieldReconstructor } from '../../lib/probesense/sensor.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nprobesense: input conditioning');

function rng(seed) {
  let s = seed >>> 0;
  const u = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

const NS = 6, GROUP = [[0, 1, 2, 3, 4, 5]], T = 6000, WARM = 300, SETTLE = WARM + 400;
// EQUAL AMPLITUDE, DISTINCT PERIODS. Equal amplitude so every channel has the same
// calibrated spread, which is what makes a uniform absolute offset exactly
// removable by a rejection working in those units. Distinct periods so the array
// carries little genuine common mode -- rejection removes any spatially uniform
// component, signal included, and a test signal that is mostly common would be
// measuring that cost rather than the filter.
const signal = (t, i) => Math.sin(t / (60 + 9 * i) + i);

function condition(cfg, noiseFn) {
  const c = new InputConditioner({ nSignals: NS, groups: GROUP, warmup: WARM, ...cfg });
  const out = [];
  for (let t = 0; t < T; t++) {
    const r = new Array(NS);
    for (let i = 0; i < NS; i++) r[i] = signal(t, i) + (noiseFn ? noiseFn(t, i) : 0);
    out.push(c.push(r));
  }
  return out;
}

/**
 * How much of the NOISE survives the filter: the conditioned noisy stream against
 * the conditioned clean one. The filter's effect on the signal -- attenuation and
 * group delay alike -- is identical in both and cancels.
 */
function noiseThrough(cfg, noiseFn) {
  const a = condition(cfg, noiseFn), b = condition(cfg, null);
  let se = 0, n = 0;
  for (let t = SETTLE; t < T; t++) {
    if (!a[t] || !b[t]) continue;
    for (let i = 0; i < NS; i++) { se += (a[t][i] - b[t][i]) ** 2; n++; }
  }
  return Math.sqrt(se / Math.max(1, n));
}

/** What the filter costs the SIGNAL, which is the other half of the trade. */
function signalCost(cfg) {
  const a = condition(cfg, null);
  let se = 0, n = 0;
  for (let t = SETTLE; t < T; t++) {
    if (!a[t]) continue;
    for (let i = 0; i < NS; i++) { se += (a[t][i] - signal(t, i)) ** 2; n++; }
  }
  return Math.sqrt(se / Math.max(1, n));
}

// Noise that starts only AFTER the conditioner has calibrated -- see the header.
const after = (fn) => (t, i) => (t >= SETTLE - 200 ? fn(t, i) : 0);

// ------------------------------------------------------- 1. sqrt(L) on white noise
{
  const g = rng(5);
  const white = after(() => 0.2 * g());
  const r1 = noiseThrough({ lp: 1 }, white);
  const r16 = noiseThrough({ lp: 16 }, white);
  const gain = r1 / r16;
  check('a boxcar of 16 cuts white noise by ~sqrt(16), within 25%',
    gain > 4 / 1.25 && gain < 4 * 1.25,
    `measured ${gain.toFixed(2)}x (${r1.toExponential(2)} -> ${r16.toExponential(2)})`);
  const r64 = noiseThrough({ lp: 64 }, after(() => 0.2 * rng(5)()));
  check('...and it keeps scaling: lp64 beats lp16', r64 < r16,
    `${r16.toExponential(2)} -> ${r64.toExponential(2)}`);
}

// ---------------------------------------------------- 2. a low pass cannot see DC
{
  const drift = after(() => 0.3);
  const r8 = noiseThrough({ lp: 8 }, drift);
  const r64 = noiseThrough({ lp: 64 }, drift);
  check('a boxcar does NOTHING to a constant offset (drift is DC)',
    Math.abs(r8 - r64) / r8 < 0.05, `lp8 ${r8.toExponential(3)} vs lp64 ${r64.toExponential(3)}`);
  check('...and the offset really is still there, at its full size', Math.abs(r8 - 0.3) < 0.02,
    r8.toExponential(3));
}

// ------------------------------------------ 3. rejection removes a coherent shift
// EXACT FOR A SHIFT PROPORTIONAL TO EACH CHANNEL'S SPREAD, PARTIAL FOR AN ABSOLUTE
// ONE, and the distinction is not pedantry -- it decides what the filter is worth
// against a given instrument. The rejection works in calibrated units, so it
// removes `delta_i = k * std_i` exactly and an equal-absolute `delta_i = k` only up
// to how unequal the spreads are. A shared temperature coefficient produces the
// ABSOLUTE kind, so on an array of unlike channels the rejection is a strong
// attenuator rather than a cancellation.
{
  const spread = [];
  {
    const c = new InputConditioner({ nSignals: NS, groups: GROUP, warmup: WARM });
    for (let t = 0; t < WARM; t++) c.push(Array.from({ length: NS }, (_, i) => signal(t, i)));
    for (let i = 0; i < NS; i++) spread.push(c.std[i]);
  }
  const rel = after((t, i) => 0.3 * spread[i]);
  const plainRel = noiseThrough({ lp: 1 }, rel);
  const rejRel = noiseThrough({ lp: 1, cmr: true }, rel);
  check('rejection cancels a spread-proportional coherent shift essentially exactly',
    rejRel < 0.02 * plainRel, `${plainRel.toExponential(3)} -> ${rejRel.toExponential(3)}`);

  const abs = after(() => 0.3);
  const plainAbs = noiseThrough({ lp: 1 }, abs);
  const rejAbs = noiseThrough({ lp: 1, cmr: true }, abs);
  const spreadRatio = Math.max(...spread) / Math.min(...spread);
  check('rejection strongly attenuates an ABSOLUTE coherent shift but cannot cancel it',
    rejAbs < 0.4 * plainAbs && rejAbs > 0.02 * plainAbs,
    `${plainAbs.toExponential(3)} -> ${rejAbs.toExponential(3)}, channel spreads differ ${spreadRatio.toFixed(2)}x`);
}

// --------------------------------- 4. what rejection does to INDEPENDENT noise
// THE FIRST VERSION OF THIS ASSERTED THE WRONG MECHANISM. It predicted that
// rejection makes independent noise worse, and the reconstruction measurement DOES
// show that (6.87e-4 -> 1.98e-3 on the dye channel). But the harm is not in the
// magnitude: subtracting the cross-channel mean of P uncorrelated channels leaves
// variance sigma^2 * (1 - 1/P), which is very slightly SMALLER. What it does is
// make the residual noise CORRELATED across channels -- every channel now carries
// the same -(1/P) sum -- with correlation -1/(P-1). That structure is what an
// expanded basis handles badly, since a quadratic term of correlated inputs is
// biased rather than merely noisy. So the check below pins the correlation, which
// is the thing that actually explains the downstream cost.
{
  const g = rng(11);
  const white = after(() => 0.2 * g());
  const plain = noiseThrough({ lp: 1 }, white);
  const rej = noiseThrough({ lp: 1, cmr: true }, white);
  const predicted = Math.sqrt(1 - 1 / NS);
  check('rejection changes independent-noise MAGNITUDE by sqrt(1 - 1/P), within 10%',
    Math.abs(rej / plain - predicted) < 0.1 * predicted,
    `measured ${(rej / plain).toFixed(3)}x vs predicted ${predicted.toFixed(3)}x`);

  // The residual noise itself, channel against channel.
  const corrOf = (cfg) => {
    const a = condition(cfg, white), b = condition(cfg, null);
    const res = [];
    for (let t = SETTLE; t < T; t++) {
      if (!a[t] || !b[t]) continue;
      res.push(Array.from({ length: NS }, (_, i) => a[t][i] - b[t][i]));
    }
    let sum = 0, pairs = 0;
    for (let i = 0; i < NS; i++) {
      for (let j = i + 1; j < NS; j++) {
        let mi = 0, mj = 0, n = 0;
        for (const r of res) { n++; mi += (r[i] - mi) / n; mj += (r[j] - mj) / n; }
        let sii = 0, sjj = 0, sij = 0;
        for (const r of res) {
          const di = r[i] - mi, dj = r[j] - mj;
          sii += di * di; sjj += dj * dj; sij += di * dj;
        }
        sum += sij / Math.sqrt(sii * sjj); pairs++;
      }
    }
    return sum / pairs;
  };
  const cPlain = corrOf({ lp: 1 }), cRej = corrOf({ lp: 1, cmr: true });
  check('independent noise arrives uncorrelated across channels',
    Math.abs(cPlain) < 0.05, cPlain.toFixed(4));
  check('rejection CORRELATES it at -1/(P-1), which is the real cost',
    Math.abs(cRej - (-1 / (NS - 1))) < 0.05,
    `measured ${cRej.toFixed(4)} vs predicted ${(-1 / (NS - 1)).toFixed(4)}`);

  const both = noiseThrough({ lp: 16, cmr: true }, after(() => 0.2 * rng(11)()));
  check('a low pass alongside it recovers the magnitude', both < plain,
    `cmr+lp16 ${both.toExponential(3)} vs unfiltered ${plain.toExponential(3)}`);
}

// ------------------------------------------------- the other half of the trade
{
  const c1 = signalCost({ lp: 1 }), c16 = signalCost({ lp: 16 }), c128 = signalCost({ lp: 128 });
  check('an unfiltered stream costs the signal nothing', c1 < 1e-12, c1.toExponential(2));
  check('a long boxcar EATS THE SIGNAL, which is the cost the length trades against',
    c128 > 4 * c16, `lp16 ${c16.toExponential(2)} vs lp128 ${c128.toExponential(2)}`);
}

// ------------------------------------------------- 5. the noise estimator is honest
{
  let sd = 0, mu = 0, n = 0;
  for (let t = 0; t < T; t++) { n++; const d = signal(t, 0) - mu; mu += d / n; sd += d * (signal(t, 0) - mu); }
  const spread = Math.sqrt(sd / T);
  for (const eta of [0.05, 0.2]) {
    const g = rng(23);
    const rows = [];
    for (let t = 0; t < T; t++) {
      const r = new Array(NS);
      for (let i = 0; i < NS; i++) r[i] = signal(t, i) + eta * spread * g();
      rows.push(r);
    }
    const est = estimateChannelNoise(rows, [0, 1, 2, 3, 4, 5]).median;
    check(`the second-difference estimator recovers an injected ${eta} within 15%`,
      Math.abs(est - eta) / eta < 0.15, `measured ${est.toExponential(3)}`);
  }
  const clean = [];
  for (let t = 0; t < T; t++) clean.push(Array.from({ length: NS }, (_, i) => signal(t, i)));
  const c = estimateChannelNoise(clean, [0, 1, 2, 3, 4, 5]).median;
  check('...and reports ~zero on a clean record', c < 0.01, c.toExponential(2));
}

// ------------------------------------------- 6. the selector reaches for the filter
// Not that it picks one particular tag -- that depends on the plant -- but that the
// stress sweep makes it choose CONDITIONING where scoring the record alone would
// not, which is the whole argument for the sweep.
{
  const g = rng(41);
  const rows = [], truths = [];
  for (let t = 0; t < 1200; t++) {
    const r = new Array(NS);
    for (let i = 0; i < NS; i++) r[i] = signal(t, i) + 0.01 * g();
    rows.push(r);
    truths.push([signal(t, 0) * 0.5 + signal(t, 3), signal(t, 1)]);
  }
  const build = (cfg) => ({
    conditioner: new InputConditioner({ nSignals: NS, groups: GROUP, warmup: 150, ...cfg }),
    model: new FieldReconstructor({ nSignals: NS, nLocations: 2, lag: 1, stride: 1,
      warmup: 150, expand: false, ridge: 100 }),
  });
  const cands = [{ lp: 1, cmr: false }, { lp: 16, cmr: true }];
  const res = await selectConditioning({ rows, truths, groups: GROUP, candidates: cands, build });
  const plainPick = res.table.reduce((a, b) => (b.plain < a.plain ? b : a));
  check('the selector returns a config and a full table', res.best && res.table.length === 2,
    JSON.stringify(res.best));
  check('every candidate scored finite', res.table.every((r) => Number.isFinite(r.worst)),
    JSON.stringify(res.table.map((r) => [r.tag, r.worst])));
  check('scored on the record ALONE, the unfiltered candidate wins',
    plainPick.tag === 'lp1', JSON.stringify(res.table.map((r) => [r.tag, r.plain])));
  check('under the stress sweep the selection changes to conditioning',
    res.best.cmr === true, JSON.stringify(res.table.map((r) => [r.tag, r.worst])));
}

// ---------------------------------------- the conditioner emits nothing while warming
{
  const c = new InputConditioner({ nSignals: NS, groups: GROUP, warmup: 50, lp: 4, cmr: true });
  let firstAt = -1;
  for (let t = 0; t < 60; t++) {
    const out = c.push(Array.from({ length: NS }, (_, i) => signal(t, i)));
    if (out && firstAt < 0) firstAt = t;
  }
  check('nothing is emitted until calibration closes', firstAt === 50, `first at ${firstAt}`);
  check('and it reports what it is doing', c.describe() === 'cmr+lp4', c.describe());
}

// ------------------------------------- the do-nothing control on the reconstructor
{
  const m = new FieldReconstructor({ nSignals: 2, nLocations: 4, lag: 1, stride: 1,
    warmup: 50, expand: false, ridge: 100 });
  for (let t = 0; t < 600; t++) {
    m.push([signal(t, 0), signal(t, 1)]);
    m.observe([signal(t, 0), signal(t, 1), 0.5, signal(t, 2)]);
  }
  m.push([signal(700, 0), signal(700, 1)]);
  const g = m.grade([signal(700, 0), signal(700, 1), 0.5, signal(700, 2)], m.estimate());
  check('grade reports the model, the static map, their ratio and the activity',
    ['model', 'staticMap', 'ratio', 'activity'].every((k) => k in g), JSON.stringify(g));
  check('the static map is a real rival, not a placeholder',
    Number.isFinite(g.staticMap) && g.staticMap > 0, String(g.staticMap));
  check('activity is finite and positive on a moving field',
    Number.isFinite(g.activity) && g.activity > 0, String(g.activity));
  // A STEADY FIELD MUST READ AS STEADY, because that is the case where every score
  // is noise divided by noise and the honest output is "no question was asked".
  const st = new FieldReconstructor({ nSignals: 2, nLocations: 3, lag: 1, stride: 1,
    warmup: 50, expand: false, ridge: 100 });
  for (let t = 0; t < 400; t++) { st.push([signal(t, 0), signal(t, 1)]); st.observe([1, 2, 3]); }
  st.push([signal(400, 0), signal(400, 1)]);
  const gs = st.grade([1, 2, 3], st.estimate());
  check('a constant field reports ~zero activity', gs.activity < 1e-6, String(gs.activity));
}

console.log(failed ? `\n  ${failed} check(s) failed\n` : '  all checks passed\n');
process.exit(failed ? 1 : 0);
