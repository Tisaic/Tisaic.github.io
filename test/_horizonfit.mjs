/**
 * @file CAN THE SCHEDULED BASIS FIT ON THE HORIZON KNOB ALONE? — the cheap route to the bench.
 *
 * The configuration that fits today forces a LINEAR basis, and that is the one real trade in it:
 * the scheduled block earns its place on held-out data (0.771 against 0.840) and every linear row
 * is below its scheduled twin — including on the SHARP SQUARE, which is the owner's bench program
 * and the one column the shipped path still wins (3.50x against the linear+gain's 3.21x, and the
 * scheduled+gain's 3.31x). So the scheduled basis inside the budget is the route AT the bench
 * regression rather than around it.
 *
 * TWO WAYS TO GET THERE AND THIS IS THE CHEAP ONE. The forecast is evaluated at every lead the
 * horizon carries, so its cost scales with N — and `qpsweep-arm` already measured this arm
 * preferring a SHORTER horizon on delivery as well as on cost ("2 iterations at N=44: 6.90x
 * against the shipped 5.95x"), with more horizon past the optimum making the machine WORSE. The
 * other way is folding the 41% of the row that is lead-independent, which needs the hottest and
 * most defect-prone loop in this project restructured; if the knob suffices, that risk is not
 * worth taking.
 *
 * THE HORIZON AND THE SOLVER ARE ON RECORD AS NOT SEPARABLE — at one iteration N=56 gives 14.16x
 * and N=68 gives 10.62x on EMPS — so a horizon swept against a FIXED solver is a slice through a
 * surface, not a ladder. That is legitimate here because the solver is no longer a knob: the
 * explicit gain is whatever `qpIters` produced, rebuilt at each N, and it costs 120 MAC either
 * way. What is being swept is the forecast's cost against its own delivery.
 *
 * WHAT WOULD KILL IT: no cell where the scheduled basis both fits and beats the linear one. Then
 * the fold is the only route and its risk has to be taken.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_horizonfit.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'rounded';
const HELDS = (process.env.HELD || 'circle,sharp').split(',');
const FEED = +(process.env.FEED || 4e-3);
const UCAP = +(process.env.UCAP || 0.6);
const HTS = (process.env.HTS || '1.5,1.2,0.9').split(',').map(Number);
const BUDGET = 10000;

console.log(`\nthe scheduled basis on the horizon knob — K ${PG.K} / E ${PG.E}, `
  + `${SHAPE} at feed ${FEED.toExponential(1)}, explicit gain armed\n`);
console.log(`  horizonTs    N   feat   MAC/cycle  %budget   ${SHAPE}   `
  + HELDS.map((h) => h.padStart(9)).join(''));

let base = null; const baseH = new Map();
for (const ht of HTS) {
  const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED },
    extra: { horizonTs: ht } });
  if (base === null) {
    base = (await deployOn(p, SHAPE, false, FEED)).r.totalRms;
    for (const h of HELDS) baseH.set(h, (await deployOn(p, h, false, FEED)).r.totalRms);
  }
  p.explicitGain = true;
  const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED);
  if (!p._gain) throw new Error('explicitGain armed and no gain was built');
  const cols = [];
  for (const h of HELDS) {
    const x = await deployOn(p, h, p.verdict.deploy, FEED);
    cols.push(`${(baseH.get(h) / x.r.totalRms).toFixed(2)}x`.padStart(9));
  }
  const c = p.cost();
  // The gain replaces the QP term; `cost()` still counts the QP, so the substitution is done
  // here rather than in the library, where a cost model edited to flatter a proposal would be
  // the instrument failing before the model.
  const mac = c.peakMacPerCycle - c.qp + (p.N + 1) * p.nc;
  console.log(`  ${ht.toFixed(2).padStart(8)}  ${String(p.N).padStart(3)}  `
    + `${String(c.features).padStart(4)}  ${String(Math.round(mac)).padStart(10)}  `
    + `${(100 * mac / BUDGET).toFixed(0).padStart(6)}%${mac <= BUDGET ? ' FITS' : '     '}  `
    + `${(base / r.r.totalRms).toFixed(2)}x` + cols.join(''));
}
console.log(`\n  open loop ${base.toExponential(3)}`);
console.log(`  for reference, inside budget on the LINEAR basis: 3.31x / 4.42x / 3.21x at 62%,`);
console.log(`  and the shipped path 2.87x / 2.76x / 3.50x at 737%.\n`);
