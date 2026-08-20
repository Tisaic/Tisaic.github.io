// IS THE RIDGE ON THE WRONG SIDE OF ZERO?
//
// Ridge solves (X'X + lam I) th = X'y, which is the MAP estimate under noise on
// the RESPONSE with an isotropic prior on the weights. Our noise is on the
// REGRESSORS -- the sensors ARE the inputs -- and that is a different problem with
// a different answer:
//
//   E[xx'] = S0 + Sn        E[xy] = S0 th
//   so least squares returns (S0 + Sn)^-1 S0 th, attenuated toward zero,
//   and the corrected estimator is (Sxx - Sn)^-1 Sxy.
//
// It SUBTRACTS. Ridge adds. So under input noise the regularizer has the opposite
// sign to the correction, and a sweep over positive lam is searching the wrong
// half-line while adding bias in the same direction the noise already bent things.
// A sweep still finds an interior optimum, because lam does buy real variance
// reduction -- which is exactly why the sweep cannot tell you it is the wrong
// estimator.
//
// THE PREDICTION IS QUANTITATIVE, which is what makes this worth running rather
// than asserting. With standardised features and per-channel standardised noise
// variance eta^2, Sn ~ eta^2 I on the perturbed channels, so the optimum should
// sit near lam* = -eta^2. Measured against a shipped ridge of 1/100 spread over
// n samples, i.e. lam ~ 8e-6, indistinguishable from zero at this scale.
//
// Everything is normalised by the sample count (A/n, B/n) so lam is directly
// comparable to a feature variance of 1 and to eta^2.
//
// The online RLS cannot express this: its prior variance is 1/lam, so lam < 0 is
// not a covariance. Hence a batch solve, and hence Gaussian elimination rather
// than Cholesky -- at a negative ridge the matrix is ALLOWED to go indefinite,
// and whether it does is itself one of the findings.
import { dyeStream, fieldNrmse, rng } from './dye-stream.mjs';
import { solve, symEig } from './linalg.mjs';
import { FieldReconstructor } from '../lib/probesense/sensor.js';

const SAMPLES = 1600, WARMUP = 200, TRAIN_END = 1200, Z_CLAMP = 10;
const ETAS = [0, 0.03, 0.1, 0.3];
const f = (v, d = 4) => (Number.isFinite(v) ? +v.toFixed(d) : null);

const S = await dyeStream({ samples: SAMPLES, perWall: 6 });
const CH = [...Array(S.P).keys()], P = S.P, K = S.target.length;
console.log(JSON.stringify({ size: S.size, channels: P, locations: K, samples: SAMPLES }));

/** Noise on the pressure channels only; `mode` sets the correlation. */
function noisy(t, eta, mode, g) {
  const row = CH.map((c) => S.sig[t][c]);
  if (eta > 0) {
    const shared = g();
    for (const i of S.rhoSlots) row[i] += eta * S.std[i] * (mode === 'common' ? shared : g());
  }
  return row;
}

/**
 * Build the standardised design matrix the shipped readout would see: freeze
 * mean and spread on the first WARMUP samples, then divide and clamp at ten
 * deviations, with the same relative floor. Reproduced here rather than pulled
 * out of the class because the batch solve needs the whole matrix at once -- and
 * asserted against the class below, because a reproduction that has drifted is
 * worse than no reproduction.
 */
