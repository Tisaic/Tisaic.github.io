// THE CROSS KERNEL IS IDENTIFIED WHILE HELD AND INVERTED WHILE MOVING, AND IT IS THE ONE TERM
// WHERE THAT MATTERS MOST.
//
// WHERE THIS COMES FROM. Arming the MIMO solve with the HELD probe's cross kernel is worth
// sharp 3.49x -> 3.91x, rounded 2.87x -> 3.03x, circle 2.76x -> 2.82x. That kernel is measured at
// ONE pose with the machine at rest, and the cross response is exactly the quantity `_nmp`
// measured as most pose-dependent: its linear half reverses to 18% of its own DC at one phase of
// the lap and 432% at another, peaking 2800-2960 solver steps out.
//
// THE SAME SWAP FAILED FOR THE DIAGONAL AND THAT IS THE REASON TO EXPECT IT HERE. `_hswap` put a
// moving-probe DIAGONAL kernel into the QP and measured 0.86x / 0.80x / 0.80x — worse on every
// program — because the held diagonal was already right: its DC matched to 1.6% and it has no
// transient to get wrong. The cross channel is the opposite case on both counts.
//
// THE MEASUREMENT. Difference two runs of the deterministic plant around a +du and a -du step at
// several phases of the lap, keep the SYMMETRIC half of each (the linear one — the antisymmetric
// half is the direction-dependent nonlinearity and an LTI kernel cannot carry it), average over
// the phases, and swap it into `hs[c].crossResp`. Rebuild through the pilot's OWN `_buildH` so
// the registration is the shipped one (rule 61); only the cross kernels change, and the diagonal
// is left exactly as commissioned.
//
// WHAT WOULD KILL IT: no better than the held cross kernel. Then one LTI cross model is one LTI
// cross model however it is measured, and what the pose dependence needs is SCHEDULING rather
// than a better average.
import { makeArm, mkPath, homeArm, routeSignals, commissionArm, deployOn, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.MV_FEED || 0.004);
const UCAP = +(process.env.MV_UCAP || 0.6);
const DU = +(process.env.MV_DU || 0.1);
const NPH = +(process.env.MV_NPH || 4);
const SHAPES = (process.env.MV_SHAPES || 'sharp,circle,rounded').split(',');
const SHAPE = process.env.MV_PROBE || 'sharp';

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}; moving cross probe on `
  + `${SHAPE}, ${DU} rad at ${NPH} phases`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
  uCap: UCAP, before: (p) => { p.mimo = true; } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const path = mkPath(SHAPE, FEED);
const LAP = Math.round(path.lap);
const LEN = pilot.hs[0].resp.length;
console.log(`lap ${LAP} steps; the commissioned cross kernels are ${LEN} steps long`);

const run = async (ch, at, du) => {
  const { arm, servo } = await makeArm();
  homeArm(arm, servo, path);
  const out = [];
  for (let k = 0; k < at + LEN + 8; k++) {
    const c = path.at(k);
    const [q1, q2] = arm.ik(c.x, c.y, true);
    const rt = arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    const on = du !== 0 && k >= at;
    const u = [on && ch === 0 ? du : 0, on && ch === 1 ? du : 0];
    const tau = servo.torques([{ theta: q1 + u[0], omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2 + u[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
    arm.step(tau[0], tau[1], 1);
    if (k >= at) out.push(routeSignals(arm, [{ pos: q1 }, { pos: q2 }], tau).truth.slice());
  }
  await arm.l1.destroy(); await arm.l2.destroy();
  return out;
};

// the symmetric (LINEAR) cross response of every output to a step on each channel, averaged
// over phases of the lap
const acc = [];
for (let c = 0; c < 2; c++) acc.push([new Float64Array(LEN), new Float64Array(LEN)]);
for (let p = 0; p < NPH; p++) {
  const at = Math.round(LAP + (p * LAP) / NPH);
  const base = await run(0, at, 0);
  for (let c = 0; c < 2; c++) {
    const plus = await run(c, at, DU), minus = await run(c, at, -DU);
    for (let oc = 0; oc < 2; oc++) {
      const n = Math.min(LEN, base.length, plus.length, minus.length);
      for (let i = 0; i < n; i++) {
        const rp = (plus[i][oc] - base[i][oc]) / DU, rm = (minus[i][oc] - base[i][oc]) / -DU;
        acc[c][oc][i] += (rp + rm) / (2 * NPH);
      }
    }
  }
}
for (let c = 0; c < 2; c++) {
  for (let oc = 0; oc < 2; oc++) {
    if (oc === c) continue;
    const r = acc[c][oc];
    const held = pilot.hs[c].crossResp && pilot.hs[c].crossResp[oc];
    let pk = 0, pkH = 0;
    for (let i = 0; i < r.length; i++) pk = Math.max(pk, Math.abs(r[i]));
    if (held) for (let i = 0; i < held.length; i++) pkH = Math.max(pkH, Math.abs(held[i]));
    const dc = r.slice(Math.floor(r.length * 0.9)).reduce((a, v) => a + v, 0) / Math.max(1, Math.ceil(r.length * 0.1));
    console.log(`  ${c}->${oc}: moving peak ${pk.toExponential(3)} DC ${dc.toExponential(3)}`
      + `   against the held probe's peak ${pkH.toExponential(3)}`);
  }
}

const open = {};
for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
console.log('\n  cross kernel' + SHAPES.map((s) => s.padStart(17)).join(''));
const saved = pilot.hs.map((h) => (h.crossResp ? h.crossResp.map((r) => (r ? Array.from(r) : null)) : null));
for (const src of ['held (ships)', 'moving']) {
  if (src === 'moving') {
    for (let c = 0; c < 2; c++) {
      for (let oc = 0; oc < 2; oc++) if (oc !== c) pilot.hs[c].crossResp[oc] = Array.from(acc[c][oc]);
    }
    pilot._buildH();
  }
  const cols = [];
  for (const s of SHAPES) {
    const d = await deployOn(pilot, s, true, FEED);
    cols.push(`${(open[s] / d.r.totalRms).toFixed(2)}x u${d.uPk.toFixed(3)}`.padStart(17));
  }
  console.log(`  ${src.padEnd(12)}${cols.join('')}`);
}
for (let c = 0; c < 2; c++) if (saved[c]) pilot.hs[c].crossResp = saved[c];
pilot._buildH();
console.log('EXIT 0');
