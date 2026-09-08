/**
 * Not a test — IS THE CONVERGED CORRECTION A FUNCTION OF THE REFERENCE WINDOW AT ALL? (plan §52.31)
 *
 * Every ceiling this arc has hit is the same one stated four ways: a linear map of the reference
 * window reaches 6-8x, more capacity transfers worse (five times), the missing term is the measured
 * deviation (§52.27), and the teacher's quality cannot reach it (§52.29). All of those assume the
 * map is the limitation. This asks the question underneath: **is the target a FUNCTION of the row?**
 *
 * If two programs put nearly the same reference window on the machine and the converged correction
 * demands DIFFERENT things at those windows, then no map of that window — linear, nonlinear, local
 * or global — can serve both, and 6x is a PROOF rather than an observation. If the targets agree
 * where the windows agree, the function exists and the linear form is what is throwing it away,
 * which makes a LOCAL model (same features, weights selected by where the window sits) the lever
 * that every capacity experiment so far has not actually tested — they all added features to ONE
 * global fit.
 *
 * The instrument: build the shipped 93-feature rows and the converged targets for the four diet
 * polygons and the square, standardise, and for each square row find its nearest neighbours among
 * the POLYGON rows. Report the target disagreement as a function of row distance, against two
 * controls that set the scale — the disagreement between temporally distant rows of the SAME
 * program at the same distance (the noise floor of "same window, same program"), and the target's
 * own rms (the scale of "no relationship at all").
 */
