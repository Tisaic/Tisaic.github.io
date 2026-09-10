/**
 * @file TARGET 8 ON THE ARM — NORM-OPTIMAL ILC WHERE THE TWO LAWS SHOULD ACTUALLY DIFFER.
 *
 * `noilc.mjs` put the textbook law `Δu = (GᴴQG + R)⁻¹GᴴQe` against `hff`'s damped Newton step
 * on the EMPS axis with the SAME identified operator, and the two agreed to five figures —
 * including on the failure (0.53x on a trajectory the axis had never run). That agreement was
 * EXPECTED on that plant and this file says so: `hff`'s reach shrinkage is "on the axis inert
 * to four figures", so EMPS is precisely where the two laws should land together.
 *
 * THE ARM IS WHERE THE SHRINKAGE IS LOAD-BEARING — removing it costs 4.81x → 1.05x — so it is
 * the venue where the two discriminate, and it is the measurement target 8 has been missing.
 *
 * WHAT IS HELD FIXED, so that the LAW is the only variable (the confound that makes most
 * published head-to-heads unreadable): the machine, the program, the probe, the identification,
 * the operator `G`, the synthesis basis, the authority cap and the lap count. `runNoilc` borrows
 * the commissioned rung's own `exportOperator`, `_project` and `_table`. One knob differs: what
 * is done with G.
 *
 * AND IT DRIVES THE MACHINE THROUGH `makeArmHost`, NOT THROUGH A PRIVATE COPY. Three separate
 * copies of the arm's routing have each shipped a defect and a first draft of exactly this
 * harness invented an `arm.jointErr` that does not exist (rule 61). The host's `distilRuns()`
 * hands back a per-program `run(corr) -> {score, err}` — the signature `runNoilc` already takes.
 *
 * Not a test — an instrument. Run: node test/pilot/noilc-arm.mjs
 */
import { machine, settle, commissionComp } from '../flexisim/_rig.mjs';
import { makeArmHost } from '../../lib/flexisim/autohost.js';
import { sharpRect, roundedRect } from '../../lib/flexisim/toolpath.js';
import { HarmonicFF } from '../../lib/pilot/hff.js';
import { runNoilc } from './noilc.mjs';

const K = +(process.env.ARM_K || 0.25), E = +(process.env.ARM_E || 0.03);
const F = 4e-3;
const LAPS = +(process.env.LAPS || 24);
const CAP = +(process.env.CAP || 0.10);           // the engineer's authority, the same for both
const Q = +(process.env.Q || 1), R = +(process.env.R || 1e-4);

const path = sharpRect({ w: 8, h: 8, centre: [12, 0], feed: F, accel: 4e-5, cornerDt: 40 });
const held = roundedRect({ w: 8, h: 8, r: 2, centre: [12, 0], feed: F, accel: 4e-5, cornerDt: 40 });

const t0 = Date.now();
const m0 = await machine({ K, E });
const centre = m0.arm.ik(12, 0, true);
const host = makeArmHost({
  makeMachine: async () => {
    const m = await machine({ K, E });
    const rc = commissionComp(m.arm, m.servo);
    const c0 = path.at(0); const [q1, q2] = m.arm.ik(c0.x, c0.y, true);
    settle(m.arm, m.servo, q1, q2);
    return { arm: m.arm, l1: m.l1, l2: m.l2, servo: m.servo, rc };
  },
  path, lap: Math.ceil(path.lap), K, centre,
  classic: false, maxDepth: 0, demo: null, lapMemory: false, distil: null,
  avg: 2, warmup: 1,
});

/** The two programs, through the host's ONE drive loop. */
const [sq, rr] = await host.distilRuns({ paths: [path, held] });

const line = (s) => console.log(s);
line(`\nNORM-OPTIMAL ILC AGAINST THE HARMONIC RUNG, ON THE ARM — K ${K} / E ${E}, sharp square`);
line(`  same machine, same probe, same operator, same basis, same cap ${CAP}, ${LAPS} laps; Q ${Q} R ${R}\n`);

