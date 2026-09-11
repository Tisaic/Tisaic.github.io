/**
 * @file THE CLASSICAL ADMISSIBLE COMPETITOR: ZPETC / STABLE INVERSION ON THE EMPS AXIS (plan §54.10).
 *
 * THIS IS THE RIVAL THIS PROJECT HAS BEEN CALLING ITSELF A VERSION OF, WITHOUT EVER RUNNING IT.
 * CLAUDE.md places the distilled policy in the literature like this: "non-causal feedforward
 * inversion is ZPETC and stable inversion, which DERIVE that inverse from an LTI model, and what is
 * here is one REGRESSED from data on a plant whose inverse is pose-dependent and nonlinear." That
 * is a comparison stated and never measured, and on the EMPS axis — a near-LTI single axis — it is
 * the comparison most likely to go against us. Which is exactly why it is the one to run.
 *
 * IT IS ADMISSIBLE, on §54.8b's test, and that is the point: the model is identified ONCE at
 * commissioning, the inverse is computed offline, and what deploys is a FIR filter over the
 * COMMANDED REFERENCE — no runtime truth, no lap index, transfers to any trajectory by
 * construction, and cheap. It is the same product shape as ours with a different way of getting the
 * coefficients: derived from an identified model where ours are regressed from a converged
 * correction.
 *
 * WHAT ZPETC IS. Given a discrete plant B(z)/A(z) with zeros that cannot be inverted (outside the
 * unit circle, which a sampled mechanical axis almost always has), factor B = B⁺·B⁻ into
 * invertible and uninvertible parts. The exact inverse is unstable; ZPETC (Tomizuka 1987) instead
 * uses A(z)·B⁻(z⁻¹) / (B⁺(z)·B⁻(1)²) applied with a preview of d + deg(B⁻) steps. The uninvertible
 * factor is REFLECTED rather than inverted, which cancels the phase exactly and leaves a gain error
 * that is small over the bandwidth that matters. It is non-causal — it needs the reference ahead of
 * now — which is the same structural requirement §49.14 measured for our own window (0.89x causal
 * against 1.43x straddling).
 *
 * HELD EQUAL: the same machine, the same programs, the same authority `UM`, and an identification
 * budget no larger than the shipped route's own commissioning. The rival's order and its
 * identification ridge are SWEPT; ours runs at its defaults.
 *
 * THE COLUMN THAT MATTERS IS THE SAME ONE: a two-tone sine the axis has never run, where a lap
 * table reads 0.53x and the distilled policy 33.15x. ZPETC is a function of the reference, so
 * unlike a lap table it has every structural reason to transfer — and if it does, this project's
 * nearest classical relative is also its most serious competitor.
 *
 * AND THE FIRST IMPLEMENTATION WAS WRONG IN A WAY WORTH RECORDING, because it is the mistake this
 * architecture invites. ZPETC textbook form inverts the REFERENCE-TO-OUTPUT path and commands
 * u = P⁻¹·r. Here the plant already tracks its own reference through a closed position loop, and
 * what a rung ADDS is a correction on top of it — so there are TWO paths, not one: `Gr` from the
 * commanded reference to the tracking error the program leaves, and `Gu` from an added correction
 * to its effect on that error. The feedforward is the COMPOSITION, u = -Gu⁻¹·Gr·r, and inverting
 * `Gu` alone and applying it to `r` — which is what the first version did — is dimensionally the
 * wrong signal. It read 0.02x with the correction pinned at its cap and an error of 2.000e+1 mm
 * repeated to four figures across unrelated model orders, which is a saturated machine and not a
 * plant measurement (rule 17: the instrument fails before the model).
 *
 * AND THE SECOND FAULT WAS THE ONE THAT HELD IT UP, IT IS FIXED, AND THE RIVAL NOW MEASURES
 * SOMETHING (plan §56). This file used to say its numbers were withheld because it read either
 * 0.02x with the correction pinned at its cap or 1.00-1.02x with the correction inert, and named
 * the live candidate as a z vs z⁻¹ convention error. That is exactly what it was, and it sat in
 * `polyFromRoots`, which accumulated ASCENDING powers where `roots` consumes DESCENDING — see the
 * note there. Reading one for the other REFLECTS the polynomial and maps every root r to 1/r, so
 * the two diagnostics contradicted each other in a way the delivered ratio could never show: the
 * root finder reported every zero INSIDE the circle at 0.22-0.93 while the long division on the
 * same polynomial ran to 1e+263. A ROUND TRIP with no plant in it — factor and multiply back —
 * reproduces the original to 1e-16 reversed and misses it by 29-95% as-is, and that check now runs
 * on every invocation, because an ordering error is invisible in everything else this file prints.
 *
 * WHAT IT MEASURES, FIXED. The machine moves for the first time, and the number survives the two
 * controls this project requires of a rival:
 *
 *     program 4.8849e-1 -> 1.9921e-1 mm   2.45x       (na 4, ridge 1e-8)
 *     held-out sine  3.2430e-1 -> 9.8764e-2   3.28x
 *     against the DISTILLED policy's 32.75x and 33.15x on the same two columns.
 *
 *   - IT DOES NOT RUN AWAY WITH ITS OWN GRID, which is the control that disqualified DeePC
 *     (§54.8: each earlier best sat on its own grid EDGE). Widening the ridge sweep four decades
 *     BELOW the old edge (to 1e-14) and lifting the FIR truncation 400 -> 2000 leaves the best
 *     cell where it was. Very low ridge is catastrophic rather than better: 0.03x, CAPPED.
 *   - IT REPRODUCES ACROSS DRAWS: 2.45x / 2.18x / 2.36x / 2.28x over four identification seeds
 *     at na 4, and a second stable cell at na 5, ridge 3e-8 reads 2.35x / 2.23x / 2.34x / 2.27x.
 *
 * AND THE NOISE FALSIFIER FIRES, WHICH IS THE HALF THAT PRICES IT. At the rig's OWN stated 1.6 µm
 * instrument fidelity applied to the identification data, EVERY cell reads 0.06x-0.27x — worse
 * than doing nothing, and mostly pinned at the authority cap. The mechanism is in the table rather
 * than argued: R²(Gu) falls only 1.000 -> 0.95 while R²(Gr) COLLAPSES 1.000 -> 0.029, and a
 * composed feedforward is only as good as the worse of its two models. Both routes need truth at
 * COMMISSIONING and neither needs it at runtime, so this is a fair axis to compare on — but the
 * comparison is suggestive rather than matched, because §50.1's ~2x tracker-noise cost for our own
 * route was measured on the ARM and against a different quantity.
 *
 * WHAT IS HONESTLY NOT ZPETC HERE, STATED BECAUSE THE NAME OVERSELLS IT: `out` — the count of
 * zeros outside the unit circle — is ZERO in every row that delivers, so Tomizuka's REFLECTION
 * never engages and the preview it buys is 1 step. On this axis at usable ridge the identified
 * correction-to-error path is minimum phase, so stable inversion degenerates to EXACT inversion,
 * and what caps it at 2-3x is the sensitivity of that inversion rather than the reflection's gain
 * error. Every model in the sweep fits at R² 1.000 and they deliver 0.03x to 2.45x: a model can be
 * exact in prediction and still be a bad thing to invert, which is the whole reason the shipped
 * route regresses the correction instead of inverting a model.
 *
 * Run: SUITE=full node test/pilot/zpetc.mjs  [ORDERS=2,3,4,6] [RIDGES=…] [NOISE=<mm>] [NT=] [SEED=]
 */
