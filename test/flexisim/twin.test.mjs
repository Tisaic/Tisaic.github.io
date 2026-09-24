// TWIN_2R (lib/autoff/twin2r.js, the controller-shaped twin) against the same twin built from the
// bench's own objects (test/reference/twin2r-ref.mjs). Two codes of one loop will disagree (rule 61),
// so the check sits on the boundary: the same program into both, the tool compared on every scan.
import { buildArm, calibrateComp, ikOf, benchProgram, BENCH } from '../../lib/flexisim/bench.js';
import { twinParams, BENCH_TWIN } from '../../lib/flexisim/twin.js';
import { twinNewState, twinReset, twinStep, twinMeas, TW, AFF_TW_MAC_FN } from '../../lib/autoff/twin2r.js';
import { TwinLearner, TL_UNIT } from '../../lib/autoff/twinlearn.js';
import { jointProgram, conventional } from '../../lib/flexisim/bench.js';
import { circle, sharpRect } from '../../lib/flexisim/toolpath.js';
import { driveTo } from '../../lib/flexisim/approach.js';
import { refTwin } from '../reference/twin2r-ref.mjs';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail !== undefined ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nflexisim: the controller-shaped twin against the object-built one');

// an identified twin (from the tool, on a machine with a payload, a stiffening gearbox, friction and
// triple backlash: experiments/twin, `off`), so every term of the model is exercised
const IDENT = { K: 0.26118028548817473, payload: 0.153125, stiff: 0.3046875, fit: [
  { ms: [[0.0028188041817804274, 0.3], [0.0040590780217638145, 0.3]], x: [-0.22113862944945847, -5.288618371491376, 2.319692287538234, -6.503027223122146], nu: 2 },
  { ms: [[0.0028188041817804274, 0.3], [0.0040590780217638145, 0.3]], x: [0.023512383771897422, -0.5378854246062766, 0.12946834481645922, -0.6752643374442645], nu: 2 },
  { ms: [[0.005845072351339893, 0.3], [0.004870893626116577, 0.3]], x: [-13.310114784618674, -14.667215631086428, -1.6862625515788234, 9.932641691612414, 4.392624330651284, 0.2977827826314716], nu: 3 }] };

// the twin identified from the tool on THIS machine (the nominal bench arm)
const IDENT_BENCH = BENCH_TWIN.ident;

const m = await buildArm(), rc = await calibrateComp(m), ik = ikOf(m.arm.L1, m.arm.L2);
const prog = benchProgram('sharp', 3e-3, ik), N = +(process.env.TWIN_STEPS || 20000);

async function compare(ident, perturb = null) {
  const ref = await refTwin(rc, ident);
  const P = twinParams(m, rc, ident); if (perturb) perturb(P);
  const S = twinNewState(), o = new Float64Array(2);
  const sp0 = prog.at(0); ref.reset(sp0); twinReset(P, S, sp0[0], sp0[1]);
  let worst = 0, ss = 0, macMax = 0, macMin = Infinity, n = 0;
  for (let k = 0; k < N; k++) {
    const sp = prog.at(k % prog.lap);
    ref.step(sp); const mac = twinStep(P, S, sp[0], sp[1]) + twinMeas(P, S, o);
    macMax = Math.max(macMax, mac); macMin = Math.min(macMin, mac);
    const t = ref.tool(), q = ik(t[0], t[1]);
    for (let c = 0; c < 2; c++) { const e = q[c] - sp[c]; ss += e * e; n++; worst = Math.max(worst, Math.abs(o[c] - q[c])); }
  }
  return { worst, rms: Math.sqrt(ss / n), macMax, macMin };
}

{
  const r = await compare(IDENT);
  check(`the two twins agree on every scan of ${N} (worst ${r.worst.toExponential(2)} against an error rms of ${r.rms.toExponential(2)})`,
    r.rms > 0 && r.worst < 1e-9 * r.rms);
  // the control: the same comparison can fail — a payload 1% off shows
  const bad = await compare(IDENT, (P) => { P[TW.PAYLOAD] *= 1.01; });
  check(`and the comparison can fail: 1% more payload in one of them differs by ${(bad.worst / bad.rms).toExponential(2)} of the error rms`,
    bad.worst > 1e-4 * bad.rms);
  const nop = await compare({ ...IDENT, payload: 0, stiff: 0 });
  check(`with no payload and no stiffening the two agree too (worst ${(nop.worst / nop.rms).toExponential(2)} of the error rms)`, nop.worst < 1e-9 * nop.rms);
  check(`a twin scan costs ${r.macMax} MAC (a trig call charged ${AFF_TW_MAC_FN}): ${Math.floor(10000 / r.macMax)} twin scans fit a 10,000 MAC scan`,
    r.macMax > 0 && r.macMax <= 1000, `min ${r.macMin}`);
}

