// WHAT IS THE ROW ACTUALLY MADE OF? — the structural measurement that has to come before any
// feature cut, because the cut is now the highest-value lever and I have already reasoned wrongly
// about it once.
//
// WHY IT MATTERS TWICE OVER. Features cost LINEARLY in the forecast (`nf * leads * channels`) and
// QUADRATICALLY in the online fit (the shared covariance update is 2n^2 per sample). At the bench
// cell the fit is 87% of the sliced overage, so halving the row is worth ~4x there and ~2x in the
// forecast — the only lever that hits both of the two largest terms at once.
//
// AND THE HOIST SPLITS THE ROW IN A WAY THAT CHANGES WHICH COLUMNS ARE EXPENSIVE. The
// lead-INVARIANT block — the constant and the measured lags — is now evaluated ONCE for the whole
// horizon, so cutting it saves 1x in the forecast and n^2 in the fit. The lead-DEPENDENT block —
// the command lags and every rich block — is still evaluated per lead, so cutting it saves N times
// as much in the forecast AND the same n^2 in the fit. Those are different trades and a single
// "feature count" hides both.
//
// SO THIS FILE ONLY COUNTS, and reports what each cut would be worth. It asserts nothing: what a
// column is worth to the MACHINE is a separate measurement (rule 16), and the point here is to
// stop me guessing at the arithmetic before running it.
import { commissionArm, PG } from './pilot/rigs/arm-rig.mjs';
import { Stack } from '../lib/pilot/stack.js';

const FEED = 0.004, UCAP = 0.6;
const DEPTH = +(process.env.RM_DEPTH || 2);
const NFRAC = +(process.env.RM_NFRAC || 0.5);

const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
  uCap: UCAP, Cls: DEPTH > 1 ? Stack : undefined, extra: DEPTH > 1 ? { depth: DEPTH } : null });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const layers = pilot.layers || [pilot];
console.log(`arm K ${PG.K} / E ${PG.E}, depth ${DEPTH}, horizon fraction ${NFRAC}`);

let totFore = 0, totFit = 0;
for (let li = 0; li < layers.length; li++) {
  const p = layers[li];
  const N = Math.max(2, Math.round(p.N * NFRAC));
  console.log(`\n  layer ${li}: N ${p.N} -> ${N}, sample ${p.sample}, nm ${p.nm}, nc ${p.nc}`);
  for (let c = 0; c < p.nc; c++) {
    const ro = p.readouts[c];
    if (!ro || !ro.w) { console.log(`    ch ${c}: no readout`); continue; }
    const nf = ro.w[0].length;
    // THE SAME DECOMPOSITION `_row` BUILDS, in its order, so the counts are the code's and not a
    // second model of it: constant, measured lags, command lags (position + rate, plus
    // acceleration where armed), the fine command block, then everything past nBase.
    const nConst = 1;
    const nMeas = p.nm * (ro.mLag || 0);
    const perCmd = 2 + Math.min(1, p.cmdAccel || 0) * (p.cmdAccel || 0);
    const nCmd = p.nc * (ro.fLag || 0) * (2 + (p.cmdAccel || 0));
    const nFine = p.cmdFine ? p.nc * p.cmdFine.lags : 0;
    const base = nConst + nMeas + nCmd + nFine;
    const rich = nf - base;
    const invariant = nConst + nMeas;
    const dependent = nf - invariant;
    // The forecast under the hoist, and what it would be per cut.
    const fore = invariant + dependent * N;
    console.log(`    ch ${c}: ${nf} features`);
    console.log(`      lead-INVARIANT  ${String(invariant).padStart(4)}  (1 const + ${p.nm} signals x ${ro.mLag} lags)`);
    console.log(`      lead-DEPENDENT  ${String(dependent).padStart(4)}  (${nCmd} command + ${nFine} fine + ${rich} rich, past nBase)`);
    console.log(`      forecast cost   ${String(fore).padStart(6)} MAC   (hoisted; dense would be ${nf * N})`);
    console.log(`      RLS covariance  ${String(2 * nf * nf).padStart(6)} MAC   (2n^2, per sample)`);
    console.log(`      halving the row -> forecast ${Math.round(invariant / 2 + (dependent / 2) * N)},`
      + ` RLS ${2 * Math.round(nf / 2) ** 2}`);
    totFore += fore; totFit += 2 * nf * nf;
  }
}
console.log(`\n  TOTALS across every deployed channel:`);
console.log(`    forecast (hoisted)   ${totFore.toLocaleString()} MAC/decision`);
console.log(`    RLS covariance       ${totFit.toLocaleString()} MAC/sample`);
console.log(`    the fit is ${(totFit / Math.max(1, totFore)).toFixed(1)}x the forecast, which is why`
  + ' a feature cut is worth more there than anywhere else');
console.log('EXIT 0');
