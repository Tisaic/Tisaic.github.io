/**
 * @file A three-zone extruder barrel under the engineer's closed-form feedforward.
 *
 * Each zone is a heat capacity with a heater, loss to ambient, conduction to its neighbours and
 * radiation (T⁴). The thermocouples read 60 s late with 0.35 K of noise, and the ambient drifts
 * slowly on two periods that are not multiples of the program, unmeasured. The existing control
 * is the power the steady-state model says holds the setpoint profile, clamped to 18–62 % — the
 * engineer's own model, run open loop. Scan 1 s.
 */
import { recipe } from './program.mjs';

const NZ = 3, CAP = 6000, KH = 12, HL = 4, KC = 6, RAD = 4e-10, DEAD = 60, NOISE = 0.35, DT = 1, TA0 = 25;
const PBOX = { lo: 18, hi: 62 };

function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function gauss(rnd) { const u = Math.max(1e-12, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const rad = (T, Ta) => RAD * ((T + 273) ** 4 - (Ta + 273) ** 4);
const ambientAt = (k) => TA0 + 0.6 * Math.sin(2 * Math.PI * k / 9300) + 0.4 * Math.sin(2 * Math.PI * k / 4100);

function makeBarrel(seed) {
  const T = [180, 200, 210], rnd = lcg(seed), buf = [];
  let k = 0;
  return {
    step(P) {
      const Ta = ambientAt(k), d = [];
      for (let i = 0; i < NZ; i++) {
        let q = KH * Math.max(0, P[i]) - HL * (T[i] - Ta) - rad(T[i], Ta);
        if (i > 0) q -= KC * (T[i] - T[i - 1]);
        if (i < NZ - 1) q -= KC * (T[i] - T[i + 1]);
        d.push(q / CAP);
      }
      for (let i = 0; i < NZ; i++) T[i] += DT * d[i];
      buf.push(T.slice());
      if (buf.length > DEAD + 2) buf.shift();
      k++;
    },
    read(o) {
      const src = buf.length > DEAD ? buf[buf.length - 1 - DEAD] : buf[0] || T;
      for (let i = 0; i < NZ; i++) o[i] = src[i] + NOISE * gauss(rnd);
    },
  };
}

/** The power that holds a temperature profile at the nominal ambient — the engineer's model. */
export function powerFor(Tset) {
  return Tset.map((t, i) => {
    let q = HL * (t - TA0) + rad(t, TA0);
    if (i > 0) q += KC * (t - Tset[i - 1]);
    if (i < NZ - 1) q += KC * (t - Tset[i + 1]);
    return q / KH;
  });
}

function make(prog) {
  const sp0 = prog.at(0);
  const b = makeBarrel(7);
  const P = [0, 0, 0];
  const step = (sp) => {
    const p = powerFor([sp[0], sp[1], sp[2]]);
    for (let i = 0; i < NZ; i++) P[i] = Math.max(PBOX.lo, Math.min(PBOX.hi, p[i]));
    b.step(P);
  };
  for (let k = 0; k < 20000; k++) step(sp0);
  return { meas: (o) => b.read(o), step };
}

const SEG = 4000, HOLD = 1200;
export const barrel = {
  key: 'barrel', name: 'three-zone extruder barrel under its steady-state model', units: 'K', nc: 3, dt: DT,
  main: recipe([[180, 196, 172, 190, 180], [200, 214, 192, 208, 200], [210, 222, 204, 218, 210]], SEG, HOLD),
  heldOut: recipe([[180, 172, 194, 186, 180], [200, 192, 212, 204, 200], [210, 204, 220, 214, 210]], SEG, HOLD),
  make, slow: true,
  about: 'three coupled zones radiating as T⁴, a 60 s measurement delay, noise and an unmeasured ambient drift',
};
