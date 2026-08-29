// IS THE 4000-STEP SETTLE 4000 STEPS OF SETTLING, OR IS IT A ROUND NUMBER?
//
// `fresh()` pays five of these per scored run — four inside `commissionComp` and one onto
// the program start — and they are 32% of every run in the ladder. Rule 2 says shrink a
// too-slow check against its own margin, MEASURED not guessed. So: watch the quantities the
// settle exists to converge (the wind-up each pose is calibrated from, and the tip) and find
// where they stop moving, rather than trusting a round number.
import { machine } from './_rig.mjs';

const { arm, servo } = await machine({ K: 1, E: 0.06 });
const POSES = [[0.10, 0.30], [-0.05, 0.55], [0.25, 0.15], [0.00, 0.42]];

// HOW FAR IS 4000 FROM SETTLED? Run far past it and compare — the 4000-step reading cannot
// judge itself. A measurement taken across a transient describes the transient (rule 13).
console.log('\nis 4000 settled? run to 40000 and look back:');
for (const [a, b] of POSES.slice(0, 2)) {
  arm.setPose(a, b);
  const refs = [{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }];
  const at = {};
  for (let i = 1; i <= 40000; i++) {
    const t = servo.torques(refs);
    arm.step(t[0], t[1], 1);
    if ([2000, 4000, 8000, 16000, 32000, 40000].includes(i)) at[i] = arm.j1.windup();
  }
  const truth = at[40000];
  console.log(`  pose ${String(a).padStart(5)},${String(b).padStart(5)}  settled(40000) ${truth.toExponential(6)}`);
  for (const k of [2000, 4000, 8000, 16000, 32000]) {
    console.log(`      at ${String(k).padStart(5)}  ${at[k].toExponential(6)}`
      + `   ${(100 * Math.abs(at[k] / truth - 1)).toFixed(3)}% from settled`);
  }
}

console.log('\nwind-up during a settle, sampled every 250 steps (the quantity commissionComp reads):');
for (const [a, b] of POSES.slice(0, 2)) {
  arm.setPose(a, b);
  const refs = [{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }];
  const hist = [];
  for (let i = 1; i <= 4000; i++) {
    const t = servo.torques(refs);
    arm.step(t[0], t[1], 1);
    if (i % 250 === 0) hist.push([i, arm.j1.windup(), arm.j2.windup()]);
  }
  const [, f1, f2] = hist[hist.length - 1];
  // WHERE IT IS ALREADY THERE: first sample within 1e-6 RELATIVE of the 4000-step value, on
  // both joints. That is the tolerance `commissionComp` could possibly care about — the
  // calibration it feeds is a 2x2 least squares, not a bit-comparison.
  const conv = hist.find(([, w1, w2]) =>
    Math.abs(w1 / f1 - 1) < 1e-6 && Math.abs(w2 / f2 - 1) < 1e-6);
  console.log(`  pose ${String(a).padStart(5)},${String(b).padStart(5)}  final `
    + `${f1.toExponential(4)} / ${f2.toExponential(4)}   settled by step `
    + `${conv ? conv[0] : '>4000'}  (of 4000)`);
  for (const [i, w1] of hist.filter(([i]) => i % 1000 === 0)) {
    console.log(`      step ${String(i).padStart(4)}  windup1 ${w1.toExponential(6)}`
      + `  rel ${Math.abs(w1 / f1 - 1).toExponential(1)}`);
  }
}
