/**
 * @file THE TEACHER-FREE DIRECT INVERSE, WRITTEN ONCE (plan §104).
 *
 * §103 established the route on the barrel and did it in a file of its own. That file made three
 * instrumentation mistakes and every one of them was a SECOND COPY of something this repository
 * already had: a private scored loop (rule 61 — read 9.783x against the shared routing's 7.0x), a
 * private scoring support (rule 13 — scored from k = 0 where `rigs/ladder.mjs` drops the first 5%),
 * and a private window (rule 31 — hardcoded ±938, a reach carried from a diet with a different lap,
 * worth 2.3x of headline). A fourth plant asked the same way would make the same three mistakes.
 *
 * So the route is a KIT. What is plant-specific is the DIET and the NOMINAL INVERSE; everything
 * else — the excitation loop, the window, the fit, the scoring support, the controls — is here.
 *
 * ---------------------------------------------------------------- WHAT THE ROUTE IS
 *
 * Every process plant's `refAt` in `specs.mjs` is ALREADY a nominal setpoint->command map, because
 * a plant whose command is not its output cannot be given a setpoint any other way:
 *
 *     barrel   TH.powerFor(setpointAt(k))        column   WB.inputsFor(sp[0], sp[1])
 *     tank     voltsFor(G_MP, h[0], h[1])        realtanks/realarm  their own refAtStep
 *
 * So the identity sitting implicitly inside EMPS' `c - y` is that map, and the route is:
 *
 *     fit     window of inv(ACHIEVED y)  ->  c - inv(ACHIEVED y)      from OPEN-LOOP runs
 *     deploy  window of inv(SETPOINT)    ->  c = refAt(k) + f(...)
 *
 * with NO teacher, NO cascade, NO lap index and NO forecast. `DistilPolicy` is unchanged, because
 * the fit's input is already in the units of the reference the deployed object reads.
 *
 * NARROWED, and it must be said every time: "no model" means **no model IDENTIFIED BY US**. The
 * nominal inverse is the engineer's own closed form and already ships as the plant's reference.
 * What the route removes is the TEACHER, which is 74-89% of the commissioning bill (§73.13) and
 * ships on zero plants of ten (§86.7).
 *
 * ---------------------------------------------------------------- THE CONTROLS, WHICH ARE THE POINT
 *
 * A number from this kit is worthless without them, and three of them exist because this project
 * has already published a wrong number of exactly that shape:
 *
 *   ZERO      an armed run with an all-zero map must reproduce the open loop BIT-EXACTLY. That is
 *             `distil-tank.mjs`'s §67.3 defect — a rung scored through a loop that never applied it,
 *             which read "1.000x, nothing harmed, TRANSFER" for two sections. ASSERTED, not printed.
 *   SHUFFLE   a fit on SHUFFLED targets must NOT deliver. If it does, the harness is measuring
 *             something other than the map — the excitation's own mean, a scoring artefact, or the
 *             plant settling (rule 15: two wrongs that agree are indistinguishable from two rights).
 *   BASELINE  where the record states the plant's open loop, this must reproduce it (rule 21).
 *   SEGMENT   held out BY SEGMENT and never shuffled: contiguous rows a few samples apart read most
 *             of the same window, so a row split validates against data it has effectively seen.
 *   DRAW      seeds are reported as a DISTRIBUTION. §103's own headline moved 3.3x across four.
 */
import { DistilPolicy } from '../../../lib/pilot/distil.js';
import { deriveWindow } from './distilkit.mjs';

