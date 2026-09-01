/**
 * @file WHAT THE PROGRAM DEMANDS, WHAT THE ARM RESONATES AT, AND WHAT THE EXCITATION SUPPLIED —
 * three power spectra on one frequency axis.
 *
 * The account under test is that a compliant arm can only make a sharp corner by LOADING and
 * RELEASING its own flex on a schedule while the tool stays on the line, and that a controller
 * commissioned on filtered noise has never seen the machine do that. Every experiment so far has
 * argued about the controller. This one asks the prior question, which is whether the information
 * is in the record at all: a model fitted on a band the program does not occupy cannot schedule
 * anything in the band the program does, however the QP is configured.
 *
 * THREE SPECTRA, MEASURED SEPARATELY AND PLOTTED ON ONE AXIS OF PERIODS IN SOLVER STEPS:
 *
 *   MODE      — the arm's free response to a held step, after the rise. Where the machine rings.
 *   PROGRAM   — the open-loop CONTOUR ERROR on the sharp square. Where the defect lives.
 *   EXCITE    — the commanded position during commissioning's excite phase. Where the model looked.
 *
 * WHAT WOULD FALSIFY THE ACCOUNT: if EXCITE covers the band PROGRAM occupies, the excitation is
 * not the constraint and the residual is the controller's. That is the reading this is built to
 * make possible, and it is the one that would send the next brick somewhere else.
 *
 * The periodogram is deliberately crude — a radix-2 FFT of one power-of-two window, Hann-tapered,
 * binned into octaves of PERIOD. Nothing here needs a bin's precision; the question is which
 * decade the energy is in, and an octave table answers it without an argument about leakage.
 *
 * Run: node test/pilot/spectrum.mjs
 */
import { Pilot } from '../../lib/pilot/pilot.js';
import { decompose } from '../../lib/flexisim/contour.js';
import { PG, makeArm, mkPath, homeArm, routeSignals } from './rigs/arm-rig.mjs';

/** In-place iterative radix-2 FFT on interleaved-free split arrays. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

/** Octave bands of PERIOD in solver steps, from a couple of samples to a whole lap. */
const BANDS = [];
// STARTING AT TWO SAMPLES, not at a period somebody thought was interesting. The first version
// started at 16 and the MODE row came back 0.0% in every band with a peak of 0.0% — which reads
// as "this arm has no dynamics" and actually meant "all of its energy is in bins this table
// throws away" (rule 25: not measured and exactly zero are different states).
for (let p = 2; p <= 16384; p *= 2) BANDS.push([p, p * 2]);

/**
 * Power per octave band of period, as a FRACTION of the signal's own variance. A fraction, not an
 * absolute, because the three signals have different units and the question is about WHERE the
 * energy sits in each — comparing a radian against a millimetre would be rule 17's wrong-unit
 * failure dressed as a finding.
 */
function octaves(x) {
  // A NON-FINITE SAMPLE MAKES EVERY BIN NaN, `tot > 0` FALSE, AND THE WHOLE ROW 0.0% — which
  // reads as "this signal has no content" and means "this signal was never measured" (rule 25).
  // It has already happened once here, on the MODE row, and cost a wrong reading of the plant.
  let bad = 0, lo = Infinity, hi = -Infinity;
  for (const v of x) { if (!Number.isFinite(v)) bad++; else { if (v < lo) lo = v; if (v > hi) hi = v; } }
  if (bad) throw new Error(`spectrum: ${bad} of ${x.length} samples are not finite`);
  if (!(hi > lo)) throw new Error(`spectrum: the record is constant at ${lo} — nothing to analyse`);
  // Longest power of two the record supports, taken from the END so a startup transient is out.
  let n = 1; while (n * 2 <= x.length) n *= 2;
  const off = x.length - n;
  const re = new Float64Array(n), im = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[off + i];
  mean /= n;
  // A HANN TAPER, because a record that does not begin and end at the same value has a step in
  // it and a step is broadband — the leakage would put program energy in every band and the
  // table would say "everything everywhere", which is what an untapered first version said.
  for (let i = 0; i < n; i++) {
    re[i] = (x[off + i] - mean) * 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
  }
  fft(re, im);
  const out = BANDS.map(() => 0);
  let tot = 0;
  for (let k = 1; k < n / 2; k++) {
    const p = re[k] * re[k] + im[k] * im[k];
    tot += p;
    const per = n / k;
    for (let b = 0; b < BANDS.length; b++) {
      if (per >= BANDS[b][0] && per < BANDS[b][1]) { out[b] += p; break; }
    }
  }
  return { frac: out.map((v) => (tot > 0 ? v / tot : 0)), n, tot };
}

