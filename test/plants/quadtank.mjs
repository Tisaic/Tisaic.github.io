/**
 * @file The quadruple tank (Johansson 2000), minimum-phase configuration.
 *
 * Four tanks, two pumps; each pump fills one lower tank directly and the other side's upper tank.
 * Outflow goes as the square root of level, so nothing about it is linear. The existing control is
 * the plant's own STATIC INVERSE: the setpoint (two lower-tank levels, cm) is turned into pump
 * voltages by the steady-state model, open loop — what a line with a calibration and no dynamic
 * model runs. Scan 0.1 s.
 */
import { recipe } from './program.mjs';

const G = 981, AREA = [28, 32, 28, 32], AO = [0.071, 0.057, 0.071, 0.057], KP = [3.33, 3.35], DT = 0.1;
const GAMMA = [0.7, 0.6];

function makeTanks(g, h0) {
  const h = h0.slice();
  return { h, step(v1, v2) {
    const v = [Math.max(0, v1), Math.max(0, v2)];
    const q = h.map((x, i) => AO[i] * Math.sqrt(2 * G * Math.max(0, x)));
    const d = [
      (-q[0] + q[2] + g[0] * KP[0] * v[0]) / AREA[0],
      (-q[1] + q[3] + g[1] * KP[1] * v[1]) / AREA[1],
      (-q[2] + (1 - g[1]) * KP[1] * v[1]) / AREA[2],
      (-q[3] + (1 - g[0]) * KP[0] * v[0]) / AREA[3],
    ];
    for (let i = 0; i < 4; i++) h[i] = Math.max(0, h[i] + DT * d[i]);
  } };
}
/** The pump voltages that hold a pair of lower-tank levels — the steady-state model inverted. */
export function voltsFor(g, h1, h2) {
  const b1 = AO[0] * Math.sqrt(2 * G * Math.max(0, h1)), b2 = AO[1] * Math.sqrt(2 * G * Math.max(0, h2));
  const a11 = g[0] * KP[0], a12 = (1 - g[1]) * KP[1], a21 = (1 - g[0]) * KP[0], a22 = g[1] * KP[1];
  const det = a11 * a22 - a12 * a21;
  return [(b1 * a22 - b2 * a12) / det, (b2 * a11 - b1 * a21) / det];
}

function make(prog) {
  const sp0 = prog.at(0);
  const t = makeTanks(GAMMA, [10.7, 10.7, 3.0, 3.0]);
  const step = (sp) => { const v = voltsFor(GAMMA, sp[0], sp[1]); t.step(v[0], v[1]); };
  for (let k = 0; k < 30000; k++) step(sp0);
  return { meas: (o) => { o[0] = t.h[0]; o[1] = t.h[1]; }, step };
}

const SEG = 4000, HOLD = 1200;
export const quadtank = {
  key: 'quadtank', name: 'quadruple tank under its static inverse', units: 'cm', nc: 2, dt: DT,
  main: recipe([[10.7, 13.5, 8.4, 12.2, 10.7], [10.7, 8.8, 12.8, 11.6, 10.7]], SEG, HOLD),
  heldOut: recipe([[10.7, 9.0, 12.9, 11.0, 10.7], [10.7, 12.6, 9.4, 8.9, 10.7]], SEG, HOLD),
  make, slow: true,
  about: 'square-root outflow and cross-fed pumps, run open loop through its steady-state model',
};
