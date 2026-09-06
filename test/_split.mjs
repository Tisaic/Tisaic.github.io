/**
 * @file WHERE THE 352 FEATURES ARE, and how many of them are lead-INDEPENDENT.
 *
 * The explicit gain took the QP from 61,006 MAC/cycle to 120 and left the FORECAST as the whole
 * remaining cost — 12,658 MAC, which is 127% of a PLC scan on its own. The route past it is the
 * same reassociation: u0 = sum_i k_i (w_i · row_i), so any position of the row whose VALUE is
 * the same at every lead folds into a single coefficient (sum_i k_i w_i[p]) evaluated ONCE
 * instead of N times.
 *
 * Whether that is worth building depends entirely on the SHARE. `_row` appends blocks in a fixed
 * order: the measured-state lag block reads `R.ring`, identical at every lead; the command block
 * reads `_cmdFuture(lookAhead, L - l*cs)` where `L = ro.leads[i]` MOVES with the lead; and the
 * lead-scaled block is `ell = i/(N-1)` and its products, which are lead-dependent by
 * construction. So this counts the blocks from the readout's own fitted geometry rather than
 * from the source, because the source is where the layout has already produced defects — the
 * length guard in `_forecast` exists because a block appended in one place and not the other
 * evaluates the model on a vector it was never fitted on.
 *
 * A large lead-independent share means the fold is most of the forecast and worth the risk. A
 * small one means the saving is in the COMMAND block, which needs the offsets to coincide before
 * it collapses, and that is a different and harder piece of work.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_split.mjs
 */
import { commissionArm } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'rounded';
const FEED = +(process.env.FEED || 4e-3);
const FB = process.env.BASIS === 'linear' ? 'linear' : null;

console.log(`\nwhere the features are — K ${PG.K} / E ${PG.E}, basis ${FB || 'chosen'}\n`);
const p = await commissionArm({ seed: 1, uCap: 0.6, train: { shape: SHAPE, feed: FEED },
  ...(FB ? { extra: { forceBasis: FB } } : {}) });

console.log(`  N ${p.N}, sample ${p.sample}, nm ${p.nm}, nc ${p.nc}`);
let total = 0, stateTot = 0;
p.readouts.forEach((ro, c) => {
  const nf = ro.w[0].length;
  // THE STATE BLOCK IS FIRST AND ITS SIZE IS `nm * mLag`, straight off the loop that builds it.
  // Counted from the readout's own fitted geometry, and the total is checked against the actual
  // weight length so a block this file does not know about shows up as a remainder rather than
  // being silently folded into one it does.
  const state = p.nm * ro.mLag;
  const cmd = p.nc * ro.fLag * 2;
  console.log(`  ch${c}: ${nf} features — bias 1, state ${state} (mLag ${ro.mLag} x nm ${p.nm}), `
    + `command ~${cmd} (fLag ${ro.fLag} x nc ${p.nc} x 2), remainder ${nf - 1 - state - cmd}`
    + `   basis ${ro.basis}`);
  total += nf; stateTot += state;
});
console.log(`\n  ${total} features across ${p.nc} channels, ${stateTot} of them lead-INDEPENDENT`
  + ` (${(100 * stateTot / total).toFixed(0)}%)`);
const c = p.cost();
console.log(`  forecast cost now ${Math.round(c.peakMacPerCycle - c.qp).toLocaleString()} MAC/cycle`);
console.log(`  folding ONLY the state block would evaluate ${stateTot} coefficients once instead`);
console.log(`  of ${p.N} times: about ${Math.round(stateTot * (p.N - 1)).toLocaleString()} MAC saved,`
  + ` if the block is where this file says it is.\n`);
