/**
 * @file A PID temperature loop — the most ordinary plant in the library.
 *
 * Process: first order plus dead time (gain 80 °C at full flow, time constant 60 s, dead time
 * 20 s), 1 s scan. The valve is nonlinear the way real valves are: an equal-percentage trim
 * (rangeability 50), two-parameter stiction and a 5 %/s stroke limit. The PID is ISA form with
 * back-calculation anti-windup, tuned by the SIMC rule at the operating point the schedule uses.
 * The measurement is quantised to 0.02 °C.
 *
 * `linear: true` gives a linear valve with no stiction. It is a CONTROL, not a plant to quote: a
 * linear plant sits inside the conventional feedforward's own model class, so its factor measures
 * the class rather than the method.
 */
import { recipe } from './program.mjs';

const TS = 1, TAU = 60, THETA = 20, KP = 80, Y0 = 20;
const DEAD = Math.round(THETA / TS);
const RANGE = 50, STIC_D = 0.010, STIC_S = 0.005, RATE = 0.05 * TS, QUANT = 0.02;

const eqPct = (x) => Math.pow(RANGE, Math.max(0, Math.min(1, x)) - 1);
const linearTrim = (x) => Math.max(0, Math.min(1, x));

function installedGain(trim, x) {
  const h = 0.01;
  return KP * (trim(x + h) - trim(x - h)) / (2 * h) / 100;
}
function invTrim(nonlinear, w) {
  const f = Math.max(1 / RANGE, Math.min(1, w));
  return nonlinear ? 1 + Math.log(f) / Math.log(RANGE) : f;
}

/** A settled loop at setpoint `sp0`. `step(sp)` advances one scan and returns the measured PV. */
export function makeLoop({ sp0 = 55, linear = false, tuneAt = 60, tauc = THETA } = {}) {
  const trim = linear ? linearTrim : eqPct, stiction = !linear;
  let x = 0.5, moving = false, y = Y0 + KP * trim(0.5);
  const buf = new Float64Array(DEAD + 1).fill(trim(0.5));
  let bi = 0;

  function actuate(cmd) {
    const want = Math.max(0, Math.min(1, cmd));
    let tgt = want;
    if (stiction) {
      if (!moving) {
        const gap = Math.abs(want - x);
        if (gap > STIC_D) { moving = true; tgt = x + Math.sign(want - x) * (gap - STIC_D + STIC_S); } else tgt = x;
      } else if (Math.abs(want - x) < 1e-9) { moving = false; tgt = x; }
    }
    x = Math.max(0, Math.min(1, x + Math.max(-RATE, Math.min(RATE, tgt - x))));
    return trim(x);
  }

  // SIMC PI at the schedule's working point (a bump test where the loop actually runs).
  const Kinst = installedGain(trim, invTrim(!linear, (tuneAt - Y0) / KP));
  const Kc = TAU / (Kinst * (tauc + THETA));
  const TI = Math.min(TAU, 4 * (tauc + THETA));
  let integ = 100 * invTrim(!linear, (sp0 - Y0) / KP);

  const loop = {
    get y() { return y; },
    get travel() { return x; },
    step(sp) {
      const e = sp - y;
      const u = Kc * e + integ;
      const uSat = Math.max(0, Math.min(100, u));
      integ += Kc * (TS / TI) * e + (uSat - u) * (TS / TI);
      buf[bi] = actuate(uSat / 100); bi = (bi + 1) % buf.length;
      y += (TS / TAU) * (Y0 + KP * buf[bi] - y);
      y = Math.round(y / QUANT) * QUANT;
      return y;
    },
  };
  for (let i = 0; i < 1200; i++) loop.step(sp0);
  return loop;
}

const SEG = 600, HOLD = 250;
const main = recipe([55, 75, 45, 68, 55], SEG, HOLD);
const heldOut = recipe([55, 70, 48, 80, 62, 55], SEG, HOLD);

const wrap = (linear) => (prog) => {
  const sp0 = prog.at(0);
  const loop = makeLoop({ sp0: sp0[0], linear });
  return { meas: (o) => { o[0] = loop.y; }, step: (sp) => { loop.step(sp[0]); } };
};

export const pidloop = {
  key: 'pid', name: 'PID temperature loop (nonlinear valve, SIMC PI)', units: '°C', nc: 1, dt: TS,
  main, heldOut, make: wrap(false),
  about: 'the ordinary case: a tuned PI loop on a nonlinear valve; the conventional rung should take most of it',
};

export const pidloopLinear = {
  key: 'pid-linear', name: 'PID temperature loop (LINEAR valve — a control)', units: '°C', nc: 1, dt: TS,
  main, heldOut, make: wrap(true), insideClass: true,
  about: 'the matched control: a linear plant inside the conventional model class, so its factor is not a result',
};
