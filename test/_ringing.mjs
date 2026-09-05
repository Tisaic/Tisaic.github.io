/**
 * @file THE WIDER EXCITATION FORECASTS BETTER AND INVERTS WORSE — is the inversion the fault?
 *
 * `test/_declv.mjs` measured that raising the DECLARED velocity — the one limit rule 41b's
 * inertness result never moved, and the one its own explanation says binds the box traverse —
 * is NOT inert on the soft/fast cell. At 2x the elbow's forecast goes 0.546 -> 0.708 and the
 * SHOULDER's contour bias goes -1.479 -> -0.952, a 36% cut in the component the arcs live in.
 * The machine nonetheless gets worse, and rule 39's split says exactly where: OSCILLATION goes
 * 1.218 -> 2.006, 65% worse. Better fit, worse machine.
 *
 * That pairing is on record twice with the same explanation. The window/ridge search "picks the
 * looser ridge, which is a better held-out fit and a WORSE machine ... the QP inverts this model,
 * so regularisation serves the inversion, not the fit". And `qpsweep` named the mechanism
 * outright: "the converged solve RINGS and the truncated one does not", with the iteration count
 * a second regulariser on the inversion alongside lambda.
 *
 * So the hypothesis is that the wider-band model is BETTER and its inversion is what rings, in
 * which case the two knobs already measured to regularise that inversion should recover the
 * oscillation while keeping the bias. This commissions ONCE at each declared velocity and
 * re-deploys THAT SAME MODEL across the iteration and horizon ladders, so the only variable is
 * the solver's work — the instrument `qpsweep.mjs` is built on, reused rather than rewritten.
 *
 * WHAT WOULD FALSIFY IT: if the oscillation at 2x does not come down as iterations are cut, the
 * ringing story is wrong and the wider excitation is simply identifying a worse plant. And if it
 * comes down but the BIAS goes back up with it, the two are one quantity and there is nothing to
 * win — which is the outcome to expect if the extra bias accuracy was being bought BY the
 * aggressive inversion rather than by the better model.
 *
 * Run: ARM_K=0.25 ARM_E=0.005 SUITE=full node test/_ringing.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'sharp';
const FEED = +(process.env.FEED || 1.6e-2);
const UCAP = +(process.env.UCAP || 0.6);
const MULTS = (process.env.MULTS || '1,2').split(',').map(Number);
const ITERS = (process.env.ITERS || '1,2,4,8').split(',').map(Number);
const BASE = { vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 };

console.log(`\nis it the model or the inversion? — K ${process.env.ARM_K || 16} / `
  + `E ${process.env.ARM_E || 0.15}, ${SHAPE} at feed ${FEED.toExponential(1)}\n`);

let off = null;
for (const m of MULTS) {
  const limits = { ...BASE, vMax: BASE.vMax * m };
  const p = await commissionArm({ seed: 1, uCap: UCAP, limits, train: { shape: SHAPE, feed: FEED } });
  const ro = p.status().report.readouts;
  const built = p.qpIters, NFULL = p.N;
  if (!off) off = await deployOn(p, SHAPE, false, FEED);
  console.log(`  vMax ${limits.vMax.toExponential(2)} (${m}x)   r2 ${ro[0].r2Lead0.toFixed(3)}`
    + ` / ${ro[1].r2Lead0.toFixed(3)}   commissioned at qpIters ${built}, N ${NFULL}`);
  console.log(`    iters      N     total      contour     bias        osc         uPk`);
  for (const it of ITERS) {
    // BOTH KNOBS, BECAUSE THEY ARE NOT SEPARABLE — the project's own sweep measured the best
    // cell of the grid moving in both at once (at one iteration N=56 gives 14.16x and N=68
    // gives 10.62x), which is what two regularisers on one inversion look like.
    for (const nf of [1, 0.75, 0.5]) {
      const nn = Math.max(4, Math.round(NFULL * nf));
      p.qpIters = it; p.N = nn;
      const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED);
      console.log(`    ${String(it).padStart(5)}  ${String(nn).padStart(5)}   `
        + `${r.r.totalRms.toExponential(3)}  ${r.r.contourRms.toExponential(3)}  `
        + `${r.r.contourBias.toExponential(3)}  ${r.r.contourOsc.toExponential(3)}  `
        + `${r.uPk.toFixed(3)}`);
    }
  }
  p.qpIters = built; p.N = NFULL;
  console.log('');
}
console.log(`  open loop                    ${off.r.totalRms.toExponential(3)}  `
  + `${off.r.contourRms.toExponential(3)}  ${off.r.contourBias.toExponential(3)}  `
  + `${off.r.contourOsc.toExponential(3)}\n`);