// ---- THE TABLE FOR A PROGRAM, LEARNED ON THE TWIN inside the scan budget
console.log('\nflexisim: a program\'s table learned on the twin, on a budget');
const P0 = twinParams(m, rc, IDENT);
const J = (path) => jointProgram(path, ik, { smooth: BENCH.JERK });
const TIMING = { accel: BENCH.ACCEL, cornerStop: true, dwell: BENCH.JERK };
const small = J(circle({ ...TIMING, r: 3, centre: [13, -1], feed: 3e-3 }));
const refOf = (p) => { const r = new Float64Array(2 * p.lap); for (let k = 0; k < p.lap; k++) { const x = p.at(k); r[2 * k] = x[0]; r[2 * k + 1] = x[1]; } return r; };
function learn(p, limit, iters, P = P0, maxScans = 5e7) {
  const TL = new TwinLearner(p.lap); TL.start(P, refOf(p), 2, p.lap, iters);
  let scans = 0, peak = 0; while (!TL.xDone && scans < maxScans) { peak = Math.max(peak, TL.run(limit)); scans++; }
  return { TL, scans, peak };
}
{
  const a = learn(small, 10000, 6);
  check(`it finishes, and never spends more than the 10,000 MAC it is given (peak ${a.peak}; ${a.scans} scans = ${(a.scans / small.lap).toFixed(2)} laps of machine time)`,
    a.TL.xDone && a.peak <= 10000 && a.peak > 10000 - TL_UNIT);
  check(`the learning improves the twin (${a.TL.rFactor.toFixed(2)}x in ${a.TL.udiTwinLaps} twin laps)`, a.TL.rFactor > 2);
  const b = learn(small, TL_UNIT, 6);
  let same = a.TL.aU.length === b.TL.aU.length; for (let i = 0; same && i < 2 * small.lap; i++) same = a.TL.aU[i] === b.TL.aU[i];
  check(`the table does not depend on how the work is sliced: at the smallest allotment (${TL_UNIT} MAC, ${b.scans} scans) it is bit-identical`, b.TL.xDone && same && b.peak <= TL_UNIT);
  const c = learn(small, TL_UNIT - 1, 1, P0, 2e5);
  check(`below the smallest unit it never overspends and never runs a twin scan (peak ${c.peak} of ${TL_UNIT - 1})`, !c.TL.xDone && c.peak <= TL_UNIT - 1 && c.TL.udiTwinLaps === 0 && c.TL._k === 0);
}

// ---- THE CLAIM, on the lattice machine (full tier): a program the machine never learned, first use
if (process.env.SUITE === 'full') {
  const p = J(sharpRect({ ...TIMING, w: 6, h: 6, centre: [11, 1], feed: 2.5e-3 })), L = p.lap;
  const { TL } = learn(p, 10000, 15, twinParams(m, rc, IDENT_BENCH));
  const rm = await buildArm(); await driveTo(rm.arm, rm.servo, p.at(0), BENCH.feed);
  const cv = conventional(rm, rc); cv.reset(p.at(0)); for (let k = 0; k < L; k++) cv.step(p.at(k));
  const lap = (U) => { const d = Math.ceil(0.05 * L), s = [0, 0]; for (let k = 0; k < L; k++) { const t = rm.arm.toolXY(), q = ik(t[0], t[1]), r = p.at(k);
    if (k >= d) { s[0] += (q[0] - r[0]) ** 2; s[1] += (q[1] - r[1]) ** 2; } cv.step([r[0] + (U ? U[2 * k] : 0), r[1] + (U ? U[2 * k + 1] : 0)]); } return s; };
  const bare = lap(null); lap(TL.aU); const got = lap(TL.aU);
  const x = 1 / Math.sqrt((got[0] / bare[0] + got[1] / bare[1]) / 2);
  check(`on the lattice arm, a program it never ran (a 6 x 6 square at 2.5e-3): the twin's table gives ${x.toFixed(2)}x on first use`, bare[0] > 0 && x > 3);
  await rm.l1.destroy(); await rm.l2.destroy();
} else console.log('  (the lattice arm check is in the full tier)');

await m.l1.destroy(); await m.l2.destroy();
if (failed) { console.log(`\ntwin: ${failed} check(s) FAILED`); process.exit(1); }
console.log('\ntwin: all checks passed');
