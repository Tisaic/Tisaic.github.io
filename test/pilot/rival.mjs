/**
 * @file THE RIVAL — norm-optimal ILC on this bench, target 8 of the north star, run last by
 * design: "a rival measured while the refusal machinery is still being repaired would measure
 * the wrong thing", and the machinery is now law-grade with a green suite.
 *
 * THE RIVAL IS GIVEN EVERYTHING THE PILOT GETS AND NOTHING MORE: the same machine, the same
 * truth instrument (tool error through the inverse Jacobian), the same per-sample cadence,
 * and the same installation question asked of both — an ILC needs an error signal every lap
 * exactly as adaptation needs a truth source, so the truth-availability switch applies to
 * both sides evenly. Its identification is model-free and its own: two probe laps (one clean,
 * one dithered), the lifted impulse response by cross-correlation, then steepest-descent
 * norm-optimal updates u_{k+1} = u_k − η·G'e_k with the adjoint applied as correlation.
 *
 * WHAT EACH SIDE OWNS, stated up front: the ILC's table is indexed by position-in-lap, so its
 * converged number is its home turf and its transfer to another program is the recorded 0.55x
 * failure mode; the pilot's composition is state-addressed and transfers, but its on-program
 * ceiling is the forecast bound. The comparison rows are chosen so both claims are visible.
 *
 * Run: node test/pilot/rival.mjs [SHAPES=sharp,circle] [LAPS=12]
 */
import { ContourScore, decompose } from '../../lib/flexisim/contour.js';
import { PG, makeArm, mkPath, homeArm, routeSignals } from './rigs/arm-rig.mjs';

const SHAPES = (process.env.SHAPES || 'sharp,circle').split(',');
const LAPS = +(process.env.LAPS || 12);
const FEED = +(process.env.FEED || 0.004);

