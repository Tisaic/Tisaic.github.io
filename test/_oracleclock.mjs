// THE DECISION CLOCK AGAINST THE ORACLE — the rung the oracle ladder pointed at.
//
// `test/_oracle.mjs` settled two of the three candidates: with a PERFECT free response the
// sharp square goes 2.15x -> 2.57x (the forecast is worth 20%), authority takes it to 3.65x
// and then saturates on its own (uPk 0.48 against a cap of 1.20), the effort weight is inert
// and the solver's iteration count is inert. Mode 10 delivers 44x on the same machine, so a
// factor of twelve is structural and none of those knobs is it.
//
// THE REMAINING SUSPECT IS THE CLOCK. The pilot re-decides every `sample * grid` solver steps
// — 72 here — and the sharp square's corner is a 40-step event. A controller that cannot
// resolve the event in TIME cannot correct it however well it predicts it, and that is a
// different failure from a bad forecast: the oracle is perfect at every lead and the plan is
// still piecewise-constant over 72 steps.
//
// So commission at a ladder of decision rates and run the oracle at each. The horizon is held
// at the same REACH in solver steps (N grows as grid shrinks), so the only variable is
// resolution. lambda is offered scaled as (dpt/30)^2 as well as unscaled, because the QP
// differences DECISION steps and brick 61 measured that scaling as load-bearing — though the
// oracle ladder measured lambda inert, so this is a control rather than an expectation.
//
// COST IS THE POINT OF THE LAST COLUMN. N grows as the grid shrinks and the QP is O(N^2) per
// iteration, so a finer clock is bought with arithmetic that target 6 has to pay for. A rung
// that wins at 40x the MAC budget is a finding, not a proposal.
import { commissionArm, deployOn, recordOpenLoop, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.OR_SHAPE || 'sharp';
const FEED = +(process.env.OR_FEED || 0.004);
const DPTS = (process.env.OR_DPTS || '30,60,120').split(',').map(Number);

console.log(`arm K ${PG.K} / E ${PG.E}, ${SHAPE} at feed ${FEED}`);
console.log('  dpt  grid  N   period  reach    open        shipped     +oracle    '
  + ' +or,uMax x2  +or,lam scaled   QP MAC/decision');
for (const dpt of DPTS) {
  const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, dpt });
  if (!pilot) { console.log(`  ${dpt}: commissioning never terminated`); continue; }
  const uMax0 = pilot.uMax, lam0 = pilot.lambda;
  const period = pilot.grid * pilot.sample;
  const off = (await deployOn(pilot, SHAPE, false, FEED)).r.totalRms;
  const shipped = (await deployOn(pilot, SHAPE, true, FEED)).r.totalRms;
  const rec = await recordOpenLoop(pilot, SHAPE, FEED);
  const or = { e: rec.e, lap: rec.lap, off: rec.lap };
  const oracle = (await deployOn(pilot, SHAPE, true, FEED, { oracle: or })).r.totalRms;
  pilot.uMax = 2 * uMax0;
  const orU = (await deployOn(pilot, SHAPE, true, FEED, { oracle: or })).r.totalRms;
  pilot.uMax = uMax0; pilot.lambda = lam0 * (dpt / 30) ** 2;
  const orL = (await deployOn(pilot, SHAPE, true, FEED, { oracle: or })).r.totalRms;
  pilot.lambda = lam0;
  // the QP's own arithmetic, the shape target 6 pays for: iters * N^2 per channel per decision
  const mac = pilot.qpIters * pilot.N * pilot.N * 2;
  const x = (v) => `${(off / v).toFixed(2)}x`;
  console.log(`  ${String(dpt).padStart(3)} ${String(pilot.grid).padStart(4)} `
    + `${String(pilot.N).padStart(4)} ${String(period).padStart(6)} `
    + `${String(pilot.N * period).padStart(6)}  ${off.toExponential(3)} `
    + ` ${shipped.toExponential(3)} ${x(shipped).padStart(7)} `
    + ` ${oracle.toExponential(3)} ${x(oracle).padStart(7)} `
    + ` ${x(orU).padStart(7)}      ${x(orL).padStart(7)}      ${mac.toLocaleString()}`);
}
console.log('EXIT 0');