function bar(f) {
  const w = Math.round(f * 40);
  return '#'.repeat(Math.max(0, w)) + '.'.repeat(Math.max(0, 40 - w));
}

function table(rows) {
  console.log(`\n  ${'period (solver steps)'.padEnd(22)} ${rows.map((r) => r.name.padStart(10)).join(' ')}`);
  for (let b = 0; b < BANDS.length; b++) {
    const any = rows.some((r) => r.frac[b] > 0.005);
    if (!any) continue;
    console.log(`  ${`${BANDS[b][0]}–${BANDS[b][1]}`.padEnd(22)} `
      + rows.map((r) => `${(100 * r.frac[b]).toFixed(1)}%`.padStart(10)).join(' '));
  }
  console.log();
  for (const r of rows) {
    const pk = r.frac.indexOf(Math.max(...r.frac));
    console.log(`  ${r.name.padEnd(10)} peak band ${`${BANDS[pk][0]}–${BANDS[pk][1]}`.padEnd(14)}`
      + ` ${bar(r.frac[pk])} ${(100 * r.frac[pk]).toFixed(1)}%   (${r.n} samples analysed)`);
  }
}

// ─── 1. THE MODE ────────────────────────────────────────────────────────────────────────────
// A HELD STEP AND THE FREE RESPONSE AFTER IT. The pilot's own probe reports `rings [0,0]` on this
// arm at every stiffness including the softest, which is either true or an instrument fault, and
// rule 17 says check the instrument before the physics. This is a second, independent route to
// the same question: the probe counts CROSSINGS of a smoothed response inside its settling
// window, this one takes the spectrum of the raw one. Two wrongs that agree would be rule 15's
// problem; two rights agreeing is the answer.
async function modeSpectrum() {
  const { arm, servo } = await makeArm();
  const path = mkPath('sharp', 0.004);
  homeArm(arm, servo, path);
  const c0 = path.at(0);
  const [q1, q2] = arm.ik(c0.x, c0.y, true);
  const xs = [], ys = [];
  const STEP = 0.02;
  for (let k = 0; k < 24000; k++) {
    const u = k < 2000 ? 0 : STEP;
    const tau = servo.torques([{ theta: q1 + u, omega: 0, alpha: 0 },
      { theta: q2, omega: 0, alpha: 0 }]);
    arm.step(tau[0], tau[1], 1);
    // `toolXY()` RETURNS AN ARRAY, not an object. Read as `{x, y}` it yields `undefined`, which
    // arithmetic turns into NaN, which made every band 0.0% and the table say this arm has no
    // dynamics — the same wrong reading twice from two different instrument faults.
    const [tx, ty] = arm.toolXY();
    if (k >= 2000) { xs.push(tx); ys.push(ty); }
  }
  // THE TOOL MOVES ALONG AN ARC AND ITS RADIUS BARELY CHANGES. The first version recorded
  // `hypot(x, y)` — the distance from the BASE — which a step in joint 1 leaves very nearly
  // constant, so the record had no variance, every band came back 0.0% and the table said this
  // arm has no dynamics. Rule 17: the instrument failed before the model did. The signal is the
  // SIGNED PROJECTION onto the direction the step actually moved the tool.
  const n0 = xs.length;
  const dx = xs[n0 - 1] - xs[0], dy = ys[n0 - 1] - ys[0];
  const L = Math.hypot(dx, dy) || 1;
  const y = xs.map((_, i) => ((xs[i] - xs[n0 - 1]) * dx + (ys[i] - ys[n0 - 1]) * dy) / L);
  await arm.l1.destroy(); await arm.l2.destroy();
  // THE RISE IS A STEP AND A STEP IS BROADBAND. What is being asked is whether the machine RINGS,
  // which is a property of the response AFTER it has got where it is going, so the analysed
  // record starts past the rise. Taking the whole thing would report the step's own spectrum and
  // call it a mode.
  // FROM JUST PAST THE STEP, not from a quarter of the way in. A ring is a TRANSIENT: analysing
  // the settled tail measures the instrument's noise floor and reports it as the plant.
  return { name: 'MODE', ...octaves(y.slice(100)) };
}