async function bench(shape) {
  const path = mkPath(shape, FEED);
  const lap = Math.ceil(path.lap);
  const S = 9;                                   // the pilot's own sample on this plant
  const P = Math.ceil(lap / S);                  // samples per lap
  const M = 257;                                 // FIR taps of the lifted response

  // One machine per protocol run, homed identically.
  async function fresh() {
    const { arm, servo } = await makeArm();
    homeArm(arm, servo, path);
    return { arm, servo };
  }
  // Run one lap applying the per-sample correction table u (per joint), linearly
  // interpolated between samples the way the pilot's own _uNowOf ramps. Returns the
  // per-sample truth (tool error in joint units) and the contour score.
  async function runLap(m, u, score) {
    const e = [new Float64Array(P), new Float64Array(P)];
    for (let k = 0; k < lap; k++) {
      const c = path.at(k);
      const [q1, q2] = m.arm.ik(c.x, c.y, true);
      const rt = m.arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
      const si = Math.floor(k / S), t = (k - si * S) / S;
      const uu = [0, 1].map((j) => {
        const a = u[j][si % P], b = u[j][(si + 1) % P];
        return a + (b - a) * t;
      });
      const tau = m.servo.torques([
        { theta: q1 + uu[0], omega: rt.dq[0], alpha: rt.ddq[0] },
        { theta: q2 + uu[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
      m.arm.step(tau[0], tau[1], 1);
      if (k % S === 0) {
        const r = routeSignals(m.arm, [{ pos: q1 }, { pos: q2 }], tau);
        e[0][si % P] = r.truth[0]; e[1][si % P] = r.truth[1];
      }
      if (score) {
        const dec = decompose(path, m.arm.toolXY(), c);
        score.step(dec.contour, dec.lag, tau, [m.arm.j1.wM, m.arm.j2.wM]);
      }
    }
    return e;
  }

  const zero = [new Float64Array(P), new Float64Array(P)];
  const m = await fresh();

  // ---- identification, two probe laps: clean, then dithered; h by cross-correlation.
  const e0 = await runLap(m, zero, null);
  let seed = 31 >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  const AMP = 0.01;
  const d = [new Float64Array(P), new Float64Array(P)];
  for (let j = 0; j < 2; j++) for (let i = 0; i < P; i++) d[j][i] = AMP * rnd();
  const e1 = await runLap(m, d, null);
  const h = [new Float64Array(M), new Float64Array(M)];
  for (let j = 0; j < 2; j++) {
    let dd = 0;
    for (let i = 0; i < P; i++) dd += d[j][i] * d[j][i];
    for (let tau2 = 0; tau2 < M; tau2++) {
      let s2 = 0;
      for (let t = 0; t < P; t++) s2 += (e1[j][t] - e0[j][t]) * d[j][(t - tau2 + P) % P];
      h[j][tau2] = s2 / dd;
    }
  }
  // THE STEP SIZE COMES FROM THE PEAK FREQUENCY GAIN, NOT THE KERNEL ENERGY. The first
  // version used 0.5/Σh² and diverged in three laps (0.2 → 1.0 → 7.6), the exact unfiltered
  // divergence this bench's own record shows for ILC without a Q filter: steepest descent on
  // a circulant lifted plant is stable for η < 2/max|H(ω)|², and for a smoothing kernel that
  // peak dwarfs the energy. Computed directly on the lap's own frequency grid.
  const hMax2 = [0, 1].map((j) => {
    let mx = 0;
    for (let w = 0; w < P; w++) {
      let re = 0, im = 0;
      for (let tau2 = 0; tau2 < M; tau2++) {
        const ph = (2 * Math.PI * w * tau2) / P;
        re += h[j][tau2] * Math.cos(ph); im -= h[j][tau2] * Math.sin(ph);
      }
      const m2 = re * re + im * im;
      if (m2 > mx) mx = m2;
    }
    return mx;
  });

  // ---- norm-optimal steepest descent, LAPS laps on the same machine (an ILC's real life:
  // the table carries over, the plant keeps its state).
  const u = [new Float64Array(P), new Float64Array(P)];
  const ladder = [];
  for (let l = 0; l < LAPS; l++) {
    const score = new ContourScore({ joints: 2, reversalTravel: 2e-2 });
    const e = await runLap(m, u, score);
    ladder.push(score.report().contourRms);
    for (let j = 0; j < 2; j++) {
      const eta = 0.8 / Math.max(hMax2[j], 1e-12);
      const nu = new Float64Array(P);
      for (let t = 0; t < P; t++) {
        let s2 = 0;
        for (let tau2 = 0; tau2 < M; tau2++) s2 += h[j][tau2] * e[j][(t + tau2) % P];
        nu[t] = u[j][t] - eta * s2;
      }
      // THE Q FILTER, zero-phase and mild — the regularisation every convergent ILC on this
      // bench carries (PathILC's own lesson): without it the un-modelled high frequencies
      // integrate lap over lap.
      for (let t = 0; t < P; t++) {
        u[j][t] = 0.25 * nu[(t - 1 + P) % P] + 0.5 * nu[t] + 0.25 * nu[(t + 1) % P];
      }
    }
  }
  await m.arm.l1.destroy(); await m.arm.l2.destroy();
  return { ladder, P };
}

console.log('\nthe rival: norm-optimal ILC, model-free identification from two probe laps');
console.log(`  arm E ${PG.E} / K ${PG.K}; feed ${FEED}; ${LAPS} laps + 2 probe laps`);
for (const shape of SHAPES) {
  const t0 = Date.now();
  const { ladder } = await bench(shape);
  const tail = Math.min(...ladder.slice(-3));
  console.log(`  ${shape.padEnd(7)} ladder ${ladder.map((v) => v.toExponential(1)).join(' ')}`);
  console.log(`  ${shape.padEnd(7)} lap1 ${ladder[0].toExponential(3)}  tail ${tail.toExponential(3)}`
    + `  (${(ladder[0] / tail).toFixed(1)}x over its own lap 1)`
    + `  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
}
