/**
 * @file THE OTHER ADMISSIBLE COMPETITOR — A DIFFERENT FUNCTION CLASS ON IDENTICAL ROWS (plan §54.9).
 *
 * THIS ONE CONTESTS US, NOT A RIVAL. §52.36 closes six directions with one sentence: "the
 * information the COMMANDED REFERENCE carries about the correction is exhausted at R² ~0.84, so a
 * feedforward from it alone is capped near 6-8x on this arm and no basis will move it." Every one
 * of those six experiments — more taps, longer reach at preserved spacing, longer reach by scaling,
 * nonlinear and energy lifts, pose scheduling, a recursive state — added FEATURES to one GLOBAL
 * LINEAR-IN-PARAMETERS RIDGE. A different function class is not more features, and `consist.mjs`
 * says so in its own header: a local model is "the lever that every capacity experiment so far has
 * not actually tested — they all added features to ONE global fit."
 *
 * So the ceiling has never been tested by a method that could break it. This is that test.
 *
 * WHAT IS HELD EQUAL, which is the whole design. The rows and targets are READ FROM `consist.mjs`'s
 * own dump — one builder, not a second copy (rule 61) — so every learner sees the identical
 * 93-feature reference window, the identical converged targets, and the identical program split.
 * Only the function class moves:
 *
 *   RIDGE        the shipped fit: one global linear map. The number to beat.
 *   kNN          the crudest local model there is. If capacity were the ceiling this would lose
 *                badly to everything; it is here because a cheap falsifier runs first (rule 1).
 *   LWR          locally weighted linear regression — a linear map whose WEIGHTS are chosen by
 *                where the row sits. This is `consist.mjs`'s named lever, exactly.
 *   RBF ridge    kernel ridge with a Gaussian kernel: a genuinely nonlinear global fit, and the
 *                closest thing here to "what a GP would do".
 *   MLP          one hidden layer, tanh, plain gradient descent. The modern default.
 *
 * SCORED LEAVE-ONE-PROGRAM-OUT, which is the only split that means anything here: fit on all but
 * one program, predict the one held out. A same-program split would let the window key lap phase,
 * which is §52.34's conflict (1) and the reason `consist.mjs`'s own control could not support its
 * conclusion. Every learner gets the same folds.
 *
 * AND EVERY LEARNER GETS ITS OWN SWEEP while the ridge runs at the shipped value — the asymmetry
 * `noilc-arm.mjs` established. If a function class wins anywhere in its own hyperparameters it
 * wins the comparison.
 *
 * EITHER OUTCOME IS A RESULT, stated before running:
 *   nothing beats ~0.84  -> the ceiling is CONFIRMED by methods that could have broken it, which
 *                           is a far stronger statement than six linear variants, and the input is
 *                           genuinely exhausted.
 *   something beats it   -> this project has been denying headroom it has, and the deployed object
 *                           is leaving performance on the table for want of a function class.
 *
 * Run: node test/pilot/nonlinear.mjs ROWS=<dump from `DUMP=... node test/pilot/consist.mjs`>
 */
import { readFileSync } from 'node:fs';

const ROWS = process.env.ROWS;
if (!ROWS) { console.log('\nnonlinear: need ROWS=<path>; produce it with DUMP=<path> node test/pilot/consist.mjs\n'); process.exit(0); }
const raw = JSON.parse(readFileSync(ROWS, 'utf8'));
const D = raw.D, sets = raw.sets, NC = sets[0].Y[0].length;

console.log('\nnonlinear: can a different FUNCTION CLASS beat the shipped ridge on identical rows?\n');
console.log(`    ${sets.length} programs, ${sets.reduce((a, s) => a + s.X.length, 0)} rows, ${D} features, ${NC} channels`);
console.log(`    ${sets.map((s) => `${s.name} ${s.X.length}`).join(', ')}\n`);