import { P, PR, makeMachine } from './emps-rig.mjs';
import { tone, rates } from './distil-emps.mjs';

// FULL TIER ONLY as a script — but `process.exit` here would kill an IMPORTING process too, and
// this module is importable so a probe can drive its functions instead of copying them (rule 61).
if (process.env.SUITE !== 'full' && !process.env.ZPETC_LIB) { console.log('\nzpetc: SKIPPED (full tier only)\n'); process.exit(0); }

const UM = 0.02;
const ORDERS = (process.env.ORDERS || '2,3,4,6').split(',').map(Number);
const NOISE = +(process.env.NOISE || 0);
const TDATA = +(process.env.TDATA || 4000);
const SEED = +(process.env.SEED || 0);   // the identification draw; a rugged surface makes it matter

// ---------------------------------------------------------------- identification
/**
 * ARX identification of the CORRECTION-TO-ERROR path — the same path every rung here inverts, and
 * the same excitation shape the pilot's own probe uses: a bounded, HELD pseudo-random correction on
 * top of the program (rule 33 — an unshaped, held probe, because a white command is tracked
 * straight through and excites nothing).
 */
function arx(u, y, na, nb, ridge) {
  const T = u.length, nP = na + nb, st = Math.max(na, nb) + 1;
  const A = new Float64Array(nP * nP), B = new Float64Array(nP), row = new Float64Array(nP);
  for (let k = st; k < T; k++) {
    for (let i = 0; i < na; i++) row[i] = -y[k - 1 - i];
    for (let i = 0; i < nb; i++) row[na + i] = u[k - 1 - i];
    for (let a = 0; a < nP; a++) { for (let b = 0; b <= a; b++) A[a * nP + b] += row[a] * row[b]; B[a] += row[a] * y[k]; }
  }
  let tr = 0; for (let a = 0; a < nP; a++) tr += A[a * nP + a];
  for (let a = 0; a < nP; a++) A[a * nP + a] += ridge * tr / nP;
  for (let a = 0; a < nP; a++) for (let b = a + 1; b < nP; b++) A[a * nP + b] = A[b * nP + a];
  const M = Array.from({ length: nP }, (_, i) => [...A.slice(i * nP, i * nP + nP), B[i]]);
  for (let c = 0; c < nP; c++) {
    let p = c; for (let r = c + 1; r < nP; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-300) return null;
    for (let r = 0; r < nP; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= nP; j++) M[r][j] -= f * M[c][j]; }
  }
  const th = M.map((r, i) => r[nP] / M[i][i]);
  return { a: th.slice(0, na), b: th.slice(na) };
}

