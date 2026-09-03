// THE STIFF CELL'S STAGED IDENTIFICATION — the one cell of the ladder the protocol has
// never been run at (plan §43, stated-not-built). Soft (1/0.06) and canonical
// (0.25/0.03) both recover K/E to 5% and damping to a factor of two; the stiff end
// (K=16/E=0.15, the rig default) has smaller deflections, so the output-error signal
// is weakest exactly here. Same protocol byte-for-byte: 900-sample spanning wander,
// grid over the page ladders at damp/bl guesses, then 4-param coordinate descent.
import { identifyTwin, refineParams } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { drivePath, armSimulators } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
import { randomWander } from '/home/user/Tisaic.github.io/lib/flexisim/demopath.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, homeArm } = rig;
const SS = 9;
const STIFF_K = 16, STIFF_E = 0.15;
const mkRnd = (s) => { let z = s >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const wpath = randomWander(mkRnd(301), 0.004, { centre: [12, 0], reach: 6 });
const destroyArm = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const buildArm = async (params) => makeArm(params);

console.log('recording the stiff machine (K=16, E=0.15)…');
const m0 = await makeArm({ K: STIFF_K, E: STIFF_E });
homeArm(m0.arm, m0.servo, wpath);
const rec = await drivePath({ arm: m0.arm, servo: m0.servo, path: wpath, sample: SS, steps: 900 * SS });
await destroyArm(m0);

const sims = armSimulators({ buildArm, destroyArm,
  home: async (m, path) => homeArm(m.arm, m.servo, path), sample: SS });
const idSim = sims.identifySim(wpath, 900);
const grid = await identifyTwin({
  record: rec.e,
  simulate: (p) => idSim({ ...p, damp: 1e-3, bl: 0 }),
  space: [
    { name: 'K', values: [0.25, 0.5, 1, 2, 4, 8, 16, 20, 32] },
    { name: 'E', values: [0.03, 0.06, 0.10, 0.15, 0.22] },
  ],
  refine: 2,
});
console.log(`grid (damp/bl guessed): K=${grid.params.K.toPrecision(4)} E=${grid.params.E.toPrecision(4)} J=${grid.J.toExponential(2)}`);
const fit = await refineParams({
  record: rec.e,
  simulate: idSim,
  params: { K: grid.params.K, E: grid.params.E, damp: 1e-3, bl: 5e-5 },
  keys: [{ name: 'damp', factor: 3 }, { name: 'bl', factor: 3 },
    { name: 'K', factor: 1.15 }, { name: 'E', factor: 1.08 }],
  rounds: 2, shrink: [1.04],
});
console.log(`stiff machine identified K=${fit.params.K.toPrecision(4)} E=${fit.params.E.toPrecision(4)} `
  + `damp=${fit.params.damp.toExponential(2)} bl=${fit.params.bl.toExponential(2)} J=${fit.J.toExponential(2)}`);
const okK = Math.abs(fit.params.K - STIFF_K) <= 0.05 * STIFF_K;
const okE = Math.abs(fit.params.E - STIFF_E) <= 0.05 * STIFF_E;
const okD = fit.params.damp > 1.5e-3 && fit.params.damp < 6e-3;
console.log(`K within 5%: ${okK} (${(100 * (fit.params.K / STIFF_K - 1)).toFixed(1)}%)`);
console.log(`E within 5%: ${okE} (${(100 * (fit.params.E / STIFF_E - 1)).toFixed(1)}%)`);
console.log(`damp within x2 of 3e-3: ${okD} (${fit.params.damp.toExponential(2)})`);
console.log('EXIT 0');
