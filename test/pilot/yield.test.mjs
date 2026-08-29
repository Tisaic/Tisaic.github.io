// CAN THE LADDER BE DRIVEN BY A HOST THAT YIELDS? — the one assumption the browser
// integration rests on, tested where it is cheap to test.
//
// `AutoStack.commission` drives the machine through `host.run` and `host.drivePilot`, and in
// Node those are tight loops that block until a scored run is finished. A browser cannot do
// that: one scored run on the arm is six laps of 7357 steps, which freezes the tab for
// seconds and drops the frame the user is watching. The page's existing pilot commissioning
// solves it by stepping a budget per frame and returning.
//
// Both host entry points are already `async`, so a browser host CAN await a frame inside
// them and resume where it left off. Whether the ladder still behaves identically when it
// does is a different question: `beginRun()`, `_identifying` and the clip counters are
// synchronous state on a shared object, and anything else touching `act()` between yields —
// a render loop drawing the arm, say — would interleave with commissioning and corrupt it.
//
// So: the same plant commissioned twice, once by a host that runs straight through and once
// by a host that awaits a macrotask every few samples. Identical results mean yielding is
// safe and the browser can host this. Different results mean the ladder carries state across
// an await that a frame boundary would break, and the integration needs a lock rather than
// a yield.
import { AutoStack } from '../../lib/pilot/autostack.js';
import { motionBasis } from '../../lib/pilot/classic.js';

let failed = 0;
const ck = (n, c, d) => { console.log(`  ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`); if (!c) failed++; };

const LAP = 192, CH = 1;
// A plant with a lap-periodic disturbance and a first-order response to the correction.
const wv = [new Float64Array(LAP)], wa = [new Float64Array(LAP)];
for (let k = 0; k < LAP; k++) {
  wv[0][k] = Math.cos(2 * Math.PI * k / LAP);
  wa[0][k] = -Math.sin(2 * Math.PI * k / LAP);
}
const dist = new Float64Array(LAP);
for (let k = 0; k < LAP; k++) {
  for (let h = 1; h <= 4; h++) dist[k] += 0.2 * Math.sin(2 * Math.PI * h * k / LAP + h);
}

/** @param {number} yieldEvery 0 = never yield; N = await a macrotask every N samples */
async function commissionWith(yieldEvery) {
  const auto = new AutoStack({
    channels: [{ lo: -2, hi: 2, vMax: 1, aMax: 1, jMax: 1 }],
    uMax: 1.5, periodic: LAP, maxDepth: 1, floor: 1e-6,
    basis: motionBasis([{ v: wv[0], a: wa[0] }]),
  });
  const run = async (corr, name) => {
    auto.beginRun();
    const e = new Float64Array(LAP);
    let s2 = 0, n = 0;
    for (let k = 0; k < LAP; k++) {
      const ctx = { v: [wv[0][k]], a: [wa[0][k]], k };
      const u = auto.act(ctx, corr ? corr.at(k) : null, name);
      // THE YIELD GOES WHERE A FRAME BOUNDARY WOULD: between samples, mid-run, with the
      // ladder's per-run state (clip counters, _identifying) live across it.
      if (yieldEvery && k % yieldEvery === 0) await new Promise((r) => setTimeout(r, 0));
      e[k] = dist[k] + 0.85 * u[0];
      s2 += e[k] * e[k]; n++;
    }
    return { score: Math.sqrt(s2 / n), err: [e] };
  };
  const rep = await auto.commission({ run });
  return { best: rep.best, gain: rep.gain, deployed: JSON.stringify(rep.deployed),
    rows: rep.rungs.map((r) => `${r.name}:${r.score.toExponential(6)}:${r.deployed}`).join('|') };
}

console.log('\ncan a yielding host drive the ladder?\n');
const straight = await commissionWith(0);
const yielding = await commissionWith(7);
console.log(`  straight through   ${straight.best.toExponential(6)}   ${straight.deployed}`);
console.log(`  yielding every 7   ${yielding.best.toExponential(6)}   ${yielding.deployed}\n`);

ck('a host that awaits mid-run reaches the SAME result as one that runs straight through — '
  + 'so the ladder carries no state across an await that a frame boundary would break',
  straight.best === yielding.best && straight.deployed === yielding.deployed,
  `${straight.best.toExponential(6)} vs ${yielding.best.toExponential(6)}`);
ck('…and every rung row matches, not just the final number — a ladder can reach the same '
  + 'place by a different route and that would still be a bug',
  straight.rows === yielding.rows, `\n    ${straight.rows}\n    ${yielding.rows}`);
ck('…and the commission actually did something, so the comparison is not two nulls',
  straight.gain > 1.5, `gain ${straight.gain.toFixed(2)}x`);

console.log(failed ? `\nyield: ${failed} check(s) FAILED\n` : '\nyield: all checks passed\n');
process.exit(failed ? 1 : 0);