import { machine, settle, commissionComp } from '../flexisim/_rig.mjs';
import { makeArmHost } from '../../lib/flexisim/autohost.js';
import { sharpRect } from '../../lib/flexisim/toolpath.js';
const K = +(process.env.ARM_K || 0.25), E = +(process.env.ARM_E || 0.03), F = 4e-3;
const path = sharpRect({ w: 8, h: 8, centre: [12, 0], feed: F, accel: 4e-5, cornerDt: 40 });
const LAP = Math.ceil(path.lap);
const m0 = await machine({ K, E });
const host = makeArmHost({
  makeMachine: async () => { const m = await machine({ K, E }); const rc = commissionComp(m.arm, m.servo); const c0 = path.at(0); const [q1, q2] = m.arm.ik(c0.x, c0.y, true); settle(m.arm, m.servo, q1, q2); return { arm: m.arm, l1: m.l1, l2: m.l2, servo: m.servo, rc }; },
  path, lap: LAP, K, centre: m0.arm.ik(12, 0, true), classic: false, maxDepth: 1, demo: null, lapMemory: false, distil: {},
  distilDiet: { feeds: [F, F], rMin: 3.4, rSpan: 2.4 }, avg: 2, warmup: 1, passes: 8, probeLaps: { warmup: 1, avg: 1 },
});
host.auto.pilotOpts.start = m0.arm.ik(path.at(0).x, path.at(0).y, true);
const rep = await host.auto.commission({ run: host.run, drivePilot: host.drivePilot, recordDemo: host.recordDemo, distilRuns: host.distilRuns });
console.log(`commissioned: ${rep.base.toExponential(4)} -> ${rep.best.toExponential(4)} (${rep.gain.toFixed(2)}x); distil ${rep.deployed.distil}; fit held-out R² ${JSON.stringify((host.auto.distil && host.auto.distil.fit && host.auto.distil.fit.heldOutR2 || []).map((v) => +v.toFixed(3)))}`);
const diet = host.auto._distilDiet || [];
if (!diet.length) { console.log('no retained diet'); process.exit(0); }
const S = host.auto.built.stack ? host.auto.built.stack.sample : 9;
// the square's own converged prefix — the teacher is the cascade the ladder built, put back for this
const sq = (await host.distilRuns({ paths: [path] }))[0];
const prevStack = host.auto.stack; host.auto.stack = host.auto.built.stack;
const rsq = await sq.converge();
host.auto.stack = prevStack;
const sqPrefix = Array.from({ length: sq.lap }, (_, k) => rsq.at(k));
console.log(`square prefix converged: ${rsq.base.toExponential(4)} -> ${rsq.best.toExponential(4)} (${(rsq.base / rsq.best).toFixed(2)}x)`);
// ---- run every program WITH its prefix applied, tapping the state
const progs = [];
const capture = async (tr, prefix, name) => {
  const cap = []; const L = tr.lap;
  const r = await tr.run({ at: (k) => prefix[((k % L) + L) % L] }, { laps: 3, tap: (nn, k, m, t) => cap.push({ m, t }) });
  progs.push({ name, tr, prefix, cap, L });
  console.log(`  ${name.padEnd(10)} lap ${L}: with its prefix ${r.score.toExponential(4)}, ${cap.length.toLocaleString()} steps tapped`);
};
for (let i = 0; i < diet.length; i++) await capture(diet[i].tr, diet[i].target, `polygon ${i}`);
// THE NOISE FLOOR, WHICH DECIDES WHAT THE SCATTER MEANS (`REPEAT=1`). The disagreement between
// two rows at the same place in feature space has two sources: information the window does not
// carry, and the TEACHER'S OWN non-repeatability. They are opposite conclusions — "the input is
// exhausted" against "the target is noisy" — so the square's prefix is converged a SECOND time
// and the two independent draws compared at the same k. That is same row, same program, same
// everything, and whatever they differ by is not the window's fault.
let repeatFloor = null;
if (process.env.REPEAT === '1') {
  const p2 = host.auto.stack; host.auto.stack = host.auto.built.stack;
  const r2 = await sq.converge();
  host.auto.stack = p2;
  let s2 = 0, n = 0, t2 = 0;
  for (let k = 0; k < sq.lap; k++) {
    const a = rsq.at(k), b = r2.at(k);
    s2 += (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    t2 += a[0] * a[0] + a[1] * a[1]; n += 2;
  }
  repeatFloor = { rms: Math.sqrt(s2 / n), trms: Math.sqrt(t2 / n), gain: r2.base / r2.best };
  console.log(`  the square's prefix converged a SECOND time: ${r2.base.toExponential(4)} -> ${r2.best.toExponential(4)} (${repeatFloor.gain.toFixed(2)}x)`);
  console.log(`  two independent draws of the SAME target differ by ${repeatFloor.rms.toExponential(3)} rad against its own rms ${repeatFloor.trms.toExponential(3)} — a fraction of "unrelated" of ${(repeatFloor.rms / (Math.SQRT2 * repeatFloor.trms)).toFixed(3)}`);
}

// ---- the SHIPPED row: the reference window, angles and rigid-body torques (the host's `refRow`)
const OFFS = [-256, -128, -64, -32, -16, -8, -4, -2, -1, 1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256];
const refRow = (P, k) => { const r0 = P.tr.refAt(k); const f = [...r0]; for (const o of OFFS) { const r = P.tr.refAt(k + o * S); for (let j = 0; j < r0.length; j++) f.push(r[j] - r0[j]); } return f; };
const tgt = (P, k) => P.prefix[((k % P.L) + P.L) % P.L];

const STRIDE = +(process.env.CSTRIDE || 8) * S;
const build = (P) => { const X = [], Y = [], KS = [];
  for (let k = 0; k < P.L; k += STRIDE) { const y = tgt(P, k); if (!y) continue; X.push(refRow(P, k)); Y.push(y); KS.push(k); }
  return { name: P.name, X, Y, KS, L: P.L };
};
const sets = progs.map(build);
const D = sets[0].X[0].length;
console.log(`\n  rows: ${sets.map((s) => `${s.name} ${s.X.length}`).join(', ')}   ${D} features, stride ${STRIDE} steps`);

// STANDARDISE ON THE POOLED ROWS, so distance means the same thing in every column (rule 32).
const mu = new Float64Array(D), sd = new Float64Array(D); let N = 0;
for (const s of sets) for (const x of s.X) { for (let j = 0; j < D; j++) mu[j] += x[j]; N++; }
for (let j = 0; j < D; j++) mu[j] /= N;
for (const s of sets) for (const x of s.X) for (let j = 0; j < D; j++) sd[j] += (x[j] - mu[j]) ** 2;
for (let j = 0; j < D; j++) sd[j] = Math.sqrt(sd[j] / N) || 1;
const z = (x) => { const o = new Float64Array(D); for (let j = 0; j < D; j++) o[j] = (x[j] - mu[j]) / sd[j]; return o; };
for (const s of sets) s.Z = s.X.map(z);
const dist = (a, b) => { let t = 0; for (let j = 0; j < D; j++) { const d = a[j] - b[j]; t += d * d; } return Math.sqrt(t / D); };

// The target's own scale, pooled — "no relationship at all" reads about sqrt(2) times this.
let t2 = 0, tn = 0;
for (const s of sets) for (const y of s.Y) { t2 += y[0] * y[0] + y[1] * y[1]; tn += 2; }
const TRMS = Math.sqrt(t2 / tn);
console.log(`  target rms ${TRMS.toExponential(3)} rad; two unrelated targets differ by ~${(Math.SQRT2 * TRMS).toExponential(3)}\n`);

const sqSet = sets[sets.length - 1], poly = sets.slice(0, -1);
const BINS = [0.2, 0.3, 0.4, 0.5, 0.7, 1.0, 1.5, 2.0, 1e9];
const acc = () => BINS.map(() => ({ n: 0, s2: 0 }));
const add = (A, d, ya, yb) => { for (let b = 0; b < BINS.length; b++) if (d <= BINS[b]) { A[b].n++; A[b].s2 += (ya[0] - yb[0]) ** 2 + (ya[1] - yb[1]) ** 2; return; } };

// (1) SQUARE against the POLYGONS — the transfer question.
const cross = acc();
for (let i = 0; i < sqSet.Z.length; i++) for (const p of poly) for (let j = 0; j < p.Z.length; j++) add(cross, dist(sqSet.Z[i], p.Z[j]), sqSet.Y[i], p.Y[j]);
// (2) POLYGON against a DIFFERENT POLYGON — transfer again, with the square left out entirely.
const pp = acc();
for (let a = 0; a < poly.length; a++) for (let b = a + 1; b < poly.length; b++)
  for (let i = 0; i < poly[a].Z.length; i++) for (let j = 0; j < poly[b].Z.length; j++) add(pp, dist(poly[a].Z[i], poly[b].Z[j]), poly[a].Y[i], poly[b].Y[j]);
// (3) THE CONTROL: the SAME program, rows far apart in TIME. If the target is a function of the
// row, two rows of one program that are close in feature space must agree — and this measures how
// well they do, which is the floor any cross-program number has to be read against.
const same = acc(); const FAR = Math.round(0.15 * sqSet.L / STRIDE);
for (const p of sets) for (let i = 0; i < p.Z.length; i++) for (let j = i + FAR; j < p.Z.length; j++) add(same, dist(p.Z[i], p.Z[j]), p.Y[i], p.Y[j]);

const show = (label, A) => {
  console.log(`  ${label}`);
  console.log('    row distance |    pairs   rms target difference   as a fraction of "unrelated"');
  for (let b = 0; b < BINS.length; b++) {
    if (!A[b].n) continue;
    const rms = Math.sqrt(A[b].s2 / (2 * A[b].n));
    const lo = b ? BINS[b - 1] : 0, hi = BINS[b];
    console.log(`    ${(lo).toFixed(1)}-${hi > 1e8 ? ' inf' : hi.toFixed(1)}      | ${String(A[b].n).padStart(9)}   ${rms.toExponential(3)}              ${(rms / (Math.SQRT2 * TRMS)).toFixed(3)}`);
  }
  console.log('');
};
show('(1) the SQUARE against the four POLYGONS — can a map fitted on them serve it?', cross);
show('(2) POLYGON against POLYGON — the same question with the square left out', pp);
show('(3) CONTROL: one program against ITSELF, rows far apart in time', same);
if (repeatFloor) {
  const f = repeatFloor.rms / (Math.SQRT2 * repeatFloor.trms);
  console.log(`  THE NOISE FLOOR: two independent convergences of the SAME program's prefix disagree by ${f.toFixed(3)} of`);
  console.log(`  "unrelated", against ${(Math.sqrt(cross[0].n ? cross[0].s2 / (2 * cross[0].n) : 0) / (Math.SQRT2 * TRMS)).toFixed(3)} for the closest cross-program bin. If those are equal the scatter is the`);
  console.log('  TEACHER and the window is not the limit; if the cross-program number is larger, the excess is');
  console.log('  what the window does not carry.\n');
}
console.log('  A cross-program number at small distance that sits near "unrelated" means the target is');
console.log('  NOT a function of the reference window and no map of it can serve both programs. One that');
console.log('  tracks the same-program control means the function exists and the LINEAR form is what is');
console.log('  throwing it away — which no capacity experiment here has tested, because every one of');
console.log('  them added features to a single GLOBAL fit.');
