/**
 * @file THE WOOD-BERRY DISTILLATION COLUMN — the plant, shared by every test that drives it.
 *
 * Extracted from `woodberry.test.mjs` when a second test needed the same plant. Duplicating a
 * plant is exactly how two copies drift apart, which this project has paid for before; the
 * narrative for every number, and the rig's own validation, stays in `woodberry.test.mjs`.
 */
// ------------------------------------------------------------------- the plant
const DT = 0.1;                                   // minutes per step
const K = [[12.8, -18.9], [6.6, -19.4]];          // steady gains
const TAU = [[16.7, 21.0], [10.9, 14.4]];         // minutes
const TH = [[1, 3], [7, 3]];                      // dead times, minutes
const DLY = TH.map((r) => r.map((t) => Math.round(t / DT)));
const MAXD = Math.max(...DLY.flat());

function makeColumn() {
  const x = [[0, 0], [0, 0]];                     // one first-order state per path
  const hist = [];                                // input history for the dead times
  for (let i = 0; i <= MAXD + 2; i++) hist.push([0, 0]);
  return {
    y: [0, 0],
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
        this.y[i] = acc;
      }
    },
  };
}
/** Steady inputs holding a pair of compositions — G(0) inverted. */
const DET = K[0][0] * K[1][1] - K[0][1] * K[1][0];
function inputsFor(y1, y2) {
  return [(K[1][1] * y1 - K[0][1] * y2) / DET, (-K[1][0] * y1 + K[0][0] * y2) / DET];
}
/** Steady compositions for a held pair of inputs — the forward model, for the truth. */
const outputsFor = (u) => [K[0][0] * u[0] + K[0][1] * u[1], K[1][0] * u[0] + K[1][1] * u[1]];

// ---------------------------------------------------------------- the scenario
// STATED EXACTLY, because every paper picks its own and the absolute IAE follows it: a
// unit step on the top composition at t = 0, a unit step on the bottom composition at
// t = 100 min, run to 300 min, IAE summed over both loops in composition-minutes.
const T_END = 3000, T_STEP2 = 1000;
const setpointAt = (k) => [1, k >= T_STEP2 ? 1 : 0];
// THE INPUT BOX IS SIZED FROM THE PLANT'S OWN GAINS. A unit setpoint step needs inputs
// of about 0.15, and gains near 19 mean a box of +-1.2 swings the composition by 38 —
// which tripped the over-range guard three times and refused the plant, correctly.
const UBOX = { lo: -0.5, hi: 0.5 };
const UMAX = Number(process.env.UM || 0.4);

function iaeOf(run) { return run.iae; }

/** The published baseline: two independent PI loops, BLT-tuned, clamped to the same box. */
function runBLT() {
  const c = makeColumn();
  const KC = [0.375, -0.075], TI = [8.29, 23.6];
  const I = [0, 0];
  let iae = 0;
  for (let k = 0; k < T_END; k++) {
    const sp = setpointAt(k);
    const u = [0, 0];
    for (let i = 0; i < 2; i++) {
      const e = sp[i] - c.y[i];
      I[i] += e * DT;
      let v = KC[i] * (e + I[i] / TI[i]);
      // ANTI-WINDUP BY CLAMPING THE INTEGRAL, the standard implementation — without it
      // the baseline would be crippled by its own saturation and would not be the
      // baseline the literature reports.
      if (v > UBOX.hi) { I[i] -= (v - UBOX.hi) * TI[i] / KC[i]; v = UBOX.hi; }
      if (v < UBOX.lo) { I[i] -= (v - UBOX.lo) * TI[i] / KC[i]; v = UBOX.lo; }
      u[i] = v;
    }
    c.step(u);
    iae += (Math.abs(sp[0] - c.y[0]) + Math.abs(sp[1] - c.y[1])) * DT;
  }
  return { iae };
}

/** Steady-state inversion only: right in the end, wrong the whole way there. */
function runOpen() {
  const c = makeColumn();
  let iae = 0;
  for (let k = 0; k < T_END; k++) {
    const sp = setpointAt(k);
    c.step(inputsFor(sp[0], sp[1]));
    iae += (Math.abs(sp[0] - c.y[0]) + Math.abs(sp[1] - c.y[1])) * DT;
  }
  return { iae };
}


export { DET, DLY, DT, K, MAXD, TAU, TH, T_END, UBOX, UMAX, iaeOf, inputsFor, makeColumn, outputsFor, runBLT, runOpen, setpointAt };