/** The FIR of an ARX model, truncated — used to compose Gr into the deployed filter. */
function arxFir(md, NT) {
  const g = new Float64Array(NT);
  for (let n = 0; n < NT; n++) {
    let s = n >= 1 && n - 1 < md.b.length ? md.b[n - 1] : 0;
    for (let i = 0; i < md.a.length && i < n; i++) s -= md.a[i] * g[n - 1 - i];
    g[n] = s;
  }
  return g;
}

function identify(na, nb, ridge) {
  const m = makeMachine(PR.q[0], 0);
  let s = (12345 + 7919 * SEED) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
  let ns = (777 + 104729 * SEED) >>> 0;
  const nz = () => { ns = (ns * 1103515245 + 12345) >>> 0; return (ns / 4294967296 - 0.5) * 3.464; };
  for (let k = 0; k < 3 * P; k++) m.step(PR.q[k % P]);
  const u = new Float64Array(TDATA), y = new Float64Array(TDATA);
  let hold = 0, cur = 0;
  for (let k = 0; k < TDATA; k++) {
    if (hold-- <= 0) { cur = 2 * UM * rnd(); hold = 6 + Math.floor(12 * (rnd() + 0.5)); }
    m.step(PR.q[k % P] + cur);
    u[k] = cur; y[k] = m.q - PR.q[k % P] + NOISE * nz();
  }
  // Gu: the added correction to its effect on the tracking error.
  const Gu = arx(u, y, na, nb, ridge);

  // Gr: the COMMANDED REFERENCE to the error the program leaves, identified with NO correction on
  // a rich multi-tone reference — the program alone is one trajectory and would identify a filter
  // that only describes it (rule 36's family). This is the path the first version omitted.
  const m2 = makeMachine(PR.q[0], 0);
  const rr = new Float64Array(TDATA), ee = new Float64Array(TDATA);
  const mix = tone(1600, 2, 5, 0.8, rates(PR.q).v);
  for (let k = 0; k < 2000; k++) m2.step(mix[k % 1600]);
  for (let k = 0; k < TDATA; k++) {
    const r = mix[k % 1600];
    m2.step(r);
    rr[k] = r; ee[k] = m2.q - r + NOISE * nz();
  }
  const Gr = arx(rr, ee, na, nb, ridge);
  if (!Gu || !Gr) return null;
  // HOW WELL EACH PATH IS IDENTIFIED, one-step-ahead R². A composed feedforward is only as good as
  // the WORSE of its two models, and reporting the delivered ratio without these two numbers would
  // leave "the method cannot help here" and "one of my models is wrong" indistinguishable.
  const fit = (uu, yy, md) => {
    const na2 = md.a.length, nb2 = md.b.length, st = Math.max(na2, nb2) + 1;
    let ss = 0, st2 = 0, mean = 0, n = 0;
    for (let k = st; k < yy.length; k++) { mean += yy[k]; n++; }
    mean /= n;
    for (let k = st; k < yy.length; k++) {
      let p = 0;
      for (let i = 0; i < na2; i++) p -= md.a[i] * yy[k - 1 - i];
      for (let i = 0; i < nb2; i++) p += md.b[i] * uu[k - 1 - i];
      ss += (yy[k] - p) ** 2; st2 += (yy[k] - mean) ** 2;
    }
    return st2 > 0 ? 1 - ss / st2 : 0;
  };
  return { ...Gu, Gu, Gr, r2u: fit(u, y, Gu), r2r: fit(rr, ee, Gr) };
}