function design(eta, mode, seed = 7) {
  const g = rng(seed);
  const rows = [];
  for (let t = 0; t < SAMPLES; t++) rows.push(noisy(t, eta, mode, g));
  // Welford, in the SAME ORDER the bank does it, so parity is bit-exact rather
  // than merely close. The first version of this used a two-pass formula and
  // disagreed with the shipped bank by 3e-4 -- which turned out to be the LIBRARY
  // losing digits to `E[x^2] - mean^2` on a density channel, not this file. That
  // defect is fixed; this now has to track it exactly or the check is toothless.
  const mean = new Float64Array(P), m2 = new Float64Array(P), sd = new Float64Array(P);
  let cnt = 0;
  for (let t = 0; t < WARMUP; t++) {
    cnt++;
    for (let i = 0; i < P; i++) {
      const d = rows[t][i] - mean[i];
      mean[i] += d / cnt;
      m2[i] += d * (rows[t][i] - mean[i]);
    }
  }
  for (let i = 0; i < P; i++) sd[i] = Math.sqrt(Math.max(0, m2[i] / cnt));
  const sdMax = Math.max(...sd), floor = sdMax > 0 ? 1e-3 * sdMax : 0;
  const fstd = new Float64Array(P);
  for (let i = 0; i < P; i++) fstd[i] = sd[i] > floor && sd[i] > 1e-30 ? sd[i] : (sdMax || 1);
  const nf = P + 1;
  const Phi = new Float64Array(SAMPLES * nf);
  for (let t = 0; t < SAMPLES; t++) {
    Phi[t * nf] = 1;
    for (let i = 0; i < P; i++) {
      let v = (rows[t][i] - mean[i]) / fstd[i];
      if (!(v > -Z_CLAMP)) v = -Z_CLAMP; else if (!(v < Z_CLAMP)) v = Z_CLAMP;
      Phi[t * nf + i + 1] = v;
    }
  }
  return { Phi, nf };
}

// Parity against the shipped pipeline, on the clean stream. If this fails the
// rest of the file is measuring a different estimator than the one that ships.
{
  const { Phi, nf } = design(0, 'indep');
  const m = new FieldReconstructor({ nSignals: P, nLocations: K, lag: 1, stride: 1,
    warmup: WARMUP, expand: false, ridge: 100, lam: 1.0 });
  let worst = 0, checked = 0;
  for (let t = 0; t < WARMUP + 50; t++) {
    m.push(CH.map((c) => S.sig[t][c]));
    const col = m.bank._column(0);
    if (!col) continue;
    for (let i = 0; i < nf; i++) worst = Math.max(worst, Math.abs(col.m[i] - Phi[t * nf + i]));
    checked++;
  }
  console.log(`design-matrix parity vs the shipped bank: max |diff| ${worst.toExponential(2)} over ${checked} columns`);
  if (!(worst < 1e-12)) { console.error('PARITY FAILED -- not measuring the shipped estimator'); process.exit(1); }
}

// Targets, standardised on the same window, exactly as the readout does.
const tMean = new Float64Array(K), tStd = new Float64Array(K);
for (let t = 0; t < WARMUP; t++) for (let k = 0; k < K; k++) tMean[k] += S.truth[t][k] / WARMUP;
for (let t = 0; t < WARMUP; t++) for (let k = 0; k < K; k++) tStd[k] += (S.truth[t][k] - tMean[k]) ** 2 / WARMUP;
for (let k = 0; k < K; k++) tStd[k] = Math.sqrt(tStd[k]) || 1;

// The shipped ridge, in these units: P0 = 100I is a penalty of 1/100 on the
// un-normalised normal equations, spread over the training samples.
const N_TRAIN = TRAIN_END - WARMUP;
const SHIPPED = 0.01 / N_TRAIN;
const LAMS = [-0.3, -0.1, -0.03, -0.01, -0.003, -0.001, 0, SHIPPED, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1];

console.log(`\nshipped ridge in these units: lam = ${SHIPPED.toExponential(2)} (P0 = 100I over ${N_TRAIN} samples)`);
console.log('PREDICTION, stated before the numbers: with input noise the optimum sits');
console.log('near lam* = -eta^2, i.e. on the NEGATIVE side, and the shipped value is at ~0.\n');