// ---------------------------------------------------------------- shared
/** Standardise on the TRAINING rows only — standardising on the pooled set leaks the held-out
 *  program's distribution into the fit, which is the subtlest way to make a transfer score flatter
 *  itself (rule 36's family). */
function standardiser(X) {
  const mu = new Float64Array(D), sd = new Float64Array(D);
  for (const x of X) for (let j = 0; j < D; j++) mu[j] += x[j];
  for (let j = 0; j < D; j++) mu[j] /= X.length;
  for (const x of X) for (let j = 0; j < D; j++) sd[j] += (x[j] - mu[j]) ** 2;
  for (let j = 0; j < D; j++) sd[j] = Math.sqrt(sd[j] / X.length) || 1;
  return (x) => { const o = new Float64Array(D); for (let j = 0; j < D; j++) o[j] = (x[j] - mu[j]) / sd[j]; return o; };
}
/** R² against the held-out program's own mean — the null a fit must beat to be worth anything. */
function r2(Y, P) {
  const out = [];
  for (let c = 0; c < NC; c++) {
    let m = 0; for (const y of Y) m += y[c]; m /= Y.length;
    let ss = 0, st = 0;
    for (let i = 0; i < Y.length; i++) { ss += (Y[i][c] - P[i][c]) ** 2; st += (Y[i][c] - m) ** 2; }
    out.push(st > 0 ? 1 - ss / st : 0);
  }
  return out;
}
function chol(A, n) {
  for (let j = 0; j < n; j++) {
    let d = A[j * n + j];
    for (let k = 0; k < j; k++) d -= A[j * n + k] ** 2;
    if (d <= 1e-300) return false;
    A[j * n + j] = Math.sqrt(d);
    for (let i = j + 1; i < n; i++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= A[i * n + k] * A[j * n + k];
      A[i * n + j] = s / A[j * n + j];
    }
  }
  return true;
}
function cholSolve(L, n, b) {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * x[k]; x[i] = s / L[i * n + i]; }
  for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}
/** Ridge with a bias column appended. Returns predict(z). */
function ridgeFit(Z, Y, lam) {
  const n = D + 1, A = new Float64Array(n * n), B = [];
  for (let c = 0; c < NC; c++) B.push(new Float64Array(n));
  for (let i = 0; i < Z.length; i++) {
    const z = Z[i];
    for (let a = 0; a < n; a++) {
      const va = a === D ? 1 : z[a];
      if (va === 0) continue;
      for (let b = 0; b <= a; b++) A[a * n + b] += va * (b === D ? 1 : z[b]);
      for (let c = 0; c < NC; c++) B[c][a] += va * Y[i][c];
    }
  }
  let tr = 0; for (let a = 0; a < n; a++) tr += A[a * n + a];
  const r = lam * tr / n;
  for (let a = 0; a < n; a++) A[a * n + a] += r;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) A[a * n + b] = A[b * n + a];
  if (!chol(A, n)) return null;
  const W = B.map((b) => cholSolve(A, n, b));
  return (z) => W.map((w) => { let s = w[D]; for (let j = 0; j < D; j++) s += w[j] * z[j]; return s; });
}

const d2 = (a, b) => { let t = 0; for (let j = 0; j < D; j++) { const d = a[j] - b[j]; t += d * d; } return t; };

