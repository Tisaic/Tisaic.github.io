/**
 * @file A cart-pole — the library's one OPEN-LOOP UNSTABLE plant.
 *
 * A nonlinear cart and pole (cart 0.5 kg, pole 0.2 kg at 0.3 m, viscous cart friction), integrated
 * at four sub-steps per 5 ms scan. The existing control is a cascade that keeps the pole up: an
 * outer loop turns the cart's position error into a lean angle (clamped at 0.25 rad) and an inner
 * PD holds that angle with a force limit of 20 N. The block trims the cart's position setpoint;
 * what is scored is the pole TIP, which the stabiliser does not regulate.
 */
import { periodic } from './program.mjs';

const M = 0.5, m = 0.2, L = 0.3, G = 9.81, B = 0.1, DT = 0.005, SUB = 4, H = DT / SUB;
const KX = 1, KV = 0.5, KP = 60, KD = 14, TH_LEAN = 0.25, F_MAX = 20;

function stepCart(p, F) {
  for (let q = 0; q < SUB; q++) {
    const s = Math.sin(p.th), c = Math.cos(p.th), den = M + m * s * s;
    const ax = (F + m * L * p.w * p.w * s - m * G * s * c - B * p.v) / den;
    const aw = (-F * c - m * L * p.w * p.w * s * c + (M + m) * G * s + B * p.v * c) / (L * den);
    p.v += H * ax; p.x += H * p.v; p.w += H * aw; p.th += H * p.w;
  }
}
function stabiliser(p, xr) {
  const thd = Math.max(-TH_LEAN, Math.min(TH_LEAN, -KX * (p.x - xr) - KV * p.v));
  return Math.max(-F_MAX, Math.min(F_MAX, KP * (p.th - thd) + KD * p.w));
}

/** A move out and back: accelerate, cruise, decelerate, dwell, and return. */
function move({ d, acc, vmx, dwell }) {
  const ta = vmx / acc, da = 0.5 * acc * ta * ta, tc = (d - 2 * da) / vmx;
  if (tc < 0) throw new Error(`cartpole: ${d} m is too short for ${vmx} m/s at ${acc} m/s²`);
  const tmove = 2 * ta + tc, lap = Math.round(2 * (tmove + dwell) / DT);
  const r = (t) => (t < ta ? 0.5 * acc * t * t : t < ta + tc ? da + vmx * (t - ta) : t < tmove ? d - 0.5 * acc * (tmove - t) ** 2 : d);
  return periodic(lap, (k) => {
    const t = k * DT;
    return [t < tmove ? r(t) : t < tmove + dwell ? d : t < 2 * tmove + dwell ? d - r(t - tmove - dwell) : 0];
  });
}

function make(prog) {
  const sp0 = prog.at(0);
  const p = { x: sp0[0], v: 0, th: 0, w: 0 };
  const step = (sp) => stepCart(p, stabiliser(p, sp[0]));
  for (let k = 0; k < 2000; k++) step(sp0);
  return { meas: (o) => { o[0] = p.x + L * Math.sin(p.th); }, step };
}

export const cartpole = {
  key: 'cartpole', name: 'cart-pole under its stabilising cascade', units: 'm', nc: 1, dt: DT,
  main: move({ d: 0.5, acc: 0.5, vmx: 0.35, dwell: 0.6 }),
  heldOut: move({ d: 0.4, acc: 0.7, vmx: 0.30, dwell: 0.5 }),
  make,
  about: 'open-loop unstable; the pole tip is scored, which the stabiliser does not regulate',
};