for (const mode of ['indep', 'common']) {
  console.log(`-- noise ${mode}`);
  for (const eta of ETAS) {
    if (eta === 0 && mode === 'common') continue;         // identical to indep at 0
    const { Phi, nf } = design(eta, mode);
    // Normal equations over the training window only.
    const A = new Float64Array(nf * nf), B = new Float64Array(nf * K);
    for (let t = WARMUP; t < TRAIN_END; t++) {
      const o = t * nf;
      for (let i = 0; i < nf; i++) {
        const xi = Phi[o + i];
        if (xi === 0) continue;
        for (let j = i; j < nf; j++) A[i * nf + j] += xi * Phi[o + j];
        for (let k = 0; k < K; k++) B[i * K + k] += xi * (S.truth[t][k] - tMean[k]) / tStd[k];
      }
    }
    for (let i = 0; i < nf; i++) for (let j = i + 1; j < nf; j++) A[j * nf + i] = A[i * nf + j];
    for (let i = 0; i < nf * nf; i++) A[i] /= N_TRAIN;
    for (let i = 0; i < nf * K; i++) B[i] /= N_TRAIN;
    const spec = symEig(A, nf).values;

    const scores = [];
    for (const lam of LAMS) {
      const Al = Float64Array.from(A);
      for (let i = 0; i < nf; i++) Al[i * nf + i] += lam;
      const th = solve(Al, B, nf, K);
      if (!th) { scores.push({ lam, nrmse: null }); continue; }
      let acc = 0, n = 0;
      const est = new Float64Array(K);
      for (let t = TRAIN_END; t < SAMPLES; t++) {
        const o = t * nf;
        for (let k = 0; k < K; k++) {
          let yh = 0;
          for (let i = 0; i < nf; i++) yh += Phi[o + i] * th[i * K + k];
          est[k] = tMean[k] + tStd[k] * yh;
        }
        const e = fieldNrmse(est, S.truth[t]);
        if (Number.isFinite(e)) { acc += e; n++; }
      }
      scores.push({ lam, nrmse: n ? acc / n : null });
    }
    const ok = scores.filter((s) => s.nrmse != null && Number.isFinite(s.nrmse));
    const pickMin = (xs) => (xs.length ? xs.reduce((a, b) => (b.nrmse < a.nrmse ? b : a)) : null);
    const best = pickMin(ok);
    const atShipped = scores.find((s) => s.lam === SHIPPED);
    const bestPos = pickMin(ok.filter((s) => s.lam >= 0));
    const bestNeg = pickMin(ok.filter((s) => s.lam < 0));
    if (!best) { console.log(`   eta ${eta}: every lam singular or non-finite`); continue; }
    console.log(`   eta ${String(eta).padEnd(5)} predicted lam* ${(-eta * eta).toExponential(1)}` +
      `  smallest eigenvalue of A ${spec[nf - 1].toExponential(2)}`);
    console.log('     lam    ' + LAMS.map((l) => (l === SHIPPED ? 'shipped' : String(l)).padStart(9)).join(''));
    console.log('     nRMSE  ' + scores.map((s) => (s.nrmse == null ? 'singular'
      : s.nrmse > 99 ? s.nrmse.toExponential(1) : s.nrmse.toFixed(4)).padStart(9)).join(''));
    console.log(`     best lam ${best.lam} -> ${f(best.nrmse)} | shipped -> ${f(atShipped?.nrmse)}` +
      ` | best of lam>=0 ${bestPos ? bestPos.lam : 'n/a'} -> ${f(bestPos?.nrmse)}` +
      ` | best of lam<0 ${bestNeg ? bestNeg.lam : 'n/a'} -> ${f(bestNeg?.nrmse)}`);
    console.log(`     VERDICT: optimum is on the ${best.lam < 0 ? 'NEGATIVE' : best.lam > 0 ? 'positive' : 'zero'} side` +
      (bestNeg && bestPos ? `; negative beats best-positive by ${f(bestPos.nrmse / bestNeg.nrmse, 3)}x` : ''));
  }
}
