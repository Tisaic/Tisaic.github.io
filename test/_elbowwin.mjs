/**
 * @file THE ELBOW'S WINDOW AGAINST THE ELBOW'S OWN MEMORY — was a longer one rejected, or
 *       never offered?
 *
 * The owner's trace shows the tool bowing outward in a smooth ARC on every edge and reads the
 * elbow as its cause. The numbers agree that the elbow is the weak half: at K 0.25 / E 0.005 on
 * the sharp square its forecast reads r2Lead0 0.546 against the shoulder's 0.992 — and it is
 * also the channel looking back LEAST far, 1144 steps against 2904 (stride 13 against 33).
 *
 * AND THE TIMESCALE I FIRST CHECKED IT AGAINST WAS THE WRONG ONE. `_edgereach.mjs` compared the
 * window to the EDGE period (846 steps), which it spans, and concluded rule 37 was satisfied.
 * But plan §41's falsifier campaign measured the ELBOW'S OWN MEMORY at 6363-8649 steps —
 * "longer than a program lap, so windowed features truncate it and closed paths alias it".
 * Against that, 1144 steps is six to eight times short. Taking the visually obvious period for
 * the governing one is the same error as reading oscillation off a trace whose bias is
 * comparable, and both were made in the same hour.
 *
 * SO THE QUESTION IS WHICH KIND OF FAILURE THIS IS, and `lagScores` already holds the answer
 * because the search records every candidate it scored:
 *
 *   REJECTED  — long windows were offered and lost on held-out R^2. Then the window is not the
 *               constraint, the dictionary is, and lengthening it is measured dead before it is
 *               built.
 *   NEVER OFFERED — the candidate set never reached the elbow's memory. Then rule 37 applies
 *               and the fix is to offer windows that reach it.
 *
 * Reporting the reach of every candidate against the measured memory is what tells them apart,
 * and it costs one commissioning rather than a redesign (rule 1).
 *
 * Run: ARM_K=0.25 ARM_E=0.005 SUITE=full node test/_elbowwin.mjs
 */
import { commissionArm, mkPath } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'sharp';
const FEED = +(process.env.FEED || 1.6e-2);
const MEM = [6363, 8649];        // plan §41's measured elbow memory, in steps

const path = mkPath(SHAPE, FEED);
const LAP = Math.round(path.lap);
const p = await commissionArm({ seed: 1, uCap: +(process.env.UCAP || 0.6),
  train: { shape: SHAPE, feed: FEED } });
const st = p.status();
const S = p.sample;

console.log(`\nthe elbow's window against its own memory`);
console.log(`  K ${process.env.ARM_K || 16} / E ${process.env.ARM_E || 0.15}, ${SHAPE} at `
  + `feed ${FEED.toExponential(1)}   lap ${LAP}  edge ${(LAP / 4).toFixed(0)}  sample ${S}`);
console.log(`  plan §41's measured elbow memory: ${MEM[0]}-${MEM[1]} steps\n`);

st.report.readouts.forEach((r, c) => {
  const chosen = (r.lags - 1) * r.stride * S;
  console.log(`  ch${c} ${c === 1 ? '(elbow)' : '(shoulder)'}  chosen ${r.lags} lags x stride `
    + `${r.stride} = ${chosen} steps  r2Lead0 ${r.r2Lead0.toFixed(3)}  basis ${r.basis}`);
  console.log(`       reaches ${(chosen / MEM[0]).toFixed(2)}-${(chosen / MEM[1]).toFixed(2)} of `
    + `its own memory${chosen < MEM[0] ? '  — SHORT' : ''}`);
  const cand = r.lagScores || [];
  console.log(`       candidates offered (reach in steps -> held-out R^2):`);
  for (const s of cand) {
    const reach = (s.lag - 1) * (r.stride) * S;
    console.log(`         lag ${String(s.lag).padStart(3)}  ridge ${String(s.ridge).padEnd(6)}`
      + `  ~${String(reach).padStart(6)} steps  R^2 ${s.r2}`);
  }
  const longest = Math.max(...cand.map((s) => (s.lag - 1) * r.stride * S), 0);
  console.log(`       LONGEST candidate reached ${longest} steps = `
    + `${(longest / MEM[0]).toFixed(2)}x of the memory's low end — `
    + `${longest < MEM[0] ? 'NEVER OFFERED one that reaches it (rule 37 applies)'
      : 'a reaching window WAS offered, so any loss is the dictionary and not the window'}\n`);
});