export function lcg(s0) { let s = s0 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const DROP = 0.05;          // `rigs/ladder.mjs`'s own start-transient drop (rule 13)

/**
 * ONE OPEN-LOOP EXCITATION RUN PER SEGMENT, recorded as (command, achieved).
 *
 * `diet(rnd)` returns segments; each is `{ n, refAt }` where `refAt(i)` is the COMMAND to apply at
 * step i of that segment — already through the plant's nominal inverse, exactly as `spec.refAt` is.
 * Nothing is scored here and no correction is applied: this is the machine being driven open loop.
 */
export function excite(spec, diet, { seed = 1 } = {}) {
  const rnd = lcg(seed);
  const segs = diet(rnd);
  const out = [];
  for (const s of segs) {
    const p = spec.fresh();
    const C = [], Y = [];
    for (let k = 0; k < s.n; k++) {
      const c = s.refAt(k);
      // THROUGH THE SPEC'S OWN `step`, with a ZERO correction — so the excitation and the scored
      // run advance the plant by the same function and no second copy of the routing exists.
      const r = spec.step(p, c, c.map(() => 0), k);
      C.push(c); Y.push(r.measured);
    }
    out.push({ C, Y, n: s.n });
  }
  return out;
}

/** Fit the direct inverse on a list of excitation segments. `inv` maps an ACHIEVED output to command units. */
export function fitInverse(segs, inv, { offsets, uMax, ridge = 1e-6, nc, refDim, stride = 7, shuffle = null }) {
  const pol = new DistilPolicy({ channels: nc, refDim, offsets, uMax, ridge, online: false, standardize: true });
  for (const s of segs) {
    const U = s.Y.map((y) => inv(y));
    let TGT = s.C.map((c, k) => c.map((v, j) => v - U[k][j]));
    // THE SHUFFLE CONTROL: the same rows against a PERMUTED target. Everything else identical, so a
    // fit that still delivers is not reading the map (rule 15).
    if (shuffle) {
      const idx = [...TGT.keys()];
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(shuffle() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      TGT = idx.map((i) => TGT[i]);
    }
    pol.addProgram({ refAt: (k) => U[Math.max(0, Math.min(s.n - 1, k))], n: s.n, prefix: TGT, stride });
  }
  pol.fit();
  return pol;
}

/**
 * HELD OUT BY SEGMENT. Refits without each segment in turn and scores that segment's rows.
 * Returns R2 per channel. Fitting nothing else, reading nothing from the machine.
 */
export function heldOutR2(segs, inv, opts, reach) {
  const nc = opts.nc;
  const sse = new Array(nc).fill(0), sst = new Array(nc).fill(0); let n = 0;
  for (let h = 0; h < segs.length; h++) {
    const pol = fitInverse(segs.filter((_, i) => i !== h), inv, opts);
    const s = segs[h], U = s.Y.map((y) => inv(y));
    const TGT = s.C.map((c, k) => c.map((v, j) => v - U[k][j]));
    const mean = new Array(nc).fill(0);
    for (let j = 0; j < nc; j++) { let m = 0; for (let k = 0; k < s.n; k++) m += TGT[k][j]; mean[j] = m / s.n; }
    for (let k = reach; k < s.n - reach; k += opts.stride || 7) {
      const pred = pol.actLook((o) => U[Math.max(0, Math.min(s.n - 1, k + o))], null);
      for (let j = 0; j < nc; j++) {
        const e = TGT[k][j] - pred[j]; sse[j] += e * e;
        const d = TGT[k][j] - mean[j]; sst[j] += d * d;
      }
      n++;
    }
  }
  return { r2: sse.map((v, j) => 1 - v / sst[j]), rows: n };
}

/**
 * SCORED THROUGH THE SPEC'S OWN ROUTING, on `rigs/ladder.mjs`'s own support.
 * `pol` null means the open loop. Returns rms over the scored support and the peak correction.
 */
export function scoreOn(spec, R, pol, { N }) {
  const p = spec.fresh();
  let ss = 0, n = 0, pk = 0;
  for (let k = 0; k < N; k++) {
    let u = R[k].map(() => 0);
    if (pol) {
      u = pol.actLook((o) => R[Math.max(0, Math.min(R.length - 1, k + o))], null);
      for (const v of u) pk = Math.max(pk, Math.abs(v));
    }
    const r = spec.step(p, R[k], u, k);
    if (k >= N * DROP) for (const e of r.truth) { ss += e * e; n++; }
  }
  return { rms: Math.sqrt(ss / n), pk };
}

/** The reference series a program produces, in COMMAND units — the spec's own `refAt`. */
export function refSeries(refAt, N) { const R = []; for (let k = 0; k <= N; k++) R.push(refAt(k)); return R; }

export { deriveWindow };
