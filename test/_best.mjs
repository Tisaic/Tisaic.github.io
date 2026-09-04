// COMPOSE EVERY POSITIVE MEASURED TODAY, ON ONE MACHINE, AGAINST THE SHIPPED CONTROL.
//
// Each of these was measured alone and none of them together. Alone, against the shipped
// configuration's geometric mean of 3.02 across sharp / circle / rounded at K 0.25 / E 0.03:
//
//   probeRises 25       3.53   the probe hold re-derived; it saturates at 25 (50 is byte-identical)
//   horizonTs 3.0       3.62   with the longer probe only; on the short kernel it is harmful
//   depth 2             5.25   the cascade, at the shipped probe hold
//   mu 0.03-0.10        3.97   Tikhonov on the QP, at ONE iteration, i.e. a quarter of the arithmetic
//   mimo                3.22   the cross model — and it does NOT compose, so it is not here
//
// TWO OF THESE ARE KNOWN NOT TO COMPOSE AND ARE EXCLUDED ON THAT EVIDENCE RATHER THAN ON TASTE:
// `mimo` measured -2% once `probeRises` moved to 25, because both act largely by asking for less
// correction more accurately, and the moving cross kernel was worse than the held one. The rest
// have never been run together, and "each helps alone" is not evidence that they add — this
// project has measured non-composition twice today alone.
//
// WHAT WOULD KILL IT: the composed configuration no better than the best single change (3.62 at
// depth 1, or depth 2's own 5.25). Then the levers overlap and what is left is one repair wearing
// four names.
import { commissionArm, deployOn, PG } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';
import { Stack } from '/home/user/Tisaic.github.io/lib/pilot/stack.js';

const FEED = +(process.env.BS_FEED || 0.004);
const UCAP = +(process.env.BS_UCAP || 0.6);
const SHAPES = (process.env.BS_SHAPES || 'sharp,circle,rounded').split(',');
const MUS = (process.env.BS_MUS || '0,0.03,0.1').split(',').map(Number);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}`);
const gm = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);
let open = null;

const rows = [
  { name: 'shipped        ', depth: 1, rises: 10, hTs: 1.5, iters: null },
  { name: 'rises25 hTs3   ', depth: 1, rises: 25, hTs: 3.0, iters: null },
  { name: 'depth2         ', depth: 2, rises: 10, hTs: 1.5, iters: null },
  { name: 'depth2 r25 h3  ', depth: 2, rises: 25, hTs: 3.0, iters: null },
  { name: 'depth2 r25 h3 q1', depth: 2, rises: 25, hTs: 3.0, iters: 1 },
];

for (const r of rows) {
  const extra = r.depth > 1 ? { depth: r.depth } : null;
  const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
    uCap: UCAP, Cls: r.depth > 1 ? Stack : undefined, extra,
    before: (p) => {
      const ls = p.layers ? p.layers : [p];
      const set = (q) => { q.probeRises = r.rises; q.horizonTs = r.hTs; if (r.iters) q.qpIters = r.iters; };
      set(p);
      // A Stack builds its layers lazily, so the same settings are applied through its opts too.
      if (p.opts) { p.opts.probeRises = r.rises; p.opts.horizonTs = r.hTs; if (r.iters) p.opts.qpIters = r.iters; }
      ls.forEach(set);
    } });
  if (!pilot) { console.log(`  ${r.name}: commissioning never terminated`); continue; }
  if (!open) {
    open = {};
    for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
    console.log(`open loop: ${SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  ')}`);
    console.log('\n  configuration       mu' + SHAPES.map((s) => s.padStart(17)).join('') + '     geo mean');
  }
  const layers = pilot.layers || [pilot];
  for (const mu of MUS) {
    for (const p of layers) p.uWeight = mu > 0 ? new Array(p.nc).fill(mu) : null;
    const xs = [], cols = [];
    for (const s of SHAPES) {
      const d = await deployOn(pilot, s, true, FEED);
      const x = open[s] / d.r.totalRms;
      xs.push(x); cols.push(`${x.toFixed(2)}x u${d.uPk.toFixed(3)}`.padStart(17));
    }
    console.log(`  ${r.name}  ${mu.toFixed(2)}${cols.join('')}   ${gm(xs).toFixed(2).padStart(10)}`);
  }
}
console.log('EXIT 0');
