/**
 * @file The EMPS servo axis — a prismatic axis whose constants come from a real machine's record.
 *
 * Mass, friction, drive gain and loop gains are those identified from the EMPS benchmark
 * (DATA_EMPS.mat); friction is a 61-bin curve binned from the raw record; the drive saturates at
 * ±10 V and the encoder is quantised at 0.05 µm. The existing control is the axis's own cascaded
 * position/velocity loop with no feedforward. The main program reconstructs the recorded
 * reference to 1.2e-5 m. Scan 1 ms.
 */
import { periodic } from './program.mjs';

const GTAU = 35.15065188248547, KP = 160.18, KV = 243.45, DT = 1e-3, VSAT = 10, LSB = 5e-8, M1 = 95.0856;
const FV1 = 205.1170, VM = 0.129;
const FRICTION = [-47.223, -50.535, -46.504, -48.993, -49.714, -47.69, -46.827, -45.364,
  -45.74, -45.297, -40.27, -40.241, -38.596, -38.308, -38.364, -39.029, -37.695, -35.484,
  -33.997, -32.867, -31.425, -28.341, -27.709, -26.87, -26.2, -25.085, -23.496, -22.582,
  -21.235, -18.707, -0.862, 17.31, 18.966, 20.409, 21.779, 22.694, 23.779, 24.855, 25.264,
  25.571, 27.756, 29.967, 30.85, 30.955, 30.624, 31.025, 32.144, 33.029, 32.981, 34.273,
  33.188, 35.546, 37.757, 38.579, 39.09, 39.609, 38.23, 38.249, 38.361, 40.669, 36.959];
const NB = FRICTION.length;
function fric(v) {
  const x = (v + VM) / (2 * VM) * (NB - 1);
  if (x <= 0) return FRICTION[0] + (v + VM) * FV1;
  if (x >= NB - 1) return FRICTION[NB - 1] + (v - VM) * FV1;
  const i = Math.floor(x), f = x - i;
  return FRICTION[i] * (1 - f) + FRICTION[i + 1] * f;
}

// The recorded reference: piecewise-constant acceleration, run lengths and levels fitted to it.
const P = 6240;
const RUNS = [35, 351, 50, 1, 98, 687, 98, 1, 148, 1035, 148, 1, 50, 351, 101, 351, 50, 1,
  98, 687, 98, 1, 148, 1035, 148, 1, 50, 351, 66];
const ACC = [0.819696, -0.826876, 0.834499, -0.834589, 0.837223, -0.83719, 0.827038,
  -0.834201, 0.827215, -0.834609, 0.834591, -0.837223, 0.837141, -0.826781, 0.827378];
const Q = (() => {
  const a = new Float64Array(P), q = new Float64Array(P);
  let i = 0, ai = 0, on = true;
  for (const len of RUNS) { const val = on ? ACC[ai++] : 0; for (let j = 0; j < len; j++) a[i++] = val; on = !on; }
  let x = 1.078221e-4, v = 1.343255e-2;
  for (let k = 0; k < P; k++) { q[k] = x; v += a[k] * DT; x += v * DT; }
  return q;
})();
const vPeak = (() => { let m = 0; for (let k = 1; k < P; k++) m = Math.max(m, Math.abs(Q[k] - Q[k - 1]) / DT); return m; })();

/** A two-tone lap the axis's recorded program never contains, at 0.9x of that program's peak speed. */
function twoTone(lap, c1, c2, vFrac, mix = 0.35, mid = 0.125) {
  const unit = (k) => Math.sin(c1 * 2 * Math.PI * k / lap) + mix * Math.sin(c2 * 2 * Math.PI * k / lap + 0.7);
  let v = 0;
  for (let k = 1; k < lap; k++) v = Math.max(v, Math.abs(unit(k) - unit(k - 1)) / DT);
  const A = vFrac * vPeak / v;
  return periodic(lap, (k) => [mid + A * unit(k)]);
}

function make(prog) {
  const sp0 = prog.at(0);
  let q = sp0[0], v = 0, qp = Math.round(q / LSB) * LSB, qb1 = qp;
  const step = (sp) => {
    const qe = Math.round(q / LSB) * LSB;
    const qb = 0.5 * (qe + qp), dq = (qb - qb1) / DT;
    qb1 = qb; qp = qe;
    const u = Math.max(-VSAT, Math.min(VSAT, KV * (KP * (sp[0] - qe) - dq)));
    v += DT * (GTAU * u - fric(v)) / M1;
    q += DT * v;
  };
  for (let k = 0; k < 2000; k++) step(sp0);
  return { meas: (o) => { o[0] = Math.round(q / LSB) * LSB; }, step };
}

export const emps = {
  key: 'emps', name: 'EMPS servo axis, position loop only', units: 'm', nc: 1, dt: DT,
  main: periodic(P, (k) => [Q[k]]),
  heldOut: twoTone(4800, 3, 7, 0.9),
  make,
  about: 'a real axis\'s identified constants: friction curve, drive saturation, encoder quantisation',
};
