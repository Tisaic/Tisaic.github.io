/**
 * Not a test — DOES THE RINGING FREQUENCY MOVE WITH POSE? (plan §52.34's falsifier.)
 *
 * §52.34 proposes giving the distilled policy a bank of SECOND-ORDER RESONATORS driven by the
 * commanded reference, on the argument that an FIR window is a hopeless basis for a lightly
 * damped resonance and that every capacity experiment in this arc added functions of the same
 * truncated history rather than MEMORY. That proposal has one falsifier and it is named first:
 * a bank of FIXED resonators is the wrong observer if the mode's FREQUENCY moves with pose,
 * because a gain-scheduling block can rescale a contribution and cannot repair a frequency.
 *
 * The frequency that matters is the CLOSED-LOOP one — the resonator models the map from the
 * commanded reference to the tool error, and that map runs through the servo. `ChainServo`
 * sizes `kp` from `Jeff = M[i][i] + N²·Jm`, and `M` varies with the elbow, so the gains are
 * frozen at commissioning while the inertia they act on is not: w² ~ kp/Jeff moves with pose
 * BY CONSTRUCTION. `timescales.mjs` computes its mode table from constants that carry no pose
 * at all, so it cannot answer this (rule 16: a number computed from the model cannot check the
 * model), and the answer has to come from the plant.
 *
 * So: hold the arm at a ladder of poses across the workspace the programs actually use, hit it
 * with a brief torque PULSE (an impulse, not a step, so what remains is the free ring), and
 * measure the dominant period of the decaying oscillation in the tool error — by autocorrelation
 * of the detrended record, which does not assume a single mode and degrades honestly when there
 * is not one. Beside it, the analytic Jeff ratio, which PREDICTS the spread if the mechanism is
 * the one named above; the two agreeing is the only thing that makes either trustworthy (rule 15).
 *
 * WHAT THE ANSWER MEANS, decided before it is read so it cannot be read to taste:
 *   - period roughly constant across poses  -> a fixed bank of 2-4 resonators covers the plant.
 *   - period spread by a factor F           -> a bank must SPAN F. Since the deployed cost is
 *                                              ~2 MAC per resonator per step against the policy's
 *                                              274, even F = 3 is a dozen resonators and free;
 *                                              the proposal survives, wider and duller.
 *   - no coherent ring at all               -> there is no resonance to represent and §52.34's
 *                                              whole argument is wrong.
 */
import { machine, settle } from '../flexisim/_rig.mjs';

const K = +(process.env.ARM_K || 0.25), E = +(process.env.ARM_E || 0.03);
const BW = process.env.ARM_BW ? +process.env.ARM_BW : null;   // unset = the rig's own
const NREC = +(process.env.NREC || 12000);
const PULSE = +(process.env.PULSE || 200);          // steps the torque pulse is held
const AMP = +(process.env.AMP || 0.05);             // fraction of tauMax

// The workspace the bench programs actually occupy: the square is 8x8 about (12,0), the circle
// and the rounded rectangle sit inside it. A pose the machine never visits cannot bear on a
// basis fitted from the machine's own runs (rule 41b's shape, aimed at a pose ladder).
const POSES = (process.env.POSES || '8,-4;8,0;8,4;12,-4;12,0;12,4;16,-4;16,0;16,4')
  .split(';').map((s) => s.split(',').map(Number));

const m = await machine({ K, E, ...(BW ? { bw: BW } : {}) });
const { arm, servo } = m;

/** Tool error in JOINT space at a held command — the frame every rung here corrects in. */
const truthAt = (q1, q2) => {
  const tool = arm.toolXY();
  const cx = arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2);
  const cy = arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2);
  const J = arm.jacobian(q1, q2), det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  const ex = tool[0] - cx, ey = tool[1] - cy;
  return [(J[1][1] * ex - J[0][1] * ey) / det, (-J[1][0] * ex + J[0][0] * ey) / det];
};

/**
 * THE PERIOD AND THE DAMPING, FROM QUANTITIES THAT SURVIVE A HEAVILY DAMPED RING.
 *
 * The first estimator written here was an autocorrelation of a record detrended by a moving mean
 * of +/-NREC/3, and it reported "no ring at any pose" with coherence EXACTLY 0.000 everywhere —
 * which is the signature of an instrument that found nothing rather than a plant that has
 * nothing (rule 17). The raw record says otherwise: it rises to 8.0e-3, crosses zero near 2400,
 * undershoots to -1.5e-3 and bumps again near 4400. The detrend span was LONGER than the period
 * being looked for, so the moving mean removed the oscillation itself — the same fault as
 * §52.16's window sweep, an instrument destroying the thing it was built to measure. At +/-1000
 * the autocorrelation duly shows an interior maximum at lag ~2600.
 *
 * But its height there is 0.16, and that is the finding rather than a defect: only about 1.5
 * cycles are visible because the amplitude falls ~5x per period. This plant does NOT have a
 * lightly damped resonance. So the estimator reads what a damped ring actually offers — the
 * peak, the zero crossings around it, and the decay between successive extrema — none of which
 * needs many cycles or any detrending at all. The baseline removed is the record's own FINAL
 * value, which is a settled level and not a fitted trend.
 */
