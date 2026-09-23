/**
 * @file Cascaded water tanks (Schoukens & Noël 2017), identified from the benchmark's record.
 *
 * The dynamics are an ARX model fitted on the benchmark's estimation record and chosen by free-run
 * simulation on its independent validation record. The tank's documented OVERFLOW — the level
 * pinned at 10.0 in the record, which a linear fit cannot express — is restored as a clamp on the
 * output — but these programs stay below it, where the identified plant is LINEAR and so inside the
 * conventional feedforward's model class; a factor measured here is not a result. The existing control is the static inversion a line runs from its calibration curve:
 * level setpoint to pump voltage through the identified steady-state gain, open loop. Scan 4 s.
 */
import { readCsv, identify, makePlant } from './sysid.mjs';
import { recipe } from './program.mjs';

const R = (k) => Array.from({ length: k }, (_, i) => i + 1);
const REC = readCsv('cascaded-tanks.csv');
const MODEL = identify({
  uEst: REC.uEst, yEst: REC.yEst, uVal: REC.uVal, yVal: REC.yVal,
  nas: R(6), nbs: R(6), nks: [1, 2, 3], lams: [1e-10, 1e-8, 1e-6],
}).model;
const OVERFLOW = Math.max(...REC.yEst, ...REC.yVal);
const { GAIN, OFF } = (() => {
  let sa = 0; for (let i = 0; i < MODEL.na; i++) sa += MODEL.th[i];
  let sb = 0; for (let j = 0; j < MODEL.nb; j++) sb += MODEL.th[MODEL.na + j];
  return { GAIN: sb / (1 - sa), OFF: MODEL.th[MODEL.na + MODEL.nb] / (1 - sa) };
})();
const voltsFor = (h) => (h - OFF) / GAIN;

function make(prog) {
  const sp0 = prog.at(0);
  const v0 = voltsFor(sp0[0]);
  const p = makePlant(MODEL, new Array(8).fill(sp0[0]), new Array(8).fill(v0));
  let y = sp0[0];
  const step = (sp) => { y = Math.min(OVERFLOW, p.step(voltsFor(sp[0]))); };
  for (let k = 0; k < 2000; k++) step(sp0);
  return { meas: (o) => { o[0] = y; }, step };
}

const SEG = 600, HOLD = 200;
export const realtanks = {
  key: 'realtanks', name: 'cascaded tanks (real record) under static inversion', units: 'V (level)', nc: 1, dt: 4,
  main: recipe([5.0, 9.9, 4.2, 8.2, 5.0], SEG, HOLD),
  heldOut: recipe([5.0, 7.4, 9.7, 4.6, 5.0], SEG, HOLD),
  make, insideClass: true,
  about: 'identified from a real benchmark record; its programs stay below the overflow, where the identified plant is linear',
};
