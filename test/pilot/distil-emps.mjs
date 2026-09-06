/**
 * @file THE DISTILLED POLICY ON A SECOND PLANT — a real servo axis, real data, no physics in
 * common with the 2R arm.
 *
 * Plan §49's result is one plant. This asks whether its central claim holds on another: that what
 * lap-indexed iteration CONVERGES TO contains a transferable part addressed by the machine's
 * state, and that regressing the converged correction onto a local window of the commanded
 * reference recovers it.
 *
 * THE NEGATIVE CONTROL IS ALREADY BUILT AND IS NOT OURS. On this axis a converged lap table reads
 * **0.53x on a two-tone sine the machine has never run** — worse than doing nothing — and a
 * textbook norm-optimal ILC, properly implemented, reads 0.53x there too, to four figures
 * (`noilcbench.mjs`). So the failure this distillation exists to repair is a property of the
 * METHOD CLASS rather than of our implementation, and the sine is a bar nobody here chose.
 *
 * THE TRAINING LAPS MUST DIFFER, which §49 measured the hard way: on a SINGLE closed program the
 * window becomes a lap index by aliasing, and the same configuration that reads 24.93x at home
 * reads 0.47x on a program it was not fitted on. So this commissions the harmonic rung on SEVERAL
 * periodic trajectories and distils across all of them, exactly as the arm trains on six polygons.
 * The canonical two-tone sine appears in NO training set.
 */

import { P, PR, makeMachine } from './emps-rig.mjs';
import { HarmonicFF } from '../../lib/pilot/hff.js';
import { DistilPolicy } from '../../lib/pilot/distil.js';

const UMAX = 2e-3;
const OFFS = (process.env.E_COFFS
  || '-512,-256,-128,-64,-32,-16,-8,-4,-2,-1,0,1,2,4,8,16,32,64,128,256,512').split(',').map(Number);
const SOFF = (process.env.E_SOFFS || '-128,-32,-8,-2,0,2,8,32,128').split(',').map(Number);

/** Drive one periodic reference for `laps` laps; score the last three; return the final lap. */
function driveRef(q, lap, corr, laps = 8) {
  const m = makeMachine(q[0], 0);
  let s = 0, n = 0; const e = new Float64Array(lap);
  for (let k = 0; k < laps * lap; k++) {
    const kk = ((k - 1) % lap + lap) % lap;
    m.step(q[kk] + (corr ? corr(kk) : 0));
    const ee = m.q - q[k % lap];
    if (k >= (laps - 1) * lap) e[k % lap] = ee;
    if (k >= (laps - 4) * lap) { s += ee * ee; n++; }
  }
  return { score: 1000 * Math.sqrt(s / n), err: [e] };
}

/** Peak |v| and |a| per sample of a reference, by central differences. */
function rates(q) {
  let v = 0, a = 0;
  for (let k = 1; k < q.length - 1; k++) {
    v = Math.max(v, Math.abs((q[k + 1] - q[k - 1]) * 0.5));
    a = Math.max(a, Math.abs(q[k + 1] - 2 * q[k] + q[k - 1]));
  }
  return { v, a };
}

/**
 * A periodic two-tone reference SIZED FROM THE PROGRAM'S OWN MEASURED PEAK VELOCITY, not from
 * numbers somebody chose. Rule 41b, and it was not academic here: the first version of this file
 * picked amplitudes by hand and produced a trajectory at 4.3x the program's velocity and 7.5x its
 * acceleration, whose OPEN LOOP was 74 mm and on which the harmonic rung managed 1.0x — a quarter
 * of the training rows were a machine failing to track, and the distillation duly refused.
 *
 * `vFrac` places each trajectory at a fraction of the program's peak, so the set SPANS a rate
 * range instead of sitting at one point. The scaling is exact in one step because peak velocity is
 * linear in the amplitudes.
 */
function tone(lap, c1, c2, vFrac, vProg, mix = 0.35, mid = 0.125) {
  const build = (A1) => {
    const q = new Float64Array(lap);
    for (let k = 0; k < lap; k++) {
      const th = 2 * Math.PI * k / lap;
      q[k] = mid + A1 * Math.sin(c1 * th) + A1 * mix * Math.sin(c2 * th + 0.7);
    }
    return q;
  };
  const probe = build(1);
  return build(vFrac * vProg / rates(probe).v);
}

// ---- THE HELD-OUT TRAJECTORY, copied from `noilcbench.mjs` so the bar is the same object.
function twoTone(n) {
  const q = new Float64Array(n);
  const mid = 0.125, A1 = 0.055, A2 = 0.022, w1 = 2 * Math.PI * 0.21, w2 = 2 * Math.PI * 0.53;
  for (let k = 0; k < n; k++) {
    const t = k * 1e-3;
    q[k] = mid + A1 * Math.sin(w1 * t) + A2 * Math.sin(w2 * t);
  }
  return q;
}
const N2 = 12000, TQ = twoTone(N2);

/** Score any correction on the held-out sine. `corr(k)` is a function of ABSOLUTE sample. */
function transfer(corr) {
  const m = makeMachine(TQ[0], 0);
  let s = 0, n = 0;
  for (let k = 0; k < N2; k++) {
    const kk = Math.max(0, k - 1);
    m.step(TQ[kk] + (corr ? corr(kk) : 0));
    if (k > 2000) { const e = m.q - TQ[k]; s += e * e; n++; }
  }
  return 1000 * Math.sqrt(s / n);
}

/**
 * Run the whole second-plant measurement and RETURN the numbers. Exported so the contract test
 * asserts on the same run this file prints, rather than growing a second copy of the routing —
 * three separate copies of a rig's routing have each shipped a defect here (rule 61).
 */
