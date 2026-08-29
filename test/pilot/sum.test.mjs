import { AutoStack } from '../../lib/pilot/autostack.js';
let failed = 0;
const ck = (n, c, d) => { console.log(`  ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`); if (!c) failed++; };

const mk = (uMax, frames) => {
  const a = new AutoStack({ channels: [{ lo: -1, hi: 1, vMax: 1, aMax: 1, jMax: 1 },
    { lo: -1, hi: 1, vMax: 1, aMax: 1, jMax: 1 }], uMax, frames });
  a.classic = { live: () => [0.10, 0.20] };
  a.stack = { act: () => [0.01, 0.02], layers: [], observe() {} };
  a.hff = { at: () => [0.001, 0.002] };
  return a;
};
const ctx = { v: [1, 1], a: [0, 0], k: 0, look: () => [0, 0] };

// 1. each rung alone
const a1 = mk(99, {});
a1.deployed = { classic: true, stack: 0, hff: false };
const only1 = a1.act(ctx);
a1.deployed = { classic: false, stack: 1, hff: false };
const only2 = a1.act(ctx);
a1.deployed = { classic: false, stack: 0, hff: true };
const only3 = a1.act(ctx);
a1.deployed = { classic: true, stack: 1, hff: true };
const all = a1.act(ctx);
ck('all three armed is EXACTLY the sum of the three armed alone, to double precision',
  all.every((v, i) => Math.abs(v - (only1[i] + only2[i] + only3[i])) < 1e-15),
  `${JSON.stringify(all)} vs ${JSON.stringify(only1.map((v, i) => v + only2[i] + only3[i]))}`);
ck('…and each rung alone really contributes something, so the sum above is not three zeros',
  only1.some((v) => v !== 0) && only2.some((v) => v !== 0) && only3.some((v) => v !== 0),
  JSON.stringify([only1, only2, only3]));

// 2. a frame map is applied per rung, not to the sum
const rot = (u) => [-u[1], u[0]];
const a2 = mk(99, { classic: { map: rot } });
a2.deployed = { classic: true, stack: 1, hff: true };
const mapped = a2.act(ctx);
const expect = [rot(only1)[0] + only2[0] + only3[0], rot(only1)[1] + only2[1] + only3[1]];
ck('a rung declaring a frame is mapped OUT of it before summing, and the other rungs are NOT',
  mapped.every((v, i) => Math.abs(v - expect[i]) < 1e-15),
  `${JSON.stringify(mapped)} vs ${JSON.stringify(expect)}`);

// 3. the cap applies to the SUM, once
const a3 = mk(0.05, {});
a3.deployed = { classic: true, stack: 1, hff: true };
const capped = a3.act(ctx);
ck('the cap clamps the SUM and does so once — not each rung separately',
  capped.every((v) => Math.abs(v) <= 0.05 + 1e-15) && capped[0] === 0.05,
  JSON.stringify(capped));
ck('…and the clamp is COUNTED rather than silent', a3.clipping().frac > 0,
  JSON.stringify(a3.clipping()));

// 4. range accounting
const a4 = mk(99, {});
a4.deployed = { classic: true, stack: 1, hff: true };
a4.act(ctx);
const rg = a4.range();
ck('the peak DEMAND is recorded even when the cap never binds — the case a clamp counter '
  + 'cannot distinguish from safety',
  Math.abs(rg.peak[0] - 0.111) < 1e-12 && rg.cap === 99, JSON.stringify(rg));
ck('…and a cap larger than the channel box is reported as such, since it cannot protect it',
  rg.capBindsBeforeBox === false, JSON.stringify({ cap: rg.cap, travel: rg.travel }));

// 5. a rung returning NaN is caught rather than propagated silently
const a5 = mk(99, {});
a5.classic = { live: () => [NaN, 0] };
a5.deployed = { classic: true, stack: 0, hff: false };
a5.act(ctx);
ck('a rung returning NaN is COUNTED — NaN compares false against every bound, so no range '
  + 'check catches it by accident', a5.range().nonfinite === 1, JSON.stringify(a5.range()));

console.log(failed ? `\nsum: ${failed} FAILED\n` : '\nsum: all checks passed\n');
process.exit(failed ? 1 : 0);
