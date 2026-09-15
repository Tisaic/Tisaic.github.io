/**
 * @file TARGET 8's SECOND RIVAL ON THE PLANT §86.3 LEFT OPEN (plan §87.5).
 *
 * §86.3 asked the DEPLOYED object on the real flexible arm and it refused seven ways — windows
 * ±128 to ±2675, tour laps 3,072 to 24,576, streaming and batch fits, and a resonator bank — with
 * held-out R² never above 0.34 while the teacher reached 4.1-7.2x. It ends by naming the one route
 * it did not take: *"§56's stable inversion, which exists for precisely this inverse response."*
 *
 * WHY THIS PLANT AND THIS RIVAL. §84.11 measured this arm at **INVERSE 128.3%** — the only non-zero
 * in `invert.mjs`'s table — so hold a correction and the plant first goes 1.28 times further the
 * WRONG way than it ever goes the right way. That is what ZPETC is FOR: a sampled mechanical axis
 * with uninvertible zeros, which Tomizuka's reflection cancels in phase rather than inverting. And
 * §56 ran it only on EMPS, where the identified path turned out to be MINIMUM PHASE and the
 * reflection never engaged (`out` is zero in every delivering row). So this is the first time the
 * rival's own mechanism can actually fire.
 *
 * IT USES `zpetc.mjs`'s OWN FUNCTIONS. The method — `arx`, `roots`, `zpetc`, `arxFir` — is imported,
 * not re-implemented; only the PLANT, the excitation and the scoring are this file's. A second copy
 * of the method would make a difference between two plants unreadable (rule 61), and §56's own
 * headline defect was an ordering error inside one of those functions.
 *
 * HELD EQUAL to the deployed object on this plant: the same machine, the same program, the same
 * authority `UCORR`, and a correction applied as a reference offset. The rival's order and
 * identification ridge are SWEPT; the deployed object ran at its defaults.
 *
 * KNOBS: ORDERS, RIDGES, NT, TDATA, ASEED, NOISE.
 */
import { arx, zpetc } from './zpetc.mjs';
import * as A from './rigs/realarm-rig.mjs';

const ORDERS = (process.env.ORDERS || '2,3,4,6,8').split(',').map(Number);
const RIDGES = (process.env.RIDGES || '1e-8,1e-6,1e-4,1e-2').split(',').map(Number);
const TDATA = +(process.env.TDATA || 8000);
const ASEED = +(process.env.ASEED || 0);
const NOISE = +(process.env.NOISE || 0);

console.log('\nzpetc-realarm: STABLE INVERSION on the plant whose response goes the WRONG WAY FIRST\n');
console.log(`  the plant: DaISy 96-009, identified modes decaying 1.026x / 1.030x / 1.276x per `
  + `cycle; INVERSE 128.3% (§84.11)`);
console.log(`  authority ±${A.UCORR.toExponential(3)} (3x the conventional machine's own rms), `
  + `program lap ${A.LAP}, ${A.PROG / A.LAP} laps\n`);

const rnd = (() => { let s = (12345 + 7919 * ASEED) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; }; })();
const nz = (() => { let s = (777 + 104729 * ASEED) >>> 0;
  return () => { s = (s * 1103515245 + 12345) >>> 0; return (s / 4294967296 - 0.5) * 3.464; }; })();

/** THE DRIVE A CANDIDATE EXCITATION DEMANDS, so nothing is built to a limit the program does not
 *  reach (rule 41b — this rig has paid for that once, with a reference needing eleven times the
 *  torque the machine has). */
function peakDrive(at, n, warm = 12 * A.LAP) {
  const m = A.makeMachine(A.LOOP, { warm: false });
  for (let k = 0; k < warm; k++) m.step(at(k));
  let pk = 0;
  for (let k = warm; k < warm + n; k++) { m.step(at(k)); pk = Math.max(pk, Math.abs(m.torque)); }
  return pk;
}
const PROG_DRIVE = peakDrive((k) => A.refAtStep(k)[0], 4 * A.LAP) / A.TMAX;

/** A random-phase multisine over the band the program occupies, bisected on the machine to the
 *  same drive fraction the shipped program demands. */
function multisine(lap) {
  const ph = Array.from({ length: 40 }, () => 2 * Math.PI * (rnd() + 0.5));
  const unit = (k) => {
    let v = 0;
    for (let h = 1; h <= 40; h++) v += Math.sin(2 * Math.PI * h * (((k % lap) + lap) % lap) / lap + ph[h - 1]) / h;
    return v;
  };
  let lo = 1e-6, hi = 1e4;
  for (let i = 0; i < 28; i++) {
    const mid = Math.sqrt(lo * hi);
    if (peakDrive((k) => mid * unit(k), 2 * lap, 8 * lap) / A.TMAX > PROG_DRIVE) hi = mid; else lo = mid;
  }
  const amp = Math.sqrt(lo * hi);
  return { amp, at: (k) => amp * unit(k) };
}
const MIX = multisine(1536);
console.log(`  the shipped program demands ${(100 * PROG_DRIVE).toFixed(1)}% of the drive; the `
  + `identification multisine is bisected to the same (amplitude ${MIX.amp.toExponential(3)})\n`);

/** Gu (a HELD correction to the error it makes) and Gr (the commanded reference to the error the
 *  program leaves), identified exactly as `zpetc.mjs` does on EMPS. */
