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
import { reset as meterReset, count as meterCount } from './meter.mjs';

export function lcg(s0) { let s = s0 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const DROP = 0.05;          // `rigs/ladder.mjs`'s own start-transient drop (rule 13)

/**
 * ONE OPEN-LOOP EXCITATION RUN PER SEGMENT, recorded as (command, achieved).
 *
 * `diet(rnd)` returns segments; each is `{ n, refAt }` where `refAt(i)` is the COMMAND to apply at
 * step i of that segment — already through the plant's nominal inverse, exactly as `spec.refAt` is.
 * Nothing is scored here and no correction is applied: this is the machine being driven open loop.
 */
export function excite(spec, diet, { seed = 1, carry = false, dwell = 0 } = {}) {
  const rnd = lcg(seed);
  const segs = diet(rnd);
  const out = [];
  // THE PLANT CARRIED ACROSS SEGMENTS (plan §123). Every segment used to begin with its own
  // `spec.fresh(s)`, and on the barrel that is 20,000 pre-rolled settling steps per 7,500-step
  // segment — §105 metered it at 68% of the route's whole bill, and §72 already made carrying the
  // default for the TEACHER (`distilkit.carrier`) for the same reason. Carried, the plant is built
  // ONCE at the first segment and every later segment begins where the previous one ended — the
  // configuration a real machine is in, which is not re-settled from cold between recipes (rule
  // 34). It is NOT a free change and is not claimed as one: a segment then starts INSIDE the
  // previous segment's transient, so the rows near a boundary differ and the fit's window must be
  // allowed to read the true past across it (`at`, below) rather than a clamp that says the
  // command was held for ever. Default OFF; unset is byte-identical.
  //
  // AND ON THE BARREL EVERY CARRIED CONFIGURATION IS VOID — ITS OWN SHUFFLE CONTROL DELIVERS
  // (§123): a fit on PERMUTED targets passes its own held-out gate and reads 1.18-1.72x on 3 of 4
  // seeds, where every fresh excitation here reads 1.000-1.008x. The `dwell` below was built on
  // the first hypothesis — that a carried segment begins inside the previous transient (7,500-step
  // segments against a 7,861-step settle) and so carries a per-segment offset a permutation keeps
  // — and it did NOT repair the control (dwelled: 1.18-1.44x); nor did holding the ambient drift
  // flat (`TH_NOAMB=1`: 1.54-1.72x carried against 1.000-1.006x fresh), so §72.18's variable is
  // refuted as the cause too. What survives is a DIET difference the rig makes silently:
  // `barrelSpec.fresh` ignores the segment and settles at the recipe's FIRST level, so every fresh
  // segment carries an extra transition from that level to its own start that the carried record
  // never contains. On the COLUMN, whose segments are three settles long, the carry is clean both
  // ways and saves 1.3x of the calendar. The dwell stays because it is what a real recipe change
  // does (rule 34) and because a dwell of at least the window's reach makes the clamp honest, so a
  // dwelled segment gets NO neighbour links.
  //
  // THAT FALSIFIER IS BUILT NOW (`TH_FRESHSEG=1`, plan §132) AND IT CONFIRMED THE MECHANISM BY
  // BREAKING THE CLEAN ARM RATHER THAN FIXING THE VOID ONE: honour the segment and the FRESH arm
  // voids too (shuffle 1.000-1.570), so the void is not caused by CARRYING — it is caused by
  // REMOVING that accidental transition, and the barrel's fresh rows were only ever clean because
  // a settle ignoring its own segment was injecting one. A commanded STEP in the diet
  // (`TH_DIETSTEP=1`) is NOT a substitute (1.281 honoured, and 1.100 against 1.008 on the shipped
  // settle), and the accident is not AMPLITUDE — it is 3-5 K against the diet's own 9-10 K.
  // §131 measured the carry CLEAN on the real cascaded tanks and the real steam exchanger, whose
  // diets start every segment where their `fresh()` settles, so the lever is fine and this plant's
  // DIET is what is not.
  let p = null;
  for (const s of segs) {
    // THE MACHINE IS SETTLED AT THE COMMAND IT IS ABOUT TO BE GIVEN, and the SEGMENT says what
    // that is. Every spec written before this ignores the argument and is byte-identical, because
    // each of them hardcodes its settle point and requires its diet to start there — `tankSpec`'s
    // diet says exactly that in its own comment. A plant whose home is a SERVO ACTION at an
    // arbitrary pose cannot arrange it in the diet, so the kit hands the segment in.
    if (!carry || p === null) p = spec.fresh(s);
    else if (dwell > 0) {
      // Through the spec's own `step` with a zero correction, so the dwell is METERED as plant
      // time like everything else here and no second routing exists. Not recorded.
      const c0 = s.refAt(0);
      for (let k = 0; k < dwell; k++) spec.step(p, c0, c0.map(() => 0), k);
    }
    const C = [], Y = [];
    for (let k = 0; k < s.n; k++) {
      const c = s.refAt(k);
      // THROUGH THE SPEC'S OWN `step`, with a ZERO correction — so the excitation and the scored
      // run advance the plant by the same function and no second copy of the routing exists.
      const r = spec.step(p, c, c.map(() => 0), k);
      C.push(c); Y.push(r.measured);
    }
    out.push({ C, Y, n: s.n, carried: carry, dwell: carry ? dwell : 0 });
  }
  // A RAW-CARRIED SEGMENT KNOWS ITS NEIGHBOURS, so a window straddling its start reads what the
  // plant actually saw — the previous segment's tail — instead of the clamp. A dwelled segment
  // was HELD at its first command before the record began, so the clamp IS the truth and it gets
  // no links; un-carried segments get none and read exactly as before.
  if (carry && !(dwell > 0)) for (let i = 0; i < out.length; i++) { out[i].prev = out[i - 1] || null; out[i].next = out[i + 1] || null; }
  return out;
}

/**
 * THE SEGMENT'S OWN READER OF `U` (the achieved output through the nominal inverse) at index k,
 * INCLUDING k OUTSIDE [0, n). For a segment excited from a fresh settle the clamp is honest: the
 * machine WAS held at U[0] before the record began. For a CARRIED segment it is not — the machine
 * was finishing the previous segment — so the reader falls through to the neighbours' records,
 * and only clamps where there is no neighbour (the very start and the very end of the excitation).
 * The same reader serves the fit, the held-out score and `AutoStack`'s ①d rung, so there is one
 * boundary convention and not three (rule 61).
 */
export function readerFor(s, inv) {
  const U = invOf(s, inv);
  const prev = s.prev ? invOf(s.prev, inv) : null, next = s.next ? invOf(s.next, inv) : null;
  return (k) => {
    if (k < 0) return prev ? prev[Math.max(0, s.prev.n + k)] : U[0];
    if (k >= s.n) return next ? next[Math.min(s.next.n - 1, k - s.n)] : U[s.n - 1];
    return U[k];
  };
}

/**
 * The nominal inverse applied to a segment's achieved output, MEMOISED on the segment.
 *
 * Purely a cost change and it cannot move a number — the same `inv` on the same `Y` — but one
 * commissioning calls it nine times per segment (the fit, six held-out refits, the shuffle and
 * the zero control) and on the heat exchanger `flowFor` is a 60-step bisection, so without this
 * the instrument spends most of its wall clock re-deriving a value it already had. Keyed on the
 * function identity, so a caller that changes `inv` gets a fresh evaluation rather than a stale
 * cache (rule 61 — a cache that cannot tell which question it answered is a second copy).
 */
function invOf(s, inv) {
  if (s.__invFn !== inv) { s.__invFn = inv; s.__U = s.Y.map((y) => inv(y)); }
  return s.__U;
}

/**
 * EXCITE AND INVERT IN ONE CALL — the shape `AutoStack`'s ①d rung actually consumes (plan §116).
 *
 * `excite` returns `{ C, Y, n }` with `Y` the ACHIEVED output in the plant's own units, and the
 * rung wants `{ C, U, n }` with `U` that output mapped back through the plant's nominal inverse.
 * `invOf` is private and memoises on the segment, so a caller assembling `U` itself would build a
 * SECOND inversion path beside the one `fitInverse` uses — the duplicate rule 61 exists to prevent
 * and which has shipped a defect four times in this project. One call, one inversion, shared cache.
 *
 * It returns the SAME segment objects `excite` produced with `U` attached, not copies: the memo
 * lives on the segment, so a harness that calls this and then `fitInverse` on the result pays for
 * the inversion once.
 */
export function segsFor(spec, diet, inv, { seed = 1, carry = false, dwell = 0 } = {}) {
  const segs = excite(spec, diet, { seed, carry, dwell });
  for (const s of segs) s.U = invOf(s, inv);
  // The rung reads the window through `at` when a segment carries one; a host that hands plain
  // `{ C, U, n }` gets the clamp it always had.
  if (carry) for (const s of segs) s.at = readerFor(s, inv);
  return segs;
}

/** Fit the direct inverse on a list of excitation segments. `inv` maps an ACHIEVED output to command units. */
export function fitInverse(segs, inv, { offsets, uMax, ridge = 1e-6, nc, refDim, stride = 7, shuffle = null }) {
  const pol = new DistilPolicy({ channels: nc, refDim, offsets, uMax, ridge, online: false, standardize: true });
  for (const s of segs) {
    const U = invOf(s, inv);
    let TGT = s.C.map((c, k) => c.map((v, j) => v - U[k][j]));
    // THE SHUFFLE CONTROL: the same rows against a PERMUTED target. Everything else identical, so a
    // fit that still delivers is not reading the map (rule 15).
    if (shuffle) {
      const idx = [...TGT.keys()];
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(shuffle() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      TGT = idx.map((i) => TGT[i]);
    }
    pol.addProgram({ refAt: readerFor(s, inv), n: s.n, prefix: TGT, stride });
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
    const s = segs[h], U = invOf(s, inv), at = readerFor(s, inv);
    const TGT = s.C.map((c, k) => c.map((v, j) => v - U[k][j]));
    const mean = new Array(nc).fill(0);
    for (let j = 0; j < nc; j++) { let m = 0; for (let k = 0; k < s.n; k++) m += TGT[k][j]; mean[j] = m / s.n; }
    for (let k = reach; k < s.n - reach; k += opts.stride || 7) {
      const pred = pol.actLook((o) => at(k + o), null);
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
export function scoreOn(spec, R, pol, { N, seg = null }) {
  // The scored run is a segment too — its own program, so a plant that homes per program homes
  // here on the SCORED one and not on whichever diet segment ran last.
  const p = spec.fresh(seg || { n: N, refAt: (k) => R[Math.max(0, Math.min(R.length - 1, k))],
    meta: spec.meta || null });
  let ss = 0, n = 0, pk = 0;
  // THE CORRECTION'S OWN SPREAD, per channel. A map of the commanded reference deployed on a
  // CONSTANT reference can emit only one number for the whole run, however well it was fitted —
  // so on a REGULATOR this reads exactly 0 and the driver asserts it rather than inferring the
  // structural point from a score near 1.000x (rule 25).
  let lo = null, hi = null;
  for (let k = 0; k < N; k++) {
    let u = R[k].map(() => 0);
    if (pol) {
      u = pol.actLook((o) => R[Math.max(0, Math.min(R.length - 1, k + o))], null);
      for (const v of u) pk = Math.max(pk, Math.abs(v));
    }
    if (lo === null) { lo = u.slice(); hi = u.slice(); }
    else for (let j = 0; j < u.length; j++) { if (u[j] < lo[j]) lo[j] = u[j]; if (u[j] > hi[j]) hi[j] = u[j]; }
    const r = spec.step(p, R[k], u, k);
    if (k >= N * DROP) for (const e of r.truth) { ss += e * e; n++; }
  }
  const spread = lo === null ? 0 : Math.max(...hi.map((v, j) => v - lo[j]));
  return { rms: Math.sqrt(ss / n), pk, spread };
}

/** The reference series a program produces, in COMMAND units — the spec's own `refAt`. */
export function refSeries(refAt, N) { const R = []; for (let k = 0; k <= N; k++) R.push(refAt(k)); return R; }

/**
 * THE PLANT'S OWN 2% SETTLE, MEASURED THROUGH THE SPEC (rule 31, plan §105).
 *
 * `deriveWindow` needs a settle and a lap, and §103's worst mistake was carrying a reach from a
 * plant with a different lap. Every `distil-*.mjs` harness already measures this and every one
 * wrote its own loop against its own plant module; driven through `spec.fresh()`/`spec.step()`
 * it is ONE function, and a plant supplies only the size of the step to hit it with — itself
 * sized from that plant's own authority and never carried (rule 61).
 *
 * The step is HELD (rule 33: a settle read under a moving reference describes the reference) and
 * the machine is settled at `refAt(0)` first. A plant that does not move returns `null` rather
 * than 1, because "no reading" and "settles instantly" are different states (rule 25).
 */
export function measureSettle(spec, { delta, idx = 0, N = 20000, warm = 200 } = {}) {
  // NO SEGMENT: this probe HOLDS a reference (rule 33), so a plant whose command carries rate
  // terms is told it is holding a pose rather than handed a program it is not being driven on.
  const p = spec.fresh();
  const r0 = spec.refAt(0);
  const zero = r0.map(() => 0);
  for (let i = 0; i < warm; i++) spec.step(p, r0, zero, i);
  const u = r0.map((_, j) => (j === 0 ? delta : 0));
  const y = new Float64Array(N);
  for (let k = 0; k < N; k++) y[k] = spec.step(p, r0, u, k).measured[idx];
  const fin = y[N - 1], y0 = y[0], span = Math.abs(fin - y0);
  if (!(span > 0)) return null;
  for (let k = N - 1; k >= 0; k--) if (Math.abs(y[k] - fin) > 0.02 * span) return k + 1;
  return 1;
}

/**
 * WHAT A PHASE COST THE PLANT, IN ITS OWN STEPS — `rigs/meter.mjs` read around a closure.
 *
 * §104 computed its calendar by hand from segment lengths, which is right only while nothing else
 * advances the plant — and `spec.fresh()` pre-rolls thousands of settling steps on most of these
 * plants, which is plant time a customer pays for. The meter ticks inside each plant's own `step`
 * so no caller can bypass it (rule 61), and both columns are reported rather than one (rule 25).
 */
export function priceOf(fn) {
  meterReset();
  const value = fn();
  return { value, steps: meterCount() };
}

/**
 * THE `DIRINV` HOST WIRING, WRITTEN ONCE (plan §119). §116 wrote it inline in `distil-pend.mjs`;
 * pasting it into the barrel and the column would be the third copy of one block (rule 61), and
 * every plant's entry — diet, nominal inverse, settle probe, segment lap — is ALREADY in
 * `dirinvall.mjs`'s `PLANTS`, so the harness names its row and this builds `{ dirInv, dirInvRuns }`
 * for the spec. Unset returns `{}`, so a spec spreading it is byte-identical (rule 21).
 *
 *   DIRINV=1    arm the ①d rung        DIRFIRST=1  place it BEFORE the conventional rung (§117)
 *   DIRIDGE     the fit's ridge (1e-6)  DISEED      the open-loop excitation's seed (1)
 *
 * The window is derived from the EXCITATION's own lap, never from the harness's teacher diet
 * (§103 moved 2.3x from a window carried across diets), and the settle is the PLANTS entry's —
 * a stated number where the harness states one, the kit's probe where it measures one.
 */
export async function dirInvFor(nameRe, { stride = 7 } = {}) {
  if (process.env.DIRINV !== '1') return {};
  const { PLANTS } = await import('../dirinvall.mjs');
  const P = PLANTS.find((q) => nameRe.test(q.name));
  if (!P) throw new Error(`DIRINV: no ${nameRe} entry in dirinvall PLANTS — the table moved (rule 25)`);
  if (P.prime) await P.prime();
  const settle = typeof P.settle === 'function' ? P.settle() : P.settle;
  if (settle === null) throw new Error(`DIRINV: ${P.name}'s settle probe read NO MOVEMENT (rule 25)`);
  const seglen = typeof P.seglen === 'function' ? P.seglen() : P.seglen;
  const w = deriveWindow({ settle, lapMin: seglen });
  const first = process.env.DIRFIRST === '1';
  const ridge = process.env.DIRIDGE === undefined ? 1e-6 : +process.env.DIRIDGE;
  const seed = process.env.DISEED === undefined ? 1 : +process.env.DISEED;
  // `DICARRY=1` carries the plant with a DWELL of one measured settle at each new segment's first
  // command; `DICARRY=raw` carries it with no dwell, which is the configuration §123 measured as
  // VOID on the barrel and is kept reachable as that negative's control.
  const carry = process.env.DICARRY === '1' || process.env.DICARRY === 'raw';
  const dwell = process.env.DICARRY === '1' ? settle : 0;
  console.log(`  ①d DIRECT INVERSE armed${first ? ' FIRST (before the conventional rung)' : ''}: `
    + `window ±${w.reach} raw steps, ${w.offsets.length} taps [rule ${w.rule} = `
    + `min(0.61·${settle}, ${seglen}/8)], ridge ${ridge}, excitation seed ${seed}`
    + (carry ? `, the plant CARRIED across segments (${dwell > 0 ? `a ${dwell}-step dwell at each new segment, one rebuild for the whole excitation` : 'RAW — no dwell, the record begins inside the previous transient'})` : ''));
  return { dirInv: { refDim: P.nc, ridge, offsets: w.offsets, stride, first },
    // ZERO TEACHER LAPS: open-loop segments only, through the kit's one inversion path.
    dirInvRuns: () => segsFor(P.spec, P.diet, P.inv, { seed, carry, dwell }) };
}

export { deriveWindow };
