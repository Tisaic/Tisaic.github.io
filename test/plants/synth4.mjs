/**
 * @file Four coupled first-order loops — a SYNTHETIC plant, for the block's four-channel limit.
 *
 * Each loop is first order with a 6-scan dead time and responds to the next loop's error (a
 * Wood–Berry kind of interaction with no steady-state offset). It exists because four channels is
 * the block's compile-time maximum and where its largest unit of work comes closest to the MAC
 * budget. It is linear and inside the conventional feedforward's own model class, so its factor
 * measures the class and is never a result.
 */
import { recipe } from './program.mjs';

const TAU = [18, 25, 32, 40], DEL = 6, SEG = 400, HOLD = 150;

function make(prog) {
  const sp0 = prog.at(0);
  const y = sp0.slice(), hist = [];
  for (let i = 0; i <= DEL; i++) hist.push(sp0.slice());
  const step = (sp) => {
    hist.push([sp[0], sp[1], sp[2], sp[3]]); hist.shift();
    const d = hist[0];
    const e = [0, 1, 2, 3].map((c) => (d[c] - y[c]) / TAU[c]);
    for (let c = 0; c < 4; c++) y[c] += e[c] + 0.5 * e[(c + 1) % 4];
  };
  return { meas: (o) => { for (let c = 0; c < 4; c++) o[c] = y[c]; }, step };
}

export const synth4 = {
  key: 'synth4', name: 'four coupled first-order loops (synthetic)', units: '—', nc: 4, dt: 1,
  main: recipe([[0, 1, 0.3, 0], [0.5, 0, 1, 0.5], [0.2, 0.8, 0.1, 0.2], [1, 0.4, 0.7, 1]], SEG, HOLD,
    { phase: [0, 60, 120, 180] }),
  heldOut: recipe([[0, 0.6, 0.9, 0], [0.5, 1, 0.2, 0.5], [0.2, 0.4, 0.9, 0.2], [1, 0.2, 0.5, 1]], SEG, HOLD,
    { phase: [0, 60, 120, 180] }),
  make, insideClass: true,
  about: 'the four-channel maximum, where the MAC budget is tightest; linear, so its factor is not a result',
};