function identify(na, nb, ridge) {
  const m = A.makeMachine();
  const u = new Float64Array(TDATA), y = new Float64Array(TDATA);
  let hold = 0, cur = 0;
  for (let k = 0; k < TDATA; k++) {
    if (hold-- <= 0) { cur = 2 * A.UCORR * rnd(); hold = 6 + Math.floor(12 * (rnd() + 0.5)); }
    const r = A.refAtStep(k)[0];
    const x = m.step(r + cur);
    u[k] = cur; y[k] = x - r + NOISE * nz();
  }
  const Gu = arx(u, y, na, nb, ridge);
  const m2 = A.makeMachine(A.LOOP, { warm: false });
  for (let k = 0; k < 8 * 1536; k++) m2.step(MIX.at(k));
  const rr = new Float64Array(TDATA), ee = new Float64Array(TDATA);
  for (let k = 0; k < TDATA; k++) {
    const r = MIX.at(k);
    const x = m2.step(r);
    rr[k] = r; ee[k] = x - r + NOISE * nz();
  }
  const Gr = arx(rr, ee, na, nb, ridge);
  if (!Gu || !Gr) return null;
  const fit = (uu, yy, md) => {
    const na2 = md.a.length, nb2 = md.b.length, st = Math.max(na2, nb2) + 1;
    let ss = 0, st2 = 0, mean = 0, n = 0;
    for (let k = st; k < yy.length; k++) { mean += yy[k]; n++; }
    mean /= n;
    for (let k = st; k < yy.length; k++) {
      let p = 0;
      for (let i = 0; i < na2; i++) p -= md.a[i] * yy[k - 1 - i];
      for (let i = 0; i < nb2; i++) p += md.b[i] * uu[k - 1 - i];
      ss += (yy[k] - p) ** 2; st2 += (yy[k] - mean) ** 2;
    }
    return st2 > 0 ? 1 - ss / st2 : 0;
  };
  return { Gu, Gr, r2u: fit(u, y, Gu), r2r: fit(rr, ee, Gr) };
}

/** Scored on the machine, the SAME way `distil-realarm.mjs` scores: the settled arm, the shipped
 *  program, the last laps read so the correction's own re-settle is not in the window (rule 13). */
function score(ff, at, lap, laps = 40) {
  const m = A.makeMachine(A.LOOP, { warm: false });
  let s = 0, n = 0, uPk = 0;
  for (let k = 0; k < laps * lap; k++) {
    let u = 0;
    if (ff) { for (let j = 0; j < ff.g.length; j++) u += ff.g[j] * at(k + ff.LEAD - j); }
    u = Math.max(-A.UCORR, Math.min(A.UCORR, -u));
    uPk = Math.max(uPk, Math.abs(u));
    const x = m.step(at(k) + u);
    const e = x - at(k);
    if (k >= (laps - 8) * lap) { s += e * e; n++; }
  }
  return { rms: Math.sqrt(s / n), uPk };
}

const progAt = (k) => A.refAtStep(((k % A.LAP) + A.LAP) % A.LAP)[0];
const HELD = multisine(1024);                       // a trajectory neither object has ever run
const openP = score(null, progAt, A.LAP).rms;
const openH = score(null, HELD.at, 1024).rms;
console.log(`  open loop — program ${openP.toExponential(4)}   held-out multisine ${openH.toExponential(4)}`);
console.log(`  the CONVENTIONAL machine is the same run (this plant's loop is always closed), and `
  + `the deployed object ships 1.93x on the conventional rung (§86.3)\n`);
console.log('   na  nb  ridge    out lead  R2(Gu) R2(Gr)  taps    program       x       uPk      held-out     x');

let best = null;
for (const ord of ORDERS) for (const ridge of RIDGES) {
  const mdl = identify(ord, ord + 1, ridge);
  if (!mdl) { console.log(`   ${String(ord).padStart(2)}  ${String(ord + 1).padStart(2)}  ${ridge.toExponential(0).padStart(6)}   — identification failed`); continue; }
  const ff = zpetc(mdl);
  if (!ff) { console.log(`   ${String(ord).padStart(2)}  ${String(ord + 1).padStart(2)}  ${ridge.toExponential(0).padStart(6)}   — inverse failed`); continue; }
  const p = score(ff, progAt, A.LAP), h = score(ff, HELD.at, 1024);
  const row = { ord, ridge, ff, mdl, p, h, xp: openP / p.rms, xh: openH / h.rms };
  console.log(`   ${String(ord).padStart(2)}  ${String(ord + 1).padStart(2)}  ${ridge.toExponential(0).padStart(6)}`
    + `   ${String(ff.nOut).padStart(2)} ${String(ff.LEAD).padStart(4)}`
    + `  ${mdl.r2u.toFixed(3)}  ${mdl.r2r.toFixed(3)}  ${String(ff.g.length).padStart(4)}`
    + `  ${p.rms.toExponential(3)}  ${row.xp.toFixed(3)}x  ${p.uPk.toExponential(2)}`
    + `  ${h.rms.toExponential(3)}  ${row.xh.toFixed(3)}x`);
  if (!best || row.xp > best.xp) best = row;
}
if (best) {
  console.log(`\n  BEST OF THE SWEEP: na ${best.ord}, ridge ${best.ridge.toExponential(0)} — `
    + `**${best.xp.toFixed(3)}x on the program, ${best.xh.toFixed(3)}x on a trajectory it has never `
    + `run**, ${best.ff.nOut} zero(s) REFLECTED (§56's EMPS rows had none, so the reflection never `
    + `engaged there)`);
  console.log(`  against the DEPLOYED object on this plant: REFUSED seven ways (§86.3), the ladder `
    + `shipping the conventional rung at 1.93x`);
} else {
  console.log('\n  no cell produced an inverse at all — which is a result about this plant and the method.');
}
console.log();