// ---------------------------------------------------------------- the learners
const LEARNERS = {
  // THE SHIPPED FIT. One global linear map, at the ridge the library uses.
  ridge: { sweep: [1e-4, 1e-3, 1e-2], fit: (Z, Y, h) => ridgeFit(Z, Y, h) },

  // THE CHEAPEST LOCAL MODEL. Runs first because a cheap falsifier runs first (rule 1).
  knn: {
    sweep: [4, 8, 16, 32, 64],
    fit: (Z, Y, k) => (z) => {
      const idx = Z.map((zi, i) => [d2(z, zi), i]).sort((a, b) => a[0] - b[0]).slice(0, k);
      const o = new Array(NC).fill(0);
      let wsum = 0;
      for (const [dd, i] of idx) { const w = 1 / (1e-9 + Math.sqrt(dd)); wsum += w; for (let c = 0; c < NC; c++) o[c] += w * Y[i][c]; }
      return o.map((v) => v / wsum);
    },
  },

  // `consist.mjs`'s OWN NAMED LEVER: a linear map whose weights are chosen by where the row sits.
  // Ridged hard, because a local fit on D=93 features from a few dozen neighbours is exactly the
  // regime where an unregularised solve reads beautifully in sample and transfers to nothing.
  lwr: {
    sweep: [0.5, 1.0, 2.0, 4.0],
    fit: (Z, Y, bw) => (z) => {
      // Gaussian weights on a bandwidth measured in units of the MEDIAN neighbour distance, so the
      // knob means the same thing whatever the row count — a bandwidth "small in the abstract" is
      // rule 32's error.
      const ds = Z.map((zi) => Math.sqrt(d2(z, zi)));
      const med = [...ds].sort((a, b) => a - b)[Math.floor(ds.length / 2)] || 1;
      const h = bw * med;
      const n = D + 1, A = new Float64Array(n * n), B = [];
      for (let c = 0; c < NC; c++) B.push(new Float64Array(n));
      for (let i = 0; i < Z.length; i++) {
        const w = Math.exp(-0.5 * (ds[i] / h) ** 2);
        if (w < 1e-6) continue;
        const zi = Z[i];
        for (let a = 0; a < n; a++) {
          const va = (a === D ? 1 : zi[a]) * w;
          if (va === 0) continue;
          for (let b = 0; b <= a; b++) A[a * n + b] += va * (b === D ? 1 : zi[b]);
          for (let c = 0; c < NC; c++) B[c][a] += va * Y[i][c];
        }
      }
      let tr = 0; for (let a = 0; a < n; a++) tr += A[a * n + a];
      const r = 1e-2 * tr / n;
      for (let a = 0; a < n; a++) A[a * n + a] += r;
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) A[a * n + b] = A[b * n + a];
      if (!chol(A, n)) return new Array(NC).fill(0);
      return B.map((b) => { const w = cholSolve(A, n, b); let s = w[D]; for (let j = 0; j < D; j++) s += w[j] * z[j]; return s; });
    },
  },

  // A GENUINELY NONLINEAR GLOBAL FIT — kernel ridge with a Gaussian kernel, which is what a GP's
  // posterior mean is. Unlike kNN and LWR this is not a local LINEAR model wearing a different hat:
  // it can represent curvature the ridge cannot express at any feature count, which is the whole
  // point of putting it here.
  rbf: {
    sweep: [0.5, 1, 2, 4],
    fit: (Z, Y, bw) => {
      const n = Z.length;
      // Bandwidth in units of the MEDIAN pairwise distance, so the knob means the same thing
      // whatever the row count or feature scale (rule 32).
      const samp = [];
      for (let i = 0; i < n; i += 7) for (let j = i + 1; j < n; j += 11) samp.push(Math.sqrt(d2(Z[i], Z[j])));
      samp.sort((a, b) => a - b);
      const h = bw * (samp[Math.floor(samp.length / 2)] || 1), h2 = 2 * h * h;
      const K = new Float64Array(n * n);
      for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
        const v = Math.exp(-d2(Z[i], Z[j]) / h2);
        K[i * n + j] = v; K[j * n + i] = v;
      }
      let tr = 0; for (let i = 0; i < n; i++) tr += K[i * n + i];
      for (let i = 0; i < n; i++) K[i * n + i] += 1e-3 * tr / n;
      if (!chol(K, n)) return null;
      const al = [];
      for (let c = 0; c < NC; c++) { const b = new Float64Array(n); for (let i = 0; i < n; i++) b[i] = Y[i][c]; al.push(cholSolve(K, n, b)); }
      return (z) => {
        const kv = new Float64Array(n);
        for (let i = 0; i < n; i++) kv[i] = Math.exp(-d2(z, Z[i]) / h2);
        return al.map((a) => { let s = 0; for (let i = 0; i < n; i++) s += a[i] * kv[i]; return s; });
      };
    },
  },

  // THE MODERN DEFAULT. One hidden layer, tanh, Adam. Not because a bigger net would be wrong, but
  // because if 92 inputs and a few dozen hidden units cannot beat a linear map on 700 rows, neither
  // will a larger one — the binding constraint here is rows and transfer, not capacity, which is
  // this arc's finding eight times over.
  mlp: {
    sweep: [8, 24, 64],
    fit: (Z, Y, H) => {
      let sd = 1234567 >>> 0;
      const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296 - 0.5; };
      const W1 = new Float64Array(H * D), b1 = new Float64Array(H);
      const W2 = new Float64Array(NC * H), b2 = new Float64Array(NC);
      const sc = 1 / Math.sqrt(D);
      for (let i = 0; i < W1.length; i++) W1[i] = 2 * rnd() * sc;
      for (let i = 0; i < W2.length; i++) W2[i] = 2 * rnd() / Math.sqrt(H);
      // Targets standardised so one channel cannot dominate the loss by its units alone (rule 32).
      const ym = new Float64Array(NC), ys = new Float64Array(NC);
      for (let c = 0; c < NC; c++) { for (const y of Y) ym[c] += y[c]; ym[c] /= Y.length; }
      for (let c = 0; c < NC; c++) { for (const y of Y) ys[c] += (y[c] - ym[c]) ** 2; ys[c] = Math.sqrt(ys[c] / Y.length) || 1; }
      const n = Z.length, LR = 3e-3, EP = 400;
      const mW1 = new Float64Array(W1.length), vW1 = new Float64Array(W1.length);
      const mW2 = new Float64Array(W2.length), vW2 = new Float64Array(W2.length);
      const mb1 = new Float64Array(H), vb1 = new Float64Array(H);
      const mb2 = new Float64Array(NC), vb2 = new Float64Array(NC);
      const hid = new Float64Array(H), gh = new Float64Array(H);
      let t = 0;
      const adam = (W, g, m, v, i) => {
        m[i] = 0.9 * m[i] + 0.1 * g; v[i] = 0.999 * v[i] + 0.001 * g * g;
        W[i] -= LR * (m[i] / (1 - Math.pow(0.9, t))) / (Math.sqrt(v[i] / (1 - Math.pow(0.999, t))) + 1e-8);
      };
      for (let ep = 0; ep < EP; ep++) {
        t++;
        const gW1 = new Float64Array(W1.length), gb1 = new Float64Array(H);
        const gW2 = new Float64Array(W2.length), gb2 = new Float64Array(NC);
        for (let i = 0; i < n; i++) {
          const z = Z[i];
          for (let k = 0; k < H; k++) { let a = b1[k]; const off = k * D; for (let j = 0; j < D; j++) a += W1[off + j] * z[j]; hid[k] = Math.tanh(a); }
          gh.fill(0);
          for (let c = 0; c < NC; c++) {
            let o = b2[c]; const off = c * H;
            for (let k = 0; k < H; k++) o += W2[off + k] * hid[k];
            const e = o - (Y[i][c] - ym[c]) / ys[c];
            gb2[c] += e / n;
            for (let k = 0; k < H; k++) { gW2[off + k] += e * hid[k] / n; gh[k] += e * W2[off + k]; }
          }
          for (let k = 0; k < H; k++) {
            const d = gh[k] * (1 - hid[k] * hid[k]) / n, off = k * D;
            gb1[k] += d;
            for (let j = 0; j < D; j++) gW1[off + j] += d * z[j];
          }
        }
        for (let i = 0; i < W1.length; i++) adam(W1, gW1[i], mW1, vW1, i);
        for (let i = 0; i < H; i++) adam(b1, gb1[i], mb1, vb1, i);
        for (let i = 0; i < W2.length; i++) adam(W2, gW2[i], mW2, vW2, i);
        for (let i = 0; i < NC; i++) adam(b2, gb2[i], mb2, vb2, i);
      }
      return (z) => {
        for (let k = 0; k < H; k++) { let a = b1[k]; const off = k * D; for (let j = 0; j < D; j++) a += W1[off + j] * z[j]; hid[k] = Math.tanh(a); }
        const o = [];
        for (let c = 0; c < NC; c++) { let v = b2[c]; const off = c * H; for (let k = 0; k < H; k++) v += W2[off + k] * hid[k]; o.push(v * ys[c] + ym[c]); }
        return o;
      };
    },
  },
};