// ---------------------------------------------------------------- roots, and the ZPETC split
/** Roots of a real polynomial by Durand-Kerner — enough for the handful of zeros here. */
function roots(c) {
  const n = c.length - 1;
  if (n < 1) return [];
  const a = c.map((v) => v / c[0]);
  let z = Array.from({ length: n }, (_, i) => ({ re: Math.cos(2 * Math.PI * i / n + 0.4) * 0.9, im: Math.sin(2 * Math.PI * i / n + 0.4) * 0.9 }));
  const evalp = (x) => { let r = { re: 1, im: 0 }; for (let i = 1; i <= n; i++) r = { re: r.re * x.re - r.im * x.im + a[i], im: r.re * x.im + r.im * x.re }; return r; };
  for (let it = 0; it < 500; it++) {
    for (let i = 0; i < n; i++) {
      let num = evalp(z[i]), den = { re: 1, im: 0 };
      for (let j = 0; j < n; j++) if (j !== i) {
        const dr = z[i].re - z[j].re, di = z[i].im - z[j].im;
        den = { re: den.re * dr - den.im * di, im: den.re * di + den.im * dr };
      }
      const d2 = den.re * den.re + den.im * den.im || 1e-300;
      z[i] = { re: z[i].re - (num.re * den.re + num.im * den.im) / d2, im: z[i].im - (num.im * den.re - num.re * den.im) / d2 };
    }
  }
  return z;
}
/**
 * Multiply roots back into coefficients — and the `.reverse()` on the last line is THE BUG THIS
 * FILE WAS STUCK ON (plan §54.10, §56).
 *
 * The accumulator builds ASCENDING powers (prepending a zero is a multiply by x in that order),
 * while `roots` above consumes DESCENDING powers and every other array here — `A1`, `bb`, `num`,
 * and the long division's divisor — is ascending in z⁻¹. Reading one array in the other order
 * REFLECTS the polynomial, which maps every root r to 1/r. That is why the file's two diagnostics
 * disagreed: the root finder reported all zeros INSIDE the unit circle at 0.22-0.93, and the long
 * division on the very same polynomial exploded to 1e+263, because it was dividing by poles at
 * 1/0.22. Neither number was wrong about what it computed; they were computing different
 * polynomials.
 *
 * It is checked by a ROUND TRIP with no plant in it — coefficients to roots and back — which
 * reproduces the original to 1e-16 reversed and misses it by 29-95% as-is, on four polynomials
 * with roots inside and outside the circle. `zpetcRoundTrip()` below is that check, run every
 * time, because an ordering error is invisible in every other output this file prints.
 */
const polyFromRoots = (rs) => {
  let c = [{ re: 1, im: 0 }];
  for (const r of rs) {
    const nx = [{ re: 0, im: 0 }, ...c.map((v) => ({ ...v }))];
    for (let i = 0; i < c.length; i++) { nx[i].re -= c[i].re * r.re - c[i].im * r.im; nx[i].im -= c[i].re * r.im + c[i].im * r.re; }
    c = nx;
  }
  return c.map((v) => v.re).reverse();
};

/** The ordering control, asserted rather than trusted: factor and multiply back, no plant. */
function zpetcRoundTrip() {
  const cs = [[1, -0.9, 0.2], [1, 0.3, -0.4, 0.05], [2, -1.1, 0.15], [1, -1.5, 0.56]];
  let worst = 0;
  for (const c of cs) {
    const back = polyFromRoots(roots(c)).map((v) => v * c[0]);
    const sc = Math.max(...c.map(Math.abs), ...back.map(Math.abs)) || 1;
    worst = Math.max(worst, ...c.map((v, i) => Math.abs(v - back[i]) / sc));
  }
  return worst;
}

/**
 * THE ZPETC FEEDFORWARD AS AN FIR OVER THE REFERENCE. u[k] = sum_j g[j] * r[k + LEAD - j], built
 * once from the identified model. What deploys is `g` and nothing else — which is the same shape
 * as the distilled policy's weight vector, and the reason this rival is admissible at all.
 */