export async function runEmpsDistil({ log = console.log } = {}) {
  log('\ndistilling the converged lap table on the EMPS servo axis — a second plant\n');

  // ---- TRAINING TRAJECTORIES. The machine's own program plus periodic tones that differ from it
  // and from each other, so no single lap length dominates the window (the aliasing constraint).
  const VPROG = rates(PR.q).v;
  const TRAIN = [
  { name: 'program', q: PR.q, lap: P },
  { name: 'tone-3-7', q: tone(4800, 3, 7, 0.60, VPROG), lap: 4800 },
  { name: 'tone-2-5', q: tone(5600, 2, 5, 0.90, VPROG), lap: 5600 },
  { name: 'tone-5-11', q: tone(4200, 5, 11, 1.20, VPROG), lap: 4200 },
  ];
  log(`  program peak |v| ${VPROG.toExponential(3)} /sample; training tones at `
  + '0.60, 0.90 and 1.20 of it, so the set SPANS a rate range rather than sitting at one point');
  const tq = rates(TQ);
  log(`  held-out sine at ${(tq.v / VPROG).toFixed(2)}x the program's velocity and `
  + `${(tq.a / rates(PR.q).a).toFixed(2)}x its acceleration — inside the trained span or not, `
  + 'stated either way\n');

  const pol = new DistilPolicy({
  channels: 1, refDim: 1, offsets: OFFS, signOffsets: SOFF, ridge: 1e-8, uMax: UMAX * 5,
  });
  log(`  window ${OFFS[0]} … ${OFFS[OFFS.length - 1]} samples, `
  + `${pol.nFeatures} features, ${pol.cost()} MAC/decision\n`);
  log('  trajectory     lap    open loop      converged table   x     rows');

  for (const t of TRAIN) {
  const hff = new HarmonicFF({ lap: t.lap, channels: 1, uMax: UMAX });
  const r = await hff.commission(async (c) => driveRef(t.q, t.lap, c ? (k) => c.at(k)[0] : null));
  // The converged table IS the memory. Its values are the distillation target.
  const prefix = new Array(t.lap);
  for (let k = 0; k < t.lap; k++) prefix[k] = [hff.at(k)[0]];
  const refAt = (k) => [t.q[((k % t.lap) + t.lap) % t.lap]];
  const used = pol.addProgram({ refAt, n: t.lap, prefix });
  const gain = r.base / r.best;
  log(`  ${t.name.padEnd(12)} ${String(t.lap).padStart(5)}   ${r.base.toExponential(4)}   `
    + `${r.best.toExponential(4)}  ${gain.toFixed(1).padStart(6)}x  ${String(used).padStart(5)}`
    + (gain < 2 ? '   <- the rung got nothing here; these rows are a machine failing to track' : ''));
  }

  const rep = pol.fit();
  log(`\n  fit: ${rep.rows} rows, ${rep.features} features, `
  + `held-out R² ${rep.heldOutR2.map((v) => v.toFixed(4)).join(' / ')} `
  + `(null ${rep.controlR2.map((v) => v.toFixed(4)).join(' / ')}, ${rep.foldKind})`);
  log(`  ${rep.deploy ? 'DEPLOYS' : 'REFUSES'}${rep.reason ? ' — ' + rep.reason : ''}`);

  // ---- THE COLUMN THAT DECIDES IT. Both corrections scored on the same never-run sine.
  const hffHome = new HarmonicFF({ lap: P, channels: 1, uMax: UMAX });
  const rh = await hffHome.commission(async (c) => driveRef(PR.q, P, c ? (k) => c.at(k)[0] : null));
  const sineRef = (k) => [TQ[Math.min(N2 - 1, Math.max(0, k))]];

  const openT = transfer(null);
  const tableT = transfer((k) => hffHome.at(k % P)[0]);
  const polT = transfer((k) => pol.act(sineRef, k)[0]);

  log('\n  on the two-tone sine the axis has NEVER run '
  + '(the same object `noilcbench.mjs` scores):');
  log(`    open loop                 ${openT.toExponential(4)} mm`);
  log(`    the converged TABLE       ${tableT.toExponential(4)} mm   ${(openT / tableT).toFixed(2)}x`);
  log(`    the DISTILLED policy      ${polT.toExponential(4)} mm   ${(openT / polT).toFixed(2)}x`);

  // ---- and at home, so the transfer number is read against what was given up.
  const homeOpen = driveRef(PR.q, P, null).score;
  const homeTable = driveRef(PR.q, P, (k) => hffHome.at(k)[0]).score;
  const progRef = (k) => [PR.q[((k % P) + P) % P]];
  const homePol = driveRef(PR.q, P, (k) => pol.act(progRef, k)[0]).score;
  log('\n  on the machine\'s own program:');
  log(`    open loop                 ${homeOpen.toExponential(4)} mm`);
  log(`    the converged TABLE       ${homeTable.toExponential(4)} mm   ${(homeOpen / homeTable).toFixed(2)}x`);
  log(`    the DISTILLED policy      ${homePol.toExponential(4)} mm   ${(homeOpen / homePol).toFixed(2)}x`);
  log(`\n  the table is a MEMORY and the policy is addressed by the commanded reference;`);
  log(`  the sine column is the whole question and the home column is its price.\n`);

  return { openT, tableT, polT, homeOpen, homeTable, homePol, rep,
    sineTable: openT / tableT, sinePol: openT / polT,
    homeTableX: homeOpen / homeTable, homePolX: homeOpen / homePol };
  }

  // Run directly: print the table. Imported: the caller decides.
  if (import.meta.url === `file://${process.argv[1]}`) await runEmpsDistil();
