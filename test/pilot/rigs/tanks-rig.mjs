/**
 * @file THE QUADRUPLE TANK — the plant, shared by every test that drives it.
 *
 * Extracted from `tanks.test.mjs` when a second test needed the same plant. The constants
 * below are the benchmark's own and duplicating them is exactly how two copies drift apart,
 * which this project has paid for before; the narrative for every number, and the validation
 * of the rig against the published model, stays in `tanks.test.mjs`.
 */
const UCAP = 1.2;

const G = 981;                            // cm/s^2
const AREA = [28, 32, 28, 32];            // tank cross-sections, cm^2
const AO = [0.071, 0.057, 0.071, 0.057];  // outlet areas, cm^2
const KP = [3.33, 3.35];                  // pump gains, cm^3/(V s)
const DT = 0.1;                           // s per step

function makeTanks(g) {
  const h = [10.7, 10.7, 3.0, 3.0];
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
/** Steady levels for a held pair of voltages — the plant's own forward model. */
function levelsAt(g, v1, v2) {
  return [
    (g[0] * KP[0] * v1 + (1 - g[1]) * KP[1] * v2) ** 2 / (AO[0] ** 2 * 2 * G),
    ((1 - g[0]) * KP[0] * v1 + g[1] * KP[1] * v2) ** 2 / (AO[1] ** 2 * 2 * G),
  ];
}
/** The voltages holding a pair of levels — this plant's analogue of inverse kinematics. */
function voltsFor(g, h1, h2) {
  const b1 = AO[0] * Math.sqrt(2 * G * h1), b2 = AO[1] * Math.sqrt(2 * G * h2);
  const a11 = g[0] * KP[0], a12 = (1 - g[1]) * KP[1];
  const a21 = (1 - g[0]) * KP[0], a22 = g[1] * KP[1];
  const det = a11 * a22 - a12 * a21;      // sign flips as gamma1+gamma2 crosses 1
  return [(b1 * a22 - b2 * a12) / det, (b2 * a11 - b1 * a21) / det];
}

// ------------------------------------------------------------------- the program
// A RECIPE, NOT A CONTOUR: hold a level, ramp smoothly to the next, hold again. What a
// process line actually runs, and it shares no shape with a closed toolpath.
const SEG = 4000, HOLD = 1200;
const RECIPE = [[10.7, 10.7], [13.5, 8.8], [8.4, 12.8], [12.2, 11.6], [9.2, 9.6]];
const quintic = (t) => t * t * t * (10 + t * (-15 + 6 * t));
function refAtStep(k) {
  const i = Math.min(RECIPE.length - 2, Math.floor(k / SEG));
  const t = (k - i * SEG - HOLD) / (SEG - HOLD);
  const s = t <= 0 ? 0 : t >= 1 ? 1 : quintic(t);
  const a = RECIPE[i], b = RECIPE[i + 1];
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
}
const PROG = SEG * (RECIPE.length - 1);


export { UCAP, G, AREA, AO, KP, DT, makeTanks, levelsAt, voltsFor,
  SEG, HOLD, RECIPE, quintic, refAtStep, PROG };
