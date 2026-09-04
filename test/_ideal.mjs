// IS THE IDEAL CORRECTION A FUNCTION OF THE MACHINE'S STATE? — the north star's central claim,
// asked as a measurement for the first time.
//
// THE OWNER'S THOUGHT EXPERIMENT. Slack the motors, grab the TCP, drag it along the path at the
// feedrate, and watch the joints. What you read off is theta*(t): what the joints must DO for the
// tip to be on the path GIVEN the flexibility. That is the dynamic inverse kinematics — ordinary
// `ik()` answers it for a rigid arm — and the whole pilot is an approximation of the difference.
//
// WHY IT CANNOT BE SOLVED POINTWISE, WHICH THIS SECTION MEASURED. The map from joint command to
// tool position has an amplitude-invariant REVERSE response in its cross channel, peaking 2800
// solver steps out, and it is pose-dependent. So the exact inverse carries right-half-plane
// structure and is unstable run forward, and there is no single operator to invert. It exists only
// as a WHOLE-TRAJECTORY, NON-CAUSAL solve — which is exactly what mode ⑩ does, and exactly why it
// needs the entire lap. The receding horizon is the causal approximation and the approximation is
// where the performance goes.
//
// AND WE DO NOT NEED THE DRAG EXPERIMENT TO GET theta*(t). A converged ILC table IS
// `theta*(t) - ik(path)`, measured on the real machine, and this project has one at 1.27e-2 on the
// rectangle. The ideal correction is not unknown; it is known, and DISCARDED because it is a
// memory — indexed by position in a lap, the one thing the retirement forbids.
//
// SO THE THOUGHT EXPERIMENT ASKS THE ONE QUESTION THE NORTH STAR RESTS ON: **is theta*(t) a
// function of the machine's STATE?** If it is, learn that map on a few programs, apply it on a
// program never run, and the memory's performance arrives without a memory — which is the
// retirement's stated goal, "get what the memory is worth OUT OF A MODEL". If it is not, the
// memory is irreducible and the model-only target is impossible, which is worth knowing outright.
//
// THE CLOSEST PRIOR WORK IS NOT THIS. Deflection was fitted as a function of state (held-out R^2
// 0.84) and applying it directly made the machine WORSE, 0.83-0.97x, because a forecast is not a
// controller: it has to be INVERTED, and the inversion is where it fails. The converged CORRECTION
// is a different object — the inversion is already baked into it, so a good fit can be applied
// directly.
//
// THE FEATURES ARE THE COMMANDED TRAJECTORY'S LOCAL SHAPE — pose, velocity, acceleration and jerk
// over a window of leads and lags. Deliberately NOT position-in-lap, which is the memory, and
// deliberately not the measured signals, which change when the correction is applied and would
// make the map self-referential. If the ideal correction is a function of what the machine is
// being ASKED to do, it transfers to any program by construction.
//
// WHAT WOULD KILL IT: held-out R^2 near zero, or a fit that scores well and DELIVERS nothing when
// applied (rule 16 — the fit is checked on the machine, not on itself).
import { solveRidge } from '/home/user/Tisaic.github.io/lib/pilot/pilot.js';
import { makeArm, mkPath, homeArm, routeSignals, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.ID_FEED || 0.004);
const SHAPES = (process.env.ID_SHAPES || 'rounded,circle,sharp').split(',');
const LAPS = +(process.env.ID_LAPS || 24);
const GAIN = +(process.env.ID_GAIN || 0.4);
const SMOOTH = +(process.env.ID_SMOOTH || 9);      // zero-phase, in samples
const S = 8;                                        // sample cadence in solver steps
// THE UPDATE NEEDS A LEAD, AND WITHOUT ONE IT DIVERGES RATHER THAN CONVERGING SLOWLY. The plant's
// response to a joint offset rises over ~1000 solver steps, so correcting bin i from the error at
// bin i lands the correction more than a hundred samples late — past 90 degrees of phase above the
// lap's second harmonic, where an ILC update AMPLIFIES instead of cancelling. Measured with no
// lead: |u| grows linearly and the error grows with it, 7.90e-2 -> 1.56e-1 in five passes. This
// project's own ILC says the same thing in one line — "updated between laps with a lead of one
// position-loop time constant and a zero-phase filter".
// AND THE LEAD IS MEASURED BY CONVERGENCE RATHER THAN ASSUMED — 40 / 90 / 140 / 200 / 280 samples
// deliver 1.1x / 2.2x / 3.2x / 1.9x / diverges on the rounded rectangle. The optimum sits at 140
// samples = 1120 solver steps, which is the kernel's own rise: the lead that makes the correction
// arrive when the plant responds to it.
const LEAD = +(process.env.ID_LEAD || 140);
const LEADS = (process.env.ID_LEADS || '-24,-12,-6,-2,0,2,6,12,24,48').split(',').map(Number);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}; ILC ${LAPS} laps, gain ${GAIN}, smooth ${SMOOTH}`);

/** One run of `laps` laps applying a per-sample periodic correction; returns per-sample error. */
async function run(path, tab, laps) {
  const { arm, servo } = await makeArm();
  homeArm(arm, servo, path);
  const lapSteps = Math.round(path.lap), n = Math.round(lapSteps / S);
  const e = [];
  for (let k = 0; k < lapSteps * laps; k++) {
    const c = path.at(k);
    const [q1, q2] = arm.ik(c.x, c.y, true);
    const rt = arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    const b = Math.floor(k / S) % n;
    const u = tab ? [tab[0][b], tab[1][b]] : [0, 0];
    const tau = servo.torques([{ theta: q1 + u[0], omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2 + u[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
    arm.step(tau[0], tau[1], 1);
    if (k % S === 0 && k >= lapSteps * (laps - 1)) e.push(routeSignals(arm, [{ pos: q1 }, { pos: q2 }], tau).truth.slice());
  }
  await arm.l1.destroy(); await arm.l2.destroy();
  return e;
}
const rms = (e) => Math.sqrt(e.reduce((a, v) => a + v[0] * v[0] + v[1] * v[1], 0) / (2 * e.length));
const zero = (a, half) => {                 // zero-phase box, periodic
  const n = a.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let d = -half; d <= half; d++) s += a[(i + d + n * 2) % n];
    out[i] = s / (2 * half + 1);
  }
  return out;
};

/** THE IDEAL CORRECTION, found by iteration on the machine — this is theta*(t) - ik(path). */
async function ideal(path) {
  const n = Math.round(Math.round(path.lap) / S);
  const tab = [new Float64Array(n), new Float64Array(n)];
  let best = null, bestRms = Infinity;
  const open = rms(await run(path, null, 2));
  for (let it = 0; it < LAPS; it++) {
    const e = await run(path, tab, 2);
    const r = rms(e);
    // THE ITERATION IS PRINTED, because a converged table that came back ZERO is indistinguishable
    // from a table that never moved, and the first run of this file could not tell them apart.
    if (process.env.ID_TRACE) {
      let pk = 0;
      for (let c = 0; c < 2; c++) for (const v of tab[c]) pk = Math.max(pk, Math.abs(v));
      console.log(`    it ${String(it).padStart(2)}  rms ${r.toExponential(4)}  |u| ${pk.toExponential(3)}`);
    }
    if (r < bestRms) { bestRms = r; best = tab.map((t) => Float64Array.from(t)); }
    for (let c = 0; c < 2; c++) {
      const upd = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const j = ((i + LEAD) % n + n) % n;
        upd[i] = tab[c][i] - GAIN * e[Math.min(j, e.length - 1)][c];
      }
      tab[c] = zero(upd, SMOOTH);
    }
  }
  return { tab: best, open, conv: bestRms };
}

/** Features: the COMMANDED trajectory's local shape. Never position-in-lap. */
function feats(path, i, n) {
  const row = [1];
  const at = (j) => {
    const k = (((j % n) + n) % n) * S;
    const c = path.at(k);
    return [c.x, c.y, c.vx, c.vy, c.ax, c.ay];
  };
  for (const L of LEADS) {
    const a = at(i + L);
    for (const v of a) row.push(v);
  }
  // and the local curvature/turn, which is what a corner IS
  const p0 = at(i - 2), p1 = at(i), p2 = at(i + 2);
  row.push(p2[0] - 2 * p1[0] + p0[0], p2[1] - 2 * p1[1] + p0[1]);
  return row;
}

const data = {};
for (const sh of SHAPES) {
  const path = mkPath(sh, FEED);
  const r = await ideal(path);
  const n = r.tab[0].length;
  const X = [], y = [[], []];
  for (let i = 0; i < n; i++) {
    X.push(feats(path, i, n));
    for (let c = 0; c < 2; c++) y[c].push(r.tab[c][i]);
  }
  data[sh] = { X, y, path, n, ...r };
  console.log(`  ${sh.padEnd(8)} open ${r.open.toExponential(3)} -> ideal ${r.conv.toExponential(3)}`
    + `  = ${(r.open / r.conv).toFixed(1)}x   |u*| peak `
    + `${Math.max(...r.tab[0].map(Math.abs), ...r.tab[1].map(Math.abs)).toFixed(4)}`);
}

console.log('\n  IS IT A FUNCTION OF THE COMMANDED STATE? — fit on the others, test on the held-out one');
console.log('  held out    ch    R^2 in-sample   R^2 HELD-OUT      delivered on the held-out program');
for (const test of SHAPES) {
  const tr = SHAPES.filter((s) => s !== test);
  const X = [], Y = [[], []];
  for (const sh of tr) {
    for (let i = 0; i < data[sh].n; i++) {
      X.push(data[sh].X[i]);
      for (let c = 0; c < 2; c++) Y[c].push(data[sh].y[c][i]);
    }
  }
  const pred = [new Float64Array(data[test].n), new Float64Array(data[test].n)];
  const r2s = [];
  for (let c = 0; c < 2; c++) {
    const w = solveRidge(X, Y[c], 1e-6, X[0].map(() => 1));
    const ev = (XX, yy) => {
      let sse = 0, sy = 0, sy2 = 0;
      for (let i = 0; i < XX.length; i++) {
        let p = 0; for (let j = 0; j < w.length; j++) p += w[j] * XX[i][j];
        const d = yy[i] - p; sse += d * d; sy += yy[i]; sy2 += yy[i] * yy[i];
      }
      return 1 - sse / Math.max(sy2 - (sy * sy) / XX.length, 1e-300);
    };
    for (let i = 0; i < data[test].n; i++) {
      let p = 0; const r = data[test].X[i];
      for (let j = 0; j < w.length; j++) p += w[j] * r[j];
      pred[c][i] = p;
    }
    r2s.push([ev(X, Y[c]), ev(data[test].X, data[test].y[c])]);
  }
  // THE FIT IS CHECKED ON THE MACHINE, NOT ON ITSELF (rule 16).
  const del = rms(await run(data[test].path, pred, 2));
  for (let c = 0; c < 2; c++) {
    console.log(`  ${c === 0 ? test.padEnd(10) : ' '.repeat(10)}  ${c}    `
      + `${r2s[c][0].toFixed(4).padStart(11)}   ${r2s[c][1].toFixed(4).padStart(11)}`
      + (c === 0 ? `      ${data[test].open.toExponential(3)} -> ${del.toExponential(3)}`
        + ` = ${(data[test].open / del).toFixed(2)}x   (ideal ${(data[test].open / data[test].conv).toFixed(1)}x)` : ''));
  }
}
console.log('EXIT 0');