// ---- the harmonic rung: commission it, which also IDENTIFIES the operator both laws use.
const h = new HarmonicFF({ lap: sq.lap, channels: 2, uMax: CAP });
const rh = await h.commission(async (corr) => sq.run(corr));
line(`  hff    ${rh.base.toExponential(4)} -> ${rh.best.toExponential(4)}   ${(rh.base / rh.best).toFixed(2)}x`
  + `   (${rh.laps ?? '?'} laps, ${h.plan ? '' : ''}identification included)`);

// ---- the rival, on the operator the rung just measured.
//
// R IS SWEPT, AND THAT IS THE DIFFERENCE BETWEEN A FINDING AND A STRAW MAN. `R` is norm-optimal
// ILC's own regulariser: it weights `||u_{k+1} - u_k||` and is the textbook's knob for damping an
// update that a badly conditioned G would otherwise blow up. Quoting one value would make this
// "our tuned method beats their untuned one", which is not a comparison. ONE identification is
// re-used across the whole ladder, so the operator, the machine, the probe and the laps are held
// and only the law's constant moves — and `hff` gets NO corresponding sweep, so if the rival wins
// anywhere in its own knob it wins the comparison.
const RS = (process.env.RSWEEP || String(R)).split(',').map(Number);
const runs = [];
for (const rv of RS) {
  const rn = await runNoilc(h, async (corr) => sq.run(corr), { laps: LAPS, q: Q, r: rv });
  runs.push({ r: rv, rn });
  line(`  NOILC r ${String(rv).padEnd(8)} ${rn.base.toExponential(4)} -> ${rn.best.toExponential(4)}   ${(rn.base / rn.best).toFixed(2)}x`
    + `   (best of ${LAPS} laps; last ${rn.last.toExponential(4)})`);
  line(`    lap trace: ${rn.trace.map((v) => v.toExponential(2)).join(' ')}`);
}
const rn = runs.reduce((a, b) => (b.rn.best < a.rn.best ? b : a)).rn;

// ---- THE COLUMN THIS PROJECT CARES ABOUT: a program neither law has run.
//
// Both corrections are LAP-INDEXED at the square's lap. The rounded rectangle has its own lap,
// so the table is read at the matched PHASE FRACTION — which is the most generous reading a
// lap table can be given off its program, and is what `classic.js`'s 0.53x counter-example used.
// It is generous DELIBERATELY: a transfer failure under the most favourable indexing is a
// property of the object rather than of the index.
const phase = (tbl, lapFrom, lapTo) => ({
  at(k) { const j = Math.round((k / lapTo) * lapFrom) % lapFrom; return tbl.at(j); },
});
const bare = await rr.run(null);
const onH = await rr.run(phase({ at: (k) => h.at(k) }, sq.lap, rr.lap));
const onN = await rr.run(phase(rn.corr, sq.lap, rr.lap));
line(`\n  on the ROUNDED RECTANGLE, which neither law has run (phase-matched, the generous reading):`);
line(`    bare   ${bare.score.toExponential(4)}`);
line(`    hff    ${onH.score.toExponential(4)}   ${(bare.score / onH.score).toFixed(2)}x`);
line(`    NOILC  ${onN.score.toExponential(4)}   ${(bare.score / onN.score).toFixed(2)}x`);

line(`\n  ${Math.round((Date.now() - t0) / 1000)} s of Node, ${(host.samples().samples / 60000).toFixed(1)} machine-minutes.`);
line(`  READING: the two laws agreeing here as they did on EMPS says the difference is the`);
line(`  OPERATOR and not the update; the two SPLITTING says hff's confidence-and-reach shrinkage`);
line(`  is a real control decision and not a safety margin — which is what this plant is for.`);
await host.dispose(); await m0.l1.destroy(); await m0.l2.destroy();
