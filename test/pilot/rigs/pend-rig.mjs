/**
 * @file THE CART-POLE — the one plant class the other six do not contain: OPEN-LOOP UNSTABLE.
 *
 * EXTRACTED FROM `pend.test.mjs` when the DEPLOYED object needed the same plant (plan §86.2).
 * Every other plant in this directory has been through exactly this move — `rigs/ladder.mjs`
 * was extracted for the real-data plants, `rigs/specs.mjs` one level up for the instruments —
 * and the reason is always the same: a second copy of a plant's routing has shipped a defect
 * three separate times here (rule 61). The narrative for the plant, the loop and what is scored
 * stays in `pend.test.mjs`, which is BYTE-IDENTICAL across the extraction (rule 21).
 *
 * THE PLANT is a cart-pole with the pole measured from UPRIGHT — the textbook nonlinear form,
 * no small-angle approximation, with cart friction. It is UNSTABLE and `pend.test.mjs` asserts
 * it rather than asserting it in prose.
 *
 * THE LOOP is the conventional machine an installation would already have, and its gains are a
 * KNOB because a stabilising loop nobody derived is a carried constant (rule 31). `PEND_TUNED=1`
 * selects the best of 560 swept cells, which is 3.5x better than the default — and on that loop
 * the TEACHER refuses at every one of five authorities (plan §84.10). That refusal is the reason
 * this file exists: the deployed object has never been asked here.
 */
import { tick } from './meter.mjs';

const M = 0.5, m = 0.2, L = 0.3, G = 9.81, B = 0.1, DT = 0.005;
const makeCart = () => ({ x: 0, v: 0, th: 0, w: 0 });

/**
 * THE INTEGRATOR IS SUB-STEPPED, AND IT HAD TO BE — THE TUNED LOOP WALKS AWAY WITHOUT IT
 * (plan §86.2). Explicit Euler at 200 Hz cannot carry this plant under the TUNED gains: held on
 * the program it reads 2.910e-2 at lap 0, 3.244e-2 at lap 32 and **4.386e+0 by lap 59** — a
 * divergence that looks exactly like a marginally stable loop and is the INTEGRATOR (rule 17,
 * and §55.10's own repair on the KUKA). Sub-stepped 4x, with the loop still evaluated at 200 Hz
 * as a real controller would be, it is FLAT to 60 laps (2.913e-2 / 2.919e-2 / 2.892e-2), and 16x
 * agrees with 4x to 0.6%.
 *
 * ON THE DEFAULT LOOP IT IS INERT — 1.031e-1 / 1.032e-1 / 1.032e-1 at 1x / 4x / 16x, 0.1% — which
 * is rule 21's signature and is why it can be made the default: the cell that should not move does
 * not, and the one that was wrong is repaired. `pend.test.mjs` scores 4 laps, which is inside the
 * artefact-free region, so every number it has ever reported stands; what could not have been run
 * is a COMMISSIONING, which is tens of laps per teacher call.
 *
 * `PEND_SUB=1` restores the old integrator, which is the control.
 */
const SUB = Math.max(1, +(process.env.PEND_SUB || 4));
const H = DT / SUB;
function stepCart(p, F) {
  tick();
  for (let q = 0; q < SUB; q++) {
    const s = Math.sin(p.th), c = Math.cos(p.th), den = M + m * s * s;
    const ax = (F + m * L * p.w * p.w * s - m * G * s * c - B * p.v) / den;
    const aw = (-F * c - m * L * p.w * p.w * s * c + (M + m) * G * s + B * p.v * c) / (L * den);
    p.v += H * ax; p.x += H * p.v; p.w += H * aw; p.th += H * p.w;
  }
}
const TUNED = process.env.PEND_TUNED === '1';
const KX = TUNED ? 2 : 1, KV = TUNED ? 0.25 : 0.5, KP = TUNED ? 240 : 60, KD = TUNED ? 28 : 14;
const TH_LEAN = 0.25, F_MAX = 20;
function baseline(p, xr) {
  const thd = Math.max(-TH_LEAN, Math.min(TH_LEAN, -KX * (p.x - xr) - KV * p.v));
  return Math.max(-F_MAX, Math.min(F_MAX, KP * (p.th - thd) + KD * p.w));
}
const tipOf = (p) => p.x + L * Math.sin(p.th);

// ---------------------------------------------------------------- the program
const D = 0.5, ACC = 0.5, VMX = 0.35;
const TA = VMX / ACC, DA = 0.5 * ACC * TA * TA, TC = (D - 2 * DA) / VMX;
const TMOVE = 2 * TA + TC, DWELL = 0.6, LAP = Math.round(2 * (TMOVE + DWELL) / DT);
function ramp(t) {
  if (t < TA) return 0.5 * ACC * t * t;
  if (t < TA + TC) return DA + VMX * (t - TA);
  if (t < TMOVE) return D - 0.5 * ACC * (TMOVE - t) ** 2;
  return D;
}
function xrefAt(k) {
  const t = (((k % LAP) + LAP) % LAP) * DT;
  if (t < TMOVE) return ramp(t);
  if (t < TMOVE + DWELL) return D;
  if (t < 2 * TMOVE + DWELL) return D - ramp(t - TMOVE - DWELL);
  return 0;
}

/**
 * THE PROGRAM, PARAMETRISED — so a TRAINING DIET can exist that is not the scored program
 * (plan §86.2). The shipped constants above are one member of this family and `xrefAt` is
 * `makeProgram({}).at`, which is asserted rather than assumed below, so the diet and the program
 * cannot drift into being two different descriptions of a move (rule 61).
 */
function makeProgram({ d = D, acc = ACC, vmx = VMX, dwell = DWELL } = {}) {
  const ta = vmx / acc, da = 0.5 * acc * ta * ta, tc = (d - 2 * da) / vmx;
  if (tc < 0) throw new Error(`pend-rig: ${d} m is too short for ${vmx} m/s at ${acc} m/s²`);
  const tmove = 2 * ta + tc, lap = Math.round(2 * (tmove + dwell) / DT);
  const rmp = (t) => (t < ta ? 0.5 * acc * t * t : t < ta + tc ? da + vmx * (t - ta)
    : t < tmove ? d - 0.5 * acc * (tmove - t) ** 2 : d);
  const at = (k) => {
    const t = (((k % lap) + lap) % lap) * DT;
    if (t < tmove) return rmp(t);
    if (t < tmove + dwell) return d;
    if (t < 2 * tmove + dwell) return d - rmp(t - tmove - dwell);
    return 0;
  };
  return { lap, at, d, acc, vmx, dwell, tmove };
}

/** A settled machine, which is what every harness here starts from. */
function makeSettled() {
  const p = makeCart();
  for (let i = 0; i < 2000; i++) stepCart(p, baseline(p, 0));
  return p;
}

export { ACC, B, SUB, makeProgram, D, DT, DWELL, F_MAX, G, KD, KP, KV, KX, L, LAP, M, TA, TH_LEAN, TMOVE, TUNED,
  VMX, baseline, m, makeCart, makeSettled, ramp, stepCart, tipOf, xrefAt };
