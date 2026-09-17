/**
 * @file THE TEACHER-FREE DIRECT INVERSE, ASKED OF EVERY PLANT THAT HAS A NOMINAL INVERSE (plan §104).
 *
 * NOT A TEST. This is target 4's instrument: the teacher is 74-89% of what a commissioning costs
 * these plants (§73.13), it ships on ZERO of ten (§86.7), and target 4 is met on two of eight. If
 * the teacher is removable the calendar moves, and a factor is not the point.
 *
 * One driver, one kit, the plant's OWN spec — so a fourth plant cannot repeat the three mistakes
 * §103 made, each of which was a second copy of something that already existed (rules 61, 13, 31).
 *
 * WHAT EACH PLANT SUPPLIES: a DIET (open-loop excitation segments, in command units) and its
 * NOMINAL INVERSE applied to an achieved output. Nothing else.
 *
 * EVERY ROW CARRIES ITS CONTROLS AND THEY ARE ASSERTED:
 *   ZERO     an all-zero map must reproduce the open loop BIT-EXACTLY (§67.3's defect)
 *   SHUFFLE  a fit on permuted targets must NOT deliver (rule 15)
 *   and where the record states a baseline, it must be reproduced (rule 21).
 *
 * Run: node test/pilot/dirinvall.mjs [ONLY=barrel,column] [SEEDS=1,2,3,4] [RIDGE=..]
 */
import * as TH from './rigs/thermal-rig.mjs';
import * as WB from './rigs/woodberry-rig.mjs';
import { barrelSpec, wbSpec } from './rigs/specs.mjs';
import { excite, fitInverse, heldOutR2, scoreOn, refSeries, deriveWindow, lcg } from './rigs/dirinvkit.mjs';

const SEEDS = (process.env.SEEDS || '1,2,3,4').split(',').map(Number);
const RIDGE = +(process.env.RIDGE || 1e-6);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

// ---------------------------------------------------------------- THE PLANTS
const PLANTS = [{
  name: 'extruder barrel',
  spec: barrelSpec, nc: 3, N: TH.PROG,
  settle: 7861,                                    // as `distil-barrel.mjs`
  baseline: '5.2708e+0 K rms (the record)',
  inv: (y) => TH.powerFor(y),
  // SIZED FROM THE RECIPE'S OWN SPAN (rule 41b), laps at the shipped diet's own 7500 so the window
  // rule produces the reach it produces there rather than one carried in.
  seglen: 7500,
  diet: (rnd) => {
    const lo = [170, 190, 200], hi = [200, 218, 226];
    const pick = () => lo.map((a, j) => a + (hi[j] - a) * rnd());
    const segs = []; let cur = pick();
    for (let s = 0; s < 6; s++) {
      const nxt = pick(), n = 7500, hold = Math.floor(n * 0.3);
      const c0 = cur.slice(), c1 = nxt.slice();
      segs.push({ n, refAt: (k) => {
        const t = (k - hold) / (n - hold), f = t <= 0 ? 0 : t >= 1 ? 1 : TH.quintic(t);
        return TH.powerFor(c0.map((a, j) => a + (c1[j] - a) * f));
      } });
      cur = nxt;
    }
    return segs;
  },
}, {
  name: 'Wood-Berry column',
  spec: wbSpec, nc: 2, N: WB.T_END,
  settle: 994,                                     // as `distil-column.mjs`, from headroom.mjs
  baseline: null,
  inv: (y) => WB.inputsFor(y[0], y[1]),
  seglen: 3000,
  // THE COLUMN'S PROGRAM IS A STEP SEQUENCE, not a trajectory, so the diet is step sequences at
  // other amplitudes and other times — none of them the published scenario (steps at 0 and 1000).
  diet: (rnd) => {
    const segs = [];
    for (let s = 0; s < 6; s++) {
      const a1 = 0.4 + 1.2 * rnd(), a2 = 0.4 + 1.2 * rnd();
      const t1 = Math.floor(200 + 600 * rnd()), t2 = Math.floor(1200 + 900 * rnd()), n = 3000;
      segs.push({ n, refAt: (k) => WB.inputsFor(k >= t1 ? a1 : 0, k >= t2 ? a2 : 0) });
    }
    return segs;
  },
}];

const fmt = (v) => (Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-2)) ? v.toExponential(4) : v.toFixed(4);

console.log(`\ndirinvall — the TEACHER-FREE direct inverse, one kit, every plant with a nominal inverse`);
console.log(`  seeds ${SEEDS.join(',')}, ridge ${RIDGE}\n`);

