/**
 * @file THE ARM IS A COUPLED 2x2 AND THIS PILOT INVERTS A DIAGONAL.
 *
 * `_perchan.mjs` measured the four corners of (shoulder, elbow) x (narrow, wide) declared
 * velocity and the result is an INTERACTION rather than a channel. Either joint widened alone
 * beats the baseline (1.883 and 1.873 against 1.916); widening BOTH collapses it to 2.220 with
 * oscillation 65% worse. And across those four cells the elbow's held-out forecast runs 0.546,
 * 0.699, 0.478, 0.708 while the delivered contour runs 1.916, 1.883, 1.873, 2.220 — the best
 * forecast delivers the worst machine and the worst forecast delivers the best (rule 16).
 *
 * A fault that appears only when BOTH channels are excited fast, in a model that predicts well
 * and inverts badly, on a plant whose two joints are dynamically coupled, has one obvious
 * suspect: the excitation is now rich in CROSS-coupling and the fit has nowhere to put it but
 * the diagonal. This project has already found and repaired exactly that, on the textbook
 * strongly-coupled 2x2 — Wood-Berry's forecast went 0.74/0.84 to 0.986/0.993 and its delivered
 * IAE 82.10 to 52.52 when the library's opt-in `mimo` solve was armed.
 *
 * `mimo` HAS been run on this arm: `test/_mimo.mjs` measures it worth 12% on the sharp square at
 * the HOME feed (3.49x -> 3.91x, geometric mean +6.6%, nothing worse). What has not been run is
 * `mimo` against the WIDE excitation, which is the record that carries the coupling in the first
 * place — the 12% was measured on a narrow record where the cross channel is barely excited. And
 * the same work states the standing weakness: the cross kernel comes from a HELD probe at ONE
 * pose, while `_poseswp.mjs` measured the cross response at 18% of its DC at one phase of the lap
 * and 432% at another. A one-pose kernel inverting a record that now excites the coupling hard is
 * a candidate for making things worse, not better, and that is a real outcome here.
 *
 * So this runs the diagonal against the off-diagonal at BOTH excitations. The 1x row is the
 * control that says whether `mimo` is a general improvement or specifically the repair for the
 * wide record; the 2x row is the test.
 *
 * WHAT WOULD FALSIFY IT. If `mimo` leaves 2x/2x collapsed, the coupling is not what the wide
 * excitation broke and this is another dead route. And `mimo` is NOT free — CLAUDE.md records it
 * making the BARREL worse on every zone, and it costs nc^2 solve blocks against nc, which the
 * PLC budget counts (target 6). A win here is a win on ONE plant and would face the six-plant
 * pass before any default moved (rule 31).
 *
 * Run: ARM_K=0.25 ARM_E=0.005 SUITE=full node test/_mimowide.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'sharp';
const FEED = +(process.env.FEED || 1.6e-2);
const UCAP = +(process.env.UCAP || 0.6);
const BASE = { vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 };
const v = (m) => ({ ...BASE, vMax: BASE.vMax * m });
const MULTS = (process.env.MULTS || '1,2').split(',').map(Number);

console.log(`\ndiagonal against off-diagonal on a coupled 2x2 — K ${process.env.ARM_K || 16} / `
  + `E ${process.env.ARM_E || 0.15}, ${SHAPE} at feed ${FEED.toExponential(1)}`);
console.log(`  vMult  solve    r2 ch0   r2 ch1    total      contour     bias        osc        uPk`);

let off = null;
for (const m of MULTS) {
  for (const mimo of [false, true]) {
    const p = await commissionArm({ seed: 1, uCap: UCAP, limits: [v(m), v(m)],
      train: { shape: SHAPE, feed: FEED }, extra: { mimo } });
    const st = p.status(), ro = st.report.readouts;
    if (!off) off = await deployOn(p, SHAPE, false, FEED);
    const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED);
    // ASSERT THE SWITCH ACTUALLY TOOK. `report.mimo` is the pilot's own statement of whether an
    // off-diagonal H was built — a flag that is set and an operator that is used are different
    // things, and this project has shipped a toggle that changed nothing while every check
    // asserting wiring passed (rule 61).
    const armed = st.mimo;
    if (armed !== mimo) throw new Error(`mimo asked ${mimo} but report says ${armed}`);
    console.log(`  ${String(m).padStart(4)}x  ${(mimo ? 'mimo' : 'diag').padEnd(7)} `
      + `${ro[0].r2Lead0.toFixed(3)}    ${ro[1].r2Lead0.toFixed(3)}   `
      + `${r.r.totalRms.toExponential(3)}  ${r.r.contourRms.toExponential(3)}  `
      + `${r.r.contourBias.toExponential(3)}  ${r.r.contourOsc.toExponential(3)}  `
      + `${r.uPk.toFixed(3)}${p.verdict.deploy ? '' : '  REFUSED'}`);
  }
}
console.log(`\n  open loop                            ${off.r.totalRms.toExponential(3)}  `
  + `${off.r.contourRms.toExponential(3)}  ${off.r.contourBias.toExponential(3)}  `
  + `${off.r.contourOsc.toExponential(3)}\n`);