function zpetc(model) {
  const { a, b } = model.Gu;
  // B(z) = b1 z^-1 + ... ; strip leading zeros to find the delay d.
  // THE DELAY THRESHOLD MUST BE RELATIVE TO THE COEFFICIENTS IT ACTS ON (rule 32). An ABSOLUTE
  // 1e-12 left a leading b0 of order 1e-9 in place, so `Bp[0]` was ~1e-9 and the long division
  // `g[n] = s / Bp[0]` exploded — which then read as an unstable inverse with the root finder
  // reporting NO zeros outside the unit circle, i.e. two diagnostics disagreeing because one of
  // them was a scale error and not a plant property.
  const bmax = Math.max(...b.map(Math.abs)) || 1;
  let d = 0; while (d < b.length && Math.abs(b[d]) < 1e-6 * bmax) d++;
  if (d >= b.length) return null;
  const bb = b.slice(d);
  const rs = roots(bb);
  const inn = rs.filter((r) => Math.hypot(r.re, r.im) < 1);          // invertible
  const out = rs.filter((r) => Math.hypot(r.re, r.im) >= 1);          // must be reflected
  const Bp = polyFromRoots(inn).map((v) => v * bb[0]);
  const Bm = polyFromRoots(out);
  const bm1 = Bm.reduce((s, v) => s + v, 0);                          // B⁻(1)
  if (!isFinite(bm1) || Math.abs(bm1) < 1e-12) return null;
  const A1 = [1, ...a];
  // numerator  A(z) * B⁻(z⁻¹)  — the REFLECTION, which is what cancels the phase exactly
  const num = new Float64Array(A1.length + Bm.length - 1);
  for (let i = 0; i < A1.length; i++) for (let j = 0; j < Bm.length; j++) num[i + j] += A1[i] * Bm[Bm.length - 1 - j];
  const scale = 1 / (bm1 * bm1);
  // Long-divide num/Bp into an FIR of bounded length — Bp is stable by construction so it decays.
  const NT = +(process.env.NT || 400);
  const g = new Float64Array(NT);
  for (let n = 0; n < NT; n++) {
    let s = n < num.length ? num[n] * scale : 0;
    for (let i = 1; i < Bp.length && i <= n; i++) s -= Bp[i] * g[n - i];
    g[n] = s / Bp[0];
    if (!isFinite(g[n])) return null;
  }
  // The preview the reflection costs: the plant delay plus the reflected factor's order.
  const LEAD = d + 1 + (Bm.length - 1);

  // COMPOSE WITH Gr. `g` inverts the correction-to-error path; what must be cancelled is the error
  // the REFERENCE produces, so the deployed filter is the convolution of the two. This is the step
  // whose absence made the first version dimensionally wrong, and it is also what keeps the object
  // admissible: the result is still one FIR over the commanded reference.
  const gr = arxFir(model.Gr, 200);
  const tot = new Float64Array(g.length + gr.length - 1);
  for (let i = 0; i < g.length; i++) { const gi = g[i]; if (!gi) continue; for (let j = 0; j < gr.length; j++) tot[i + j] += gi * gr[j]; }
  // Trim the tail that contributes nothing, so the deployed tap count is honest rather than padded.
  let last = tot.length - 1; const pk = Math.max(...Array.from(tot, Math.abs)) || 1;
  while (last > 0 && Math.abs(tot[last]) < 1e-6 * pk) last--;
  return { g: tot.slice(0, last + 1), LEAD, nOut: out.length, d };
}

// ---------------------------------------------------------------- scoring
function score(q, lap, ff) {
  const m = makeMachine(q[0], 0);
  let s = 0, n = 0, uPk = 0;
  const at = (k) => q[((k % lap) + lap) % lap];
  for (let k = 0; k < 6 * lap; k++) {
    let u = 0;
    if (ff) { for (let j = 0; j < ff.g.length; j++) u += ff.g[j] * at(k + ff.LEAD - j); }
    // The FIR above inverts the plant to produce the ERROR we want cancelled, so it is applied
    // as a correction of the opposite sign, clamped at the same authority every rung here gets.
    u = Math.max(-UM, Math.min(UM, -u));
    uPk = Math.max(uPk, Math.abs(u));
    m.step(at(k) + u);
    const e = m.q - at(k);
    if (k >= 5 * lap) { s += e * e; n++; }
  }
  return { rms: 1000 * Math.sqrt(s / n), uPk };
}

// ---------------------------------------------------------------- the run
export { identify, zpetc, roots, arxFir, score, UM, ORDERS };