// ─── 2. THE PROGRAM ─────────────────────────────────────────────────────────────────────────
// THE OPEN-LOOP CONTOUR ERROR ON THE SHARP SQUARE — the defect itself, as a time series. Not the
// commanded path and not the tool position: the ERROR, because that is the quantity the pilot is
// fitted to predict and the one its correction has to cancel.
async function programSpectrum(shape, feed) {
  const { arm, servo } = await makeArm();
  const path = mkPath(shape, feed);
  homeArm(arm, servo, path);
  const total = Math.ceil(path.lap * 3), from = Math.ceil(path.lap);
  const e = [];
  for (let k = 0; k < total; k++) {
    const cmd = path.at(k);
    const [q1, q2] = arm.ik(cmd.x, cmd.y, true);
    const rt = arm.ikRates(q1, q2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
    const tau = servo.torques([{ theta: q1, omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2, omega: rt.dq[1], alpha: rt.ddq[1] }]);
    arm.step(tau[0], tau[1], 1);
    if (k >= from) e.push(decompose(path, arm.toolXY(), cmd).contour);
  }
  await arm.l1.destroy(); await arm.l2.destroy();
  return { name: shape.toUpperCase(), ...octaves(e), lap: Math.round(path.lap) };
}

// ─── 3. THE EXCITATION ──────────────────────────────────────────────────────────────────────
// WHAT THE MODEL WAS SHOWN. Recorded from inside a real commissioning rather than reconstructed
// from the plan, so the rate guards, the derates and the chirp gate are all in it — a
// reconstruction would be a number computed from the design checking the design (rule 16).
async function exciteSpectrum() {
  const { arm, servo } = await makeArm();
  const startPath = mkPath('rounded', 0.004);
  homeArm(arm, servo, startPath);
  const centre = arm.ik(12, 0, true);
  const pilot = new Pilot({
    autoRefuse: true, nMeasured: 6,
    channels: [0, 1].map((j) => ({ lo: centre[j] - 0.55, hi: centre[j] + 0.55,
      vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
    uMax: 0.15,
    start: arm.ik(startPath.at(0).x, startPath.at(0).y, true),
    guards: [{ index: 4, max: 6 }, { index: 5, max: 6 }],
    workspace: (q) => {
      const r = Math.hypot(arm.L1 * Math.cos(q[0]) + arm.L2 * Math.cos(q[0] + q[1]),
        arm.L1 * Math.sin(q[0]) + arm.L2 * Math.sin(q[0] + q[1]));
      return r > Math.abs(arm.L1 - arm.L2) + 0.5 && r < arm.L1 + arm.L2 - 0.5;
    },
    seed: 1,
  });
  const rec = [], truthRec = [];
  let n = 0;
  while (pilot.phase !== 'done') {
    if (++n > 6e6) break;
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const inExcite = pilot.phase === 'excite';
    const cmd = pilot.command();
    const refs = cmd.map((c) => ({ theta: c.pos + c.u, omega: c.vel, alpha: c.acc }));
    const tau = servo.torques(refs);
    arm.step(tau[0], tau[1], 1);
    const r = routeSignals(arm, cmd, tau);
    pilot.observe(r.measured, r.truth);
    // THE COMMAND THE MACHINE WAS GIVEN AND THE TRUTH IT PRODUCED, both only while exciting.
    // The truth is here because it is the other half of rule 9: an excitation can be rich in a
    // band and still produce no response there, and a band with no RESPONSE is one the fit
    // cannot learn from however hard the command shook.
    if (inExcite) { rec.push(cmd[0].pos + cmd[0].u); truthRec.push(r.truth[0]); }
  }
  await arm.l1.destroy(); await arm.l2.destroy();
  return [{ name: 'EXCITE', ...octaves(rec) },
    { name: 'RESPONSE', ...octaves(truthRec) },
    { pilot }];
}

console.log('\npilot: three spectra on one axis — where the machine rings, where the defect lives,');
console.log('       and where the commissioning record actually looked.');
console.log(`  arm: E ${PG.E} / K ${PG.K} / backlash ${PG.BL}`);

const mode = await modeSpectrum();
const sharp = await programSpectrum('sharp', 0.004);
const circle = await programSpectrum('circle', 0.004);
const [exc, resp, meta] = await exciteSpectrum();
const st = meta.pilot.status();
console.log(`  probe: Ts ${st.Ts}  Tset ${st.Tset}  rings ${JSON.stringify(st.rings)}`
  + `  sweep ${(() => {
    // THE SHARE, NOT THE FIELD'S EXISTENCE. `meta.chirp` is an array of the sweep's share of the
    // rate budget, one entry per channel, and it is PUSHED UNCONDITIONALLY — `[0, 0]` when no
    // sweep was armed. An array of zeros is truthy, so the old `? 'YES' : 'no'` printed YES on
    // every run this project has ever logged, including the ones whose whole question was
    // whether the sweep was on (rule 25).
    const c = st.report.excite && st.report.excite.chirp;
    return Array.isArray(c) && c.some((v) => v > 0) ? `YES ${c.join('/')}` : 'no';
  })()}`);
console.log(`  window reach: ${(st.report.readouts || []).map((r) => r.lags * r.stride * st.sample)
  .join(', ')} steps   sharp lap ${sharp.lap} steps   circle lap ${circle.lap} steps`);

table([mode, sharp, circle, exc, resp]);

// THE READING, GENERATED FROM THE NUMBERS RATHER THAN WRITTEN UNDER THEM (rule 30). A sentence
// typed once describes the run it was typed for and every run after it that it no longer fits.
const cover = (a, b) => {
  // How much of b's energy sits in bands where a has at least a twentieth of its own peak. The
  // threshold is RELATIVE to a's peak (rule 32) so it means the same thing on any signal.
  const thr = 0.05 * Math.max(...a.frac);
  let s = 0;
  for (let i = 0; i < BANDS.length; i++) if (a.frac[i] >= thr) s += b.frac[i];
  return s;
};
console.log(`\n  EXCITE covers ${(100 * cover(exc, sharp)).toFixed(0)}% of the sharp square's error`
  + ` energy and ${(100 * cover(exc, circle)).toFixed(0)}% of the circle's.`);
console.log(`  RESPONSE covers ${(100 * cover(resp, sharp)).toFixed(0)}% of the sharp square's and`
  + ` ${(100 * cover(resp, circle)).toFixed(0)}% of the circle's.`);
console.log(`  The window spans ${(st.report.readouts || [{ lags: 0, stride: 0 }])[0].lags
  * (st.report.readouts || [{ lags: 0, stride: 0 }])[0].stride * st.sample} steps, so bands above`
  + ' that period are outside what the model can represent at all.');