// ---------------------------------------------------------------- leave one program out
function loo(name, L, h) {
  const per = [];
  for (let hi = 0; hi < sets.length; hi++) {
    const trX = [], trY = [];
    for (let i = 0; i < sets.length; i++) if (i !== hi) { trX.push(...sets[i].X); trY.push(...sets[i].Y); }
    const zf = standardiser(trX);
    const Z = trX.map(zf);
    const pred = L.fit(Z, trY, h);
    if (!pred) return null;
    const P = sets[hi].X.map((x) => pred(zf(x)));
    per.push(r2(sets[hi].Y, P));
  }
  // The MEAN over folds and channels, and the WORST fold beside it — a method that is excellent on
  // three programs and negative on the fourth has not transferred (rule 27).
  const flat = per.flat();
  return { mean: flat.reduce((a, b) => a + b, 0) / flat.length, worst: Math.min(...flat), per };
}

console.log('  leave-one-program-out R², each learner swept over its OWN knob:\n');
console.log('  learner   knob        mean R²    worst fold');
const best = {};
for (const [name, L] of Object.entries(LEARNERS)) {
  for (const h of L.sweep) {
    const t0 = Date.now();
    const r = loo(name, L, h);
    if (!r) { console.log(`  ${name.padEnd(9)} ${String(h).padEnd(11)} (singular)`); continue; }
    console.log(`  ${name.padEnd(9)} ${String(h).padEnd(11)} ${r.mean.toFixed(4).padStart(8)}    ${r.worst.toFixed(4).padStart(8)}   ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    if (!best[name] || r.mean > best[name].mean) best[name] = { ...r, h };
  }
}

console.log('\n  THE CLAIM UNDER TEST — §52.36: "exhausted at R² ~0.84 ... no basis will move it"\n');
const rid = best.ridge;
for (const [name, b] of Object.entries(best)) {
  const d = b.mean - rid.mean;
  console.log(`    ${name.padEnd(9)} best ${b.mean.toFixed(4)} at ${b.h}`
    + `   ${name === 'ridge' ? '(the shipped fit)' : (d > 0.01 ? `BEATS the ridge by ${d.toFixed(4)}` : d < -0.01 ? `loses by ${(-d).toFixed(4)}` : 'level with the ridge')}`);
}
const winner = Object.entries(best).filter(([n]) => n !== 'ridge').sort((a, b) => b[1].mean - a[1].mean)[0];
console.log(winner && winner[1].mean > rid.mean + 0.01
  ? `\n    => A DIFFERENT FUNCTION CLASS BEATS THE SHIPPED RIDGE (${winner[0]}, +${(winner[1].mean - rid.mean).toFixed(4)}).\n`
    + '       §52.36\'s ceiling was a property of the FORM, not of the input, and the deployed\n'
    + '       object is leaving performance on the table.'
  : '\n    => NO function class beats the shipped ridge on these rows. The ceiling is CONFIRMED by\n'
    + '       methods that could have broken it — a local model, a kernel and a crude nearest\n'
    + '       neighbour — which is a far stronger statement than six linear-feature variants.');
console.log('\n  (offline regression only: a held-out R² is not a delivered ratio, and a win here would\n'
  + '   still have to be deployed and scored on the machine before it meant anything.)\n');
