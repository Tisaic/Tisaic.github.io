// WHAT DOES THE QUADRATIC BLOCK COST, AND WHAT DOES IT BUY? — the first feature cut, and the one
// with the least risk attached.
//
// `_rowmake.mjs` measured the row: 176 features per channel, of which 73 are lead-invariant
// (constant + six routed signals at twelve lags) and 103 lead-dependent (48 command + 55 rich).
// The 55 is identifiable exactly: `nl` carries six measured newest plus four command newest, and
// 10 + C(10,2) = 55 — a FULL QUADRATIC BLOCK. So the basis search armed `poly` on these channels,
// which is worth knowing on its own: CLAUDE.md records "BOTH arm channels stay linear", and that
// was an earlier measurement of a search that runs afresh every commissioning.
//
// WHY THIS CUT FIRST. Features cost linearly in the forecast and QUADRATICALLY in the fit, and
// `_rowmake` measured the fit at 242,978 MAC/sample against the forecast's 14,233 — SEVENTEEN
// TIMES. Every solver change made today (horizon, hoist, move blocking) was working on the small
// term. Dropping 55 of 176 columns takes 2n^2 from 61,952 to 29,282 per channel, 2.1x, and it
// needs no new code: `forceBasis` already exists for exactly this question and its own comment
// says the refusal it encodes "is a machine question, and until it is asked on a machine there is
// no way to ask it at all".
//
// WHAT WOULD KILL IT: the linear basis delivering materially less. The quadratic block is offered
// under a 100x prior precisely so it must earn its weights, and this project has measured the
// selection tracking real physics elsewhere — the tank's sqrt(h) and the barrel's T^4 accept
// curvature, Wood-Berry declines it. If the arm's channels genuinely need it, the cut is not
// available and the budget has to come from the command lags or the measured window instead.
//
// BOTH COST TERMS ARE REPORTED BESIDE THE DELIVERED SCORE, because a cut that helps the budget
// and costs the machine is a trade the owner has to see whole.
import { commissionArm, deployOn, PG } from './pilot/rigs/arm-rig.mjs';
import { Stack } from '../lib/pilot/stack.js';

const FEED = 0.004, UCAP = 0.6, MU = 0.03;
const DEPTH = +(process.env.BC_DEPTH || 2);
const NFRAC = +(process.env.BC_NFRAC || 0.5);
const BLOCKS = +(process.env.BC_BLOCKS || 6);
const SHAPES = ['sharp', 'circle', 'rounded'];
const MODES = (process.env.BC_MODES || 'auto,linear').split(',');
// THE PER-CHANNEL PLANT GAIN, which `_hgainauto.mjs` measured the pilot can pick for itself from
// programs it designs — 3.482x -> 5.042x at depth 1 with every held-out program improving, and at
// no cost in arithmetic or commissioning. It belongs in this table because the budget question is
// what the machine delivers PER MAC, and a lever that is free on both axes changes that ratio
// without appearing in either cost column.
const HG = (process.env.BC_HGAIN || '1,1').split(',').map(Number);

const gm = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);
console.log(`arm K ${PG.K} / E ${PG.E}, depth ${DEPTH}, Nfrac ${NFRAC}, blocks ${BLOCKS}, mu ${MU}, hGain ${HG.join('/')}`);
let open = null;
console.log('\n  basis     features        sharp     circle    rounded   geo mean'
  + '    forecast      RLS 2n^2     deployed MAC');
for (const mode of MODES) {
  const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
    uCap: UCAP, Cls: DEPTH > 1 ? Stack : undefined, extra: DEPTH > 1 ? { depth: DEPTH } : null,
    before: (p) => {
      const fb = mode === 'auto' ? null : mode;
      p.forceBasis = fb;
      if (p.opts) p.opts.forceBasis = fb;
      (p.layers || []).forEach((q) => { q.forceBasis = fb; });
    } });
  if (!pilot) { console.log(`  ${mode}: commissioning never terminated`); continue; }
  const layers = pilot.layers || [pilot];
  for (const p of layers) {
    p.uWeight = MU > 0 ? new Array(p.nc).fill(MU) : null;
    p.qpBlocks = BLOCKS > 0 ? BLOCKS : null;
    p.N = Math.max(2, Math.round(p.N * NFRAC));
  }
  // Applied AFTER commissioning and before scoring, so the identified model is untouched and the
  // only thing that changes is how much the QP believes each move does.
  for (const p of layers) p.hs.forEach((h, ci) => {
    const g = HG[ci] ?? 1;
    if (g !== 1) for (let i = 0; i < h.hGrid.length; i++) h.hGrid[i] *= g;
  });
  if (!open) {
    open = {};
    for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
    console.log('  open loop:  ' + SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  '));
  }
  const xs = [], cols = [];
  for (const s of SHAPES) {
    const d = await deployOn(pilot, s, true, FEED);
    xs.push(open[s] / d.r.totalRms);
    cols.push(`${(open[s] / d.r.totalRms).toFixed(2)}x`.padStart(11));
  }
  let nfMax = 0, fore = 0, rls = 0, mac = 0;
  for (const p of layers) {
    const c = p.cost && p.cost();
    if (c) { mac += c.peakMacPerCycle || 0; fore += c.dots || 0; }
    for (const ro of (p.readouts || [])) {
      if (!ro || !ro.w) continue;
      const nf = ro.w[0].length;
      nfMax = Math.max(nfMax, nf); rls += 2 * nf * nf;
    }
  }
  console.log(`  ${mode.padEnd(9)}${String(nfMax).padStart(5)}   ${cols.join('')}`
    + `${gm(xs).toFixed(3).padStart(11)}x${fore.toLocaleString().padStart(12)}`
    + `${rls.toLocaleString().padStart(14)}${mac.toLocaleString().padStart(17)}`);
}
console.log('EXIT 0');