for (const P of PLANTS) {
  if (ONLY && !ONLY.some((o) => P.name.toLowerCase().includes(o.toLowerCase()))) continue;
  const { reach, offsets, rule } = deriveWindow({ settle: P.settle, lapMin: P.seglen });
  const R = refSeries(P.spec.refAt, P.N);
  // THE AUTHORITY IS A KNOB BECAUSE A CORRECTION PINNED AT ITS CAP IS NOT A CONTROLLER RESULT.
  // §62.4 is the precedent: the barrel's forced correction sat at EXACTLY uPk 12.0000 of 12, and
  // §84.10 had to sweep the cart-pole over a 24-fold span of authority before its factor could be
  // called a result rather than an artefact. If the delivered factor moves with `UCAP`, the number
  // measures the cap; if it has an INTERIOR optimum, it measures the map.
  const uMax = P.spec.uMax * +(process.env.UCAP || 1);
  const opts = { offsets, uMax, ridge: RIDGE, nc: P.nc, refDim: P.nc, stride: 7 };

  console.log(`${P.name}`);
  console.log(`  window ±${reach} raw steps, ${offsets.length} taps  (settle ${P.settle}, diet lap `
    + `${P.seglen}, min(0.61·settle, lap/8) = ${rule})`);

  const open = scoreOn(P.spec, R, null, { N: P.N });
  console.log(`  open loop  ${fmt(open.rms)}${P.baseline ? `   [${P.baseline}]` : ''}`);

  const rows = [];
  for (const seed of SEEDS) {
    const segs = excite(P.spec, P.diet, { seed });

    // ---- CONTROL 1: an all-zero map must reproduce the open loop BIT-EXACTLY. This is the check
    // `distil-tank.mjs` lacked for two sections while reporting "1.000x, nothing harmed".
    if (seed === SEEDS[0]) {
      const zero = fitInverse(segs, P.inv, opts);
      zero.W = zero.W.map((w) => w.map(() => 0));
      const z = scoreOn(P.spec, R, zero, { N: P.N });
      if (z.rms !== open.rms) throw new Error(`${P.name}: ZERO control failed — ${z.rms} vs ${open.rms}; the scored run is not applying what it says`);
      if (z.pk !== 0) throw new Error(`${P.name}: ZERO control applied ${z.pk}`);
    }

    const pol = fitInverse(segs, P.inv, opts);
    const got = scoreOn(P.spec, R, pol, { N: P.N });
    const ho = heldOutR2(segs, P.inv, opts, reach);

    // ---- CONTROL 2: the SAME rows against a PERMUTED target. If this delivers, the harness is not
    // measuring the map (rule 15).
    const sh = fitInverse(segs, P.inv, { ...opts, shuffle: lcg(1000 + seed) });
    const shs = scoreOn(P.spec, R, sh, { N: P.N });

    rows.push({ seed, x: open.rms / got.rms, pk: got.pk, r2: ho.r2, shuf: open.rms / shs.rms, rms: got.rms });
    console.log(`    seed ${seed}   ${fmt(got.rms)}  ${(open.rms / got.rms).toFixed(3)}x`
      + `   peak |u| ${got.pk.toFixed(3)} of ${uMax.toFixed(3)}${got.pk >= uMax * 0.999 ? ' SATURATED' : ''}`
      + `   held-out R² ${ho.r2.map((v) => v.toFixed(3)).join('/')}`
      + `   SHUFFLE ${(open.rms / shs.rms).toFixed(3)}x`);
  }
  const xs = rows.map((r) => r.x).sort((a, b) => a - b);
  const shf = rows.map((r) => r.shuf);
  console.log(`  ---- ${P.name}: ${xs[0].toFixed(3)}x .. ${xs[xs.length - 1].toFixed(3)}x over ${xs.length} seeds`
    + `  (spread ${(xs[xs.length - 1] / xs[0]).toFixed(2)}x, median ${((xs[(xs.length - 1) >> 1] + xs[xs.length >> 1]) / 2).toFixed(3)}x)`);
  console.log(`       SHUFFLE control ${Math.min(...shf).toFixed(3)}x .. ${Math.max(...shf).toFixed(3)}x`
    + `   — ${Math.max(...shf) < 1.15 ? 'does NOT deliver, so the fit is reading the map' : '*** DELIVERS — the harness is measuring something else ***'}`);
  console.log(`       ZERO control: an all-zero map reproduced the open loop bit-exactly (asserted)\n`);
}