const ring = (rec) => {
  const n = rec.length;
  let fin = 0; for (let k = n - 500; k < n; k++) fin += rec[k]; fin /= 500;
  const d = new Float64Array(n); for (let k = 0; k < n; k++) d[k] = rec[k] - fin;
  // the pulse's own peak, then the extrema that follow it
  let kPk = 0; for (let k = 0; k < n; k++) if (Math.abs(d[k]) > Math.abs(d[kPk])) kPk = k;
  const cross = (from) => { const s0 = Math.sign(d[from]); for (let k = from; k < n; k++) if (Math.sign(d[k]) !== s0 && d[k] !== 0) return k; return null; };
  const z1 = cross(kPk);
  if (z1 === null) return { period: null, pk: d[kPk], kPk, decay: null, z1: null };
  // the opposite-sign extremum between the first and second crossing gives the half period
  const z2 = cross(z1);
  let kPk2 = z1; for (let k = z1; k < (z2 ?? n); k++) if (Math.abs(d[k]) > Math.abs(d[kPk2])) kPk2 = k;
  const period = 2 * (kPk2 - kPk);
  return { period, pk: d[kPk], kPk, kPk2, z1, z2, decay: Math.abs(d[kPk]) / Math.max(1e-30, Math.abs(d[kPk2])) };
};

console.log(`ring frequency against pose — K ${K} / E ${E}${BW ? `, bw ${BW}` : ''}, torque pulse ${AMP * 100}% of tauMax for ${PULSE} steps\n`);
console.log('   pose x,y      q1,q2 (rad)        Jeff1     Jeff2    ring period   decay/cyc   first peak');
const rows = [];
for (const [x, y] of POSES) {
  let ik; try { ik = arm.ik(x, y, true); } catch { console.log(`   ${x},${y}  unreachable`); continue; }
  const [q1, q2] = ik;
  if (!Number.isFinite(q1) || !Number.isFinite(q2)) { console.log(`   ${x},${y}  unreachable`); continue; }
  settle(arm, servo, q1, q2, 8000);
  const M = arm.massMatrix(q2);
  const Jr1 = arm.j1.N * arm.j1.N * arm.j1.Jm, Jr2 = arm.j2.N * arm.j2.N * arm.j2.Jm;
  const Jeff = [M[0][0] + Jr1, M[1][1] + Jr2];
  const refs = [{ theta: q1, omega: 0, alpha: 0 }, { theta: q2, omega: 0, alpha: 0 }];
  const e0 = truthAt(q1, q2);
  const rec = new Float64Array(NREC);
  for (let k = 0; k < NREC; k++) {
    const t = servo.torques(refs);
    const kick = k < PULSE ? AMP * servo.tauMax : 0;
    arm.step(t[0] + kick, t[1], 1);
    rec[k] = truthAt(q1, q2)[0] - e0[0];
  }
  // Look for periods from 40 steps (far faster than anything this plant has) to a third of the
  // record, and detrend over a span longer than the longest period sought so it cannot make one.
  const r = ring(rec);
  rows.push({ x, y, q1, q2, Jeff, ...r });
  console.log(`   ${String(x).padStart(3)},${String(y).padStart(3)}   ${q1.toFixed(3)},${q2.toFixed(3)}   `
    + `${Jeff[0].toExponential(3)} ${Jeff[1].toExponential(3)}   `
    + `${r.period === null ? '   none' : String(r.period).padStart(7)}   ${r.decay === null ? '  -' : r.decay.toFixed(1).padStart(6)}    ${r.pk.toExponential(2)}  peak@${r.kPk}`);
}
const good = rows.filter((r) => r.period);
console.log('');
if (!good.length) {
  console.log('  NO RING AT ANY POSE. §52.34\'s premise is wrong: there is no resonance to represent.');
} else {
  const P = good.map((r) => r.period), J = rows.map((r) => r.Jeff[0]);
  const sp = Math.max(...P) / Math.min(...P), sj = Math.sqrt(Math.max(...J) / Math.min(...J));
  const dec = good.reduce((a, r) => a + r.decay, 0) / good.length;
  console.log(`  ${good.length} of ${rows.length} poses ring. PERIOD ${Math.min(...P)}-${Math.max(...P)} steps, SPAN ${sp.toFixed(2)}x; mean decay ${dec.toFixed(1)}x per cycle`);
  console.log(`  ANALYTIC PREDICTION from Jeff alone (w ~ sqrt(kp/Jeff), gains frozen at commissioning): ${sj.toFixed(2)}x`);
  console.log(`  ${Math.abs(sp - sj) / sj < 0.35 ? 'THE TWO AGREE' : 'THE TWO DISAGREE'} — an independent route to the same number is what makes either usable (rule 15).`);
  // The damping decides whether a RESONATOR is the efficient representation or an FIR window is
  // adequate: a decay of D per cycle leaves the response 2% of its peak after ln(50)/ln(D) cycles,
  // and THAT is the memory a window has to reach.
  const cycles = Math.log(50) / Math.log(Math.max(1.01, dec));
  const memory = cycles * (P.reduce((a, v) => a + v, 0) / P.length);
  console.log(`\n  DAMPING DECIDES THE ARGUMENT. At ${dec.toFixed(1)}x per cycle the response is 2% of peak after`);
  console.log(`  ${cycles.toFixed(1)} cycles = ${Math.round(memory)} raw steps, which is the memory any window must REACH.`);
  console.log(`  The shipped window spans +/-2048 = 4096 steps at 23 taps, i.e. ${(4096 / memory * 100).toFixed(0)}% of it.`);
  console.log(`  With only ${cycles.toFixed(1)} cycles to represent, an FIR window is NOT hopeless — §52.34 overstated that —`);
  console.log(`  but it is TRUNCATED, and the test that was never run is MORE TAPS over a LONGER span at the`);
  console.log(`  SAME spacing. §52.16 scaled the span and the spacing together, which cannot separate them.`);
}
await m.l1.destroy(); await m.l2.destroy();
