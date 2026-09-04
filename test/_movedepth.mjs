// DOES THE MOVING KERNEL COMPOSE WITH DEPTH? — the configuration every measurement in this arc
// points at, and the one that decides what ships.
//
// WHAT THE PIECES ARE. The pilot identifies `h` from a probe taken while the machine is HELD
// and inverts it while the machine is MOVING; a held joint must break stiction first and the
// shoulder carries the arm's gravity load, so its kernel is under-identified where the elbow's
// is not. Three instruments agree on the size: the moving step response is 1.18x the
// commissioned kernel on the shoulder and 1.006x on the elbow (`_hmove`); the shoulder's
// response LEADS the model by 13 samples against the elbow's 3 (`_hlag`); and the machine's own
// preferred scale peaks at 1.15-1.30 with every program turning over past it (`_hgain`).
//
// AND THE TWO EFFECTS ARE THE SAME SIZE. At uCap 0.6, depth 1 with the shoulder's kernel scaled
// 1.30 reads 3.56x / 6.60x / 4.49x; depth 2 with the kernel uncorrected reads 4.09x / 6.81x /
// 5.25x. A kernel correction costing NOTHING buys what a second commissioning buys. Whether
// they compose or merely overlap is the question — two mechanisms that fix the same deficit
// would not add, and this project has been caught reading an overlap as a sum before.
//
// MEASURED KERNEL, NOT A TUNED SCALAR (rule 31). 1.30 fitted to three programs is a per-plant
// constant of exactly the kind this file forbids; the moving probe is an instrument that
// re-derives it on any plant, and it is what the deployed rows use here. The scalar appears
// only as a reference row, so the two can be told apart.
import { Stack } from '/home/user/Tisaic.github.io/lib/pilot/stack.js';
import { commissionArm, deployOn, makeArm, mkPath, homeArm, routeSignals, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPES = (process.env.MD_SHAPES || 'sharp,circle,rounded').split(',');
const FEED = +(process.env.MD_FEED || 0.004);
const UCAP = +(process.env.MD_UCAP || 0.6);
const DEPTHS = (process.env.MD_DEPTHS || '1,2').split(',').map(Number);
const DU = +(process.env.MD_DU || 0.3);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}; moving probe at ${DU} rad`);
const path = mkPath('sharp', FEED);
const LAP = Math.round(path.lap);

// the moving step response, by differencing two runs of the deterministic plant
const movingResp = async (pilot) => {
  const RESPLEN = pilot.hs[0].resp.length, S = pilot.sample;
  const run = async (ch, at) => {
    const { arm, servo } = await makeArm();
    homeArm(arm, servo, path);
    const out = [];
    for (let k = 0; k < 2 * LAP + RESPLEN + 64; k++) {
      const c = path.at(k);
      const [q1, q2] = arm.ik(c.x, c.y, true);
      const rt = arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
      const on = at !== null && k >= at;
      const u = [on && ch === 0 ? DU : 0, on && ch === 1 ? DU : 0];
      const tau = servo.torques([{ theta: q1 + u[0], omega: rt.dq[0], alpha: rt.ddq[0] },
        { theta: q2 + u[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
      arm.step(tau[0], tau[1], 1);
      if (k >= LAP) out.push(routeSignals(arm, [{ pos: q1 }, { pos: q2 }], tau).truth.slice());
    }
    await arm.l1.destroy(); await arm.l2.destroy();
    return out;
  };
  const out = [];
  for (let ch = 0; ch < 2; ch++) {
    const base = await run(ch, null), pulsed = await run(ch, LAP);
    const n = Math.min(base.length, pulsed.length, RESPLEN);
    const r = new Array(n);
    for (let i = 0; i < n; i++) r[i] = (pulsed[i][ch] - base[i][ch]) / DU;
    const tailN = Math.max(1, Math.floor(n * 0.1));
    out.push({ resp: r, dc: r.slice(n - tailN).reduce((a, v) => a + v, 0) / tailN });
  }
  return out;
};

const open = {};
for (const depth of DEPTHS) {
  const st = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
    uCap: UCAP, Cls: Stack, extra: { depth } });
  if (!st) { console.log(`  depth ${depth}: never terminated`); continue; }
  const live = st.report.layers.filter((l) => l.deployed).length;
  const layers = st.layers.filter((p) => p.verdict && p.verdict.deploy);
  console.log(`\n  depth ${depth}: ${live} of ${st.layers.length} deployed`);
  const saved = layers.map((p) => p.hs.map((h) => ({ resp: h.resp, dc: h.dc })));
  const score = async (label) => {
    const cols = [];
    for (const shape of SHAPES) {
      if (!open[shape]) open[shape] = (await deployOn(st, shape, false, FEED)).r.totalRms;
      const r = await deployOn(st, shape, true, FEED);
      cols.push(`${r.r.totalRms.toExponential(3)} ${(open[shape] / r.r.totalRms).toFixed(2).padStart(6)}x`);
    }
    console.log(`    ${label.padEnd(22)} ${cols.join('  ')}`);
  };
  await score('commissioned h');
  // every deployed layer gets the moving kernel — each layer has its OWN `h` and each was
  // identified by its own held probe, so the defect is per layer and so is the repair
  for (const p of layers) {
    const mv = await movingResp(p);
    for (let c = 0; c < p.hs.length; c++) { p.hs[c].resp = mv[c].resp; p.hs[c].dc = mv[c].dc; }
    p._buildH();
  }
  await score('moving-probe h');
  layers.forEach((p, li) => {
    for (let c = 0; c < p.hs.length; c++) { p.hs[c].resp = saved[li][c].resp; p.hs[c].dc = saved[li][c].dc; }
    p._buildH();
  });
  // the tuned scalar, as a reference only — so a measured kernel and a fitted constant can be
  // told apart rather than quoted as one result
  for (const p of layers) {
    p.hs[0].resp = saved[layers.indexOf(p)][0].resp.map((v) => v * 1.30);
    p.hs[0].dc = saved[layers.indexOf(p)][0].dc * 1.30;
    p._buildH();
  }
  await score('shoulder x1.30 (tuned)');
  layers.forEach((p, li) => {
    for (let c = 0; c < p.hs.length; c++) { p.hs[c].resp = saved[li][c].resp; p.hs[c].dc = saved[li][c].dc; }
    p._buildH();
  });
}
console.log('EXIT 0');
