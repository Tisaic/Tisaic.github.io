// THE KERNEL IS A FIFTH OF THE PLANT'S MEMORY, AND THAT IS WHERE THE OWNER'S MECHANISM LIVES.
//
// THE MECHANISM, IN THE OWNER'S WORDS: "the motors have to preemptively create high frequency
// oscillation in the arm to get the tip to move in a way that the soft arm does not want to move
// it and then dampen the energy after that point with anti frequency motion" — and "the high
// frequency part is important because it is how the controller can manipulate the flexible links
// preemptively without the tip moving preemptively".
//
// WHAT THAT REQUIRES OF THE MODEL. Energy put into the structure NOW pays off LATER. A QP can
// only plan an effect its kernel carries, so the kernel must reach past the delay between the
// motor motion and the tip motion it is buying. It does not: `_finishProbe` stops the probe at
// `10 * rise` and on this arm that is 1800 solver steps, while `_resid` measured the elbow's own
// memory at 6363-8649. A model that ends at 1800 literally cannot represent "store now, collect
// at 5000" — the mechanism is OUTSIDE ITS SPAN, and every measurement that reads the high band
// as harmful is being taken on a model that cannot see what the band is for.
//
// AND `10` IS A PER-PLANT CONSTANT NOBODY RE-DERIVED (rule 31). It entered as an escape for a
// plant under a persistent disturbance — a barrel whose ambient drifts never goes quiet, and the
// probe ran to its 60000-step cap on every channel. That is a real failure and the escape is
// right to exist; ten rises is the number attached to it, and this arm terminates on it rather
// than on quiet, so on this plant the escape is not an escape, it is the rule.
//
// THE MEASUREMENT, IN TWO HALVES.
//   (1) HOW MUCH OF THE RESPONSE ARRIVES AFTER THE CUT. Commission at each `probeRises` and
//       report the kernel's length, its DC, and what fraction of the DC the SHIPPED 10-rise
//       length had already reached. If that fraction is ~1, the tail is flat and the truncation
//       is free — which would kill this outright.
//   (2) WHETHER IT REACHES THE MACHINE. Deploy each and score. The horizon N is derived from
//       Tset, so a longer probe can move N as well as the kernel; both are reported, because a
//       score that moved for the second reason is a different finding from one that moved for
//       the first.
//
// WHAT WOULD KILL IT: the kernel's DC is already reached at 10 rises AND the score is flat in
// `probeRises`. Then the memory measured by `_resid` is the plant's, not the CORRECTION PATH's,
// and the truncation is not the constraint.
import { commissionArm, deployOn, mkPath, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.HL_FEED || 0.004);
const UCAP = +(process.env.HL_UCAP || 0.6);
const RISES = (process.env.HL_RISES || '10,25,50').split(',').map(Number);
const SHAPES = (process.env.HL_SHAPES || 'sharp,circle,rounded').split(',');

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}`);
console.log(`lap ${Math.round(mkPath('sharp', FEED).lap)} steps; the elbow's measured memory is 6363-8649 steps`);

const rows = [];
let open = null;
for (const R of RISES) {
  const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
    uCap: UCAP, before: (p) => { p.probeRises = R; } });
  if (!pilot) { console.log(`  rises ${R}: commissioning never terminated`); continue; }
  if (!open) {
    open = {};
    for (const shape of SHAPES) open[shape] = (await deployOn(pilot, shape, false, FEED)).r.totalRms;
    console.log(`open loop: ${SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  ')}\n`);
  }
  // WHAT THE SHIPPED CUT WOULD HAVE MISSED: the response at 1800 steps against this kernel's
  // own settled DC, per channel. This is the number that says whether the tail is load-bearing.
  const CUT = 1800;
  const k = pilot.hs.map((h) => {
    const r = h.resp;
    const at = r[Math.min(r.length - 1, CUT)];
    return { len: r.length, dc: h.dc, Ts: h.Ts, Tset: h.Tset,
      frac: h.dc ? at / h.dc : NaN };
  });
  const cells = [];
  for (const shape of SHAPES) {
    const r = await deployOn(pilot, shape, true, FEED);
    cells.push(`${(open[shape] / r.r.totalRms).toFixed(2)}x u${r.uPk.toFixed(3)}`.padStart(17));
  }
  rows.push({ R, k, N: pilot.N, sample: pilot.sample, grid: pilot.grid, cells });
  console.log(`  rises ${String(R).padStart(3)}  resp ${k.map((x) => String(x.len).padStart(5)).join('/')}`
    + `  Tset ${k.map((x) => String(x.Tset).padStart(5)).join('/')}`
    + `  N ${String(pilot.N).padStart(3)}  reach ${String(pilot.N * pilot.grid * pilot.sample).padStart(6)}`
    + `  at1800/DC ${k.map((x) => x.frac.toFixed(3)).join('/')}`);
  console.log(`             ${cells.join('')}`);
}

console.log(`\n  probe hold, ${SHAPES.join(' / ')} at feed ${FEED}`);
console.log('   rises   resp len   horizon reach' + SHAPES.map((s) => s.padStart(17)).join(''));
for (const r of rows) {
  console.log(`  ${String(r.R).padStart(6)}  ${r.k.map((x) => x.len).join('/').padStart(9)}`
    + `  ${String(r.N * r.grid * r.sample).padStart(13)}${r.cells.join('')}`);
}
console.log('EXIT 0');
