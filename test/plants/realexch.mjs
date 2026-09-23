/**
 * @file A steam heat exchanger (DaISy 97-002), identified from its record.
 *
 * Input liquid flow, output outlet temperature. The model is ARX plus the counterflow
 * effectiveness term exp(-1/u), fitted on the first half of the record and chosen by free-run
 * simulation on the second. The existing control is the static inversion from its calibration
 * curve: temperature setpoint to flow by bisection on the identified steady state, open loop.
 * Scan 1 s. The record is disturbance-dominated, so this model is the weakest-validated here.
 */
import { readCols, identify, makePlant } from './sysid.mjs';
import { recipe } from './program.mjs';

const R = (k) => Array.from({ length: k }, (_, i) => i + 1);
const [, U, Y] = readCols('daisy-heat-exchanger.dat');
const HALF = U.length >> 1;
const EFF = (yl, ul) => [Math.exp(-1 / Math.max(0.05, ul[0]))];
const MODEL = identify({
  uEst: U.slice(0, HALF), yEst: Y.slice(0, HALF), uVal: U.slice(HALF), yVal: Y.slice(HALF),
  nas: R(6), nbs: R(8), nks: [1, 2, 3, 4, 6, 8], lams: [1e-8, 1e-6, 1e-4], lift: EFF,
}).model;
const UMIN = Math.min(...U), UMAX = Math.max(...U);

function tempAt(u) {
  const m = MODEL;
  let sa = 0; for (let i = 0; i < m.na; i++) sa += m.th[i];
  let sb = 0; for (let j = 0; j < m.nb; j++) sb += m.th[m.na + j];
  const L = m.lift([0], [u]);
  let extra = 0; for (let i = 0; i < L.length; i++) extra += L[i] * m.th[m.na + m.nb + 1 + i];
  return (sb * u + m.th[m.na + m.nb] + extra) / (1 - sa);
}
/** The flow that holds a temperature — bisection on a map that falls with flow. */
function flowFor(T) {
  let lo = UMIN, hi = UMAX;
  for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); if (tempAt(mid) > T) lo = mid; else hi = mid; }
  return 0.5 * (lo + hi);
}

function make(prog) {
  const sp0 = prog.at(0);
  const u0 = flowFor(sp0[0]), t0 = tempAt(u0);
  const p = makePlant(MODEL, new Array(12).fill(t0), new Array(12).fill(u0));
  let y = t0;
  const step = (sp) => { y = p.step(flowFor(sp[0])); };
  for (let k = 0; k < 1500; k++) step(sp0);
  return { meas: (o) => { o[0] = y; }, step };
}

const SEG = 400, HOLD = 150;
export const realexch = {
  key: 'realexch', name: 'steam heat exchanger (real record) under static inversion', units: '°C', nc: 1, dt: 1,
  main: recipe([97.5, 95.0, 99.5, 94.5, 97.5], SEG, HOLD),
  heldOut: recipe([97.5, 99.0, 95.5, 98.5, 97.5], SEG, HOLD),
  make,
  about: 'identified from a real record with its exponential flow nonlinearity; the weakest validation here',
};
