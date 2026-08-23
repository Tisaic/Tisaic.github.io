/**
 * @file ITERATIVE LEARNING ON A REPEATING PATH, against a plant whose delay is KNOWN.
 *
 * The value of this check is not that ILC converges — almost any gain converges on
 * something. It is that the update's LEAD has to match the plant's own delay, and that
 * both sides of that match are failures rather than mild degradations: with no lead the
 * thing winds up, and with too much lead it winds up harder. A convergence check that
 * only ever ran at the shipped lead would pass with the mechanism removed.
 *
 * The plant here is a pure delay in series with a first-order lag, because that pair has
 * a group delay that can be written down: D samples of transport plus a/(1-a) of lag.
 * The arm the page actually drives is neither, which is exactly why the number that goes
 * on the page is measured there and not inferred from here.
 */
import { PathILC, smoothRing } from '../../lib/flexisim/pathilc.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nflexisim: iterative learning on a path');

// ------------------------------------------------------------------ the ring filter
{
  const n = 37;
  const a = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 0.7) + (0.3 * i) % 1);
  const naive = (x, h) => {
    const P = x.length, o = new Float64Array(P);
    for (let i = 0; i < P; i++) {
      let s = 0;
      for (let j = -h; j <= h; j++) s += x[((i + j) % P + P) % P];
      o[i] = s / (2 * h + 1);
    }
    return o;
  };
  let worst = 0;
  for (const h of [1, 3, 8, 18]) {
    const A = smoothRing(a, h), B = naive(a, h);
    for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(A[i] - B[i]));
  }
  // The running sum is O(P) rather than O(P*width); it has to agree with the definition
  // to the last bit or the saving is a bug.
  check('the running-sum ring filter equals the definition', worst < 1e-12,
    worst.toExponential(2));

  // ZERO PHASE IS THE PROPERTY THAT MATTERS, and it is what a causal filter would break:
  // a symmetric bump must come out symmetric about the same bin. A one-sided filter
  // moves its centroid, which on this correction is exactly the lead error the class
  // exists to get right.
  const P = 64, bump = new Float64Array(P);
  for (let i = -3; i <= 3; i++) bump[(20 + i + P) % P] = 1 - Math.abs(i) / 4;
  const sm = smoothRing(bump, 5);
  let num = 0, den = 0;
  for (let i = 0; i < P; i++) { num += i * sm[i]; den += sm[i]; }
  check('…and it is zero phase — the centroid does not move', Math.abs(num / den - 20) < 1e-9,
    (num / den).toFixed(6));
}

// ------------------------------------------------------------------ the table
{
  const ilc = new PathILC({ length: 10, joints: 2, bins: 20, gain: 1, smooth: 0 });
  ilc.observe(0.05, [0.1, -0.2]);
  ilc.observe(5.05, [0.3, 0]);
  const st = ilc.endLap();
  check('a visited bin takes the negated error', Math.abs(ilc.offset(0.05)[0] + 0.1) < 1e-15
    && Math.abs(ilc.offset(0.05)[1] - 0.2) < 1e-15, JSON.stringify(ilc.offset(0.05)));
  // A BIN NOBODY VISITED IS NOT A BIN WITH ZERO ERROR. Treating it as one drags the
  // correction back toward nothing wherever the machine was moving fastest, which is
  // where the table is most needed.
  check('…and an unvisited one is left alone, not driven to zero',
    ilc.offset(2.05)[0] === 0 && st.covered === 0.1, JSON.stringify(st));
  check('the bin index wraps rather than running off the end',
    ilc.bin(10.05) === ilc.bin(0.05) && ilc.bin(-0.45) === 19,
    `${ilc.bin(10.05)} ${ilc.bin(0.05)} ${ilc.bin(-0.45)}`);
}

// ------------------------------------------------------------------ convergence
//
// The whole point: sweep the lead across the plant's own delay and require the shape.
{
  const P = 600, D = 8, a = 0.9;
  const ref = (n) => 0.3 * Math.sin(2 * Math.PI * n / P) + 0.1 * Math.sin(6 * Math.PI * n / P + 1);
  const trial = (lead, laps = 25) => {
    const ilc = new PathILC({ length: P, joints: 1, bins: P, gain: 1, smooth: 4,
      leadBins: lead });
    const hist = new Float64Array(D + 1);
    let y = 0, hp = 0;
    const out = [];
    for (let L = 0; L < laps; L++) {
      let s2 = 0;
      for (let n = 0; n < P; n++) {
        hist[hp] = ref(n) + ilc.offset(n)[0];
        hp = (hp + 1) % (D + 1);
        y = a * y + (1 - a) * hist[hp];
        const e = y - ref(n);
        ilc.observe(n, [e]);
        s2 += e * e;
      }
      out.push(Math.sqrt(s2 / P));
      ilc.endLap();
    }
    return out;
  };
  const rows = [0, 5, 10, 15, 20, 30, 60].map((lead) => {
    const h = trial(lead);
    return { lead, first: h[0], last: h[h.length - 1] };
  });
  for (const r of rows) {
    console.log(`    [lead ${String(r.lead).padStart(2)}] ${r.first.toExponential(2)} → `
      + `${r.last.toExponential(2)}   ${(r.first / r.last).toExponential(2)}×`);
  }
  const at = (l) => rows.find((r) => r.lead === l);
  // The plant's group delay is D + a/(1-a) = 8 + 9 = 17 samples, so the working leads
  // straddle it and the measured optimum sits at 10-15.
  check('a lead near the plant\'s own delay converges by two orders of magnitude',
    at(10).first / at(10).last > 100 && at(15).first / at(15).last > 100,
    `${(at(10).first / at(10).last).toExponential(1)} / `
    + `${(at(15).first / at(15).last).toExponential(1)}`);
  check('…with NO lead it winds up instead — the update is credited to the wrong place',
    at(0).last > 5 * at(0).first, `${at(0).last.toExponential(2)} vs ${at(0).first.toExponential(2)}`);
  check('…and too much lead winds up harder still, so the optimum is interior',
    at(60).last > at(30).last && at(30).last > at(0).last,
    `${at(30).last.toExponential(1)} / ${at(60).last.toExponential(1)}`);
  // A ZERO GAIN IS THE CONTROL THAT SHARES NO BUG WITH ANY OF THE ABOVE: the plant is
  // deterministic, so with the learner switched off every lap must read identically.
  const frozen = (() => {
    const ilc = new PathILC({ length: P, joints: 1, bins: P, gain: 0, smooth: 4,
      leadBins: 10 });
    const hist = new Float64Array(D + 1);
    let y = 0, hp = 0;
    const out = [];
    for (let L = 0; L < 4; L++) {
      let s2 = 0;
      for (let n = 0; n < P; n++) {
        hist[hp] = ref(n) + ilc.offset(n)[0];
        hp = (hp + 1) % (D + 1);
        y = a * y + (1 - a) * hist[hp];
        s2 += (y - ref(n)) ** 2;
        ilc.observe(n, [y - ref(n)]);
      }
      out.push(Math.sqrt(s2 / P));
      ilc.endLap();
    }
    return out;
  })();
  check('at zero gain the laps repeat exactly, so the improvement is the learner',
    Math.abs(frozen[3] - frozen[2]) < 1e-12, frozen.map((x) => x.toExponential(3)).join(' '));
}

console.log(failed ? `\npathilc: ${failed} check(s) FAILED\n` : '\npathilc: all checks passed\n');
process.exit(failed ? 1 : 0);