// Importable: a probe drives THESE functions rather than a second copy of them (rule 61).
if (process.env.ZPETC_LIB) { /* imported as a library — the run below is skipped */ } else {
console.log('\nzpetc: STABLE INVERSION — the classical feedforward this project calls itself a version of\n');
const sine = tone(4800, 3, 7, 0.9, rates(PR.q).v);
const openP = score(PR.q, P, null).rms, openS = score(sine, 4800, null).rms;
console.log(`    open loop — program ${openP.toExponential(4)} mm   held-out sine ${openS.toExponential(4)} mm`);
console.log(`    ${NOISE ? `identification noise ${NOISE} mm rms` : 'no identification noise'}`);
const RT = zpetcRoundTrip();
console.log(`    polynomial round trip (roots -> coefficients -> roots): ${RT.toExponential(1)}`
  + `${RT < 1e-9 ? '  — the power orders agree' : '  *** ORDERING BROKEN — every number below is meaningless ***'}\n`);
console.log('   na  nb  ridge   out lead  R2(Gu) R2(Gr)  taps    program       x       uPk      sine       x');

let best = null;
const RIDGES = (process.env.RIDGES || '1e-8,1e-6,1e-4,1e-2').split(',').map(Number);
for (const ord of ORDERS) for (const ridge of RIDGES) {
  const mdl = identify(ord, ord + 1, ridge);
  if (!mdl) { continue; }
  const ff = zpetc(mdl);
  if (!ff) { console.log(`  ${String(ord).padStart(3)} ${String(ord + 1).padStart(3)}  ${String(ridge).padStart(6)}   (no invertible factorisation)`); continue; }
  const rp = score(PR.q, P, ff), rs = score(sine, 4800, ff);
  console.log(`  ${String(ord).padStart(3)} ${String(ord + 1).padStart(3)}  ${String(ridge).padStart(6)} ${String(ff.nOut).padStart(4)} ${String(ff.LEAD).padStart(4)}  `
    + `${mdl.r2u.toFixed(3).padStart(6)} ${mdl.r2r.toFixed(3).padStart(6)} ${String(ff.g.length).padStart(5)}  `
    + `${rp.rms.toExponential(3)} ${(openP / rp.rms).toFixed(2).padStart(6)}x ${rp.uPk.toExponential(1)}  `
    + `${rs.rms.toExponential(3)} ${(openS / rs.rms).toFixed(2).padStart(6)}x`
    + `${rp.uPk >= 0.999 * UM ? '  CAPPED' : ''}`);
  if (!best || rp.rms < best.rp.rms) best = { ord, ridge, ff, rp, rs };
}

console.log('\n  THE COMPARISON, against numbers already on record for this axis:');
console.log(`    open loop                      ${openP.toExponential(4)} mm`);
console.log(`    ZPETC (best of its own sweep)  ${best ? best.rp.rms.toExponential(4) : '—'} mm  ${best ? (openP / best.rp.rms).toFixed(2) + 'x' : ''}`);
console.log('    the DISTILLED policy            32.75x        [on record]');
console.log('    hff / NOILC (lap-indexed)      242.1x        [on record, and INADMISSIBLE — a memory]');
console.log('\n  AND THE COLUMN THAT DECIDES IT — a two-tone sine the axis has NEVER run:');
console.log(`    open loop                      ${openS.toExponential(4)} mm`);
console.log(`    ZPETC                          ${best ? best.rs.rms.toExponential(4) : '—'} mm  ${best ? (openS / best.rs.rms).toFixed(2) + 'x' : ''}`);
console.log('    the DISTILLED policy            33.15x   ·   hff 0.53x   NOILC 0.53x      [on record]');
if (best) {
  console.log(`\n    ZPETC deploys ${best.ff.g.length} FIR taps and ${best.ff.LEAD} steps of preview, needs NO runtime`);
  console.log('    truth and carries no lap index — it is admissible on exactly the same terms we are.');
}
console.log('\n  CONTROLS (plan §56): the best cell does NOT move when the ridge grid is widened four');
console.log('  decades below its edge or the FIR truncation lifted 5x, and it reproduces at 2.18-2.45x');
console.log('  over four identification seeds. At the rig\'s own 1.6 um identification fidelity every');
console.log('  cell reads 0.06-0.27x — worse than doing nothing — with R2(Gr) collapsing to 0.029.');
console.log('\n  (nothing here is asserted — this is a rival, and what it measures is the result)\n');
}
