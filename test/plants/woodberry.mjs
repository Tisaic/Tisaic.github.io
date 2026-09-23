/**
 * @file The Wood–Berry distillation column under its published BLT PI pair.
 *
 * Two inputs, two compositions, strong interaction and dead times from 1 to 7 minutes
 * (Wood & Berry 1973). The two decentralised PI loops are the BLT tuning from the literature
 * (Kc 0.375 / -0.075, Ti 8.29 / 23.6 min), with integral clamping as anti-windup and the inputs
 * held inside ±0.5. Scan 0.1 min.
 */
import { recipe } from './program.mjs';

const DT = 0.1;
const K = [[12.8, -18.9], [6.6, -19.4]];
const TAU = [[16.7, 21.0], [10.9, 14.4]];
const DLY = [[1, 3], [7, 3]].map((r) => r.map((t) => Math.round(t / DT)));
const MAXD = Math.max(...DLY.flat());
const UBOX = { lo: -0.5, hi: 0.5 };
const KC = [0.375, -0.075], TI = [8.29, 23.6];

export function makeColumn() {
  const x = [[0, 0], [0, 0]];
  const hist = [];
  for (let i = 0; i <= MAXD + 2; i++) hist.push([0, 0]);
  const y = [0, 0];
  return {
    y,
    step(u) {
      hist.push([u[0], u[1]]);
      if (hist.length > MAXD + 2) hist.shift();
      for (let i = 0; i < 2; i++) {
        let acc = 0;
        for (let j = 0; j < 2; j++) {
          const src = hist[hist.length - 1 - DLY[i][j]] || hist[0];
          x[i][j] += DT * (-x[i][j] + K[i][j] * src[j]) / TAU[i][j];
          acc += x[i][j];
        }
        y[i] = acc;
      }
    },
  };
}

/** The column with the BLT pair closed around it, settled at `sp0`. */
function make(prog) {
  const sp0 = prog.at(0);
  const col = makeColumn();
  const I = [0, 0], u = [0, 0];
  const step = (sp) => {
    for (let i = 0; i < 2; i++) {
      const e = sp[i] - col.y[i];
      I[i] += e * DT;
      let v = KC[i] * (e + I[i] / TI[i]);
      if (v > UBOX.hi) { I[i] -= (v - UBOX.hi) * TI[i] / KC[i]; v = UBOX.hi; }
      if (v < UBOX.lo) { I[i] -= (v - UBOX.lo) * TI[i] / KC[i]; v = UBOX.lo; }
      u[i] = v;
    }
    col.step(u);
  };
  for (let k = 0; k < 3000; k++) step(sp0);
  return { meas: (o) => { o[0] = col.y[0]; o[1] = col.y[1]; }, step };
}

const SEG = 750, HOLD = 300;
export const woodberry = {
  key: 'woodberry', name: 'Wood–Berry column under BLT PI', units: 'mol %', nc: 2, dt: DT,
  main: recipe([[0, 1, 0.4, 0.8, 0], [0.5, 0, 1, 0.3, 0.5]], SEG, HOLD, { phase: [0, SEG / 2] }),
  heldOut: recipe([[0, 0.6, 1, 0.2, 0], [0.5, 0.9, 0.1, 0.6, 0.5]], SEG, HOLD, { phase: [0, SEG / 3] }),
  make,
  about: 'two strongly coupled channels with dead times, under the literature\'s own PI pair',
};
