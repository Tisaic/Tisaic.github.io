/**
 * @file A flexible robot arm (DaISy 96-009), identified from its record.
 *
 * Input reaction torque, output tip acceleration; position is the acceleration integrated twice.
 * Its identified modes decay only ~1.03x per cycle — lightly damped, unlike anything simulated
 * here. The existing control is a PD position loop with an acceleration feedforward through the
 * identified DC gain and a torque limit taken from the record. The main program is a square wave
 * with quintic edges; the held-out program is the same shape with SHARPER edges. The amplitude is
 * sized so the program needs 30% of the torque the record ever used. Scan normalised to 1.
 */
import { readCols, identify, makePlant } from './sysid.mjs';
import { periodic, quintic } from './program.mjs';

const R = (k) => Array.from({ length: k }, (_, i) => i + 1);
const [U, Y] = readCols('daisy-robot-arm.dat');
const HALF = U.length >> 1;
const MODEL = identify({
  uEst: U.slice(0, HALF), yEst: Y.slice(0, HALF), uVal: U.slice(HALF), yVal: Y.slice(HALF),
  nas: R(12), nbs: R(12), nks: [0, 1, 2], lams: [1e-10, 1e-8, 1e-6],
}).model;
let TMAX = 0;
for (const v of U) TMAX = Math.max(TMAX, Math.abs(v));
const G_DC = (() => {
  let sa = 0; for (let i = 0; i < MODEL.na; i++) sa += MODEL.th[i];
  let sb = 0; for (let j = 0; j < MODEL.nb; j++) sb += MODEL.th[MODEL.na + j];
  return sb / (1 - sa);
})();
const KP = 0.02, KD = 0.003;

/** |position / torque| at frequency w, from the identified acceleration model. */
function magPos(w) {
  const a = MODEL.th.slice(0, MODEL.na), b = MODEL.th.slice(MODEL.na, MODEL.na + MODEL.nb);
  let ar = 1, ai = 0, br = 0, bi = 0;
  for (let i = 1; i <= MODEL.na; i++) { ar -= a[i - 1] * Math.cos(i * w); ai += a[i - 1] * Math.sin(i * w); }
  for (let j = 0; j < MODEL.nb; j++) { const d = MODEL.nk + j; br += b[j] * Math.cos(d * w); bi -= b[j] * Math.sin(d * w); }
  return Math.hypot(br, bi) / Math.hypot(ar, ai) / (2 * Math.sin(w / 2)) ** 2;
}

/** A square wave of period `lap` with quintic edges `edge` long, sized to 30% of the record's torque. */
function square(lap, edge) {
  const sh = (k) => {
    const h = lap >> 1, hi = k < h, s = Math.min(1, (hi ? k : k - h) / edge);
    return hi ? -1 + 2 * quintic(s) : 1 - 2 * quintic(s);
  };
  let need = 0;
  for (let mm = 1; mm < lap / 2; mm++) {
    let re = 0, im = 0;
    for (let k = 0; k < lap; k++) { const A = -2 * Math.PI * mm * k / lap; re += sh(k) * Math.cos(A); im += sh(k) * Math.sin(A); }
    const Mg = Math.hypot(re, im) * 2 / lap;
    if (Mg >= 1e-4) need += Mg / magPos(2 * Math.PI * mm / lap);
  }
  const amp = 0.30 * TMAX / need;
  return periodic(lap, (k) => [amp * sh(k)]);
}

const main = square(512, 160);

function make(prog) {
  const sp0 = prog.at(0);
  const p = makePlant(MODEL, new Array(16).fill(0), new Array(16).fill(0));
  let v = 0, x = sp0[0], r1 = sp0[0], r2 = sp0[0];
  const step = (sp) => {
    const ref = sp[0], aff = ref - 2 * r1 + r2;
    r2 = r1; r1 = ref;
    const tq = Math.max(-TMAX, Math.min(TMAX, aff / G_DC - KP * (ref - x) + KD * v));
    v += p.step(tq); x += v;
  };
  // settle ON the program: this plant's lightly damped ring takes ~13 laps to lock in
  for (let k = 0; k < 24 * prog.lap; k++) step(prog.at(k));
  return { meas: (o) => { o[0] = x; }, step };
}

export const realarm = {
  key: 'realarm', name: 'flexible robot arm (real record) under PD + acceleration feedforward', units: 'record units', nc: 1, dt: 1,
  main, heldOut: square(512, 96),
  make,
  about: 'lightly damped modes from a real record; the held-out program has sharper edges than the commissioned one',
};
